# Claim Management Backend Design

**Issue:** #19
**Status:** Awaiting final written review
**Date:** 2026-08-24

## 1. Purpose

This feature adds the secure backend foundation for ownership claims. An authenticated active student can answer a found report's verification questions and submit a claim. Staff and administrators can review private evidence, approve or reject the claim, and record a completed handover. The design completes the server-side path between report discovery and recovery without exposing the expected answers that prove ownership.

The feature follows the repository's existing patterns:

- Next.js App Router route handlers;
- Mongoose models backed by MongoDB Atlas;
- Zod validation at every HTTP trust boundary;
- revocable cookie sessions resolved through the existing authentication service;
- transactions for multi-document state changes;
- explicit response mappers instead of serialising database documents;
- Vitest tests with mocked database operations, not live Atlas records.

## 2. Scope

### Included

- `Claim` and `ClaimEvidence` data models.
- Verification-question retrieval without expected answers.
- Claim creation for eligible found reports.
- Claimant list, detail and withdrawal operations.
- Staff and administrator review queues and claim details.
- Staff approval, rejection and handover completion.
- Deterministic answer normalisation and match indicators.
- Transactional claim and report status changes.
- Strict validation, safe error envelopes and role-specific response mappers.
- Automated model, validation, mapper, service and route tests.

### Excluded

- Claimant or staff claim-management pages.
- Email, push, SMS or in-application notifications.
- Chat, handover-location scheduling or contact-message delivery.
- AI, semantic or fuzzy answer matching.
- Automatic approval or rejection based on answer matches.
- Administrator dashboards outside the staff claim queue API.
- Profile editing, role-management UI or account administration.
- Changes to the existing report-submission and report-browsing response contracts.
- Live Atlas test records or reading `.env.local` contents.

## 3. Actors and Authorisation

### Active student

An active student may:

- retrieve verification questions for an eligible report;
- submit a claim against another user's found report;
- list and view only their own claims;
- withdraw their own `pending` or `approved` claim.

A student never receives expected answers, answer-match results, staff notes, another claimant's identity or another claimant's evidence.

### Active staff or administrator

An active staff member or administrator may:

- list claims in the staff review queue;
- view a claim's controlled private evidence and match indicators;
- approve or reject a `pending` claim;
- record handover completion for an `approved` claim.

Staff responses may include the claimant's safe account and profile fields needed for review. They still exclude passwords, session tokens and the report's stored expected answers.

### Report owner

Owning the report does not grant evidence-review access. A student who reported a found item cannot inspect claimant answers unless their account independently has the `staff` or `administrator` role. This keeps proof-of-ownership material within the controlled staff workflow.

## 4. Claim Eligibility

A claim may be created only when all of the following are true:

- the caller is an authenticated active user with the `student` role;
- the report exists;
- `reportType` is `found`;
- report `status` is `open`;
- the caller is not the report owner;
- private verification details exist and contain at least one valid question;
- the caller has no active claim for the same report;
- the request supplies exactly one answer for every current verification question.

Multiple different users may hold `pending` claims for the same open report. The report remains `open` while staff compare those claims. It becomes `claim_pending` only when one claim is approved.

## 5. Data Model

### 5.1 Claim

The `claims` collection stores workflow state but not claimant answers.

| Field | Type | Rules |
|---|---|---|
| `reportId` | ObjectId ref `ItemReport` | Required |
| `claimantId` | ObjectId ref `User` | Required |
| `status` | string | `pending`, `approved`, `rejected`, `withdrawn` or `completed`; defaults to `pending` |
| `activeClaimKey` | string or null | `<reportId>:<claimantId>` while `pending` or `approved`; null in terminal states |
| `verificationQuestionCount` | integer | Required, minimum 1 |
| `verificationMatchedCount` | integer | Required, 0 through question count; `select: false` |
| `reviewedBy` | ObjectId ref `User` or null | Staff or administrator who made the decision |
| `reviewedAt` | Date or null | Set on approval or rejection |
| `reviewNote` | string or null | Trimmed, maximum 1000 characters, `select: false` |
| `completedAt` | Date or null | Set when handover is completed |
| `withdrawnAt` | Date or null | Set when the claimant withdraws |
| timestamps | Date | Mongoose `createdAt` and `updatedAt` |

Indexes:

- `{ claimantId: 1, createdAt: -1 }` for a claimant's history;
- `{ status: 1, createdAt: 1 }` for the review queue;
- `{ reportId: 1, status: 1, createdAt: 1 }` for competing claims;
- unique `{ activeClaimKey: 1 }` with a partial filter that indexes string values only.

The derived active key is the database-level concurrency guard. Application checks provide helpful errors; the unique index remains authoritative when two submissions race.

### 5.2 ClaimEvidence

The `claimEvidence` collection isolates private claimant responses.

