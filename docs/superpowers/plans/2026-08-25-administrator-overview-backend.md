# Administrator Overview Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only, active-administrator-only API that returns strict operational counts for reports, claims and accounts without exposing record-level data.

**Architecture:** Add a focused `lib/admin` boundary containing strict aggregate/response parsers, safe errors and one overview service. The service authorises before database work, runs three MongoDB aggregation pipelines in parallel and derives the public response. A thin App Router GET route authenticates first, rejects every query parameter and returns the safe result with `Cache-Control: no-store`.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, Mongoose 9, Zod 4, Vitest 4 and the repository's existing authentication/database modules.

## Global Constraints

- Grant access only to an authenticated account with `role: "administrator"` and `status: "active"`.
- Authenticate and authorise before query validation and before every MongoDB aggregation.
- Accept no body and no query parameters on `GET /api/admin/overview`.
- Perform exactly three read-only aggregation queries: ItemReport, Claim and User.
- Exclude draft reports from submitted lost/found totals.
- Define unresolved as `open` or `claim_pending`, recovered as `resolved`, and matched as distinct Claim `reportId` values with an `approved` or `completed` Claim.
- Return finite non-negative safe integers, complete zero-valued objects for empty data and totals derived from state counts.
- Never return emails, IDs, passwords, tokens, private verification data, internal versions, aggregation stages or raw errors.
- Add no Mongoose model, package dependency, cache, transaction, persisted statistic, background job or UI.
- Tests mock sessions, models and database connections and never read `.env.local` or connect to MongoDB Atlas.
- Keep `.env.local` ignored and do not modify `package.json`, `package-lock.json` or `web/src/models/`.

---

## File map

- Create `web/src/lib/admin/overview-contract.ts`: strict aggregation row parsers, public response schema, types and total derivation.
- Create `web/src/lib/admin/overview-contract.test.ts`: numeric invariants, strictness, zero normalisation and total tests.
- Create `web/src/lib/admin/errors.ts`: approved administrator errors plus safe response conversion.
- Create `web/src/lib/admin/errors.test.ts`: preservation and redaction tests.
- Create `web/src/lib/admin/overview-service.ts`: permission gate, three aggregation pipelines and result mapping.
- Create `web/src/lib/admin/overview-service.test.ts`: permission matrix, database orchestration and metric tests.
- Create `web/src/app/api/admin/overview/route.ts`: authenticated and authorised GET endpoint.
- Create `web/src/app/api/admin/overview/admin-overview-route.test.ts`: route ordering, response, cache and privacy tests.
- Create `docs/superpowers/verification/2026-08-25-administrator-overview-backend.md`: exact final verification evidence.

### Task 1: Strict overview contracts

**Files:**
- Create: `web/src/lib/admin/overview-contract.test.ts`
- Create: `web/src/lib/admin/overview-contract.ts`

**Interfaces:**
- Consumes: raw `unknown` arrays returned by Mongoose aggregations.
- Produces: `ReportOverviewCounts`, `ClaimOverviewCounts`, `AccountOverviewCounts`, `AdministratorOverview`, `parseReportAggregate`, `parseClaimAggregate`, `parseAccountAggregate`, `buildAdministratorOverview` and `administratorOverviewSchema`.

- [ ] **Step 1: Write the failing contract tests**

Create `web/src/lib/admin/overview-contract.test.ts` with table tests covering exact rows, empty rows, invalid counts, inconsistent totals, invalid timestamps and extra private fields:

