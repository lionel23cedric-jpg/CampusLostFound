# Submission Readiness Polish Design

**Date:** 15 September 2026
**Branch:** `fix/auth-visual-chart-polish`

## Goal

Close the remaining deterministic source-code and setup gaps that can be fixed without inventing assessment evidence, changing existing workflows, or mutating the configured MongoDB database.

## Scope decomposition

The full submission-readiness effort is split into four independently reviewable stages:

1. source and setup polish described in this document;
2. approved live-database and browser acceptance testing;
3. final report, presentation, video script, and verified contribution evidence;
4. deployment, GitHub integration, and a fresh source ZIP.

Only stage 1 is implemented under this design. Stages 2–4 require separate evidence or external-state decisions and will receive their own plans.

## Considered approaches

### A. Targeted course-scope fixes — selected

Reuse existing components, Node.js, Mongoose, Sharp, Vitest, and documentation patterns. Add only missing back links, correct stale copy and code placement, convert the oversized hero asset, remove the Vitest configuration warning, and provide an explicit dry-run-first role provisioning command for existing registered users.

This is the smallest approach that makes a fresh database demonstrable without adding a privileged role-management UI or hard-coded credentials.

### B. Broad refactor and production infrastructure — rejected

Extract the duplicated administrator reference-data panels, add Redis rate limiting, object storage, CI, and deployment-specific account provisioning. These could benefit a production system but increase risk and are not required for the assessed single-instance course application.

### C. Documentation-only workaround — rejected

Tell users to edit MongoDB manually and leave the UI/content gaps unchanged. This is fragile, difficult to demonstrate, and does not provide repeatable setup evidence.

## Interface changes

### Consistent return navigation

Add the existing `PageBackLink` to the three active pages that currently lack it:

- Profile settings returns to `/dashboard`.
- My reports returns to `/dashboard`.
- Administrator reference data returns to `/admin`.

The links appear at the top of the existing page content and use each page's current layout width. No browser-history API or new navigation abstraction is introduced.

### Accurate home-page copy

Replace the obsolete statement that live report browsing is still coming with copy that says the cards are examples and authenticated members can browse live reports.

### Authentication source cleanup

Move the `node:crypto` `createHash` import in the login route from the end of the file to the import block. Behaviour remains unchanged.

### Homepage image optimisation and provenance

Convert `web/public/campus-find-hero.png` to a metadata-free 1536 by 1024 WebP at quality 84 using the already-installed Sharp package. Update the single `next/image` source reference and its test. Remove the superseded PNG after visual verification.

Record the asset source status. If the original source cannot be proven as licensed photography, describe it as a pre-existing project visual of unverified provenance and require the team to confirm its origin before public publication. Do not invent attribution.

### Vitest configuration warning

Rename `vitest.config.ts` to `vitest.config.mts`. This preserves the existing ESM configuration while making its module format explicit; `package.json` remains unchanged.

## Safe role provisioning

Create `web/scripts/set-account-role.mjs` and the npm command `npm run db:set-role -- --email <address> --role <staff|administrator>`.

Safety rules:

- The command operates only on an account that was already created through normal registration.
- It accepts only `staff` or `administrator`; it cannot demote an administrator or assign arbitrary values.
- Dry run is the default and performs no write.
- A real change requires the separate `--apply` argument.
- Reapplying the same role is an idempotent no-op.
- Allowed transitions are student to staff, student to administrator, and staff to administrator.
- Successful role changes and session revocation run in one MongoDB transaction so the user must sign in again and receives the new role.
- The command prints roles and outcomes, not passwords, connection strings, session tokens, profile data, or report data.
- No password is accepted or stored by the script.
- The configured database is not changed during implementation or automated tests. A later live run requires explicit approval.

Document the exact fresh-database sequence: register ordinary accounts, run the reference-data bootstrap, dry-run each role change, apply each approved role change, and sign in again.

## Error handling

The role script exits non-zero with a short safe message when arguments are invalid, the database is unavailable, the account is missing, the current role transition is forbidden, or a concurrent update prevents the change. It always closes the MongoDB connection/session. Raw connection strings and database errors are not printed.

## Testing

- Add component assertions for the three new return links and revised home copy.
- Add a source-path assertion for the WebP hero.
- Add script tests covering argument validation, default dry run, idempotence, allowed transitions, forbidden administrator changes, concurrent conflict, transactional role update, and session revocation.
- Run the focused tests first, followed by the complete 168-file suite, ESLint, non-incremental TypeScript, matching evaluation, production build, and npm audit.
- Confirm the Vitest configuration warning no longer appears.
- Inspect the home, profile, My reports, and administrator reference-data entry pages. Authenticated screens remain part of the later manual acceptance stage if credentials are not available.

## Explicit non-goals

- No role-management controls are added to the administrator web UI.
- No demo credentials or passwords are committed.
- No remote database is mutated in this stage.
- No Redis, object storage, charting, deployment, CI, or end-to-end testing dependency is added.
- No large component refactor or historical-document deletion is performed before submission.
- No contribution hours, authorship, screenshots, or manual pass result is invented.

## Success criteria

- The three identified pages expose the existing top-left return-link pattern.
- The home page contains no obsolete future-feature statement.
- The hero is served from a smaller WebP source with no metadata.
- Vitest runs without the existing module-format warning.
- A fresh database has a documented, tested, dry-run-first path to provision staff and administrator roles from registered accounts.
- All automated quality gates remain green and the working tree is clean.
