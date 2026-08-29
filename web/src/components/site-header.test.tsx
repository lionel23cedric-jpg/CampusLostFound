// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/components/auth/auth-session-provider", () => ({
  useAuthSession: vi.fn(),
}));
vi.mock("@/components/notifications/notification-provider", () => ({
  useNotifications: vi.fn(),
}));

import { useRouter } from "next/navigation";
import {
  type AuthSessionContextValue,
  useAuthSession,
} from "@/components/auth/auth-session-provider";
import {
  type NotificationContextValue,
  useNotifications,
} from "@/components/notifications/notification-provider";

import styles from "./site-header.module.css";
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

const notificationState: NotificationContextValue = {
  status: "ready",
  notifications: [],
  unreadCount: 0,
  hasMore: false,
  isRefreshing: false,
  isLoadingMore: false,
  refreshFailed: false,
  loadMoreFailed: false,
  markingIds: new Set(),
  failedMarkIds: new Set(),
  authenticationExpired: false,
  refresh: vi.fn(),
  loadMore: vi.fn(),
  markRead: vi.fn(),
};

function mockSession(overrides: Partial<AuthSessionContextValue>) {
  vi.mocked(useAuthSession).mockReturnValue({
    status: "unauthenticated",
    user: null,
    setAuthenticatedUser: vi.fn(),
    refreshSession,
    logout,
    ...overrides,
  });
}

function mockNotifications(overrides: Partial<NotificationContextValue> = {}) {
  vi.mocked(useNotifications).mockReturnValue({
    ...notificationState,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue({ replace, refresh } as never);
  mockNotifications();
});

afterEach(cleanup);

it("keeps the home link as a centred 44 pixel touch target", () => {
  const css = readFileSync(resolve("src/components/site-header.module.css"), "utf8");
  const brandRule = css.match(/\.brand\s*\{([^}]*)\}/)?.[1];

  expect(brandRule).toMatch(/min-width:\s*44px/);
  expect(brandRule).toMatch(/min-height:\s*44px/);
  expect(brandRule).toMatch(/justify-content:\s*center/);
});

it("keeps compact account navigation within narrow screens", () => {
  const css = readFileSync(resolve("src/components/site-header.module.css"), "utf8");
  const navLinkRule = css.match(/\.navLink\s*\{([^}]*)\}/)?.[1];
  const accountButtonRule = css.match(/\.signOut,\s*\.retry\s*\{([^}]*)\}/)?.[1];
  const wrapRuleIndex = css.indexOf("flex-wrap: wrap");
  const compactStart = css.lastIndexOf("@media", wrapRuleIndex);
  const compactHeader = css.slice(compactStart, css.indexOf("{", compactStart));
  const compactBreakpoint = compactHeader.match(/max-width:\s*([\d.]+)rem/)?.[1];
  const compactCss = css.slice(compactStart);

  expect(navLinkRule).toMatch(/min-width:\s*44px/);
  expect(navLinkRule).toMatch(/min-height:\s*44px/);
  expect(accountButtonRule).toMatch(/min-width:\s*44px/);
  expect(accountButtonRule).toMatch(/min-height:\s*44px/);
  expect(Number(compactBreakpoint)).toBeGreaterThanOrEqual(24);
  expect(compactCss).toMatch(
    /\.inner,\s*\.navigation\s*\{[^}]*gap:\s*0\.25rem/,
  );
  expect(compactCss).toMatch(/\.navigation\s*\{[^}]*flex-wrap:\s*wrap/);
  expect(compactCss).toMatch(/\.navigation\s*\{[^}]*min-width:\s*0/);
  expect(compactCss).toMatch(
    /\.navigation :global\(\.primary-action\),\s*\.navLink,\s*\.signOut,\s*\.retry\s*\{[^}]*min-width:\s*44px[^}]*padding-inline:\s*0\.25rem/,
  );
  expect(compactCss).not.toMatch(/\.(?:navLink|signOut)\s*\{[^}]*display:\s*none/);
});

