# Administrator Overview Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure, accessible and responsive `/admin` overview that presents the existing administrator statistics contract only to active administrators.

**Architecture:** A dedicated access boundary prevents unauthorised sessions from mounting the data client. A focused browser client strictly validates the existing API contract, while an overview component owns abortable request state and semantic metric presentation. The route shell and role-specific navigation compose those units without changing backend metrics, models or dependencies.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod 4, CSS Modules, Vitest 4, Testing Library and existing authentication/administrator contracts.

## Global Constraints

- Consume `GET /api/admin/overview` without query parameters or request bodies.
- Permit only an authenticated account with `role: "administrator"` and `status: "active"` to mount the overview data client.
- Reuse `administratorOverviewSchema`; do not duplicate or loosen the response contract.
- Send same-origin credentials, `Accept: application/json`, `cache: "no-store"` and an optional `AbortSignal`.
- Never render or persist account identities, report contents, Claim evidence, passwords, tokens, raw errors or database details.
- Display report, Claim and account metrics with visible plain-language definitions.
- Treat all-zero validated counts as a successful `No activity recorded yet` state.
- Load once after authorised mount and only refresh on explicit activation; do not poll.
- Retain the last valid snapshot during refresh and after a refresh failure.
- Ignore stale, aborted and post-unmount request completions.
- Preserve one `h1`, semantic `dl` structures, live status/alert regions, visible focus and 44-pixel controls.
- Remain usable without horizontal overflow at a 320-pixel viewport.
- Add no chart library, model, dependency, backend mutation or Atlas test access.
- Run all commands from `web/` unless a step explicitly says repository root.

---

## File structure

### New files

- `web/src/lib/admin/browser-client.ts` — strict same-origin overview HTTP client and safe browser error type.
- `web/src/lib/admin/browser-client.test.ts` — request, schema, error-redaction and abort contract tests.
- `web/src/components/admin/administrator-access-boundary.tsx` — session and active-administrator gate.
- `web/src/components/admin/administrator-access-boundary.test.tsx` — complete session/role/status matrix and focus tests.
- `web/src/components/admin/admin-overview-client.tsx` — request lifecycle and semantic metric rendering.
- `web/src/components/admin/admin-overview-client.test.tsx` — success, zero, refresh, failure, stale request, privacy and responsive tests.
- `web/src/components/admin/admin-overview.module.css` — overview page, state, metric and 320-pixel styles.
- `web/src/app/admin/page.tsx` — metadata and protected page composition.
- `web/src/app/admin/admin-page.test.tsx` — route composition and metadata test.
- `docs/superpowers/verification/2026-08-25-administrator-overview-frontend.md` — exact final evidence.

### Modified files

- `web/src/components/site-header.tsx` — active-administrator-only `Admin overview` link.
- `web/src/components/site-header.test.tsx` — navigation permission matrix.
- `web/src/components/dashboard/dashboard-client.tsx` — administrator workflow link.
- `web/src/components/dashboard/dashboard-client.test.tsx` — Dashboard role matrix.

No other production file is required.

---

### Task 1: Strict administrator overview browser client

**Files:**
- Create: `web/src/lib/admin/browser-client.test.ts`
- Create: `web/src/lib/admin/browser-client.ts`
- Read: `web/src/lib/admin/overview-contract.ts`

**Interfaces:**
- Consumes: `administratorOverviewSchema` and `AdministratorOverview` from `@/lib/admin/overview-contract`.
- Produces: `BrowserAdminOverviewError` and `getAdministratorOverview(signal?: AbortSignal): Promise<AdministratorOverview>`.

- [ ] **Step 1: Write the failing browser-client tests**

Create `web/src/lib/admin/browser-client.test.ts` with the exact valid fixture and request assertion:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdministratorOverview } from "./overview-contract";
import {
  BrowserAdminOverviewError,
  getAdministratorOverview,
} from "./browser-client";

const overview = {
  generatedAt: "2026-08-25T03:30:00.000Z",
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
} satisfies AdministratorOverview;

afterEach(() => vi.unstubAllGlobals());

describe("administrator overview browser client", () => {
  it("loads the strict overview with the exact no-cache request", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(Response.json(overview));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAdministratorOverview(controller.signal)).resolves.toEqual(
      overview,
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/overview", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
  });
});
```

Add strict-response table tests. Each call returns HTTP 200 and must reject
with a generic `BrowserAdminOverviewError` whose code is
`ADMIN_OVERVIEW_UNAVAILABLE`, whose message is
`Administrator overview is temporarily unavailable`, and whose serialised
form does not contain the injected private value:

```ts
it.each([
  ["unknown root field", { ...overview, email: "private@example.test" }],
  [
    "unknown nested field",
    { ...overview, accounts: { ...overview.accounts, userId: "private-id" } },
  ],
  [
    "negative count",
    { ...overview, reports: { ...overview.reports, unresolved: -1 } },
  ],
  [
    "fractional count",
    { ...overview, claims: { ...overview.claims, pending: 0.5 } },
  ],
  [
    "unsafe count",
    {
      ...overview,
      accounts: { ...overview.accounts, total: Number.MAX_SAFE_INTEGER + 1 },
    },
  ],
  ["malformed timestamp", { ...overview, generatedAt: "PRIVATE-DATE" }],
  [
    "inconsistent report total",
    { ...overview, reports: { ...overview.reports, submittedTotal: 999 } },
  ],
  [
    "inconsistent Claim total",
    { ...overview, claims: { ...overview.claims, total: 999 } },
  ],
  [
    "inconsistent account total",
    { ...overview, accounts: { ...overview.accounts, total: 999 } },
  ],
])("rejects a %s", async (_label, body) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));

  const error = await getAdministratorOverview().catch((reason) => reason);
  expect(error).toBeInstanceOf(BrowserAdminOverviewError);
  expect(error).toMatchObject({
    code: "ADMIN_OVERVIEW_UNAVAILABLE",
    status: 200,
    message: "Administrator overview is temporarily unavailable",
  });
  expect(JSON.stringify(error)).not.toMatch(
    /private|email|userId|submittedTotal.*999|stack/i,
  );
});
```

Add approved-error and redaction tests:

```ts
it.each([
  [401, "AUTHENTICATION_REQUIRED", "Authentication required"],
  [403, "ADMINISTRATOR_REQUIRED", "Administrator access required"],
  [
    500,
    "ADMIN_OVERVIEW_UNAVAILABLE",
    "Administrator overview is temporarily unavailable",
  ],
] as const)("preserves approved %i %s", async (status, code, message) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({ error: { code, message } }, { status }),
    ),
  );

  await expect(getAdministratorOverview()).rejects.toMatchObject({
    code,
    status,
    message,
  });
});

