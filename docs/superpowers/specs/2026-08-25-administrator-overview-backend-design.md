# Administrator overview backend design

## 1. Goal

Add a secure, read-only administrator overview API that reports the core operational counts required by the project brief. The endpoint gives a future administrator dashboard one authoritative contract for submitted lost and found reports, unresolved and recovered cases, confirmed matches, claim states and account states.

This feature is the backend half of the administrator dashboard. It does not add an administrator page or any data-management mutation.

## 2. Scope

Issue #31 includes:

- `GET /api/admin/overview`;
- active-administrator-only authorisation;
- explicit definitions for every reported count;
- three bounded MongoDB aggregation queries, one each for reports, claims and users;
- a strict, privacy-safe JSON response;
- stable validation, authorisation and unavailable-service errors;
- service and route tests that do not connect to MongoDB Atlas;
- implementation and verification documentation.

Issue #31 does not include:

- an administrator page, chart or navigation entry;
- user, category, campus-location, report or claim CRUD;
- role elevation, suspension or account deletion;
- flagged-content models or moderation workflows;
- notification delivery;
- historical trends, percentages, forecasts or invented performance claims;
- persisted statistics, caching or background jobs;
- changes to existing Mongoose models or package dependencies.

## 3. Current foundation

The repository already provides:

- revocable cookie sessions and a safe `PublicUser` representation;
- `student`, `staff` and `administrator` roles;
- `active`, `suspended` and `deactivated` account states;
- lost and found ItemReport records with draft, open, claim-pending, resolved and closed states;
- Claim records with pending, approved, rejected, withdrawn and completed states;
- staff and administrator claim-review services;
- generic authentication responses that do not expose raw session details;
- a tested MongoDB connection module and route error conventions.

The new endpoint reuses those contracts. It introduces no alternate session or database path.

## 4. Approach decision

### Selected: administrator overview backend first

Build the read-only statistics contract before the administrator interface. This keeps the permission boundary and metric definitions independently testable and lets the later frontend consume one stable endpoint.

### Rejected: complete administrator management system in one issue

Combining statistics, user administration, report moderation, category management and frontend work would create a large permission surface and an oversized pull request. Those workflows require separate transition rules, audit decisions and confirmation designs.

### Deferred: notification system first

Notifications remain a core requirement, but the project brief explicitly calls for an administrator dashboard with lost, found, matched, recovered and unresolved statistics. The overview contract closes that more visible requirement gap first.

## 5. Access control

Every request resolves the existing session cookie through `getCurrentUser` before any aggregation starts.

Access is granted only when:

- a valid current user exists;
- `status` is `active`;
- `role` is `administrator`.

The permission matrix is:

| Account state | Result |
| --- | --- |
| Missing, expired or revoked session | Existing 401 authentication response |
| Active student | 403 `ADMINISTRATOR_REQUIRED` |
| Active staff | 403 `ADMINISTRATOR_REQUIRED` |
| Suspended or deactivated administrator | 403 `ADMINISTRATOR_REQUIRED` |
| Active administrator | Overview service executes |

Staff access to claim review does not imply administrator access to system-wide account and report statistics.

Authorisation happens before request-query validation and before MongoDB work. This prevents unauthenticated callers from using validation differences as an endpoint oracle.

## 6. Request contract

### `GET /api/admin/overview`

The endpoint accepts no body and no query parameters. Any query key, including repeated or blank keys, returns:

```json
{
  "error": {
    "code": "ADMIN_OVERVIEW_INVALID_QUERY",
    "message": "Overview query is invalid"
  }
}
```

with HTTP 400.

The route is read-only and same-origin through the existing application. It does not accept an administrator ID, role, date range, metric list or client-provided filter.

## 7. Metric definitions

The response contains observational counts, not percentages or performance claims.

### Reports

`submittedLost` and `submittedFound` count ItemReport records of the corresponding type whose status is one of:

- `open`;
- `claim_pending`;
- `resolved`;
- `closed`.

Draft reports are excluded because they have not entered the campus recovery workflow.

`submittedTotal` equals `submittedLost + submittedFound`.

`unresolved` counts reports with status `open` or `claim_pending`.

`recovered` counts reports with status `resolved`. A closed report is not assumed to be recovered.

`matched` counts distinct Claim `reportId` values that have at least one Claim with status `approved` or `completed`. This is a staff-confirmed operational match, not an AI recommendation and not proof that every approved claim has completed handover.

The metrics intentionally overlap. For example, a matched report may still be unresolved while handover is pending.

### Claims

Claim counts cover all persisted Claim records and are grouped into:

- `pending`;
- `approved`;
- `rejected`;
- `withdrawn`;
- `completed`;
- `total`, equal to the five state counts.

### Accounts

Account counts cover all persisted User records and are grouped into:

- `active`;
- `suspended`;
- `deactivated`;
- `total`, equal to the three state counts.

No metric exposes an email, display name, user ID, report ID, claim ID, private verification value or session information.

## 8. Success response

HTTP 200 returns exactly:

```json
{
  "generatedAt": "2026-08-25T03:30:00.000Z",
  "reports": {
    "submittedLost": 24,
    "submittedFound": 19,
    "submittedTotal": 43,
    "unresolved": 17,
    "recovered": 11,
    "matched": 8
  },
  "claims": {
    "pending": 5,
    "approved": 3,
    "rejected": 4,
    "withdrawn": 2,
    "completed": 7,
    "total": 21
  },
  "accounts": {
    "active": 80,
    "suspended": 2,
    "deactivated": 5,
    "total": 87
  }
}
```

Every count is a finite, non-negative safe integer. Empty collections return zero for every count rather than missing keys.

