# Source image restoration playbook

This records the Emoji Brain restoration work through September 11, 2026, and the workflow to reuse for future batches. The aim is a clearer version of the same emoji: recognizable identity, expression, lettering, color, motion and intentional effects at actual emoji size.

## What we accomplished

We staged **271 stills and 82 animations** (a 12-animation pilot followed by 70 remaining animations), reviewed and repaired their transparency, and promoted approved candidates with archived originals and recorded hashes. The [promotion receipt](../staging/emoji-enhancements/promotion.json) contains 353 entries. That is the historical promotion batch, not a promise about today's catalog count: later edits include the removal of `keanu-thanks` and another cleanup of `extreme-teamwork`.

The work covered several different operations:

- **Restoration and redraw:** Nano Banana Pro generated larger still artwork with prompts tailored to photographs, flat drawings and illustrations. Local Real-ESRGAN provided conservative restoration, including animation frames. Individual manifests record exceptions and reused outputs.
- **Transparency repair:** Bria and local BiRefNet removed intermediate backgrounds; narrower border-connected matting and source-supported interior repairs recovered details that semantic removal damaged.
- **Animation preservation:** frame decoding, caching, reconstruction and WebP muxing retained timing and looping while supporting separate treatment of pixel art, photography and intentional blur.
- **Source recovery:** the final Severance-running revision recovered the actual larger footage, then applied Topaz. This replaced earlier reconstruction attempts.
- **Review and delivery:** comparison galleries, alpha audits, hash-bound approvals, original archives and optimized WebP sizes made the results reviewable, reversible and practical to display/export.

The older [animation proposal](animated-emoji-enhancement.md) and staging READMEs describe earlier phases. Their “no production replacements” language is historical; consult promotion receipts and later correction manifests for subsequent decisions.

## Lessons from the actual images

| Case | What happened | Reusable lesson |
| --- | --- | --- |
| Fonzie and `10-10` | Generative attempts changed a person's likeness and turned a cat into a panda. Fonzie used a source-photo cutout after rejected likeness attempts. | Sharpness cannot compensate for changed identity. Verify the subject from the image; a filename or celebrity name is insufficient. |
| Roo and other white details | Background removal erased clothing, accessories and body details. Interior repair could also leave opaque canvas strips. | Inspect both the silhouette and subject interiors on dark and light backgrounds. Reuse generated RGB to repair a mask before regenerating the artwork. |
| Bizcat | Cleanup removed an intentional multicolor background; it was restored. | Transparent output is appropriate only when the background is disposable. |
| `99` and `100000` | A later correction retained numeral/underline fills and removed unwanted rings, canvas and marks. | Small disconnected components can be meaningful or unwanted; reviewed geometry is safer than a universal size threshold. |
| Motion-heavy cats | Blur, jitter, ghosting and trails contributed to the expression. | A first-frame blur score cannot decide whether an animation needs deblurring. Review the whole loop. |
| Nyan Cat, Unikitty and large bongo footage | Pixel art needed preservation; an already-large bongo source needed a smaller export. | Choose restoration per asset. Some images need resampling or detail preservation rather than a redraw. |
| Boxcat | A selected Nano exception recovered colors local restoration did not. | Keep per-image exceptions with source hashes, prompts and actual selected output provenance. |
| Severance-running | Nano wide shots changed figure scale, poses and layout; a hybrid retained original wide-shot motion. Later recovery of the exact larger clip supplied the successful source. | Search for better originals early. A cleaner approximation cannot establish missing identity or motion. |
| Extreme teamwork | A later imagegen cleanup edited a five-frame atlas; the recorded output retained five 60ms holds and infinite looping. | A targeted background edit can be a separate revision. Retain its input/output hashes and timeline. |

Evidence: [prompt routing](emoji-enhancement.md), [alpha audit](../staging/emoji-enhancements/stills/alpha-audit.json), [restoration tools and exceptions](../scripts/emoji-enhancement/README.md), [number repair](../scripts/emoji-enhancement/repair-red-numbers.mjs), [Severance final review](../staging/emoji-enhancements/severance-running-revisit/README.md), and [teamwork correction](../staging/emoji-enhancements/extreme-teamwork-background-cleanup/manifest.json).

## Repeatable workflow

### 1. Inspect and preserve the source

Record the source path and SHA-256, dimensions, alpha behavior and, for animation, the composited frames, individual delays and loop setting. Preserve the original bytes and metadata before promotion.

Look at the image at native size, enlarged, and around 32px. For animation, watch the complete loop and inspect representative frames. Write down what must survive: species/person, expression, pose, exact text, colors, accessories, pixel structure and motion effects. Unknown lettering or uncertain identity is a review question, not a prompt to invent details.

Search for a larger original when the input has lost defining information. Record the reference URL and dimensions, matching/differing features, and whether it is the verified source or only an approximation. Preserve deliberately exaggerated features such as sadcat's watery enlarged eyes.

### 2. Choose the smallest sufficient intervention

| Input | Route used or supported by this work |
| --- | --- |
| Clean drawing or pixel art | Conservative resize/restoration; preserve authored linework and pixels. |
| Degraded flat still or illustration | Reviewed generative cleanup with explicit subject, style and text constraints, followed by appropriate matting. |
| Photograph or recognizable person | Prefer source recovery and conservative restoration; verify usable identity references before a fresh generative attempt. |
| Continuous animated motion | Local restoration of original frames; use photo/general or anime weights according to the content. |
| Few distinct animated poses | A shared sprite sheet can supply consistent context, but every pose still needs review. |
| Intentional blur, shake or trails | Preserve source effects and alpha; compare a restrained restoration blend. The pilot's 20% restored / 80% source blend was provisional, not a universal setting. |
| Existing good artwork with bad matte/background | Repair the matte or make a targeted background edit. |

