# Emoji enhancement routing

The pilot showed that sharper output can change identity: Fonzie became a different person, and the cat holding a 10/10 sign became a panda. Prompt routing separates three independent concerns, then applies transparency processing.

| Control | Values | Behavior |
| --- | --- | --- |
| Rendering | `photo`, `flat`, `illustration` | Conservative photographic restoration; flat shape/line cleanup; or preservation of existing illustrated shading and texture |
| Subject | Explicit reviewed visual description | Preserve species, markings, facial anatomy, gesture and defining features |
| Text | `none`, `exact`, `unknown` | No invented lettering; exact human-verified lines and layout; or block pending verification |
| Photo identity | Name + verified usable reference | A name alone does not authorize inventing a face. A poor identity reference blocks a fresh generation |
| Alpha | Required Bria matte + visual review | White generation backgrounds are intermediate only; inspect subject interiors as well as silhouette |

`scripts/emoji-enhancement-prompts.mjs` builds prompts and review plans. These are manually reviewed routing inputs, not an automatic classifier. Existing tags/filenames must not be treated as exact text transcriptions or reliable species/identity labels. Unknown text is a review state, not permission to hallucinate a caption.

The current reviewed examples and compiled plans are in `experiments/image-enhancement/batch-10/prompt-routing-v2.json` and `prompt-plans-v2.json`. The experiment runner uses these plans for new requests and retains existing outputs. It blocks fresh calls when text or named-photo identity needs review. Saved predictions are not automatically regenerated when prompts change; retain their artifacts and explicitly start a new attempt, as done for the rejected panda and Fonzie outputs.

Nano Banana Pro runs at 1K with source aspect ratio. Bria removes the intermediate background. Review text, expression, species and likeness before accepting an output. Numeric alpha checks establish that the background is transparent, but dark/light visual comparisons are also required to catch erased white eyes, clothing, lettering or equipment. Final catalog replacement remains a separate action.

Fonzie currently uses a source-photo cutout because both generative likeness attempts were rejected. Do not infer that its named-subject generation gate has been satisfied by that workaround.