```ts
import { describe, expect, it } from "vitest";

import {
  administratorOverviewSchema,
  buildAdministratorOverview,
  parseAccountAggregate,
  parseClaimAggregate,
  parseReportAggregate,
} from "./overview-contract";

const generatedAt = "2026-08-25T03:30:00.000Z";

describe("administrator overview contracts", () => {
  it("normalises empty aggregate rows to zero", () => {
    expect(parseReportAggregate([])).toEqual({
      submittedLost: 0,
      submittedFound: 0,
      unresolved: 0,
      recovered: 0,
    });
    expect(parseClaimAggregate([])).toEqual({
      pending: 0,
      approved: 0,
      rejected: 0,
      withdrawn: 0,
      completed: 0,
      matched: 0,
    });
    expect(parseAccountAggregate([])).toEqual({
      active: 0,
      suspended: 0,
      deactivated: 0,
    });
  });

  it("derives public totals from parsed component counts", () => {
    expect(
      buildAdministratorOverview(
        generatedAt,
        { submittedLost: 4, submittedFound: 3, unresolved: 2, recovered: 1 },
        { pending: 2, approved: 1, rejected: 3, withdrawn: 1, completed: 2, matched: 2 },
        { active: 8, suspended: 1, deactivated: 2 },
      ),
    ).toEqual({
      generatedAt,
      reports: {
        submittedLost: 4,
        submittedFound: 3,
        submittedTotal: 7,
        unresolved: 2,
        recovered: 1,
        matched: 2,
      },
      claims: {
        pending: 2,
        approved: 1,
        rejected: 3,
        withdrawn: 1,
        completed: 2,
        total: 9,
      },
      accounts: { active: 8, suspended: 1, deactivated: 2, total: 11 },
    });
  });

  it.each([-1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects unsafe aggregate count %s",
    (value) => {
      expect(() =>
        parseReportAggregate([
          {
            _id: null,
            submittedLost: value,
            submittedFound: 0,
            unresolved: 0,
            recovered: 0,
          },
        ]),
      ).toThrow();
    },
  );

  it("rejects inconsistent totals and private extra fields", () => {
    const result = administratorOverviewSchema.safeParse({
      ...buildAdministratorOverview(
        generatedAt,
        { submittedLost: 1, submittedFound: 1, unresolved: 1, recovered: 0 },
        { pending: 1, approved: 0, rejected: 0, withdrawn: 0, completed: 0, matched: 0 },
        { active: 1, suspended: 0, deactivated: 0 },
      ),
      reports: {
        submittedLost: 1,
        submittedFound: 1,
        submittedTotal: 99,
        unresolved: 1,
        recovered: 0,
        matched: 0,
      },
      passwordHash: "must not pass",
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed timestamps and more than one aggregate row", () => {
    expect(
      administratorOverviewSchema.safeParse({
        generatedAt: "not-a-date",
        reports: { submittedLost: 0, submittedFound: 0, submittedTotal: 0, unresolved: 0, recovered: 0, matched: 0 },
        claims: { pending: 0, approved: 0, rejected: 0, withdrawn: 0, completed: 0, total: 0 },
        accounts: { active: 0, suspended: 0, deactivated: 0, total: 0 },
      }).success,
    ).toBe(false);
    expect(() => parseAccountAggregate([
      { _id: null, active: 0, suspended: 0, deactivated: 0 },
      { _id: null, active: 0, suspended: 0, deactivated: 0 },
    ])).toThrow();
  });
});
```

- [ ] **Step 2: Run the contract test to verify the red state**

Run from `web/`:

```powershell
npm.cmd test -- src/lib/admin/overview-contract.test.ts
```

Expected: FAIL because `./overview-contract` does not exist.

- [ ] **Step 3: Implement strict aggregate and public response parsing**

Create `web/src/lib/admin/overview-contract.ts`:

```ts
import { z } from "zod";

const safeCountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

const reportAggregateRowSchema = z.strictObject({
  _id: z.null(),
  submittedLost: safeCountSchema,
  submittedFound: safeCountSchema,
  unresolved: safeCountSchema,
  recovered: safeCountSchema,
});

const claimAggregateRowSchema = z.strictObject({
  _id: z.null(),
  pending: safeCountSchema,
  approved: safeCountSchema,
  rejected: safeCountSchema,
  withdrawn: safeCountSchema,
  completed: safeCountSchema,
  matched: safeCountSchema,
});

const accountAggregateRowSchema = z.strictObject({
  _id: z.null(),
  active: safeCountSchema,
  suspended: safeCountSchema,
  deactivated: safeCountSchema,
});

const reportsSchema = z.strictObject({
  submittedLost: safeCountSchema,
  submittedFound: safeCountSchema,
  submittedTotal: safeCountSchema,
  unresolved: safeCountSchema,
  recovered: safeCountSchema,
  matched: safeCountSchema,
});

const claimsSchema = z.strictObject({
  pending: safeCountSchema,
  approved: safeCountSchema,
  rejected: safeCountSchema,
  withdrawn: safeCountSchema,
  completed: safeCountSchema,
  total: safeCountSchema,
});

const accountsSchema = z.strictObject({
  active: safeCountSchema,
  suspended: safeCountSchema,
  deactivated: safeCountSchema,
  total: safeCountSchema,
});

export const administratorOverviewSchema = z
  .strictObject({
    generatedAt: z.string().datetime({ offset: true }),
    reports: reportsSchema,
    claims: claimsSchema,
    accounts: accountsSchema,
  })
  .superRefine((value, context) => {
    if (value.reports.submittedTotal !== value.reports.submittedLost + value.reports.submittedFound) {
      context.addIssue({ code: "custom", path: ["reports", "submittedTotal"], message: "Submitted total is inconsistent" });
    }
    if (value.claims.total !== value.claims.pending + value.claims.approved + value.claims.rejected + value.claims.withdrawn + value.claims.completed) {
      context.addIssue({ code: "custom", path: ["claims", "total"], message: "Claim total is inconsistent" });
    }
    if (value.accounts.total !== value.accounts.active + value.accounts.suspended + value.accounts.deactivated) {
      context.addIssue({ code: "custom", path: ["accounts", "total"], message: "Account total is inconsistent" });
    }
  });

export type ReportOverviewCounts = Omit<z.infer<typeof reportAggregateRowSchema>, "_id">;
export type ClaimOverviewCounts = Omit<z.infer<typeof claimAggregateRowSchema>, "_id">;
export type AccountOverviewCounts = Omit<z.infer<typeof accountAggregateRowSchema>, "_id">;
export type AdministratorOverview = z.infer<typeof administratorOverviewSchema>;

function oneRow<T>(input: unknown, schema: z.ZodType<T>): T | undefined {
  return z.array(schema).max(1).parse(input)[0];
}

export function parseReportAggregate(input: unknown): ReportOverviewCounts {
  const row = oneRow(input, reportAggregateRowSchema);
  return row
    ? { submittedLost: row.submittedLost, submittedFound: row.submittedFound, unresolved: row.unresolved, recovered: row.recovered }
    : { submittedLost: 0, submittedFound: 0, unresolved: 0, recovered: 0 };
}

export function parseClaimAggregate(input: unknown): ClaimOverviewCounts {
  const row = oneRow(input, claimAggregateRowSchema);
  return row
    ? { pending: row.pending, approved: row.approved, rejected: row.rejected, withdrawn: row.withdrawn, completed: row.completed, matched: row.matched }
    : { pending: 0, approved: 0, rejected: 0, withdrawn: 0, completed: 0, matched: 0 };
}

export function parseAccountAggregate(input: unknown): AccountOverviewCounts {
  const row = oneRow(input, accountAggregateRowSchema);
  return row
    ? { active: row.active, suspended: row.suspended, deactivated: row.deactivated }
    : { active: 0, suspended: 0, deactivated: 0 };
}

export function buildAdministratorOverview(
  generatedAt: string,
  reports: ReportOverviewCounts,
  claims: ClaimOverviewCounts,
  accounts: AccountOverviewCounts,
): AdministratorOverview {
  return administratorOverviewSchema.parse({
    generatedAt,
    reports: {
      ...reports,
      submittedTotal: reports.submittedLost + reports.submittedFound,
      matched: claims.matched,
    },
    claims: {
      pending: claims.pending,
      approved: claims.approved,
      rejected: claims.rejected,
      withdrawn: claims.withdrawn,
      completed: claims.completed,
      total: claims.pending + claims.approved + claims.rejected + claims.withdrawn + claims.completed,
    },
    accounts: {
      ...accounts,
      total: accounts.active + accounts.suspended + accounts.deactivated,
    },
  });
}
```

- [ ] **Step 4: Run contract tests and lint**

```powershell
npm.cmd test -- src/lib/admin/overview-contract.test.ts
npx.cmd eslint src/lib/admin/overview-contract.ts src/lib/admin/overview-contract.test.ts
```

Expected: contract tests PASS; ESLint exits 0.

- [ ] **Step 5: Commit the contract boundary**

```powershell
git add web/src/lib/admin/overview-contract.ts web/src/lib/admin/overview-contract.test.ts
git commit -m "feat(admin): define overview contracts" -m "Refs #31"
```

### Task 2: Safe administrator errors

**Files:**
- Create: `web/src/lib/admin/errors.test.ts`
- Create: `web/src/lib/admin/errors.ts`

**Interfaces:**
- Consumes: `AuthError` plus unknown route/service failures.
- Produces: `AdminOverviewError`, `adminOverviewErrorResponse` and `invalidAdminOverviewQueryResponse`.

- [ ] **Step 1: Write failing safe-error tests**

