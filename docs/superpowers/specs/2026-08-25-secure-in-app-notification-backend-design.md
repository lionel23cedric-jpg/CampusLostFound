# Secure In-App Notification Backend Design

**Date:** 2026-08-25  
**Issue:** #35  
**Proposed title:** Add secure in-app notification backend

## Goal

Add a persistent, privacy-safe in-app notification backend for the existing
Claim lifecycle. Notifications must respect each recipient's saved preferences,
survive page refreshes, expose a stable unread state, and be committed atomically
with the Claim transition that produced them.

This closes the largest remaining core-functional gap in the project brief:
notifying users about Claim updates, status changes, and controlled handover
guidance. It deliberately builds on the existing Profile preferences and Claim
state machine instead of adding a second workflow.

## Scope

This issue will:

- add a persisted `Notification` model and indexes;
- create typed notifications for existing Claim transitions;
- respect active-account state and the relevant Profile preference;
- write notifications in the same MongoDB transaction as the Claim change;
- expose an authenticated, cursor-paginated notification list;
- expose an authenticated, idempotent mark-as-read operation;
- return only controlled, recipient-safe public notification content;
- add focused model, delivery, service, route, integration, and regression tests;
- document verification without reading or exposing real credentials.

## Out of scope

- A notification-centre page, header badge, or other frontend.
- Email, SMS, push notifications, WebSockets, or polling infrastructure.
- Background jobs, scheduled delivery, retries outside MongoDB transactions, or
  external queues.
- Possible-match notifications. The current matching feature is intentionally
  user-initiated and has no background trigger.
- Persisted Match records or changes to the explainable matching score.
- Free-form staff messages, chat, contact-detail exchange, or handover scheduling.
- Mark-all-read, notification deletion, notification administration, or retention
  policies.
- New runtime dependencies.

## Considered approaches

### Chosen: persisted notifications written with Claim transitions

Each eligible event creates a structured Notification record in the same MongoDB
transaction as its Claim state change. The list API reads these records and
derives controlled presentation text from the notification kind.

This approach provides durable unread state, reliable delivery, auditability,
idempotency, and a clean contract for a later frontend.

### Rejected: compute an activity feed when it is requested

Deriving notifications from current Claim records would require less storage, but
could not represent when an event became visible, whether it had been read, or
whether a user had opted into the event when it happened. It would also make a
future notification centre less reliable.

### Rejected: begin with external email or SMS

External delivery introduces credentials, vendor dependencies, personal-data
handling, retry semantics, and cost. Those concerns are disproportionate for the
first notification slice and are unnecessary to satisfy the core in-app workflow.

## Notification event catalogue

The persisted `kind` is one of:

| Kind | Trigger | Recipient | Preference | Safe action |
| --- | --- | --- | --- | --- |
| `claim_received` | A student creates a pending Claim | Report owner | `claimUpdates` | View the report |
| `claim_withdrawn` | A claimant withdraws a pending or approved Claim | Report owner | `claimUpdates` | View the report |
| `claim_approved` | Staff approves a pending Claim | Approved claimant | `statusChanges` | View the Claim |
| `claim_rejected` | Staff rejects a Claim, including competing Claims rejected by an approval | Rejected claimant | `statusChanges` | View the Claim |
| `claim_handover_ready` | Staff approves a pending Claim | Approved claimant | `handoverInstructions` | View the Claim |
| `claim_completed` | Staff completes an approved Claim | Claimant | `statusChanges` | View the Claim |
| `report_recovered` | Staff completes an approved Claim and resolves the report | Report owner | `statusChanges` | View the report |

If an approved claimant has enabled both `statusChanges` and
`handoverInstructions`, the approval intentionally produces two distinct records:
one records the decision and one supplies controlled next-step guidance. This
preserves the meaning of the two independent preferences.

Staff and administrators are not fanned out notifications for new Claims. They
already have a role-protected review queue, and unbounded role-wide delivery would
create noise and unnecessary data growth.

## Recipient eligibility and preference semantics

Before inserting an event, the delivery helper checks the intended recipient in
the same session:

1. The User exists and has `status: "active"`.
2. A Profile exists for that User.
3. The event's mapped notification preference is `true`.

If any check fails, the event is skipped. A missing Profile or inactive recipient
is treated as no consent rather than causing the Claim operation to fail. If the
recipient is eligible and opted in, failure to write the notification fails the
transaction so the business transition and its promised notification cannot
diverge.

