import fs from 'node:fs/promises';import {existsSync,readFileSync} from 'node:fs';import {parseEnv} from 'node:util';import {execFileSync} from 'node:child_process';import sharp from 'sharp';
const dir=new URL('./',import.meta.url).pathname;
const env={...parseEnv(readFileSync('.env','utf8')),...process.env};const token=env.REPLICATE_API_TOKEN||env.REPLICATE_API_KEY;
function api(route,body){const args=['-sS','--max-time','45','-H',`Authorization: Bearer ${token}`,'-H','Content-Type: application/json'];if(body)args.push('-X','POST','--data-binary','@-');return JSON.parse(execFileSync('curl',[...args,`https://api.replicate.com/v1/${route}`],{input:body?JSON.stringify(body):undefined,encoding:'utf8'}));}
const schema=JSON.parse(await fs.readFile(`${dir}bria--remove-background.schema.json`));
const jobs=JSON.parse(await fs.readFile(`${dir}jobs.json`));const active=[];
for(const job of jobs){const original=JSON.parse(await fs.readFile(job.file));if(original.status!=='succeeded')continue;
 const file=`${dir}${job.name}.bria-background-removal.json`;let r;
 if(existsSync(file))r=JSON.parse(await fs.readFile(file));else{r=api('models/bria/remove-background/predictions',{input:{image:Array.isArray(original.output)?original.output[0]:original.output,preserve_alpha:true}});await fs.writeFile(file,JSON.stringify(r,null,2));}
 active.push({name:job.name,file,result:r});console.log(job.name,r.status??r.detail);
}
for(let round=0;round<120;round++){
 let pending=0;
 for(const job of active){let r=job.result;if(r.id&&!['succeeded','failed','canceled'].includes(r.status)){r=api(`predictions/${r.id}`);job.result=r;await fs.writeFile(job.file,JSON.stringify(r,null,2));}
 if(r.status==='succeeded'&&!existsSync(`${dir}${job.name}.bria.png`)){const url=Array.isArray(r.output)?r.output[0]:r.output;execFileSync('curl',['-fLsS','--max-time','60',url,'-o',`${dir}${job.name}.transparent.download`]);await sharp(`${dir}${job.name}.transparent.download`).png().toFile(`${dir}${job.name}.bria.png`);await fs.unlink(`${dir}${job.name}.transparent.download`);console.log('Downloaded',job.name);}
 if(r.id&&!['succeeded','failed','canceled'].includes(r.status))pending++;
 }
 if(!pending)break;await new Promise(resolve=>setTimeout(resolve,5000));
}
