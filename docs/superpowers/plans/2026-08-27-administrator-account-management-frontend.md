# Administrator Account Management Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure, accessible and responsive `/admin/accounts` workspace that consumes the existing Issue #39 account-management API.

**Architecture:** A browser-only Zod contract and HTTP client isolate untrusted API data from React. The existing administrator access boundary protects a dedicated route, while one account-management client owns explicit search/filter pagination, stale-request protection and confirmed status mutations. The `/admin` overview links into the workflow; no backend behaviour, model or dependency changes are required.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, CSS Modules, Vitest, Testing Library and ESLint.

## Global Constraints

- Work only on `feature/issue-41-administrator-account-management-frontend`, based on the current `develop` branch.
- Follow `docs/superpowers/specs/2026-08-27-administrator-account-management-frontend-design.md`.
- Reuse `AdministratorAccessBoundary`; only an active administrator may mount the account client.
- Consume only `GET /api/admin/accounts` and `PATCH /api/admin/accounts/{userId}/status`.
- Do not change account backend behaviour, database models, dependencies or environment configuration.
- Do not import `web/src/lib/admin/account-contract.ts` or a Mongoose model into a client component or browser module.
- Browser responses must pass strict browser-only Zod schemas before rendering.
- Display only `id`, `email`, `displayName`, `role`, `status`, `createdAt`, `lastLoginAt` and `updatedAt`.
- Never render password, token/session, email-verification, hidden Profile, Mongoose, audit or raw error data.
- Search requests occur only on explicit form submission; pagination is capped at page 500 and page size is exactly 20.
- Expose only active-to-suspended, active-to-deactivated, suspended-to-active and suspended-to-deactivated transitions.
- Every status mutation sends the exact displayed `updatedAt` value and requires an inline confirmation.
- Status changes state that all target sessions will be revoked; the API remains the authoritative transaction boundary.
- Keep account data only in React memory; do not use browser storage, polling or realtime transport.
- Preserve WCAG 2.2 AA basics, visible focus, polite status announcements, blocking alerts and 44-pixel controls.
- The workflow must remain usable without horizontal scrolling at 320 CSS pixels.
- Tests must mock fetch/session boundaries and must never connect to MongoDB Atlas.
- Use TDD, run the focused tests after each task and commit each independently testable deliverable.

---

### Task 1: Browser-safe account contract

**Files:**
- Create: `web/src/lib/admin/account-browser-contract.ts`
- Create: `web/src/lib/admin/account-browser-contract.test.ts`

**Interfaces:**
- Consumes: the public response shape documented by Issue #39; no server module import.
- Produces:
  - `ACCOUNT_BROWSER_ROLES`
  - `ACCOUNT_BROWSER_STATUSES`
  - `ACCOUNT_BROWSER_REASONS`
  - `ACCOUNT_BROWSER_PAGE_SIZE`
  - `accountBrowserSearchSchema`
  - `managedBrowserAccountSchema`
  - `managedBrowserAccountPageSchema`
  - `managedBrowserAccountResponseSchema`
  - `AccountBrowserQuery`
  - `AccountBrowserStatusInput`
  - `ManagedBrowserAccount`
  - `ManagedBrowserAccountPage`

- [ ] **Step 1: Write the failing contract tests**

Create `web/src/lib/admin/account-browser-contract.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  ACCOUNT_BROWSER_PAGE_SIZE,
  accountBrowserSearchSchema,
  managedBrowserAccountPageSchema,
  managedBrowserAccountResponseSchema,
} from "./account-browser-contract";

const accountFixture = {
  id: "64b64c5f2f8f9e0012345678",
  email: "student@example.test",
  displayName: "Alex Student",
  role: "student",
  status: "active",
  createdAt: "2026-08-01T00:00:00.000Z",
  lastLoginAt: "2026-08-26T02:00:00.000Z",
  updatedAt: "2026-08-27T01:00:00.000Z",
} as const;

const pageFixture = {
  accounts: [accountFixture],
  pagination: {
    page: 1,
    pageSize: ACCOUNT_BROWSER_PAGE_SIZE,
    totalItems: 1,
    totalPages: 1,
  },
} as const;

describe("account browser contract", () => {
  it("normalises a valid search", () => {
    expect(accountBrowserSearchSchema.parse("  Alex   Student ")).toBe(
      "Alex Student",
    );
  });

  it.each(["", "   ", "private\u0000query", "x".repeat(81)])(
    "rejects invalid search %j",
    (value) => {
      expect(accountBrowserSearchSchema.safeParse(value).success).toBe(false);
    },
  );

  it("accepts the exact public page and mutation response", () => {
    expect(managedBrowserAccountPageSchema.parse(pageFixture)).toEqual(pageFixture);
    expect(
      managedBrowserAccountResponseSchema.parse({ account: accountFixture }),
    ).toEqual({ account: accountFixture });
  });

  it.each([
    { ...accountFixture, passwordHash: "PRIVATE" },
    { ...accountFixture, tokenHash: "PRIVATE" },
    { ...accountFixture, emailVerifiedAt: null },
    { ...accountFixture, notificationSettings: {} },
    { ...accountFixture, role: "administrator" },
    { ...accountFixture, id: "not-an-object-id" },
    { ...accountFixture, updatedAt: "PRIVATE-DATE" },
  ])("rejects an unsafe account response %#", (account) => {
    expect(
      managedBrowserAccountPageSchema.safeParse({
        ...pageFixture,
        accounts: [account],
      }).success,
    ).toBe(false);
  });

  it("rejects extra page fields and inconsistent pagination", () => {
    expect(
      managedBrowserAccountPageSchema.safeParse({
        ...pageFixture,
        privateField: "PRIVATE",
      }).success,
    ).toBe(false);
    expect(
      managedBrowserAccountPageSchema.safeParse({
        ...pageFixture,
        pagination: { ...pageFixture.pagination, totalItems: 21, totalPages: 1 },
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run from `web/`:

```powershell
npm.cmd test -- src/lib/admin/account-browser-contract.test.ts
```

Expected: FAIL because `account-browser-contract.ts` does not exist.

- [ ] **Step 3: Implement the browser-only contract**

Create `web/src/lib/admin/account-browser-contract.ts`:

```ts
import { z } from "zod";

export const ACCOUNT_BROWSER_ROLES = ["student", "staff"] as const;
export const ACCOUNT_BROWSER_STATUSES = [
  "active",
  "suspended",
  "deactivated",
] as const;
export const ACCOUNT_BROWSER_REASONS = [
  "security_concern",
  "policy_violation",
  "administrative_review",
  "account_restored",
  "account_closed",
] as const;
export const ACCOUNT_BROWSER_PAGE_SIZE = 20;

const CONTROL_OR_FORMAT_PATTERN = /[\p{Cc}\p{Cf}]/u;

export const accountBrowserSearchSchema = z
  .string()
  .refine((value) => !CONTROL_OR_FORMAT_PATTERN.test(value))
  .transform((value) => value.normalize("NFKC").trim().replace(/\s+/gu, " "))
  .pipe(z.string().min(1).max(80));

