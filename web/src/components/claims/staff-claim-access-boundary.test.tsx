// @vitest-environment jsdom

import { useState, type ReactNode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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

import { StaffClaimAccessBoundary } from "./staff-claim-access-boundary";

const replace = vi.fn();
const refreshSession = vi.fn().mockResolvedValue(undefined);
const activeStaff: NonNullable<AuthSessionContextValue["user"]> = {
  id: "staff-one",
  email: "staff@example.com",
  role: "staff",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Staff Member",
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

function renderBoundary(children: ReactNode = <p>Restricted evidence fixture</p>) {
  return render(<StaffClaimAccessBoundary>{children}</StaffClaimAccessBoundary>);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
});

afterEach(cleanup);

it("uses one persistent polite live region without an assertive unavailable wrapper", () => {
  mockSession({ status: "unavailable", user: null });
  const { container } = renderBoundary();

  const liveRegion = screen.getByRole("status");
  expect(liveRegion.getAttribute("aria-live")).toBe("polite");
  expect(liveRegion.getAttribute("aria-atomic")).toBe("true");
  expect(liveRegion.textContent).toBe("We could not check your account");
  expect(container.querySelectorAll("[aria-live]")).toHaveLength(1);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByText("Restricted evidence fixture")).toBeNull();
});

it("shows a polite loading state without mounting restricted content", () => {
  mockSession({ status: "loading", user: null });
  renderBoundary();

  expect(screen.getByRole("status").textContent).toBe("Checking Claim review access");
  expect(screen.queryByText("Restricted evidence fixture")).toBeNull();
});

it("redirects an unauthenticated visitor without mounting restricted content", async () => {
  mockSession({ status: "unauthenticated", user: null });
  renderBoundary();

  await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  expect(screen.getByRole("status").textContent).toBe("Taking you to sign in");
  expect(screen.queryByText("Restricted evidence fixture")).toBeNull();
});

it("uses a native keyboard control and focuses announced progress during retry", async () => {
  const user = userEvent.setup();
  const retry = deferred<void>();
  refreshSession.mockReturnValueOnce(retry.promise);
  mockSession({ status: "unavailable", user: null });
  const view = renderBoundary();
  const liveRegion = screen.getByRole("status");

  expect(screen.getByRole("heading", { name: "We could not check your account" })).toBeTruthy();
  expect(screen.getByText(/session may still be active/i)).toBeTruthy();
  expect(screen.queryByText("Restricted evidence fixture")).toBeNull();

  await user.tab();
  const retryButton = screen.getByRole("button", { name: "Retry session check" });
  expect(document.activeElement).toBe(retryButton);
  expect(retryButton.tagName).toBe("BUTTON");
  expect(retryButton.getAttribute("type")).toBe("button");

  await user.keyboard("{Enter}");
  expect(refreshSession).toHaveBeenCalledOnce();
  mockSession({ status: "loading", user: null });
  view.rerender(
    <StaffClaimAccessBoundary>
      <p>Restricted evidence fixture</p>
    </StaffClaimAccessBoundary>,
  );

  const checkingStatus = screen.getByRole("status");
  expect(checkingStatus).toBe(liveRegion);
  expect(checkingStatus.textContent).toBe("Checking Claim review access");
  expect(document.activeElement).toBe(checkingStatus);
  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByText("Restricted evidence fixture")).toBeNull();
  expect(replace).not.toHaveBeenCalled();

  mockSession({ status: "authenticated", user: activeStaff });
  view.rerender(
    <StaffClaimAccessBoundary>
      <p>Restricted evidence fixture</p>
    </StaffClaimAccessBoundary>,
  );
  await act(async () => retry.resolve());

  const workspace = await screen.findByRole("region", { name: "Claim review workspace" });
  await waitFor(() => expect(document.activeElement).toBe(workspace));
  expect(screen.getByRole("status")).toBe(liveRegion);
  expect(liveRegion.textContent).toBe("Claim review access confirmed");
  expect(screen.getByText("Restricted evidence fixture")).toBeTruthy();

  mockSession({
    status: "authenticated",
    user: { ...activeStaff, id: "staff-two" },
  });
  view.rerender(
    <StaffClaimAccessBoundary>
      <p>Restricted evidence fixture</p>
    </StaffClaimAccessBoundary>,
  );

  const nextWorkspace = screen.getByRole("region", { name: "Claim review workspace" });
  expect(nextWorkspace).not.toBe(workspace);
  await waitFor(() => expect(document.activeElement).toBe(nextWorkspace));
  expect(screen.getByRole("status")).toBe(liveRegion);
  expect(liveRegion.textContent).toBe("");
});

