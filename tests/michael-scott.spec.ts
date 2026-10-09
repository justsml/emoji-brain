import {test, expect} from '@playwright/test';

test('Michael Scott identity and franchise searches find all six restored reactions', async ({page}) => {
  await page.goto('/');
  const results = page.locator('[role="gridcell"] > button');
  for (const query of ['Michael Scott', 'Steve Carell', 'The Office', 'Dunder Mifflin']) {
    await page.getByPlaceholder('Search emojis...').fill(query);
    await expect(results).toHaveCount(6);
    await expect(page.getByRole('status').filter({hasText: `matches for “${query}”`})).toBeVisible();
    const labels = await results.evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')));
    expect(labels.every(label => label?.startsWith('michael-scott-'))).toBe(true);
  }
});

test('reaction aliases find the appropriate Michael Scott image', async ({page}) => {
  await page.goto('/');
  for (const [query, name] of [
    ['nervous laughter', 'michael-scott-laughing.webp'],
    ['nope', 'michael-scott-shaking-head-no.webp'],
    ['world\'s best boss', 'michael-scott-worlds-best-boss.webp'],
    ['cringe', 'michael-scott-awkward-smile.webp'],
  ]) {
    await page.getByPlaceholder('Search emojis...').fill(query);
    await expect(page.locator(`[role="gridcell"] > button[aria-label^="${name}"]`)).toBeVisible();
    await expect(page.getByRole('status').filter({hasText: `matches for “${query}”`})).toBeVisible();
  }
});
