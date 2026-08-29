# Staff Report Verification and Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a protected staff workflow for verifying reports, recording Found-item campus storage, and releasing stored items through the existing Claim handover.

**Architecture:** Store the one-to-one private handling state as a default-excluded `ItemReport.staffHandling` subdocument and expose it only through a dedicated `staff-reports` service with explicit projections and strict serializers. Reuse existing authentication, report lifecycle, image, pagination, transaction, and responsive UI patterns; extend the existing Claim completion transaction only for the stored-to-released transition.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, MongoDB/Mongoose 9, Zod 4, Vitest 4, Testing Library, CSS Modules.

## Global Constraints

- Only active `staff` and `administrator` accounts may use the staff report APIs and pages.
- Lost reports may be verified but always have `custodyStatus: "not_applicable"`.
- Only verified, visible, active Found reports may enter or update `custodyStatus: "stored"`.
- Release occurs only inside the existing approved-Claim completion transaction.
- Legacy reports without `staffHandling` are normalized in application code; do not run a migration or access Atlas.
- `staffHandling` is excluded by default and never appears in member, owner-history, matching, Claimant, notification, image, moderation, or administration responses.
- Mutations use exact `updatedAt` optimistic concurrency and return HTTP 409 on stale or invalid transitions.
- Use fixed page size `10`, canonical pages `1..10_000`, explicit projections, strict Zod objects, safe error mappings, and `Cache-Control: no-store` on staff endpoints.
- Embed only same-origin uploaded images; never automatically render legacy external HTTPS images.
- Remain usable at 320 CSS pixels with semantic controls, text status, visible focus, polite announcements, and at least 44-by-44 CSS-pixel targets.
- Do not add dependencies, a separate handling collection, general inventory, chat, scanning, analytics, exports, or new notification kinds.
- Keep `web/package.json`, `web/package-lock.json`, and `.env.local` unchanged.

---

## File map

### Model and shared server contracts

- Modify `web/src/models/item-report.ts`: define handling enums/subdocument, invariants, default exclusion, and legacy normalizer.
- Modify `web/src/models/item-report.test.ts`: prove defaults, valid states, invalid states, legacy normalization, and default exclusion.
- Modify `web/src/lib/reports/service.ts`: write explicit Lost/Found handling defaults when a report is created.
- Modify `web/src/lib/reports/service.test.ts`: verify creation payloads contain those defaults.
- Create `web/src/lib/staff-reports/contracts.ts`: controlled staff summary/detail record types and serializers.
- Create `web/src/lib/staff-reports/contracts.test.ts`: strict privacy and state-mapping tests.

### Staff report backend

- Create `web/src/lib/staff-reports/validation.ts`: strict IDs, list filters, timestamp and storage-location schemas.
- Create `web/src/lib/staff-reports/validation.test.ts`: boundary, repeated/unknown key, incompatible-filter, and normalization tests.
- Create `web/src/lib/staff-reports/errors.ts`: safe domain errors and response mapping.
- Create `web/src/lib/staff-reports/errors.test.ts`: exact status/message and forged-error redaction tests.
- Create `web/src/lib/staff-reports/access.ts`: session-first active staff/administrator resolution.
- Create `web/src/lib/staff-reports/access.test.ts`: session and role/status matrix.
- Create `web/src/lib/staff-reports/service.ts`: list, detail, verification and storage operations.
- Create `web/src/lib/staff-reports/service.test.ts`: query, privacy, legacy, transition and concurrency tests.
- Create `web/src/app/api/staff/reports/route.ts`: staff list endpoint.
- Create `web/src/app/api/staff/reports/[reportId]/route.ts`: staff detail endpoint.
- Create `web/src/app/api/staff/reports/[reportId]/verify/route.ts`: verification endpoint.
- Create `web/src/app/api/staff/reports/[reportId]/storage/route.ts`: storage endpoint.
- Create `web/src/app/api/staff/reports/staff-report-routes.test.ts`: route-level auth, validation, errors, cache and privacy tests.
- Modify `web/src/lib/claims/staff-service.ts`: perform conditional stored-to-released update during Claim completion.
- Modify `web/src/lib/claims/staff-service.test.ts`: verify release and legacy/not-held compatibility.

### Browser and pages

