# Animation quality audit

**Historical baseline:** The twelve review targets below were subsequently repaired. See [the matte repair record](animation-matte-repair.md) for the applied changes and validation.

Observed 2026-10-14T03:35:47.309Z. Read-only inspection of the current production assets; no restoration, promotion, delivery regeneration, or paid inference.

All **83 animations** in the physical catalog have delivery entries. Their production masters contain **2,763 stored frames**. Archived pre-restoration sources were found for 82; `roo-zomg` has no linked archive and its source-mask inheritance is unknown.

**18 low-resolution cutouts retain the enlarged source alpha exactly across every frame.** Six are documented pixel-art/effect cases. The other **12 are review targets**, with coffee-spitting, Red Bull, Clorox and stretching among the clearest coarse contours in the samples. Exact mask inheritance establishes how an edge was made; severity is a visual judgment.

**Nine 64px deliveries deliberately drop frames to fit Slack's cap.** The grid also uses these deliveries. No delivery source hashes, total durations, or loop counts disagree with the recorded masters. The 128/256px variants have no configured frame dropping; the encoder does coalesce some holds (e.g. bongo-cat-jumbo and South Park), so stored frame counts need not match.

## Inherited cutouts to review

| Animation | Archived source | Current master | Sample finding |
|---|---:|---:|---|
| alert | 128×128 | 512×512 | Stepped cutout boundary; source RGB degradation also remains. |
| magic | 128×128 | 512×512 | Stepped cutout plus substantial source color/noise degradation. |
| meow-hearts | 115×128 | 460×512 | Stepped heart/cat contour; photographic detail remains soft. |
| meow-stretch | 64×64 | 512×512 | Coarse silhouette remains; preserve distortion and lettering. |
| meow_clorox | 60×60 | 512×512 | Priority: coarse silhouette remains; retain shake and label. |
| meow_cloroxsip | 64×64 | 512×512 | Inherited contour; highly cropped sample. Check exposed contour throughout loop. |
| meow_coffeespitting | 36×36 | 512×512 | Priority: coarse silhouette and spray; 36px source mask unchanged. |
| meow_enjoy-rain | 80×80 | 512×512 | Coarse silhouette and rain shapes remain; preserve authored softness. |
| meow_enjoy-snow | 80×80 | 512×512 | Coarse silhouette and snow shapes remain; preserve particles. |
| meow_red-bull | 40×40 | 512×512 | Priority: coarse silhouette remains; retain jitter and label. |
| meow_sad-rain | 80×80 | 512×512 | Coarse silhouette and rain shapes remain; preserve particles. |
| smart | 80×80 | 512×512 | Stepped head contour; photographic detail remains soft. |

## Documented preservation cases

| Animation | Reason to preserve the authored appearance |
|---|---|
| nyancat, unikittyangry | Intentional pixel art; nearest-neighbor enlargement. |
| meow-devil-intensifies, meow_angry_intensifies, meow_hyper_think | Intentional shake, directional blur, trails or ghosting. Review contour cleanup separately from these effects. |
| roo-redbutton | Flash, glow, exposure changes and explosion. Preserve frame-specific effects. |

These six also inherit low-resolution alpha; their inclusion in the measurement is not approval to deblur or redraw them.

## Delivery motion reductions

| Animation | Master frames | 64px frames | Retained | Loop duration |
|---|---:|---:|---:|---:|
| meow-stretch | 239 | 79 | 33% | 6200 ms |
| meow_angry_intensifies | 180 | 59 | 33% | 3600 ms |
| meow_clorox | 70 | 53 | 76% | 1400 ms |
| meow_coffeespitting | 145 | 48 | 33% | 2900 ms |
| meow_enjoy-rain | 150 | 60 | 40% | 3000 ms |
| meow_enjoy-snow | 150 | 60 | 40% | 3000 ms |
| meow_nod | 111 | 83 | 75% | 2600 ms |
| meow_red-bull | 147 | 59 | 40% | 2940 ms |
| meow_sad-rain | 100 | 60 | 60% | 2000 ms |

## All animations

“Different alpha” means the master does not match a simple enlarged source mask; it is not a blanket quality pass. “Opaque” identifies inherited all-255 alpha, which cannot cause a cutout-edge defect. All rows received representative source/master visual inspection at one-third of the loop on light/dark backgrounds, with a separate alpha view. Temporal measurements cover all frames; visual inspection does not claim every pose was reviewed.

