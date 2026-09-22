# Client-managed Staff membership verification — 22 September 2026

## Scope

An active administrator can promote a registered student to Staff or demote
Staff to student in **Manage accounts**. Existing account-status actions cover
temporary suspension, restoration, and deactivation. Ordinary registration
still creates students; the one-time setup script still establishes the initial
administrator. No public administrator promotion or account deletion was added.

## Safety checks

- The PATCH route requires a current active administrator session, strict
  request validation, rate limiting, and bounded errors.
- The service rechecks authority and the target inside a database transaction,
  rejects self-targeting, administrator/deactivated targets, unchanged roles,
  and stale updates, and changes only the role field.
- The transaction revokes target sessions and writes an immutable role-change
  audit record. The client asks for confirmation and shows a safe outcome.
- Automated contract, model, service, route, browser-client, and component
  tests cover these paths without accessing Atlas.

## Evidence

The 22 September full suite, TypeScript, lint, and production build passed;
the exact gate counts are recorded in `docs/test-matrix.md`. A live browser
test then used a disposable registered student account on the configured
course database. An administrator promoted it to Staff, the page confirmed
session revocation, and a fresh sign-in showed the Staff role plus working
**Report handling** and **Claim reviews** pages. The administrator then demoted
it to Student. A fresh sign-in showed Student, removed both Staff navigation
links, and direct access to `/staff/reports` displayed the protected
"Only active staff and administrator accounts" message. No report or Claim
decision was made during this test.
