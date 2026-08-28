# Staff Report Verification and Storage Design

**Date:** 2026-08-29
**Status:** Approved for specification
**Target branch:** `feature/staff-report-verification-storage`

## Course alignment

The course brief requires campus staff or item handlers to verify reports,
manage item storage, update recovery status, and communicate with claimants.
The application already provides ownership-Claim review, recovery completion,
safe status notifications, and administrator report moderation. It does not
provide a staff workflow for verifying reports themselves or recording where a
found item is held before recovery.

This feature closes that remaining staff workflow gap. It deliberately remains
a small campus lost-and-found workflow rather than becoming a general inventory
or warehouse system.

## Goal

Give active staff and administrators one protected workspace where they can:

- review visible active reports;
- mark a Lost or Found report as staff verified;
- record or update the internal campus storage location of a verified Found
  item; and
- see a stored item become released automatically when the existing Claim
  handover is completed.

## Success criteria

- Only active `staff` and `administrator` accounts can use the staff report
  APIs and pages.
- Lost and Found reports can move from `pending` to `verified` exactly once.
- Only verified Found reports can be recorded as `stored`.
- A stored Found item retains a short staff-only storage location, intake time,
  and the most recent staff actor.
- Updating a stored item's location retains its original intake time.
- Completing an approved Claim automatically changes a corresponding stored
  item from `stored` to `released` in the existing transaction.
- Legacy reports without staff-handling data remain usable and are interpreted
  safely without a database migration.
- Member, owner-history, search, matching, notification, and public report
  responses never expose staff-handling data.
- Staff mutations reject stale state with HTTP 409 rather than overwriting a
  concurrent change.
- The workspace remains accessible and usable at 320 CSS pixels.
- No dependency, external API, scanner, object-storage service, or general
  inventory subsystem is added.

## Non-goals

- A warehouse, shelf catalogue, stock count, QR/barcode system, or bulk import
- Reporter or claimant chat
- A second report-moderation or report-rejection workflow
- Manual release outside the existing approved-Claim completion workflow
- Editing member-submitted report content or private verification evidence
- Exposing reporter identity, exact private location, serial number, expected
  verification answers, private notes, or storage location to members
- Automatic email, SMS, push notifications, or new notification kinds
- Storage analytics, exports, charts, reports, or retention policies
- A separate handling collection, event ledger, or schema migration
- Connecting tests to MongoDB Atlas

## Approaches considered

### Selected: private handling subdocument on `ItemReport`

Add one staff-only `staffHandling` subdocument to the existing report model.
The subdocument is excluded by default and is included only by explicit staff
projections. Its state is one-to-one with the report, so storage and report
lifecycle changes can remain atomic and list queries need no join.

This is the smallest complete design and follows the project's document-model
approach without weakening the public serializers.

### Separate report-handling collection

A separate collection would isolate storage data physically, but it would add
join queries, lifecycle synchronisation, orphan handling, indexes, and a second
concurrency token for data that cannot exist independently from a report. The
course brief does not require a general inventory entity, so this approach is
rejected as unnecessary complexity.

### Extend ownership Claims only

Adding storage fields to `Claim` would be smaller initially, but an item may be
verified and stored before any Claim exists. It would also leave Lost-report
verification uncovered and duplicate data across rejected or competing
Claims. This approach does not satisfy the staff requirement.

## Existing foundations

The feature reuses:

- `ItemReportModel`, report lifecycle and moderation states;
- explicit report projections and serializers that already fail closed;
- active staff/administrator access rules used by Claim review;
- strict Zod request and browser-response validation;
- the existing transaction in `completeClaim()`;
- same-origin authenticated image delivery and safe photo-reference rules;
- fixed pagination, stale-request protection, session-expiry handling, focus
  restoration, and responsive workspace patterns;
- the existing flagging and administrator moderation workflow for suspicious
  reports; and
- the current notification flow for Claim decisions and recovery completion.

`PrivateVerificationDetailsModel` is not queried by this feature. Report
verification does not grant broader access to ownership secrets.

## Data design

### Embedded staff-handling state

`ItemReport` gains a `staffHandling` subdocument that is excluded by default:

```ts
type StaffReportHandling = {
  verificationStatus: "pending" | "verified";
  verifiedBy: ObjectId | null;
  verifiedAt: Date | null;
  custodyStatus: "not_applicable" | "not_held" | "stored" | "released";
  storageLocation: string | null;
  storedAt: Date | null;
  releasedAt: Date | null;
  updatedBy: ObjectId | null;
};
```

The whole subdocument uses `select: false`. Staff services must opt in with an
explicit `+staffHandling` selection. Existing public projections continue to
list approved fields and therefore do not include it.

