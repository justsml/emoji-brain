import { test, expect } from '@playwright/test';
import { startWithFullSheet } from './fullSheet';

// Exercises a sheet that already has stickers on it.
test.beforeEach(({page}) => startWithFullSheet(page));

test.beforeEach(async ({page}) => {
  await page.goto('/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
});

test('inversion preserves hidden results, handles empty/full sheets, and persists', async ({page}) => {
  const total = await page.locator('.emoji-card').count();
  await page.getByRole('button', {name: 'Invert visible selection', exact: true}).click();
  await expect(page.getByText('No emojis selected')).toBeVisible();
  await page.getByRole('button', {name: 'Expand selected emojis'}).click();
  const panel = page.getByRole('dialog', {name: 'Emoji workspace'});
  await expect(panel).toContainText('Your sheet is empty');
  await panel.getByRole('button', {name: /Invert visible selection/}).click();
  await expect(page.getByLabel(`${total} selected`, {exact: true})).toBeVisible();
  await panel.getByRole('button', {name: 'Close emoji workspace'}).click();
  await page.getByPlaceholder('Search emojis...').fill('cat');
  await expect(page.locator('.emoji-card')).not.toHaveCount(total);
  const visible = await page.locator('.emoji-card').count();
  const first = page.locator('.emoji-card').first();
  const id = await first.getAttribute('aria-label');
  await first.click();
  await page.getByRole('button', {name: 'Invert visible selection', exact: true}).click();
  await expect(page.getByLabel(`${total - visible + 1} selected`, {exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: id!, exact: true})).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await expect(page.getByLabel(`${total - visible + 1} selected`, {exact: true})).toBeVisible();
  await page.getByRole('radio', {name: /Collected/}).check();
  await expect(page.locator('.emoji-card')).toHaveCount(total - visible + 1);
  await page.getByRole('button', {name: 'Clear all selected emojis'}).click();
  await expect(page.locator('.emoji-card')).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Invert visible selection', exact: true})).toBeDisabled();
});

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
    await page.getByRole('button', {name: 'Expand selected emojis'}).click();
    const panel = page.getByRole('dialog', {name: 'Emoji workspace'});
    await panel.getByRole('button', {name: 'Similar to 10-10.webp', exact: true}).click();
    await expect(panel.getByRole('button', {name: 'Retry suggestions'})).toBeVisible({timeout: 8000});
    await panel.getByRole('button', {name: /Sheet \d+/}).click();
    await expect(panel.locator('.workspace-pick')).toHaveCount(48);
    await panel.locator('.workspace-pick').first().click();
    await expect(page.getByLabel('350 selected', {exact: true})).toBeVisible();
    await panel.getByRole('button', {name: 'Similar', exact: true}).click();
    await page.evaluate(() => { (window as any).__workerFault = null; });
    await panel.getByRole('button', {name: 'Retry suggestions'}).click();
    await expect(panel.locator('.workspace-pick')).toHaveCount(12);
    await panel.getByRole('button', {name: 'Close emoji workspace'}).click();
    await expect(page.getByLabel('350 selected', {exact: true})).toBeVisible();
  });
}

test('failed primary previews use the small still fallback; fully failed previews remain selectable', async ({page}) => {
  let failAll = false;
  await page.route('**/emoji-delivery/**/10-10.webp', route => {
    if (!failAll && route.request().url().includes('/previews/64/')) return route.continue();
    return route.abort();
  });
  await page.reload();
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  const card = page.getByRole('button', {name: '10-10.webp', exact: true});
  await expect(card.locator('img')).toHaveAttribute('src', /previews\/64/);
  await expect.poll(() => card.locator('img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect.poll(() => card.locator('img').evaluate(img => (img as HTMLImageElement).currentSrc)).toContain('/previews/64/');
  failAll = true;
  await page.reload();
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await expect(card.locator('.emoji-card-preview')).toHaveAttribute('data-preview-unavailable', 'true');
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', {name: 'Expand selected emojis'}).click();
  await expect(page.getByRole('dialog', {name: 'Emoji workspace'})).toBeVisible();
});

test('a failed workspace chunk is contained and reload recovery preserves selection', async ({page}) => {
  await page.route('**/*EmojiWorkspace*.js', route => route.abort());
  await page.getByRole('button', {name: 'Expand selected emojis'}).click();
  await expect(page.getByRole('alert')).toContainText('Your selection is safe');
  await page.getByRole('button', {name: '10-10.webp', exact: true}).click();
  await expect(page.getByLabel('350 selected', {exact: true})).toBeVisible();
  await page.unroute('**/*EmojiWorkspace*.js');
  await page.getByRole('button', {name: 'Reload to retry'}).click();
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await expect(page.getByLabel('350 selected', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Expand selected emojis'}).click();
  await expect(page.getByRole('dialog', {name: 'Emoji workspace'})).toBeVisible();
  await expect(page.getByLabel('350 selected', {exact: true})).toBeVisible();
});
