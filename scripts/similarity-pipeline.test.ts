import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { processSimilarity } from './similarity-pipeline';
import { extractDescriptor, compareDescriptors } from './similarity-descriptors';
const roots:string[]=[];
const quiet={progress:()=>{}};
async function catalog(root:string,ids:string[]) {
  await fs.writeFile(path.join(root,'src/data/emoji-metadata.json'),JSON.stringify({emojis:ids.map(id=>({id,filename:`${id}.png`,path:`/emojis/${id}.png`}))}));
}
async function fixture(count=3) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'emoji-similarity-'));roots.push(root);
  await fs.mkdir(path.join(root,'src/data'),{recursive:true});await fs.mkdir(path.join(root,'public/emojis'),{recursive:true});
  const ids=Array.from({length:count},(_,i)=>String(i).padStart(3,'0'));
  for(let i=0;i<count;i++)await fs.writeFile(path.join(root,`public/emojis/${ids[i]}.png`),await sharp({create:{width:8,height:8,channels:4,background:{r:100+i%150,g:30,b:30,alpha:1}}}).png().toBuffer());
  await catalog(root,ids);return {root,ids};
}
const output=(root:string)=>fs.readFile(path.join(root,'public/similarity/index.json'),'utf8');
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>fs.rm(root,{recursive:true,force:true})));});
describe('restartable similarity generation',()=>{
 it('publishes deterministic complete output and separates cache from extraction throughput',async()=>{
  const {root}=await fixture();
  const cold=await processSimilarity(root,quiet),bytes=await output(root);
  const warm=await processSimilarity(root,quiet);
  expect(await output(root)).toBe(bytes);expect(warm.index).toEqual(cold.index);
  expect(cold.stats.processed).toBe(3);expect(cold.stats.cacheHits).toBe(0);
  expect(cold.stats.imagesPerSecond).toBe(cold.stats.processed/Math.max(cold.stats.extractionSeconds,.001));
  expect(warm.stats.processed).toBe(0);expect(warm.stats.cacheHits).toBe(3);
  expect(warm.stats.imagesPerSecond).toBe(0);expect(warm.stats.comparisons).toBe(0);expect(warm.stats.comparisonCacheHits).toBe(3);
  for(const [id,entry] of Object.entries(warm.index.entries))for(const neighbor of entry.color)expect(neighbor.id).not.toBe(id);
 });
 it('reuses completed descriptors after extraction failure and preserves published output',async()=>{
  const {root}=await fixture();await processSimilarity(root,quiet);const bytes=await output(root);
  let calls=0;
  await expect(processSimilarity(root,{...quiet,version:'restart',extract:async buffer=>{if(++calls===2)throw new Error('fixture extraction failure');return extractDescriptor(buffer);}})).rejects.toThrow('fixture extraction failure');
  expect(await output(root)).toBe(bytes);
  const failed=JSON.parse(await fs.readFile(path.join(root,'.cache/similarity/last-run.json'),'utf8'));
  expect(failed.status).toBe('failed');expect(failed.processed).toBe(1);expect(failed.failed).toBe(1);
  expect(failed.extractionSeconds).toBeGreaterThan(0);
  expect(failed.imagesPerSecond).toBe(failed.processed/Math.max(failed.extractionSeconds,.001));
  const resumed=await processSimilarity(root,{...quiet,version:'restart'});
  expect(resumed.stats.cacheHits).toBe(1);expect(resumed.stats.processed).toBe(2);
  const clean=await processSimilarity(root,{...quiet,version:'restart',cacheDir:path.join(root,'clean-cache')});
  expect(resumed.index).toEqual(clean.index);
 });
 it('resumes checkpointed comparisons after mid-row cancellation',async()=>{
  const {root}=await fixture(67),controller=new AbortController();
  const descriptor=await extractDescriptor(await sharp({create:{width:8,height:8,channels:4,background:'red'}}).png().toBuffer());
  let calls=0;
  await expect(processSimilarity(root,{...quiet,signal:controller.signal,extract:async()=>descriptor,compare:(a,b)=>{if(++calls===65)controller.abort(new Error('fixture interrupt'));return compareDescriptors(a,b);}})).rejects.toThrow('fixture interrupt');
  const resumed=await processSimilarity(root,{...quiet,extract:async()=>descriptor});
  expect(resumed.stats.cacheHits).toBe(67);expect(resumed.stats.comparisonCacheHits).toBeGreaterThanOrEqual(64);
  expect(resumed.stats.comparisons+resumed.stats.comparisonCacheHits).toBe(67*66/2);
  const clean=await processSimilarity(root,{...quiet,extract:async()=>descriptor,cacheDir:path.join(root,'clean-cache')});
  expect(resumed.index).toEqual(clean.index);
 });
 it('invalidates changed images and configuration while updating unchanged neighbor lists for additions/deletions',async()=>{
  const {root,ids}=await fixture();await processSimilarity(root,quiet);
  const filename=path.join(root,'public/emojis/003.png');
  await fs.writeFile(filename,await sharp({create:{width:8,height:8,channels:4,background:'#731e1e'}}).png().toBuffer());
  await catalog(root,[...ids,'003']);const added=await processSimilarity(root,quiet);
  expect(added.stats.processed).toBe(1);expect(added.stats.comparisons).toBe(3);
  expect(added.index.entries['000'].color.map(n=>n.id)).toContain('003');
  await catalog(root,['000','002','003']);const removed=await processSimilarity(root,quiet);
  expect(removed.stats.processed).toBe(0);expect(removed.index.entries['001']).toBeUndefined();
  expect(JSON.stringify(removed.index.entries)).not.toContain('"id":"001"');
  await fs.writeFile(filename,await sharp({create:{width:8,height:8,channels:4,background:'blue'}}).png().toBuffer());
  const changed=await processSimilarity(root,quiet);expect(changed.stats.processed).toBe(1);expect(changed.stats.comparisons).toBe(2);
  const config=await processSimilarity(root,{...quiet,version:'next-config'});expect(config.stats.processed).toBe(3);expect(config.stats.comparisons).toBe(3);
 });
 it('rejects duplicate catalog IDs and invalid computed scores without replacing valid output',async()=>{
  const {root,ids}=await fixture();await processSimilarity(root,quiet);const bytes=await output(root);
  await catalog(root,[ids[0],ids[0]]);await expect(processSimilarity(root,quiet)).rejects.toThrow('Duplicate emoji IDs');expect(await output(root)).toBe(bytes);
  await catalog(root,ids);
  await expect(processSimilarity(root,{...quiet,version:'invalid-score',compare:()=>({color:NaN,histogram:0,layout:0,visual:0,silhouette:null,edges:null})})).rejects.toThrow('Invalid similarity distances');
  expect(await output(root)).toBe(bytes);
 });
 it('rebuilds structurally corrupt valid-JSON cache records',async()=>{
  const {root}=await fixture();const first=await processSimilarity(root,quiet);
  const folder=path.join(root,'.cache/similarity/descriptors'),files=await fs.readdir(folder);
  const cache=JSON.parse(await fs.readFile(path.join(folder,files[0]),'utf8'));
  cache.descriptor.frames[0].mask=[];
  await fs.writeFile(path.join(folder,files[0]),JSON.stringify(cache));
  const recovered=await processSimilarity(root,quiet);
  expect(recovered.stats.processed).toBe(1);expect(recovered.stats.cacheHits).toBe(2);
  expect(recovered.index).toEqual(first.index);
 });
 it('detects image content drift during processing before publication',async()=>{
  const {root}=await fixture();await processSimilarity(root,quiet);const bytes=await output(root);let changed=false;
  await expect(processSimilarity(root,{...quiet,version:'drift',extract:async buffer=>{if(!changed){changed=true;await fs.writeFile(path.join(root,'public/emojis/000.png'),Buffer.from('changed'));}return extractDescriptor(buffer);}})).rejects.toThrow('Image changed during processing');
  expect(await output(root)).toBe(bytes);
 });
 it('does not publish when cancellation arrives during the final temporary write',async()=>{
  const {root}=await fixture();await processSimilarity(root,quiet);const bytes=await output(root);
  const controller=new AbortController(),write=fs.writeFile.bind(fs);
  const spy=vi.spyOn(fs,'writeFile').mockImplementation(async(...args:Parameters<typeof fs.writeFile>)=>{
    await write(...args);
    if(String(args[0]).startsWith(path.join(root,'public/similarity/index.json.')))controller.abort(new Error('cancel before rename'));
  });
  try {await expect(processSimilarity(root,{...quiet,signal:controller.signal,version:'cancel-at-publish'})).rejects.toThrow('cancel before rename');}
  finally {spy.mockRestore();}
  expect(await output(root)).toBe(bytes);
 });
 it('rebuilds corrupt palette mass and recomputes cached duplicate evidence',async()=>{
  const {root}=await fixture();const first=await processSimilarity(root,quiet);
  const folder=path.join(root,'.cache/similarity/descriptors'),files=await fs.readdir(folder);
  const descriptor=JSON.parse(await fs.readFile(path.join(folder,files[0]),'utf8'));
  descriptor.descriptor.palette[0].weight=.5;
  await fs.writeFile(path.join(folder,files[0]),JSON.stringify(descriptor));
  const pairFolder=path.join(root,'.cache/similarity/pairs');
  for(const file of await fs.readdir(pairFolder)){
    const saved=JSON.parse(await fs.readFile(path.join(pairFolder,file),'utf8'));
    for(const edge of Object.values(saved) as any[]){edge.pair.exact=true;edge.pair.hamming=63;}
    await fs.writeFile(path.join(pairFolder,file),JSON.stringify(saved));
  }
  const resumed=await processSimilarity(root,quiet);
  expect(resumed.stats.processed).toBe(1);expect(resumed.pairs).toEqual(first.pairs);
 });
 it('excludes concurrent processors and fails closed on malformed locks and recovery guards',async()=>{
  const {root}=await fixture();let checked=false;
  await processSimilarity(root,{...quiet,extract:async buffer=>{
    if(!checked){checked=true;await expect(processSimilarity(root,quiet)).rejects.toThrow('already running');}
    return extractDescriptor(buffer);
  }});
  // Invalid lock data is never silently removed; recovery guards fail closed too.
  const lock=path.join(root,'.cache/similarity/run.lock');await fs.writeFile(lock,'not-a-pid');
  await expect(processSimilarity(root,quiet)).rejects.toThrow('Invalid similarity lock');
  await fs.unlink(lock);const guard=path.join(root,'.cache/similarity/recovery.lock');await fs.writeFile(guard,'not-a-pid');
  await expect(processSimilarity(root,quiet)).rejects.toThrow('lock acquisition is in progress');
 });
});
