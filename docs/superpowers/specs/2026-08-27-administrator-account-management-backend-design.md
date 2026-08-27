# Administrator Account Management Backend Design

**Date:** 2026-08-27

**Issue:** #39

**Proposed title:** Build secure administrator account management backend

## 1. Goal

Add a narrow, auditable administrator backend for finding student and staff
accounts and changing their account status. Every accepted status change must
revoke the target account's sessions and record an immutable administration
event in the same MongoDB transaction.

This feature closes the account-management backend gap in the project brief
without introducing unrestricted user CRUD or administrator-role management.

## 2. Scope

Issue #39 includes:

- an active-administrator-only account list endpoint;
- bounded search, role filtering, status filtering and page-number pagination;
- an active-administrator-only account-status transition endpoint;
- explicit transition rules for `active`, `suspended` and `deactivated`;
- optimistic concurrency through the target User's `updatedAt` value;
- immediate revocation of every Session belonging to the target User;
- an immutable `AccountAdministrationEvent` audit model;
- atomic status update, session revocation and audit creation;
- strict, privacy-safe request and response contracts;
- model, contract, service, route, transaction and regression tests;
- implementation and verification documentation.

## 3. Out of scope

- An administrator account-management page or navigation entry.
- Managing the current administrator or any other administrator account.
- Creating users or permanently deleting accounts.
- Changing email addresses, passwords, roles, email-verification state or
  Profile data.
- Bulk actions.
- Free-form administration notes.
- Audit-event browsing, editing, deletion, export or retention controls.
- Email, SMS, push or in-app notification delivery.
- Report moderation, category management or campus-location management.
- New runtime dependencies.

## 4. Considered approaches

### Chosen: scoped status administration with an immutable audit event

Administrators can discover student and staff accounts and perform only the
documented status transitions. The transaction changes the User, deletes the
target's sessions and writes a controlled audit event. This supplies a useful
management capability while keeping the permission surface small and
explainable.

### Rejected: unrestricted user CRUD

Generic CRUD would permit risky operations that are not needed by the project
brief, including identity edits, role elevation and permanent deletion. It would
also require substantially more authorisation and recovery design.

### Rejected: status changes without audit or session revocation

Changing only the persisted User status would leave existing credentials usable
until their next account check and would provide no reliable evidence of the
administrator action. These behaviours are unacceptable for a security boundary.

## 5. Access-control boundary

Both endpoints resolve the existing session through the established
authentication boundary before request-query or request-body parsing and before
account-management database work.

Access requires a current User with:

- `role: "administrator"`;
- `status: "active"`.

An active administrator may target only Users whose role is `student` or
`staff`. The service rejects:

- the administrator's own User ID;
- every User with role `administrator`, including inactive administrators;
- missing Users;
- every request made by a student, staff member or inactive administrator.

The restriction is enforced in the service and in target-filtered database
queries. A client-supplied role is never trusted as proof that a target is
manageable.

## 6. Account list API

### `GET /api/admin/accounts`

The endpoint accepts these optional query parameters:

- `q`: trimmed account search text, length `1..80` after trimming;
- `role`: exactly `student` or `staff`;
- `status`: exactly `active`, `suspended` or `deactivated`;
- `page`: canonical integer in `1..500`, default `1`.

The fixed page size is `20`, so a request can skip at most 9,980 matching
accounts. Unknown keys, duplicate keys, blank supplied values,
non-canonical integers and out-of-range input are rejected. Search text is
escaped before use in a case-insensitive regular expression and is matched only
against email and Profile display name. The server never interprets user input
as raw MongoDB or regular-expression syntax.

The query always includes the role boundary `{ role: { $in: ["student",
"staff"] } }`. Results use a stable `{ createdAt: -1, _id: -1 }` order. The
service uses bounded `skip` and `limit`; page values whose skip would exceed the
documented safe upper bound are rejected rather than issuing an unbounded scan.

Successful response:

