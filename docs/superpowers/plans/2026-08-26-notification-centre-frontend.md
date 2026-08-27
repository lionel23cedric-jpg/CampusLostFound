# Accessible Notification Centre Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an accessible `/notifications` centre and shared header unread count on top of the existing privacy-safe notification API.

**Architecture:** A strict browser client validates the closed notification transport. A small provider inside the existing authentication provider owns current-account data and operations; the page and site header consume the same state so mark-read changes remain consistent. A separate access boundary prevents notification content from mounting for signed-out or inactive accounts.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Zod 4, CSS Modules, Vitest, Testing Library.

## Global Constraints

- Work only on `feature/issue-37-notification-centre-frontend` based on the current `develop` branch.
- Add no runtime dependency and do not change notification backend contracts or database models.
- Request notifications only after the existing session resolves to an authenticated active account.
- Support active student, staff and administrator accounts; block inactive and signed-out accounts.
- Never expose `recipientId`, `eventKey`, actor identity, report titles, review notes, verification evidence or contact data.
- Accept only controlled text and safe `/claims/<ObjectId>` or `/reports/<ObjectId>` actions.
- Do not add polling, WebSockets, mark-all-read, deletion, external delivery or possible-match events.
- Do not read or display `.env.local`; automated tests must mock browser and session boundaries and must not contact real Atlas.
- Keep all interactive targets at least 44 pixels and the complete workflow usable at 320-pixel width.
- Use TDD, run the specified regression gate after every task, and commit only that task's files.

## File structure

- `web/src/lib/notifications/browser-client.ts`: strict client transport, public client types and safe browser errors.
- `web/src/lib/notifications/browser-client.test.ts`: fetch boundary, strict schema and safe error tests.
- `web/src/components/notifications/notification-provider.tsx`: account-owned notification state and operations.
- `web/src/components/notifications/notification-provider.test.tsx`: session, concurrency and mutation tests.
- `web/src/components/notifications/notification-access-boundary.tsx`: active-account page gate.
- `web/src/components/notifications/notification-access-boundary.test.tsx`: role/status/session boundary tests.
- `web/src/components/notifications/notification-centre.tsx`: page presentation and interactions.
- `web/src/components/notifications/notification-centre.test.tsx`: loading, empty, list and error-state tests.
- `web/src/components/notifications/notification-centre.module.css`: notification page and access-state styles.
- `web/src/app/notifications/page.tsx`: route metadata and page composition.
- `web/src/app/notifications/notification-page.test.tsx`: route composition smoke test.
- `web/src/app/layout.tsx`: provider placement around `SiteHeader` and page content.
- `web/src/components/site-header.tsx`: active-account notification navigation.
- `web/src/components/site-header.test.tsx`: visibility and unread-count tests.
- `web/src/components/site-header.module.css`: compact accessible count badge.
- `docs/superpowers/verification/2026-08-26-notification-centre-frontend.md`: reproducible final evidence.

---

### Task 1: Strict notification browser client

**Files:**
- Create: `web/src/lib/notifications/browser-client.test.ts`
- Create: `web/src/lib/notifications/browser-client.ts`

**Interfaces:**
- Consumes: `GET /api/notifications?pageSize=<1..50>&cursor=<opaque>` and `PATCH /api/notifications/{id}/read`.
- Produces: `PublicNotification`, `NotificationPage`, `NotificationBrowserError`, `getNotifications(input)`, and `markNotificationRead(notificationId)`.

- [ ] **Step 1: Write the failing transport tests**

Create the test with a closed fixture and mocked `fetch`:

