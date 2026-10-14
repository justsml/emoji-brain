// Reuse cached black/white restorations to align alpha with restored artwork.
// No inference, background-removal service, or generative calls.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
process.env.VIPS_DISC_THRESHOLD ??= '1073741824';
const {default:sharp}=await import('sharp');
import {muxAnimation} from './mux-animation.mjs';
sharp.concurrency(2);sharp.cache({memory:32,files:0,items:16});
const root='staging/emoji-enhancements/animation-matte-repair';
const names=['alert','magic','meow-hearts','smart','meow-stretch','meow_clorox','meow_cloroxsip','meow_coffeespitting','meow_enjoy-rain','meow_enjoy-snow','meow_red-bull','meow_sad-rain'];
const selected=process.argv.find(a=>a.startsWith('--only='))?.slice(7).split(',') ?? names;
if(selected.some(n=>!names.includes(n)))throw Error('Name is outside the reviewed repair scope');
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await fs.readFile(p));
const repairSignature=hash(await fs.readFile(new URL(import.meta.url)));
await fs.mkdir(root,{recursive:true});
const staged=await read('staging/emoji-enhancements/remaining-animations/manifest.json');
let manifest;try{manifest=await read(root+'/manifest.json')}catch(e){if(e.code!=='ENOENT')throw e;manifest={version:1,status:'staged',request:'Fix the twelve animation masters',method:'Cached dual-background restoration alpha, with opaque interior and small-component protection',items:[]};}

// Preserve disconnected spray, rain, snow, and other small details. Mask them
// from the original composited source, not from a new semantic segmentation.
function smallComponents(rgba,width,height) {
  const n=width*height,seen=new Uint8Array(n),components=[];
  for(let seed=0;seed<n;seed++){
    if(seen[seed]||rgba[seed*4+3]<128)continue;
    const q=[seed];seen[seed]=1;
    for(let k=0;k<q.length;k++){
      const p=q[k],x=p%width,y=Math.floor(p/width);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const xx=x+dx,yy=y+dy,j=yy*width+xx;
        if(xx>=0&&xx<width&&yy>=0&&yy<height&&!seen[j]&&rgba[j*4+3]>=128){seen[j]=1;q.push(j);}
      }
    }
    components.push(q);
  }
  const largest=Math.max(0,...components.map(c=>c.length)),mask=Buffer.alloc(n);
  for(const c of components)if(c.length<largest*.02)for(const p of c)mask[p]=255;
  return mask;
}

