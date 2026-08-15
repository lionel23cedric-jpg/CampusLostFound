# Authentication Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an accessible Campus Noticeboard authentication frontend that lets users register, sign in, view a protected account dashboard and sign out through the existing secure API.

**Architecture:** A typed browser client validates all public API envelopes, while one React context owns the current safe user and the loading/authenticated/unauthenticated/unavailable session states. Focused client forms consume that context and existing server validation contracts; App Router pages compose the forms, responsive shell and static Campus Noticeboard content without importing database or token internals.

**Tech Stack:** Next.js 16.2.12 App Router, React 19.2.4, TypeScript 5, Tailwind CSS 4 plus CSS Modules, Zod 4.4.3, Vitest 4.1.10, React Testing Library, Testing Library user-event and jsdom.

## Global Constraints

- Work only on `feature/issue-14-authentication-frontend`, based on the latest `develop`.
- Follow `docs/superpowers/specs/2026-08-15-authentication-frontend-design.md` and the approved Campus Noticeboard direction.
- Reuse the existing `/api/auth/register`, `/api/auth/login`, `/api/auth/me` and `/api/auth/logout` contracts without changing their backend behaviour.
- Never read, log or store the HttpOnly session cookie, password, raw token, token hash or password hash in frontend state outside the active password inputs.
- Never use localStorage, sessionStorage, URL parameters or analytics for credentials or session state.
- Render all user-controlled strings through escaped React text; do not use `dangerouslySetInnerHTML`.
- Preserve password whitespace and enforce the existing 10-128 character contract; do not trim passwords.
- Keep password confirmation in the browser only and never send it to the registration endpoint.
- Use visible labels, described errors, `aria-invalid`, a form alert, keyboard controls, visible focus and reduced-motion support.
- Keep example notices explicitly illustrative; do not imply that they are live database records or create broken links to report features that do not exist.
- Automated tests must mock all fetch calls and must not read `.env.local`, connect to Atlas or create real users, profiles or sessions.
- Do not add report forms, report browsing, profile editing, password reset, email verification, staff/admin screens, uploads, notifications or AI matching.
- The only new dependencies are DOM-testing development dependencies; do not add a runtime UI or state-management package.
- Every implementation task follows red-green TDD, focused ESLint and a small commit referencing `#14`.

## File Map

- `web/package.json`: DOM-testing development dependencies only.
- `web/package-lock.json`: npm-generated lock changes for those development dependencies.
- `web/src/lib/auth/browser-client.ts`: runtime-validated same-origin authentication calls and safe browser errors.
- `web/src/lib/auth/browser-client.test.ts`: browser-client request, response and failure tests.
- `web/src/components/auth/auth-session-provider.tsx`: shared browser session state and actions.
- `web/src/components/auth/auth-session-provider.test.tsx`: session state transition tests.
- `web/src/components/auth/form-validation.ts`: client form values, field errors and validation adapters.
- `web/src/components/auth/form-validation.test.ts`: browser validation and password-preservation tests.
- `web/src/components/auth/password-field.tsx`: accessible password input with a visibility control.
- `web/src/components/auth/password-field.test.tsx`: password accessibility and interaction tests.
- `web/src/components/auth/form-message.tsx`: field and form-level message primitives.
- `web/src/components/auth/auth-panel.tsx`: shared authentication-page heading and panel composition.
- `web/src/components/auth/auth-panel.module.css`: authentication panel styling.
- `web/src/components/auth/auth-form.module.css`: shared input, label, message, password-control and submit-row styling.
- `web/src/components/site-header.tsx`: product header and authentication-aware navigation.
- `web/src/components/site-header.test.tsx`: navigation state and logout tests.
- `web/src/components/site-header.module.css`: responsive noticeboard header styling.
- `web/src/app/layout.tsx`: metadata, session provider and shared header.
- `web/src/app/globals.css`: design tokens, reset, focus, typography and reduced-motion rules.
- `web/src/components/auth/login-form.tsx`: login interaction and redirect flow.
- `web/src/components/auth/login-form.test.tsx`: login validation, API, error and accessibility tests.
- `web/src/app/login/page.tsx`: login page composition and metadata.
- `web/src/components/auth/register-form.tsx`: registration interaction and redirect flow.
- `web/src/components/auth/register-form.test.tsx`: registration validation, API, error and accessibility tests.
- `web/src/app/register/page.tsx`: registration page composition and metadata.
- `web/src/app/auth-page.module.css`: shared responsive authentication-page background and layout.
- `web/src/app/page.tsx`: Campus Noticeboard public home page.
- `web/src/app/page.module.css`: responsive home hero, workflow, privacy and illustrative notice styling.
- `web/src/app/home-page.test.tsx`: home content, semantic structure and link tests.
- `web/src/components/dashboard/dashboard-client.tsx`: protected account state and safe user presentation.
- `web/src/components/dashboard/dashboard-client.test.tsx`: protection, retry and safe output tests.
- `web/src/components/dashboard/dashboard.module.css`: responsive dashboard styling.
- `web/src/app/dashboard/page.tsx`: dashboard page composition and metadata.

---

### Task 1: Add the DOM Test Harness and Typed Browser API

**Files:**
- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Create: `web/src/lib/auth/browser-client.ts`
- Create: `web/src/lib/auth/browser-client.test.ts`

**Interfaces:**
- Consumes: the existing `PublicUser`, `RegisterInput` and `LoginInput` TypeScript types and the four existing auth endpoint response contracts.
- Produces: `BrowserAuthError`, `registerAccount`, `loginAccount`, `getCurrentAccount` and `logoutAccount`.
- `BrowserAuthError` exposes only `code`, `status`, safe `message` and optional public `fields`.

- [ ] **Step 1: Install only the approved test dependencies**

Run from `web/`:

```powershell
npm.cmd install --save-dev @testing-library/react @testing-library/user-event jsdom
```

Expected: `package.json` and `package-lock.json` change; npm does not add a runtime dependency and does not remove the existing `nanoid`, `sharp` or `next.postcss` overrides.

- [ ] **Step 2: Write the failing browser-client tests**

Create `web/src/lib/auth/browser-client.test.ts` with tests that mock `globalThis.fetch` and assert:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BrowserAuthError,
  getCurrentAccount,
  loginAccount,
  logoutAccount,
  registerAccount,
} from "./browser-client";

