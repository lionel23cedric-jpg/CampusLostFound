# Report flagging and administrator moderation backend design

**Date:** 2026-08-28
**Issue:** #44
**Proposed title:** Build secure report flagging and administrator moderation backend

## 1. Goal

Add a narrow moderation backend that lets active Campus Noticeboard members
flag unsafe submitted reports and lets active administrators review those
flags, hide or restore reports, and leave an immutable audit trail.

The feature closes the remaining report-and-flag portion of the administrator
management requirement. It does not turn report moderation into unrestricted
report editing or deletion. The existing report recovery status continues to
describe the lost-and-found lifecycle; a separate moderation status controls
whether ordinary members may discover a report.

## 2. Context and chosen approach

The project already provides:

- authenticated student, staff and administrator accounts;
- privacy-safe submitted report list and detail endpoints;
- report matching and ownership Claim workflows;
- active-administrator access patterns;
- administrator account and reference-data management with optimistic
  concurrency and audit evidence;
- fixed safe error envelopes, Zod validation and transaction helpers.

Three approaches were considered:

1. **Complete flag-to-decision workflow — chosen.** Add member flag submission,
   an administrator flag queue, direct report moderation, and audit events.
   This is the smallest approach that satisfies the complete requirement.
2. **Administrator status changes only.** This is smaller but supplies no
   member reporting source and does not satisfy report-flag management.
3. **Member flag submission only.** This collects reports but provides no safe
   administrator resolution path and leaves an unusable queue.

The chosen design reuses the existing authentication, database, error, report
mapping and administrator patterns. It adds no dependency and no generic
moderation framework.

## 3. Scope

### In scope

- Active members flag a submitted, visible report that they do not own.
- A member has at most one pending flag for the same report.
- Active administrators search and paginate submitted reports.
- Active administrators search and paginate report flags.
- An administrator dismisses one pending flag or hides its report.
- An administrator directly hides or restores a submitted report.
- Hiding and restoring are reversible and do not delete report, Claim or
  verification records.
- Every administrator decision writes an immutable moderation event.
- Hidden reports leave ordinary browsing, detail discovery, new Claim creation
  and intelligent matching while existing authorised Claim workflows remain
  available.
- Legacy reports without a moderation field continue to behave as visible.

### Out of scope

- Permanent deletion, bulk moderation or destructive record cleanup.
- Editing report content on behalf of a reporter.
- Suspending or deactivating a report owner automatically.
- AI or rule-based content classification.
- Chat, free-form member-to-administrator messaging or appeals.
- A member flag-history page or administrator moderation frontend.
- Audit-log browsing endpoints.
- New notification kinds or email delivery.
- Dependency, authentication, Claim-state or database-connection changes.

## 4. Roles and terminology

### Active member

An authenticated `student`, `staff` or `administrator` whose account status is
`active`. Any active member may flag a report available through the ordinary
member report boundary, except a report they own. Allowing an administrator to
flag does not grant additional authority; administrators already have the
separate moderation endpoints.

### Active administrator

An authenticated account with role `administrator` and status `active`. Only
this role may use `/api/admin/reports`, `/api/admin/report-flags` and their
mutation endpoints. The server derives administrator identity from the
HttpOnly session and never accepts it from a request body or query string.

### Submitted report

A report whose recovery status is `open`, `claim_pending`, `resolved` or
`closed`. Draft reports remain private and outside moderation search, flagging
and mutation endpoints.

### Recovery status versus moderation status

`ItemReport.status` remains the recovery lifecycle:

```text
draft | open | claim_pending | resolved | closed
```

`ItemReport.moderationStatus` independently controls member discovery:

```text
visible <-> hidden
```

Hiding never rewrites recovery status or `resolvedAt`.

## 5. Data model

### 5.1 ItemReport moderation field

Add one field to `ItemReport`:

```ts
moderationStatus: "visible" | "hidden"
```

It defaults to `visible` and is required for new records. Existing records may
not contain the field, so all read boundaries interpret a missing value as
`visible`. Member queries express visibility as `moderationStatus != hidden`;
they do not require a migration or production backfill.

The member and owner report contracts include the canonical
`moderationStatus`. A visible report exposes `visible`. A hidden report can be
returned only to its owner through the direct report-detail service, where the
field explains that it is not publicly discoverable.

### 5.2 ReportFlag

Create `ReportFlag` with timestamps and this controlled shape:

