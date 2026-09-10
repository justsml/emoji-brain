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

Animation restoration retains the original alpha, frame count, individual durations and loop setting. The Nano sprite-sheet variant retains timing but can change poses, margins, colors or motion effects. It is an experiment requiring frame-by-frame review, not an automatic replacement. The effect-preserving blend is provisional and intentionally weak on motion-blur examples.
