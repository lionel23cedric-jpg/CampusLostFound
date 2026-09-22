# Local Model-Assisted Matching Design

## Goal

Add a demonstrable pretrained-model inference step to the existing explainable lost/found matcher, while preserving the current structured factors, privacy boundary, and human Claim review. The supervisor explicitly allowed the current programmed logic but asked for an actual AI component if possible.

## Chosen approach

- Use the Apache-2.0-licensed `Xenova/all-MiniLM-L6-v2` English sentence-embedding model with a quantized ONNX variant through Transformers.js in the Node.js server runtime. Its normalized embeddings compare the public title and public description of a source report and candidate reports.
- Keep category (25), location (15), date (15), colours (15), and tags (10) unchanged. The 20-point text factor uses model cosine similarity when inference succeeds, replacing rather than adding to the current lexical text points. Scores therefore remain out of 100.
- Run the existing rule scorer first and retain the 35-point admission gate. Form a shortlist of at most 30 rule-qualified reports, then model-score only that shortlist. The model cannot promote a rule-rejected report. The existing maximum of five returned matches and deterministic tie-break order remain.
- On model load or inference failure, use the existing lexical text factor and mark the result as a fallback. The UI and documentation must never label a fallback result as model-assisted.

## Model loading and privacy

- The server lazily initializes one shared model pipeline and caches its files locally after a one-time setup download. No AI API key is required. Setup documentation states that the first model download needs internet; subsequent inference is local. Tests and builds never download the model.
- Only `title` and `publicDescription` are passed to the model. Do not include reporter identity, contact details, verification answers, serial numbers, private notes, uploaded photos, or session data.
- The model name, version or revision, licence, download/setup command, and limitations are recorded in project documentation. Model assets are not silently fetched during production build or automated unit tests.

## Interface and explanation

- The response carries an explicit `matchingMethod` value (`model_assisted` or `rule_fallback`), including when text similarity earns zero points. The text-factor explanation uses “AI semantic text similarity” only after successful inference; other factor explanations remain unchanged.
- Results remain suggestions, not proof of ownership. The existing Claim and Staff verification workflow is unchanged.
- Keep the browser response bounded; do not return embeddings or raw model output.

## Verification

- Unit tests inject a fake embedding provider to verify cosine conversion, clamping into 0–20 text points, score bounds, ranking, fallback, and that only public text reaches inference.
- Keep the existing labelled synthetic fixture as the baseline; run both original and model-assisted evaluation, record measured precision, recall, F1, and any regressions without claiming improvement in advance.
- Complete at least one real local model inference in a manual demonstration and record its loading behaviour and resulting match explanation.

## Deliberate limits

- No generative chatbot, external AI account, automatic Claim approval, photo analysis, or new personal-data transfer is added.
- If the model cannot be prepared on the deployment machine, the application still works using the clearly identified deterministic matcher, but the AI acceptance demonstration is not considered complete.
