# Emoji enhancement pilot — 2026-09-10

Open `index.html` for seven models × two images, with 256px, 64px and 32px previews and full-resolution downloads. `*-comparison.png` are contact sheets. Originals in the catalog were not changed.

## Findings

Real-ESRGAN is the best value **in this two-image pilot**: recognizable composition, cleaner edges, and retained cat transparency for $0.002/image. Crystal adds convincing detail but changes the cat's features and fabricates lettering on the Lego image. Neither can recover unreadable lettering reliably.

| Model | Estimated USD/image | Visual assessment |
| --- | ---: | --- |
| [Real-ESRGAN](https://replicate.com/nightmareai/real-esrgan) | 0.002 | Best value and fidelity; some smoothing and invented edges |
| [Clarity](https://replicate.com/philz1337x/clarity-upscaler) | Runtime | Poor on these tiny inputs; substantial distortion |
| [Crystal](https://replicate.com/philz1337x/crystal-upscaler) | 0.05 | Most detailed; invents features and lettering |
| [Topaz Low Resolution V2](https://replicate.com/topazlabs/image-upscale) | 0.08 conservatively | Sharper but distorted; loses cat alpha |
| [P-Image-Edit](https://replicate.com/prunaai/p-image-edit) | 0.01 | Redesigns Lego composition; fake checkerboard on opaque background |
| [Nano Banana](https://replicate.com/google/nano-banana) | 0.039 | Little useful deblurring; loses cat alpha |
| [Qwen Image Edit](https://replicate.com/qwen/qwen-image-edit) | 0.03 | Adds outlines/background and changes artwork |

Fixed-price subtotal estimate: $0.422 for 12 outputs, plus two Clarity runtime charges. Rough total: $0.43. This is not an invoice. Topaz's current billing widget says $0.08/unit while its README says $0.05; budget uses the higher value. Raw pricing snapshots are saved beside the schema snapshots. Hardware price fields do not override custom per-image billing.

## Method and limits

All seven received identical original WebP pixels (28×28 cat, 30×30 Lego), with no pre-enlargement. Four upscalers requested 4×; three editors returned 1024×1024. Clarity returned 112×112 for both inputs. The comparison normalizes display size, not model output resolution. The editing prompt and exact inputs, version IDs, timings and prediction IDs are in `run.mjs` and `*.result.json`. Crystal required the model endpoint after its advertised version was rejected. One sample per model/image; no universal best-model claim or automated perceptual ranking. Replicate was used for all calls; OpenRouter models were researched but not benchmarked independently.

Real-ESRGAN and Crystal retained alpha on the cat. The other five returned opaque outputs. Alpha presence alone does not guarantee faithful alpha boundaries. Originals remain authoritative.

## Detection

Run from the repository root:

```sh
node scripts/assess-image-quality.mjs > experiments/image-enhancement/quality-report.json
```

The detector flags images whose longest side is below a provisional 128px target, and separately flags low native-pixel Laplacian variance as possible blur/flat artwork. It excludes transparent boundaries from the sharpness score and checks only the first frame of animated files. The blur threshold of 80 is **uncalibrated**; flat illustrations and intentional pixel art can be false positives. This produces review candidates, not an automatic enhancement queue. Both supplied examples are reliably caught by resolution.

Recommended next pipeline: detect → review candidates → Real-ESRGAN trial output → compare at actual emoji display sizes → accept explicitly. Keep originals and hashes, skip animated replacement until frame handling is defined. At 4× these two outputs are 112px/120px, so reaching 128px requires a different scale; the pilot intentionally uses a consistent 4× setting.

## Reproduce

`node experiments/image-enhancement/run.mjs` resumes saved jobs and downloads missing outputs. It reads `REPLICATE_API_TOKEN` or the existing `REPLICATE_API_KEY` from environment / `.env` and uses curl. Missing job files cause paid predictions. No credential values are written into artifacts. `node experiments/image-enhancement/report.mjs` rebuilds the comparison without model calls.
