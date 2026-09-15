# Report Preview, Notification Read, and Navigation Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore selected-image previews and notification read updates, then make every existing application return link predictable and visually consistent.

**Architecture:** Keep the two runtime fixes inside their current owners: the image picker owns object-URL lifetime and the notification service owns the atomic database update. Add one small presentational `PageBackLink` component and migrate existing page-return links to it while preserving each consumer's authored parent route.

**Tech Stack:** Next.js App Router, React 19, TypeScript, CSS Modules, Mongoose 9, Vitest, Testing Library

## Global Constraints

- Add no dependency, database field, API route, role, upload provider, browser-history abstraction, animation system, or global breadcrumb framework.
- Preserve existing report-image validation and upload behaviour, notification privacy rules, route permissions, and Campus Find visual language.
- Return navigation must use deterministic Next.js links and must not call `history.back()` or `router.back()`.
- Maintain 44-pixel minimum pointer targets, keyboard focus visibility, responsive wrapping, and existing privacy-safe error handling.

---

### Task 1: Strict Mode-safe report image preview

**Files:**
- Modify: `web/src/components/reports/report-image-picker.tsx`
- Test: `web/src/components/reports/report-image-picker.test.tsx`

**Interfaces:**
- Consumes: `PendingReportImage.file: File`
- Produces: a preview whose current `src` belongs to the active effect setup and whose URL is revoked on replacement or unmount

- [ ] **Step 1: Write the failing Strict Mode regression test**

Wrap the picker in `StrictMode`, make `URL.createObjectURL` return sequential URLs, and assert that the rendered image uses the latest URL rather than the URL revoked during Strict Mode's first cleanup.

- [ ] **Step 2: Run the focused test and verify the stale URL failure**

Run: `npm test -- report-image-picker.test.tsx`

Expected: FAIL because the rendered `src` still uses the first, revoked object URL.

- [ ] **Step 3: Move object-URL creation into its owning effect**

Use nullable preview state. In an effect keyed by `image.file`, create a URL, store it, and return a cleanup that revokes that exact URL. Render the image only while a live preview URL exists.

- [ ] **Step 4: Run the image picker tests**

Run: `npm test -- report-image-picker.test.tsx`

Expected: PASS for selection, validation, removal, Strict Mode setup, and cleanup.

### Task 2: Restore notification mark-as-read on Mongoose 9

**Files:**
- Modify: `web/src/lib/notifications/service.ts`
- Test: `web/src/lib/notifications/service.test.ts`

**Interfaces:**
- Consumes: `markNotificationRead(user, notificationId)` and the existing atomic aggregation update
- Produces: the existing `PublicNotification` after an owned record is updated

- [ ] **Step 1: Tighten the failing service expectation**

Assert that `NotificationModel.findOneAndUpdate` receives `{ returnDocument: "after", updatePipeline: true }` while retaining the combined notification and recipient filter and the `$ifNull` pipeline.

- [ ] **Step 2: Run the focused notification service tests**

Run: `npm test -- service.test.ts --runInBand`

Expected: FAIL because the service currently passes deprecated `{ new: true }` and does not enable update pipelines.

- [ ] **Step 3: Apply the minimal Mongoose 9 options fix**

Replace `{ new: true }` only at the notification pipeline call with `{ returnDocument: "after", updatePipeline: true }`. Do not refactor unrelated model updates.

- [ ] **Step 4: Run the notification service and route tests**

Run: `npm test -- src/lib/notifications/service.test.ts src/app/api/notifications/[id]/read/route.test.ts`

Expected: PASS for owned unread, already-read, foreign, missing, forbidden, and database-error cases.

### Task 3: Add the shared page return control

**Files:**
- Create: `web/src/components/page-back-link.tsx`
- Create: `web/src/components/page-back-link.module.css`
- Create: `web/src/components/page-back-link.test.tsx`

**Interfaces:**
- Produces: `PageBackLink({ href, children, className? })`, a deterministic Next.js link with a decorative left arrow and shared accessible styling

- [ ] **Step 1: Write the component tests**

Test the accessible label, exact `href`, hidden decorative arrow, optional class composition, and shared styling hook.

- [ ] **Step 2: Run the component test and verify it fails before creation**

