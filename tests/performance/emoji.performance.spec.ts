import {test, expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {profiles, throttle, installMetrics, begin, snapshot, cpuMetrics} from './metrics';

const manifest = JSON.parse(await fs.readFile('public/emoji-delivery/manifest.json', 'utf8'));
const catalog = Object.keys(manifest.items);
const expectedBytes = catalog.reduce((n,name)=>n+manifest.items[name].variants[manifest.items[name].animated?'64':'128'].webp.bytes,0);

test('sampler detects a deliberate main-thread freeze', async ({page, context}, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await installMetrics(page);
  await page.goto('/');await page.getByRole('grid', {name:'Emoji results'}).waitFor();
  await begin(page,'instrumentation-control');
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await page.evaluate(()=>new Promise<void>(resolve=>setTimeout(()=>{const end=performance.now()+650;while(performance.now()<end){/* Deliberate page task, never product code. */}resolve();},0)));
  await page.waitForTimeout(100);
  const metrics=await snapshot(page);
  await testInfo.attach('instrumentation-control.json',{body:JSON.stringify(metrics,null,2),contentType:'application/json'});
  expect(metrics.maxLongTaskMs).toBeGreaterThanOrEqual(600);
  expect(metrics.maxFrameGapMs).toBeGreaterThanOrEqual(600);
});

for (const profile of profiles) test(`${profile.name}: cold load, scrolling and full Slack export`, async ({page, context}, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const {cdp, networkEvidence} = await throttle(page, profile);
  await installMetrics(page);
  const requests: string[] = [], errors: string[] = [];
  page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('PAGE CRASH'));
  const report: Record<string, unknown> = {profile,catalogCount:catalog.length,expectedImageBytes:expectedBytes,browser:context.browser()?.version(),viewport:page.viewportSize(),host:{platform:process.platform,arch:process.arch}};
  try {
    const started=Date.now();
    await page.goto('/', {waitUntil:'domcontentloaded'});
    await page.getByRole('grid', {name:'Emoji results'}).waitFor();
    await page.getByTitle('Select All Visible', {exact:true}).waitFor();
    report.readyMs=Date.now()-started;report.load=await snapshot(page);
    expect.soft(report.readyMs).toBeLessThan(profile.readyBudgetMs);
    expect(requests.filter(url=>url.includes('/pagefind/'))).toHaveLength(0);
    const initialResources=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({name:r.name,bytes:(r as PerformanceResourceTiming).transferSize})));
    report.initialTransferBytes=initialResources.reduce((n,r)=>n+r.bytes,0);
    expect.soft(report.initialTransferBytes).toBeLessThan(3_500_000);

    await begin(page,'scroll');const scrollCpuBefore=await cpuMetrics(cdp);
    const height=await page.evaluate(()=>document.documentElement.scrollHeight);
    // Native wheel input, with partially loaded images: top -> bottom -> top.
    // Fixed input cadence comes from the driver, not the potentially blocked page.
    const positions:number[]=[];
    for(const direction of [1,-1])for(let i=0;i<24;i++){
      await page.mouse.wheel(0,direction*600);await page.waitForTimeout(80);
      positions.push(await page.evaluate(()=>window.scrollY));
    }
    report.scroll=await snapshot(page);report.scrollCpuBefore=scrollCpuBefore;report.scrollCpuAfter=await cpuMetrics(cdp);
    expect(Math.max(...positions)).toBeGreaterThan(height-1200);
    expect(positions.at(-1)).toBeLessThan(100);
    expect.soft(Math.abs(await page.evaluate(()=>document.documentElement.scrollHeight)-height)).toBeLessThan(4);
    const scroll=report.scroll as Awaited<ReturnType<typeof snapshot>>;
    expect.soft(scroll.frames).toBeGreaterThan(100);
    expect.soft(scroll.p95FrameGapMs).toBeLessThan(50);
    expect.soft(scroll.maxFrameGapMs).toBeLessThan(500);
    expect.soft(scroll.maxLongTaskMs).toBeLessThan(500);

    await page.getByTitle('Select All Visible', {exact:true}).click();
    await expect(page.getByLabel(`${catalog.length} selected`,{exact:true})).toBeVisible();
    const input=page.getByPlaceholder('Search emojis...');
    await begin(page,'export');report.exportCpuBefore=await cpuMetrics(cdp);
    const exportStarted=Date.now();
    const workerCreated=page.waitForEvent('worker',w=>w.url().includes('export.worker'));
    await page.getByRole('button',{name:'Copy Slack script',exact:true}).click();await workerCreated;
    const inputLatencies:number[]=[];let probes=0;
    // Poll and interact throughout fetching, encoding and the real clipboard write.
    while(!await page.evaluate(()=>(window as any).__perf.copiedAt>0)){
      if(Date.now()-exportStarted>profile.exportBudgetMs)throw Error('Slack export exceeded its wall-clock budget');
      const start=Date.now();await input.fill(probes%2?'roo':'cat',{timeout:2000});
      await expect(input).toHaveValue(probes%2?'roo':'cat',{timeout:2000});
      inputLatencies.push(Date.now()-start);probes++;
      await page.mouse.wheel(0,probes%2?200:-200);
      await page.waitForTimeout(500);
    }
    report.exportMs=Date.now()-exportStarted;report.export=await snapshot(page);report.exportCpuAfter=await cpuMetrics(cdp);
    report.inputProbes=probes;report.maxInputRoundTripMs=Math.max(...inputLatencies);report.workers=networkEvidence();
    const exported=report.export as Awaited<ReturnType<typeof snapshot>>;
    expect.soft(probes).toBeGreaterThan(3);
    expect.soft(report.maxInputRoundTripMs).toBeLessThan(1000);
    expect.soft(exported.p95FrameGapMs).toBeLessThan(50);
    expect.soft(exported.maxFrameGapMs).toBeLessThan(500);
    expect.soft(exported.maxLongTaskMs).toBeLessThan(500);
    const workers=networkEvidence();
    expect(workers.filter(w=>w.url.includes('export.worker'))).toHaveLength(1);
    const exportNetwork=workers.find(w=>w.url.includes('export.worker'))!;
    expect(exportNetwork.networkApplied).toBe(true);
    expect(exportNetwork.throttledRequests).toBeGreaterThanOrEqual(catalog.length);
    expect(exportNetwork.throttledRequests).toBe(exportNetwork.requests);
    expect.soft(report.exportMs).toBeGreaterThan(expectedBytes/profile.downloadThroughput*1000*.7);
    await expect(page.getByLabel('Close Slack instructions')).toBeVisible();
    await expect.poll(()=>page.workers().filter(w=>w.url().includes('export.worker')).length).toBe(0);
    // Capture/parse after performance sampling, outside the measured workload.
    const script=await page.evaluate(()=>(window as any).__perf.script as string);
    report.scriptBytes=Buffer.byteLength(script);report.scriptSha256=createHash('sha256').update(script).digest('hex');
    expect(report.scriptBytes).toBeLessThan(8_000_000);
    expect(report.scriptBytes).toBeLessThan(expectedBytes*1.4+100_000);
    const packed=script.match(/const encoded = "([A-Za-z0-9+/=]+)"/);
    expect(packed,'Expected compact gzip payload').not.toBeNull();
    const images=JSON.parse(gunzipSync(Buffer.from(packed![1],'base64')).toString());
    expect(images).toHaveLength(catalog.length);expect(new Set(images.map((i:any)=>i.filename)).size).toBe(catalog.length);
    for(const image of images){
      expect(image.mimeType).toBe('image/webp');
      const row=manifest.items[image.filename.slice(0,-5)];
      const asset=row.variants[row.animated?'64':'128'].webp;
      const original=await fs.readFile('public'+asset.path);
      expect(createHash('sha256').update(Buffer.from(image.base64,'base64')).digest('hex')).toBe(createHash('sha256').update(original).digest('hex'));
    }
    const pagefind=requests.filter(url=>url.includes('/pagefind/'));
    expect(pagefind.filter(url=>new URL(url).pathname==='/pagefind/pagefind.js')).toHaveLength(1);
    expect(pagefind.filter(url=>url.includes('/fragment/'))).toHaveLength(0);
    expect(errors).toEqual([]);
  } catch(error) {
    report.failure=String(error);
    throw error;
  } finally {
    if(!report.export)report.interruptedPhase=await Promise.race([snapshot(page).catch(error=>({error:String(error)})),new Promise(resolve=>setTimeout(()=>resolve({error:'Page did not answer the final metrics probe within 2s'}),2000))]);
    report.testErrors=testInfo.errors.map(error=>error.message);
    report.errors=errors;report.workers=networkEvidence();
    await testInfo.attach('performance-metrics.json',{body:JSON.stringify(report,null,2),contentType:'application/json'});
    console.log(JSON.stringify(report));
    await cdp.detach();
  }
});
