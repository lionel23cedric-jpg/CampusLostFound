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

import { AdministratorAccessBoundary } from "./administrator-access-boundary";

const replace = vi.fn();
const refreshSession = vi.fn().mockResolvedValue(undefined);
const activeAdministrator: NonNullable<AuthSessionContextValue["user"]> = {
  id: "administrator-one",
  email: "administrator@example.com",
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

function renderBoundary(children: ReactNode = <p>Protected overview fixture</p>) {
  return render(
    <AdministratorAccessBoundary>{children}</AdministratorAccessBoundary>,
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

it("shows one polite loading announcement without protected content", () => {
  mockSession({ status: "loading", user: null });
  const { container } = renderBoundary();

  expect(screen.getByRole("status").textContent).toBe(
    "Checking administrator access",
  );
  expect(container.querySelectorAll("[aria-live]")).toHaveLength(1);
  expect(screen.queryByText("Protected overview fixture")).toBeNull();
});

it("redirects an unauthenticated visitor before mounting protected content", async () => {
  mockSession({ status: "unauthenticated", user: null });
  renderBoundary();

  await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  expect(screen.getByRole("status").textContent).toBe("Taking you to sign in");
  expect(screen.queryByText("Protected overview fixture")).toBeNull();
});

it("renders protected content only for an active administrator", () => {
  mockSession({ status: "authenticated", user: activeAdministrator });
  renderBoundary();

  expect(
    screen.getByRole("region", { name: "Administrator overview workspace" }),
  ).toBeTruthy();
  expect(screen.getByText("Protected overview fixture")).toBeTruthy();
});

it("uses account-management labels without changing the permission boundary", () => {
  mockSession({ status: "authenticated", user: activeAdministrator });
  render(
    <AdministratorAccessBoundary
      workspaceLabel="Administrator account management workspace"
      forbiddenDescription="Only active administrators can manage student and staff accounts."
    >
      <p>Protected account fixture</p>
    </AdministratorAccessBoundary>,
  );

  expect(
    screen.getByRole("region", {
      name: "Administrator account management workspace",
    }),
  ).toBeTruthy();
});

it("uses the supplied forbidden description", () => {
  mockSession({
    status: "authenticated",
    user: { ...activeAdministrator, role: "staff" },
  });
  render(
    <AdministratorAccessBoundary forbiddenDescription="Only active administrators can manage student and staff accounts.">
      <p>Must not mount</p>
    </AdministratorAccessBoundary>,
  );

  expect(
    screen.getByText(
      "Only active administrators can manage student and staff accounts.",
    ),
  ).toBeTruthy();
  expect(screen.queryByText("Must not mount")).toBeNull();
});

it.each([
  ["student", { ...activeAdministrator, role: "student" as const }],
  ["staff", { ...activeAdministrator, role: "staff" as const }],
  ["suspended administrator", { ...activeAdministrator, status: "suspended" as const }],
  ["deactivated administrator", { ...activeAdministrator, status: "deactivated" as const }],
])("blocks a %s without exposing the overview", (_label, user) => {
  mockSession({ status: "authenticated", user });
  renderBoundary();

  expect(
    screen.getByRole("heading", { name: "Administrator access unavailable" }),
  ).toBeTruthy();
  expect(screen.getByText(/only active administrator accounts can view/i)).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Back to dashboard" }).getAttribute("href"),
  ).toBe("/dashboard");
  expect(screen.queryByText("Protected overview fixture")).toBeNull();
});

it("retries an unavailable session and focuses the authorised workspace", async () => {
  const user = userEvent.setup();
  const retry = deferred<void>();
  refreshSession.mockReturnValueOnce(retry.promise);
  mockSession({ status: "unavailable", user: null });
  const view = renderBoundary();

  await user.click(screen.getByRole("button", { name: "Retry session check" }));
  expect(refreshSession).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(screen.getByRole("status"));

  mockSession({ status: "authenticated", user: activeAdministrator });
  view.rerender(
    <AdministratorAccessBoundary>
      <p>Protected overview fixture</p>
    </AdministratorAccessBoundary>,
  );
  await act(async () => retry.resolve());

  const workspace = screen.getByRole("region", {
    name: "Administrator overview workspace",
  });
  await waitFor(() => expect(document.activeElement).toBe(workspace));
  expect(screen.getByRole("status").textContent).toBe(
    "Administrator access confirmed",
  );
});

it("returns focus to retry when a session recheck remains unavailable", async () => {
  const user = userEvent.setup();
  const retry = deferred<void>();
  refreshSession.mockReturnValueOnce(retry.promise);
  mockSession({ status: "unavailable", user: null });
  const view = renderBoundary();

  await user.click(screen.getByRole("button", { name: "Retry session check" }));
  mockSession({ status: "unavailable", user: null });
  view.rerender(
    <AdministratorAccessBoundary>
      <p>Protected overview fixture</p>
    </AdministratorAccessBoundary>,
  );
  await act(async () => retry.resolve());

  const retryButton = screen.getByRole("button", { name: "Retry session check" });
  await waitFor(() => expect(document.activeElement).toBe(retryButton));
  expect(screen.getByRole("status").textContent).toBe(
    "Session check is still unavailable. Try again.",
  );
});

it("remounts and focuses protected content when the administrator changes", async () => {
  let mountCount = 0;

  function Probe() {
    const [mountNumber] = useState(() => ++mountCount);
    return <p>Overview workspace {mountNumber}</p>;
  }

  mockSession({ status: "authenticated", user: activeAdministrator });
  const view = renderBoundary(<Probe />);
  const firstWorkspace = screen.getByRole("region", {
    name: "Administrator overview workspace",
  });

  mockSession({
    status: "authenticated",
    user: { ...activeAdministrator, id: "administrator-two" },
  });
  view.rerender(
    <AdministratorAccessBoundary>
      <Probe />
    </AdministratorAccessBoundary>,
  );

  const nextWorkspace = screen.getByRole("region", {
    name: "Administrator overview workspace",
  });
  expect(nextWorkspace).not.toBe(firstWorkspace);
  expect(screen.getByText("Overview workspace 2")).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(nextWorkspace));
});