Create `web/src/lib/admin/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { AuthError } from "@/lib/auth/errors";

import {
  AdminOverviewError,
  adminOverviewErrorResponse,
  invalidAdminOverviewQueryResponse,
} from "./errors";

async function body(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("administrator overview errors", () => {
  it.each([
    [new AdminOverviewError("ADMINISTRATOR_REQUIRED"), 403, "ADMINISTRATOR_REQUIRED", "Administrator access required"],
    [new AdminOverviewError("ADMIN_OVERVIEW_UNAVAILABLE"), 500, "ADMIN_OVERVIEW_UNAVAILABLE", "Administrator overview is temporarily unavailable"],
    [new AuthError("AUTHENTICATION_REQUIRED"), 401, "AUTHENTICATION_REQUIRED", "Authentication required"],
  ] as const)("preserves approved error %s", async (error, status, code, message) => {
    const response = adminOverviewErrorResponse(error);
    expect(response.status).toBe(status);
    expect(await body(response)).toEqual({ error: { code, message } });
  });

  it.each([
    new Error("mongodb://private-host/database"),
    { passwordHash: "secret", stack: "private stack" },
    "raw failure",
    null,
  ])("redacts unknown failure %#", async (error) => {
    const response = adminOverviewErrorResponse(error);
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({
      error: {
        code: "ADMIN_OVERVIEW_UNAVAILABLE",
        message: "Administrator overview is temporarily unavailable",
      },
    });
    expect(text).not.toMatch(/mongodb|password|secret|stack|raw failure/i);
  });

  it("returns the exact invalid-query response", async () => {
    const response = invalidAdminOverviewQueryResponse();
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({
      error: {
        code: "ADMIN_OVERVIEW_INVALID_QUERY",
        message: "Overview query is invalid",
      },
    });
  });
});
```

- [ ] **Step 2: Run the error test to verify the red state**

```powershell
npm.cmd test -- src/lib/admin/errors.test.ts
```

Expected: FAIL because `./errors` does not exist.

- [ ] **Step 3: Implement safe errors**

Create `web/src/lib/admin/errors.ts`:

```ts
import { AuthError, authErrorResponse } from "@/lib/auth/errors";

const definitions = {
  ADMINISTRATOR_REQUIRED: { status: 403, message: "Administrator access required" },
  ADMIN_OVERVIEW_UNAVAILABLE: { status: 500, message: "Administrator overview is temporarily unavailable" },
} as const;

export type AdminOverviewErrorCode = keyof typeof definitions;

export class AdminOverviewError extends Error {
  readonly code: AdminOverviewErrorCode;
  readonly status: number;

  constructor(code: AdminOverviewErrorCode) {
    const definition = definitions[code];
    super(definition.message);
    this.name = "AdminOverviewError";
    this.code = code;
    this.status = definition.status;
  }
}

export function invalidAdminOverviewQueryResponse() {
  return Response.json(
    { error: { code: "ADMIN_OVERVIEW_INVALID_QUERY", message: "Overview query is invalid" } },
    { status: 400 },
  );
}

export function adminOverviewErrorResponse(error: unknown) {
  if (error instanceof AuthError && error.code === "AUTHENTICATION_REQUIRED") {
    return authErrorResponse(error);
  }

  const safeError =
    error instanceof AdminOverviewError && Object.hasOwn(definitions, error.code)
      ? new AdminOverviewError(error.code)
      : new AdminOverviewError("ADMIN_OVERVIEW_UNAVAILABLE");

  return Response.json(
    { error: { code: safeError.code, message: safeError.message } },
    { status: safeError.status },
  );
}
```

- [ ] **Step 4: Run error tests and lint**

```powershell
npm.cmd test -- src/lib/admin/errors.test.ts
npx.cmd eslint src/lib/admin/errors.ts src/lib/admin/errors.test.ts
```

Expected: tests PASS; ESLint exits 0.

- [ ] **Step 5: Commit the safe-error boundary**

```powershell
git add web/src/lib/admin/errors.ts web/src/lib/admin/errors.test.ts
git commit -m "feat(admin): define safe overview errors" -m "Refs #31"
```

### Task 3: Administrator overview aggregation service

**Files:**
- Create: `web/src/lib/admin/overview-service.test.ts`
- Create: `web/src/lib/admin/overview-service.ts`

**Interfaces:**
- Consumes: `PublicUser`, `connectToDatabase`, `ItemReportModel`, `ClaimModel`, `UserModel` and Task 1 parsers.
- Produces: `requireAdministrator(user: PublicUser): void` and `getAdministratorOverview(user: PublicUser): Promise<AdministratorOverview>`.

- [ ] **Step 1: Write the failing permission and orchestration tests**

Create mocks before importing the service:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/item-report", () => ({ ItemReportModel: { aggregate: vi.fn() } }));
vi.mock("@/models/claim", () => ({ ClaimModel: { aggregate: vi.fn() } }));
vi.mock("@/models/user", () => ({ UserModel: { aggregate: vi.fn() } }));

import { connectToDatabase } from "@/lib/db";
import type { PublicUser } from "@/lib/auth/public-user";
import { ClaimModel } from "@/models/claim";
import { ItemReportModel } from "@/models/item-report";
import { UserModel } from "@/models/user";

