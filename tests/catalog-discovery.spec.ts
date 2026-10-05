import {test,expect} from '@playwright/test';
import metadata from '../src/data/emoji-metadata.json' with {type:'json'};

for (const width of [1440,390]) test.describe(`theme atlas at ${width}px`, () => {
  test.use({viewport:{width,height:900},hasTouch:width<768,isMobile:width<768});
  test('theme sizes, word filtering, color order, inversion and resets compose', async ({page}) => {
    const errors: string[] = [];
    page.on('pageerror',error => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
    const words = page.getByRole('group',{name:'Theme filters'}).getByRole('button');
    await expect(words).toHaveCount(10);
    for (const count of [5,20,10]) {
      await page.getByRole('button',{name:`Show ${count} themes`}).click();
      await expect(words).toHaveCount(count);
    }
    await page.getByRole('button',{name:'Filter cat',exact:true}).click();
    const cats = metadata.emojis.filter(e => e.facets.subject.includes('cat') || e.facets.expression.includes('cat') || e.facets.intent.includes('cat'));
    await expect(page.locator('.emoji-card')).toHaveCount(cats.length);
    const ids = await page.locator('.emoji-cell').evaluateAll(cells => cells.map(c => c.getAttribute('data-id')).sort());
    await page.getByRole('button',{name:'Sort red first'}).click();
    await expect(page.getByRole('button',{name:'Sort red first'})).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('.emoji-card').first()).toHaveAttribute('aria-label',/catdance.webp/);
    expect(await page.locator('.emoji-cell').evaluateAll(cells => cells.map(c => c.getAttribute('data-id')).sort())).toEqual(ids);
    await page.getByRole('button',{name:'Invert visible selection',exact:true}).click();
    await expect(page.locator('.emoji-card[aria-pressed=true]')).toHaveCount(0);
    await page.getByRole('radio',{name:/Collected/}).check();
    await expect(page.locator('.emoji-card')).toHaveCount(0);
    await page.getByRole('button',{name:'Reset',exact:true}).click();
    await expect(page.locator('.emoji-card')).toHaveCount(metadata.total-cats.length);
    await page.getByRole('radio',{name:/Everything/}).check();
    await expect(page.locator('.emoji-card')).toHaveCount(metadata.total);
    await page.getByPlaceholder('Search emojis...').fill('cat');
    await expect(page.locator('.emoji-card')).not.toHaveCount(metadata.total);
    const count = await page.locator('.emoji-card').count();
    await page.getByRole('button',{name:'Sort blue first'}).click();
    await expect(page.locator('.emoji-card')).toHaveCount(count);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(errors).toEqual([]);
  });
});
