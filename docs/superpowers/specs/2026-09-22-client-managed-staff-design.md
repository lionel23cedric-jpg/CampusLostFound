# Client-Managed Staff Design

## Goal

An active administrator, acting as the campus client, can add an existing registered user to the Staff group, remove a Staff member from that group, and change a Staff member's account availability without database editing. This implements the supervisor's 22 September feedback without creating or distributing passwords.

## Scope and interaction

- Reuse the existing `/admin/accounts` search, filters, and account cards. Add a clearly labelled Staff access action for active or suspended student/staff accounts.
- “Add Staff” changes a registered student to staff. “Remove Staff” changes staff back to student; it does not delete the account, reports, claims, or audit history.
- The existing suspend, restore, and deactivate controls remain the way the client changes a Staff member's availability. No new account-registration flow is needed.
- Show the current role, the proposed role, and the consequence that current sessions will end in a confirmation dialog. Refresh the row after success; show a safe error and stale-data retry guidance on failure.
- Administrators cannot change their own role, target another administrator, or grant administrator access through this workflow. Deactivated accounts cannot be promoted or demoted.

## Architecture and data flow

1. The account card calls a browser client method with the target account ID, new role (`student` or `staff`), and the `updatedAt` value displayed to the administrator.
2. A new administrator-only role route parses a strict request body and derives the actor from the server session. It never accepts actor identity from the browser.
3. A role service rechecks that the actor is still an active administrator and that the target is a manageable account. In a MongoDB transaction, it checks `updatedAt`, changes only `role`, revokes the target's sessions, and writes an immutable role-change audit event.
4. The route returns the same safe managed-account representation used by the existing account list. The UI updates that row and preserves filters and pagination.

## Failure and security behaviour

- Reject unauthenticated, non-administrator, self-targeting, administrator-targeting, deactivated-targeting, same-role, malformed, and stale-update requests with bounded public errors.
- No password, contact preference, or private report data is exposed in account responses or audit records.
- If any database operation fails, the role change, session revocation, and audit event must roll back together.
- The setup-only `db:set-role` script may remain for the initial administrator bootstrap; routine Staff configuration must work through the application.

## Verification

- Unit and route tests cover allowed promotion/demotion, rejected transitions, stale writes, actor permissions, session revocation, and audit rollback.
- Browser-component tests cover labels, confirmation, success refresh, and failure feedback.
- Manual acceptance: register a normal user, promote them from the administrator UI, confirm Staff pages become available after a fresh login, demote them, and confirm Staff access disappears.

## Deliberate limits

- “Modify Staff” means changing Staff membership and account availability. Staff members maintain their own profile details; the client does not set or see their passwords.
- No bulk role changes, invitations, or hard deletion are included in this course-project increment.
