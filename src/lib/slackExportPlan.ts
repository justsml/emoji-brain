import {generateCompactSlackBrowserScript, type SlackScriptImage} from './slackBrowserScript';

export const SLACK_SCRIPT_LIMIT = 8_000_000;
export type DeliveryAsset = {path: string; bytes: number};
export type DeliveryRow = {animated: boolean; original: DeliveryAsset; variants: Record<string, {webp: DeliveryAsset}>};
export type SlackResolution = {animated: boolean; size: number; count: number};
export type SlackAsset = DeliveryAsset & {filename: string; animated: boolean; size: number};
export type SlackPlan = {script: string; scriptBytes: number; resolutions: SlackResolution[]; assets: SlackAsset[]};

/** Prefer larger stills, with one uniform resolution for each media type. */
export async function planSlackExport(
  rows: {filename: string; row: DeliveryRow}[],
  load: (assets: SlackAsset[]) => Promise<Uint8Array[]>,
  progress: (text: string) => void,
  options: {replaceSmaller?: boolean; allowOversizeArchive?: boolean} = {},
  limit = SLACK_SCRIPT_LIMIT,
): Promise<SlackPlan> {
  if (!rows.length) throw Error('Select at least one emoji');
  const attempted = new Set<string>();
  let smallest: SlackPlan | undefined;
  for (const [stillSize, animatedSize] of [[256,128], [256,64], [128,64], [64,64]]) {
    const assets = rows.map(({filename,row}) => {
      const size = row.animated ? animatedSize : stillSize;
      const asset = row.variants[String(size)]?.webp;
      if (!asset) throw Error(`Missing ${size}px WebP: ${filename}`);
      return {...asset, filename, size, animated: row.animated};
    });
    const key = assets.map(a => a.path).join('\n');
    if (attempted.has(key)) continue;
    attempted.add(key);
    progress(`Checking ${stillSize}px stills / ${animatedSize}px animations…`);
    const data = await load(assets);
    const images: SlackScriptImage[] = assets.map((asset,index) => {
      const bytes = data[index]; let binary = '';
      for (let offset=0;offset<bytes.length;offset+=0x8000) binary += String.fromCharCode(...bytes.subarray(offset,offset+0x8000));
      return {filename:asset.filename, mimeType:'image/webp', base64:btoa(binary)};
    });
    progress('Checking compressed script size…');
    const script = await generateCompactSlackBrowserScript(images,options);
    const scriptBytes = new Blob([script]).size;
    const resolutions: SlackResolution[] = [];
    for (const animated of [false,true]) {
      const group = assets.filter(asset => asset.animated === animated);
      if (group.length) resolutions.push({animated,size:group[0].size,count:group.length});
    }
    smallest = {script,scriptBytes,resolutions,assets};
    if (scriptBytes < limit) return smallest;
  }
  if (options.allowOversizeArchive && smallest) return smallest;
  throw Error('Even the 64px images exceed the 8 MB clipboard limit. Select fewer emojis and export in batches.');
}
