import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
sharp.concurrency(2);
sharp.cache({memory:32,files:0,items:8});
const root='public/emoji-delivery';
const manifest=JSON.parse(await fs.readFile(`${root}/manifest.json`));
const files=(await fs.readdir('public/emojis')).filter(f=>f.endsWith('.webp'));
if(files.length!==Object.keys(manifest.items).length||files.some(f=>!manifest.items[f.slice(0,-5)]))throw Error('Incomplete delivery catalog');
const totals={128:{webp:0,webpOver:[]},256:{webp:0,webpOver:[]}};
let count=0,framesChecked=0,maxAlphaError=0;
for(const size of [128,256])if((await fs.readdir(`${root}/${size}`)).some(f=>!f.endsWith('.webp')))throw Error('Non-WebP delivery file');
for(const [name,r] of Object.entries(manifest.items)){
  const source=await fs.readFile(r.source);
  if(createHash('sha256').update(source).digest('hex')!==r.sourceSha256)throw Error('Stale source '+name);
  const original=await sharp(source,{animated:true}).metadata();
  for(const size of [128,256]){
    if(Object.keys(r.variants[size]).join()!=='webp')throw Error('Non-WebP manifest variant '+name);
    const v=r.variants[size].webp,bytes=await fs.readFile('public'+v.path),meta=await sharp(bytes,{animated:true}).metadata();
    if(meta.format!=='webp'||bytes.length!==v.bytes||meta.width!==size||(meta.pageHeight??meta.height)!==size)throw Error('Invalid output '+v.path);
    if(r.animated&&((meta.pages??1)<2||(meta.delay??[]).reduce((a,b)=>a+b,0)!==original.delay.reduce((a,b)=>a+b,0)||(meta.loop??0)!==(original.loop??0)))throw Error('Changed playback '+v.path);
    // Compare decoded alpha at every source frame's timestamp, including holds
    // that the WebP encoder may losslessly coalesce into a longer frame.
    const expected=await sharp(source,{animated:true}).resize(size,size,{fit:'contain',background:'#00000000',kernel:['nyancat','unikittyangry'].includes(name)?'nearest':'lanczos3'}).ensureAlpha().extractChannel('alpha').raw().toBuffer();
    const actual=await sharp(bytes,{animated:true}).ensureAlpha().extractChannel('alpha').raw().toBuffer();
    let targetFrame=0,targetEnd=meta.delay?.[0]??Infinity,time=0;
    for(let frame=0;frame<(original.pages??1);frame++){
      while(time>=targetEnd&&targetFrame<(meta.pages??1)-1)targetEnd+=meta.delay[++targetFrame];
      let error=0;const pixels=size*size;
      for(let p=0;p<pixels;p++)error+=Math.abs(expected[frame*pixels+p]-actual[targetFrame*pixels+p]);
      const mean=error/pixels;maxAlphaError=Math.max(maxAlphaError,mean);
      if(mean>0.5)throw Error(`Changed alpha ${v.path} frame ${frame}: mean error ${mean}`);
      time+=original.delay?.[frame]??0;framesChecked++;
    }
    totals[size].webp+=bytes.length;
    if(bytes.length>128000)totals[size].webpOver.push(name);
  }
  if(++count%25===0)console.log('VALIDATED',count);
}
const report={count,framesChecked,maxMeanAlphaError:maxAlphaError,totals};
console.log(JSON.stringify(report,null,2));
await fs.writeFile(`${root}/validation.json`,JSON.stringify(report,null,2)+'\n');
