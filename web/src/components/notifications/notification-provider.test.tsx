// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/auth-session-provider", () => ({ useAuthSession: vi.fn() }));
vi.mock("@/lib/notifications/browser-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/notifications/browser-client")>(
    "@/lib/notifications/browser-client",
  );
  return { ...actual, getNotifications: vi.fn(), markNotificationRead: vi.fn() };
});

import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  getNotifications,
  markNotificationRead,
  NotificationBrowserError,
  type NotificationPage,
  type PublicNotification,
} from "@/lib/notifications/browser-client";

import { NotificationProvider, useNotifications } from "./notification-provider";

const firstId = "64b64c6f2f4d9f1a2b3c4d54";
const secondId = "64b64c6f2f4d9f1a2b3c4d55";
const thirdId = "64b64c6f2f4d9f1a2b3c4d56";
const firstNotification: PublicNotification = {
  id: firstId,
  kind: "claim_approved",
  title: "Claim approved",
  summary: "Campus staff approved your claim.",
  action: { label: "View claim", href: "/claims/64b64c6f2f4d9f1a2b3c4d53" },
  createdAt: "2026-08-26T06:00:00.000Z",
  readAt: null,
  isRead: false,
};
const secondNotification: PublicNotification = {
  ...firstNotification,
  id: secondId,
  title: "Handover ready",
};
const thirdNotification: PublicNotification = {
  ...firstNotification,
  id: thirdId,
  kind: "report_recovered",
  title: "Report recovered",
  action: { label: "View report", href: "/reports/64b64c6f2f4d9f1a2b3c4d57" },
};
const activeUser = {
  id: "account-one",
  email: "student@example.com",
  role: "student" as const,
  status: "active" as const,
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Student Name",
    preferredContactMethod: "in_app" as const,
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
};
const emptyPage: NotificationPage = {
  notifications: [],
  pagination: { nextCursor: null, hasMore: false },
  unreadCount: 0,
};
const firstPage: NotificationPage = {
  notifications: [firstNotification],
  pagination: { nextCursor: "next-page", hasMore: true },
  unreadCount: 1,
};

type Session = ReturnType<typeof useAuthSession>;

