import { test, expect } from '@playwright/test';
import { installMetrics, begin, snapshot, throttle, profiles } from './metrics';

for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
  test(`workspace remains responsive at ${viewport.width}px with 4× CPU throttling`, async ({page}, testInfo) => {
    await page.setViewportSize(viewport);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', {rate: 4});
    await installMetrics(page);
    const workers: string[] = [];
    page.on('worker', worker => workers.push(worker.url()));
    await page.goto('/');
    await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
    expect(workers).toEqual([]);
    await page.waitForTimeout(300);
    await begin(page, 'workspace');
    const started = Date.now();
    await page.getByRole('button', {name: 'Expand selected emojis'}).click();
    const panel = page.getByRole('dialog', {name: 'Emoji workspace'});
    await expect(panel.locator('.workspace-pick')).toHaveCount(48);
    const openMs = Date.now() - started;
    for (let i = 0; i < 6; i++) {
      await panel.locator('.workspace-related').first().click();
      await expect(panel.locator('.workspace-pick')).toHaveCount(12);
      await panel.locator('.workspace-pick').first().click();
      await page.waitForTimeout(150);
    }
    const metrics = await snapshot(page);
    console.log(JSON.stringify({viewport, openMs, workers, ...metrics}));
    await testInfo.attach('workspace-metrics.json', {body: JSON.stringify({viewport, openMs, workers, ...metrics}, null, 2), contentType: 'application/json'});
    expect(workers.filter(url => url.includes('similar.worker'))).toHaveLength(1);
    expect(openMs).toBeLessThan(1500);
    expect(metrics.p95FrameGapMs).toBeLessThan(35);
    expect(metrics.maxLongTaskMs).toBeLessThan(150);
    await cdp.detach();
  });
}

for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
  test(`all panels and bulk inversion stay responsive at ${viewport.width}px on 4G with 4× CPU throttling`, async ({page}, testInfo) => {
    await page.setViewportSize(viewport);
    const {cdp} = await throttle(page, {...profiles[0], cpuRate: 4});
    await installMetrics(page);
    await page.goto('/');
    await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
    const total = await page.locator('.emoji-card').count();
    await page.waitForTimeout(300);
    await begin(page, 'bulk-panel-interactions');
    const latencies: number[] = [];
    for (let i = 0; i < 4; i++) {
      const started = Date.now();
      await page.getByRole('button', {name: 'Invert visible selection', exact: true}).click();
      if (i % 2) await expect(page.getByLabel(`${total} selected`, {exact: true})).toBeVisible();
      else await expect(page.getByText('No emojis selected')).toBeVisible();
      latencies.push(Date.now() - started);
    }
    await page.getByRole('button', {name: 'Expand selected emojis'}).click();
    const panel = page.getByRole('dialog', {name: 'Emoji workspace'});
    await expect(panel.locator('.workspace-pick')).toHaveCount(48);
    await panel.getByRole('button', {name: /Show 48 more/}).click();
    await expect(panel.locator('.workspace-pick')).toHaveCount(96);
    await panel.getByRole('button', {name: /Invert visible selection/}).click();
    await expect(panel.locator('.workspace-pick')).toHaveCount(0);
    await panel.getByRole('button', {name: /Invert visible selection/}).click();
    await expect(panel.locator('.workspace-pick')).toHaveCount(96);
    await panel.getByRole('button', {name: 'Similar to 10-10.webp', exact: true}).click();
    await expect(panel.locator('.workspace-pick')).toHaveCount(12);
    await panel.locator('.workspace-pick').first().click();
    await expect(page.getByLabel(`${total - 1} selected`, {exact: true})).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', {name: 'Other export options'}).click();
    const menu = page.getByRole('menu', {name: 'Export options'});
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitemradio', {name: /256/}).first().click();
    await menu.getByRole('menuitemradio', {name: /Best fit/}).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', {name: /Choose the image size/}).click();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByPlaceholder('Search emojis...').fill('cat');
    await expect(page.locator('.emoji-card')).not.toHaveCount(total);
    const before = await page.locator('.emoji-card[aria-pressed=true]').count();
    const visible = await page.locator('.emoji-card').count();
    await page.getByRole('button', {name: 'Invert visible selection', exact: true}).click();
    await expect(page.locator('.emoji-card[aria-pressed=true]')).toHaveCount(visible - before);
    await page.waitForTimeout(200);
    const metrics = await snapshot(page);
    const report = {viewport, cpuRate: 4, network: '4G, 40ms latency, 4Mbps', latencies, ...metrics};
    console.log(JSON.stringify(report));
    await testInfo.attach('bulk-panel-metrics.json', {body: JSON.stringify(report, null, 2), contentType: 'application/json'});
    expect(Math.max(...latencies)).toBeLessThan(1000);
    expect(metrics.p95FrameGapMs).toBeLessThan(35);
    expect(metrics.maxFrameGapMs).toBeLessThan(150);
    expect(metrics.maxLongTaskMs).toBeLessThan(100);
    await cdp.detach();
  });
}

for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
  const cpuRate = viewport.width < 768 ? 4 : 2;
  test.describe(`discovery input at ${viewport.width}px`, () => {
  test.use({hasTouch:viewport.width<768,isMobile:viewport.width<768});
  test(`theme and color discovery stays responsive at ${viewport.width}px with ${cpuRate}× CPU throttling`, async ({page},testInfo) => {
    await page.setViewportSize(viewport);
    await installMetrics(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpuRate});
    await page.goto('/');
    await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
    await page.waitForTimeout(300);
    if (process.env.DISCOVERY_TRACE) await page.context().browser()!.startTracing(page,{path:testInfo.outputPath('discovery-trace.json'),categories:['devtools.timeline','blink.user_timing']});
    await begin(page,'theme-color-discovery');
    for (const limit of [20,5,10]) await page.getByRole('button',{name:`Show ${limit} themes`}).click();
    for (const word of ['cat','happy','blob']) {
      await page.getByRole('button',{name:`Filter ${word}`,exact:true}).click();
      await expect(page.locator('.emoji-card')).not.toHaveCount(351);
      await page.getByRole('button',{name:'Reset',exact:true}).click();
      await expect(page.locator('.emoji-card')).toHaveCount(351);
    }
    for (const color of ['red','blue','yellow','green']) {
      await page.getByRole('button',{name:`Sort ${color} first`}).click();
      await expect(page.locator('.emoji-card')).toHaveCount(351);
      await page.waitForTimeout(100);
    }
    await page.getByRole('button',{name:'Reset',exact:true}).click();
    const metrics = await snapshot(page);
    if (process.env.DISCOVERY_TRACE) await page.context().browser()!.stopTracing();
    console.log(JSON.stringify({viewport,cpuRate,...metrics}));
    await testInfo.attach('discovery-metrics.json',{body:JSON.stringify({viewport,cpuRate,...metrics},null,2),contentType:'application/json'});
    expect(metrics.p95FrameGapMs).toBeLessThan(35);
    expect(metrics.maxLongTaskMs).toBeLessThan(100);
    expect(metrics.maxFrameGapMs).toBeLessThan(150);
    await cdp.detach();
  });
  });
}