```ts
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getNotifications,
  markNotificationRead,
  NotificationBrowserError,
} from "./browser-client";

const notification = {
  id: "64b64c6f2f4d9f1a2b3c4d54",
  kind: "claim_approved",
  title: "Claim approved",
  summary: "Campus staff approved your claim.",
  action: {
    label: "View claim",
    href: "/claims/64b64c6f2f4d9f1a2b3c4d53",
  },
  createdAt: "2026-08-26T06:00:00.000Z",
  readAt: null,
  isRead: false,
} as const;

const page = {
  notifications: [notification],
  pagination: { nextCursor: "opaque-cursor", hasMore: true },
  unreadCount: 1,
};

describe("notification browser client", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("loads a bounded cursor page with same-origin credentials", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(page), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      getNotifications({ pageSize: 20, cursor: "opaque-cursor" }),
    ).resolves.toEqual(page);
    expect(fetch).toHaveBeenCalledWith(
      "/api/notifications?pageSize=20&cursor=opaque-cursor",
      { method: "GET", credentials: "same-origin" },
    );
  });

  it("marks one canonical notification read", async () => {
    const read = {
      ...notification,
      readAt: "2026-08-26T06:05:00.000Z",
      isRead: true,
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ notification: read }), { status: 200 }),
    );

    await expect(markNotificationRead(notification.id)).resolves.toEqual(read);
    expect(fetch).toHaveBeenCalledWith(
      `/api/notifications/${notification.id}/read`,
      { method: "PATCH", credentials: "same-origin" },
    );
  });
});
```

Add table tests that reject each of these without reflecting the private value:

```ts
it.each([
  ["unknown response field", { ...page, recipientId: "PRIVATE" }],
  ["unknown kind", { ...page, notifications: [{ ...notification, kind: "chat" }] }],
  ["unsafe action", { ...page, notifications: [{ ...notification, action: { label: "Open", href: "https://evil.example" } }] }],
  ["inconsistent read state", { ...page, notifications: [{ ...notification, isRead: true }] }],
])("rejects a %s", async (_label, body) => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
  await expect(getNotifications({ pageSize: 20 })).rejects.toMatchObject({
    code: "REQUEST_FAILED",
  });
});
```

Also cover invalid JSON, network rejection, unexpected status/code combinations, strict 400/401/403/404/500 responses, cursor omission, URL encoding, canonical ID validation before fetch, and the strict `{ notification }` PATCH wrapper.

- [ ] **Step 2: Run the test to verify red**

Run:

```powershell
cd web
npm.cmd test -- src/lib/notifications/browser-client.test.ts
```

Expected: FAIL because `browser-client.ts` does not exist.

- [ ] **Step 3: Implement the closed transport**

Create the client with these exact public interfaces:

```ts
export const NOTIFICATION_KINDS = [
  "claim_received",
  "claim_withdrawn",
  "claim_approved",
  "claim_rejected",
  "claim_handover_ready",
  "claim_completed",
  "report_recovered",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export type PublicNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  summary: string;
  action: { label: string; href: string };
  createdAt: string;
  readAt: string | null;
  isRead: boolean;
};
export type NotificationPage = {
  notifications: PublicNotification[];
  pagination: { nextCursor: string | null; hasMore: boolean };
  unreadCount: number;
};
export type NotificationListInput = { pageSize?: number; cursor?: string };
```

Use strict schemas and a read-state refinement:

```ts
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/);
const notificationSchema = z
  .strictObject({
    id: objectIdSchema,
    kind: z.enum(NOTIFICATION_KINDS),
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(240),
    action: z.strictObject({
      label: z.string().min(1).max(40),
      href: z.string().regex(/^\/(claims|reports)\/[a-f\d]{24}$/),
    }),
    createdAt: z.string().datetime({ offset: true }),
    readAt: z.string().datetime({ offset: true }).nullable(),
    isRead: z.boolean(),
  })
  .refine((value) => value.isRead === (value.readAt !== null));
```

Define a safe error class with only these browser-facing codes:

```ts
export type NotificationBrowserErrorCode =
  | "VALIDATION_ERROR"
  | "AUTHENTICATION_REQUIRED"
  | "NOTIFICATION_FORBIDDEN"
  | "NOTIFICATION_NOT_FOUND"
  | "NOTIFICATION_OPERATION_FAILED"
  | "REQUEST_FAILED"
  | "NETWORK_ERROR";

export class NotificationBrowserError extends Error {
  constructor(
    readonly code: NotificationBrowserErrorCode,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "NotificationBrowserError";
  }
}
```

