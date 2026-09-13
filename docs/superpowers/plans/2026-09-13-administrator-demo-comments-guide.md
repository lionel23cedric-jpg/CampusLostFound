# Administrator Demo Comments and Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add concise presentation-oriented English comments to the administrator statistics, reference-data, and report-moderation code paths, then deliver a visually verified bilingual demonstration and code-tracing Word guide.

**Architecture:** Preserve all application behaviour and annotate the existing page-to-client-to-route-to-service-to-model boundaries. Build the guide from the verified source paths and tests, using a compact shared data-flow diagram and timed bilingual speaking notes.

**Tech Stack:** Next.js App Router, React, TypeScript, MongoDB, Mongoose, Zod, Vitest, python-docx, bundled LibreOffice renderer

## Global Constraints

- Change comments and documentation only; do not change runtime behaviour, schemas, API contracts, dependencies, or user-facing copy.
- Use concise English comments in source code and Chinese-English paired explanations in the Word guide.
- Annotate security, data-flow, aggregation, transaction, audit, and optimistic-concurrency decisions; do not narrate obvious syntax.
- Limit the live presentation to approximately six to eight minutes.
- Preserve the unrelated deletion of `web/public/campus-find-hero.png`; never stage, restore, or modify it.
- Do not include database credentials, `.env.local`, raw exceptions, session values, or private verification answers in comments or documentation.

---

### Task 1: Annotate Administrator Access and Overview Flow

**Files:**
- Modify: `web/src/components/admin/administrator-access-boundary.tsx`
- Modify: `web/src/components/admin/admin-overview-client.tsx`
- Modify: `web/src/lib/admin/browser-client.ts`
- Modify: `web/src/app/api/admin/overview/route.ts`
- Modify: `web/src/lib/admin/overview-service.ts`
- Modify: `web/src/lib/admin/overview-contract.ts`
- Test: `web/src/components/admin/administrator-access-boundary.test.tsx`
- Test: `web/src/components/admin/admin-overview-client.test.tsx`
- Test: `web/src/lib/admin/browser-client.test.ts`
- Test: `web/src/app/api/admin/overview/admin-overview-route.test.ts`
- Test: `web/src/lib/admin/overview-service.test.ts`

**Interfaces:**
- Consumes: authenticated session data, `GET /api/admin/overview`, Mongoose aggregate results.
- Produces: presentation comments that explain administrator gating, safe browser parsing, independent aggregate queries, and contract consistency checks.

- [ ] **Step 1: Add boundary comments**

Add comments equivalent to the following above the relevant functions or blocks:

```ts
// This client boundary improves the user experience, while every administrator
// API repeats the role and active-account check as the authoritative control.
```

```ts
// Abort the previous request so a slower response cannot overwrite a newer
// refresh when the component is remounted or retried.
```

- [ ] **Step 2: Annotate the route and browser contract**

Explain that the route derives identity from the server-side session, accepts no client-supplied role, validates the period query, and returns safe errors. Explain that the browser client parses the response with Zod instead of trusting arbitrary JSON.

- [ ] **Step 3: Annotate aggregate definitions**

Add comments above the report, Claim, and account pipelines explaining the counting rules. Add this principle near `Promise.all`:

```ts
// The three aggregates are independent, so running them together reduces
// dashboard latency without weakening any count definition.
```

Explain that `buildAdministratorOverview` rejects inconsistent totals before data reaches the UI.

- [ ] **Step 4: Run focused overview tests**

Run:

```powershell
Set-Location web
npm test -- --run src/components/admin/administrator-access-boundary.test.tsx src/components/admin/admin-overview-client.test.tsx src/lib/admin/browser-client.test.ts src/app/api/admin/overview/admin-overview-route.test.ts src/lib/admin/overview-service.test.ts
```

Expected: all selected test files pass with no changed assertions.

- [ ] **Step 5: Commit the overview annotations**

```powershell
git add -- web/src/components/admin/administrator-access-boundary.tsx web/src/components/admin/admin-overview-client.tsx web/src/lib/admin/browser-client.ts web/src/app/api/admin/overview/route.ts web/src/lib/admin/overview-service.ts web/src/lib/admin/overview-contract.ts
git commit -m "docs: explain administrator overview flow"
```

