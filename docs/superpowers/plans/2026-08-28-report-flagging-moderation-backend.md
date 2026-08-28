# Report Flagging and Administrator Moderation Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure member report-flagging and active-administrator moderation backend that hides unsafe reports reversibly, preserves existing Claim history, and records every administrative decision immutably.

**Architecture:** Add one orthogonal moderation field to `ItemReport` plus focused `ReportFlag` and append-only `ReportModerationEvent` models. A small `lib/moderation` domain owns strict contracts, access, errors, member submission, administrator queues, and transactional decisions; existing report, matching, and new-Claim queries receive only the minimum `moderationStatus != hidden` predicates. Thin Next.js handlers authenticate before parsing, and all success mappers are strict allow lists.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, Mongoose 9, MongoDB transactions and indexes, Zod 4, Vitest 4, and the native Request/Response APIs.

## Global Constraints

- The approved source of truth is `docs/superpowers/specs/2026-08-28-report-flagging-moderation-backend-design.md`.
- The public endpoints are exactly `POST /api/reports/{reportId}/flags`, `GET /api/admin/reports`, `GET /api/admin/report-flags`, `PATCH /api/admin/report-flags/{flagId}`, and `PATCH /api/admin/reports/{reportId}/moderation`.
- Member flag reasons are exactly `inappropriate_content`, `suspected_fraud`, `privacy_concern`, `duplicate_report`, and `other`; `other` requires non-empty details.
- Direct administrator hide reasons are exactly `inappropriate_content`, `suspected_fraud`, `privacy_concern`, `duplicate_report`, and `administrative_review`.
- Flag details, administrator notes, and resolution notes are at most 500 characters.
- Administrator pages use a fixed page size of 20, positive page numbers, strict query keys, deterministic ordering, and `totalItems`/`totalPages` metadata.
- A submitted report has recovery status `open`, `claim_pending`, `resolved`, or `closed`. Draft reports are not flaggable or administratively moderated.
- New reports default to `moderationStatus: "visible"`. A missing legacy field is read as visible; an unknown stored moderation value is rejected by safe output mapping.
- Member discovery, matching, Claim-question retrieval, and new Claim creation require `moderationStatus: { $ne: "hidden" }`.
- An owner may load their hidden report directly and sees only `moderationStatus: "hidden"`. Every non-owner receives `REPORT_NOT_FOUND`.
- Existing Claim history/detail, staff review/decision, withdrawal, and handover flows keep loading report context without a moderation filter.
- One named partial unique index permits at most one `pending` flag per report and member.
- Flag submission rechecks submitted/visible/non-owner eligibility immediately before insert and relies on the unique index for duplicates. A rare concurrent hide may leave a harmless pending flag on an already hidden report; it never republishes content and remains resolvable in the administrator queue.
- Every administrator mutation re-authorises an active administrator in its MongoDB transaction, uses exact `updatedAt` concurrency tokens, and writes one immutable moderation event before commit.
- Hiding actions every pending flag visible to that transaction. Restoring never reopens a resolved flag.
- Authentication and active-role checks happen before route IDs, query strings, content types, or JSON bodies are parsed.
- Moderation responses never expose reporter, flagger, or administrator identities; private verification data is never queried.
- There is no permanent deletion, `DELETE` route, content editing, bulk action, account punishment, AI classification, appeal/chat flow, audit-browsing endpoint, notification type, or moderation frontend.
- Add no package dependency, generic repository, generic CRUD layer, event bus, mutable report counter, migration, or production backfill.
- Tests mock database, model, session, and request boundaries; they never read `.env.local` or connect to Atlas.

---

## File Structure

### New files

- `web/src/models/item-report.test.ts` — moderation default, enum, and index-facing regression tests for ItemReport.
- `web/src/models/report-flag.ts` — controlled member flag lifecycle, hidden fields, and named partial uniqueness.
- `web/src/models/report-flag.test.ts` — flag invariants, field selection, immutability, and indexes.
- `web/src/models/report-moderation-event.ts` — append-only dismissal/hide/restore audit evidence.
- `web/src/models/report-moderation-event.test.ts` — action/state/reason invariants, immutability, and indexes.
- `web/src/lib/moderation/validation.ts` — canonical IDs, strict queries, strict mutation unions, text bounds, and query conversion.
- `web/src/lib/moderation/validation.test.ts` — normalization, bounds, union, repeated-key, and unknown-key tests.
- `web/src/lib/moderation/contracts.ts` — strict success schemas and allow-list mappers for receipts, reports, flags, and pages.
- `web/src/lib/moderation/contracts.test.ts` — legacy normalization, pagination integrity, privacy exclusion, and malformed-record tests.
- `web/src/lib/moderation/access.ts` — active-member and active-administrator session boundaries.
- `web/src/lib/moderation/access.test.ts` — role/status matrix and authentication-before-parsing proof.
- `web/src/lib/moderation/errors.ts` — closed moderation error domain and exact named-index duplicate classification.
- `web/src/lib/moderation/errors.test.ts` — HTTP mapping, field errors, duplicate discrimination, and redaction.
- `web/src/lib/moderation/flag-service.ts` — member-only flag submission.
- `web/src/lib/moderation/flag-service.test.ts` — report eligibility, ownership, receipt privacy, and duplicate races.
- `web/src/lib/moderation/admin-service.ts` — administrator report/flag pages and transactional dismissal/hide/restore decisions.
- `web/src/lib/moderation/admin-service.test.ts` — safe aggregates, optimistic writes, actor re-authorisation, bulk flag actioning, rollback, and session cleanup.
- `web/src/app/api/reports/[id]/flags/route.ts` — authenticated member flag endpoint.
- `web/src/app/api/reports/[id]/flags/report-flag-route.test.ts` — method, access order, validation, success, and safe-error tests.
- `web/src/app/api/admin/reports/route.ts` — authenticated administrator report page.
- `web/src/app/api/admin/reports/admin-report-list-route.test.ts` — strict query and closed response tests.
- `web/src/app/api/admin/report-flags/route.ts` — authenticated administrator flag page.
- `web/src/app/api/admin/report-flags/[flagId]/route.ts` — authenticated flag decision endpoint.
- `web/src/app/api/admin/report-flags/admin-report-flag-routes.test.ts` — queue and decision route tests.
- `web/src/app/api/admin/reports/[reportId]/moderation/route.ts` — authenticated direct hide/restore endpoint.
- `web/src/app/api/admin/reports/[reportId]/moderation/admin-report-moderation-route.test.ts` — strict direct-decision route tests.
- `docs/superpowers/verification/2026-08-28-report-flagging-moderation-backend.md` — exact Issue #44 quality, privacy, and scope evidence.

### Modified files

- `web/src/models/item-report.ts` — add the moderation enum, default field, and canonical legacy normalizer.
- `web/src/lib/reports/public-report.ts` and `public-report.test.ts` — include canonical moderation state without leaking moderation evidence.
- `web/src/lib/reports/browser-client.ts` and `browser-client.test.ts` — require the new field in owner/member browser schemas.
- `web/src/lib/reports/browse-service.ts` and `browse-service.test.ts` — exclude hidden list records and apply owner-only hidden detail semantics.
- `web/src/lib/reports/matching-service.ts` and `matching-service.test.ts` — exclude hidden source and candidate reports.
- `web/src/lib/claims/claimant-service.ts` and `claimant-service.test.ts` — block only new Claim questions/creation for hidden reports.
- `web/src/app/api/reports/report-routes.test.ts`, `browse-routes.test.ts`, and `matching-routes.test.ts` — update strict report fixtures and visibility assertions.
- `web/src/components/reports/report-browser.test.tsx`, `report-card.test.tsx`, `report-detail-client.test.tsx`, `report-matches-panel.test.tsx`, and `report-submission-client.test.tsx` — update typed report fixtures only; no moderation UI is added.

No other production file belongs in Issue #44 unless a failing type or regression test proves that an existing strict report boundary consumes the new required field.

---

### Task 1: Add the orthogonal ItemReport moderation state

**Files:**
- Modify: `web/src/models/item-report.ts`
- Create: `web/src/models/item-report.test.ts`

**Interfaces:**
- Consumes: the existing `itemReportSchema` and Mongoose model.
- Produces:

```ts
export const REPORT_MODERATION_STATUSES = ["visible", "hidden"] as const;
export type ReportModerationStatus =
  (typeof REPORT_MODERATION_STATUSES)[number];

export function normalizeReportModerationStatus(
  value: unknown,
): ReportModerationStatus;
```

- [ ] **Step 1: Write failing moderation model tests**

Create `item-report.test.ts` with a minimal valid report factory and exact tests:

```ts
import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import {
  ItemReportModel,
  REPORT_MODERATION_STATUSES,
  itemReportSchema,
  normalizeReportModerationStatus,
} from "./item-report";

const reporterId = new mongoose.Types.ObjectId();
const categoryId = new mongoose.Types.ObjectId();
const campusLocationId = new mongoose.Types.ObjectId();

function report(overrides: Record<string, unknown> = {}) {
  return new ItemReportModel({
    reporterId,
    reportType: "lost",
    title: "Black laptop bag",
    publicDescription: "Black laptop bag with a shoulder strap.",
    categoryId,
    campusLocationId,
    occurredAt: new Date("2026-08-28T01:00:00.000Z"),
    colors: ["black"],
    status: "open",
    ...overrides,
  });
}

describe("ItemReport moderation state", () => {
  it("defaults new reports to visible", async () => {
    const record = report();
    await expect(record.validate()).resolves.toBeUndefined();
    expect(record.moderationStatus).toBe("visible");
  });

  it.each(REPORT_MODERATION_STATUSES)("accepts %s", async (moderationStatus) => {
    await expect(report({ moderationStatus }).validate()).resolves.toBeUndefined();
  });

  it("rejects an unknown moderation state", async () => {
    await expect(
      report({ moderationStatus: "removed" }).validate(),
    ).rejects.toMatchObject({ errors: { moderationStatus: expect.anything() } });
  });

  it("normalizes only a missing legacy value", () => {
    expect(normalizeReportModerationStatus(undefined)).toBe("visible");
    expect(normalizeReportModerationStatus("hidden")).toBe("hidden");
    expect(() => normalizeReportModerationStatus("removed")).toThrow(
      "Report moderation status is invalid",
    );
  });

  it("stores moderation independently from recovery status", () => {
    expect(itemReportSchema.path("moderationStatus").options.required).toBe(true);
    expect(itemReportSchema.path("status").options.enum).not.toContain("hidden");
  });
});
```

- [ ] **Step 2: Run the model test and verify the missing contract**

Run from `web/`:

```powershell
npm.cmd test -- src/models/item-report.test.ts
```

Expected: FAIL because `REPORT_MODERATION_STATUSES`, `moderationStatus`, and `normalizeReportModerationStatus` do not exist.

- [ ] **Step 3: Add the minimal field and normalizer**

In `item-report.ts`, export the enum beside the existing report enums:

```ts
export const REPORT_MODERATION_STATUSES = ["visible", "hidden"] as const;
export type ReportModerationStatus =
  (typeof REPORT_MODERATION_STATUSES)[number];

export function normalizeReportModerationStatus(
  value: unknown,
): ReportModerationStatus {
  if (value === undefined) return "visible";
  if (value === "visible" || value === "hidden") return value;
  throw new Error("Report moderation status is invalid");
}
```

Add this schema field immediately after recovery `status`:

```ts
moderationStatus: {
  type: String,
  enum: REPORT_MODERATION_STATUSES,
  default: "visible",
  required: true,
},
```

Do not add a migration, compound index, hidden recovery status, or moderation metadata to `ItemReport`.

- [ ] **Step 4: Run the model test**

```powershell
npm.cmd test -- src/models/item-report.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the persistence change**

```powershell
git add web/src/models/item-report.ts web/src/models/item-report.test.ts
git commit -m "feat(moderation): add report visibility state"
```

### Task 2: Add the controlled ReportFlag lifecycle

**Files:**
- Create: `web/src/models/report-flag.ts`
- Create: `web/src/models/report-flag.test.ts`

**Interfaces:**
- Consumes: Mongoose `Schema`, `model`, and `InferSchemaType`.
- Produces:

```ts
export const REPORT_FLAG_REASONS = [
  "inappropriate_content",
  "suspected_fraud",
  "privacy_concern",
  "duplicate_report",
  "other",
] as const;
export const REPORT_FLAG_STATUSES = [
  "pending",
  "dismissed",
  "actioned",
] as const;
export const PENDING_REPORT_FLAG_INDEX =
  "unique_pending_report_flag_per_member";
export type ReportFlagReason = (typeof REPORT_FLAG_REASONS)[number];
export type ReportFlagStatus = (typeof REPORT_FLAG_STATUSES)[number];
export const ReportFlagModel: Model<ReportFlag>;
```

- [ ] **Step 1: Write failing lifecycle, privacy, and index tests**

Create a valid pending factory and cover these exact invariants:

```ts
describe("ReportFlag model", () => {
  it("defaults a valid record to pending with null review fields", async () => {
    const record = flag();
    await expect(record.validate()).resolves.toBeUndefined();
    expect(record.status).toBe("pending");
    expect(record.reviewedByAdministratorId).toBeNull();
    expect(record.reviewedAt).toBeNull();
    expect(record.resolutionNote).toBeNull();
  });

  it("requires details only for other", async () => {
    await expect(flag({ reason: "other", details: null }).validate())
      .rejects.toMatchObject({ errors: { details: expect.anything() } });
    await expect(
      flag({ reason: "other", details: "A different safety concern" }).validate(),
    ).resolves.toBeUndefined();
  });

  it("requires reviewer and time for resolved states", async () => {
    await expect(
      flag({ status: "dismissed" }).validate(),
    ).rejects.toMatchObject({
      errors: {
        reviewedByAdministratorId: expect.anything(),
        reviewedAt: expect.anything(),
      },
    });
  });

  it("forbids review fields while pending", async () => {
    await expect(
      flag({
        reviewedByAdministratorId: administratorId,
        reviewedAt: new Date(),
      }).validate(),
    ).rejects.toBeDefined();
  });

  it("hides identities and controlled text by default", () => {
    expect(reportFlagSchema.path("submittedByUserId").options.select).toBe(false);
    expect(
      reportFlagSchema.path("reviewedByAdministratorId").options.select,
    ).toBe(false);
    expect(reportFlagSchema.path("details").options.select).toBe(false);
    expect(reportFlagSchema.path("resolutionNote").options.select).toBe(false);
  });

  it("defines only the named pending uniqueness and queue indexes", () => {
    expect(reportFlagSchema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { reportId: 1, submittedByUserId: 1, status: 1 },
          expect.objectContaining({
            name: PENDING_REPORT_FLAG_INDEX,
            unique: true,
            partialFilterExpression: { status: "pending" },
          }),
        ],
        [{ status: 1, createdAt: -1, _id: -1 }, expect.any(Object)],
        [
          { reason: 1, status: 1, createdAt: -1, _id: -1 },
          expect.any(Object),
        ],
        [{ reportId: 1, status: 1, createdAt: -1 }, expect.any(Object)],
      ]),
    );
  });
});
```

Also assert required/immutable references, enum rejection, 500-character limits, timestamps, and immutable `reason`/`details`.

- [ ] **Step 2: Run the model test and verify it fails**

```powershell
npm.cmd test -- src/models/report-flag.test.ts
```

Expected: FAIL because the model does not exist.

- [ ] **Step 3: Implement the minimal ReportFlag schema**

Use collection `report_flags` and timestamps. The core schema fields are:

```ts
reportId: {
  type: Schema.Types.ObjectId,
  ref: "ItemReport",
  required: true,
  immutable: true,
},
submittedByUserId: {
  type: Schema.Types.ObjectId,
  ref: "User",
  required: true,
  immutable: true,
  select: false,
},
reason: {
  type: String,
  enum: REPORT_FLAG_REASONS,
  required: true,
  immutable: true,
},
details: {
  type: String,
  trim: true,
  maxlength: 500,
  default: null,
  immutable: true,
  select: false,
},
status: {
  type: String,
  enum: REPORT_FLAG_STATUSES,
  default: "pending",
  required: true,
},
reviewedByAdministratorId: {
  type: Schema.Types.ObjectId,
  ref: "User",
  default: null,
  select: false,
},
reviewedAt: { type: Date, default: null },
resolutionNote: {
  type: String,
  trim: true,
  maxlength: 500,
  default: null,
  select: false,
},
```

Add one pre-validation hook: `other` requires non-empty details; pending records require all review fields to be null; dismissed/actioned records require reviewer and time. Add exactly the four approved indexes and export the normal cached Mongoose model.

- [ ] **Step 4: Run the model test**

```powershell
npm.cmd test -- src/models/report-flag.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the flag model**

```powershell
git add web/src/models/report-flag.ts web/src/models/report-flag.test.ts
git commit -m "feat(moderation): add report flag lifecycle"
```

### Task 3: Add immutable moderation events

**Files:**
- Create: `web/src/models/report-moderation-event.ts`
- Create: `web/src/models/report-moderation-event.test.ts`

**Interfaces:**
- Consumes: `REPORT_FLAG_REASONS` and `REPORT_MODERATION_STATUSES`.
- Produces:

```ts
export const REPORT_MODERATION_ACTIONS = [
  "flag_dismissed",
  "report_hidden",
  "report_restored",
] as const;
export const DIRECT_REPORT_HIDE_REASONS = [
  "inappropriate_content",
  "suspected_fraud",
  "privacy_concern",
  "duplicate_report",
  "administrative_review",
] as const;
export const REPORT_MODERATION_EVENT_REASONS = [
  ...REPORT_FLAG_REASONS,
  "administrative_review",
  "flag_dismissed",
  "moderation_reversed",
] as const;
export const ReportModerationEventModel: Model<ReportModerationEvent>;
```

- [ ] **Step 1: Write failing action-invariant tests**

Create factories for these three valid records and validate all of them:

```ts
const dismissal = {
  actorAdministratorId,
  reportId,
  sourceFlagId,
  action: "flag_dismissed",
  reason: "flag_dismissed",
  previousModerationStatus: null,
  newModerationStatus: null,
};
const hiding = {
  actorAdministratorId,
  reportId,
  sourceFlagId,
  action: "report_hidden",
  reason: "privacy_concern",
  previousModerationStatus: "visible",
  newModerationStatus: "hidden",
};
const restoring = {
  actorAdministratorId,
  reportId,
  sourceFlagId: null,
  action: "report_restored",
  reason: "moderation_reversed",
  previousModerationStatus: "hidden",
  newModerationStatus: "visible",
};
```

Reject these exact invalid cases:

- dismissal without `sourceFlagId`;
- dismissal with moderation states;
- hiding with `flag_dismissed` or a non-`visible -> hidden` transition;
- restoring with a source flag, a non-`hidden -> visible` transition, or a reason other than `moderation_reversed`;
- notes longer than 500 characters.

Assert every persisted field is immutable, timestamps are disabled, `occurredAt` defaults to a Date, and the report/actor indexes exactly match the design.

- [ ] **Step 2: Run the event test and verify it fails**

```powershell
npm.cmd test -- src/models/report-moderation-event.test.ts
```

Expected: FAIL because the model does not exist.

- [ ] **Step 3: Implement the append-only schema**

Use collection `report_moderation_events` and `timestamps: false`. Define all approved fields, make each immutable, make `note` trimmed/max 500, and use one pre-validation switch:

```ts
reportModerationEventSchema.pre("validate", function () {
  if (this.action === "flag_dismissed") {
    if (!this.sourceFlagId) {
      this.invalidate("sourceFlagId", "Flag dismissal requires a source flag");
    }
    if (
      this.reason !== "flag_dismissed" ||
      this.previousModerationStatus !== null ||
      this.newModerationStatus !== null
    ) {
      this.invalidate("action", "Flag dismissal audit state is invalid");
    }
    return;
  }

  if (this.action === "report_hidden") {
    if (
      this.previousModerationStatus !== "visible" ||
      this.newModerationStatus !== "hidden" ||
      this.reason === "flag_dismissed" ||
      this.reason === "moderation_reversed"
    ) {
      this.invalidate("action", "Report hide audit state is invalid");
    }
    return;
  }

  if (
    this.sourceFlagId !== null ||
    this.reason !== "moderation_reversed" ||
    this.previousModerationStatus !== "hidden" ||
    this.newModerationStatus !== "visible"
  ) {
    this.invalidate("action", "Report restore audit state is invalid");
  }
});
```

No update/delete service or audit list route is created.

- [ ] **Step 4: Run all persistence tests**

```powershell
npm.cmd test -- src/models/item-report.test.ts src/models/report-flag.test.ts src/models/report-moderation-event.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit immutable audit evidence**

```powershell
git add web/src/models/report-moderation-event.ts web/src/models/report-moderation-event.test.ts
git commit -m "feat(moderation): add immutable decision events"
```

### Task 4: Define strict moderation inputs and success contracts

**Files:**
- Create: `web/src/lib/moderation/validation.ts`
- Create: `web/src/lib/moderation/validation.test.ts`
- Create: `web/src/lib/moderation/contracts.ts`
- Create: `web/src/lib/moderation/contracts.test.ts`

**Interfaces:**
- Consumes: report/flag/moderation enums, Zod 4, and `normalizeReportModerationStatus`.
- Produces:

```ts
export const MODERATION_PAGE_SIZE = 20;
export const moderationObjectIdSchema: z.ZodType<string>;
export const submitReportFlagSchema: z.ZodType<SubmitReportFlagInput>;
export const adminReportListQuerySchema: z.ZodType<AdminReportListQuery>;
export const adminFlagListQuerySchema: z.ZodType<AdminFlagListQuery>;
export const reportFlagDecisionSchema: z.ZodType<ReportFlagDecisionInput>;
export const reportModerationSchema: z.ZodType<ReportModerationInput>;
export type SubmitReportFlagInput = z.output<typeof submitReportFlagSchema>;
export type AdminReportListQuery =
  z.output<typeof adminReportListQuerySchema>;
export type AdminFlagListQuery = z.output<typeof adminFlagListQuerySchema>;
export type ReportFlagDecisionInput =
  z.output<typeof reportFlagDecisionSchema>;
export type ReportModerationInput = z.output<typeof reportModerationSchema>;
export function toModerationQueryInput(
  searchParams: URLSearchParams,
): Record<string, string | string[]>;
export function isJsonRequest(request: Request): boolean;

export type ReportFlagReceipt;
export type AdminReportSummary;
export type AdminReportFlag;
export type AdminReportPage;
export type AdminReportFlagPage;
export type AdminReportFlagDecisionResult;
export const reportFlagReceiptSchema: z.ZodType<ReportFlagReceipt>;
export const adminReportSummarySchema: z.ZodType<AdminReportSummary>;
export const adminReportFlagSchema: z.ZodType<AdminReportFlag>;
export const adminReportPageSchema: z.ZodType<AdminReportPage>;
export const adminReportFlagPageSchema: z.ZodType<AdminReportFlagPage>;
export const adminReportFlagDecisionResultSchema:
  z.ZodType<AdminReportFlagDecisionResult>;
export function toReportFlagReceipt(record: ReportFlagRecord): ReportFlagReceipt;
export function toAdminReportSummary(
  record: AdminReportRecord,
): AdminReportSummary;
export function toAdminReportFlag(
  record: AdminReportFlagRecord,
  report: AdminReportRecord,
): AdminReportFlag;
export function parseAdminReportPage(
  aggregate: unknown,
  page: number,
): AdminReportPage;
export function parseAdminReportFlagPage(
  aggregate: unknown,
  page: number,
): AdminReportFlagPage;
```

- [ ] **Step 1: Write failing strict-input tests**

In `validation.test.ts` prove exact normalization and rejection:

```ts
it("normalizes the complete administrator report query", () => {
  expect(
    adminReportListQuerySchema.parse(
      toModerationQueryInput(
        new URLSearchParams(
          "q=%EF%BC%ACaptop++bag&reportType=lost&reportStatus=open" +
            "&moderationStatus=hidden&page=2",
        ),
      ),
    ),
  ).toEqual({
    q: "Laptop bag",
    reportType: "lost",
    reportStatus: "open",
    moderationStatus: "hidden",
    page: 2,
  });
});

it.each([
  "page=0",
  "page=01",
  "page=10001",
  "reportStatus=draft",
  "moderationStatus=deleted",
  "page=1&page=2",
  "unknown=value",
])("rejects administrator report query %s", (query) => {
  expect(
    adminReportListQuerySchema.safeParse(
      toModerationQueryInput(new URLSearchParams(query)),
    ).success,
  ).toBe(false);
});

it("requires details only for other and strips authority fields", () => {
  expect(
    submitReportFlagSchema.parse({
      reason: "privacy_concern",
      details: "  Public phone number  ",
    }),
  ).toEqual({
    reason: "privacy_concern",
    details: "Public phone number",
  });
  expect(
    submitReportFlagSchema.safeParse({ reason: "other", details: " " }).success,
  ).toBe(false);
  expect(
    submitReportFlagSchema.safeParse({
      reason: "privacy_concern",
      details: null,
      submittedByUserId: "64b64c6f2f4d9f1a2b3c4d50",
    }).success,
  ).toBe(false);
});

it("accepts only exact decision unions", () => {
  expect(
    reportFlagDecisionSchema.safeParse({
      decision: "dismiss",
      expectedFlagUpdatedAt: "2026-08-28T01:00:00.000Z",
      expectedReportUpdatedAt: "2026-08-28T01:00:00.000Z",
      note: null,
    }).success,
  ).toBe(false);
  expect(
    reportFlagDecisionSchema.safeParse({
      decision: "hide_report",
      expectedFlagUpdatedAt: "2026-08-28T01:00:00.000Z",
      expectedReportUpdatedAt: "2026-08-28T01:00:00.000Z",
      note: "Confirmed privacy issue",
    }).success,
  ).toBe(true);
});
```

Also cover every reason, 500/501-character boundaries, invalid control/surrogate characters, canonical lowercase ObjectId transformation, flag `status`/`reason` filters, exact ISO timestamps, hide/restore direct unions, unsupported content types, and repeated/unknown query keys.

- [ ] **Step 2: Write failing strict-output tests**

In `contracts.test.ts` build Mongoose-shaped records and assert:

```ts
it("maps a legacy report to the complete administrator allow list", () => {
  expect(toAdminReportSummary(adminReportRecord({ moderationStatus: undefined })))
    .toEqual({
      id: reportId,
      reportType: "lost",
      title: "Black laptop bag",
      publicDescription: "Black laptop bag with a shoulder strap.",
      categoryId,
      campusLocationId,
      occurredAt: "2026-08-28T01:00:00.000Z",
      colors: ["black"],
      tags: ["laptop", "bag"],
      photoUrls: ["https://images.example.test/bag.jpg"],
      status: "open",
      moderationStatus: "visible",
      privacySettings: {
        showPhoto: false,
        showEventDate: false,
        showCampusLocation: false,
      },
      resolvedAt: null,
      createdAt: "2026-08-28T02:00:00.000Z",
      updatedAt: "2026-08-28T02:00:00.000Z",
    });
});

it("never serializes actor or private-verification fields", () => {
  const result = toAdminReportFlag(
    flagRecord({
      submittedByUserId: "PRIVATE-FLAGGER",
      reviewedByAdministratorId: "PRIVATE-ADMIN",
    }),
    adminReportRecord({
      reporterId: "PRIVATE-REPORTER",
      serialNumber: "PRIVATE-SERIAL",
      expectedAnswer: "PRIVATE-ANSWER",
    }),
  );
  expect(JSON.stringify(result)).not.toMatch(
    /PRIVATE|reporterId|submittedByUserId|reviewedByAdministratorId|serialNumber|expectedAnswer/,
  );
});

