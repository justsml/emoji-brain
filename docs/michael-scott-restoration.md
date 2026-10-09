# Michael Scott restoration

The six Michael Scott reactions were restored locally on dev04's RTX 3090
and approved with “Looks good, include them” in the continuing M2Air handoff
conversation. The exact reviewed candidate and prior production hashes are
recorded in [review-decisions.json](../staging/emoji-enhancements/michael-scott/review-decisions.json).
The [manifest](../staging/emoji-enhancements/michael-scott/manifest.json) records
model URLs and hashes, source hashes, processing settings, CUDA inference,
animation timelines, preview hashes and promotion time.

| Emoji | Source → restored | Frames | Expression |
| --- | --- | --- | --- |
| michael-scott-shocked | 128 → 512px | 1 | shocked |
| michael-scott-worlds-best-boss | 128 → 512px | 1 | deadpan, confident |
| michael-scott-awkward-smile | 128 → 512px | 1 | embarrassed, anxious |
| michael-scott-screaming-no | 128 → 512px | 1 | shocked, angry |
| michael-scott-laughing | 60 → 240px | 33 | laughing, embarrassed |
| michael-scott-shaking-head-no | 60 → 240px | 28 | sad, skeptical |

The photo route uses the official Real-ESRGAN compact general-x4v3 network,
with equal strong and weak denoise weights. Each native source frame receives
4× learned restoration, then a 75% restoration / 25% source-resize blend.
The 60px animations stop at 240px; they are not interpolated to 512px and
presented as further model detail. Existing backgrounds remain intact. For
transparent pixels, black/white composites recover RGB while the exact
resampled source alpha is retained. No generative redraw, matting or paid API
was used. Fine facial detail is an estimate from the low-resolution sources;
the output does not recover a verified higher-resolution original.

The lossless production masters preserve the two animations' 33 and 28 frames,
each delay, and infinite loop setting. The validator also checks exact alpha,
candidate/source/preview hashes, archived originals, current production bytes,
and that each result differs from a plain resize. All six pass. The comparison
gallery was verified in T3's browser: six pairs, enlarged and 32px views,
synchronized animation playback, stable pause and final-frame scrubbing.

Pre-restoration production WebPs and the original catalog metadata are archived
under [originals/](../staging/emoji-enhancements/michael-scott/originals/).
The review gallery also retains byte-identical PNG/JPEG/GIF inputs. Production
metadata keeps stable IDs and names; dimensions, hashes, byte sizes, animation
stills and delivery assets are refreshed. Semantic labels carry explicit
upscale provenance rather than claiming a new model labeling run.

All six use controlled `person`, `photo`, `formalwear`, `actor-likeness` and
`the-office` facets, plus their individual expressions and reaction intents.
Identity aliases include Michael Scott, Steve Carell, The Office and Dunder
Mifflin. Reaction aliases cover awkward/cringe, shocked/OMG, screaming/no,
nervous laughter and disapproval. The head-shake clip has no visible tears, so
its literal `crying` expression was corrected to `skeptical`; “crying” and
“holding back tears” remain useful reaction search aliases. Canonical facet
IDs and cardinalities were checked against vocabulary version 4. Pagefind
indexes both canonical tags and synonyms.

Final validation passed: 187 unit tests, all 57 existing functional browser
tests, and 16 browser checks against the updated assets (including two new
identity/reaction search tests). The production build passed. Catalog validation
found 366 entries and zero invalid records; delivery validation checked 11,453
frames across all 366 entries and found no Slack-incompatible emoji. The new
animations ship at 128px for Slack's byte cap while their 240px masters remain
available. The repository-wide `tsc --noEmit` check still reports legacy optional
script dependencies and test matcher declarations; it reports no errors in the
changed analytics, export or Slack runtime TypeScript files.

## Reproduce and inspect

The machine-local environment is Python 3.12.15 with PyTorch 2.14.1, Pillow
12.3.0 and NumPy 2.5.3. Install a compatible CUDA build for NVIDIA processing.
The restored runtime does not include rembg because this batch preserves its
existing alpha and backgrounds.

```sh
mise exec uv@0.12.23 -- uv venv --python 3.12 /tmp/emoji-enhancement-venv
mise exec uv@0.12.23 -- uv pip install --python /tmp/emoji-enhancement-venv/bin/python torch==2.14.1 pillow==12.3.0 numpy==2.5.3
```

Download `realesr-general-x4v3.pth` and `realesr-general-wdn-x4v3.pth` from
the [official release](https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.5.0)
into `/tmp/emoji-models/`; the manifest records their SHA-256 hashes. The adapted
network retains its BSD license in `scripts/emoji-enhancement/Real-ESRGAN-LICENSE.txt`.
`EMOJI_MATTE_PYTHON` and `EMOJI_MODEL_DIR` can override these runtime paths.
`EMOJI_UPSCALE_DEVICE` accepts `auto`, `cuda`, `mps` and `cpu`.

```sh
node scripts/emoji-enhancement/michael-scott.mjs --validate
python -m http.server 8765 --directory staging/emoji-enhancements/michael-scott
```

Open the served gallery to compare the archived source and promoted candidate.
Before approval, running the batch without a flag generates resumable review
candidates. `--promote` requires a separate human approval record bound to every
candidate and prior production hash. A promoted batch cannot be regenerated or
promoted again in place; revisions need a new review batch.
