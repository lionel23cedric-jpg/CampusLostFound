import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/notifications/service", () => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
}));

import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { PublicUser } from "@/lib/auth/public-user";
import { NotificationError } from "@/lib/notifications/errors";
import {
  listNotifications,
  markNotificationRead,
} from "@/lib/notifications/service";

import { PATCH as readPatch } from "./[id]/read/route";
import { GET as notificationsGet } from "./route";

const notificationId = "64b64c6f2f4d9f1a2b3c4d54";
const user = {
  id: "64b64c6f2f4d9f1a2b3c4d51",
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
} satisfies PublicUser;
const notification = {
  id: notificationId,
  kind: "claim_approved" as const,
  title: "Claim approved",
  summary: "Campus staff approved your claim.",
  action: {
    label: "View claim",
    href: "/claims/64b64c6f2f4d9f1a2b3c4d53",
  },
  createdAt: "2026-08-25T06:00:00.000Z",
  readAt: null,
  isRead: false,
};
const page = {
  notifications: [notification],
  pagination: { nextCursor: null, hasMore: false },
  unreadCount: 1,
};

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const rejectedContext = (secret = "PRIVATE-PARAMS") => ({
  params: {
    then() {
      throw new Error(secret);
    },
  } as unknown as Promise<{ id: string }>,
});
const patchRequest = (body?: string, contentType?: string) =>
  new Request(`http://localhost/api/notifications/${notificationId}/read`, {
    method: "PATCH",
    ...(contentType ? { headers: { "content-type": contentType } } : {}),
    ...(body === undefined ? {} : { body }),
  });
const failingBodyRequest = (error: Error) =>
  ({
    headers: new Headers(),
    body: new ReadableStream<Uint8Array>({
      pull() {
        throw error;
      },
    }),
  }) as Request;

function expectNoNotificationSecrets(value: unknown, secret?: string) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toMatch(
    /recipientId|claimantId|reporterId|reviewNote|expectedAnswer|passwordHash|tokenHash/,
  );
  if (secret) expect(serialized).not.toContain(secret);
}

async function expectError(
  response: Response,
  status: number,
  code: string,
  message: string,
  secret?: string,
) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.json();
  expect(body).toEqual({
    error: {
      code,
      message,
      ...(body.error.fields ? { fields: expect.any(Object) } : {}),
    },
  });
  expectNoNotificationSecrets(body, secret);
}

