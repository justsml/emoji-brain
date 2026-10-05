# Emoji workspace

Tap a sticker to toggle selection and reveal Similar / Copy. Desktop pointers
reveal these controls after 120 ms of hover intent; keyboard focus reveals them
immediately. Copy writes the Slack shortcode. Similar opens related suggestions
without replacing the search results.

Expand in the export bar opens the selected sheet. The same native, nonmodal
popover appears as a right-side panel on desktop and a bottom drawer below
768px. Escape and outside clicks dismiss it; closing restores focus to the
opener or its sticker. The overlay preserves the grid's column geometry.
Invert visible selection toggles the current results in one update, preserving
selected stickers outside the current filter. Selection survives a reload.

Suggestions rank shared tags, categories, and filename tokens using weighted
Jaccard similarity. Rare labels weigh more than common labels. This is metadata
similarity, not image embedding similarity. The index builds once in a worker
per panel session, and subsequent suggestions reuse it. Stale responses never
replace suggestions for a newer source.

Performance choices:

- Load the workspace JavaScript only on demand, and create its worker only
  when a source sticker is chosen.
- Mount card controls only for pointer intent, focus, or tap.
- Use still previews throughout the workspace and collapsed tray.
- Limit the tray to 12 thumbnails and the expanded sheet to 48 per batch.
- Keep the export bar opaque to avoid filtering the moving grid beneath it.
- Keep selected artwork flat at rest. Selection remains visible through its
  checkmark and underline, without transforming every selected image.
- Memoize image components and retain offscreen containment for selected cells.
  Bulk selection changes do not start hundreds of CSS transitions.
- Avoid per-image shadow filters; hover lift uses a transform. Removing filters
  resolved the desktop Small-grid rapid-scroll regression in the final checks.
- Respect reduced motion for interaction-triggered animation playback.

Failed previews fall back once to a small still image, then show an unavailable
placeholder while remaining selectable. A hydration scan also catches failures
that happened before React attached its listeners. Suggestion worker startup,
runtime, malformed-response, and timeout failures retain the sheet and offer a
retry. A failed workspace chunk remains isolated from the picker; reload recovery
retains selection.

## Performance verification, October 5, 2026

Run the isolated checks with:

```sh
PERF_FULL_CHROMIUM=1 PERF_PORT=4324 pnpm test:e2e:performance \
  tests/performance/scroll.performance.spec.ts \
  tests/performance/workspace.performance.spec.ts --reporter=list
```

The final eight checks passed in Chromium 153 using Apple M2 Metal rendering.
At 4× CPU throttling, workspace interactions had a 16.8 ms p95 animation-frame
gap and zero long main-thread tasks at both 1440px and 390px. Opening the lazy
workspace, including test-driver overhead, took 249 ms and 209 ms respectively.

At 2× CPU throttling, the selected-grid scroll checks had p95 frame gaps around
16.8 ms across desktop and mobile Small/XL, except desktop Small rapid scrolling
at 33.3 ms. All scroll phases had zero long tasks. These are local browser measurements,
not a claim of guaranteed FPS on physical phones or other browsers. The tests
attach raw frame and task measurements for each run.

The additional bulk-interaction checks use 4× CPU throttling and a real CDP
network limit of 4 Mbps with 40 ms latency. They invert the whole selection four
times, open both workspace tabs and export controls, change export tiers, and
invert filtered results. Desktop measured a 33.4 ms p95 frame gap, a longest
main-thread task of 72 ms, and 28 ms total blocking time. Mobile measured 33.3 ms
p95 and zero long tasks. The desktop result still includes brief measurable
blocking; these measurements do not promise universally jank-free interaction.

Browser checks decode all 1,053 preview assets (351 stickers at three sizes),
open and scroll the entire expanded sheet on desktop and mobile, and verify
actual painted sticker pixels after repeated Small/XL grid jumps. Fault injection
covers worker failures, failed image requests, and a failed lazy workspace chunk.
