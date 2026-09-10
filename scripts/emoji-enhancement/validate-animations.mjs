import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
import {decodeAnimation,resizeFrames} from './animation-frames.mjs';
const root=path.resolve('staging/emoji-enhancements/animated-pilot');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json')));
const hash=b=>createHash('sha256').update(b).digest('hex');
if(manifest.status!=='pending-human-approval'||manifest.count!==manifest.items.length||manifest.count>12)throw Error('Invalid manifest');
let variants=0;
for(const item of manifest.items){
 if(hash(await fs.readFile(item.source))!==item.sourceSha256||item.approval!=='pending')throw Error('Source/approval mismatch');
 const original=await decodeAnimation(item.source),baseline=await resizeFrames(original,512);
 for(const variant of item.variants){
  const file=path.join(root,variant.file),bytes=await fs.readFile(file),a=await decodeAnimation(file);
  if(hash(bytes)!==variant.sha256||a.frames.length!==item.frames||JSON.stringify(a.delays)!==JSON.stringify(item.delays)||a.loop!==item.loop)throw Error('Variant mismatch '+item.name+' '+variant.key);
  if(variant.key==='tuned')for(let f=0;f<a.frames.length;f++)for(let p=3;p<a.frames[f].length;p+=4)if(a.frames[f][p]!==baseline.frames[f][p])throw Error('Source alpha changed '+item.name);
  variants++;
 }
}
const browser=await chromium.launch();
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('file://'+path.join(root,'index.html'));await page.waitForSelector('body[data-ready="true"]',{timeout:60000});
 if(await page.locator('article').count()!==manifest.count||errors.length)throw Error('Incomplete gallery');
 const first=page.locator('article').first();await first.getByRole('button',{name:'Pause',exact:true}).click();
 await first.locator('input[type="range"]').focus();await first.locator('input[type="range"]').press('Home');await first.locator('input[type="range"]').press('ArrowRight');if(!(await first.locator('.controls span').textContent()).includes('Frame 2 /'))throw Error('Scrub failed');
 await page.getByRole('button',{name:'Dark',exact:true}).click();if(await page.locator('body').getAttribute('class')!=='dark')throw Error('Background failed');
 await page.locator('#filter').fill(manifest.items[0].name);if(await page.locator('article:visible').count()!==1)throw Error('Filter failed');
 console.log(JSON.stringify({animations:manifest.count,variants,hashes:'valid',timing:'exact',sourceAlpha:'exact on effect-preserving blend variants',gallery:'all frames decoded',scrub:'passed',background:'passed',filter:'passed'}));
}finally{await browser.close()}
