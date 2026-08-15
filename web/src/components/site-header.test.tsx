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

it("shows signed-out navigation", () => {
  mockSession({ status: "unauthenticated", user: null });
  render(<SiteHeader />);

  expect(screen.getByRole("link", { name: "Campus Find home" }).getAttribute("href")).toBe("/");
  expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
  expect(screen.getByRole("link", { name: "Create account" }).getAttribute("href")).toBe(
    "/register",
  );
});

it("shows the safe display name and dashboard for an authenticated user", () => {
  mockSession({ status: "authenticated", user: safeUser });
  render(<SiteHeader />);

  expect(screen.getByText("Student Name")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("href")).toBe(
    "/dashboard",
  );
  expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
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
});

it("announces session loading without navigation links", () => {
  mockSession({ status: "loading", user: null });
  render(<SiteHeader />);

  expect(screen.getByText("Checking session")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
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
