# Local AI Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run an actual pretrained sentence-embedding model to assist the existing lost/found ranking while retaining a transparent rule fallback.

**Architecture:** A server-only adapter loads one quantized MiniLM pipeline. The service shortlists with the existing scorer, replaces only the 20-point text contribution after successful model inference, and reports the method used; a failed model leaves current matching behaviour intact.

**Tech Stack:** Next.js Node runtime, TypeScript, Transformers.js, Vitest, existing Zod browser contract.

## Global Constraints

- Work only in `D:\Massey\CampusLostFound-project-quality-polish` on `feature/supervisor-feedback`.
- Infer from `title` and `publicDescription` only; no private evidence, contacts, photos, or identity.
- Preserve structured factor weights and maximum total 100; no automatic Claim decision.
- The default automated suite and production build must not download a model or access Atlas.
- A fallback must be labelled `rule_fallback`, never `model_assisted`.

---

### Task 1: Pure semantic scoring boundary

**Files:**
- Create: `web/src/lib/reports/semantic-score.ts`
- Create: `web/src/lib/reports/semantic-score.test.ts`
- Modify: `web/src/lib/reports/matching-score.ts`
- Modify: `web/src/lib/reports/matching-score.test.ts`

**Interfaces:**
- Consumes: existing `ScoringReport`, `MatchScore`, and text-factor maximum 20.
- Produces: `semanticTextPoints(left: Float32Array, right: Float32Array): number` and `replaceTextFactor(base: MatchScore, points: number): MatchScore`.

- [ ] **Step 1: Write failing tests.** Identical unit vectors earn 20, orthogonal vectors earn 0, negative or invalid similarity is clamped, and replacing text leaves the five structured factor values unchanged.
- [ ] **Step 2: Run `npm test -- src/lib/reports/semantic-score.test.ts src/lib/reports/matching-score.test.ts`; expect failure.**
- [ ] **Step 3: Implement cosine-based `Math.round(20 * clamp(cosine, 0, 1))` and a pure text-factor replacement that recalculates the total from factors.** Do not expose embeddings in the response.
- [ ] **Step 4: Re-run targeted tests; expect pass. Commit `feat(matching): score semantic text safely`.**

### Task 2: Server-only local model adapter

**Files:**
- Modify: `web/package.json` and `web/package-lock.json`
- Create: `web/src/lib/reports/local-embedding.ts`
- Create: `web/src/lib/reports/local-embedding.test.ts`
- Modify: `web/.gitignore` only if a chosen cache path needs ignoring

**Interfaces:**
- Produces: `embedPublicText(text: string): Promise<Float32Array>` using the quantized `Xenova/all-MiniLM-L6-v2` model.

- [ ] **Step 1: Write a failing adapter test that mocks the Transformers.js pipeline and verifies one lazy initialization, normalized pooled vectors, and reuse across calls.** It must never trigger a real download.
- [ ] **Step 2: Run `npm test -- src/lib/reports/local-embedding.test.ts`; expect failure.**
- [ ] **Step 3: Install a pinned stable `@huggingface/transformers` version and implement a server-only lazy singleton.** Use the model's quantized variant, mean pooling, and normalization; document that the first setup download is required and local cache is reused.
- [ ] **Step 4: Re-run the adapter test and `npm run build`; expect no model download. Commit `feat(matching): load local MiniLM embeddings`.**

### Task 3: Matching service, response contract, and member UI

**Files:**
- Modify: `web/src/lib/reports/matching-service.ts`
- Modify: `web/src/lib/reports/matching-service.test.ts`
- Modify: `web/src/lib/reports/browser-client.ts`
- Modify: `web/src/lib/reports/browser-client.test.ts`
- Modify: `web/src/components/reports/report-matches-panel.tsx`
- Modify: `web/src/components/reports/report-matches-panel.test.tsx`
- Modify: `web/src/app/api/reports/matching-routes.test.ts`

**Interfaces:**
- Consumes: `embedPublicText`, `replaceTextFactor`, and existing rule results.
- Produces: `ReportMatches.matchingMethod: "model_assisted" | "rule_fallback"` and the unchanged bounded match list.

- [ ] **Step 1: Write failing tests for 30-candidate shortlist, public-text-only model input, updated ranking, model-error fallback over all original candidates, and method labels even when the text factor earns zero.**
- [ ] **Step 2: Run the matching-service, browser-client, panel, and route test files; expect failure.**
- [ ] **Step 3: Integrate the adapter after rule-based shortlisting, batch or sequentially embed bounded public texts, replace only text points, preserve existing score threshold/ties/maximum five, and return `matchingMethod`.** Update strict browser parsing and show a small method label beside results.
- [ ] **Step 4: Re-run targeted tests, lint, `npx tsc --noEmit`, and build; expect pass. Commit `feat(matching): surface model-assisted recommendations`.**

### Task 4: Evidence and setup instructions

**Files:**
- Modify: `docs/ai-matching-evaluation.md`
- Modify: `docs/user-guide.md`
- Modify: `web/README.md`
- Modify: `docs/test-matrix.md`
- Create: `docs/superpowers/verification/2026-09-22-local-ai-matching.md`

- [ ] **Step 1: Explain model identity, licence, first-download setup, local inference, fallback label, privacy, and the unchanged Claim decision boundary.**
- [ ] **Step 2: Run existing baseline evaluation and a real local model inference against the labelled synthetic fixture.** Record actual precision, recall, F1, loading time, and limitations; do not manufacture an improvement claim.
- [ ] **Step 3: Run complete tests, lint, typecheck, build, and audit; record exact results.**
- [ ] **Step 4: Review `git diff --check` and commit `docs: verify local AI matching`.**

## Self-review

- Spec coverage: real model inference, limited public input, fallback, explainable 0–100 score, shortlist, visible method, and measured evaluation are mapped above.
- No external API, chatbot, automatic approval, or photo classifier is planned.