---

### Task 2: Annotate Reference Data Management Flow

**Files:**
- Modify: `web/src/components/admin/admin-reference-data-client.tsx`
- Modify: `web/src/components/admin/category-management-panel.tsx`
- Modify: `web/src/components/admin/campus-location-management-panel.tsx`
- Modify: `web/src/lib/admin/reference-data-browser-client.ts`
- Modify: `web/src/lib/admin/reference-data-contract.ts`
- Modify: `web/src/lib/admin/reference-data-access.ts`
- Modify: `web/src/lib/admin/category-service.ts`
- Modify: `web/src/lib/admin/campus-location-service.ts`
- Modify: `web/src/app/api/admin/categories/route.ts`
- Modify: `web/src/app/api/admin/categories/[categoryId]/route.ts`
- Modify: `web/src/app/api/admin/campus-locations/route.ts`
- Modify: `web/src/app/api/admin/campus-locations/[campusLocationId]/route.ts`
- Test: administrator category and campus-location service, route, browser-client, and component tests.

**Interfaces:**
- Consumes: administrator session, fixed-size list query, create/update payload, current `updatedAt` timestamp.
- Produces: presentation comments explaining search, paging, activation instead of deletion, reference preservation, and stale-write rejection.

- [ ] **Step 1: Annotate the shared reference-data page and clients**

Explain that the page renders separate category and campus-location panels because their fields differ, while both use the same protected browser contract. Explain abort handling and safe response validation.

- [ ] **Step 2: Annotate list and creation services**

Add comments explaining regex escaping, active/inactive filters, `$facet` returning records and count in one query, case-insensitive duplicate protection, and safe error translation.

- [ ] **Step 3: Annotate optimistic updates and preservation rules**

Add comments equivalent to:

```ts
// Matching both the ID and the last displayed updatedAt value prevents one
// administrator from silently overwriting another administrator's newer edit.
```

```ts
// Records are activated or deactivated rather than deleted so historical
// reports keep valid category and campus-location references.
```

Explain why the UI reloads the latest record after an HTTP 409 conflict.

- [ ] **Step 4: Annotate route-level trust boundaries**

Explain server-derived administrator identity, strict Zod objects, bounded request bodies, and the separation between HTTP parsing and service-level database operations.

- [ ] **Step 5: Run focused reference-data tests**

Run:

```powershell
Set-Location web
npm test -- --run src/lib/admin/category-service.test.ts src/lib/admin/campus-location-service.test.ts src/lib/admin/reference-data-browser-client.test.ts src/app/api/admin/categories/admin-category-routes.test.ts src/app/api/admin/campus-locations/admin-campus-location-routes.test.ts src/components/admin/category-management-panel.test.tsx src/components/admin/campus-location-management-panel.test.tsx
```

Expected: all selected tests pass and no user-visible strings change.

- [ ] **Step 6: Commit the reference-data annotations**

```powershell
git add -- web/src/components/admin/admin-reference-data-client.tsx web/src/components/admin/category-management-panel.tsx web/src/components/admin/campus-location-management-panel.tsx web/src/lib/admin/reference-data-browser-client.ts web/src/lib/admin/reference-data-contract.ts web/src/lib/admin/reference-data-access.ts web/src/lib/admin/category-service.ts web/src/lib/admin/campus-location-service.ts web/src/app/api/admin/categories/route.ts 'web/src/app/api/admin/categories/[categoryId]/route.ts' web/src/app/api/admin/campus-locations/route.ts 'web/src/app/api/admin/campus-locations/[campusLocationId]/route.ts'
git commit -m "docs: explain administrator reference data flow"
```

---

### Task 3: Annotate Flagging and Moderation Flow

**Files:**
- Modify: `web/src/components/admin/admin-moderation-client.tsx`
- Modify: `web/src/components/admin/admin-moderation-flag-queue.tsx`
- Modify: `web/src/components/admin/admin-moderation-report-list.tsx`
- Modify: `web/src/lib/moderation/access.ts`
- Modify: `web/src/lib/moderation/validation.ts`
- Modify: `web/src/lib/moderation/browser-client.ts`
- Modify: `web/src/lib/moderation/flag-service.ts`
- Modify: `web/src/lib/moderation/admin-service.ts`
- Modify: `web/src/app/api/reports/[id]/flags/route.ts`
- Modify: `web/src/app/api/admin/report-flags/route.ts`
- Modify: `web/src/app/api/admin/report-flags/[flagId]/route.ts`
- Modify: `web/src/app/api/admin/reports/route.ts`
- Modify: `web/src/app/api/admin/reports/[reportId]/moderation/route.ts`
- Test: moderation access, validation, browser-client, service, route, and component tests.

