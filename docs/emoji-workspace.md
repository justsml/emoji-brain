# Emoji workspace

Tap a sticker to toggle selection and reveal the floating Similar control. Desktop pointers
reveal these controls after 120 ms of hover intent; keyboard focus reveals them
immediately. Similar opens related suggestions
without replacing the search results.

The masthead's theme atlas replaces the decorative sticker cluster. Choose 5,
10, or 20 common subject/mood/intent labels; selecting a word filters exact
semantic labels within the current search. The color rail's segment lengths
reflect alpha-weighted foreground color coverage with each sticker weighted
equally. Color choices sort the same results, preserving their selection and
using search order to break ties. Reset clears both discovery controls.

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

The final ten checks passed in Chromium 153 using Apple M2 Metal rendering.
At 4× CPU throttling, workspace interactions had a 16.8 ms p95 animation-frame
gap and zero long main-thread tasks at both 1440px and 390px. Opening the lazy
workspace, including test-driver overhead, took 247 ms and 245 ms respectively.

At 2× CPU throttling, selected-grid scroll checks had p95 frame gaps of
16.7–33.3 ms across desktop and mobile Small/XL. All scroll phases had zero long
tasks. These are local browser measurements, not guaranteed FPS on physical
phones or other browsers. The tests attach raw frame and task measurements.

Bulk-interaction checks use 4× CPU throttling and a CDP network limit of 4 Mbps
with 40 ms latency. They invert the whole selection four times, open both
workspace tabs and export controls, change export tiers, and invert filtered
results. Desktop measured a 33.3 ms p95 frame gap, a longest main-thread task
of 68 ms, and 31 ms total blocking time. Mobile measured 33.3 ms p95 and zero
long tasks. Desktop still has brief measurable blocking.

Theme/color discovery uses 2× desktop and 4× mobile CPU throttling. Desktop
measured a 16.7 ms p95 frame gap; mobile measured 33.3 ms. Neither had long tasks.
Additional 4× desktop stress runs varied between 33 and 50 ms p95 and had brief
55–68 ms tasks; they do not consistently meet the 35 ms discovery frame budget.
These measurements do not promise universally jank-free interaction.

Stable keyboard callbacks let memoized cells survive sorts, React transitions
give input priority, and grid containment limits layout/paint work. The atlas
keeps its height stable when changing the number of words.

Browser checks decode all 1,053 preview assets (351 stickers at three sizes),
open and scroll the entire expanded sheet on desktop and mobile, and verify
actual painted sticker pixels after repeated Small/XL grid jumps. Fault injection
covers worker failures, failed image requests, and a failed lazy workspace chunk.
