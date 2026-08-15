# Report Browsing and Search Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add complete authenticated list, search, filter and detail APIs for member-visible lost and found reports while enforcing report privacy settings and excluding private ownership evidence.

**Architecture:** Thin Next.js Route Handlers authenticate first and delegate to strict query validation plus one focused browse service. The service reuses the existing MongoDB text and filter indexes, while the existing report response-mapping module gains an explicit member-visible mapper that removes reporter IDs and applies photo, date and location privacy.

**Tech Stack:** Next.js 16 App Router Route Handlers, TypeScript, Mongoose 9, MongoDB text search, Zod 4, Vitest 4.

## Global Constraints

- Work only on `feature/issue-18-report-browsing-backend`; never push or merge from implementation tasks.
- Require a valid active-account session for every new endpoint; active student, staff and administrator roles share the same member-visible contract.
- Exclude `draft` reports from list, search and detail reads.
- Query only `ItemReport`; never import or query `PrivateVerificationDetails` in browsing code.
- Apply privacy to both returned fields and filters so hidden location, date and photo metadata cannot be inferred.
- Never return `reporterId`, raw `privacySettings`, credentials, session data or private verification evidence.
- Reuse the current indexes, connection helper, authentication resolver, error envelope, libraries and test stack.
- Add no dependency, Atlas Search configuration, database migration, seed write, live Atlas read or live report submission.
- Do not read `.env.local`; final verification may only confirm that Git reports it as ignored.
- Preserve the existing `POST /api/reports` contract and its tests.
- Use TDD for every implementation task and commit only the exact files named by that task.
- Run `npm`, `npx` and `rg src/...` commands from `web`; run Git scope/status commands from the repository root.

## File Map

- Create `web/src/lib/reports/browse-validation.ts`: strict URL query and report-ID schemas plus duplicate-parameter preservation.
- Create `web/src/lib/reports/browse-validation.test.ts`: query defaults, bounds, strictness, duplicate and date-order coverage.
- Modify `web/src/lib/reports/public-report.ts`: add the explicit member-visible mapper and type.
- Modify `web/src/lib/reports/public-report.test.ts`: privacy, ownership and secret-exclusion tests.
- Modify `web/src/lib/reports/errors.ts`: add browse validation, not-found and generic browse responses without changing creation errors.
- Modify `web/src/lib/reports/errors.test.ts`: exact browse error and regression tests.
- Create `web/src/lib/reports/browse-service.ts`: bounded list/count/detail queries, privacy-coupled filters, sorting and pagination.
- Create `web/src/lib/reports/browse-service.test.ts`: mocked MongoDB query and safe-response behavior.
- Modify `web/src/app/api/reports/route.ts`: add authenticated `GET` while preserving `POST`.
- Create `web/src/app/api/reports/[id]/route.ts`: authenticated member-visible detail endpoint.
- Create `web/src/app/api/reports/browse-routes.test.ts`: consolidated GET Route Handler contract tests.

---

### Task 1: Strict browse query validation

**Files:**
- Create: `web/src/lib/reports/browse-validation.ts`
- Create: `web/src/lib/reports/browse-validation.test.ts`

**Interfaces:**
- Consumes: browser-standard `URLSearchParams`, Zod 4 and 24-character MongoDB ObjectId strings.
- Produces: `MEMBER_REPORT_STATUSES`, `ReportBrowseQuery`, `reportBrowseQuerySchema`, `reportIdSchema` and `toReportBrowseQueryInput(searchParams)`.

- [ ] **Step 1: Write the failing validation tests**

Create `web/src/lib/reports/browse-validation.test.ts` with a valid full query and table-driven invalid inputs. The tests must directly assert transformed `Date`, boolean and number values rather than only checking `success`:

```ts
import { describe, expect, it } from "vitest";

import {
  reportBrowseQuerySchema,
  reportIdSchema,
  toReportBrowseQueryInput,
} from "./browse-validation";

function parse(query = "") {
  return reportBrowseQuerySchema.safeParse(
    toReportBrowseQueryInput(new URLSearchParams(query)),
  );
}

describe("report browse validation", () => {
  it("applies empty-query pagination defaults", () => {
    expect(parse("")).toEqual({
      success: true,
      data: { page: 1, pageSize: 12 },
    });
  });

  it("normalises every supported query parameter", () => {
    const parsed = parse(
      "q=%20laptop%20bag%20&reportType=lost&categoryId=64b64c6f2f4d9f1a2b3c4d52" +
        "&campusLocationId=64b64c6f2f4d9f1a2b3c4d53&status=open&color=%20Black%20" +
        "&occurredFrom=2026-08-01T00%3A00%3A00%2B12%3A00" +
        "&occurredTo=2026-08-15T23%3A59%3A59%2B12%3A00&hasPhoto=true&page=2&pageSize=25",
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("Expected valid browse query");
    expect(parsed.data).toEqual({
      q: "laptop bag",
      reportType: "lost",
      categoryId: "64b64c6f2f4d9f1a2b3c4d52",
      campusLocationId: "64b64c6f2f4d9f1a2b3c4d53",
      status: "open",
      color: "Black",
      occurredFrom: new Date("2026-07-31T12:00:00.000Z"),
      occurredTo: new Date("2026-08-15T11:59:59.000Z"),
      hasPhoto: true,
      page: 2,
      pageSize: 25,
    });
  });

  it.each([
    ["unknown parameter", "sort=title"],
    ["duplicate parameter", "status=open&status=closed"],
    ["short keyword", "q=x"],
    ["long keyword", `q=${"x".repeat(101)}`],
    ["draft status", "status=draft"],
    ["invalid report type", "reportType=missing"],
    ["invalid category", "categoryId=not-an-id"],
    ["invalid location", "campusLocationId=not-an-id"],
    ["blank colour", "color=%20%20"],
    ["long colour", `color=${"x".repeat(33)}`],
    ["date without offset", "occurredFrom=2026-08-15T00:00:00"],
    ["invalid photo flag", "hasPhoto=yes"],
    ["zero page", "page=0"],
    ["fractional page", "page=1.5"],
    ["zero page size", "pageSize=0"],
    ["large page size", "pageSize=51"],
    [
      "reversed date range",
      "occurredFrom=2026-08-16T00%3A00%3A00Z&occurredTo=2026-08-15T00%3A00%3A00Z",
    ],
  ])("rejects %s", (_case, query) => {
    expect(parse(query).success).toBe(false);
  });

  it("validates report path IDs", () => {
    expect(reportIdSchema.safeParse("64b64c6f2f4d9f1a2b3c4d54").success).toBe(
      true,
    );
    expect(reportIdSchema.safeParse("not-an-id").success).toBe(false);
  });
});
```

Add boundary cases for accepted 2/100-character keywords, 1/32-character colours, `page=1`, `pageSize=1`, `pageSize=50`, every allowed report/status enum and equal date limits. Add separate assertions that two occurrences of every supported parameter become a validation failure.

- [ ] **Step 2: Run the focused test and confirm the red state**

Run from `web`:

```powershell
npm.cmd test -- src/lib/reports/browse-validation.test.ts
```

Expected: FAIL because `./browse-validation` does not exist.

- [ ] **Step 3: Implement the strict schemas and duplicate-preserving conversion**

Create `web/src/lib/reports/browse-validation.ts`:

```ts
import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Must be a valid ObjectId");

const dateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

const positiveInteger = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(Number.MAX_SAFE_INTEGER));

export const MEMBER_REPORT_STATUSES = [
  "open",
  "claim_pending",
  "resolved",
  "closed",
] as const;

export const reportBrowseQuerySchema = z
  .strictObject({
    q: z.string().trim().min(2).max(100).optional(),
    reportType: z.enum(["lost", "found"]).optional(),
    categoryId: objectIdSchema.optional(),
    campusLocationId: objectIdSchema.optional(),
    status: z.enum(MEMBER_REPORT_STATUSES).optional(),
    color: z.string().trim().min(1).max(32).optional(),
    occurredFrom: dateTimeSchema.optional(),
    occurredTo: dateTimeSchema.optional(),
    hasPhoto: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    page: positiveInteger.default(1),
    pageSize: positiveInteger.pipe(z.number().max(50)).default(12),
  })
  .superRefine((value, context) => {
    if (
      value.occurredFrom &&
      value.occurredTo &&
      value.occurredFrom > value.occurredTo
    ) {
      context.addIssue({
        code: "custom",
        path: ["occurredTo"],
        message: "End date must not be earlier than start date",
      });
    }
  });

export type ReportBrowseQuery = z.output<typeof reportBrowseQuerySchema>;

export const reportIdSchema = objectIdSchema;

export function toReportBrowseQueryInput(searchParams: URLSearchParams) {
  const input: Record<string, string | string[]> = {};

  for (const [key, value] of searchParams) {
    const current = input[key];
    input[key] =
      current === undefined
        ? value
        : Array.isArray(current)
          ? [...current, value]
          : [current, value];
  }

  return input;
}
```

