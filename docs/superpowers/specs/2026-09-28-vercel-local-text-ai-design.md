# Vercel Local Text AI Design

## Objective

Make the existing MiniLM-based text AI run reliably in Vercel production so smart search, report matching, the report-writing assistant, and duplicate detection return `model_assisted` instead of falling back because a model cannot be downloaded at request time.

The change must remain within the course project scope, require no paid external AI service, expose no private report data, and preserve the existing rule-based fallback.

## Confirmed approach

Bundle the fixed text-embedding model with the application and load it from the deployed function filesystem. The repository will contain only the assets needed by `Xenova/all-MiniLM-L6-v2` at revision `751bff37182d3f1213fa05d7196b954e230abad9`:

- model configuration;
- tokenizer configuration and vocabulary data;
- the quantized ONNX model used by the current pipeline.

The expected addition is approximately 23 MB. The unrelated CLIP image-classification model is explicitly outside this fix because its local cache is approximately 183 MB and would make the Vercel function bundle unnecessarily large.

## Architecture

### Model assets

Store the model under:

`web/models/Xenova/all-MiniLM-L6-v2/`

The directory layout must match the local-model layout expected by `@huggingface/transformers`. Add a short source document recording the model identifier, pinned revision, upstream URL, and license attribution.

### Model loader

Keep `embedPublicText(text)` as the single shared entry point in `web/src/lib/reports/local-embedding.ts`.

Before constructing the pipeline, configure Transformers.js to:

- use the repository model directory as `env.localModelPath`;
- allow local models;
- disallow remote models;
- use the existing quantized model;
- retain the current singleton promise so one warm function instance loads the model once.

No API key, environment variable, database migration, or client-side model download is introduced.

### Vercel packaging

Configure `outputFileTracingIncludes` in `web/next.config.ts` so the model assets are present only in server functions that use text embeddings:

- report browsing and smart search;
- report match suggestions;
- AI report-description and tag suggestions;
- administrator duplicate detection.

Patterns must be expressed relative to the `web` project root and kept narrower than a global `/*` include.

### Existing consumers

The public interface does not change. These existing modules continue to call `embedPublicText`:

- `web/src/lib/reports/browse-service.ts`;
- `web/src/lib/reports/matching-service.ts`;
- `web/src/lib/ai/report-assistant.ts`;
- `web/src/lib/ai/duplicate-detection.ts`.

## Data and privacy

Inference stays inside the application's server function. Public report wording is embedded, while ownership evidence, private contact details, credentials, and private locations are never sent to a third-party AI service.

The model files contain no project or user data. No schema or stored report data changes are required.

## Failure handling

The current safe fallbacks remain unchanged:

- smart search returns keyword fallback results;
- matching returns the rule-based score;
- the writing assistant returns controlled fallback suggestions;
- duplicate detection returns deterministic fallback candidates.

Raw model errors must not be returned to the browser. Existing response contracts and user-facing method labels remain unchanged.

## Verification

1. Update the model-loader unit test to verify local-only Transformers.js configuration and singleton reuse.
2. Run a real local inference check with remote model loading disabled.
3. Run focused tests for smart search, matching, report assistance, and duplicate detection.
4. Run the complete test suite, ESLint, TypeScript checking, and the Next.js production build.
5. Inspect generated route traces to confirm the text model is included only where required.
6. Deploy through the existing `develop` to `main` Git workflow.
7. On the production site, run the natural-language search `I lost a red canvas backpack near the library` and require the visible result label `AI-assisted search`.

## Non-goals

- No OpenAI, Gemini, or Hugging Face inference API.
- No new AI framework or abstraction layer.
- No database migration or stored embedding index.
- No change to ranking weights, UI layout, or report visibility rules.
- No bundling of the separate CLIP image model in this change.

