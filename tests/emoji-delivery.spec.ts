import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
const catalog = Object.values(JSON.parse(await fs.readFile('public/emoji-delivery/manifest.json', 'utf8')).items) as {animated: boolean}[];
const animatedCount = catalog.filter(emoji => emoji.animated).length;
const stillCount = catalog.length - animatedCount;

test('console export uses a worker and adaptive WebP and uploads identical bytes in a mocked browser',async({page,context})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text:string)=>{(window as any).copiedEmojiScript=text;}}}));
  await page.goto('/');
  await page.getByTitle('Deselect visible').click();
  await page.locator('div[role="gridcell"] button').first().click();
  await expect(page.getByLabel('Slack image size')).toHaveCount(0);
  for(const size of [256]){
    const workerCreated=page.waitForEvent('worker');
    const assetResponse=page.waitForResponse(r=>r.url().includes(`/emoji-delivery/${size}/`)&&r.url().endsWith('.webp'));
    await page.getByRole('button',{name:'Copy Slack script',exact:true}).click();
    const worker=await workerCreated;expect(worker.url()).toContain('export.worker');
    const asset=await assetResponse;
    const expected=await (await import('node:fs/promises')).readFile('public'+new URL(asset.url()).pathname);
    await expect(page.getByLabel('Close Slack instructions')).toBeVisible();
    await expect(page.getByLabel('Exported image resolutions')).toContainText('1 still at 256×256');
    const script=await page.evaluate(()=>(window as any).copiedEmojiScript);
    const mock=await context.newPage();
    await mock.route('https://emoji-export-test.slack.com/**',route=>route.fulfill({contentType:'text/html',body:'<input name="token" value="fixture-token">'}));
    await mock.goto('https://emoji-export-test.slack.com/customize/emoji');
    await mock.evaluate(()=>{
      window.fetch=async(_url,init)=>{
        const file=(init!.body as FormData).get('image') as File;
        (window as any).uploadedEmoji={name:file.name,type:file.type,bytes:Array.from(new Uint8Array(await file.arrayBuffer()))};
        return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json'}});
      };
    });
    await mock.evaluate(script);
    const uploaded=await mock.evaluate(()=>(window as any).uploadedEmoji);
    expect(uploaded.type).toBe('image/webp');expect(uploaded.name).toMatch(/\.webp$/);
    expect(createHash('sha256').update(Buffer.from(uploaded.bytes)).digest('hex')).toBe(createHash('sha256').update(expected).digest('hex'));
    await mock.close();
    await page.getByLabel('Close Slack instructions').click();
  }
});

test('delivery comparison decodes all preview sizes and preserves the requested deep link',async({page})=>{
  await page.goto('/emoji-delivery/index.html#bizcat');
  await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  await expect(page.getByLabel('Emoji',{exact:true})).toHaveValue('bizcat');
  expect(await page.locator('#images img').evaluateAll(imgs=>imgs.map(i=>({width:(i as HTMLImageElement).naturalWidth,height:(i as HTMLImageElement).naturalHeight})))).toEqual([{width:64,height:64},{width:128,height:128},{width:256,height:256}]);
  await expect(page.getByRole('link',{name:'Download WebP',exact:true})).toHaveCount(3);
});


