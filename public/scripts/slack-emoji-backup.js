// Emoji Brain Slack backup. Paste this entire file into DevTools Console at
// https://YOUR-WORKSPACE.slack.com/customize/emoji, then leave the tab open.
// Optional: globalThis.slackEmojiBackupOptions = { batchSize: 200 };
(async () => {
  'use strict';
  const batchSize = globalThis.slackEmojiBackupOptions?.batchSize ?? 200;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) throw new Error('batchSize must be an integer from 1 to 1000.');
  if (!location.hostname.endsWith('.slack.com')) throw new Error('Open your workspace /customize/emoji page first.');
  if (globalThis.slackEmojiBackupReport?.running) throw new Error('A backup is already running.');
  const token = [document.querySelector('input[name="token"]')?.value, globalThis.TS?.boot_data?.api_token,
    globalThis.boot_data?.api_token, globalThis.slackDebug?.token].find(value => typeof value === 'string' && value);
  if (!token) throw new Error('Could not find the Slack page token. Open /customize/emoji and retry.');

  const report = globalThis.slackEmojiBackupReport = {
    running: true, status: 'starting', total: 0, processed: 0, failures: [], batches: [],
    startedAt: new Date().toISOString(), workspace: location.hostname,
  };
  const panel = document.createElement('section');
  panel.setAttribute('aria-label', 'Slack emoji backup');
  panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#fff;color:#171717;padding:20px;border:1px solid #888;border-radius:12px;max-width:420px;max-height:70vh;overflow:auto;font:14px/1.5 system-ui;box-shadow:0 8px 40px #0004';
  const heading = document.createElement('strong'); heading.textContent = 'Slack emoji backup'; panel.append(heading);
  const status = document.createElement('p'); status.setAttribute('role', 'status'); panel.append(status);
  const links = document.createElement('div'); panel.append(links); document.body.append(panel);
  const update = message => { status.textContent = message; console.log('[slack-emoji-backup]', message); };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let stopped = false;
  const stop = document.createElement('button'); stop.textContent = 'Stop after current request'; panel.append(stop);
  stop.onclick = () => { stopped = true; update('Stopping… Existing ZIP links remain available.'); };
  const checkStop = () => { if (stopped) throw new Error('Stopped by user; completed ZIPs remain available.'); };
  const download = (bytes, name) => {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
    const link = document.createElement('a'); link.href = url; link.download = name;
    link.textContent = 'Save ' + name; link.style.cssText = 'display:block;color:#1459b5;margin:8px 0';
    links.append(link); link.click();
    // Retain URLs until explicitly released: blocked automatic downloads can be retried.
    return { name, url, bytes: bytes.length, downloadRequested: true };
  };
  globalThis.releaseSlackEmojiBackup = () => {
    if (report.running) throw new Error('Stop the backup before releasing downloads.');
    for (const link of links.querySelectorAll('a')) URL.revokeObjectURL(link.href);
    panel.remove();
  };
  let nextRequestAt = 0;
  const request = async (url, options = {}) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      checkStop(); await sleep(Math.max(0, nextRequestAt - Date.now())); checkStop();
      nextRequestAt = Date.now() + 350;
      try {
        const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
        if (response.status === 429 || response.status >= 500) {
          const retry = response.headers.get('retry-after');
          const delay = retry && Number.isFinite(Number(retry)) ? Number(retry) * 1000 : Date.parse(retry || '') - Date.now();
          nextRequestAt = Date.now() + Math.max(Number.isFinite(delay) ? delay : 0, 2000 * 2 ** attempt);
          update('Request throttled or temporarily unavailable; retrying…');
          continue;
        }
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response;
      } catch (error) {
        if (attempt === 4 || /^HTTP /.test(error.message)) throw error;
        nextRequestAt = Date.now() + 2000 * 2 ** attempt;
      }
    }
    throw new Error('Request failed after five attempts.');
  };
  try {
    update('Loading ZIP library…');
    const zipLibrary = await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/fflate@0.8.3/umd/index.js';
      script.integrity = 'sha384-ETfVLWAUsU3zp3SpnQsPDbAyrF6jYv2w8aNYo6KtY2JuyxXhzYLOL7e0ATbLSIHP';
      script.crossOrigin = 'anonymous';
      const timeout = setTimeout(() => { script.remove(); reject(new Error('ZIP library load timed out; Slack may block the CDN.')); }, 20000);
      script.onload = () => { clearTimeout(timeout); script.remove(); resolve(globalThis.fflate); };
      script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error('Cannot load fflate from jsDelivr. Check network/CSP settings.')); };
      document.head.append(script);
    });
    if (!zipLibrary?.zipSync) throw new Error('ZIP library unavailable.');
    const { zipSync, strToU8 } = zipLibrary;
    const safari = /Safari/i.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg|Android/i.test(navigator.userAgent);
    if (safari) {
      download(zipSync({ 'README.txt': strToU8('Slack emoji backup download test. This file can be deleted.') }), 'test-save.zip');
      update('Safari: allow downloads for this site. Save test-save.zip above, verify it downloaded, then continue.');
      await new Promise(resolve => {
        const button = document.createElement('button'); button.textContent = 'Test saved — start backup'; panel.append(button);
        button.onclick = () => { button.remove(); resolve(); };
        stop.onclick = () => { stopped = true; button.remove(); resolve(); };
      });
      checkStop();
    }
    update('Enumerating workspace emojis…');
    const rows = new Map(); let expectedTotal = null;
    for (let page = 1; ; page++) {
      const form = new FormData(); form.set('token', token); form.set('page', String(page)); form.set('count', '100');
      const body = await (await request('/api/emoji.adminList', { method: 'POST', credentials: 'same-origin', body: form })).json();
      if (body.ok !== true) throw new Error('emoji.adminList: ' + (body.error || 'unexpected response'));
      if (!Array.isArray(body.emoji)) throw new Error('Unexpected emoji.adminList format: expected emoji array.');
      const paging = body.paging;
      if (!paging || !Number.isInteger(paging.pages) || !Number.isInteger(paging.total) || paging.pages < 0 || paging.total < 0) throw new Error('Missing or invalid pagination; cannot guarantee a complete backup.');
      if (expectedTotal !== null && expectedTotal !== paging.total) throw new Error('Workspace emoji count changed during enumeration. Retry when edits have stopped.');
      expectedTotal = paging.total;
      const before = rows.size;
      for (const row of body.emoji) {
        if (typeof row.name !== 'string' || !row.name) throw new Error('Emoji record has no name.');
        rows.set(row.name, row);
      }
      update('Enumerated ' + rows.size + ' / ' + expectedTotal + ' emojis');
      if (page >= paging.pages) break;
      if (rows.size === before) throw new Error('Pagination made no progress; backup stopped.');
    }
    if (rows.size !== expectedTotal) throw new Error('Enumeration count mismatch; retry when workspace edits have stopped.');
    report.total = rows.size;
    const all = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
    const aliasTarget = row => row.alias_for || (typeof row.url === 'string' && row.url.startsWith('alias:') ? row.url.slice(6) : null);
    const imageUrl = row => {
      const seen = new Set(); let current = row;
      while (aliasTarget(current)) {
        if (seen.has(current.name)) throw new Error('Alias cycle');
        seen.add(current.name);
        const target = rows.get(aliasTarget(current));
        if (!target) {
          if (/^https:\/\//.test(current.url || '')) return current.url;
          return null; // May refer to a built-in Unicode emoji with no custom image.
        }
        current = target;
      }
      return current.url || null;
    };
    const dimensions = blob => new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob); const img = new Image();
      const finish = () => { clearTimeout(timer); URL.revokeObjectURL(url); };
      const timer = setTimeout(() => { finish(); reject(new Error('Image dimensions timed out')); }, 15000);
      img.onload = () => { finish(); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
      img.onerror = () => { finish(); reject(new Error('Could not decode image dimensions')); }; img.src = url;
    });
    const isoDate = value => {
      if (value == null || value === '') return null;
      const date = new Date(Number.isFinite(Number(value)) ? Number(value) * 1000 : value);
      return Number.isFinite(date.getTime()) ? date.toISOString() : null;
    };
    const prefix = location.hostname.split('.')[0].replace(/[^a-z0-9_-]/gi, '_') + '-emoji-backup-' + report.startedAt.replace(/[:.]/g, '-');
    const batchCount = Math.max(1, Math.ceil(all.length / batchSize));
    for (let batch = 0; batch < batchCount; batch++) {
      checkStop();
      const files = Object.create(null); const records = []; const cache = new Map();
      for (const row of all.slice(batch * batchSize, (batch + 1) * batchSize)) {
        checkStop();
        const record = { name: row.name, aliasFor: aliasTarget(row), createdAt: isoDate(row.created ?? row.date_created),
          metadata: row, image: null, status: 'pending' };
        try {
          const url = imageUrl(row);
          if (!url) {
            if (!record.aliasFor) throw new Error('No image URL');
            record.status = 'alias-only';
            record.note = 'Alias target has no custom image in this listing (possibly a built-in emoji).';
          } else {
            if (new URL(url).protocol !== 'https:') throw new Error('Expected HTTPS image URL');
            if (!cache.has(url)) {
              const response = await request(url, { credentials: 'omit' });
              const blob = await response.blob(); const bytes = new Uint8Array(await blob.arrayBuffer());
              let binary = ''; for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
              let size = { width: null, height: null }; let dimensionError = null;
              try { size = await dimensions(blob); } catch (error) { dimensionError = error.message; }
              cache.set(url, { bytes, base64: btoa(binary), mimeType: blob.type, ...size, dimensionError,
                lastModified: response.headers.get('last-modified'), etag: response.headers.get('etag') });
            }
            const { bytes, ...data } = cache.get(url);
            const extension = ({ 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/avif': 'avif' })[data.mimeType.split(';')[0]] || 'bin';
            const filename = 'images/' + String(report.processed + 1).padStart(6, '0') + '-' + row.name.replace(/[^a-z0-9_-]/gi, '_').slice(0, 100) + '.' + extension;
            files[filename] = [bytes, { level: 0 }];
            record.image = { filename, sourceUrl: url, sizeBytes: bytes.length, ...data };
            record.status = data.dimensionError ? 'image-saved-dimensions-unavailable' : 'saved';
          }
        } catch (error) {
          record.status = 'error'; record.error = error.message;
          report.failures.push({ name: row.name, error: error.message });
        }
        records.push(record); report.processed++;
        update('Processed ' + report.processed + ' / ' + report.total + ': ' + row.name + ' (' + record.status + ')');
      }
      const manifest = { schemaVersion: 1, workspace: report.workspace, startedAt: report.startedAt,
        exportedAt: new Date().toISOString(), batch: batch + 1, batchCount, batchSize, totalEmojis: report.total,
        dimensionsMeaning: 'Intrinsic dimensions of the downloaded Slack-hosted image, not the pre-upload original.', emojis: records };
      files['manifest.json'] = [strToU8(JSON.stringify(manifest, null, 2)), { level: 6 }];
      const name = prefix + '-' + String(batch + 1).padStart(3, '0') + '.zip';
      report.batches.push(download(zipSync(files), name));
      cache.clear(); await sleep(1000);
    }
    report.status = report.failures.length ? 'completed-with-errors' : 'completed';
    update('Prepared ' + report.batches.length + ' ZIPs; ' + report.failures.length + ' image failures. Verify downloads. Use the links to save any blocked files.');
  } catch (error) {
    report.status = stopped ? 'stopped' : 'error'; report.error = error.message; update(error.message);
  } finally {
    report.running = false; stop.remove();
    console.log('[slack-emoji-backup] Report:', report);
  }
  return report;
})();
