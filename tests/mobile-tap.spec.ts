import {test, expect, devices} from '@playwright/test';

test.use({...devices['iPhone 13'], browserName: 'chromium', defaultBrowserType: undefined} as any);

test('a first visit starts with an empty sheet', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await expect(page.getByText('No emojis selected')).toBeVisible();
  await expect(page.locator('.emoji-card[aria-pressed=true]')).toHaveCount(0);
});

test('tapping an animated sticker plays it and keeps playing after the finger lifts', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  const animated = page.locator('[role="gridcell"] button[aria-label*=", animated"]').first();
  await animated.scrollIntoViewIfNeeded();
  await expect(animated.locator('img')).toHaveAttribute('src', /previews/);
  await animated.tap();
  await expect(animated).toHaveAttribute('aria-pressed', 'true');
  await expect(animated.locator('img')).toHaveAttribute('src', /emoji-delivery\/(128|256)\//);
  // touch pointers "leave" as soon as they lift; the animation must survive that
  await page.waitForTimeout(600);
  await expect(animated.locator('img')).toHaveAttribute('src', /emoji-delivery\/(128|256)\//);
});
