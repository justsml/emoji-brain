import {test, expect} from '@playwright/test';
import {installMetrics, begin, snapshot, cpuMetrics} from './metrics';

test('selection scrolling: slow, rapid reversals and Home End jumps', async ({page}, testInfo) => {
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
  const report: Record<string, unknown> = {load: await snapshot(page)};
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.mouse.move(700, 500);
  for (const phase of ['slow', 'rapid', 'jumps']) {
    // Let the preceding native wheel animation finish before resetting metrics.
    await page.waitForTimeout(500);
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
      expect.soft(Math.max(...positions)).toBeGreaterThan(height - 1100);
      for (let i = 0; i < positions.length; i++) {
        if (i % 2) expect.soft(positions[i]).toBeLessThan(10);
        else expect.soft(positions[i]).toBeGreaterThan(height - 1100);
      }
    }
    const metrics = await snapshot(page);
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