import { getAdministratorOverview, requireAdministrator } from "./overview-service";

const administrator = {
  id: "admin-id",
  email: "admin@example.test",
  role: "administrator",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Admin User",
    preferredContactMethod: "in_app",
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
} satisfies PublicUser;

function aggregateResult(value: unknown) {
  return { exec: vi.fn().mockResolvedValue(value) };
}

describe("administrator overview service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ItemReportModel.aggregate).mockReturnValue(aggregateResult([]) as never);
    vi.mocked(ClaimModel.aggregate).mockReturnValue(aggregateResult([]) as never);
    vi.mocked(UserModel.aggregate).mockReturnValue(aggregateResult([]) as never);
  });

  it.each([
    { ...administrator, role: "student" as const },
    { ...administrator, role: "staff" as const },
    { ...administrator, status: "suspended" as const },
    { ...administrator, status: "deactivated" as const },
  ])("rejects $role/$status before database work", async (user) => {
    expect(() => requireAdministrator(user)).toThrow("Administrator access required");
    await expect(getAdministratorOverview(user)).rejects.toMatchObject({ code: "ADMINISTRATOR_REQUIRED" });
    expect(connectToDatabase).not.toHaveBeenCalled();
    expect(ItemReportModel.aggregate).not.toHaveBeenCalled();
    expect(ClaimModel.aggregate).not.toHaveBeenCalled();
    expect(UserModel.aggregate).not.toHaveBeenCalled();
  });

  it("runs three aggregations and returns derived counts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T03:30:00.000Z"));
    vi.mocked(ItemReportModel.aggregate).mockReturnValue(aggregateResult([
      { _id: null, submittedLost: 4, submittedFound: 3, unresolved: 2, recovered: 1 },
    ]) as never);
    vi.mocked(ClaimModel.aggregate).mockReturnValue(aggregateResult([
      { _id: null, pending: 2, approved: 1, rejected: 3, withdrawn: 1, completed: 2, matched: 2 },
    ]) as never);
    vi.mocked(UserModel.aggregate).mockReturnValue(aggregateResult([
      { _id: null, active: 8, suspended: 1, deactivated: 2 },
    ]) as never);

    await expect(getAdministratorOverview(administrator)).resolves.toMatchObject({
      generatedAt: "2026-08-25T03:30:00.000Z",
      reports: { submittedLost: 4, submittedFound: 3, submittedTotal: 7, unresolved: 2, recovered: 1, matched: 2 },
      claims: { pending: 2, approved: 1, rejected: 3, withdrawn: 1, completed: 2, total: 9 },
      accounts: { active: 8, suspended: 1, deactivated: 2, total: 11 },
    });
    expect(connectToDatabase).toHaveBeenCalledOnce();
    expect(ItemReportModel.aggregate).toHaveBeenCalledOnce();
    expect(ClaimModel.aggregate).toHaveBeenCalledOnce();
    expect(UserModel.aggregate).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("fails closed when aggregate output is malformed", async () => {
    vi.mocked(UserModel.aggregate).mockReturnValue(aggregateResult([
      { _id: null, active: 1, suspended: -1, deactivated: 0, passwordHash: "secret" },
    ]) as never);
    await expect(getAdministratorOverview(administrator)).rejects.toThrow();
  });
});
```

Also inspect the Claim pipeline passed to `ClaimModel.aggregate` and assert that it uses `$addToSet` for `reportId`, limits matching states to `approved` and `completed`, removes the null sentinel and projects `matched` as the set size. Inspect the ItemReport pipeline and assert that draft is absent from submitted counts, unresolved uses only `open`/`claim_pending`, and recovered uses only `resolved`.

- [ ] **Step 2: Run the service test to verify the red state**

```powershell
npm.cmd test -- src/lib/admin/overview-service.test.ts
```

Expected: FAIL because `./overview-service` does not exist.

- [ ] **Step 3: Implement the permission gate and three pipelines**

Create `web/src/lib/admin/overview-service.ts`:

```ts
import type { PipelineStage } from "mongoose";

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { ClaimModel } from "@/models/claim";
import { ItemReportModel } from "@/models/item-report";
import { UserModel } from "@/models/user";

import { AdminOverviewError } from "./errors";
import {
  buildAdministratorOverview,
  parseAccountAggregate,
  parseClaimAggregate,
  parseReportAggregate,
  type AdministratorOverview,
} from "./overview-contract";

const submittedStatuses = ["open", "claim_pending", "resolved", "closed"];

