# Live Verification Blockers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the three blockers found during manual verification without expanding the assessed project scope.

**Architecture:** Preserve the existing React components, CSS Modules, protected image API, and owner-only matching workflow. Apply one responsive CSS correction, one binary normalisation boundary in the image read service, and one explicit navigation affordance in owner history.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Mongoose/MongoDB, CSS Modules, Vitest, Testing Library.

## Global Constraints

- Add no dependencies or database schema changes.
- Keep matching request-on-activation; do not auto-run matching.
- Preserve protected image authorisation and privacy behaviour.
- Preserve 44-pixel touch targets and usability at 320 CSS pixels.

---

### Task 1: Responsive administrator header

**Files:**
- Modify: `web/src/components/site-header.module.css`
- Test: `web/src/components/site-header.test.tsx`

**Interfaces:**
- Consumes: existing `SiteHeader` role-based links.
- Produces: wrapped, non-overlapping navigation with unchanged destinations.

- [ ] Add a CSS regression assertion requiring navigation wrapping, a zero minimum width, and unbroken link labels.
- [ ] Run `npm test -- src/components/site-header.test.tsx` and confirm the new assertion fails.
- [ ] Update the CSS flex rules and crowded-width display-name rule.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Protected image BSON compatibility

**Files:**
- Modify: `web/src/lib/reports/image-read-service.ts`
- Test: `web/src/lib/reports/image-read-service.test.ts`

**Interfaces:**
- Consumes: stored image `data` as Node `Buffer` or `mongoose.mongo.Binary`.
- Produces: `ReadReportImageReceipt` with a validated Node `Buffer`.

- [ ] Add a regression test returning `new mongo.Binary(data)` from the mocked lean query.
- [ ] Run `npm test -- src/lib/reports/image-read-service.test.ts` and confirm it fails as not found.
- [ ] Add a small byte-normalisation function and validate the normalised bytes.
- [ ] Re-run the focused test and confirm both valid and malformed cases pass.

### Task 3: Discoverable manual matching action

**Files:**
- Modify: `web/src/components/reports/owner-report-history.tsx`
- Modify: `web/src/components/reports/owner-report-history.module.css`
- Test: `web/src/components/reports/owner-report-history.test.tsx`

**Interfaces:**
- Consumes: `OwnerReport.status` and existing report detail route.
- Produces: a visible link to `/reports/{id}` with status-specific action copy.

- [ ] Add tests for the open-report matching link and non-open detail link.
- [ ] Run `npm test -- src/components/reports/owner-report-history.test.tsx` and confirm they fail.
- [ ] Render and style the explicit action link without calling the matching API.
- [ ] Re-run the focused test and confirm it passes.

### Task 4: Full verification

**Files:**
- Modify: `docs/superpowers/verification/2026-08-29-live-verification-blockers.md`

**Interfaces:**
- Consumes: all three fixes.
- Produces: reproducible automated and manual evidence.

- [ ] Run the three focused test files together.
- [ ] Run `npm test`, `npm run lint`, `npx tsc --noEmit --incremental false`, `npm run build`, and `npm audit`.
- [ ] Run the Impeccable detector over the changed header and owner-history UI targets.
- [ ] Record results and the resumed manual steps: refresh, verify the header, open `View report and find matches`, then click `Find possible matches`.