- Create `web/src/lib/staff-reports/browser-client.ts`: strict response schemas and same-origin list/detail/mutation calls.
- Create `web/src/lib/staff-reports/browser-client.test.ts`: request and fail-closed response tests.
- Create `web/src/lib/staff-reports/list-search.ts`: canonical URL parsing and href creation.
- Create `web/src/lib/staff-reports/list-search.test.ts`: URL state tests.
- Create `web/src/components/staff/staff-access-boundary.tsx`: reusable active-staff/administrator session boundary.
- Create `web/src/components/staff/staff-access-boundary.test.tsx`: loading, redirect, retry, focus, account-switch and role tests.
- Modify `web/src/components/claims/staff-claim-access-boundary.tsx`: retain existing Claim copy through the shared boundary.
- Modify `web/src/components/claims/staff-claim-access-boundary.test.tsx`: prove the existing Claim workspace contract is unchanged.
- Create `web/src/components/staff-reports/staff-report-list-client.tsx`: queue filters, states, cards and pagination.
- Create `web/src/components/staff-reports/staff-report-list-client.test.tsx`: list behaviour and accessibility tests.
- Create `web/src/components/staff-reports/staff-report-detail-client.tsx`: controlled detail, verification and storage actions.
- Create `web/src/components/staff-reports/staff-report-detail-client.test.tsx`: rendering, mutation, conflict and privacy tests.
- Create `web/src/components/staff-reports/staff-report-handling.module.css`: shared responsive list/detail styles.
- Create `web/src/app/staff/reports/page.tsx`: protected queue page after its client exists.
- Create `web/src/app/staff/reports/[reportId]/page.tsx`: protected detail page after both clients exist.
- Create `web/src/app/staff/reports/staff-report-pages.test.tsx`: final route composition and metadata tests.
- Modify `web/src/components/site-header.tsx` and `web/src/components/site-header.test.tsx`: active staff report navigation.
- Modify `web/src/components/dashboard/dashboard-client.tsx` and `web/src/components/dashboard/dashboard-client.test.tsx`: expose both staff workflows.
- Create `docs/superpowers/verification/2026-08-29-staff-report-verification-storage.md`: final evidence and limitations.

---

### Task 1: Private handling model and creation defaults

**Files:**
- Modify: `web/src/models/item-report.ts`
- Modify: `web/src/models/item-report.test.ts`
- Modify: `web/src/lib/reports/service.ts`
- Modify: `web/src/lib/reports/service.test.ts`

**Interfaces:**
- Produces: `REPORT_VERIFICATION_STATUSES`, `REPORT_CUSTODY_STATUSES`, `StaffReportHandling`, `NormalizedStaffReportHandling`, `normalizeStaffReportHandling(reportType, value)`.
- Produces: complete default `staffHandling` values on every newly created report.
- Consumes: existing `REPORT_TYPES`, `ItemReportModel.create()` transaction and model validation.

- [ ] **Step 1: Add failing model tests for defaults, normalization, exclusion and invariants**

Add tests that instantiate Lost and Found reports and assert the exact states:

```ts
expect(report({ reportType: "lost" }).staffHandling).toMatchObject({
  verificationStatus: "pending",
  custodyStatus: "not_applicable",
});
expect(report({ reportType: "found" }).staffHandling).toMatchObject({
  verificationStatus: "pending",
  custodyStatus: "not_held",
});
expect(itemReportSchema.path("staffHandling").options.select).toBe(false);
expect(normalizeStaffReportHandling("found", undefined)).toEqual({
  verificationStatus: "pending",
  verifiedBy: null,
  verifiedAt: null,
  custodyStatus: "not_held",
  storageLocation: null,
  storedAt: null,
  releasedAt: null,
  updatedBy: null,
});
```

Use `it.each` to reject: pending with actors/times, verified without actor/time,
Lost with any non-`not_applicable` custody, Found `not_held` with location/time,
stored without verification/location/intake time, released without release time,
and an unknown stored enum. Also assert `normalizeStaffReportHandling()` throws
for malformed present legacy data rather than silently repairing it.

- [ ] **Step 2: Run the model tests and confirm the missing model API fails**

Run:

```powershell
cd web
npm test -- src/models/item-report.test.ts
```

Expected: FAIL because the handling enums, schema path and normalizer do not exist.

- [ ] **Step 3: Implement the smallest validated subdocument**

Add exact enums and a `_id: false` schema. Use a function default based on the
parent report type, mark the parent `staffHandling` path `select: false`, and
validate the complete combination in one parent `pre("validate")` hook so
cross-field rules stay in one place:

```ts
export const REPORT_VERIFICATION_STATUSES = ["pending", "verified"] as const;
export const REPORT_CUSTODY_STATUSES = [
  "not_applicable", "not_held", "stored", "released",
] as const;

staffHandling: {
  type: staffHandlingSchema,
  select: false,
  default(this: { reportType?: "lost" | "found" }) {
    return defaultStaffHandling(this.reportType === "found" ? "found" : "lost");
  },
  required: true,
},
```

`normalizeStaffReportHandling()` must return fresh plain values, normalize only
`undefined`, and validate present data against the same state rules. Do not add
a migration, index, virtual, plugin or event model.

- [ ] **Step 4: Run model tests and all existing public serializer tests**

Run:

```powershell
npm test -- src/models/item-report.test.ts src/lib/reports/public-report.test.ts src/lib/reports/owner-history-service.test.ts src/lib/reports/browse-service.test.ts
```

Expected: PASS and no public object contains `staffHandling`.

- [ ] **Step 5: Add failing creation-service tests for explicit defaults**

Extend the existing `ItemReportModel.create` expectation so Lost input includes:

```ts
staffHandling: {
  verificationStatus: "pending",
  verifiedBy: null,
  verifiedAt: null,
  custodyStatus: "not_applicable",
  storageLocation: null,
  storedAt: null,
  releasedAt: null,
  updatedBy: null,
},
```

Add a Found case expecting only `custodyStatus` to change to `not_held`.

- [ ] **Step 6: Run the service test and confirm it fails on the creation payload**

