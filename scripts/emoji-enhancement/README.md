# Emoji enhancement review tools

Candidates belong in `staging/emoji-enhancements/`, pending human approval. Never infer approval from a Git commit. Production originals remain in `public/emojis/`.

The still manifest retains original and candidate hashes, prompts where available, processing routes, and review notes. Large provider responses and intermediates live in the ignored `experiments/image-enhancement/` directory. Recovery scripts resume that existing experiment state; they are not a fresh catalog-generation command.

## Rebuild and validate

```sh
node scripts/emoji-enhancement/stage-stills.mjs
node scripts/emoji-enhancement/validate-staging.mjs
node scripts/emoji-enhancement/animated-pilot.mjs meow_bongotap,thankyou,meow_hyper_think
node scripts/emoji-enhancement/stage-animations.mjs
node scripts/emoji-enhancement/validate-animations.mjs
```

Omit the animation name argument to process the fixed 12-sample pilot. Existing generated images and provider prediction receipts are reused. Inspect failed receipts before retrying; do not delete successful generation outputs. Model calls incur provider charges.

OpenRouter reads `OPENROUTER_AI_KEY` or `OPENROUTER_API_KEY`; Replicate reads `REPLICATE_API_TOKEN` or `REPLICATE_API_KEY`, from `.env` or the environment. Never include keys or raw command errors in review artifacts.

## Local restoration and matting

The current local runtime is an external Python 3.12 environment at `/tmp/emoji-enhancement-venv`, containing PyTorch, Pillow and `rembg[cpu]==2.0.84`. Set `EMOJI_MATTE_PYTHON` to another compatible Python executable. The local Real-ESRGAN script uses official `realesr-animevideov3.pth` weights at `/tmp/emoji-models/realesr-animevideov3.pth`; rembg caches BiRefNet general-lite weights in its normal model directory. These are machine-local dependencies, not bundled project packages.

Upstream architecture and weights: [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN). The adapted compact SR network's BSD license is retained in `Real-ESRGAN-LICENSE.txt`. Local matting uses [rembg](https://github.com/danielgatis/rembg).

Semantic background removal can erase white faces and eyes. Enclosed-alpha repair restores only holes supported by the original source. Border-connected white removal is a narrower alternative for manually inspected outlined flat artwork on uniform white; it is unsuitable for general photos or unoutlined white subjects.

Animation restoration retains frame count, individual durations and loop setting. Dual black/white restoration estimates a sharper alpha matte; the effect-preserving blend retains the original alpha. The Nano sprite-sheet variant retains timing but can change poses, margins, colors or motion effects. It is an experiment requiring frame-by-frame review, not an automatic replacement. The effect-preserving blend is provisional and intentionally weak on motion-blur examples.

## Remaining animations

```sh
node scripts/emoji-enhancement/remaining-animations.mjs
node scripts/emoji-enhancement/fix-white-animation-backgrounds.mjs
node scripts/emoji-enhancement/preserve-animation-details.mjs
node scripts/emoji-enhancement/stage-remaining-animations.mjs
node scripts/emoji-enhancement/validate-remaining-animations.mjs
```

The remaining batch excludes the 12 pilot names, checkpoints completed unique frames, and reuses completed outputs. An optional comma-separated name argument limits processing. `stage-remaining-animations.mjs --prepare` builds assets for completed jobs without publishing an incomplete gallery.

Photo clips use the official compact `realesr-general-x4v3` model with equal strong/weak denoise weights and a source blend. Flat artwork uses animevideov3. Effect-specific settings are in `remaining-animation-plan.mjs`; Nyan Cat and Unikitty remain pixel art and the existing 1080p bongo animation receives only a 512px export. The model files and SHA-256 hashes are recorded in the staged manifest.

`mux-animation.mjs` packs independently encoded lossless frames using full-canvas, no-blend WebP animation chunks. This retains repeated frames, blank holds, exact durations and finite loop counts instead of coalescing frames. Its regression test covers translucent content disappearing between repeated frames and a loop count of 257. See the [WebP container specification](https://developers.google.com/speed/webp/docs/riff_container).

Plain white canvases are removed only for three hand-reviewed outlined animations. Photo scenes and existing source cutouts retain their backgrounds/alpha. An optional per-image `selection.json` in the ignored experiment directory can select a reviewed exception, bound to the source hash; the staged manifest records the actual selected model, prompt and output hash. Boxcat uses this exception after a Nano trial recovered colors that local restoration could not.

`preserve-animation-details.mjs` selects local frame refinements for South Park facial texture and Unikitty pixel art without rerunning a model. After an exception changes, `stage-remaining-animations.mjs --only=name1,name2` refreshes those entries in an existing complete gallery; run the full validator afterward.