| Animation | Source | Alpha result | 64px frames / master | Sample note |
|---|---:|---|---:|---|
| ablobcatknitsweats | 128×110 | Different alpha | 16 / 16 | — |
| alert | 128×128 | Inherited; review | 17 / 17 | Stepped cutout boundary; source RGB degradation also remains. |
| awkward | 128×128 | Different alpha | 2 / 2 | — |
| awkward_side_eye | 70×70 | Opaque | 20 / 20 | — |
| bongo-cat-drumming | 128×128 | Different alpha | 2 / 2 | Separate matte issue: pale fringe visible on dark background. |
| bongo-cat-jumbo | 1920×1080 | Different alpha | 13 / 21 | — |
| bongo-cat | 128×128 | Different alpha | 2 / 2 | — |
| boxcat | 128×128 | Opaque | 10 / 10 | — |
| cat_money | 64×54 | Different alpha | 12 / 12 | — |
| catdance | 128×128 | Different alpha | 10 / 10 | — |
| cheers | 68×68 | Opaque | 58 / 58 | — |
| clapclap-e | 96×96 | Different alpha | 3 / 3 | — |
| crying_bear | 64×64 | Different alpha | 48 / 48 | Separate matte issue: pale fringe visible on dark background. |
| dumpster-fire | 128×128 | Different alpha | 12 / 12 | — |
| elmo-fire | 128×128 | Opaque | 17 / 17 | — |
| extreme-teamwork | 128×128 | Opaque | 5 / 5 | — |
| eyetwitch | 128×128 | Different alpha | 7 / 7 | — |
| happykitty | 64×51 | Different alpha | 25 / 25 | — |
| hypecat | 128×128 | Opaque | 9 / 9 | — |
| keanu_thanks | 64×64 | Opaque | 36 / 36 | — |
| let-me-think | 128×128 | Different alpha | 30 / 30 | — |
| loading | 128×128 | Different alpha | 12 / 12 | — |
| magic | 128×128 | Inherited; review | 20 / 20 | Stepped cutout plus substantial source color/noise degradation. |
| meow-bongo-cat | 128×128 | Different alpha | 2 / 2 | — |
| meow-devil-intensifies | 100×100 | Inherited; preservation case | 10 / 10 | — |
| meow-hearts | 115×128 | Inherited; review | 42 / 42 | Stepped heart/cat contour; photographic detail remains soft. |
| meow-mic-drop | 128×128 | Different alpha | 8 / 8 | — |
| meow-stretch | 64×64 | Inherited; review | 79 / 239 | Coarse silhouette remains; preserve distortion and lettering. |
| meow-wave-comfy | 128×128 | Different alpha | 2 / 2 | — |
| meow_angry_intensifies | 51×51 | Inherited; preservation case | 59 / 180 | — |
| meow_attention | 122×128 | Different alpha | 22 / 22 | — |
| meow_bongo_rage | 128×128 | Different alpha | 2 / 2 | — |
| meow_bongotap | 64×64 | Different alpha | 2 / 2 | — |
| meow_bread_disappear | 120×120 | Different alpha | 6 / 6 | — |
| meow_chips | 64×64 | Different alpha | 8 / 8 | — |
| meow_clorox | 60×60 | Inherited; review | 53 / 70 | Priority: coarse silhouette remains; retain shake and label. |
| meow_cloroxsip | 64×64 | Inherited; review | 37 / 37 | Inherited contour; highly cropped sample. Check exposed contour throughout loop. |
| meow_code | 128×128 | Different alpha | 16 / 16 | — |
| meow_coffeespitting | 36×36 | Inherited; review | 48 / 145 | Priority: coarse silhouette and spray; 36px source mask unchanged. |
| meow_cookie | 128×128 | Different alpha | 29 / 29 | — |
| meow_crying | 112×112 | Different alpha | 23 / 23 | — |
| meow_derpy | 128×128 | Different alpha | 53 / 53 | — |
| meow_drool | 128×128 | Different alpha | 43 / 43 | — |
| meow_enjoy-rain | 80×80 | Inherited; review | 60 / 150 | Coarse silhouette and rain shapes remain; preserve authored softness. |
| meow_enjoy-snow | 80×80 | Inherited; review | 60 / 150 | Coarse silhouette and snow shapes remain; preserve particles. |
| meow_fart | 100×100 | Different alpha | 10 / 10 | — |
| meow_glare-zoom | 112×105 | Different alpha | 30 / 30 | — |
| meow_heart_bongo | 128×128 | Different alpha | 2 / 2 | — |
| meow_hyper_think | 128×128 | Inherited; preservation case | 6 / 6 | — |
| meow_lurk | 128×128 | Different alpha | 27 / 27 | — |
| meow_nod | 105×105 | Different alpha | 83 / 111 | — |
| meow_noddies | 112×112 | Different alpha | 47 / 47 | — |
| meow_popcorn | 128×128 | Different alpha | 8 / 8 | — |
| meow_red-bull | 40×40 | Inherited; review | 59 / 147 | Priority: coarse silhouette remains; retain jitter and label. |
| meow_sad-rain | 80×80 | Inherited; review | 60 / 100 | Coarse silhouette and rain shapes remain; preserve particles. |
| meow_thinkingsmirk | 128×128 | Different alpha | 10 / 10 | — |
| michael-scott-laughing | 60×60 | Opaque | 33 / 33 | — |
| michael-scott-shaking-head-no | 60×60 | Opaque | 28 / 28 | — |
| milchick_roll | 102×84 | Opaque | 19 / 19 | Opaque clip; source facial detail remains weak. |
| nyancat | 128×128 | Inherited; preservation case | 12 / 12 | — |
| roo-aww-intensifies | 48×48 | Different alpha | 9 / 9 | — |
| roo-e | 112×112 | Different alpha | 2 / 2 | — |
| roo-redbutton | 112×112 | Inherited; preservation case | 23 / 23 | — |
| roo-zomg | Unknown | Unknown source | 2 / 2 | No linked historical source. |
| roorooq | 112×112 | Different alpha | 6 / 6 | — |
| severance-dancing-helly | 64×64 | Opaque | 36 / 36 | — |
| severance-dancing-mark | 64×64 | Opaque | 34 / 34 | — |
| severance-dancing | 64×64 | Opaque | 73 / 73 | Opaque clip; substantial grain/color degradation remains. |
| severance-running | 64×64 | Opaque | 90 / 90 | — |
| severance | 80×80 | Opaque | 42 / 42 | — |
| side-eye | 120×120 | Opaque | 11 / 11 | — |
| smart | 80×80 | Inherited; review | 23 / 23 | Stepped head contour; photographic detail remains soft. |
| southpark_nice | 128×128 | Opaque | 13 / 15 | — |
| thankyou | 128×128 | Different alpha | 2 / 2 | — |
| the_more_you_know | 50×50 | Opaque | 41 / 41 | — |
| thinking-face-rotating | 128×128 | Different alpha | 30 / 30 | — |
| this-is-fine-fire | 101×97 | Different alpha | 8 / 8 | — |
| this_is_fine | 112×112 | Different alpha | 4 / 4 | — |
| try-not-to-cry | 128×128 | Different alpha | 16 / 16 | — |
| typing_cat_kitten | 68×68 | Different alpha | 20 / 20 | — |
| typingcat | 64×64 | Opaque | 28 / 28 | — |
| unikittyangry | 128×128 | Inherited; preservation case | 11 / 11 | — |
| watcat | 128×128 | Opaque | 14 / 14 | — |

