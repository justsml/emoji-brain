# Selection-page scrolling tuning

The scroll benchmark uses the production Astro build, Chromium at 1440 × 1000,
and 2× CPU slowdown. It keeps the first-visit full selection and moves the
pointer over the grid. It exercises slow native wheel input, rapid native wheel
reversals, and twelve alternating instant document-end/document-home jumps.
Every jump's endpoint is asserted, and the document height must remain stable.

Run with:

```sh
pnpm exec playwright test --config=playwright.performance.config.ts scroll.performance.spec.ts --repeat-each=3
```

Reports are attached as `scroll-metrics.json` in the Playwright report. Frame
sampling uses requestAnimationFrame; long tasks use PerformanceObserver, and
main-thread work uses Chrome's Performance metrics. These measure the renderer,
not physical display presentation or compositor FPS. CPU throttling does not
emulate every characteristic of a slower phone. Compare repeated runs on the
same machine without concurrent builds or test suites.

The initial `scroll-baseline.json` predates endpoint assertions: its slow-scroll
measurement is useful, but its jump results must not be used as evidence. Plain
Home/End input plus insufficient settling allowed native scroll animation to
continue between phases. The final harness waits for wheel input to settle and
uses explicit instant jumps with endpoint assertions.

## Rejected: contain every selected card

Removing the selected-card exception to `content-visibility: auto` reduced jump
work but increased work when revealing cards during wheel scrolling. Reverted.
Three-run medians from `scroll-baseline-runs.json` and
`scroll-rejected-containment-runs.json`:

| Scenario | Baseline main-thread work | Containment experiment | Baseline p95 frame gap | Experiment p95 |
| --- | ---: | ---: | ---: | ---: |
| Slow wheel | 1160 ms | 1446 ms | 16.8 ms | 33.3 ms |
| Rapid reversals | 824 ms | 1335 ms | 16.8 ms | 50.0 ms |
| Instant end/home | 437 ms | 319 ms | 16.8 ms | 16.8 ms |

These are total task durations per scenario, not per frame. The baseline
comparison restored the selected-card CSS exception before scroll sampling;
load timings are not a controlled comparison. The experiment can be reproduced
with `SCROLL_CONTAINMENT_EXPERIMENT=1` before the benchmark command.

## Deferred selection persistence

`useLocalStorage` now updates React state synchronously and schedules both
serialization and storage writes with `requestIdleCallback` (one-second maximum
wait), or a 250 ms timer fallback. Committed changes replace the pending value,
so a rapid sequence produces one write of the latest selection. Page hiding,
pagehide, and unmount flush pending data to preserve immediate reload/navigation.
The storage API itself is synchronous; this change moves and coalesces the work,
it does not make a storage call preemptible.

Unit tests verify coalescing, immediate state visibility, lifecycle flushing,
and the timer fallback. Browser tests verify immediate reload after deselecting
one emoji and after deselecting everything.

## Initialize saved-selection lookup once

The provider eagerly constructed its reducer's initial state on every render,
including rebuilding the catalog alias lookup after focus or selection changes.
A lazy reducer initializer does this once. The regression test observed four
reconciliation calls during initialization plus one interaction before the fix,
and one afterward, with the same restored selection and selection behavior.

## Avoid incidental animation downloads

Animated cards now require 120 ms of hover intent before swapping a still for
an animation. Brief pointer crossings cancel the timer, static cards do not
enter playback state, and click/focus playback stays immediate. Unmount cancels
pending timers. A browser regression test first observed an animation request
from a 20 ms crossing; after the change the same crossing made zero animation
requests, with deliberate hover and focus playback both passing.

## Avoid duplicate consumer renders

Memoize the context value so storage mirroring does not notify every consumer
again. Reducer updates for unchanged focus, search status, filter-array identity,
selected-only mode, and grid size now return the existing state. Tests verify
one initial consumer render, one additional render for a selection change, and
no additional render for repeated current values. Actual changes still notify
consumers normally.

## Renderer matters

The default headless Chromium on this host uses SwiftShader with software
compositing/rasterization. Windowed Chromium uses ANGLE Metal on Apple M2 with
GPU compositing and rasterization enabled. The benchmark now records GPU device
and feature status. Add `--headed` to run the GPU-backed comparison. Do not
interpret software renderer limits as a measurement of physical display FPS.

Forcing `will-change: transform` on every image was also rejected: it made the
software renderer slower during rapid XL scrolling. The experiment is available
with `SCROLL_LAYER_EXPERIMENT=1`; it is not applied in product CSS.

## Keep unrelated cards memoized

The grid keyboard handler no longer captures the entire selection. Each cell
passes its current selected flag when handling a key. Changing one selection
therefore changes only that card's props, rather than replacing the keyboard
callback on every card. The render regression test changed from all three
fixture cards rendering to just the changed card; keyboard selection and
announcement tests remain in the full unit suite.

For GPU rendering without a desktop window, run:

```sh
PERF_FULL_CHROMIUM=1 pnpm exec playwright test --config=playwright.performance.config.ts scroll.performance.spec.ts --repeat-each=3
```

