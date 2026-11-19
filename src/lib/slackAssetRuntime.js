// Serialized into the console script; no remote code or ZIP dependency.
async function loadSlackAssets(descriptors, source) {
  const limit = 64 * 1024 * 1024;
  if (descriptors.reduce((sum, image) => sum + image.bytes, 0) > limit) throw Error('Selection exceeds 64 MiB. Export in smaller batches.');
  const controller = new AbortController();
  globalThis.cancelSlackEmojiUpload = () => controller.abort();
  let archive;
  if (source === 'zip') {
    const file = await new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.zip';
      input.onchange = () => input.files?.[0] ? resolve(input.files[0]) : reject(Error('No ZIP selected'));
      input.oncancel = () => reject(Error('ZIP selection cancelled'));
      input.click();
    });
    if (file.size > 256 * 1024 * 1024) throw Error('ZIP exceeds 256 MiB. Export a smaller selection.');
    archive = new Uint8Array(await file.arrayBuffer());
  }
  function localImage(filename) {
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    for (let offset = 0; offset + 30 <= archive.length;) {
      if (view.getUint32(offset, true) !== 0x04034b50) break;
      const flags = view.getUint16(offset + 6, true), method = view.getUint16(offset + 8, true);
      const length = view.getUint32(offset + 18, true), nameLength = view.getUint16(offset + 26, true), extra = view.getUint16(offset + 28, true);
      const start = offset + 30 + nameLength + extra, end = start + length;
      if ((flags & 9) || end > archive.length) throw Error('Unsupported or truncated ZIP. Use the original Adorbs.fun export ZIP.');
      const name = new TextDecoder().decode(archive.subarray(offset + 30, offset + 30 + nameLength));
      if (name === 'slack/images/' + filename) {
        if (method !== 0) throw Error('Use the original unmodified Adorbs.fun ZIP (STORE compression).');
        return archive.slice(start, end);
      }
      offset = end;
    }
    throw Error('Missing slack/images/' + filename);
  }
  const images = [];
  for (const image of descriptors) {
    controller.signal.throwIfAborted();
    console.log('[slack-emoji-upload] Verifying', image.filename);
    let bytes;
    if (archive) bytes = localImage(image.filename);
    else {
      const url = new URL(image.url);
      if (url.protocol !== 'https:' || url.username || url.password) throw Error('Invalid public asset URL');
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch(url.href, {credentials:'omit', referrerPolicy:'no-referrer', redirect:'error', signal:AbortSignal.any([controller.signal, AbortSignal.timeout(20000)])});
          if (!response.ok) {
            if ((response.status === 429 || response.status >= 500) && attempt < 2) {
              const retry = response.headers.get('retry-after');
              const delay = Math.max(1000 * 2 ** attempt, Number(retry) * 1000 || Date.parse(retry || '') - Date.now() || 0);
              if (delay > 30000) throw Error('Rate limited; retry after ' + retry);
              await new Promise(resolve => setTimeout(resolve, delay)); continue;
            }
            throw Error('HTTP ' + response.status);
          }
          // Bound response memory even if the delivery endpoint returns an unexpected body.
          const reader = response.body.getReader(), chunks = []; let total = 0;
          try {
            while (true) {
              const {done, value} = await reader.read(); if (done) break;
              total += value.length;
              if (total > image.bytes) throw Error('Asset exceeds pinned byte count');
              chunks.push(value);
            }
          } finally { await reader.cancel(); }
          bytes = new Uint8Array(total); let offset = 0;
          for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
          break;
        } catch (error) {
          throw Error('Could not fetch ' + image.filename + ': ' + error.message + '. If CSP or CORS blocks delivery, export a ZIP and paste slack/import-local.js instead. No Slack changes were made.');
        }
      }
    }
    if (bytes.length !== image.bytes || bytes.length > 127000) throw Error('Invalid image byte count: ' + image.filename);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
    if (hash !== image.sha256) throw Error('SHA-256 mismatch: ' + image.filename + '. No Slack changes were made.');
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    images.push({filename:image.filename, mimeType:image.mimeType, base64:btoa(binary)});
  }
  controller.signal.throwIfAborted();
  images.signal = controller.signal;
  return images;
}