it("keeps notification navigation and its badge visible and touch accessible", () => {
  const css = readFileSync(resolve("src/components/site-header.module.css"), "utf8");
  const linkRule = css.match(/\.notificationLink\s*\{([^}]*)\}/)?.[1];
  const countRule = css.match(/\.notificationCount\s*\{([^}]*)\}/)?.[1];

  expect(linkRule).toMatch(/display:\s*inline-flex/);
  expect(linkRule).toMatch(/min-width:\s*44px/);
  expect(linkRule).toMatch(/min-height:\s*44px/);
  expect(linkRule).toMatch(/flex-flow:\s*row wrap/);
  expect(countRule).toMatch(/display:\s*inline-flex/);
  expect(css).not.toMatch(/\.notification(?:Link|Count)\s*\{[^}]*display:\s*none/);
});

it("shows signed-out navigation", () => {
  mockSession({ status: "unauthenticated", user: null });
  render(<SiteHeader />);

  expect(screen.getByRole("link", { name: "Campus Find home" }).getAttribute("href")).toBe("/");
  const signIn = screen.getByRole("link", { name: "Sign in" });
  expect(signIn.getAttribute("href")).toBe("/login");
  expect(signIn.classList.contains(styles.navLink)).toBe(true);
  expect(screen.getByRole("link", { name: "Create account" }).getAttribute("href")).toBe(
    "/register",
  );
  expect(screen.queryByRole("link", { name: "Report item" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Browse" })).toBeNull();
  expect(screen.queryByRole("link", { name: "My reports" })).toBeNull();
});

it("shows the safe display name and dashboard for an authenticated user", () => {
  mockSession({ status: "authenticated", user: safeUser });
  render(<SiteHeader />);

  expect(screen.getByText("Student Name")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("href")).toBe(
    "/dashboard",
  );
  expect(screen.getByRole("link", { name: "Profile" }).getAttribute("href")).toBe(
    "/profile",
  );
  expect(screen.getByRole("link", { name: "Browse" }).getAttribute("href")).toBe(
    "/reports",
  );
  expect(screen.getByRole("link", { name: "My reports" }).getAttribute("href")).toBe(
    "/reports/mine",
  );
  expect(screen.getByRole("link", { name: "My claims" }).getAttribute("href")).toBe(
    "/claims",
  );
  expect(screen.getByRole("link", { name: "Report item" }).getAttribute("href")).toBe(
    "/reports/new",
  );
  expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Claim reviews" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Report handling" })).toBeNull();
});

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

it.each(["student", "staff", "administrator"] as const)(
  "shows My reports to an active %s",
  (role) => {
    mockSession({
      status: "authenticated",
      user: { ...safeUser, role, status: "active" },
    });
    render(<SiteHeader />);

    expect(
      screen.getByRole("link", { name: "My reports" }).getAttribute("href"),
    ).toBe("/reports/mine");
  },
);

it("shows a notification link without a badge when nothing is unread", () => {
  mockSession({ status: "authenticated", user: safeUser });
  mockNotifications({ unreadCount: 0, status: "ready" });
  render(<SiteHeader />);

  const link = screen.getByRole("link", { name: "Notifications" });
  expect(link.getAttribute("href")).toBe("/notifications");
  expect(link.textContent).toBe("Notifications");
});

it("caps the visible badge without truncating its accessible count", () => {
  mockSession({ status: "authenticated", user: safeUser });
  mockNotifications({ unreadCount: 100, status: "ready" });
  render(<SiteHeader />);

  const link = screen.getByRole("link", { name: "Notifications, 100 unread" });
  expect(link.textContent).toContain("99+");
  expect(link.textContent).not.toContain("100");
});

it.each(["loading", "error"] as const)(
  "keeps the notification link without claiming a count while provider is %s",
  (status) => {
    mockSession({ status: "authenticated", user: safeUser });
    mockNotifications({ status, unreadCount: 7 });
    render(<SiteHeader />);

    expect(screen.getByRole("link", { name: "Notifications" })).toBeTruthy();
    expect(screen.queryByText("7")).toBeNull();
  },
);

