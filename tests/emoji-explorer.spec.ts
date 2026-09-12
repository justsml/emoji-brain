import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Navigate to the home page before each test
  await page.goto("/");
});

test("should have the correct title", async ({ page }) => {
  // Check that the page title is correct
  await expect(page).toHaveTitle(/Emoji Explorer/);
});

test("should display welcome message", async ({ page }) => {
  // Check that the main title is displayed
  await expect(page.getByText("Emoji Explorer")).toBeVisible();
});

test("should display emoji grid", async ({ page }) => {
  // Check that the emoji grid region is displayed
  const emojiGrid = page.getByRole("grid", { name: "Emoji results" });
  await expect(emojiGrid).toBeVisible();

  // Check that there are multiple emojis displayed
  const emojiCells = page.locator('div[role="gridcell"]');
  const count = await emojiCells.count();
  expect(count).toBeGreaterThan(0);
});

test("should filter emojis when searching", async ({ page }) => {
  await expect(page.getByRole("grid", { name: "Emoji results" })).toBeVisible();

  // Get the initial count of emojis
  const initialEmojiCount = await page
    .locator('div[role="gridcell"]')
    .count();

  // Type "cat" in the search box
  await page.getByPlaceholder("Search emojis...").fill("cat");
  await expect(page.getByRole("region", { name: "Emoji results", exact: true })).toHaveAttribute("aria-busy", "false");

  // Wait for the search results to update (Pagefind is async)
  // Expect the count to change from the initial count
  await expect(page.locator('div[role="gridcell"]')).not.toHaveCount(
    initialEmojiCount,
    { timeout: 5000 } // Wait up to 5 seconds for results to change
  );

  // Get the filtered count of emojis
  const filteredEmojiCount = await page
    .locator('div[role="gridcell"]')
    .count();

  expect(filteredEmojiCount).toBeLessThan(initialEmojiCount); // Assert it actually filtered

  // Clear the search box
  await page.getByPlaceholder("Search emojis...").clear();
  // Wait for the results to reset to the initial count
  await expect(page.locator('div[role="gridcell"]')).toHaveCount(
    initialEmojiCount,
    { timeout: 5000 }
  );

  // The count should be back to the initial count
  const resetCount = await page.locator('div[role="gridcell"]').count();
  expect(resetCount).toEqual(initialEmojiCount);
});

// test("should filter emojis by category", async ({ page }) => {
//   // Get the initial count of emojis
//   const initialEmojiCount = await page
//     .locator('button[role="gridcell"]')
//     .count();

//   // Click the category dropdown
//   await page.getByText("All Categories").click();

//   // Get the first category (other than "All Categories")
//   const categoryElement = page.locator('div[role="menuitem"]').nth(1);
//   const categoryName = await categoryElement.textContent();

//   // Click the category
//   await categoryElement.click();

//   // Wait for the results to update
//   await page.waitForTimeout(500);

//   // Get the filtered count of emojis
//   const filteredEmojiCount = await page
//     .locator('button[role="gridcell"]')
//     .count();

//   // The filtered count should be less than or equal to the initial count
//   // (assuming the category doesn't include all emojis)
//   expect(filteredEmojiCount).toBeLessThanOrEqual(initialEmojiCount);

//   // Reset to "All Categories"
//   await page.getByText(categoryName || "").click();
//   await page.getByText("All Categories").click();

//   // Wait for the results to reset
//   await page.waitForTimeout(500);

//   // The count should be back to the initial count
//   const resetCount = await page.locator('button[role="gridcell"]').count();
//   expect(resetCount).toEqual(initialEmojiCount);
// });

test("should select and deselect emojis", async ({ page }) => {
  await page.getByTitle("Deselect visible").click();
  await expect(page.getByText("No emojis selected")).toBeVisible();
  await page.locator('div[role="gridcell"] button').first().click();
  await expect(page.getByLabel("1 selected")).toBeVisible();
  await page.locator('div[role="gridcell"] button').nth(1).click();
  await expect(page.getByLabel("2 selected")).toBeVisible();
  await page.locator('div[role="gridcell"] button').first().click();
  await expect(page.getByLabel("1 selected")).toBeVisible();

  // Handle dialog for deselect all
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByTitle("Deselect visible").click();
  await expect(page.getByText("No emojis selected")).toBeVisible();
});

