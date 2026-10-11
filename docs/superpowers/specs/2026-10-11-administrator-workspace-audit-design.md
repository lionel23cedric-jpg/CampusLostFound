# Administrator Workspace Audit and Targeted Repair Design

## Goal and boundaries

Check every administrator-owned workspace and its supporting API for reproducible functional, permission, feedback, responsive, and accessibility defects, then repair the defects found. The scope is `/admin`, `/admin/accounts`, `/admin/reference-data`, `/admin/moderation`, and their `/api/admin` routes. Staff-only workspaces and unrelated student flows are outside this pass unless an administrator route directly depends on them. Preserve existing business rules, the Campus Find visual language, and stored data schemas. Do not push or deploy as part of this pass.

## Evidence and audit sequence

The current administrator-focused baseline passes 25 test files and 324 tests. This establishes regression coverage, not proof that every interaction is usable. Audit the four workspaces in this order: overview and navigation; accounts and Staff access; categories and campus locations; report flags, visibility, and duplicate candidates. For each, trace the browser action through its client, route, and service; check authorized, unauthorized, empty, loading, validation, conflict, failure, and success states. Inspect desktop and narrow-screen layouts and keyboard/focus behavior. Only change behavior where a defect can be reproduced or a clear workflow problem is documented.

Live checks against the current local environment are read-only. Mutating flows are verified with isolated automated tests or test doubles; no existing account, report, category, location, or flag is changed merely for acceptance testing. If a live mutation is needed to resolve an uncertainty, request separate authorization and use a clearly identified synthetic record.

## Duplicate-candidate repair

The scan currently returns up to 20 report pairs. When many near-identical reports exist, one report appears in several pairs and the full cards create a long, repetitive page. The scan remains advisory and must never hide or change a report automatically.

Group the displayed pairs by the `rightReport.id` that the existing queue action targets. Show that report once with its best-scoring counterpart and the number of other pairings; disclose the remaining pairings on demand using an accessible native control. Each report link must expose enough identifying information (at least its event date and a short report ID) to distinguish identical titles. Keep the underlying pair scores, reasons, links, and AI/fallback label available in the expanded view. Do not change duplicate scoring, scan limits, or moderation policy as a visual fix.

Submitting a candidate to the existing moderation queue creates one pending flag for the target report. On success, mark every displayed pairing for that target as queued and disable repeat submission. If the server reports an already-pending flag, show that state clearly instead of a generic failure. Other failures stay retryable. The flag queue refreshes after successful submission. A rescan may update the candidate list without undoing a queued state established during the current page session.

## Other administrator repairs

Overview, account/Staff, reference-data, flag-queue, and visibility changes are limited to issues found during the audit. Prefer existing components, validation rules, and service boundaries. Do not add new administrator powers, bulk actions, account deletion, automatic duplicate decisions, new dependencies, or visual redesign. Where behavior changes, add the smallest regression test that would have failed before the fix.

## Verification and completion

- Re-run the administrator-focused tests, then TypeScript, lint, the full test suite, and production build when relevant changes are complete.
- Check the four routes at desktop and mobile widths for clipping, scanability, focus order, feedback, and console errors; do not treat screenshots alone as functional proof.
- Verify access control and privacy on affected routes with automated tests. Distinguish test-environment failures from application failures.
- Report findings by severity, the specific repairs made, anything tested only with mocks, and any remaining limitation. Leave GitHub and production unchanged unless separately authorized.