it("returns focus to Retry and announces a failed session recheck without leaking content", async () => {
  const user = userEvent.setup();
  const retry = deferred<void>();
  refreshSession.mockReturnValueOnce(retry.promise);
  mockSession({ status: "unavailable", user: null });
  const view = renderBoundary();
  const liveRegion = screen.getByRole("status");

  await user.tab();
  await user.keyboard("{Enter}");

  mockSession({ status: "loading", user: null });
  view.rerender(
    <StaffClaimAccessBoundary>
      <p>Restricted evidence fixture</p>
    </StaffClaimAccessBoundary>,
  );
  expect(screen.getByRole("status")).toBe(liveRegion);
  expect(document.activeElement).toBe(liveRegion);
  expect(screen.queryByRole("alert")).toBeNull();

  mockSession({ status: "unavailable", user: null });
  view.rerender(
    <StaffClaimAccessBoundary>
      <p>Restricted evidence fixture</p>
    </StaffClaimAccessBoundary>,
  );
  await act(async () => retry.resolve());

  const retryButton = screen.getByRole("button", { name: "Retry session check" });
  await waitFor(() => expect(document.activeElement).toBe(retryButton));
  expect(screen.getByRole("status")).toBe(liveRegion);
  expect(liveRegion.textContent).toBe(
    "Session check is still unavailable. Try again.",
  );
  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(screen.queryByText("Restricted evidence fixture")).toBeNull();
  expect(replace).not.toHaveBeenCalled();
});

it("does not render restricted content for an inconsistent authenticated session", () => {
  mockSession({ status: "authenticated", user: null });
  renderBoundary();

  expect(screen.getByRole("status").textContent).toBe("Checking Claim review access");
  expect(screen.queryByText("Restricted evidence fixture")).toBeNull();
});

it.each(["staff", "administrator"] as const)(
  "renders staff content for an active %s",
  (role) => {
    mockSession({
      status: "authenticated",
      user: { ...activeStaff, role },
    });
    renderBoundary();

    expect(screen.getByText("Restricted evidence fixture")).toBeTruthy();
  },
);

it.each([
  ["student", { ...activeStaff, role: "student" as const }],
  ["suspended staff", { ...activeStaff, status: "suspended" as const }],
  ["deactivated administrator", { ...activeStaff, role: "administrator" as const, status: "deactivated" as const }],
])("does not render restricted evidence for a %s", (_label, user) => {
  mockSession({ status: "authenticated", user });
  renderBoundary();

  expect(
    screen.getByRole("heading", { name: "Claim review access unavailable" }),
  ).toBeTruthy();
  expect(screen.getByText(/only active staff and administrator accounts/i)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Back to dashboard" }).getAttribute("href")).toBe(
    "/dashboard",
  );
  expect(screen.queryByText("Restricted evidence fixture")).toBeNull();
});

it("remounts protected content when the authorised account changes", () => {
  let mountCount = 0;

  function Probe() {
    const [mountNumber] = useState(() => ++mountCount);
    return <p>Review workspace {mountNumber}</p>;
  }

  mockSession({ status: "authenticated", user: activeStaff });
  const view = renderBoundary(<Probe />);
  expect(screen.getByText("Review workspace 1")).toBeTruthy();

  mockSession({
    status: "authenticated",
    user: { ...activeStaff, id: "staff-two" },
  });
  view.rerender(
    <StaffClaimAccessBoundary>
      <Probe />
    </StaffClaimAccessBoundary>,
  );

  expect(screen.getByText("Review workspace 2")).toBeTruthy();
  expect(mountCount).toBe(2);
});