it("rejects inconsistent or over-size pages", () => {
  expect(
    adminReportPageSchema.safeParse({
      reports: [],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 21,
        totalPages: 1,
      },
    }).success,
  ).toBe(false);
});
```

Also test the member receipt omission of `details`, clone array behavior, `visible`/`hidden` output, rejected unknown stored moderation states, complete empty pages, malformed dates/IDs, unknown aggregate fields, and resolved flag notes available only in the administrator mapper.

- [ ] **Step 3: Run both contract files and verify they fail**

```powershell
npm.cmd test -- src/lib/moderation/validation.test.ts src/lib/moderation/contracts.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement strict input schemas**

Use a shared text normalizer that rejects `Cc`, `Cf`, and `Cs` characters, applies NFKC, trims, and collapses whitespace. Implement:

```ts
const canonicalPage = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(10_000));

export const moderationObjectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Moderation reference is invalid")
  .transform((value) => value.toLowerCase());

export const submitReportFlagSchema = z
  .strictObject({
    reason: z.enum(REPORT_FLAG_REASONS),
    details: optionalControlledText(500),
  })
  .superRefine(({ reason, details }, context) => {
    if (reason === "other" && details === null) {
      context.addIssue({
        code: "custom",
        path: ["details"],
        message: "Details are required for another concern",
      });
    }
  });
```

Define the report/flag list schemas and the exact discriminated mutation unions from the approved design. `isJsonRequest` accepts only `application/json` with an optional charset.

- [ ] **Step 5: Implement strict output schemas and mappers**

Declare exact strict schemas for:

- the five-field member receipt;
- the complete approved administrator report summary;
- an administrator flag with nested `report`;
- both 20-item page envelopes;
- `{ flag, report }` decision success.

Use `normalizeReportModerationStatus` only at mapping boundaries. Aggregate parsers must validate one `$facet` result, read zero-or-one metadata rows, calculate `totalPages`, and reject any unknown projected field. Do not expose an audit-event response schema.

- [ ] **Step 6: Run contract tests and standalone TypeScript**

```powershell
npm.cmd test -- src/lib/moderation/validation.test.ts src/lib/moderation/contracts.test.ts
npm.cmd exec -- tsc --noEmit --incremental false
```

Expected: focused tests PASS. TypeScript may still identify existing report fixtures that need the new required moderation field; record those exact files for Task 9 and do not weaken the new schemas.

- [ ] **Step 7: Commit the moderation contracts**

```powershell
git add web/src/lib/moderation/validation.ts web/src/lib/moderation/validation.test.ts web/src/lib/moderation/contracts.ts web/src/lib/moderation/contracts.test.ts
git commit -m "feat(moderation): define strict contracts"
```

### Task 5: Add the closed access and error boundary

**Files:**
- Create: `web/src/lib/moderation/access.ts`
- Create: `web/src/lib/moderation/access.test.ts`
- Create: `web/src/lib/moderation/errors.ts`
- Create: `web/src/lib/moderation/errors.test.ts`

**Interfaces:**
- Consumes: `PublicUser`, `readSessionCookie`, `getCurrentUser`, `AuthError`, `ZodError`, and `PENDING_REPORT_FLAG_INDEX`.
- Produces:

```ts
export function requireModerationMember(user: PublicUser): void;
export function requireModerationAdministrator(user: PublicUser): void;
export function getCurrentModerationMember(): Promise<PublicUser>;
export function getCurrentModerationAdministrator(): Promise<PublicUser>;

export type ModerationErrorCode =
  | "ACTIVE_ACCOUNT_REQUIRED"
  | "ADMINISTRATOR_REQUIRED"
  | "REPORT_FLAG_FORBIDDEN"
  | "REPORT_NOT_FOUND"
  | "REPORT_FLAG_NOT_FOUND"
  | "REPORT_FLAG_ALREADY_PENDING"
  | "REPORT_FLAG_STATE_CONFLICT"
  | "REPORT_MODERATION_CONFLICT"
  | "REPORT_MODERATION_FAILED";
export class ModerationError extends Error;
export function invalidModerationResponse(error?: ZodError): Response;
export function moderationErrorResponse(error: unknown): Response;
export function isPendingReportFlagDuplicate(error: unknown): boolean;
```

- [ ] **Step 1: Write failing access matrix tests**

Use one complete `PublicUser` factory and assert:

```ts
it.each(["student", "staff", "administrator"] as const)(
  "allows active %s member flagging",
  (role) => {
    expect(() => requireModerationMember(user(role, "active"))).not.toThrow();
  },
);

it.each(["suspended", "deactivated"] as const)(
  "rejects %s members",
  (status) => {
    expect(() => requireModerationMember(user("student", status))).toThrow(
      expect.objectContaining({ code: "ACTIVE_ACCOUNT_REQUIRED" }),
    );
  },
);

it("loads inactive sessions before returning the role error", async () => {
  vi.mocked(readSessionCookie).mockResolvedValue("raw-session");
  vi.mocked(getCurrentUser).mockResolvedValue(
    user("administrator", "suspended"),
  );
  await expect(getCurrentModerationAdministrator()).rejects.toMatchObject({
    code: "ADMINISTRATOR_REQUIRED",
  });
  expect(getCurrentUser).toHaveBeenCalledWith("raw-session", {
    includeInactive: true,
  });
});
```

Cover missing sessions as `AUTHENTICATION_REQUIRED`, active non-admin roles as `ADMINISTRATOR_REQUIRED`, and unknown cookie/current-user failures passed to the route error boundary.

- [ ] **Step 2: Write failing exact error tests**

Table-test every approved code/status/message. Add:

```ts
it("recognizes only the named pending-flag index", () => {
  expect(
    isPendingReportFlagDuplicate({
      code: 11000,
      index: PENDING_REPORT_FLAG_INDEX,
    }),
  ).toBe(true);
  expect(
    isPendingReportFlagDuplicate({
      code: 11000,
      index: "another_unique_index",
    }),
  ).toBe(false);
  expect(
    isPendingReportFlagDuplicate({
      code: 11000,
      message: "duplicate key index: unique_pending_report_flag_per_member",
    }),
  ).toBe(true);
});

it("redacts unknown failures", async () => {
  const response = moderationErrorResponse(
    new Error("mongodb://private-host/raw-value"),
  );
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    error: {
      code: "REPORT_MODERATION_FAILED",
      message: "Report moderation could not be completed",
    },
  });
});
```

Prove that only `AUTHENTICATION_REQUIRED` is delegated to `authErrorResponse` and that validation field arrays are present only when supplied by a Zod error.

- [ ] **Step 3: Run safety tests and verify they fail**

```powershell
npm.cmd test -- src/lib/moderation/access.test.ts src/lib/moderation/errors.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement the smallest closed boundary**

```ts
export function requireModerationMember(user: PublicUser) {
  if (user.status !== "active") {
    throw new ModerationError("ACTIVE_ACCOUNT_REQUIRED");
  }
}

export function requireModerationAdministrator(user: PublicUser) {
  if (user.role !== "administrator" || user.status !== "active") {
    throw new ModerationError("ADMINISTRATOR_REQUIRED");
  }
}

export async function getCurrentModerationMember() {
  const user = await getCurrentUser(await readSessionCookie(), {
    includeInactive: true,
  });
  if (!user) throw new AuthError("AUTHENTICATION_REQUIRED");
  requireModerationMember(user);
  return user;
}
```

The administrator loader follows the same shape with `requireModerationAdministrator`. Implement the exact error table from the design and a single safe fallback to `REPORT_MODERATION_FAILED`. Do not add logging of request data or raw errors.

Use these definitions verbatim:

```ts
const definitions = {
  ACTIVE_ACCOUNT_REQUIRED: {
    status: 403,
    message: "An active account is required",
  },
  ADMINISTRATOR_REQUIRED: {
    status: 403,
    message: "Administrator access required",
  },
  REPORT_FLAG_FORBIDDEN: {
    status: 403,
    message: "Report cannot be flagged",
  },
  REPORT_NOT_FOUND: {
    status: 404,
    message: "Report not found",
  },
  REPORT_FLAG_NOT_FOUND: {
    status: 404,
    message: "Report flag not found",
  },
  REPORT_FLAG_ALREADY_PENDING: {
    status: 409,
    message: "A pending flag already exists",
  },
  REPORT_FLAG_STATE_CONFLICT: {
    status: 409,
    message: "Report flag state has changed",
  },
  REPORT_MODERATION_CONFLICT: {
    status: 409,
    message: "Report moderation state has changed",
  },
  REPORT_MODERATION_FAILED: {
    status: 500,
    message: "Report moderation could not be completed",
  },
} as const;
```

`invalidModerationResponse` always uses code `VALIDATION_ERROR` and message `Moderation request is invalid`, adding only Zod's bounded field-error arrays when supplied.

- [ ] **Step 5: Run the safety tests**

```powershell
npm.cmd test -- src/lib/moderation/access.test.ts src/lib/moderation/errors.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the safety boundary**

```powershell
git add web/src/lib/moderation/access.ts web/src/lib/moderation/access.test.ts web/src/lib/moderation/errors.ts web/src/lib/moderation/errors.test.ts
git commit -m "feat(moderation): add closed access boundary"
```

### Task 6: Implement member flag submission and its route

**Files:**
- Create: `web/src/lib/moderation/flag-service.ts`
- Create: `web/src/lib/moderation/flag-service.test.ts`
- Create: `web/src/app/api/reports/[id]/flags/route.ts`
- Create: `web/src/app/api/reports/[id]/flags/report-flag-route.test.ts`