test('grid requests pre-generated still previews, plays a small animation only on interaction, and stays stable when scrolled',async({page})=>{
  await page.goto('/');
  await page.getByRole('grid',{name:'Emoji results'}).waitFor();
  const images=page.locator('[role="gridcell"] img');
  await expect(images.first()).toHaveAttribute('srcset', /previews\/64/);
  expect(await page.locator('.toolbar').evaluate(el=>getComputedStyle(el).backdropFilter)).toContain('blur');
  expect(await images.first().evaluate(el=>getComputedStyle(el).filter)).toContain('drop-shadow');
  const height=await page.evaluate(()=>document.documentElement.scrollHeight);
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  await page.waitForTimeout(150);
  expect(Math.abs(await page.evaluate(()=>document.documentElement.scrollHeight)-height)).toBeLessThan(4);
  const animated=page.locator('[role="gridcell"] button[aria-label*=", animated"]').first();
  await animated.scrollIntoViewIfNeeded();
  await animated.hover();
  await expect(animated.locator('img')).toHaveAttribute('src', /emoji-delivery\/(128|256)\//);
  await expect(animated.locator('img')).not.toHaveAttribute('srcset');
  await page.mouse.move(0,0);
  await expect(animated.locator('img')).toHaveAttribute('src', /previews/);
});

test('ZIP downloads the native-size quality-90 WebPs and Markdown includes all preview sizes',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text:string)=>{(window as any).copiedEmojiScript=text;}}}));
  await page.goto('/');
  await page.getByTitle('Deselect visible').click();
  const button=page.locator('[role="gridcell"] button').first();
  const filename=(await button.getAttribute('aria-label'))!.split(',')[0];
  await button.click();
  await page.getByRole('button',{name:'Other export options'}).click();
  const downloaded=page.waitForEvent('download');
  await page.getByRole('menuitem',{name:/^Originals/}).click();
  const download=await downloaded;
  const fs=await import('node:fs/promises'),JSZip=(await import('jszip')).default;
  const zip=await JSZip.loadAsync(await fs.readFile((await download.path())!));
  const original=await fs.readFile('public/emoji-delivery/original/'+filename);
  expect(await zip.file(filename)!.async('nodebuffer')).toEqual(original);
  const optimized=await fs.readFile('public/emoji-delivery/256/'+filename);
  expect(await zip.file('slack/images/'+filename)!.async('nodebuffer')).toEqual(optimized);
  const {tmpdir}=await import('node:os'),{join,dirname}=await import('node:path');
  const directory=await fs.mkdtemp(join(tmpdir(),'emoji-built-zip-'));
  try {
    for(const [name,file] of Object.entries(zip.files))if(!file.dir){const path=join(directory,name);await fs.mkdir(dirname(path),{recursive:true});await fs.writeFile(path,await file.async('nodebuffer'));}
    const {promisify}=await import('node:util'),{execFile}=await import('node:child_process');
    await promisify(execFile)('sh',['generate-slack-script.sh'],{cwd:directory});
    const script=await fs.readFile(join(directory,'slack-upload.js'),'utf8');
    expect(Buffer.byteLength(script)).toBeLessThan(8_000_000);
    const packed=script.match(/const encoded = "([A-Za-z0-9+/=]+)"/);
    const {gunzipSync}=await import('node:zlib');
    const images=packed?JSON.parse(gunzipSync(Buffer.from(packed[1],'base64')).toString()):JSON.parse(script.match(/const images = (\[.*\]);/)![1]);
    expect(images).toHaveLength(1);
    expect(Buffer.from(images[0].base64,'base64')).toEqual(optimized);
  } finally {await fs.rm(directory,{recursive:true,force:true});}

  await page.getByRole('button',{name:'Other export options'}).click();
  await page.getByRole('menuitem',{name:'Markdown Table'}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).copiedEmojiScript)).toContain('/emoji-delivery/original/');
  const markdown=await page.evaluate(()=>(window as any).copiedEmojiScript);
  for(const size of [64,128,256])expect(markdown).toContain('/emoji-delivery/'+size+'/');
});

test('export can be canceled while the grid remains interactive',async({page,context})=>{
  await context.route('**/emoji-delivery/original/**',async route=>{
    await new Promise(resolve=>setTimeout(resolve,500));
    await route.continue().catch(()=>{});
  });
  await page.goto('/');
  await page.locator('[role="gridcell"] button').first().click();
  await page.getByRole('button',{name:'Other export options'}).click();
  const created=page.waitForEvent('worker');
  await page.getByRole('menuitem',{name:/^Originals/}).click();
  await created;
  await page.getByPlaceholder('Search emojis...').fill('roo');
  await page.getByRole('button',{name:'Cancel export',exact:true}).click();
  await expect(page.locator('.sheet-status')).toContainText('Export canceled');
  await expect.poll(()=>page.workers().filter(w=>w.url().includes("export.worker")).length).toBe(0);
  await expect(page.getByPlaceholder('Search emojis...')).toHaveValue('roo');
});

