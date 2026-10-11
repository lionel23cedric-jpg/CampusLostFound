# Administrator Workspace Audit and Targeted Repair

## Scope and outcome

Audited the administrator overview, account and Staff management, reference-data management, report flags and visibility, and AI-assisted duplicate review against their browser components, protected routes, services, and existing tests. The one confirmed functional defect outside presentation was in duplicate review: a scan or queue action that discovered expired authentication or revoked administrator access retained old candidate data and showed a generic failure. Other moderation panels already cleared protected content on the same errors. The duplicate list also repeated the same target report across many full-size pair cards and left its send action available after success.

No unrelated administrator behavior was changed. The overview, account/Staff, category/location, flag-queue, and direct-visibility paths retained their existing authorization, optimistic-concurrency, validation, and safe-error handling. Their dedicated tests passed; this is not a claim that untested live mutations were exercised.

## Findings by severity

- **P1 — protected candidate data remained visible after access loss:** duplicate scan and queue submission handled authorization errors as ordinary temporary failures. Reproduced in new component tests; repaired by clearing candidates and refreshing session state.
- **P2 — repeated candidate cards obscured the target action:** a scan with many near-identical reports produced full-size cards for each pair. Reproduced with the user's pre-fix screenshots and a multi-pair component fixture; repaired with target grouping and disclosure of alternate pairings.
- **P2 — queue status was ambiguous:** the send action remained available after success and an already-pending response looked like a generic failure. Reproduced in new component tests; repaired with target-level queued state and safe retry for unrelated failures.
- **P2 — failed rescan could leave unlabeled old results:** the previous candidate list stayed on screen with no indication that it was not fresh. Repaired with explicit previous-result copy and a regression test.

Positive findings retained: every `/api/admin` route checks an active administrator on the server, account and reference-data mutations use version checks, and flags and report visibility changes require explicit confirmation. Existing focused tests cover permission, privacy, validation, conflict, and safe-error cases.

## Repairs

- Group duplicate candidate pairs by the report submitted to the moderation queue. Keep the highest-scoring pair visible and expose other pairings, scores, reasons, and links through a native disclosure control.
- Show the event date and short report ID for each report. Give same-title report links distinct accessible names containing that identity.
- Count pairs and target reports separately so the scan result is not mistaken for a count of distinct reports.
- After a successful queue submission, mark the target as sent and prevent repeat submission within the page session, including after a rescan. Interpret the server's existing-pending-flag response as an already-queued state; leave unrelated failures retryable. Refresh the flag queue after both successful and already-pending outcomes.
- On scanner authentication or administrator-access failure, clear stale candidates, refresh the shared session, and redirect to sign-in when authentication expired.
- If a later scan fails for a non-permission reason, label the still-visible candidates as previous results rather than implying they came from the failed scan.

Duplicate scoring, scan limit, report visibility, flag policy, schemas, and all other administrator powers remain unchanged. Scanning is read-only and queueing still requires an explicit administrator click.

## Verification

| Check | Result |
| --- | --- |
| Focused duplicate-review component tests | 9 passed, including new grouping, queue-state, pending-flag, stale-result, retry, and access-loss cases |
| Administrator UI, route, and service tests | 51 files, 813 tests passed |
| Full project tests | 183 files, 3062 tests passed after the final change |
| TypeScript (`npx.cmd tsc --noEmit`) | Passed |
| ESLint (`npm.cmd run lint`) | Passed |
| Production build (`npm.cmd run build`) | Passed; all four administrator routes generated |
| Impeccable mechanical detector on changed UI files | No findings (`[]`) |
| `git diff --check` | Passed |

Vitest initially failed before collecting tests because the managed Windows sandbox denied rename operations in its temporary directory (`EPERM`). Rerunning tests outside that sandbox passed. No application defect was inferred from the temporary-directory error.

## Live-acceptance limit

The connected browser runtime could not load its installed browser-control module because of an `EPERM` realpath error. Therefore this pass did **not** complete fresh signed-in desktop/320px visual checks of the changed page or exercise account, reference-data, flag, or visibility mutations against live data. Earlier user screenshots established the pre-fix duplicate-list problem; they do not prove the post-fix visual result. A final manual check should load `/admin/moderation` on the local 3001 server, scan, inspect one grouped target and its other pairings at desktop and mobile widths, and confirm navigation, focus, and labels. Do not press a send/hide/account-change control merely for visual acceptance.

No production deployment, GitHub push, or live data write was performed in this audit.
