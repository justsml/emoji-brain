# Premium reconstruction trial

Follow-up to the low-cost pilot, requested after its visual quality was rejected.

Models tested:

- [GPT Image 2.5 Sunburst](https://openrouter.ai/openai/gpt-image-2.5-sunburst), OpenRouter, quality `max`. Token-billed; actual usage recorded in response.
- [Nano Banana Pro](https://replicate.com/google/nano-banana-pro), Replicate, 2K, $0.15/output.
- [FLUX.2 Max](https://replicate.com/black-forest-labs/flux-2-max), Replicate, 2 MP. Returned billing metrics: 1 input MP and 2 output MP; $0.04 + $0.03 + $0.06 = $0.13/output estimate.
- [SeedVR2](https://replicate.com/zsxkib/seedvr2), Replicate, 7B checkpoint, one step, color fix enabled. $0.001525 per GPU second.

Both original WebPs are supplied directly, without enlargement. Generative editors receive a new prompt explicitly asking for crisp reconstruction while preserving composition, rather than preserving every source pixel. White is requested for the cat background because these selected editors do not provide reliable native transparency. The previous pilot uses different prompts and settings, so improvements cannot be attributed solely to the model. Each model receives one sample per source; this is a practical qualitative comparison, not a global benchmark.

Run `node experiments/image-enhancement/premium/run.mjs` to resume Replicate jobs; `node experiments/image-enhancement/premium/openrouter.mjs` resumes the OpenRouter outputs. Missing result files create paid requests. `node experiments/image-enhancement/premium/report.mjs` builds the local gallery and contact sheets without API calls. Exact request parameters, model versions, and output data are retained. Catalog images are unchanged.

## Results

All eight outputs succeeded. Nano Banana Pro produced the best practical balance of crispness and resemblance in this round. It still altered the cat's paws/style and reconstructed readable Lego caption text, despite the instruction not to invent lettering. FLUX.2 Max changed the entire framing and pose. Sunburst produced crisp artwork but changed the cat into a meerkat-like animal and added hands/changed costume on the Lego image. SeedVR2 largely preserved blur and lost transparency. None is a faithful recovery of unknown original detail.

Sunburst used the account's existing BYOK routing: OpenRouter reported `cost: 0`, but `cost_details.upstream_inference_cost` was **$0.211552 per image**. Zero router cost is not free inference. The gallery displays upstream inference cost for this reason. Eight-output total consists of $0.30 Nano Banana Pro + $0.26 FLUX estimate + $0.423104 Sunburst upstream cost + SeedVR2 GPU runtime costs.