const publicUser = {
  id: "64b64c6f2f4d9f1a2b3c4d51",
  email: "student@example.com",
  role: "student",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: "2026-08-15T02:05:00.000Z",
  profile: {
    displayName: "Student Name",
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser authentication client", () => {
  it("posts the exact login payload with same-origin credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ user: publicUser }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      loginAccount({ email: "student@example.com", password: " pass word " }),
    ).resolves.toEqual(publicUser);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "student@example.com",
        password: " pass word ",
      }),
    });
  });

  it("posts registration without password confirmation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ user: publicUser }, { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await registerAccount({
      displayName: "Student Name",
      email: "student@example.com",
      password: "secure pass",
    });

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(requestInit.body))).toEqual({
      displayName: "Student Name",
      email: "student@example.com",
      password: "secure pass",
    });
  });

  it("returns null for an unauthenticated current-user response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: "AUTHENTICATION_REQUIRED",
              message: "Authentication required",
            },
          },
          { status: 401 },
        ),
      ),
    );

    await expect(getCurrentAccount()).resolves.toBeNull();
  });

  it("accepts an empty HTTP 204 logout response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(logoutAccount()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
  });

  it("preserves only a validated public API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: "INVALID_CREDENTIALS",
              message: "Invalid email or password",
            },
          },
          { status: 401 },
        ),
      ),
    );

    await expect(
      loginAccount({ email: "student@example.com", password: "wrong pass" }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<BrowserAuthError>>({
        code: "INVALID_CREDENTIALS",
        status: 401,
        message: "Invalid email or password",
      }),
    );
  });

  it.each([
    ["malformed success", Response.json({ user: { passwordHash: "secret" } })],
    ["non-JSON failure", new Response("database trace", { status: 500 })],
  ])("hides %s responses", async (_case, response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(getCurrentAccount()).rejects.toMatchObject({
      code: "REQUEST_FAILED",
      message: "We could not complete that request. Please try again.",
    });
  });

  it("hides network exception details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("private network detail")),
    );

    await expect(getCurrentAccount()).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      message: "We could not reach the service. Please try again.",
    });
  });
});
```

- [ ] **Step 3: Run the focused test to verify the red state**

```powershell
npm.cmd test -- src/lib/auth/browser-client.test.ts
```

Expected: FAIL because `./browser-client` does not exist.

- [ ] **Step 4: Implement runtime-validated browser calls**

Create `web/src/lib/auth/browser-client.ts`. Use strict Zod schemas for the full existing `PublicUser` shape and public error envelope, then expose these signatures:

```ts
import { z } from "zod";

import type { PublicUser } from "./public-user";
import type { LoginInput, RegisterInput } from "./validation";

export type PublicFieldErrors = Record<string, string[]>;

export class BrowserAuthError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields?: PublicFieldErrors;

  constructor(options: {
    code: string;
    status: number;
    message: string;
    fields?: PublicFieldErrors;
  }) {
    super(options.message);
    this.name = "BrowserAuthError";
    this.code = options.code;
    this.status = options.status;
    this.fields = options.fields;
  }
}

export async function registerAccount(input: RegisterInput): Promise<PublicUser>;
export async function loginAccount(input: LoginInput): Promise<PublicUser>;
export async function getCurrentAccount(): Promise<PublicUser | null>;
export async function logoutAccount(): Promise<void>;
```

The implementation must:

- Define a strict schema for every `PublicUser` field, including role/status enums, nullable ISO date strings, profile preferences and all four notification booleans.
- Define a strict `{ user }` success envelope and a safe `{ error: { code, message, fields? } }` envelope.
- Use one private request helper with `credentials: "same-origin"`.
- Add `content-type: application/json` only to JSON POSTs.
- Treat only the current-user HTTP 401 as `null`.
- Parse a logout HTTP 204 without attempting JSON parsing.
- Convert validated error envelopes into `BrowserAuthError`.
- Convert malformed bodies and unknown HTTP failures into code `REQUEST_FAILED` and the generic request message.
- Convert fetch rejections into code `NETWORK_ERROR` and the generic network message without copying the caught exception text. Keep the `fetch()` rejection boundary separate so an intentionally thrown `BrowserAuthError` is never reclassified as a network failure.

- [ ] **Step 5: Run focused tests and lint**

```powershell
npm.cmd test -- src/lib/auth/browser-client.test.ts
npm.cmd run lint -- src/lib/auth/browser-client.ts src/lib/auth/browser-client.test.ts
```

Expected: all browser-client tests pass and ESLint emits no errors or warnings.

- [ ] **Step 6: Check dependency scope and commit**

```powershell
npm.cmd ls @testing-library/react @testing-library/user-event jsdom
git diff -- web/package.json
git diff --check
git add web/package.json web/package-lock.json web/src/lib/auth/browser-client.ts web/src/lib/auth/browser-client.test.ts
git diff --cached --check
git commit -m "feat(auth-ui): add typed browser authentication client" -m "Refs #14"
```

Expected: the dependency diff contains only the three approved development packages and their transitive lock entries; the commit contains exactly the four listed paths.

---

### Task 2: Add the Shared Authentication Session Provider

**Files:**
- Create: `web/src/components/auth/auth-session-provider.tsx`
- Create: `web/src/components/auth/auth-session-provider.test.tsx`

**Interfaces:**
- Consumes: `getCurrentAccount`, `logoutAccount` and the existing `PublicUser` type.
- Produces: `AuthSessionProvider`, `useAuthSession`, `AuthSessionStatus`, `setAuthenticatedUser`, `refreshSession` and `logout`.
- Status is exactly `"loading" | "authenticated" | "unauthenticated" | "unavailable"`.

- [ ] **Step 1: Write failing provider state tests**

Create the jsdom test with the environment comment and explicit cleanup:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/browser-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/browser-client")>(
    "@/lib/auth/browser-client",
  );
  return {
    ...actual,
    getCurrentAccount: vi.fn(),
    logoutAccount: vi.fn(),
  };
});

import {
  BrowserAuthError,
  getCurrentAccount,
  logoutAccount,
} from "@/lib/auth/browser-client";

import { AuthSessionProvider, useAuthSession } from "./auth-session-provider";

const safeUser = {
  id: "user-id",
  email: "student@example.com",
  role: "student" as const,
  status: "active" as const,
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Student Name",
    preferredContactMethod: "in_app" as const,
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
};

function Probe() {
  const session = useAuthSession();
  return (
    <div>
      <p>{session.status}</p>
      <p>{session.user?.profile.displayName ?? "no user"}</p>
      <button onClick={() => session.setAuthenticatedUser(safeUser)}>Set user</button>
      <button onClick={() => void session.refreshSession()}>Retry</button>
      <button
        onClick={() => {
          void session.logout().catch(() => undefined);
        }}
      >
        Logout
      </button>
    </div>
  );
}

afterEach(cleanup);

describe("AuthSessionProvider", () => {
  beforeEach(() => {
    vi.mocked(getCurrentAccount).mockResolvedValue(null);
    vi.mocked(logoutAccount).mockResolvedValue();
  });

  it("resolves an authenticated session", async () => {
    vi.mocked(getCurrentAccount).mockResolvedValue(safeUser);
    render(<AuthSessionProvider><Probe /></AuthSessionProvider>);

    expect(screen.getByText("loading")).toBeTruthy();
    await screen.findByText("authenticated");
    expect(screen.getByText("Student Name")).toBeTruthy();
  });

  it("resolves a missing session as unauthenticated", async () => {
    render(<AuthSessionProvider><Probe /></AuthSessionProvider>);
    await screen.findByText("unauthenticated");
  });

  it("marks resolution failures as retryable and retries", async () => {
    vi.mocked(getCurrentAccount)
      .mockRejectedValueOnce(new Error("hidden"))
      .mockResolvedValueOnce(safeUser);
    const user = userEvent.setup();
    render(<AuthSessionProvider><Probe /></AuthSessionProvider>);

    await screen.findByText("unavailable");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("authenticated");
  });

  it("accepts a safe user after login without refetching", async () => {
    const user = userEvent.setup();
    render(<AuthSessionProvider><Probe /></AuthSessionProvider>);
    await screen.findByText("unauthenticated");

    await user.click(screen.getByRole("button", { name: "Set user" }));
    expect(screen.getByText("authenticated")).toBeTruthy();
    expect(getCurrentAccount).toHaveBeenCalledOnce();
  });

  it("clears state only after logout succeeds", async () => {
    vi.mocked(getCurrentAccount).mockResolvedValue(safeUser);
    const user = userEvent.setup();
    render(<AuthSessionProvider><Probe /></AuthSessionProvider>);
    await screen.findByText("authenticated");

    await user.click(screen.getByRole("button", { name: "Logout" }));
    await screen.findByText("unauthenticated");
    expect(logoutAccount).toHaveBeenCalledOnce();
  });

  it("retains the current user when logout has a network failure", async () => {
    vi.mocked(getCurrentAccount).mockResolvedValue(safeUser);
    vi.mocked(logoutAccount).mockRejectedValue(
      new BrowserAuthError({
        code: "NETWORK_ERROR",
        status: 0,
        message: "We could not reach the service. Please try again.",
      }),
    );
    const user = userEvent.setup();
    render(<AuthSessionProvider><Probe /></AuthSessionProvider>);
    await screen.findByText("authenticated");

    await expect(
      user.click(screen.getByRole("button", { name: "Logout" })),
    ).resolves.toBeUndefined();
    await waitFor(() => expect(screen.getByText("authenticated")).toBeTruthy());
  });

  it("confirms the cleared cookie after a known logout server response", async () => {
    vi.mocked(getCurrentAccount)
      .mockResolvedValueOnce(safeUser)
      .mockResolvedValueOnce(null);
    vi.mocked(logoutAccount).mockRejectedValue(
      new BrowserAuthError({
        code: "AUTHENTICATION_FAILED",
        status: 500,
        message: "Unable to complete authentication request",
      }),
    );
    const user = userEvent.setup();
    render(<AuthSessionProvider><Probe /></AuthSessionProvider>);
    await screen.findByText("authenticated");

    await user.click(screen.getByRole("button", { name: "Logout" }));
    await screen.findByText("unauthenticated");
    expect(getCurrentAccount).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the test to verify the red state**

```powershell
npm.cmd test -- src/components/auth/auth-session-provider.test.tsx
```

Expected: FAIL because `./auth-session-provider` does not exist.

- [ ] **Step 3: Implement the provider**

Create a client component with this public contract:

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  getCurrentAccount,
  logoutAccount,
} from "@/lib/auth/browser-client";
import type { PublicUser } from "@/lib/auth/public-user";

export type AuthSessionStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "unavailable";

export type AuthSessionContextValue = {
  status: AuthSessionStatus;
  user: PublicUser | null;
  setAuthenticatedUser: (user: PublicUser) => void;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
};

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  // Resolve once on mount, expose retry, and never surface caught error text.
}

export function useAuthSession(): AuthSessionContextValue {
  // Throw a fixed developer error only when used outside the provider.
}
```

