# Administrator Account Management Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build active-administrator-only APIs for safely finding student and staff accounts and atomically changing account status, revoking sessions, and recording immutable audit evidence.

**Architecture:** Add a focused administrator account-management boundary beside the existing overview modules. A strict aggregate-backed list service returns only approved User/Profile fields, while a separate transaction-owning status service reauthorises the actor, applies an optimistic conditional update, deletes target sessions, and inserts an immutable audit event. Thin App Router endpoints authenticate and authorise before transport validation and return closed no-store contracts.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, Mongoose 9, Zod 4, Vitest 4, MongoDB transactions, and the existing cookie-session authentication modules.

## Global Constraints

- Only a current User with `role: "administrator"` and `status: "active"` may access either endpoint.
- Manageable target roles are exactly `student` and `staff`; self and every administrator account are forbidden targets.
- Account statuses are exactly `active`, `suspended`, and `deactivated`.
- Allowed transitions are `active -> suspended`, `suspended -> active`, and `active|suspended -> deactivated`; `deactivated` is terminal.
- Allowed reasons are exactly `security_concern`, `policy_violation`, `administrative_review`, `account_restored`, and `account_closed`, with the transition compatibility defined in the approved design.
- `GET /api/admin/accounts` accepts only `q`, `role`, `status`, and `page`, uses fixed page size `20`, and caps `page` at `500`.
- Account search covers only email and Profile display name; the search value is NFKC-normalised, whitespace-collapsed, bounded to `1..80`, and regex-escaped.
- Public account data contains only `id`, `email`, `displayName`, `role`, `status`, `createdAt`, `lastLoginAt`, and `updatedAt`.
- The target User's public `updatedAt` is the optimistic-concurrency token and must exactly match `expectedUpdatedAt`.
- Every successful transition updates one User, deletes every target Session, and creates one audit event in one transaction.
- Reactivation also deletes every target Session.
- Audit events contain controlled IDs, statuses, a controlled reason, and server time only; no free text or duplicated identity data.
- Authentication and administrator authorisation happen before query, path, or body validation.
- Account-bearing responses and all errors from these routes use `Cache-Control: no-store`.
- Never expose password hashes, session values, email-verification state, hidden Profile fields, raw database errors, stack traces, transaction labels, or rejected input.
- Add no runtime dependency, frontend, role management, identity editing, permanent deletion, bulk action, audit reader, notification, or unrelated refactor.
- Automated tests mock database/model/session boundaries; they do not read `.env.local` or connect to Atlas.
- Do not modify `.env.local`, `package.json`, or `package-lock.json`.

---

## File map

- Create `web/src/models/account-administration-event.ts`: controlled reason constants, immutable audit schema, cross-field validation, indexes, and model.
- Create `web/src/models/account-administration-event.test.ts`: required-field, enum, transition, actor/target, timestamp, and index tests.
- Create `web/src/lib/admin/account-contract.ts`: strict list/update transport schemas, public account/page schemas, aggregate parsing, and safe mapping types.
- Create `web/src/lib/admin/account-contract.test.ts`: canonical query/body, reason compatibility, aggregate, pagination, date, and private-field rejection tests.
- Create `web/src/lib/admin/account-errors.ts`: closed account-management error union and generic invalid/error responses.
- Create `web/src/lib/admin/account-errors.test.ts`: authentication preservation, approved error, unknown-error redaction, and response-shape tests.
- Create `web/src/lib/admin/account-access.ts`: reusable active-administrator guard for both routes and services.
- Create `web/src/lib/admin/account-access.test.ts`: full role/status permission matrix.
- Create `web/src/lib/admin/account-request-body.ts`: bounded fatal-UTF-8 body reader for the PATCH route.
- Create `web/src/lib/admin/account-request-body.test.ts`: declared/chunked overflow, invalid UTF-8, empty and failed-stream tests.
- Create `web/src/lib/admin/account-list-service.ts`: aggregate-backed search/filter/page service with a mandatory manageable-role boundary.
- Create `web/src/lib/admin/account-list-service.test.ts`: permission, aggregate pipeline, escaped search, mapping, pagination, privacy, and safe-failure tests.
- Create `web/src/lib/admin/account-status-service.ts`: transition compatibility and transaction-owned update, session revocation, audit insertion, and result mapping.
- Create `web/src/lib/admin/account-status-service.test.ts`: transition matrix, target boundary, concurrency, transaction/session, rollback, and redaction tests.
- Create `web/src/app/api/admin/accounts/route.ts`: authenticated, authorised, strict, no-store list route.
- Create `web/src/app/api/admin/accounts/admin-account-list-route.test.ts`: route ordering, query, response, cache, permission, and redaction tests.
- Create `web/src/app/api/admin/accounts/[userId]/status/route.ts`: authenticated, authorised, bounded-body, strict, no-store status route.
- Create `web/src/app/api/admin/accounts/[userId]/status/admin-account-status-route.test.ts`: route ordering, path/body/media/encoding, response, cache, permission, and redaction tests.
- Create `docs/superpowers/verification/2026-08-27-administrator-account-management-backend.md`: final focused/full verification and privacy evidence.

### Task 1: Immutable account-administration audit model

**Files:**
- Create: `web/src/models/account-administration-event.test.ts`
- Create: `web/src/models/account-administration-event.ts`

**Interfaces:**
- Consumes: existing Mongoose model-registration pattern and `USER_STATUSES` semantics.
- Produces: `ACCOUNT_ADMINISTRATION_REASONS`, `AccountAdministrationReason`, `accountAdministrationEventSchema`, `AccountAdministrationEvent`, and `AccountAdministrationEventModel`.

- [ ] **Step 1: Write the failing model tests**

Create `web/src/models/account-administration-event.test.ts`:

```ts
import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import {
  ACCOUNT_ADMINISTRATION_REASONS,
  AccountAdministrationEventModel,
  accountAdministrationEventSchema,
} from "./account-administration-event";

const actorAdministratorId = new mongoose.Types.ObjectId();
const targetUserId = new mongoose.Types.ObjectId();

function event(overrides: Record<string, unknown> = {}) {
  return new AccountAdministrationEventModel({
    actorAdministratorId,
    targetUserId,
    previousStatus: "active",
    newStatus: "suspended",
    reason: "security_concern",
    ...overrides,
  });
}

describe("AccountAdministrationEvent model", () => {
  it("requires the controlled audit fields and defaults occurredAt", async () => {
    const record = event();
    await expect(record.validate()).resolves.toBeUndefined();
    expect(record.occurredAt).toBeInstanceOf(Date);

    await expect(
      new AccountAdministrationEventModel({}).validate(),
    ).rejects.toMatchObject({
      errors: {
        actorAdministratorId: expect.anything(),
        targetUserId: expect.anything(),
        previousStatus: expect.anything(),
        newStatus: expect.anything(),
        reason: expect.anything(),
      },
    });
  });

  it.each(ACCOUNT_ADMINISTRATION_REASONS)("accepts reason %s", async (reason) => {
    const overrides =
      reason === "account_restored"
        ? { previousStatus: "suspended", newStatus: "active", reason }
        : reason === "account_closed"
          ? { newStatus: "deactivated", reason }
          : { reason };
    await expect(event(overrides).validate()).resolves.toBeUndefined();
  });

  it.each([
    ["active", "active", "security_concern"],
    ["deactivated", "active", "account_restored"],
    ["suspended", "deactivated", "account_restored"],
    ["active", "suspended", "account_closed"],
  ])(
    "rejects invalid audit transition %s -> %s with %s",
    async (previousStatus, newStatus, reason) => {
      await expect(
        event({ previousStatus, newStatus, reason }).validate(),
      ).rejects.toMatchObject({ errors: { newStatus: expect.anything() } });
    },
  );

  it("rejects an actor targeting the same User", async () => {
    await expect(
      event({ targetUserId: actorAdministratorId }).validate(),
    ).rejects.toMatchObject({ errors: { targetUserId: expect.anything() } });
  });

  it("defines actor and target audit indexes without update timestamps", () => {
    expect(accountAdministrationEventSchema.indexes()).toEqual(
      expect.arrayContaining([
        [{ targetUserId: 1, occurredAt: -1, _id: -1 }, expect.any(Object)],
        [
          { actorAdministratorId: 1, occurredAt: -1, _id: -1 },
          expect.any(Object),
        ],
      ]),
    );
    expect(accountAdministrationEventSchema.indexes()).toHaveLength(2);
    expect(accountAdministrationEventSchema.get("timestamps")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the model test to verify the red state**

Run from `web/`:

```powershell
npm.cmd test -- src/models/account-administration-event.test.ts
```

Expected: FAIL because `./account-administration-event` does not exist.

- [ ] **Step 3: Implement the minimal immutable model**

Create `web/src/models/account-administration-event.ts`:

```ts
import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

export const ACCOUNT_ADMINISTRATION_REASONS = [
  "security_concern",
  "policy_violation",
  "administrative_review",
  "account_restored",
  "account_closed",
] as const;
export type AccountAdministrationReason =
  (typeof ACCOUNT_ADMINISTRATION_REASONS)[number];

function transitionIsValid(
  previousStatus: unknown,
  newStatus: unknown,
  reason: unknown,
) {
  if (previousStatus === "active" && newStatus === "suspended") {
    return [
      "security_concern",
      "policy_violation",
      "administrative_review",
    ].includes(String(reason));
  }
  if (previousStatus === "suspended" && newStatus === "active") {
    return reason === "account_restored";
  }
  if (
    (previousStatus === "active" || previousStatus === "suspended") &&
    newStatus === "deactivated"
  ) {
    return reason === "account_closed";
  }
  return false;
}

export const accountAdministrationEventSchema = new Schema(
  {
    actorAdministratorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    targetUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    previousStatus: {
      type: String,
      enum: ["active", "suspended"],
      required: true,
    },
    newStatus: {
      type: String,
      enum: ["active", "suspended", "deactivated"],
      required: true,
    },
    reason: {
      type: String,
      enum: ACCOUNT_ADMINISTRATION_REASONS,
      required: true,
    },
    occurredAt: { type: Date, required: true, default: Date.now },
  },
  { collection: "account_administration_events", timestamps: false },
);

accountAdministrationEventSchema.pre("validate", function () {
  if (
    this.actorAdministratorId?.toString() === this.targetUserId?.toString()
  ) {
    this.invalidate("targetUserId", "Administrator cannot target self");
  }
  if (
    !transitionIsValid(this.previousStatus, this.newStatus, this.reason)
  ) {
    this.invalidate("newStatus", "Account transition is invalid");
  }
});

accountAdministrationEventSchema.index({
  targetUserId: 1,
  occurredAt: -1,
  _id: -1,
});
accountAdministrationEventSchema.index({
  actorAdministratorId: 1,
  occurredAt: -1,
  _id: -1,
});

export type AccountAdministrationEvent = InferSchemaType<
  typeof accountAdministrationEventSchema
>;
export const AccountAdministrationEventModel =
  (models.AccountAdministrationEvent as
    | Model<AccountAdministrationEvent>
    | undefined) ??
  model<AccountAdministrationEvent>(
    "AccountAdministrationEvent",
    accountAdministrationEventSchema,
  );
```

- [ ] **Step 4: Run the model test to verify the green state**

Run:

```powershell
npm.cmd test -- src/models/account-administration-event.test.ts
```

Expected: PASS with required fields, all valid reasons, invalid transitions, self-target rejection, two indexes, and disabled timestamps verified.

- [ ] **Step 5: Commit the audit model**

```powershell
git add web/src/models/account-administration-event.ts web/src/models/account-administration-event.test.ts
git commit -m "feat(admin): add account administration audit model"
```

### Task 2: Strict account contracts and transport validation

**Files:**
- Create: `web/src/lib/admin/account-contract.test.ts`
- Create: `web/src/lib/admin/account-contract.ts`

**Interfaces:**
- Consumes: `USER_STATUSES`, Task 1 reasons, and User/Profile aggregate rows.
- Produces: `MANAGEABLE_ACCOUNT_ROLES`, `ManagedAccount`, `ManagedAccountPage`, `AccountListQuery`, `AccountStatusInput`, `accountListQuerySchema`, `accountStatusInputSchema`, `accountUserIdSchema`, `toAccountListQueryInput(searchParams)`, `parseManagedAccountPage(input, query)`, and `toManagedAccount(user, profile)`.

- [ ] **Step 1: Write failing contract and validation tests**

Create `web/src/lib/admin/account-contract.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  accountListQuerySchema,
  accountStatusInputSchema,
  accountUserIdSchema,
  managedAccountPageSchema,
  parseManagedAccountPage,
  toAccountListQueryInput,
} from "./account-contract";

const id = "64b64c6f2f4d9f1a2b3c4d51";
const createdAt = new Date("2026-08-20T01:00:00.000Z");
const updatedAt = new Date("2026-08-27T01:00:00.000Z");