for(const name of selected) {
  const oldName=name==='meow-hearts'?'cat-meow-hearts':name;
  const spec=staged.items.find(r=>r.name===oldName);
  const cacheRoot=`experiments/image-enhancement/remaining-animations/${oldName}`;
  const cache=await read(cacheRoot+'/result.json');
  const archived=await fs.readFile(spec.source),prior=await fs.readFile(`public/emojis/${name}.webp`);
  if(hash(archived)!==cache.sourceSha256)throw Error('Restoration cache source changed: '+name);
  const priorHash=hash(prior),dir=`${root}/${name}`;
  await fs.mkdir(dir,{recursive:true});
  const frameDir=`${cacheRoot}/matte-repair-${repairSignature.slice(0,12)}`;
  await fs.mkdir(frameDir,{recursive:true});
  const previous=manifest.items.find(r=>r.name===name);
  if(previous?.repairSignature===repairSignature && previous.priorSha256===priorHash && previous.status==='staged' && hash(await fs.readFile(`${root}/${previous.candidate}`))===previous.candidateSha256){console.log('REUSE',name);continue;}
  if(previous?.status==='applied')throw Error('Repair already applied; start a separate revision: '+name);
  const sm=await sharp(archived,{animated:true}).metadata(),mm=await sharp(prior,{animated:true}).metadata();
  if(sm.pages!==mm.pages||JSON.stringify(sm.delay)!==JSON.stringify(mm.delay))throw Error('Source timeline changed: '+name);
  const src=await sharp(archived,{animated:true}).ensureAlpha().raw().toBuffer();
  const master=await sharp(prior,{animated:true}).ensureAlpha().raw().toBuffer();
  const width=mm.width,height=mm.pageHeight,bytes=width*height*4,sourceBytes=sm.width*sm.pageHeight*4;
  const sourceFrames=Array.from({length:sm.pages},(_,i)=>src.subarray(i*sourceBytes,(i+1)*sourceBytes));
  // Match the historical atlas ordering, including repeated-frame aliases.
  const frameHashes=sourceFrames.map(hash),unique=[...new Map(frameHashes.map((h,i)=>[h,i])).values()];
  const rendered=new Map(),frameFiles=[];let maxCoverageChange=0,changedAlphaPixels=0,protectedPixels=0;
  const temporalMatteFallbackFrames=[];
  const pad=cache.plan.kind==='photo'?40:24,cell=128+2*pad;
  for(let start=0;start<unique.length;start+=4) {
    const ids=unique.slice(start,start+4),cacheDir=`${cacheRoot}/${cache.signature.slice(0,12)}`;
    const white=await fs.readFile(`${cacheDir}/chunk-${start}-white-sr.png`),black=await fs.readFile(`${cacheDir}/chunk-${start}-black-sr.png`);
    const cacheMeta=await sharp(white).metadata();
    const atlasIds=(oldName==='meow_enjoy-rain'&&start===60&&cacheMeta.height===704)?ids.slice(2):ids;
    if(atlasIds!==ids)temporalMatteFallbackFrames.push(...ids.slice(0,2));
    if(cacheMeta.height<Math.ceil(atlasIds.length/2)*cell*4)throw Error('Unexpected incomplete cached atlas: '+name+' '+start);
    for(const [j,index] of atlasIds.entries()) {
      const original=sourceFrames[index];
      const normalized=await sharp(original,{raw:{width:sm.width,height:sm.pageHeight,channels:4}}).resize({width:128,height:128,fit:'inside'}).raw().toBuffer({resolveWithObject:true});
      const rect={left:((j%2)*cell+pad)*4,top:(Math.floor(j/2)*cell+pad)*4,width:normalized.info.width*4,height:normalized.info.height*4};
      const w=await sharp(white).extract(rect).resize(width,height).ensureAlpha().raw().toBuffer();
      const b=await sharp(black).extract(rect).resize(width,height).ensureAlpha().raw().toBuffer();
      const old=master.subarray(index*bytes,(index+1)*bytes),output=Buffer.from(old);
      const alpha=Buffer.alloc(width*height);for(let p=0;p<alpha.length;p++)alpha[p]=old[p*4+3];
      // Sharp morphology treats dark pixels as foreground: erode expands
      // white protected components; dilate shrinks white to a safe interior.
      const componentMask=smallComponents(original,sm.width,sm.pageHeight);
      const protect=await sharp(componentMask,{raw:{width:sm.width,height:sm.pageHeight,channels:1}}).resize(width,height,{kernel:'nearest'}).toColourspace('b-w').erode(2).raw().toBuffer();
      const interior=await sharp(alpha,{raw:{width,height,channels:1}}).toColourspace('b-w').dilate(8).raw().toBuffer();
      let oldCoverage=0,newCoverage=0;
      for(let p=0;p<alpha.length;p++) {
        const o=p*4,diffs=[w[o]-b[o],w[o+1]-b[o+1],w[o+2]-b[o+2]].sort((a,b)=>a-b);
        let a=Math.max(0,Math.min(1,1-diffs[1]/255));if(a<.02)a=0;if(a>.98)a=1;
        if(protect[p]>0||interior[p]===255){a=alpha[p]/255;protectedPixels++;}
        output[o+3]=Math.round(a*255);if(output[o+3]!==alpha[p])changedAlphaPixels++;
        // Use restored edge RGB where the new matte exposes pixels beyond the
        // old silhouette. Keep existing opaque artwork, lettering and colors.
        if(a>0&&alpha[p]<255&&protect[p]===0){const mix=1-alpha[p]/255;for(let c=0;c<3;c++){const restored=Math.max(0,Math.min(255,b[o+c]/a));output[o+c]=Math.round(old[o+c]*(1-mix)+restored*mix);}}
        oldCoverage+=alpha[p]/255;newCoverage+=a;
      }
      maxCoverageChange=Math.max(maxCoverageChange,Math.abs(newCoverage-oldCoverage)/(width*height));
      if(maxCoverageChange>.015)throw Error('Matte coverage moved more than 1.5% of the canvas: '+name);
      const file=`${frameDir}/frame-${index}.png`;
      await sharp(output,{raw:{width,height,channels:4}}).png().toFile(file);
      rendered.set(frameHashes[index],file);
    }
  }
  // The rain cache resumed with only frames 62/63 in chunk 60. For 60/61,
  // transfer neighboring corrections only in a radius-eight neighborhood
  // whose original alpha is unchanged; moving droplets keep their own matte.
  for(const index of temporalMatteFallbackFrames) {
    const reference=62;
    const ref=await sharp(rendered.get(frameHashes[reference])).ensureAlpha().raw().toBuffer();
    const old=master.subarray(index*bytes,(index+1)*bytes),refOld=master.subarray(reference*bytes,(reference+1)*bytes),output=Buffer.from(old);
    const changed=Buffer.alloc(width*height);for(let p=0;p<changed.length;p++)changed[p]=Math.abs(old[p*4+3]-refOld[p*4+3])>2?255:0;
    const moving=await sharp(changed,{raw:{width,height,channels:1}}).toColourspace('b-w').erode(8).raw().toBuffer();
    let coverage=0;
    for(let p=0;p<moving.length;p++) {
      const o=p*4;if(moving[p])continue;
      output[o+3]=Math.max(0,Math.min(255,old[o+3]+ref[o+3]-refOld[o+3]));
      coverage+=(output[o+3]-old[o+3])/255;if(output[o+3]!==old[o+3])changedAlphaPixels++;
      if(old[o+3]<255&&output[o+3]>0)for(let c=0;c<3;c++)output[o+c]=Math.round(old[o+c]*(old[o+3]/255)+ref[o+c]*(1-old[o+3]/255));
    }
    maxCoverageChange=Math.max(maxCoverageChange,Math.abs(coverage)/(width*height));
    if(maxCoverageChange>.015)throw Error('Temporal matte coverage exceeded guard: '+name);
    const file=`${frameDir}/frame-${index}.png`;
    await sharp(output,{raw:{width,height,channels:4}}).png().toFile(file);rendered.set(frameHashes[index],file);
  }
  for(const h of frameHashes)frameFiles.push(rendered.get(h));
  const candidate=`${name}/candidate.webp`;
  await muxAnimation({frameFiles,width,height,delays:mm.delay,loop:mm.loop??0},`${root}/${candidate}`);
  const candidateBytes=await fs.readFile(`${root}/${candidate}`);
  const candidateSha256=hash(candidateBytes);
  if(candidateSha256===priorHash||changedAlphaPixels===0)throw Error('Repair made no change: '+name);
  const item={name,repairSignature,status:'staged',priorSha256:priorHash,candidateSha256,sourceSha256:cache.sourceSha256,source:spec.source,
    cacheSignature:cache.signature,candidate,width,height,frames:mm.pages,delays:mm.delay,loop:mm.loop??0,
    maxCoverageChange,changedAlphaPixels,protectedPixels,temporalMatteFallbackFrames,frameFiles};
  manifest.items=manifest.items.filter(r=>r.name!==name);manifest.items.push(item);manifest.updatedAt=new Date().toISOString();
  await fs.writeFile(`${root}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
  console.log('STAGED',name,mm.pages,'frames; max coverage change',maxCoverageChange);
}
