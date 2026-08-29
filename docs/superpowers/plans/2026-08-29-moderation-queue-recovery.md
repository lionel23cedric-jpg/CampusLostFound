# Moderation Queue Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the administrator flag queue, present duplicate pending concerns as an accurate completed state, and add deterministic return navigation to the moderation workspace.

**Architecture:** Keep the existing report-flag endpoint, MongoDB aggregation, strict Zod contracts, and Next.js client components. Repair the private aggregate projection at its source, map the existing conflict code to a terminal UI state, and add one direct `/admin` link using the established administrator navigation pattern.

**Tech Stack:** TypeScript, Next.js 16 App Router, React 19, Mongoose 9, Zod 4, CSS Modules, Vitest, Testing Library.

## Global Constraints

- Add no dependency, database field, API route, role, global breadcrumb system, or browser-history abstraction.
- Preserve report-flag uniqueness, administrator-only access, moderation decisions, privacy-safe responses, and existing styling.
- Lost and found reports use identical concern behaviour; report owners remain unable to report their own listing.
- Keep `reportId` private to server-side aggregate validation and do not add it to the browser response.

---

### Task 1: Repair the administrator flag aggregate contract

**Files:**
- Modify: `web/src/lib/moderation/admin-service.ts:155-167`
- Test: `web/src/lib/moderation/admin-service.test.ts:340-422`

**Interfaces:**
- Consumes: `parseAdminReportFlagPage(input: unknown, page: number): AdminReportFlagPage` and the existing `AdminReportFlagRecord` requirement for `reportId`.
- Produces: `buildAdminReportFlagPipeline()` rows containing private `reportId` for strict server validation; the public `AdminReportFlagPage` shape remains unchanged.

- [ ] **Step 1: Tighten the pipeline regression test**

Update the expected final flag projection in `admin-service.test.ts` to include the missing private identifier:

```ts
expect(
  ((pipeline[3] as { $facet: { flags: unknown[] } }).$facet.flags[3] as {
    $project: Record<string, unknown>;
  }).$project,
).toEqual({
  _id: 1,
  reportId: 1,
  reason: 1,
  details: 1,
  status: 1,
  reviewedAt: 1,
  resolutionNote: 1,
  createdAt: 1,
  updatedAt: 1,
  report: 1,
});
```

- [ ] **Step 2: Run the focused test and verify the regression fails**

Run from `web`:

```powershell
npm test -- src/lib/moderation/admin-service.test.ts
```

Expected: FAIL because the real final projection does not contain `reportId`.

- [ ] **Step 3: Apply the minimal aggregate fix**

Add the identifier to the existing private projection in `admin-service.ts`:

```ts
$project: {
  _id: 1,
  reportId: 1,
  reason: 1,
  details: 1,
  status: 1,
  reviewedAt: 1,
  resolutionNote: 1,
  createdAt: 1,
  updatedAt: 1,
  report: 1,
},
```

- [ ] **Step 4: Run the focused service test and verify it passes**

Run:

```powershell
npm test -- src/lib/moderation/admin-service.test.ts
```

Expected: all administrator moderation service tests PASS.

- [ ] **Step 5: Commit the aggregate repair**

```powershell
git add web/src/lib/moderation/admin-service.ts web/src/lib/moderation/admin-service.test.ts
git commit -m "fix(moderation): restore administrator flag queue"
```

### Task 2: Present an existing pending concern as a terminal status

**Files:**
- Modify: `web/src/components/reports/report-flag-panel.tsx:28-133`
- Test: `web/src/components/reports/report-flag-panel.test.tsx:151-170`

**Interfaces:**
- Consumes: the existing `REPORT_FLAG_ALREADY_PENDING` error code from `submitBrowserReportFlag()`.
- Produces: an `alreadyPending` component phase that renders a non-error status and no active submission form.

- [ ] **Step 1: Replace the duplicate retry expectation with a terminal-state test**

Change the duplicate test so it expects accurate status copy and verifies the form is gone:

```tsx
it("presents an existing pending concern without another submit form", async () => {
  vi.mocked(submitBrowserReportFlag).mockRejectedValue(
    new BrowserModerationError("REPORT_FLAG_ALREADY_PENDING", 409),
  );
  const user = userEvent.setup();
  render(<ReportFlagPanel reportId={reportId} />);

  await user.click(screen.getByRole("button", { name: "Report this listing" }));
  await user.selectOptions(screen.getByLabelText("Reason"), "duplicate_report");
  await user.click(screen.getByRole("button", { name: "Submit report" }));

  expect((await screen.findByRole("status")).textContent).toContain(
    "already awaiting administrator review",
  );
  expect(screen.queryByRole("button", { name: "Submit report" })).toBeNull();
  expect(submitBrowserReportFlag).toHaveBeenCalledOnce();
});
```

Keep the retryable server-failure assertion as its own test so ordinary failures still return to the editable form.

- [ ] **Step 2: Run the focused component test and verify it fails**

Run:

```powershell
npm test -- src/components/reports/report-flag-panel.test.tsx
```

Expected: FAIL because duplicate conflicts currently remain in `editing` and keep the submit form visible.

- [ ] **Step 3: Add the minimal terminal phase**

Extend the phase union with `alreadyPending`. Set that phase for the duplicate code:

```ts
if (code === "REPORT_FLAG_ALREADY_PENDING") {
  setPhase("alreadyPending");
  return;
}
```

Render accurate copy before the closed/editing branches:

```tsx
if (phase === "alreadyPending") {
  return (
    <section className={styles.success} aria-labelledby="report-flag-pending">
      <h2 id="report-flag-pending">Concern already submitted</h2>
      <p role="status" aria-live="polite">
        A concern for this report is already awaiting administrator review.
      </p>
    </section>
  );
}
```

- [ ] **Step 4: Run the focused component test and verify it passes**

Run:

```powershell
npm test -- src/components/reports/report-flag-panel.test.tsx
```

Expected: all report flag panel tests PASS, including the separate retryable-failure coverage.

- [ ] **Step 5: Commit the duplicate-state repair**

```powershell
git add web/src/components/reports/report-flag-panel.tsx web/src/components/reports/report-flag-panel.test.tsx
git commit -m "fix(report-flags): clarify pending concern state"
```

### Task 3: Add deterministic moderation return navigation

**Files:**
- Modify: `web/src/components/admin/admin-moderation-client.tsx:1-17`
- Modify: `web/src/components/admin/admin-moderation.module.css:11-25`
- Test: `web/src/components/admin/admin-moderation-client.test.tsx:15-23`

**Interfaces:**
- Consumes: the stable administrator overview route `/admin` and Next.js `Link`.
- Produces: one accessible `Back to administrator overview` link in the moderation page header.

- [ ] **Step 1: Add the navigation expectation**

Extend `admin-moderation-client.test.tsx`:

```ts
expect(
  screen
    .getByRole("link", { name: "Back to administrator overview" })
    .getAttribute("href"),
).toBe("/admin");
```

- [ ] **Step 2: Run the focused component test and verify it fails**

Run:

```powershell
npm test -- src/components/admin/admin-moderation-client.test.tsx
```

Expected: FAIL because the moderation workspace has no parent link.

- [ ] **Step 3: Add the direct application link**

Import `Link` and place it first inside the page header:

```tsx
<Link className={styles.backLink} href="/admin">
  Back to administrator overview
</Link>
```

Use the established accessible administrator link treatment:

```css
.backLink {
  display: inline-flex;
  width: fit-content;
  min-height: 44px;
  align-items: center;
  margin-block-end: 0.75rem;
  color: var(--campus-green-dark);
  font-weight: 750;
}

.backLink:focus-visible {
  outline: 3px solid var(--campus-green-dark);
  outline-offset: 3px;
}
```

- [ ] **Step 4: Run the focused navigation test and verify it passes**

Run:

```powershell
npm test -- src/components/admin/admin-moderation-client.test.tsx
```

Expected: the administrator moderation composition test PASS.

- [ ] **Step 5: Commit the navigation repair**

```powershell
git add web/src/components/admin/admin-moderation-client.tsx web/src/components/admin/admin-moderation.module.css web/src/components/admin/admin-moderation-client.test.tsx
git commit -m "fix(admin-ui): add moderation return navigation"
```

### Task 4: Verify the complete repair

**Files:**
- Create: `docs/superpowers/verification/2026-08-29-moderation-queue-recovery.md`
- Verify: all files modified in Tasks 1-3

**Interfaces:**
- Consumes: the three independently committed repairs.
- Produces: a reproducible verification record with command results and a clean release candidate.

- [ ] **Step 1: Run all three focused suites together**

```powershell
npm test -- src/lib/moderation/admin-service.test.ts src/components/reports/report-flag-panel.test.tsx src/components/admin/admin-moderation-client.test.tsx
```

Expected: all focused tests PASS.

- [ ] **Step 2: Run the full automated gate**

```powershell
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm audit
```

Expected: all tests, lint, TypeScript, and build PASS; audit reports zero vulnerabilities.

- [ ] **Step 3: Run the UI design detector**

Run the Impeccable detector against the changed report flag and administrator moderation UI files after loading the required design references.

Expected: no design anti-pattern findings, or all findings are corrected and the detector is rerun cleanly.

- [ ] **Step 4: Record verification evidence**

Create `docs/superpowers/verification/2026-08-29-moderation-queue-recovery.md` containing the branch, commit range, exact commands, pass counts, build result, audit result, design-detector result, and the manual checks still required:

```markdown
# Moderation Queue Recovery Verification

## Automated verification

- Focused tests: PASS
- Full tests: PASS
- ESLint: PASS
- TypeScript: PASS
- Production build: PASS
- npm audit: 0 vulnerabilities
- UI design detector: PASS

## Manual verification

1. Open `/admin/moderation` as an active administrator and confirm both pending concerns appear.
2. Follow `Back to administrator overview` and confirm it opens `/admin`.
3. Reopen a previously flagged lost or found report as the reporting member and confirm the page displays the already-awaiting status without a submit form.
```

- [ ] **Step 5: Review scope and commit verification**

Run:

```powershell
git diff origin/develop...HEAD --check
git status --short
git diff --stat origin/develop...HEAD
```

Confirm there are no dependency, schema, route, role, or unrelated changes, then commit:

```powershell
git add docs/superpowers/verification/2026-08-29-moderation-queue-recovery.md
git commit -m "docs: verify moderation queue recovery"
```