New reports receive explicit defaults inside the existing creation
transaction:

| Report type | Verification | Custody |
|---|---|---|
| Lost | `pending` | `not_applicable` |
| Found | `pending` | `not_held` |

No new collection or index is required. Coursework-scale filters use the
existing report collection and indexes, with a deterministic `_id` tiebreaker.

### Legacy compatibility

An existing report may not contain `staffHandling`. Staff serializers and
queries interpret absence as:

- `verificationStatus: pending`;
- `custodyStatus: not_applicable` for Lost reports; or
- `custodyStatus: not_held` for Found reports;
- all actor, location, and timestamp fields `null`.

A successful staff mutation writes a complete valid subdocument. There is no
startup backfill, migration script, or hidden Atlas access.

### State invariants

- `pending` requires `verifiedBy` and `verifiedAt` to be `null`.
- `verified` requires both `verifiedBy` and `verifiedAt`.
- Lost reports always use `not_applicable` and have no storage location or
  custody timestamps.
- Found `not_held` reports have no location or custody timestamps.
- Found `stored` reports must be verified and require a trimmed storage
  location, `storedAt`, and no `releasedAt`.
- Found `released` reports must be verified and retain their last internal
  location and `storedAt`, with a required `releasedAt`.
- `updatedBy` is set on every staff mutation and on automatic release.
- Verification is one-way. An error or suspicious report is handled through
  the existing flag and administrator moderation workflow instead of adding a
  second rejection state.
- Release is one-way and occurs only through existing Claim completion.

Schema validation rejects any stored combination that violates these rules.

### Storage location

`storageLocation` is a staff-entered internal reference such as
`Library service desk - locker B12`. It is trimmed, contains 2 to 160 printable
characters, rejects control characters, and is never interpreted as HTML,
Markdown, a URL, a database selector, or a campus-location identifier.

The field remains after release as staff-only recovery evidence. It is not an
inventory hierarchy and has no separately managed reference data.

## Authorisation and visibility

- Every route resolves the session before parsing caller input.
- The service repeats the active `staff` or `administrator` check; browser
  access boundaries are presentation only.
- Student, suspended, deactivated, missing, expired, and internally
  inconsistent sessions fail through controlled existing auth responses.
- Staff list and detail queries exclude `draft`, `closed`, and hidden reports.
  A hidden report must be restored by an administrator before staff handling
  continues.
- Mutations permit only visible `open` or `claim_pending` reports.
- Resolved reports may appear as read-only released history but cannot be
  verified or moved.
- Responses do not include `reporterId`, profile/contact data,
  `PrivateVerificationDetails`, Claim evidence, moderation notes, MongoDB
  metadata, or any authority field supplied by the caller.
- Ordinary report, owner-history, matching, image, Claimant, notification, and
  administration serializers are unchanged unless a focused regression fix is
  required to preserve omission.

## HTTP contracts

### `GET /api/staff/reports`

Accepted optional query parameters are exactly:

```ts
type StaffReportListQuery = {
  reportType?: "lost" | "found";
  reportStatus?: "open" | "claim_pending" | "resolved";
  verificationStatus?: "pending" | "verified";
  custodyStatus?: "not_applicable" | "not_held" | "stored" | "released";
  page?: number;
};
```

Rules:

- unknown and repeated parameters are rejected;
- page defaults to `1`, is canonical, and is at most `10_000`;
- page size is fixed at `10` and cannot be supplied by the caller;
- incompatible filters, such as `reportType=lost&custodyStatus=stored`, are
  rejected rather than silently ignored;
- absence of `reportStatus` means the active lifecycle states `open` and
  `claim_pending`; `resolved` history must be requested explicitly;
- absence of the other filters means no filter for that dimension;
- the page's initial queue explicitly selects `verificationStatus=pending`;
- results are oldest first so long-waiting reports remain visible;
- `_id` is the deterministic tiebreaker; and
- a page beyond the result set returns an empty array and accurate metadata.

The response contains a controlled report summary, normalised handling state,
and pagination. It includes no storage location in list rows; the internal
location is returned only by authorised detail.

### `GET /api/staff/reports/{reportId}`

Returns a controlled staff detail with:

- report ID, type, title, public description, category and campus-location
  IDs, event date, colours, tags, approved photo references, lifecycle and
  moderation status, and timestamps;
- normalised verification and custody state;
- authorised detail-only `storageLocation`; and
- staff actor IDs and handling timestamps required for accountability.

It does not return private verification details, reporter identity, claimant
data, Claim evidence, review notes, or moderation notes. External HTTPS image
references may be shown as text but are never embedded automatically.

