# Administrator Workspace Audit and Duplicate Review Implementation Plan

> **For agentic workers:** Execute tasks in order with checkboxes for tracking. Keep the approved design in `docs/superpowers/specs/2026-10-11-administrator-workspace-audit-design.md` open while working.

**Goal:** Verify all administrator-owned pages and APIs, repair confirmed defects, and make repeated duplicate candidates manageable without changing moderation policy.

**Architecture:** Keep `/admin` and `/api/admin` as the scope boundary. Audit each existing route through its browser client and service before editing. The known duplicate-list repair is local to `AdminModerationClient`: group returned pairs by the report currently sent to the queue, preserve access to every pair, and track queued targets in component state. Existing flag service and database uniqueness remain the authority.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, CSS Modules, Vitest, Testing Library, MongoDB/Mongoose.

## Global Constraints

- Preserve existing business rules, the Campus Find visual language, and stored data schemas.
- No new dependencies, bulk actions, automatic duplicate decisions, or changes to duplicate scores and scan limits.
- Local live checks are read-only; mutations use test doubles unless the user separately authorizes a synthetic record.
- Do not push or deploy in this pass.
- Keep 320 CSS pixel, keyboard, focus, and safe-error behavior usable.

---

## File map

- `web/src/components/admin/admin-overview-client.tsx`, `admin-account-management-client.tsx`, `admin-reference-data-client.tsx`, `category-management-panel.tsx`, `campus-location-management-panel.tsx`: existing admin workspaces to audit; edit only for a demonstrated defect.
- `web/src/components/admin/admin-moderation-client.tsx` and `.module.css`: duplicate candidate presentation and queued-state repair.
- `web/src/components/admin/admin-moderation-client.test.tsx`: regression tests for grouping, identification, queuing, and errors.
- `web/src/components/admin/admin-moderation-flag-queue.tsx`, `admin-moderation-report-list.tsx`, `web/src/app/api/admin/**`: audit and targeted regression only; do not refactor speculatively.
- `docs/superpowers/verification/2026-10-11-administrator-workspace-audit.md`: findings, evidence, and remaining limits.

### Task 1: Audit overview and account administration

**Files:** Read `web/src/components/admin/admin-overview-client.tsx`, `admin-account-management-client.tsx`, their tests, `web/src/app/api/admin/overview/route.ts`, `web/src/app/api/admin/accounts/**`, and their service dependencies. Record findings in the verification document.

- [ ] Trace page loading, refresh, search/filter/pagination, Staff role and account-status confirmation, stale-update conflict, auth expiry, and failure feedback from UI through API/service.
- [ ] Run `npm.cmd test -- src/components/admin/admin-overview-client.test.tsx src/components/admin/admin-account-management-client.test.tsx src/app/api/admin/overview src/app/api/admin/accounts --maxWorkers=2` from `web`. Expected: all selected tests pass; any failing assertion names a product defect, while `EPERM` before test collection is a sandbox environment failure.
- [ ] Inspect `/admin` and `/admin/accounts` at desktop and 320px using the signed-in local browser without submitting mutations. Record clipping, focus, identification, and console findings.
- [ ] Record each reproducible issue with the exact trigger, expected and observed behavior, affected file, and severity. Before editing a newly discovered issue, amend this plan with its failing assertion, minimum repair, and focused check. If no issue is found, record that explicitly; do not alter those modules merely to create a diff.

### Task 2: Audit reference data and moderation operations

**Files:** Read `web/src/components/admin/admin-reference-data-client.tsx`, `category-management-panel.tsx`, `campus-location-management-panel.tsx`, `admin-moderation-flag-queue.tsx`, `admin-moderation-report-list.tsx`, their tests, and corresponding `/api/admin` route/service files.

