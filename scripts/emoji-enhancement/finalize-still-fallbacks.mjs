import {restoreSource} from './restore-source.mjs';
import fs from 'node:fs/promises';import sharp from 'sharp';
const dir='experiments/image-enhancement/remaining-stills/';
const rows=JSON.parse(await fs.readFile(dir+'summary.json'));
const selected=JSON.parse(await fs.readFile(dir+'selection.json'));
const recovery=JSON.parse(await fs.readFile('experiments/image-enhancement/remaining-recovery/summary.json').catch(()=> '[]'));
if(rows.length!==selected.length)throw Error('Wait for the generation batch to finish before finalizing fallbacks');
const regressions={meow_hammer:'Generated an unwanted solid block behind the impact marks.',meow_fistbumpright:'Matting removed the white impact droplets.', 'meow-shark':'Matting damaged the white scarf; retain the original drawing.'};
for(const row of rows){
 const recovered=recovery.find(r=>r.name===row.name);
 if(recovered?.status==='succeeded'&&!regressions[row.name])continue;
 if(row.status==='succeeded'&&!regressions[row.name])continue;
 const failure=recovered?.error??row.error;
 if(!regressions[row.name]&&!/blocked|moderation|sensitive|canceled/i.test(failure??''))throw Error('Unresolved transport failure; retry missing stage: '+row.name);
 const file=dir+row.name+'.transparent.png';
 if(regressions[row.name])await sharp(row.source).resize({width:512,height:512,fit:'inside'}).png().toFile(file);else await restoreSource(row.source,file);
 const alpha=await sharp(file).ensureAlpha().extractChannel('alpha').raw().toBuffer();
 if(!alpha.includes(0)||!alpha.includes(255))throw Error('Fallback needs alpha review: '+row.name);
 await sharp(file).webp({lossless:true}).toFile(dir+row.name+'.enhanced.webp');
 if(regressions[row.name])row.qualityFallbackReason=regressions[row.name];else row.providerFailure=failure;
 delete row.error;row.status='succeeded';row.route=regressions[row.name]?'conservative (visual regression fallback)':'local Real-ESRGAN source restoration (provider fallback)';row.approval='pending';row.estimatedCost=null;
}
await fs.writeFile(dir+'summary.json',JSON.stringify(rows,null,2));
console.log('Fallbacks',rows.filter(r=>r.providerFailure||r.qualityFallbackReason).map(r=>({name:r.name,reason:r.qualityFallbackReason??r.providerFailure})));