- [ ] **Step 4: Run focused verification**

```powershell
npm.cmd test -- src/lib/reports/browse-validation.test.ts
npx.cmd eslint src/lib/reports/browse-validation.ts src/lib/reports/browse-validation.test.ts
npx.cmd tsc --noEmit --incremental false
```

Expected: all validation tests pass; ESLint and TypeScript exit 0.

- [ ] **Step 5: Check and commit only Task 1**

```powershell
git diff --check
git status --short
git add web/src/lib/reports/browse-validation.ts web/src/lib/reports/browse-validation.test.ts
git diff --cached --check
git commit -m "feat(reports): validate browse queries" -m "Refs #18"
```

Expected: the commit contains exactly the two Task 1 files.

---

### Task 2: Member-visible report mapping

**Files:**
- Modify: `web/src/lib/reports/public-report.ts`
- Modify: `web/src/lib/reports/public-report.test.ts`

**Interfaces:**
- Consumes: the existing ItemReport document shape plus an authenticated viewer ID string.
- Produces: `toMemberReport(report, viewerId)` and exported `MemberReport`, while leaving `toOwnerReport` and `OwnerReport` unchanged.

- [ ] **Step 1: Add failing member-mapper tests**

Extend `public-report.test.ts` to import `toMemberReport`. Reuse a report fixture with real Mongoose ObjectIds and dates, then assert:

```ts
it("applies member privacy and exposes only ownership, not reporter ID", () => {
  const result = toMemberReport(
    {
      ...report,
      privacySettings: {
        showPhoto: false,
        showEventDate: false,
        showCampusLocation: false,
      },
    } as never,
    "64b64c6f2f4d9f1a2b3c4d51",
  );

  expect(result).toEqual({
    id: "64b64c6f2f4d9f1a2b3c4d50",
    reportType: "lost",
    title: "Black laptop bag",
    publicDescription: "Black laptop bag with a shoulder strap.",
    categoryId: "64b64c6f2f4d9f1a2b3c4d52",
    campusLocationId: null,
    occurredAt: null,
    colors: ["Black"],
    tags: ["laptop", "bag"],
    photoUrls: [],
    status: "open",
    resolvedAt: null,
    createdAt: "2026-08-15T02:05:00.000Z",
    updatedAt: "2026-08-15T02:05:00.000Z",
    isOwner: true,
  });
  expect(result).not.toHaveProperty("reporterId");
  expect(result).not.toHaveProperty("privacySettings");
});
```

Add cases for each privacy flag independently, all-visible fields, a non-owner, a resolved date, cloned output arrays and a source object containing private/authentication-shaped extra properties. Assert the serial number, exact location, expected answer, private notes, password hash and token hash cannot appear in the serialised result.

- [ ] **Step 2: Run the focused test and confirm the red state**

```powershell
npm.cmd test -- src/lib/reports/public-report.test.ts
```

Expected: FAIL because `toMemberReport` is not exported.

- [ ] **Step 3: Implement an explicit member mapper**

Append an explicit mapper to `public-report.ts`; do not spread the source document or `toOwnerReport` result:

```ts
export function toMemberReport(report: ReportDocument, viewerId: string) {
  return {
    id: report._id.toString(),
    reportType: report.reportType,
    title: report.title,
    publicDescription: report.publicDescription,
    categoryId: report.categoryId.toString(),
    campusLocationId: report.privacySettings.showCampusLocation
      ? report.campusLocationId.toString()
      : null,
    occurredAt: report.privacySettings.showEventDate
      ? report.occurredAt.toISOString()
      : null,
    colors: [...report.colors],
    tags: [...report.tags],
    photoUrls: report.privacySettings.showPhoto ? [...report.photoUrls] : [],
    status: report.status,
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
    isOwner: report.reporterId.toString() === viewerId,
  };
}

export type MemberReport = ReturnType<typeof toMemberReport>;
```