**Interfaces:**
- Consumes: active member report flag, administrator session, flag/report timestamps, moderation decision.
- Produces: presentation comments explaining member reporting, protected administrator queues, transactional decisions, audit records, and visibility without recovery-record deletion.

- [ ] **Step 1: Annotate member flag submission**

Explain that any active member may report content, cannot flag their own report, and can have only one pending concern per report. Emphasise that a flag does not automatically hide a report.

- [ ] **Step 2: Annotate administrator queue and direct report list**

Explain the two moderation paths: resolving a member flag and directly hiding or restoring a submitted report. Explain query filters, pagination, stale-response aborts, and accessible confirmation states.

- [ ] **Step 3: Annotate validation and browser calls**

Explain discriminated decision schemas and the timestamp fields required for optimistic concurrency. Explain why malformed or unknown server responses become a fixed generic message.

- [ ] **Step 4: Annotate moderation transactions**

Add comments equivalent to:

```ts
// The flag decision, report visibility change, related pending flags, and audit
// event commit together so the moderation history cannot describe a partial action.
```

```ts
// Hiding changes discovery visibility only; it does not delete the report or
// rewrite Claim and recovery history.
```

Explain the difference between `dismiss` and `hide_report`, server-side administrator revalidation inside the transaction, and timestamp conflict checks.

- [ ] **Step 5: Annotate moderation API routes**

Explain no-store responses, server-derived identity, strict request parsing, and safe error mapping in each representative route without repeating the same long paragraph.

- [ ] **Step 6: Run focused moderation tests**

Run:

```powershell
Set-Location web
npm test -- --run src/lib/moderation/access.test.ts src/lib/moderation/validation.test.ts src/lib/moderation/browser-client.test.ts src/lib/moderation/flag-service.test.ts src/lib/moderation/admin-service.test.ts 'src/app/api/reports/[id]/flags/report-flag-route.test.ts' src/app/api/admin/report-flags/admin-report-flag-routes.test.ts src/app/api/admin/reports/admin-report-list-route.test.ts 'src/app/api/admin/reports/[reportId]/moderation/admin-report-moderation-route.test.ts' src/components/admin/admin-moderation-flag-queue.test.tsx src/components/admin/admin-moderation-report-list.test.tsx
```

Expected: all selected tests pass and behaviour remains unchanged.

- [ ] **Step 7: Commit the moderation annotations**

```powershell
git add -- web/src/components/admin/admin-moderation-client.tsx web/src/components/admin/admin-moderation-flag-queue.tsx web/src/components/admin/admin-moderation-report-list.tsx web/src/lib/moderation/access.ts web/src/lib/moderation/validation.ts web/src/lib/moderation/browser-client.ts web/src/lib/moderation/flag-service.ts web/src/lib/moderation/admin-service.ts 'web/src/app/api/reports/[id]/flags/route.ts' web/src/app/api/admin/report-flags/route.ts 'web/src/app/api/admin/report-flags/[flagId]/route.ts' web/src/app/api/admin/reports/route.ts 'web/src/app/api/admin/reports/[reportId]/moderation/route.ts'
git commit -m "docs: explain report moderation flow"
```

---

### Task 4: Create the Bilingual Demonstration and Code-Trace Guide

**Files:**
- Create: `../管理员功能演示与代码跟踪简要发言稿_中英双语.docx`
- Create: `../doc_build_tmp/build_admin_demo_guide.py`
- Reuse or create: `../doc_build_tmp/admin-demo-flow.png`
- Inspect: `../管理员统计_参考数据与举报审核_组长演示培训手册.docx`
- Inspect: `../管理员功能代码全解析_中英双语_从零学习版.docx`