it.each([
  [500, { error: { code: "MONGODB_ERROR", message: "PRIVATE-HOST" } }],
  [500, { error: { code: "ADMIN_OVERVIEW_UNAVAILABLE", message: "PRIVATE" } }],
  [403, { error: { code: "ADMINISTRATOR_REQUIRED", message: "PRIVATE" } }],
  [500, "PRIVATE-NON-JSON"],
])("redacts an unapproved %i response", async (status, body) => {
  const response =
    typeof body === "string"
      ? new Response(body, { status })
      : Response.json(body, { status });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

  const error = await getAdministratorOverview().catch((reason) => reason);
  expect(error).toMatchObject({
    code: "ADMIN_OVERVIEW_UNAVAILABLE",
    status,
    message: "Administrator overview is temporarily unavailable",
  });
  expect(JSON.stringify(error)).not.toMatch(/PRIVATE|MONGODB|HOST/i);
});
```

Add network and abort tests:

```ts
it("reduces network failures to the generic safe error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("mongodb://PRIVATE-HOST/database")),
  );
  await expect(getAdministratorOverview()).rejects.toMatchObject({
    code: "ADMIN_OVERVIEW_UNAVAILABLE",
    status: 0,
  });
});

it("preserves aborts so the component can ignore them", async () => {
  const controller = new AbortController();
  controller.abort();
  const aborted = new DOMException("PRIVATE-ABORT", "AbortError");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(aborted));

  await expect(getAdministratorOverview(controller.signal)).rejects.toBe(
    aborted,
  );
});
```

- [ ] **Step 2: Run the test to verify the red state**

Run:

```powershell
npm.cmd test -- src/lib/admin/browser-client.test.ts
```

Expected: FAIL because `./browser-client` does not exist.

- [ ] **Step 3: Implement the strict browser client**

Create `web/src/lib/admin/browser-client.ts`:

```ts
import { z } from "zod";

import {
  administratorOverviewSchema,
  type AdministratorOverview,
} from "./overview-contract";

const GENERIC_MESSAGE = "Administrator overview is temporarily unavailable";

const approvedErrors = {
  AUTHENTICATION_REQUIRED: { status: 401, message: "Authentication required" },
  ADMINISTRATOR_REQUIRED: {
    status: 403,
    message: "Administrator access required",
  },
  ADMIN_OVERVIEW_UNAVAILABLE: { status: 500, message: GENERIC_MESSAGE },
} as const;

type BrowserAdminOverviewErrorCode = keyof typeof approvedErrors;

const errorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum([
      "AUTHENTICATION_REQUIRED",
      "ADMINISTRATOR_REQUIRED",
      "ADMIN_OVERVIEW_UNAVAILABLE",
    ]),
    message: z.string(),
  }),
});

export class BrowserAdminOverviewError extends Error {
  readonly code: BrowserAdminOverviewErrorCode;
  readonly status: number;

  constructor(code: BrowserAdminOverviewErrorCode, status?: number) {
    const definition = approvedErrors[code];
    super(definition.message);
    this.name = "BrowserAdminOverviewError";
    this.code = code;
    this.status = status ?? definition.status;
  }
}

function unavailable(status: number) {
  return new BrowserAdminOverviewError("ADMIN_OVERVIEW_UNAVAILABLE", status);
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

  return new BrowserAdminOverviewError(parsed.data.error.code);
}

