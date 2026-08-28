// @vitest-environment jsdom

import { useState, type ReactNode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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

import { StaffAccessBoundary } from "./staff-access-boundary";

const copy = {
  checking: "Checking report handling access",
  confirmed: "Report handling access confirmed",
  unavailableHeading: "We could not check your account",
  forbiddenHeading: "Report handling access unavailable",
  forbiddenDescription:
    "Only active staff and administrator accounts can handle reports.",
  workspaceLabel: "Report handling workspace",
};
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

function renderBoundary(children: ReactNode = <p>Protected report fixture</p>) {
  return render(
    <StaffAccessBoundary copy={copy}>{children}</StaffAccessBoundary>,
  );
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

describe("shared staff access boundary", () => {
  it("keeps one polite live region and hides protected content while checking", () => {
    mockSession({ status: "loading", user: null });
    const { container } = renderBoundary();
    const status = screen.getByRole("status");
    expect(status.textContent).toBe(copy.checking);
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(1);
    expect(screen.queryByText("Protected report fixture")).toBeNull();
  });

  it("redirects an unauthenticated visitor before mounting content", async () => {
    mockSession({ status: "unauthenticated", user: null });
    renderBoundary();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.getByRole("status").textContent).toBe("Taking you to sign in");
    expect(screen.queryByText("Protected report fixture")).toBeNull();
  });

  it.each(["staff", "administrator"] as const)(
    "renders the configured workspace for active %s",
    (role) => {
      mockSession({
        status: "authenticated",
        user: { ...activeStaff, role },
      });
      renderBoundary();
      expect(
        screen.getByRole("region", { name: copy.workspaceLabel }),
      ).toBeTruthy();
      expect(screen.getByText("Protected report fixture")).toBeTruthy();
    },
  );

  it.each([
    ["student", { ...activeStaff, role: "student" as const }],
    ["inactive staff", { ...activeStaff, status: "suspended" as const }],
  ])("shows configured denial without content for %s", (_case, user) => {
    mockSession({ status: "authenticated", user });
    renderBoundary();
    expect(
      screen.getByRole("heading", { name: copy.forbiddenHeading }),
    ).toBeTruthy();
    expect(screen.getByText(copy.forbiddenDescription)).toBeTruthy();
    expect(screen.queryByText("Protected report fixture")).toBeNull();
  });

  it("keeps retry single-flight and restores focus after success", async () => {
    const user = userEvent.setup();
    const retry = deferred<void>();
    refreshSession.mockReturnValueOnce(retry.promise);
    mockSession({ status: "unavailable", user: null });
    const view = renderBoundary();

    const retryButton = screen.getByRole("button", {
      name: "Retry session check",
    });
    await user.click(retryButton);
    await user.click(retryButton);
    expect(refreshSession).toHaveBeenCalledOnce();

    mockSession({ status: "loading", user: null });
    view.rerender(
      <StaffAccessBoundary copy={copy}>
        <p>Protected report fixture</p>
      </StaffAccessBoundary>,
    );
    expect(screen.getByRole("status").textContent).toBe(copy.checking);

    mockSession({ status: "authenticated", user: activeStaff });
    view.rerender(
      <StaffAccessBoundary copy={copy}>
        <p>Protected report fixture</p>
      </StaffAccessBoundary>,
    );
    await act(async () => retry.resolve());
    const workspace = await screen.findByRole("region", {
      name: copy.workspaceLabel,
    });
    await waitFor(() => expect(document.activeElement).toBe(workspace));
    expect(screen.getByRole("status").textContent).toBe(copy.confirmed);
  });

  it("returns focus to Retry after an unavailable recheck", async () => {
    const user = userEvent.setup();
    mockSession({ status: "unavailable", user: null });
    renderBoundary();
    const retryButton = screen.getByRole("button", {
      name: "Retry session check",
    });
    await user.click(retryButton);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Retry session check" }),
      ),
    );
    expect(screen.getByRole("status").textContent).toBe(
      "Session check is still unavailable. Try again.",
    );
  });

  it("remounts children when the authorised account changes", () => {
    let mounts = 0;
    function Probe() {
      const [number] = useState(() => ++mounts);
      return <p>Workspace {number}</p>;
    }
    mockSession({ status: "authenticated", user: activeStaff });
    const view = renderBoundary(<Probe />);
    expect(screen.getByText("Workspace 1")).toBeTruthy();

    mockSession({
      status: "authenticated",
      user: { ...activeStaff, id: "staff-two" },
    });
    view.rerender(
      <StaffAccessBoundary copy={copy}>
        <Probe />
      </StaffAccessBoundary>,
    );
    expect(screen.getByText("Workspace 2")).toBeTruthy();
  });
});