Run: `npm test -- src/lib/reports/service.test.ts`

Expected: FAIL because `createReport()` does not yet pass `staffHandling`.

- [ ] **Step 7: Add explicit handling defaults to `createReport()` and rerun**

Call the model's exported default helper or construct the same complete object
from `input.reportType`; do not duplicate state rules in the route.

Run: `npm test -- src/lib/reports/service.test.ts src/models/item-report.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the independently working model change**

```powershell
git add web/src/models/item-report.ts web/src/models/item-report.test.ts web/src/lib/reports/service.ts web/src/lib/reports/service.test.ts
git commit -m "feat(staff-reports): add private handling state"
```

---

### Task 2: Staff contracts, validation, safe errors and access

**Files:**
- Create: `web/src/lib/staff-reports/contracts.ts`
- Create: `web/src/lib/staff-reports/contracts.test.ts`
- Create: `web/src/lib/staff-reports/validation.ts`
- Create: `web/src/lib/staff-reports/validation.test.ts`
- Create: `web/src/lib/staff-reports/errors.ts`
- Create: `web/src/lib/staff-reports/errors.test.ts`
- Create: `web/src/lib/staff-reports/access.ts`
- Create: `web/src/lib/staff-reports/access.test.ts`

**Interfaces:**
- Consumes: Task 1 handling enums and `normalizeStaffReportHandling()`.
- Produces: `StaffReportSummary`, `StaffReportDetail`, `toStaffReportSummary(record)`, `toStaffReportDetail(record)`.
- Produces: `STAFF_REPORT_PAGE_SIZE = 10`, `staffReportIdSchema`, `staffReportListQuerySchema`, `verifyReportSchema`, `storeReportSchema`, `toStaffReportQueryInput()`, `StaffReportListQuery`, `VerifyReportInput`, and `StoreReportInput`.
- Produces: `StaffReportError`, `invalidStaffReportResponse()`, `staffReportErrorResponse()`.
- Produces: `requireStaffReportUser(user)` and `getCurrentStaffReportUser()`.

- [ ] **Step 1: Write failing contract tests for safe summary/detail mapping**

Create a representative record with `reporterId`, `staffHandling`, and a
sentinel private field. Assert summary contains controlled report fields and
normalized handling without `storageLocation`; detail contains the location.
Scan the serialized JSON:

```ts
expect(JSON.stringify(summary)).not.toMatch(
  /reporterId|expectedAnswer|exactLocationDetails|serialNumber|privateNotes|storageLocation/,
);
expect(detail.handling.storageLocation).toBe("Library desk - locker B12");
```

Add a legacy record with no `staffHandling` and assert type-dependent defaults.

- [ ] **Step 2: Run the contract test and confirm the module is missing**

Run: `npm test -- src/lib/staff-reports/contracts.test.ts`

Expected: FAIL because `contracts.ts` does not exist.

- [ ] **Step 3: Implement explicit record types and serializers**

Define the common staff representation with report content, lifecycle,
moderation and timestamps. Summary returns:

```ts
handling: {
  verificationStatus,
  custodyStatus,
  verifiedAt,
  storedAt,
  releasedAt,
}
```

Detail extends it with `verifiedBy`, `updatedBy`, and `storageLocation`. Clone
arrays and convert every `Date` to ISO. Never spread a Mongoose record.

- [ ] **Step 4: Write failing strict validation tests**

Cover exact accepted inputs and rejected unknown/repeated/incompatible values:

```ts
expect(staffReportListQuerySchema.parse({})).toEqual({ page: 1 });
expect(staffReportListQuerySchema.safeParse({
  reportType: "lost", custodyStatus: "stored",
}).success).toBe(false);
expect(storeReportSchema.parse({
  expectedUpdatedAt: "2026-08-29T03:00:00.000Z",
  storageLocation: "  Library desk   - locker B12  ",
})).toEqual({
  expectedUpdatedAt: "2026-08-29T03:00:00.000Z",
  storageLocation: "Library desk - locker B12",
});
```

Reject control/format characters, empty/one-character/161-character locations,
authority keys, invalid ISO timestamps, noncanonical pages, duplicate keys and
unknown list keys. Accept compatible report/lifecycle/verification/custody
combinations only.

- [ ] **Step 5: Implement validation and rerun contract/validation tests**

Reuse the established `URLSearchParams` accumulator pattern. Use NFKC,
whitespace collapse and `/[\p{Cc}\p{Cf}\p{Cs}]/u` rejection for location.
Use strict Zod objects and exact ISO timestamps with offsets.

Run:

```powershell
npm test -- src/lib/staff-reports/contracts.test.ts src/lib/staff-reports/validation.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write and implement safe error/access tests**

Test exact mappings for validation 400, auth 401, forbidden 403, not found 404,
conflict 409 and fallback 500. A plain object such as
`{ code: "STAFF_REPORT_NOT_FOUND", message: "secret" }` must map to fallback
500. Test active staff/admin acceptance and student/inactive rejection before a
service operation. Test `getCurrentStaffReportUser()` resolves the cookie and
calls `getCurrentUser(token, { includeInactive: true })` before role checking,
so an inactive authenticated account receives controlled 403 rather than being
misclassified as signed out.

