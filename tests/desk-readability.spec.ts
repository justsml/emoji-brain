import { test, expect } from '@playwright/test';

for (const theme of ['light', 'dark']) {
  for (const width of [1440, 375]) {
    test(`desk controls remain readable in ${theme} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
      await page.goto('/');
      await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      const tray = page.locator('.sheet-tray');
      const copy = page.getByRole('button', { name: 'Copy Slack script', exact: true });
      await expect(copy).toBeDisabled();
      await expect(copy).toHaveCSS('opacity', '1');
      await expect(copy).toHaveCSS('color', 'rgb(66, 48, 36)');
      const checkTools = async () => {
        const tools = tray.locator('.sheet-tool');
        expect(await tools.count()).toBeGreaterThanOrEqual(4);
        for (const tool of await tools.all()) {
          await expect(tool).toHaveCSS('opacity', '1');
          const contrast = await tool.evaluate(el => {
            const style = getComputedStyle(el);
            const luminance = (color: string) => {
              const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(n => {
                const c = n / 255;
                return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
              });
              return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
            };
            const ink = luminance(style.color), surface = luminance(style.backgroundColor);
            return (Math.max(ink, surface) + 0.05) / (Math.min(ink, surface) + 0.05);
          });
          expect(contrast).toBeGreaterThanOrEqual(4.5);
        }
      };
      await checkTools();
      const mobileLayout = width < 560 ? {
        tray: await tray.boundingBox(),
        copy: await copy.boundingBox(),
        select: await tray.locator('[title="Select All Visible"]').boundingBox(),
      } : null;
      const checkMobileLayout = async () => {
        if (!mobileLayout) return;
        await expect(tray.locator('.sheet-strip')).toBeHidden();
        for (const [key, locator] of [
          ['tray', tray], ['copy', copy], ['select', tray.locator('[title="Select All Visible"]')],
        ] as const) {
          const before = mobileLayout[key]!, after = (await locator.boundingBox())!;
          for (const dimension of ['x', 'y', 'width', 'height'] as const) {
            expect(Math.abs(after[dimension] - before[dimension])).toBeLessThanOrEqual(1);
          }
        }
      };
      // If the two masks add instead of excluding, the rubber band covers
      // the entire laminate and leaves dark controls on a dark slab.
      expect(await tray.evaluate(el => getComputedStyle(el, '::before').maskComposite)).toContain('exclude');
      expect(await tray.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
      })).toBe(true);
      await page.locator('.emoji-card').first().click();
      await expect(copy).toBeEnabled();
      await expect(copy).toHaveCSS('color', 'rgb(255, 255, 255)');
      await checkTools();
      await checkMobileLayout();
      if (mobileLayout) {
        await tray.locator('[title="Select All Visible"]').click();
        await expect(page.locator('.emoji-card[aria-pressed=true]')).toHaveCount(await page.locator('.emoji-card').count());
        await checkMobileLayout();
        await page.getByRole('button', { name: 'Clear all selected emojis', exact: true }).click();
        await expect(copy).toBeDisabled();
        await checkMobileLayout();
        await page.locator('.emoji-card').first().click();
      }
      await page.getByRole('button', { name: 'Other export options' }).click();
      const menu = page.getByRole('group', { name: 'Export options' });
      await expect(menu).toBeVisible();
      await expect(menu).toHaveCSS('color', 'rgb(46, 31, 21)');
      await expect(menu.getByRole('button', { name: /Originals/ })).toBeVisible();
    });
  }
}
