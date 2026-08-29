# Possible Match Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify owners of existing open opposite-type reports when a newly created report is a privacy-safe score match and their possible-match preference is enabled.

**Architecture:** Extend the existing in-app notification contract with one report-only kind, then add a focused planner that reuses the deterministic score and returns ordinary notification plans. Invoke planning and delivery inside the existing report-creation transaction so the report, private verification data, and notifications commit or roll back together.

**Tech Stack:** TypeScript, Next.js App Router, Mongoose transactions, Zod, Vitest

## Global Constraints

- Reuse the existing fixed 100-point matching score, threshold 35, candidate limit 500, and result limit 5.
- Use only public fields from the newly submitted report when scoring for another report owner.
- Send at most one notification per recipient for each new report.
- Respect the existing `possibleMatches` preference and active-account checks.
- Add no dependencies, background jobs, external services, pages, persisted Match records, or scoring changes.
- Never expose reporter identity, private verification data, hidden fields, or factor scores in notification output.

---

### Task 1: Add the report-only notification contract

**Files:**
- Modify: `web/src/models/notification.ts`
- Modify: `web/src/lib/notifications/contracts.ts`
- Modify: `web/src/lib/notifications/contracts.test.ts`
- Modify: `web/src/lib/notifications/browser-client.ts`

**Interfaces:**
- Produces: `NotificationKind` includes `"possible_match"`.
- Produces: `NotificationRecord.claimId` is nullable.
- Produces: `toPublicNotification(record)` links `possible_match` to `/reports/:reportId` with controlled copy.

- [ ] **Step 1: Write the failing contract test**

```ts
it("maps a possible match without a claim reference", () => {
  expect(
    toPublicNotification({ ...record("possible_match"), claimId: null }),
  ).toMatchObject({
    kind: "possible_match",
    title: "Possible item match",
    summary: "A new opposite-type report may match one of your open reports.",
    action: { label: "View report", href: `/reports/${reportId}` },
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm test -- src/lib/notifications/contracts.test.ts`

Expected: FAIL because `possible_match` is not a notification kind and `claimId` cannot be null.

- [ ] **Step 3: Implement the minimal contract change**

Add `possible_match` to both server and browser kind lists, add its controlled copy, allow `claimId` to default to `null` in the Mongoose schema, and guard claim-target mapping:

```ts
if (copy.target === "claim" && record.claimId === null) {
  throw new Error("Claim notification is missing a claim ID");
}
```

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `npm test -- src/lib/notifications/contracts.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/models/notification.ts web/src/lib/notifications/contracts.ts web/src/lib/notifications/contracts.test.ts web/src/lib/notifications/browser-client.ts
git commit -m "feat(notifications): add possible match contract"
```

### Task 2: Make delivery preference-aware and idempotent

**Files:**
- Modify: `web/src/lib/notifications/delivery.ts`
- Modify: `web/src/lib/notifications/delivery.test.ts`

**Interfaces:**
- Consumes: `NotificationKind` containing `"possible_match"`.
- Produces: `NotificationPlan` supports a report-only match event with `eventId` and `claimId: null`.
- Produces: `notificationEventKey(plan)` returns `notification:v1:possible_match:<newReportId>:<recipientId>` for match events and preserves all existing claim keys.

- [ ] **Step 1: Write failing delivery tests**

```ts
const matchPlan = createNotificationPlan({
  kind: "possible_match",
  recipientId,
  reportId,
  claimId: null,
  eventId: newReportId,
});

expect(notificationEventKey(matchPlan)).toBe(
  `notification:v1:possible_match:${newReportId}:${recipientId}`,
);
```

Also disable `possibleMatches` in the recipient profile and assert that no bulk write occurs.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm test -- src/lib/notifications/delivery.test.ts`

Expected: FAIL because the plan requires a claim ID and no preference mapping exists.

- [ ] **Step 3: Implement strict plan validation**

Use one internal plan shape:

```ts
export type NotificationPlan = {
  kind: NotificationKind;
  recipientId: string;
  reportId: string;
  claimId: string | null;
  eventId: string | null;
};
```

For `possible_match`, require a canonical `eventId` and force `claimId` to `null`. For every other kind, require a canonical `claimId` and force `eventId` to `null`. Map `possible_match` to `possibleMatches`, and persist the nullable `claimId` unchanged.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `npm test -- src/lib/notifications/delivery.test.ts`

Expected: PASS, including all existing claim notification tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/notifications/delivery.ts web/src/lib/notifications/delivery.test.ts
git commit -m "feat(notifications): deliver possible match events"
```