Implementation rules:

- Initialise to `loading` and `null`.
- `refreshSession` sets `loading`, awaits `getCurrentAccount`, then chooses authenticated or unauthenticated.
- A caught resolution error sets `unavailable` and `null`.
- `setAuthenticatedUser` sets the user and authenticated status synchronously.
- `logout` awaits `logoutAccount` before clearing the user. A `NETWORK_ERROR` retains the authenticated state and is rethrown for retry feedback. For a known HTTP response error, call `getCurrentAccount` once because the existing logout route clears its cookie before server-side session deletion; resolve as logged out when that check returns `null`, and otherwise retain the user and rethrow the safe error.
- Memoise the context value and do not log errors or user data.

- [ ] **Step 4: Run focused tests, lint and type checking**

```powershell
npm.cmd test -- src/components/auth/auth-session-provider.test.tsx
npm.cmd run lint -- src/components/auth/auth-session-provider.tsx src/components/auth/auth-session-provider.test.tsx
npx.cmd tsc --noEmit --incremental false
```

Expected: provider tests pass, ESLint emits no findings and TypeScript succeeds.

- [ ] **Step 5: Commit the provider**

```powershell
git add web/src/components/auth/auth-session-provider.tsx web/src/components/auth/auth-session-provider.test.tsx
git diff --cached --check
git commit -m "feat(auth-ui): manage browser session state" -m "Refs #14"
```

---

### Task 3: Add Accessible Form Validation and Primitives

**Files:**
- Create: `web/src/components/auth/form-validation.ts`
- Create: `web/src/components/auth/form-validation.test.ts`
- Create: `web/src/components/auth/password-field.tsx`
- Create: `web/src/components/auth/password-field.test.tsx`
- Create: `web/src/components/auth/form-message.tsx`
- Create: `web/src/components/auth/auth-panel.tsx`
- Create: `web/src/components/auth/auth-panel.module.css`
- Create: `web/src/components/auth/auth-form.module.css`

**Interfaces:**
- Consumes: existing `loginSchema` and `registerSchema`.
- Produces: `LoginFormValues`, `RegisterFormValues`, `LoginFieldErrors`, `RegisterFieldErrors`, `validateLoginForm`, `validateRegisterForm`, `PasswordField`, `FieldError`, `FormAlert` and `AuthPanel`.
- Field validators return the first safe message for each invalid control and never mutate or trim password values.

- [ ] **Step 1: Write failing validation tests**

Create `form-validation.test.ts` to assert the exact adapters:

```ts
import { describe, expect, it } from "vitest";

import { validateLoginForm, validateRegisterForm } from "./form-validation";

describe("authentication form validation", () => {
  it("accepts valid login values without trimming password whitespace", () => {
    const values = { email: " STUDENT@EXAMPLE.COM ", password: " pass word " };
    const result = validateLoginForm(values);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        email: "student@example.com",
        password: " pass word ",
      });
    }
  });

  it("maps invalid login fields", () => {
    expect(validateLoginForm({ email: "bad", password: "short" })).toEqual({
      success: false,
      errors: {
        email: "Email must be valid",
        password: "Password must contain at least 10 characters",
      },
    });
  });

  it("accepts registration and removes confirmation from API data", () => {
    const result = validateRegisterForm({
      displayName: " Student Name ",
      email: "STUDENT@EXAMPLE.COM",
      password: "secure pass",
      confirmPassword: "secure pass",
    });

    expect(result).toEqual({
      success: true,
      data: {
        displayName: "Student Name",
        email: "student@example.com",
        password: "secure pass",
      },
    });
  });

  it("reports display name, email, password and confirmation errors", () => {
    const result = validateRegisterForm({
      displayName: "x",
      email: "bad",
      password: "short",
      confirmPassword: "different",
    });

    expect(result).toEqual({
      success: false,
      errors: {
        displayName: "Display name must contain at least 2 characters",
        email: "Email must be valid",
        password: "Password must contain at least 10 characters",
        confirmPassword: "Passwords must match",
      },
    });
  });
});
```

