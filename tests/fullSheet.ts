import type {Page} from '@playwright/test';
import metadata from '../src/data/emoji-metadata.json' with {type: 'json'};

/**
 * A first visit starts with an empty sheet. Tests that exercise the heaviest
 * case — every sticker selected — seed it before the page loads. Only when
 * nothing is stored yet, so reloads inside a test keep what the test did.
 */
export async function startWithFullSheet(page: Page) {
  await page.addInitScript(ids => {
    if (localStorage.getItem('selectedEmojis') === null) localStorage.setItem('selectedEmojis', JSON.stringify(ids));
  }, metadata.emojis.map(emoji => emoji.id));
}