| Field | Type | Rules |
| --- | --- | --- |
| `reportId` | ObjectId | Required, immutable reference to `ItemReport` |
| `submittedByUserId` | ObjectId | Required, immutable, never serialised |
| `reason` | enum | Required, immutable approved reason |
| `details` | string or null | Trimmed, at most 500 characters, selected explicitly only for administrators |
| `status` | enum | `pending`, `dismissed` or `actioned` |
| `reviewedByAdministratorId` | ObjectId or null | Required only after resolution; never serialised |
| `reviewedAt` | Date or null | Required only after resolution |
| `resolutionNote` | string or null | At most 500 characters; administrator-only response field |
| `createdAt`, `updatedAt` | Date | Mongoose timestamps |

Approved member reasons are:

```text
inappropriate_content
suspected_fraud
privacy_concern
duplicate_report
other
```

`other` requires non-empty `details`. Other reasons allow optional details.
Pending records must have null review fields. Dismissed and actioned records
must have reviewer and review time.

Use a named partial unique index on
`{ reportId, submittedByUserId, status }` only where `status: "pending"`.
This prevents duplicate pending work while allowing a member to flag a report
again after an earlier flag has been resolved and the report later restored.
Duplicate-key translation occurs only when this exact named index is involved.

Add bounded queue indexes for stable pagination:

```text
{ status: 1, createdAt: -1, _id: -1 }
{ reason: 1, status: 1, createdAt: -1, _id: -1 }
{ reportId: 1, status: 1, createdAt: -1 }
```

### 5.3 ReportModerationEvent

Create append-only `ReportModerationEvent` records:

| Field | Type | Rules |
| --- | --- | --- |
| `actorAdministratorId` | ObjectId | Required, immutable, never serialised |
| `reportId` | ObjectId | Required, immutable |
| `sourceFlagId` | ObjectId or null | Required for flag dismissal; optional for report hiding |
| `action` | enum | `flag_dismissed`, `report_hidden` or `report_restored` |
| `reason` | enum | Controlled reason matching the action |
| `previousModerationStatus` | enum or null | Required for hide/restore; null for dismissal |
| `newModerationStatus` | enum or null | Required for hide/restore; null for dismissal |
| `note` | string or null | At most 500 characters; internal audit context |
| `occurredAt` | Date | Required, immutable, defaults to current time |

`flag_dismissed` requires a source flag and uses the fixed reason
`flag_dismissed`. `report_hidden` records `visible -> hidden`; its reason is
copied from a source flag or selected from the direct-administration reasons.
`report_restored` records `hidden -> visible` and uses the fixed reason
`moderation_reversed`.

Direct-administration hide reasons are:

```text
inappropriate_content
suspected_fraud
privacy_concern
duplicate_report
administrative_review
```

Indexes support report-centred and actor-centred audit reconstruction:

```text
{ reportId: 1, occurredAt: -1, _id: -1 }
{ actorAdministratorId: 1, occurredAt: -1, _id: -1 }
```

No update or delete service is created for moderation events.

## 6. Authorisation order

Every route follows this order:

1. Read the existing HttpOnly session cookie.
2. Resolve the current account with inactive accounts included.
3. Return the existing authentication error when no session account exists.
4. Enforce active-member or active-administrator access as appropriate.
5. Only then parse query parameters, route IDs or JSON bodies.
6. Only validated values reach the database service.

Services repeat their essential role invariant so a future non-route caller
cannot bypass it. Mutation transactions re-read the active administrator from
`User` before writing any report, flag or audit record.

The client cannot submit a user ID, administrator ID, role, account status,
report owner ID, review timestamp or event identity.

## 7. Public contracts and endpoints

All schemas are strict and reject unknown properties.

### 7.1 Submit a report flag

```http
POST /api/reports/{reportId}/flags
```

Body:

```json
{
  "reason": "privacy_concern",
  "details": "The public description appears to contain a phone number."
}
```

`details` is optional except for `other`. Empty optional details normalise to
`null`. The service accepts only a canonical ObjectId and a report that:

- has a submitted recovery status;
- is not hidden;
- is not owned by the current member.

Success is `201` with a minimal receipt:

```json
{
  "flag": {
    "id": "...",
    "reportId": "...",
    "reason": "privacy_concern",
    "status": "pending",
    "createdAt": "2026-08-28T05:00:00.000Z"
  }
}
```

The receipt omits details, member identity and internal review fields.

### 7.2 List reports for administrators

```http
GET /api/admin/reports
```

Accepted query parameters:

