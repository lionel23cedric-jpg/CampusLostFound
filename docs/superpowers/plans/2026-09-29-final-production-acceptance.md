# Final Production Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify every requested role and AI workflow on the deployed application, repair only confirmed failures, record reproducible evidence, and create a source-only submission archive.

**Architecture:** Treat the Vercel production deployment as the acceptance target and exercise it through the browser using existing role accounts. Keep deterministic fallbacks, but require the five AI-facing workflows to expose their declared method so model failures are visible. Record results in repository documentation and package only tracked source and documentation files.

**Tech Stack:** Next.js 16, React 19, TypeScript, MongoDB/Mongoose, Vitest, Hugging Face tokenizers, ONNX Runtime WebAssembly, Vercel, GitHub.

## Global Constraints

- Work only in `D:/Massey/CampusLostFound-project-quality-polish`.
- Do not expose `.env.local`, credentials, ownership evidence, private report fields, or database connection strings.
- Do not change working production behavior unless a reproducible acceptance failure requires it.
- Preserve deterministic fallback behavior when an AI runtime is unavailable.
- Verify fixes with focused tests, TypeScript, lint, production build, deployment status, and the affected production workflow.

---

### Task 1: Verify the five AI workflows

**Files:**
- Inspect: `web/src/lib/reports/local-embedding.ts`
- Inspect: `web/src/lib/ai/report-assistant.ts`
- Inspect: `web/src/lib/ai/image-classifier.ts`
- Inspect: `web/src/lib/ai/duplicate-detection.ts`
- Record: `docs/FINAL_ACCEPTANCE_REPORT.md`

**Interfaces:**
- Consumes: production routes `/api/reports`, `/api/reports/[id]/matches`, `/api/ai/report-assistant`, `/api/ai/image-category`, `/api/admin/ai/duplicates`.
- Produces: pass/fail evidence for Smart Search, report matching, description/tag assistance, image category assistance, and duplicate detection.

- [ ] Open production Smart Search with a known backpack query and confirm `AI-assisted search`.
- [ ] Open the owned backpack report, run `Find possible matches`, and confirm `AI-assisted text comparison`.
- [ ] Open the report form, request a description/tag suggestion, and confirm `AI-assisted suggestion`.
- [ ] Upload a representative item image, request category analysis, and confirm `AI-assisted category suggestions` or capture the exact fallback failure.
- [ ] Sign in as an administrator, run `Scan for possible duplicates`, and confirm AI-assisted results or a valid empty-state response without runtime errors.

### Task 2: Verify role-specific workflows

**Files:**
- Inspect: `web/src/app/dashboard/page.tsx`
- Inspect: `web/src/components/admin/admin-overview-client.tsx`
- Inspect: `web/src/components/admin/admin-account-management-client.tsx`
- Inspect: `web/src/components/staff`
- Record: `docs/FINAL_ACCEPTANCE_REPORT.md`

**Interfaces:**
- Consumes: existing Student, Staff, and Administrator accounts.
- Produces: role-by-role navigation, authorization, and workflow evidence.

- [ ] Student: confirm dashboard, create-report form, report history, claims, and notifications load.
- [ ] Staff: confirm staff-specific dashboard, report queue, claim review, storage, and completion controls load with no administrator-only actions.
- [ ] Administrator: confirm the distinct administrator landing page contains overview, account management, reference data, moderation, and charts without student workflow cards.
- [ ] Confirm an administrator can change a member between Student and Staff through the account-management interface.
- [ ] Confirm protected routes reject the wrong role without exposing private data.

### Task 3: Repair confirmed acceptance failures

**Files:**
- Modify only the smallest implementation and matching test files named by the reproduced failure.
- Update: `docs/FINAL_ACCEPTANCE_REPORT.md`

**Interfaces:**
- Consumes: exact production error, browser request, and runtime log from Tasks 1–2.
- Produces: one focused fix per failure with a regression test.

- [ ] Add or adjust the focused test so the reproduced failure is covered.
- [ ] Run the focused test and confirm it fails for the same reason.
- [ ] Implement the minimum fix without changing unrelated UI or contracts.
- [ ] Run `npx tsc --noEmit`, `npm run lint`, `npm test`, and `npm run build` in `web`.
- [ ] Commit, push to `develop` and `main`, wait for Vercel `Ready`, and repeat the affected production flow.

### Task 4: Final documentation and source archive

**Files:**
- Create: `docs/FINAL_ACCEPTANCE_REPORT.md`
- Create: `docs/FINAL_DEMO_CHECKLIST.md`
- Create: `CampusLostFound-final-source.zip` outside the repository working tree.

**Interfaces:**
- Consumes: verified results and the final Git commit.
- Produces: a concise acceptance report, a step-by-step demonstration checklist, and a safe source-only archive.

- [ ] Record production URL, deployed commit, test results, AI model/runtime, and pass/fail status for every workflow.
- [ ] Write the exact demonstration order, expected screen text, and source-code location for each major button.
- [ ] Confirm `git status --short` is clean and `github/develop` equals `github/main`.
- [ ] Build the ZIP from tracked source files while excluding `.env*`, `.git`, `.next`, `node_modules`, caches, logs, and credentials.
- [ ] List the ZIP contents and scan filenames to confirm that no excluded material is present.