export const managedBrowserAccountSchema = z.strictObject({
  id: z.string().regex(/^[a-f\d]{24}$/),
  email: z.string().email(),
  displayName: z.string().min(2).max(80),
  role: z.enum(ACCOUNT_BROWSER_ROLES),
  status: z.enum(ACCOUNT_BROWSER_STATUSES),
  createdAt: z.string().datetime({ offset: true }),
  lastLoginAt: z.string().datetime({ offset: true }).nullable(),
  updatedAt: z.string().datetime({ offset: true }),
});

export const managedBrowserAccountPageSchema = z
  .strictObject({
    accounts: z.array(managedBrowserAccountSchema).max(ACCOUNT_BROWSER_PAGE_SIZE),
    pagination: z.strictObject({
      page: z.number().int().min(1).max(500),
      pageSize: z.literal(ACCOUNT_BROWSER_PAGE_SIZE),
      totalItems: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      totalPages: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    }),
  })
  .superRefine(({ pagination }, context) => {
    if (
      pagination.totalPages !==
      Math.ceil(pagination.totalItems / ACCOUNT_BROWSER_PAGE_SIZE)
    ) {
      context.addIssue({
        code: "custom",
        path: ["pagination", "totalPages"],
        message: "Account pagination total is inconsistent",
      });
    }
  });

export const managedBrowserAccountResponseSchema = z.strictObject({
  account: managedBrowserAccountSchema,
});

export type AccountBrowserQuery = {
  q?: string;
  role?: (typeof ACCOUNT_BROWSER_ROLES)[number];
  status?: (typeof ACCOUNT_BROWSER_STATUSES)[number];
  page: number;
};
export type AccountBrowserStatusInput = {
  status: (typeof ACCOUNT_BROWSER_STATUSES)[number];
  expectedUpdatedAt: string;
  reason: (typeof ACCOUNT_BROWSER_REASONS)[number];
};
export type ManagedBrowserAccount = z.infer<typeof managedBrowserAccountSchema>;
export type ManagedBrowserAccountPage = z.infer<
  typeof managedBrowserAccountPageSchema
>;
```

- [ ] **Step 4: Run contract and server-contract regression tests**

```powershell
npm.cmd test -- src/lib/admin/account-browser-contract.test.ts src/lib/admin/account-contract.test.ts
```

Expected: 2 files PASS. Confirm no browser contract imports `mongoose`,
`@/models/user` or `@/models/account-administration-event`.

- [ ] **Step 5: Commit the browser contract**

```powershell
git add web/src/lib/admin/account-browser-contract.ts web/src/lib/admin/account-browser-contract.test.ts
git commit -m "feat(admin-ui): define safe account browser contract"
```

---

### Task 2: Strict account-management HTTP client

**Files:**
- Create: `web/src/lib/admin/account-browser-client.ts`
- Create: `web/src/lib/admin/account-browser-client.test.ts`
- Test: `web/src/lib/admin/account-browser-contract.test.ts`

**Interfaces:**
- Consumes: Task 1 schemas and `AccountBrowserQuery` / `AccountBrowserStatusInput`.
- Produces:
  - `BrowserAccountManagementError`
  - `listAdministratorAccounts(query, signal?)`
  - `updateAdministratorAccountStatus(userId, input, signal?)`

- [ ] **Step 1: Write failing list-client tests**

Create `web/src/lib/admin/account-browser-client.test.ts`. Keep the fixtures
local so importing this file never executes another test module:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { ACCOUNT_BROWSER_PAGE_SIZE } from "./account-browser-contract";
import {
  BrowserAccountManagementError,
  listAdministratorAccounts,
  updateAdministratorAccountStatus,
} from "./account-browser-client";

const accountFixture = {
  id: "64b64c5f2f8f9e0012345678",
  email: "student@example.test",
  displayName: "Alex Student",
  role: "student",
  status: "active",
  createdAt: "2026-08-01T00:00:00.000Z",
  lastLoginAt: "2026-08-26T02:00:00.000Z",
  updatedAt: "2026-08-27T01:00:00.000Z",
} as const;

const pageFixture = {
  accounts: [accountFixture],
  pagination: {
    page: 1,
    pageSize: ACCOUNT_BROWSER_PAGE_SIZE,
    totalItems: 1,
    totalPages: 1,
  },
} as const;

afterEach(() => vi.unstubAllGlobals());

describe("administrator account browser client", () => {
  it("lists accounts with an encoded exact no-store request", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(Response.json(pageFixture));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      listAdministratorAccounts(
        { q: "Alex Student", role: "student", status: "active", page: 2 },
        controller.signal,
      ),
    ).resolves.toEqual(pageFixture);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/accounts?q=Alex+Student&role=student&status=active&page=2",
      {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      },
    );
  });

  it("omits empty optional list filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(pageFixture));
    vi.stubGlobal("fetch", fetchMock);
    await listAdministratorAccounts({ page: 1 });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/accounts?page=1");
  });

  it.each([
    { ...pageFixture, privateField: "PRIVATE" },
    { ...pageFixture, accounts: [{ ...accountFixture, passwordHash: "PRIVATE" }] },
    {
      ...pageFixture,
      pagination: { ...pageFixture.pagination, totalItems: 21, totalPages: 1 },
    },
  ])("rejects unsafe list body %#", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    const error = await listAdministratorAccounts({ page: 1 }).catch(
      (reason) => reason,
    );
    expect(error).toMatchObject({
      code: "ACCOUNT_OPERATION_FAILED",
      message: "Account management is temporarily unavailable",
    });
    expect(error.message).not.toMatch(/PRIVATE|passwordHash|21/i);
  });
});
```

- [ ] **Step 2: Run the client test and verify it fails**

```powershell
npm.cmd test -- src/lib/admin/account-browser-client.test.ts
```

Expected: FAIL because the client module does not exist.

- [ ] **Step 3: Implement the safe error boundary and list request**

Create `web/src/lib/admin/account-browser-client.ts` with these exact
definitions:

```ts
import { z } from "zod";

import {
  managedBrowserAccountPageSchema,
  managedBrowserAccountResponseSchema,
  type AccountBrowserQuery,
  type AccountBrowserStatusInput,
} from "./account-browser-contract";

const GENERIC_MESSAGE = "Account management is temporarily unavailable";
const approvedErrors = {
  VALIDATION_ERROR: { status: 400, message: "Request is invalid" },
  AUTHENTICATION_REQUIRED: { status: 401, message: "Authentication required" },
  ADMINISTRATOR_REQUIRED: {
    status: 403,
    message: "Administrator access required",
  },
  ACCOUNT_ACTION_FORBIDDEN: {
    status: 403,
    message: "Account action is not permitted",
  },
  ACCOUNT_NOT_FOUND: { status: 404, message: "Account not found" },
  ACCOUNT_STATE_CONFLICT: {
    status: 409,
    message: "Account state has changed or cannot be updated",
  },
  ACCOUNT_OPERATION_FAILED: { status: 500, message: GENERIC_MESSAGE },
} as const;

export type BrowserAccountManagementErrorCode = keyof typeof approvedErrors;

const errorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum([
      "VALIDATION_ERROR",
      "AUTHENTICATION_REQUIRED",
      "ADMINISTRATOR_REQUIRED",
      "ACCOUNT_ACTION_FORBIDDEN",
      "ACCOUNT_NOT_FOUND",
      "ACCOUNT_STATE_CONFLICT",
      "ACCOUNT_OPERATION_FAILED",
    ]),
    message: z.string(),
  }),
});

export class BrowserAccountManagementError extends Error {
  readonly code: BrowserAccountManagementErrorCode;
  readonly status: number;

  constructor(code: BrowserAccountManagementErrorCode, status?: number) {
    const definition = approvedErrors[code];
    super(
      code === "ACCOUNT_OPERATION_FAILED"
        ? GENERIC_MESSAGE
        : definition.message,
    );
    this.name = "BrowserAccountManagementError";
    this.code = code;
    this.status = status ?? definition.status;
  }
}

function unavailable(status: number) {
  return new BrowserAccountManagementError("ACCOUNT_OPERATION_FAILED", status);
}

function isAbort(error: unknown, signal?: AbortSignal) {
  return (
    signal?.aborted === true ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw unavailable(response.status);
  }
}

async function responseError(response: Response) {
  const parsed = errorResponseSchema.safeParse(await readJson(response));
  if (!parsed.success) return unavailable(response.status);
  const definition = approvedErrors[parsed.data.error.code];
  if (
    response.status !== definition.status ||
    parsed.data.error.message !== definition.message
  ) {
    return unavailable(response.status);
  }
  return new BrowserAccountManagementError(parsed.data.error.code);
}

async function safeFetch(input: RequestInfo | URL, init: RequestInit) {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (isAbort(error, init.signal ?? undefined)) throw error;
    throw unavailable(0);
  }
}

export async function listAdministratorAccounts(
  query: AccountBrowserQuery,
  signal?: AbortSignal,
) {
  const search = new URLSearchParams();
  if (query.q !== undefined) search.set("q", query.q);
  if (query.role !== undefined) search.set("role", query.role);
  if (query.status !== undefined) search.set("status", query.status);
  search.set("page", String(query.page));

  const response = await safeFetch(`/api/admin/accounts?${search}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw await responseError(response);
  const parsed = managedBrowserAccountPageSchema.safeParse(
    await readJson(response),
  );
  if (!parsed.success) throw unavailable(response.status);
  return parsed.data;
}
```

- [ ] **Step 4: Write failing mutation and error tests**

Append to the same test file:

```ts
it("updates one account with the exact concurrency body", async () => {
  const controller = new AbortController();
  const updated = {
    ...accountFixture,
    status: "suspended" as const,
    updatedAt: "2026-08-27T02:00:00.000Z",
  };
  const fetchMock = vi
    .fn()
    .mockResolvedValue(Response.json({ account: updated }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(
    updateAdministratorAccountStatus(
      accountFixture.id,
      {
        status: "suspended",
        expectedUpdatedAt: accountFixture.updatedAt,
        reason: "administrative_review",
      },
      controller.signal,
    ),
  ).resolves.toEqual(updated);

  expect(fetchMock).toHaveBeenCalledWith(
    `/api/admin/accounts/${accountFixture.id}/status`,
    {
      method: "PATCH",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({
        status: "suspended",
        expectedUpdatedAt: accountFixture.updatedAt,
        reason: "administrative_review",
      }),
      signal: controller.signal,
    },
  );
});

it.each([
  [400, "VALIDATION_ERROR", "Request is invalid"],
  [401, "AUTHENTICATION_REQUIRED", "Authentication required"],
  [403, "ADMINISTRATOR_REQUIRED", "Administrator access required"],
  [403, "ACCOUNT_ACTION_FORBIDDEN", "Account action is not permitted"],
  [404, "ACCOUNT_NOT_FOUND", "Account not found"],
  [409, "ACCOUNT_STATE_CONFLICT", "Account state has changed or cannot be updated"],
  [500, "ACCOUNT_OPERATION_FAILED", "Account operation could not be completed"],
] as const)("preserves approved %i %s", async (status, code, message) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({ error: { code, message } }, { status }),
    ),
  );
  await expect(listAdministratorAccounts({ page: 1 })).rejects.toMatchObject({
    code,
    status,
  });
});

it.each([
  [500, { error: { code: "MONGODB_ERROR", message: "PRIVATE-HOST" } }],
  [403, { error: { code: "ADMINISTRATOR_REQUIRED", message: "PRIVATE" } }],
  [200, { account: { ...accountFixture, passwordHash: "PRIVATE" } }],
])("redacts an unsafe %i response", async (status, body) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json(body, { status })),
  );
  const error = await listAdministratorAccounts({ page: 1 }).catch(
    (reason) => reason,
  );
  expect(error).toBeInstanceOf(BrowserAccountManagementError);
  expect(error.message).not.toMatch(/PRIVATE|MONGODB|HOST|passwordHash/i);
});