Use these public definitions:

```ts
STAFF_REPORT_FORBIDDEN: { status: 403, message: "Staff report access is not permitted" }
STAFF_REPORT_NOT_FOUND: { status: 404, message: "Staff report not found" }
STAFF_REPORT_STATE_CONFLICT: { status: 409, message: "Staff report state has changed" }
STAFF_REPORT_OPERATION_FAILED: { status: 500, message: "Staff report operation failed" }
```

Run:

```powershell
npm test -- src/lib/staff-reports/errors.test.ts src/lib/staff-reports/access.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the stable boundary contracts**

```powershell
git add web/src/lib/staff-reports
git commit -m "feat(staff-reports): define safe handling contracts"
```

---

### Task 3: Staff report list and detail service

**Files:**
- Create: `web/src/lib/staff-reports/service.ts`
- Create: `web/src/lib/staff-reports/service.test.ts`

**Interfaces:**
- Consumes: Task 2 `StaffReportListQuery`, serializers, errors and `requireStaffReportUser()`.
- Produces: `StaffReportPage`, `listStaffReports(user, query)` and `getStaffReport(user, reportId)`.

- [ ] **Step 1: Write failing list-service tests**

Mock Mongoose chains and assert the default filter is exactly equivalent to:

```ts
{
  moderationStatus: { $ne: "hidden" },
  status: { $in: ["open", "claim_pending"] },
}
```

Then assert `{ verificationStatus: "pending" }` adds the legacy-compatible
branch:

```ts
{
  moderationStatus: { $ne: "hidden" },
  status: { $in: ["open", "claim_pending"] },
  $or: [
    { "staffHandling.verificationStatus": "pending" },
    { staffHandling: { $exists: false } },
  ],
}
```

Assert optional report type, explicit lifecycle, verification and compatible
custody filters retain the privacy/lifecycle boundary. Assert projection uses
`+staffHandling`, excludes `reporterId`, sorts `{ createdAt: 1, _id: 1 }`, skips
`(page - 1) * 10`, limits `10`, counts with the identical filter, normalizes
legacy records, and returns accurate `totalPages`.

- [ ] **Step 2: Write failing detail and permission tests**

Assert `getStaffReport()` uses visible `open`, `claim_pending`, or `resolved`
states, explicit fields and `+staffHandling`. Assert hidden/draft/closed/missing
records become `STAFF_REPORT_NOT_FOUND`. Assert student/inactive access fails
before `connectToDatabase()`.

- [ ] **Step 3: Run tests and confirm service exports are missing**

Run: `npm test -- src/lib/staff-reports/service.test.ts`

Expected: FAIL because the service has not been implemented.

- [ ] **Step 4: Implement one query builder and the two read services**

Keep `buildStaffReportFilter(query)` private. For legacy verification/custody
filters, use small `$or` branches only where absence must equal a default; do
not add an aggregation pipeline or speculative index. Reuse the same explicit
projection for list/detail, then call the appropriate serializer.

- [ ] **Step 5: Run focused read-service and privacy tests**

Run:

```powershell
npm test -- src/lib/staff-reports/service.test.ts src/lib/staff-reports/contracts.test.ts src/lib/reports/public-report.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the read service**

```powershell
git add web/src/lib/staff-reports/service.ts web/src/lib/staff-reports/service.test.ts
git commit -m "feat(staff-reports): add protected handling queries"
```

---

### Task 4: Verification and storage mutations

**Files:**
- Modify: `web/src/lib/staff-reports/service.ts`
- Modify: `web/src/lib/staff-reports/service.test.ts`

**Interfaces:**
- Consumes: Task 2 `VerifyReportInput`, `StoreReportInput` and Task 3 detail loader.
- Produces: `verifyStaffReport(user, reportId, input)` and `storeStaffReport(user, reportId, input)`.

- [ ] **Step 1: Add failing verification transition tests**

Assert a visible `open`/`claim_pending` legacy or pending report with matching
`updatedAt` updates in one `findOneAndUpdate()` using `runValidators: true` and
returns staff detail. Assert the `$set` object records the same `now` in
`verifiedAt`, the authenticated ID in `verifiedBy`/`updatedBy`, and preserves
type-dependent custody. Test already verified, hidden, resolved, closed, draft,
stale and missing transitions fail with only not-found or conflict errors.

- [ ] **Step 2: Implement `verifyStaffReport()` and make tests pass**

Use one atomic filter that contains ID, exact `updatedAt`, allowed lifecycle,
visible moderation and pending-or-legacy verification. For legacy reports,
write the entire valid subdocument. For explicit reports, `$set` the required
nested paths. If no update is returned, run one existence check with the same
staff visibility boundary to distinguish 404 from 409.

Run: `npm test -- src/lib/staff-reports/service.test.ts -t verification`

Expected: PASS.

- [ ] **Step 3: Add failing first-storage and location-update tests**

Assert first storage requires Found + verified + visible + active + exact
`updatedAt`, writes `custodyStatus: "stored"`, normalized location, `storedAt`,
null `releasedAt`, and `updatedBy`. Assert a later location change preserves
the original `storedAt`. Assert Lost, pending, released, resolved, hidden,
stale, and malformed stored states fail safely.