- `q`: trimmed keyword search, 1–80 characters when present;
- `reportType`: `lost` or `found`;
- `reportStatus`: `open`, `claim_pending`, `resolved` or `closed`;
- `moderationStatus`: `visible` or `hidden`;
- `page`: positive integer, default 1.

The page size is fixed at 20. Repeated parameters, unknown parameters and
invalid combinations fail validation. Results sort deterministically by
`createdAt` and `_id` descending, or text relevance followed by those fields
when `q` is present.

Each report summary contains only moderation-relevant submitted report data:

- ID, report type, title and public description;
- category and coarse campus-location IDs;
- occurred date, colours, tags and photo URLs;
- recovery status and moderation status;
- privacy settings, resolved time, created time and updated time.

It excludes reporter identity, account data and every private verification
field. Administrators may inspect the report-authored fields even when a member
privacy display setting hides one from ordinary member responses; this
dedicated endpoint exists solely for authorised moderation.

Success is `200` with one stable pagination envelope:

```json
{
  "reports": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 0,
    "totalPages": 0
  }
}
```

### 7.3 List report flags for administrators

```http
GET /api/admin/report-flags
```

Accepted query parameters:

- `status`: `pending`, `dismissed` or `actioned`;
- `reason`: one approved member reason;
- `page`: positive integer, default 1.

The fixed page size is 20 and results sort by `createdAt` and `_id` descending.
Each item contains:

- flag ID, reason, details, status and timestamps;
- reviewed time and resolution note when resolved;
- the safe administrator report summary.

It never exposes the flag submitter or reviewing administrator identity.

Success uses the same pagination shape as the report list, with a `flags`
array and `page`, `pageSize`, `totalItems` and `totalPages` fields inside
`pagination`.

### 7.4 Resolve one report flag

```http
PATCH /api/admin/report-flags/{flagId}
```

The body is a strict discriminated union.

Dismiss:

```json
{
  "decision": "dismiss",
  "expectedFlagUpdatedAt": "2026-08-28T05:00:00.000Z",
  "note": "No privacy-sensitive content is present."
}
```

Hide report:

```json
{
  "decision": "hide_report",
  "expectedFlagUpdatedAt": "2026-08-28T05:00:00.000Z",
  "expectedReportUpdatedAt": "2026-08-28T04:50:00.000Z",
  "note": "Hidden pending reporter correction."
}
```

Only a pending flag may transition. Dismiss changes it to `dismissed` and
writes a `flag_dismissed` event without changing the report. Hide changes the
report from visible to hidden, changes the selected flag to `actioned`, marks
every other currently pending flag for that report `actioned` in the same
transaction, and writes one `report_hidden` event referencing the selected
flag. Every affected flag records the current administrator, one shared review
time and the supplied resolution note. Existing resolved flags remain
unchanged.

Success returns the updated flag and safe report summary. No endpoint permits a
resolved flag to return to pending.

### 7.5 Directly hide or restore a report

```http
PATCH /api/admin/reports/{reportId}/moderation
```

Hide body:

```json
{
  "moderationStatus": "hidden",
  "reason": "administrative_review",
  "expectedUpdatedAt": "2026-08-28T04:50:00.000Z",
  "note": "Temporarily hidden while the report is reviewed."
}
```

Restore body:

```json
{
  "moderationStatus": "visible",
  "expectedUpdatedAt": "2026-08-28T05:10:00.000Z",
  "note": "Review completed and the report is safe to display."
}
```

Hide requires an approved direct-administration reason. Restore uses the fixed
audit reason `moderation_reversed`. Both require the current report
`updatedAt`. A direct hide marks every pending flag on the report `actioned` in
the same transaction; every affected flag records the current administrator,
one shared review time and the supplied resolution note. Restore never reopens
earlier flags; a new flag may be submitted if new concerns arise.

Success returns the safe administrator report summary.

## 8. State transitions

### ReportFlag

```text
pending -> dismissed
pending -> actioned
```

There are no transitions from `dismissed` or `actioned`.

### ItemReport moderation

```text
visible -> hidden
hidden  -> visible
```

Repeating the current state is a `409` conflict, not a silent success. This
forces stale administrator screens to reload before making a new decision.

## 9. Visibility and workflow integration

### Member report browsing

Ordinary report lists always include `moderationStatus != hidden`, including
when the viewer owns a result. A hidden report therefore leaves shared search
and browse pages.

Direct report detail permits a submitted report when either:

- it is not hidden; or
- its `reporterId` equals the current viewer ID.

A hidden report requested by any other member returns the same `REPORT_NOT_FOUND`
response as an absent report. The owner response includes
`moderationStatus: "hidden"` but no administrator note, flag reason, flagger or
audit data.

