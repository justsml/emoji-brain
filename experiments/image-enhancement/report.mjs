import fs from 'node:fs/promises';
import sharp from 'sharp';
const dir=new URL('./',import.meta.url).pathname;
const jobs=JSON.parse(await fs.readFile(`${dir}jobs.json`));
const rows=[];
for(const job of jobs){
 const r=JSON.parse(await fs.readFile(job.file));
 let metadata=null;try{metadata=await sharp(`${dir}${job.key}.png`).metadata();}catch{}
 rows.push({...job,status:r.status,error:r.error??r.detail,seconds:r.metrics?.predict_time,width:metadata?.width,height:metadata?.height,alpha:metadata?.hasAlpha});
}
await fs.writeFile(`${dir}summary.json`,JSON.stringify(rows,null,2));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Emoji enhancement comparison</title><style>body{font:16px system-ui;background:#10131b;color:#e9edf5;margin:32px}h1{font-size:32px}p{max-width:1000px;color:#b7c1d2;line-height:1.5}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}article{background:#1b2230;border:1px solid #394255;padding:16px;border-radius:12px}h3{font-size:15px;min-height:36px}a{color:#a9c9ff}img{object-fit:contain;max-width:100%}.preview{width:256px;height:256px;background:repeating-conic-gradient(#ddd 0% 25%,#fff 0% 50%) 50%/16px 16px}.small{width:32px;height:32px;margin:12px}.mid{width:64px;height:64px;margin:12px}label{margin-right:20px}button,select{padding:8px}body.light{background:#eee;color:#111}body.light article{background:white;color:#111}</style><h1>Emoji enhancement comparison</h1><p>Seven models × two originals. All models received the original 28×28 or 30×30 WebP, with no pre-upscale. Dedicated upscalers use 4×; editors choose their native output size. Large previews are shown at the same 256px size, with 32px and 64px previews below. Click an image for the full output.</p><p>Price labels are estimates from Replicate pricing checked September 10, 2026, not invoice charges. Topaz lists $0.08/unit in its billing table but $0.05 in its README; $0.08 is used conservatively. Clarity is runtime-priced. Alpha indicates an alpha channel, not proof that transparency was preserved correctly.</p><label>Preview size <select id="size"><option>128</option><option selected>256</option><option>512</option></select></label><label><input type="checkbox" id="pixels"> Nearest-neighbor display</label><button id="theme">Toggle light / dark</button>`;
for(const name of ['meow-cat','everythingisbroken']){
 html+=`<h2>${name}</h2><div class="grid"><article><h3>Original · $0</h3><a href="${name}.webp"><img class="preview" src="${name}.webp"></a><div><img class="small" src="${name}.webp"><img class="mid" src="${name}.webp"></div><p>Browser interpolation baseline</p></article>`;
 for(const r of rows.filter(r=>r.name===name))html+=`<article><h3><a href="https://replicate.com/${r.model}">${r.model}</a></h3>${r.width?`<a href="${r.key}.png"><img class="preview" src="${r.key}.png"></a><div><img class="small" src="${r.key}.png"><img class="mid" src="${r.key}.png"></div>`:esc(r.error??r.status)}<p>${r.cost===null?'Runtime-priced':`~$${r.cost}/image`} · ${r.seconds?.toFixed(2)??'?'}s<br>${r.width??'?'}×${r.height??'?'} · alpha: ${r.alpha??'?'}</p></article>`;
 html+='</div>';
 const items=[{key:name,file:`${dir}${name}.webp`,label:'Original'},...rows.filter(r=>r.name===name&&r.width).map(r=>({...r,file:`${dir}${r.key}.png`,label:r.model.split('/')[1]}))];
 const composite=[];const cellW=280,cellH=310;
 for(let i=0;i<items.length;i++){
  const x=(i%4)*cellW,y=Math.floor(i/4)*cellH;
  composite.push({input:await sharp(items[i].file).resize(256,256,{fit:'contain',background:'#dddddd'}).flatten({background:'#dddddd'}).png().toBuffer(),left:x+12,top:y+40});
  composite.push({input:Buffer.from(`<svg width="280" height="36"><text x="12" y="25" fill="white" font-family="sans-serif" font-size="17">${esc(items[i].label)}</text></svg>`),left:x,top:y});
 }
 await sharp({create:{width:1120,height:Math.ceil(items.length/4)*cellH,channels:3,background:'#18202d'}}).composite(composite).png().toFile(`${dir}${name}-comparison.png`);
}
html+=`<script>document.querySelector('#size').onchange=e=>document.querySelectorAll('.preview').forEach(i=>{i.style.width=e.target.value+'px';i.style.height=e.target.value+'px'});document.querySelector('#pixels').onchange=e=>document.querySelectorAll('img').forEach(i=>i.style.imageRendering=e.target.checked?'pixelated':'auto');document.querySelector('#theme').onclick=()=>document.body.classList.toggle('light');</script>`;
await fs.writeFile(`${dir}index.html`,html);
console.log(rows.map(r=>({model:r.model,image:r.name,status:r.status,size:[r.width,r.height],alpha:r.alpha})));
