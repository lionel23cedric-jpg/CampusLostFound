# Secure In-App Notification Backend Verification

**Date:** 2026-08-25
**Branch:** `feature/issue-35-notification-backend`
**Verified range:** `729a90b..429a971`

## Implemented scope

- Added a validated, indexed, persisted Notification model.
- Added preference-aware Claim lifecycle delivery owned by the existing Claim transactions.
- Added recipient-isolated seek pagination, unread counts, and idempotent read state.
- Added authenticated, no-store list and mark-read API routes.
- Preserved the existing public Claim contracts and added no runtime dependency.

## Automated verification

Run from `web/` unless noted otherwise:

| Command | Result |
| --- | --- |
| `npm.cmd test -- src/models/notification.test.ts src/lib/notifications/contracts.test.ts src/lib/notifications/validation.test.ts src/lib/notifications/errors.test.ts src/lib/notifications/request-body.test.ts src/lib/notifications/delivery.test.ts src/lib/notifications/service.test.ts src/lib/claims/claimant-service.test.ts src/lib/claims/staff-service.test.ts src/app/api/claims/claimant-routes.test.ts src/app/api/staff/claims/staff-claim-routes.test.ts src/app/api/notifications/notification-routes.test.ts` | Passed: 12 files, 280 tests. |
| `npm.cmd test` | Passed: 84 files, 1,493 tests. |
| `npm.cmd run lint` | Passed with exit code 0. |
| `npm.cmd exec -- tsc --noEmit --incremental false` | Passed with exit code 0. |
| `npm.cmd run build` | Passed; generated `/api/notifications` and `/api/notifications/[id]/read`. |
| `npm.cmd audit` | Passed: `found 0 vulnerabilities`. |
| `git diff --check` (repository root) | Passed with no output. |

The focused and full Vitest runs emitted the existing non-blocking warning that
`vitest.config.ts` uses ESM syntax while Vite's future native config loader treats
the file as CommonJS. Both runs exited successfully. The first sandboxed build
attempt was denied access to `.next/trace`, and the first sandboxed audit attempt
could not reach the registry audit endpoint or write the user-level npm log. The
same commands passed unchanged when rerun with the narrowly approved permissions;
no source or dependency change was needed.

## Security, privacy, and transaction verification

- `git diff --name-status develop...HEAD` contained only the approved design,
  plan, Notification implementation/tests, Claim service integration/tests, and
  API route/tests; `package.json` and `package-lock.json` were unchanged.
- `PublicNotification` is a strict schema containing only `id`, `kind`, controlled
  `title` and `summary`, a controlled action, timestamps, and the derived read flag.
  Its exhaustive static copy does not interpolate stored report or Claim text.
- Static identifier scans found `recipientId` only in internal delivery plans,
  MongoDB filters, persisted model fields, and explicit privacy tests. Claimant,
  reporter, review, verification, credential, and token fields are absent from
  the public contract and route payload construction.
- List, unread-count, and mark-read queries filter by the authenticated user's
  `recipientId`. Missing and foreign notifications use the same
  `NOTIFICATION_NOT_FOUND` response (`404`, `Notification not found`).
- Authentication runs before query, path, or body validation, and successful and
  error responses from both Notification routes set `Cache-Control: no-store`.
- Claimant and staff services call `deliverNotifications` inside their existing
  `withTransaction` callbacks and pass the same `ClientSession` used by their
  state changes. Delivery performs eligibility/Profile preference reads and its
  ordered bulk upsert with that session.
- Delivery accepts only the seven closed kinds, checks active users and mapped
  preferences, skips ineligible recipients, deduplicates deterministic versioned
  event keys, and writes with `$setOnInsert`. Eligible write failures propagate to
  the transaction owner.
- Notification service, delivery, Claim integration, and route tests mock database,
  model, session, and request boundaries. A source/test scan found no
  `MONGODB_URI`, `mongodb+srv`, or `.env.local` reference in the Notification test
  slice.
- `git check-ignore web/.env.local` returned `web/.env.local`. Verification did
  not open or display that file. Next.js reported its standard `.env.local`
  discovery in the build banner, but no database health request, manual database
  call, or Atlas connection was made during this verification.

## Deferred scope

The notification-centre frontend, possible-match delivery, external channels,
realtime transport, background jobs, free-form communication, mark-all-read,
deletion, and retention remain outside Issue #35.
