import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test('review report validates judgments, preserves drafts, and exports attributed grades', async ({ page }) => {
  await page.goto(pathToFileURL(resolve('.cache/similarity/review.html')).href);
  const payload = JSON.parse((await page.locator('#data').textContent())!);
  const query = payload.queries.find((q: { id: string }) => payload.lists[q.id].color.length);
  expect(query).toBeTruthy();
  const rating = { query: query.id, candidate: payload.lists[query.id].color[0].id, mode: 'color', grade: 2 };
  const judgments = { ...payload.judgments, reviewer: 'Synthetic browser test only', ratings: [rating] };
  const upload = async (value: unknown) => page.locator('#import').setInputFiles({ name: 'judgments.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  await upload({ ...judgments, ratings: [rating, rating] });
  await expect(page.getByRole('status')).toHaveText('Duplicate relevance judgment');
  await upload({ ...judgments, catalogHash: 'wrong-snapshot' });
  await expect(page.getByRole('status')).toHaveText('Invalid judgments or different catalog/version');
  await upload({ ...judgments, reviewer: ' ' });
  await expect(page.getByRole('status')).toHaveText('Invalid judgments or different catalog/version');
  await upload(judgments);
  await expect(page.getByRole('status')).toContainText('1 judgments recorded');
  await page.locator('#query').selectOption(query.id);
  await page.locator('#method').selectOption('color');
  await expect(page.getByRole('combobox', { name: `Relevance of ${payload.items[rating.candidate].name}` })).toHaveValue('2');
  await page.getByRole('checkbox', { name: 'Compare methods side by side' }).check();
  for (const name of ['64-bin baseline', 'Palette transport', 'Layout baseline', 'Combined visual']) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  await expect(page.locator('#method')).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Compare methods side by side' }).uncheck();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export judgments' }).click();
  const download = await downloadEvent;
  expect(JSON.parse(await readFile((await download.path())!, 'utf8'))).toEqual(judgments);
  const storageKey = `emoji-review/${judgments.catalogHash}/${judgments.version}`;
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: storageKey, value: { ...judgments, ratings: [rating, rating] } });
  await page.reload();
  await expect(page.getByRole('status')).toContainText('0 judgments recorded');
});
