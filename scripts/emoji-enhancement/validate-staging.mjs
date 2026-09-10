import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {chromium} from '@playwright/test';
const root=path.resolve(process.argv[2]??'staging/emoji-enhancements/stills');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json')));
const hash=b=>createHash('sha256').update(b).digest('hex');
if(manifest.status!=='pending-human-approval'||manifest.items.length!==manifest.count)throw Error('Invalid manifest');
if(new Set(manifest.items.map(r=>r.file)).size!==manifest.count)throw Error('Duplicate candidates');
for(const r of manifest.items){
 const source=await fs.readFile(r.source),candidate=await fs.readFile(path.join(root,r.candidate));
 if(hash(source)!==r.sourceSha256||hash(candidate)!==r.candidateSha256)throw Error('Stale hash '+r.file);
 if(r.approval!=='pending')throw Error('Unexpected approval '+r.file);
 const meta=await sharp(candidate,{animated:true}).metadata();
 if((!r.preserveBackground&&!meta.hasAlpha)||(meta.pages??1)!==1)throw Error('Not a transparent still '+r.file);
 const alpha=await sharp(candidate).ensureAlpha().extractChannel('alpha').raw().toBuffer();
 if(!r.preserveBackground&&(!alpha.includes(0)||!alpha.includes(255)))throw Error('Missing alpha range '+r.file);
}
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('file://'+path.join(root,'index.html'));
 const count=await page.locator('article').count();if(count!==manifest.count)throw Error('Incomplete gallery');
 const result=await page.locator('img').evaluateAll(async imgs=>{for(const img of imgs)img.loading='eager';await Promise.all(imgs.map(img=>img.decode()));return {count:imgs.length,broken:imgs.filter(i=>!i.naturalWidth).length}});
 if(result.count!==manifest.count*4||result.broken||errors.length)throw Error('Image decode failure');
 await page.locator('#filter').fill('roo-cult');if(await page.locator('article:visible').count()!==1)throw Error('Filter failure');
 await page.getByRole('button',{name:'Dark',exact:true}).click();if(await page.locator('body').getAttribute('class')!=='dark')throw Error('Dark background failure');
 console.log(JSON.stringify({candidates:manifest.count,...result,hashes:'valid',approval:'all pending',filter:'passed',background:'passed'}));
}finally{await browser.close()}