- [ ] **Step 4: Run focused verification**

```powershell
npm.cmd test -- src/lib/reports/public-report.test.ts
npx.cmd eslint src/lib/reports/public-report.ts src/lib/reports/public-report.test.ts
npx.cmd tsc --noEmit --incremental false
```

Expected: all mapper tests pass without changing owner-response behavior.

- [ ] **Step 5: Check and commit only Task 2**

```powershell
git diff --check
git add web/src/lib/reports/public-report.ts web/src/lib/reports/public-report.test.ts
git diff --cached --check
git commit -m "feat(reports): map member-visible reports" -m "Refs #18"
```

---

### Task 3: Browse-specific safe errors

**Files:**
- Modify: `web/src/lib/reports/errors.ts`
- Modify: `web/src/lib/reports/errors.test.ts`

**Interfaces:**
- Consumes: existing `AuthError`, `ReportError`, Zod errors and safe response-envelope conventions.
- Produces: new `REPORT_NOT_FOUND`, `REPORT_BROWSE_FAILED`, `invalidReportQueryResponse(error?)` and `reportBrowseErrorResponse(error)` without changing existing submission/reference functions.

- [ ] **Step 1: Add failing exact-response tests**

Extend `errors.test.ts` with:

```ts
it("returns exact browse validation fields", async () => {
  const parsed = z.strictObject({ page: z.string().regex(/^[1-9]\d*$/) }).safeParse({
    page: "0",
  });
  if (parsed.success) throw new Error("Expected validation to fail");

  const response = invalidReportQueryResponse(parsed.error);
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    error: {
      code: "VALIDATION_ERROR",
      message: "Invalid report query",
      fields: { page: expect.any(Array) },
    },
  });
});

it("maps browse authentication, not found and unknown failures safely", async () => {
  const authentication = reportBrowseErrorResponse(
    new AuthError("AUTHENTICATION_REQUIRED"),
  );
  const missing = reportBrowseErrorResponse(new ReportError("REPORT_NOT_FOUND"));
  const unknown = reportBrowseErrorResponse(new Error("mongodb secret detail"));

  expect(authentication.status).toBe(401);
  expect(missing.status).toBe(404);
  await expect(missing.json()).resolves.toEqual({
    error: { code: "REPORT_NOT_FOUND", message: "Report not found" },
  });
  expect(unknown.status).toBe(500);
  const body = await unknown.json();
  expect(body).toEqual({
    error: { code: "REPORT_BROWSE_FAILED", message: "Unable to load reports" },
  });
  expect(JSON.stringify(body)).not.toContain("mongodb secret detail");
});
```

Also retain explicit assertions for every pre-existing creation and reference-data response so Task 3 cannot accidentally rename or remap them.

- [ ] **Step 2: Run the focused test and confirm the red state**

```powershell
npm.cmd test -- src/lib/reports/errors.test.ts
```

Expected: FAIL because the browse error exports and codes do not exist.

- [ ] **Step 3: Extend the error definitions without altering old mappings**

Add these entries to `reportErrorDefinitions`:

```ts
REPORT_NOT_FOUND: {
  message: "Report not found",
  status: 404,
},
REPORT_BROWSE_FAILED: {
  message: "Unable to load reports",
  status: 500,
},
```

Add focused helpers:

```ts
export function invalidReportQueryResponse(error?: ZodError) {
  const fields = error ? z.flattenError(error).fieldErrors : undefined;
  const includeFields = fields && Object.keys(fields).length > 0;

  return Response.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid report query",
        ...(includeFields ? { fields } : {}),
      },
    },
    { status: 400 },
  );
}

export function reportBrowseErrorResponse(error: unknown) {
  if (error instanceof AuthError) return authErrorResponse(error);

  return safeReportErrorResponse(
    error instanceof ReportError && error.code === "REPORT_NOT_FOUND"
      ? error
      : new ReportError("REPORT_BROWSE_FAILED"),
  );
}
```

