import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
// Two human-requested corrections on completed art; no model calls.
//
// 1. The upscale flattened meow_deficit's blue-to-yellow face blend into two
//    solid fills meeting at a hard seam — the prompt told the model to keep
//    flat fills flat, and it read the gradient as one. The ramp is measured off
//    the 128px original and painted back over the flat tones.
// 2. meow_profit is the same cat with the outcome reversed: the plot line is
//    mirrored so it climbs, recolored green, the stress sweat is gone and the
//    zigzag mouth becomes a content cat curve.

const SOURCE='public/emojis/meow_deficit.webp';
const CANDIDATE='staging/emoji-enhancements/stills/candidates/meow_deficit.webp';
const ORIGINAL='staging/emoji-enhancements/originals/meow_deficit.webp';
// The approved-but-flattened upscale, kept so this stays re-runnable and the
// artwork the receipts were signed against is still on disk.
const APPROVED='staging/emoji-enhancements/stills/pre-correction/meow_deficit.webp';
const hash=b=>createHash('sha256').update(b).digest('hex');
const dist=(d,o,c)=>Math.hypot(d[o]-c[0],d[o+1]-c[1],d[o+2]-c[2]);
const clamp=t=>Math.min(1,Math.max(0,t));
const smoothstep=t=>t*t*(3-2*t);
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);

// Endpoints and ramp bounds read off the original's face column at x=90%: the
// blend holds solid blue over the first 9% of the body, reaches solid yellow at
// 60%, and is linear between.
const BLUE=[69,174,230],YELLOW=[250,195,27],RAMP_START=0.09,RAMP_END=0.60;
// What the upscaler left behind, and how far a pixel may sit from one of them
// and still be face rather than glasses, tie or whisker.
const FLAT=[[76,170,220],[246,192,30]],BODY_TOLERANCE=60,FEATHER=[20,60];

const raw=async file=>sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
// These are catalog masters, which the delivery ladder re-encodes per size, so
// they are written lossless rather than inheriting a second generation of loss.
const write=(data,W,H,file)=>sharp(data,{raw:{width:W,height:H,channels:4}}).webp({lossless:true,effort:6}).toFile(file);

/** Face colour at row y, given the body's vertical extent. */
const rampAt=(y,top,span)=>mix(BLUE,YELLOW,smoothstep(clamp(((y-top)/span-RAMP_START)/(RAMP_END-RAMP_START))));

/**
 * Repaint the two flat tones as one continuous ramp. Pixels are weighted by how
 * close they sit to a pure flat fill, so the anti-aliased borders against the
 * glasses, whiskers and tie keep their blend instead of banding a second time.
 */
function regradient(data,W,H){
 const body=new Uint8Array(W*H);let top=H,bottom=0;
 for(let i=0;i<W*H;i++){
  const o=i*4;if(data[o+3]<40)continue;
  if(Math.min(...FLAT.map(c=>dist(data,o,c)))>=BODY_TOLERANCE)continue;
  body[i]=1;const y=(i/W)|0;if(y<top)top=y;if(y>bottom)bottom=y;
 }
 const span=bottom-top;
 for(let y=top;y<=bottom;y++){
  const c=rampAt(y,top,span);
  for(let x=0;x<W;x++){
   const i=y*W+x;if(!body[i])continue;const o=i*4;
   const w=1-smoothstep(clamp((Math.min(...FLAT.map(f=>dist(data,o,f)))-FEATHER[0])/(FEATHER[1]-FEATHER[0])));
   for(let k=0;k<3;k++)data[o+k]=Math.round(data[o+k]+(c[k]-data[o+k])*w);
  }
 }
 return {top,span};
}

// Plot-line geometry, in 1024px coordinates: the chart card, the vertical span
// the line occupies (mirrored about its own centre so the trend inverts without
// leaving the card), and the two features the stressed face is built from.
const CHART={x0:0,x1:452,y0:0,y1:420},LINE={y0:70,y1:347};
const SWEAT={x0:820,y0:640,x1:912,y1:790};
const MOUTH={x0:452,y0:606,x1:692,y1:728};
const DECLINE=[226,70,68],CLIMB=[44,170,88],CARD=[226,226,226],AXIS=[1,1,1];
const AXES=[{x0:64,y0:62,x1:76,y1:378},{x0:39,y0:337,x1:383,y1:350}];
const INK=[62,52,31];

// Erasing at a feature's own coverage leaves its anti-aliased rim behind as a
// visible outline, so coverage is grown one pixel and overdriven before the
// fill. Anything the rim overlapped is redrawn on top anyway.
const OVERDRIVE=1.6;

/** Grow a coverage field over its 8-neighbourhood and overdrive it. */
function spread(cover,W,H){
 const out=new Float32Array(cover.length);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  let m=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const ny=y+dy,nx=x+dx;if(ny<0||ny>=H||nx<0||nx>=W)continue;
   m=Math.max(m,cover[ny*W+nx]);
  }
  out[y*W+x]=clamp(m*OVERDRIVE);
 }
 return out;
}

/** How much of this pixel is plot line rather than card or axis. */
const redness=(d,o)=>clamp((((d[o]-d[o+1])+(d[o]-d[o+2]))/2)/(((DECLINE[0]-DECLINE[1])+(DECLINE[0]-DECLINE[2]))/2));

