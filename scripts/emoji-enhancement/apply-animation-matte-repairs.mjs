import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
process.env.VIPS_DISC_THRESHOLD ??= '1073741824';
const {default:sharp}=await import('sharp');
sharp.concurrency(2);sharp.cache({memory:32,files:0,items:16});
const root='staging/emoji-enhancements/animation-matte-repair';
const receiptFile='scripts/emoji-enhancement/animation-matte-repairs.json';
let manifest;
try{manifest=JSON.parse(await fs.readFile(root+'/manifest.json'));}
catch(error){if(error.code!=='ENOENT')throw error;manifest=JSON.parse(await fs.readFile(receiptFile));}
const apply=process.argv.includes('--apply');
if(apply&&manifest.status==='applied')throw Error('Repair already applied; start a separate revision instead of overwriting its provenance');
const hash=b=>createHash('sha256').update(b).digest('hex');
if(manifest.items.length!==12)throw Error('Expected all twelve repair candidates');
const metadataFile='src/data/emoji-metadata.json';
const catalog=JSON.parse(await fs.readFile(metadataFile));
const historical=JSON.parse(await fs.readFile('staging/emoji-enhancements/remaining-animations/manifest.json'));
// Validate the whole batch before replacing any masters.
for(const r of manifest.items) {
  const name=r.name,oldName=name==='meow-hearts'?'cat-meow-hearts':name;
  const priorPath=`staging/emoji-enhancements/remaining-animations/${historical.items.find(x=>x.name===oldName).candidate}`;
  const prior=await fs.readFile(priorPath),production=await fs.readFile(`public/emojis/${name}.webp`);
  let candidate;
  try{candidate=await fs.readFile(`${root}/${r.candidate}`);}
  catch(error){if(error.code!=='ENOENT'||r.status!=='applied')throw error;candidate=production;}
  if(hash(prior)!==r.priorSha256||hash(candidate)!==r.candidateSha256)throw Error('Changed master/candidate: '+name);
  if(hash(production)!==(r.status==='applied'?r.candidateSha256:r.priorSha256))throw Error('Concurrent production change: '+name);
  const before=await sharp(prior,{animated:true}).metadata(),after=await sharp(candidate,{animated:true}).metadata();
  if(before.width!==after.width||before.pageHeight!==after.pageHeight||before.pages!==after.pages||JSON.stringify(before.delay)!==JSON.stringify(after.delay)||(before.loop??0)!==(after.loop??0))throw Error('Changed geometry/timeline: '+name);
  const old=await sharp(prior,{animated:true}).ensureAlpha().raw().toBuffer(),next=await sharp(candidate,{animated:true}).ensureAlpha().raw().toBuffer();
  let unchangedOpaquePixels=0,removedOpaqueEdgePixels=0,alphaChanges=0;
  for(let p=0;p<old.length;p+=4) {
    if(old[p+3]===255&&next[p+3]>0){if(old[p]!==next[p]||old[p+1]!==next[p+1]||old[p+2]!==next[p+2])throw Error('Changed visible opaque artwork RGB: '+name);unchangedOpaquePixels++;}
    if(old[p+3]===255&&next[p+3]===0){
      // Lossless encoders discard invisible RGB. A removed formerly opaque
      // pixel must be near the original matte edge, never a subject interior.
      const pixel=p/4,frame=Math.floor(pixel/(before.width*before.pageHeight)),local=pixel%(before.width*before.pageHeight),x=local%before.width,y=Math.floor(local/before.width);
      let edge=false;
      for(let dy=-8;dy<=8&&!edge;dy++)for(let dx=-8;dx<=8;dx++){
        const xx=x+dx,yy=y+dy;
        if(xx<0||xx>=before.width||yy<0||yy>=before.pageHeight||old[(frame*before.width*before.pageHeight+yy*before.width+xx)*4+3]<255){edge=true;break;}
      }
      if(!edge)throw Error('Erased opaque interior: '+name);
      removedOpaqueEdgePixels++;
    }
    if(old[p+3]!==next[p+3])alphaChanges++;
  }
  if(alphaChanges===0||r.maxCoverageChange>.015)throw Error('No safe matte improvement: '+name);
  r.priorMaster=priorPath;
  r.validation={frames:after.pages,geometryAndTimelineExact:true,visibleOpaqueRGBExact:true,unchangedOpaquePixels,removedOpaqueEdgePixels,alphaChanges,maxCoverageChange:r.maxCoverageChange};
  console.log('VALID',name,after.pages,'frames; visible opaque artwork RGB and timeline exact');
}
if(apply) {
  for(const r of manifest.items) {
    const file=`public/emojis/${r.name}.webp`,candidate=await fs.readFile(`${root}/${r.candidate}`);
    // Historical approved candidates are byte-identical backups of the prior
    // masters and remain unchanged; the manifest retains their paths/hashes.
    await fs.writeFile(file+'.tmp',candidate);await fs.rename(file+'.tmp',file);
    await sharp(candidate,{page:0,pages:1}).resize({width:256,height:256,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toFile(`public/emojis/still/${r.name}.webp`);
    const entry=catalog.emojis.find(e=>e.filename===r.name+'.webp');
    entry.labelProvenance={method:'carried-forward-after-requested-matte-repair',fromHash:entry.labelHash??entry.hash,repairReceipt:receiptFile};
    Object.assign(entry,{hash:r.candidateSha256,labelHash:r.candidateSha256,size:candidate.length,width:r.width,height:r.height,modified:(await fs.stat(file)).mtime.toISOString()});
    r.status='applied';
  }
  manifest.status='applied';manifest.authorization={userRequest:'Fix the twelve animation masters',appliedAt:new Date().toISOString()};
  catalog.lastUpdated=new Date().toISOString();
  await fs.writeFile(metadataFile,JSON.stringify(catalog,null,2)+'\n');
}
await fs.mkdir(root,{recursive:true});
await fs.writeFile(root+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
if(manifest.status==='applied'){
  // Persist the source-selection receipt outside the ignored staging tree.
  const durable={...manifest,items:manifest.items.map(({frameFiles,...r})=>r)};
  await fs.writeFile(receiptFile,JSON.stringify(durable,null,2)+'\n');
}
console.log(apply?'Applied twelve requested repairs; prior masters retained.':'Validated all twelve repairs; production unchanged.');