### Intelligent matching

Both source and candidate queries require `moderationStatus != hidden`.
An owner cannot generate new candidates from a hidden source report. A hidden
candidate cannot appear in another report's matches. Existing deterministic
scoring, limits and explanations are unchanged.

### Ownership Claims

Question retrieval and Claim creation require the target found report to be
visible at the moment of the operation. This closes stale browser pages after
an administrator hides a report.

Existing Claim history, claimant Claim detail, staff review, decision,
withdrawal and handover completion continue to load their report context
without a moderation filter. Hiding does not cancel, reject or resolve a Claim
and does not change report recovery status. These already-authorised workflows
remain available so moderation cannot corrupt recovery records.

### Report creation and safe contracts

New reports receive `moderationStatus: "visible"` from the model default.
Owner and member mappers normalise a missing legacy value to `visible`.
Browser schemas and tests adopt the required field so malformed or unknown
moderation values fail closed.

## 10. Transaction and concurrency rules

Flag submission uses the pending unique index as the final duplicate authority.
The service verifies submitted status, visibility and non-ownership immediately
before creation. A report hidden concurrently with submission may leave a
pending flag attached to an already hidden report, but it cannot expose or
restore content. The administrator queue can resolve that flag, and every hide
operation attempts to action all pending flags visible in its transaction.
This safe, rare race does not justify adding a mutable counter or locking field
to every report.

Administrator mutations use a MongoDB transaction:

1. Re-authorise the actor against an active administrator `User` record.
2. Load the canonical flag and/or submitted report.
3. Compare exact supplied `updatedAt` values.
4. Enforce the allowed current states.
5. Conditionally update the report and flag records using their current states
   and timestamps in the database filter.
6. Update other pending flags when a report becomes hidden.
7. Insert the immutable moderation event.
8. Commit only when every required write succeeds.

No response is returned before the transaction and session have completed.
Known moderation errors are preserved; every database, mapper, session or
programming failure becomes one safe internal error.

## 11. Error contract

The feature owns a closed moderation error domain while reusing the existing
authentication response:

| Condition | HTTP | Code | Safe message |
| --- | ---: | --- | --- |
| Invalid query, route ID or body | 400 | `VALIDATION_ERROR` | `Moderation request is invalid` |
| Missing, expired or revoked session | 401 | existing auth code | existing authentication message |
| Account is not active for member flagging | 403 | `ACTIVE_ACCOUNT_REQUIRED` | `An active account is required` |
| Account is not an active administrator | 403 | `ADMINISTRATOR_REQUIRED` | `Administrator access required` |
| Member attempts to flag own report | 403 | `REPORT_FLAG_FORBIDDEN` | `Report cannot be flagged` |
| Report is absent, draft or hidden from viewer | 404 | `REPORT_NOT_FOUND` | `Report not found` |
| Flag is absent | 404 | `REPORT_FLAG_NOT_FOUND` | `Report flag not found` |
| Same member already has a pending flag | 409 | `REPORT_FLAG_ALREADY_PENDING` | `A pending flag already exists` |
| Flag status or timestamp is stale | 409 | `REPORT_FLAG_STATE_CONFLICT` | `Report flag state has changed` |
| Report moderation state or timestamp is stale | 409 | `REPORT_MODERATION_CONFLICT` | `Report moderation state has changed` |
| Unknown or internal failure | 500 | `REPORT_MODERATION_FAILED` | `Report moderation could not be completed` |

Validation responses may include bounded field-error arrays. Other responses
contain only the fixed code and message. Duplicate-key errors map to
`REPORT_FLAG_ALREADY_PENDING` only for the named pending-flag unique index.
Routes never return raw exceptions, database errors, index metadata, response
bodies, stack traces or private fields.

## 12. Privacy and security

- Authentication and role checks precede validation and model access.
- All object IDs use the repository's canonical lowercase ObjectId boundary.
- Zod strict objects reject client-supplied ownership, status, actor, review and
  audit fields.
- Report lists and flag queues use bounded fixed-size pagination.
- Search input is bounded and uses the existing MongoDB text index; it is never
  inserted into an executable regular expression.
- Member flag details are available only through the administrator flag queue.
- Member and administrator identities remain in database records but are never
  serialised by moderation endpoints.
- Private verification details, expected answers, exact locations, serial
  numbers and private notes are never queried by moderation services.
- Hidden reports use not-found semantics for non-owners to avoid confirming
  restricted content.
