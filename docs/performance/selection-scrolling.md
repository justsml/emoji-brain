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