```json
{
  "accounts": [
    {
      "id": "507f1f77bcf86cd799439011",
      "email": "student@example.test",
      "displayName": "Example Student",
      "role": "student",
      "status": "active",
      "createdAt": "2026-08-20T01:00:00.000Z",
      "lastLoginAt": "2026-08-26T23:30:00.000Z",
      "updatedAt": "2026-08-26T23:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

`updatedAt` is the public optimistic-concurrency token. The response does not
include password hashes, session identifiers, email-verification state, Profile
contact preferences, notification preferences, campus preferences or internal
Mongoose fields.

An empty result returns HTTP 200 with an empty `accounts` array and zero totals.
Successful responses set `Cache-Control: no-store`.

## 7. Account-status API

### `PATCH /api/admin/accounts/{userId}/status`

The route requires a canonical MongoDB ObjectId and a strict JSON body:

```json
{
  "status": "suspended",
  "expectedUpdatedAt": "2026-08-26T23:30:00.000Z",
  "reason": "security_concern"
}
```

Allowed `reason` values are:

- `security_concern`;
- `policy_violation`;
- `administrative_review`;
- `account_restored`;
- `account_closed`.

The transition and reason must be compatible:

| Transition | Allowed reasons |
| --- | --- |
| `active` to `suspended` | `security_concern`, `policy_violation`, `administrative_review` |
| `suspended` to `active` | `account_restored` |
| `active` or `suspended` to `deactivated` | `account_closed` |

`deactivated` is terminal. Same-state requests, unsupported transitions and
incompatible reasons return a conflict rather than silently succeeding.

`expectedUpdatedAt` must be a canonical ISO timestamp exactly matching the
target User's current `updatedAt`. A stale value returns HTTP 409 and changes
nothing. This prevents one administrator's stale page from overwriting a newer
decision.

Successful response returns exactly:

```json
{
  "account": {
    "id": "507f1f77bcf86cd799439011",
    "email": "student@example.test",
    "displayName": "Example Student",
    "role": "student",
    "status": "suspended",
    "createdAt": "2026-08-20T01:00:00.000Z",
    "lastLoginAt": "2026-08-26T23:30:00.000Z",
    "updatedAt": "2026-08-27T01:00:00.000Z"
  }
}
```

The returned `updatedAt` can be used for a later transition.

## 8. Audit data model

Add `web/src/models/account-administration-event.ts` with this logical shape:

```ts
type AccountAdministrationReason =
  | "security_concern"
  | "policy_violation"
  | "administrative_review"
  | "account_restored"
  | "account_closed";