Changing preferences affects only future events. Existing notifications remain
available because they reflect consent at delivery time and retain the user's
read history.

## Data model

Add `web/src/models/notification.ts` with this logical shape:

```ts
type NotificationKind =
  | "claim_received"
  | "claim_withdrawn"
  | "claim_approved"
  | "claim_rejected"
  | "claim_handover_ready"
  | "claim_completed"
  | "report_recovered";

type Notification = {
  recipientId: ObjectId;
  kind: NotificationKind;
  reportId: ObjectId;
  claimId: ObjectId;
  eventKey: string;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
```

Constraints:

- `recipientId`, `kind`, `reportId`, `claimId`, and `eventKey` are required.
- `eventKey` is trimmed, bounded, and unique.
- `readAt` defaults to `null`.
- No title, message, actor identity, review note, verification response, contact
  detail, or arbitrary metadata is persisted.

Indexes:

```ts
{ recipientId: 1, createdAt: -1, _id: -1 }
{ recipientId: 1, readAt: 1 }
{ eventKey: 1 } // unique
```

The deterministic event key is versioned and includes the event kind, Claim,
recipient, and schema version, for example:

```text
notification:v1:claim_approved:<claimId>:<recipientId>
```

One Claim can reach each current terminal or transition kind at most once, so
this identity is stable. Delivery uses `$setOnInsert` upserts in the caller's
session, making transaction callback retries safe.

## Delivery boundary

Add `web/src/lib/notifications/delivery.ts`. It accepts only typed event plans and
a required MongoDB `ClientSession`; callers cannot provide display text.

The helper will:

1. validate the plan through internal typed constructors;
2. deduplicate equal event keys within the batch;
3. load eligible active Users and their Profiles using the supplied session;
4. retain only opted-in plans;
5. issue idempotent `$setOnInsert` upserts with the same session;
6. return no public notification data to the Claim service.

No delivery operation opens or commits its own transaction. Transaction ownership
remains with the Claim service that owns the state change.

## Claim-service integration

### Create Claim

The internal report projection includes `reporterId` without adding it to the
public response. After Claim and evidence creation, the transaction plans one
`claim_received` event for the report owner.

### Withdraw Claim

After the conditional Claim update and any report reopening, the transaction
loads the report owner and plans one `claim_withdrawn` event. A stale or invalid
withdrawal creates no notification.

### Staff decision: rejection

After a successful pending-to-rejected conditional update, the transaction plans
one `claim_rejected` event for that claimant.

### Staff decision: approval

Before rejecting competing pending Claims, the transaction selects their `_id`
and `claimantId`. It then:

1. conditionally updates the report to `claim_pending`;
2. conditionally approves the selected Claim;
3. conditionally rejects the selected competing Claim IDs;
4. verifies the competing update count matches the selected records;
5. plans `claim_approved` and `claim_handover_ready` for the approved claimant;
6. plans one `claim_rejected` for every affected competing claimant.

Any stale write or notification failure aborts the transaction.

### Complete Claim

After the conditional Claim completion and report resolution, the transaction
plans `claim_completed` for the claimant and `report_recovered` for the report
owner.

## Public contracts

The public contract is a strict server-owned shape:

```ts
type PublicNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  summary: string;
  action: {
    label: string;
    href: string;
  };
  createdAt: string;
  readAt: string | null;
  isRead: boolean;
};
```

`title`, `summary`, `action.label`, and `action.href` are generated from a total,
exhaustively tested mapping of `kind` to controlled copy. They never interpolate
claimant identity, report title, review notes, verification evidence, contact
details, database text, or actor-supplied content.

Owner-facing events link to `/reports/{reportId}`. Claimant-facing events link to
`/claims/{claimId}`. Identifiers are converted only after model validation.

## API design

### `GET /api/notifications`

Authentication and account rules:

- no valid session: `401`;
- authenticated but non-active account: `403`;
- active student, staff, or administrator: permitted, but only for their own
  `recipientId`.

Query parameters:

- `pageSize`: optional integer, default `20`, range `1..50`;
- `cursor`: optional opaque Base64URL cursor with a bounded encoded length.

Unknown keys, duplicate keys, malformed integers, malformed Base64URL, invalid
dates, invalid ObjectIds, or trailing cursor data return the existing safe
validation response.

