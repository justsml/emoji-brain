import fs from 'node:fs/promises';import {readFileSync} from 'node:fs';import {parseEnv,promisify} from 'node:util';import {execFile} from 'node:child_process';import path from 'node:path';
const exec=promisify(execFile),e={...parseEnv(readFileSync('.env','utf8')),...process.env};
export async function openrouterImage({dir,key,prompt,references,resolution='1K',aspectRatio='1:1'}){
 await fs.mkdir(dir,{recursive:true});const file=path.join(dir,key+'.png'),receipt=path.join(dir,key+'.openrouter.json');
 try{await fs.access(file);return {file,...JSON.parse(await fs.readFile(receipt).catch(()=> '{}'))}}catch(error){if(error.code!=='ENOENT')throw error}
 const request=path.join(dir,'.'+key+'.request.json');
 await fs.writeFile(request,JSON.stringify({model:'google/gemini-3-pro-image',prompt,resolution,aspect_ratio:aspectRatio,input_references:references.map(url=>({type:'image_url',image_url:{url}}))}));
 let raw;try{raw=(await exec('curl',['-sS','--max-time','240','-H','Authorization: Bearer '+(e.OPENROUTER_API_KEY||e.OPENROUTER_AI_KEY),'-H','Content-Type: application/json','--data-binary','@'+request,'https://openrouter.ai/api/v1/images'],{maxBuffer:32*1024*1024})).stdout}catch(error){throw Error('OpenRouter transport failed: '+String(error.stderr??error.code))}finally{await fs.unlink(request)}
 const r=JSON.parse(raw);if(!r.data?.[0]?.b64_json){await fs.writeFile(path.join(dir,key+'.error.json'),JSON.stringify(r,null,2));throw Error(r.error?.message??'No generated image')}
 await fs.writeFile(file+'.tmp',Buffer.from(r.data[0].b64_json,'base64'));await fs.rename(file+'.tmp',file);
 const record={provider:'OpenRouter',model:'google/gemini-3-pro-image',created:r.created,usage:r.usage,resolution,aspectRatio,prompt};await fs.writeFile(receipt,JSON.stringify(record,null,2));console.log(key,'OpenRouter image complete');return {file,...record};
}