- [ ] **Step 4: Implement `storeStaffReport()` with one guarded update path**

Load the current controlled state only to select `not_held` versus `stored`,
then execute an exact state-and-timestamp `findOneAndUpdate`. Do not add a
transaction: the mutation touches one report document and is already atomic.

- [ ] **Step 5: Run all staff service tests and typecheck the module**

```powershell
npm test -- src/lib/staff-reports/service.test.ts
npm exec -- tsc --noEmit --incremental false
```

Expected: PASS.

- [ ] **Step 6: Commit mutation support**

```powershell
git add web/src/lib/staff-reports/service.ts web/src/lib/staff-reports/service.test.ts
git commit -m "feat(staff-reports): verify and store found items"
```

---

### Task 5: Protected staff report API routes

**Files:**
- Create: `web/src/app/api/staff/reports/route.ts`
- Create: `web/src/app/api/staff/reports/[reportId]/route.ts`
- Create: `web/src/app/api/staff/reports/[reportId]/verify/route.ts`
- Create: `web/src/app/api/staff/reports/[reportId]/storage/route.ts`
- Create: `web/src/app/api/staff/reports/staff-report-routes.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4 access, validation, errors and service functions.
- Produces: four no-store JSON route contracts under `/api/staff/reports`.

- [ ] **Step 1: Write failing route tests for authentication-first parsing**

Mock `getCurrentStaffReportUser()` and each service. For all four routes assert
authentication failure prevents reading URL parameters or bodies. Assert
rejected `context.params` and unexpected parser exceptions map safely. Assert
every response, including errors, has `Cache-Control: no-store`.

- [ ] **Step 2: Add list/detail contract tests**

Test exact query conversion, duplicate/unknown rejection, canonical page,
valid ID, exact service arguments and response shape. Scan response text:

```ts
expect(bodyText).not.toMatch(
  /reporterId|expectedAnswer|exactLocationDetails|serialNumber|privateNotes|password|token|__v/,
);
```

Also assert list responses do not contain `storageLocation`.

- [ ] **Step 3: Add verify/storage mutation route tests**

Require `application/json`, reject malformed JSON and strict unknown keys, and
assert exact calls:

```ts
expect(verifyStaffReport).toHaveBeenCalledWith(staff, reportId, {
  expectedUpdatedAt: "2026-08-29T03:00:00.000Z",
});
expect(storeStaffReport).toHaveBeenCalledWith(staff, reportId, {
  expectedUpdatedAt: "2026-08-29T03:00:00.000Z",
  storageLocation: "Library desk - locker B12",
});
```

Exercise safe 400/401/403/404/409/500 mappings, oversized/invalid-UTF-8 bodies,
and forged errors.

- [ ] **Step 4: Run route tests and confirm files are absent**

Run: `npm test -- src/app/api/staff/reports/staff-report-routes.test.ts`

Expected: FAIL because the routes do not exist.

- [ ] **Step 5: Implement thin no-store routes**

Each route must: resolve access, safely await parameters, validate input, call
one service, wrap the exact controlled response, and map errors. Reuse
`isJsonRequest()` from the established moderation validation helper and
`readClaimRequestBody()` as the existing bounded UTF-8 JSON reader rather than
creating duplicate parsers. Map its body exceptions to validation errors. Do
not accept caller identity or role.

- [ ] **Step 6: Run route, validation and service suites**

```powershell
npm test -- src/app/api/staff/reports/staff-report-routes.test.ts src/lib/staff-reports/validation.test.ts src/lib/staff-reports/service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the API slice**

```powershell
git add web/src/app/api/staff/reports
git commit -m "feat(staff-reports): expose protected handling API"
```

---

### Task 6: Release stored items during existing Claim completion

**Files:**
- Modify: `web/src/lib/claims/staff-service.ts`
- Modify: `web/src/lib/claims/staff-service.test.ts`

**Interfaces:**
- Consumes: Task 1 stored handling shape and existing `completeClaim(user, claimId)` transaction.
- Produces: conditional `stored -> released` transition with no public Claim response change.

- [ ] **Step 1: Add failing stored-Found completion test**

Arrange an approved Claim whose report has verified/stored handling. Assert the
existing report update filter includes `status: "claim_pending"`, and the update
sets lifecycle resolution plus:

```ts
"staffHandling.custodyStatus": "released",
"staffHandling.releasedAt": now,
"staffHandling.updatedBy": staff.id,
```

Assert the same transaction/session, validators, Claim completion and existing
notifications remain intact.

- [ ] **Step 2: Add compatibility and concurrency tests**

Cover Lost, Found `not_held`, and legacy missing handling: all still complete
without inventing storage history. Cover a concurrent handling change so the
guarded report update returns null and the transaction raises
`CLAIM_STATE_CONFLICT`; Claim and notifications must not commit.

- [ ] **Step 3: Run the Claim tests and observe the missing release update**

Run: `npm test -- src/lib/claims/staff-service.test.ts -t complete`

Expected: the new stored-item expectation fails.

- [ ] **Step 4: Extend the current transaction without a second workflow**

