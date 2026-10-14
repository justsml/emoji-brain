// Read-only audit of production animations; does not run restoration or promotion.
// Run: node scripts/audit-animation-quality.mjs [output-directory]
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
// libvips otherwise spills large decoded animations to temporary files.
process.env.VIPS_DISC_THRESHOLD ??= '1073741824';
const {default:sharp} = await import('sharp');

sharp.concurrency(2);
sharp.cache({memory:32, files:0, items:16});
const out = path.resolve(process.argv.slice(2).find(a=>!a.startsWith('--')) ?? '/tmp/emoji-animation-audit');
await fs.mkdir(out, {recursive:true});
const read = async file => JSON.parse(await fs.readFile(file));
const hash = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
const delivery = await read('public/emoji-delivery/manifest.json');
const provenance = new Map();
for (const group of ['animated-pilot', 'remaining-animations', 'michael-scott']) {
  const manifest = await read(`staging/emoji-enhancements/${group}/manifest.json`);
  for (const item of manifest.items) provenance.set(item.name, {group, ...item});
}
const promotion = await read('staging/emoji-enhancements/promotion.json');
let matteRepairs;
try{matteRepairs=await read('scripts/emoji-enhancement/animation-matte-repairs.json');}
catch(error){if(error.code!=='ENOENT')throw error;}
const timeline = m => ({frames:m.pages ?? 1, durationMs:(m.delay ?? []).reduce((a,b)=>a+b,0), loop:m.loop ?? 0});
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inventory = [];
for (const file of (await fs.readdir('public/emojis')).filter(f=>f.endsWith('.webp')).sort()) {
  const meta = await sharp(`public/emojis/${file}`, {animated:true}).metadata();
  if ((meta.pages ?? 1)>1) inventory.push({name:file.slice(0,-5), meta});
}
const rows = [];
for (const {name, meta:masterMeta} of inventory) {
  const master = `public/emojis/${name}.webp`, d = delivery.items[name];
  const repair=matteRepairs?.items.find(r=>r.name===name&&r.status==='applied');
  const p = provenance.get(name) ?? [...provenance.values()].find(item =>
    (repair && item.source===repair.source) ||
    (item.candidate && d?.source===`staging/emoji-enhancements/${item.group}/${item.candidate}`));
  const receipt = promotion.items.find(r=>r.file===`${name}.webp`);
  const source = p?.group==='michael-scott' ? `staging/emoji-enhancements/michael-scott/originals/${name}.webp` : p?.source ?? receipt?.original;
  const row = {name, master, source, group:p?.group ?? null, plan:p?.plan ?? null, effect:p?.effect ?? false,
    preferred:p?.review?.preferred ?? null, tuning:p?.tuning ?? null,
    masterDimensions:[masterMeta.width,masterMeta.pageHeight], masterTimeline:timeline(masterMeta),
    masterSha256:await hash(master), deliverySource:d?.source ?? null, variants:{}};
  row.approvedHashMatches = p?.promotion?.approvedSha256 ? row.masterSha256===p.promotion.approvedSha256 :
    p?.group==='michael-scott' ? row.masterSha256===p.candidateSha256 : receipt ? row.masterSha256===receipt.approvedSha256 : null;
  if(repair)row.appliedMatteRepairHashMatches=row.masterSha256===repair.candidateSha256;
  if (d) row.deliverySourceHashMatches = await hash(d.source)===d.sourceSha256;
  if (source) {
    const sm = await sharp(source, {animated:true}).metadata();
    row.sourceDimensions=[sm.width,sm.pageHeight ?? sm.height]; row.sourceTimeline=timeline(sm);
    row.scale = masterMeta.width / sm.width;
    row.sourceSha256 = await hash(source);
    // Resize RGBA first, matching restoration's premultiplied-alpha resampling.
    const kernel = p?.plan?.kind==='pixel' ? 'nearest' : 'lanczos3';
    const pixels = masterMeta.width*masterMeta.pageHeight;
    // Decode once, then resize each composited source frame independently.
    // Resizing an animated strip can differ from per-frame restoration at seams.
    const sourceRGBA=await sharp(source,{animated:true}).ensureAlpha().raw().toBuffer();
    const sourcePixels=sm.width*(sm.pageHeight ?? sm.height), sourceBytes=sourcePixels*4;
    const actual=await sharp(master,{animated:true}).ensureAlpha().extractChannel('alpha').raw().toBuffer();
    let zero=0, partial=0, sum=0, worst=0, edgeSum=0, edgePixels=0, totalPixels=0;
    const aligned = sm.pages===masterMeta.pages && JSON.stringify(sm.delay)===JSON.stringify(masterMeta.delay);
    let sourceFrame=0,sourceEnd=sm.delay?.[0] ?? Infinity,time=0;
    for(let f=0;f<masterMeta.pages;f++) {
      while(sourceFrame<(sm.pages ?? 1)-1 && time>=sourceEnd)sourceEnd+=sm.delay[++sourceFrame];
      const raw=sourceRGBA.subarray(sourceFrame*sourceBytes,(sourceFrame+1)*sourceBytes);
      const baseline=await sharp(raw,{raw:{width:sm.width,height:sm.pageHeight ?? sm.height,channels:4}}).resize(masterMeta.width,masterMeta.pageHeight,{fit:'fill',kernel}).ensureAlpha().extractChannel('alpha').raw().toBuffer();
      let frameError=0;
      for(let i=0;i<baseline.length;i++) {
        if(baseline[i]===0)zero++;else if(baseline[i]<255)partial++;
        if(aligned) {const e=Math.abs(actual[f*pixels+i]-baseline[i]);frameError+=e;
          if(baseline[i]>0&&baseline[i]<255){edgeSum+=e;edgePixels++;}}
      }
      totalPixels+=baseline.length;sum+=frameError;worst=Math.max(worst,frameError/pixels);
      time+=masterMeta.delay[f];
    }
    if(aligned)row.alphaError={mean:sum/totalPixels,maxFrameMean:worst,partialEdgeMean:edgePixels?edgeSum/edgePixels:0};
    row.sourceTransparentFraction=zero/totalPixels;
    row.sourcePartialAlphaFraction=partial/totalPixels;
    row.sourceAlphaInherited=aligned && row.alphaError?.maxFrameMean<=0.05;
    row.lowResolutionCutoutRisk = row.sourceAlphaInherited && row.scale>=2 && Math.max(...row.sourceDimensions)<=128 && zero/totalPixels>0.005;
  }
  for(const size of [64,128,256]) {
    if(!d?.variants[size])continue;
    const a=d.variants[size].webp, m=await sharp(`public${a.path}`,{animated:true}).metadata();
    row.variants[size]={...timeline(m), bytes:a.bytes, manifestFrameKeep:a.frameKeep ?? 1,
      declaredFrameDrop:(a.frameKeep ?? 1)<1, durationMatches:timeline(m).durationMs===row.masterTimeline.durationMs,
      loopMatches:(m.loop ?? 0)===row.masterTimeline.loop};
  }
  rows.push(row);
  console.log(`${rows.length}/${inventory.length} ${name}: alpha=${row.sourceAlphaInherited ?? 'unknown'}, cutout-risk=${row.lowResolutionCutoutRisk ?? 'unknown'}, 64px-drop=${row.variants[64]?.declaredFrameDrop ?? 'missing'}`);
  await fs.writeFile(path.join(out,'progress.json'),JSON.stringify({updatedAt:new Date().toISOString(),completed:rows.length,total:inventory.length},null,2));
}
const summary={catalogAnimations:inventory.length,deliveryAnimations:Object.values(delivery.items).filter(r=>r.animated).length,
  missingDelivery:rows.filter(r=>!r.deliverySource).map(r=>r.name),
  missingHistoricalSource:rows.filter(r=>!r.source).map(r=>r.name),
  inheritedAlpha:rows.filter(r=>r.sourceAlphaInherited).map(r=>r.name),
  inheritedLowResolutionCutouts:rows.filter(r=>r.lowResolutionCutoutRisk).map(r=>r.name),
  appliedMatteRepairs:rows.filter(r=>r.appliedMatteRepairHashMatches).map(r=>r.name),
  frameDropped64:rows.filter(r=>r.variants[64]?.declaredFrameDrop).map(r=>r.name),
  deliverySourceHashMismatch:rows.filter(r=>r.deliverySourceHashMatches===false).map(r=>r.name),
  timelineProblems:rows.flatMap(r=>Object.entries(r.variants).filter(([,v])=>!v.durationMatches||!v.loopMatches).map(([s])=>`${r.name}:${s}`))};
