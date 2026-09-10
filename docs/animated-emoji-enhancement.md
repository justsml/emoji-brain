# Animated emoji enhancement proposal

Inventory on 2026-09-10: 82 animated WebPs, 2,738 stored frames; all declare alpha channels (this does not mean every frame contains transparent pixels). Exact frame delays and loop flags are in `experiments/image-enhancement/animation-inventory.json`. No animated assets have been modified.

## Route by motion, as well as rendering style

| Motion type | Preferred experiment | Why |
| --- | --- | --- |
| Translation, rotation, zoom or shake of one drawing | Enhance one reviewed reference, recover original transforms and replay them on its RGBA artwork | Crisp art stays identical throughout the loop; reuse original motion instead of generating it |
| A few distinct poses, such as a two-frame bongo tap | Enhance a contact sheet or a few key poses together with a shared reference; segment each pose and reassemble | Cross-pose consistency is easier to review; preserves authored pose changes |
| Continuous deformation or photographic motion | Test conservative Real-ESRGAN / animevideov3 against a temporally aware video restorer such as SeedVR2; Topaz Video is another comparison candidate | Retain actual motion and facial identity; avoid independent generative redraws |

These are recommended experiments, not a tested winner for this library. A static crisp reference can guide pose reconstruction but cannot supply missing motions/occluded details by itself. Optical flow or tracked deformation may help propagate a keyframe; it requires explicit loop-seam and occlusion review. Do not assume linear frame interpolation is adequate for cartoons.

## Alpha and timing contract

1. Decode fully composited RGBA frames, respecting WebP frame offsets, blending and disposal. Retain original canvas dimensions, per-frame durations and loop count.
2. Hash identical full frames to avoid repeat work. Preserve their positions and durations in the output timeline; do not simply deduplicate the animation sequence.
3. For conservative upscaling, carry the existing alpha separately and resample it consistently with the color image. Prevent white/black fringes using proper premultiplied-alpha handling. A preserved mask is appropriate only while output geometry remains aligned with the source.
4. If a keyframe is actually redrawn, make a new matte for that geometry and propagate it with the same transforms/deformations. Independently removing the background on every generated frame can cause edge flicker and erased interior whites; do not make it the default.
5. Export lossless animated WebP initially, with original frame count, frame delays and loop behavior. Then tune compression and 256–512px output targets against actual display/export requirements. MP4 can be an intermediate RGB carrier, not the transparent final artifact. Preserve alpha out of band when a model only accepts opaque video.
6. Check the first-to-last transition, flicker, text/face/gesture stability, dark/light alpha edges, playback speed and file size. A still-image quality score cannot establish temporal quality.

## Suggested first three pilots

- `meow_bongotap.webp`: 64×64, 2 frames, 200ms total — shared-reference pose editing.
- `roo-aww-intensifies.webp`: 48×48, 9 frames, 270ms — inspect whether its motion can be replayed as transforms; do not assume.
- `meow_coffeespitting.webp`: 36×36, 145 frames, 2,900ms — continuous deformation; compare non-generative upscale and temporal restoration.

Source/reference search remains the best first step when the tiny original has irrecoverable character detail. Nano Banana Pro per stored frame would cost ~$410.70 at the observed $0.15 tier across the whole library, before retries or matting, and would not guarantee temporal consistency. Motion routing and duplicate-frame caching should precede paid batch runs.

## Sources

- Real-ESRGAN upstream: https://github.com/xinntao/Real-ESRGAN — image/video restoration and alpha-capable image inference.
- Anime video model: https://github.com/xinntao/Real-ESRGAN/blob/master/docs/anime_video_model.md — animevideov3 and extract/process/reassemble workflow. It is framewise processing, not a guarantee of temporal consistency. Its JPEG/MP4 example is unsuitable as the final alpha-preserving pipeline.
- SeedVR2 hosted model: https://replicate.com/zsxkib/seedvr2 — video/still restoration, 3B/7B; pilot needed because it did little on our tiny stills.
- Topaz video upscale: https://replicate.com/topazlabs/video-upscale — alternative video restoration candidate.
- WebP format specification: https://developers.google.com/speed/webp/docs/riff_container — frame durations, loop count, alpha, blending and disposal.

## Reviewed quality distinctions

The first-frame reblur score is an edge-softness diagnostic, not enhancement priority or permission to deblur. User annotations live in `scripts/emoji-quality-reviews.json` and appear alongside raw scores in the generated table. These annotations are a small reviewed set, not evidence that the metric generalizes across the catalog.

- `roo-cult` and `thinkies`: relatively clean lines at small size; preserve linework with conservative upscaling.
- `milchick_roll`, `meow_coffeespitting`, `meow_dj`, and `side-eye`: user-identified pixelation/blur; prioritize detail restoration, retaining motion and expression.
- `meow_angry_intensifies` and `meow_hyper_think`: preserve intentional softness, shake, motion trails, ghosting and their frame-to-frame variation. A sharper but less expressive animation fails review. Review other effect-heavy animations individually rather than inferring intent from filename alone.

Before processing animations, inspect playback and representative frames across the complete loop. Separate unwanted degradation from authored effects; never use first-frame score alone to choose a deblur route. If an effect cannot be separated reliably, use conservative upscaling and compare the looping result at emoji display size.

When reconstruction fails, search for the closest larger source or approximation by visible features, rather than merely the same name or species. Save the reference URL and dimensions, identify matching and differing features, and distinguish verified source identity from approximation. References should preserve distinctive artificial features too: sadcat's digitally watery enlarged eyes are required, not an anatomical error to normalize. Compare candidates with the original before using them. New references cannot establish missing motion; retain original timing and effect behavior.
