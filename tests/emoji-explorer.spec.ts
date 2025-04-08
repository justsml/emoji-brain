import { test, expect } from '@playwright/test';

test.describe('Emoji Explorer', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the home page before each test
    await page.goto('/');
  });

  test('should have the correct title', async ({ page }) => {
    // Check that the page title is correct
    await expect(page).toHaveTitle(/Emoji Explorer/);
  });

  test('should display welcome message', async ({ page }) => {
    // Check that the welcome message is displayed
    await expect(page.getByText('Welcome to Emoji Explorer')).toBeVisible();
    await expect(page.getByText('Browse, search, and explore our collection of emojis')).toBeVisible();
  });

  test('should display emoji grid', async ({ page }) => {
    // Check that the emoji grid is displayed
    const emojiGrid = page.locator('div[role="grid"]');
    await expect(emojiGrid).toBeVisible();
    
    // Check that there are multiple emojis displayed
    const emojiCells = page.locator('button[role="gridcell"]');
    const count = await emojiCells.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should filter emojis when searching', async ({ page }) => {
    // Get the initial count of emojis
    const initialEmojiCount = await page.locator('button[role="gridcell"]').count();
    
    // Type "cat" in the search box
    await page.getByPlaceholder('Search emojis...').fill('cat');
    
    // Wait for the search results to update (Pagefind is async)
    // Expect the count to change from the initial count
    await expect(page.locator('button[role="gridcell"]')).not.toHaveCount(
      initialEmojiCount,
      { timeout: 5000 } // Wait up to 5 seconds for results to change
    );
    
    // Get the filtered count of emojis
    const filteredEmojiCount = await page.locator('button[role="gridcell"]').count();
    
    expect(filteredEmojiCount).toBeLessThan(initialEmojiCount); // Assert it actually filtered
    
    // Clear the search box
    await page.getByPlaceholder('Search emojis...').clear();
    // Wait for the results to reset to the initial count
    await expect(page.locator('button[role="gridcell"]')).toHaveCount(initialEmojiCount, { timeout: 5000 });
    
    // The count should be back to the initial count
    const resetCount = await page.locator('button[role="gridcell"]').count();
    expect(resetCount).toEqual(initialEmojiCount);
  });

  test('should filter emojis by category', async ({ page }) => {
    // Get the initial count of emojis
    const initialEmojiCount = await page.locator('button[role="gridcell"]').count();
    
    // Click the category dropdown
    await page.getByText('All Categories').click();
    
    // Get the first category (other than "All Categories")
    const categoryElement = page.locator('div[role="menuitem"]').nth(1);
    const categoryName = await categoryElement.textContent();
    
    // Click the category
    await categoryElement.click();
    
    // Wait for the results to update
    await page.waitForTimeout(500);
    
    // Get the filtered count of emojis
    const filteredEmojiCount = await page.locator('button[role="gridcell"]').count();
    
    // The filtered count should be less than or equal to the initial count
    // (assuming the category doesn't include all emojis)
    expect(filteredEmojiCount).toBeLessThanOrEqual(initialEmojiCount);
    
    // Reset to "All Categories"
    await page.getByText(categoryName || '').click();
    await page.getByText('All Categories').click();
    
    // Wait for the results to reset
    await page.waitForTimeout(500);
    
    // The count should be back to the initial count
    const resetCount = await page.locator('button[role="gridcell"]').count();
    expect(resetCount).toEqual(initialEmojiCount);
  });

  test('should select and deselect emojis', async ({ page }) => {
    await expect(page.getByText('0 emojis selected')).toBeVisible();
    await page.locator('button[role="gridcell"]').first().click();
    await expect(page.getByText('1 emoji selected')).toBeVisible();
    await page.locator('button[role="gridcell"]').nth(1).click();
    await expect(page.getByText('2 emojis selected')).toBeVisible();
    await page.locator('button[role="gridcell"]').first().click();
    await expect(page.getByText('1 emoji selected')).toBeVisible();
    await page.getByText('Clear Selection').click();
    await expect(page.getByText('0 emojis selected')).toBeVisible();
  });

  test('should show export options when emojis are selected', async ({ page }) => {
    // Select an emoji
    await page.locator('button[role="gridcell"]').first().click();
    
    // Click the export dropdown
    await page.getByText('Export As...').click();
    
    // Check that all export options are displayed
    await expect(page.getByText('Plain Text')).toBeVisible();
    await expect(page.getByText('HTML')).toBeVisible();
    await expect(page.getByText('CSS')).toBeVisible();
    await expect(page.getByText('Markdown Table')).toBeVisible();
    await expect(page.getByText('ZIP File')).toBeVisible();
  });

  test('should be responsive', async ({ page }) => {
    // Test desktop layout
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('div[role="grid"]')).toHaveClass(/grid-cols-\d+/);
    
    // Test tablet layout
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('div[role="grid"]')).toHaveClass(/md:grid-cols-\d+/);
    
    // Test mobile layout
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('div[role="grid"]')).toHaveClass(/grid-cols-3/);
  });
});