- [ ] **Step 2: Write the failing password-field tests**

Create `password-field.test.tsx` with `// @vitest-environment jsdom`; render a controlled field and assert:

```tsx
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";

import { PasswordField } from "./password-field";

afterEach(cleanup);

function PasswordHarness() {
  const [value, setValue] = useState("secure pass");
  return (
    <PasswordField
      id="password"
      label="Password"
      autoComplete="current-password"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      error="Password is invalid"
    />
  );
}

it("labels the password field and toggles visibility", async () => {
  const user = userEvent.setup();
  render(<PasswordHarness />);
  const input = screen.getByLabelText("Password");
  expect(input.getAttribute("type")).toBe("password");
  expect(input.getAttribute("autocomplete")).toBe("current-password");
  expect(input.getAttribute("aria-describedby")).toBe("password-error");
  expect(input.getAttribute("aria-invalid")).toBe("true");

  await user.click(screen.getByRole("button", { name: "Show password" }));
  expect(input.getAttribute("type")).toBe("text");
  expect(
    screen
      .getByRole("button", { name: "Hide password" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});
```

Also assert keyboard activation and that the field error text uses the supplied stable ID.

- [ ] **Step 3: Run both tests to verify the red state**

```powershell
npm.cmd test -- src/components/auth/form-validation.test.ts src/components/auth/password-field.test.tsx
```

Expected: FAIL because the validation adapter and password component do not exist.

- [ ] **Step 4: Implement validation adapters**

Use these exact types and discriminated results:

```ts
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from "@/lib/auth/validation";

export type LoginFormValues = { email: string; password: string };
export type RegisterFormValues = LoginFormValues & {
  displayName: string;
  confirmPassword: string;
};
export type LoginFieldErrors = Partial<Record<keyof LoginFormValues, string>>;
export type RegisterFieldErrors = Partial<Record<keyof RegisterFormValues, string>>;

export type ValidationResult<TData, TErrors> =
  | { success: true; data: TData }
  | { success: false; errors: TErrors };

export function validateLoginForm(
  values: LoginFormValues,
): ValidationResult<LoginInput, LoginFieldErrors>;

export function validateRegisterForm(
  values: RegisterFormValues,
): ValidationResult<RegisterInput, RegisterFieldErrors>;
```

Use `safeParse`, `z.flattenError(...).fieldErrors` and the first message per field. Validate confirmation separately, always remove it from returned success data, and never trim password or confirmation values.

- [ ] **Step 5: Implement accessible primitives**

`PasswordField` accepts `id`, `label`, `autoComplete`, `value`, `onChange`, optional `error`, optional `disabled` and an input `ref`. It renders a permanent `<label>`, a controlled input, and a `type="button"` visibility control with `aria-pressed` and state-aware names.

`FieldError` renders a paragraph only when a message exists. `FormAlert` renders the safe form-level message with `role="alert"` and `aria-live="assertive"`.

`AuthPanel` renders a semantic section with a small `Campus account` eyebrow, one `h1`, explanatory text, children and an optional footer. Put exact panel styling in `auth-panel.module.css`: white surface, 1px warm-grey border, 20px radius, restrained shadow, 100% width and 34rem maximum width.

Put shared form presentation in `auth-form.module.css`: a vertical 1rem field gap; 0.5rem label gap; 44px minimum input/button height; paper-light inputs with a 1px `--line` border; `--danger` error text; a positioned password visibility button that remains a 44px target; full-width deep-green submit control; disabled and focus-visible states; and a compact footer link row. Login and registration forms import this same module so their control styling cannot drift.

- [ ] **Step 6: Run focused tests, lint and type checking**

```powershell
npm.cmd test -- src/components/auth/form-validation.test.ts src/components/auth/password-field.test.tsx
npm.cmd run lint -- src/components/auth/form-validation.ts src/components/auth/form-validation.test.ts src/components/auth/password-field.tsx src/components/auth/password-field.test.tsx src/components/auth/form-message.tsx src/components/auth/auth-panel.tsx
npx.cmd tsc --noEmit --incremental false
```

Expected: both focused suites pass, ESLint and TypeScript succeed.

- [ ] **Step 7: Commit the form foundation**

```powershell
git add web/src/components/auth/form-validation.ts web/src/components/auth/form-validation.test.ts web/src/components/auth/password-field.tsx web/src/components/auth/password-field.test.tsx web/src/components/auth/form-message.tsx web/src/components/auth/auth-panel.tsx web/src/components/auth/auth-panel.module.css web/src/components/auth/auth-form.module.css
git diff --cached --check
git commit -m "feat(auth-ui): add accessible form foundation" -m "Refs #14"
```

---

### Task 4: Establish the Campus Noticeboard Application Shell

**Files:**
- Modify: `web/src/app/layout.tsx`
- Modify: `web/src/app/globals.css`
- Create: `web/src/components/site-header.tsx`
- Create: `web/src/components/site-header.test.tsx`
- Create: `web/src/components/site-header.module.css`

**Interfaces:**
- Consumes: `AuthSessionProvider`, `useAuthSession`, `FormAlert` and Next.js navigation.
- Produces: shared metadata, design tokens, focus/motion behaviour and an authentication-aware `SiteHeader` present on every page.

- [ ] **Step 1: Write failing navigation tests**

Create `site-header.test.tsx` in jsdom. Mock `useAuthSession` and `next/navigation`, then cover:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/components/auth/auth-session-provider", () => ({
  useAuthSession: vi.fn(),
}));

import { useRouter } from "next/navigation";
import {
  type AuthSessionContextValue,
  useAuthSession,
} from "@/components/auth/auth-session-provider";

import { SiteHeader } from "./site-header";

