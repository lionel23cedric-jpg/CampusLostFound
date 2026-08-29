// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./notification-provider", () => ({ useNotifications: vi.fn() }));

import type { PublicNotification } from "@/lib/notifications/browser-client";

import { NotificationCentre } from "./notification-centre";
import {
  type NotificationContextValue,
  useNotifications,
} from "./notification-provider";

const unreadClaim: PublicNotification = {
  id: "64b64c6f2f4d9f1a2b3c4d54",
  kind: "claim_approved",
  title: "Claim approved",
  summary: "Campus staff approved your claim.",
  action: { label: "View claim", href: "/claims/64b64c6f2f4d9f1a2b3c4d53" },
  createdAt: "2026-08-26T06:00:00.000Z",
  readAt: null,
  isRead: false,
};
const readReport: PublicNotification = {
  id: "64b64c6f2f4d9f1a2b3c4d55",
  kind: "report_recovered",
  title: "Report recovered",
  summary: "Your report is now marked as recovered.",
  action: { label: "View report", href: "/reports/64b64c6f2f4d9f1a2b3c4d56" },
  createdAt: "2026-08-25T23:30:00.000Z",
  readAt: "2026-08-26T00:00:00.000Z",
  isRead: true,
};
const actions = {
  refresh: vi.fn().mockResolvedValue(undefined),
  loadMore: vi.fn().mockResolvedValue(undefined),
  markRead: vi.fn().mockResolvedValue(undefined),
};
const readyState: NotificationContextValue = {
  status: "ready",
  notifications: [unreadClaim, readReport],
  unreadCount: 1,
  hasMore: false,
  isRefreshing: false,
  isLoadingMore: false,
  refreshFailed: false,
  loadMoreFailed: false,
  markingIds: new Set(),
  failedMarkIds: new Set(),
  authenticationExpired: false,
  ...actions,
};