describe("administrator account contracts", () => {
  it("normalises and validates the exact list query", () => {
    const params = new URLSearchParams({
      q: "  Example   Student  ",
      role: "student",
      status: "active",
      page: "2",
    });
    expect(
      accountListQuerySchema.parse(toAccountListQueryInput(params)),
    ).toEqual({
      q: "Example Student",
      role: "student",
      status: "active",
      page: 2,
    });
  });

  it.each([
    "?page=0",
    "?page=501",
    "?page=01",
    "?role=administrator",
    "?status=unknown",
    "?q=",
    "?q=a&q=b",
    "?owner=private",
  ])("rejects invalid list query %s", (query) => {
    expect(
      accountListQuerySchema.safeParse(
        toAccountListQueryInput(new URLSearchParams(query)),
      ).success,
    ).toBe(false);
  });

  it.each([
    ["suspended", "security_concern"],
    ["suspended", "policy_violation"],
    ["suspended", "administrative_review"],
    ["active", "account_restored"],
    ["deactivated", "account_closed"],
  ])("accepts status %s and controlled reason %s", (status, reason) => {
    expect(
      accountStatusInputSchema.safeParse({
        status,
        expectedUpdatedAt: updatedAt.toISOString(),
        reason,
      }).success,
    ).toBe(true);
  });

  it("rejects unknown mutation fields and malformed identifiers/timestamps", () => {
    expect(
      accountStatusInputSchema.safeParse({
        status: "suspended",
        expectedUpdatedAt: "yesterday",
        reason: "security_concern",
        email: "new@example.test",
      }).success,
    ).toBe(false);
    expect(accountUserIdSchema.safeParse(id).success).toBe(true);
    expect(accountUserIdSchema.safeParse(id.toUpperCase()).success).toBe(false);
  });

  it("parses an exact aggregate page and rejects private fields", () => {
    const aggregate = [
      {
        accounts: [
          {
            _id: { toString: () => id },
            email: "student@example.test",
            role: "student",
            status: "active",
            createdAt,
            lastLoginAt: null,
            updatedAt,
            displayName: "Example Student",
          },
        ],
        metadata: [{ totalItems: 1 }],
      },
    ];
    const page = parseManagedAccountPage(aggregate, { page: 1 });
    expect(managedAccountPageSchema.parse(page)).toEqual(page);
    expect(page.pagination).toEqual({
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    });
    expect(JSON.stringify(page)).not.toMatch(
      /passwordHash|tokenHash|emailVerifiedAt|notificationSettings/,
    );
  });

  it("returns a complete empty page and rejects malformed aggregate output", () => {
    expect(
      parseManagedAccountPage([{ accounts: [], metadata: [] }], { page: 3 }),
    ).toEqual({
      accounts: [],
      pagination: {
        page: 3,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
      },
    });
    expect(() =>
      parseManagedAccountPage(
        [{ accounts: [{ passwordHash: "PRIVATE" }], metadata: [] }],
        { page: 1 },
      ),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the contract test to verify the red state**

Run:

```powershell
npm.cmd test -- src/lib/admin/account-contract.test.ts
```

Expected: FAIL because `./account-contract` does not exist.

- [ ] **Step 3: Implement strict query, mutation, public and aggregate schemas**

Create `web/src/lib/admin/account-contract.ts` with these exported contracts:

```ts
import { z } from "zod";

import { ACCOUNT_ADMINISTRATION_REASONS } from "@/models/account-administration-event";
import { USER_STATUSES } from "@/models/user";

export const MANAGEABLE_ACCOUNT_ROLES = ["student", "staff"] as const;
export const ADMIN_ACCOUNT_PAGE_SIZE = 20;

const canonicalPage = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(500));

const searchText = z
  .string()
  .transform((value) => value.normalize("NFKC").trim().replace(/\s+/gu, " "))
  .pipe(z.string().min(1).max(80));

export const accountListQuerySchema = z.strictObject({
  q: searchText.optional(),
  role: z.enum(MANAGEABLE_ACCOUNT_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  page: canonicalPage.default(1),
});

export const accountUserIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/, "Account reference is invalid");

export const accountStatusInputSchema = z.strictObject({
  status: z.enum(USER_STATUSES),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  reason: z.enum(ACCOUNT_ADMINISTRATION_REASONS),
});

export const managedAccountSchema = z.strictObject({
  id: accountUserIdSchema,
  email: z.string().email(),
  displayName: z.string().min(2).max(80),
  role: z.enum(MANAGEABLE_ACCOUNT_ROLES),
  status: z.enum(USER_STATUSES),
  createdAt: z.string().datetime({ offset: true }),
  lastLoginAt: z.string().datetime({ offset: true }).nullable(),
  updatedAt: z.string().datetime({ offset: true }),
});

export const managedAccountPageSchema = z.strictObject({
  accounts: z.array(managedAccountSchema).max(ADMIN_ACCOUNT_PAGE_SIZE),
  pagination: z.strictObject({
    page: z.number().int().min(1).max(500),
    pageSize: z.literal(ADMIN_ACCOUNT_PAGE_SIZE),
    totalItems: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    totalPages: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }),
});

export type AccountListQuery = z.output<typeof accountListQuerySchema>;
export type AccountStatusInput = z.infer<typeof accountStatusInputSchema>;
export type ManagedAccount = z.infer<typeof managedAccountSchema>;
export type ManagedAccountPage = z.infer<typeof managedAccountPageSchema>;
```

Add `toAccountListQueryInput` using the repository's duplicate-preserving loop:

```ts
export function toAccountListQueryInput(searchParams: URLSearchParams) {
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

Add a strict internal aggregate schema whose account rows contain only `_id`, `email`, `displayName`, `role`, `status`, `createdAt`, `lastLoginAt`, and `updatedAt`, plus `metadata: [{ totalItems }]` with at most one metadata row. `parseManagedAccountPage(input, query)` must map dates through `toISOString()`, derive `totalPages` as `Math.ceil(totalItems / 20)`, and parse the final value with `managedAccountPageSchema`.

- [ ] **Step 4: Run contract tests and TypeScript**

Run:

```powershell
npm.cmd test -- src/lib/admin/account-contract.test.ts
npm.cmd exec -- tsc --noEmit --incremental false
```

Expected: all contract tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit the strict contracts**

```powershell
git add web/src/lib/admin/account-contract.ts web/src/lib/admin/account-contract.test.ts
git commit -m "feat(admin): define safe account management contracts"
```

### Task 3: Account access, safe errors, and bounded body reader

**Files:**
- Create: `web/src/lib/admin/account-access.test.ts`
- Create: `web/src/lib/admin/account-access.ts`
- Create: `web/src/lib/admin/account-errors.test.ts`
- Create: `web/src/lib/admin/account-errors.ts`
- Create: `web/src/lib/admin/account-request-body.test.ts`
- Create: `web/src/lib/admin/account-request-body.ts`

**Interfaces:**
- Consumes: existing `PublicUser`, `AuthError`, and authentication response contract.
- Produces: `requireAccountAdministrator(user)`, `AccountManagementError`, `invalidAccountManagementResponse()`, `accountManagementErrorResponse(error)`, `readAccountRequestBody(request)`, `AccountBodyTooLarge`, and `InvalidAccountBodyEncoding`.

- [ ] **Step 1: Write failing permission and safe-error tests**

Create `web/src/lib/admin/account-access.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { PublicUser } from "@/lib/auth/public-user";
import { AccountManagementError } from "./account-errors";
import { requireAccountAdministrator } from "./account-access";

const administrator = {
  id: "64b64c6f2f4d9f1a2b3c4d51",
  email: "admin@example.test",
  role: "administrator",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Administrator",
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

describe("administrator account access", () => {
  it("allows only an active administrator", () => {
    expect(() => requireAccountAdministrator(administrator)).not.toThrow();
  });

  it.each([
    ["student", "active"],
    ["staff", "active"],
    ["administrator", "suspended"],
    ["administrator", "deactivated"],
  ] as const)("rejects %s/%s", (role, status) => {
    expect(() =>
      requireAccountAdministrator({ ...administrator, role, status }),
    ).toThrow(new AccountManagementError("ADMINISTRATOR_REQUIRED"));
  });
});
```

Create `web/src/lib/admin/account-errors.test.ts` to assert exact status/code/message for all six definitions, preservation of only `AUTHENTICATION_REQUIRED`, a generic `ACCOUNT_OPERATION_FAILED` response for `Error("PRIVATE DATABASE")`, and absence of `PRIVATE`, `stack`, `mongodb`, and rejected values in serialised responses.

- [ ] **Step 2: Write failing bounded-body tests**

Create `web/src/lib/admin/account-request-body.test.ts` using the established request-stream fixtures from `src/lib/claims/request-body.test.ts`. Cover:

```ts
it("reads bounded UTF-8 JSON", async () => {
  const body = JSON.stringify({ status: "suspended" });
  await expect(
    readAccountRequestBody(new Request("http://localhost", { method: "PATCH", body })),
  ).resolves.toBe(body);
});

it("rejects an oversized declared Content-Length", async () => {
  const request = new Request("http://localhost", {
    method: "PATCH",
    headers: { "content-length": String(ACCOUNT_REQUEST_BODY_LIMIT + 1) },
    body: "{}",
  });
  await expect(readAccountRequestBody(request)).rejects.toBeInstanceOf(
    AccountBodyTooLarge,
  );
});
```

Also copy the existing chunked-overflow, fatal UTF-8 decoder, failed stream, cancellation, and empty-body cases, substituting the account error classes and an `8 * 1024` limit.

- [ ] **Step 3: Run all Task 3 tests to verify the red state**

Run:

```powershell
npm.cmd test -- src/lib/admin/account-access.test.ts src/lib/admin/account-errors.test.ts src/lib/admin/account-request-body.test.ts
```

Expected: FAIL because the three implementation modules do not exist.

- [ ] **Step 4: Implement the closed error and access boundary**

Create `web/src/lib/admin/account-errors.ts`:

```ts
import { AuthError, authErrorResponse } from "@/lib/auth/errors";

const definitions = {
  ADMINISTRATOR_REQUIRED: { status: 403, message: "Administrator access required" },
  ACCOUNT_ACTION_FORBIDDEN: { status: 403, message: "Account action is not permitted" },
  ACCOUNT_NOT_FOUND: { status: 404, message: "Account not found" },
  ACCOUNT_STATE_CONFLICT: {
    status: 409,
    message: "Account state has changed or cannot be updated",
  },
  ACCOUNT_OPERATION_FAILED: {
    status: 500,
    message: "Account operation could not be completed",
  },
} as const;

export type AccountManagementErrorCode = keyof typeof definitions;

export class AccountManagementError extends Error {
  readonly code: AccountManagementErrorCode;
  readonly status: number;

  constructor(code: AccountManagementErrorCode) {
    const definition = definitions[code];
    super(definition.message);
    this.name = "AccountManagementError";
    this.code = code;
    this.status = definition.status;
  }
}

export function invalidAccountManagementResponse() {
  return Response.json(
    { error: { code: "VALIDATION_ERROR", message: "Request is invalid" } },
    { status: 400 },
  );
}

export function accountManagementErrorResponse(error: unknown) {
  if (error instanceof AuthError && error.code === "AUTHENTICATION_REQUIRED") {
    return authErrorResponse(new AuthError("AUTHENTICATION_REQUIRED"));
  }
  const code = error instanceof AccountManagementError ? error.code : undefined;
  const safe =
    code !== undefined && Object.hasOwn(definitions, code)
      ? new AccountManagementError(code)
      : new AccountManagementError("ACCOUNT_OPERATION_FAILED");
  return Response.json(
    { error: { code: safe.code, message: safe.message } },
    { status: safe.status },
  );
}
```

Create `web/src/lib/admin/account-access.ts`:

```ts
import type { PublicUser } from "@/lib/auth/public-user";
import { AccountManagementError } from "./account-errors";

export function requireAccountAdministrator(user: PublicUser) {
  if (user.role !== "administrator" || user.status !== "active") {
    throw new AccountManagementError("ADMINISTRATOR_REQUIRED");
  }
}
```

- [ ] **Step 5: Implement the bounded body reader**

Create `web/src/lib/admin/account-request-body.ts` by adapting the tested stream reader in `src/lib/notifications/request-body.ts` with:

```ts
export const ACCOUNT_REQUEST_BODY_LIMIT = 8 * 1024;

export class AccountBodyTooLarge extends Error {
  constructor() {
    super("Account request body exceeds the size limit");
    this.name = "AccountBodyTooLarge";
  }
}

export class InvalidAccountBodyEncoding extends Error {
  constructor() {
    super("Account request body is not valid UTF-8");
    this.name = "InvalidAccountBodyEncoding";
  }
}
```

The reader must cancel an already oversized body, count streamed bytes, use `new TextDecoder("utf-8", { fatal: true })`, cancel on any read/decode/overflow failure, release the reader lock, and preserve the original error classification.

- [ ] **Step 6: Run Task 3 tests and TypeScript**

Run:

```powershell
npm.cmd test -- src/lib/admin/account-access.test.ts src/lib/admin/account-errors.test.ts src/lib/admin/account-request-body.test.ts
npm.cmd exec -- tsc --noEmit --incremental false
```

Expected: all access, response-redaction, overflow, encoding, cancellation, and stream-failure tests PASS; TypeScript exits 0.

- [ ] **Step 7: Commit the transport safety boundary**

```powershell
git add web/src/lib/admin/account-access.ts web/src/lib/admin/account-access.test.ts web/src/lib/admin/account-errors.ts web/src/lib/admin/account-errors.test.ts web/src/lib/admin/account-request-body.ts web/src/lib/admin/account-request-body.test.ts
git commit -m "feat(admin): add safe account management boundary"
```

### Task 4: Bounded administrator account-list service

**Files:**
- Create: `web/src/lib/admin/account-list-service.test.ts`
- Create: `web/src/lib/admin/account-list-service.ts`

**Interfaces:**
- Consumes: `requireAccountAdministrator`, `AccountListQuery`, `parseManagedAccountPage`, `connectToDatabase`, and `UserModel.aggregate`.
- Produces: `listManagedAccounts(user: PublicUser, query: AccountListQuery): Promise<ManagedAccountPage>` and `escapeAccountSearch(value: string): string` for direct security testing.

- [ ] **Step 1: Write the failing list-service tests**

Create `web/src/lib/admin/account-list-service.test.ts`. Mock `@/lib/db` and `@/models/user`; provide `aggregate().exec()` as a controllable mock. Include these concrete assertions:

```ts
it("rejects non-administrators before connection and model access", async () => {
  await expect(
    listManagedAccounts({ ...administrator, role: "staff" }, { page: 1 }),
  ).rejects.toMatchObject({ code: "ADMINISTRATOR_REQUIRED" });
  expect(connectToDatabase).not.toHaveBeenCalled();
  expect(UserModel.aggregate).not.toHaveBeenCalled();
});

it("escapes every regular-expression metacharacter", () => {
  expect(escapeAccountSearch("a.*+?^${}()|[]\\b")).toBe(
    "a\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\b",
  );
});

it("enforces role/status/search/page in one bounded aggregate", async () => {
  aggregateExec.mockResolvedValue([{ accounts: [], metadata: [] }]);
  await listManagedAccounts(administrator, {
    q: "student.*",
    role: "student",
    status: "suspended",
    page: 2,
  });
  const pipeline = vi.mocked(UserModel.aggregate).mock.calls[0][0];
  expect(pipeline).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        $match: expect.objectContaining({
          role: { $in: ["student", "staff"] },
          status: "suspended",
        }),
      }),
      expect.objectContaining({ $lookup: expect.any(Object) }),
      expect.objectContaining({ $unwind: "$profile" }),
      expect.objectContaining({
        $facet: expect.objectContaining({
          accounts: expect.arrayContaining([
            { $sort: { createdAt: -1, _id: -1 } },
            { $skip: 20 },
            { $limit: 20 },
          ]),
          metadata: [{ $count: "totalItems" }],
        }),
      }),
    ]),
  );
  expect(JSON.stringify(pipeline)).not.toContain("student.*");
  expect(JSON.stringify(pipeline)).toContain("student\\\\.\\\\*");
});
```

Also test role-only, status-only, no-search, email/display-name `$or`, exact projection keys, stable sort, page 500 skip 9,980, aggregate-to-public mapping, empty pages, malformed aggregate output, and conversion of raw database errors to `ACCOUNT_OPERATION_FAILED`.

- [ ] **Step 2: Run the list-service test to verify the red state**

Run:

```powershell
npm.cmd test -- src/lib/admin/account-list-service.test.ts
```

Expected: FAIL because `./account-list-service` does not exist.

- [ ] **Step 3: Implement the bounded aggregate service**

Create `web/src/lib/admin/account-list-service.ts`:

```ts
import type { PipelineStage } from "mongoose";

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { UserModel } from "@/models/user";
import { requireAccountAdministrator } from "./account-access";
import {
  ADMIN_ACCOUNT_PAGE_SIZE,
  MANAGEABLE_ACCOUNT_ROLES,
  parseManagedAccountPage,
  type AccountListQuery,
  type ManagedAccountPage,
} from "./account-contract";
import { AccountManagementError } from "./account-errors";

export function escapeAccountSearch(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function listManagedAccounts(
  user: PublicUser,
  query: AccountListQuery,
): Promise<ManagedAccountPage> {
  requireAccountAdministrator(user);
  try {
    await connectToDatabase();
    const initialMatch = {
      role: {
        $in: query.role ? [query.role] : [...MANAGEABLE_ACCOUNT_ROLES],
      },
      ...(query.status ? { status: query.status } : {}),
    };
    const search = query.q ? escapeAccountSearch(query.q) : undefined;
    const pipeline: PipelineStage[] = [
      { $match: initialMatch },
      {
        $lookup: {
          from: "profiles",
          localField: "_id",
          foreignField: "userId",
          as: "profile",
        },
      },
      { $unwind: "$profile" },
      ...(search
        ? [
            {
              $match: {
                $or: [
                  { email: { $regex: search, $options: "i" } },
                  { "profile.displayName": { $regex: search, $options: "i" } },
                ],
              },
            } as PipelineStage,
          ]
        : []),
      {
        $facet: {
          accounts: [
            { $sort: { createdAt: -1, _id: -1 } },
            { $skip: (query.page - 1) * ADMIN_ACCOUNT_PAGE_SIZE },
            { $limit: ADMIN_ACCOUNT_PAGE_SIZE },
            {
              $project: {
                _id: 1,
                email: 1,
                displayName: "$profile.displayName",
                role: 1,
                status: 1,
                createdAt: 1,
                lastLoginAt: 1,
                updatedAt: 1,
              },
            },
          ],
          metadata: [{ $count: "totalItems" }],
        },
      },
    ];
    return parseManagedAccountPage(
      await UserModel.aggregate(pipeline).exec(),
      query,
    );
  } catch (error) {
    if (error instanceof AccountManagementError) throw error;
    throw new AccountManagementError("ACCOUNT_OPERATION_FAILED");
  }
}
```

Keep the mandatory role `$in` boundary even when a role filter is supplied by expressing the supplied role as a validated member of `MANAGEABLE_ACCOUNT_ROLES`; no pipeline stage may accept a client-provided field name or operator.

- [ ] **Step 4: Run list-service and contract tests**

Run:

```powershell
npm.cmd test -- src/lib/admin/account-list-service.test.ts src/lib/admin/account-contract.test.ts src/lib/admin/account-access.test.ts
npm.cmd exec -- tsc --noEmit --incremental false
```

Expected: all focused tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit the account-list service**

```powershell
git add web/src/lib/admin/account-list-service.ts web/src/lib/admin/account-list-service.test.ts
git commit -m "feat(admin): list manageable accounts safely"
```

### Task 5: Atomic account-status transition service

**Files:**
- Create: `web/src/lib/admin/account-status-service.test.ts`
- Create: `web/src/lib/admin/account-status-service.ts`

**Interfaces:**
- Consumes: `requireAccountAdministrator`, `AccountStatusInput`, `ManagedAccount`, `connectToDatabase`, User/Profile/Session models, and Task 1 audit model.
- Produces: `updateManagedAccountStatus(administrator: PublicUser, targetUserId: string, input: AccountStatusInput): Promise<ManagedAccount>` and `accountTransitionIsAllowed(previousStatus, nextStatus, reason): boolean`.

- [ ] **Step 1: Write the failing transition and transaction tests**

Create `web/src/lib/admin/account-status-service.test.ts` with mocked `connectToDatabase`, `UserModel`, `ProfileModel`, `SessionModel`, and `AccountAdministrationEventModel`. Use a mock session whose `withTransaction` executes its callback and whose `endSession` is observable.

Cover the exact transition matrix:

```ts
it.each([
  ["active", "suspended", "security_concern", true],
  ["active", "suspended", "policy_violation", true],
  ["active", "suspended", "administrative_review", true],
  ["suspended", "active", "account_restored", true],
  ["active", "deactivated", "account_closed", true],
  ["suspended", "deactivated", "account_closed", true],
  ["active", "active", "account_restored", false],
  ["suspended", "suspended", "security_concern", false],
  ["deactivated", "active", "account_restored", false],
  ["active", "suspended", "account_closed", false],
])("checks %s -> %s with %s", (previous, next, reason, expected) => {
  expect(accountTransitionIsAllowed(previous, next, reason)).toBe(expected);
});
```

Add a successful transaction assertion:

```ts
it("updates, revokes sessions and audits in one transaction", async () => {
  const result = await updateManagedAccountStatus(
    administrator,
    targetUserId,
    {
      status: "suspended",
      expectedUpdatedAt: previousUpdatedAt,
      reason: "security_concern",
    },
  );
  expect(UserModel.findOneAndUpdate).toHaveBeenCalledWith(
    {
      _id: targetUserId,
      role: { $in: ["student", "staff"] },
      status: "active",
      updatedAt: new Date(previousUpdatedAt),
    },
    { $set: { status: "suspended" } },
    expect.objectContaining({ new: true, runValidators: true, session }),
  );
  expect(SessionModel.deleteMany).toHaveBeenCalledWith(
    { userId: targetUserId },
    { session },
  );
  expect(AccountAdministrationEventModel.create).toHaveBeenCalledWith(
    [
      expect.objectContaining({
        actorAdministratorId: administrator.id,
        targetUserId,
        previousStatus: "active",
        newStatus: "suspended",
        reason: "security_concern",
      }),
    ],
    { session },
  );
  expect(result).toMatchObject({ id: targetUserId, status: "suspended" });
  expect(session.endSession).toHaveBeenCalledOnce();
});
```

Also assert:

- the public guard rejects before connection;
- the actor is reloaded inside the session with active administrator filters;
- self-target is `ACCOUNT_ACTION_FORBIDDEN` before target mutation;
- another administrator is `ACCOUNT_ACTION_FORBIDDEN`;
- missing manageable User is `ACCOUNT_NOT_FOUND`;
- terminal, same-state, incompatible-reason, and unsupported transitions are `ACCOUNT_STATE_CONFLICT`;
- mismatched `expectedUpdatedAt` is `ACCOUNT_STATE_CONFLICT`;
- a conditional update returning `null` is `ACCOUNT_STATE_CONFLICT`;
- reactivation calls `SessionModel.deleteMany` exactly once;
- missing Profile aborts with safe `ACCOUNT_OPERATION_FAILED`;
- update, deleteMany, audit create, Profile read, callback, and end-session failures never expose their raw messages;
- transaction options are not invented; the existing Mongoose defaults are used;
- every query and write inside the callback receives the same session.

- [ ] **Step 2: Run the status-service test to verify the red state**

Run:

```powershell
npm.cmd test -- src/lib/admin/account-status-service.test.ts
```

Expected: FAIL because `./account-status-service` does not exist.

- [ ] **Step 3: Implement explicit transition compatibility**

Create `web/src/lib/admin/account-status-service.ts` and export:

```ts
export function accountTransitionIsAllowed(
  previousStatus: string,
  nextStatus: string,
  reason: string,
) {
  if (previousStatus === "active" && nextStatus === "suspended") {
    return [
      "security_concern",
      "policy_violation",
      "administrative_review",
    ].includes(reason);
  }
  if (previousStatus === "suspended" && nextStatus === "active") {
    return reason === "account_restored";
  }
  return (
    (previousStatus === "active" || previousStatus === "suspended") &&
    nextStatus === "deactivated" &&
    reason === "account_closed"
  );
}
```

- [ ] **Step 4: Implement the transaction-owned status update**

Implement `updateManagedAccountStatus` in this order:

```ts
export async function updateManagedAccountStatus(
  administrator: PublicUser,
  targetUserId: string,
  input: AccountStatusInput,
): Promise<ManagedAccount> {
  requireAccountAdministrator(administrator);
  if (administrator.id === targetUserId) {
    throw new AccountManagementError("ACCOUNT_ACTION_FORBIDDEN");
  }

  const database = await connectToDatabase();
  const session = await database.startSession();
  let result: ManagedAccount | undefined;

  try {
    await session.withTransaction(async () => {
      const actor = await UserModel.findOne({
        _id: administrator.id,
        role: "administrator",
        status: "active",
      })
        .session(session)
        .lean()
        .exec();
      if (!actor) {
        throw new AccountManagementError("ADMINISTRATOR_REQUIRED");
      }

      const current = await UserModel.findById(targetUserId)
        .select({ _id: 1, role: 1, status: 1, updatedAt: 1 })
        .session(session)
        .lean()
        .exec();
      if (!current) throw new AccountManagementError("ACCOUNT_NOT_FOUND");
      if (current.role === "administrator") {
        throw new AccountManagementError("ACCOUNT_ACTION_FORBIDDEN");
      }
      if (current.role !== "student" && current.role !== "staff") {
        throw new AccountManagementError("ACCOUNT_NOT_FOUND");
      }
      if (
        current.updatedAt.toISOString() !== input.expectedUpdatedAt ||
        !accountTransitionIsAllowed(current.status, input.status, input.reason)
      ) {
        throw new AccountManagementError("ACCOUNT_STATE_CONFLICT");
      }

      const updated = await UserModel.findOneAndUpdate(
        {
          _id: targetUserId,
          role: { $in: ["student", "staff"] },
          status: current.status,
          updatedAt: new Date(input.expectedUpdatedAt),
        },
        { $set: { status: input.status } },
        { new: true, runValidators: true, session },
      )
        .select({
          _id: 1,
          email: 1,
          role: 1,
          status: 1,
          createdAt: 1,
          lastLoginAt: 1,
          updatedAt: 1,
        })
        .lean()
        .exec();
      if (!updated) {
        throw new AccountManagementError("ACCOUNT_STATE_CONFLICT");
      }

      await SessionModel.deleteMany(
        { userId: targetUserId },
        { session },
      );
      await AccountAdministrationEventModel.create(
        [
          {
            actorAdministratorId: administrator.id,
            targetUserId,
            previousStatus: current.status,
            newStatus: input.status,
            reason: input.reason,
          },
        ],
        { session },
      );
      const profile = await ProfileModel.findOne(
        { userId: targetUserId },
        { _id: 0, displayName: 1 },
      )
        .session(session)
        .lean()
        .exec();
      if (!profile) throw new Error("Managed account profile is incomplete");
      result = toManagedAccount(updated, profile);
    });
  } catch (error) {
    if (error instanceof AccountManagementError) throw error;
    throw new AccountManagementError("ACCOUNT_OPERATION_FAILED");
  } finally {
    try {
      await session.endSession();
    } catch {
      if (result) throw new AccountManagementError("ACCOUNT_OPERATION_FAILED");
    }
  }

  if (!result) throw new AccountManagementError("ACCOUNT_OPERATION_FAILED");
  return result;
}
```

Export `toManagedAccount` from `account-contract.ts` or implement an equivalent strict mapper there so both aggregate and transaction records pass through `managedAccountSchema`. Do not return a Mongoose document.

- [ ] **Step 5: Run status, model, contract, and TypeScript checks**

Run:

```powershell
npm.cmd test -- src/lib/admin/account-status-service.test.ts src/models/account-administration-event.test.ts src/lib/admin/account-contract.test.ts src/lib/admin/account-access.test.ts src/lib/admin/account-errors.test.ts
npm.cmd exec -- tsc --noEmit --incremental false
```

Expected: every transition, target boundary, session revocation, audit insert, rollback, safe-error, and type test PASS.

- [ ] **Step 6: Commit the atomic status service**

```powershell
git add web/src/lib/admin/account-status-service.ts web/src/lib/admin/account-status-service.test.ts web/src/lib/admin/account-contract.ts web/src/lib/admin/account-contract.test.ts
git commit -m "feat(admin): update account status transactionally"
```

### Task 6: Authenticated administrator account-list route

**Files:**
- Create: `web/src/app/api/admin/accounts/admin-account-list-route.test.ts`
- Create: `web/src/app/api/admin/accounts/route.ts`

**Interfaces:**
- Consumes: current-user helpers, `requireAccountAdministrator`, list validation/errors, and `listManagedAccounts`.
- Produces: `GET /api/admin/accounts` with strict query handling and `Cache-Control: no-store`.

- [ ] **Step 1: Write failing route tests**

Create `web/src/app/api/admin/accounts/admin-account-list-route.test.ts`. Mock cookie/current-user/list-service modules and assert:

```ts
it("authenticates and authorises before query validation", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  const response = await GET(
    new Request("http://localhost/api/admin/accounts?page=0&owner=private"),
  );
  expect(response.status).toBe(401);
  expect(requireAccountAdministrator).not.toHaveBeenCalled();
  expect(listManagedAccounts).not.toHaveBeenCalled();
});

it("returns a strict no-store account page", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(administrator);
  vi.mocked(listManagedAccounts).mockResolvedValue(page);
  const response = await GET(
    new Request(
      "http://localhost/api/admin/accounts?q=Student&role=student&status=active&page=2",
    ),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(listManagedAccounts).toHaveBeenCalledWith(administrator, {
    q: "Student",
    role: "student",
    status: "active",
    page: 2,
  });
  await expect(response.json()).resolves.toEqual(page);
});
```

Also test each invalid query from Task 2, every denied role/status, rejected URL parsing, service not-found/conflict/error sanitisation, exact `VALIDATION_ERROR`, and absence of `passwordHash`, `tokenHash`, `emailVerifiedAt`, Profile preferences, stack and raw failure text.

- [ ] **Step 2: Run the route test to verify the red state**

Run:

```powershell
npm.cmd test -- src/app/api/admin/accounts/admin-account-list-route.test.ts
```

Expected: FAIL because the accounts route does not exist.

- [ ] **Step 3: Implement the authenticated list route**

Create `web/src/app/api/admin/accounts/route.ts`:

```ts
import { requireAccountAdministrator } from "@/lib/admin/account-access";
import {
  accountListQuerySchema,
  toAccountListQueryInput,
} from "@/lib/admin/account-contract";
import {
  accountManagementErrorResponse,
  invalidAccountManagementResponse,
} from "@/lib/admin/account-errors";
import { listManagedAccounts } from "@/lib/admin/account-list-service";
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function requireCurrentAdministrator(): Promise<PublicUser> {
  const user = await getCurrentUser(await readSessionCookie());
  if (!user) throw new AuthError("AUTHENTICATION_REQUIRED");
  requireAccountAdministrator(user);
  return user;
}

export async function GET(request: Request) {
  let administrator: PublicUser;
  try {
    administrator = await requireCurrentAdministrator();
  } catch (error) {
    return noStore(accountManagementErrorResponse(error));
  }

  let parsed;
  try {
    parsed = accountListQuerySchema.safeParse(
      toAccountListQueryInput(new URL(request.url).searchParams),
    );
  } catch (error) {
    return noStore(accountManagementErrorResponse(error));
  }
  if (!parsed.success) return noStore(invalidAccountManagementResponse());

  try {
    return Response.json(
      await listManagedAccounts(administrator, parsed.data),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return noStore(accountManagementErrorResponse(error));
  }
}
```

- [ ] **Step 4: Run route, list service, and TypeScript checks**

Run:

```powershell
npm.cmd test -- src/app/api/admin/accounts/admin-account-list-route.test.ts src/lib/admin/account-list-service.test.ts src/lib/admin/account-contract.test.ts src/lib/admin/account-errors.test.ts
npm.cmd exec -- tsc --noEmit --incremental false
```

Expected: all tests PASS, validation never precedes authentication/authorisation, every response is no-store, and TypeScript exits 0.

- [ ] **Step 5: Commit the list API**

```powershell
git add web/src/app/api/admin/accounts/route.ts web/src/app/api/admin/accounts/admin-account-list-route.test.ts
git commit -m "feat(admin): expose account list API"
```

### Task 7: Authenticated administrator account-status route

**Files:**
- Create: `web/src/app/api/admin/accounts/[userId]/status/admin-account-status-route.test.ts`
- Create: `web/src/app/api/admin/accounts/[userId]/status/route.ts`

**Interfaces:**
- Consumes: current-user helpers, access guard, strict user-ID/body contracts, bounded body reader, safe errors, and `updateManagedAccountStatus`.
- Produces: `PATCH /api/admin/accounts/{userId}/status` with strict JSON transport and `Cache-Control: no-store`.

- [ ] **Step 1: Write failing status-route tests**

Create `web/src/app/api/admin/accounts/[userId]/status/admin-account-status-route.test.ts`. Mock authentication, access, and service dependencies. Include:

```ts
const targetUserId = "64b64c6f2f4d9f1a2b3c4d52";
const validBody = {
  status: "suspended",
  expectedUpdatedAt: "2026-08-27T01:00:00.000Z",
  reason: "security_concern",
};
const context = (userId: string) => ({ params: Promise.resolve({ userId }) });

it("authenticates and authorises before path or body validation", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  const response = await PATCH(
    new Request("http://localhost/api/admin/accounts/private/status", {
      method: "PATCH",
      body: "PRIVATE INVALID BODY",
    }),
    context("private"),
  );
  expect(response.status).toBe(401);
  expect(readAccountRequestBody).not.toHaveBeenCalled();
  expect(updateManagedAccountStatus).not.toHaveBeenCalled();
});

it("updates one account through the strict no-store route", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(administrator);
  vi.mocked(readAccountRequestBody).mockResolvedValue(JSON.stringify(validBody));
  vi.mocked(updateManagedAccountStatus).mockResolvedValue(updatedAccount);
  const response = await PATCH(
    new Request(`http://localhost/api/admin/accounts/${targetUserId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(validBody),
    }),
    context(targetUserId),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(updateManagedAccountStatus).toHaveBeenCalledWith(
    administrator,
    targetUserId,
    validBody,
  );
  await expect(response.json()).resolves.toEqual({ account: updatedAccount });
});
```

Also test invalid lowercase/canonical ObjectId, rejected params promise, missing/incorrect content type, empty body, malformed JSON, oversized declared body, chunked overflow, invalid UTF-8, unknown body key, invalid status/reason/timestamp, self/administrator target error, missing target, conflict, generic service failure, exact safe envelopes, and no-store on every success/error response.

- [ ] **Step 2: Run the status-route test to verify the red state**

Run:

```powershell
npm.cmd test -- src/app/api/admin/accounts/[userId]/status/admin-account-status-route.test.ts
```

Expected: FAIL because the status route does not exist.

- [ ] **Step 3: Implement the authenticated strict PATCH route**

Create `web/src/app/api/admin/accounts/[userId]/status/route.ts`:

```ts
import { requireAccountAdministrator } from "@/lib/admin/account-access";
import {
  accountStatusInputSchema,
  accountUserIdSchema,
} from "@/lib/admin/account-contract";
import {
  accountManagementErrorResponse,
  invalidAccountManagementResponse,
} from "@/lib/admin/account-errors";
import {
  AccountBodyTooLarge,
  InvalidAccountBodyEncoding,
  readAccountRequestBody,
} from "@/lib/admin/account-request-body";
import { updateManagedAccountStatus } from "@/lib/admin/account-status-service";
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";

type Context = { params: Promise<{ userId: string }> };

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function isJsonContentType(request: Request) {
  const value = request.headers.get("content-type");
  return value !== null && /^application\/json(?:\s*;|$)/i.test(value);
}

async function requireCurrentAdministrator(): Promise<PublicUser> {
  const user = await getCurrentUser(await readSessionCookie());
  if (!user) throw new AuthError("AUTHENTICATION_REQUIRED");
  requireAccountAdministrator(user);
  return user;
}

export async function PATCH(request: Request, context: Context) {
  let administrator: PublicUser;
  try {
    administrator = await requireCurrentAdministrator();
  } catch (error) {
    return noStore(accountManagementErrorResponse(error));
  }

  let rawUserId: string;
  try {
    rawUserId = (await context.params).userId;
  } catch (error) {
    return noStore(accountManagementErrorResponse(error));
  }
  const parsedId = accountUserIdSchema.safeParse(rawUserId);
  if (!parsedId.success || !isJsonContentType(request)) {
    return noStore(invalidAccountManagementResponse());
  }

  let text: string;
  try {
    text = await readAccountRequestBody(request);
  } catch (error) {
    return noStore(
      error instanceof AccountBodyTooLarge ||
        error instanceof InvalidAccountBodyEncoding
        ? invalidAccountManagementResponse()
        : accountManagementErrorResponse(error),
    );
  }
  if (text.trim() === "") return noStore(invalidAccountManagementResponse());

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (error) {
    return noStore(
      error instanceof SyntaxError
        ? invalidAccountManagementResponse()
        : accountManagementErrorResponse(error),
    );
  }
  const parsedBody = accountStatusInputSchema.safeParse(body);
  if (!parsedBody.success) return noStore(invalidAccountManagementResponse());

  try {
    return Response.json(
      {
        account: await updateManagedAccountStatus(
          administrator,
          parsedId.data,
          parsedBody.data,
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return noStore(accountManagementErrorResponse(error));
  }
}
```

- [ ] **Step 4: Run status route/service, all administrator regressions, and TypeScript**

Run:

```powershell
npm.cmd test -- src/app/api/admin/accounts/[userId]/status/admin-account-status-route.test.ts src/lib/admin/account-status-service.test.ts src/lib/admin/account-request-body.test.ts src/app/api/admin/overview/admin-overview-route.test.ts src/lib/admin/overview-service.test.ts
npm.cmd exec -- tsc --noEmit --incremental false
```

Expected: all focused and pre-existing administrator tests PASS; TypeScript exits 0.

- [ ] **Step 5: Commit the status API**

```powershell
git add web/src/app/api/admin/accounts/[userId]/status/route.ts web/src/app/api/admin/accounts/[userId]/status/admin-account-status-route.test.ts
git commit -m "feat(admin): expose account status API"
```

### Task 8: Full regression, privacy verification, and evidence

**Files:**
- Create: `docs/superpowers/verification/2026-08-27-administrator-account-management-backend.md`

**Interfaces:**
- Consumes: the complete implementation and repository quality commands.
- Produces: auditable Issue #39 verification evidence with no credentials or private account data.

- [ ] **Step 1: Run the complete focused account-management slice**

Run from `web/`:

```powershell
npm.cmd test -- src/models/account-administration-event.test.ts src/lib/admin/account-contract.test.ts src/lib/admin/account-access.test.ts src/lib/admin/account-errors.test.ts src/lib/admin/account-request-body.test.ts src/lib/admin/account-list-service.test.ts src/lib/admin/account-status-service.test.ts src/app/api/admin/accounts/admin-account-list-route.test.ts src/app/api/admin/accounts/[userId]/status/admin-account-status-route.test.ts src/lib/admin/overview-contract.test.ts src/lib/admin/overview-service.test.ts src/app/api/admin/overview/admin-overview-route.test.ts src/lib/auth/current-user.test.ts src/models/session.test.ts
```

Expected: every new account-management test and every listed authentication/administrator/session regression file PASS.

- [ ] **Step 2: Run the full repository gates**

Run from `web/` in this order:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd exec -- tsc --noEmit --incremental false
npm.cmd run build
npm.cmd audit
```

Expected: full tests PASS, lint exits 0, TypeScript exits 0, production build includes `/api/admin/accounts` and `/api/admin/accounts/[userId]/status`, and audit reports `found 0 vulnerabilities`.

- [ ] **Step 3: Run repository, scope, credential, and privacy checks**

Run from the repository root:

```powershell
git diff --check
git status --short --branch
git diff --name-only develop...HEAD
rg -n "passwordHash|tokenHash|emailVerifiedAt|notificationSettings|preferredContactMethod|preferredCampusLocationIds|PRIVATE|stack" web/src/lib/admin/account-* web/src/app/api/admin/accounts web/src/models/account-administration-event*
git check-ignore web/.env.local
```

Expected:

- `git diff --check` produces no output.
- The branch diff contains only the approved spec, plan, account-management implementation/tests, audit model/tests, and verification document.
- Any private-field names found by `rg` occur only in explicit absence/redaction tests; none occurs in a public schema or success mapper.
- `git check-ignore` prints `web/.env.local` when the local file exists.
- No command reads or displays `.env.local`.

- [ ] **Step 4: Record exact verification evidence**

Create `docs/superpowers/verification/2026-08-27-administrator-account-management-backend.md`:

```md
# Administrator Account Management Backend Verification

**Date:** 2026-08-27

**Branch:** `feature/issue-39-administrator-account-management-backend`

## Implemented scope

- Added an immutable account-administration audit model.
- Added active-administrator-only student/staff account discovery.
- Added strict search, role/status filters, and bounded pagination.
- Added optimistic, transition-controlled account status updates.
- Revoked all target sessions and recorded audit evidence atomically.
- Added authenticated no-store list and status API routes.

## Automated verification

- Focused account-management and administrator regression suite: passed.
- Full `npm test`: passed.
- `npm run lint`: passed.
- `npm exec -- tsc --noEmit --incremental false`: passed.
- `npm run build`: passed; both account-management API routes were generated.
- `npm audit`: passed with zero vulnerabilities.
- `git diff --check`: passed.

## Security and privacy verification

- Only active administrators reached account-management service work.
- List queries retained a mandatory student/staff role boundary.
- Self and administrator targets were rejected.
- Status/reason compatibility and `updatedAt` concurrency were enforced.
- User update, complete target-session revocation, and one audit insert shared one transaction.
- Reactivation also revoked prior sessions.
- Public responses omitted password hashes, token/session values, email-verification state, hidden Profile preferences, Mongoose internals, and raw errors.
- Search metacharacters were escaped and pagination was capped at page 500.
- Automated tests mocked database/model/session boundaries and did not connect to Atlas.
- `.env.local` remained ignored; no verification command read or displayed credentials.

## Deferred scope

The administrator account-management frontend, role management, identity edits, permanent deletion, bulk actions, audit browsing/export, notifications, report moderation, and category/location management remain outside Issue #39.
```

- [ ] **Step 5: Commit verification evidence**

Run from the repository root:

```powershell
git add docs/superpowers/verification/2026-08-27-administrator-account-management-backend.md
git commit -m "docs: record administrator account management verification"
git status --short --branch
```

Expected: the verification commit succeeds and the feature branch is clean with only its intended commits ahead of `develop`.
