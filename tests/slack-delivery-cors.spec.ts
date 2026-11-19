import {test, expect} from '@playwright/test';

// Explicitly opt in: this probes production rather than a mock delivery server.
test('production delivery allows a browser GET from a synthetic Slack origin', async ({page}) => {
  test.skip(process.env.SLACK_LIVE_CORS !== '1', 'Set SLACK_LIVE_CORS=1 to probe production');
  await page.route('https://emoji-cors-test.slack.com/customize/emoji', route => route.fulfill({contentType:'text/html',body:'<!doctype html><title>CORS probe fixture</title>'}));
  await page.goto('https://emoji-cors-test.slack.com/customize/emoji');
  const result = await page.evaluate(async () => {
    const response = await fetch('https://adorbs.fun/emoji-delivery/128/50.webp', {credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
    const bytes = await response.arrayBuffer();
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)), n => n.toString(16).padStart(2,'0')).join('');
    return {status:response.status,bytes:bytes.byteLength,sha256};
  });
  expect(result).toEqual({status:200,bytes:4974,sha256:'64c775f882a254f3622e67559933bf3e61ff63c6397b1b69cde621a0a2e3aee3'});
  // This proves browser CORS, not Slack's actual document CSP or signed-in upload behavior.
});
