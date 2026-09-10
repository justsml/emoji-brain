# Testing Emoji Explorer

Use pnpm. Install Chromium once with `pnpm exec playwright install chromium`.

```sh
pnpm test                           # Vitest unit/component tests
pnpm exec vitest run --maxWorkers=1         # Serial run on a resource-constrained machine
pnpm build && pnpm test:e2e         # Functional browser tests
pnpm test:e2e:performance           # Builds automatically, then throttled performance tests
```

Functional Playwright tests use port 4321 and can reuse a running preview. Performance tests use an isolated production preview on port 4322, fresh browser contexts, one test worker, disabled caches, and no retries. They run separately so other tests, trace recording, and video encoding do not distort the measurements. Stop other resource-intensive jobs before benchmarking.

## Performance profiles

| Profile | CPU slowdown | Download | Upload | Latency |
| --- | --- | --- | --- | --- |
| 4g-half-cpu | 2× | 4Mbps | 3Mbps | 40ms |
| 3g-half-cpu | 2× | 1.6Mbps | 750Kbps | 150ms |

These are explicit synthetic profiles, not universal cellular standards. [CDP CPU throttling](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setCPUThrottlingRate) uses a slowdown factor: 2 approximates half-speed execution relative to the test host, not a 50% OS CPU quota or a calibrated physical phone. GPU performance and host contention are not simulated. Real [network throttling](https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-emulateNetworkConditions) applies to the page and export-worker sessions; requests are not mocked. The suite asserts the configured rule ID on actual export-worker requests and a minimum export transfer duration so unthrottled worker downloads cannot silently pass.

A separate control test deliberately stalls the main thread for 650ms and proves the sampler detects it. This is excluded from application measurements.

Each profile covers cold navigation, native wheel scrolling from top to bottom and back while images load, selection of the full current catalog, and the actual Slack-export worker and clipboard write. Search input and scrolling continue throughout export. The script is decoded after measurement and every embedded WebP is compared by hash with its 128px delivery asset. No script is run on Slack and no emojis are uploaded.

The JSON attachment `performance-metrics.json` records:

- Grid-ready time, FCP, observed LCP, layout-shift sum, and resource bytes completed by grid readiness.
- Scroll and export frame-gap p95/max, longest main-thread task, long-task count and blocking time above 50ms.
- Chrome task/script/layout/style CPU counters, heap size and DOM node count before/after measured phases.
- Full-export duration, search-input round-trip latency, worker throttling evidence, script bytes and SHA-256.

Layout-shift sum is diagnostic and is not session-window CLS. LCP is an observed lab measurement, not a field Core Web Vitals result. Long-task blocking is recorded per test phase, not Lighthouse's navigation TBT. Input round trips include Playwright transport and actionability overhead and are not an INP measurement. Frame gaps measure main-thread animation callbacks; they do not prove every compositor frame was presented.

## Regression budgets

| Check | Budget |
| --- | --- |
| Grid-ready time | <15s on 4G; <30s on 3G |
| Completed initial resource transfers | <3.5MB |
| Scroll/export p95 frame gap | <50ms |
| Longest scroll/export frame gap or main-thread task | <500ms |
| Search input round trip during export | <1s |
| Complete full-catalog export | <90s on 4G; <180s on 3G |
| Slack script | <16MB and <1.4× embedded image bytes + 100KB |

These are regression ceilings, not claims of ideal UX. Inspect the attached measurements when a gate fails; do not automatically raise the thresholds. The catalog is read from the delivery manifest, so newly added emojis are included. Script-size gates catch accidental full-resolution exports or excessive serialization overhead. Pagefind must remain lazy, load one client, and avoid per-result fragment fetches.

Open the report with `pnpm exec playwright show-report playwright-report/performance`. To run one profile: `pnpm test:e2e:performance --grep 3g`. `--repeat-each=3` collects repeated samples without retrying failed measurements.

## Files

- `src/**/*.test.{ts,tsx}`: unit/component tests.
- `tests/*.spec.ts`: functional browser tests.
- `tests/performance/*.performance.spec.ts`: throttled browser performance tests.
- `tests/performance/metrics.ts`: CDP profiles and browser instrumentation.
- `playwright.performance.config.ts`: isolated serial performance runner.

Latest local measurements are retained in [`docs/performance-latest.json`](docs/performance-latest.json). That run detected export responsiveness budget failures under concurrent host load; it is not a passing baseline. The deliberate-stall control passed.
