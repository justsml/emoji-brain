import {test,expect,type Page} from '@playwright/test';

async function slowExport(page: Page, context: any) {
  // A headless page can refuse the real clipboard when it isn't focused.
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {value: {writeText: async () => {}}}));
  // Each delivered image takes a while, so the export is long enough to watch.
  await context.route(/\/emoji-delivery\/(64|128|256)\//, async (route: any) => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    await route.continue().catch(() => {});
  });
  await page.goto('/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  for (let i = 0; i < 8; i++) await page.locator('[role="gridcell"] button').nth(i).click();
}

test('a running export takes over the screen after 150ms, with live progress', async ({page, context}) => {
  await slowExport(page, context);
  await page.getByRole('button', {name: 'Copy Slack script', exact: true}).click();
  const overlay = page.getByRole('dialog', {name: 'Building your Slack script'});
  await expect(overlay).toBeAttached();
  // Present at once, but not yet visible: the grace period is a CSS delay.
  expect(await overlay.evaluate(el => getComputedStyle(el).animationDelay)).toBe('0.15s');
  await expect.poll(() => overlay.evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1);
  const box = await overlay.boundingBox();
  expect(box).toMatchObject({x: 0, y: 0, width: page.viewportSize()!.width, height: page.viewportSize()!.height});
  const bar = overlay.getByRole('progressbar');
  await expect(overlay.locator('.export-overlay-stage')).toContainText('Gathering images');
  await expect(overlay).toContainText(/\d+ of \d+/);
  await expect(bar).toHaveAttribute('aria-valuenow', /^\d+$/);
  // focus is on the way out
  await expect(overlay.getByRole('button', {name: 'Cancel export', exact: true})).toBeFocused();
  // and it finishes: the overlay goes, the instructions arrive
  await expect(overlay).toHaveCount(0, {timeout: 30000});
  await expect(page.getByRole('region').filter({hasText: 'Three steps to get them into Slack'})).toBeVisible();
});

test('clicking Cancel stops the export and returns focus to where it started', async ({page, context}) => {
  await slowExport(page, context);
  const start = page.getByRole('button', {name: 'Copy Slack script', exact: true});
  await start.click();
  const overlay = page.getByRole('dialog', {name: 'Building your Slack script'});
  await overlay.getByRole('button', {name: 'Cancel export', exact: true}).click();
  await expect(overlay).toHaveCount(0);
  await expect(page.locator('.sheet-status')).toContainText('Export canceled');
  await expect(start).toBeFocused();
  await expect(start).toBeEnabled();
  await expect.poll(() => page.workers().filter(w => w.url().includes('export.worker')).length).toBe(0);
  // nothing finished in the background
  await page.waitForTimeout(1500);
  await expect(page.getByText('Three steps to get them into Slack')).toHaveCount(0);
});

test('Escape cancels, and Tab cannot leave the overlay', async ({page, context}) => {
  await slowExport(page, context);
  await page.getByRole('button', {name: 'Copy Slack script', exact: true}).click();
  const overlay = page.getByRole('dialog', {name: 'Building your Slack script'});
  const cancel = overlay.getByRole('button', {name: 'Cancel export', exact: true});
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(overlay).toHaveCount(0);
  await expect(page.locator('.sheet-status')).toContainText('Export canceled');
});

test('the ZIP export gets the same overlay with its own title', async ({page, context}) => {
  await context.route('**/emoji-delivery/original/**', async route => { await new Promise(r => setTimeout(r, 2500)); await route.continue().catch(() => {}); });
  await page.goto('/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await page.locator('[role="gridcell"] button').first().click();
  await page.getByRole('button', {name: 'Other export options'}).click();
  await page.getByRole('button', {name: /^Originals/}).click();
  const overlay = page.getByRole('dialog', {name: 'Building your ZIP'});
  await expect(overlay).toBeVisible();
  await overlay.getByRole('button', {name: 'Cancel export', exact: true}).click();
  await expect(overlay).toHaveCount(0);
});
