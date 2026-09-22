# Local AI matching verification — 22 September 2026

## Implemented boundary

The server lazily loads quantized `Xenova/all-MiniLM-L6-v2` at pinned revision
`751bff37182d3f1213fa05d7196b954e230abad9` through Transformers.js
4.3.0. It embeds only public title and description. The existing rule score
keeps its 35-point admission gate; at most 30 eligible candidates receive a
replacement 0–20 semantic text score. The other five factor weights, 100-point
maximum, five-result limit, and human Claim verification remain unchanged.
When inference fails, all eligible rule candidates remain available and the
response says `rule_fallback`.

## Reproducible evidence

- `npm run evaluate:matching`: 12 synthetic cases, 60 comparisons, TP 24,
  FP 5, FN 0, TN 31; precision 0.828, recall 1.000, F1 0.906, accuracy 0.917,
  top-match accuracy 1.000.
- `npm run evaluate:matching:ai`: real local model inference on the same
  fixture, with the conservative rule gate; the same aggregate matrix and
  metrics. This verifies execution and privacy boundaries, **not an accuracy
  improvement**. An ungated trial had 19 false positives and was not adopted.
- Automated tests cover vector bounds, lazy model initialization, the
  30-candidate limit, model-assisted labels, rule fallback, strict browser
  responses, and the public-text-only input. The normal suite and production
  build do not download model files.
- The full 22 September test, lint, typecheck, build, and zero-vulnerability
  audit gate is recorded in `docs/test-matrix.md`.

## Manual demonstration status

Real local model inference ran via the evaluation command. A signed-in browser
demonstration showing `model_assisted` on a live report was **not** run in this
verification; it needs suitable disposable reports on the configured database.
The model's first download requires internet and populates an ignored cache
under `node_modules`. A fresh source ZIP or machine must run
`npm run evaluate:matching:ai` before demonstrating model-assisted results.
