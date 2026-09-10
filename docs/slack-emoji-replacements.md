# Optional replacement of smaller Slack emojis

Choose **Other export options → Slack script: replace smaller…**, copy the generated script, and paste it on your workspace's Slack emoji-customization page. The ordinary **Copy Slack script** behavior is unchanged.

The optional script:

1. Reads the workspace emoji list, including aliases, and measures selected exact-name matches.
2. Opens a review table with new uploads, eligible replacements, retained images and manual-review cases. Nothing is uploaded or deleted during this scan.
3. Lets you choose entries, download a JSON backup containing the original image bytes, and confirm that you saved it.
4. Requests confirmation of the selected changes. It rechecks each image against the backup before deleting, uploads one replacement at a time, and verifies the resulting bytes. It never deletes the old catalog as a batch.
5. Attempts to restore the original if upload fails after deletion. It stops on an unresolved error and retains the backup and report. **Stop after current emoji** finishes the current transaction before stopping.

The backup contains original files in their original formats, encoded inside JSON; incoming exported images remain WebP. It contains no Slack token or cookies. `globalThis.slackEmojiReplacementPlan` contains the preview, and `globalThis.slackEmojiReplacementReport` contains progress and outcomes.

Pixel dimensions determine eligibility, not compressed byte size or guessed creation dates. The planner excludes aliases and requires manual review for canonical emojis with dependent aliases, unknown dimensions/animation metadata, invalid/duplicate names and mixed-dimension changes. Animations cannot be replaced with stills. Square padding (128×64 to128×128) does not count as an increase in resolution. There is no fuzzy name matching.

## API evidence and limits

The supplied deletion HAR showed two HTTP200 requests to `POST /api/emoji.remove`, using multipart fields `token`, `name`, `_x_reason=customize-emoji-remove`, `_x_mode=online`. No HAR credentials or workspace data are checked in. The response bodies were absent in the file available during initial implementation; the code requires `ok:true` JSON and independently checks deletion. An ambiguous response is reconciled with a fresh lookup; mutation requests are not blindly retried. HTTP429 retries respect Retry-After and all Slack API calls share a1.1-second minimum interval.

The listing and upload paths are the existing workspace `/api/emoji.adminList` and `/api/emoji.add` flows. The Enterprise-wide `admin.emoji.remove` API is not used.

These are private browser endpoints. Browser tests use mocked responses and assert request fields, backup bytes, replacement, rollback, alias and race protection. No real workspace emojis were changed during development. If Slack re-encodes uploads instead of preserving their bytes, verification stops for review rather than declaring success. Concurrent workspace edits cannot be made atomic through these endpoints; rechecks reduce this risk but do not provide a server-side conditional delete.
