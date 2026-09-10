import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {decodeAnimation} from './animation-frames.mjs';
import {muxAnimation} from './mux-animation.mjs';
// Human-visible style corrections using completed frames; no model calls.
for(const name of ['southpark_nice','unikittyangry']){
 const dir='experiments/image-enhancement/remaining-animations/'+name;
 const r=JSON.parse(await fs.readFile(dir+'/result.json'));
 const original=await decodeAnimation(r.source),pixel=name==='unikittyangry';
 const dest=dir+'/detail-preserved';await fs.mkdir(dest,{recursive:true});
 const frameFiles=[];
 for(let i=0;i<original.frames.length;i++){
  const raw=await sharp(original.frames[i],{raw:{width:original.width,height:original.height,channels:4}}).resize(r.width,r.height,{kernel:pixel?'nearest':'lanczos3'}).ensureAlpha().raw().toBuffer();
  if(!pixel){const restored=await sharp(r.frameFiles[i]).ensureAlpha().raw().toBuffer();for(let p=0;p<raw.length;p++)if(p%4!==3)raw[p]=Math.round(.6*restored[p]+.4*raw[p]);}
  const file=dest+'/frame-'+i+'.png';await sharp(raw,{raw:{width:r.width,height:r.height,channels:4}}).png().toFile(file);frameFiles.push(file);
 }
 const candidateFile=dest+'/candidate.webp';await muxAnimation({...r,frameFiles},candidateFile);
 const selection={generatedFromSourceSha256:r.sourceSha256,candidateFile,candidateSha256:createHash('sha256').update(await fs.readFile(candidateFile)).digest('hex'),model:pixel?'none':r.model,inference:'local',plan:{kind:pixel?'pixel':'art',mix:pixel?0:.6,alpha:'source',note:pixel?'Nearest-neighbor enlargement preserves intentional pixel-art outlines and flame shapes.':'Blend with original retains facial stubble, nose detail and lettering.'}};
 await fs.writeFile(dir+'/selection.json',JSON.stringify(selection,null,2));console.log('PRESERVED',name);
}
