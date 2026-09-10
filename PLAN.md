# Plan

## Similarity Processing

Pre-associate emojis using locally computed visual descriptors and ship the results with the static site. Provide distinct **Similar colors** and **Looks similar** views; palette resemblance does not imply the same object, expression, or meaning. This is proposed work, not an implemented or benchmarked capability.

Start with the existing offline image-maintenance pipeline, Sharp, stable emoji IDs, and content hashes. No standalone prefactor is currently justified. Each ticket includes a usable result, generated data, and behavior-level verification. Work tickets whose blockers are complete; `ready-for-agent` describes ticket readiness, not completion of dependencies.

### Processing requirements shared by all tickets

- [ ] Emit progress for discovery, descriptor extraction, pair comparison, and index publication: completed/total, cache hits, newly processed images, failures, elapsed time, and current phase. Show the current image during extraction and periodic heartbeats during long operations; support readable terminal output and a machine-readable final summary.
- [ ] Measure extraction throughput in images/sec or images/minute using newly processed images and elapsed extraction wall time. Report cache hits separately, so warm-cache runs do not inflate processing throughput. Report comparisons/sec for pair matching, phase timings, total wall time, and completed/failed counts; include sampled-frame counts for animation.
- [ ] Persist completed work incrementally in atomic checkpoints keyed by content hash and the full processing configuration/version. A restart reuses valid work, retries failed or unfinished items, and resumes expensive comparison work where its inputs remain valid.
- [ ] Make repeated runs idempotent: unchanged inputs and configuration produce identical descriptors, rankings, and published artifacts, with deterministic ordering and no duplicate records. Keep run timestamps and runtime statistics in reports rather than deterministic artifact content.
- [ ] Publish a new index only after validating a complete generation against its catalog snapshot. Cancellation or failure preserves the last valid published index and reusable checkpoints; configuration changes and catalog changes invalidate affected work explicitly.
- [ ] Verify interruption followed by restart against a clean run, no-op reruns, changed/deleted inputs, configuration invalidation, and failure recovery. Capture cold-run and warm-run timings on the actual collection, clearly identifying which work each measurement includes.

### 01: Browse emojis with similar colors using a histogram baseline

**What to build:** A user can open “Similar colors” on an emoji and browse up to 12 related emojis, backed by an offline-generated color index.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Normalize artwork consistently: preserve aspect ratio, trim transparent padding, ignore fully transparent pixel colors, and weight partial transparency by alpha. Preserve opaque backgrounds; handle empty artwork explicitly.
- [ ] Generate normalized histograms against one shared, versioned 64-color palette in Oklab. Use a documented histogram distance and deterministic tie-breaking.
- [ ] Cache descriptors by image content hash and algorithm version. Regenerate affected neighbor lists when images are added, changed, or removed, including lists belonging to unchanged emojis.
- [ ] Publish the index atomically with valid emoji references; exclude self-matches. A failed generation must not silently publish partial or stale results.
- [ ] Expose an accessible similarity action without interfering with emoji selection or exports. Handle unavailable indexes and empty results gracefully; do not force weak matches just to fill 12 slots.
- [ ] Initially use first-frame descriptors for animation and identify this limitation in the processing report.
- [ ] Verify a complete offline-generation-to-browser flow, transparent-padding invariance, color ordering, catalog changes, and deterministic output using small controlled fixtures.

### 02: Improve color matching with dominant palettes and transport distance

**What to build:** “Similar colors” recognizes nearby shades and similar color proportions more reliably, with visible palette swatches explaining the matches.

**Blocked by:** 01 — Browse emojis with similar colors using a histogram baseline.

**Status:** ready-for-agent

- [ ] Extract up to eight dominant Oklab colors with normalized alpha-weighted proportions; make extraction deterministic and handle images with fewer distinct colors.
- [ ] Compare palettes using Earth Mover’s Distance with Euclidean Oklab ground distance. Document solver precision and normalization.
- [ ] Keep the histogram baseline selectable in a local comparison report so the new method can be assessed on identical queries.
- [ ] Display extracted swatches and proportions alongside color matches; do not present distance as a probability or an uncalibrated percentage of similarity.
- [ ] Verify that small shade changes cost less than clearly different hues, proportions affect ranking, and independently ordered palette entries produce the same distance. Record generation time on the actual collection.

### 03: Browse visual matches that account for color placement

**What to build:** A separate “Looks similar” view distinguishes emojis with the same palette but different arrangements of color.

**Blocked by:** 01 — Browse emojis with similar colors using a histogram baseline.

**Status:** ready-for-agent

- [ ] Add a 4×4 descriptor of alpha-weighted cell colors and coverage on a consistently fitted canvas, with explicit handling for empty cells.
- [ ] Generate and display a separate visual neighbor list combining the available palette score and layout score. Preserve the color-only view.
- [ ] Retain component distances and document their scaling and provisional combination weights; allow later palette substitution without changing the browsing contract.
- [ ] Verify that red-above-white ranks differently from white-above-red despite identical global palettes, while transparent padding and input resolution do not dominate ranking.
- [ ] Demonstrate the two modes on the same query in the browser, including keyboard access and mode switching.

### 04: Improve visual matches using silhouettes and internal edges

**What to build:** “Looks similar” uses outline and internal-detail evidence to distinguish similarly colored objects and expressions.

**Blocked by:** 03 — Browse visual matches that account for color placement.

**Status:** ready-for-agent

