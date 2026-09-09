import { afterEach, expect, test } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { checkEmojis, paths, readCatalog, reportMarkdown, reportTable, updateEmojis } from './emoji-pipeline';
const roots: string[] = [];
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'emoji-pipeline-'));
  roots.push(root);
  await fs.mkdir(paths(root).images, { recursive: true });
  return root;
}
async function picture(file: string, color = 'red') {
  await sharp({ create: { width: 4, height: 4, channels: 4, background: color } }).toFile(file);
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))); });
test('offline conversion, change tracking, label selection and metadata preservation', async () => {
  const root = await fixture();
  await picture(path.join(paths(root).images, 'cat.png'));
  expect((await updateEmojis(root, 'none')).converted).toBe(1);
  expect((await checkEmojis(root)).invalid).toBe(0);
  const data = await readCatalog(root);
  data.emojis[0].aliases = ['kitty'];
  data.emojis[0].custom = 'preserve me';
  await fs.writeFile(paths(root).metadata, JSON.stringify(data));
  let calls = 0;
  const label = async () => { calls++; return '{"tags":["cat","red","cute"],"categories":["animal","reaction"]}'; };
  await updateEmojis(root, 'changes', label);
  await updateEmojis(root, 'changes', label);
  expect(calls).toBe(1);
  expect((await readCatalog(root)).emojis[0]).toMatchObject({ aliases: ['kitty'], custom: 'preserve me' });
  const file = path.join(paths(root).images, 'cat.webp');
  await fs.utimes(file, new Date(), new Date('2024-01-01'));
  let report = await checkEmojis(root);
  expect(report.rows[0].modified).toBe('changed');
  expect(report.invalid).toBe(1);
  await updateEmojis(root, 'changes', label);
  expect(calls).toBe(1);
  await picture(file, 'blue');
  report = await checkEmojis(root);
  expect(report.rows[0].hash).toBe('changed');
  expect(report.invalid).toBe(1);
  await updateEmojis(root, 'none');
  await updateEmojis(root, 'changes', label);
  expect(calls).toBe(2);
  await updateEmojis(root, 'all', label);
  expect(calls).toBe(3);
});
test('collision and invalid image fail before deleting inputs', async () => {
  const root = await fixture();
  const dir = paths(root).images;
  await picture(path.join(dir, 'cat.png'));
  await picture(path.join(dir, 'cat.webp'));
  await expect(updateEmojis(root, 'none')).rejects.toThrow('Conflicting');
  expect(await fs.readdir(dir)).toEqual(['cat.png', 'cat.webp']);
  await fs.writeFile(path.join(dir, 'bad.webp'), 'bad');
  expect((await checkEmojis(root)).rows.find(r => r.filename === 'bad.webp')?.type).toBe('invalid');
});
test('missing files, duplicate IDs, invalid fields and labelling errors surface', async () => {
  const root = await fixture();
  await picture(path.join(paths(root).images, 'cat.webp'));
  await updateEmojis(root, 'none');
  const original = await fs.readFile(paths(root).metadata, 'utf8');
  await expect(updateEmojis(root, 'all', async () => 'bad json')).rejects.toThrow();
  expect(await fs.readFile(paths(root).metadata, 'utf8')).toBe(original);
  const data = JSON.parse(original);
  data.emojis.push({ ...data.emojis[0], filename: 'missing.webp', tags: [1] });
  await fs.writeFile(paths(root).metadata, JSON.stringify(data));
  const report = await checkEmojis(root);
  expect(report.errors).toContain('Duplicate id in catalog');
  expect(report.rows.find(r => r.filename === 'missing.webp')?.issues).toContain('Missing image');
});
test('reports render readable terminal and GitHub tables', async () => {
  const root = await fixture();
  await picture(path.join(paths(root).images, 'cat.webp'));
  await updateEmojis(root, 'none');
  const report = await checkEmojis(root);
  expect(reportTable(report)).toContain('│ File');
  expect(reportTable(report)).toContain('│ cat.webp');
  expect(reportMarkdown(report)).toContain('| File | Exists / prior |');
});
test('animated ingest retains frames and generates a static preview', async () => {
  const root = await fixture();
  const ingest = path.join(paths(root).images, 'ingest');
  await fs.mkdir(ingest);
  const frames = Buffer.concat([Buffer.alloc(4 * 4 * 3, 0), Buffer.alloc(4 * 4 * 3, 255)]);
  await sharp(frames, { raw: { width: 4, height: 8, channels: 3, pageHeight: 4 } }).gif({ delay: [100, 100], loop: 0 }).toFile(path.join(ingest, 'dance.gif'));
  expect(await updateEmojis(root, 'none')).toMatchObject({ ingested: 1, converted: 1, stills: 1 });
  expect((await sharp(path.join(paths(root).images, 'dance.webp')).metadata()).pages).toBe(2);
  expect((await sharp(path.join(paths(root).images, 'still/dance.webp')).metadata()).pages ?? 1).toBe(1);
  expect((await checkEmojis(root)).invalid).toBe(0);
});
