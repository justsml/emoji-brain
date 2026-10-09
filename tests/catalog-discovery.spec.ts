import {test,expect} from '@playwright/test';
import metadata from '../src/data/emoji-metadata.json' with {type:'json'};

for (const width of [1440,390]) test.describe(`theme atlas at ${width}px`, () => {
  test.use({viewport:{width,height:900},hasTouch:width<768,isMobile:width<768});
  test('word filtering, color order, inversion and resets compose', async ({page}) => {
    const errors: string[] = [];
    page.on('pageerror',error => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('radio',{name:'Large',exact:true})).toBeChecked();
    const filenames = await page.locator('.emoji-card').evaluateAll(cards => cards.map(card => card.getAttribute('aria-label')!.replace(/^Select /,'')));
    expect(filenames).toEqual([...filenames].sort((a,b) => a.localeCompare(b)));
    const themes = await page.getByRole('heading',{name:'Browse by theme',exact:true}).boundingBox();
    const colors = await page.getByRole('heading',{name:'Pick by color',exact:true}).boundingBox();
    expect(themes).not.toBeNull();
    expect(colors).not.toBeNull();
    // Colors sit under the themes at every width; on desktop the whole picker
    // shares the masthead row with the title instead of stacking below it.
    expect(colors!.y).toBeGreaterThan(themes!.y + themes!.height);
    const title = await page.getByRole('heading',{level:1}).boundingBox();
    if (width >= 1024) expect(themes!.x).toBeGreaterThan(title!.x + title!.width);
    else expect(themes!.y).toBeGreaterThan(title!.y + title!.height);
    const words = page.getByRole('group',{name:'Theme filters'}).getByRole('button');
    await expect(words).toHaveCount(10);
    const rows = await words.evaluateAll(buttons => new Set(buttons.map(button => {
      const bounds = button.getBoundingClientRect();
      return Math.round(bounds.top + bounds.height / 2);
    })).size);
    // Desktop wraps the themes into a couple of rows; phones swipe one row.
    if (width >= 1024) expect(rows).toBeLessThanOrEqual(3);
    else expect(rows).toBe(1);
    const masthead = await page.locator('.app-header').boundingBox();
    expect(masthead!.height).toBeLessThan(width >= 1024 ? 300 : 480);
    await page.getByRole('button',{name:'Filter cat',exact:true}).click();
    const cats = metadata.emojis.filter(e => e.facets.subject.includes('cat') || e.facets.expression.includes('cat') || e.facets.intent.includes('cat'));
    await expect(page.locator('.emoji-card')).toHaveCount(cats.length);
    const ids = await page.locator('.emoji-cell').evaluateAll(cells => cells.map(c => c.getAttribute('data-id')).sort());
    await page.getByRole('button',{name:'Sort red first'}).click();
    await expect(page.getByRole('button',{name:'Sort red first'})).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('.emoji-card').first()).toHaveAttribute('aria-label',/catdance.webp/);
    expect(await page.locator('.emoji-cell').evaluateAll(cells => cells.map(c => c.getAttribute('data-id')).sort())).toEqual(ids);
    await page.getByRole('button',{name:'Invert visible selection',exact:true}).click();
    await expect(page.locator('.emoji-card[aria-pressed=true]')).toHaveCount(cats.length);
    await page.getByRole('radio',{name:/Collected/}).check();
    await expect(page.locator('.emoji-card')).toHaveCount(cats.length);
    await page.getByRole('button',{name:'Reset',exact:true}).click();
    await expect(page.locator('.emoji-card')).toHaveCount(cats.length);
    await page.getByRole('radio',{name:/Everything/}).check();
    await expect(page.locator('.emoji-card')).toHaveCount(metadata.total);
    await page.getByPlaceholder('Search emojis...').fill('cat');
    await expect(page.locator('.emoji-card')).not.toHaveCount(metadata.total);
    const count = await page.locator('.emoji-card').count();
    await page.getByRole('button',{name:'Sort blue first'}).click();
    await expect(page.locator('.emoji-card')).toHaveCount(count);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.getByRole('radio',{name:'Medium',exact:true}).check();
    await page.reload();
    await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
    await expect(page.getByRole('radio',{name:'Medium',exact:true})).toBeChecked();
    await expect(page.locator('.emoji-card-image').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
