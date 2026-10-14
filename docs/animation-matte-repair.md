# Animation matte repairs

Applied 2026-10-14T16:00:03.272Z following the request “Fix the twelve animation masters.” All twelve production masters and their static companions were replaced with matte corrections derived from the existing black/white restoration caches. Historical approved masters remain byte-identical in their original staging paths, recorded per item in [the repair receipt](../scripts/emoji-enhancement/animation-matte-repairs.json).

The repair aligns transparency with the restored artwork instead of enlarging the tiny original mask. It reduces coarse contours and pale fringes while retaining the existing opaque artwork. It makes no new generative/model calls and does not recover additional source texture or photographic detail.

Opaque interiors are protected, and small disconnected source components preserve spray, rain and snow. Newly exposed edge pixels use the cached restored RGB. Full-canvas lossless muxing preserves all **1,140 frames**, each delay, canvas dimensions and loop behavior. Validation confirms that every still-visible pixel that was originally fully opaque retains its original RGB. The 21 formerly opaque pixels removed across the batch are within eight pixels of the original matte boundary; no opaque interior is removed.

The resumed rain cache has restored atlases for frames 62–63 but not 60–61. Those two missing frames reuse frame 62's matte corrections only where the prior masks agree throughout a surrounding eight-pixel region. Alpha around moving droplets remains local to each original frame. This exception is recorded in the receipt.

| Master | Frames preserved | Maximum canvas coverage change |
|---|---:|---:|
| alert | 17 | 0.048% |
| magic | 20 | 0.083% |
| meow-hearts | 42 | 0.158% |
| smart | 23 | 0.317% |
| meow-stretch | 239 | 0.327% |
| meow_clorox | 70 | 0.250% |
| meow_cloroxsip | 37 | 0.035% |
| meow_coffeespitting | 145 | 0.106% |
| meow_enjoy-rain | 150 | 0.164% |
| meow_enjoy-snow | 150 | 0.130% |
| meow_red-bull | 147 | 0.168% |
| meow_sad-rain | 100 | 0.120% |

The largest per-frame coverage change is **0.327% of the canvas**. Source names and semantic metadata remain the same; hashes, byte sizes, modification dates, static companions and explicit label provenance are refreshed. No new semantic labeling run is claimed.

The delivery generator reads the durable repair receipt and binds each selected production source to its recorded hash. This overrides the older staged candidates, preventing future delivery regeneration from restoring the old matte. Delivery encodings retain the existing Slack size/frame-reduction policy; this change repairs the twelve masters and their derived rasters.

## Reproduction and checks

The generation command requires the existing ignored local restoration caches. It does not download models or make provider calls. A completed applied batch requires a separate revision rather than overwriting its receipt.

`node scripts/emoji-enhancement/repair-animation-mattes.mjs` stages the twelve candidates. `node scripts/emoji-enhancement/apply-animation-matte-repairs.mjs` validates the full batch; the `--apply` form applies the requested repair after verifying hashes, geometry, timing and visible opaque RGB. Once applied, validation can use the durable receipt and production bytes even when the temporary candidates are absent.

`node scripts/emoji-enhancement/build-matte-repair-review.mjs` writes a standalone animated comparison gallery and three light/dark contact sheets to `/tmp/emoji-animation-repair`. Playback in the gallery starts independently; the contact sheets compare the same timeline positions.

Use `VIPS_DISC_THRESHOLD=1073741824` for delivery generation/validation on these large lossless masters to avoid libvips' temporary-file spill. Scope generation and delivery validation to the twelve names in the receipt.

The [quality audit](animation-quality-audit.md) records the pre-repair findings. Final delivery and post-repair audit results are recorded below.

## Final verification

All twelve delivery sets were regenerated from the repaired masters. Targeted delivery validation checked **3,958 decoded frames**, found **zero mean alpha error**, and found no Slack-incompatible asset. Source selection for all twelve matches the durable repair hashes. The two existing animation frame/mux regression tests passed. JavaScript syntax and whitespace checks passed.

The post-repair audit measured all **83 catalog animations** and found no delivery-source hash, duration or loop mismatches. The twelve repaired masters no longer match their enlarged original masks; the six remaining low-resolution-mask flags are the documented pixel-art/effect preservation cases. Source inheritance for `roo-zomg` remains unknown because its historical archive is absent.

The shared T3 browser disconnected while opening the review gallery, so playback was not visually verified there. Matching decoded before/after frames were inspected for every repaired master on white/dark backgrounds. The complete local animated gallery and three comparison sheets are retained. Extra full-catalog contact-sheet generation hit a disk quota after all audit measurements were saved; use `--data-only` when running the full audit without generating duplicate visuals.

Slack's existing 64px byte limit still reduces animation frames. The new alpha slightly changes compression costs: snow's 64px tier retains 50/150 frames and Red Bull's retains 49/147; their masters and larger deliveries retain the complete timeline.
