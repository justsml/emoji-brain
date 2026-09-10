# Animated emoji pilot

12 short animations for human review; no production replacements. Open index.html for synchronized frame comparisons, slow playback, scrubbing, and dark/light alpha checks. The full-resolution downloads preserve original frame counts, per-frame durations, loop settings and transparency.

Real-ESRGAN uses official animevideov3 weights locally on black and white composites; their difference estimates a sharper alpha matte. The effect-preserving candidate mixes 20% restored RGB with 80% source upscale and retains the original alpha for intentional blur and jitter. Nano Banana Pro processes an entire sprite sheet through OpenRouter at 2K, followed by Replicate Bria matting (or border-connected white removal if credits are unavailable) and enclosed alpha repair. The per-item manifest records the actual route. Exact timing preservation does not guarantee correct poses or temporal consistency; compare every frame.

All candidates remain pending approval. See manifest.json for hashes, prompts, model provenance and review notes. Commit status does not imply approval.