Implement one `fetchSameOrigin` and one strict response parser. Require the
server's safe code to match its documented HTTP status. For malformed success or
error responses throw `REQUEST_FAILED`; for fetch rejection throw
`NETWORK_ERROR`. Build GET queries with `URLSearchParams`, omit default page size
when no input is supplied, and validate `notificationId` before PATCH.

- [ ] **Step 4: Run focused and type gates**

```powershell
npm.cmd test -- src/lib/notifications/browser-client.test.ts
npm.cmd exec -- tsc --noEmit --incremental false
npm.cmd run lint -- --no-warn-ignored src/lib/notifications/browser-client.ts src/lib/notifications/browser-client.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit Task 1**

```powershell
git add web/src/lib/notifications/browser-client.ts web/src/lib/notifications/browser-client.test.ts
git commit -m "feat(notification-ui): add strict browser client"
```

---

### Task 2: Current-account notification provider

**Files:**
- Create: `web/src/components/notifications/notification-provider.test.tsx`
- Create: `web/src/components/notifications/notification-provider.tsx`
- Modify: `web/src/app/layout.tsx`

**Interfaces:**
- Consumes: `useAuthSession()`, `getNotifications()`, `markNotificationRead()` and Task 1 types.
- Produces: `NotificationProvider`, `useNotifications()` and `NotificationContextValue` for Tasks 4 and 5.

- [ ] **Step 1: Write provider tests before implementation**

Mock authentication and the Task 1 client. Use a probe that prints the provider
state and invokes each action:

```tsx
function Probe() {
  const notifications = useNotifications();
  return (
    <>
      <p data-testid="status">{notifications.status}</p>
      <p data-testid="count">{notifications.unreadCount}</p>
      <p data-testid="ids">
        {notifications.notifications.map(({ id }) => id).join(",")}
      </p>
      <button onClick={() => void notifications.refresh()}>Refresh</button>
      <button onClick={() => void notifications.loadMore()}>Load more</button>
      <button onClick={() => void notifications.markRead(notificationId)}>
        Mark read
      </button>
    </>
  );
}
```

Prove the active-session gate:

```tsx
it.each([
  ["loading", null],
  ["unauthenticated", null],
  ["unavailable", null],
  ["authenticated", { ...activeUser, status: "suspended" }],
] as const)("does not fetch for %s", async (status, user) => {
  mockSession({ status, user });
  render(<NotificationProvider><Probe /></NotificationProvider>);
  await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("idle"));
  expect(getNotifications).not.toHaveBeenCalled();
});
```

Add tests for:

- one initial `getNotifications({ pageSize: 20 })` for every active role;
- no stale data visible during account change (the internal owner ID differs);
- logout and inactive transitions clear data immediately;
- a delayed old-account response cannot commit;
- refresh replaces the list and invalidates a pending load-more response;
- load-more uses only the current `nextCursor`, appends once and locks duplicate
  clicks;
- load-more failure retains list/cursor and sets `loadMoreFailed`;
- mark-read success replaces only that item and decrements once;
- already-read server results do not decrement;
- mark-read failure retains the item and adds its ID to `failedMarkIds`;
- simultaneous mark-read actions for different IDs remain independent;
- 401 clears data and exposes `authenticationExpired`; 403 exposes forbidden;
- the hook throws outside `NotificationProvider`.

- [ ] **Step 2: Run the provider test to verify red**

```powershell
npm.cmd test -- src/components/notifications/notification-provider.test.tsx
```

Expected: FAIL because the provider module does not exist.

- [ ] **Step 3: Implement the provider state boundary**

Export this context shape:

```ts
export type NotificationContextValue = {
  status: "idle" | "loading" | "ready" | "error" | "forbidden";
  notifications: PublicNotification[];
  unreadCount: number;
  hasMore: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  refreshFailed: boolean;
  loadMoreFailed: boolean;
  markingIds: ReadonlySet<string>;
  failedMarkIds: ReadonlySet<string>;
  authenticationExpired: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
};
```

Keep `nextCursor` and `ownerId` internal. Derive the exposed state as empty when
the current active account ID differs from the stored owner ID, preventing one
render of another account's list before effects run.

Use refs for operation identity:

```ts
const generation = useRef(0);
const loadMoreLock = useRef(false);
const marking = useRef(new Set<string>());
const currentAccountId = useRef<string | null>(null);
```

On active account change, increment `generation`, synchronously derive an empty
visible value, schedule the initial request with the captured account ID and
clear the scheduled work during cleanup. Each async action checks both the
captured generation and `currentAccountId.current` before committing.

Implement `refresh()` as a first-page replacement. Implement `loadMore()` only
when `hasMore`, a cursor exists and the lock is free. Implement `markRead(id)`
with a per-ID lock. Decrement only when the previous local item was unread and
the returned item is read:

```ts
setState((current) => ({
  ...current,
  notifications: current.notifications.map((item) =>
    item.id === updated.id ? updated : item,
  ),
  unreadCount:
    previous && !previous.isRead && updated.isRead
      ? Math.max(0, current.unreadCount - 1)
      : current.unreadCount,
}));
```

On client 401, clear the list and set `authenticationExpired`. On 403, clear the
list and set `forbidden`. Other failures retain successfully loaded data where
possible and expose only the relevant retry flag.

Place the provider inside `AuthSessionProvider` and around both header and page
content:

```tsx
<AuthSessionProvider>
  <NotificationProvider>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <SiteHeader />
    {children}
  </NotificationProvider>
