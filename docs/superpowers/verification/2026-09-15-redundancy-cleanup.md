# Redundancy and Legacy Compatibility Review

Date: 15 September 2026  
Branch: `feature/project-quality-polish`

## Result

The review found one proven code duplication family and removed it during the
security hardening slice. No further production deletion is justified without
either breaking an implemented workflow or first migrating live data.

## Proven removal

Four domain-specific request-body implementations and their tests duplicated
stream reading, UTF-8 handling, size checks, cancellation, and JSON parsing:

- `lib/admin/account-request-body.ts`
- `lib/admin/reference-data-request-body.ts`
- `lib/claims/request-body.ts`
- `lib/notifications/request-body.ts`

Their eight implementation/test files contained 714 lines. They were replaced
by one shared implementation and test file containing 277 lines, for a net
reduction of 437 lines and no added dependency. All 19 JSON mutation routes now
use the shared reader.

`ponytail-audit` summary: `delete: four duplicated domain request readers;
replacement: one bounded shared reader. net: -437 lines, -0 deps.`

## Items deliberately retained

- `isLegacyHttpsPhotoUrl` remains referenced by the report schema and detail
  display. It preserves access to old records until the database audit confirms
  that no legacy references remain.
- Report, Claim, notification, flag, account, verification, and custody states
  are separate domain contracts. Similar English labels do not make them
  interchangeable.
- All five contextual WebP files and the home-page PNG have a production
  reference; none is an orphan asset.
- Mongoose, Zod, Sharp, React, Next.js, Tailwind/PostCSS, Vitest, jsdom, and the
  Testing Library packages each have a build-time, runtime, or test reference.
- Browser clients, route handlers, validation contracts, and services enforce
  distinct client/server trust boundaries; collapsing them would weaken the
  demonstrable course architecture rather than remove dead code.

## Verification evidence

- Exact-symbol searches found no deleted reader reference and no direct
  `request.json()` call in application source.
- `isLegacyHttpsPhotoUrl` has production and test references.
- Every public image asset has a production mapping or page reference.
- After the shared-reader removal, 166 test files and 2916 tests passed; lint,
  TypeScript, and the production build also passed.

## Deferred cleanup gate

The explicit `npm run db:audit-legacy-images` dry run must be reviewed before
any external image compatibility is removed. Its `--apply` mode requires a
backup and separate approval. Neither mode was executed during this review.
