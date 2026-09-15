import {test, expect} from '@playwright/test';

test('cards keep row gaps and stable geometry at every sticker size', async ({page}) => {
  await page.goto('/');
  await page.getByTitle('Select All Visible', {exact: true}).waitFor();
  await page.waitForFunction(() => !document.querySelector('[role="grid"]')?.closest('astro-island')?.hasAttribute('ssr'));
  for (const width of [1440, 1920, 390]) {
    await page.setViewportSize({width, height: 900});
    for (const [size, gap] of [['Small', 12], ['Medium', 18], ['Large', 24], ['Extra large', 32]] as const) {
      await page.getByRole('radio', {name: size, exact: true}).check();
      await expect(page.getByRole('radio', {name: size, exact: true})).toBeChecked();
      await page.getByTitle('Select All Visible', {exact: true}).click();
      const measure = () => page.locator('[role="grid"]').evaluate(grid => {
        const cells = Array.from(grid.querySelectorAll<HTMLElement>('[role="gridcell"]'));
        const first = cells[0].getBoundingClientRect();
        const next = cells.find(cell => cell.getBoundingClientRect().top > first.top + 1)!;
        const card = cells[0].querySelector('button')!.getBoundingClientRect();
        return {height: grid.getBoundingClientRect().height, cellHeight: first.height,
          cardHeight: card.height, gap: next.getBoundingClientRect().top - card.bottom};
      });
      const before = await measure();
      expect(before.gap, `${width}px ${size}: row gap`).toBeGreaterThanOrEqual(gap - 0.1);
      expect(before.cardHeight, `${width}px ${size}: card stays in cell`).toBeLessThanOrEqual(before.cellHeight + 0.1);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(150);
      expect(await measure()).toEqual(before);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
  }
});
