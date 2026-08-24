// @vitest-environment jsdom

import { useState, type ReactNode } from "react";
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

import { ClaimantAccessBoundary } from "./claimant-access-boundary";

const replace = vi.fn();
const refreshSession = vi.fn().mockResolvedValue(undefined);
const activeStudent: NonNullable<AuthSessionContextValue["user"]> = {
  id: "student-one",
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

function renderBoundary(children: ReactNode = <p>Private claim content</p>) {
  return render(<ClaimantAccessBoundary>{children}</ClaimantAccessBoundary>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
});

afterEach(cleanup);

it("shows a polite loading state without mounting claimant content", () => {
  mockSession({ status: "loading", user: null });
  renderBoundary();

  expect(screen.getByRole("status").textContent).toBe("Checking your account");
  expect(screen.queryByText("Private claim content")).toBeNull();
});

it("redirects an unauthenticated visitor without mounting claimant content", async () => {
  mockSession({ status: "unauthenticated", user: null });
  renderBoundary();

  await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  expect(screen.getByRole("status").textContent).toBe("Taking you to sign in");
  expect(screen.queryByText("Private claim content")).toBeNull();
});

it("offers session retry without redirecting or mounting claimant content", async () => {
  const user = userEvent.setup();
  mockSession({ status: "unavailable", user: null });
  renderBoundary();

  expect(screen.getByRole("heading", { name: "We could not check your account" })).toBeTruthy();
  expect(screen.queryByText("Private claim content")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Retry session check" }));
  expect(refreshSession).toHaveBeenCalledOnce();
  expect(replace).not.toHaveBeenCalled();
});

it.each([
  { label: "staff", user: { ...activeStudent, role: "staff" as const } },
  {
    label: "administrator",
    user: { ...activeStudent, role: "administrator" as const },
  },
  {
    label: "suspended student",
    user: { ...activeStudent, status: "suspended" as const },
  },
  {
    label: "deactivated student",
    user: { ...activeStudent, status: "deactivated" as const },
  },
])("blocks a $label account without mounting claimant content", ({ user }) => {
  mockSession({ status: "authenticated", user });
  renderBoundary();

  expect(screen.getByRole("heading", { name: "Claim access unavailable" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Back to dashboard" }).getAttribute("href")).toBe(
    "/dashboard",
  );
  expect(screen.queryByText("Private claim content")).toBeNull();
});

it("mounts content only for an active student and remounts on account change", () => {
  let mountCount = 0;

  function Probe() {
    const [mountNumber] = useState(() => ++mountCount);

    return <p>Claim workspace {mountNumber}</p>;
  }

  mockSession({ status: "authenticated", user: activeStudent });
  const view = renderBoundary(<Probe />);
  expect(screen.getByText("Claim workspace 1")).toBeTruthy();

  mockSession({
    status: "authenticated",
    user: { ...activeStudent, id: "student-two" },
  });
  view.rerender(
    <ClaimantAccessBoundary>
      <Probe />
    </ClaimantAccessBoundary>,
  );

  expect(screen.getByText("Claim workspace 2")).toBeTruthy();
  expect(mountCount).toBe(2);
});