export async function getAdministratorOverview(
  signal?: AbortSignal,
): Promise<AdministratorOverview> {
  let response: Response;
  try {
    response = await fetch("/api/admin/overview", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (isAbort(error, signal)) throw error;
    throw unavailable(0);
  }

  if (!response.ok) throw await responseError(response);
  const parsed = administratorOverviewSchema.safeParse(await readJson(response));
  if (!parsed.success) throw unavailable(response.status);
  return parsed.data;
}
```

- [ ] **Step 4: Run the focused tests and static checks**

Run:

```powershell
npm.cmd test -- src/lib/admin/browser-client.test.ts src/lib/admin/overview-contract.test.ts
npx.cmd eslint src/lib/admin
npx.cmd tsc --noEmit --incremental false
```

Expected: all selected tests PASS; ESLint and TypeScript exit 0.

- [ ] **Step 5: Commit the browser contract**

Run from repository root:

```powershell
git add web/src/lib/admin/browser-client.ts web/src/lib/admin/browser-client.test.ts
git commit -m "feat(admin-ui): add strict overview browser client" -m "Refs #33"
```

---

### Task 2: Active-administrator access boundary

**Files:**
- Create: `web/src/components/admin/administrator-access-boundary.test.tsx`
- Create: `web/src/components/admin/administrator-access-boundary.tsx`
- Create initial shared state styles in: `web/src/components/admin/admin-overview.module.css`
- Read: `web/src/components/auth/auth-session-provider.tsx`

**Interfaces:**
- Consumes: `useAuthSession(): AuthSessionContextValue`, `useRouter().replace(path)` and `ReactNode` children.
- Produces: `AdministratorAccessBoundary({ children }: { children: ReactNode })` that mounts children only for an active administrator.

- [ ] **Step 1: Write the failing access-boundary tests**

Create `web/src/components/admin/administrator-access-boundary.test.tsx` with
the jsdom environment, existing session mock pattern and a protected fixture:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/components/auth/auth-session-provider", () => ({
  useAuthSession: vi.fn(),
}));

import { useRouter } from "next/navigation";
import {
  type AuthSessionContextValue,
  useAuthSession,
} from "@/components/auth/auth-session-provider";

import { AdministratorAccessBoundary } from "./administrator-access-boundary";

const replace = vi.fn();
const refreshSession = vi.fn().mockResolvedValue(undefined);
const administrator: NonNullable<AuthSessionContextValue["user"]> = {
  id: "admin-one",
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
};

function mockSession(overrides: Partial<AuthSessionContextValue>) {
  vi.mocked(useAuthSession).mockReturnValue({
    status: "loading",
    user: null,
    setAuthenticatedUser: vi.fn(),
    refreshSession,
    logout: vi.fn(),
    ...overrides,
  });
}

function renderBoundary() {
  return render(
    <AdministratorAccessBoundary>
      <p>Administrator overview fixture</p>
    </AdministratorAccessBoundary>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
});
afterEach(cleanup);
```

Add the complete permission tests:

```tsx
it("mounts protected content only for an active administrator", () => {
  mockSession({ status: "authenticated", user: administrator });
  renderBoundary();
  expect(screen.getByText("Administrator overview fixture")).toBeTruthy();
  expect(
    screen.getByRole("region", { name: "Administrator overview workspace" }),
  ).toBeTruthy();
});

it.each([
  ["active student", { ...administrator, role: "student" as const }],
  ["active staff", { ...administrator, role: "staff" as const }],
  [
    "suspended administrator",
    { ...administrator, status: "suspended" as const },
  ],
  [
    "deactivated administrator",
    { ...administrator, status: "deactivated" as const },
  ],
])("never mounts protected content for an %s", (_label, user) => {
  mockSession({ status: "authenticated", user });
  renderBoundary();
  expect(
    screen.getByRole("heading", { name: "Administrator access unavailable" }),
  ).toBeTruthy();
  expect(screen.getByRole("link", { name: "Back to dashboard" }).getAttribute("href"))
    .toBe("/dashboard");
  expect(screen.queryByText("Administrator overview fixture")).toBeNull();
});

it("redirects an unauthenticated visitor without mounting children", async () => {
  mockSession({ status: "unauthenticated", user: null });
  renderBoundary();
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  expect(screen.queryByText("Administrator overview fixture")).toBeNull();
});

it("announces loading without mounting children", () => {
  mockSession({ status: "loading", user: null });
  renderBoundary();
  expect(screen.getByRole("status").textContent).toBe(
    "Checking administrator access",
  );
  expect(screen.queryByText("Administrator overview fixture")).toBeNull();
});

it("retries an unavailable session without exposing the failure", async () => {
  const user = userEvent.setup();
  refreshSession.mockRejectedValueOnce(new Error("PRIVATE-SESSION"));
  mockSession({ status: "unavailable", user: null });
  renderBoundary();

  await user.click(screen.getByRole("button", { name: "Retry session check" }));
  expect(refreshSession).toHaveBeenCalledOnce();
  expect(document.body.textContent).not.toContain("PRIVATE-SESSION");
});
```

Add the exact account-change remount test:

```tsx
it("remounts protected content when the authorised account changes", () => {
  let mountCount = 0;

  function Probe() {
    const mountNumber = ++mountCount;
    return <p>Administrator workspace {mountNumber}</p>;
  }

  mockSession({ status: "authenticated", user: administrator });
  const view = render(
    <AdministratorAccessBoundary>
      <Probe />
    </AdministratorAccessBoundary>,
  );
  expect(screen.getByText("Administrator workspace 1")).toBeTruthy();

  mockSession({
    status: "authenticated",
    user: { ...administrator, id: "admin-two" },
  });
  view.rerender(
    <AdministratorAccessBoundary>
      <Probe />
    </AdministratorAccessBoundary>,
  );
  expect(screen.getByText("Administrator workspace 2")).toBeTruthy();

  mockSession({
    status: "authenticated",
    user: { ...administrator, id: "student-one", role: "student" },
  });
  view.rerender(
    <AdministratorAccessBoundary>
      <Probe />
    </AdministratorAccessBoundary>,
  );
  expect(screen.queryByText(/Administrator workspace/)).toBeNull();
});
```

- [ ] **Step 2: Run the access test to verify the red state**

Run:

```powershell
npm.cmd test -- src/components/admin/administrator-access-boundary.test.tsx
```

Expected: FAIL because the access boundary does not exist.

- [ ] **Step 3: Implement the isolated access boundary**

Create `web/src/components/admin/administrator-access-boundary.tsx`. Follow
the established staff boundary state/focus pattern but use this exact access
predicate and administrator copy:

```tsx
"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuthSession } from "@/components/auth/auth-session-provider";

import styles from "./admin-overview.module.css";

export function AdministratorAccessBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const session = useAuthSession();
  const [isRetrying, setIsRetrying] = useState(false);
  const retryInFlight = useRef(false);
  const hasAuthenticatedUser =
    session.status === "authenticated" && session.user !== null;
  const hasAdministratorAccess =
    session.status === "authenticated" &&
    session.user !== null &&
    session.user.status === "active" &&
    session.user.role === "administrator";

  useEffect(() => {
    if (session.status === "unauthenticated") router.replace("/login");
  }, [router, session.status]);

  async function handleRetry() {
    if (retryInFlight.current) return;
    retryInFlight.current = true;
    setIsRetrying(true);
    try {
      await session.refreshSession();
    } catch {
      // The visible state remains generic.
    } finally {
      retryInFlight.current = false;
      setIsRetrying(false);
    }
  }

  if (
    session.status === "loading" ||
    session.status === "unauthenticated" ||
    (session.status === "authenticated" && !session.user)
  ) {
    return (
      <p className={styles.loading} role="status" aria-live="polite">
        {session.status === "unauthenticated"
          ? "Taking you to sign in"
          : "Checking administrator access"}
      </p>
    );
  }

  if (session.status === "unavailable") {
    return (
      <section className={styles.statePanel} aria-labelledby="admin-session-error">
        <h1 id="admin-session-error">We could not check your account</h1>
        <p>Your session may still be active. Retry when the service is available.</p>
        <button
          type="button"
          disabled={isRetrying}
          onClick={() => void handleRetry()}
        >
          {isRetrying ? "Checking session" : "Retry session check"}
        </button>
      </section>
    );
  }

  if (hasAuthenticatedUser && !hasAdministratorAccess) {
    return (
      <section className={styles.statePanel} aria-labelledby="admin-permission">
        <h1 id="admin-permission">Administrator access unavailable</h1>
        <p>Only active administrator accounts can view system statistics.</p>
        <Link href="/dashboard">Back to dashboard</Link>
      </section>
    );
  }

  if (!hasAdministratorAccess || !session.user) return null;

  return (
    <Fragment key={session.user.id}>
      <div role="region" aria-label="Administrator overview workspace">
        {children}
      </div>
    </Fragment>
  );
}
```

Extend the implementation block with these exact focus and retry-live-state
members:

```tsx
const [retryPhase, setRetryPhase] = useState<
  "idle" | "checking" | "settled"
>("idle");
const liveRegionRef = useRef<HTMLParagraphElement>(null);
const retryButtonRef = useRef<HTMLButtonElement>(null);
const permissionHeadingRef = useRef<HTMLHeadingElement>(null);
const workspaceRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (retryPhase === "checking") {
    liveRegionRef.current?.focus();
    return;
  }
  if (retryPhase !== "settled") return;

  if (hasAdministratorAccess) workspaceRef.current?.focus();
  else if (session.status === "unavailable") retryButtonRef.current?.focus();
  else if (hasAuthenticatedUser) permissionHeadingRef.current?.focus();
  else liveRegionRef.current?.focus();

  const timeoutId = window.setTimeout(() => setRetryPhase("idle"), 0);
  return () => window.clearTimeout(timeoutId);
}, [
  hasAdministratorAccess,
  hasAuthenticatedUser,
  retryPhase,
  session.status,
]);
```

`handleRetry` must set `retryPhase` to `checking` before awaiting
`refreshSession`, then set it to `settled` in `finally`. Attach the refs to the
single polite status paragraph, retry button, permission heading and authorised
workspace. Use these exact focus targets:

- retry start -> the live status region;
- successful authorised retry -> the overview workspace;
- still unavailable -> the retry button;
- authenticated forbidden result -> the permission heading.

Create the initial `admin-overview.module.css` with `.loading`, `.statePanel`,
`.visuallyHidden`, `.authorizedContent`, state buttons/links with a minimum
height of 44 pixels, `:focus-visible`, and reduced-motion-safe skeleton rules.

- [ ] **Step 4: Run the boundary tests and static checks**

Run:

```powershell
npm.cmd test -- src/components/admin/administrator-access-boundary.test.tsx
npx.cmd eslint src/components/admin
npx.cmd tsc --noEmit --incremental false
```

Expected: tests PASS; ESLint and TypeScript exit 0.

- [ ] **Step 5: Commit the access boundary**

Run from repository root:

```powershell
git add web/src/components/admin/administrator-access-boundary.tsx web/src/components/admin/administrator-access-boundary.test.tsx web/src/components/admin/admin-overview.module.css
git commit -m "feat(admin-ui): guard administrator overview access" -m "Refs #33"
```

---

### Task 3: Overview request lifecycle and metric presentation

**Files:**
- Create: `web/src/components/admin/admin-overview-client.test.tsx`
- Create: `web/src/components/admin/admin-overview-client.tsx`
- Modify: `web/src/components/admin/admin-overview.module.css`
- Consume: `web/src/lib/admin/browser-client.ts`

**Interfaces:**
- Consumes: `getAdministratorOverview(signal?)`, `BrowserAdminOverviewError`, `useAuthSession().refreshSession()` and `useRouter().replace()`.
- Produces: `AdminOverviewClient(): ReactNode`, which loads once when mounted and renders only validated `AdministratorOverview` values.

- [ ] **Step 1: Write failing presentation and initial-load tests**

Create `web/src/components/admin/admin-overview-client.test.tsx` with jsdom,
mock the browser client, auth provider and router, then define the same exact
`overview` fixture from Task 1.

Use this setup:

```tsx
// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/components/auth/auth-session-provider", () => ({
  useAuthSession: vi.fn(),
}));
vi.mock("@/lib/admin/browser-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin/browser-client")>(
    "@/lib/admin/browser-client",
  );
  return { ...actual, getAdministratorOverview: vi.fn() };
});

import { useRouter } from "next/navigation";
import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  BrowserAdminOverviewError,
  getAdministratorOverview,
} from "@/lib/admin/browser-client";

import { AdminOverviewClient } from "./admin-overview-client";

const replace = vi.fn();
const refreshSession = vi.fn().mockResolvedValue(undefined);

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
```

Test initial load, complete metric copy and privacy:

```tsx
it("loads once and renders every metric with a definition", async () => {
  vi.mocked(getAdministratorOverview).mockResolvedValue(overview);
  const { container } = render(<AdminOverviewClient />);

  expect(screen.getByRole("status").textContent).toContain(
    "Loading administrator overview",
  );
  expect(getAdministratorOverview).toHaveBeenCalledOnce();
  expect(
    await screen.findByRole("heading", { name: "Administrator overview" }),
  ).toBeTruthy();
  expect(screen.getByText("Lost submitted")).toBeTruthy();
  expect(screen.getByText("Found submitted")).toBeTruthy();
  expect(screen.getByText("Total submitted")).toBeTruthy();
  expect(screen.getByText("Unresolved")).toBeTruthy();
  expect(screen.getByText("Recovered")).toBeTruthy();
  expect(screen.getByText("Matched")).toBeTruthy();
  expect(screen.getByText("Pending Claims")).toBeTruthy();
  expect(screen.getByText("Approved Claims")).toBeTruthy();
  expect(screen.getByText("Rejected Claims")).toBeTruthy();
  expect(screen.getByText("Withdrawn Claims")).toBeTruthy();
  expect(screen.getByText("Completed Claims")).toBeTruthy();
  expect(screen.getByText("Total Claims")).toBeTruthy();
  expect(screen.getByText("Active accounts")).toBeTruthy();
  expect(screen.getByText("Suspended accounts")).toBeTruthy();
  expect(screen.getByText("Deactivated accounts")).toBeTruthy();
  expect(screen.getByText("Total accounts")).toBeTruthy();
  expect(screen.getByText(/25 Aug 2026/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Review ownership Claims" }).getAttribute("href"))
    .toBe("/staff/claims");
  expect(container.textContent).not.toMatch(
    /admin@example|userId|reportId|claimId|password|token|verification/i,
  );
});
```

Read the `dt`/`dd` pairs rather than merely checking numbers exist. Assert each
metric value belongs to the named term, for example:

```tsx
const lostTerm = screen.getByText("Lost submitted");
expect(lostTerm.tagName).toBe("DT");
expect(lostTerm.parentElement?.querySelector("dd")?.textContent).toBe("4");
expect(lostTerm.parentElement?.textContent).toContain(
  "Non-draft lost reports submitted to Campus Find",
);
```

Test the all-zero state by replacing every count and derived total with zero.
Assert `No activity recorded yet` is visible while every metric still renders
the value `0`.

- [ ] **Step 2: Write failing refresh, error and stale-request tests**

Use a deferred helper:

```ts
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}
```

Add these exact behaviours:

```tsx
it("retains the current snapshot while refreshing", async () => {
  const user = userEvent.setup();
  const refresh = deferred<typeof overview>();
  vi.mocked(getAdministratorOverview)
    .mockResolvedValueOnce(overview)
    .mockReturnValueOnce(refresh.promise);
  render(<AdminOverviewClient />);
  await screen.findByText("Lost submitted");

  await user.click(screen.getByRole("button", { name: "Refresh overview" }));
  expect(screen.getByText("4")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Refreshing overview" }).hasAttribute("disabled"),
  ).toBe(true);

  refresh.resolve({
    ...overview,
    reports: { ...overview.reports, submittedLost: 5, submittedTotal: 8 },
  });
  await waitFor(() => expect(screen.getByText("5")).toBeTruthy());
});

it("retains valid data and shows a safe alert after refresh failure", async () => {
  const user = userEvent.setup();
  vi.mocked(getAdministratorOverview)
    .mockResolvedValueOnce(overview)
    .mockRejectedValueOnce(new Error("PRIVATE-DATABASE"));
  render(<AdminOverviewClient />);
  await screen.findByText("Lost submitted");
  await user.click(screen.getByRole("button", { name: "Refresh overview" }));

  expect((await screen.findByRole("alert")).textContent).toContain(
    "We could not refresh the overview",
  );
  expect(screen.getByText("4")).toBeTruthy();
  expect(document.body.textContent).not.toContain("PRIVATE-DATABASE");
});

it("renders a retryable safe panel after initial failure", async () => {
  const user = userEvent.setup();
  vi.mocked(getAdministratorOverview)
    .mockRejectedValueOnce(new Error("PRIVATE-HOST"))
    .mockResolvedValueOnce(overview);
  render(<AdminOverviewClient />);
  expect(await screen.findByText("Administrator overview unavailable")).toBeTruthy();
  expect(document.body.textContent).not.toContain("PRIVATE-HOST");
  await user.click(screen.getByRole("button", { name: "Retry overview" }));
  expect(await screen.findByText("Lost submitted")).toBeTruthy();
});
```

Add this exact stale-unmount test. It captures the refresh signal, unmounts the
old client, mounts a new client, and proves the late old result cannot replace
the new snapshot:

```tsx
it("aborts an in-flight refresh and ignores its late completion after unmount", async () => {
  const user = userEvent.setup();
  const oldRefresh = deferred<typeof overview>();
  const newOverview = {
    ...overview,
    reports: { ...overview.reports, submittedLost: 6, submittedTotal: 9 },
  };
  vi.mocked(getAdministratorOverview)
    .mockResolvedValueOnce(overview)
    .mockReturnValueOnce(oldRefresh.promise)
    .mockResolvedValueOnce(newOverview);

  const oldView = render(<AdminOverviewClient />);
  await screen.findByText("Lost submitted");
  await user.click(screen.getByRole("button", { name: "Refresh overview" }));
  const oldSignal = vi.mocked(getAdministratorOverview).mock.calls[1][0];
  expect(oldSignal?.aborted).toBe(false);

  oldView.unmount();
  expect(oldSignal?.aborted).toBe(true);

  render(<AdminOverviewClient />);
  await waitFor(() => {
    const lost = screen.getByText("Lost submitted");
    expect(lost.parentElement?.querySelector("dd")?.textContent).toBe("6");
  });

  oldRefresh.resolve({
    ...overview,
    reports: { ...overview.reports, submittedLost: 99, submittedTotal: 102 },
  });
  await Promise.resolve();
  const lost = screen.getByText("Lost submitted");
  expect(lost.parentElement?.querySelector("dd")?.textContent).toBe("6");
});
```

Add authentication handling:

```tsx
it("refreshes the session and redirects after authentication expiry", async () => {
  vi.mocked(getAdministratorOverview).mockRejectedValue(
    new BrowserAdminOverviewError("AUTHENTICATION_REQUIRED"),
  );
  render(<AdminOverviewClient />);
  await waitFor(() => expect(refreshSession).toHaveBeenCalledOnce());
  expect(replace).toHaveBeenCalledWith("/login");
});

it("refreshes the session and removes stale metrics after access changes", async () => {
  vi.mocked(getAdministratorOverview)
    .mockResolvedValueOnce(overview)
    .mockRejectedValueOnce(
      new BrowserAdminOverviewError("ADMINISTRATOR_REQUIRED"),
    );
  const user = userEvent.setup();
  render(<AdminOverviewClient />);
  await screen.findByText("Lost submitted");
  await user.click(screen.getByRole("button", { name: "Refresh overview" }));
  await waitFor(() => expect(refreshSession).toHaveBeenCalledOnce());
  expect(screen.queryByText("Lost submitted")).toBeNull();
  expect(screen.getByText("Administrator access changed")).toBeTruthy();
});
```

- [ ] **Step 3: Run the component test to verify the red state**

Run:

```powershell
npm.cmd test -- src/components/admin/admin-overview-client.test.tsx
```

Expected: FAIL because `AdminOverviewClient` does not exist.

- [ ] **Step 4: Implement the request state machine and metric groups**

Create `web/src/components/admin/admin-overview-client.tsx` with these exact
state and metric definitions:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  BrowserAdminOverviewError,
  getAdministratorOverview,
} from "@/lib/admin/browser-client";
import type { AdministratorOverview } from "@/lib/admin/overview-contract";