function renderCentre(overrides: Partial<NotificationContextValue> = {}) {
  vi.mocked(useNotifications).mockReturnValue({ ...readyState, ...overrides });
  return render(<NotificationCentre />);
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("NotificationCentre", () => {
  it("renders controlled unread and read entries with safe actions", () => {
    renderCentre();

    expect(screen.getByRole("heading", { name: "Notifications" })).toBeTruthy();
    expect(screen.getByText("1 unread notification")).toBeTruthy();
    expect(screen.getByText("Unread")).toBeTruthy();
    expect(screen.getByText("Read")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "View claim" }).getAttribute("href"),
    ).toBe(`${unreadClaim.action.href}?returnTo=%2Fnotifications`);
    expect(screen.getByRole("button", { name: "Mark as read" })).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("shows an initial loading announcement", () => {
    renderCentre({ status: "loading", notifications: [] });
    expect(screen.getByRole("status").textContent).toContain("Loading notifications");
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("shows an initial error with a retry action", async () => {
    const user = userEvent.setup();
    renderCentre({ status: "error", notifications: [] });

    expect(
      screen.getByRole("heading", { name: "We could not load notifications" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Retry notifications" }));
    expect(actions.refresh).toHaveBeenCalledOnce();
  });

  it("renders an empty ready state with a dashboard link", () => {
    renderCentre({ notifications: [], unreadCount: 0 });

    expect(screen.getByRole("heading", { name: "No notifications yet" })).toBeTruthy();
    expect(screen.getByText("0 unread notifications")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Back to dashboard" }).getAttribute("href"),
    ).toBe("/dashboard");
  });

  it.each([
    [0, "0 unread notifications"],
    [1, "1 unread notification"],
    [12, "12 unread notifications"],
  ])("renders the unread count %i with correct grammar", (unreadCount, expected) => {
    renderCentre({ unreadCount });
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it("formats timestamps in Pacific/Auckland", () => {
    renderCentre({ notifications: [unreadClaim] });
    const expected = new Intl.DateTimeFormat("en-NZ", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Pacific/Auckland",
    }).format(new Date(unreadClaim.createdAt));

    const time = screen.getByText(expected);
    expect(time.getAttribute("datetime")).toBe(unreadClaim.createdAt);
  });

  it("refreshes and reflects only the refresh busy state", async () => {
    const user = userEvent.setup();
    const view = renderCentre();
    await user.click(screen.getByRole("button", { name: "Refresh notifications" }));
    expect(actions.refresh).toHaveBeenCalledOnce();

    vi.mocked(useNotifications).mockReturnValue({ ...readyState, isRefreshing: true });
    view.rerender(<NotificationCentre />);
    const button = screen.getByRole("button", { name: "Refreshing notifications" });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("retains the list and announces a refresh failure", () => {
    renderCentre({ refreshFailed: true });
    expect(screen.getByRole("alert").textContent).toContain(
      "We could not refresh notifications",
    );
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("loads more, reports its busy state and exposes a retry", async () => {
    const user = userEvent.setup();
    const view = renderCentre({ hasMore: true });
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(actions.loadMore).toHaveBeenCalledOnce();

    vi.mocked(useNotifications).mockReturnValue({
      ...readyState,
      hasMore: true,
      isLoadingMore: true,
    });
    view.rerender(<NotificationCentre />);
    expect(
      screen.getByRole("button", { name: "Loading more notifications" }).hasAttribute("disabled"),
    ).toBe(true);

    vi.mocked(useNotifications).mockReturnValue({
      ...readyState,
      hasMore: true,
      loadMoreFailed: true,
    });
    view.rerender(<NotificationCentre />);
    expect(screen.getByRole("alert").textContent).toContain(
      "We could not load more notifications",
    );
    await user.click(screen.getByRole("button", { name: "Retry load more" }));
    expect(actions.loadMore).toHaveBeenCalledTimes(2);
  });

  it("hides load more when there is no next page", () => {
    renderCentre({ hasMore: false });
    expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
  });

  it("marks only unread entries and reflects per-item busy state", async () => {
    const user = userEvent.setup();
    const view = renderCentre();
    await user.click(screen.getByRole("button", { name: "Mark as read" }));
    expect(actions.markRead).toHaveBeenCalledWith(unreadClaim.id);
    expect(screen.getAllByText("Read")).toHaveLength(1);

    vi.mocked(useNotifications).mockReturnValue({
      ...readyState,
      markingIds: new Set([unreadClaim.id]),
    });
    view.rerender(<NotificationCentre />);
    expect(
      screen.getByRole("button", { name: "Marking as read" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("shows a private-safe per-item retry message", () => {
    renderCentre({ failedMarkIds: new Set([unreadClaim.id]) });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("We could not mark this notification as read");
    expect(alert.textContent).not.toContain(unreadClaim.id);
    expect(screen.getByRole("button", { name: "Mark as read" })).toBeTruthy();
  });

  it("marks an unread notification from its action link", () => {
    renderCentre({ notifications: [unreadClaim] });
    const link = screen.getByRole("link", { name: "View claim" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(actions.markRead).toHaveBeenCalledWith(unreadClaim.id);
  });

  it("does not mark an already-read action again", () => {
    renderCentre({ notifications: [readReport], unreadCount: 0 });
    const link = screen.getByRole("link", { name: "View report" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(actions.markRead).not.toHaveBeenCalled();
  });

  it("uses live regions for recoverable operation states", () => {
    renderCentre({ refreshFailed: true, loadMoreFailed: true, hasMore: true });
    const liveRegions = document.querySelectorAll('[aria-live="polite"]');
    expect(liveRegions.length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });

  it("keeps controls and content accessible at 320 pixels", () => {
    const css = readFileSync(
      resolve("src/components/notifications/notification-centre.module.css"),
      "utf8",
    );
    expect(css).toMatch(/min-height:\s*44px/);
    expect(css).toMatch(/@media\s*\(max-width:\s*24rem\)/);
    expect(css).toMatch(/:focus-visible/);
    expect(css).not.toMatch(/width:\s*\d{3,}px/);
    expect(css).not.toMatch(/display:\s*none[\s\S]*notification/);
  });
});