For still prompts, specify rendering style, visible subject, exact verified text/layout, preservation requirements and the intended intermediate background. The [prompt builder](../scripts/emoji-enhancement-prompts.mjs) separates these concerns and blocks unresolved text/identity routes. Changing a prompt does not refresh an existing cached prediction: retain the old attempt and start an explicit new one.

### 3. Treat alpha as part of the artwork

Keep source alpha when restoration stays geometrically aligned. Redrawn shapes require a new matching matte. An alpha channel's presence does not prove useful transparency or a correct cutout.

Semantic matting can erase white eyes, shirts, equipment and lettering. Border-connected removal is useful for reviewed outlined artwork on a uniform canvas; it is unsuitable as a blanket photo/white-subject rule. Restore enclosed holes only where supported by the source. Inspect for halos, remaining canvas strips, erased interiors and accidental removal of intentional backgrounds.

The animation pipeline also tested restoration of black and white composites, deriving alpha from their difference. Effect-preserving variants retained the original alpha. Neither route removes the need for visual review.

### 4. Preserve the animation contract

Decode fully composited RGBA frames with source blending/disposal respected. Cache identical frames to save processing, but retain their positions and durations in the timeline. Carry masks consistently with color processing to avoid fringes.

The [lossless muxer](../scripts/emoji-enhancement/mux-animation.mjs) writes full-canvas, no-blend frames to retain repeated frames, blank holds and finite loops. Review the loop seam, scene cuts, pose/face/text stability, flicker and speed. MP4 is only an intermediate when transparent output is required.

Distinguish restoration from deliberate source reconstruction. The recovered Severance source was 889×500 with 112 frames at 25fps; crop and monotonic sampling reconstructed the original 90 holds at 20fps and its cut at frame 27. Optimized WebP may merge identical consecutive frames: verify the displayed timeline and alpha at source timestamps, not just the stored frame count.

### 5. Stage, compare and record a decision

Keep candidate images, compact manifests, hashes, selected prompts, model/weight provenance, reference links and review notes in `staging/emoji-enhancements/`. Keep large provider responses and intermediate files in the ignored experiment workspace. Successful receipts and generated RGB are recovery inputs; do not discard them just to retry a failed matte.

Compare original and candidate on white, dark and checkerboard backgrounds, at full resolution and actual emoji size. For animations, use synchronized playback, scrubbing and slow playback. Review identity, expression, text, alpha, colors, effects and composition separately from technical validity.

Record acceptance or rejection against exact candidate bytes. Approval of an earlier hash does not transfer to a revision. A committed candidate, successful provider response or passing validator is not visual approval. Report provider failures and fallback routes accurately; billing counters are not evidence of dollar charges.

### 6. Promote and generate usable exports

Archive pre-enhancement images and metadata, verify the selected source and approved hashes, then promote the approved bytes. Refresh dimensions, hashes, byte sizes and animation stills. Carry semantic labels forward with explicit provenance when identity is unchanged; do not claim a new labeling run.

Keep restoration masters separate from delivery encodings. This project generates 64/128/256px WebPs and still previews, preserving aspect ratio and using alpha quality 100. Delivery quality and smaller animation encodings balance size against visible quality; inspect the actual encoded files. See [delivery behavior](../README.md#optimized-webp-delivery).

## Existing tools and checks

Run from the repository root. These checks inspect existing artifacts; they do not generate new paid candidates:

```sh
node scripts/emoji-enhancement/validate-staging.mjs
node scripts/emoji-enhancement/validate-animations.mjs
node scripts/emoji-enhancement/validate-remaining-animations.mjs
node scripts/emoji-enhancement/validate-severance-revisit.mjs
pnpm check:emoji-delivery
```

Use the checks relevant to the changed batch. Historical receipts and later catalog corrections can disagree; investigate that difference rather than rewriting provenance to make a check pass. Technical checks do not establish perceptual quality.

Generation, recovery and staging entry points are documented in the [tools README](../scripts/emoji-enhancement/README.md). Those are specialized batch scripts, often dependent on cached experiment state, external Python environments and local model weights. Some make paid provider calls. Inspect their scope and prerequisites before reuse. In particular, `promote-approved.mjs` embeds the historical batch approval; it is not a generic approval mechanism for new candidates.

Do not remove archives, manifests or experiment caches without checking downstream references and recovery needs. An ignored file can still be an essential input.

## Git milestones

| Commit | Durable result |
| --- | --- |
| `8a57cc3` | Prompt routing by rendering, subject, text and identity. |
| `9f256e9` | Interior alpha repair and tests. |
| `ca3a9a5` | 271 still candidates staged for review. |
| `33ffda5`, `2097b3a` | 12-animation pilot and 70 remaining candidates. |
| `9c8be43`, `20f6c41` | Alpha audit repairs, Bizcat colors and number corrections. |
| `830542e` | Approved promotion, archived originals and label provenance. |
| `2d9ffc9`, `7510844` | Recovered Severance footage, Topaz comparison and approved promotion. |
| `c327832` | Later teamwork background cleanup and catalog correction. |

These are records of this library's experiments and decisions, not a general benchmark of the models. The final Severance comparison is especially instructive: most of the improvement came from recovering the better source.