Load `+staffHandling` on the existing current report path. Build one report
update: always resolve the report, conditionally add the three release paths
only when normalized state is Found/stored, and include the current stored
state in the filter. Use `runValidators: true`. Do not change Claim response
types or add notifications.

- [ ] **Step 5: Run complete Claim, notification and report regression tests**

```powershell
npm test -- src/lib/claims/staff-service.test.ts src/app/api/staff/claims/staff-claim-routes.test.ts src/lib/notifications/delivery.test.ts src/models/item-report.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the integration**

```powershell
git add web/src/lib/claims/staff-service.ts web/src/lib/claims/staff-service.test.ts
git commit -m "feat(staff-reports): release stored items at handover"
```

---

### Task 7: Strict browser client and canonical staff-list URL state

**Files:**
- Create: `web/src/lib/staff-reports/browser-client.ts`
- Create: `web/src/lib/staff-reports/browser-client.test.ts`
- Create: `web/src/lib/staff-reports/list-search.ts`
- Create: `web/src/lib/staff-reports/list-search.test.ts`

**Interfaces:**
- Consumes: Task 2 public shapes and endpoint contracts.
- Produces: `StaffReportBrowserError`, browser-facing types, `getStaffReports(input, signal?)`, `getStaffReport(id, signal?)`, `verifyStaffReport(id, input)`, `storeStaffReport(id, input)`.
- Produces: `parseStaffReportListSearchParams(params)` and `staffReportListHref(values)`.

- [ ] **Step 1: Write failing browser schema and request tests**

Assert exact same-origin URLs, credentials, abort signals, methods and bodies.
Assert the initial page request omits the active-lifecycle parameter but sends
`verificationStatus=pending`; the canonical browser-page URL remains empty.
Reject unknown keys, inconsistent pagination, incompatible report/custody
states, missing actor/time pairs, stored/released states missing location or
times, external image embedding candidates, and any injected private key.

- [ ] **Step 2: Implement strict browser types and client calls**

Use strict Zod schemas and one `fetchSameOrigin()`/`parseResponse()` pair local
to this domain. Map only exact code/status pairs from Task 2; malformed error
payloads become generic `REQUEST_FAILED`, fetch failures become `NETWORK_ERROR`.

- [ ] **Step 3: Write failing URL parsing/href tests**

Cover the empty URL with display values `{ reportStatus: "active",
verificationStatus: "pending", page: 1 }` and API request
`{ verificationStatus: "pending" }`, every valid select value,
repeated/unknown/invalid values, incompatible Lost/storage combinations,
canonical page recovery, filter reset to page one, and stable key ordering.

- [ ] **Step 4: Implement URL helpers with no generic query abstraction**

Use `URLSearchParams`, fixed sets and a single `safePage()` helper. Return both
display values and the exact API request. `staffReportListHref()` must omit the
initial defaults and never emit invalid combinations.

- [ ] **Step 5: Run client and URL tests**

```powershell
npm test -- src/lib/staff-reports/browser-client.test.ts src/lib/staff-reports/list-search.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the browser boundary**

```powershell
git add web/src/lib/staff-reports/browser-client.ts web/src/lib/staff-reports/browser-client.test.ts web/src/lib/staff-reports/list-search.ts web/src/lib/staff-reports/list-search.test.ts
git commit -m "feat(staff-reports): add strict browser contracts"
```

---

### Task 8: Shared staff access boundary

**Files:**
- Create: `web/src/components/staff/staff-access-boundary.tsx`
- Create: `web/src/components/staff/staff-access-boundary.test.tsx`
- Modify: `web/src/components/claims/staff-claim-access-boundary.tsx`
- Modify: `web/src/components/claims/staff-claim-access-boundary.test.tsx`

**Interfaces:**
- Produces: `<StaffAccessBoundary copy={...}>{children}</StaffAccessBoundary>` with configurable nouns/copy and the established access behaviour.
- Consumes: current auth provider and router replacement.

- [ ] **Step 1: Write the generic boundary tests before extraction**

Port the behavioural matrix from Claim access and assert one persistent polite
live region, no restricted child before access, `/login` replacement, retry
single-flight, focus restoration, active staff/admin access, student/inactive
denial, and keyed remount on account change. Use report-handling copy in this
new test.

- [ ] **Step 2: Extract the boundary and retain the existing Claim wrapper**

Move state/focus/session logic into `StaffAccessBoundary`. Accept one object:

```ts
{
  checking: string;
  confirmed: string;
  unavailableHeading: string;
  forbiddenHeading: string;
  forbiddenDescription: string;
  workspaceLabel: string;
}
```

Keep `StaffClaimAccessBoundary` as a thin wrapper supplying its existing exact
copy. Reuse the existing CSS classes; do not duplicate the state machine or
create a general authorization framework.

- [ ] **Step 3: Run both boundary test files**

```powershell
npm test -- src/components/staff/staff-access-boundary.test.tsx src/components/claims/staff-claim-access-boundary.test.tsx
```

Expected: PASS with existing Claim wording and focus behaviour unchanged.

- [ ] **Step 4: Commit the independently passing shared access boundary**

