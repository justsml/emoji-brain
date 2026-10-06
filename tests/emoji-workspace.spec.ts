import { test, expect } from '@playwright/test';
import { startWithFullSheet } from './fullSheet';

// Exercises a sheet that already has stickers on it.
test.beforeEach(({page}) => startWithFullSheet(page));

for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
  test.describe(`workspace at ${viewport.width}px`, () => {
    test.use({viewport, hasTouch: viewport.width < 768, isMobile: viewport.width < 768});
    test('expands a bounded sheet, finds similar stickers, preserves focus and selection', async ({page}) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('/');
      await expect(page.locator('astro-island[component-export="default"][ssr]')).toHaveCount(0);
      await expect(page.locator('.sheet-chip')).toHaveCount(12);
      await page.getByRole('button', {name: 'Expand selected emojis'}).click();
      const panel = page.getByRole('dialog', {name: 'Emoji workspace'});
      await expect(panel).toBeVisible();
      await expect(panel.locator('.workspace-pick')).toHaveCount(48);
      await panel.getByRole('button', {name: /Show 48 more/}).click();
      await expect(panel.locator('.workspace-pick')).toHaveCount(96);
      const rect = await panel.boundingBox();
      expect(rect!.x).toBeGreaterThanOrEqual(0);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewport.width);
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(viewport.height);
      await panel.getByRole('button', {name: 'Similar to 10-10.webp', exact: true}).click();
      await expect(panel.locator('.workspace-source')).toContainText('10-10');
      await expect(panel.locator('.workspace-pick')).toHaveCount(12);
      const pick = panel.locator('.workspace-pick').first();
      await expect(pick).toHaveAttribute('aria-pressed', 'true');
      await pick.click();
      await expect(pick).toHaveAttribute('aria-pressed', 'false');
      await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0);
      await expect(page.getByRole('button', {name: 'Expand selected emojis'})).toBeFocused();
      const card = page.getByRole('button', {name: '10-10.webp', exact: true});
      await card.click();
      const actions = page.getByRole('group', {name: 'Actions for 10-10'});
      await expect(actions).toBeVisible();
      await actions.getByRole('button', {name: 'Similar', exact: true}).click();
      await expect(panel.locator('.workspace-pick')).toHaveCount(12);
      await panel.getByRole('button', {name: 'Close emoji workspace'}).click();
      await expect(card).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      expect(errors).toEqual([]);
    });
  });
}