- [ ] Trace creation/edit/deactivation and stale-record handling in category and location panels; trace flag dismissal, report hide/restore, filters, auth, errors, and pagination in moderation panels. Do not execute live mutation actions.
- [ ] Run `npm.cmd test -- src/components/admin/admin-reference-data-client.test.tsx src/components/admin/category-management-panel.test.tsx src/components/admin/campus-location-management-panel.test.tsx src/components/admin/admin-moderation-flag-queue.test.tsx src/components/admin/admin-moderation-report-list.test.tsx src/app/api/admin/categories src/app/api/admin/campus-locations src/app/api/admin/report-flags src/app/api/admin/reports --maxWorkers=2` from `web` and record the result.
- [ ] Inspect `/admin/reference-data` and `/admin/moderation` at desktop and 320px without submitting mutations. Record each reproducible issue with its trigger, expected and observed behavior, file, and severity. Amend this plan with a precise repair task before editing a newly discovered issue; otherwise record no change.

### Task 3: Make duplicate candidate review usable

**Files:** Modify `web/src/components/admin/admin-moderation-client.tsx`, `web/src/components/admin/admin-moderation.module.css`, `web/src/components/admin/admin-moderation-client.test.tsx`.

- [ ] Add tests with at least three pairs sharing one `rightReport.id`, two identical titles with different report IDs, and one independent target. Assert one primary card per target, accessible disclosure of alternate pairings, visible dates and short IDs, and every pair's reasons/score still reachable.
- [ ] Run `npm.cmd test -- src/components/admin/admin-moderation-client.test.tsx --maxWorkers=1` and confirm the new assertions fail before implementation.
- [ ] Group only the already-returned pairs, keeping the highest-similarity pair first:

```ts
const groups = Array.from(
  pairs.reduce((byTarget, pair) => {
    const group = byTarget.get(pair.rightReport.id) ?? [];
    group.push(pair);
    byTarget.set(pair.rightReport.id, group);
    return byTarget;
  }, new Map<string, BrowserDuplicatePair[]>()),
  ([targetId, candidates]) => ({
    targetId,
    candidates: candidates.sort((a, b) => b.similarity - a.similarity),
  }),
);
```

  Render the best pair as the group summary and put other pairs in a native `<details>` control. Keep report links, reasons, method label, and event date; add `id.slice(-6)` beside each linked title. Reuse existing CSS tokens and 44px control sizing.
- [ ] Track `queuedReportIds` as `Set<string>`. After successful submission, add `pair.rightReport.id`, refresh the existing flag queue, and disable that target's action. In `catch (error)`, treat `error instanceof BrowserModerationError && error.code === "REPORT_FLAG_ALREADY_PENDING"` as a queued state with a clear message; leave other failures retryable. Do not suppress an authentication/permission error as success.
- [ ] On `AUTHENTICATION_REQUIRED` or `ADMINISTRATOR_REQUIRED` from either scan or submit, clear the protected candidate list and refresh the shared auth session. Redirect to `/login` after authentication expiry, matching the other moderation panels. The initial scanner currently shows a generic failure while retaining previous candidates; add a failing regression test before this fix.
- [ ] Add tests for success, a repeat click, a second pairing targeting the same report, rescan after success, `REPORT_FLAG_ALREADY_PENDING`, an unrelated server error, and both access failures. Rerun the focused test and confirm pass.
- [ ] Inspect the duplicate section at desktop and 320px for scanability, visible target identity, keyboard disclosure, and button feedback. Fix any observed clipping in the same CSS module.

### Task 4: Regression and handoff

**Files:** Write `docs/superpowers/verification/2026-10-11-administrator-workspace-audit.md`; update the files from earlier tasks only to fix failing checks.

- [ ] Run administrator-focused tests: `npm.cmd test -- src/components/admin src/app/admin src/app/api/admin --maxWorkers=2` from `web` (baseline: 25 files, 324 tests before changes).
- [ ] Run `npx.cmd tsc --noEmit`, `npm.cmd run lint`, `npm.cmd test -- --maxWorkers=2`, and `npm.cmd run build` from `web`. Record exact pass/fail and distinguish tool-environment failures from app defects.
- [ ] Review `git diff --check` and the changed-file list; ensure no secret, generated artifact, unrelated refactor, or database mutation is included.
- [ ] Write a concise verification document with findings by severity, repairs, test totals, read-only live coverage, untested live mutations, and remaining limitations. Commit completed code, tests, and verification locally; do not push.