```powershell
git add web/src/components/staff web/src/components/claims/staff-claim-access-boundary.tsx web/src/components/claims/staff-claim-access-boundary.test.tsx
git commit -m "refactor(staff): share protected workspace access"
```

---

### Task 9: Staff report queue UI

**Files:**
- Create: `web/src/components/staff-reports/staff-report-list-client.tsx`
- Create: `web/src/components/staff-reports/staff-report-list-client.test.tsx`
- Create: `web/src/components/staff-reports/staff-report-handling.module.css`

**Interfaces:**
- Consumes: Task 7 client, URL helpers and summary types.
- Produces: `<StaffReportListClient />` used by the queue page shell created in Task 10.

- [ ] **Step 1: Write failing list-state and filter tests**

Cover initial active/pending request, semantic heading/list, four labelled
native selects, apply/clear filters, URL canonicalization, reset to page one,
invalid-query notice, old-request abort/ignore, retry, 401 redirect, 403 safe
state, empty/filtered-empty copy, totals, and previous/next boundaries.

Assert each row links to `/staff/reports/{id}`, shows type/lifecycle/
verification/custody and dates, embeds only an internal image, and never renders
`storageLocation`, actor IDs or external URLs.

- [ ] **Step 2: Run the component test and confirm the component is absent**

Run: `npm test -- src/components/staff-reports/staff-report-list-client.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the queue using native form controls**

Follow the owner-history request/AbortController pattern. Submit filters as a
form, keep URL state canonical, and use text badges. Initial loading must not
render stale rows. Out-of-range pages replace with the last valid page only
when results report a positive total page count.

- [ ] **Step 4: Add responsive and accessibility CSS assertions**

In the component test, read the CSS and assert: filter controls and links have
44px minimum height, grid children use `min-width: 0`, a `max-width: 20rem`
breakpoint stacks filters/cards/pagination, images reserve dimensions, focus
outlines are visible, and no `overflow-x: auto` masks a page-width defect.

- [ ] **Step 5: Run list, browser and search tests**

```powershell
npm test -- src/components/staff-reports/staff-report-list-client.test.tsx src/lib/staff-reports/browser-client.test.ts src/lib/staff-reports/list-search.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the queue**

```powershell
git add web/src/components/staff-reports/staff-report-list-client.tsx web/src/components/staff-reports/staff-report-list-client.test.tsx web/src/components/staff-reports/staff-report-handling.module.css
git commit -m "feat(staff-reports): add handling queue"
```

---

### Task 10: Staff report detail, verification and storage UI

**Files:**
- Create: `web/src/components/staff-reports/staff-report-detail-client.tsx`
- Create: `web/src/components/staff-reports/staff-report-detail-client.test.tsx`
- Modify: `web/src/components/staff-reports/staff-report-handling.module.css`
- Create: `web/src/app/staff/reports/page.tsx`
- Create: `web/src/app/staff/reports/[reportId]/page.tsx`
- Create: `web/src/app/staff/reports/staff-report-pages.test.tsx`

**Interfaces:**
- Consumes: Task 7 detail/mutation functions and `StaffReportDetail`.
- Produces: `<StaffReportDetailClient reportId={id} />` and the two page shells created in this task.

- [ ] **Step 1: Write failing safe-detail rendering tests**

Assert controlled report fields, status text, internal-image-only preview,
handling timestamps and detail-only storage location. Scan the DOM for absence
of reporter identity, private verification, Claim evidence, review notes and
external image `src`. Cover loading, 401 redirect, 403, 404, generic error and
retry.

- [ ] **Step 2: Write action-availability tests**

Use a state matrix:

- pending Lost/Found active: `Mark report verified` only;
- verified Lost: no storage form;
- verified Found `not_held`: labelled location input + `Record item storage`;
- verified Found `stored`: existing location + `Update storage location`;
- released/resolved/hidden-equivalent safe error: read-only or inaccessible;
- invalid route ID: safe unavailable state without a request.

- [ ] **Step 3: Write mutation, conflict and focus tests**

Assert exact `expectedUpdatedAt`, normalized location, one request during double
activation, disabled controls during mutation, success replacement with the
returned detail, polite success announcement, safe generic failure/retry, and
409 behaviour: refetch latest detail, announce the conflict, and focus the
conflict heading without displaying stale values.

- [ ] **Step 4: Implement detail and actions without a client state framework**

Use React state, refs and one request token/AbortController. Keep the location
as a native text input with `minLength={2}`, `maxLength={160}` and visible help.
Server validation remains authoritative. Do not add dialogs, optimistic fake
state, local/session storage, or manual release.

- [ ] **Step 5: Complete responsive CSS and page-shell tests**

Ensure facts use wrapping grid/dl layouts, long location/title text wraps,
actions stack at 20rem, all controls keep 44px targets, and focus-visible rules
cover action/input/retry links. Add page-shell tests asserting metadata titles
`Report handling` and `Staff report`, `<main id="main-content">`, the
report-specific shared access copy, Suspense on the list, and exact ID
forwarding to detail. Implement both page shells now that both client imports
exist. Run:

```powershell
npm test -- src/components/staff-reports/staff-report-detail-client.test.tsx src/app/staff/reports/staff-report-pages.test.tsx
npm exec -- tsc --noEmit --incremental false
```