</AuthSessionProvider>
```

- [ ] **Step 4: Run focused provider and session regression gates**

```powershell
npm.cmd test -- src/components/notifications/notification-provider.test.tsx src/components/auth/auth-session-provider.test.tsx
npm.cmd exec -- tsc --noEmit --incremental false
npm.cmd run lint -- --no-warn-ignored src/components/notifications/notification-provider.tsx src/components/notifications/notification-provider.test.tsx src/app/layout.tsx
```

Expected: all pass.

- [ ] **Step 5: Commit Task 2**

```powershell
git add web/src/components/notifications/notification-provider.tsx web/src/components/notifications/notification-provider.test.tsx web/src/app/layout.tsx
git commit -m "feat(notification-ui): share current account state"
```

---

### Task 3: Active-account notification access boundary

**Files:**
- Create: `web/src/components/notifications/notification-access-boundary.test.tsx`
- Create: `web/src/components/notifications/notification-access-boundary.tsx`
- Create: `web/src/components/notifications/notification-centre.module.css`

**Interfaces:**
- Consumes: `useAuthSession()` and `useNotifications()` from Task 2.
- Produces: `NotificationAccessBoundary` for the page in Task 4 and base state styles.

- [ ] **Step 1: Write the access matrix tests**

Use the existing Claim boundary test pattern and prove that children never mount
for blocked sessions:

```tsx
it.each(["student", "staff", "administrator"] as const)(
  "mounts notifications for an active %s",
  (role) => {
    mockSession({
      status: "authenticated",
      user: { ...activeUser, role, status: "active" },
    });
    renderBoundary();
    expect(screen.getByText("Private notification content")).toBeTruthy();
  },
);

