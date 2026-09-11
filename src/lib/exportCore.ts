import JSZip from 'jszip';
import {planSlackExport, type DeliveryAsset, type DeliveryRow, type SlackResolution} from './slackExportPlan';
import {addSlackZipTools} from './slackZipTools';
import type {ExportTier} from './slackSizeEstimate';
export type ExportRequest = {kind: 'zip' | 'slack'; filenames: string[]; origin: string; replaceSmaller?: boolean; tier?: ExportTier};
export type ExportResult = {kind: 'zip'; buffer: ArrayBuffer} | {kind: 'slack'; script: string; scriptBytes: number; count: number; resolutions: SlackResolution[]};
type NamedAsset = DeliveryAsset & {filename: string};
export async function prepareExport(request: ExportRequest, progress: (text: string) => void): Promise<ExportResult> {
  const response = await fetch(new URL('/emoji-delivery/manifest.json', request.origin));
  if (!response.ok) throw Error('Could not load optimized emoji catalog');
  const manifest: {items: Record<string, DeliveryRow>} = await response.json();
  const rows = [...new Set(request.filenames)].map(filename => {
    const row = manifest.items[filename.replace(/\.[^.]+$/, '')];
    if (!row) throw Error(`Missing optimized emoji: ${filename}`);
    return {filename:filename.replace(/\.[^.]+$/,'.webp'),row};
  });
  const cache = new Map<string,Uint8Array>();
  async function load(assets: NamedAsset[]): Promise<Uint8Array[]> {
    const data: Uint8Array[] = new Array(assets.length);
    let cursor=0, completed=0;
    await Promise.all(Array.from({length:Math.min(4,assets.length)},async()=>{
      while(cursor<assets.length) {
        const index=cursor++,asset=assets[index];
        let bytes=cache.get(asset.path);
        if (!bytes) {
          const response=await fetch(new URL(asset.path,request.origin));
          if (!response.ok) throw Error(`Could not load ${asset.filename}`);
          bytes=new Uint8Array(await response.arrayBuffer());
          if (bytes.length!==asset.bytes) throw Error(`Stale optimized asset: ${asset.filename}`);
          cache.set(asset.path,bytes);
        }
        data[index]=bytes;
        progress(`Prepared ${++completed} of ${assets.length} emojis…`);
      }
    }));
    return data;
  }
  const zip = request.kind==='zip' ? new JSZip() : null;
  if (zip) {
    const assets = rows.map(({filename,row})=>({filename,...row.original}));
    const data = await load(assets);
    assets.forEach((asset,index)=>zip.file(asset.filename,data[index]));
    cache.clear();
  }
  const plan = await planSlackExport(rows,load,progress,{replaceSmaller:request.replaceSmaller,allowOversizeArchive:!!zip,tier:request.tier});
  if (zip) {
    addSlackZipTools(zip,plan,await load(plan.assets));
    // WebPs are already compressed. STORE avoids another heavy deflate pass.
    const buffer = await zip.generateAsync({type:'arraybuffer',compression:'STORE',platform:'UNIX'},meta=>progress(`Packing ZIP · ${Math.round(meta.percent)}%`));
    return {kind:'zip',buffer};
  }
  return {kind:'slack',script:plan.script,scriptBytes:plan.scriptBytes,count:plan.assets.length,resolutions:plan.resolutions};
}