const reportPipeline: PipelineStage[] = [
  {
    $group: {
      _id: null,
      submittedLost: {
        $sum: { $cond: [{ $and: [{ $eq: ["$reportType", "lost"] }, { $in: ["$status", submittedStatuses] }] }, 1, 0] },
      },
      submittedFound: {
        $sum: { $cond: [{ $and: [{ $eq: ["$reportType", "found"] }, { $in: ["$status", submittedStatuses] }] }, 1, 0] },
      },
      unresolved: {
        $sum: { $cond: [{ $in: ["$status", ["open", "claim_pending"]] }, 1, 0] },
      },
      recovered: {
        $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 1, 0] },
      },
    },
  },
];

const claimPipeline: PipelineStage[] = [
  {
    $group: {
      _id: null,
      pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
      approved: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
      rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
      withdrawn: { $sum: { $cond: [{ $eq: ["$status", "withdrawn"] }, 1, 0] } },
      completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
      matchedReportIds: {
        $addToSet: { $cond: [{ $in: ["$status", ["approved", "completed"]] }, "$reportId", null] },
      },
    },
  },
  {
    $project: {
      _id: 1,
      pending: 1,
      approved: 1,
      rejected: 1,
      withdrawn: 1,
      completed: 1,
      matched: { $size: { $setDifference: ["$matchedReportIds", [null]] } },
    },
  },
];

const accountPipeline: PipelineStage[] = [
  {
    $group: {
      _id: null,
      active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
      suspended: { $sum: { $cond: [{ $eq: ["$status", "suspended"] }, 1, 0] } },
      deactivated: { $sum: { $cond: [{ $eq: ["$status", "deactivated"] }, 1, 0] } },
    },
  },
];

export function requireAdministrator(user: PublicUser) {
  if (user.status !== "active" || user.role !== "administrator") {
    throw new AdminOverviewError("ADMINISTRATOR_REQUIRED");
  }
}

