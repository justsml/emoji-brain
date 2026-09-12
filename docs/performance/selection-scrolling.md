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
