# Optional replacement of smaller Slack emojis

Status: the read-only decision module and its tests are implemented in `src/lib/slackEmojiReplacements.ts`. It is not yet wired into the console uploader. No deletion is enabled.

The missing integration evidence is a sanitized HAR of one deletion from Slack's emoji-customization page. Preserve request URL, method, field names and response shape; redact cookies, authorization headers and token values. The public `admin.emoji.remove` API is an Enterprise-organization API, so it is not substituted for the workspace browser operation.

Proposed flow after verifying that request:

1. Opt into replacement mode; normal upload remains the default.
2. Enumerate current emojis and aliases, then measure exact-name matches and incoming images.
3. Show an explicit plan: new uploads, smaller replacements, kept images, and manual-review cases. Compare pixel dimensions, not compressed file bytes or an assumed creation date.
4. Back up the originals and metadata before any deletion. Confirm the selected replacement list and saved backup.
5. Recheck each existing image against the reviewed version, delete and upload one replacement at a time, and verify the resulting image. Stop on uncertain state; retain enough information to restore the original if upload fails. Do not batch-delete the old catalog first.

The planner excludes aliases and flags canonical emojis with dependent aliases for manual review. It also holds invalid/duplicate names, unknown image or animation metadata, mixed-dimension changes, and animation-to-still replacements. A 128×64 image becoming a padded 128×128 image is not a resolution upgrade. No fuzzy matching of names or automatic removal of unrelated emojis is proposed.