**Interfaces:**
- Consumes: `SubmitReportFlagInput`, `toReportFlagReceipt`, `requireModerationMember`, `ModerationError`, `isPendingReportFlagDuplicate`, `ItemReportModel`, and `ReportFlagModel`.
- Produces:

```ts
export async function submitReportFlag(
  member: PublicUser,
  reportId: string,
  input: SubmitReportFlagInput,
): Promise<ReportFlagReceipt>;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response>;
```

- [ ] **Step 1: Write failing member service tests**

Mock the database and both models. The happy path must assert this exact report eligibility filter:

```ts
expect(ItemReportModel.findOne).toHaveBeenCalledWith(
  {
    _id: reportId,
    status: { $in: ["open", "claim_pending", "resolved", "closed"] },
    moderationStatus: { $ne: "hidden" },
  },
  { _id: 1, reporterId: 1 },
);
expect(ReportFlagModel.create).toHaveBeenCalledWith({
  reportId: expect.objectContaining({}),
  submittedByUserId: expect.objectContaining({}),
  reason: "privacy_concern",
  details: "Public phone number",
  status: "pending",
});
```

Assert the receipt is exactly `id`, `reportId`, `reason`, `status`, and `createdAt`. Cover:

- active student, staff, and administrator success;
- suspended/deactivated rejection before `connectToDatabase`;
- missing/draft/hidden report as `REPORT_NOT_FOUND`;
- owned report as `REPORT_FLAG_FORBIDDEN`;
- a resolved prior flag does not block creation;
- only the exact named duplicate becomes `REPORT_FLAG_ALREADY_PENDING`;
- unrelated duplicate/model/mapper failures become `REPORT_MODERATION_FAILED` at the route boundary;
- response serialization contains no details or identities.

- [ ] **Step 2: Run the service test and verify it fails**

```powershell
npm.cmd test -- src/lib/moderation/flag-service.test.ts
```

Expected: FAIL because `submitReportFlag` does not exist.

- [ ] **Step 3: Implement the minimal submission service**

```ts
export async function submitReportFlag(
  member: PublicUser,
  reportId: string,
  input: SubmitReportFlagInput,
) {
  requireModerationMember(member);

  try {
    await connectToDatabase();
    const report = await ItemReportModel.findOne(
      {
        _id: new Types.ObjectId(reportId),
        status: { $in: [...MEMBER_REPORT_STATUSES] },
        moderationStatus: { $ne: "hidden" },
      },
      { _id: 1, reporterId: 1 },
    ).exec();
    if (!report) throw new ModerationError("REPORT_NOT_FOUND");
    if (report.reporterId.toString() === member.id) {
      throw new ModerationError("REPORT_FLAG_FORBIDDEN");
    }

    return toReportFlagReceipt(
      await ReportFlagModel.create({
        reportId: report._id,
        submittedByUserId: new Types.ObjectId(member.id),
        reason: input.reason,
        details: input.details,
        status: "pending",
      }),
    );
  } catch (error) {
    if (error instanceof ModerationError) throw error;
    if (isPendingReportFlagDuplicate(error)) {
      throw new ModerationError("REPORT_FLAG_ALREADY_PENDING");
    }
    throw new ModerationError("REPORT_MODERATION_FAILED");
  }
}
```

Do not query private verification data, existing flags, or report-owner account data.

- [ ] **Step 4: Write failing route-order and response tests**

The route test must prove:

- only `POST` is exported and no `DELETE` exists;
- missing session returns 401 before the parameter promise or body is read;
- suspended/deactivated session returns 403 before parsing;
- a rejected parameter promise maps to closed 500;
- invalid/uppercase-noncanonical IDs, unsupported content type, malformed JSON, empty body, unknown fields, invalid reason, and overlong details return safe 400;
- valid input is normalized and passed once to `submitReportFlag`;
- success is 201 with `Cache-Control: no-store`;
- every domain code maps exactly and an unknown service error is redacted.

Use this access-order sentinel:

```ts
const request = {
  get headers() {
    throw new Error("body metadata must not be read");
  },
} as unknown as Request;
const context = {
  params: {
    then() {
      throw new Error("params must not be read");
    },
  } as unknown as Promise<{ id: string }>,
};
vi.mocked(getCurrentModerationMember).mockRejectedValue(
  new AuthError("AUTHENTICATION_REQUIRED"),
);
await expect(POST(request, context)).resolves.toMatchObject({ status: 401 });
```

- [ ] **Step 5: Implement the thin route**

Order the handler exactly:

1. `getCurrentModerationMember()`;
2. await and validate `context.params.id`;
3. require JSON content type;
4. call `request.json()` and classify only that call's `SyntaxError` as 400;
5. parse `submitReportFlagSchema`;
6. call `submitReportFlag`;
7. return `{ flag }` with status 201 and no-store.

All exits use `invalidModerationResponse` or `moderationErrorResponse`; raw failures never enter the response.

- [ ] **Step 6: Run the member slice**

```powershell
npm.cmd test -- src/models/report-flag.test.ts src/lib/moderation/validation.test.ts src/lib/moderation/access.test.ts src/lib/moderation/errors.test.ts src/lib/moderation/flag-service.test.ts src/app/api/reports/[id]/flags/report-flag-route.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit member flagging**

```powershell
git add web/src/lib/moderation/flag-service.ts web/src/lib/moderation/flag-service.test.ts web/src/app/api/reports/[id]/flags/route.ts web/src/app/api/reports/[id]/flags/report-flag-route.test.ts
git commit -m "feat(moderation): add protected report flagging"
```

### Task 7: Add safe administrator report and flag queues

**Files:**
- Create: `web/src/lib/moderation/admin-service.ts`
- Create: `web/src/lib/moderation/admin-service.test.ts`
- Create: `web/src/app/api/admin/reports/route.ts`
- Create: `web/src/app/api/admin/reports/admin-report-list-route.test.ts`
- Create: `web/src/app/api/admin/report-flags/route.ts`
- Create: `web/src/app/api/admin/report-flags/admin-report-flag-routes.test.ts`

**Interfaces:**
- Consumes: `AdminReportListQuery`, `AdminFlagListQuery`, page parsers, `requireModerationAdministrator`, `ModerationError`, `ItemReportModel`, and `ReportFlagModel`.
- Produces:

```ts
export async function listAdminReports(
  administrator: PublicUser,
  query: AdminReportListQuery,
): Promise<AdminReportPage>;

