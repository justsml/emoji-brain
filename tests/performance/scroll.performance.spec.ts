import {test, expect} from '@playwright/test';
import {createHash} from 'node:crypto';
import {installMetrics, begin, snapshot, cpuMetrics} from './metrics';

for (const scenario of [
  {name: 'desktop-small', viewport: {width: 1440, height: 1000}, size: 'Small'},
  {name: 'desktop-xl', viewport: {width: 1440, height: 1000}, size: 'Extra large'},
  {name: 'mobile-small', viewport: {width: 390, height: 844}, size: 'Small'},
  {name: 'mobile-xl', viewport: {width: 390, height: 844}, size: 'Extra large'},
]) test.describe(scenario.name, () => {
 test.use({viewport: scenario.viewport});
 test('selection scrolling: slow, rapid reversals and Home End jumps', async ({page}, testInfo) => {
  const browserSession = await page.context().browser()!.newBrowserCDPSession();
  const {gpu} = await browserSession.send('SystemInfo.getInfo');
  await browserSession.detach();
  await installMetrics(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', {rate: 2});
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('grid', {name: 'Emoji results'}).waitFor();
  await page.getByTitle('Select All Visible', {exact: true}).waitFor();
  // Reproduce the rejected containment experiment without changing product CSS.
  if (process.env.SCROLL_CONTAINMENT_EXPERIMENT) await page.addStyleTag({content: '.emoji-cell:has(.emoji-card-selected):not(:hover):not(:focus-within) {content-visibility: auto; contain: layout style paint;}'});
  if (process.env.SCROLL_LAYER_EXPERIMENT) await page.addStyleTag({content: '.emoji-card-image {will-change: transform;}'});
  if (process.env.SCROLL_PAINT_EXPERIMENT === 'shadows') await page.addStyleTag({content: '.emoji-card-image {filter: none !important;}'});
  const report: Record<string, unknown> = {load: await snapshot(page), scenario, browser: page.context().browser()!.version(), renderer: {devices: gpu.devices, features: gpu.featureStatus}};
  await page.getByRole('radio', {name: scenario.size, exact: true}).check();
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.mouse.move(scenario.viewport.width / 2, 500);
  for (const phase of ['slow', 'rapid', 'jumps']) {
    // Let the preceding native wheel animation finish before resetting metrics.
    await page.waitForTimeout(500);
    if (process.env.SCROLL_TRACE && phase === 'rapid') await page.context().browser()!.startTracing(page, {path: testInfo.outputPath('scroll-trace.json'), categories: ['cc', 'benchmark', 'viz', 'devtools.timeline', 'blink.user_timing', 'disabled-by-default-devtools.timeline.frame']});
    await begin(page, phase);
    const before = await cpuMetrics(cdp);
    const positions: number[] = [];
    if (phase === 'jumps') {
      for (let i = 0; i < 12; i++) {
        await page.evaluate(bottom => window.scrollTo({top: bottom ? document.documentElement.scrollHeight : 0, behavior: 'instant'}), i % 2 === 0);
        await page.waitForTimeout(150);
        positions.push(await page.evaluate(() => window.scrollY));
      }
    } else {
      for (let i = 0; i < 60; i++) {
        await page.mouse.wheel(0, (Math.floor(i / (phase === 'slow' ? 30 : 3)) % 2 ? -1 : 1) * (phase === 'slow' ? 90 : 1200));
        await page.waitForTimeout(phase === 'slow' ? 35 : 16);
      }
    }
    if (phase === 'jumps') {
      expect.soft(Math.max(...positions)).toBeGreaterThan(height - scenario.viewport.height - 5);
      for (let i = 0; i < positions.length; i++) {
        if (i % 2) expect.soft(positions[i]).toBeLessThan(10);
        else expect.soft(positions[i]).toBeGreaterThan(height - scenario.viewport.height - 5);
      }
    }
    const metrics = await snapshot(page);
    if (process.env.SCROLL_TRACE && phase === 'rapid') {
      await page.waitForTimeout(400);
      const trace = await page.context().browser()!.stopTracing();
      const events = JSON.parse(trace.toString()).traceEvents;
      // result_id is uint64 and loses precision in JSON.parse; count the
      // begin events directly rather than merging distinct frames by rounded id.
      const scrollFrames: {is_janky: boolean}[] = [];
      for (const event of events) {
        const data = event.args?.scroll_jank_v4;
        if (event.name === 'ScrollJankV4' && event.ph === 'b' && data) scrollFrames.push(data);
      }
      report.compositor = {
        source: 'Chromium ScrollJankV4',
        scrollFrames: scrollFrames.length,
        jankyScrollFrames: scrollFrames.filter(frame => frame.is_janky).length,
        traceSha256: createHash('sha256').update(trace).digest('hex'),
      };
      expect.soft(scrollFrames.length).toBeGreaterThan(20);
    }
    report[phase] = {...metrics, positions, before, after: await cpuMetrics(cdp)};
    expect.soft(metrics.p95FrameGapMs).toBeLessThan(35);
    expect.soft(metrics.maxFrameGapMs).toBeLessThan(150);
    expect.soft(metrics.maxLongTaskMs).toBeLessThan(100);
  }
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(height);
  expect(errors).toEqual([]);
  await testInfo.attach('scroll-metrics.json', {body: JSON.stringify(report, null, 2), contentType: 'application/json'});
  console.log(JSON.stringify(report));
  await cdp.detach();
});

});