it.each(["suspended", "deactivated"] as const)(
  "blocks a %s account",
  (status) => {
    mockSession({
      status: "authenticated",
      user: { ...activeUser, status },
    });
    renderBoundary();
    expect(
      screen.getByRole("heading", { name: "Notifications unavailable" }),
    ).toBeTruthy();
    expect(screen.queryByText("Private notification content")).toBeNull();
  },
);
```

Also test session loading, unauthenticated redirect, unavailable-session retry,
provider `authenticationExpired` redirect, provider forbidden state, and remount
on account ID change.

- [ ] **Step 2: Run the boundary test to verify red**

```powershell
npm.cmd test -- src/components/notifications/notification-access-boundary.test.tsx
```

Expected: FAIL because the boundary does not exist.

- [ ] **Step 3: Implement the minimal access gate**

Follow this ordering:

```tsx
if (session.status === "unavailable") return <SessionRetryState />;
if (session.status !== "authenticated" || !session.user) {
  return <p role="status">{session.status === "unauthenticated" ? "Taking you to sign in" : "Checking your account"}</p>;
}
if (session.user.status !== "active" || notifications.status === "forbidden") {
  return <UnavailableState />;
}
return <Fragment key={session.user.id}>{children}</Fragment>;
```

Use an effect to redirect on either unauthenticated session or
`authenticationExpired`. The unavailable state must contain only safe copy and a
`Back to dashboard` link. Reuse the new CSS module for state panels, buttons,
visually-hidden status text and 44-pixel targets.

- [ ] **Step 4: Run boundary and provider regressions**

```powershell
npm.cmd test -- src/components/notifications/notification-access-boundary.test.tsx src/components/notifications/notification-provider.test.tsx
npm.cmd exec -- tsc --noEmit --incremental false
npm.cmd run lint -- --no-warn-ignored src/components/notifications/notification-access-boundary.tsx src/components/notifications/notification-access-boundary.test.tsx
```

Expected: all pass.

- [ ] **Step 5: Commit Task 3**

```powershell
git add web/src/components/notifications/notification-access-boundary.tsx web/src/components/notifications/notification-access-boundary.test.tsx web/src/components/notifications/notification-centre.module.css
git commit -m "feat(notification-ui): guard notification access"
```

---

### Task 4: Notification centre page and interactions

**Files:**
- Create: `web/src/components/notifications/notification-centre.test.tsx`
- Create: `web/src/components/notifications/notification-centre.tsx`
- Modify: `web/src/components/notifications/notification-centre.module.css`
- Create: `web/src/app/notifications/notification-page.test.tsx`
- Create: `web/src/app/notifications/page.tsx`

**Interfaces:**
- Consumes: `NotificationContextValue` from Task 2 and `NotificationAccessBoundary` from Task 3.
- Produces: complete `/notifications` route for all active roles.

- [ ] **Step 1: Write presentation and interaction tests**

Mock `useNotifications()` with a ready fixture. Verify explicit read text and
safe actions:

```tsx
it("renders controlled unread and read entries with safe actions", () => {
  mockNotifications({
    status: "ready",
    unreadCount: 1,
    notifications: [unreadClaim, readReport],
  });
  render(<NotificationCentre />);

  expect(screen.getByRole("heading", { name: "Notifications" })).toBeTruthy();
  expect(screen.getByText("1 unread notification")).toBeTruthy();
  expect(screen.getByText("Unread")).toBeTruthy();
  expect(screen.getByText("Read")).toBeTruthy();
  expect(screen.getByRole("link", { name: "View claim" }).getAttribute("href"))
    .toBe(unreadClaim.action.href);
  expect(screen.getByRole("button", { name: "Mark as read" })).toBeTruthy();
});
```

Add tests for:

- initial loading and page-level initial error retry;
- empty ready state and dashboard link;
- `0`, `1` and plural unread copy;
- `Pacific/Auckland` timestamp formatting;
- refresh call, busy label and retained-list refresh error;
- load-more visibility, busy lock and retry after failure;
- per-item mark busy state and per-item retry message;
- read entries have no mark button;
- API action links are rendered directly without automatic mark-read;
- status and error live regions;
- page metadata title and composition of boundary plus centre.

Add CSS assertions:

```ts
const css = readFileSync(
  resolve("src/components/notifications/notification-centre.module.css"),
  "utf8",
);
expect(css).toMatch(/min-height:\s*44px/);
expect(css).toMatch(/@media\s*\(max-width:\s*24rem\)/);
expect(css).not.toMatch(/width:\s*\d{3,}px/);
expect(css).not.toMatch(/display:\s*none.*notification/s);
```

- [ ] **Step 2: Run page tests to verify red**

```powershell
npm.cmd test -- src/components/notifications/notification-centre.test.tsx src/app/notifications/notification-page.test.tsx
```

Expected: FAIL because the centre and route do not exist.

- [ ] **Step 3: Implement the page using provider actions**

Use one local date formatter:

```ts
const dateTimeFormatter = new Intl.DateTimeFormat("en-NZ", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Pacific/Auckland",
});
```

Render the list as semantic articles inside a labelled section. Every card must
include the explicit read label, controlled title/summary, `<time dateTime>`,
safe `Link`, and an unread-only mark button. Connect refresh, load-more and
mark-read buttons directly to provider actions and reflect only their relevant
busy/error state.

Compose the page:

```tsx
export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <main id="main-content">
      <NotificationAccessBoundary>
        <NotificationCentre />
      </NotificationAccessBoundary>
    </main>
  );
}
```

CSS must use the existing design tokens, `width: min(100% - 2rem, 72rem)`, grid
or flex layouts that collapse at 24rem, `overflow-wrap: anywhere`, visible focus
states and at least 44-pixel controls. Do not add motion or icon assets.

- [ ] **Step 4: Run page, provider and type gates**

```powershell
npm.cmd test -- src/components/notifications/notification-centre.test.tsx src/components/notifications/notification-access-boundary.test.tsx src/components/notifications/notification-provider.test.tsx src/app/notifications/notification-page.test.tsx
npm.cmd exec -- tsc --noEmit --incremental false
npm.cmd run lint -- --no-warn-ignored src/components/notifications/notification-centre.tsx src/components/notifications/notification-centre.test.tsx src/app/notifications/page.tsx src/app/notifications/notification-page.test.tsx
```

Expected: all pass.

- [ ] **Step 5: Commit Task 4**

```powershell
git add web/src/components/notifications/notification-centre.tsx web/src/components/notifications/notification-centre.test.tsx web/src/components/notifications/notification-centre.module.css web/src/app/notifications
git commit -m "feat(notification-ui): add notification centre"
```

---

### Task 5: Accessible unread navigation

**Files:**
- Modify: `web/src/components/site-header.test.tsx`
- Modify: `web/src/components/site-header.tsx`
- Modify: `web/src/components/site-header.module.css`

**Interfaces:**
- Consumes: `useNotifications()` from Task 2 and the existing authenticated navigation.
- Produces: active-account `Notifications` link with shared unread count.

- [ ] **Step 1: Add failing header tests**

Mock `useNotifications()` beside the current session mock. Prove all active
roles see the link and inaccessible accounts do not:

```tsx
it.each(["student", "staff", "administrator"] as const)(
  "shows notifications to an active %s",
  (role) => {
    mockSession({
      status: "authenticated",
      user: { ...safeUser, role, status: "active" },
    });
    mockNotifications({ unreadCount: 3, status: "ready" });
    render(<SiteHeader />);

    const link = screen.getByRole("link", {
      name: "Notifications, 3 unread",
    });
    expect(link.getAttribute("href")).toBe("/notifications");
    expect(link.textContent).toContain("3");
  },
);
```

Also prove:

- zero unread renders the visible link with no badge;
- `100` unread renders visible `99+` and an accessible unread label;
- provider loading/error keeps the link without claiming a count;
- signed-out, unavailable, suspended and deactivated sessions hide the link;
- the compact CSS keeps the link and badge visible, wrapped and 44 pixels.

- [ ] **Step 2: Run header tests to verify red**

```powershell
npm.cmd test -- src/components/site-header.test.tsx
```

Expected: FAIL because the header has no notification link or provider mock.

- [ ] **Step 3: Implement the minimal header entry**

Read the shared count only for active authenticated users:

```tsx
const notifications = useNotifications();
const unreadCount = isActive ? notifications.unreadCount : 0;
const unreadLabel = unreadCount === 1
  ? "Notifications, 1 unread"
  : unreadCount > 1
    ? `Notifications, ${unreadCount} unread`
    : "Notifications";
