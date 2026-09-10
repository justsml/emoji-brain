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
const prompt = 'Reconstruct this tiny emoji as a genuinely crisp, high-quality finished image. Use the reference for exact composition, expression, proportions, pose and colors, but redraw the blurry edges and surfaces with clean coherent detail. Do not reproduce blur, pixelation, compression artifacts or sharpening halos. Keep the same character and the same crop, filling the canvas to the same extent. Do not convert it into a sticker, add a border, change the pose or make a new scene. Do not invent readable lettering from illegible marks. For transparent areas use a uniform white background, never a checkerboard. The final should look like the original artwork before it was reduced to a tiny image, with every edge sharp at full resolution.';
const configs = [
 ['google/nano-banana-pro',u=>({image_input:[u],prompt,resolution:'1K',output_format:'png',aspect_ratio:'match_input_image',allow_fallback_model:false}),.15],
];
const jobs=[];
const overrides=existsSync(`${dir}prompt-overrides.json`)?JSON.parse(await fs.readFile(`${dir}prompt-overrides.json`)):{};
const selection=JSON.parse(await fs.readFile(`${dir}selection.json`));
for (const selected of selection) {
 const name=selected.file.split('/').pop().replace(/\.webp$/,'');
 const meta=await sharp(selected.file,{animated:true}).metadata();
 if((meta.pages??1)>1||!meta.hasAlpha)throw new Error(`Ineligible image: ${name}`);
 const original=await fs.readFile(`public/emojis/${name}.webp`);
 await fs.writeFile(`${dir}${name}.webp`,original);
 const uri=`data:image/webp;base64,${original.toString('base64')}`;
 for(const [model,input,cost] of configs){
  const key=`${name}--${model.replace('/','--')}`;
  const file=`${dir}${key}.result.json`;
  const schema=JSON.parse(await fs.readFile(`${dir}../${model.replace('/','--')}.schema.json`));
  let result;
  if(existsSync(file)) result=JSON.parse(await fs.readFile(file));
  else {
   result=model==='zsxkib/seedvr2'?api('predictions',{version:schema.latest_version.id,input:input(uri)}):api(`models/${model}/predictions`,{input:{...input(uri),...(overrides[name]?{prompt:overrides[name]}:{})}});
   await fs.writeFile(file,JSON.stringify(result,null,2));
  }
  if(model==='philz1337x/crystal-upscaler' && result.status===422){
   await fs.writeFile(file.replace('.result.json','.rejected.json'),JSON.stringify(result,null,2));
   result=api(`models/${model}/predictions`,{input:{...input(uri),...(overrides[name]?{prompt:overrides[name]}:{})}});
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
