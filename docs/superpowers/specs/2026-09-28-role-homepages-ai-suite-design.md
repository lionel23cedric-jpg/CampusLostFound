# Role-aware homepages and AI feature suite

## Goal

Improve Campus Find without moving beyond the course brief. The public homepage will become more visual and action-oriented, Staff and Administrator accounts will receive purpose-built homepages, and the four remaining AI-enhanced examples from the project brief will be integrated alongside the existing item-matching feature.

The implementation must remain privacy-safe, explainable during assessment, usable when a model is unavailable, and proportionate to a student project.

## Scope and delivery order

The work is delivered as three connected phases:

1. Role-aware navigation and dashboards.
2. Public homepage redesign using existing project imagery and real product routes.
3. Smart search, description and tag assistance, image-assisted categorisation, and duplicate-report detection.

The existing Student dashboard and existing intelligent item matching remain functionally unchanged.

## Public homepage

The homepage retains the existing Campus Find identity, headline and campus photography, but replaces text-heavy static sections with useful, visual entry points.

- The hero presents three real actions: report a lost item, report a found item, and search reports.
- Signed-out visitors are taken through authentication before reaching protected functions.
- The explanation of the recovery process becomes three illustrated steps: report, AI-assisted matching, and controlled recovery.
- Static sample notices become visual campus-recovery scenarios with links to actual features.
- Existing, stylistically consistent assets in `public/illustrations` are reused.
- No invented recovery statistics, testimonials, institutional endorsements or live-data claims are introduced.
- The page remains keyboard accessible, responsive to 320 CSS pixels and compatible with reduced-motion preferences.

## Role-aware navigation and homepages

### Student

The current Student dashboard remains the familiar default. Its report, search, history, Claim, notification and profile actions are retained. Only shared responsive fixes may affect it.

### Staff

Staff receive a distinct `Recovery Operations Desk` dashboard focused on operational work:

- report handling;
- ownership Claim review;
- notifications relevant to recovery work; and
- a concise account/status summary.

The Staff dashboard uses the existing handover and storage imagery and a restrained operational green/blue visual treatment. Student submission and personal report-history cards are not shown on the Staff homepage.

### Administrator

`/admin` becomes the Administrator homepage. An Administrator who visits `/dashboard` is directed to `/admin`.

The page is titled `Campus Find Operations` with the supporting line `System oversight, access control and report integrity.` It uses a distinct dark-green/charcoal control-centre treatment while preserving contrast and readability.

Only Administrator responsibilities are presented:

- system overview;
- account and Staff-role management;
- category and campus-location reference data;
- report moderation;
- report, Claim and account totals and charts; and
- overview refresh.

The Administrator navigation omits Browse, My reports, Report item and Staff Claim-review links. It provides direct access to Overview, Accounts and Staff, Reference data, Moderation and Sign out.

### Shared implementation boundary

`DashboardClient` continues to own session loading and authentication states, then delegates to a role-specific view. `SiteHeader` derives its links from the authenticated role so permissions and navigation remain aligned. Server APIs remain the source of truth for authorization.

## AI architecture

The implementation uses local, pinned pretrained models through the already-installed `@huggingface/transformers` package. It does not require OpenAI, Gemini or another paid API.

The existing MiniLM text-embedding pipeline is the shared text capability for:

- intelligent item matching;
- semantic smart search;
- semantic tag selection for the report assistant; and
- duplicate-report similarity.

A single lazily loaded, pinned visual model supports image-assisted categorisation. Model promises are cached in the process. Candidate counts are capped to keep inference bounded. A model load or inference failure produces a safe fallback instead of interrupting the core workflow.

Every AI surface identifies whether the result is `AI-assisted` or a fallback. AI produces suggestions only; a person confirms every mutation.

## Smart search

The authenticated report browser gains a natural-language query field. A query such as `black laptop charger lost near the library yesterday` is compared semantically with privacy-safe report titles, descriptions and tags, then combined with the existing structured report filters.

The existing browse contract is extended with an optional `smartQuery` rather than creating a second report-search subsystem. Model-assisted results are labelled `AI-assisted search`. If semantic inference is unavailable, the request uses the existing keyword behaviour and is labelled `Keyword fallback`.