const replace = vi.fn();
const refresh = vi.fn();
const refreshSession = vi.fn().mockResolvedValue(undefined);
const logout = vi.fn().mockResolvedValue(undefined);
const safeUser: NonNullable<AuthSessionContextValue["user"]> = {
  id: "user-id",
  email: "student@example.com",
  role: "student",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Student Name",
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

function mockSession(
  overrides: Partial<AuthSessionContextValue>,
) {
  vi.mocked(useAuthSession).mockReturnValue({
    status: "unauthenticated",
    user: null,
    setAuthenticatedUser: vi.fn(),
    refreshSession,
    logout,
    ...overrides,
  });
}

beforeEach(() => {
  vi.mocked(useRouter).mockReturnValue({ replace, refresh } as never);
});
afterEach(cleanup);

it("shows signed-out navigation", () => {
  mockSession({ status: "unauthenticated", user: null });
  render(<SiteHeader />);
  expect(screen.getByRole("link", { name: "Campus Find home" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
  expect(screen.getByRole("link", { name: "Create account" }).getAttribute("href")).toBe("/register");
});

it("shows the safe display name and dashboard for an authenticated user", () => {
  mockSession({ status: "authenticated", user: safeUser });
  render(<SiteHeader />);
  expect(screen.getByText("Student Name")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("href")).toBe("/dashboard");
  expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
});

it("signs out and replaces navigation with home", async () => {
  logout.mockResolvedValue(undefined);
  mockSession({ status: "authenticated", user: safeUser, logout });
  render(<SiteHeader />);
  await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(logout).toHaveBeenCalledOnce();
  expect(replace).toHaveBeenCalledWith("/");
});

it("keeps an accessible retry action when session resolution is unavailable", async () => {
  mockSession({ status: "unavailable", user: null });
  render(<SiteHeader />);
  await userEvent.click(screen.getByRole("button", { name: "Retry session check" }));
  expect(refreshSession).toHaveBeenCalledOnce();
});
```

Also test a loading label and a generic logout failure alert that excludes the thrown message.

- [ ] **Step 2: Run the navigation test to verify the red state**

```powershell
npm.cmd test -- src/components/site-header.test.tsx
```

Expected: FAIL because `./site-header` does not exist.

- [ ] **Step 3: Implement the shared header**

Create a client header with:

- A `Campus Find` home link and simple magnifying-glass/location mark drawn with text or CSS, not an image dependency.
- A loading state that announces `Checking session` without causing navigation width to jump.
- `Sign in` and `Create account` links for unauthenticated users.
- Display name, `Dashboard` and `Sign out` for authenticated users.
- A fixed generic logout error and disabled `Signing out…` button while pending.
- `Retry session check` for the unavailable state.
- `router.replace("/")` and `router.refresh()` after successful logout.

Do not log a caught error or render its message.

- [ ] **Step 4: Update metadata, layout and global design tokens**

Set `layout.tsx` metadata to:

```ts
export const metadata: Metadata = {
  title: {
    default: "Campus Find",
    template: "%s | Campus Find",
  },
  description: "A secure campus lost and found service for reporting, matching and recovering belongings.",
};
```

Wrap the site in this order:

```tsx
<html lang="en">
  <body>
    <AuthSessionProvider>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <SiteHeader />
      {children}
    </AuthSessionProvider>
  </body>
</html>
```

In `globals.css`, keep `@import "tailwindcss";` and define exact semantic tokens:

```css
:root {
  --paper: #f4efe4;
  --paper-light: #fffdf8;
  --ink: #17372f;
  --ink-soft: #53635e;
  --campus-green: #1f6a52;
  --campus-green-dark: #174c3d;
  --warm-accent: #b85f3d;
  --line: #d7d1c4;
  --danger: #9b2c2c;
  --focus: #0b6fc2;
  --shadow: 0 18px 45px rgb(23 55 47 / 12%);
}
```

Add a box-sizing reset, body defaults, inherited form fonts, responsive image rules, `:focus-visible` outline, `.skip-link` reveal-on-focus, reusable `.primary-action` and `.text-link` states, and a `prefers-reduced-motion: reduce` block that removes nonessential transitions and scrolling animation.

- [ ] **Step 5: Run focused and structural verification**

```powershell
npm.cmd test -- src/components/site-header.test.tsx
npm.cmd run lint -- src/app/layout.tsx src/components/site-header.tsx src/components/site-header.test.tsx
npx.cmd tsc --noEmit --incremental false
```

Expected: navigation tests pass; lint and TypeScript succeed.

- [ ] **Step 6: Commit the application shell**

```powershell
git add web/src/app/layout.tsx web/src/app/globals.css web/src/components/site-header.tsx web/src/components/site-header.test.tsx web/src/components/site-header.module.css
git diff --cached --check
git commit -m "feat(ui): establish Campus Noticeboard shell" -m "Refs #14"
```

---

### Task 5: Implement the Login Page and Flow

**Files:**
- Create: `web/src/components/auth/login-form.tsx`
- Create: `web/src/components/auth/login-form.test.tsx`
- Create: `web/src/app/login/page.tsx`
- Create: `web/src/app/auth-page.module.css`

**Interfaces:**
- Consumes: `loginAccount`, `useAuthSession`, `validateLoginForm`, `PasswordField`, `FieldError`, `FormAlert` and `AuthPanel`.
- Produces: an accessible login form and `/login` page; successful login calls `setAuthenticatedUser(user)` and `router.replace("/dashboard")`.

- [ ] **Step 1: Write failing login interaction tests**

Create `login-form.test.tsx` in jsdom. Mock `loginAccount`, `useAuthSession` and `next/navigation`. Cover these exact outcomes:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/lib/auth/browser-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/browser-client")>(
    "@/lib/auth/browser-client",
  );
  return { ...actual, loginAccount: vi.fn() };
});
vi.mock("./auth-session-provider", () => ({ useAuthSession: vi.fn() }));

import { useRouter } from "next/navigation";
import { BrowserAuthError, loginAccount } from "@/lib/auth/browser-client";

import { useAuthSession } from "./auth-session-provider";
import { LoginForm } from "./login-form";

const replace = vi.fn();
const setAuthenticatedUser = vi.fn();
const safeUser = {
  id: "user-id",
  email: "student@example.com",
  role: "student" as const,
  status: "active" as const,
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Student Name",
    preferredContactMethod: "in_app" as const,
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
};

beforeEach(() => {
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
  vi.mocked(useAuthSession).mockReturnValue({
    status: "unauthenticated",
    user: null,
    setAuthenticatedUser,
    refreshSession: vi.fn(),
    logout: vi.fn(),
  });
});
afterEach(cleanup);

async function submitValidLogin() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email address"), "student@example.com");
  await user.type(screen.getByLabelText("Password"), "secure pass");
  await user.click(screen.getByRole("button", { name: "Sign in securely" }));
}

it("validates empty fields and focuses the first invalid control", async () => {
  render(<LoginForm />);
  await userEvent.click(screen.getByRole("button", { name: "Sign in securely" }));
  expect(loginAccount).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Email address").getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(screen.getByLabelText("Email address"));
});

it("submits transformed email and untouched password once", async () => {
  vi.mocked(loginAccount).mockResolvedValue(safeUser);
  render(<LoginForm />);
  await userEvent.type(screen.getByLabelText("Email address"), " STUDENT@EXAMPLE.COM ");
  await userEvent.type(screen.getByLabelText("Password"), " pass word ");
  await userEvent.click(screen.getByRole("button", { name: "Sign in securely" }));

  await waitFor(() => expect(loginAccount).toHaveBeenCalledWith({
    email: "student@example.com",
    password: " pass word ",
  }));
  expect(setAuthenticatedUser).toHaveBeenCalledWith(safeUser);
  expect(replace).toHaveBeenCalledWith("/dashboard");
});

it("shows only the safe invalid-credentials message", async () => {
  vi.mocked(loginAccount).mockRejectedValue(
    new BrowserAuthError({
      code: "INVALID_CREDENTIALS",
      status: 401,
      message: "Invalid email or password",
    }),
  );
  render(<LoginForm />);
  await submitValidLogin();
  expect((await screen.findByRole("alert")).textContent).toContain("Invalid email or password");
});
```

Use DOM text content checks rather than jest-dom matchers if no matcher package was installed. Also test:

- A deferred request changes the button to `Signing in…`, disables it and prevents a second call.
- A network or unknown error renders only the fixed generic retry message.
- An already authenticated status redirects without calling `loginAccount`.
- Email uses `autocomplete="email"`; password uses `autocomplete="current-password"`.

- [ ] **Step 2: Run the login test to verify the red state**

```powershell
npm.cmd test -- src/components/auth/login-form.test.tsx
```

Expected: FAIL because `./login-form` does not exist.

- [ ] **Step 3: Implement the login form**

Create a client form that:

- Stores only email, password, field errors, one safe form message and pending state.
- Uses stable `email`, `email-error`, `password` and `password-error` IDs.
- Runs `validateLoginForm` before calling the browser client.
- Focuses email before password when both are invalid.
- Maps validated `BrowserAuthError.fields` to known inputs only.
- Uses the safe message for `INVALID_CREDENTIALS` and `ACCOUNT_UNAVAILABLE`.
- Uses `We could not complete that request. Please try again.` for every unknown error.
- Ignores submission while pending.
- Calls `setAuthenticatedUser` and `router.replace("/dashboard")` on success.
- Redirects an already authenticated session to `/dashboard` in an effect.
- Does not log field values or errors.

- [ ] **Step 4: Compose the login page**

`app/login/page.tsx` is a server component that exports title `Sign in`, renders `<main id="main-content">`, uses `AuthPanel` with heading `Welcome back`, explains that users can manage reports and recovery updates, includes `LoginForm`, and links to `/register`.

`auth-page.module.css` provides the warm paper background, a subtle CSS-only noticeboard pattern, centred panel, responsive padding and a minimum height that accounts for the site header.

- [ ] **Step 5: Run focused tests, lint and type checking**

```powershell
npm.cmd test -- src/components/auth/login-form.test.tsx
npm.cmd run lint -- src/components/auth/login-form.tsx src/components/auth/login-form.test.tsx src/app/login/page.tsx
npx.cmd tsc --noEmit --incremental false
```

Expected: login tests pass; lint and TypeScript succeed.

- [ ] **Step 6: Commit the login flow**

```powershell
git add web/src/components/auth/login-form.tsx web/src/components/auth/login-form.test.tsx web/src/app/login/page.tsx web/src/app/auth-page.module.css
git diff --cached --check
git commit -m "feat(auth-ui): add accessible login flow" -m "Refs #14"
```

---

### Task 6: Implement the Registration Page and Flow

**Files:**
- Create: `web/src/components/auth/register-form.tsx`
- Create: `web/src/components/auth/register-form.test.tsx`
- Create: `web/src/app/register/page.tsx`

**Interfaces:**
- Consumes: `registerAccount`, `useAuthSession`, `validateRegisterForm`, the shared form primitives and `auth-page.module.css`.
- Produces: an accessible registration form and `/register` page; successful registration updates shared session state and replaces navigation with `/dashboard`.

- [ ] **Step 1: Write failing registration interaction tests**

Create the jsdom suite and cover:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/lib/auth/browser-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/browser-client")>(
    "@/lib/auth/browser-client",
  );
  return { ...actual, registerAccount: vi.fn() };
});
vi.mock("./auth-session-provider", () => ({ useAuthSession: vi.fn() }));

import { useRouter } from "next/navigation";
import { BrowserAuthError, registerAccount } from "@/lib/auth/browser-client";

import { useAuthSession } from "./auth-session-provider";
import { RegisterForm } from "./register-form";

const replace = vi.fn();
const setAuthenticatedUser = vi.fn();
const safeUser = {
  id: "user-id",
  email: "student@example.com",
  role: "student" as const,
  status: "active" as const,
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Student Name",
    preferredContactMethod: "in_app" as const,
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
};

beforeEach(() => {
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
  vi.mocked(useAuthSession).mockReturnValue({
    status: "unauthenticated",
    user: null,
    setAuthenticatedUser,
    refreshSession: vi.fn(),
    logout: vi.fn(),
  });
});
afterEach(cleanup);

async function fillForm(values: {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
}) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Display name"), values.displayName);
  await user.type(screen.getByLabelText("Email address"), values.email);
  await user.type(screen.getByLabelText("Password"), values.password);
  await user.type(screen.getByLabelText("Confirm password"), values.confirmPassword);
}

