import fs from 'node:fs/promises';import sharp from 'sharp';import {createHash} from 'node:crypto';
sharp.concurrency(2);sharp.cache({memory:32,files:0,items:16});
const batchSize=Number(process.argv.find(a=>a.startsWith('--batch-size='))?.split('=')[1]??16);let processed=0;
if(!Number.isInteger(batchSize)||batchSize<1||batchSize>32)throw Error('Batch size must be 1–32');
const root='public/emoji-delivery',staging='staging/emoji-enhancements',sources=new Map();
for(const file of await fs.readdir('public/emojis'))if(file.endsWith('.webp'))sources.set(file.slice(0,-5),{source:'public/emojis/'+file,basis:'original'});
for(const group of ['stills','animated-pilot','remaining-animations']){const m=JSON.parse(await fs.readFile(`${staging}/${group}/manifest.json`));for(const r of m.items){const name=(r.name??r.file.replace(/\.webp$/,''));const file=group==='animated-pilot'?r.variants.find(v=>v.key===r.review.preferred).file:r.candidate;sources.set(name,{source:`${staging}/${group}/${file}`,basis:'enhanced'});}}
// Revised candidate has not been approved; retain the production version for exports.
sources.set('severance-running',{source:'public/emojis/severance-running.webp',basis:'original-awaiting-review'});
const manifest={version:1,settings:{webpQuality:90,alphaQuality:100,sizes:[128,256],slackTargetBytes:128000},items:{}};await fs.mkdir(root,{recursive:true});let previous;try{previous=JSON.parse(await fs.readFile(root+'/manifest.json'))}catch{}
Object.assign(manifest.items,previous?.items??{});
for(const [name,choice] of sources){if(processed>=batchSize)break;const bytes=await fs.readFile(choice.source),sha=createHash('sha256').update(bytes).digest('hex'),m=await sharp(bytes,{animated:true}).metadata(),animated=(m.pages??1)>1,entry={...choice,sourceSha256:sha,animated,variants:{}};
 let changed=false;
 for(const size of [128,256]){const dir=`${root}/${size}`;await fs.mkdir(dir,{recursive:true});const prior=previous?.items[name];if(prior?.sourceSha256===sha&&prior.variants[size]&&!(size===128&&prior.variants[size].webp.bytes>128000&&(prior.variants[size].webp.quality??90)>60)&&await fs.access(`${dir}/${name}.webp`).then(()=>true,()=>false)){entry.variants[size]={webp:{...prior.variants[size].webp,quality:prior.variants[size].webp.quality??90}};continue;}
 changed=true;const {data}=await sharp(bytes,{animated:true}).resize(size,size,{fit:'contain',background:'#00000000',kernel:['nyancat','unikittyangry'].includes(name)?'nearest':'lanczos3'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const raw={width:size,height:size*(m.pages??1),channels:4,pageHeight:size};const image=()=>sharp(data,{raw});
 let webp,quality=90;for(const q of (size===128?[90,80,70,60]:[90])){quality=q;webp=await image().webp({quality:q,alphaQuality:100,effort:4,loop:m.loop??0,delay:m.delay,minSize:true,mixed:true}).toBuffer();if(webp.length<=128000)break;}await fs.writeFile(`${dir}/${name}.webp.tmp`,webp);await fs.rename(`${dir}/${name}.webp.tmp`,`${dir}/${name}.webp`);
 entry.variants[size]={webp:{quality,path:`/emoji-delivery/${size}/${name}.webp`,bytes:webp.length}};
 }if(changed)processed++;manifest.items[name]=entry;await fs.writeFile(root+'/manifest.json.tmp',JSON.stringify(manifest,null,2));await fs.rename(root+'/manifest.json.tmp',root+'/manifest.json');if(changed)console.log('DELIVERY',Object.keys(manifest.items).length,'/',sources.size,name);}

console.log('BATCH COMPLETE',processed,'encoded; catalog',Object.keys(manifest.items).length);
