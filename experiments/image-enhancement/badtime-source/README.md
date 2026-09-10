# Source-guided Thumper correction

The original badtime emoji depicts Thumper, South Park's adult ski instructor. The first enhancement lost his angular nose and tan beard-shadow shape and introduced thick generic cartoon outlines.

Official source clip and thumbnail: https://www.southparkstudios.com/video-clips/yskfa1/south-park-thumper-the-super-cool-ski-instructor . The downloaded official thumbnail is retained as `official-reference.jpg`; a head crop is `reference-head.png`.

Nano Banana Pro receives two references: the original emoji for crop/expression and the official head crop for character detail. Exact prompt and references are in `input.json`; output is 1K. Bria supplies the alpha matte. `badtime.transparent.png` is the updated candidate; `comparison.png` shows original, prior enhancement, official reference and revision. `alpha-check.png` verifies white eyes and transparent background on dark/white.

The revision restores the nose, beard shadow and teeth. It remains reconstructed artwork rather than an exact source-frame recovery. Estimated additional cost: $0.15 enhancement + $0.018 matting. Public originals remain unchanged. The batch gallery and ZIP use this revised candidate.
