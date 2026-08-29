// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/components/auth/auth-session-provider", () => ({
  useAuthSession: vi.fn(),
}));
vi.mock("@/components/reports/report-submission-client", () => ({
  ReportSubmissionClient: () => <section aria-label="Report submission fixture" />,
}));

import { useRouter } from "next/navigation";
import {
  type AuthSessionContextValue,
  useAuthSession,
} from "@/components/auth/auth-session-provider";
import NewReportPage, { metadata as newReportMetadata } from "@/app/reports/new/page";

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
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
});

afterEach(cleanup);

it("renders the report submission route with its page metadata", () => {
  const { container } = render(<NewReportPage />);

  expect(newReportMetadata.title).toBe("Report an item");
  expect(container.querySelector("main#main-content")).toBeTruthy();
  expect(screen.getByLabelText("Report submission fixture")).toBeTruthy();
});

it("shows a stable loading state without private content", () => {
  mockSession({ status: "loading", user: null });
  render(<DashboardClient />);

  expect(screen.getByRole("status").textContent).toContain("Loading your dashboard");
  expect(screen.queryByText("Student Name")).toBeNull();
});

it("redirects an unauthenticated visitor with history replacement", async () => {
  mockSession({ status: "unauthenticated", user: null });
  render(<DashboardClient />);

  await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  expect(screen.queryByText("Student Name")).toBeNull();
});

it("shows a retryable unavailable state without redirecting", async () => {
  const user = userEvent.setup();
  mockSession({ status: "unavailable", user: null });
  render(<DashboardClient />);

  await user.click(screen.getByRole("button", { name: "Retry session check" }));
  expect(refreshSession).toHaveBeenCalledOnce();
  expect(replace).not.toHaveBeenCalled();
});

it("renders safe account details and the available report actions", () => {
  mockSession({ status: "authenticated", user: safeUser });
  const { container } = render(<DashboardClient />);

  expect(screen.getByRole("heading", { name: "Welcome, Student Name" })).toBeTruthy();
  expect(screen.getByText("student@example.com")).toBeTruthy();
  expect(screen.getByText("Student")).toBeTruthy();
  expect(screen.getByText("Active")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Report an item" }).getAttribute("href"),
  ).toBe("/reports/new");
  expect(
    screen.getByRole("link", { name: "Search possible matches" }).getAttribute("href"),
  ).toBe("/reports");
  expect(
    screen.getByRole("link", { name: "Review my report history" }).getAttribute("href"),
  ).toBe("/reports/mine");
  expect(
    screen.getByRole("link", { name: "Manage recovery requests" }).getAttribute("href"),
  ).toBe("/claims");
  expect(
    screen.getByRole("link", { name: "Manage profile settings" }).getAttribute("href"),
  ).toBe("/profile");
  expect(screen.queryByRole("link", { name: "Review ownership claims" })).toBeNull();
  expect(screen.getAllByText("Available now")).toHaveLength(5);
  expect(screen.queryByText("Upcoming")).toBeNull();
  expect(container.textContent).not.toMatch(/password|token|session hash/i);
  expect(container.textContent).not.toContain("user-id");
});

it.each(["staff", "administrator"] as const)(
  "links an active %s to ownership Claim reviews",
  (role) => {
    mockSession({
      status: "authenticated",
      user: { ...safeUser, role, status: "active" },
    });
    render(<DashboardClient />);

    expect(
      screen.getByRole("link", { name: "Review ownership claims" }).getAttribute("href"),
    ).toBe("/staff/claims");
    expect(
      screen.getByRole("link", { name: "Handle item reports" }).getAttribute("href"),
    ).toBe("/staff/reports");
    expect(screen.queryByRole("link", { name: "Manage recovery requests" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Manage profile settings" }).getAttribute("href"),
    ).toBe("/profile");
    expect(
      screen.getByRole("link", { name: "Review my report history" }).getAttribute("href"),
    ).toBe("/reports/mine");
    expect(screen.getAllByText("Available now")).toHaveLength(
      role === "administrator" ? 7 : 6,
    );
    expect(screen.queryByText("Upcoming")).toBeNull();
  },
);

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

it.each([
  ["suspended student", { ...safeUser, status: "suspended" as const }],
  [
    "suspended staff",
    { ...safeUser, role: "staff" as const, status: "suspended" as const },
  ],
  [
    "deactivated administrator",
    {
      ...safeUser,
      role: "administrator" as const,
      status: "deactivated" as const,
    },
  ],
])("keeps every recovery destination unavailable for a %s", (_label, user) => {
  mockSession({ status: "authenticated", user });
  render(<DashboardClient />);

  expect(screen.queryByRole("link", { name: "Manage recovery requests" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Review ownership claims" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Handle item reports" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Manage profile settings" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Review my report history" })).toBeNull();
  expect(screen.getAllByText("Available now")).toHaveLength(2);
  expect(screen.getAllByText("Upcoming")).toHaveLength(1);
});

it("shows unverified and first-sign-in fallbacks", () => {
  mockSession({ status: "authenticated", user: safeUser });
  render(<DashboardClient />);

  expect(screen.getByText("Not verified")).toBeTruthy();
  expect(screen.getByText("First sign-in")).toBeTruthy();
});

it("formats verified and last-login dates for New Zealand", () => {
  mockSession({
    status: "authenticated",
    user: {
      ...safeUser,
      emailVerifiedAt: "2026-08-10T08:00:00.000Z",
      lastLoginAt: "2026-08-12T08:00:00.000Z",
    },
  });
  render(<DashboardClient />);

  expect(screen.getByText("Verified")).toBeTruthy();
  expect(screen.getByText("12 Aug 2026")).toBeTruthy();
});

it("does not render account content for an inconsistent authenticated state", () => {
  mockSession({ status: "authenticated", user: null });
  render(<DashboardClient />);

  expect(screen.getByRole("status").textContent).toContain("Loading your dashboard");
  expect(screen.queryByRole("heading", { name: /Welcome/ })).toBeNull();
});