async function fillValidIdentityAndPassword(confirmPassword: string) {
  await fillForm({
    displayName: "Student Name",
    email: "student@example.com",
    password: "secure pass",
    confirmPassword,
  });
}

async function fillAndSubmitValidRegistration() {
  await fillValidIdentityAndPassword("secure pass");
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));
}

it("reports a mismatched confirmation and does not submit", async () => {
  render(<RegisterForm />);
  await fillValidIdentityAndPassword("different pass");
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));

  expect(registerAccount).not.toHaveBeenCalled();
  expect(screen.getByText("Passwords must match")).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByLabelText("Confirm password"));
});

it("sends no confirmation field and preserves password whitespace", async () => {
  vi.mocked(registerAccount).mockResolvedValue(safeUser);
  render(<RegisterForm />);
  await fillForm({
    displayName: " Student Name ",
    email: " STUDENT@EXAMPLE.COM ",
    password: " pass word ",
    confirmPassword: " pass word ",
  });
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));

  await waitFor(() => expect(registerAccount).toHaveBeenCalledWith({
    displayName: "Student Name",
    email: "student@example.com",
    password: " pass word ",
  }));
  expect(JSON.stringify(vi.mocked(registerAccount).mock.calls[0][0])).not.toContain("confirmPassword");
});