Only member-visible report data is eligible for model input. Private verification fields, serial numbers, exact private locations, contact details and reporter identifiers are excluded.

## Description and tag assistant

The report form gains a `Suggest description and tags` action. It becomes available after the user provides enough public context, such as a title and short description.

The assistant returns:

- a concise public-description suggestion; and
- three to five semantic tag suggestions.

The existing MiniLM model selects relevant tag concepts from a controlled campus-item vocabulary. A deterministic formatter produces concise copy from the user's public fields. The interface accurately describes the feature as AI-assisted rather than claiming unrestricted generative AI.

The suggestion appears in a review panel. `Apply suggestion` updates the public description and tags; `Keep my text` dismisses it. No suggestion is automatically applied or submitted. Private ownership evidence is never sent to the assistant.

## Image-assisted categorisation

After selecting a report image, the user may choose `Suggest category from photo`. The browser sends one validated image to an authenticated endpoint. The endpoint accepts JPEG, PNG or WebP up to 3 MB, processes it in memory and compares it with currently active category names.

At most three suggestions are returned with confidence values. Selecting `Use this category` updates the form; the user may ignore every suggestion. The AI never submits the report or silently changes a category.

The image is not sent to an external AI provider and is not retained by the analysis endpoint. Normal report-image storage remains part of the existing submission workflow.

## Duplicate-report detection

The Administrator moderation page gains `Scan for possible duplicates`. The detector compares same-type, visible reports using semantic public text plus existing structured factors such as category, location and date.

The result is a bounded list of likely duplicate pairs with an explainable similarity summary. No report is hidden or flagged automatically. When an Administrator confirms a pair, the existing report-flag workflow creates a pending `duplicate_report` concern for the selected report, with the paired report identifier recorded in safe review details. The existing moderation queue, decision rules and audit behaviour are reused; no new collection is introduced.

## API and validation boundaries

The planned server changes are:

- extend the report-browse query contract with optional natural-language smart search;
- add an authenticated report-assistant endpoint;
- add an authenticated multipart image-category endpoint; and
- add an Administrator-only duplicate-scan endpoint.

All query, JSON and multipart inputs use strict Zod validation. Responses use explicit contracts and safe error envelopes. Model exceptions, paths and raw database errors are never returned to the browser.

The duplicate-confirmation action reuses the existing report-flag mutation. No existing database schema is changed.

## Failure, loading and fallback states

- Model loading has an explicit in-progress state and disables duplicate submissions.
- A failed smart search falls back to keyword search and preserves structured filters.
- A failed description or image suggestion leaves the form unchanged and offers retry.
- A failed duplicate scan leaves the existing moderation queue available.
- Stale client requests are aborted or ignored so older results cannot overwrite newer input.
- Empty results explain the next useful action without implying that the AI proved no match exists.

## Testing and verification

Automated tests will cover:

- role-specific dashboard and navigation visibility;
- Administrator `/dashboard` routing;
- homepage actions and accessible structure;
- semantic smart-search ranking and keyword fallback;
- description/tag suggestion review, application and dismissal;
- image MIME type, size, result confirmation and failure handling;
- duplicate-scan Administrator authorization, thresholding and explicit confirmation;
- exclusion of private verification data from every model input;
- safe model-failure behaviour; and
- strict request and response contracts.

Final verification includes the complete Vitest suite, ESLint, TypeScript, production build, dependency audit and one bounded visual pass at desktop and mobile widths.

## Explicit non-goals

- No chatbot, autonomous agent or general-purpose text generator.
- No paid AI API or required external credential.
- No automatic report submission, account change, moderation decision or report hiding.
- No facial recognition, identity inference or private-evidence analysis.
- No fabricated live statistics or institutional claims.
- No database-schema expansion solely to store AI output.

## Success criteria

The change is complete when the public homepage has useful visual actions, each role reaches a clearly purpose-built homepage, Administrator navigation contains only management work, all five course-listed AI examples are demonstrable, model failures preserve core workflows, privacy boundaries are tested, and the existing quality commands pass.
