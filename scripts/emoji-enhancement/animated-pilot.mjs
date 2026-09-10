import fs from 'node:fs/promises';import path from 'node:path';import sharp from 'sharp';
import {decodeAnimation,encodeAnimation,resizeFrames} from './animation-frames.mjs';
import {predict,downloadPrediction,pngURI} from './replicate.mjs';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {whiteBackgroundMatte} from './white-background-matte.mjs';
const exec=promisify(execFile);
import {openrouterImage} from './openrouter-image.mjs';
import {repairInteriorAlpha} from './repair-interior-alpha.mjs';
const dir=path.resolve('experiments/image-enhancement/animated-pilot');await fs.mkdir(dir,{recursive:true});
const specs=[
 ['meow_bongotap','Two alternating yellow meow cat paw-tap poses. Preserve paw positions, BLACK eyes, BLACK mouth, BLACK whiskers and exact tiny red motion marks. Never turn dark facial features white.',false],
 ['panda-omg','Two poses of the same gray and white surprised panda with large dark eyes and long pink tongue.',false],
 ['bongo-cat','Two poses of the white outlined Bongo Cat with tiny pink paw pads. Preserve which paw is raised in each frame.',false],
 ['thankyou','Two frames of the same pink outlined lettering: THANK on top and YOU below. Exact case and spelling; preserve pulsing size difference.',false],
 ['awkward','Two poses of the same red-brown cartoon monkey awkwardly glancing; preserve each eye position and green shirt collar.',false],
 ['clapclap-e','Three poses of the same simple white outlined smiling stick figure clapping. Preserve the exact hand positions in each frame.',false],
 ['this_is_fine','Four frames of the same cartoon dog in a hat sitting in flames. Preserve all flames and frame-specific changes, original expression and warm palette. No added text.',false],
 ['meow_hyper_think','Six frames of the yellow thinking meow cat, hand on chin, with INTENTIONAL directional motion blur and jitter. Preserve the softness, trails and per-frame displacement. Do not stabilize or sharpen away the effect.',true],
 ['meow_bread_disappear','Six frames of a yellow meow cat gradually disappearing behind a slice of bread. Preserve exactly how much cat is occluded in each frame, and the stationary bread geometry.',false],
 ['eyetwitch','Seven frames of the same yellow smiley with uneven white eyes, tiny pupils, horizontal orange mouth and twitching eyelid. Preserve the small differences and their order.',false],
 ['roo-aww-intensifies','Nine cropped close-up frames of the same cream-and-gray roo panda with huge dark eyes and open pink mouth. Preserve exact shake offsets, zoom, frame crop and intensity; never center or stabilize the character.',true],
 ['meow-devil-intensifies','Ten frames of the red devil meow cat with horns and wicked expression. Preserve the jitter, blurred outlines and ghosting exactly; no stabilization.',true]
].map(([name,subject,effect])=>({name,subject,effect}));
const selected=process.argv[2]?specs.filter(s=>process.argv[2].split(',').includes(s.name)):specs;

