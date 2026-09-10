# Severance-running revisit

Approved and promoted: recovered + Topaz. User approval: “approved, promote recovered topaz”. The original 64px animation is archived.

The larger GIFDB copy contains the exact two-shot sequence (889×500, 112 frames at 25fps). Center cropping and monotonic frame sampling reconstruct the original 90 holds at 20fps, including its cut at frame 27. The crop is based on the original composition. All output images are WebP.

Recommendation: **topaz-recovered**. It preserves the actual actor and footage with slightly smoother walls. The source-recovered version is included to judge whether Topaz's additional smoothing is desirable. Most of the improvement comes from recovering a better source, not inventing detail with a generative model.

Two Replicate Topaz predictions succeeded: median-filtered original (`wwwx0ngjehrmr0d0hnes44zyg4`, rejected for blotchiness), and recovered footage (`3rwp164e5drmw0d0hng8t9g9x0`, staged). The live schema exposed resolution and frame rate, but no denoise/model controls. Actual dollar charges were not returned; billing counters are not dollar prices.

512px masters and 64/256px previews use quality90. The 128px Slack files use quality70 to fit under128KiB (121132 and123826 bytes). Alpha quality is100. The source is fully opaque; its alpha is retained exactly. No background was removed. Lossless intermediates and provider videos remain in ignored experiments.

Validation checks source/candidate hashes, production matching the approved hash, monotonic mapping, scene cut, dimensions, original4500ms duration,50ms hold boundaries, loop, and every decoded alpha pixel. Small-size WebP encoding may merge identical consecutive frames while preserving their duration. The browser review uses the actual file for the selected size.

Reproduce using `node scripts/emoji-enhancement/revisit-severance-running.mjs`, then `node scripts/emoji-enhancement/validate-severance-revisit.mjs`. The cached paid prediction is reused only when its input matches. Credential is read by the existing Replicate helper from the local environment; it is not stored here.