### `POST /api/staff/reports/{reportId}/verify`

Strict body:

```ts
{ expectedUpdatedAt: string }
```

The action requires a visible active report whose normalised verification
state is `pending` and whose exact current `updatedAt` matches the input. It
sets `verified`, `verifiedBy`, `verifiedAt`, and `updatedBy`. Repeated, stale,
ineligible, or concurrent actions return 409.

### `PUT /api/staff/reports/{reportId}/storage`

Strict body:

```ts
{
  expectedUpdatedAt: string;
  storageLocation: string;
}
```

The action requires a visible, verified, active Found report. From `not_held`
it records `stored`, the location, `storedAt`, and `updatedBy`. From `stored`
it updates only the location and `updatedBy`, retaining the original
`storedAt`. Lost, pending, released, resolved, closed, hidden, stale, and
malformed requests fail safely.

### Existing Claim completion

`completeClaim()` keeps its current public endpoint and response. Inside its
existing transaction it reads the report's staff-handling state:

- a Found report currently marked `stored` becomes `released` with
  `releasedAt` and the completing staff user as `updatedBy`;
- Lost, `not_held`, or legacy reports complete normally without inventing a
  storage history; and
- a concurrent handling change causes the transaction to retry or fail safely
  rather than overwrite the change.

The report and Claim still move to `resolved` and `completed`, and existing
notifications remain unchanged.

## Errors and concurrency

| Condition | Status | Public result |
|---|---:|---|
| Invalid ID, query, body, timestamp, or location | 400 | Safe validation response |
| Missing or invalid session | 401 | Existing authentication-required response |
| Authenticated but not active staff/admin | 403 | `STAFF_REPORT_FORBIDDEN` |
| Inaccessible or missing report | 404 | `STAFF_REPORT_NOT_FOUND` |
| Stale timestamp or invalid transition | 409 | `STAFF_REPORT_STATE_CONFLICT` |
| Unexpected service/database failure | 500 | `STAFF_REPORT_OPERATION_FAILED` |

Mutation filters include report ID, expected `updatedAt`, allowed lifecycle and
moderation state, report type where required, and current handling state. A
forged error object, rejected route parameter, Mongoose validation error, or
transaction detail is always reduced to an approved public error.

## Browser contract

The staff report browser client uses strict Zod schemas for complete success
and error responses. It rejects:

- unknown response keys or enum values;
- inconsistent report type and custody combinations;
- missing actor/time pairs;
- stored or released states without an internal location and intake time;
- released state without release time;
- noncanonical timestamps, invalid photo references, and inconsistent
  pagination; and
- any accidental reporter, private-verification, Claim-evidence, password,
  session, database, or moderation-note fields.

Requests use same-origin credentials, an abort signal, and only the approved
parameters or bodies. Authentication expiry redirects safely to `/login`.

## Page architecture

### Routes and navigation

- `/staff/reports` provides the queue and handling-history list.
- `/staff/reports/[id]` provides detail and allowed actions.
- The authenticated header gains `Report handling` for active staff and
  administrators beside the existing Claim-review link.
- The dashboard staff action area exposes both report handling and ownership
  Claim review without removing either workflow.
- Existing administrator, student, Claim, and owner-history destinations are
  preserved.

The existing staff access behaviour is reused. If a shared access boundary is
extracted to avoid duplicating the established retry, focus, role, and account
switching logic, existing Claim-review copy and tests must remain unchanged.

### Staff report list

The list contains native labelled selects for report type, lifecycle state,
verification state, and custody state, plus a clear-filters action. The initial
view is the active pending-verification queue. Filters and page number are
represented in the URL; filter changes reset to page one. The lifecycle select
must be changed explicitly to view resolved history.

Each semantic list item shows:

- report title linked to staff detail;
- Lost or Found type;
- lifecycle status;
- verification state;
- custody state;
- event and submission dates; and
- an optional same-origin uploaded-image thumbnail.

Storage location is intentionally absent from the list. External images are
not embedded. Initial loading, filtered loading, empty queue, filtered-empty,
invalid URL, unavailable, retry, stale request, and pagination states are
announced accessibly.

### Staff report detail

The detail page shows the controlled report fields, report image rules,
verification state, custody state, and staff-only storage location. It offers:

- `Mark report verified` while pending;
- a labelled storage-location form for a verified active Found report; and
- `Update storage location` while stored.

The UI displays released history as read-only. It does not offer report edits,
manual lifecycle changes, manual release, private evidence, Claim decisions,
or moderation controls.

Mutation buttons use a single-flight guard. State-conflict responses reload the
latest detail and move focus to a clear conflict notice. A successful action
announces the new state without exposing internal values in global
notifications.