| Field | Type | Rules |
|---|---|---|
| `claimId` | ObjectId ref `Claim` | Required and unique |
| `responses` | array | One snapshot per verification question |
| `responses.questionIndex` | integer | Zero-based stable index |
| `responses.question` | string | Question text snapshot, 5–200 characters |
| `responses.answer` | string | Original trimmed claimant answer, 1–500 characters, `select: false` |
| `responses.matched` | boolean | Deterministic comparison result, `select: false` |
| timestamps | Date | Mongoose `createdAt` and `updatedAt` |

The question snapshot preserves what the claimant answered if the source report changes later. Expected answers remain only in `PrivateVerificationDetails` and are never copied into a Claim or ClaimEvidence response.

## 6. Answer Normalisation

Answer matching assists staff; it does not decide ownership.

Both the stored expected answer and submitted answer pass through the same deterministic function:

1. Unicode `NFKC` normalisation;
2. trim leading and trailing whitespace;
3. replace every internal whitespace run with one space;
4. locale-aware lowercase using `en-NZ`;
5. exact string comparison.

The service stores the original trimmed claimant answer for staff review and stores only the resulting boolean for comparison. It never returns or logs the expected answer. No fuzzy threshold, embedding, model or external API is involved.

## 7. State Machine

```text
pending ──approve──> approved ──complete──> completed
   │                    │
   ├──reject──> rejected└──withdraw──> withdrawn
   └──withdraw──> withdrawn
```

All other transitions return `CLAIM_STATE_CONFLICT`.

### Create

- Create a `pending` Claim and its ClaimEvidence in one transaction.
- Keep the report `open`.
- Perform a conditional write to the report inside the transaction so claim creation serialises with an approval that may change the report from `open` to `claim_pending`.

### Approve

- Require the selected Claim to be `pending` and its report to be `open`.
- Change the selected Claim to `approved` and retain its active key.
- Set reviewer fields and the optional private review note.
- Change all other `pending` claims for the report to `rejected`, clear their active keys and set the approving reviewer and the same review timestamp.
- Change the report to `claim_pending`.

### Reject

- Require the selected Claim to be `pending`.
- Change it to `rejected`, clear the active key and set reviewer fields.
- Leave the report `open` and leave other pending claims unchanged.

### Withdraw

- A claimant may withdraw their own `pending` or `approved` Claim.
- Change it to `withdrawn`, clear the active key and set `withdrawnAt`.
- A pending withdrawal does not change the open report.
- An approved withdrawal conditionally changes the report from `claim_pending` back to `open`.

### Complete

- Require the Claim to be `approved` and the report to be `claim_pending`.
- Change the Claim to `completed`, clear the active key and set `completedAt`.
- Change the report to `resolved` and set `resolvedAt` to the same timestamp.

Each mutation uses a transaction plus conditional state filters. A repeated or stale request cannot silently overwrite a newer state.

## 8. API Design

All endpoints require an active authenticated account. Claimant endpoints require the `student` role; staff endpoints require `staff` or `administrator`. IDs must be valid MongoDB ObjectIds. JSON objects are strict and reject unknown fields.

### 8.1 Claimant endpoints

#### `GET /api/reports/[id]/claim-questions`

Returns an eligible report summary and question snapshots:

```json
{
  "report": {
    "id": "...",
    "title": "Black laptop charger",
    "reportType": "found"
  },
  "questions": [
    { "questionIndex": 0, "question": "What mark is near the plug?" }
  ]
}
```

It never returns `expectedAnswer`, private notes, exact private locations or serial numbers.

#### `POST /api/reports/[id]/claims`

Request:

```json
{
  "responses": [
    { "questionIndex": 0, "answer": "Small blue paint mark" }
  ]
}
```

Success: HTTP 201 with a claimant-safe Claim representation.

#### `GET /api/claims/mine`

Accepts bounded `page` and `pageSize` query values and an optional Claim status. It returns only claims owned by the current user, newest first, with pagination metadata.

#### `GET /api/claims/[id]`

Returns the current user's claimant-safe Claim detail. A Claim owned by another user is treated as not found.

#### `POST /api/claims/[id]/withdraw`

Accepts no body fields and returns the updated claimant-safe Claim.

### 8.2 Staff endpoints

#### `GET /api/staff/claims`

Requires `staff` or `administrator`. Accepts bounded pagination and an optional status. Returns oldest pending claims first for the default queue; explicit non-pending filters use newest first.

#### `GET /api/staff/claims/[id]`

Returns:

- Claim workflow fields;
- safe report summary;
- claimant safe identity and profile contact preference;
- question text, claimant answer and `matched` for each response;
- aggregate match count;
- staff-only review note.

It does not return expected answers, password hashes, session tokens or unrelated profile data.