Run: `npm test -- page-back-link.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the minimal shared component and CSS Module**

Render a Next.js `Link` with a CSS-drawn or inline decorative arrow, a 44-pixel minimum target, logical spacing, inherited Campus Find green, visible focus outline, and wrapping-safe label text.

- [ ] **Step 4: Run the component test**

Run: `npm test -- page-back-link.test.tsx`

Expected: PASS.

### Task 4: Migrate existing page-return links without changing routes

**Files:**
- Modify: `web/src/components/admin/admin-account-management-client.tsx`
- Modify: `web/src/components/admin/admin-moderation-client.tsx`
- Modify: `web/src/components/admin/admin-overview-client.tsx`
- Modify: `web/src/components/admin/administrator-access-boundary.tsx`
- Modify: `web/src/components/claims/claim-detail-client.tsx`
- Modify: `web/src/components/claims/claim-list-client.tsx`
- Modify: `web/src/components/claims/claim-submission-client.tsx`
- Modify: `web/src/components/claims/claimant-access-boundary.tsx`
- Modify: `web/src/components/claims/staff-claim-detail-client.tsx`
- Modify: `web/src/components/claims/staff-claim-list-client.tsx`
- Modify: `web/src/components/notifications/notification-access-boundary.tsx`
- Modify: `web/src/components/notifications/notification-centre.tsx`
- Modify: `web/src/components/reports/report-browser.tsx`
- Modify: `web/src/components/reports/report-detail-client.tsx`
- Modify: `web/src/components/reports/report-submission-client.tsx`
- Modify: `web/src/components/reports/report-success.tsx`
- Modify: `web/src/components/staff-reports/staff-report-detail-client.tsx`
- Modify: `web/src/components/staff-reports/staff-report-list-client.tsx`
- Modify: `web/src/components/staff/staff-access-boundary.tsx`
- Test: existing colocated component test files plus `web/src/components/page-back-link.test.tsx`

**Interfaces:**
- Consumes: `PageBackLink` and every consumer's existing `href`/label pair
- Produces: one visually consistent, top-of-content return control per existing application return path

- [ ] **Step 1: Add representative placement expectations**

In report detail, claim detail, notification centre, staff detail, and administrator tests, assert that the return link preserves its exact destination and appears before the page heading or primary content region.

- [ ] **Step 2: Run representative tests and verify the new shared marker is absent**

Run: `npm test -- report-detail-client.test.tsx claim-detail-client.test.tsx notification-centre.test.tsx staff-claim-detail-client.test.tsx admin-moderation-client.test.tsx`

Expected: FAIL on the new shared return-control or placement assertions.

- [ ] **Step 3: Replace existing page-return `Link` elements**

Use `PageBackLink` for every existing `Back to ...` control, place it before the page heading/content panel, retain contextual notification destinations, and leave non-return actions such as `View report`, pagination, retry, cancel, and completion actions unchanged.

- [ ] **Step 4: Remove only obsolete local back-link declarations**

Delete CSS selectors that are no longer referenced after migration. Do not restructure unrelated page styling.

- [ ] **Step 5: Run all affected component tests**

Run: `npm test -- src/components`

Expected: PASS with unchanged route destinations and accessible labels.

### Task 5: Verify the complete repair

**Files:**
- Modify if needed: only files changed by Tasks 1-4
- Create: `docs/superpowers/verification/2026-08-29-report-preview-notification-navigation.md`

**Interfaces:**
- Produces: evidence that the three reported defects are fixed without breaking course-scope functionality

- [ ] **Step 1: Run the focused regression suite**

Run the image-picker, notification service/route, shared return-control, and representative page tests. Expected: PASS.

- [ ] **Step 2: Run project quality gates**

Run from `web`: `npm test`, `npm run lint`, `npx tsc --noEmit --incremental false`, `npm run build`, and `npm audit`.

Expected: tests, lint, type-check, and build pass; audit reports zero known vulnerabilities or any network limitation is recorded accurately.

- [ ] **Step 3: Run the interface detector once**

Run the Impeccable detector against the changed UI source set and fix only findings caused by this change.

- [ ] **Step 4: Perform one bounded browser verification pass**

Verify desktop and narrow viewport together: selected image previews render before submission, marking a notification read removes its unread state and updates the count, and return controls sit at the page-content top-left and navigate to the correct authored parent routes.

- [ ] **Step 5: Record verification evidence**

Document commands, results, any environment limitations, and the exact manual flow in the verification record.