This intentionally prevents unrelated report-domain errors from leaking through a browse route.

- [ ] **Step 4: Run focused verification**

```powershell
npm.cmd test -- src/lib/reports/errors.test.ts
npx.cmd eslint src/lib/reports/errors.ts src/lib/reports/errors.test.ts
npx.cmd tsc --noEmit --incremental false
```

Expected: all existing and new error-contract tests pass.

- [ ] **Step 5: Check and commit only Task 3**

```powershell
git diff --check
git add web/src/lib/reports/errors.ts web/src/lib/reports/errors.test.ts
git diff --cached --check
git commit -m "feat(reports): define browse error contracts" -m "Refs #18"
```

---

### Task 4: Indexed member-visible browse service

**Files:**
- Create: `web/src/lib/reports/browse-service.ts`
- Create: `web/src/lib/reports/browse-service.test.ts`

**Interfaces:**
- Consumes: `PublicUser`, `ReportBrowseQuery`, `MEMBER_REPORT_STATUSES`, `ItemReportModel`, `connectToDatabase`, `toMemberReport` and `ReportError`.
- Produces: `ReportPage`, `listReports(user, query)` and `getReport(user, reportId)`.

- [ ] **Step 1: Write failing service tests with fully mocked queries**

Create `browse-service.test.ts`. Mock only the DB/model/mapper boundaries:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/item-report", () => ({ ItemReportModel: {
  find: vi.fn(),
  countDocuments: vi.fn(),
  findOne: vi.fn(),
} }));
vi.mock("./public-report", () => ({ toMemberReport: vi.fn() }));

import { connectToDatabase } from "@/lib/db";
import { ItemReportModel } from "@/models/item-report";
import { toMemberReport } from "./public-report";
import { getReport, listReports } from "./browse-service";
```

Use chain mocks whose `sort`, `skip` and `limit` return the same chain and whose `exec` resolves documents. Assert the default call has:

```ts
expect(ItemReportModel.find).toHaveBeenCalledWith(
  { status: { $in: ["open", "claim_pending", "resolved", "closed"] } },
  expect.objectContaining({
    reporterId: 1,
    privacySettings: 1,
    title: 1,
    publicDescription: 1,
  }),
);
expect(findChain.sort).toHaveBeenCalledWith({ occurredAt: -1, _id: -1 });
expect(findChain.skip).toHaveBeenCalledWith(0);
expect(findChain.limit).toHaveBeenCalledWith(12);
expect(ItemReportModel.countDocuments).toHaveBeenCalledWith(
  expect.objectContaining({ status: expect.any(Object) }),
);
```

Add focused cases that assert:

- `q` adds `$text: { $search: query }`, projects a text score and sorts by score, occurrence time and ID.
- report type, category and status become exact filters.
- colour `Black.*` becomes an escaped anchored `/^Black\.\*$/i` expression.
- campus location also adds `privacySettings.showCampusLocation: true`.
- either date boundary adds `privacySettings.showEventDate: true` and the correct `$gte`/`$lte` object.
- `hasPhoto=true` adds `privacySettings.showPhoto: true` and `photoUrls.0: { $exists: true }`.
- `hasPhoto=false` adds an `$or` for hidden photos or no stored photo.
- page 3/pageSize 25 uses skip 50 and returns correct `totalPages`.
- every document is mapped with the current user ID.
- empty and beyond-range pages return an empty array and real totals.
- detail uses `_id` plus the allowed-status list, maps success, and throws `REPORT_NOT_FOUND` for `null`.
- DB/query failures are preserved for the route error boundary.

- [ ] **Step 2: Run the focused test and confirm the red state**

```powershell
npm.cmd test -- src/lib/reports/browse-service.test.ts
```

Expected: FAIL because `./browse-service` does not exist.

- [ ] **Step 3: Implement the minimal indexed service**

Create `browse-service.ts` with explicit projection, local regex escaping and no private-model import:

```ts
import type { FilterQuery } from "mongoose";

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { ItemReportModel, type ItemReport } from "@/models/item-report";

