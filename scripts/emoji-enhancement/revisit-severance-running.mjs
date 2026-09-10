import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {decodeAnimation} from './animation-frames.mjs';
import {muxAnimation} from './mux-animation.mjs';
import {predict,downloadPrediction} from './replicate.mjs';

// Targeted source recovery: the exact two-shot sequence, not generated actor likeness.
const dir='experiments/image-enhancement/remaining-animations/severance-running/replicate-revisit';
const out='staging/emoji-enhancements/severance-running-revisit';
await fs.mkdir(dir,{recursive:true});await fs.mkdir(out,{recursive:true});
sharp.concurrency(2);sharp.cache({memory:32,files:0,items:8});
const source='staging/emoji-enhancements/originals/severance-running.webp';
const referenceUrl='https://gifdb.com/images/high/sprinting-dorian-harewood-severance-xn70h4nn6wn6ym9n.mp4';
const reference=dir+'/gifdb-source.mp4';
try{await fs.access(reference)}catch{execFileSync('curl',['-fLsS',referenceUrl,'-o',reference]);}
const original=await decodeAnimation(source);
if(original.frames.length!==90||original.width!==64||original.height!==64||original.delays.some(d=>d!==50))throw Error('Original sequence changed; re-check source alignment');
const probe=file=>JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,nb_frames,r_frame_rate','-of','json',file])).streams[0];
const refMeta=probe(reference);if(refMeta.width!==889||refMeta.height!==500||+refMeta.nb_frames!==112||refMeta.r_frame_rate!=='25/1')throw Error('Reference geometry/timing changed');
execFileSync('ffmpeg',['-v','error','-i',reference,'-f','rawvideo','-pix_fmt','rgb24','-y',dir+'/reference.rgb']);
const ref=await fs.readFile(dir+'/reference.rgb'),sourceFrameBytes=889*500*3;
// Phase found by matching poses in the first shot. Preserve the cut at frame 27,
// monotonically advance at 25/20 source frames per output, and retain all 90 holds.
const mapping=Array.from({length:90},(_,i)=>Math.min(111,Math.floor(i*25/20+.75)));
const rgb=[];const recoveredFiles=[];
for(let i=0;i<90;i++){
 const frame=ref.subarray(mapping[i]*sourceFrameBytes,(mapping[i]+1)*sourceFrameBytes);
 const pixels=await sharp(frame,{raw:{width:889,height:500,channels:3}}).resize(512,512,{fit:'cover',position:'centre'}).raw().toBuffer();rgb.push(pixels);
 const alpha=await sharp(original.frames[i],{raw:{width:64,height:64,channels:4}}).resize(512,512).extractChannel(3).toBuffer();
 const file=dir+'/recovered-'+i+'.webp';await sharp(pixels,{raw:{width:512,height:512,channels:3}}).joinChannel(alpha,{raw:{width:512,height:512,channels:1}}).webp({lossless:true}).toFile(file);recoveredFiles.push(file);
}
await fs.writeFile(dir+'/recovered.rgb',Buffer.concat(rgb));
execFileSync('ffmpeg',['-v','error','-f','rawvideo','-pixel_format','rgb24','-video_size','512x512','-framerate','20','-i',dir+'/recovered.rgb','-c:v','libx264','-crf','12','-pix_fmt','yuv420p','-y',dir+'/recovered.mp4']);
const input={video:'data:video/mp4;base64,'+(await fs.readFile(dir+'/recovered.mp4')).toString('base64'),target_resolution:'720p',target_fps:20};
try{const previous=JSON.parse(await fs.readFile(dir+'/topaz-recovered.prediction.json'));if(JSON.stringify(previous.input)!==JSON.stringify(input))throw Error('Cached prediction input changed; use a new trial key');}catch(error){if(error.code!=='ENOENT')throw error;}
const prediction=await predict({dir,key:'topaz-recovered',model:'topazlabs/video-upscale',input});
await downloadPrediction(prediction,dir+'/topaz-recovered.mp4');
const meta=probe(dir+'/topaz-recovered.mp4');if(+meta.nb_frames!==90||meta.r_frame_rate!=='20/1')throw Error('Provider changed frame count or speed');
execFileSync('ffmpeg',['-v','error','-i',dir+'/topaz-recovered.mp4','-vf','scale=512:512:flags=lanczos','-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgb24','-y',dir+'/topaz-recovered.rgb']);
const enhanced=await fs.readFile(dir+'/topaz-recovered.rgb'),frameBytes=512*512*3,frameFiles=[];
for(let i=0;i<90;i++){
 const alpha=await sharp(original.frames[i],{raw:{width:64,height:64,channels:4}}).resize(512,512).extractChannel(3).toBuffer();
 const file=dir+'/enhanced-'+i+'.webp';await sharp(enhanced.subarray(i*frameBytes,(i+1)*frameBytes),{raw:{width:512,height:512,channels:3}}).joinChannel(alpha,{raw:{width:512,height:512,channels:1}}).webp({lossless:true}).toFile(file);frameFiles.push(file);
}
for(const [name,files] of [['source-recovered',recoveredFiles],['topaz-recovered',frameFiles]]){
 const master=dir+'/'+name+'-lossless.webp';
 await muxAnimation({frameFiles:files,width:512,height:512,delays:original.delays,loop:original.loop},master);
 await sharp(master,{animated:true}).webp({quality:90,alphaQuality:100,effort:4,loop:original.loop,delay:original.delays}).toFile(out+'/'+name+'.webp');
 for(const size of [64,128,256]){
  const target=out+'/'+name+'-'+size+'.webp';
  for(const quality of size===128?[90,80,70,60]:[90]){
   await sharp(master,{animated:true}).resize(size,size).webp({quality,alphaQuality:100,effort:4,loop:original.loop,delay:original.delays}).toFile(target);
   if(size!==128||(await fs.stat(target)).size<=128*1024)break;
  }
 }
}
await fs.copyFile(source,out+'/original.webp');
const hash=b=>createHash('sha256').update(b).digest('hex');
await fs.writeFile(out+'/manifest.json',JSON.stringify({status:'pending-human-review',source,sourceSha256:hash(await fs.readFile(source)),reference:{page:'https://gifdb.com/gif/sprinting-dorian-harewood-severance-xn70h4nn6wn6ym9n.html',url:referenceUrl,sha256:hash(await fs.readFile(reference)),...refMeta},mapping,frames:90,delays:original.delays,loop:original.loop,alpha:'Original alpha reapplied frame by frame; the source itself is opaque.',crop:'Centered square matching the original composition',model:'topazlabs/video-upscale',prediction:{id:prediction.id,status:prediction.status,metrics:prediction.metrics,input:{target_resolution:'720p',target_fps:20}},candidates:await Promise.all(['source-recovered','topaz-recovered'].map(async name=>({name,file:name+'.webp',sha256:hash(await fs.readFile(out+'/'+name+'.webp'))})))},null,2)+'\n');
console.log('Staged recovered-source and Topaz candidates; production unchanged.');