`generatedAt` is created only after all three aggregations succeed. The response sets `Cache-Control: no-store` so an administrator does not mistake a browser cache entry for a current overview.

## 9. Service architecture

Create an isolated administrator overview module with four responsibilities:

1. enforce active-administrator access;
2. run report, claim and account aggregation pipelines in parallel;
3. normalise missing aggregation buckets to zero and verify numeric invariants;
4. return the explicit overview contract.

The database work uses three read-only queries:

- one ItemReport aggregation calculates submitted type counts plus unresolved and recovered counts;
- one Claim aggregation calculates all claim-state counts and distinct matched report IDs;
- one User aggregation calculates all account-state counts.

The service uses `Promise.all` so collection scans are independent without serial latency. Each pipeline groups only enumerated states already constrained by the Mongoose schemas. It never returns full documents.

No transaction is used. The overview is a current operational observation, and a write committed between collection queries may create a momentary cross-collection difference. The API does not claim snapshot isolation, and a later refresh resolves normal concurrent activity.

## 10. Internal validation

Aggregation output is untrusted at the service boundary even though it comes from MongoDB. A strict internal parser verifies:

- known bucket names only;
- finite non-negative safe integers;
- exact totals derived from component counts;
- a finite distinct matched count;
- no extra object keys.

Malformed or unexpected aggregation output becomes the generic unavailable-service response. It is never partially returned.

## 11. Error handling

The route returns stable envelopes only:

| Condition | Status | Code | Message |
| --- | ---: | --- | --- |
| Missing/invalid session | 401 | Existing auth code | Existing generic authentication message |
| Wrong role or inactive administrator | 403 | `ADMINISTRATOR_REQUIRED` | `Administrator access required` |
| Query parameter supplied | 400 | `ADMIN_OVERVIEW_INVALID_QUERY` | `Overview query is invalid` |
| Database, aggregation, parser or unexpected failure | 500 | `ADMIN_OVERVIEW_UNAVAILABLE` | `Administrator overview is temporarily unavailable` |

Raw database errors, collection names, aggregation stages, stack traces and malformed output are never sent to the browser.

## 12. File boundaries

The implementation is expected to add:

- `web/src/lib/admin/overview-contract.ts` — strict response and internal aggregation schemas;
- `web/src/lib/admin/overview-contract.test.ts` — contract and invariant tests;
- `web/src/lib/admin/errors.ts` — stable administrator error definitions and sanitisation;
- `web/src/lib/admin/errors.test.ts` — safe-error tests;
- `web/src/lib/admin/overview-service.ts` — access control, aggregation and mapping;
- `web/src/lib/admin/overview-service.test.ts` — permission and metric tests;
- `web/src/app/api/admin/overview/route.ts` — authenticated GET route;
- `web/src/app/api/admin/overview/admin-overview-route.test.ts` — route contract tests;
- `docs/superpowers/verification/2026-08-25-administrator-overview-backend.md` — final evidence.

Existing authentication, model and connection files are reused without modification unless a narrowly required test seam is discovered during implementation.

## 13. Testing strategy

### Contract tests

- accept the exact success shape;
- reject negative, fractional, infinite and unsafe counts;
- reject inconsistent totals;
- reject unknown, missing and secret/internal fields;
- accept a valid ISO `generatedAt` value and reject malformed timestamps.

### Error tests

- preserve only approved administrator and authentication errors;
- convert raw Error, MongoDB-like and unknown failures to the generic 500 contract;
- never serialise stack traces or raw error messages.

### Service tests

- allow an active administrator;
- reject students, staff and inactive administrators before model calls;
- return exact zero counts for empty aggregation results;
- map every report, claim and account state correctly;
- distinguish drafts, closed reports, unresolved reports, recovered reports and matched reports;
- count a report with multiple approved/completed Claims only once as matched;
- derive totals rather than trusting database total fields;
- fail closed on malformed aggregation output;
- propagate only approved safe errors.

### Route tests

- authenticate before query validation;
- return the exact active-administrator success response;
- reject every non-administrator permission case;
- reject unknown, blank and repeated query parameters;
- set `Cache-Control: no-store` on successful responses;
- return generic JSON for database and unexpected failures;
- prove the response contains no password, token, user ID, email, verification evidence, internal version or raw-error field.

All model, connection and session dependencies are mocked. Tests do not read `.env.local` and do not connect to, mutate or delete MongoDB Atlas data.

## 14. Quality gates

Implementation is complete only when all of the following pass:

- focused administrator overview tests;
- `npm test`;
- `npm run lint`;
- `npx tsc --noEmit --incremental false`;
- `npm run build` with `/api/admin/overview` in the route output;
- `npm audit` with zero known vulnerabilities;
- `git diff --check`;
- `.env.local` remains ignored and no real environment file is tracked;
- the diff contains no model, dependency or unrelated UI changes.

## 15. Acceptance criteria

Issue #31 is accepted when:

- an active administrator receives the exact overview response;
- every other role or inactive account is rejected before aggregation;
- report counts follow the documented submitted, unresolved, recovered and matched definitions;
- claim and account counts cover every persisted enum state;
- empty data returns complete zero-valued objects;
- cross-field totals are derived and validated;
- no record-level or private data is exposed;
- failures use stable safe envelopes;
- the endpoint performs only three read-only aggregation queries;
- no existing model or package dependency changes;
- all quality gates pass without Atlas mutation.

## 16. Follow-up

The next independent issue should add an accessible `/admin` overview page that consumes this endpoint, presents the five required report statistics with plain-language definitions, handles loading/empty/error/expired-session states and links administrators to existing claim review. Administrator mutation workflows, moderation, notifications and audit logging remain separate designs.