Expected: PASS.

- [ ] **Step 6: Commit the complete detail workflow**

```powershell
git add web/src/components/staff-reports/staff-report-detail-client.tsx web/src/components/staff-reports/staff-report-detail-client.test.tsx web/src/components/staff-reports/staff-report-handling.module.css web/src/app/staff/reports
git commit -m "feat(staff-reports): manage report handling"
```

---

### Task 11: Navigation, full regression, scope audit and verification record

**Files:**
- Modify: `web/src/components/site-header.tsx`
- Modify: `web/src/components/site-header.test.tsx`
- Modify: `web/src/components/dashboard/dashboard-client.tsx`
- Modify: `web/src/components/dashboard/dashboard-client.test.tsx`
- Create: `docs/superpowers/verification/2026-08-29-staff-report-verification-storage.md`

**Interfaces:**
- Consumes: the completed staff report pages and all prior test evidence.
- Produces: role-aware discoverability and final auditable evidence.

- [ ] **Step 1: Add failing navigation tests**

For active staff and administrator, assert `Report handling` links to
`/staff/reports` and `Claim reviews` still links to `/staff/claims`. Assert both
are absent for student, inactive, signed-out and unavailable states. On the
dashboard, assert active staff/admin see two distinct available actions:
`Handle item reports` and `Review ownership claims`; existing student and admin
overview actions remain unchanged.

- [ ] **Step 2: Add the two minimal navigation links and rerun**

Reuse the existing `canReviewClaims` predicate as `canUseStaffTools`; do not
introduce a permission registry. Add one header link and one dashboard workflow
card.

Run:

```powershell
npm test -- src/components/site-header.test.tsx src/components/dashboard/dashboard-client.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run all focused feature and neighbouring regression tests**

```powershell
npm test -- src/models/item-report.test.ts src/lib/reports/service.test.ts src/lib/reports/public-report.test.ts src/lib/reports/owner-history-service.test.ts src/lib/reports/browse-service.test.ts src/lib/staff-reports src/app/api/staff/reports src/lib/claims/staff-service.test.ts src/app/api/staff/claims/staff-claim-routes.test.ts src/components/staff src/components/staff-reports src/components/claims/staff-claim-access-boundary.test.tsx src/components/site-header.test.tsx src/components/dashboard/dashboard-client.test.tsx src/app/staff/reports/staff-report-pages.test.tsx
```

Expected: all focused files pass and tests never open a real database connection.

- [ ] **Step 4: Run privacy, persistence and scope scans**

```powershell
rg -n "staffHandling|storageLocation" web/src --glob "!web/src/lib/staff-reports/**" --glob "!web/src/components/staff-reports/**" --glob "!web/src/models/item-report*" --glob "!web/src/lib/claims/staff-service*" --glob "!web/src/lib/reports/service*"
rg -n "localStorage|sessionStorage|console\.(log|debug|info)" web/src/lib/staff-reports web/src/components/staff-reports web/src/app/staff/reports web/src/app/api/staff/reports
git diff develop...HEAD -- web/package.json web/package-lock.json
git diff --check
```

Expected: only intentional Claim integration and test assertions reference
private handling outside its domain; no browser persistence/logging, package
change or whitespace error is present.

- [ ] **Step 5: Run complete repository gates**

```powershell
cd web
npm test
npm run lint
npm exec -- tsc --noEmit --incremental false
npm run build
npm audit
cd ..
git diff --check
git status --short
```

Expected: all tests pass, lint/typecheck/build pass, audit reports 0
vulnerabilities, diff check is clean, and only the planned Task 11 navigation
changes are uncommitted at this point.

- [ ] **Step 6: Perform bounded browser verification without real mutations**

Run the local application using the normal development command. Verify signed-
out `/staff/reports` redirects safely to `/login`, the console has no errors,
and the page exposes no report content before authentication. If a safe local
staff fixture is already available, verify the pending queue, detail, stored
state, released history and 320px layout without connecting tests to Atlas or
changing real coursework data. Record any state that cannot be exercised
safely as an explicit limitation rather than bypassing authentication.

- [ ] **Step 7: Write the exact verification record**

Record the course requirement, commit list, implemented workflow, embedded
state rationale, permission/privacy/legacy/concurrency evidence, focused and
full command outputs, browser observations, dependency/scope scan, limitations,
and confirmation that inventory/chat/scanning/analytics remain deferred. Do
not claim a browser state that was not actually observed.

- [ ] **Step 8: Commit navigation and verified evidence**

```powershell
git add web/src/components/site-header.tsx web/src/components/site-header.test.tsx web/src/components/dashboard/dashboard-client.tsx web/src/components/dashboard/dashboard-client.test.tsx docs/superpowers/verification/2026-08-29-staff-report-verification-storage.md
git commit -m "docs: verify staff report handling"
```

- [ ] **Step 9: Final clean-tree and branch review**

```powershell
git status --short
git log --oneline develop..HEAD
git diff --stat develop...HEAD
git diff --check develop...HEAD
```

Expected: clean worktree, only feature-scoped commits/files, and no whitespace
errors. Stop before push or PR creation unless the user authorizes that external
action.
