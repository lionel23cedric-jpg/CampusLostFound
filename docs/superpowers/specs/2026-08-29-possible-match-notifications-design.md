# Possible Match Notifications Design

## Purpose

Complete the course brief's notification requirement by turning the existing
`possibleMatches` profile preference into a real, privacy-safe notification
flow. The feature must reuse the existing deterministic matching algorithm and
must not add background workers, external AI services, dependencies, or a new
page.

## Scope

When a student creates an open Lost or Found report, the application checks the
new report against existing open reports of the opposite type. Owners of the
five highest-scoring eligible reports may receive one in-app notification each
when the score is at least 35.

The newly submitting student is not notified during their own submission. They
already receive the report result and can use the existing **Find possible
matches** action. They can receive notifications later when another student
creates a matching opposite-type report.

## Matching and privacy rules

- Reuse the current fixed 100-point explainable score and the existing score
  threshold of 35.
- Consider at most the 500 newest open, visible, opposite-type reports, matching
  the existing matching endpoint's bounded candidate search.
- Exclude reports owned by the submitting student.
- Rank by score, then creation time, then report ID, and consider only the first
  five results.
- Calculate each notification from the recipient's perspective: their own
  report fields may be used, but only public fields from the newly submitted
  report may contribute to the score.
- If more than one top result belongs to the same recipient, send that recipient
  one notification linked to their highest-ranked report.
- The public notification contains controlled copy and a link to the
  recipient's own report. It contains no other reporter identity, private
  verification details, hidden fields, or raw score factors.

## Notification contract

Add the `possible_match` notification kind and map it to the existing
`possibleMatches` preference. Match notifications are report events, so their
stored `claimId` is `null`. Claim-related notification kinds continue to
require a claim ID.

An event key uses the new report ID and recipient ID so retries are idempotent
and one new report cannot notify the same recipient twice. A later new report
may create a new notification for that recipient.

Public copy:

- Title: `Possible item match`
- Summary: `A new opposite-type report may match one of your open reports.`
- Action: `View report`, linked to the recipient's own report detail page

## Transaction and error handling

Candidate lookup, preference checks, and notification upserts run inside the
existing report-creation transaction. If notification planning or persistence
fails, the report and its private verification record roll back together. A
missing, inactive, suspended, or opted-out recipient is skipped without
failing the report creation.

## Testing

Tests will verify:

- the new public kind, controlled copy, report action, and nullable claim ID;
- strict notification-plan validation and deterministic event keys;
- preference, active-account, idempotency, and write-failure behaviour;
- candidate eligibility, threshold, ordering, privacy-safe scoring, top-five
  limit, recipient deduplication, and transaction use;
- report creation invokes match-notification delivery in the same transaction;
- the full test, lint, TypeScript, production build, and audit gates still pass.

## Explicitly out of scope

- Scheduled or recurring scans
- Email, push, SMS, or external messaging
- New matching algorithms or scoring changes
- Notification score/factor disclosure
- New pages, dependencies, database migrations, or persisted Match records