it("shows the safe duplicate-email response", async () => {
  vi.mocked(registerAccount).mockRejectedValue(
    new BrowserAuthError({
      code: "EMAIL_ALREADY_REGISTERED",
      status: 409,
      message: "Email is already registered",
    }),
  );
  render(<RegisterForm />);
  await fillAndSubmitValidRegistration();
  expect((await screen.findByRole("alert")).textContent).toContain("Email is already registered");
});
```

Also test display-name/email/password boundary messages, new-password autocomplete on both password controls, pending duplicate-submit prevention, generic unknown errors, successful `setAuthenticatedUser` plus dashboard navigation, and authenticated-user redirection.

- [ ] **Step 2: Run the registration test to verify the red state**

```powershell
npm.cmd test -- src/components/auth/register-form.test.tsx
```

Expected: FAIL because `./register-form` does not exist.

- [ ] **Step 3: Implement the registration form**

Create a client form with permanent labels, safe field IDs and refs in this focus order: display name, email, password, confirmation. It must:

- Run `validateRegisterForm` before the request.
- Send only returned `RegisterInput` data.
- Never trim or persist either password value.
- Map safe server fields only to display name, email and password.
- Render duplicate-email safely at form level and associate it with email when possible.
- Disable submission and show `Creating account…` while pending.
- Use a fixed generic message for unknown errors.
- Set the safe user and replace navigation with `/dashboard` on success.
- Redirect authenticated users without submitting.

- [ ] **Step 4: Compose the registration page**

Create a server page with title `Create account`, `<main id="main-content">`, the shared auth layout and panel, privacy-conscious copy, `RegisterForm`, and a link to `/login`. Copy must state that sensitive ownership evidence belongs in later report verification, not in the account form.

- [ ] **Step 5: Run focused tests, lint and type checking**

```powershell
npm.cmd test -- src/components/auth/register-form.test.tsx
npm.cmd run lint -- src/components/auth/register-form.tsx src/components/auth/register-form.test.tsx src/app/register/page.tsx
npx.cmd tsc --noEmit --incremental false
```

Expected: registration tests pass; lint and TypeScript succeed.

- [ ] **Step 6: Commit the registration flow**

```powershell
git add web/src/components/auth/register-form.tsx web/src/components/auth/register-form.test.tsx web/src/app/register/page.tsx
git diff --cached --check
git commit -m "feat(auth-ui): add accessible registration flow" -m "Refs #14"
```

---

### Task 7: Build the Campus Noticeboard Home Page

**Files:**
- Modify: `web/src/app/page.tsx`
- Create: `web/src/app/page.module.css`
- Create: `web/src/app/home-page.test.tsx`

**Interfaces:**
- Consumes: the global application shell and shared action/link styles.
- Produces: a responsive public home page with clear authentication entry points, workflow explanation, privacy statement and explicitly illustrative notices.

- [ ] **Step 1: Write the failing home-page test**

Use jsdom or `renderToStaticMarkup` to assert:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import Home from "./page";

afterEach(cleanup);

it("presents the real product workflow without fake report links", () => {
render(<Home />);

expect(screen.getByRole("heading", {
  level: 1,
  name: "Lost something? Let the campus help.",
})).toBeTruthy();
expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href")).toBe("/register");
expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
expect(screen.getByRole("heading", { name: "How Campus Find works" })).toBeTruthy();
expect(screen.getByText(/ownership-verification details stay private/i)).toBeTruthy();
expect(screen.getByText("Illustrative campus notices")).toBeTruthy();
expect(screen.queryByRole("link", { name: /browse reports/i })).toBeNull();
});
```

Also assert one `<main id="main-content">`, logical section headings and three workflow items.

- [ ] **Step 2: Run the home test to verify the red state**

```powershell
npm.cmd test -- src/app/home-page.test.tsx
```

Expected: FAIL because the current generated page contains only `Hello world!`.

- [ ] **Step 3: Implement the semantic home page**

Build these sections in order:

1. Hero eyebrow `Massey campus community`, approved heading, concise explanation and registration/login actions.
2. Three-step `How Campus Find works` list: report, receive possible matches, recover securely.
3. `Illustrative campus notices` with three CSS notice cards and an explicit `Examples only — live report browsing is coming in a separate feature` label.
4. Privacy callout stating that exact locations, serial numbers and ownership answers are separated from member-visible report data.
5. Footer project statement.

Use normal React text, semantic sections and lists. Do not create a reports route or clickable fake notice.

- [ ] **Step 4: Implement the approved visual direction**

In `page.module.css`:

- Use an asymmetric two-column hero above 56rem and one column below it.
- Use an editorial Georgia/serif heading stack and system sans-serif body stack.
- Use paper surfaces, deep green primary actions, warm orange eyebrow and 1px notice borders.
- Slightly rotate notice cards by no more than one degree on wide screens; remove rotation under reduced motion or narrow widths.
- Keep line length below approximately 68 characters for body copy.
- Use fluid `clamp()` heading sizes, no fixed viewport-height hero and no horizontal overflow at 320px.

- [ ] **Step 5: Run focused tests, lint and build**

```powershell
npm.cmd test -- src/app/home-page.test.tsx
npm.cmd run lint -- src/app/page.tsx src/app/home-page.test.tsx
npm.cmd run build
```

Expected: home tests pass; lint passes; production build includes static `/`, `/login` and `/register` pages.

- [ ] **Step 6: Commit the home page**

```powershell
git add web/src/app/page.tsx web/src/app/page.module.css web/src/app/home-page.test.tsx
git diff --cached --check
git commit -m "feat(ui): build Campus Noticeboard home page" -m "Refs #14"
```

---

### Task 8: Add the Protected Starter Dashboard

**Files:**
- Create: `web/src/components/dashboard/dashboard-client.tsx`
- Create: `web/src/components/dashboard/dashboard-client.test.tsx`
- Create: `web/src/components/dashboard/dashboard.module.css`
- Create: `web/src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `useAuthSession`, safe `PublicUser` fields and Next.js navigation.
- Produces: `/dashboard` loading, protected, retry and authenticated account-summary states.
- Unauthenticated status performs `router.replace("/login")`; unavailable status remains in place with a retry action.

- [ ] **Step 1: Write failing dashboard state tests**

Create a jsdom suite that mocks the session hook and router:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/components/auth/auth-session-provider", () => ({
  useAuthSession: vi.fn(),
}));

import { useRouter } from "next/navigation";
import {
  type AuthSessionContextValue,
  useAuthSession,
} from "@/components/auth/auth-session-provider";

import { DashboardClient } from "./dashboard-client";

const replace = vi.fn();
const refreshSession = vi.fn().mockResolvedValue(undefined);
const safeUser: NonNullable<AuthSessionContextValue["user"]> = {
  id: "user-id",
  email: "student@example.com",
  role: "student",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Student Name",
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

beforeEach(() => {
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
});
afterEach(cleanup);

it("shows a stable loading state without private content", () => {
  mockSession({ status: "loading", user: null });
  render(<DashboardClient />);
  expect(screen.getByRole("status").textContent).toContain("Loading your dashboard");
});

it("redirects an unauthenticated visitor with history replacement", async () => {
  mockSession({ status: "unauthenticated", user: null });
  render(<DashboardClient />);
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
});

it("shows a retryable unavailable state without redirecting", async () => {
  mockSession({ status: "unavailable", user: null });
  render(<DashboardClient />);
  await userEvent.click(screen.getByRole("button", { name: "Retry session check" }));
  expect(refreshSession).toHaveBeenCalledOnce();
  expect(replace).not.toHaveBeenCalled();
});

it("renders only safe account details and informational workflow cards", () => {
  mockSession({ status: "authenticated", user: safeUser });
  const { container } = render(<DashboardClient />);
  expect(screen.getByRole("heading", { name: "Welcome, Student Name" })).toBeTruthy();
  expect(screen.getByText("student@example.com")).toBeTruthy();
  expect(screen.getByText("Student")).toBeTruthy();
  expect(screen.getByText("Active")).toBeTruthy();
  expect(container.textContent).not.toMatch(/password|token|session hash/i);
  expect(screen.queryByRole("link", { name: /submit report/i })).toBeNull();
});
```

