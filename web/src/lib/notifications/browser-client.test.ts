// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getNotifications,
  markNotificationRead,
  NotificationBrowserError,
} from "./browser-client";

const notification = {
  id: "64b64c6f2f4d9f1a2b3c4d54",
  kind: "claim_approved",
  title: "Claim approved",
  summary: "Campus staff approved your claim.",
  action: {
    label: "View claim",
    href: "/claims/64b64c6f2f4d9f1a2b3c4d53",
  },
  createdAt: "2026-08-26T06:00:00.000Z",
  readAt: null,
  isRead: false,
} as const;

const page = {
  notifications: [notification],
  pagination: { nextCursor: "opaque-cursor", hasMore: true },
  unreadCount: 1,
};

const genericError = {
  code: "REQUEST_FAILED",
  message: "We could not complete that request. Please try again.",
};

describe("notification browser client", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("loads notifications without adding a default query", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(page));

    await expect(getNotifications()).resolves.toEqual(page);
    expect(fetch).toHaveBeenCalledWith("/api/notifications", {
      method: "GET",
      credentials: "same-origin",
    });
  });

  it("loads a bounded cursor page with same-origin credentials", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(page));

    await expect(
      getNotifications({ pageSize: 20, cursor: "opaque-cursor" }),
    ).resolves.toEqual(page);
    expect(fetch).toHaveBeenCalledWith(
      "/api/notifications?pageSize=20&cursor=opaque-cursor",
      { method: "GET", credentials: "same-origin" },
    );
  });

  it("encodes an opaque cursor through URLSearchParams", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(page));

    await getNotifications({ cursor: "one+/= two" });

    expect(fetch).toHaveBeenCalledWith(
      "/api/notifications?cursor=one%2B%2F%3D+two",
      { method: "GET", credentials: "same-origin" },
    );
  });

  it("marks one canonical notification read", async () => {
    const read = {
      ...notification,
      readAt: "2026-08-26T06:05:00.000Z",
      isRead: true,
    };
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ notification: read }),
    );

    await expect(markNotificationRead(notification.id)).resolves.toEqual(read);
    expect(fetch).toHaveBeenCalledWith(
      `/api/notifications/${notification.id}/read`,
      { method: "PATCH", credentials: "same-origin" },
    );
  });

  it.each([
    ["unknown response field", { ...page, recipientId: "PRIVATE" }],
    [
      "unknown notification field",
      {
        ...page,
        notifications: [{ ...notification, eventKey: "PRIVATE" }],
      },
    ],
    [
      "unknown kind",
      { ...page, notifications: [{ ...notification, kind: "chat" }] },
    ],
    [
      "unsafe external action",
      {
        ...page,
        notifications: [
          {
            ...notification,
            action: { label: "Open", href: "https://evil.example/PRIVATE" },
          },
        ],
      },
    ],
    [
      "unsafe relative action",
      {
        ...page,
        notifications: [
          { ...notification, action: { label: "Open", href: "/admin/PRIVATE" } },
        ],
      },
    ],
    [
      "inconsistent read state",
      { ...page, notifications: [{ ...notification, isRead: true }] },
    ],
    [
      "invalid identifier",
      { ...page, notifications: [{ ...notification, id: "PRIVATE" }] },
    ],
    [
      "unknown pagination field",
      {
        ...page,
        pagination: { ...page.pagination, internalCursor: "PRIVATE" },
      },
    ],
  ])("rejects a %s without reflecting it", async (_label, body) => {
    vi.mocked(fetch).mockResolvedValue(Response.json(body));

    const error = await getNotifications({ pageSize: 20 }).catch(
      (reason: unknown) => reason,
    );
    expect(error).toEqual(expect.objectContaining(genericError));
    expect(String(error)).not.toContain("PRIVATE");
    expect(JSON.stringify(error)).not.toContain("PRIVATE");
  });

  it.each([
    [
      "unknown wrapper field",
      { notification: { ...notification }, recipientId: "PRIVATE" },
    ],
    [
      "private notification field",
      { notification: { ...notification, eventKey: "PRIVATE" } },
    ],
    ["missing wrapper", notification],
  ])("rejects a strict PATCH %s", async (_label, body) => {
    vi.mocked(fetch).mockResolvedValue(Response.json(body));

    const error = await markNotificationRead(notification.id).catch(
      (reason: unknown) => reason,
    );
    expect(error).toEqual(expect.objectContaining(genericError));
    expect(String(error)).not.toContain("PRIVATE");
  });

  it.each([
    ["uppercase", "64B64c6f2f4d9f1a2b3c4d54"],
    ["short", "64b64c6f2f4d9f1a2b3c4d5"],
    ["path-like", "64b64c6f2f4d9f1a2b3c4d54/PRIVATE"],
  ])("rejects a non-canonical %s id before fetch", async (_label, id) => {
    await expect(markNotificationRead(id)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
      message: "Invalid notification request",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { input: { pageSize: 0 }, label: "pageSize below range" },
    { input: { pageSize: 51 }, label: "pageSize above range" },
    { input: { pageSize: 1.5 }, label: "non-integer pageSize" },
    { input: { cursor: "" }, label: "empty cursor" },
    { input: { cursor: "a".repeat(513) }, label: "oversized cursor" },
  ])("rejects invalid local input: $label", async ({ input }) => {
    await expect(getNotifications(input)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [400, "VALIDATION_ERROR", "Invalid notification request"],
    [401, "AUTHENTICATION_REQUIRED", "Authentication required"],
    [403, "NOTIFICATION_FORBIDDEN", "Notification access is not permitted"],
    [404, "NOTIFICATION_NOT_FOUND", "Notification not found"],
    [500, "NOTIFICATION_OPERATION_FAILED", "Notification operation failed"],
  ])(
    "maps safe %i/%s responses to local copy",
    async (status, code, message) => {
      vi.mocked(fetch).mockResolvedValue(
        Response.json(
          { error: { code, message: "PRIVATE service detail" } },
          { status },
        ),
      );

      const error = await getNotifications().catch(
        (reason: unknown) => reason,
      );
      expect(error).toBeInstanceOf(NotificationBrowserError);
      expect(error).toEqual(expect.objectContaining({ code, status, message }));
      expect(String(error)).not.toContain("PRIVATE");
      expect(JSON.stringify(error)).not.toContain("PRIVATE");
    },
  );

  it.each([
    [
      "unknown error code",
      400,
      { error: { code: "PRIVATE_DATABASE_ERROR", message: "PRIVATE" } },
    ],
    [
      "status and code mismatch",
      500,
      { error: { code: "NOTIFICATION_NOT_FOUND", message: "PRIVATE" } },
    ],
    [
      "unknown error field",
      404,
      {
        error: {
          code: "NOTIFICATION_NOT_FOUND",
          message: "PRIVATE",
          trace: "PRIVATE",
        },
      },
    ],
    ["malformed error", 403, { error: { message: "PRIVATE" } }],
  ])("fails closed for %s", async (_label, status, body) => {
    vi.mocked(fetch).mockResolvedValue(Response.json(body, { status }));

    const error = await getNotifications().catch(
      (reason: unknown) => reason,
    );
    expect(error).toEqual(
      expect.objectContaining({ ...genericError, status }),
    );
    expect(String(error)).not.toContain("PRIVATE");
    expect(JSON.stringify(error)).not.toContain("PRIVATE");
  });

  it.each([
    ["non-JSON", new Response("PRIVATE database trace", { status: 500 })],
    ["invalid JSON", new Response("{PRIVATE", { status: 200 })],
    ["malformed success", Response.json({ notifications: "PRIVATE" })],
  ])("replaces a %s response with a generic failure", async (_label, response) => {
    vi.mocked(fetch).mockResolvedValue(response);

    const error = await getNotifications().catch(
      (reason: unknown) => reason,
    );
    expect(error).toEqual(
      expect.objectContaining({ ...genericError, status: response.status }),
    );
    expect(String(error)).not.toContain("PRIVATE");
  });

  it("hides rejected fetch details behind a network error", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("PRIVATE network detail"));

    const error = await getNotifications().catch(
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(NotificationBrowserError);
    expect(error).toEqual(
      expect.objectContaining({
        code: "NETWORK_ERROR",
        status: 0,
        message: "We could not reach the service. Please try again.",
      }),
    );
    expect((error as Error & { cause?: unknown }).cause).toBeUndefined();
    expect(String(error)).not.toContain("PRIVATE");
  });
});
