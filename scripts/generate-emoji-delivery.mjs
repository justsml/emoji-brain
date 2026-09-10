import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
sharp.concurrency(2);
sharp.cache({memory:32,files:0,items:16});
const batchSize=Number(process.argv.find(a=>a.startsWith('--batch-size='))?.split('=')[1]??8);
if(!Number.isInteger(batchSize)||batchSize<1||batchSize>32)throw Error('Batch size must be 1–32');
const root='public/emoji-delivery',staging='staging/emoji-enhancements',sources=new Map();
for(const file of await fs.readdir('public/emojis'))if(file.endsWith('.webp'))sources.set(file.slice(0,-5),{source:'public/emojis/'+file,basis:'original'});
for(const group of ['stills','animated-pilot','remaining-animations']){
 const m=JSON.parse(await fs.readFile(`${staging}/${group}/manifest.json`));
 for(const r of m.items){const name=r.name??r.file.replace(/\.webp$/,'');const file=group==='animated-pilot'?r.variants.find(v=>v.key===r.review.preferred).file:r.candidate;sources.set(name,{source:`${staging}/${group}/${file}`,basis:'enhanced'});}
}
sources.set('severance-running',{source:'public/emojis/severance-running.webp',basis:'original-awaiting-review'});
await fs.mkdir(root,{recursive:true});
let previous;try{previous=JSON.parse(await fs.readFile(root+'/manifest.json'))}catch{}
const manifest={version:2,settings:{webpQuality:90,alphaQuality:100,sizes:[64,128,256],previewSizes:[64,128,256],slackTargetBytes:128000},items:{...previous?.items}};
let processed=0;
async function exists(v){return v&&await fs.access('public'+v.path).then(()=>true,()=>false)}
async function writeImage(pipeline,path,quality,options={}){
 await fs.mkdir('public'+path.slice(0,path.lastIndexOf('/')),{recursive:true});
 const info=await pipeline.webp({quality,alphaQuality:100,effort:4,...options}).toFile('public'+path+'.tmp');
 await fs.rename('public'+path+'.tmp','public'+path);
 return {quality,path,bytes:info.size};
}
for(const [name,choice] of sources){
 if(processed>=batchSize)break;
 const bytes=await fs.readFile(choice.source),sha=createHash('sha256').update(bytes).digest('hex');
 const m=await sharp(bytes,{animated:true}).metadata(),prior=previous?.items[name]?.sourceSha256===sha?previous.items[name]:null;
 const entry={...choice,sourceSha256:sha,animated:(m.pages??1)>1,variants:{},previews:{}};
 const resize={fit:'contain',background:'#00000000',kernel:['nyancat','unikittyangry'].includes(name)?'nearest':'lanczos3'};
 let changed=false;
 for(const size of [64,128,256]){
  const cached=prior?.variants[size]?.webp;
  if(await exists(cached)){entry.variants[size]={webp:cached};continue;}
  changed=true;
  const {data}=await sharp(bytes,{animated:true}).resize(size,size,resize).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const raw={width:size,height:size*(m.pages??1),channels:4,pageHeight:size};
  let output;
  for(const quality of size===128?[90,80,70,60]:[90]){
   output=await writeImage(sharp(data,{raw}),`/emoji-delivery/${size}/${name}.webp`,quality,{loop:m.loop??0,delay:m.delay,minSize:true,mixed:true});
   if(output.bytes<=128000)break;
  }
  entry.variants[size]={webp:output};
 }
 for(const size of [64,128,256]){
  const cached=prior?.previews?.[size];
  if(await exists(cached)){entry.previews[size]=cached;continue;}
  changed=true;
  entry.previews[size]=await writeImage(sharp(bytes,{page:0,pages:1}).resize(size,size,resize),`/emoji-delivery/previews/${size}/${name}.webp`,90);
 }
 if(await exists(prior?.original)){entry.original=prior.original;}else{
  changed=true;
  entry.original={...await writeImage(sharp(bytes,{animated:true}),`/emoji-delivery/original/${name}.webp`,90,{loop:m.loop??0,delay:m.delay,mixed:true}),width:m.width,height:m.pageHeight??m.height};
 }
 manifest.items[name]=entry;
 await fs.writeFile(root+'/manifest.json.tmp',JSON.stringify(manifest,null,2)+'\n');await fs.rename(root+'/manifest.json.tmp',root+'/manifest.json');
 if(changed){processed++;console.log('DELIVERY',name);}
}
console.log('BATCH COMPLETE',processed,'encoded; catalog',Object.keys(manifest.items).length);
