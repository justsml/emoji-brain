import {generateCompactSlackBrowserScript, generateSlackBrowserScript, type SlackScriptImage} from './slackBrowserScript';
import {EXPORT_TIERS, SLACK_SCRIPT_LIMIT, type ExportTier} from './slackSizeEstimate';

export {SLACK_SCRIPT_LIMIT};
export type DeliveryAsset = {path: string; bytes: number; slackGzipBytes?: number};
export type DeliveryRow = {animated: boolean; original: DeliveryAsset; variants: Record<string, {webp: DeliveryAsset}>};
export type SlackResolution = {animated: boolean; size: number; count: number};
export type SlackAsset = DeliveryAsset & {filename: string; animated: boolean; size: number};
export type SlackPlan = {script: string; scriptBytes: number; resolutions: SlackResolution[]; assets: SlackAsset[]};

/**
 * Prefer larger stills, with one uniform resolution for each media type.
 * `tier` pins the ladder to a single rung: the caller has chosen those pixel
 * sizes deliberately, so the result is returned even when it overruns the
 * clipboard limit, and the UI warns rather than the planner refusing.
 */
export async function planSlackExport(
  rows: {filename: string; row: DeliveryRow}[],
  load: (assets: SlackAsset[]) => Promise<Uint8Array[]>,
  progress: (text: string) => void,
  options: {replaceSmaller?: boolean; allowOversizeArchive?: boolean; tier?: ExportTier} = {},
  limit = SLACK_SCRIPT_LIMIT,
): Promise<SlackPlan> {
  if (!rows.length) throw Error('Select at least one emoji');
  // Stored per-image gzip estimates avoid downloading clearly oversized tiers.
  // The final script is always measured; estimates are never a safety boundary.
  const overhead = new Blob([generateSlackBrowserScript([],options)]).size + 1024;
  const attempted = new Set<string>();
  const ladder = options.tier ? [options.tier] : EXPORT_TIERS;
  let smallest: SlackPlan | undefined;
  for (const {still: stillSize, animated: animatedSize} of ladder) {
    const assets = rows.map(({filename,row}) => {
      const size = row.animated ? animatedSize : stillSize;
      const asset = row.variants[String(size)]?.webp;
      if (!asset) throw Error(`Missing ${size}px WebP: ${filename}`);
      return {...asset, filename, size, animated: row.animated};
    });
    if (!options.tier && (stillSize !== 64 || animatedSize !== 64) && assets.every(a => Number.isFinite(a.slackGzipBytes))) {
      const estimate = 4 * Math.ceil(assets.reduce((sum,a) => sum + a.slackGzipBytes!,0)/3) + overhead;
      // Leave 1% tolerance for per-stream headers and shared dictionaries.
      if (estimate >= limit * 1.01) continue;
    }
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
    if (scriptBytes < limit || options.tier) return smallest;
  }
  if (options.allowOversizeArchive && smallest) return smallest;
  throw Error('Even the 64px images exceed the 8 MB clipboard limit. Select fewer emojis and export in batches.');
}
