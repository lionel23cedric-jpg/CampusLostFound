import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/notification", () => ({
  NOTIFICATION_KINDS: [
    "claim_received",
    "claim_withdrawn",
    "claim_approved",
    "claim_rejected",
    "claim_handover_ready",
    "claim_completed",
    "report_recovered",
  ],
  NotificationModel: {
    find: vi.fn(),
    countDocuments: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { NotificationModel } from "@/models/notification";

import { NotificationError } from "./errors";
import {
  listNotifications,
  markNotificationRead,
  requireNotificationUser,
} from "./service";
import { encodeNotificationCursor } from "./validation";

function identifier(value: string) {
  return { toString: () => value };
}

function queryChain<T>(result: T) {
  const chain = {
    sort: vi.fn(),
    limit: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn(async () => result),
  };
  chain.sort.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  return chain;
}

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

const reportId = "64b64c6f2f4d9f1a2b3c4d52";
const claimId = "64b64c6f2f4d9f1a2b3c4d53";
const firstId = "64b64c6f2f4d9f1a2b3c4d54";
const secondId = "64b64c6f2f4d9f1a2b3c4d55";
const thirdId = "64b64c6f2f4d9f1a2b3c4d56";
const firstCreatedAt = new Date("2026-08-25T06:02:00.000Z");
const secondCreatedAt = new Date("2026-08-25T06:01:00.000Z");
const thirdCreatedAt = new Date("2026-08-25T06:00:00.000Z");

const first = {
  _id: identifier(firstId),
  kind: "claim_approved" as const,
  reportId: identifier(reportId),
  claimId: identifier(claimId),
  readAt: null,
  createdAt: firstCreatedAt,
};
const second = {
  ...first,
  _id: identifier(secondId),
  kind: "claim_handover_ready" as const,
  createdAt: secondCreatedAt,
};
const third = {
  ...first,
  _id: identifier(thirdId),
  kind: "claim_rejected" as const,
  createdAt: thirdCreatedAt,
};

describe("notification service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectToDatabase).mockResolvedValue({} as never);
    vi.mocked(NotificationModel.find).mockReturnValue(
      queryChain([first, second]) as never,
    );
    vi.mocked(NotificationModel.countDocuments).mockReturnValue(
      queryChain(2) as never,
    );
    vi.mocked(NotificationModel.findOneAndUpdate).mockReturnValue(
      queryChain({ ...first, readAt: firstCreatedAt }) as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(["suspended", "deactivated"] as const)(
    "rejects %s accounts before any database access",
    async (status) => {
      const account = { ...user, status };

      expect(() => requireNotificationUser(account)).toThrowError(
        new NotificationError("NOTIFICATION_FORBIDDEN"),
      );
      await expect(
        listNotifications(account, { pageSize: 20 }),
      ).rejects.toMatchObject({ code: "NOTIFICATION_FORBIDDEN" });
      await expect(markNotificationRead(account, firstId)).rejects.toMatchObject(
        { code: "NOTIFICATION_FORBIDDEN" },
      );
      expect(connectToDatabase).not.toHaveBeenCalled();
      expect(NotificationModel.find).not.toHaveBeenCalled();
      expect(NotificationModel.countDocuments).not.toHaveBeenCalled();
      expect(NotificationModel.findOneAndUpdate).not.toHaveBeenCalled();
    },
  );

  it.each(["student", "staff", "administrator"] as const)(
    "permits an active %s account",
    async (role) => {
      const account = { ...user, role };
      expect(() => requireNotificationUser(account)).not.toThrow();
      await expect(
        listNotifications(account, { pageSize: 20 }),
      ).resolves.toBeDefined();
      expect(connectToDatabase).toHaveBeenCalledOnce();
    },
  );

  it("lists only the current recipient with bounded descending seek pagination", async () => {
    const findQuery = queryChain([first, second]);
    vi.mocked(NotificationModel.find).mockReturnValue(findQuery as never);
    const cursorDate = new Date("2026-08-25T06:03:00.000Z");
    const cursorId = "64b64c6f2f4d9f1a2b3c4d59";

    const page = await listNotifications(user, {
      pageSize: 1,
      cursor: { createdAt: cursorDate, id: cursorId },
    });

    expect(NotificationModel.find).toHaveBeenCalledWith({
      recipientId: user.id,
      $or: [
        { createdAt: { $lt: cursorDate } },
        { createdAt: cursorDate, _id: { $lt: cursorId } },
      ],
    });
    expect(findQuery.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(findQuery.limit).toHaveBeenCalledWith(2);
    expect(NotificationModel.countDocuments).toHaveBeenCalledWith({
      recipientId: user.id,
      readAt: null,
    });
    expect(page.notifications).toHaveLength(1);
    expect(page.unreadCount).toBe(2);
    expect(page.pagination).toEqual({
      hasMore: true,
      nextCursor: encodeNotificationCursor({
        createdAt: firstCreatedAt,
        id: firstId,
      }),
    });
    expect(JSON.stringify(page)).not.toMatch(
      /recipientId|claimantId|reporterId|reviewNote|verification|email/,
    );
  });

  it("uses the recipient-only filter when no cursor is present", async () => {
    await listNotifications(user, { pageSize: 20 });

    expect(NotificationModel.find).toHaveBeenCalledWith({
      recipientId: user.id,
    });
  });

  it("returns a stable empty page", async () => {
    vi.mocked(NotificationModel.find).mockReturnValue(queryChain([]) as never);
    vi.mocked(NotificationModel.countDocuments).mockReturnValue(
      queryChain(0) as never,
    );

    await expect(
      listNotifications(user, { pageSize: 20 }),
    ).resolves.toEqual({
      notifications: [],
      pagination: { nextCursor: null, hasMore: false },
      unreadCount: 0,
    });
  });

  it.each([
    ["a partial page", 3, [first]],
    ["an exact full page", 3, [first, second, third]],
  ] as const)("does not emit a cursor for %s", async (_label, pageSize, rows) => {
    vi.mocked(NotificationModel.find).mockReturnValue(
      queryChain([...rows]) as never,
    );

    const page = await listNotifications(user, { pageSize });

    expect(page.notifications).toHaveLength(rows.length);
    expect(page.pagination).toEqual({ nextCursor: null, hasMore: false });
  });

  it("uses the last visible row for a canonical next cursor", async () => {
    vi.mocked(NotificationModel.find).mockReturnValue(
      queryChain([first, second, third]) as never,
    );

    const page = await listNotifications(user, { pageSize: 2 });

    expect(page.notifications.map(({ id }) => id)).toEqual([firstId, secondId]);
    expect(page.pagination).toEqual({
      hasMore: true,
      nextCursor: encodeNotificationCursor({
        createdAt: secondCreatedAt,
        id: secondId,
      }),
    });
  });

  it("fails closed when a stored notification cannot satisfy the public contract", async () => {
    vi.mocked(NotificationModel.find).mockReturnValue(
      queryChain([{ ...first, kind: "private_internal_event" }]) as never,
    );

    await expect(
      listNotifications(user, { pageSize: 20 }),
    ).rejects.toThrow();
  });

  it("does not query notification records when connection fails", async () => {
    const failure = new Error("database unavailable");
    vi.mocked(connectToDatabase).mockRejectedValueOnce(failure);

    await expect(
      listNotifications(user, { pageSize: 20 }),
    ).rejects.toBe(failure);
    expect(NotificationModel.find).not.toHaveBeenCalled();
    expect(NotificationModel.countDocuments).not.toHaveBeenCalled();
  });

  it("marks only the current recipient notification read atomically", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-08-25T07:00:00.000Z");
    vi.setSystemTime(now);
    const updateQuery = queryChain({ ...first, readAt: now });
    vi.mocked(NotificationModel.findOneAndUpdate).mockReturnValue(
      updateQuery as never,
    );

    const result = await markNotificationRead(user, firstId);

    expect(NotificationModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: firstId, recipientId: user.id },
      [
        {
          $set: {
            readAt: { $ifNull: ["$readAt", now] },
          },
        },
      ],
      { returnDocument: "after", updatePipeline: true },
    );
    expect(updateQuery.lean).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      id: firstId,
      readAt: now.toISOString(),
      isRead: true,
    });
  });

  it("preserves the first read timestamp on repeated reads", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T08:00:00.000Z"));
    const originalReadAt = new Date("2026-08-25T07:00:00.000Z");
    vi.mocked(NotificationModel.findOneAndUpdate).mockReturnValue(
      queryChain({ ...first, readAt: originalReadAt }) as never,
    );

    await expect(markNotificationRead(user, firstId)).resolves.toMatchObject({
      readAt: originalReadAt.toISOString(),
      isRead: true,
    });
    expect(NotificationModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: firstId, recipientId: user.id }),
      [
        {
          $set: {
            readAt: {
              $ifNull: ["$readAt", new Date("2026-08-25T08:00:00.000Z")],
            },
          },
        },
      ],
      { returnDocument: "after", updatePipeline: true },
    );
  });

  it("hides missing and foreign notification records behind one error", async () => {
    vi.mocked(NotificationModel.findOneAndUpdate).mockReturnValue(
      queryChain(null) as never,
    );

    await expect(markNotificationRead(user, firstId)).rejects.toMatchObject({
      code: "NOTIFICATION_NOT_FOUND",
    });
  });

  it("preserves database failures for safe route mapping", async () => {
    const failure = new Error("PRIVATE-DATABASE-DETAIL");
    vi.mocked(NotificationModel.findOneAndUpdate).mockReturnValue(
      queryChain(Promise.reject(failure)) as never,
    );

    await expect(markNotificationRead(user, firstId)).rejects.toBe(failure);
  });
});
