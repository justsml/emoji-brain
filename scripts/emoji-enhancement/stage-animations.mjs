import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {decodeAnimation,resizeFrames} from './animation-frames.mjs';
const sourceRoot='experiments/image-enhancement/animated-pilot';
const out='staging/emoji-enhancements/animated-pilot';
await fs.mkdir(out,{recursive:true});
const items=[],billing=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const entry of await fs.readdir(sourceRoot,{withFileTypes:true})){
 if(!entry.isDirectory())continue;
 const dir=path.join(sourceRoot,entry.name);let result;
 for(const file of await fs.readdir(dir))if(file.endsWith('.openrouter.json')){const receipt=JSON.parse(await fs.readFile(path.join(dir,file)));billing.push({sample:entry.name,receipt:file,reportedCostUsd:receipt.usage?.cost??null});}
 try{result=JSON.parse(await fs.readFile(path.join(dir,'result.json')))}catch{continue;}
 let review={};try{review=JSON.parse(await fs.readFile(path.join(dir,'review.json')))}catch{}
 const original=await decodeAnimation(result.source),variants=[];
 const targetDir=path.join(out,entry.name);await fs.mkdir(targetDir,{recursive:true});
 for(const [key,label] of [['original','Original'],['esrgan','Real-ESRGAN · dual-background alpha'],...(result.effect?[['tuned','Effect-preserving blend']]:[]),...(result.status==='complete'&&!review.excludeNano?[['nano','Nano Banana Pro']]:[])]){
  const file=key==='original'?result.source:path.join(dir,key+'.webp');
  const anim=await decodeAnimation(file);
  if(anim.frames.length!==original.frames.length||JSON.stringify(anim.delays)!==JSON.stringify(original.delays)||anim.loop!==original.loop)throw Error('Timing mismatch '+entry.name+' '+key);
  let transparent=0,opaque=0;for(const frame of anim.frames)for(let i=3;i<frame.length;i+=4){if(frame[i]===0)transparent++;if(frame[i]===255)opaque++;}
  if(key!=='original'&&(!transparent||!opaque))throw Error('Missing usable alpha '+entry.name+' '+key);
  const bytes=await fs.readFile(file);await fs.writeFile(path.join(targetDir,key+'.webp'),bytes);
  const preview=await resizeFrames(anim,256),frames=[];
  for(let i=0;i<preview.frames.length;i++){
   const relative=entry.name+'/'+key+'-'+i+'.png';frames.push(relative);
   await sharp(preview.frames[i],{raw:{width:preview.width,height:preview.height,channels:4}}).png().toFile(path.join(out,relative));
  }
  variants.push({key,label,file:entry.name+'/'+key+'.webp',sha256:hash(bytes),width:anim.width,height:anim.height,frames,alpha:{transparent,opaque}});
 }
 const expected=new Set(variants.flatMap(v=>[path.basename(v.file),...v.frames.map(f=>path.basename(f))]));for(const f of await fs.readdir(targetDir))if(/\.(png|webp)$/.test(f)&&!expected.has(f))await fs.unlink(path.join(targetDir,f));
 items.push({...result,sourceSha256:hash(await fs.readFile(result.source)),approval:'pending',variants,review});
}
if(!items.length||items.length>12)throw Error('Expected 1–12 animation samples');
const reportedCostUsd=Number(billing.reduce((sum,r)=>sum+(r.reportedCostUsd??0),0).toFixed(6));
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({status:'pending-human-approval',count:items.length,billing:{provider:'OpenRouter',reportedCostUsd,generations:billing.length,includesDiscardedAttempts:true,receipts:billing},items},null,2)+'\n');
const data=JSON.stringify(items).replace(/</g,'\\u003c');
await fs.writeFile(path.join(out,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Animated emoji comparisons</title><style>
body{font:15px system-ui;background:#161b25;color:#eee;margin:24px}header{position:sticky;top:0;z-index:2;background:#161b25;padding:8px}h1{font-size:25px}button,input,select{padding:8px;margin:5px}article{background:#252e3c;padding:18px;border-radius:12px;margin:20px 0}.variants{display:flex;flex-wrap:wrap;gap:18px}.variant{width:260px}canvas{display:block;width:256px;height:256px;background:repeating-conic-gradient(#aaa 0% 25%,#eee 0% 50%) 0/16px 16px}canvas.tiny{width:32px;height:32px;margin-top:12px}body.dark canvas{background:#070a0f}body.light canvas{background:#fff}a{color:#b3cfff}p{max-width:1000px;line-height:1.5}.controls{margin:12px 0}.frame{width:240px}article[hidden]{display:none}.note{color:#f2d697}</style>
<header><h1>${items.length} short animations · awaiting human approval</h1><p>All variants share the original frame order and timing. Pause or scrub to compare the same frame. Larger previews are 256px; small previews are 32px. Enhanced downloads are transparent WebP.</p><p>OpenRouter reported $${reportedCostUsd.toFixed(2)} for ${billing.length} generated sprite sheets, including discarded attempts. This is reported image-generation cost, excluding local compute.</p><div id="ready">Loading every comparison frame…</div><input id="filter" placeholder="Filter names" aria-label="Filter names"><button data-bg="">Checkerboard</button><button data-bg="dark">Dark</button><button data-bg="light">Light</button><a href="manifest.json">Provenance</a></header><main></main><script>
const items=${data};const states=[];const main=document.querySelector('main');
function el(tag,text,parent){const e=document.createElement(tag);if(text)e.textContent=text;parent?.append(e);return e;}
async function setup(item){const article=el('article',null,main);article.dataset.name=item.name;el('h2',item.name,article);el('p',item.frames+' frames · '+item.duration+'ms · '+(item.loop?'loop count '+item.loop:'infinite loop')+' · approval pending',article);if(item.effect)el('p',item.tuning,article);if(item.review.notes)el('p',item.review.notes,article).className='note';if(item.status!=='complete')el('p','Nano candidate unavailable: '+(item.error||'processing incomplete'),article).className='note';
 const controls=el('div',null,article);controls.className='controls';const play=el('button','Pause',controls);const range=el('input',null,controls);range.type='range';range.min=0;range.max=item.frames-1;range.value=0;range.className='frame';range.setAttribute('aria-label',item.name+' frame');const info=el('span','',controls);const speed=el('select',null,controls);speed.setAttribute('aria-label',item.name+' playback speed');for(const n of [.25,.5,1]){const o=el('option',n+'× speed',speed);o.value=n;if(n===1)o.selected=true;}
 const row=el('div',null,article);row.className='variants';const state={item,playing:true,frame:0,elapsed:0,last:0,loops:0,ready:false,views:[],range,info};states.push(state);
 for(const variant of item.variants){const box=el('div',null,row);box.className='variant';const link=el('a',variant.label+(item.review.preferred===variant.key?' · suggested for review':((variant.key==='nano'&&item.review.nanoSuitable===false)||item.review.rejectedVariants?.includes(variant.key))?' · rejected experiment':''),box);link.href=variant.file;const canvas=el('canvas',null,box);canvas.width=canvas.height=256;const tiny=el('canvas',null,box);tiny.width=tiny.height=32;tiny.className='tiny';const images=await Promise.all(variant.frames.map(async src=>{const im=new Image();im.src=src;await im.decode();return im}));state.views.push({canvas,tiny,images});}
 function draw(){for(const v of state.views)for(const c of [v.canvas,v.tiny]){const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(v.images[state.frame],0,0,c.width,c.height);}range.value=state.frame;info.textContent='Frame '+(state.frame+1)+' / '+item.frames+' · '+item.delays[state.frame]+'ms';}
 state.draw=draw;state.speed=()=>Number(speed.value);state.play=play;state.ready=true;draw();play.onclick=()=>{state.playing=!state.playing;state.last=0;state.loops=0;play.textContent=state.playing?'Pause':'Play'};range.oninput=()=>{state.playing=false;play.textContent='Play';state.frame=Number(range.value);state.elapsed=0;draw()};
}
Promise.all(items.map(setup)).then(()=>{document.querySelector('#ready').textContent='All frames loaded';document.body.dataset.ready='true'}).catch(e=>{document.querySelector('#ready').textContent='Frame loading failed: '+e.message;throw e});
function tick(t){for(const s of states){if(!s.ready||!s.playing){s.last=0;continue;}if(!s.last)s.last=t;s.elapsed+=(t-s.last)*s.speed();s.last=t;let changed=false;while(s.elapsed>=s.item.delays[s.frame]){s.elapsed-=s.item.delays[s.frame];s.frame++;if(s.frame===s.item.frames){s.loops++;if(s.item.loop&&s.loops>=s.item.loop){s.frame--;s.playing=false;s.play.textContent='Play';break;}s.frame=0;}changed=true;}if(changed)s.draw();}requestAnimationFrame(tick)}requestAnimationFrame(tick);
document.querySelector('#filter').oninput=e=>{for(const a of document.querySelectorAll('article'))a.hidden=!a.dataset.name.includes(e.target.value.toLowerCase())};for(const b of document.querySelectorAll('[data-bg]'))b.onclick=()=>document.body.className=b.dataset.bg;
</script></html>`);
await fs.writeFile(path.join(out,'README.md'),`# Animated emoji pilot\n\n${items.length} short animations for human review; no production replacements. Open index.html for synchronized frame comparisons, slow playback, scrubbing, and dark/light alpha checks. The full-resolution downloads preserve original frame counts, per-frame durations, loop settings and transparency.\n\nReal-ESRGAN uses official animevideov3 weights locally on black and white composites; their difference estimates a sharper alpha matte. The effect-preserving candidate mixes 20% restored RGB with 80% source upscale and retains the original alpha for intentional blur and jitter. Nano Banana Pro processes an entire sprite sheet through OpenRouter at 2K, followed by Replicate Bria matting (or border-connected white removal if credits are unavailable) and enclosed alpha repair. The per-item manifest records the actual route. Exact timing preservation does not guarantee correct poses or temporal consistency; compare every frame.\n\nAll candidates remain pending approval. See manifest.json for hashes, prompts, model provenance and review notes. Commit status does not imply approval.\n`);
await fs.writeFile(path.join(out,'REVIEW.md'),`# Provisional animation review\n\nAll ${items.length} samples remain pending human approval. Suggested choices are visual judgments from this pilot, not calibrated model scores. Open [the synchronized comparison](index.html) to check motion and individual frames.\n\nOpenRouter reported $${reportedCostUsd.toFixed(2)} for ${billing.length} generated sheets, including discarded attempts. Local restoration uses no per-image API charge. Replicate returned HTTP 402 during these runs, so matting fell back to local processing.\n\n| Sample | Suggested for review | Findings |\n| --- | --- | --- |\n${items.map(r=>'| '+r.name+' | '+(r.review.preferred??'Undecided')+' | '+(r.review.notes??'Review needed')+' |').join('\n')}\n\n`);
console.log('Staged',items.length,'animated comparisons');