## Accessibility and responsive behaviour

- Use semantic headings, lists, forms, labels, descriptions, buttons, and
  status/alert regions.
- Status is expressed in text rather than colour alone.
- Touch targets remain at least 44 by 44 CSS pixels.
- Keyboard focus is restored after retry, successful mutation, conflict
  refresh, account change, and authentication expiry without stealing focus
  during passive loading.
- Reserved image dimensions prevent layout shift.
- At 320 CSS pixels, controls stack vertically and content wraps without
  horizontal page scrolling.
- No animation is required; reduced-motion users receive the same workflow.

## Testing strategy

### Model and normalisation tests

- explicit defaults for new Lost and Found reports;
- safe normalisation of legacy missing state;
- valid pending, verified, stored, and released combinations;
- rejection of every invalid actor, timestamp, type, location, and custody
  combination; and
- default exclusion of `staffHandling`.

### Validation and contract tests

- all accepted list filters, active lifecycle defaults, and compatible
  combinations;
- canonical page, ID, ISO timestamp, and storage-location boundaries;
- rejection of repeated, unknown, incompatible, padded, signed, decimal,
  control-character, overlong, and authority-bearing input;
- strict success/error response parsing; and
- rejection of privacy leaks and inconsistent state combinations.

### Service tests

- active staff and administrator permission matrix;
- visible lifecycle boundary and hidden-report exclusion;
- fixed pagination, ownership-independent staff scope, and deterministic order;
- legacy-state filtering and normalisation;
- one-way verification with actor/time capture;
- first storage, location update, and retained intake time;
- Lost, unverified, released, resolved, hidden, and stale conflicts;
- automatic stored-to-released transition inside Claim completion;
- unchanged Claim completion for Lost, not-held, and legacy reports;
- concurrent update protection; and
- safe database/transaction failure reduction.

All database operations are mocked; tests do not access Atlas.

### Route tests

- session resolution before parsing;
- missing, expired, inactive, student, staff, and administrator matrices;
- exact service arguments derived from the authenticated identity;
- rejected route parameters and malformed bodies;
- exact status/error mapping; and
- response scans for storage-list leakage, reporter identity, private
  verification data, Claim evidence, secrets, tokens, and MongoDB metadata.

### Browser and component tests

- exact same-origin requests and full response validation;
- queue filters, URL state, pagination, and clear filters;
- loading, empty, filtered-empty, invalid, error, retry, auth-expiry, and stale
  request states;
- detail rendering and every permitted/forbidden action state;
- single-flight mutation, success, failure, retry, and conflict refresh;
- internal-image-only embedding;
- staff/administrator access and active-account navigation;
- preservation of existing Claim-review behaviour after any shared-boundary
  refactor; and
- semantic, focus, announcement, touch-target, and 320-pixel behaviour.

### Regression and final gates

Run focused tests after each implementation task, followed by:

```powershell
npm test
npm run lint
npm exec -- tsc --noEmit --incremental false
npm run build
npm audit
git diff --check
```

Confirm `.env.local` remains ignored, package manifests are unchanged, no real
Atlas connection occurred, and staff-handling keys do not appear in non-staff
responses or browser storage.

## Documentation and evidence

The verification record must include:

- the exact course staff requirement closed by the feature;
- the selected embedded-document rationale and deferred inventory scope;
- permission, privacy, legacy, concurrency, and Claim-integration evidence;
- screenshots or a short demonstration of the pending queue, verified Lost
  report, stored Found report, released history, errors, and 320-pixel layout;
- focused and repository-wide command results; and
- confirmation that private storage values were not exposed or persisted in
  browser storage.

## Acceptance criteria

- [ ] Add private, validated staff-handling state to `ItemReport` with safe
      legacy normalisation and explicit defaults for new reports.
- [ ] Add active-staff/administrator-only list and detail APIs with strict
      filtering, fixed pagination, explicit projections, and safe errors.
- [ ] Add one-way report verification with optimistic concurrency.
- [ ] Add Found-item storage creation and location update with staff-only data.
- [ ] Automatically mark stored Found items released when the existing Claim
      handover completes, without breaking legacy or Lost Claims.
- [ ] Add accessible responsive staff report list/detail pages and role-aware
      navigation.
- [ ] Preserve public, owner, matching, Claim, notification, image, moderation,
      authentication, and administration privacy and behaviour.
- [ ] Add focused model, validation, service, route, browser, component, and
      integration tests.
- [ ] Pass all repository-wide quality, dependency, privacy, scope, and
      whitespace gates without new dependencies or Atlas access.
