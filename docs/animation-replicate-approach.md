# Generating animated emoji: tweening pilot + the Replicate pipeline

Two routes for turning the 270 still emoji into loops. Both are built and have been run: the
tweening route produced a finished `meow_idea` loop, and the Replicate route produced a finished
`meow_facepalm` loop from one paid generation. The verdict on each is at the bottom.

## Route A — tweening (built, working)

`scripts/emoji-enhancement/tween-meow-idea.mjs` renders `meow_idea` subtle as 8 frames @ 120 ms,
71.6 KB at 512px, no model involved.

The rig: the bulb's radiating rays turned out to be a *single connected component* with the glass
(they touch its outline), so component labeling can't separate them. They're cut geometrically
instead, from the measured alpha profile — a fully transparent gutter at y=168 splits the bulb group
from the cat, and the column profile puts the glass-and-base core at x∈[220,288], everything outside
that being rays. Each frame composites three layers: cat (never resampled), glass core (RGB gain for
the glow pulse), rays (scaled about the bulb centroid at 252,82, with per-frame opacity).

**The property that matters: the cat's pixels are copied, never resampled.** Identity drift isn't
mitigated, it's structurally impossible. That is the whole argument for this route.

What it costs: a hand-measured rig per emoji. `meow_idea` was easy because the moving part is
physically separate from the character. `meow_facepalm` (paw must swing across the face, revealing
face that was never drawn) and `meow_melt` (topology changes) can't be rigged this way at all —
there's no occluded artwork to reveal. Realistically this route covers maybe 4 of the 10:
`meow_idea`, `meow_grumpy` (steam is a separate component), `meow_sleep_zzz` (Z's are separate), and
`meow_highfive_team` (the orange impact shards are separate).

## Route B — Replicate

### Model selection

Queried against the live Replicate model index rather than recalled:

| Model | Verdict |
| --- | --- |
| `atonamy/wan-alpha` | **Native alpha** (WebM/WebP with transparency), and it even offers a `512*512` resolution. But it is **text-to-video only** — no image input — so it cannot preserve an existing character. Tantalizing and unusable. |
| `bytedance/seedance-1-lite` | The initial pick on paper — `image` + `camera_fixed` + `seed`, square follows the input image. **Later disqualified by the bake-off**: it invents facial features. Its `last_frame_image` and `reference_images` inputs also proved unusable in this combination. |
| `wan-video/wan-2.2-i2v-fast` | Cheap, 14M runs, has `last_image`. But resolution is 480p/720p at 16:9 or 9:16 only — square requires letterbox-and-crop, which wastes pixels on a 512px subject. |
| `kwaivgi/kling-v2.5-turbo-pro` | **The pick, established by the bake-off** — the only entrant that kept the character's face (75%). `kling-v2.6` is the runner-up at 62%. |
| `kwaivgi/kling-v2.6-motion-control` | Takes a reference image **plus a reference video**. Rejects the blob-cat plate outright: it needs a detectable character body. Usable only for the person-shaped emoji. |
| `arielreplicate/robust_video_matting` | Rejected. RVM is trained on humans; on a flat yellow blob cat it has no prior. Chroma keying is deterministic and free. |

Two `seedance-1-lite` inputs looked like they would do real work (this was before the bake-off ruled
the family out entirely). Only one survived contact:

- **`camera_fixed: true`.** Removes the dominant source of subject drift — the model's instinct to
  add a slow push-in, which on a 64px emoji reads as the character inflating. Works; measured drift
  over the accepted loop was 4.1%.
- **`last_frame_image` = `image`.** ~~Asks the model for a closed cycle.~~ **Rejected by the API.**
  Setting `last_frame_image` equal to `image` fails with `E006 invalid input`, isolated by bisection:
  `image` alone succeeds, `image` + `camera_fixed` + `resolution` succeeds, `image` +
  `last_frame_image` fails. `reference_images` alongside `image` is rejected the same way. So the
  loop cannot be closed at generation time on this model, and seam closure falls entirely to
  `findLoop`.

### The alpha problem, and the key colour

Video models return opaque frames. The repo's existing answer — `bria/remove-background` per frame —
is what produced the regressions already logged in `finalize-still-fallbacks.mjs` (`meow_hammer` got
a solid block behind its impact marks; `meow_fistbumpright` lost its white droplets). Matting each
frame independently has no reason to be temporally consistent.

So: flatten the still onto a key colour *before* generation, and key it back out deterministically
after. Choosing that colour by measurement rather than habit — every opaque, saturated pixel across
all 351 emoji, binned by hue:

```text
  30°  32.9%  ██████████████████████████████████
  45°  39.3%  ████████████████████████████████████████
 144°   0.6%  ▏         <- emptiest 50° window in the corpus
```

The library is 72% orange-yellow. Hue **144°** (`#00C750`) is the emptiest window, holding 0.59% of
saturated pixels — and **exactly zero** pixels in nine of the ten batch-01 candidates
(`meow_highfive_team` has 196 px, 0.69%, from antialiasing, which the gate flags). Standard chroma
green `#00B140` sits at hue 141, inside the same trough, so the conventional choice happens to be
nearly right — but now it's justified rather than assumed.

Keying runs in the Cb/Cr plane with green-spill suppression, then a **per-pixel temporal median of
alpha across a 3-frame window**, which is what kills the single-frame matte flicker that independent
per-frame matting produces.

### Loop finding

With `last_frame_image` unavailable, this stage carries the whole seam problem. A 5s/24fps
generation gives 121 frames and the real cycle is some window inside it. `findLoop` is the
video-textures approach: search every (start, length) window for the endpoint pair with minimum RGBA
distance, then uniformly resample that window to the frame count the spec asked for.

Seam distance alone turned out not to be enough — the live run proved it. See the gate bugs below.

### The gate

The REJECT clauses of the one-shot prompt, made machine-checkable:

| Check | Budget |
| --- | --- |
| subject drift (alpha-weighted centroid vs source) | ≤ the spec's displacement budget (10% subtle / 25% full) |
| scale stability (opaque area swing) | ≤ 15% |
| loop seam (frame 0 vs frame N−1) | ≤ 12 mean channel delta |
| gross departure (worst frame vs source still) | ≤ 64 mean channel delta |
| inside frame (margin lost relative to the source's own margin) | none lost |

This gate certifies **geometry, not identity**. The live run below is what established that
distinction, and it is the single most important caveat in this document.

### Proven without spending

`--simulate` substitutes a synthetic clip for the paid call: it takes the tween's PNG frames,
composites them onto the key ground, and encodes an H.264 mp4 — i.e. it inflicts on the frames
exactly the damage a real generation would (4:2:0 chroma subsampling, lossy compression, the key
ground). Then the real stages 2–5 run on it:

```text
$ node scripts/emoji-enhancement/animate-replicate.mjs meow_idea --simulate
staging/replicate/meow_idea/meow_idea.webp — 24 frames, 234.6KB, seam 0.04
  PASS  subject drift: 1.9% of canvas (budget 10%)
  PASS  scale stability: 5.7% area swing (budget 15%)
  PASS  loop seam: 3.7 mean channel delta (budget 12)
  PASS  gross departure: worst frame 9.5 from source (budget 64)
  PASS  inside frame: 9px margin vs source's 8px
GATE PASS
```

Recovered alpha was checked against a magenta ground: no green fringe, no halo.

**Calibration result worth keeping:** the encode-and-key round trip *by itself* costs 1.9% drift and
5.7% area swing on frames that contain no real motion at all. That's the noise floor — a real
generation's budget is the gate threshold minus this, so the effective drift budget for subtle is
closer to 8% than 10%.

## The live run — `meow_facepalm`, full variant

One real generation, 480p / 5s / 24fps / `camera_fixed`, 121 frames at 640×640.

**Cost unit, measured:** `48,400` output tokens and **21.3 s** predict time for 480p/5s. A 720p run
of the same length bills `245,025` tokens — 5× — so 480p is the right rung for a 512px emoji. Seedance
bills per output token, so cost scales with resolution × duration, not with wall time.

**Style survived, and this is the good news.** The model held flat solid fills, uniform heavy black
outlines, the same yellow, and the same proportions. No shading, no fur, no 3D lighting, no drift
into photographic rendering. The specific failure I predicted — the model quietly making a flat
drawing dimensional — did not happen.

**Identity did not survive.** Across the clip the model invents features that are not in the source:
a frowning mouth appears where the source has a flat line, one eye becomes a large black oval where
the source has a thin stroke, whisker counts change, and a stray yellow blob artifact drifts through
the lower frames.

**And the gate passed it.** Every check green:

```text
PASS  subject drift: 4.1% of canvas (budget 25%)
PASS  scale stability: 5.3% area swing (budget 15%)
PASS  loop seam: 2.0 mean channel delta (budget 12)
PASS  gross departure: worst frame 46.1 from source (budget 64)
PASS  inside frame: 0px margin vs source's 0px
GATE PASS
```

That is the most useful thing the run produced. Three metrics were tried against the invented frown
and **all three failed to catch it**:

| Metric | Why it misses |
| --- | --- |
| mean channel delta over the frame | A changed mouth is a few hundred px against a huge flat yellow body; it averages to nothing. |
| max over 32×32 tiles | Dominated by *legitimate* motion. The known-good `meow_idea` tween scores **114.9** — worse than the real run's **186.1** is bad, but the two aren't separable by threshold. |
| dark-ink pixel area | Roughly conserved: the invented frown replaces ink elsewhere. Real run swings 3.0%, known-good tween swings 8.7% — the wrong way round. |

Feature invention is a small, structural, *semantic* change, and pixel statistics are the wrong
instrument for it. The repo already runs Gemini for labeling (`scripts/emoji-labeler.ts`), so a VLM
frame-check ("does this frame show the same character with the same facial features as the
reference?") is the natural fit and costs far less than the generation. Until that exists, **every
generated animation needs a human look** — the gate certifies geometry, not identity.

### Two gate bugs the run exposed, both fixed

- **`inside frame` was wrong.** It required a 2px absolute margin, but `meow_facepalm`'s source
  bounding box already spans x=0..511. Now compared against the source's own margin.
- **`findLoop` degenerated.** Minimising seam alone reliably selects the passage where the model did
  *nothing* — the stillest window always has the best-matching endpoints. The first run picked a
  16-frame window with motion 3.55 and reported a beautiful 0.83 seam. Adding a motion floor fixed
  it: at floor ≥5 it finds a 58-frame window with motion **36.96** and a *better* seam (1.79). Floor
  defaults to 8; the choice is stable anywhere in 5–20.

## Model bake-off — 12 models, one still, one judge

Every entrant got the same `meow_facepalm` key plate and the same prompt, the same deterministic
matte/loop/gate chain, and the same VLM identity score. Sorted by identity:

| Identity | Model | Style | Gate | Predict | Failure |
| --- | --- | --- | --- | --- | --- |
| **75%** | `kwaivgi/kling-v2.5-turbo-pro` | held | pass | 129 s | Paw distorts into a fist at the extreme of the swing. |
| **62%** | `kwaivgi/kling-v2.6` | held | pass | 125 s | Inconsistent palm detail; a nose line appears mid-swing. |
| 37% | `kling-v2.5-turbo-pro` + `end_image` | held | pass | 198 s | Loop closure *hurts* — stray vertical line under the paw. |
| 12% | `xai/grok-imagine-video` | held | FAIL | 31 s | Invents cartoon eyes, eyebrows, a nose. |
| 0% | `bytedance/dreamactor-m2.0` | **BROKEN** | pass | 537 s | Replaces the emoji with an entirely different cartoon cat. The only style break, and the slowest run. |
| 0% | `minimax/video-01-live` | held | FAIL | 84 s | Draws a whole second animal face *inside* the head; deletes the whiskers. |
| 0% | `pixverse/pixverse-v5` | held | pass | 55 s | Redesigns the face, removes the facepalming hand. |
| 0% | `bytedance/seedance-1-lite` | held | pass | 20 s | Invents eyes, eyebrows, nose, mouth. |
| 0% | `bytedance/seedance-1.5-pro` | held | pass | 47 s | Same failure, more confidently — a visibly different cat. |
| 0% | `bytedance/seedance-2.0` | held | FAIL | 159 s | Invents a white eye with a pupil under the hand. |
| 0% | `wan-video/wan-2.2-animate-animation` | held | pass | 207 s | Textured patch artifact on the forehead every frame. |
| 0% | `wan-video/wan-2.2-i2v-fast` | held | pass | 22 s | Replaces the dash eye with two oval eyes plus a nose. |
| err | `kwaivgi/kling-v2.6-motion-control` | — | — | — | Rejects the input entirely — see below. |
| err | `seedance-2.0` + `reference_images` | — | — | — | API forbids reference images together with first/last frame images. |

### The one finding that matters

**Every model except the Kling i2v pair invents a conventional cartoon cat face** — eyes with
pupils, eyebrows, a nose, a smiling mouth — over a character that has none of those. This is not a
prompt-tuning problem. Twelve models across six vendors, given an explicit instruction not to add
facial features, all reached for the same generic cat. The prior is overwhelming and text does not
override it.

Note that **every model but one passed `styleHeld`**. They reproduce flat fills and heavy outlines
faithfully while replacing the character underneath. Style fidelity and identity fidelity are
independent properties, and only the second one is hard.

The animation-specialist models were the biggest disappointment: `minimax/video-01-live` is trained
for Live2D and general animation, and `dreamactor-m2.0` advertises cartoons and non-humans
explicitly. Both scored 0%. Being trained on animation does not mean being faithful to a *given*
character — `dreamactor` was also the only style break and the slowest run in the field at 537 s.

### Motion transfer is structurally unavailable for the cats

The most promising idea — drive a still with an existing animated emoji as the motion reference — is
**blocked by an input requirement, not by quality**. `kling-v2.6-motion-control` rejects the blob cat
plate with `E006 invalid input`. Bisected against the API:

- 720p video + 720p image → rejected
- 512p video + 720p image → rejected
- 720p video + 512p image → rejected
- **same call with `old-man-yells-at-cloud` (a human figure) → accepted**

So it is the *subject*, not the resolution, duration or encoding. Motion-control needs a detectable
character body to rig; a floating cat head has no skeleton to find. That rules the whole
motion-control family out for roughly 80% of this library, and `kling-v3-motion-control` was skipped
on that basis rather than paid for.

It remains viable for the person-shaped emoji — `old-man-yells-at-cloud`, `come-at-me-bro`,
`severance-working`, `fry` — where the reference-clip builder (`motionReference()`, verified
converting `meow_nod` to 111 frames of mp4) already works.

The other motion-transfer route, `wan-2.2-animate-animation`, accepts the cat and scores 0%.

### The VLM identity judge

`scripts/emoji-enhancement/identity-check.mjs`. Samples 8 frames into one numbered contact sheet,
sends it with the reference still to `gemini-3.8-flash` (same model the repo already uses in
`emoji-labeler.ts`), and asks per panel whether it is the same character — separating *motion*
(expected) from *invented features* (a fault).

Validated both directions before being trusted:

- known-good tween (`meow_idea`, cat pixels copied not resampled) → **100% clean**, and it correctly
  attributed the variation to the animated bulb rays rather than to drift
- known-bad generation (`seedance-1-lite meow_facepalm`) → **0% clean**, independently naming the
  defects I had found by eye: "rounded right eye" replacing "horizontal line eye", stray artifacts

This is the check the pixel metrics could not do. One judge call costs a small fraction of one
generation, so it belongs in the loop before any human look.

## Recommendation

**Tween where the artwork allows it.** The 4 emoji whose moving parts are separable components
(`meow_idea` done, `meow_grumpy`, `meow_sleep_zzz`, `meow_highfive_team`) — free, exact, zero
identity risk.

**For the other 6, use Kling v2.5 turbo pro and nothing from the Seedance family.** The bake-off
settles that. Budget one run plus one judge call per attempt, and expect roughly 3 frames in 4 to be
clean — which means the loop window still needs choosing around the bad frames, not just around the
seam.

**Motion-control is off the table for the cats.** It needs a character body to rig and rejects a
floating cat head. Keep it in reserve for the person-shaped emoji only.

**Do not spend on more i2v models.** Twelve have now been tested across six vendors; eleven invent a
generic cat face and the twelfth (`kling-v2.6`) is a slightly worse `kling-v2.5-turbo-pro`. The
remaining levers are not model choice: pick the loop window to *exclude* the frames the judge flags,
soften the motion spec so the paw never reaches the distorting extreme, and consider ping-pong
looping (play forward then reverse) which guarantees a seamless cycle locally, for free, and halves
how much generated motion has to be trustworthy.
