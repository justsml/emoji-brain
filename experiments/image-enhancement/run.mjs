import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
const dir = new URL('./', import.meta.url).pathname;
const env = { ...parseEnv(readFileSync('.env', 'utf8')), ...process.env };
const token = env.REPLICATE_API_TOKEN || env.REPLICATE_API_KEY;
if (!token) throw new Error('Missing Replicate credential');
function api(route, body) {
  const args = ['-sS', '--max-time', '45', '-H', `Authorization: Bearer ${token}`, '-H', 'Content-Type: application/json'];
  if (body) args.push('-X', 'POST', '--data-binary', '@-');
  return JSON.parse(execFileSync('curl', [...args, `https://api.replicate.com/v1/${route}`], { input: body ? JSON.stringify(body) : undefined, encoding: 'utf8' }));
}
const prompt = 'Restore and enhance this tiny low-resolution emoji. Remove blur and compression artifacts; reconstruct clean, crisp edges while preserving the exact original character, facial expression, pose, composition, colors, and drawing style. Do not redesign, add objects, text, realism, or decorative detail. Preserve transparent background if present. Produce a faithful high-resolution version of this same emoji.';
const configs = [
 ['nightmareai/real-esrgan', u=>({image:u,scale:4,face_enhance:false}),.002],
 ['philz1337x/clarity-upscaler', u=>({image:u,scale_factor:4,prompt,negative_prompt:'photorealistic, redesigned, extra objects, text, different expression',creativity:.2,resemblance:1.6,dynamic:3,seed:42,output_format:'png'}),null],
 ['philz1337x/crystal-upscaler',u=>({image:u,scale_factor:4,creativity:0,output_format:'png'}),.05],
 ['topazlabs/image-upscale',u=>({image:u,upscale_factor:'4x',enhance_model:'Low Resolution V2',output_format:'png',face_enhancement:false}),.08],
 ['prunaai/p-image-edit',u=>({images:[u],prompt,seed:42,turbo:true,aspect_ratio:'match_input_image'}),.01],
 ['google/nano-banana',u=>({image_input:[u],prompt,output_format:'png',aspect_ratio:'match_input_image'}),.039],
 ['qwen/qwen-image-edit',u=>({image:u,prompt,seed:42,output_format:'png',go_fast:true}),.03],
];
const jobs=[];
for (const name of ['meow-cat','everythingisbroken']) {
 const original=await fs.readFile(`public/emojis/${name}.webp`);
 await fs.writeFile(`${dir}${name}.webp`,original);
 const uri=`data:image/webp;base64,${original.toString('base64')}`;
 for(const [model,input,cost] of configs){
  const key=`${name}--${model.replace('/','--')}`;
  const file=`${dir}${key}.result.json`;
  const schema=JSON.parse(await fs.readFile(`${dir}${model.replace('/','--')}.schema.json`));
  let result;
  if(existsSync(file)) result=JSON.parse(await fs.readFile(file));
  else {
   result=api('predictions',{version:schema.latest_version.id,input:input(uri)});
   await fs.writeFile(file,JSON.stringify(result,null,2));
  }
  if(model==='philz1337x/crystal-upscaler' && result.status===422){
   await fs.writeFile(file.replace('.result.json','.rejected.json'),JSON.stringify(result,null,2));
   result=api(`models/${model}/predictions`,{input:input(uri)});
   await fs.writeFile(file,JSON.stringify(result,null,2));
  }
  console.log(name,model,result.status||result.detail);
  jobs.push({name,model,key,file,cost,result});
 }
}
await fs.writeFile(`${dir}jobs.json`,JSON.stringify(jobs.map(({result,...j})=>j),null,2));
for(let round=0;round<120;round++){
 let pending=0;
 for(const job of jobs){
  let r=job.result;
  if(r.id && !['succeeded','failed','canceled'].includes(r.status)){
   r=api(`predictions/${r.id}`);job.result=r;await fs.writeFile(job.file,JSON.stringify(r,null,2));
   console.log(job.key,r.status);
  }
  if(r.status==='succeeded' && !existsSync(`${dir}${job.key}.png`)){
   const url=Array.isArray(r.output)?r.output[0]:r.output;
   const buffer=execFileSync('curl',['-fLsS','--max-time','60',url],{maxBuffer:32*1024*1024});
   await sharp(buffer).png().toFile(`${dir}${job.key}.png`);
  }
  if(r.id && !['succeeded','failed','canceled'].includes(r.status))pending++;
 }
 if(!pending)break;
 await new Promise(resolve=>setTimeout(resolve,5000));
}
