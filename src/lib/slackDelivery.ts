import { getAbsoluteUrl } from './utils';
import type { SlackScriptImage } from './slackBrowserScript';
interface DeliveryFile { path: string; filename: string; mimeType: string; bytes: number }
interface DeliveryManifest { items: Record<string, { variants: Record<string, { webp: {path:string;bytes:number} }> }> }
export async function loadSlackImages(filenames: string[], size: 128 | 256, progress: (count: number) => void): Promise<SlackScriptImage[]> {
  const response = await fetch(getAbsoluteUrl('/emoji-delivery/manifest.json'));
  if (!response.ok) throw new Error('Could not load optimized emoji catalog');
  const manifest: DeliveryManifest = await response.json();
  const assets = filenames.map(filename => {
    const variant = manifest.items[filename.replace(/\.[^.]+$/, '')]?.variants[size];
    const asset: DeliveryFile | undefined = variant ? {...variant.webp,filename:filename.replace(/\.[^.]+$/, '.webp'),mimeType:'image/webp'} : undefined;
    if (!asset) throw new Error(`No optimized ${size}px version of ${filename}`);
    return asset;
  });
  const images: SlackScriptImage[] = new Array(assets.length);
  let cursor = 0, completed = 0;
  await Promise.all(Array.from({length: Math.min(4, assets.length)}, async () => {
    while (cursor < assets.length) {
      const index = cursor++, asset = assets[index];
      const response = await fetch(getAbsoluteUrl(asset.path));
      if (!response.ok) throw new Error(`Could not load ${asset.filename}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== asset.bytes) throw new Error(`Stale optimized asset: ${asset.filename}`);
      let binary = '';
      for (let offset=0;offset<bytes.length;offset+=0x8000) binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));
      images[index]={filename:asset.filename,mimeType:asset.mimeType,base64:btoa(binary)};
      progress(++completed);
    }
  }));
  return images;
}