- [ ] Generate aligned silhouette and internal-edge descriptors separately. Treat fully opaque alpha masks as uninformative, rather than evidence that every opaque image has the same shape.
- [ ] Start with mask overlap and symmetric edge-distance comparison, using a consistent canvas and size normalization. Define behavior for empty masks and edge maps.
- [ ] Keep orientation meaningful by default; do not automatically equate rotated arrows or mirrored symbols.
- [ ] Incorporate informative shape scores into visual ranking and retain inspectable component scores. Missing shape evidence must not become a perfect-match score.
- [ ] Show query/match masks and edges in a local inspection report, and demonstrate resulting neighbors in the browser.
- [ ] Verify same-palette/different-shape, same-silhouette/different-detail, opaque, transparent, and direction-sensitive cases. Reserve Hu moments, Fourier descriptors, and shape contexts for evidence-driven follow-up if this baseline fails.

### 05: Match animated emojis across their duration

**What to build:** Both similarity views represent animated emojis across their playback, rather than relying on a potentially blank or misleading first frame.

**Blocked by:** 02 — Improve color matching with dominant palettes and transport distance; 04 — Improve visual matches using silhouettes and internal edges.

**Status:** ready-for-agent

- [ ] Sample a bounded number of correctly composited frames at deterministic times using frame durations, with documented limits and fallback behavior.
- [ ] Aggregate palette evidence by represented duration; retain representative layout and shape descriptors rather than averaging moving outlines into an artificial shape.
- [ ] Define symmetric animation-to-animation and animation-to-still comparison rules. Avoid treating one coincidental matching frame as a match for the whole animation.
- [ ] Version the sampling policy in cache keys, regenerate affected neighbors, and identify the policy in processing reports.
- [ ] Verify blank-first-frame, unequal-frame-duration, moving-shape, and static-image cases, and demonstrate changed recommendations for a real animated emoji.
- [ ] Measure processing time and memory on the collection; report this as appearance matching across frames, not motion-semantic understanding.

### 06: Calibrate rankings against judged examples from the collection

**What to build:** Maintainers can compare methods on a repeatable visual report and select supported defaults for both similarity views.

**Blocked by:** 05 — Match animated emojis across their duration.

**Status:** ready-for-agent

- [ ] Curate 30–50 representative query emojis with separate human judgments for palette resemblance and overall visual resemblance. Include same-color/different-object, same-object/different-color, text, opaque images, cutouts, and animation.
- [ ] Separate tuning examples from held-out evaluation examples before adjusting weights or cutoffs. Record the catalog snapshot, judgments, and algorithm versions.
- [ ] Produce side-by-side top-result reports for histogram, palette transport, layout, and shape combinations, with component scores and source images.
- [ ] Report precision at the displayed cutoff, judged ranking quality, coverage after filtering weak matches, runtime, and generated index size. State the limits of the small evaluation set.
- [ ] Select weights and minimum-quality rules from observed results; permit fewer than 12 results. Preserve separate color and visual defaults.
- [ ] Regenerate production neighbor data with the selected configuration and verify both modes in a production build. Document measured gains and remaining failure cases without claiming semantic similarity.

### 07: Review possible duplicate images with perceptual fingerprints

**What to build:** Maintainers can inspect likely alternate encodings or resized copies in a local duplicate-review report, separately from general similarity browsing.

**Blocked by:** 01 — Browse emojis with similar colors using a histogram baseline.

**Status:** ready-for-agent

- [ ] Add a versioned DCT perceptual fingerprint and Hamming-distance candidate retrieval alongside existing exact content-hash checks.
- [ ] Produce a viewable report with paired images, exact-versus-perceptual evidence, and distances; do not delete, merge, or rename candidates automatically.
- [ ] Verify resized/re-encoded copies and hard negatives such as different expressions with similar silhouettes. Select conservative review thresholds from observed examples.
- [ ] Explicitly scope initial perceptual matching to still images; identify animated images as unsupported for perceptual duplicate review rather than inferring equivalence from one frame.
- [ ] Reuse cache invalidation and stable IDs, and confirm duplicate-review candidates do not silently change either similarity mode.

### Research references and decision boundaries

- [MPEG-7 color and texture descriptors](https://www.ee.columbia.edu/~sfchang/course/spr/papers/MPEG-7colortexture.pdf): compact color histograms, dominant colors, spatial color layout, and retrieval evaluation. The proposed 64-color baseline and 4×4 layout are custom baselines, not claims of MPEG-7 conformance.
- [Rubner, Tomasi, and Guibas on Earth Mover’s Distance](https://users.cs.duke.edu/~tomasi/papers/rubner/rubnerIccv98.pdf): transport-based comparison of image signatures.
- [Oklab design](https://bottosson.github.io/posts/oklab/): perceptual color coordinates for palette extraction and ground distances.
- [TinEye MulticolorEngine](https://services.tineye.com/multicolorengine_sandbox/methods/search_color.html): product precedent for weighted-color and image-query search; public API behavior does not establish its internal algorithm.
- [OpenCV shape descriptors](https://docs.opencv.org/4.13.0/d3/dc0/group__imgproc__shape.html), [Fourier contour descriptors](https://docs.opencv.org/4.13.0/dd/ddc/group__ximgproc__fourier.html), and [Berkeley shape research](https://www2.eecs.berkeley.edu/Research/Projects/CS/vision/shape/): possible follow-up methods, not required initial dependencies.
- [pHash design](https://phash.org/docs/design.html): perceptual fingerprints for duplicate candidates, distinct from general color or semantic similarity.

Semantic embeddings, motion recognition, automatic background removal for opaque artwork, and advanced contour matching remain follow-up options gated by observed retrieval failures.