import styles from "./admin-overview.module.css";

type OverviewState =
  | { status: "loading" }
  | { status: "ready"; data: AdministratorOverview; isRefreshing: boolean; refreshFailed: boolean }
  | { status: "error" }
  | { status: "accessChanged" };

const reportMetrics = [
  ["submittedLost", "Lost submitted", "Non-draft lost reports submitted to Campus Find"],
  ["submittedFound", "Found submitted", "Non-draft found reports submitted to Campus Find"],
  ["submittedTotal", "Total submitted", "All submitted lost and found reports"],
  ["unresolved", "Unresolved", "Reports that remain open or claim pending"],
  ["recovered", "Recovered", "Reports resolved through the recovery workflow"],
  ["matched", "Matched", "Distinct reports with an approved or completed Claim"],
] as const;

const claimMetrics = [
  ["pending", "Pending Claims", "Claims waiting for staff review"],
  ["approved", "Approved Claims", "Claims approved for handover"],
  ["rejected", "Rejected Claims", "Claims rejected after review"],
  ["withdrawn", "Withdrawn Claims", "Claims withdrawn by the claimant"],
  ["completed", "Completed Claims", "Claims with a recorded handover"],
  ["total", "Total Claims", "All Claims in the system"],
] as const;

const accountMetrics = [
  ["active", "Active accounts", "Accounts currently permitted to use Campus Find"],
  ["suspended", "Suspended accounts", "Accounts temporarily unavailable"],
  ["deactivated", "Deactivated accounts", "Accounts no longer active"],
  ["total", "Total accounts", "All registered accounts"],
] as const;
```

Implement `loadOverview` with all of these invariants:

```tsx
const mounted = useRef(false);
const requestId = useRef(0);
const controller = useRef<AbortController | null>(null);