export async function getAdministratorOverview(
  user: PublicUser,
): Promise<AdministratorOverview> {
  requireAdministrator(user);
  await connectToDatabase();

  const [reportRows, claimRows, accountRows] = await Promise.all([
    ItemReportModel.aggregate(reportPipeline).exec(),
    ClaimModel.aggregate(claimPipeline).exec(),
    UserModel.aggregate(accountPipeline).exec(),
  ]);

  return buildAdministratorOverview(
    new Date().toISOString(),
    parseReportAggregate(reportRows),
    parseClaimAggregate(claimRows),
    parseAccountAggregate(accountRows),
  );
}
```

- [ ] **Step 4: Complete semantic pipeline tests**

Use `vi.mocked(Model.aggregate).mock.calls[0][0]` to verify the full report, claim and account pipelines equal the implementation above. This test must prove:

```ts
expect(JSON.stringify(vi.mocked(ClaimModel.aggregate).mock.calls[0][0])).toContain("$addToSet");
expect(JSON.stringify(vi.mocked(ClaimModel.aggregate).mock.calls[0][0])).toContain("$setDifference");
expect(JSON.stringify(vi.mocked(ClaimModel.aggregate).mock.calls[0][0])).not.toMatch(/password|email|verification/i);
expect(JSON.stringify(vi.mocked(ItemReportModel.aggregate).mock.calls[0][0])).not.toMatch(/title|description|photo|reporterId/i);
```

Also reject a second aggregation row and a row containing an unknown key through the Task 1 parsers.

- [ ] **Step 5: Run all administrator library tests, lint and TypeScript**

```powershell
npm.cmd test -- src/lib/admin/overview-contract.test.ts src/lib/admin/errors.test.ts src/lib/admin/overview-service.test.ts
npx.cmd eslint src/lib/admin
npx.cmd tsc --noEmit --incremental false
```

Expected: all focused tests PASS; ESLint and TypeScript exit 0.

- [ ] **Step 6: Commit the aggregation service**

```powershell
git add web/src/lib/admin/overview-service.ts web/src/lib/admin/overview-service.test.ts
git commit -m "feat(admin): aggregate overview statistics" -m "Refs #31"
```

### Task 4: Administrator overview API route

**Files:**
- Create: `web/src/app/api/admin/overview/admin-overview-route.test.ts`
- Create: `web/src/app/api/admin/overview/route.ts`

**Interfaces:**
- Consumes: `readSessionCookie`, `getCurrentUser`, `requireAdministrator`, `getAdministratorOverview`, `adminOverviewErrorResponse` and `invalidAdminOverviewQueryResponse`.
- Produces: Next.js App Router `GET(request: Request): Promise<Response>` at `/api/admin/overview`.

- [ ] **Step 1: Write failing route tests**

Create module mocks and a valid administrator fixture, then cover the complete ordering and response contract:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/admin/overview-service", () => ({
  requireAdministrator: vi.fn(),
  getAdministratorOverview: vi.fn(),
}));

import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AdminOverviewError } from "@/lib/admin/errors";
import { getAdministratorOverview, requireAdministrator } from "@/lib/admin/overview-service";

import { GET } from "./route";

const administrator = {
  id: "admin-id",
  email: "admin@example.test",
  role: "administrator",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Admin User",
    preferredContactMethod: "in_app",
    preferredCampusLocationIds: [],
    notificationSettings: { possibleMatches: true, claimUpdates: true, statusChanges: true, handoverInstructions: true },
  },
} as const;

const overview = {
  generatedAt: "2026-08-25T03:30:00.000Z",
  reports: { submittedLost: 4, submittedFound: 3, submittedTotal: 7, unresolved: 2, recovered: 1, matched: 2 },
  claims: { pending: 2, approved: 1, rejected: 3, withdrawn: 1, completed: 2, total: 9 },
  accounts: { active: 8, suspended: 1, deactivated: 2, total: 11 },
};

describe("GET /api/admin/overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readSessionCookie).mockResolvedValue("raw-session-token");
    vi.mocked(getCurrentUser).mockResolvedValue(administrator);
    vi.mocked(getAdministratorOverview).mockResolvedValue(overview);
  });

  it("returns the exact overview without browser caching", async () => {
    const response = await GET(new Request("http://localhost/api/admin/overview"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(overview);
    expect(requireAdministrator).toHaveBeenCalledWith(administrator);
    expect(getAdministratorOverview).toHaveBeenCalledWith(administrator);
  });

  it("authenticates before rejecting a query", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/admin/overview?metric=reports"));
    expect(response.status).toBe(401);
    expect(requireAdministrator).not.toHaveBeenCalled();
    expect(getAdministratorOverview).not.toHaveBeenCalled();
  });

  it("authorises before rejecting a query", async () => {
    vi.mocked(requireAdministrator).mockImplementation(() => {
      throw new AdminOverviewError("ADMINISTRATOR_REQUIRED");
    });
    const response = await GET(new Request("http://localhost/api/admin/overview?metric=reports"));
    expect(response.status).toBe(403);
    expect(getAdministratorOverview).not.toHaveBeenCalled();
  });

  it.each(["?metric=", "?metric=reports", "?metric=reports&metric=claims"])(
    "rejects query %s after authorisation",
    async (query) => {
      const response = await GET(new Request(`http://localhost/api/admin/overview${query}`));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: { code: "ADMIN_OVERVIEW_INVALID_QUERY", message: "Overview query is invalid" },
      });
      expect(getAdministratorOverview).not.toHaveBeenCalled();
    },
  );

  it("redacts service failures", async () => {
    vi.mocked(getAdministratorOverview).mockRejectedValue(new Error("mongodb://private-host/database"));
    const response = await GET(new Request("http://localhost/api/admin/overview"));
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(text).not.toMatch(/mongodb|private-host|stack/i);
  });
});
```

Add table cases for active student, active staff, suspended administrator and deactivated administrator. Make `requireAdministrator` throw the approved 403 and prove the overview service is not called. Add a privacy assertion against the successful serialised body:

```ts
expect(JSON.stringify(overview)).not.toMatch(
  /password|token|email|userId|reportId|claimId|verification|__v|raw-session-token/i,
);
```

- [ ] **Step 2: Run the route test to verify the red state**

```powershell
npm.cmd test -- src/app/api/admin/overview/admin-overview-route.test.ts
```

Expected: FAIL because `./route` does not exist.

- [ ] **Step 3: Implement the thin route in the required order**

Create `web/src/app/api/admin/overview/route.ts`:

```ts
import {
  adminOverviewErrorResponse,
  invalidAdminOverviewQueryResponse,
} from "@/lib/admin/errors";
import {
  getAdministratorOverview,
  requireAdministrator,
} from "@/lib/admin/overview-service";
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";

async function requireCurrentAdministrator(): Promise<PublicUser> {
  const user = await getCurrentUser(await readSessionCookie());
  if (!user) throw new AuthError("AUTHENTICATION_REQUIRED");
  requireAdministrator(user);
  return user;
}

