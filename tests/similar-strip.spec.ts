import { test, expect, type Page } from '@playwright/test';
import { startWithFullSheet } from './fullSheet';
import metadata from '../src/data/emoji-metadata.json' with {type:'json'};

// A full sheet means every sticker in the strip starts out selected.
test.beforeEach(({page}) => startWithFullSheet(page));
test.beforeEach(async ({page}) => {
  await page.goto('/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
});

const strip = (page: Page) => page.getByRole('region', {name: 'Stickers similar to 10-10'});
async function openSimilar(page: Page) {
  await page.getByRole('button', {name: '10-10.webp', exact: true}).click();
  await page.getByRole('group', {name: 'Actions for 10-10'}).getByRole('button', {name: 'Similar', exact: true}).click();
}

for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
  test.describe(`similar strip at ${viewport.width}px`, () => {
    test.use({viewport, hasTouch: viewport.width < 768, isMobile: viewport.width < 768});

    test('opens above the tray, toggles, chains, and gives focus back on Esc', async ({page}) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const card = page.getByRole('button', {name: '10-10.webp', exact: true});
      await openSimilar(page);
      await expect(strip(page)).toBeVisible();
      await expect(strip(page).locator('.similar-pick')).toHaveCount(12);
      await expect(strip(page).getByRole('button', {name: 'Close similar stickers'})).toBeFocused();

      // Clear of the tray, inside the viewport, no page-wide overflow.
      const rect = (await strip(page).boundingBox())!;
      const tray = (await page.locator('.sheet-tray').boundingBox())!;
      expect(rect.y + rect.height).toBeLessThanOrEqual(tray.y);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
      expect(rect.height).toBeLessThan(viewport.height * .3);

      const pick = strip(page).locator('.similar-pick').first();
      await expect(pick).toHaveAttribute('aria-pressed', 'true');
      await pick.click();
      await expect(pick).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByLabel(`${metadata.total - 2} selected`, {exact: true})).toBeVisible();

      const name = (await pick.getAttribute('aria-label'))!;
      await strip(page).getByRole('button', {name: `Similar to ${name}`, exact: true}).click();
      await expect(page.getByRole('region', {name: `Stickers similar to ${name.replace(/\.[^.]+$/, '')}`})).toBeVisible();
      await expect(strip(page)).toHaveCount(0);

      await page.keyboard.press('Escape');
      await expect(page.locator('.similar-strip')).toHaveCount(0);
      await expect(card).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      expect(errors).toEqual([]);
    });

    test('closes from its control and from a tap on the grid, but not from the tray', async ({page}) => {
      await openSimilar(page);
      await strip(page).getByRole('button', {name: 'Close similar stickers'}).click();
      await expect(strip(page)).toHaveCount(0);
      await expect(page.getByRole('button', {name: '10-10.webp', exact: true})).toBeFocused();

      await openSimilar(page);
      await page.getByRole('button', {name: 'Invert visible selection', exact: true}).click();
      await expect(strip(page)).toBeVisible();
      await page.locator('.emoji-card').nth(3).click();
      await expect(strip(page)).toHaveCount(0);
    });
  });
}

for (const mode of ['constructor', 'error', 'hang', 'invalid', 'null'] as const) {
  test(`suggestions recover from ${mode} failure without losing the sheet`, async ({page}) => {
    await page.addInitScript(mode => {
      (window as any).__workerFault = mode;
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          if (String(url).includes('similar.worker') && (window as any).__workerFault === 'constructor') throw new Error('Injected startup failure');
          super(url, options);
        }
        postMessage(message: any) {
          const fault = (window as any).__workerFault;
          if (!fault) { super.postMessage(message); return; }
          if (fault === 'error') queueMicrotask(() => this.dispatchEvent(new ErrorEvent('error', {message: 'Injected worker error', cancelable: true})));
          if (fault === 'invalid') queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', {data: {sourceId: message.sourceId, ids: null}})));
          if (fault === 'null') queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', {data: null})));
          // 'hang' intentionally withholds a response to exercise the watchdog.
        }
      };
    }, mode);
    await page.reload();
    await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
    await openSimilar(page);
    await expect(strip(page).getByRole('alert')).toContainText('couldn’t load', {timeout: 8000});
    await page.evaluate(() => { (window as any).__workerFault = null; });
    await strip(page).getByRole('button', {name: 'Retry'}).click();
    await expect(strip(page).locator('.similar-pick')).toHaveCount(12);
    await page.keyboard.press('Escape');
    await expect(page.getByLabel(`${metadata.total - 1} selected`, {exact: true})).toBeVisible();
  });
}

test('a failed strip chunk is contained and the sheet survives', async ({page}) => {
  // Dev serves the .tsx source, a build serves a hashed .js; never the loader or the CSS.
  await page.route(/SimilarStrip(?!Loader)[^/]*\.(tsx|js)(\?|$)/, route => route.abort());
  await openSimilar(page);
  await expect(page.getByRole('alert')).toContainText('Your sheet is safe');
  await page.getByRole('button', {name: 'Close similar stickers'}).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel(`${metadata.total - 1} selected`, {exact: true})).toBeVisible();
});

test('the sheet flag no longer opens a panel', async ({page}) => {
  await expect(page.getByRole('button', {name: 'Expand selected emojis'})).toHaveCount(0);
});