## Evidence and reproduction

Run `node scripts/audit-animation-quality.mjs` from the repository root. Optional first argument changes the output directory; default is `/tmp/emoji-animation-audit`. It creates full measurements in `audit.json`, eleven contact sheets, and a standalone `gallery.html` with embedded animated source/64/256px images. The gallery supports name filtering and light/dark backgrounds. The script does not modify catalog assets.

The audit decodes each source once, resizes each composited frame independently with the recorded pixel-art or Lanczos3 kernel, then compares alpha at the master resolution. A worst-frame mean absolute error ≤0.05 in 0–255 alpha units flags inheritance; all 18 cutout matches in this run have **zero** error. Cutout review flags additionally require a source no larger than 128px, enlargement of at least 2×, and more than 0.5% fully transparent pixels. It verifies actual delivery metadata and current source hashes. Frames are resized individually because strip resizing produced different edge samples and would misclassify preserved masks.

The script increases libvips' in-memory spill threshold to avoid temporary-file quota failures and processes animations sequentially. It generates comparisons, not a perceptual-quality score.

`extreme-teamwork` differs from its historical promotion hash because of its documented later background correction; current delivery matches the corrected production source. The `meow-hearts` archive is resolved through its previous `cat-meow-hearts` candidate path.

Recommended repair order: separate browser animation delivery from Slack's reduced exports; stage contour/matte improvements for the twelve review targets, starting with coffee-spitting, while preserving timing, spray/particles, lettering, and authored effects. Review dark-background fringes on bongo-cat-drumming and crying_bear separately. Opaque photographic clips such as Milchick and Severance dancing need source/detail restoration rather than cutout work.
