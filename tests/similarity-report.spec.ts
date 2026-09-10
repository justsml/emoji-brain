import { test, expect } from '@playwright/test';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { processSimilarity } from '../scripts/similarity-pipeline';
import { writeSimilarityReport } from '../scripts/similarity-report';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

let root: string;
test.beforeAll(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'emoji-browser-review-'));
  await mkdir(resolve(root, 'public/emojis'), { recursive: true });
  await mkdir(resolve(root, 'src/data'), { recursive: true });
  const emojis = ['query', 'near', 'far'].map(id => ({ id, filename: `${id}.png`, path: `/emojis/${id}.png` }));
  for (const [i, emoji] of emojis.entries()) {
    await sharp({ create: { width: 16, height: 16, channels: 4, background: ['#ef3333', '#e83333', '#3333ee'][i] } }).png().toFile(resolve(root, 'public/emojis', emoji.filename));
  }
  await writeFile(resolve(root, 'src/data/emoji-metadata.json'), JSON.stringify({ emojis }));
  const result = await processSimilarity(root, { progress: () => {} });
  await writeSimilarityReport(root, resolve(root, 'review.html'), result, [{ id: 'query', filename: 'query.png', category: 'synthetic test fixture', split: 'tuning' }]);
});
test.afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

test('review report validates judgments, preserves drafts, and exports attributed grades', async ({ page }) => {
  await page.goto(pathToFileURL(resolve(root, 'review.html')).href);
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
