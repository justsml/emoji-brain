# Overwrite Slack emoji

In **Other export options**, enable **Overwrite existing Slack emojis**, then choose **Slack overwrite script** (or **Copy overwrite script** in the sheet tray). Overwrite starts disabled on each visit and applies only to Slack scripts, not ZIP downloads. The separate **replace smaller** action keeps its conservative size and animation rules.

Run the script while signed in on the workspace’s `/customize/emoji` page. It uses the current session’s permissions: typically a workspace admin/owner or the emoji’s creator can delete the image, subject to workspace policy. It does not elevate access or send the session token elsewhere.

Before any changes, the script shows an exact-name preview. Aliases and their targets, unknown image metadata, duplicate names, explicit deletion denials, and identical artwork are excluded. Download the originals backup, confirm it is saved, then confirm the deletion prompt. Overwrite can replace a larger or animated image with the selected export.

The script rechecks each original immediately before deletion, honors rate limits, verifies results, and tries to restore a backed-up original if upload fails after deletion. Recovery can fail, leaving an emoji missing. Retain the backup JSON, which contains the original image bytes and checksums but no session token. Denied deletions are reported and skipped; unknown state or failed recovery stops the batch. The console report is available as `slackEmojiReplacementReport`.

Validation uses mocked Slack responses; no live workspace emojis are deleted by automated tests. Slack’s internal customize-page endpoints may change, in which case the script stops rather than guessing.

Permission reference: [Slack’s custom emoji permissions](https://slack.com/help/articles/115005043766-Manage-custom-emoji-permissions-).

## Design review

PR #8 passed independent design review after correcting the export settings semantics, naming the overwrite action explicitly, and spelling out the preview/backup/confirmation steps. Size choices are native buttons with pressed states, and the default-off overwrite checkbox follows ordinary keyboard navigation. Originals are labeled “Full size” because source dimensions vary.

The Slack preview is a named modal dialog. It focuses its heading when opened, contains keyboard navigation, routes Escape through Stop/Close, and restores prior focus on close. The replacement table scrolls independently so backup and confirmation controls stay within a narrow viewport. Browser regressions cover settings keyboard operation and the 320px preview, alongside the mocked replacement, cancellation, permission and recovery scenarios.
