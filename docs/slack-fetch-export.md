# Fetch export and local ZIP import

The export menu offers **Copy small fetch script (experimental)**. The default
clipboard export stays embedded until a real signed-in Slack workspace test has
been recorded. The experimental option honors the overwrite checkbox and uses
the existing backup, confirmation, fresh-state checks, and recovery workflow.

The script contains selected image URLs, byte counts, MIME types, names, and
SHA-256 hashes pinned from the asset bytes at export time. URLs may change their
contents later; a byte or hash mismatch stops preparation before any Slack
upload or deletion. Only data is fetched; no remote executable code is loaded.

Fetch export uses the selected tier, or 256px stills / 128px animations by default,
with each image capped by its Slack-compatible tier. Aggregate clipboard size
does not lower image resolution. The current 366-image catalog generates an
86,447-byte normal fetch script (283 stills at 256px, 64 animations at 128px,
19 animations at 64px). Replacement scripts also include the preview runtime.

Preparation is sequential with a 64 MiB selected-byte cap, a 127,000-byte image
cap, streaming response length checks, and 20-second request timeouts. It holds
verified image data for the selected batch before starting uploads or replacement
preview. Public requests omit credentials and referrers and reject redirects.
Slack tokens occur only in same-origin Slack API form bodies. Explicit 429s
have bounded retries; long Retry-After delays stop with an actionable error.
Ambiguous upload failures are reported without automatically repeating writes.
Call `cancelSlackEmojiUpload()` to cancel preparation or stop normal uploads
between requests. The replacement preview has its own Stop button.

If CSP/CORS blocks external images, download a ZIP, extract
`slack/import-local.js`, paste its contents into the Slack console, then choose
the original ZIP in the file picker. This imports only `slack/images/` entries,
verifies every image, and makes no external image requests. It accepts the
original STORE archive produced by this app, up to 256 MiB. The default importer adds
emoji only. Use `slack/import-overwrite.js` or `slack/import-replace-smaller.js`
for the same backup/confirmation replacement workflow with local ZIP data. The existing offline Node generator remains
available. Export with the desired resolution tier to control ZIP image sizes.

## Production checks, 2026-11-18 (America/Denver)

Run `node scripts/check-slack-delivery.mjs` to repeat the read-only probe. An
optional first argument selects a different deployed origin. Requests include
`Origin: https://focuseddotio.slack.com`, omit credentials, and reject redirects.

| Delivery path | HTTP | Allow-Origin | Bytes | SHA-256 matches checkout |
| --- | --- | --- | ---: | --- |
| `/emoji-delivery/manifest.json` | 200 | `*` | 622885 | yes |
| `/emoji-delivery/64/50.webp` | 200 | `*` | 2134 | yes |
| `/emoji-delivery/128/50.webp` | 200 | `*` | 4974 | yes |
| `/emoji-delivery/256/50.webp` | 200 | `*` | 12114 | yes |
| `/emoji-delivery/original/50.webp` | 200 | `*` | 64590 | yes |
| `/emoji-delivery/64/awkward.webp` (animated) | 200 | `*` | 3632 | yes |

OPTIONS on the 64px image returned 204 without Allow-Origin. Preflighted requests
are unsupported in this observation. The uploader uses a plain GET with no
custom request headers, which does not require preflight. Do not add an
Authorization header or send Slack tokens to the asset server.

`SLACK_LIVE_CORS=1 pnpm exec playwright test tests/slack-delivery-cors.spec.ts`
checks browser-enforced CORS against production from a synthetic Slack origin.
Chromium 153.0.8010.12 passed this production browser probe. The 14 mocked
replacement scenarios, including fetch overwrite, also passed.

This is separate from the remaining manual acceptance gate: run a fetch in a
real signed-in workspace's `/customize/emoji` page and record browser/version,
workspace route, date, result, and any CSP restriction before changing defaults.
No signed-in Slack success is claimed by these server or fixture tests.
