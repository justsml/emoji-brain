# Animating the stills: one-shot prompt + ranked candidates

270 of the 351 emoji in `src/data/emoji-metadata.json` are stills. This doc gives (1) a single
reusable prompt for turning one still into a looping animated version that matches the existing 81
animated emoji, and (2) a ranked shortlist of the stills that would pay off most, each with a
**subtle** and a **full** animation option.

## What the existing 81 animated emoji actually are

Measured from `public/emojis/*.webp` and the delivery pipeline:

| Property | Value |
| --- | --- |
| Master canvas | 512 × 512, square, animated WebP |
| Frame count | ~15–110 (`meow_lurk` 27, `meow_nod` 111) |
| Frame duration | 20–180 ms (≈6–50 fps; most sit near 60–100 ms) |
| Loop | infinite (`loop count 0`), seamless — first and last frame match |
| Alpha | real transparency, opaque subject interiors, no matte halo |
| Delivery | 256/128/64 ladder under Slack's 128 KB/emoji cap (`scripts/generate-emoji-delivery.mjs`) |

Motion style: the character is drawn once and *moved*, not redrawn. Squash/stretch, small
rotations, blinks, and looping props (steam, tears, sparkles, rain). The art never changes identity
between frames — that is the property the prompt below has to defend hardest.

## The one-shot prompt

Fill the four bracketed slots per emoji and send with the still as the reference image. Everything
else is fixed, and matches the constraint language already used in `scripts/emoji-enhancement-prompts.mjs`.

```text
Animate the attached emoji into a seamless looping animation. Treat the reference image as the
single source of truth for the character's design.

SUBJECT: [one sentence: species/character, markings, props, expression — e.g. "a round pastel-blue
blob cat holding a paper sign, eyes closed in a flat-vector kawaii style"]

MOTION: [the animation beat, in motion terms, 1–2 sentences — e.g. "the cat lifts the sign twice
with a small anticipation dip before each lift; ears flick on the down-beat"]

TIMING: [N] frames at [M] ms per frame, infinite loop, first and last frame continuous so the cycle
has no visible seam. Hold the extreme pose 2–3 frames so the beat reads at 64px.

PRESERVE: the exact character design, palette, line weights, proportions, expression and props of
the reference. Same square composition, same crop, same scale — the subject must not drift toward
the frame edge or change size between frames. Keep flat fills flat; do not add shading, gradients,
fur texture, 3D rendering, realistic anatomy, outlines, drop shadows, motion-blur smears or a
sticker border that the reference does not have. Do not add, remove or reword any text, letters,
numbers, logos or watermarks. Do not add a background: every frame is fully transparent outside the
subject, with opaque subject interiors — including eyes, teeth, white clothing and text.

AMPLITUDE: keep total displacement under [10% for subtle / 25% for full] of the canvas. This is a
32–64px chat emoji: the silhouette change must be legible at 64px, and the character must stay
recognizable in every single frame when paused.

OUTPUT: 512×512 animated WebP, square, transparent alpha, loop forever.

REJECT the result if: the character's face or proportions change between frames, the subject drifts
or scales, a background or matte appears, text changes, the loop seam is visible, or any frame
alone no longer reads as the original emoji.
```

Two knobs cover both variants: **subtle** = 8–16 frames, 80–120 ms, <10% displacement, one
secondary element moving. **full** = 24–48 frames, 50–80 ms, up to 25% displacement, whole-body
action plus props.

Note on rendering: the existing animated set was mostly *imported* and then restored/upscaled
(`scripts/emoji-enhancement/remaining-animations.mjs`), not generated from stills. A generative
image-to-video model will drift on identity in a way the still-restoration path never had to handle,
so the PRESERVE/REJECT block is doing the real work here — expect to gate on it, and expect a
frame-interpolated or rigged 2D approach (move the existing layers) to beat pure generation for the
flat-vector cats.

## Ranked candidates

Ranked by: how strongly the pose already implies motion, how often the emoji gets used as a
*reaction* (where a loop earns attention), loop-ability, alpha safety, and whether the animated set
already covers that beat. Existing animations (`meow_nod`, `meow_drool`, `meow_popcorn`,
`meow_lurk`, `meow_coffeespitting`, `meow_bongotap`, …) are deliberately excluded from the beats below.

