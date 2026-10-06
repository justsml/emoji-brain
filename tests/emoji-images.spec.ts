import { test, expect, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { startWithFullSheet } from './fullSheet';

// Exercises a sheet that already has stickers on it.
test.beforeEach(({page}) => startWithFullSheet(page));

const catalog = JSON.parse(await fs.readFile('src/data/emoji-metadata.json', 'utf8')).emojis as {filename: string}[];

test('every catalog preview decodes in the browser at all three delivered sizes', async ({page}, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/');
  const urls = catalog.flatMap(emoji => [64, 128, 256].map(size => `/emoji-delivery/previews/${size}/${encodeURIComponent(emoji.filename.replace(/\.[^.]+$/, ''))}.webp`));
  const failed = await page.evaluate(async urls => {
    const failed: string[] = [];
    // Keep decoding bounded; this audits bytes without mounting 1,053 images.
    for (let i = 0; i < urls.length; i += 8) {
      await Promise.all(urls.slice(i, i + 8).map(async url => {
        const image = new Image();
        image.src = url;
        try { await image.decode(); if (!image.naturalWidth || !image.naturalHeight) failed.push(url); }
        catch { failed.push(url); }
      }));
    }
    return failed;
  }, urls);
  await testInfo.attach('preview-decode-audit.json', {body: JSON.stringify({catalogCount: catalog.length, checked: urls.length, failed}), contentType: 'application/json'});
  expect(failed).toEqual([]);
});

async function assertVisibleImages(page: Page, images: Locator) {
  await expect.poll(() => images.evaluateAll(images => images.filter(image => {
    const rect = image.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight) return false;
    const scroll = image.closest('.workspace-scroll');
    if (scroll) {
      const bounds = scroll.getBoundingClientRect();
      if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) return false;
    }
    const img = image as HTMLImageElement;
    return !img.complete || !img.naturalWidth || !img.naturalHeight || img.dataset.previewUnavailable === 'true';
  }).length), {timeout: 5000}).toBe(0);
}

for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
  test(`selected artwork stays painted after rapid jumps at ${viewport.width}px`, async ({page}) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
    await page.mouse.move(0, 0);
    for (const size of ['Small', 'Extra large']) {
      await page.getByRole('radio', {name: size, exact: true}).check();
      for (let i = 0; i < 8; i++) {
        await page.evaluate(bottom => scrollTo(0, bottom ? document.documentElement.scrollHeight : 0), i % 2 === 0);
        const image = page.getByRole('button', {name: i % 2 ? '10-10.webp' : 'weed.webp', exact: true}).locator('img');
        await expect.poll(() => image.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        const clip = await image.boundingBox();
        expect(clip).not.toBeNull();
        const pixels = await page.screenshot({clip: clip!, animations: 'disabled'});
        const stats = await sharp(pixels).stats();
        // A blank compositor tile contains only the nearly uniform mat/grid.
        // These two static stickers have substantial foreground contrast.
        expect(Math.max(...stats.channels.slice(0, 3).map(channel => channel.stdev))).toBeGreaterThan(15);
      }
    }
  });
}

for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
  test.describe(`panel images at ${viewport.width}px`, () => {
    test.use({viewport, hasTouch: viewport.width < 768, isMobile: viewport.width < 768});
    test('all sheet/grid images load while scrolling; panels and selection survive theme changes', async ({page}) => {
      test.setTimeout(120_000);
      const errors: string[] = [], failed: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.url().includes('/emoji-delivery/') && response.status() >= 400) failed.push(response.url()); });
      await page.goto('/');
      await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
      const count = await page.locator('.emoji-card').count();
      for (let y = 0; y < await page.evaluate(() => document.documentElement.scrollHeight); y += viewport.height * .7) {
        await page.evaluate(y => scrollTo(0, y), y);
        await assertVisibleImages(page, page.locator('.emoji-card img'));
      }
      await expect.poll(() => page.locator('.emoji-card img').evaluateAll(images => images.filter(image => !(image as HTMLImageElement).naturalWidth).length)).toBe(0);
      await page.getByRole('button', {name: 'Expand selected emojis'}).click();
      const panel = page.getByRole('dialog', {name: 'Emoji workspace'});
      await expect(panel.locator('.workspace-pick')).toHaveCount(Math.min(48, count));
      for (let shown = 48; shown < count; shown += 48) {
        await panel.getByRole('button', {name: /Show 48 more/}).click();
        await expect(panel.locator('.workspace-pick')).toHaveCount(Math.min(shown + 48, count));
      }
      await expect(panel.locator('.workspace-pick')).toHaveCount(count);
      const scroll = panel.locator('.workspace-scroll');
      const height = await scroll.evaluate(element => element.scrollHeight);
      const step = await scroll.evaluate(element => element.clientHeight * .65);
      for (let y = 0; y < height; y += step) {
        await scroll.evaluate((element, y) => { element.scrollTop = y; }, y);
        await assertVisibleImages(page, panel.locator('img'));
      }
      await expect.poll(() => panel.locator('img').evaluateAll(images => images.filter(image => !(image as HTMLImageElement).naturalWidth).length)).toBe(0);
      await panel.getByRole('button', {name: 'Similar to 10-10.webp', exact: true}).click();
      await expect(panel.locator('.workspace-pick')).toHaveCount(12);
      await assertVisibleImages(page, panel.locator('img'));
      await panel.locator('.workspace-pick').first().click();
      await expect(page.getByLabel(`${count - 1} selected`, {exact: true})).toBeVisible();
      await page.keyboard.press('Escape');
      await page.evaluate(() => scrollTo(0, 0));
      await page.getByRole('button', {name: /Switch to .* theme/}).click();
      await page.getByRole('button', {name: 'Expand selected emojis'}).click();
      await expect(panel).toBeVisible();
      await assertVisibleImages(page, panel.locator('img'));
      await page.keyboard.press('Escape');
      await page.getByRole('button', {name: 'Other export options'}).click();
      const exportPanel = page.getByRole('menu', {name: 'Export options'});
      await expect(exportPanel).toBeVisible();
      await exportPanel.getByRole('menuitemradio', {name: /256/}).first().click();
      await expect(exportPanel.getByRole('menuitemradio', {name: /256/}).first()).toHaveAttribute('aria-checked', 'true');
      await exportPanel.getByRole('menuitemradio', {name: /Best fit/}).click();
      await expect(exportPanel.getByRole('menuitemradio', {name: /Best fit/})).toHaveAttribute('aria-checked', 'true');
      await page.keyboard.press('Escape');
      await page.getByRole('button', {name: /Choose the image size/}).click();
      await expect(exportPanel).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByLabel(`${count - 1} selected`, {exact: true})).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      expect(failed).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}