test('Pagefind is lazy, uses one engine, and avoids redundant result fragments',async({page})=>{
  const requests:string[]=[];page.on('request',request=>{if(request.url().includes('/pagefind/'))requests.push(request.url());});
  await page.goto('/');await page.getByRole('grid',{name:'Emoji results'}).waitFor();
  expect(requests).toHaveLength(0);
  await page.getByPlaceholder('Search emojis...').focus();
  await page.waitForFunction(()=>!!(window as any).pagefind);
  await page.evaluate(()=>{
    const client=(window as any).pagefind,search=client.search;
    (window as any).searchCalls=0;
    (window as any).pagefind={...client,search:async(...args:any[])=>{(window as any).searchCalls++;const result=await search(...args);(window as any).engineMatches=result.results.length;return result;}};
  });
  const input=page.getByPlaceholder('Search emojis...');
  await input.fill('roo');
  await expect(page.locator('#emoji-search-status')).toHaveText(/^[0-9,]+ matches for “roo”$/);
  expect(await page.evaluate(()=>(window as any).searchCalls)).toBe(1);
  expect(await page.locator('[role="gridcell"]').count()).toBe(await page.evaluate(()=>(window as any).engineMatches));
  await input.fill('cat');await expect(page.locator('#emoji-search-status')).toContainText('matches for “cat”');
  expect(await page.locator('[role="gridcell"]').count()).toBe(await page.evaluate(()=>(window as any).engineMatches));
  expect(requests.filter(url=>url.includes('/fragment/'))).toHaveLength(0);
  expect(requests.filter(url=>new URL(url).pathname==='/pagefind/pagefind.js')).toHaveLength(1);
  expect(page.workers().filter(worker=>worker.url().includes('pagefind-worker'))).toHaveLength(1);
  const index=await (await page.request.get('/pagefind/pagefind-entry.json')).json();
  expect(index.languages.en.page_count).toBe(catalog.length);
});

test('full Slack script yields during payload decoding at half-speed CPU', async ({page,context}) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text:string)=>{(window as any).copiedEmojiScript=text;}}}));
  await page.goto('/');
  await page.getByTitle('Select All Visible', {exact:true}).click();
  await page.getByRole('button',{name:'Copy Slack script',exact:true}).click();
  await expect(page.getByLabel('Close Slack instructions')).toBeVisible({timeout:60_000});
  await expect(page.getByLabel('Exported image resolutions')).toContainText(`${stillCount} still at 128×128`);
  await expect(page.getByLabel('Exported image resolutions')).toContainText(`${animatedCount} animated at 64×64`);
  const script = await page.evaluate(() => (window as any).copiedEmojiScript as string);
  expect(Buffer.byteLength(script)).toBeLessThan(8_000_000);
  const probe = await context.newPage();
  const cdp = await context.newCDPSession(probe);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:2});
  const metrics = await probe.evaluate(async script => {
    let last=performance.now(), maxGap=0, frame=0;
    const tick=()=>{const now=performance.now();maxGap=Math.max(maxGap,now-last);last=now;frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);
    await new Promise(resolve=>setTimeout(resolve,40));
    let error='';
    try { await (0,eval)(script); } catch(e) { error=String(e); }
    await new Promise(resolve=>setTimeout(resolve,40));
    cancelAnimationFrame(frame);
    return {maxGap,error};
  },script);
  // Hostname validation follows full payload decoding; no Slack API is called.
  expect(metrics.error).toContain('Run this script on your Slack workspace');
  await test.info().attach('full-slack-decode.json',{body:JSON.stringify({...metrics,scriptBytes:Buffer.byteLength(script)}),contentType:'application/json'});
  expect(metrics.maxGap).toBeLessThan(500);
  await probe.close();
});