await fs.writeFile(path.join(out,'audit.json'),JSON.stringify({observedAt:new Date().toISOString(),method:'All production WebP animations. Decode once and independently resize every composited frame. Full-frame alpha comparison against RGBA Lanczos3 (nearest for pixel-art) source enlargement; <=0.05/255 worst-frame mean marks inheritance, not perceptual quality. Cutout risk requires >=2x enlargement, source <=128px and >0.5% fully transparent pixels. Delivery metadata and source hashes verified. Visual samples are separate.',summary,rows},null,2)+'\n');
if(process.argv.includes('--data-only')){console.log(JSON.stringify(summary,null,2));process.exit(0);}

// One timeline-matched sample per asset: baseline, master on light/dark,
// and master alpha. All are displayed at the same scale without sharpening.
for(let start=0;start<rows.length;start+=8) {
  const batch=rows.slice(start,start+8), layers=[], width=1024, rowHeight=296;
  for(const [ri,r] of batch.entries()) {
    const m=await sharp(r.master,{animated:true}).metadata();
    const frames=[Math.floor(m.pages/3)];
    const sm=r.source ? await sharp(r.source,{animated:true}).metadata() : null;
    const y=ri*rowHeight;
    const label=`${r.name} | source ${r.sourceDimensions?.join('x') ?? 'unknown'} | inherited alpha ${r.sourceAlphaInherited ?? 'unknown'} | 64px ${r.variants[64]?.frames}/${r.masterTimeline.frames} frames`;
    layers.push({input:Buffer.from(`<svg width="1024" height="40"><text x="6" y="17" font-family="sans-serif" font-size="15" fill="white">${escape(label)}</text><text x="6" y="35" font-family="sans-serif" font-size="12" fill="white">Columns: source on dark / master on light / master on dark / master alpha. Sample at one third of the loop; source and master are timeline-matched.</text></svg>`),left:0,top:y});
    for(const [fi,frame] of frames.entries()) {
      const time=m.delay.slice(0,frame).reduce((a,b)=>a+b,0);
      let sourceFrame=0,end=sm?.delay?.[0] ?? Infinity;
      while(sm && sourceFrame<(sm.pages ?? 1)-1 && time>=end)end+=sm.delay[++sourceFrame];
      const images=[r.source ? sharp(r.source,{page:sourceFrame,pages:1}) : sharp(r.master,{page:frame,pages:1}),sharp(r.master,{page:frame,pages:1}),sharp(r.master,{page:frame,pages:1}),sharp(r.master,{page:frame,pages:1})];
      for(const [ci,img] of images.entries()) {
        let png;
        if(ci===3)png=await img.ensureAlpha().extractChannel('alpha').resize(256,256,{fit:'contain',background:'black'}).png().toBuffer();
        else png=await img.resize(256,256,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).flatten({background:ci===1?'#f5f5f5':'#202020'}).png().toBuffer();
        layers.push({input:png,left:ci*256,top:y+40});
      }
    }
  }
  await sharp({create:{width,height:batch.length*rowHeight,channels:3,background:'#333'}}).composite(layers).png().toFile(path.join(out,`contact-${String(start/8+1).padStart(2,'0')}.png`));
}
const cards=[];
for(const r of rows) {
  const figures=[];
  for(const [file,label] of [[r.source,'Archived source'],[delivery.items[r.name]?.variants[64]?.webp.path?.replace(/^\//,'public/'),'64px delivery'],[delivery.items[r.name]?.variants[256]?.webp.path?.replace(/^\//,'public/'),'256px delivery']].filter(([f])=>f)) {
    const data=await fs.readFile(file);
    figures.push(`<figure><figcaption>${label}</figcaption><img loading="lazy" src="data:image/webp;base64,${data.toString('base64')}"></figure>`);
  }
  cards.push(`<article><h2>${escape(r.name)}</h2><p>Source: ${r.sourceDimensions?.join('×') ?? 'unknown'}; inherited alpha: ${r.sourceAlphaInherited ?? 'unknown'}; low-resolution cutout risk: ${r.lowResolutionCutoutRisk ?? 'unknown'}; 64px frames: ${r.variants[64]?.frames}/${r.masterTimeline.frames}</p><div class="images">${figures.join('')}</div></article>`);
}
await fs.writeFile(path.join(out,'gallery.html'),`<!doctype html><meta charset="utf-8"><title>Animation quality audit</title><style>body{font:16px system-ui;margin:24px;background:#222;color:#eee}article{border-top:1px solid #666;padding:16px 0}.images{display:flex;flex-wrap:wrap}figure{margin:8px}img{width:256px;height:256px;object-fit:contain;background:repeating-conic-gradient(#333 0 25%,#888 0 50%) 0/24px 24px}button,input{font:inherit}</style><h1>Animation quality audit</h1><p>All ${rows.length} animations. Mask inheritance is a measurement, not automatic visual failure. Animations play independently; contact sheets show restored masters at a matched timeline sample. Images are embedded; no server is needed.</p><button onclick="document.querySelectorAll('img').forEach(i=>i.style.background='#fff')">White</button> <button onclick="document.querySelectorAll('img').forEach(i=>i.style.background='#111')">Dark</button> <label>Size <input type="range" min="32" max="512" value="256" step="32" oninput="document.querySelectorAll('img').forEach(i=>{i.style.width=this.value+'px';i.style.height=this.value+'px'})"></label> <label>Filter <input oninput="document.querySelectorAll('article').forEach(a=>a.hidden=!a.querySelector('h2').textContent.includes(this.value))"></label>${cards.join('')}`);
console.log(JSON.stringify(summary,null,2));
