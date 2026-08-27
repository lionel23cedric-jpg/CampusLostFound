// @vitest-environment jsdom

import { useState, type ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/components/auth/auth-session-provider", () => ({ useAuthSession: vi.fn() }));
vi.mock("./notification-provider", () => ({ useNotifications: vi.fn() }));

import { useRouter } from "next/navigation";
import {
  type AuthSessionContextValue,
  useAuthSession,
} from "@/components/auth/auth-session-provider";

import { NotificationAccessBoundary } from "./notification-access-boundary";
import {
  type NotificationContextValue,
  useNotifications,
} from "./notification-provider";

const replace = vi.fn();
const refreshSession = vi.fn().mockResolvedValue(undefined);
const activeUser: NonNullable<AuthSessionContextValue["user"]> = {
  id: "account-one",
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
    status: "loading",
    user: null,
    setAuthenticatedUser: vi.fn(),
    refreshSession,
    logout: vi.fn(),
    ...overrides,
  });
}

function mockNotifications(overrides: Partial<NotificationContextValue> = {}) {
  vi.mocked(useNotifications).mockReturnValue({
    ...notificationState,
    ...overrides,
  });
}

function renderBoundary(children: ReactNode = <p>Private notification content</p>) {
  return render(
    <NotificationAccessBoundary>{children}</NotificationAccessBoundary>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
  mockNotifications();
});

afterEach(cleanup);

describe("NotificationAccessBoundary", () => {
  it("shows a polite session loading state without mounting private content", () => {
    mockSession({ status: "loading", user: null });
    renderBoundary();

    expect(screen.getByRole("status").textContent).toBe("Checking your account");
    expect(screen.queryByText("Private notification content")).toBeNull();
  });

  it("redirects an unauthenticated visitor without mounting private content", async () => {
    mockSession({ status: "unauthenticated", user: null });
    renderBoundary();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.getByRole("status").textContent).toBe("Taking you to sign in");
    expect(screen.queryByText("Private notification content")).toBeNull();
  });

  it("offers a session retry without redirecting or mounting private content", async () => {
    const user = userEvent.setup();
    mockSession({ status: "unavailable", user: null });
    renderBoundary();

    expect(
      screen.getByRole("heading", { name: "We could not check your account" }),
    ).toBeTruthy();
    expect(screen.queryByText("Private notification content")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Retry session check" }));
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
  });

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
      expect(
        screen.getByRole("link", { name: "Back to dashboard" }).getAttribute("href"),
      ).toBe("/dashboard");
      expect(screen.queryByText("Private notification content")).toBeNull();
    },
  );

  it("redirects when the notification session has expired", async () => {
    mockSession({ status: "authenticated", user: activeUser });
    mockNotifications({ authenticationExpired: true });
    renderBoundary();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.getByRole("status").textContent).toBe("Taking you to sign in");
    expect(screen.queryByText("Private notification content")).toBeNull();
  });

  it("blocks private content after a provider forbidden response", () => {
    mockSession({ status: "authenticated", user: activeUser });
    mockNotifications({ status: "forbidden" });
    renderBoundary();

    expect(
      screen.getByRole("heading", { name: "Notifications unavailable" }),
    ).toBeTruthy();
    expect(screen.queryByText("Private notification content")).toBeNull();
  });

  it("remounts private content when the active account changes", () => {
    let mountCount = 0;
    function Probe() {
      const [mountNumber] = useState(() => ++mountCount);
      return <p>Notification workspace {mountNumber}</p>;
    }

    mockSession({ status: "authenticated", user: activeUser });
    const view = renderBoundary(<Probe />);
    expect(screen.getByText("Notification workspace 1")).toBeTruthy();

    mockSession({
      status: "authenticated",
      user: { ...activeUser, id: "account-two" },
    });
    view.rerender(
      <NotificationAccessBoundary>
        <Probe />
      </NotificationAccessBoundary>,
    );

    expect(screen.getByText("Notification workspace 2")).toBeTruthy();
    expect(mountCount).toBe(2);
  });
});
