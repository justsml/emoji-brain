# Provisional animation review

All 12 samples remain pending human approval. Suggested choices are visual judgments from this pilot, not calibrated model scores. Open [the synchronized comparison](index.html) to check motion and individual frames.

OpenRouter reported $1.90 for 14 generated sheets, including discarded attempts. Local restoration uses no per-image API charge. Replicate returned HTTP 402 during these runs, so matting fell back to local processing.

| Sample | Suggested for review | Findings |
| --- | --- | --- |
| awkward | esrgan | Both retain the monkey silhouette. Check the gaze change and the original unequal 2-second / 1-second holds; Nano adds slight gradients. |
| bongo-cat | esrgan | Local restoration smooths the original outline while retaining the paw pads and expression. Check that alternating paws remain distinct. |
| clapclap-e | esrgan | Local restoration retains the clap poses and white body. Nano added a panel grid and failed transparency; that unusable candidate is excluded. |
| eyetwitch | nano | The second Nano prompt produces crisp edges and retains the seven eyelid poses. It adds a gold outer rim; verify that stylistic change. Local restoration has edge artifacts and is shown as a rejected comparison. |
| meow-devil-intensifies | tuned | Preserve the jitter and slight edge softness. The blend retains original alpha and 80% original color. Nano needed per-frame white-background cleanup and offers little improvement over local restoration. |
| meow_bongotap | esrgan | Prefer the local restoration. Nano adds angry eyebrows and a heavy outline, changing the expression; retain it only as a rejected comparison. The first Nano attempt also recolored the face and was excluded. |
| meow_bread_disappear | esrgan | Local restoration keeps the disappearing-cat sequence and flat bread colors. Nano adds gradients and changes the bread contour slightly between frames; inspect the stationary bread for wobble. |
| meow_hyper_think | tuned | Intentional blur: the effect-preserving blend retains original alpha and 80% original color. Full restoration smooths the outer silhouette more strongly. Compare the hand trails and jitter at 0.25× speed. |
| panda-omg | esrgan | The original has an embedded opaque white background. It was removed before local restoration. Compare the eye highlights and tongue shape against Nano. |
| roo-aww-intensifies | esrgan | Prefer full local restoration here: the effect is mainly positional shaking, which remains frame-specific, while low-resolution contours are improved. The blend is gentler. Nano retains blockiness and introduces eye/alpha defects. |
| thankyou | esrgan | Check the exact THANK YOU lettering, small hearts and pulsing size. Nano required reconstruction of the white sticker border after matting; local restoration preserves it from the source. |
| this_is_fine | esrgan | Local restoration cleans compression while preserving the dog and changing flames. Nano retains much of the blocky texture; compare the fire rather than treating all motion as blur. |

