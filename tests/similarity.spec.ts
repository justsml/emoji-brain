import { expect, test } from "@playwright/test";

test("generated similarity index supports keyboard browsing and sheet selection", async ({ page, request }) => {
  const response = await request.get("/similarity/index.json");
  expect(response.ok()).toBeTruthy();
  const index = await response.json();
  const query = Object.entries(index.entries).find(([, entry]: [string, any]) => entry.color.length && entry.visual.length);
  expect(query).toBeTruthy();
  await page.goto("/");
  const cell = page.locator(`[role="gridcell"][data-id="${query![0]}"]`);
  const trigger = cell.getByRole("button", { name: /^Find similar/ });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("region", { name: /^Similar to / });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading")).toBeFocused();
  await expect(page.getByRole("grid", { name: "Emoji results" })).toBeVisible();
  const matches = panel.getByRole("button", { name: /^Select / });
  await expect(matches.first()).toBeVisible();
  expect(await matches.count()).toBeLessThanOrEqual(12);
  await matches.first().click();
  await expect(matches.first()).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("button", { name: "Looks similar" }).click();
  await expect(panel.getByRole("button", { name: "Looks similar" })).toHaveAttribute("aria-pressed", "true");
  await expect(matches.first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("missing index leaves the original grid usable", async ({ page }) => {
  await page.route("**/similarity/index.json", (route) => route.fulfill({ status: 404, body: "missing" }));
  await page.goto("/");
  await page.getByRole("button", { name: /^Find similar/ }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Similarity is unavailable" })).toBeVisible();
  await expect(page.getByRole("grid", { name: "Emoji results" })).toBeVisible();
});
