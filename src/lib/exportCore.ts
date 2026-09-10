import JSZip from 'jszip';
import {generateCompactSlackBrowserScript} from './slackBrowserScript';
export type ExportRequest = {kind: 'zip' | 'slack'; filenames: string[]; origin: string; replaceSmaller?: boolean};
export type ExportResult = {kind: 'zip'; buffer: ArrayBuffer} | {kind: 'slack'; script: string; count: number};
type Asset = {path: string; bytes: number};
type Manifest = {items: Record<string, {original: Asset; variants: Record<string, {webp: Asset}>}>};
export async function prepareExport(request: ExportRequest, progress: (text: string) => void): Promise<ExportResult> {
  const response = await fetch(new URL('/emoji-delivery/manifest.json', request.origin));
  if (!response.ok) throw Error('Could not load optimized emoji catalog');
  const manifest: Manifest = await response.json();
  const assets = request.filenames.map(filename => {
    const row = manifest.items[filename.replace(/\.[^.]+$/, '')];
    const asset = request.kind === 'zip' ? row?.original : row?.variants['128']?.webp;
    if (!asset) throw Error(`Missing ${request.kind === 'zip' ? 'full-resolution' : '128px'} WebP: ${filename}`);
    return {filename, ...asset};
  });
  const data: Uint8Array[] = new Array(assets.length);
  let cursor = 0, completed = 0;
  await Promise.all(Array.from({length: Math.min(4, assets.length)}, async () => {
    while (cursor < assets.length) {
      const index = cursor++, asset = assets[index];
      const response = await fetch(new URL(asset.path, request.origin));
      if (!response.ok) throw Error(`Could not load ${asset.filename}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== asset.bytes) throw Error(`Stale optimized asset: ${asset.filename}`);
      data[index] = bytes;
      progress(`Prepared ${++completed} of ${assets.length} emojis…`);
    }
  }));
  if (request.kind === 'zip') {
    const zip = new JSZip();
    assets.forEach((asset, index) => zip.file(asset.filename.replace(/\.[^.]+$/, '.webp'), data[index]));
    // The images are already WebP@90; deflating again adds CPU with little benefit.
    const buffer = await zip.generateAsync({type: 'arraybuffer', compression: 'STORE'}, meta => progress(`Packing ZIP · ${Math.round(meta.percent)}%`));
    return {kind: 'zip', buffer};
  }
  progress('Encoding Slack script…');
  const images = assets.map((asset, index) => {
    const bytes = data[index];let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return {filename: asset.filename.replace(/\.[^.]+$/, '.webp'), mimeType: 'image/webp', base64: btoa(binary)};
  });
  return {kind: 'slack', script: await generateCompactSlackBrowserScript(images, {replaceSmaller: request.replaceSmaller}), count: images.length};
}
