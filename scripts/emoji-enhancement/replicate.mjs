import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {parseEnv,promisify} from 'node:util';
import {execFile} from 'node:child_process';
import path from 'node:path';
const exec=promisify(execFile);
const env={...parseEnv(readFileSync('.env','utf8')),...process.env};
const token=env.REPLICATE_API_TOKEN||env.REPLICATE_API_KEY;
if(!token)throw Error('Missing Replicate credential');
let createQueue=Promise.resolve(),lastCreate=0;
async function rateSlot(){let release;const previous=createQueue;createQueue=new Promise(r=>release=r);await previous;const delay=Math.max(0,12000-(Date.now()-lastCreate));if(delay)await new Promise(r=>setTimeout(r,delay));lastCreate=Date.now();release();}
async function api(route,body,dir){
 if(body)await rateSlot();
 const args=['-fsS','--max-time','60','-H','Authorization: Bearer '+token,'-H','Content-Type: application/json'];let file;
 if(body){file=path.join(dir,'.request-'+crypto.randomUUID()+'.json');await fs.writeFile(file,JSON.stringify(body));args.push('--data-binary','@'+file)}
 try{for(let attempt=0;attempt<8;attempt++){try{return JSON.parse((await exec('curl',[...args,'https://api.replicate.com/v1/'+route],{maxBuffer:16*1024*1024})).stdout)}catch(error){if(String(error.stderr).includes('429')&&attempt<7){await new Promise(r=>setTimeout(r,15000));if(body)await rateSlot();continue;}throw Error('Replicate transport failed: '+String(error.stderr??error.code));}}}finally{if(file)await fs.unlink(file)}
}
async function save(file,value){await fs.writeFile(file+'.tmp',JSON.stringify(value,null,2));await fs.rename(file+'.tmp',file)}
export async function predict({dir,key,model,version,input}){
 await fs.mkdir(dir,{recursive:true});const file=path.join(dir,key+'.prediction.json');let r;
 try{r=JSON.parse(await fs.readFile(file))}catch(error){if(error.code!=='ENOENT')throw error;r=await api(version?'predictions':`models/${model}/predictions`,version?{version,input}:{input},dir);await save(file,r)}
 if(!r.id)throw Error(r.detail??'Prediction did not return an ID');
 for(let i=0;i<180&&!['succeeded','failed','canceled'].includes(r.status);i++){await new Promise(r=>setTimeout(r,4000));r=await api('predictions/'+r.id,undefined,dir);await save(file,r)}
 if(r.status!=='succeeded')throw Error(r.error??r.status);
 console.log(key,'succeeded');return r;
}
export async function downloadPrediction(r,file){try{await fs.access(file);return}catch{}const url=Array.isArray(r.output)?r.output[0]:r.output;await exec('curl',['-fLsS','--max-time','90',url,'-o',file+'.tmp']);await fs.rename(file+'.tmp',file)}
export async function pngURI(file){return 'data:image/png;base64,'+(await fs.readFile(file)).toString('base64')}