This uses the [documented full Chromium headless mode](https://playwright.dev/docs/browsers#chromium-new-headless-mode).
Always inspect the recorded renderer status: the channel alone is not a GPU
guarantee. Initial full-browser runs stalled on the external font request while the
desktop was also locked; those startup results are excluded from the steady
scroll comparison. The locally hosted font fix allowed the full headless GPU
run to finish normally.

## Remove a blocking external font stylesheet

The full-browser investigation exposed a real startup failure: while the Google
Fonts stylesheet was pending, the selection island remained blank. The inline
script following that stylesheet and module startup depended on stylesheet
completion. A regression test holds the external stylesheet indefinitely and
requires an interactive grid within three seconds; it failed before this fix.

Bricolage Grotesque and Instrument Sans now load from the site's own WOFF2
assets, with the same variable weight ranges and Unicode subsets. The two Latin
subsets are preloaded (about 107 KB combined), and `font-display: swap` preserves
text rendering if a font itself is slow. This removes the external stylesheet
and connection handshakes from startup. License texts and exact download URLs,
byte lengths, and SHA-256 hashes are in `public/fonts/`.


The faster startup exposed an immediate-navigation race in the first deferred
persistence implementation. Pending values are now captured in layout effects
(commit phase); only serialization and the write wait for idle. Ten consecutive
browser runs passed the immediate-selection/empty-selection reload test.

Phone screenshots also exposed clipped export controls. The action row now
wraps within the viewport; the existing bottom clearance accommodates the
wrapped controls. The visible-image regression checks both decoded stickers and
control bounds on desktop and phone widths.

## Final GPU-backed runs

Three runs each, full Chromium headless with Apple M2 GPU compositing and
rasterization enabled, 2× CPU slowdown, 351 initially selected emojis, local
production build. Raw results: `scroll-final-gpu-runs.json`.

| Grid | Median grid-ready sampler time | Slow p95 frame gap | Rapid p95 | End/home p95 | Scroll long tasks |
| --- | ---: | ---: | ---: | ---: | ---: |
| Desktop, small | 342 ms | 16.8 ms | 16.8 ms | 16.8 ms | 0 |
| Desktop, XL | 332 ms | 16.8 ms | 16.8 ms | 16.7 ms | 0 |
| Phone width, small | 292 ms | 16.7 ms | 16.7 ms | 16.8 ms | 0 |
| Phone width, XL | 297 ms | 16.8 ms | 16.8 ms | 16.8 ms | 0 |

These are approximately 60 Hz rAF intervals at the 95th percentile, not a claim
that every frame on every device presents at 60 FPS. Initial grid rendering
still has an approximately 80–100 ms task at 2× CPU slowdown. The dense desktop
rapid-reversal scenario also has a median worst rAF gap of 116.6 ms despite zero
long tasks. Two focused compositor traces recorded **59 and 60 native scroll results,
each with zero janky scroll results** (`scroll-compositor-summary.json` and
`scroll-compositor-verified.json`), distinguishing
main-thread animation-frame sampling from compositor scrolling. These are
diagnostic traces, not a universal no-jank guarantee.

Chrome's [scroll-jank tracing guidance](https://chromium.googlesource.com/chromium/src/+/master/docs/speed/debug-janks.md)
explains why compositor traces are useful alongside main-thread metrics. To
capture the rapid phase and its ScrollJankV4 summary locally:

```sh
PERF_FULL_CHROMIUM=1 SCROLL_TRACE=1 pnpm exec playwright test --config=playwright.performance.config.ts scroll.performance.spec.ts -g desktop-small
```

The raw trace goes to the test output directory and is intentionally not stored
in Git. Removing shadows was tested diagnostically but not shipped: it reduced
one worst-frame measurement while worsening the rapid-scroll p95, and changed
the artwork's presentation.

The release validator also exposed a pre-existing cached catalog count of 352
for 351 records. Only that derived count was corrected; catalog validation then
passed with zero invalid emojis.


## Completed validation

- 124 unit tests passed across 22 files.
- 26 browser tests passed, including selection/reload, search, hover, image
  decoding at both page ends, native navigation keys, export cancellation,
  archive bytes, and mocked Slack replacement/restore scenarios.
- Twelve GPU-backed scroll runs passed (three per viewport/size scenario).
- The intentional-freeze instrumentation control and both throttled full-export
  performance profiles passed. Grid readiness was 1.01 s on the 4G profile and
  2.33 s on 3G; scroll p95 was 16.8 ms on both. Maximum input round trip during
  export was 42 ms and 23 ms respectively. Raw results are in
  `selection-export-validation.json`.
- The catalog validator passed with 351 emojis and zero invalid entries.
- CI passed catalog validation, unit tests, production build, and GitHub release
  for product commit `0034812` after correcting the pre-existing catalog total.

Browser regression tests used a dedicated local preview port to avoid other
running previews. Standard rerun commands are `pnpm build`,
`pnpm exec playwright test --workers=1`, and `pnpm test --maxWorkers=1`.