/**
 * Mirror the plot line vertically and recolor it. Erasing to the card fill
 * first means the flipped copy lands on clean board, and the axes — which are
 * never red — survive untouched underneath.
 */
function invertChart(data,W){
 const H=CHART.y1-CHART.y0,cover=new Float32Array(W*H);
 for(let y=CHART.y0;y<CHART.y1;y++)for(let x=CHART.x0;x<CHART.x1;x++){
  const o=(y*W+x)*4;if(data[o+3]<40)continue;
  const a=redness(data,o);if(a>0.02)cover[(y-CHART.y0)*W+x]=a;
 }
 const wipe=spread(cover,W,H);
 for(let y=CHART.y0;y<CHART.y1;y++)for(let x=CHART.x0;x<CHART.x1;x++){
  const a=wipe[(y-CHART.y0)*W+x];if(!a)continue;
  const o=(y*W+x)*4;if(data[o+3]<40)continue;
  for(let k=0;k<3;k++)data[o+k]=Math.round(data[o+k]+(CARD[k]-data[o+k])*a);
 }
 // The wipe takes the axes with it wherever the line crossed them. They are two
 // plain bars, so they are cheaper to restamp than to preserve.
 for(const bar of AXES)for(let y=bar.y0;y<=bar.y1;y++)for(let x=bar.x0;x<=bar.x1;x++){
  const o=(y*W+x)*4;for(let k=0;k<3;k++)data[o+k]=AXIS[k];data[o+3]=255;
 }
 for(let y=CHART.y0;y<CHART.y1;y++)for(let x=CHART.x0;x<CHART.x1;x++){
  const a=cover[(y-CHART.y0)*W+x];if(!a)continue;
  const ty=LINE.y0+LINE.y1-y;if(ty<CHART.y0||ty>=CHART.y1)continue;
  const o=(ty*W+x)*4;
  for(let k=0;k<3;k++)data[o+k]=Math.round(data[o+k]+(CLIMB[k]-data[o+k])*a);
  data[o+3]=Math.max(data[o+3],Math.round(255*a));
 }
}

/**
 * Paint a box back to face colour. `pick` says how much of a pixel belongs to
 * the feature being removed; `protect` spares whatever crosses in front of it.
 */
function erase(data,W,box,pick,protect,top,span){
 const bw=box.x1-box.x0,bh=box.y1-box.y0,cover=new Float32Array(bw*bh);
 for(let y=box.y0;y<box.y1;y++)for(let x=box.x0;x<box.x1;x++){
  const o=(y*W+x)*4;if(data[o+3]<40)continue;
  cover[(y-box.y0)*bw+(x-box.x0)]=pick(data[o],data[o+1],data[o+2]);
 }
 const wipe=spread(cover,bw,bh);
 for(let y=box.y0;y<box.y1;y++){
  const c=rampAt(y,top,span);
  for(let x=box.x0;x<box.x1;x++){
   const a=wipe[(y-box.y0)*bw+(x-box.x0)];if(!a)continue;
   const o=(y*W+x)*4;if(data[o+3]<40)continue;
   if(protect(data[o],data[o+1],data[o+2]))continue;
   for(let k=0;k<3;k++)data[o+k]=Math.round(data[o+k]+(c[k]-data[o+k])*a);
  }
 }
}

// An upward cat curve in the same ink and stroke weight as the zigzag it
// replaces, drawn over the erased mouth.
const SMILE=`<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg"><path d="M472 618 C 492 692, 544 694, 570 636 C 596 694, 648 692, 668 618" fill="none" stroke="rgb(${INK})" stroke-width="21" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

await fs.mkdir(APPROVED.slice(0,APPROVED.lastIndexOf('/')),{recursive:true});
if(!await fs.access(APPROVED).then(()=>true,()=>false))await fs.copyFile(CANDIDATE,APPROVED);

const {data,info}=await raw(APPROVED);
const {width:W,height:H}=info;
const {top,span}=regradient(data,W,H);
const deficit=Buffer.from(data);
await write(deficit,W,H,SOURCE+'.tmp');
await fs.rename(SOURCE+'.tmp',SOURCE);
await fs.copyFile(SOURCE,CANDIDATE);

const profit=Buffer.from(deficit);
invertChart(profit,W);
// The sweat is the only pure white below the eyes; the mouth the only dark ink
// in its box, so both lift out by colour without touching the whisker crossing
// them.
const GRAY=(r,g,b)=>Math.abs(r-g)<28&&Math.abs(g-b)<28&&r<215;
erase(profit,W,SWEAT,(r,g,b)=>r>190&&g>185?clamp((b-40)/140):0,GRAY,top,span);
erase(profit,W,MOUTH,(r,g,b)=>clamp(((200-(r+g+b)/3)/120-0.4)/0.6),()=>false,top,span);
const smiled=await sharp(profit,{raw:{width:W,height:H,channels:4}}).composite([{input:Buffer.from(SMILE)}]).ensureAlpha().raw().toBuffer();
await write(smiled,W,H,'public/emojis/meow_profit.webp.tmp');
await fs.rename('public/emojis/meow_profit.webp.tmp','public/emojis/meow_profit.webp');

console.log('meow_deficit',hash(await fs.readFile(SOURCE)));
console.log('meow_profit',hash(await fs.readFile('public/emojis/meow_profit.webp')));
console.log('original',hash(await fs.readFile(ORIGINAL)));