### Tier 1 — animate these first

| # | Emoji | Why | Subtle | Full |
| --- | --- | --- | --- | --- |
| 1 | `meow_angry_tableflip` | A table flip is a *verb* frozen mid-action; the still is the weakest possible version of it. Highest motion debt in the set. | Cat vibrates with rage, table jitters 2px, steam puffs. | Full (╯°□°)╯ arc: crouch, launch, table tumbles out of frame, cat lands panting; 32 frames. |
| 2 | `meow_facepalm` | Universal reaction emoji. The comedy is the *timing* of the paw landing. | Paw already down; head sinks 6px lower, slow sigh. | Beat of disbelief → paw swings up and lands with a squash on impact, head recoils. |
| 3 | `meow_highfive_team` | Two hands about to meet reads as unfinished. Celebration emoji benefit most from loops. | Hands hover and bounce, sparkle pops on the beat. | Wind-up, clap, impact flash + radiating lines, recoil, reset. |
| 4 | `meow_hiss` | Hissing is a sustained, naturally cyclic action. Reads at 32px because the silhouette changes hard. | Fur puff pulses, tail-tip flicks. | Arch up, ears pin, hiss with vibrating jaw and puff of breath, drop back. |
| 5 | `meow_idea` | Idea-motif light bulb is *built* for a flicker. Cheap animation, big payoff. | Bulb flickers on/off, sparkle rotates. | Bulb pops on with a burst, cat's eyes widen and paw jabs upward. |
| 6 | `meow_dunno` / `meowby-maybe` | Shrug is a two-pose action; the still shows one. Shrug is one of the highest-volume Slack reactions. | Shoulders rise 4px, hold, drop, loop. | Full shrug with head tilt, ear flop, and a tiny "¯\\_(ツ)_/¯" bob at the top. |
| 7 | `meow_melt` | Already mid-transformation (`falling-apart`); a loop completes the gag. | Body slowly sags and re-forms, puddle ripples. | Cat melts into a puddle over 24 frames, blinks from the puddle, re-inflates. |
| 8 | `meow_wow` / `meow-scream` | Shock reads best as a *snap*. Pairs with `meow_pink_surprised`. | Eyes dilate and pupils shake; body holds. | Head-rear, mouth snaps open, impact lines flash out, settle. |
| 9 | `old-man-yells-at-cloud` + `cat-yells-at-cloud` + `old-man-yells-at-comcast` | Shouting + shaking fist: two animatable verbs in one frame, and they're a set — one motion rig covers three emoji. | Fist shakes, jaw flaps 3 frames on/off. | Full rant cycle: fist pumps twice, body leans in, cloud drifts opposite for parallax. |
| 10 | `meow_grumpy` | Steam prop is already there and steam is the single most loop-friendly element in the whole set. | Steam wisps rise and dissipate; eyebrows twitch. | Slow simmer building to a puff-of-steam burst from both ears, then reset. |

### Tier 2 — strong, straightforward wins