describe("notification routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readSessionCookie).mockResolvedValue("raw-session-token");
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(listNotifications).mockResolvedValue(page);
    vi.mocked(markNotificationRead).mockResolvedValue({
      ...notification,
      readAt: "2026-08-25T06:05:00.000Z",
      isRead: true,
    });
  });

  it("authenticates before reading a malformed list URL", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const request = {
      get url() {
        throw new Error("PRIVATE-URL");
      },
    } as unknown as Request;

    await expectError(
      await notificationsGet(request),
      401,
      "AUTHENTICATION_REQUIRED",
      "Authentication required",
      "PRIVATE-URL",
    );
    expect(listNotifications).not.toHaveBeenCalled();
  });

  it("returns the strict notification page without caching", async () => {
    const response = await notificationsGet(
      new Request("http://localhost/api/notifications?pageSize=10"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(listNotifications).toHaveBeenCalledWith(user, { pageSize: 10 });
    expect(await response.json()).toEqual(page);
  });

  it.each([
    ["zero page size", "?pageSize=0"],
    ["noncanonical page size", "?pageSize=01"],
    ["duplicate page size", "?pageSize=10&pageSize=20"],
    ["unknown key", "?owner=other"],
    ["malformed cursor", "?cursor=PRIVATE-CURSOR!"],
  ])("rejects %s", async (_case, query) => {
    const response = await notificationsGet(
      new Request(`http://localhost/api/notifications${query}`),
    );

    await expectError(
      response,
      400,
      "VALIDATION_ERROR",
      "Invalid notification request",
    );
    expect(listNotifications).not.toHaveBeenCalled();
  });

  it("hides list URL parsing failures", async () => {
    const request = {
      get url() {
        throw new Error("PRIVATE-URL");
      },
    } as unknown as Request;

    await expectError(
      await notificationsGet(request),
      500,
      "NOTIFICATION_OPERATION_FAILED",
      "Notification operation failed",
      "PRIVATE-URL",
    );
    expect(listNotifications).not.toHaveBeenCalled();
  });

  it.each([
    [
      "inactive account",
      new NotificationError("NOTIFICATION_FORBIDDEN"),
      403,
      "NOTIFICATION_FORBIDDEN",
      "Notification access is not permitted",
    ],
    [
      "unexpected database failure",
      new Error("PRIVATE-DATABASE-DETAIL"),
      500,
      "NOTIFICATION_OPERATION_FAILED",
      "Notification operation failed",
    ],
  ] as const)(
    "maps a %s safely",
    async (_case, failure, status, code, message) => {
      vi.mocked(listNotifications).mockRejectedValue(failure);

      await expectError(
        await notificationsGet(
          new Request("http://localhost/api/notifications"),
        ),
        status,
        code,
        message,
        "PRIVATE-DATABASE-DETAIL",
      );
    },
  );

  it("authenticates before awaiting parameters or reading the body", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await readPatch(
      failingBodyRequest(new Error("PRIVATE-BODY")),
      rejectedContext(),
    );

    await expectError(
      response,
      401,
      "AUTHENTICATION_REQUIRED",
      "Authentication required",
      "PRIVATE-BODY",
    );
    expect(markNotificationRead).not.toHaveBeenCalled();
  });

  it.each([
    ["no body", patchRequest()],
    ["whitespace body", patchRequest("   \r\n")],
    ["empty JSON object", patchRequest("{}", "application/json; charset=utf-8")],
  ])("marks one owned notification read with %s", async (_case, request) => {
    const response = await readPatch(request, context(notificationId));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(markNotificationRead).toHaveBeenCalledWith(user, notificationId);
    expect(await response.json()).toEqual({
      notification: {
        ...notification,
        readAt: "2026-08-25T06:05:00.000Z",
        isRead: true,
      },
    });
  });

  it.each([
    ["noncanonical ID", notificationId.toUpperCase()],
    ["malformed ID", "invalid"],
  ])("rejects a %s", async (_case, id) => {
    const response = await readPatch(patchRequest(), context(id));

    await expectError(
      response,
      400,
      "VALIDATION_ERROR",
      "Invalid notification request",
    );
    expect(markNotificationRead).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{", "application/json"],
    ["unknown field", '{"force":true}', "application/json"],
    ["non-object JSON", "[]", "application/json"],
    ["non-JSON content type", "{}", "text/plain"],
  ])("rejects %s", async (_case, body, contentType) => {
    const response = await readPatch(
      patchRequest(body, contentType),
      context(notificationId),
    );

    await expectError(
      response,
      400,
      "VALIDATION_ERROR",
      "Invalid notification request",
    );
    expect(markNotificationRead).not.toHaveBeenCalled();
  });

  it.each([
    [
      "declared oversized body",
      new Request("http://localhost/read", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "content-length": String(16 * 1024 + 1),
        },
        body: "{}",
      }),
    ],
    [
      "streamed oversized body",
      patchRequest(`{}${" ".repeat(16 * 1024)}`, "application/json"),
    ],
    [
      "invalid UTF-8 body",
      new Request("http://localhost/read", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: new Blob([new Uint8Array([0xff])]),
      }),
    ],
  ])("rejects a %s", async (_case, request) => {
    const response = await readPatch(request, context(notificationId));

    await expectError(
      response,
      400,
      "VALIDATION_ERROR",
      "Invalid notification request",
    );
    expect(markNotificationRead).not.toHaveBeenCalled();
  });

  it("hides rejected route parameters", async () => {
    const response = await readPatch(patchRequest(), rejectedContext());

    await expectError(
      response,
      500,
      "NOTIFICATION_OPERATION_FAILED",
      "Notification operation failed",
      "PRIVATE-PARAMS",
    );
    expect(markNotificationRead).not.toHaveBeenCalled();
  });

  it("hides request-body stream failures", async () => {
    const response = await readPatch(
      failingBodyRequest(new Error("PRIVATE-BODY")),
      context(notificationId),
    );

    await expectError(
      response,
      500,
      "NOTIFICATION_OPERATION_FAILED",
      "Notification operation failed",
      "PRIVATE-BODY",
    );
    expect(markNotificationRead).not.toHaveBeenCalled();
  });

  it.each([
    [
      "foreign or missing notification",
      new NotificationError("NOTIFICATION_NOT_FOUND"),
      404,
      "NOTIFICATION_NOT_FOUND",
      "Notification not found",
    ],
    [
      "inactive account",
      new NotificationError("NOTIFICATION_FORBIDDEN"),
      403,
      "NOTIFICATION_FORBIDDEN",
      "Notification access is not permitted",
    ],
    [
      "unexpected database failure",
      new Error("PRIVATE-DATABASE-DETAIL"),
      500,
      "NOTIFICATION_OPERATION_FAILED",
      "Notification operation failed",
    ],
  ] as const)(
    "maps a %s safely when marking read",
    async (_case, failure, status, code, message) => {
      vi.mocked(markNotificationRead).mockRejectedValue(failure);

      await expectError(
        await readPatch(patchRequest(), context(notificationId)),
        status,
        code,
        message,
        "PRIVATE-DATABASE-DETAIL",
      );
    },
  );
});
