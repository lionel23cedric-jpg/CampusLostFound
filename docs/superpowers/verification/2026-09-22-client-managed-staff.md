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

## Evidence and remaining manual check

The 22 September full suite, TypeScript, lint, and production build passed;
the exact gate counts are recorded in `docs/test-matrix.md`. A live browser
promotion/demotion against the configured shared database was **not** run:
doing so would change real account privileges. For the course demonstration,
use two disposable registered accounts, confirm the intended database and
administrator identity, then promote one, verify it must sign in again and can
open Staff pages, demote it, and confirm those pages become unavailable.