The decoded cursor contains `createdAt` and `_id`. The query always includes the
recipient boundary and applies a stable descending seek over
`{ createdAt, _id }`.

Successful response:

```json
{
  "notifications": [],
  "pagination": {
    "nextCursor": null,
    "hasMore": false
  },
  "unreadCount": 0
}
```

The service requests at most `pageSize + 1` records to determine `hasMore` and
counts all unread records for the current recipient independently of the page.
An empty inbox returns `200` with the same stable shape.

### `PATCH /api/notifications/{id}/read`

- Requires the same active authenticated account boundary.
- Requires a canonical MongoDB ObjectId route parameter.
- Accepts no body or a strict empty JSON object; unknown fields, malformed JSON,
  or oversized content are rejected.
- Performs one ownership-filtered atomic update pipeline that assigns `readAt`
  only when its current value is `null`.
- If already read, preserves the original `readAt` and returns success.
- A missing notification and another user's notification both return `404`.
- Returns the updated `PublicNotification` in a stable response object.

Marking a notification read is intentionally not transactional with another
business record because it mutates only recipient-owned presentation state.

## Error and privacy design

- Routes reuse the established authentication boundary and safe request-body
  handling patterns.
- Service errors use a closed notification error-code union.
- Database and unexpected errors map to a generic operation-failed response.
- Rejected route parameters, bodies, cursors, and database errors are never
  included in the response.
- Ownership filtering occurs in the database query, not after loading a record.
- `recipientId`, claimant identity, reporter identity, `reviewedBy`, `reviewNote`,
  verification questions/answers/match counts, contact preferences, and hidden
  report fields never appear in the public contract.
- Static notification copy prevents stored or reflected HTML/script injection.
- Tests use mocked models and sessions and never read `.env.local` or connect to
  the real Atlas cluster.

## Testing strategy

### Model tests

- required fields, kind enum, default `readAt`, and timestamp
  behaviour;
- recipient/date, recipient/read, and unique event-key indexes;
- bounded event-key validation.

### Delivery tests

- correct preference mapping for every kind;
- active opted-in recipient insertion;
- disabled preference, inactive account, missing User, and missing Profile skip;
- deterministic keys, in-batch deduplication, and idempotent `$setOnInsert`;
- every read and write uses the caller's session;
- database failures are preserved so the owner transaction can roll back.

### Claim integration tests

- exact event plans for create, pending withdrawal, approved withdrawal, direct
  rejection, approval, competing rejection, and completion;
- multiple competing claimants receive their own notifications;
- no event is planned before a conditional state update succeeds;
- stale transitions and transaction failures create no committed state;
- current Claim public contracts remain unchanged.

### Notification service and route tests

- current-recipient isolation and active-account enforcement;
- bounded cursor pagination with tied timestamps;
- unread count independent of the current page;
- strict query, cursor, route-ID, content-type, UTF-8, and body validation;
- idempotent read updates and preservation of the original `readAt`;
- indistinguishable not-found and not-owned responses;
- exact public schema and absence of every private field/error source.

### Regression and quality gates

```powershell
npm test
npm run lint
npm exec -- tsc --noEmit --incremental false
npm run build
npm audit
```

All automated tests run without real Atlas access. Any later manual Atlas check
must use the existing ignored `.env.local`, must not display its value, and is not
required for this issue's unit/integration gate.

## Acceptance criteria

- A validated, indexed Notification model exists.
- Every catalogue event is written for exactly the specified recipients and
  preference.
- Eligible notification writes are atomic with their Claim transition.
- Transaction retries and repeated event plans do not duplicate notifications.
- `GET /api/notifications` is strictly validated, cursor-paginated, and isolated
  to the active current user.
- `PATCH /api/notifications/{id}/read` is ownership-safe and idempotent.
- Public notifications contain only controlled, privacy-safe content and links.
- Existing Claim APIs and public contracts remain compatible.
- Focused and full test suites, lint, TypeScript, production build, and audit pass.
- A verification document records the evidence and explicitly confirms that no
  real credentials or private Claim data were exposed.

## Follow-up

The next independent issue should add an accessible notification centre that
loads this API only after authentication, displays unread state without relying
on colour alone, supports loading/empty/error/retry/expired-session states, marks
individual notifications read, and remains usable at 320-pixel width. Possible-
match delivery, external channels, realtime updates, and free-form communication
remain separate designs.