function mockSession(input: Pick<Session, "status" | "user">) {
  vi.mocked(useAuthSession).mockReturnValue({
    ...input,
    setAuthenticatedUser: vi.fn(),
    refreshSession: vi.fn(),
    logout: vi.fn(),
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function Probe() {
  const notifications = useNotifications();
  return (
    <>
      <p data-testid="status">{notifications.status}</p>
      <p data-testid="count">{notifications.unreadCount}</p>
      <p data-testid="ids">{notifications.notifications.map(({ id }) => id).join(",")}</p>
      <p data-testid="has-more">{String(notifications.hasMore)}</p>
      <p data-testid="refreshing">{String(notifications.isRefreshing)}</p>
      <p data-testid="loading-more">{String(notifications.isLoadingMore)}</p>
      <p data-testid="refresh-failed">{String(notifications.refreshFailed)}</p>
      <p data-testid="load-more-failed">{String(notifications.loadMoreFailed)}</p>
      <p data-testid="marking">{[...notifications.markingIds].sort().join(",")}</p>
      <p data-testid="failed-marks">{[...notifications.failedMarkIds].sort().join(",")}</p>
      <p data-testid="expired">{String(notifications.authenticationExpired)}</p>
      <button onClick={() => void notifications.refresh()}>Refresh</button>
      <button onClick={() => void notifications.loadMore()}>Load more</button>
      <button onClick={() => void notifications.markRead(firstId)}>Mark first</button>
      <button onClick={() => void notifications.markRead(secondId)}>Mark second</button>
    </>
  );
}

function renderProvider() {
  return render(<NotificationProvider><Probe /></NotificationProvider>);
}

async function resolveInitial(page = firstPage) {
  vi.mocked(getNotifications).mockResolvedValueOnce(page);
  const view = renderProvider();
  await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("ready"));
  return view;
}

afterEach(cleanup);

describe("NotificationProvider", () => {
  beforeEach(() => {
    mockSession({ status: "authenticated", user: activeUser });
    vi.mocked(getNotifications).mockReset();
    vi.mocked(markNotificationRead).mockReset();
    vi.mocked(getNotifications).mockResolvedValue(emptyPage);
    vi.mocked(markNotificationRead).mockResolvedValue({
      ...firstNotification,
      readAt: "2026-08-26T06:05:00.000Z",
      isRead: true,
    });
  });

  it.each([
    ["loading", null],
    ["unauthenticated", null],
    ["unavailable", null],
    ["authenticated", { ...activeUser, status: "suspended" as const }],
  ] as const)("does not fetch for %s", async (status, user) => {
    mockSession({ status, user });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("idle"));
    expect(getNotifications).not.toHaveBeenCalled();
  });

  it.each(["student", "staff", "administrator"] as const)(
    "loads one initial page for an active %s",
    async (role) => {
      mockSession({ status: "authenticated", user: { ...activeUser, role } });
      await resolveInitial();
      expect(getNotifications).toHaveBeenCalledOnce();
      expect(getNotifications).toHaveBeenCalledWith({ pageSize: 20 });
      expect(screen.getByTestId("ids").textContent).toBe(firstId);
    },
  );

  it("hides old data synchronously when the account changes", async () => {
    const view = await resolveInitial();
    const secondAccountRequest = deferred<NotificationPage>();
    vi.mocked(getNotifications).mockReturnValueOnce(secondAccountRequest.promise);
    mockSession({
      status: "authenticated",
      user: { ...activeUser, id: "account-two", email: "staff@example.com" },
    });
    view.rerender(<NotificationProvider><Probe /></NotificationProvider>);
    expect(screen.getByTestId("ids").textContent).toBe("");
  });

  it.each([
    ["logout", { status: "unauthenticated" as const, user: null }],
    ["inactive", {
      status: "authenticated" as const,
      user: { ...activeUser, status: "deactivated" as const },
    }],
  ])("clears data immediately after %s", async (_label, nextSession) => {
    const view = await resolveInitial();
    mockSession(nextSession);
    view.rerender(<NotificationProvider><Probe /></NotificationProvider>);
    expect(screen.getByTestId("ids").textContent).toBe("");
    expect(screen.getByTestId("status").textContent).toBe("idle");
  });

  it("does not commit a delayed response from a previous account", async () => {
    const oldRequest = deferred<NotificationPage>();
    vi.mocked(getNotifications).mockReturnValueOnce(oldRequest.promise);
    const view = renderProvider();
    await waitFor(() => expect(getNotifications).toHaveBeenCalledOnce());
    mockSession({ status: "authenticated", user: { ...activeUser, id: "account-two" } });
    vi.mocked(getNotifications).mockResolvedValueOnce(emptyPage);
    view.rerender(<NotificationProvider><Probe /></NotificationProvider>);
    await waitFor(() => expect(getNotifications).toHaveBeenCalledTimes(2));
    oldRequest.resolve(firstPage);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("ready"));
    expect(screen.getByTestId("ids").textContent).toBe("");
  });

  it("refresh replaces the list and invalidates pending load more", async () => {
    await resolveInitial();
    const oldLoadMore = deferred<NotificationPage>();
    vi.mocked(getNotifications).mockReturnValueOnce(oldLoadMore.promise);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getByTestId("loading-more").textContent).toBe("true"));
    vi.mocked(getNotifications).mockResolvedValueOnce({
      notifications: [secondNotification],
      pagination: { nextCursor: null, hasMore: false },
      unreadCount: 1,
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.getByTestId("ids").textContent).toBe(secondId));
    oldLoadMore.resolve({
      notifications: [thirdNotification],
      pagination: { nextCursor: null, hasMore: false },
      unreadCount: 2,
    });
    await Promise.resolve();
    expect(screen.getByTestId("ids").textContent).toBe(secondId);
  });

  it("loads the current cursor once and locks duplicate clicks", async () => {
    await resolveInitial();
    const request = deferred<NotificationPage>();
    vi.mocked(getNotifications).mockReturnValueOnce(request.promise);
    const button = screen.getByRole("button", { name: "Load more" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(getNotifications).toHaveBeenCalledTimes(2);
    expect(getNotifications).toHaveBeenLastCalledWith({ pageSize: 20, cursor: "next-page" });
    request.resolve({
      notifications: [secondNotification],
      pagination: { nextCursor: null, hasMore: false },
      unreadCount: 2,
    });
    await waitFor(() => expect(screen.getByTestId("ids").textContent).toBe(`${firstId},${secondId}`));
  });

  it("retains the list and cursor when load more fails", async () => {
    await resolveInitial();
    vi.mocked(getNotifications)
      .mockRejectedValueOnce(new Error("hidden"))
      .mockResolvedValueOnce({
        notifications: [secondNotification],
        pagination: { nextCursor: null, hasMore: false },
        unreadCount: 2,
      });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getByTestId("load-more-failed").textContent).toBe("true"));
    expect(screen.getByTestId("ids").textContent).toBe(firstId);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getByTestId("ids").textContent).toBe(`${firstId},${secondId}`));
    expect(getNotifications).toHaveBeenLastCalledWith({ pageSize: 20, cursor: "next-page" });
  });

  it("replaces only a successfully read item and decrements once", async () => {
    await resolveInitial({
      notifications: [firstNotification, secondNotification],
      pagination: { nextCursor: null, hasMore: false },
      unreadCount: 2,
    });
    vi.mocked(markNotificationRead).mockResolvedValueOnce({
      ...firstNotification,
      readAt: "2026-08-26T06:05:00.000Z",
      isRead: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark first" }));
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(screen.getByTestId("ids").textContent).toBe(`${firstId},${secondId}`);
    fireEvent.click(screen.getByRole("button", { name: "Mark first" }));
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("does not decrement for an already-read local item", async () => {
    const read = { ...firstNotification, readAt: "2026-08-26T06:05:00.000Z", isRead: true };
    await resolveInitial({
      notifications: [read],
      pagination: { nextCursor: null, hasMore: false },
      unreadCount: 3,
    });
    vi.mocked(markNotificationRead).mockResolvedValueOnce(read);
    fireEvent.click(screen.getByRole("button", { name: "Mark first" }));
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledOnce());
    expect(screen.getByTestId("count").textContent).toBe("3");
  });

  it("retains an item and exposes its ID when mark read fails", async () => {
    await resolveInitial();
    vi.mocked(markNotificationRead).mockRejectedValueOnce(new Error("hidden"));
    fireEvent.click(screen.getByRole("button", { name: "Mark first" }));
    await waitFor(() => expect(screen.getByTestId("failed-marks").textContent).toBe(firstId));
    expect(screen.getByTestId("ids").textContent).toBe(firstId);
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("tracks simultaneous mark actions independently", async () => {
    await resolveInitial({
      notifications: [firstNotification, secondNotification],
      pagination: { nextCursor: null, hasMore: false },
      unreadCount: 2,
    });
    const first = deferred<PublicNotification>();
    const second = deferred<PublicNotification>();
    vi.mocked(markNotificationRead).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    fireEvent.click(screen.getByRole("button", { name: "Mark first" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark second" }));
    expect(screen.getByTestId("marking").textContent).toBe(`${firstId},${secondId}`);
    first.resolve({ ...firstNotification, readAt: "2026-08-26T06:05:00.000Z", isRead: true });
    await waitFor(() => expect(screen.getByTestId("marking").textContent).toBe(secondId));
    second.reject(new Error("hidden"));
    await waitFor(() => expect(screen.getByTestId("failed-marks").textContent).toBe(secondId));
  });

  it("clears data and exposes an expired authentication response", async () => {
    await resolveInitial();
    vi.mocked(getNotifications).mockRejectedValueOnce(
      new NotificationBrowserError("AUTHENTICATION_REQUIRED", 401, "safe"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.getByTestId("expired").textContent).toBe("true"));
    expect(screen.getByTestId("ids").textContent).toBe("");
  });

  it("clears data and exposes a forbidden response", async () => {
    await resolveInitial();
    vi.mocked(getNotifications).mockRejectedValueOnce(
      new NotificationBrowserError("NOTIFICATION_FORBIDDEN", 403, "safe"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("forbidden"));
    expect(screen.getByTestId("ids").textContent).toBe("");
  });

  it("reports a recoverable initial request error", async () => {
    vi.mocked(getNotifications).mockRejectedValueOnce(new Error("hidden"));
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("error"));
  });

  it("throws when the hook is used outside the provider", () => {
    expect(() => render(<Probe />)).toThrow(
      "useNotifications must be used within NotificationProvider",
    );
  });
});