async function processOne(spec){
 const d=path.join(dir,spec.name);await fs.mkdir(d,{recursive:true});
 const original=await decodeAnimation('public/emojis/'+spec.name+'.webp');
 if(spec.name==='panda-omg')for(let i=0;i<original.frames.length;i++){const input=path.join(d,'source-frame-'+i+'.png'),output=path.join(d,'source-frame-'+i+'-alpha.png');await sharp(original.frames[i],{raw:{width:original.width,height:original.height,channels:4}}).png().toFile(input);await whiteBackgroundMatte(input,output);original.frames[i]=await sharp(output).ensureAlpha().raw().toBuffer();}
 const baseline=await resizeFrames(original,512);await encodeAnimation(baseline,path.join(d,'baseline.webp'));
 const normalized=await resizeFrames(original,128),cols=Math.ceil(Math.sqrt(original.frames.length)),rows=Math.max(2,Math.ceil(original.frames.length/cols)),cell=160,pad=16;
 const atlasFile=path.join(d,'source-atlas.png'),composites=[];
 for(let i=0;i<normalized.frames.length;i++)composites.push({input:await sharp(normalized.frames[i],{raw:{width:128,height:128,channels:4}}).png().toBuffer(),left:(i%cols)*cell+pad,top:Math.floor(i/cols)*cell+pad});
 await sharp({create:{width:cols*cell,height:rows*cell,channels:4,background:'#00000000'}}).composite(composites).png().toFile(atlasFile);
 const whiteAtlas=path.join(d,'source-white.png');await sharp(atlasFile).flatten({background:'white'}).png().toFile(whiteAtlas);
 const restored={id:null},esrganFile=path.join(d,spec.name==='panda-omg'?'esrgan-atlas-alpha-v2.png':'esrgan-atlas.png');
 try{await fs.access(esrganFile)}catch{await exec(process.env.EMOJI_MATTE_PYTHON??'/tmp/emoji-enhancement-venv/bin/python',['scripts/emoji-enhancement/local-upscale.py',whiteAtlas,esrganFile,'/tmp/emoji-models/realesr-animevideov3.pth'],{maxBuffer:1024*1024});}
 const blackAtlas=path.join(d,'source-black.png'),blackRestored=path.join(d,spec.name==='panda-omg'?'esrgan-black-atlas-alpha-v2.png':'esrgan-black-atlas.png');await sharp(atlasFile).flatten({background:'black'}).png().toFile(blackAtlas);
 try{await fs.access(blackRestored)}catch{await exec(process.env.EMOJI_MATTE_PYTHON??'/tmp/emoji-enhancement-venv/bin/python',['scripts/emoji-enhancement/local-upscale.py',blackAtlas,blackRestored,'/tmp/emoji-models/realesr-animevideov3.pth'],{maxBuffer:1024*1024});}
 const esrganFrames=[],tunedFrames=[];
 for(let i=0;i<baseline.frames.length;i++){
  const {data}=await sharp(esrganFile).extract({left:(i%cols)*cell*4+pad*4,top:Math.floor(i/cols)*cell*4+pad*4,width:512,height:512}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const black=await sharp(blackRestored).extract({left:(i%cols)*cell*4+pad*4,top:Math.floor(i/cols)*cell*4+pad*4,width:512,height:512}).ensureAlpha().raw().toBuffer();
  const base=baseline.frames[i],tuned=Buffer.alloc(data.length),mix=spec.effect?.2:1;
  for(let p=0;p<data.length;p+=4){const diffs=[0,1,2].map(c=>data[p+c]-black[p+c]).sort((a,b)=>a-b);let a=Math.max(0,Math.min(1,1-diffs[1]/255));if(a<.02)a=0;if(a>.98)a=1;for(let c=0;c<3;c++){const color=a>0?Math.max(0,Math.min(255,black[p+c]/a)):base[p+c];data[p+c]=Math.round(color);tuned[p+c]=Math.round(base[p+c]*(1-mix)+color*mix)}data[p+3]=Math.round(a*255);tuned[p+3]=spec.effect?base[p+3]:data[p+3];}
  esrganFrames.push(data);tunedFrames.push(tuned);
 }
 await encodeAnimation({...baseline,frames:esrganFrames},path.join(d,'esrgan.webp'));
 await encodeAnimation({...baseline,frames:tunedFrames},path.join(d,'tuned.webp'));
 const baseResult={...spec,source:'public/emojis/'+spec.name+'.webp',frames:original.frames.length,delays:original.delays,loop:original.loop,duration:original.delays.reduce((a,b)=>a+b,0),width:512,height:512,sourceMatte:spec.name==='panda-omg'?'Embedded white background removed before restoration':null,restorationModel:'realesr-animevideov3 (local official weights)',mattingModel:'bria/remove-background',status:'partial',nanoStatus:'pending',approval:'pending',tuning:spec.effect?'20% restoration + 80% original upscale; original alpha retained':'Dual-background restoration; alpha estimated from black/white passes'};await fs.writeFile(path.join(d,'result.json'),JSON.stringify(baseResult,null,2));
 const prompt=`Restore this animation sprite sheet as ONE precisely aligned image, keeping the exact ${cols}-column by ${rows}-row grid. Each cell is a separate animation frame. Preserve every frame in row-major order, all blank trailing cells, the existing padding and subject position within each cell. Do not add panels, borders, labels, text, frames or gutters. Do not merge poses or repeat one pose in every cell. This is image restoration, not a newly composed collage. ${spec.subject} Preserve the same drawing style and character anatomy; clean unwanted pixelation without adding detail, gradients or texture absent from the source. Preserve the exact color of every region, including dark facial marks and any white interiors; never recolor eyes or outlines. Leave uniform white outside the artwork. The sheet will be split at EXACT equal cell boundaries, so alignment, size and original margins must remain unchanged.`;
 const nanoPrompt=prompt+(spec.name==='eyetwitch'?' IMPORTANT: This source is NOT intentional pixel art. Reconstruct a smooth circular yellow smiley with a continuous clean dark outline, crisp white eyes and small black pupils, and a straight dark orange horizontal mouth. Remove ALL blocky compression, stair-step contours and grid-like artifacts. Preserve the twitching eyelid differences and exact pose placement in all seven cells.':'');
 const nano=await openrouterImage({dir:d,key:['meow_bongotap','eyetwitch'].includes(spec.name)?'nano-generated-v2':'nano-generated',prompt:nanoPrompt,references:[await pngURI(whiteAtlas)],resolution:'2K',aspectRatio:cols===rows?'1:1':cols===3&&rows===2?'3:2':'4:3'});
 const nanoFile=nano.file;
 const matteFile=path.join(d,['meow_bongotap','eyetwitch'].includes(spec.name)?'nano-matte-v2.png':'nano-matte.png');let matte={id:null},mattingModel='bria/remove-background';
 try{matte=await predict({dir:d,key:['meow_bongotap','eyetwitch'].includes(spec.name)?'nano-matte-v2':'nano-matte',model:'bria/remove-background',input:{image:await pngURI(nanoFile),preserve_alpha:true}});await downloadPrediction(matte,matteFile)}catch(error){if(!String(error).includes('402'))throw error;mattingModel='border-connected white removal (Replicate 402 fallback)';await whiteBackgroundMatte(nanoFile,matteFile)}
 const alphaFile=path.join(d,'nano-alpha.png');const alphaRepair=await repairInteriorAlpha({source:atlasFile,generated:nanoFile,matte:matteFile,output:alphaFile});
 const m=await sharp(alphaFile).metadata(),cw=m.width/cols,ch=m.height/rows,nanoFrames=[];
 for(let i=0;i<baseline.frames.length;i++){
  const left=Math.round((i%cols)*cw+pad/cell*cw),top=Math.round(Math.floor(i/cols)*ch+pad/cell*ch),width=Math.round(128/cell*cw),height=Math.round(128/cell*ch);
  let frame=await sharp(alphaFile).extract({left,top,width,height}).resize(512,512).ensureAlpha().raw().toBuffer();
  if(spec.name==='meow-devil-intensifies'&&mattingModel.startsWith('border-connected')){const frameInput=path.join(d,'nano-frame-'+i+'.png'),frameOutput=path.join(d,'nano-frame-'+i+'-alpha.png');await sharp(frame,{raw:{width:512,height:512,channels:4}}).png().toFile(frameInput);await whiteBackgroundMatte(frameInput,frameOutput);frame=await sharp(frameOutput).ensureAlpha().raw().toBuffer();}
  // Sharp morphology uses dark foreground; erode expands white alpha coverage.
  if(spec.name==='thankyou'){const mask=await sharp(frame,{raw:{width:512,height:512,channels:4}}).extractChannel('alpha').raw().toBuffer();const alpha=await sharp(mask,{raw:{width:512,height:512,channels:1}}).erode(10).blur(.6).toColourspace('b-w').raw().toBuffer();const sticker=Buffer.alloc(frame.length,255);for(let p=0;p<alpha.length;p++)sticker[p*4+3]=alpha[p];frame=await sharp(sticker,{raw:{width:512,height:512,channels:4}}).composite([{input:frame,raw:{width:512,height:512,channels:4}}]).raw().toBuffer();}
  nanoFrames.push(frame);
 }
 await encodeAnimation({...baseline,frames:nanoFrames},path.join(d,'nano.webp'));
 const result={...spec,source:'public/emojis/'+spec.name+'.webp',frames:original.frames.length,delays:original.delays,loop:original.loop,duration:original.delays.reduce((a,b)=>a+b,0),width:512,height:512,atlas:{cols,rows,pad,cell},sourceMatte:spec.name==='panda-omg'?'Embedded white background removed before restoration':null,restorationModel:'realesr-animevideov3 (local official weights)',mattingModel,nanoModel:nano.model,nanoProvider: nano.provider,nanoUsage:nano.usage,nanoCreated:nano.created,mattePredictionId:matte.id,alphaRepair,stickerBorder:spec.name==='thankyou'?'10px white border reconstructed after matting':null,prompt:nano.prompt??nanoPrompt,status:'complete',approval:'pending',tuning:spec.effect?'20% restoration + 80% original upscale; original alpha retained':'Dual-background Real-ESRGAN; alpha estimated from black/white passes'};
 await fs.writeFile(path.join(d,'result.json'),JSON.stringify(result,null,2));console.log(spec.name,'complete');return result;
}
const queue=[...selected],results=[];async function worker(){while(queue.length){const s=queue.shift();try{results.push(await processOne(s))}catch(e){console.log('ERROR',s.name,String(e));let partial;try{partial=JSON.parse(await fs.readFile(path.join(dir,s.name,'result.json')))}catch{}if(partial){partial={...partial,status:'partial',nanoStatus:'failed',error:String(e)};await fs.writeFile(path.join(dir,s.name,'result.json'),JSON.stringify(partial,null,2));results.push(partial)}else results.push({name:s.name,status:'failed',error:String(e)})}}}
await Promise.all([worker(),worker(),worker()]);
await fs.writeFile(path.join(dir,'run-summary.json'),JSON.stringify(results,null,2));console.log('Pilot complete',results.length);