| # | Emoji | Subtle | Full |
| --- | --- | --- | --- |
| 11 | `meow_hug` / `meow_pink_hug` / `meow_catdoggosnuggle` | Gentle breathing squeeze, heart pulses. | Arms open → close into a squeeze, hearts float up and fade. |
| 12 | `meow_sleep_zzz` / `meow_sleep_drool` / `roo-nap` / `cat-nap` | Body rises/falls on breath, Z's drift up and fade. | Snore cycle: big inhale, bubble inflates from nose and pops. |
| 13 | `meow_puffytears` / `meow_bigsob_cry` / `roocry` | Tears well and brim, lower lip quivers. | Tear jets arc out sideways, shoulders heave (the classic anime sob). |
| 14 | `meow_fistbumpleft` + `meow_fistbumpright` | Each paw bobs in place, waiting. | Paws pull back and connect with an impact star — animate as a matched pair so the two emoji land in sequence. |
| 15 | `meow_hearts` / `meow_heart` | Hearts pulse in a staggered heartbeat rhythm. | Hearts stream upward and out, cat sways side to side. |
| 16 | `meow_think` / `roo-think` / `pikachu-think` / `think-eyes` | Paw taps chin, eyes drift up-left. | Head tilts, question mark materializes and rotates, ear flicks on the "aha". |
| 17 | `meow_nervoussweat` / `meow_yikes` / `meow_puffy-terrified` | Single sweat drop swells and slides; eyes dart. | Full shake with multiple drops flinging off, ears pinned back. |
| 18 | `meow_stop` / `meow_no` / `meow-stop` | Sign wobbles, held steady. | Sign thrusts forward twice with a squash on the push — reads at 32px purely by silhouette. |
| 19 | `meow_dizzy_puffy` | Spiral eyes rotate, body sways. | Full wobble-and-nearly-topple cycle with orbiting stars. |
| 20 | `meow_boop` / `doge-finger-guns` / `fingergunz` | Paw extends 4px and retracts; sparkle at tip. | Double finger-gun with recoil, wink, and a tiny muzzle sparkle. |
| 21 | `meow_onfire` / `meow_firefighter` | Flame licks flicker in place (2-frame cycle is enough). | Flames grow, cat's expression degrades from tired → resigned, ash flakes drift. |
| 22 | `meow_wink` / `meow_winktongue` / `meow-puffy-sup` | The wink itself: 3-frame blink + sparkle. | Wink, head tilt, tongue flick, finger-gun accent. |
| 23 | `success` / `fonzie` / `oke` / `meow-double-thumbs2` | Thumb bobs up once per cycle. | Fist pump / double thumbs with a celebratory shake and impact lines. |
| 24 | `meow_caged` / `meow_ninjacaged` | Bars rattle 1–2px, ears droop lower. | Cat grabs bars and shakes them, dust falls, slumps back. |

### Tier 3 — good but lower priority

`meow_coffee_sip`, `meow_matcha`, `meow-coffee` (steam loop — but `meow_cloroxsip` and
`meow-peek-sip-glare` already cover sipping); `meow_icecream_yum`, `meow_pizza`, `meow_candycanenom`,
`roo-nom` (chew cycles — `meow_cookie`/`meow_chips` overlap); `meow_mage`, `meow-wizard`,
`meow_cosmic` (orbiting sparkles); `meow_dj` (already `drumming` — but `meow_bongo*` family covers
the beat); seasonal set `meow_birthday`, `meow_pumpkin`, `meow_witch`, `meow_elf`,
`meow-gift`/`roo-gift` (confetti and lid-pops, high payoff but only in-season);
`meow_googly`/`meow_googly-bongo` (googly eyes wobbling independently is nearly free);
`shruggy-grimace`, `roo-rheee`, `roo-omg`, `unikittyhappy`, `ohyeaaah`.

### Don't animate

- **Text-only** — `1000`, `10000`, `100000`, `50`, `99`, `done`, `oof`, `thank_you`, `no_ragrets`,
  `weed`. Motion here means either moving type (illegible at 32px) or inventing artwork the prompt
  explicitly forbids.
- **Photo-real stills** — `bizcat`, `cheers-leo`, `sad_keanu`, `severance-working`, `sadcat`,
  `heycat`, `i_have_no_idea_what_im_doing`. Generative motion on a real face or a real person is
  exactly where identity drift shows, and `photoNames` in `remaining-animation-plan.mjs` already
  treats these as the fragile class.
- **Deliberately deadpan** — `meow_unamused2`, `meow_glare2`, `meow_eyes`, `roo-blank`,
  `meow_gummyattention`. The joke *is* the stillness; a loop weakens them. (A 1-frame slow blink
  every ~3 seconds is the only motion that doesn't hurt.)

## Suggested first batch

Ten emoji, one motion beat each, covering the reaction categories with the least overlap against the
existing 81: `meow_angry_tableflip`, `meow_facepalm`, `meow_hiss`, `meow_idea`, `meow_dunno`,
`meow_melt`, `meow_highfive_team`, `meow_grumpy`, `old-man-yells-at-cloud`, `meow_sleep_zzz`.

Ship them at **subtle** first — subtle loops survive the 128 KB Slack cap comfortably at 256px,
where a 40-frame full animation often does not (`meow_nod` is 373 KB at 128px in the current
delivery build, and would need the resolution ladder to drop it to 64px).