const loadOverview = useCallback(async (mode: "initial" | "refresh") => {
  const currentRequest = ++requestId.current;
  controller.current?.abort();
  const nextController = new AbortController();
  controller.current = nextController;

  setState((current) =>
    mode === "refresh" && current.status === "ready"
      ? { ...current, isRefreshing: true, refreshFailed: false }
      : { status: "loading" },
  );

  try {
    const data = await getAdministratorOverview(nextController.signal);
    if (!mounted.current || requestId.current !== currentRequest) return;
    setState({ status: "ready", data, isRefreshing: false, refreshFailed: false });
  } catch (error) {
    if (!mounted.current || requestId.current !== currentRequest || nextController.signal.aborted) return;
    if (error instanceof BrowserAdminOverviewError) {
      if (error.code === "AUTHENTICATION_REQUIRED") {
        setState({ status: "accessChanged" });
        await refreshSession().catch(() => undefined);
        if (mounted.current && requestId.current === currentRequest) router.replace("/login");
        return;
      }
      if (error.code === "ADMINISTRATOR_REQUIRED") {
        setState({ status: "accessChanged" });
        await refreshSession().catch(() => undefined);
        return;
      }
    }
    setState((current) =>
      mode === "refresh" && current.status === "ready"
        ? { ...current, isRefreshing: false, refreshFailed: true }
        : { status: "error" },
    );
  }
}, [refreshSession, router]);
```

On mount set `mounted.current = true`, schedule the initial load with
`window.setTimeout(..., 0)` to avoid synchronous effect-state lint warnings,
and on cleanup clear the timeout, set mounted false, increment request ID and
abort the controller.

Render:

- `loading`: a polite `Loading administrator overview` status and three
  skeleton blocks;
- `error`: `Administrator overview unavailable`, generic text and
  `Retry overview`;
- `accessChanged`: `Administrator access changed`, no retained metrics and a
  `/dashboard` link;
- `ready`: `h1`, description, generated time, refresh button, optional zero
  notice, optional refresh alert, three sections and semantic metric lists.

Use a small internal `MetricList` component with typed `entries` and `values`
instead of repeating list markup. Its exact output is:

```tsx
<dl className={styles.metricGrid}>
  {entries.map(([key, label, description]) => (
    <div className={styles.metricCard} key={key}>
      <dt>{label}</dt>
      <dd>{values[key]}</dd>
      <p>{description}</p>
    </div>
  ))}