```

Render a normal text link before the Dashboard link. Use an `aria-hidden` badge
with visible `99+` capping and put the full meaning on the link's accessible
name. Add `.notificationLink` and `.notificationCount` rules without hiding the
link at any breakpoint.

- [ ] **Step 4: Run header and notification regression gates**

```powershell
npm.cmd test -- src/components/site-header.test.tsx src/components/notifications/notification-provider.test.tsx src/components/notifications/notification-centre.test.tsx
npm.cmd exec -- tsc --noEmit --incremental false
npm.cmd run lint -- --no-warn-ignored src/components/site-header.tsx src/components/site-header.test.tsx
```

Expected: all pass.

- [ ] **Step 5: Commit Task 5**

```powershell
git add web/src/components/site-header.tsx web/src/components/site-header.test.tsx web/src/components/site-header.module.css
git commit -m "feat(notification-ui): expose unread navigation"
```

---

### Task 6: Full verification and evidence

**Files:**
- Create: `docs/superpowers/verification/2026-08-26-notification-centre-frontend.md`

**Interfaces:**
- Consumes: completed Tasks 1–5.
- Produces: reproducible Issue #37 verification evidence and a clean branch ready to push.

- [ ] **Step 1: Run the focused notification frontend gate**

```powershell
cd web
npm.cmd test -- src/lib/notifications/browser-client.test.ts src/components/notifications/notification-provider.test.tsx src/components/notifications/notification-access-boundary.test.tsx src/components/notifications/notification-centre.test.tsx src/app/notifications/notification-page.test.tsx src/components/site-header.test.tsx
```

Expected: all focused files and tests pass.

- [ ] **Step 2: Run full repository gates**

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd exec -- tsc --noEmit --incremental false
npm.cmd run build
npm.cmd audit
```