- Moderation events are append-only and contain controlled text only.
- No data is placed in local storage, session storage, URLs beyond approved
  filters, logs or external services.
- `.env.local` remains ignored and automated tests mock database boundaries.

## 13. Component boundaries

Keep the implementation in a focused `web/src/lib/moderation` domain:

- `access.ts`: active-member and active-administrator invariants;
- `contracts.ts`: safe member receipt, administrator report and flag mappers;
- `validation.ts`: strict query, body and canonical ID schemas;
- `errors.ts`: fixed error definitions and response mapping;
- `flag-service.ts`: member flag creation only;
- `admin-service.ts`: administrator lists and transactional decisions only.

Models remain in `web/src/models`. Thin App Router handlers perform access,
validation, service calls and safe response mapping. Existing report and Claim
services receive only the visibility predicates required by Section 9. No base
repository, generic CRUD service, event bus or moderation plugin is introduced.

## 14. Testing strategy

### Models and contracts

- Moderation enums, defaults and legacy `visible` normalisation.
- ReportFlag validation, review-field consistency and partial unique index.
- Immutable moderation event action/state invariants and indexes.
- Safe mappers reject incomplete documents and exclude every identity and
  private verification field.

### Validation and access

- Active student, staff and administrator member-flag permission matrix.
- Suspended, deactivated and unauthenticated denial before model access.
- Active-administrator-only list and mutation matrix.
- Canonical IDs, unknown fields, repeated query parameters, bounds, exact ISO
  timestamps and the `other`-details requirement.

### Member flagging

- Submitted visible non-owned report succeeds with a minimal receipt.
- Own, draft, hidden and absent reports fail with the approved distinction.
- Duplicate pending flag maps only the named index to `409`.
- Resolved prior flag permits a later new pending flag.
- No response exposes details or identities.

### Administrator queries

- Keyword, type, recovery-status, moderation-status, flag-status and reason
  filters combine correctly.
- Fixed pagination, deterministic sorting and page totals.
- Report summaries expose only approved report-authored moderation data.
- Flag summaries expose details and resolution notes only to administrators and
  omit both member and administrator identities.

### Administrator decisions

- Dismiss, hide via flag, direct hide and restore happy paths.
- Hiding actions all pending flags visible in the transaction.
- Restoring does not reopen resolved flags.
- Exact optimistic-concurrency filters and conflicts.
- Actor re-authorisation within every transaction.
- Report, flag, audit and session failures roll back and map safely.
- A resolved flag and an unchanged moderation state cannot be mutated again.

### Cross-feature regression

- Hidden reports disappear from ordinary lists and non-owner detail.
- Owners can load a hidden report directly and see only its moderation state.
- Hidden source and candidate reports do not enter matching.
- Hidden reports reject new Claim questions and Claim creation.
- Existing claimant history/detail and staff Claim review/handover remain
  functional for previously created Claims.
- Report submission still returns the strict safe owner contract.
- Existing administrator, notification, report and Claim suites remain green.

### Quality gates

Run focused tests, the complete Vitest suite, ESLint, standalone TypeScript,
the Next.js production build and `npm audit`. Verify the build lists all new
routes and audit reports zero vulnerabilities. Confirm `.env.local` remains
ignored and scan the complete diff for credentials, DELETE operations, private
verification fields and dependency changes.

## 15. Acceptance criteria

The issue is complete when:

- an active member can flag a visible submitted report they do not own;
- a member cannot create two pending flags for the same report;
- only an active administrator can list or mutate moderation records;
- administrators can filter and paginate submitted reports and report flags;
- administrators can dismiss a flag, hide its report, directly hide a report
  and restore a hidden report;
- every decision uses optimistic concurrency and writes immutable audit
  evidence in the same transaction;
- hiding never deletes or rewrites a report's recovery or Claim state;
- hidden reports leave browse, non-owner detail, new Claim and matching paths;
- owners and existing authorised Claim workflows retain safe required access;
- no moderation response exposes reporter/flagger/administrator identities or
  private verification data;
- legacy reports behave as visible without a migration;
- all focused, regression and full quality gates pass;
- no dependency is added and no real database is accessed by tests.

## 16. Implementation sequence

1. Extend ItemReport and add the two focused moderation models.
2. Add strict contracts, validation, access and safe errors.
3. Implement member flag submission and route.
4. Implement administrator report and flag queries and routes.
5. Implement transactional flag decisions and direct moderation.
6. Integrate moderation visibility into report, matching and new-Claim paths.
7. Run full regression, privacy/scope scans and record verification evidence.