**Interfaces:**
- Consumes: verified source paths, function names, test names, existing administrator teaching documents, and the annotated code from Tasks 1–3.
- Produces: one six-to-eight-minute bilingual Word guide and one build script for reproducible editing.

- [ ] **Step 1: Read the complete existing administrator guides**

Extract their text and inspect their rendered pages. Reuse accurate explanations and visual conventions, but rewrite the new deliverable as a compact live-presentation guide rather than another full training manual.

- [ ] **Step 2: Create a shared code-flow diagram**

Create a clear diagram containing:

```text
Administrator page -> Browser client -> Next.js API route
                   -> Domain service -> Mongoose model -> MongoDB
                   <- Validated safe response <-
```

Include side labels for session role checks, Zod validation, optimistic timestamps, transactions, and audit events. Use high-contrast colours and readable text at Word-page scale.

- [ ] **Step 3: Build the Word document**

Use `python-docx` and include these sections:

1. Purpose and six-to-eight-minute timing.
2. Before the demonstration checklist.
3. Timed administrator overview demonstration.
4. Timed reference-data demonstration.
5. Timed report-moderation demonstration.
6. Code tracking table with Page, Browser Client, API Route, Service, Model, and Test columns.
7. Chinese explanation followed by the exact natural English lines to speak.
8. Assessor questions covering security, statistics, soft deactivation, 409 conflicts, moderation transactions, privacy, AI boundaries, tests, and team leadership.
9. Recovery script for empty queues, unavailable database, or a failed live request.
10. Group-leader closing statement.

Use the exact project behaviour and avoid claiming external AI APIs, production deployment, email verification, or results not supported by the repository.

- [ ] **Step 4: Render the document**

Use the bundled Python runtime and document renderer:

```powershell
& 'C:\Users\Lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' 'D:\.codex\plugins\cache\openai-primary-runtime\documents\26.904.11930\skills\documents\render_docx.py' '..\管理员功能演示与代码跟踪简要发言稿_中英双语.docx' --output_dir '..\doc_build_tmp\rendered_admin_demo' --emit_pdf
```

Expected: page PNG files and a non-empty PDF are produced.

- [ ] **Step 5: Inspect every rendered page**

Open every page PNG at 100 percent. Correct any clipped tables, widows, overlapping bilingual paragraphs, tiny paths, broken Chinese glyphs, stretched diagram, or excessive whitespace, then re-render.

- [ ] **Step 6: Run document audits**

Run heading and image accessibility checks. Ensure the diagram has meaningful alternative text and all code paths remain searchable text rather than screenshots.

---

### Task 5: Final Source and Deliverable Verification

**Files:**
- Verify: all source files modified in Tasks 1–3.
- Verify: `../管理员功能演示与代码跟踪简要发言稿_中英双语.docx`
- Preserve: `web/public/campus-find-hero.png` existing deletion.

**Interfaces:**
- Consumes: completed comments and rendered Word guide.
- Produces: evidence that runtime behaviour is unchanged and the presentation package is ready.

- [ ] **Step 1: Verify the source diff is comment-only**

Run:

```powershell
git diff --word-diff=porcelain develop -- web/src
git diff --check
```

Inspect every hunk and reject any executable-code, user-copy, schema, or test-expectation change.

- [ ] **Step 2: Run the complete quality gates**

Run:

```powershell
Set-Location web
npm test
npm run lint
npx --no-install tsc --noEmit --incremental false
npm run build
```

Expected: 164 test files and approximately 2,906 tests pass, ESLint passes, TypeScript passes, and the production build completes. If the repository has gained additional valid tests, record the newer passing counts instead of forcing the old count.

- [ ] **Step 3: Confirm secrets and unrelated files are absent**

Run a filename and content scan for real `.env` files, MongoDB URIs, private keys, and session tokens in staged changes and in the final Word package. Report presence without printing secret values.

- [ ] **Step 4: Confirm final outputs**

Confirm the Word document opens, all rendered pages passed visual review, source comments identify each demonstrated boundary, and the working tree still shows the pre-existing hero-image deletion as unstaged and untouched.

- [ ] **Step 5: Commit any final comment-only corrections**

```powershell
git add -- web/src
git commit -m "docs: prepare administrator code walkthrough"
```

Do not stage the deleted hero image or document build intermediates.