</dl>
```

Compute zero activity only from the three validated totals:

```ts
const hasNoActivity =
  data.reports.submittedTotal === 0 &&
  data.claims.total === 0 &&
  data.accounts.total === 0;
```

Format `generatedAt` using one module-level `Intl.DateTimeFormat("en-NZ", {
dateStyle: "medium", timeStyle: "short" })`.

- [ ] **Step 5: Complete the CSS and responsive assertions**

Extend `admin-overview.module.css` with:

- `.overview` width `min(100% - 2rem, 72rem)` and responsive vertical spacing;
- a header layout that wraps actions rather than overflowing;
- `.metricGrid` using `repeat(auto-fit, minmax(min(100%, 12rem), 1fr))`;
- metric cards with visible `dt`, large tabular-number `dd` and persistent
  description text;
- report group stronger visual hierarchy without colour-only meaning;
- state/refresh alerts that do not move controls off screen;
- buttons and links with `min-height: 44px`, visible `:focus-visible` outline;
- `@media (max-width: 20rem)` forcing one column and one-column actions;
- `overflow-wrap: anywhere` for user-visible strings;
- `@media (prefers-reduced-motion: reduce)` disabling skeleton animation.

Add a stylesheet test:

```tsx
it("keeps overview controls and metrics usable at 320 pixels", () => {
  const css = readFileSync(
    resolve("src/components/admin/admin-overview.module.css"),
    "utf8",
  );
  expect(css).toMatch(/min-height:\s*44px/);
  expect(css).toMatch(/:focus-visible/);
  expect(css).toMatch(/@media\s*\(max-width:\s*20rem\)/);
  expect(css).toMatch(/grid-template-columns:\s*1fr/);
  expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
});
```

- [ ] **Step 6: Run component and dependent checks**

Run:

```powershell
npm.cmd test -- src/components/admin/admin-overview-client.test.tsx src/lib/admin/browser-client.test.ts src/components/admin/administrator-access-boundary.test.tsx
npx.cmd eslint src/components/admin src/lib/admin
npx.cmd tsc --noEmit --incremental false
```

Expected: all selected tests PASS; ESLint and TypeScript exit 0.

- [ ] **Step 7: Commit the overview component**

Run from repository root:

```powershell
git add web/src/components/admin/admin-overview-client.tsx web/src/components/admin/admin-overview-client.test.tsx web/src/components/admin/admin-overview.module.css
git commit -m "feat(admin-ui): present administrator overview" -m "Refs #33"
```

---

### Task 4: Route and administrator-only navigation integration

**Files:**
- Create: `web/src/app/admin/page.tsx`
- Create: `web/src/app/admin/admin-page.test.tsx`
- Modify: `web/src/components/site-header.tsx`
- Modify: `web/src/components/site-header.test.tsx`
- Modify: `web/src/components/dashboard/dashboard-client.tsx`
- Modify: `web/src/components/dashboard/dashboard-client.test.tsx`

**Interfaces:**
- Consumes: `AdministratorAccessBoundary`, `AdminOverviewClient` and existing `PublicUser` session state.
- Produces: `/admin` page metadata/title, active-administrator header link and active-administrator Dashboard workflow link.

- [ ] **Step 1: Write the failing page composition test**

Create `web/src/app/admin/admin-page.test.tsx`:

```tsx
// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("@/components/admin/administrator-access-boundary", () => ({
  AdministratorAccessBoundary: ({ children }: { children: React.ReactNode }) => (
    <section aria-label="Administrator access fixture">{children}</section>
  ),
}));
vi.mock("@/components/admin/admin-overview-client", () => ({
  AdminOverviewClient: () => <section aria-label="Administrator overview fixture" />,
}));