import {
  MEMBER_REPORT_STATUSES,
  type ReportBrowseQuery,
} from "./browse-validation";
import { ReportError } from "./errors";
import {
  type MemberReport,
  toMemberReport,
} from "./public-report";

const MEMBER_REPORT_PROJECTION = {
  _id: 1,
  reporterId: 1,
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
  privacySettings: 1,
  resolvedAt: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

export type ReportPage = {
  reports: MemberReport[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildFilter(query: ReportBrowseQuery): FilterQuery<ItemReport> {
  const filter: FilterQuery<ItemReport> = {
    status: query.status ?? { $in: [...MEMBER_REPORT_STATUSES] },
  };

  if (query.q) filter.$text = { $search: query.q };
  if (query.reportType) filter.reportType = query.reportType;
  if (query.categoryId) filter.categoryId = query.categoryId;
  if (query.color) {
    filter.colors = {
      $regex: new RegExp(`^${escapeRegularExpression(query.color)}$`, "i"),
    };
  }
  if (query.campusLocationId) {
    filter.campusLocationId = query.campusLocationId;
    filter["privacySettings.showCampusLocation"] = true;
  }
  if (query.occurredFrom || query.occurredTo) {
    filter.occurredAt = {
      ...(query.occurredFrom ? { $gte: query.occurredFrom } : {}),
      ...(query.occurredTo ? { $lte: query.occurredTo } : {}),
    };
    filter["privacySettings.showEventDate"] = true;
  }
  if (query.hasPhoto === true) {
    filter["privacySettings.showPhoto"] = true;
    filter["photoUrls.0"] = { $exists: true };
  }
  if (query.hasPhoto === false) {
    filter.$or = [
      { "privacySettings.showPhoto": false },
      { "photoUrls.0": { $exists: false } },
    ];
  }

  return filter;
}

export async function listReports(
  user: PublicUser,
  query: ReportBrowseQuery,
): Promise<ReportPage> {
  await connectToDatabase();
  const filter = buildFilter(query);
  const projection = query.q
    ? { ...MEMBER_REPORT_PROJECTION, score: { $meta: "textScore" } }
    : MEMBER_REPORT_PROJECTION;
  const sort: Record<string, -1 | { $meta: "textScore" }> = query.q
    ? { score: { $meta: "textScore" }, occurredAt: -1, _id: -1 }
    : { occurredAt: -1, _id: -1 };

  const reportsQuery = ItemReportModel.find(filter, projection)
    .sort(sort)
    .skip((query.page - 1) * query.pageSize)
    .limit(query.pageSize);

  const [documents, total] = await Promise.all([
    reportsQuery.exec(),
    ItemReportModel.countDocuments(filter).exec(),
  ]);

  return {
    reports: documents.map((report) => toMemberReport(report, user.id)),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function getReport(user: PublicUser, reportId: string) {
  await connectToDatabase();
  const report = await ItemReportModel.findOne(
    { _id: reportId, status: { $in: [...MEMBER_REPORT_STATUSES] } },
    MEMBER_REPORT_PROJECTION,
  ).exec();

  if (!report) throw new ReportError("REPORT_NOT_FOUND");
  return toMemberReport(report, user.id);
}
```

- [ ] **Step 4: Run focused and integration-safe verification**

```powershell
npm.cmd test -- src/lib/reports/browse-service.test.ts src/lib/reports/public-report.test.ts
npx.cmd eslint src/lib/reports/browse-service.ts src/lib/reports/browse-service.test.ts
npx.cmd tsc --noEmit --incremental false
```

Expected: service and mapper tests pass; TypeScript proves the model/mapper boundary.

- [ ] **Step 5: Audit Task 4 for private-model and query scope**

```powershell
rg -n "PrivateVerification|serialNumber|expectedAnswer|exactLocationDetails|privateNotes" src/lib/reports/browse-service.ts src/lib/reports/browse-service.test.ts
git diff --check
```

Expected: no production browse-service match; test-only secret names are allowed only in explicit non-disclosure assertions.

- [ ] **Step 6: Commit only Task 4**

```powershell
git add web/src/lib/reports/browse-service.ts web/src/lib/reports/browse-service.test.ts
git diff --cached --check
git commit -m "feat(reports): query member-visible reports" -m "Refs #18"
```

---

### Task 5: Authenticated list and detail Route Handlers

**Files:**
- Modify: `web/src/app/api/reports/route.ts`
- Create: `web/src/app/api/reports/[id]/route.ts`
- Create: `web/src/app/api/reports/browse-routes.test.ts`
- Test unchanged regression: `web/src/app/api/reports/report-routes.test.ts`

**Interfaces:**
- Consumes: session cookie/current-user resolution, `reportBrowseQuerySchema`, `reportIdSchema`, `listReports`, `getReport`, `invalidReportQueryResponse` and `reportBrowseErrorResponse`.
- Produces: `GET /api/reports` returning `ReportPage` and `GET /api/reports/[id]` returning `{ report: MemberReport }`; existing `POST /api/reports` remains unchanged.

- [ ] **Step 1: Write consolidated failing route tests**

Create `browse-routes.test.ts` and mock the same boundaries as the existing report-route tests:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/reports/browse-service", () => ({
  listReports: vi.fn(),
  getReport: vi.fn(),
}));

import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getReport, listReports } from "@/lib/reports/browse-service";
import { ReportError } from "@/lib/reports/errors";

import { GET as reportDetailGet } from "./[id]/route";
import { GET as reportListGet } from "./route";
```

Use the existing full `PublicUser` fixture and a member-visible report fixture. Cover at least these exact behaviors:

- list success returns `{ reports, pagination }` with 200 and passes transformed/defaulted query data to `listReports`;
- detail success returns `{ report }` with 200 and passes the authenticated user and path ID;
- active student, staff and administrator may use both routes;
- absent session returns exact 401 before `listReports`, `getReport` or query parsing can run;
- malformed, unknown and duplicate list parameters return exact 400 `Invalid report query` and do not call the service;
- malformed detail ID returns the same exact 400 and does not call `getReport`;
- `REPORT_NOT_FOUND` returns exact 404;
- cookie/current-user/service/params failures return exact hidden 500 `REPORT_BROWSE_FAILED` without internal details;
- responses contain no reporter ID, raw privacy settings, verification evidence, password or session fields.

Use a Next 16-compatible detail context:

```ts
const detailContext = (id: string) => ({ params: Promise.resolve({ id }) });
```

- [ ] **Step 2: Run route tests and confirm the red state**

```powershell
npm.cmd test -- src/app/api/reports/browse-routes.test.ts
```

Expected: FAIL because the detail route does not exist and the list route has no `GET` export.

- [ ] **Step 3: Add `GET` without changing the existing `POST`**

In `web/src/app/api/reports/route.ts`, retain the current `POST` body exactly and add the browse imports plus:

```ts
export async function GET(request: Request) {
  let user: PublicUser;

  try {
    const currentUser = await getCurrentUser(await readSessionCookie());
    if (!currentUser) throw new AuthError("AUTHENTICATION_REQUIRED");
    user = currentUser;
  } catch (error) {
    return reportBrowseErrorResponse(error);
  }

  const parsed = reportBrowseQuerySchema.safeParse(
    toReportBrowseQueryInput(new URL(request.url).searchParams),
  );
  if (!parsed.success) return invalidReportQueryResponse(parsed.error);

  try {
    return Response.json(await listReports(user, parsed.data));
  } catch (error) {
    return reportBrowseErrorResponse(error);
  }
}
```

Keep authentication in its own error boundary so authentication failures cannot be misclassified as query validation errors.

- [ ] **Step 4: Implement the detail Route Handler**

Create `web/src/app/api/reports/[id]/route.ts`:

```ts
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { reportIdSchema } from "@/lib/reports/browse-validation";
import { getReport } from "@/lib/reports/browse-service";
import {
  invalidReportQueryResponse,
  reportBrowseErrorResponse,
} from "@/lib/reports/errors";

type ReportDetailContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: ReportDetailContext) {
  let user: PublicUser;

  try {
    const currentUser = await getCurrentUser(await readSessionCookie());
    if (!currentUser) throw new AuthError("AUTHENTICATION_REQUIRED");
    user = currentUser;
  } catch (error) {
    return reportBrowseErrorResponse(error);
  }

  let id: string;
  try {
    id = (await context.params).id;
  } catch (error) {
    return reportBrowseErrorResponse(error);
  }

  const parsed = reportIdSchema.safeParse(id);
  if (!parsed.success) return invalidReportQueryResponse();

  try {
    return Response.json({ report: await getReport(user, parsed.data) });
  } catch (error) {
    return reportBrowseErrorResponse(error);
  }
}
```

- [ ] **Step 5: Run route and POST-regression tests**

```powershell
npm.cmd test -- src/app/api/reports/browse-routes.test.ts src/app/api/reports/report-routes.test.ts
npx.cmd eslint src/app/api/reports/route.ts src/app/api/reports/[id]/route.ts src/app/api/reports/browse-routes.test.ts
npx.cmd tsc --noEmit --incremental false
```

Expected: all browse tests and every pre-existing report-submission route test pass.

- [ ] **Step 6: Run the focused report backend suite**

```powershell
npm.cmd test -- src/lib/reports src/app/api/reports
```

Expected: every report validation, mapper, error, reference, creation, browsing and route test passes without a database connection.

- [ ] **Step 7: Check and commit only Task 5**

```powershell
git diff --check
git status --short
git add web/src/app/api/reports/route.ts web/src/app/api/reports/[id]/route.ts web/src/app/api/reports/browse-routes.test.ts
git diff --cached --check
git commit -m "feat(reports): add browsing API routes" -m "Refs #18"
```

Expected: exactly the three Task 5 files are committed; the existing POST diff is limited to imports plus the new `GET` export.

---

### Task 6: Full quality, security and scope verification

**Files:**
- Verify only; no planned source change.

**Interfaces:**
- Consumes: all Issue #18 commits and the existing application test/build configuration.
- Produces: final evidence that the complete branch is safe, buildable, dependency-clean and limited to the approved backend scope.

- [ ] **Step 1: Run all automated tests**

```powershell
npm.cmd test
```

Expected: every test file passes. Tests use mocks and do not connect to Atlas.

- [ ] **Step 2: Run static and production checks**

```powershell
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run build
```

Expected: ESLint, standalone TypeScript and Next.js production build all exit 0. The route table includes dynamic `/api/reports` and `/api/reports/[id]` routes.

- [ ] **Step 3: Run the dependency audit**

```powershell
npm.cmd audit
```

Expected: `found 0 vulnerabilities`. Do not run `npm audit fix --force`; if a vulnerability appears, stop and identify the exact dependency path before changing manifests.

- [ ] **Step 4: Confirm the secret file remains ignored without reading it**

Run from the repository root:

```powershell
git status --short --ignored web/.env.local
```

Expected exactly: `!! web/.env.local`. Do not open or print the file.

- [ ] **Step 5: Verify branch cleanliness and approved scope**

```powershell
git diff --check
git diff --check develop...HEAD
git status --short --branch
git diff --stat develop...HEAD
git diff --name-status develop...HEAD
git log --oneline develop..HEAD
```

Expected:

- worktree clean on `feature/issue-18-report-browsing-backend`;
- only the design, plan and listed report browse validation/mapper/error/service/route files changed;
- no package manifests, environment files, private model, authentication implementation, UI component or unrelated route changed;
- every branch commit references Issue #18.

- [ ] **Step 6: Run explicit disclosure scans**

```powershell
rg -n "PrivateVerificationDetailsModel|expectedAnswer|serialNumber|exactLocationDetails|privateNotes|passwordHash|tokenHash" web/src/lib/reports/browse-service.ts web/src/app/api/reports
rg -n "reporterId|privacySettings" web/src/app/api/reports/browse-routes.test.ts
```

Expected: browsing production files do not import/query the private model or emit secret fields. Test matches are allowed only in assertions proving those fields are absent. `reporterId` and `privacySettings` may exist internally in the mapper/service projection but not in the member-visible JSON fixture.

- [ ] **Step 7: Prepare the user handoff**

Report:

- exact test file/test counts;
- lint, TypeScript, build and audit results;
- privacy-filter and secret-exclusion evidence;
- `.env.local` ignored status without its contents;
- exact branch name and commit list;
- the manual command `git push -u origin feature/issue-18-report-browsing-backend` only after the user confirms they are ready.

Do not push, open a pull request, merge or delete the branch from this task.