test("should show export options when emojis are selected", async ({
  page,
}) => {
  // Select an emoji
  await page.locator('div[role="gridcell"] button').first().click();

  await expect(page.getByRole("button", { name: "Copy Slack Script" })).toBeVisible();

  // Click the export dropdown
  await page.getByRole("button", { name: "Other export options" }).click();

  // Check that all export options are displayed
  await expect(page.getByText("Plain Text")).toBeVisible();
  await expect(page.getByText("HTML")).toBeVisible();
  await expect(page.getByText("CSS")).toBeVisible();
  await expect(page.getByText("Markdown Table")).toBeVisible();
  await expect(page.getByRole("menuitem", {name: /^Originals/})).toBeVisible();
});

test("should be responsive", async ({ page }) => {
  // Test desktop layout
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByRole("grid", { name: "Emoji results" })).toBeVisible();

  // Test mobile layout
  await page.setViewportSize({ width: 375, height: 667 });
  await expect(page.getByRole("grid", { name: "Emoji results" })).toBeVisible();
});


test("persists a selection when reloading immediately after a click", async ({page}) => {
  const cells = page.locator('[role="gridcell"] button');
  await expect(cells.first()).toHaveAttribute('aria-pressed', 'true');
  await cells.first().click();
  await page.reload();
  await expect(cells.first()).toHaveAttribute('aria-pressed', 'false');
  await expect(cells.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.getByTitle('Deselect visible').click();
  await page.reload();
  await expect(page.getByText('No emojis selected')).toBeVisible();
});

test('passing over an animation does not start a download; deliberate hover and focus still play', async ({page}) => {
  const animated = page.locator('[role="gridcell"] button[aria-label*=", animated"]').first();
  await animated.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  const requests: string[] = [];
  page.on('request', request => {if (/\/emoji-delivery\/(128|256)\//.test(request.url())) requests.push(request.url());});
  const box = (await animated.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(20);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);
  expect(requests).toEqual([]);
  await animated.hover();
  await expect(animated.locator('img')).toHaveAttribute('src', /emoji-delivery\/(128|256)\//);
  await page.mouse.move(0, 0);
  await expect(animated.locator('img')).toHaveAttribute('src', /previews/);
  await animated.focus();
  await expect(animated.locator('img')).toHaveAttribute('src', /emoji-delivery\/(128|256)\//);
});

test('selection becomes interactive even when the external font service stalls', async ({page}) => {
  // Use a fresh navigation with the stylesheet held indefinitely. Release it
  // only after the assertion so a late response cannot make this test pass.
  let release!: () => void;
  const held = new Promise<void>(resolve => {release = resolve;});
  await page.route('https://fonts.googleapis.com/**', async route => {
    await held;
    await route.abort().catch(() => {});
  });
  try {
    await page.goto('/', {waitUntil: 'commit'});
    await expect(page.getByRole('grid', {name: 'Emoji results'})).toBeVisible({timeout: 3000});
    await page.getByTitle('Deselect visible').click();
    await expect(page.getByText('No emojis selected')).toBeVisible();
  } finally {release();}
});

test('visible stickers stay decoded across page-end and page-home jumps', async ({page}, testInfo) => {
  for (const viewport of [{width: 1440, height: 1000}, {width: 390, height: 844}]) {
    await page.setViewportSize(viewport);
    await page.getByRole('radio', {name: 'Extra large', exact: true}).check();
    expect(await page.locator('.sheet-actions button').evaluateAll(buttons => buttons.filter(button => button.getClientRects().length).every(button => {const rect = button.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth + 1;}))).toBe(true);
    for (const end of [true, false, true, false]) {
      await page.evaluate(end => window.scrollTo({top: end ? document.documentElement.scrollHeight : 0, behavior: 'instant'}), end);
      await expect.poll(() => page.locator('[role="gridcell"]').evaluateAll(cells => {
        const visible = cells.filter(cell => {const rect = cell.getBoundingClientRect(); return rect.bottom > 100 && rect.top < innerHeight - 150;});
        return visible.length > 0 && visible.every(cell => {const img = cell.querySelector('img')!; return img.complete && img.naturalWidth > 0;});
      })).toBe(true);
    }
    await testInfo.attach(`grid-${viewport.width}-home.png`, {body: await page.screenshot(), contentType: 'image/png'});
    await page.evaluate(() => window.scrollTo({top: document.documentElement.scrollHeight, behavior: 'instant'}));
    await testInfo.attach(`grid-${viewport.width}-end.png`, {body: await page.screenshot(), contentType: 'image/png'});
  }
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => Array.from(document.fonts).filter(font => font.status === 'loaded').map(font => font.family));
  expect(fonts).toContain('Bricolage Grotesque');
  expect(fonts).toContain('Instrument Sans');
});
