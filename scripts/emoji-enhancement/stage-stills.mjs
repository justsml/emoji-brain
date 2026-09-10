import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {repairInteriorAlpha} from './repair-interior-alpha.mjs';
const root=process.cwd(),experiments=path.join(root,'experiments/image-enhancement');
const out=path.join(root,'staging/emoji-enhancements/stills');
await fs.mkdir(path.join(out,'candidates'),{recursive:true});
const groups=['batch-10','batch-25','remaining-stills','sadcat-final'];
const choices=new Map();
for(const group of groups){let rows;try{rows=JSON.parse(await fs.readFile(path.join(experiments,group,'summary.json')))}catch{continue}
 for(const row of rows)if(row.status==='succeeded')choices.set(row.name,{...row,group});
}
const all=[];for(const e of await fs.readdir('public/emojis',{withFileTypes:true}))if(e.isFile()&&e.name.endsWith('.webp')){const m=await sharp('public/emojis/'+e.name,{animated:true}).metadata();if((m.pages??1)===1)all.push(e.name)}
const missing=all.filter(file=>!choices.has(file.replace('.webp','')));
if(missing.length)throw Error('Cannot publish incomplete still review: '+missing.join(', '));
const manifest=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const file of all.sort()){
 const name=file.replace('.webp',''),row=choices.get(name),dir=path.join(experiments,row.group),source=path.join(root,'public/emojis',file);
 let matte=path.join(dir,name+'.transparent.png');
 let plan={};try{plan=JSON.parse(await fs.readFile(path.join(dir,name+'.prompt-plan.json')))}catch{}
 let alphaRepair=null;
 try{await fs.access(path.join(dir,name+'.generated.png'));const repaired=path.join(dir,name+'.review-alpha.png');alphaRepair=await repairInteriorAlpha({source,generated:path.join(dir,name+'.generated.png'),matte,output:repaired});matte=repaired;}catch(error){if(error.code!=='ENOENT')throw error}
 const target=path.join(out,'candidates',file);
 await sharp(matte).webp({lossless:true,effort:6}).toFile(target);
 const original=await fs.readFile(source),candidate=await fs.readFile(target),meta=await sharp(candidate).metadata();
 const {data}=await sharp(candidate).ensureAlpha().extractChannel('alpha').raw().toBuffer({resolveWithObject:true});
 let min=255,max=0;for(const v of data){min=Math.min(min,v);max=Math.max(max,v)}
 if(!meta.hasAlpha||min!==0||max!==255)throw Error('No usable alpha '+file);
 manifest.push({file,source:'public/emojis/'+file,candidate:'candidates/'+file,sourceSha256:hash(original),candidateSha256:hash(candidate),width:meta.width,height:meta.height,alphaMin:min,alphaMax:max,approval:'pending',route:row.route??plan.route??'nano-banana-pro + bria',experiment:row.group,generationId:row.generationId??null,matteId:row.matteId??null,prompt:plan.prompt??null,alphaRepair,notes:plan.textUncertain?['Tiny lettering remains uncertain; verify before approval']:[]});
}
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({status:'pending-human-approval',count:manifest.length,createdAt:new Date().toISOString(),items:manifest},null,2)+'\n');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
await fs.writeFile(path.join(out,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Still emoji approval</title><style>body{font:15px system-ui;background:#161b25;color:#eee;margin:30px}header{position:sticky;top:0;background:#161b25;padding:12px;z-index:1}input,button{padding:10px;margin:6px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:18px}article{background:#252e3c;padding:14px;border-radius:10px}.pair{display:flex;gap:12px}.pair>div{width:50%}.large{width:128px;height:128px;object-fit:contain;background:repeating-conic-gradient(#aaa 0% 25%,#eee 0% 50%) 0/16px 16px}.tiny{width:32px;height:32px;object-fit:contain}body.dark .large{background:#070a0f}body.light .large{background:white}a{color:#accaff}p{line-height:1.5}summary{cursor:pointer}</style><header><h1>${manifest.length} still candidates · awaiting human approval</h1><p>Original → candidate. Both include a 32px preview. Production files are unchanged. Check identity, text, eye whites and silhouette.</p><input id="filter" placeholder="Filter names" aria-label="Filter names"><button onclick="document.body.className=''">Checkerboard</button><button onclick="document.body.className='dark'">Dark</button><button onclick="document.body.className='light'">Light</button><a href="manifest.json">Provenance and hashes</a></header><main>${manifest.map(r=>`<article data-name="${esc(r.file)}"><h2>${esc(r.file)}</h2><div class="pair">${[['Original','../../../'+r.source],['Candidate',r.candidate]].map(([label,url])=>`<div><p>${label}</p><a href="${url}"><img loading="lazy" class="large" src="${url}" alt="${esc(r.file+' '+label)}"></a><p><img loading="lazy" class="tiny" src="${url}" alt="32px ${esc(label)}"></p></div>`).join('')}</div><p>${esc(r.route)} · pending</p>${r.notes.map(n=>`<p>${esc(n)}</p>`).join('')}<details><summary>Processing notes</summary><p>${r.alphaRepair?.changedPixels??0} alpha pixels restored in source-supported enclosed regions. Alpha and identity still require human review.</p></details></article>`).join('')}</main><script>document.querySelector('#filter').oninput=e=>{for(const a of document.querySelectorAll('article'))a.hidden=!a.dataset.name.toLowerCase().includes(e.target.value.toLowerCase())}</script></html>`);
await fs.writeFile(path.join(out,'README.md'),`# Still emoji candidates\n\n${manifest.length} transparent lossless WebP candidates, pending human approval. Open index.html for original/candidate comparisons on light, dark and checkerboard backgrounds. No production images have been replaced.\n\nReview expression, species/person identity, text, intentional softness, alpha (especially eye whites), and the 32px preview. Record approval against the candidate SHA-256 in manifest.json; changed bytes invalidate any prior approval. A committed file is not an approved file.\n\nGeneration: Nano Banana Pro at 1K followed by Bria alpha matting, except routes explicitly recorded as conservative upscaling. Source-supported enclosed alpha holes may be restored from generated RGB; these repairs remain subject to human review. Larger references are approximations unless documented otherwise.\n\nRebuild with node scripts/emoji-enhancement/stage-stills.mjs after the local experiment jobs complete. Provider responses and large intermediates remain in the git-ignored experiments folder; the manifest retains the generation IDs, prompts where available, and content hashes.\n`);
console.log('Staged',manifest.length,'stills for human approval');