type AccountAdministrationEvent = {
  actorAdministratorId: ObjectId;
  targetUserId: ObjectId;
  previousStatus: "active" | "suspended";
  newStatus: "active" | "suspended" | "deactivated";
  reason: AccountAdministrationReason;
  occurredAt: Date;
};
```

Constraints:

- every field is required;
- the actor and target IDs cannot be equal;
- the target transition must be one of the documented transitions;
- `occurredAt` defaults to the server time and is the event's only time field;
- automatic Mongoose timestamps are disabled;
- the application exposes no update, replace or delete function for events.

Indexes:

```ts
{ targetUserId: 1, occurredAt: -1, _id: -1 }
{ actorAdministratorId: 1, occurredAt: -1, _id: -1 }
```

The event stores controlled identifiers, enum values and time only. It does not
duplicate email, display name, password data, free-form notes or request data.

## 9. Atomic transaction flow

The status service owns one Mongoose transaction:

1. Re-authorise the current active administrator inside the transaction.
2. Load the target User by ID and require a `student` or `staff` role.
3. Reject the current administrator's own ID and every administrator target.
4. Compare `expectedUpdatedAt` with the current User timestamp.
5. Validate the exact status transition and controlled reason.
6. Conditionally update the target User using ID, role, current status and
   `updatedAt` in the write filter.
7. Require exactly one modified User; otherwise report a state conflict.
8. Delete all Session records whose `userId` is the target ID using the same
   session.
9. Create one AccountAdministrationEvent using the same session.
10. Commit and map the updated User plus Profile display name into the public
    response.

Any failure aborts the complete transaction. The application must never commit a
status change without both revocation and audit evidence, or commit an audit
event for a status change that did not occur.

Session deletion is intentional even when zero sessions exist. Reactivating an
account also deletes all sessions, so the user must authenticate again from a
known post-decision state.

## 10. Component boundaries

The implementation should follow the existing administrator modules and keep
responsibilities isolated:

- `account-contract.ts`: strict query, request and public-response schemas;
- `account-errors.ts`: closed safe error union and sanitisation;
- `account-list-service.ts`: administrator guard, bounded account query and
  public mapping;
- `account-status-service.ts`: transition rules and transaction ownership;
- `account-administration-event.ts`: immutable audit schema and indexes;
- account-list route: authentication, query collection and response headers;
- account-status route: authentication, route/body validation and safe response.

The routes contain no business transitions. Services return explicit public
objects rather than Mongoose documents. Existing User, Profile, Session,
authentication and MongoDB connection modules are reused.

## 11. Error handling and privacy

Routes return stable envelopes only:

| Condition | Status | Code | Message |
| --- | ---: | --- | --- |
| Malformed query, route ID or body | 400 | `VALIDATION_ERROR` | `Request is invalid` |
| Missing, expired or revoked session | 401 | Existing authentication code | Existing generic authentication message |
| Wrong role or inactive administrator | 403 | `ADMINISTRATOR_REQUIRED` | `Administrator access required` |
| Self or administrator target | 403 | `ACCOUNT_ACTION_FORBIDDEN` | `Account action is not permitted` |
| Missing manageable target | 404 | `ACCOUNT_NOT_FOUND` | `Account not found` |
| Stale token, same state, invalid transition or incompatible reason | 409 | `ACCOUNT_STATE_CONFLICT` | `Account state has changed or cannot be updated` |
| Database, transaction or unexpected failure | 500 | `ACCOUNT_OPERATION_FAILED` | `Account operation could not be completed` |

Safety requirements:

- authentication and administrator authorisation run before query/body parsing;
- strict Zod schemas reject unknown object keys;
- JSON media type, UTF-8, content length and malformed JSON follow existing safe
  request-body rules;
- search input is length-bounded and regex-escaped;
- target filtering occurs in database queries, not after a privileged load;
- success and error responses set `Cache-Control: no-store` where account data is
  present;
- raw MongoDB errors, transaction labels, stack traces and rejected input are
  never returned;
- no endpoint returns password hashes, session data or hidden Profile fields;
- automated tests never read `.env.local` or access the real Atlas cluster.

## 12. Testing strategy

### Model tests

- required fields and status/reason enums;
- creation-only timestamp behaviour;
- actor/target and transition validation;
- target/time and actor/time indexes;
- absence of update/delete application helpers.

### Contract tests

- exact accepted account, pagination and mutation shapes;
- rejection of unknown, private and malformed fields;
- canonical ObjectId, timestamp, page and query validation;
- bounded search text and exact reason enum;
- finite non-negative safe pagination counts.

### Account-list service tests

- active-administrator permission matrix and authorisation-before-model access;
- mandatory student/staff role boundary;
- email/display-name search with escaped metacharacters;
- role and status filters independently and together;
- stable sorting, fixed page size, bounded skip and exact totals;
- empty results;
- exact public projection and absence of password, session and private Profile
  fields;
- sanitised database and mapping failures.

### Account-status service tests

- every allowed transition/reason pair;
- same-state, unsupported, incompatible-reason and terminal-state rejection;
- self-target and administrator-target rejection;
- missing target and stale `updatedAt` behaviour;
- conditional User update uses ID, role, status and timestamp;
- all target sessions are deleted with the transaction session;
- exactly one immutable audit event is created with the transaction session;
- reactivation also revokes sessions;
- update, session-delete and audit failures each roll back the transaction;
- a conditional write that modifies no User returns conflict and creates no
  committed side effects.

### Route tests

- authentication and administrator authorisation precede validation and database
  work;
- exact status/error envelopes for both endpoints;
- strict query, path, content-type, UTF-8, body-size and JSON handling;
- `Cache-Control: no-store` on account-bearing responses;
- safe handling of another administrator, another role and inactive accounts;
- no raw error, password, token, hidden Profile or internal Mongoose field can
  enter a response.

### Regression and quality gates

```powershell
npm test
npm run lint
npm exec -- tsc --noEmit --incremental false
npm run build
npm audit
```

Also require `git diff --check`, a clean tracked-file credential scan and proof
that `.env.local` remains ignored. All automated tests mock database, transaction
and session boundaries and do not connect to Atlas.

## 13. Acceptance criteria

Issue #39 is accepted when:

- only an active administrator can access either endpoint;
- account discovery is restricted to student and staff accounts;
- search, filters and fixed-size pagination are strict and bounded;
- public results contain the documented safe fields only;
- no administrator can target self or another administrator;
- only the documented status/reason transitions are accepted;
- stale pages cannot overwrite newer account changes;
- every successful transition revokes all target sessions;
- every successful transition creates exactly one immutable audit event;
- User update, session revocation and event creation commit or roll back together;
- failures use stable privacy-safe envelopes;
- existing authentication, Profile and administrator-overview behaviour remains
  compatible;
- focused and full tests, lint, TypeScript, production build and audit pass;
- verification evidence explicitly confirms that no real credentials, Atlas data
  or private account fields were exposed.

## 14. Follow-up

The next independent issue should add an accessible administrator account page
that consumes these APIs, presents role and status filters, explains irreversible
deactivation, requests an explicit controlled reason, handles stale-state
conflicts and redirects safely when administrator authentication expires. Bulk
actions, audit browsing, role management and permanent deletion remain deferred.
