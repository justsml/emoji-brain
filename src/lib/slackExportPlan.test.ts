import {it,expect,vi,afterEach} from 'vitest';
import {Blob} from 'node:buffer';
import {planSlackExport, type DeliveryRow} from './slackExportPlan';
import {generateSlackBrowserScript} from './slackBrowserScript';
afterEach(()=>vi.unstubAllGlobals());
const row=(animated:boolean):DeliveryRow=>({animated,original:{path:'/original',bytes:1},variants:Object.fromEntries([64,128,256].map(size=>[size,{webp:{path:`/${animated}/${size}`,bytes:size*10}}]))});
const rows=[{filename:'still.webp',row:row(false)},{filename:'animated.webp',row:row(true)}];
const base = new Blob([generateSlackBrowserScript([])]).size;
for(const [limit,expected] of [[base+6000,[256,128]],[base+4800,[256,64]],[base+2900,[128,64]],[base+1900,[64,64]]] as const) {
 it(`chooses ${expected.join('/')} and measures the actual plain fallback`,async()=>{
  vi.stubGlobal('Blob',Blob);vi.stubGlobal('CompressionStream',undefined);
  const result=await planSlackExport(rows,async assets=>assets.map(a=>new Uint8Array(a.bytes)),()=>{}, {},limit);
  expect(result.assets.map(a=>a.size)).toEqual(expected);
  expect(result.scriptBytes).toBe(new Blob([result.script]).size);
  expect(result.scriptBytes).toBeLessThan(limit);
  expect(result.resolutions.map(r=>r.count)).toEqual([1,1]);
 });
}
it('refuses an oversized minimum instead of copying an unsafe payload',async()=>{
 vi.stubGlobal('Blob',Blob);vi.stubGlobal('CompressionStream',undefined);
 await expect(planSlackExport(rows,async assets=>assets.map(a=>new Uint8Array(a.bytes)),()=>{},{},100)).rejects.toThrow('Select fewer');
});
it('does not repeat identical tiers for an animation-only selection',async()=>{
 vi.stubGlobal('Blob',Blob);vi.stubGlobal('CompressionStream',undefined);
 const load=vi.fn(async(assets:any[])=>assets.map(a=>new Uint8Array(a.bytes)));
 await expect(planSlackExport([rows[1]],load,()=>{},{},100)).rejects.toThrow('Select fewer');
 expect(load).toHaveBeenCalledTimes(2);
});
it('counts replacement runtime toward the same cap',async()=>{
 vi.stubGlobal('Blob',Blob);vi.stubGlobal('CompressionStream',undefined);
 await expect(planSlackExport(rows,async assets=>assets.map(a=>new Uint8Array(a.bytes)),()=>{},{replaceSmaller:true},base+6000)).rejects.toThrow('Select fewer');
});

it('still supplies minimum assets for an oversized ZIP, whose generator enforces the cap',async()=>{
 vi.stubGlobal('Blob',Blob);vi.stubGlobal('CompressionStream',undefined);
 const result=await planSlackExport(rows,async assets=>assets.map(a=>new Uint8Array(a.bytes)),()=>{},{allowOversizeArchive:true},100);
 expect(result.assets.map(a=>a.size)).toEqual([64,64]);
 expect(result.scriptBytes).toBeGreaterThan(100);
});

it('uses catalog estimates to avoid downloading oversized candidate tiers',async()=>{
 vi.stubGlobal('Blob',Blob);vi.stubGlobal('CompressionStream',undefined);
 const selection=structuredClone(rows);
 for(const {row} of selection)for(const [size,variant] of Object.entries(row.variants))variant.webp.slackGzipBytes=Number(size)> (row.animated?64:128)?100_000:100;
 const load=vi.fn(async(assets:any[])=>assets.map(a=>new Uint8Array(a.bytes)));
 const result=await planSlackExport(selection,load,()=>{},{},base+6000);
 expect(result.assets.map(a=>a.size)).toEqual([128,64]);
 expect(load).toHaveBeenCalledTimes(1);
});
it('still enforces actual bytes if stored estimates are too small',async()=>{
 vi.stubGlobal('Blob',Blob);vi.stubGlobal('CompressionStream',undefined);
 const selection=structuredClone(rows);
 for(const {row} of selection)for(const variant of Object.values(row.variants))variant.webp.slackGzipBytes=1;
 const result=await planSlackExport(selection,async assets=>assets.map(a=>new Uint8Array(a.bytes)),()=>{},{},base+2900);
 expect(result.assets.map(a=>a.size)).toEqual([128,64]);
 expect(result.scriptBytes).toBeLessThan(base+2900);
});