export async function listAdminReportFlags(
  administrator: PublicUser,
  query: AdminFlagListQuery,
): Promise<AdminReportFlagPage>;
```

The later mutation task adds exports to the same `admin-service.ts`; do not split a generic repository or base service out of it.

- [ ] **Step 1: Write failing report-queue service tests**

Mock `connectToDatabase` and `ItemReportModel.aggregate`. Assert authorisation occurs before connection. The full-filter aggregate must begin with:

```ts
{
  $match: {
    status: { $in: ["open", "claim_pending", "resolved", "closed"] },
    reportType: "lost",
    moderationStatus: "hidden",
    $text: { $search: "laptop bag" },
  },
}
```

For `moderationStatus: "visible"` assert the match uses `{ $ne: "hidden" }` so legacy records remain visible. The `reports` facet must:

- sort text queries by relevance, then `createdAt: -1` and `_id: -1`;
- otherwise sort only by `createdAt: -1` and `_id: -1`;
- skip `(page - 1) * 20` and limit 20;
- project only the approved report-authored fields;
- normalize missing moderation state to `visible`;
- return metadata from `$count: "totalItems"`.

Make the aggregate fixture include privacy-disabled photo/date/location fields and prove the administrator summary still receives those report-authored values while identities and private verification data are absent.

- [ ] **Step 2: Write failing flag-queue service tests**

Assert the aggregate starts with optional exact `status`/`reason` filters and uses a bounded `$lookup` into `itemReports`:

```ts
{
  $lookup: {
    from: "itemReports",
    let: { reportId: "$reportId" },
    pipeline: [
      {
        $match: {
          $expr: { $eq: ["$_id", "$$reportId"] },
          status: { $in: ["open", "claim_pending", "resolved", "closed"] },
        },
      },
      {
        $project: {
          _id: 1,
          reportType: 1,
          title: 1,
          publicDescription: 1,
          categoryId: 1,
          campusLocationId: 1,
          occurredAt: 1,
          colors: 1,
          tags: 1,
          photoUrls: 1,
          status: 1,
          moderationStatus: { $ifNull: ["$moderationStatus", "visible"] },
          privacySettings: 1,
          resolvedAt: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ],
    as: "report",
  },
}
```

Then unwind one report, facet-sort by `createdAt: -1, _id: -1`, skip/limit 20, and project only flag details/review timestamps/resolution note plus the safe nested report. Cover empty and beyond-range pages, malformed aggregate output, unknown model failures, and strict omission of all three actor identities.

- [ ] **Step 3: Run administrator query tests and verify they fail**

```powershell
npm.cmd test -- src/lib/moderation/admin-service.test.ts
```

Expected: FAIL because `admin-service.ts` does not exist.

- [ ] **Step 4: Implement the two minimal aggregate services**

Use these shapes:

```ts
export async function listAdminReports(
  administrator: PublicUser,
  query: AdminReportListQuery,
) {
  requireModerationAdministrator(administrator);
  try {
    await connectToDatabase();
    const match: PipelineStage.Match["$match"] = {
      status: { $in: [...MEMBER_REPORT_STATUSES] },
      ...(query.q ? { $text: { $search: query.q } } : {}),
      ...(query.reportType ? { reportType: query.reportType } : {}),
      ...(query.reportStatus ? { status: query.reportStatus } : {}),
      ...(query.moderationStatus === "hidden"
        ? { moderationStatus: "hidden" }
        : query.moderationStatus === "visible"
          ? { moderationStatus: { $ne: "hidden" } }
          : {}),
    };
    return parseAdminReportPage(
      await ItemReportModel.aggregate(buildAdminReportPipeline(match, query))
        .exec(),
      query.page,
    );
  } catch (error) {
    if (error instanceof ModerationError) throw error;
    throw new ModerationError("REPORT_MODERATION_FAILED");
  }
}
```

Keep these builders private to this file:

```ts
function buildAdminReportPipeline(
  match: PipelineStage.Match["$match"],
  query: AdminReportListQuery,
): PipelineStage[];

function buildAdminReportFlagPipeline(
  query: AdminFlagListQuery,
): PipelineStage[];
```

They are simple local builders, not reusable repositories. Aggregations must explicitly project every approved field and no identity or private-verification field.

- [ ] **Step 5: Write failing administrator GET route tests**

For both collection routes prove:

- `getCurrentModerationAdministrator` runs before request URL access;
- students, staff, inactive administrators, and missing sessions never reach a service;
- defaults are exactly `{ page: 1 }`;
- complete query normalization reaches the correct service;
- repeated/unknown/invalid parameters return safe 400;
- success is 200 and `Cache-Control: no-store`;
- a closed domain failure maps exactly and an unknown failure becomes redacted 500;
- neither route exports `POST`, `PATCH`, or `DELETE`.

The flag route test file may import the collection route now and will add the member decision route in Task 8.

- [ ] **Step 6: Implement both thin GET routes**

The report route performs only:

```ts
export async function GET(request: Request) {
  let administrator: PublicUser;
  try {
    administrator = await getCurrentModerationAdministrator();
  } catch (error) {
    return noStore(moderationErrorResponse(error));
  }

  let parsed;
  try {
    parsed = adminReportListQuerySchema.safeParse(
      toModerationQueryInput(new URL(request.url).searchParams),
    );
  } catch (error) {
    return noStore(moderationErrorResponse(error));
  }
  if (!parsed.success) return noStore(invalidModerationResponse(parsed.error));

  try {
    return Response.json(await listAdminReports(administrator, parsed.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return noStore(moderationErrorResponse(error));
  }
}
```

The flag collection route uses the same explicit control flow with these real calls:

```ts
parsed = adminFlagListQuerySchema.safeParse(
  toModerationQueryInput(new URL(request.url).searchParams),
);

return Response.json(
  await listAdminReportFlags(administrator, parsed.data),
  { headers: { "Cache-Control": "no-store" } },
);
```

Do not create a generic route factory.

- [ ] **Step 7: Run the administrator read slice**

```powershell
npm.cmd test -- src/lib/moderation/contracts.test.ts src/lib/moderation/validation.test.ts src/lib/moderation/access.test.ts src/lib/moderation/admin-service.test.ts src/app/api/admin/reports/admin-report-list-route.test.ts src/app/api/admin/report-flags/admin-report-flag-routes.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the administrator queues**

```powershell
git add web/src/lib/moderation/admin-service.ts web/src/lib/moderation/admin-service.test.ts web/src/app/api/admin/reports/route.ts web/src/app/api/admin/reports/admin-report-list-route.test.ts web/src/app/api/admin/report-flags/route.ts web/src/app/api/admin/report-flags/admin-report-flag-routes.test.ts
git commit -m "feat(moderation): add administrator review queues"
```

### Task 8: Add transactional dismissal, hide, and restore decisions

**Files:**
- Modify: `web/src/lib/moderation/admin-service.ts`
- Modify: `web/src/lib/moderation/admin-service.test.ts`
- Create: `web/src/app/api/admin/report-flags/[flagId]/route.ts`
- Modify: `web/src/app/api/admin/report-flags/admin-report-flag-routes.test.ts`
- Create: `web/src/app/api/admin/reports/[reportId]/moderation/route.ts`
- Create: `web/src/app/api/admin/reports/[reportId]/moderation/admin-report-moderation-route.test.ts`

**Interfaces:**
- Consumes: mutation inputs and output mappers, `UserModel`, `ItemReportModel`, `ReportFlagModel`, `ReportModerationEventModel`, and MongoDB sessions.
- Produces:

```ts
export async function resolveReportFlag(
  administrator: PublicUser,
  flagId: string,
  input: ReportFlagDecisionInput,
): Promise<AdminReportFlagDecisionResult>;

export async function moderateReport(
  administrator: PublicUser,
  reportId: string,
  input: ReportModerationInput,
): Promise<AdminReportSummary>;
```

- [ ] **Step 1: Add failing transaction setup and actor tests**

Extend `admin-service.test.ts` with one reusable mocked session:

```ts
const transaction = {
  withTransaction: vi.fn(async (work: () => Promise<void>) => await work()),
  endSession: vi.fn(async () => undefined),
};
const startSession = vi.fn(async () => transaction);
```

For every decision assert:

- public role/status rejection occurs before connection;
- `connectToDatabase().startSession()` is called once;
- the callback first queries `UserModel.findOne` with actor ID, `role: "administrator"`, and `status: "active"` in the session;
- a missing actor becomes `ADMINISTRATOR_REQUIRED` with no report/flag/event write;
- `endSession` runs after success, domain failure, mapper failure, transaction failure, and commit success followed by end-session failure;
- no success result is returned until `withTransaction` and `endSession` have completed.

- [ ] **Step 2: Add failing dismiss tests**

Configure one pending flag and submitted report. Assert:

```ts
expect(ReportFlagModel.findOneAndUpdate).toHaveBeenCalledWith(
  {
    _id: flagObjectId,
    status: "pending",
    updatedAt: new Date(expectedFlagUpdatedAt),
  },
  {
    $set: {
      status: "dismissed",
      reviewedByAdministratorId: administratorObjectId,
      reviewedAt: expect.any(Date),
      resolutionNote: "No policy issue found",
    },
  },
  expect.objectContaining({
    new: true,
    runValidators: true,
    session: transaction,
  }),
);
expect(ReportModerationEventModel.create).toHaveBeenCalledWith(
  [
    {
      actorAdministratorId: administratorObjectId,
      reportId: reportObjectId,
      sourceFlagId: flagObjectId,
      action: "flag_dismissed",
      reason: "flag_dismissed",
      previousModerationStatus: null,
      newModerationStatus: null,
      note: "No policy issue found",
      occurredAt: expect.any(Date),
    },
  ],
  { session: transaction },
);
```

Prove report state is unchanged, other flags are untouched, stale time/resolved status is `REPORT_FLAG_STATE_CONFLICT`, absent flag is `REPORT_FLAG_NOT_FOUND`, and absent submitted report is `REPORT_NOT_FOUND`.

- [ ] **Step 3: Add failing flag-driven hide tests**

Assert the report conditional update accepts a legacy visible state but not hidden:

```ts
expect(ItemReportModel.findOneAndUpdate).toHaveBeenCalledWith(
  {
    _id: reportObjectId,
    status: { $in: ["open", "claim_pending", "resolved", "closed"] },
    updatedAt: new Date(expectedReportUpdatedAt),
    $or: [
      { moderationStatus: "visible" },
      { moderationStatus: { $exists: false } },
    ],
  },
  { $set: { moderationStatus: "hidden" } },
  expect.objectContaining({
    new: true,
    runValidators: true,
    session: transaction,
  }),
);
```

The selected flag must be conditionally changed to `actioned` using its exact timestamp. One `updateMany` then actions every other pending flag for the report with the same administrator, shared review time, and supplied note. One `report_hidden` event references the selected flag and copies its reason. Assert no recovery status/`resolvedAt` update occurs.

Cover stale flag, stale report, already-hidden report, failed selected update, failed report update, failed sibling update, and failed event insertion; every failure rolls back and returns the approved conflict or closed 500.

- [ ] **Step 4: Add failing direct hide and restore tests**

Direct hide must:

- load only a submitted report;
- compare exact `updatedAt`;
- conditionally change legacy/visible to hidden;
- action all pending flags with shared review metadata;
- insert one `report_hidden` event with `sourceFlagId: null` and the request reason.

Restore must:

- conditionally change only `hidden -> visible` with exact `updatedAt`;
- never update any flag;
- insert one `report_restored` event with `moderation_reversed` and `sourceFlagId: null`.

Repeating the current state, stale tokens, absent/draft reports, and conditional-write misses must map to `REPORT_MODERATION_CONFLICT` or `REPORT_NOT_FOUND` exactly as specified.

- [ ] **Step 5: Implement transaction helpers and both public functions**

Keep only small private helpers inside `admin-service.ts`:

```ts
async function requireActiveAdministratorInTransaction(
  administratorId: Types.ObjectId,
  session: ClientSession,
) {
  const actor = await UserModel.findOne({
    _id: administratorId,
    role: "administrator",
    status: "active",
  })
    .select({ _id: 1 })
    .session(session)
    .lean<{ _id: unknown } | null>()
    .exec();
  if (!actor) throw new ModerationError("ADMINISTRATOR_REQUIRED");
}

const visibleReportState = {
  $or: [
    { moderationStatus: "visible" },
    { moderationStatus: { $exists: false } },
  ],
};
```

Each public mutation:

1. calls `requireModerationAdministrator` before connecting;
2. starts one session;
3. executes all reads/writes/mapping inside `withTransaction`;
4. uses one `reviewedAt`/`occurredAt` Date per decision;
5. catches and preserves only `ModerationError`;
6. converts every unknown database/mapper/session failure to `REPORT_MODERATION_FAILED`;
7. ends the session before returning.

Do not return Mongoose documents, event records, identities, or internal write counts.

- [ ] **Step 6: Write failing flag-decision route tests**

Extend `admin-report-flag-routes.test.ts` to prove:

- the collection exports GET only; the member route exports PATCH only; neither exports DELETE;
- admin access runs before path/body reads;
- uppercase IDs canonicalize to lowercase;
- invalid ID/content type/JSON/union/unknown field/overlong note returns 400;
- dismiss passes only `decision`, exact flag timestamp, and normalized note;
- hide passes both exact timestamps;
- success is `{ flag, report }` with 200/no-store;
- every flag/report conflict and unknown failure maps safely.

- [ ] **Step 7: Write failing direct-moderation route tests**

Cover the same access/validation/error order plus:

- hide requires a direct reason;
- restore rejects a supplied reason;
- actor IDs, report recovery status, and arbitrary moderation states are unknown fields;
- both valid unions pass canonical IDs and normalized notes to `moderateReport`;
- success is `{ report }` with 200/no-store;
- no `DELETE` export exists.

- [ ] **Step 8: Implement both explicit PATCH routes**

Each PATCH route independently performs this complete explicit sequence:

1. current active administrator;
2. path promise and canonical ID;
3. JSON content type and body;
4. strict union;
5. explicit service;
6. exact success envelope with no-store;
7. closed error mapper.

Do not factor a generic PATCH handler out of the two route modules.

- [ ] **Step 9: Run the complete administrator moderation slice**

```powershell
npm.cmd test -- src/models/report-flag.test.ts src/models/report-moderation-event.test.ts src/lib/moderation/validation.test.ts src/lib/moderation/contracts.test.ts src/lib/moderation/access.test.ts src/lib/moderation/errors.test.ts src/lib/moderation/admin-service.test.ts src/app/api/admin/reports/admin-report-list-route.test.ts src/app/api/admin/report-flags/admin-report-flag-routes.test.ts src/app/api/admin/reports/[reportId]/moderation/admin-report-moderation-route.test.ts
```

Expected: PASS, including all transaction rollback/session-completion tests.

- [ ] **Step 10: Commit administrator decisions**

```powershell
git add web/src/lib/moderation/admin-service.ts web/src/lib/moderation/admin-service.test.ts web/src/app/api/admin/report-flags/[flagId]/route.ts web/src/app/api/admin/report-flags/admin-report-flag-routes.test.ts web/src/app/api/admin/reports/[reportId]/moderation/route.ts web/src/app/api/admin/reports/[reportId]/moderation/admin-report-moderation-route.test.ts
git commit -m "feat(moderation): add transactional decisions"
```

### Task 9: Apply moderation visibility to report contracts and browsing

**Files:**
- Modify: `web/src/lib/reports/public-report.ts`
- Modify: `web/src/lib/reports/public-report.test.ts`
- Modify: `web/src/lib/reports/browse-service.ts`
- Modify: `web/src/lib/reports/browse-service.test.ts`
- Modify: `web/src/lib/reports/browser-client.ts`
- Modify: `web/src/lib/reports/browser-client.test.ts`
- Modify: `web/src/app/api/reports/report-routes.test.ts`
- Modify: `web/src/app/api/reports/browse-routes.test.ts`
- Modify: `web/src/components/reports/report-browser.test.tsx`
- Modify: `web/src/components/reports/report-card.test.tsx`
- Modify: `web/src/components/reports/report-detail-client.test.tsx`
- Modify: `web/src/components/reports/report-matches-panel.test.tsx`
- Modify: `web/src/components/reports/report-submission-client.test.tsx`

**Interfaces:**
- Consumes: `normalizeReportModerationStatus` and the existing owner/member report boundaries.
- Produces: `moderationStatus: "visible" | "hidden"` as a required field on server `OwnerReport`/`MemberReport` and browser `CreatedReport`/`MemberReport`.

- [ ] **Step 1: Write failing safe-mapper tests**

Extend `public-report.test.ts`:

```ts
it("normalizes legacy reports and exposes only moderation state", () => {
  const owner = toOwnerReport({ ...report, moderationStatus: undefined } as never);
  const member = toMemberReport(
    { ...report, moderationStatus: "hidden" } as never,
    report.reporterId.toString(),
  );
  expect(owner.moderationStatus).toBe("visible");
  expect(member.moderationStatus).toBe("hidden");
  expect(JSON.stringify(member)).not.toMatch(
    /flag|reason|note|administrator|submittedByUserId/,
  );
});

it("fails closed for an unknown stored moderation value", () => {
  expect(() =>
    toMemberReport(
      { ...report, moderationStatus: "removed" } as never,
      "viewer-id",
    ),
  ).toThrow("Report moderation status is invalid");
});
```

Update existing exact owner/member objects with `moderationStatus: "visible"`.

- [ ] **Step 2: Add failing browse visibility tests**

Update `MEMBER_REPORT_PROJECTION` expectations to include `moderationStatus: 1`. Assert every list/count filter contains:

```ts
moderationStatus: { $ne: "hidden" }
```

Replace the detail expectation with:

```ts
expect(ItemReportModel.findOne).toHaveBeenCalledWith(
  {
    _id: reportId,
    status: { $in: ["open", "claim_pending", "resolved", "closed"] },
    $or: [
      { moderationStatus: { $ne: "hidden" } },
      { reporterId: user.id },
    ],
  },
  memberReportProjection,
);
```

Add two explicit cases: an owner can receive a hidden record returned by the model; a non-owner model miss becomes the indistinguishable `REPORT_NOT_FOUND`. Lists exclude hidden records even for the owner.

- [ ] **Step 3: Add failing strict browser-contract tests**

Add `moderationStatus` to `CreatedReport`, `MemberReport`, `createdReportSchema`, and `memberReportSchema` expectations. Prove both report-create and member-list/detail parsing reject:

- a missing moderation field;
- `moderationStatus: "removed"`;
- any additional flag/reason/note field.

Every valid test fixture receives `moderationStatus: "visible"`. A hidden owner detail is a valid `MemberReport` response.

- [ ] **Step 4: Run the report mapper, service, and browser tests**

```powershell
npm.cmd test -- src/lib/reports/public-report.test.ts src/lib/reports/browse-service.test.ts src/lib/reports/browser-client.test.ts
```

Expected: FAIL until the production contracts and query filters are changed.

- [ ] **Step 5: Implement canonical mapping and visibility predicates**

Add one field to both server mappers:

```ts
moderationStatus: normalizeReportModerationStatus(report.moderationStatus),
```

Add `moderationStatus: 1` to the browse projection. In `buildFilter` initialize:

```ts
const filter: QueryFilter<ItemReport> = {
  status: query.status ?? { $in: [...MEMBER_REPORT_STATUSES] },
  moderationStatus: { $ne: "hidden" },
};
```

Use the owner-or-visible detail predicate exactly as tested. Do not return an administrator note, flag reason, audit event, or flag count to any report boundary.

- [ ] **Step 6: Update strict browser types/schemas and typed fixtures**

Add the required enum field immediately after recovery `status` in both browser report types and strict Zod schemas. Update all files listed in this task with `moderationStatus: "visible"` in valid fixtures. This is a mechanical contract update only: do not render a badge, explanation, action, or moderation panel.

- [ ] **Step 7: Run the complete report frontend/backend slice**

```powershell
npm.cmd test -- src/models/item-report.test.ts src/lib/reports/public-report.test.ts src/lib/reports/service.test.ts src/lib/reports/browse-service.test.ts src/lib/reports/browser-client.test.ts src/app/api/reports/report-routes.test.ts src/app/api/reports/browse-routes.test.ts src/components/reports/report-browser.test.tsx src/components/reports/report-card.test.tsx src/components/reports/report-detail-client.test.tsx src/components/reports/report-matches-panel.test.tsx src/components/reports/report-submission-client.test.tsx
npm.cmd exec -- tsc --noEmit --incremental false
```

Expected: all listed tests PASS and TypeScript finds no missing report-field fixture.

- [ ] **Step 8: Commit report visibility integration**

```powershell
git add web/src/lib/reports/public-report.ts web/src/lib/reports/public-report.test.ts web/src/lib/reports/browse-service.ts web/src/lib/reports/browse-service.test.ts web/src/lib/reports/browser-client.ts web/src/lib/reports/browser-client.test.ts web/src/app/api/reports/report-routes.test.ts web/src/app/api/reports/browse-routes.test.ts web/src/components/reports/report-browser.test.tsx web/src/components/reports/report-card.test.tsx web/src/components/reports/report-detail-client.test.tsx web/src/components/reports/report-matches-panel.test.tsx web/src/components/reports/report-submission-client.test.tsx
git commit -m "feat(moderation): hide reports from member discovery"
```

### Task 10: Exclude hidden reports from matching and new Claims

**Files:**
- Modify: `web/src/lib/reports/matching-service.ts`
- Modify: `web/src/lib/reports/matching-service.test.ts`
- Modify: `web/src/app/api/reports/matching-routes.test.ts`
- Modify: `web/src/lib/claims/claimant-service.ts`
- Modify: `web/src/lib/claims/claimant-service.test.ts`

**Interfaces:**
- Consumes: the existing matching and claimant service APIs unchanged.
- Produces: no new public function; only eligibility filters change.

- [ ] **Step 1: Write failing matching visibility tests**

Add `moderationStatus: 1` to `MATCH_REPORT_PROJECTION` expectations and `moderationStatus: "visible"` to valid source/member fixtures. The source query must become:

```ts
{
  _id: reportId,
  reporterId: user.id,
  moderationStatus: { $ne: "hidden" },
}
```

The candidate query must include the same predicate beside opposite type and `status: "open"`. Test that a hidden/absent source returned as null maps to `REPORT_NOT_FOUND` and that only database-returned visible candidates are scored. Update the matching route fixture with the required output field.

- [ ] **Step 2: Write failing new-Claim visibility tests**

In `claimant-service.test.ts` update only these two expected filters:

```ts
// getClaimQuestions
{
  _id: reportId,
  reportType: "found",
  status: "open",
  reporterId: { $ne: student.id },
  moderationStatus: { $ne: "hidden" },
}

// createClaim transaction
{
  _id: reportId,
  reportType: "found",
  status: "open",
  reporterId: { $ne: student.id },
  moderationStatus: { $ne: "hidden" },
}
```

Add explicit null-query tests that hidden reports produce `REPORT_NOT_CLAIMABLE` before verification/Claim/evidence/notification writes.

Keep and strengthen assertions showing no moderation predicate is added to:

- `loadReport` used by Claim history/detail/withdrawal;
- `listOwnClaims` report-map loading;
- approved withdrawal's `claim_pending -> open` recovery update.

The staff Claim service is not modified.

- [ ] **Step 3: Run matching and Claim tests and verify they fail**

```powershell
npm.cmd test -- src/lib/reports/matching-service.test.ts src/app/api/reports/matching-routes.test.ts src/lib/claims/claimant-service.test.ts src/app/api/claims/claimant-routes.test.ts src/lib/claims/staff-service.test.ts src/app/api/staff/claims/staff-claim-routes.test.ts
```

Expected: matching and new-Claim filter assertions FAIL before implementation; existing Claim/staff regressions remain informative.

- [ ] **Step 4: Add only the three required query predicates**

In `matching-service.ts`:

```ts
const source = await ItemReportModel.findOne(
  {
    _id: reportId,
    reporterId: user.id,
    moderationStatus: { $ne: "hidden" },
  },
  MATCH_REPORT_PROJECTION,
).exec();

const candidates = await ItemReportModel.find(
  {
    _id: { $ne: source._id },
    reporterId: { $ne: source.reporterId },
    reportType: source.reportType === "lost" ? "found" : "lost",
    status: "open",
    moderationStatus: { $ne: "hidden" },
  },
  MATCH_REPORT_PROJECTION,
);
```

In `claimant-service.ts` add `moderationStatus: { $ne: "hidden" }` only to `getClaimQuestions` and `createClaim` report filters. Do not add it to `CLAIM_REPORT_PROJECTION` or any existing-authorised Claim load/update.

- [ ] **Step 5: Run the full cross-feature regression slice**

```powershell
npm.cmd test -- src/lib/reports/matching-service.test.ts src/app/api/reports/matching-routes.test.ts src/lib/claims/claimant-service.test.ts src/app/api/claims/claimant-routes.test.ts src/lib/claims/staff-service.test.ts src/app/api/staff/claims/staff-claim-routes.test.ts
```

Expected: PASS. Hidden reports cannot enter matching or new Claims, while existing claimant/staff workflows remain functional.

- [ ] **Step 6: Commit cross-feature moderation eligibility**

```powershell
git add web/src/lib/reports/matching-service.ts web/src/lib/reports/matching-service.test.ts web/src/app/api/reports/matching-routes.test.ts web/src/lib/claims/claimant-service.ts web/src/lib/claims/claimant-service.test.ts
git commit -m "feat(moderation): enforce hidden report boundaries"
```

### Task 11: Full regression, privacy verification, and evidence

**Files:**
- Create: `docs/superpowers/verification/2026-08-28-report-flagging-moderation-backend.md`

**Interfaces:**
- Consumes: the complete Issue #44 implementation and repository quality commands.
- Produces: auditable verification evidence containing no credential, private verification, reporter, flagger, or administrator data.

- [ ] **Step 1: Run the complete focused moderation slice**

Run from `web/`:

```powershell
npm.cmd test -- src/models/item-report.test.ts src/models/report-flag.test.ts src/models/report-moderation-event.test.ts src/lib/moderation/validation.test.ts src/lib/moderation/contracts.test.ts src/lib/moderation/access.test.ts src/lib/moderation/errors.test.ts src/lib/moderation/flag-service.test.ts src/lib/moderation/admin-service.test.ts src/app/api/reports/[id]/flags/report-flag-route.test.ts src/app/api/admin/reports/admin-report-list-route.test.ts src/app/api/admin/report-flags/admin-report-flag-routes.test.ts src/app/api/admin/reports/[reportId]/moderation/admin-report-moderation-route.test.ts src/lib/reports/public-report.test.ts src/lib/reports/browse-service.test.ts src/lib/reports/browser-client.test.ts src/lib/reports/matching-service.test.ts src/lib/claims/claimant-service.test.ts src/lib/claims/staff-service.test.ts
```

Expected: every persistence, contract, access, service, route, visibility, matching, and Claim test PASS.

- [ ] **Step 2: Run all repository quality gates**

Run from `web/` in this order:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd exec -- tsc --noEmit --incremental false
npm.cmd run build
npm.cmd audit
```

Expected:

- the complete Vitest suite passes;
- ESLint and standalone TypeScript exit 0;
- the production build succeeds and lists all five new route patterns;
- `npm audit` reports `found 0 vulnerabilities`.

- [ ] **Step 3: Run scope, privacy, credential, and destructive-operation scans**

Run from the repository root:

```powershell
git diff --check
git status --short --branch
git diff --name-only develop...HEAD
git diff -- web/package.json web/package-lock.json
rg -n "DELETE|deleteOne|deleteMany|findOneAndDelete|findByIdAndDelete" web/src/lib/moderation web/src/app/api/admin/reports web/src/app/api/admin/report-flags web/src/app/api/reports
rg -n "passwordHash|tokenHash|expectedAnswer|exactLocationDetails|serialNumber|privateNotes|submittedByUserId|reviewedByAdministratorId|actorAdministratorId|reporterId" web/src/lib/moderation web/src/app/api/admin/reports web/src/app/api/admin/report-flags web/src/app/api/reports/[id]/flags
git check-ignore web/.env.local
```

Expected:

- `git diff --check` has no output.
- Package manifest and lockfile have no diff.
- The branch contains only the approved spec, plan, models, moderation domain/routes/tests, minimal report/matching/Claim integration, fixture updates, and verification document.
- Destructive names appear only in explicit no-DELETE assertions or unrelated pre-existing report-route context; no moderation implementation deletes a record.
- Identity/private field names appear only in model storage, explicit internal projections needed for ownership/actor checks, and absence/redaction tests; no success schema or route serializes them.
- `git check-ignore` prints `web/.env.local` when it exists, and no command reads the file.

- [ ] **Step 4: Record exact verification evidence**

Create `docs/superpowers/verification/2026-08-28-report-flagging-moderation-backend.md` with the real command outcomes:

```md
# Report Flagging and Administrator Moderation Backend Verification

**Date:** 2026-08-28

**Branch:** `feature/issue-44-report-moderation-backend`

## Implemented scope

- Added visible/hidden moderation state independent from report recovery state.
- Added one-pending-per-member report flags and immutable moderation events.
- Added protected member flag submission and administrator report/flag queues.
- Added optimistic transactional dismiss, hide, and restore decisions.
- Removed hidden reports from browse, non-owner detail, matching, and new Claims.
- Preserved owner detail and existing authorised Claim workflows.

## Automated verification

- Focused moderation and cross-feature regression suite: passed.
- Full `npm test`: passed.
- `npm run lint`: passed.
- `npm exec -- tsc --noEmit --incremental false`: passed.
- `npm run build`: passed; all five moderation route patterns were generated.
- `npm audit`: passed with zero vulnerabilities.
- `git diff --check`: passed.

## Security and privacy verification

- Authentication/active role checks ran before request parsing.
- Every administrator write re-authorised the actor in its transaction.
- Every state change used exact timestamps and immutable audit evidence.
- Hidden reports retained recovery/Claim state and no moderation path deleted data.
- Success responses omitted reporter, flagger, administrator, session, credential, and private-verification data.
- Strict schemas rejected unknown authority fields and malformed stored output.
- Tests mocked database and transaction boundaries and did not access Atlas.
- `.env.local` remained ignored and unread.

## Deferred scope

The moderation frontend, member flag history, audit browsing/export, notifications,
appeals/chat, bulk action, owner-content editing, automatic account punishment,
AI classification, permanent deletion, migration, and backfill remain outside Issue #44.
```

Replace each `passed` statement only after its command has actually succeeded. Add exact test/build counts if the tools print them.

- [ ] **Step 5: Commit verification evidence**

```powershell
git add docs/superpowers/verification/2026-08-28-report-flagging-moderation-backend.md
git commit -m "docs: record report moderation verification"
git status --short --branch
```

Expected: the verification commit succeeds and the branch is clean with only the intended Issue #44 commits ahead of `develop`.
