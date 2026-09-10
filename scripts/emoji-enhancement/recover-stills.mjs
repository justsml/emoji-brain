import fs from 'node:fs/promises';import path from 'node:path';import sharp from 'sharp';
import {localMatte,closeLocalMatte} from './local-matte.mjs';
import {openrouterImage} from './openrouter-image.mjs';import {predict,downloadPrediction,pngURI} from './replicate.mjs';
const previous='experiments/image-enhancement/remaining-stills',dir='experiments/image-enhancement/remaining-recovery';await fs.mkdir(dir,{recursive:true});
const rows=JSON.parse(await fs.readFile(previous+'/summary.json')),selected=JSON.parse(await fs.readFile(previous+'/selection.json'));
if(rows.length!==selected.length&&!process.argv.includes('--partial'))throw Error('Wait for original batch completion');
const results=JSON.parse(await fs.readFile(dir+'/summary.json').catch(()=> '[]')).filter(r=>r.status==='succeeded'||/blocked|moderation|sensitive/i.test(r.error??''));
const queue=rows.filter(r=>r.status!=='succeeded'&&!/canceled/i.test(r.error??'')&&!['fry','fry_take_my_money'].includes(r.name)&&!results.some(done=>done.name===r.name));
async function one(row){const d=path.join(dir,row.name);await fs.mkdir(d,{recursive:true});const plan=JSON.parse(await fs.readFile(previous+'/'+row.name+'.prompt-plan.json'));await fs.writeFile(dir+'/'+row.name+'.prompt-plan.json',JSON.stringify(plan,null,2));let genFile=previous+'/'+row.name+'.generated.png',reused=true,receipt;
 try{await fs.access(genFile)}catch{const m=await sharp(row.source).metadata();const ratios=['1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9'];const ratio=ratios.sort((a,b)=>{const f=s=>s.split(':').reduce((x,y)=>x/y);return Math.abs(Math.log(f(a)/(m.width/m.height)))-Math.abs(Math.log(f(b)/(m.width/m.height)))})[0];receipt=await openrouterImage({dir:d,key:'generated',prompt:plan.prompt,references:['data:image/webp;base64,'+(await fs.readFile(row.source)).toString('base64')],aspectRatio:ratio});genFile=receipt.file;reused=false;}
 await fs.copyFile(genFile,dir+'/'+row.name+'.generated.png');
 const output=dir+'/'+row.name+'.transparent.png';let matte={id:null};
 if(process.argv.includes('--local-matte'))await localMatte(genFile,output);
 else{matte=await predict({dir:d,key:'matte',model:'bria/remove-background',input:{image:await pngURI(genFile),preserve_alpha:true}});await downloadPrediction(matte,output);}
 await sharp(output).webp({lossless:true}).toFile(dir+'/'+row.name+'.enhanced.webp');
 return {name:row.name,source:row.source,status:'succeeded',route:(reused?'reused completed generation':'Nano Banana Pro via OpenRouter')+' + '+(process.argv.includes('--local-matte')?'local BiRefNet':'Bria'),matteId:matte.id,openrouterUsage:receipt?.usage??null,priorFailure:row.error};
}
async function worker(){while(queue.length){const r=queue.shift();try{results.push(await one(r))}catch(e){results.push({...r,error:String(e).replace(/Bearer\s+[^\s]+/g,'Bearer [REDACTED]')});console.log('ERROR',r.name,String(e).replace(/Bearer\s+[^\s]+/g,'Bearer [REDACTED]'))}await fs.writeFile(dir+'/summary.json',JSON.stringify(results,null,2))}}
await Promise.all(Array.from({length:5},()=>worker()));console.log('Recovered',results.filter(r=>r.status==='succeeded').length,'/',results.length);

closeLocalMatte();