#### `POST /api/staff/claims/[id]/decision`

Request:

```json
{
  "decision": "approve",
  "reviewNote": "Identity confirmed at the security desk."
}
```

`decision` is exactly `approve` or `reject`. The optional note is trimmed, converted from blank to null and limited to 1000 characters.

#### `POST /api/staff/claims/[id]/complete`

Accepts no body fields. It records handover completion and returns the updated staff Claim representation.

## 9. Response Mappers

No route serialises a Mongoose document directly.

### ClaimantClaim

Includes only:

- Claim ID;
- safe report ID, title, report type and public status;
- Claim status;
- created and updated timestamps;
- reviewed, withdrawn and completed timestamps where present.

It excludes answers, match indicators, review notes, reviewer identity, active keys and every other claimant.

### StaffClaimSummary

Adds the claimant's safe ID, email, display name, preferred contact method, verification question count, match count and reviewer metadata. It excludes individual answers until the detail endpoint is requested.

### StaffClaimDetail

Adds controlled ClaimEvidence responses and the private staff note. It never contains expected answers or authentication secrets.

Each mapper constructs an explicit object field by field. Tests inject private and authentication-shaped extra properties and assert they are absent from JSON.

## 10. Validation

- Request bodies use Zod `strictObject` schemas.
- `responses` contains 1–5 items, matching the report's current question count.
- `questionIndex` is a non-negative safe integer; indexes must be unique, contiguous and exactly match the server questions.
- `answer` is trimmed and contains 1–500 characters.
- `reviewNote` is optional, trimmed, blank-to-null and contains at most 1000 characters.
- Pagination uses safe positive integers, a maximum page size of 50 and a safe offset check.
- Status query values come from the Claim status enum.
- Malformed JSON and Zod failures return HTTP 400. Internal `SyntaxError` instances are not misclassified as malformed client JSON.

## 11. Error Contract

| Code | HTTP | Safe message |
|---|---:|---|
| `VALIDATION_ERROR` | 400 | Invalid claim request |
| `AUTHENTICATION_REQUIRED` | 401 | Authentication required |
| `CLAIM_FORBIDDEN` | 403 | Claim action is not permitted |
| `CLAIM_NOT_FOUND` | 404 | Claim not found |
| `CLAIM_ALREADY_EXISTS` | 409 | An active claim already exists |
| `REPORT_NOT_CLAIMABLE` | 409 | Report is not available for claiming |
| `CLAIM_STATE_CONFLICT` | 409 | Claim state has changed |
| `CLAIM_OPERATION_FAILED` | 500 | Claim operation failed |

Validation responses may include field-error arrays. Other responses contain only `code` and `message`. Duplicate-key errors are translated to `CLAIM_ALREADY_EXISTS` only when they target the active-claim index. Every other database or programming error becomes the generic 500 envelope.

## 12. Testing Strategy

### Model tests

- required fields, defaults, enums and timestamps;
- Claim and queue indexes;
- unique active key and unique evidence-per-claim constraints;
- `select: false` on answers, match results, aggregate match count and review notes.

### Validation and mapper tests

- every accepted boundary and rejected over-limit value;
- duplicate, missing, non-contiguous and out-of-range question indexes;
- Unicode, casing and whitespace normalisation;
- claimant, staff summary and staff detail exact object shapes;
- injected expected answers, private report evidence and authentication fields never escape.

### Service tests

- all eligibility checks;
- successful creation and duplicate active-claim races;
- multiple pending claimants on one open report;
- approval rejects competing claims and changes the report atomically;
- rejection leaves other claims and the report intact;
- pending and approved withdrawals;
- completion resolves the report;
- every invalid state transition;
- transaction failure and conditional-update conflicts;
- sessions always end and partial writes are not accepted.

### Route tests

- student, staff and administrator permission matrix;
- 400, 401, 403, 404, 409 and hidden 500 envelopes;
- malformed JSON separated from internal `SyntaxError` failures;
- route responses contain only their mapper contract;
- Next.js 16 asynchronous route parameters are awaited correctly.

### Complete gate

Run in strict order:

```powershell
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm audit
```

Then verify the exact branch scope, run `git diff --check`, confirm `.env.local` appears only as ignored, and scan production Claim code for leaked expected answers or authentication fields. Tests mock database operations; they do not connect to Atlas or create real Claim records.

## 13. Delivery Sequence

Implementation should be split into independently reviewed tasks:

1. Claim and ClaimEvidence models.
2. Validation, answer normalisation and role-specific mappers.
3. Claimant query and mutation service.
4. Staff review and completion service.
5. Claimant API routes.
6. Staff API routes.
7. Complete verification and scope audit.

The next feature will build claimant and staff interfaces on these contracts. Notifications and AI matching remain separate features so this backend stays reviewable and testable.