it("preserves an AbortError", async () => {
  const controller = new AbortController();
  controller.abort();
  const aborted = new DOMException("PRIVATE-ABORT", "AbortError");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(aborted));
  await expect(
    listAdministratorAccounts({ page: 1 }, controller.signal),
  ).rejects.toBe(aborted);
});
```

- [ ] **Step 5: Implement the mutation request**

Append to `account-browser-client.ts`:

```ts
export async function updateAdministratorAccountStatus(
  userId: string,
  input: AccountBrowserStatusInput,
  signal?: AbortSignal,
) {
  const response = await safeFetch(
    `/api/admin/accounts/${encodeURIComponent(userId)}/status`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify(input),
      signal,
    },
  );
  if (!response.ok) throw await responseError(response);
  const parsed = managedBrowserAccountResponseSchema.safeParse(
    await readJson(response),
  );
  if (!parsed.success) throw unavailable(response.status);
  return parsed.data.account;
}
```

- [ ] **Step 6: Run focused client tests and static checks**

```powershell
npm.cmd test -- src/lib/admin/account-browser-contract.test.ts src/lib/admin/account-browser-client.test.ts src/lib/admin/browser-client.test.ts
npm.cmd exec -- tsc --noEmit --incremental false
npm.cmd exec -- eslint src/lib/admin/account-browser-contract.ts src/lib/admin/account-browser-contract.test.ts src/lib/admin/account-browser-client.ts src/lib/admin/account-browser-client.test.ts
```

Expected: all commands PASS. Inspect the compiled dependency graph through
imports: neither new browser module imports `@/models/*` or `mongoose`.

- [ ] **Step 7: Commit the HTTP client**

```powershell
git add web/src/lib/admin/account-browser-client.ts web/src/lib/admin/account-browser-client.test.ts
git commit -m "feat(admin-ui): add safe account browser client"
```

---

### Task 3: Protected account-management route

**Files:**
- Modify: `web/src/components/admin/administrator-access-boundary.tsx`
- Modify: `web/src/components/admin/administrator-access-boundary.test.tsx`
- Create: `web/src/app/admin/accounts/page.tsx`
- Create: `web/src/app/admin/accounts/admin-account-page.test.tsx`
- Create temporarily: `web/src/components/admin/admin-account-management-client.tsx`

**Interfaces:**
- Consumes: existing `AdministratorAccessBoundary` session logic.
- Produces:
  - optional `workspaceLabel` and `forbiddenDescription` boundary props;
  - protected `/admin/accounts` route shell;
  - temporary `AdminAccountManagementClient` heading fixture replaced in Task 4.

- [ ] **Step 1: Add failing configurable-boundary tests**

Append to `administrator-access-boundary.test.tsx`:

```tsx
it("uses account-management labels without changing the permission boundary", () => {
  vi.mocked(useAuthSession).mockReturnValue(
    sessionFixture({ role: "administrator", status: "active" }),
  );
  render(
    <AdministratorAccessBoundary
      workspaceLabel="Administrator account management workspace"
      forbiddenDescription="Only active administrators can manage student and staff accounts."
    >
      <p>Protected account fixture</p>
    </AdministratorAccessBoundary>,
  );
  expect(
    screen.getByRole("region", {
      name: "Administrator account management workspace",
    }),
  ).toBeTruthy();
});

it("uses the supplied forbidden description", () => {
  vi.mocked(useAuthSession).mockReturnValue(
    sessionFixture({ role: "staff", status: "active" }),
  );
  render(
    <AdministratorAccessBoundary forbiddenDescription="Only active administrators can manage student and staff accounts.">
      <p>Must not mount</p>
    </AdministratorAccessBoundary>,
  );
  expect(
    screen.getByText(
      "Only active administrators can manage student and staff accounts.",
    ),
  ).toBeTruthy();
  expect(screen.queryByText("Must not mount")).toBeNull();
});
```

Use the test file's existing session fixture helper rather than defining a
second mock shape.

- [ ] **Step 2: Run the boundary test and verify failure**

```powershell
npm.cmd test -- src/components/admin/administrator-access-boundary.test.tsx
```

Expected: FAIL because the boundary accepts only `children` and uses fixed
overview copy.

- [ ] **Step 3: Generalise the boundary with safe defaults**

Change the component signature and two fixed strings:

```tsx
export function AdministratorAccessBoundary({
  children,
  workspaceLabel = "Administrator overview workspace",
  forbiddenDescription =
    "Only active administrator accounts can view system statistics.",
}: {
  children: ReactNode;
  workspaceLabel?: string;
  forbiddenDescription?: string;
}) {
```

Render `{forbiddenDescription}` in the forbidden paragraph and
`aria-label={workspaceLabel}` on `workspaceRef`. Do not change session,
redirect, retry or focus behaviour.

- [ ] **Step 4: Write the failing page composition test**

Create `web/src/app/admin/accounts/admin-account-page.test.tsx`:

```tsx
// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("@/components/admin/administrator-access-boundary", () => ({
  AdministratorAccessBoundary: ({
    children,
    workspaceLabel,
    forbiddenDescription,
  }: {
    children: React.ReactNode;
    workspaceLabel?: string;
    forbiddenDescription?: string;
  }) => (
    <section
      aria-label={workspaceLabel}
      data-forbidden-description={forbiddenDescription}
    >
      {children}
    </section>
  ),
}));
vi.mock("@/components/admin/admin-account-management-client", () => ({
  AdminAccountManagementClient: () => (
    <section aria-label="Account management fixture" />
  ),
}));

import AdminAccountsPage, { metadata } from "./page";

it("composes the protected account-management route", () => {
  const { container } = render(<AdminAccountsPage />);
  expect(metadata.title).toBe("Manage accounts");
  expect(container.querySelector("main#main-content")).toBeTruthy();
  const boundary = screen.getByLabelText(
    "Administrator account management workspace",
  );
  expect(boundary.getAttribute("data-forbidden-description")).toBe(
    "Only active administrators can manage student and staff accounts.",
  );
  expect(screen.getByLabelText("Account management fixture")).toBeTruthy();
});
```

- [ ] **Step 5: Add the route shell and temporary client export**

Create `web/src/app/admin/accounts/page.tsx`:

```tsx
import type { Metadata } from "next";

import { AdminAccountManagementClient } from "@/components/admin/admin-account-management-client";
import { AdministratorAccessBoundary } from "@/components/admin/administrator-access-boundary";

export const metadata: Metadata = { title: "Manage accounts" };

export default function AdminAccountsPage() {
  return (
    <main id="main-content">
      <AdministratorAccessBoundary
        workspaceLabel="Administrator account management workspace"
        forbiddenDescription="Only active administrators can manage student and staff accounts."
      >
        <AdminAccountManagementClient />
      </AdministratorAccessBoundary>
    </main>
  );
}
```

Create the temporary `admin-account-management-client.tsx` so the route can
compile before Task 4:

```tsx
"use client";

export function AdminAccountManagementClient() {
  return <section aria-label="Account management fixture" />;
}
```

- [ ] **Step 6: Run protected-route regressions**

```powershell
npm.cmd test -- src/components/admin/administrator-access-boundary.test.tsx src/app/admin/admin-page.test.tsx src/app/admin/accounts/admin-account-page.test.tsx
npm.cmd exec -- tsc --noEmit --incremental false
```

Expected: all tests PASS; existing `/admin` defaults remain unchanged.

- [ ] **Step 7: Commit the protected route**

```powershell
git add web/src/components/admin/administrator-access-boundary.tsx web/src/components/admin/administrator-access-boundary.test.tsx web/src/app/admin/accounts/page.tsx web/src/app/admin/accounts/admin-account-page.test.tsx web/src/components/admin/admin-account-management-client.tsx
git commit -m "feat(admin-ui): add protected account workspace"
```

---

### Task 4: Search, filters, results and pagination

**Files:**
- Replace: `web/src/components/admin/admin-account-management-client.tsx`
- Create: `web/src/components/admin/admin-account-management-client.test.tsx`
- Create: `web/src/components/admin/admin-account-management.module.css`

**Interfaces:**
- Consumes: `listAdministratorAccounts`, browser query/page/account types and
  `useAuthSession`.
- Produces: initial load, explicit query form, semantic account cards, empty
  state, retry state, stale-request-safe paging and safe access-loss handling.

- [ ] **Step 1: Create fixtures and failing initial-state tests**

Create `admin-account-management-client.test.tsx` with the standard JSDOM
header, mocks and fixtures:

```tsx
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/components/auth/auth-session-provider", () => ({
  useAuthSession: vi.fn(),
}));
vi.mock("@/lib/admin/account-browser-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/admin/account-browser-client")
  >("@/lib/admin/account-browser-client");
  return {
    ...actual,
    listAdministratorAccounts: vi.fn(),
    updateAdministratorAccountStatus: vi.fn(),
  };
});

import { useRouter } from "next/navigation";
import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  BrowserAccountManagementError,
  listAdministratorAccounts,
} from "@/lib/admin/account-browser-client";
import type { ManagedBrowserAccountPage } from "@/lib/admin/account-browser-contract";
import { AdminAccountManagementClient } from "./admin-account-management-client";

const accounts = [
  {
    id: "64b64c5f2f8f9e0012345678",
    email: "student@example.test",
    displayName: "Alex Student",
    role: "student" as const,
    status: "active" as const,
    createdAt: "2026-08-01T00:00:00.000Z",
    lastLoginAt: "2026-08-26T02:00:00.000Z",
    updatedAt: "2026-08-27T01:00:00.000Z",
  },
  {
    id: "64b64c5f2f8f9e0012345679",
    email: "staff@example.test",
    displayName: "Taylor Staff",
    role: "staff" as const,
    status: "suspended" as const,
    createdAt: "2026-08-02T00:00:00.000Z",
    lastLoginAt: null,
    updatedAt: "2026-08-27T01:30:00.000Z",
  },
];
const page: ManagedBrowserAccountPage = {
  accounts,
  pagination: { page: 1, pageSize: 20, totalItems: 22, totalPages: 2 },
};
const replace = vi.fn();
const refreshSession = vi.fn().mockResolvedValue(undefined);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
  vi.mocked(useAuthSession).mockReturnValue({
    status: "authenticated",
    user: null,
    setAuthenticatedUser: vi.fn(),
    refreshSession,
    logout: vi.fn(),
  });
});

afterEach(cleanup);

it("loads page one and renders public account cards", async () => {
  vi.mocked(listAdministratorAccounts).mockResolvedValue(page);
  const { container } = render(<AdminAccountManagementClient />);
  expect(screen.getByRole("status").textContent).toContain("Loading accounts");
  expect(await screen.findByRole("heading", { name: "Manage accounts" })).toBeTruthy();
  expect(listAdministratorAccounts).toHaveBeenCalledWith(
    { page: 1 },
    expect.any(AbortSignal),
  );
  expect(screen.getByText("Alex Student")).toBeTruthy();
  expect(screen.getByText("student@example.test")).toBeTruthy();
  expect(screen.getByText("Taylor Staff")).toBeTruthy();
  expect(screen.getByText("Never")).toBeTruthy();
  expect(screen.getByText("1–20 of 22 accounts")).toBeTruthy();
  expect(container.textContent).not.toMatch(
    /passwordHash|tokenHash|emailVerifiedAt|notificationSettings|PRIVATE/i,
  );
});

it("renders a valid empty result with reset", async () => {
  vi.mocked(listAdministratorAccounts).mockResolvedValue({
    accounts: [],
    pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
  });
  render(<AdminAccountManagementClient />);
  expect(await screen.findByText("No accounts match these filters")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Reset filters" })).toBeTruthy();
});
```

- [ ] **Step 2: Run the component tests and verify failure**

```powershell
npm.cmd test -- src/components/admin/admin-account-management-client.test.tsx
```

Expected: FAIL because the temporary fixture does not load or render accounts.

- [ ] **Step 3: Implement query and list state**

Replace the temporary component with a client component that defines these
exact state contracts and load function:

```tsx
type ListState =
  | { status: "loading" }
  | { status: "ready"; data: ManagedBrowserAccountPage; refreshFailed: boolean }
  | { status: "error" }
  | { status: "accessChanged" };

type FilterDraft = { q: string; role: "" | "student" | "staff"; status: "" | "active" | "suspended" | "deactivated" };

const EMPTY_FILTERS: FilterDraft = { q: "", role: "", status: "" };

function toQuery(filters: FilterDraft, page: number): AccountBrowserQuery {
  return {
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    page,
  };
}
```

Use refs `mounted`, `requestId` and `listController`. `loadAccounts(query,
mode)` must:

1. increment `requestId`;
2. abort the previous list controller;
3. preserve ready data only when `mode === "refresh"`;
4. call `listAdministratorAccounts(query, signal)`;
5. ignore unmounted, aborted or non-current completions;
6. on `AUTHENTICATION_REQUIRED`, clear data, refresh the session and redirect
   to `/login`;
7. on `ADMINISTRATOR_REQUIRED`, clear data and refresh the session;
8. otherwise show an initial retry panel or retain ready data with a safe alert.

On mount, schedule `loadAccounts({ page: 1 }, "initial")` through
`window.setTimeout(..., 0)` and abort/invalidate on cleanup, matching the
existing `AdminOverviewClient` lifecycle pattern.

Render this exact accessible structure:

- `main[aria-labelledby="account-management-title"]` containing one `h1` with
  that id and a descriptive introduction;
- a `Back to administrator overview` link to `/admin`;
- a search form with visible labels `Search accounts`, `Role` and `Status`,
  plus `Apply filters` and `Reset filters` buttons;
- `p[role="status"][aria-live="polite"]` for loading and result-count updates,
  and `div[role="alert"]` for blocking or refresh errors;
- `ul[aria-label="Account results"]` whose `li` cards display only the approved
  browser-contract fields;
- `nav[aria-label="Account result pages"]` with `Previous page` and
  `Next page, page N` labels while enabled, plain `Previous page` / `Next page`
  labels while disabled, and a visible `Page N of M` indicator.

Create CSS-module classes for the page, header, filters, filter field, actions,
status, alert, result list, account card, metadata list and pagination. At this
task keep the visual declarations to spacing, borders, readable type and the
single-column card flow; Task 6 owns the final responsive polish.

- [ ] **Step 4: Add failing search, filter and pagination tests**

Append:

```tsx
it("submits normalized search and filters explicitly", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts).mockResolvedValue(page);
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");

  await user.type(screen.getByLabelText("Search accounts"), "  Alex   Student ");
  await user.selectOptions(screen.getByLabelText("Role"), "student");
  await user.selectOptions(screen.getByLabelText("Status"), "active");
  expect(listAdministratorAccounts).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Apply filters" }));

  await waitFor(() =>
    expect(listAdministratorAccounts).toHaveBeenLastCalledWith(
      { q: "Alex Student", role: "student", status: "active", page: 1 },
      expect.any(AbortSignal),
    ),
  );
});

it("rejects invalid search without sending a request", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts).mockResolvedValue(page);
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");
  fireEvent.change(screen.getByLabelText("Search accounts"), {
    target: { value: "x".repeat(81) },
  });
  await user.click(screen.getByRole("button", { name: "Apply filters" }));
  expect(screen.getByRole("alert").textContent).toContain(
    "Enter between 1 and 80 valid characters",
  );
  expect(listAdministratorAccounts).toHaveBeenCalledTimes(1);
});

it("resets filters and returns to page one", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts).mockResolvedValue(page);
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");
  await user.type(screen.getByLabelText("Search accounts"), "Alex");
  await user.click(screen.getByRole("button", { name: "Apply filters" }));
  await user.click(screen.getByRole("button", { name: "Reset filters" }));
  await waitFor(() =>
    expect(listAdministratorAccounts).toHaveBeenLastCalledWith(
      { page: 1 },
      expect.any(AbortSignal),
    ),
  );
});

it("uses validated pagination bounds", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts)
    .mockResolvedValueOnce(page)
    .mockResolvedValueOnce({
      ...page,
      pagination: { ...page.pagination, page: 2 },
    });
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");
  expect(screen.getByRole("button", { name: "Previous page" }).hasAttribute("disabled")).toBe(true);
  await user.click(screen.getByRole("button", { name: "Next page, page 2" }));
  await waitFor(() =>
    expect(listAdministratorAccounts).toHaveBeenLastCalledWith(
      { page: 2 },
      expect.any(AbortSignal),
    ),
  );
  expect(screen.getByRole("button", { name: "Next page" }).hasAttribute("disabled")).toBe(true);
});
```

- [ ] **Step 5: Add stale request, retry and access-change tests**

Append tests that use `deferred()` to prove the first signal is aborted when a
new filter is applied and a late first response cannot overwrite the second.
Also assert:

```tsx
it("redirects safely when authentication expires", async () => {
  vi.mocked(listAdministratorAccounts).mockRejectedValue(
    new BrowserAccountManagementError("AUTHENTICATION_REQUIRED"),
  );
  render(<AdminAccountManagementClient />);
  await waitFor(() => expect(refreshSession).toHaveBeenCalledOnce());
  expect(replace).toHaveBeenCalledWith("/login");
  expect(screen.queryByText("Alex Student")).toBeNull();
});

it("shows a safe retry after an initial failure", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts)
    .mockRejectedValueOnce(new Error("PRIVATE-HOST"))
    .mockResolvedValueOnce(page);
  render(<AdminAccountManagementClient />);
  expect(await screen.findByText("Account management unavailable")).toBeTruthy();
  expect(document.body.textContent).not.toContain("PRIVATE-HOST");
  await user.click(screen.getByRole("button", { name: "Retry accounts" }));
  expect(await screen.findByText("Alex Student")).toBeTruthy();
});
```

- [ ] **Step 6: Run component and regression tests**

```powershell
npm.cmd test -- src/components/admin/admin-account-management-client.test.tsx src/lib/admin/account-browser-client.test.ts src/components/admin/admin-overview-client.test.tsx
npm.cmd exec -- tsc --noEmit --incremental false
```

Expected: all tests PASS. Initial load, empty, explicit query, invalid search,
reset, pagination, stale completion, retry, 401 and 403 are covered.

- [ ] **Step 7: Commit the read-only workflow**

```powershell
git add web/src/components/admin/admin-account-management-client.tsx web/src/components/admin/admin-account-management-client.test.tsx web/src/components/admin/admin-account-management.module.css
git commit -m "feat(admin-ui): browse manageable accounts"
```

---

### Task 5: Confirmed account status actions

**Files:**
- Modify: `web/src/components/admin/admin-account-management-client.tsx`
- Modify: `web/src/components/admin/admin-account-management-client.test.tsx`
- Modify: `web/src/components/admin/admin-account-management.module.css`
- Test: `web/src/lib/admin/account-browser-client.test.ts`

**Interfaces:**
- Consumes: `updateAdministratorAccountStatus`, `ManagedBrowserAccount`, exact
  reason literals and list reload from Task 4.
- Produces: one-at-a-time inline confirmation, legal transition mapping,
  optimistic mutation, safe row replacement and conflict recovery.

- [ ] **Step 1: Add failing legal-action and cancellation tests**

Append:

```tsx
it("offers only transitions permitted by the current status", async () => {
  vi.mocked(listAdministratorAccounts).mockResolvedValue(page);
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");

  const alex = screen.getByText("Alex Student").closest("li")!;
  expect(within(alex).getByRole("button", { name: "Suspend Alex Student" })).toBeTruthy();
  expect(within(alex).getByRole("button", { name: "Deactivate Alex Student" })).toBeTruthy();

  const taylor = screen.getByText("Taylor Staff").closest("li")!;
  expect(within(taylor).getByRole("button", { name: "Restore Taylor Staff" })).toBeTruthy();
  expect(within(taylor).getByRole("button", { name: "Deactivate Taylor Staff" })).toBeTruthy();
  expect(within(taylor).queryByRole("button", { name: /Suspend/ })).toBeNull();
});

it("opens one confirmation and cancels without a request", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts).mockResolvedValue(page);
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");
  const trigger = screen.getByRole("button", { name: "Suspend Alex Student" });
  await user.click(trigger);
  expect(screen.getByRole("heading", { name: "Suspend Alex Student?" })).toHaveFocus();
  expect(screen.getByText(/all current sessions will be revoked/i)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Cancel account change" }));
  expect(updateAdministratorAccountStatus).not.toHaveBeenCalled();
  expect(trigger).toHaveFocus();
});
```

Import `within` and `updateAdministratorAccountStatus` in the existing test.

- [ ] **Step 2: Run the focused test and verify failure**

```powershell
npm.cmd test -- src/components/admin/admin-account-management-client.test.tsx
```

Expected: FAIL because the account cards have no action workflow.

- [ ] **Step 3: Implement the closed transition mapping and confirmation state**

Add these exact local types and helpers:

```tsx
type AccountAction = "suspend" | "restore" | "deactivate";
type OpenAction = { accountId: string; action: AccountAction };

const suspensionReasons = [
  ["security_concern", "Security concern"],
  ["policy_violation", "Policy violation"],
  ["administrative_review", "Administrative review"],
] as const;

function actionInput(
  account: ManagedBrowserAccount,
  action: AccountAction,
  suspensionReason: (typeof suspensionReasons)[number][0],
): AccountBrowserStatusInput {
  if (action === "suspend") {
    return {
      status: "suspended",
      reason: suspensionReason,
      expectedUpdatedAt: account.updatedAt,
    };
  }
  if (action === "restore") {
    return {
      status: "active",
      reason: "account_restored",
      expectedUpdatedAt: account.updatedAt,
    };
  }
  return {
    status: "deactivated",
    reason: "account_closed",
    expectedUpdatedAt: account.updatedAt,
  };
}
```

Store one `openAction`, one `suspensionReason`, `mutationStatus`, a mutation
request identity and the initiating button element. Opening another action
replaces the current confirmation. Focus its `h3` through a ref in an effect.
Cancel closes the panel and returns focus through `window.setTimeout`.

Render buttons only according to the transition table in the design. A
deactivated account renders `No further status changes are available` and no
mutation button.

- [ ] **Step 4: Add failing mutation success and exact-payload tests**

Append:

```tsx
it("suspends with the selected reason and exact updatedAt", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts).mockResolvedValue(page);
  vi.mocked(updateAdministratorAccountStatus).mockResolvedValue({
    ...accounts[0],
    status: "suspended",
    updatedAt: "2026-08-27T03:00:00.000Z",
  });
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");
  await user.click(screen.getByRole("button", { name: "Suspend Alex Student" }));
  await user.selectOptions(screen.getByLabelText("Suspension reason"), "policy_violation");
  await user.click(screen.getByRole("button", { name: "Confirm suspension" }));

  expect(updateAdministratorAccountStatus).toHaveBeenCalledWith(
    accounts[0].id,
    {
      status: "suspended",
      reason: "policy_violation",
      expectedUpdatedAt: accounts[0].updatedAt,
    },
    expect.any(AbortSignal),
  );
  expect(await screen.findByText("Account suspended. Existing sessions were revoked.")).toBeTruthy();
  const card = screen.getByText("Alex Student").closest("li")!;
  expect(within(card).getByText("Suspended")).toBeTruthy();
});

it.each([
  ["Restore Taylor Staff", "Confirm restoration", "active", "account_restored"],
  ["Deactivate Taylor Staff", "Confirm deactivation", "deactivated", "account_closed"],
] as const)("submits %s safely", async (openName, confirmName, status, reason) => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts).mockResolvedValue(page);
  vi.mocked(updateAdministratorAccountStatus).mockResolvedValue({
    ...accounts[1], status, updatedAt: "2026-08-27T03:00:00.000Z",
  });
  render(<AdminAccountManagementClient />);
  await screen.findByText("Taylor Staff");
  await user.click(screen.getByRole("button", { name: openName }));
  await user.click(screen.getByRole("button", { name: confirmName }));
  expect(updateAdministratorAccountStatus).toHaveBeenCalledWith(
    accounts[1].id,
    { status, reason, expectedUpdatedAt: accounts[1].updatedAt },
    expect.any(AbortSignal),
  );
});
```

- [ ] **Step 5: Implement mutation lifecycle and row replacement**

`confirmAction` must snapshot the selected account and action, start one
`AbortController`, and call `updateAdministratorAccountStatus`. On success:

```tsx
setState((current) =>
  current.status === "ready"
    ? {
        ...current,
        data: {
          ...current.data,
          accounts: current.data.accounts.map((account) =>
            account.id === updated.id ? updated : account,
          ),
        },
      }
    : current,
);
```

Then close the confirmation, announce the exact target-state success copy and
return focus to the action area. Disable confirmation and all account-action
buttons while the mutation is active. Never optimistically alter the row before
the validated response arrives.

- [ ] **Step 6: Add conflict, missing, forbidden, server and session tests**

Append one test per error class:

- `ACCOUNT_STATE_CONFLICT`: close confirmation, show `Account data changed. The current list has been refreshed.`, call the list endpoint again with the committed query and render the refreshed row.
- `ACCOUNT_NOT_FOUND`: show `That account is no longer available. The current list has been refreshed.` and reload.
- `ACCOUNT_ACTION_FORBIDDEN`: retain row, close confirmation and show `This account action is not permitted.` without raw details.
- `ACCOUNT_OPERATION_FAILED`: retain row and open confirmation with a safe retry alert.
- `AUTHENTICATION_REQUIRED`: clear account results, refresh session and redirect `/login`.
- `ADMINISTRATOR_REQUIRED`: clear account results and refresh session.
- abort/unmount: abort the mutation response wait and ignore late completion.

For each safe-error test, reject with
`new BrowserAccountManagementError("<CODE>")`, include a raw `PRIVATE` failure
in the generic-error test and assert it is absent from `document.body.textContent`.

- [ ] **Step 7: Run mutation, browser-client and server-route regressions**

```powershell
npm.cmd test -- src/components/admin/admin-account-management-client.test.tsx src/lib/admin/account-browser-client.test.ts src/app/api/admin/accounts/admin-account-list-route.test.ts src/app/api/admin/accounts/[userId]/status/admin-account-status-route.test.ts src/lib/admin/account-status-service.test.ts
npm.cmd exec -- tsc --noEmit --incremental false
```

Expected: all tests PASS. The component uses only the closed transition/reason
mapping and exact `updatedAt` snapshot.

- [ ] **Step 8: Commit status actions**

```powershell
git add web/src/components/admin/admin-account-management-client.tsx web/src/components/admin/admin-account-management-client.test.tsx web/src/components/admin/admin-account-management.module.css
git commit -m "feat(admin-ui): manage account access safely"
```

---

### Task 6: Administrator navigation and responsive finish

**Files:**
- Modify: `web/src/components/admin/admin-overview-client.tsx`
- Modify: `web/src/components/admin/admin-overview-client.test.tsx`
- Modify: `web/src/components/admin/admin-account-management.module.css`
- Test: `web/src/components/admin/administrator-access-boundary.test.tsx`
- Test: `web/src/app/admin/accounts/admin-account-page.test.tsx`

**Interfaces:**
- Consumes: completed account page and existing Accounts overview heading.
- Produces: `Manage accounts` entry, Campus Noticeboard visual alignment,
  accessible focus/status styling and 320-pixel responsive evidence.

- [ ] **Step 1: Write the failing overview-link test**

In the existing successful overview test, add:

```tsx
expect(
  screen.getByRole("link", { name: "Manage accounts" }).getAttribute("href"),
).toBe("/admin/accounts");
```

- [ ] **Step 2: Run the overview test and verify failure**

```powershell
npm.cmd test -- src/components/admin/admin-overview-client.test.tsx
```

Expected: FAIL because the Accounts section has only explanatory text.

- [ ] **Step 3: Add the account-management link**

Replace the Accounts section heading paragraph with:

```tsx
<div className={styles.sectionHeading}>
  <div>
    <h2 id="account-overview">Accounts</h2>
    <p>Current access states across all registered accounts.</p>
  </div>
  <Link href="/admin/accounts">Manage accounts</Link>
</div>
```

Keep the existing metrics and global header unchanged.

- [ ] **Step 4: Complete CSS with exact responsive constraints**

Ensure `admin-account-management.module.css` includes:

```css
.workspace {
  display: grid;
  box-sizing: border-box;
  width: min(100% - 2rem, 72rem);
  margin-inline: auto;
  gap: 1.5rem;
  overflow-wrap: anywhere;
  padding-block: clamp(2.5rem, 7vw, 5rem);
}

.filterGrid {
  display: grid;
  grid-template-columns: minmax(12rem, 2fr) repeat(2, minmax(9rem, 1fr));
  gap: 1rem;
}

.accountList {
  display: grid;
  margin: 0;
  padding: 0;
  gap: 1rem;
  list-style: none;
}

.accountCard,
.confirmation,
.statePanel {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--paper-light);
}

.accountValues {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr));
  gap: 1rem;
}

.filterForm input,
.filterForm select,
.filterForm button,
.accountActions button,
.confirmation button,
.pagination button,
.workspace a {
  min-width: 44px;
  min-height: 44px;
}

.filterForm :focus-visible,
.accountActions :focus-visible,
.confirmation :focus-visible,
.pagination :focus-visible,
.workspace a:focus-visible,
.confirmation h3:focus {
  outline: 3px solid var(--campus-green-dark);
  outline-offset: 3px;
}

@media (max-width: 42rem) {
  .filterGrid { grid-template-columns: 1fr; }
}

@media (max-width: 20rem) {
  .workspace { width: min(100% - 1rem, 72rem); }
  .filterActions,
  .accountActions,
  .confirmationActions,
  .pagination { flex-direction: column; }
  .filterActions button,
  .accountActions button,
  .confirmationActions button,
  .pagination button,
  .workspace a { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .workspace *, .workspace *::before, .workspace *::after {
    scroll-behavior: auto;
    transition-duration: 0.01ms !important;
  }
}
```

Add only the additional colour, spacing, status-badge and visually-hidden rules
needed by existing JSX. Do not add fixed widths, horizontal scrolling, CSS
animations or an external font.

- [ ] **Step 5: Add static accessibility and responsive assertions**

In the component test, read the CSS file using `readFileSync(resolve(...))` and
assert:

```tsx
expect(css).toMatch(/@media\s*\(max-width:\s*20rem\)/);
expect(css).toMatch(/min-height:\s*44px/);
expect(css).toMatch(/focus-visible/);
expect(css).toMatch(/prefers-reduced-motion/);
expect(css).not.toMatch(/overflow-x:\s*(auto|scroll)/);
```

Also assert the rendered page has one `h1`, labelled search/role/status inputs,
a semantic list, textual Active/Suspended/Deactivated states and a polite
result-count status.

- [ ] **Step 6: Run frontend integration and lint checks**

```powershell
npm.cmd test -- src/components/admin/admin-account-management-client.test.tsx src/components/admin/admin-overview-client.test.tsx src/components/admin/administrator-access-boundary.test.tsx src/app/admin/accounts/admin-account-page.test.tsx src/app/admin/admin-page.test.tsx src/components/site-header.test.tsx
npm.cmd exec -- eslint src/components/admin/admin-account-management-client.tsx src/components/admin/admin-account-management-client.test.tsx src/components/admin/administrator-access-boundary.tsx src/components/admin/administrator-access-boundary.test.tsx src/components/admin/admin-overview-client.tsx src/components/admin/admin-overview-client.test.tsx src/app/admin/accounts/page.tsx src/app/admin/accounts/admin-account-page.test.tsx
npm.cmd exec -- tsc --noEmit --incremental false
```

Expected: all commands PASS; the global header and existing administrator
overview behaviour remain intact.

- [ ] **Step 7: Commit navigation and visual finish**

```powershell
git add web/src/components/admin/admin-overview-client.tsx web/src/components/admin/admin-overview-client.test.tsx web/src/components/admin/admin-account-management.module.css web/src/components/admin/admin-account-management-client.test.tsx
git commit -m "feat(admin-ui): finish account management workspace"
```

---

### Task 7: Full verification and evidence

**Files:**
- Create: `docs/superpowers/verification/2026-08-27-administrator-account-management-frontend.md`

**Interfaces:**
- Consumes: the complete Issue #41 implementation.
- Produces: auditable verification evidence without credentials or private
  account data.

- [ ] **Step 1: Run the complete focused slice**

Run from `web/`:

```powershell
npm.cmd test -- src/lib/admin/account-browser-contract.test.ts src/lib/admin/account-browser-client.test.ts src/components/admin/admin-account-management-client.test.tsx src/components/admin/administrator-access-boundary.test.tsx src/components/admin/admin-overview-client.test.tsx src/app/admin/accounts/admin-account-page.test.tsx src/app/admin/admin-page.test.tsx src/lib/admin/account-contract.test.ts src/app/api/admin/accounts/admin-account-list-route.test.ts src/app/api/admin/accounts/[userId]/status/admin-account-status-route.test.ts src/lib/admin/account-status-service.test.ts src/components/site-header.test.tsx
```

Expected: every new frontend test and every listed access, backend-contract,
route and navigation regression test PASS.

- [ ] **Step 2: Run full repository gates**

Run from `web/` in order:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd exec -- tsc --noEmit --incremental false
npm.cmd run build
npm.cmd audit
```

Expected: full tests PASS, lint and TypeScript exit 0, the build includes
`/admin/accounts`, `/api/admin/accounts` and
`/api/admin/accounts/[userId]/status`, and audit reports zero vulnerabilities.
If online audit is blocked by execution policy, run `npm.cmd audit --offline`
and record that exact limitation.

- [ ] **Step 3: Run repository, scope and privacy checks**

Run from the repository root:

```powershell
git diff --check
git status --short --branch
git diff --name-only develop...HEAD
git diff --name-only develop...HEAD -- web/package.json web/package-lock.json web/src/models
rg -n --glob '!*.test.ts*' "passwordHash|tokenHash|emailVerifiedAt|notificationSettings|preferredContactMethod|preferredCampusLocationIds|PRIVATE|stack|mongoose" web/src/lib/admin/account-browser-* web/src/components/admin/admin-account-management-client.tsx web/src/app/admin/accounts
git check-ignore web/.env.local
```

Expected:

- `git diff --check` produces no output.
- No package, lockfile or model path appears.
- Production browser/account-page sources contain no private field, raw error or
  Mongoose marker.
- Any private marker in tests exists only in explicit rejection/redaction tests.
- `git check-ignore` prints `web/.env.local` when the local file exists.
- No command reads or displays `.env.local`.

- [ ] **Step 4: Record verification evidence from the completed commands**

Create `docs/superpowers/verification/2026-08-27-administrator-account-management-frontend.md`
only after all commands finish. Add one automated-verification table row per
command using its observed numeric test totals and exact audit command. Do not
stage the document until every result is concrete. Use these fixed sections:

```md
# Administrator Account Management Frontend Verification

**Date:** 2026-08-27
**Branch:** `feature/issue-41-administrator-account-management-frontend`

## Implemented scope

- Added an active-administrator-only `/admin/accounts` workspace.
- Added strict browser-only account list and status response validation.
- Added explicit search, role/status filters, reset and pagination.
- Added confirmed suspend, restore and deactivate workflows.
- Added optimistic conflict recovery and stale-request protection.
- Added responsive, accessible navigation from the administrator overview.

## Automated verification

Add a Markdown table with `Check` and `Observed result` columns. Include rows
for the focused Issue #41 suite, full test suite, lint, TypeScript, build, the
audit command that actually ran, and `git diff --check`. Copy numeric test
totals and the zero-vulnerability result directly from terminal output.

## Security, privacy and accessibility verification

- Only active administrators mounted the account client.
- Browser modules imported no Mongoose model or server-only account contract.
- Responses were validated before rendering and contained approved public fields only.
- Only legal transitions were offered and every mutation used the displayed `updatedAt` snapshot.
- Conflict and missing-account results safely reloaded the committed query.
- Authentication and administrator-access loss cleared account data.
- Raw server failures and private account fields were never rendered.
- Account data was not persisted in browser storage.
- Tests used mocks and fixtures and did not connect to MongoDB Atlas.
- `.env.local` remained ignored and was not read.
- The workflow used semantic labels, live regions, visible focus, 44-pixel controls and a 320-pixel no-overflow layout.

## Deferred scope

Role and identity edits, administrator mutations, permanent deletion, bulk actions, audit browsing, notifications and report/category/location administration remain outside Issue #41.
```

The final verification document must report observed results only; do not
describe a command as passed unless its exit code was zero.

- [ ] **Step 5: Self-review the verification file and commit**

```powershell
Get-Content docs/superpowers/verification/2026-08-27-administrator-account-management-frontend.md
git diff --check
git add docs/superpowers/verification/2026-08-27-administrator-account-management-frontend.md
git commit -m "docs: record administrator account management frontend verification"
git status --short --branch
```

Expected: the displayed verification document contains concrete observed
results for every row, the verification commit succeeds and the feature branch
is clean with only intended commits ahead of `develop`.
