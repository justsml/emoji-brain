import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {highestSlackCompatible} from './slack-compatibility.mjs';
import {maxMeanAlphaError} from './alpha-fidelity.mjs';
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
// Archived enhancement candidates must not resurrect removed catalog entries.
const catalogNames=new Set((await fs.readdir('public/emojis')).filter(f=>f.endsWith('.webp')).map(f=>f.slice(0,-5)));
for(const name of sources.keys())if(!catalogNames.has(name))sources.delete(name);
sources.set('extreme-teamwork',{source:'public/emojis/extreme-teamwork.webp',basis:'background-cleaned'});
sources.set('severance-running',{source:'public/emojis/severance-running.webp',basis:'original-awaiting-review'});
const revisit=JSON.parse(await fs.readFile(`${staging}/severance-running-revisit/manifest.json`));
if(revisit.status==='approved-promoted'){
 const source=`${staging}/severance-running-revisit/${revisit.approval.candidate}`;
 if(createHash('sha256').update(await fs.readFile(source)).digest('hex')!==revisit.approval.approvedSha256)throw Error('Approved Severance candidate changed');
 sources.set('severance-running',{source,basis:'enhanced-approved'});
}
await fs.mkdir(root,{recursive:true});
let previous;try{previous=JSON.parse(await fs.readFile(root+'/manifest.json'))}catch{}
// 127 KB, not Slack's stated 128 KB: the cap is the point at which an upload is
// refused outright, so the catalog keeps a kilobyte of headroom against it.
const manifest={version:2,settings:{webpQuality:90,alphaQuality:100,sizes:[64,128,256],previewSizes:[64,128,256],slackTargetBytes:127000,slackFallbackSize:32},items:{...previous?.items}};
const slackCap=manifest.settings.slackTargetBytes;
// Tried in order, stopping at the first result inside the cap. Quality never
// drops below 80 — past that the artwork visibly degrades — so the last resort
// is a slower encode at the same quality rather than a cheaper-looking one.
const encodeAttempts=[{quality:90,effort:4},{quality:85,effort:4},{quality:80,effort:4},{quality:80,effort:6}];
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
  for(const {quality,effort} of encodeAttempts){
   output=await writeImage(sharp(data,{raw}),`/emoji-delivery/${size}/${name}.webp`,quality,{effort,loop:m.loop??0,delay:m.delay,minSize:true,mixed:true});
   if(output.bytes<=slackCap)break;
  }
  entry.variants[size]={webp:output};
 }
 // A last rung, cut only for the handful of long animations that cannot reach
 // the cap at 64px. Generating it for the whole catalog would be 352 files
 // nothing would ever ask for.
 if(entry.variants[64].webp.bytes>slackCap){
  const cached=prior?.variants[32]?.webp;
  if(await exists(cached))entry.variants[32]={webp:cached};
  else{
   changed=true;
   const {data}=await sharp(bytes,{animated:true}).resize(32,32,resize).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   const raw={width:32,height:32*(m.pages??1),channels:4,pageHeight:32};
   let output;
   // The fallback rung is pushed hardest, so it is accepted only when it is
   // both inside the cap and faithful: encoders are not monotonic in quality,
   // and a larger file here can carry cleaner alpha than a smaller one.
   for(const {quality,effort} of encodeAttempts){
    output=await writeImage(sharp(data,{raw}),`/emoji-delivery/32/${name}.webp`,quality,{effort,loop:m.loop??0,delay:m.delay,minSize:true,mixed:true});
    if(output.bytes>slackCap)continue;
    if(await maxMeanAlphaError(bytes,await fs.readFile('public'+output.path),32,resize.kernel)<=0.5)break;
   }
   entry.variants[32]={webp:output};
  }
 }
 for(const size of [64,128,256]){
  const cached=prior?.previews?.[size];
  if(await exists(cached)){entry.previews[size]=cached;continue;}
  changed=true;
  entry.previews[size]=await writeImage(sharp(bytes,{page:0,pages:1}).resize(size,size,resize),`/emoji-delivery/previews/${size}/${name}.webp`,90);
 }
 entry.highestSlackCompatible=highestSlackCompatible(entry.variants,slackCap);
 if(await exists(prior?.original)){entry.original=prior.original;}else{
  changed=true;
  entry.original={...await writeImage(sharp(bytes,{animated:true}),`/emoji-delivery/original/${name}.webp`,90,{loop:m.loop??0,delay:m.delay,mixed:true}),width:m.width,height:m.pageHeight??m.height};
 }
 manifest.items[name]=entry;
 await fs.writeFile(root+'/manifest.json.tmp',JSON.stringify(manifest,null,2)+'\n');await fs.rename(root+'/manifest.json.tmp',root+'/manifest.json');
 if(changed){processed++;console.log('DELIVERY',name);}
}
console.log('BATCH COMPLETE',processed,'encoded; catalog',Object.keys(manifest.items).length);
