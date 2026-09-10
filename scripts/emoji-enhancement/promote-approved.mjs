import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const root='staging/emoji-enhancements',archive=root+'/originals';
const delivery=JSON.parse(await fs.readFile('public/emoji-delivery/manifest.json'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
await fs.mkdir(archive,{recursive:true});
try{await fs.copyFile('src/data/emoji-metadata.json',archive+'/emoji-metadata.json',fs.constants.COPYFILE_EXCL)}catch(e){if(e.code!=='EEXIST')throw e}
const receipt={userApproval:"I'm approving them, will make a few fixes later tho.",approvedAt:new Date().toISOString(),exception:'severance-running remains on its original pending the previously requested fix',items:[]};
for(const [name,row]of Object.entries(delivery.items)){
 const file=name+'.webp',target='public/emojis/'+file,backup=archive+'/'+file;
 try{await fs.copyFile(target,backup,fs.constants.COPYFILE_EXCL)}catch(e){if(e.code!=='EEXIST')throw e}
 const original=await fs.readFile(backup);
 if(name==='severance-running'){receipt.items.push({file,status:'held-original',originalSha256:hash(original)});continue;}
 const candidate=await fs.readFile(row.source);
 if(hash(candidate)!==row.sourceSha256)throw Error('Stale candidate '+name);
 if(hash(await fs.readFile(target))!==hash(candidate)){await fs.writeFile(target+'.tmp',candidate);await fs.rename(target+'.tmp',target);}
 receipt.items.push({file,status:'promoted',source:row.source,original:backup,originalSha256:hash(original),approvedSha256:hash(candidate)});
}
await fs.writeFile(root+'/promotion.json',JSON.stringify(receipt,null,2)+'\n');
// Review galleries continue to show the genuine pre-enhancement originals.
for(const group of ['stills','animated-pilot','remaining-animations']){
 const dir=root+'/'+group;
 const manifest=JSON.parse((await fs.readFile(dir+'/manifest.json','utf8')).replaceAll('public/emojis/',archive+'/'));
 manifest.promotionReceipt='../promotion.json';
 if(group==='stills'){manifest.status='approved-promoted';for(const r of manifest.items){r.approval='approved';r.approvedSha256=r.candidateSha256;}}
 await fs.writeFile(dir+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
 let html=await fs.readFile(dir+'/index.html','utf8');html=html.replaceAll('public/emojis/',archive+'/');
 if(group==='stills')html=html.replaceAll('awaiting human approval','approved and promoted').replaceAll(' · pending',' · approved').replaceAll('Production files are unchanged.','Pre-enhancement originals are archived for comparison.');
 await fs.writeFile(dir+'/index.html',html);
}
console.log('Promoted',receipt.items.filter(r=>r.status==='promoted').length,'WebPs; archived',receipt.items.length,'originals');

// The user approved a resolution/quality change to the same emoji identities.
// Carry existing semantic labels forward explicitly; no new LLM labels are claimed.
const metadataFile='src/data/emoji-metadata.json';
const catalog=JSON.parse(await fs.readFile(metadataFile));
for(const entry of catalog.emojis){
 const file='public/emojis/'+entry.filename,bytes=await fs.readFile(file),sha=hash(bytes);
 const meta=await sharp(bytes,{animated:true}).metadata();
 if(entry.hash!==sha){
  entry.labelProvenance={method:'carried-forward-after-approved-upscale',fromHash:entry.labelHash??entry.hash,approvalReceipt:root+'/promotion.json'};
  entry.labelHash=sha;
 }
 Object.assign(entry,{hash:sha,size:bytes.length,width:meta.width,height:meta.pageHeight??meta.height,animated:(meta.pages??1)>1,modified:(await fs.stat(file)).mtime.toISOString()});
 if(entry.animated)await sharp(bytes).resize({width:256,height:256,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toFile('public/emojis/still/'+entry.filename);
}
catalog.lastUpdated=new Date().toISOString();
await fs.writeFile(metadataFile,JSON.stringify(catalog,null,2)+'\n');
console.log('Refreshed dimensions, byte sizes, hashes and stills; carried existing labels forward with provenance');
