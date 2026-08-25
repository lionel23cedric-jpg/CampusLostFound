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

import { useRouter } from "next/navigation";
import {
  type AuthSessionContextValue,
  useAuthSession,
} from "@/components/auth/auth-session-provider";

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue({ replace, refresh } as never);
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
  expect(screen.getByRole("link", { name: "My claims" }).getAttribute("href")).toBe(
    "/claims",
  );
  expect(screen.getByRole("link", { name: "Report item" }).getAttribute("href")).toBe(
    "/reports/new",
  );
  expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Claim reviews" })).toBeNull();
});

it.each(["staff", "administrator"] as const)(
  "shows Claim reviews only to an active %s",
  (role) => {
    mockSession({
      status: "authenticated",
      user: { ...safeUser, role, status: "active" },
    });
    render(<SiteHeader />);

    expect(
      screen.getByRole("link", { name: "Claim reviews" }).getAttribute("href"),
    ).toBe("/staff/claims");
    expect(screen.getByRole("link", { name: "Profile" }).getAttribute("href")).toBe(
      "/profile",
    );
    expect(screen.queryByRole("link", { name: "My claims" })).toBeNull();
  },
);

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
