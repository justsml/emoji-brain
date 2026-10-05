# Offline visual similarity

The useful processing and review tools from PR #5 are integrated. The explorer
uses its compact metadata-based Similar workspace and build-time color rail.
The former separate similarity popup is superseded by that workspace.

Run the heavier visual analysis explicitly:

```sh
pnpm process-similarity --json
pnpm process-similarity --report
pnpm process-similarity --report --judgments=/absolute/path/judgments.json
```

This local command needs no credentials or external image service. It writes an
ignored `public/similarity/index.json` and `.cache/similarity/` checkpoints. It is
not part of the production build or emoji update command, and the browser does
not download its index. The color rail instead measures tiny still previews at
build time, giving each sticker equal weight after excluding transparent pixels.

The optional processor compares dominant Oklab palettes with optimal transport,
a 64-color histogram baseline, spatial layout, silhouettes, internal edges and
duration-weighted animation samples. Content hashes and algorithm versions
invalidate stale descriptors and pairs. Cancellation or changed catalog/image
bytes preserve the previous published index; restart the command to resume.

The generated HTML report compares methods, displays sampled masks and edges,
and imports/exports attributed human judgments. Its 40 queries have a fixed
tuning/held-out split. Weights and cutoffs remain provisional; unjudged relevance
metrics stay null. Duplicate candidates are review suggestions and never cause
automatic deletion or merging. Historical timing evidence in
`scripts/similarity/validation-run.json` describes the original PR's run, not
current catalog performance.
