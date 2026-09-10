import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
sharp.concurrency(2);
sharp.cache({memory:32,files:0,items:8});
const root='public/emoji-delivery';
const only=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7).split(',');
const manifest=JSON.parse(await fs.readFile(`${root}/manifest.json`));
const files=(await fs.readdir('public/emojis')).filter(f=>f.endsWith('.webp'));
if(files.length!==Object.keys(manifest.items).length||files.some(f=>!manifest.items[f.slice(0,-5)]))throw Error('Incomplete delivery catalog');
const totals=Object.fromEntries([64,128,256,'original'].map(size=>[size,{webp:0,webpOver:[]}]));
let previewBytes=0;
let count=0,framesChecked=0,maxAlphaError=0;
for(const size of [64,128,256,'original'])if((await fs.readdir(`${root}/${size}`)).some(f=>!f.endsWith('.webp')))throw Error('Non-WebP delivery file');
for(const [name,r] of Object.entries(manifest.items).filter(([name])=>!only||only.includes(name))){
  const source=await fs.readFile(r.source);
  if(createHash('sha256').update(source).digest('hex')!==r.sourceSha256)throw Error('Stale source '+name);
  const original=await sharp(source,{animated:true}).metadata();
  for(const size of [64,128,256,'original']){
    if(size!=='original'&&(Object.keys(r.variants[size]).join()!=='webp'))throw Error('Non-WebP manifest variant '+name);
    const v=size==='original'?r.original:r.variants[size].webp,bytes=await fs.readFile('public'+v.path),meta=await sharp(bytes,{animated:true}).metadata();
    if(meta.format!=='webp'||bytes.length!==v.bytes||meta.width!==(size==='original'?original.width:size)||(meta.pageHeight??meta.height)!==(size==='original'?(original.pageHeight??original.height):size))throw Error('Invalid output '+v.path);
    if(r.animated&&((meta.pages??1)<2||(meta.delay??[]).reduce((a,b)=>a+b,0)!==original.delay.reduce((a,b)=>a+b,0)||(meta.loop??0)!==(original.loop??0)))throw Error('Changed playback '+v.path);
    // Compare decoded alpha at every source frame's timestamp, including holds
    // that the WebP encoder may losslessly coalesce into a longer frame.
    let reference=sharp(source,{animated:true});
    if(size!=='original')reference=reference.resize(size,size,{fit:'contain',background:'#00000000',kernel:['nyancat','unikittyangry'].includes(name)?'nearest':'lanczos3'});
    const expected=await reference.ensureAlpha().extractChannel('alpha').raw().toBuffer();
    const actual=await sharp(bytes,{animated:true}).ensureAlpha().extractChannel('alpha').raw().toBuffer();
    let targetFrame=0,targetEnd=meta.delay?.[0]??Infinity,time=0;
    for(let frame=0;frame<(original.pages??1);frame++){
      while(time>=targetEnd&&targetFrame<(meta.pages??1)-1)targetEnd+=meta.delay[++targetFrame];
      let error=0;const pixels=meta.width*(meta.pageHeight??meta.height);
      for(let p=0;p<pixels;p++)error+=Math.abs(expected[frame*pixels+p]-actual[targetFrame*pixels+p]);
      const mean=error/pixels;maxAlphaError=Math.max(maxAlphaError,mean);
      if(mean>0.5)throw Error(`Changed alpha ${v.path} frame ${frame}: mean error ${mean}`);
      time+=original.delay?.[frame]??0;framesChecked++;
    }
    totals[size].webp+=bytes.length;
    if(bytes.length>128000)totals[size].webpOver.push(name);
  }
  if(r.original.quality!==90)throw Error('Original is not quality 90 '+name);
  for(const size of [64,128,256]){
    const preview=r.previews[size],bytes=await fs.readFile('public'+preview.path),meta=await sharp(bytes,{animated:true}).metadata();
    if(meta.format!=='webp'||(meta.pages??1)!==1||meta.width!==size||meta.height!==size||bytes.length!==preview.bytes)throw Error('Invalid still preview '+name);
    const expected=await sharp(source,{page:0,pages:1}).resize(size,size,{fit:'contain',background:'#00000000',kernel:['nyancat','unikittyangry'].includes(name)?'nearest':'lanczos3'}).ensureAlpha().extractChannel('alpha').raw().toBuffer();
    const actual=await sharp(bytes).ensureAlpha().extractChannel('alpha').raw().toBuffer();
    let delta=0;for(let p=0;p<actual.length;p++)delta+=Math.abs(actual[p]-expected[p]);
    if(delta/actual.length>0.5)throw Error('Changed preview alpha '+name);
    previewBytes+=bytes.length;
  }
  if(++count%25===0)console.log('VALIDATED',count);
}
const report={count,framesChecked,maxMeanAlphaError:maxAlphaError,previewBytes,totals};
console.log(JSON.stringify(report,null,2));
await fs.writeFile(`${root}/${only?'validation-latest-corrections':'validation'}.json`,JSON.stringify(report,null,2)+'\n');