import AdminPage, { metadata } from "./page";

it("composes the protected administrator overview route", () => {
  const { container } = render(<AdminPage />);
  expect(metadata.title).toBe("Administrator overview");
  expect(container.querySelector("main#main-content")).toBeTruthy();
  expect(screen.getByLabelText("Administrator access fixture")).toBeTruthy();
  expect(screen.getByLabelText("Administrator overview fixture")).toBeTruthy();
});
```

- [ ] **Step 2: Extend navigation tests before implementation**

In `site-header.test.tsx`, add:

```tsx
it("shows Admin overview only to an active administrator", () => {
  mockSession({
    status: "authenticated",
    user: { ...safeUser, role: "administrator", status: "active" },
  });
  render(<SiteHeader />);
  expect(screen.getByRole("link", { name: "Admin overview" }).getAttribute("href"))
    .toBe("/admin");
});

it.each([
  ["student", { ...safeUser, role: "student" as const, status: "active" as const }],
  ["staff", { ...safeUser, role: "staff" as const, status: "active" as const }],
  [
    "suspended administrator",
    { ...safeUser, role: "administrator" as const, status: "suspended" as const },
  ],
  [
    "deactivated administrator",
    { ...safeUser, role: "administrator" as const, status: "deactivated" as const },
  ],
])("hides Admin overview from a %s", (_label, user) => {
  mockSession({ status: "authenticated", user });
  render(<SiteHeader />);
  expect(screen.queryByRole("link", { name: "Admin overview" })).toBeNull();
});
```

In `dashboard-client.test.tsx`, add:

```tsx
it("links an active administrator to the system overview", () => {
  mockSession({
    status: "authenticated",
    user: { ...safeUser, role: "administrator", status: "active" },
  });
  render(<DashboardClient />);
  expect(
    screen.getByRole("link", { name: "Review system overview" }).getAttribute("href"),
  ).toBe("/admin");
});

it.each([
  ["student", { ...safeUser, role: "student" as const, status: "active" as const }],
  ["staff", { ...safeUser, role: "staff" as const, status: "active" as const }],
  [
    "inactive administrator",
    { ...safeUser, role: "administrator" as const, status: "suspended" as const },
  ],
])("does not link a %s to the system overview", (_label, user) => {
  mockSession({ status: "authenticated", user });
  render(<DashboardClient />);
  expect(screen.queryByRole("link", { name: "Review system overview" })).toBeNull();
});
```

- [ ] **Step 3: Run integration tests to verify the red state**

Run:

```powershell
npm.cmd test -- src/app/admin/admin-page.test.tsx src/components/site-header.test.tsx src/components/dashboard/dashboard-client.test.tsx
```

Expected: page test FAILS because `/admin/page.tsx` does not exist; navigation
tests FAIL because the administrator links do not exist.

- [ ] **Step 4: Implement the protected page**

Create `web/src/app/admin/page.tsx`:

```tsx
import type { Metadata } from "next";

import { AdministratorAccessBoundary } from "@/components/admin/administrator-access-boundary";
import { AdminOverviewClient } from "@/components/admin/admin-overview-client";

export const metadata: Metadata = { title: "Administrator overview" };

export default function AdminPage() {
  return (
    <main id="main-content">
      <AdministratorAccessBoundary>
        <AdminOverviewClient />
      </AdministratorAccessBoundary>
    </main>
  );
}
```

- [ ] **Step 5: Add exact role-specific navigation**

In `site-header.tsx`, define:

```ts
const canViewAdminOverview =
  isActive && user?.role === "administrator";
```

Inside authenticated navigation, immediately before the Dashboard link, add:

```tsx
{canViewAdminOverview ? (
  <Link className={`${styles.navLink} text-link`} href="/admin">
    Admin overview
  </Link>
) : null}
```

In `dashboard-client.tsx`, append one workflow entry only for an active
administrator:

```tsx
...(user.status === "active" && user.role === "administrator"
  ? [
      {
        title: "Review system overview",
        description:
          "Review current report, recovery, Claim and account statistics.",
        href: "/admin",
      },
    ]
  : []),