export async function GET(request: Request) {
  let administrator: PublicUser;
  try {
    administrator = await requireCurrentAdministrator();
  } catch (error) {
    return adminOverviewErrorResponse(error);
  }

  if (new URL(request.url).searchParams.size > 0) {
    return invalidAdminOverviewQueryResponse();
  }

  try {
    return Response.json(await getAdministratorOverview(administrator), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return adminOverviewErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run the complete focused gate**

```powershell
npm.cmd test -- src/lib/admin/overview-contract.test.ts src/lib/admin/errors.test.ts src/lib/admin/overview-service.test.ts src/app/api/admin/overview/admin-overview-route.test.ts
npx.cmd eslint src/lib/admin src/app/api/admin/overview
npx.cmd tsc --noEmit --incremental false
```

Expected: all administrator overview tests PASS; ESLint and TypeScript exit 0.

- [ ] **Step 5: Commit the route**

```powershell
git add web/src/app/api/admin/overview/route.ts web/src/app/api/admin/overview/admin-overview-route.test.ts
git commit -m "feat(admin): expose overview statistics" -m "Refs #31"
```

### Task 5: Full verification and delivery evidence

**Files:**
- Create: `docs/superpowers/verification/2026-08-25-administrator-overview-backend.md`

**Interfaces:**
- Consumes: the completed Issue #31 diff and command output.
- Produces: reproducible verification evidence and a push-ready clean branch.

- [ ] **Step 1: Run focused and full automated gates sequentially**

Run from `web/` without parallel build/test processes:

```powershell
npm.cmd test -- src/lib/admin/overview-contract.test.ts src/lib/admin/errors.test.ts src/lib/admin/overview-service.test.ts src/app/api/admin/overview/admin-overview-route.test.ts
npm.cmd test
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run build
npm.cmd audit
```

Expected: focused and full tests PASS; ESLint and TypeScript exit 0; the build route table contains `ƒ /api/admin/overview`; npm reports zero vulnerabilities.

- [ ] **Step 2: Run privacy, environment and scope checks**

Run from the repository root:

```powershell
git diff --check develop...HEAD
git check-ignore -v web/.env.local
git ls-files -- web/.env web/.env.local .env .env.local
rg -n "passwordHash|tokenHash|raw-session-token|PRIVATE_SECRET|verificationMatchedCount|responses.answer|__v" web/src/lib/admin web/src/app/api/admin
git diff develop...HEAD -- web/package.json web/package-lock.json web/src/models web/src/components web/src/app/admin
```

Expected:

- branch-level diff check exits 0;
- `web/.gitignore` is reported as the rule ignoring `.env.local`;
- no real environment file is listed;
- sensitive terms occur only in explicit redaction tests, never in a production response shape;
- dependency, model and UI scope diff is empty.

- [ ] **Step 3: Write exact verification evidence**

Create `docs/superpowers/verification/2026-08-25-administrator-overview-backend.md` with these sections and the exact observed command counts/results:

```markdown
# Administrator overview backend verification

## Scope

Issue #31 adds one read-only active-administrator overview endpoint. It changes no model, dependency, UI or Atlas data.

## Metric evidence

Document the submitted, unresolved, recovered and distinct approved/completed-match definitions, all five Claim states and all three User states.

## Automated verification

Record the exact focused test file/test totals, full test file/test totals, lint, TypeScript, build route, audit and branch-level diff-check results observed in Steps 1 and 2.

## Privacy and access

Record the complete permission matrix, authentication-before-validation order, explicit aggregate-only projections, generic failure response, ignored `.env.local`, no tracked real environment file and no Atlas mutation.

## Scope control

Record that package manifests, Mongoose models, components and administrator pages are unchanged.
```

Do not estimate test counts or copy counts from an earlier issue; transcribe the output produced by this branch.

- [ ] **Step 4: Re-run documentation and branch checks**

```powershell
git diff --check
git status --short
rg -n "T[B]D|T[O]DO|F[I]XME|PLACEH[O]LDER" docs/superpowers/verification/2026-08-25-administrator-overview-backend.md
```

Expected: diff check exits 0; only the verification file is untracked; placeholder scan returns no matches.

- [ ] **Step 5: Commit verification evidence**

```powershell
git add docs/superpowers/verification/2026-08-25-administrator-overview-backend.md
git commit -m "docs: record administrator overview verification" -m "Refs #31"
```

- [ ] **Step 6: Verify the final branch and push**

```powershell
git status --short --branch
git log --oneline --decorate develop..HEAD
git diff --check develop...HEAD
git push -u origin feature/issue-31-admin-overview-backend
```

Expected: clean branch tracking `origin/feature/issue-31-admin-overview-backend`, five implementation/documentation commits after the design and plan commits, and no branch-level whitespace errors.

Prepare a Pull Request with base `develop`, compare `feature/issue-31-admin-overview-backend`, title `feat(admin): add secure overview statistics`, exact verification results and `Closes #31`.