it.each([
  ["signed-out", { status: "unauthenticated" as const, user: null }],
  ["unavailable", { status: "unavailable" as const, user: null }],
  [
    "suspended",
    {
      status: "authenticated" as const,
      user: { ...safeUser, status: "suspended" as const },
    },
  ],
  [
    "deactivated",
    {
      status: "authenticated" as const,
      user: { ...safeUser, status: "deactivated" as const },
    },
  ],
])("hides notifications from a %s account state", (_label, session) => {
  mockSession(session);
  mockNotifications({ unreadCount: 3 });
  render(<SiteHeader />);

  expect(screen.queryByRole("link", { name: /notifications/i })).toBeNull();
  expect(screen.queryByRole("link", { name: "My reports" })).toBeNull();
});

it.each(["staff", "administrator"] as const)(
  "shows staff tools only to an active %s",
  (role) => {
    mockSession({
      status: "authenticated",
      user: { ...safeUser, role, status: "active" },
    });
    render(<SiteHeader />);

    expect(
      screen.getByRole("link", { name: "Claim reviews" }).getAttribute("href"),
    ).toBe("/staff/claims");
    expect(
      screen.getByRole("link", { name: "Report handling" }).getAttribute("href"),
    ).toBe("/staff/reports");
    expect(screen.getByRole("link", { name: "Profile" }).getAttribute("href")).toBe(
      "/profile",
    );
    expect(screen.queryByRole("link", { name: "My claims" })).toBeNull();
  },
);

it("shows Admin overview only to an active administrator", () => {
  mockSession({
    status: "authenticated",
    user: { ...safeUser, role: "administrator", status: "active" },
  });
  render(<SiteHeader />);

  expect(
    screen.getByRole("link", { name: "Admin overview" }).getAttribute("href"),
  ).toBe("/admin");
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

it.each([
  [
    "suspended student",
    { status: "authenticated", user: { ...safeUser, status: "suspended" } },
  ],
  [
    "suspended staff",
    {
      status: "authenticated",
      user: { ...safeUser, role: "staff", status: "suspended" },
    },
  ],
  [
    "deactivated administrator",
    {
      status: "authenticated",
      user: { ...safeUser, role: "administrator", status: "deactivated" },
    },
  ],
  ["signed-out visitor", { status: "unauthenticated", user: null }],
  ["unavailable session", { status: "unavailable", user: null }],
] as const)("does not show Claim navigation for a %s", (_label, session) => {
  mockSession(session as Partial<AuthSessionContextValue>);
  render(<SiteHeader />);

  expect(screen.queryByRole("link", { name: "My claims" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Claim reviews" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Report handling" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Profile" })).toBeNull();
});

it("signs out and replaces navigation with home", async () => {
  const user = userEvent.setup();
  mockSession({ status: "authenticated", user: safeUser, logout });
  render(<SiteHeader />);

  await user.click(screen.getByRole("button", { name: "Sign out" }));
  expect(logout).toHaveBeenCalledOnce();
  expect(replace).toHaveBeenCalledWith("/");
  expect(refresh).toHaveBeenCalledOnce();
});

it("keeps an accessible retry action when session resolution is unavailable", async () => {
  const user = userEvent.setup();
  mockSession({ status: "unavailable", user: null });
  render(<SiteHeader />);

  await user.click(screen.getByRole("button", { name: "Retry session check" }));
  expect(refreshSession).toHaveBeenCalledOnce();
  expect(screen.queryByRole("link", { name: "Report item" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Browse" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Profile" })).toBeNull();
});

it("announces session loading without navigation links", () => {
  mockSession({ status: "loading", user: null });
  render(<SiteHeader />);

  expect(screen.getByText("Checking session")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Report item" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Browse" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Profile" })).toBeNull();
});

it("shows only a generic logout failure message", async () => {
  const user = userEvent.setup();
  logout.mockRejectedValueOnce(new Error("private session deletion detail"));
  mockSession({ status: "authenticated", user: safeUser, logout });
  render(<SiteHeader />);

  await user.click(screen.getByRole("button", { name: "Sign out" }));
  expect(screen.getByRole("alert").textContent).toBe(
    "We could not sign you out. Please try again.",
  );
  expect(screen.queryByText("private session deletion detail")).toBeNull();
});
