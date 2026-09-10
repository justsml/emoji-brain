import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
const source = readFileSync('public/scripts/slack-emoji-backup.js', 'utf8');
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

async function run(rows: any[], options: { safari?: boolean; batchSize?: number; badPaging?: boolean; failImage?: boolean } = {}) {
  const dom = new JSDOM('<input name="token" value="fixture-token">', { url: 'https://example.slack.com/customize/emoji', runScripts: 'outside-only' });
  const w = dom.window as any;
  const archives: any[] = []; const downloads: string[] = []; const requests: any[] = [];
  w.slackEmojiBackupOptions = { batchSize: options.batchSize ?? 200 };
  Object.defineProperty(w.navigator, 'userAgent', { value: options.safari ? 'Version/18 Safari/605' : 'Chrome/140 Safari/537' });
  w.URL.createObjectURL = () => 'blob:fixture'; w.URL.revokeObjectURL = vi.fn();
  w.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
  w.fflate = { strToU8: (s: string) => new TextEncoder().encode(s), zipSync: (files: any) => { archives.push(files); return new Uint8Array([80, 75]); } };
  const append = w.document.head.append.bind(w.document.head);
  w.document.head.append = (script: any) => { append(script); queueMicrotask(() => script.onload()); };
  w.setTimeout = (fn: any, ms: number) => { if (ms >= 15000) return 1; queueMicrotask(fn); return 2; }; w.clearTimeout = () => {};
  w.Image = class { naturalWidth = 32; naturalHeight = 24; onload: any; set src(_: string) { queueMicrotask(() => this.onload()); } };
  w.fetch = async (url: string, init: any) => {
    requests.push({ url, init });
    if (url.startsWith('/api/')) {
      const page = Number(init.body.get('page'));
      return { ok: true, status: 200, json: async () => ({ ok: true, emoji: rows.slice((page - 1) * 100, page * 100), paging: options.badPaging ? undefined : { pages: Math.ceil(rows.length / 100), total: rows.length } }) };
    }
    if (options.failImage) return { ok: false, status: 403 };
    return { ok: true, status: 200, headers: new Headers(), blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) };
  };
  const promise = vm.runInContext(source, dom.getInternalVMContext());
  if (options.safari) {
    for (let i = 0; i < 15 && downloads.length === 0; i++) await Promise.resolve();
    expect(downloads).toEqual(['test-save.zip']); expect(requests).toHaveLength(0);
    const button = [...w.document.querySelectorAll('button')].find((b: any) => b.textContent.includes('Test saved')) as any;
    button.click();
  }
  await promise;
  const manifests = archives.filter(a => a['manifest.json']).map(a => JSON.parse(new TextDecoder().decode(a['manifest.json'][0])));
  return { report: w.slackEmojiBackupReport, manifests, downloads, requests, archives };
}
const row = (name: string) => ({ name, url: 'https://emoji.slack-edge.com/' + name + '.png', created: 1700000000, user_id: 'Ufixture' });
describe('Slack browser backup runtime', () => {
  it('paginates all records and splits at the default 200, preserving bytes and metadata', async () => {
    const result = await run(Array.from({ length: 201 }, (_, i) => row('emoji' + i)));
    expect(result.report.status).toBe('completed');
    expect(result.manifests.map(m => m.emojis.length)).toEqual([200, 1]);
    expect(result.requests.filter(r => r.url.startsWith('/api/'))).toHaveLength(3);
    expect(result.downloads[1]).toMatch(/-002.zip$/);
    expect(result.manifests[0].emojis[0]).toMatchObject({ metadata: { user_id: 'Ufixture' }, createdAt: '2023-11-14T22:13:20.000Z', image: { base64: 'AQID', sizeBytes: 3, width: 32, height: 24 } });
    expect(JSON.stringify(result.manifests)).not.toContain('fixture-token');
  });
  it('resolves aliases across batches and preserves built-in aliases', async () => {
    const result = await run([{ name: 'a', alias_for: 'z', is_alias: 1 }, { name: 'builtin', url: 'alias:smile' }, row('z')], { batchSize: 1 });
    expect(result.manifests[0].emojis[0]).toMatchObject({ aliasFor: 'z', image: { base64: 'AQID' } });
    expect(result.manifests[1].emojis[0].status).toBe('alias-only');
  });
  it('waits for Safari test-save confirmation before requests', async () => {
    const result = await run([row('a')], { safari: true });
    expect(result.downloads).toHaveLength(2); expect(result.report.status).toBe('completed');
  });
  it('retains failed records and does not label the backup complete without errors', async () => {
    const result = await run([row('a')], { failImage: true });
    expect(result.report.status).toBe('completed-with-errors');
    expect(result.manifests[0].emojis[0]).toMatchObject({ name: 'a', status: 'error', error: 'HTTP 403' });
  });
  it('refuses to silently truncate when pagination is missing', async () => {
    const result = await run([row('a')], { badPaging: true });
    expect(result.report.status).toBe('error'); expect(result.downloads).toHaveLength(0);
  });
});