### Task 3: Plan privacy-safe match notifications

**Files:**
- Create: `web/src/lib/reports/match-notifications.ts`
- Create: `web/src/lib/reports/match-notifications.test.ts`
- Modify: `web/src/lib/reports/matching-service.ts`

**Interfaces:**
- Consumes: `scoreReportMatch(source, candidate)` and `toMemberReport(document, viewerId)`.
- Produces: exported matching policy constants `MATCH_CANDIDATE_LIMIT`, `MATCH_RESULT_LIMIT`, and `MATCH_MINIMUM_SCORE`.
- Produces: `planPossibleMatchNotifications(report, session): Promise<NotificationPlan[]>`.

- [ ] **Step 1: Write a failing planner test**

Mock the report query, public-report mapper, and score function. Assert that the planner queries only open, visible, opposite-type reports owned by other users, uses the supplied session, filters below 35, sorts deterministically, limits results to five, deduplicates recipients, and returns:

```ts
{
  kind: "possible_match",
  recipientId: existingOwnerId,
  reportId: existingReportId,
  claimId: null,
  eventId: newReportId,
}
```

Assert that `toMemberReport(newReport, existingOwnerId)` supplies the new report's privacy-redacted candidate fields to `scoreReportMatch`.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm test -- src/lib/reports/match-notifications.test.ts`

Expected: FAIL because the planner does not exist.

- [ ] **Step 3: Implement the planner**

Query the bounded candidates with the same matching projection. Convert each existing report to an owner-side `ScoringReport`, convert the new report through `toMemberReport(newReport, recipientId)`, score, filter, sort, slice, deduplicate recipient IDs, and create one validated plan per retained recipient.

- [ ] **Step 4: Run matching tests and confirm they pass**

Run: `npm test -- src/lib/reports/match-notifications.test.ts src/lib/reports/matching-service.test.ts src/lib/reports/matching-score.test.ts`

Expected: PASS with unchanged score behaviour.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/reports/match-notifications.ts web/src/lib/reports/match-notifications.test.ts web/src/lib/reports/matching-service.ts
git commit -m "feat(matches): plan owner match notifications"
```

### Task 4: Integrate delivery with report creation

**Files:**
- Modify: `web/src/lib/reports/service.ts`
- Modify: `web/src/lib/reports/service.test.ts`

**Interfaces:**
- Consumes: `planPossibleMatchNotifications(report, session)` and `deliverNotifications(plans, session)`.
- Produces: report creation atomically stores the public report, private verification data, and eligible possible-match notifications.

- [ ] **Step 1: Write the failing integration tests**

Mock the planner and delivery functions. Assert both receive the same created report and transaction session, delivery occurs after the private record insert, and delivery failures are preserved so the transaction can roll back.

```ts
expect(planPossibleMatchNotifications).toHaveBeenCalledWith(
  reportDocument,
  transaction,
);
expect(deliverNotifications).toHaveBeenCalledWith(plans, transaction);
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm test -- src/lib/reports/service.test.ts`

Expected: FAIL because report creation does not invoke the planner or delivery.

- [ ] **Step 3: Add the minimal transaction integration**

Inside the current `withTransaction` callback and after both report records exist:

```ts
const plans = await planPossibleMatchNotifications(report, transaction);
await deliverNotifications(plans, transaction);
```

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `npm test -- src/lib/reports/service.test.ts`

Expected: PASS, including rollback and authorization cases.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/reports/service.ts web/src/lib/reports/service.test.ts
git commit -m "feat(reports): notify owners about possible matches"
```

### Task 5: Verify the completed course workflow

**Files:**
- Create: `docs/superpowers/verification/2026-08-29-possible-match-notifications.md`

**Interfaces:**
- Produces: durable evidence that the final course requirement and the complete application quality gates pass.

- [ ] **Step 1: Run the notification and report suites**

Run: `npm test -- src/lib/notifications src/lib/reports`

Expected: PASS.

- [ ] **Step 2: Run the complete automated suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 3: Run static and production gates**

Run separately:

```bash
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm audit
```

Expected: each command exits 0 and `npm audit` reports 0 vulnerabilities.

- [ ] **Step 4: Record exact results and course-scope coverage**

Write the command results, test totals, privacy checks, and role-flow coverage in the verification document. Do not claim a manual check that was not performed.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/verification/2026-08-29-possible-match-notifications.md
git commit -m "docs: verify possible match notifications"
```