Also test verified/unverified labels, formatted last login, first-login fallback and no render of account content before authentication.

- [ ] **Step 2: Run the dashboard test to verify the red state**

```powershell
npm.cmd test -- src/components/dashboard/dashboard-client.test.tsx
```

Expected: FAIL because `./dashboard-client` does not exist.

- [ ] **Step 3: Implement protected state handling**

Create a client component that:

- Calls `router.replace("/login")` in an effect only for unauthenticated status.
- Renders a polite status region during loading and redirecting.
- Renders a generic unavailable message and retry button without treating failure as logout.
- Requires both authenticated status and non-null user before rendering account content.
- Formats role/status as title-cased labels, dates with `Intl.DateTimeFormat("en-NZ", ...)`, `Verified` or `Not verified`, and `First sign-in` for a null last login.
- Renders three noninteractive upcoming-workflow cards: report an item, search possible matches and manage recovery requests.
- Does not stringify the entire user object or render preference IDs.

- [ ] **Step 4: Compose and style the dashboard page**

Create a server page with title `Dashboard`, `<main id="main-content">` and `DashboardClient`.

In the CSS module, provide:

- Warm paper canvas and constrained content width.
- Responsive one/two/four-column account facts.
- Noticeboard-style workflow cards with clear `Upcoming` labels.
- High-contrast role/status badges that do not rely on colour alone.
- Skeleton blocks using restrained opacity animation disabled by reduced-motion settings.

- [ ] **Step 5: Run focused tests, lint and build**

```powershell
npm.cmd test -- src/components/dashboard/dashboard-client.test.tsx
npm.cmd run lint -- src/components/dashboard/dashboard-client.tsx src/components/dashboard/dashboard-client.test.tsx src/app/dashboard/page.tsx
npm.cmd run build
```

Expected: dashboard tests pass; lint passes; production build includes `/dashboard` without TypeScript errors.

- [ ] **Step 6: Commit the protected dashboard**

```powershell
git add web/src/components/dashboard/dashboard-client.tsx web/src/components/dashboard/dashboard-client.test.tsx web/src/components/dashboard/dashboard.module.css web/src/app/dashboard/page.tsx
git diff --cached --check
git commit -m "feat(auth-ui): add protected account dashboard" -m "Refs #14"
```

---

### Task 9: Full Verification, Responsive Review and Delivery Scope

**Files:**
- Review: `docs/superpowers/specs/2026-08-15-authentication-frontend-design.md`
- Review: every file listed in the File Map.
- Verify only; do not inspect `.env.local`, connect automated tests to Atlas, create accounts or add unrelated files.

**Interfaces:**
- Consumes: all Task 1-8 deliverables.
- Produces: a clean Issue #14 branch with reproducible automated, accessibility-oriented, visual, dependency and scope evidence.

- [ ] **Step 1: Run the complete automated suite**

From `web/`:

```powershell
npm.cmd test
```

Expected: all existing backend/model/report tests and all new browser/UI tests pass. Fetch is mocked in UI tests and no test connects to MongoDB.

- [ ] **Step 2: Run full lint and production build**

```powershell
npm.cmd run lint
npm.cmd run build
```

Expected: ESLint emits no errors or warnings; Next.js and TypeScript succeed; route output includes `/`, `/login`, `/register`, `/dashboard`, all existing auth/report/reference/health endpoints and no unexpected page.

- [ ] **Step 3: Run the dependency security audit**

```powershell
npm.cmd audit
```

Expected: `found 0 vulnerabilities`. Do not run `npm audit fix --force`. If the approved test packages introduce a reported issue, stop and investigate the smallest non-breaking resolution.

- [ ] **Step 4: Start an isolated visual review**

```powershell
npm.cmd run dev
```

Use an isolated browser profile with no existing Campus Find cookie. Verify `/`, `/login`, `/register` and the unauthenticated `/dashboard` redirect at approximately 375×812, 768×1024 and 1440×900.

Expected:

- No horizontal scrolling at 320px or wider.
- Logical heading structure, visible labels and visible keyboard focus.
- Password show/hide controls work by mouse and keyboard.
- Empty-form errors are announced and focus moves to the first invalid field.
- Session checks without a cookie return 401 without connecting to or writing Atlas.
- No browser-console errors, hydration errors or failed static assets.
- Campus Noticeboard styling matches the approved warm paper, deep green and warm accent direction.

Do not submit valid registration credentials during this step.

- [ ] **Step 5: Verify reduced motion and authenticated-state evidence**

Enable reduced motion in the browser or devtools and confirm nonessential transition/skeleton animation is removed. Use the automated fixture-based dashboard tests as authenticated-state evidence.

If the user explicitly authorises a live smoke test, use a user-provided test account to register/login/logout and state clearly that this creates Atlas records. Without that approval, do not perform the live flow and do not treat it as a failed acceptance criterion.

- [ ] **Step 6: Verify secret handling and patch cleanliness**

From the repository root:

```powershell
git status --short --ignored web/.env.local
git diff --check
git status --short --branch
```

Expected:

- `.env.local` appears only as `!! web/.env.local`; do not open it.
- `git diff --check` produces no output.
- Branch is `feature/issue-14-authentication-frontend` with a clean worktree.

- [ ] **Step 7: Verify branch scope and dependency changes**

```powershell
git diff --name-status develop...HEAD
git diff --stat develop...HEAD
git diff develop...HEAD -- web/package.json
git log --oneline develop..HEAD
```

Expected scope:

- The approved design and implementation plan.
- Browser auth client and test.
- Session provider and test.
- Shared authentication primitives and their tests/styles.
- Site header, metadata and global visual tokens.
- Login, registration, home and dashboard pages, components, styles and tests.
- Only React Testing Library, user-event and jsdom development dependencies plus mechanical lock entries.
- No auth Route Handler, database, Mongoose model, report backend, environment or deployment changes.

- [ ] **Step 8: Prepare the user handoff**

After every required check passes, instruct the user to run:

```powershell
git push -u origin feature/issue-14-authentication-frontend
```

Suggested pull-request title:

```text
feat(auth-ui): add accessible authentication frontend
```

The pull-request body must summarise the four pages, Campus Noticeboard design, HttpOnly-cookie boundary, accessibility work, exact automated/build/audit results, responsive browser checks and `Closes #14`.