Expected: every command exits 0, the build route table contains
`/notifications`, and audit reports zero vulnerabilities.

- [ ] **Step 3: Run privacy and scope checks**

From the repository root:

```powershell
git diff --name-status develop...HEAD
git diff --check develop...HEAD
git diff develop...HEAD -- web/package.json web/package-lock.json
rg -n "recipientId|eventKey|reviewNote|verificationMatchedCount|expectedAnswer|MONGODB_URI|mongodb\+srv" web/src/lib/notifications/browser-client.ts web/src/components/notifications web/src/app/notifications web/src/components/site-header.tsx
git check-ignore web/.env.local
```

Expected:

- only Issue #37 design, plan, frontend implementation/tests and verification
  files appear;
- dependency manifests have no diff;
- private-field and credential scan has no production match;
- `.env.local` remains ignored.

- [ ] **Step 4: Record exact evidence**

Create the verification document only after all commands finish. Under
`Automated verification`, add one table row for each command from Steps 1–3 and
copy the observed file count, test count, route output, exit result and audit
count verbatim. Do not save a generic `Passed` row when the command printed a
numeric result.

Use the title `Accessible Notification Centre Frontend Verification`, date
`2026-08-26` and branch `feature/issue-37-notification-centre-frontend`. The
document must contain four sections:

1. `Implemented scope` names the strict browser transport, current-account
   provider, access boundary, notification centre and shared navigation count.
2. `Automated verification` contains the exact command/result table described
   above.
3. `Accessibility and privacy evidence` cites the test files proving the active-
   role matrix, explicit text read state, live regions, focus behaviour, 44-pixel
   targets, 320-pixel layout, strict client schemas, safe relative actions and
   stale-account isolation. It also states the observed dependency diff and
   ignore result, and accurately says whether any real Atlas request ran.
4. `Deferred scope` lists polling, external channels, possible-match delivery,
   mark-all-read, deletion, retention and free-form communication.

- [ ] **Step 5: Check and commit verification**

```powershell
git diff --check
git add docs/superpowers/verification/2026-08-26-notification-centre-frontend.md
git commit -m "docs: record notification centre verification"
git status --short --branch
```

Expected: verification commit succeeds and the worktree is clean.

## Final review checklist

- [ ] Every spec requirement is implemented by exactly one task.
- [ ] Browser schemas and provider types use the same field names across Tasks 1–5.
- [ ] No page or header request begins before active authentication.
- [ ] Account changes cannot render or commit previous-account data.
- [ ] Mark-read count changes only after a successful unread-to-read transition.
- [ ] Loaded data survives recoverable refresh, load-more and mark-read failures.
- [ ] Read state is not conveyed by colour alone.
- [ ] Header and page remain functional at 320 pixels.
- [ ] No runtime dependency, backend contract, model or environment file changed.
- [ ] Focused and full quality gates pass without real Atlas access.
