import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {whiteBackgroundMatte} from './white-background-matte.mjs';import {muxAnimation} from './mux-animation.mjs';
// Hand-reviewed outlined artwork with plain white canvases, not photo scenes.
for(const name of ['bongo-cat-drumming','bongo-cat-jumbo','crying_bear']){
 const dir=path.join('experiments/image-enhancement/remaining-animations',name),file=dir+'/result.json',r=JSON.parse(await fs.readFile(file));if(r.status!=='complete')throw Error('Incomplete '+name);if(r.alphaPostprocess==='border-connected-white-v1'){console.log('REUSE MATTE',name);continue;}
 const outputs=new Map();for(const input of new Set(r.frameFiles)){const output=input.replace(/\.png$/,'.white-alpha.png');await whiteBackgroundMatte(input,output);outputs.set(input,output);}
 r.frameFiles=r.frameFiles.map(f=>outputs.get(f));await muxAnimation({...r,frameFiles:r.frameFiles},dir+'/candidate.webp');r.candidateSha256=createHash('sha256').update(await fs.readFile(dir+'/candidate.webp')).digest('hex');r.alphaPostprocess='border-connected-white-v1';r.plan={...r.plan,alpha:'white-background',note:r.plan.note+' Plain white canvas removed; enclosed white artwork retained.'};await fs.writeFile(file+'.tmp',JSON.stringify(r,null,2));await fs.rename(file+'.tmp',file);console.log('WHITE BACKGROUND REMOVED',name);
}
