import fs from 'node:fs/promises';
process.env.VIPS_DISC_THRESHOLD ??= '1073741824';
const {default:sharp}=await import('sharp');
sharp.concurrency(2);sharp.cache({memory:32,files:0,items:16});
const root='staging/emoji-enhancements/animation-matte-repair';
const out='/tmp/emoji-animation-repair';await fs.mkdir(out,{recursive:true});
let m;try{m=JSON.parse(await fs.readFile(root+'/manifest.json'));}catch(e){if(e.code!=='ENOENT')throw e;m=JSON.parse(await fs.readFile('scripts/emoji-enhancement/animation-matte-repairs.json'));}
const historical=JSON.parse(await fs.readFile('staging/emoji-enhancements/remaining-animations/manifest.json'));
const cards=[];
for(let start=0;start<m.items.length;start+=4) {
  const layers=[],batch=m.items.slice(start,start+4);
  for(const [row,r] of batch.entries()) {
    const oldName=r.name==='meow-hearts'?'cat-meow-hearts':r.name;
    const before=`staging/emoji-enhancements/remaining-animations/${historical.items.find(x=>x.name===oldName).candidate}`;
    let after=`${root}/${r.candidate}`;
    try{await fs.access(after)}catch(e){if(e.code!=='ENOENT'||r.status!=='applied')throw e;after=`public/emojis/${r.name}.webp`;}
    const frame=Math.floor(r.frames/3);
    for(const [col,file] of [before,before,after,after].entries()) {
      const input=await sharp(file,{page:frame,pages:1}).resize(256,256,{fit:'contain',background:'#00000000'}).flatten({background:col%2?'#202020':'#fafafa'}).png().toBuffer();
      layers.push({input,left:col*256,top:row*280+24});
    }
    layers.push({input:Buffer.from(`<svg width="1024" height="24"><text x="6" y="18" fill="white" font-size="16">${r.name}: prior light / dark | repaired light / dark</text></svg>`),left:0,top:row*280});
    const images=[];
    for(const [label,file] of [['Prior master',before],['Repaired master',after]]) {
      const bytes=await sharp(file,{animated:true}).resize(256,256,{fit:'contain',background:'#00000000'}).webp({quality:90,alphaQuality:100,effort:2,loop:r.loop,delay:r.delays}).toBuffer();
      images.push(`<figure><figcaption>${label}</figcaption><img loading="lazy" src="data:image/webp;base64,${bytes.toString('base64')}"></figure>`);
    }
    cards.push(`<article><h2>${r.name}</h2><p>${r.frames} original frames, exact timing and loop. Maximum canvas alpha coverage change ${(r.maxCoverageChange*100).toFixed(3)}%.${r.temporalMatteFallbackFrames?.length?' Rain frames 60–61 use neighboring corrections only on unchanged source contours.':''}</p><div>${images.join('')}</div></article>`);
  }
  await sharp({create:{width:1024,height:batch.length*280,channels:3,background:'#333'}}).composite(layers).png().toFile(`${out}/repaired-${start/4+1}.png`);
}
await fs.writeFile(out+'/index.html',`<!doctype html><meta charset="utf-8"><title>Animation matte repairs</title><style>body{background:#222;color:#eee;font:16px system-ui;margin:24px}article{border-top:1px solid #777;padding:16px}article div{display:flex;flex-wrap:wrap}img{width:256px;height:256px;background:#fff}figure{margin:8px}input,button{font:inherit}</style><h1>Twelve animation matte repairs</h1><p>Prior and repaired masters, shown at 256px. Playback starts independently. Contact sheets compare matching timeline positions.</p><button onclick="document.querySelectorAll('img').forEach(i=>i.style.background='#fff')">White</button> <button onclick="document.querySelectorAll('img').forEach(i=>i.style.background='#202020')">Dark</button> <label>Size <input type="range" min="32" max="512" step="32" value="256" oninput="document.querySelectorAll('img').forEach(i=>{i.style.width=this.value+'px';i.style.height=this.value+'px'})"></label>${cards.join('')}`);
console.log('Built',m.items.length,'master comparisons:',out+'/index.html');