```

Place this entry after profile settings. Do not alter the existing student,
staff, report, Claim or profile destinations.

- [ ] **Step 6: Run the complete focused frontend gate**

Run:

```powershell
npm.cmd test -- src/lib/admin/browser-client.test.ts src/components/admin/administrator-access-boundary.test.tsx src/components/admin/admin-overview-client.test.tsx src/app/admin/admin-page.test.tsx src/components/site-header.test.tsx src/components/dashboard/dashboard-client.test.tsx
npx.cmd eslint src/lib/admin src/components/admin src/app/admin src/components/site-header.tsx src/components/site-header.test.tsx src/components/dashboard/dashboard-client.tsx src/components/dashboard/dashboard-client.test.tsx
npx.cmd tsc --noEmit --incremental false
```

Expected: all Issue #33 and navigation tests PASS; ESLint and TypeScript exit
0.

- [ ] **Step 7: Commit the page and navigation integration**

Run from repository root:

```powershell
git add web/src/app/admin/page.tsx web/src/app/admin/admin-page.test.tsx web/src/components/site-header.tsx web/src/components/site-header.test.tsx web/src/components/dashboard/dashboard-client.tsx web/src/components/dashboard/dashboard-client.test.tsx
git commit -m "feat(admin-ui): expose administrator overview page" -m "Refs #33"
```

---

### Task 5: Full verification and delivery evidence

**Files:**
- Create: `docs/superpowers/verification/2026-08-25-administrator-overview-frontend.md`

**Interfaces:**
- Consumes: the completed Issue #33 diff and observed command output.
- Produces: exact verification evidence and a push-ready clean branch.

- [ ] **Step 1: Run focused and full automated gates sequentially**

Run from `web/` without parallel build/test processes:

```powershell
npm.cmd test -- src/lib/admin/browser-client.test.ts src/components/admin/administrator-access-boundary.test.tsx src/components/admin/admin-overview-client.test.tsx src/app/admin/admin-page.test.tsx src/components/site-header.test.tsx src/components/dashboard/dashboard-client.test.tsx
npm.cmd test
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run build
npm.cmd audit
```

Expected: focused and full tests PASS; lint and TypeScript exit 0; the route
table contains `○ /admin` or `ƒ /admin`; audit reports zero vulnerabilities.

- [ ] **Step 2: Run privacy, environment and scope checks**

Run from repository root:

```powershell
git diff --check develop...HEAD
git check-ignore -v web/.env.local
git ls-files -- web/.env web/.env.local .env .env.local
rg -n "passwordHash|tokenHash|raw-session-token|PRIVATE_SECRET|expectedAnswer|responses\.answer|reporterId|claimantId|__v" web/src/lib/admin web/src/components/admin web/src/app/admin
git diff develop...HEAD -- web/package.json web/package-lock.json web/src/models web/src/app/api
```

Expected:

- branch diff check exits 0;
- `web/.gitignore` reports `.env.local` ignored;
- no real environment file is tracked;
- sensitive terms occur only in explicit redaction tests;
- dependency, model and backend API scope diff is empty.

- [ ] **Step 3: Run one visual implementation audit**

Use the available frontend audit/review skill once against the completed
`/admin` page, administrator components, CSS and navigation integration. Fix
only concrete accessibility, responsive, hierarchy or interaction findings
inside Issue #33 scope. Record the tool and disposition in verification
evidence.

- [ ] **Step 4: Perform a local browser safety check**

Start the existing app only if no server is already running:

```powershell
npm.cmd run dev
```

In the browser, visit `http://localhost:3000/admin` without using or displaying
real credentials. Confirm an unauthenticated session redirects to `/login`,
there is no horizontal overflow at desktop and 320 pixels, and no console
error is emitted. Do not create an Atlas-backed test administrator solely for
this check; authorised rendering is covered with component fixtures.

- [ ] **Step 5: Write exact verification evidence**

Create `docs/superpowers/verification/2026-08-25-administrator-overview-frontend.md`.
Write these exact section headings:

```markdown
# Administrator overview frontend verification

## Scope
## Automated verification
## Permission and privacy evidence
## Accessibility and responsive evidence
## Browser evidence
```

Under `Scope`, state that Issue #33 adds an active-administrator-only `/admin`
overview consuming the existing read-only endpoint and changes no backend
metric, model, dependency or Atlas data.

Under `Automated verification`, add a Markdown table with rows for the focused
Issue #33 test command, `npm test`, `npm run lint`, TypeScript, build, audit and
branch diff check. Copy the exact passed file/test counts printed by Step 1;
write `Passed` only for commands that print no count. Include the exact `/admin`
route marker printed by the build and the exact audit vulnerability count.

Under `Permission and privacy evidence`, state every tested session/role case,
the fact that blocked sessions never mount the data client, strict response
parsing, absence of private fields, ignored environment files and mocked
Atlas-free tests.

Under `Accessibility and responsive evidence`, state the semantic metric
structures, live states, focus and touch behaviour, reduced-motion rule,
320-pixel result and the exact frontend-audit tool/disposition.

Under `Browser evidence`, state the observed unauthenticated `/admin` redirect,
desktop and 320-pixel overflow result, and console result. Do not include a
credential, cookie, connection string or raw environment value.

- [ ] **Step 6: Run the final diff and clean-tree checks**

Run:

```powershell
git diff --check
git status --short --branch
git diff --stat develop...HEAD
```

Expected: only the verification document is uncommitted before the final
commit; the complete branch diff remains within Issue #33.

- [ ] **Step 7: Commit verification evidence**

Run:

```powershell
git add docs/superpowers/verification/2026-08-25-administrator-overview-frontend.md
git commit -m "docs: record administrator overview frontend verification" -m "Refs #33"
```

- [ ] **Step 8: Push the reviewed branch**

After confirming no environment file or credential is tracked:

```powershell
git push -u origin feature/issue-33-admin-overview-frontend
```

Create a Pull Request into `develop` with `Closes #33`, the exact verification
counts, the permission/privacy summary and the no-Atlas statement.
