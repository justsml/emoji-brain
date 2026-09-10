# Nano Banana Pro — next ten

User-selected model after the premium pilot. Ten static source images with alpha, excluding the first two examples. To avoid flat-art false positives in the uncalibrated blur score, selection uses the first ten alphabetically whose longest side is at most 64 pixels. Source images were visually inspected before submission; live metadata was checked again for alpha and animation. Selection and quality measurements are in `selection.json`.

1K is the smallest supported output tier. Pricing checked in the same session: $0.15 per output at either 1K or 2K, so ten successful outputs are estimated at $1.50. Requests use `match_input_image` instead of forcing square and otherwise retain the winning reconstruction prompt. The wording was generalized from “30 pixels” to “a tiny image.” This is reconstruction, not exact recovery; review character, gestures and text.

Transparency is required. Nano Banana Pro white-background outputs are intermediate files only. Final `*.transparent.png` files use Bria background removal ($0.018/image) after enhancement. An initial 851-labs trial removed an eye and made part of the DJ image transparent; its outputs were superseded by Bria and visually checked on dark and white backgrounds. Public catalog originals and metadata remain unchanged.

`node experiments/image-enhancement/batch-10/run.mjs` resumes saved requests, creating paid calls only for missing result files. `node experiments/image-enhancement/batch-10/report.mjs` rebuilds the gallery and contact sheets without model calls. Exact requests, model versions, prediction IDs and timings are retained in result JSON files.

`awesome.webp` was rejected twice by the generation provider; the next eligible static alpha image, `meow_googly-bongo.webp`, replaces it. Initial selection is retained in `selection-initial.json`. The first Fonzie generation was rejected for changing identity/age. Its artifacts have `fonzie-rejected-age` names; the rerun uses an explicit young Henry Winkler/Fonzie prompt in `prompt-overrides.json`.

## Final delivery

All ten delivered PNGs have genuine nonconstant alpha, checked numerically and against dark/white backgrounds. Nine are Nano Banana Pro reconstructions with Bria mattes. Fonzie is an exception: both generated likenesses were rejected. Final `fonzie.transparent.png` is a cropped actual Henry Winkler photo with Bria background removal, resized with Lanczos to the 1K tier without generative face reconstruction. It is a different source crop, not the exact original emoji recovered. Source: https://www.pinterest.com/pin/479211216583984766/ ; source image retained in `fonzie-source-alternate.jpg`. Original photo credit appears on the retained full source. The final photo-based alternative remains a review artifact; nothing has been published or substituted into the catalog.

`transparent-pngs.zip` contains only the ten final PNGs. The older white-background and rejected identity outputs remain in this experiment directory for traceability. Bria is the accepted background-removal method. `alpha-verification.json` and `alpha-verification.png` record the final alpha check.
