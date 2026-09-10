import fs from 'node:fs/promises';import path from 'node:path';import sharp from 'sharp';import {createHash} from 'node:crypto';
import {decodeAnimation} from './animation-frames.mjs';import {muxAnimation} from './mux-animation.mjs';import {animationPlan} from './remaining-animation-plan.mjs';import {upscaleLocal,closeUpscaleWorker} from './upscale-worker.mjs';
const root='experiments/image-enhancement/remaining-animations';await fs.mkdir(root,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');const save=async(f,x)=>{await fs.writeFile(f+'.tmp',JSON.stringify(x,null,2));await fs.rename(f+'.tmp',f)};
const pilot=JSON.parse(await fs.readFile('staging/emoji-enhancements/animated-pilot/manifest.json'));const done=new Set(pilot.items.map(r=>r.name));
const names=process.argv[2]?.split(','),rows=[];
for(const file of (await fs.readdir('public/emojis')).sort())if(file.endsWith('.webp')&&!done.has(file.slice(0,-5))&&(!names||names.includes(file.slice(0,-5)))){const source='public/emojis/'+file,meta=await sharp(source,{animated:true}).metadata();if(meta.pages>1)rows.push({name:file.slice(0,-5),source,sourceSha256:hash(await fs.readFile(source)),plan:animationPlan(file.slice(0,-5))});}
if(!names)await save(root+'/inventory.json',rows.map(r=>({name:r.name,file:r.source})));
const signatureFor=row=>hash(JSON.stringify({version:1,source:row.sourceSha256,plan:row.plan,target:512}));
const groups=new Map();for(const row of rows){if(!groups.has(row.sourceSha256))groups.set(row.sourceSha256,[]);groups.get(row.sourceSha256).push(row);}
async function one(row){
 const dir=path.join(root,row.name);await fs.mkdir(dir,{recursive:true});const signature=signatureFor(row);
 try{const existing=JSON.parse(await fs.readFile(dir+'/result.json'));if(existing.signature===signature&&existing.status==='complete'&&hash(await fs.readFile(dir+'/candidate.webp'))===existing.candidateSha256){console.log('REUSE',row.name);return existing;}}catch{}
 const original=await decodeAnimation(row.source),scale=512/Math.max(original.width,original.height),width=Math.round(original.width*scale),height=Math.round(original.height*scale),work=path.join(dir,signature.slice(0,12));await fs.mkdir(work,{recursive:true});
 const frameHashes=original.frames.map(hash),unique=[...new Map(frameHashes.map((h,i)=>[h,i])).values()],framePaths=new Map(),plan=row.plan;let completed=0;
 for(let start=0;start<unique.length;start+=4){
  const ids=unique.slice(start,start+4),needed=[];
  for(const i of ids){const output=path.join(work,frameHashes[i]+'.png');framePaths.set(frameHashes[i],output);try{await fs.access(output)}catch{needed.push(i)}}
  if(!needed.length){completed+=ids.length;continue;}
  if(['resize','pixel'].includes(plan.kind)){
   for(const i of needed)await sharp(original.frames[i],{raw:{width:original.width,height:original.height,channels:4}}).resize(width,height,{kernel:plan.kind==='pixel'?'nearest':'lanczos3'}).png().toFile(framePaths.get(frameHashes[i]));
  }else{
   const normalized=needed.map(async i=>sharp(original.frames[i],{raw:{width:original.width,height:original.height,channels:4}}).resize({width:128,height:128,fit:'inside'}).ensureAlpha().raw().toBuffer({resolveWithObject:true}));const frames=await Promise.all(normalized);
   const pad=plan.kind==='photo'?40:24,cell=128+pad*2,cols=2,atlasW=cell*cols,atlasH=cell*Math.ceil(needed.length/cols),layers=[];
   let needsBlack=plan.alpha==='dual';
   for(let j=0;j<frames.length;j++){const f=frames[j];for(let p=3;p<f.data.length;p+=4)if(f.data[p]<255){needsBlack=true;break;}layers.push({input:await sharp(f.data,{raw:f.info}).png().toBuffer(),left:(j%cols)*cell+pad,top:Math.floor(j/cols)*cell+pad});}
   const atlas=await sharp({create:{width:atlasW,height:atlasH,channels:4,background:'#00000000'}}).composite(layers).png().toBuffer();const stem=path.join(work,'chunk-'+start),white=stem+'-white.png',whiteOut=stem+'-white-sr.png',black=stem+'-black.png',blackOut=stem+'-black-sr.png';
   await sharp(atlas).flatten({background:'white'}).png().toFile(white);await upscaleLocal(white,whiteOut,plan.kind);
   if(needsBlack){await sharp(atlas).flatten({background:'black'}).png().toFile(black);await upscaleLocal(black,blackOut,plan.kind);}
   for(let j=0;j<needed.length;j++){
    const i=needed[j],f=frames[j],rect={left:((j%cols)*cell+pad)*4,top:(Math.floor(j/cols)*cell+pad)*4,width:f.info.width*4,height:f.info.height*4};
    const w=await sharp(whiteOut).extract(rect).resize(width,height).ensureAlpha().raw().toBuffer(),b=needsBlack?await sharp(blackOut).extract(rect).resize(width,height).ensureAlpha().raw().toBuffer():w;
    const base=await sharp(original.frames[i],{raw:{width:original.width,height:original.height,channels:4}}).resize(width,height).ensureAlpha().raw().toBuffer(),output=Buffer.alloc(base.length);
    for(let p=0;p<output.length;p+=4){let a=1;if(needsBlack){const d=[w[p]-b[p],w[p+1]-b[p+1],w[p+2]-b[p+2]].sort((x,y)=>x-y);a=Math.max(0,Math.min(1,1-d[1]/255));if(a<.02)a=0;if(a>.98)a=1;}for(let c=0;c<3;c++){const restored=a>0?Math.max(0,Math.min(255,b[p+c]/a)):base[p+c];output[p+c]=Math.round(plan.mix*restored+(1-plan.mix)*base[p+c]);}output[p+3]=plan.alpha==='source'?base[p+3]:Math.round(a*255);}
    // A fully blank original frame is a deliberate hold; keep it blank.
    if(!original.frames[i].some((v,k)=>k%4===3&&v))output.fill(0);
    const outputFile=framePaths.get(frameHashes[i]);await sharp(output,{raw:{width,height,channels:4}}).png().toFile(outputFile+'.tmp');await fs.rename(outputFile+'.tmp',outputFile);
   }
   // Chunk files are resumable intermediates; final PNG frames are authoritative.
  }
  completed+=ids.length;await save(dir+'/progress.json',{name:row.name,signature,completedUniqueFrames:completed,uniqueFrames:unique.length,frames:original.frames.length});if(start===0||completed===unique.length||completed%40===0)console.log('FRAMES',row.name,completed+'/'+unique.length);
 }
 const files=frameHashes.map(h=>framePaths.get(h));await muxAnimation({frameFiles:files,width,height,delays:original.delays,loop:original.loop},dir+'/candidate.webp');
 const result={...row,signature,status:'complete',approval:'pending',frames:original.frames.length,uniqueFrames:unique.length,width,height,delays:original.delays,loop:original.loop,duration:original.delays.reduce((a,b)=>a+b,0),candidateSha256:hash(await fs.readFile(dir+'/candidate.webp')),frameFiles:files,model:plan.kind==='photo'?'realesr-general-x4v3 (50% strong / 50% weak denoise)':plan.kind==='art'?'realesr-animevideov3':'none',inference:'local',sourceHasTransparentPixels:original.frames.some(f=>f.some((v,i)=>i%4===3&&v<255))};await save(dir+'/result.json',result);console.log('COMPLETE',row.name,original.frames.length+' frames');return result;
}
const queue=[...groups.values()],results=[];
async function worker(){while(queue.length){const group=queue.shift();try{const result=await one(group[0]);results.push(result);for(const alias of group.slice(1)){const dir=path.join(root,alias.name);await fs.mkdir(dir,{recursive:true});await fs.copyFile(path.join(root,result.name,'candidate.webp'),dir+'/candidate.webp');const r={...result,...alias,signature:signatureFor(alias),reusedFrom:result.name};await save(dir+'/result.json',r);results.push(r);console.log('REUSED ALIAS',alias.name,result.name);}}catch(e){console.log('FAILED',group[0].name,String(e));results.push({name:group[0].name,status:'failed',error:String(e)});}}}
try{await Promise.all([worker(),worker()]);await save(root+'/run-summary.json',results);console.log('FINISHED',results.length,'/',rows.length);if(results.some(r=>r.status==='failed'))process.exitCode=1;}finally{closeUpscaleWorker()}
