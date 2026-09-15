import { describe, expect, it } from "vitest";

import { NOTIFICATION_KINDS } from "@/models/notification";

import {
  notificationPageSchema,
  publicNotificationSchema,
  toPublicNotification,
  type NotificationRecord,
} from "./contracts";

const reportId = "64b64c6f2f4d9f1a2b3c4d52";
const claimId = "64b64c6f2f4d9f1a2b3c4d53";
const createdAt = new Date("2026-08-25T06:00:00.000Z");

function identifier(value: string) {
  return { toString: () => value };
}

function record(
  kind: (typeof NOTIFICATION_KINDS)[number],
  readAt: Date | null = null,
): NotificationRecord {
  return {
    _id: identifier("64b64c6f2f4d9f1a2b3c4d54"),
    kind,
    reportId: identifier(reportId),
    claimId: identifier(claimId),
    readAt,
    createdAt,
  };
}

describe("notification public contracts", () => {
  it.each(NOTIFICATION_KINDS)("maps %s through controlled copy", (kind) => {
    const mapped = toPublicNotification(record(kind));
    expect(publicNotificationSchema.parse(mapped)).toEqual(mapped);
    expect(mapped.kind).toBe(kind);
    expect(mapped.title.length).toBeGreaterThan(0);
    expect(mapped.summary.length).toBeGreaterThan(0);
    expect(mapped.action.label.length).toBeGreaterThan(0);
    expect(mapped.action.href).toMatch(/^\/(claims|reports)\/[a-f\d]{24}$/);
    expect(mapped.isRead).toBe(false);
    expect(mapped.readAt).toBeNull();
  });

  it("uses report links for owner events and claim links for claimant events", () => {
    expect(
      toPublicNotification({
        ...record("possible_match"),
        claimId: null,
      }).action.href,
    ).toBe(`/reports/${reportId}`);
    expect(toPublicNotification(record("claim_received")).action.href).toBe(
      `/reports/${reportId}`,
    );
    expect(toPublicNotification(record("claim_withdrawn")).action.href).toBe(
      `/reports/${reportId}`,
    );
    expect(toPublicNotification(record("report_recovered")).action.href).toBe(
      `/reports/${reportId}`,
    );
    expect(toPublicNotification(record("claim_approved")).action.href).toBe(
      `/claims/${claimId}`,
    );
  });

  it("maps a possible match without a claim reference", () => {
    expect(
      toPublicNotification({
        ...record("possible_match"),
        claimId: null,
      }),
    ).toMatchObject({
      kind: "possible_match",
      title: "Possible item match",
      summary: "A new opposite-type report may match one of your open reports.",
      action: {
        label: "View report",
        href: `/reports/${reportId}`,
      },
    });
  });

  it("rejects a claim notification without a claim reference", () => {
    expect(() =>
      toPublicNotification({
        ...record("claim_approved"),
        claimId: null,
      }),
    ).toThrow("Claim notification is missing a claim ID");
  });

  it("preserves read time and derives a consistent read flag", () => {
    const readAt = new Date("2026-08-25T06:05:00.000Z");
    expect(toPublicNotification(record("claim_completed", readAt))).toMatchObject({
      readAt: readAt.toISOString(),
      isRead: true,
    });
  });

  it("rejects private extras and inconsistent read state", () => {
    const mapped = toPublicNotification(record("claim_rejected"));
    expect(
      publicNotificationSchema.safeParse({
        ...mapped,
        claimantId: "PRIVATE-CLAIMANT",
      }).success,
    ).toBe(false);
    expect(
      publicNotificationSchema.safeParse({ ...mapped, isRead: true }).success,
    ).toBe(false);
  });

  it("validates an empty page without leaking internal fields", () => {
    const page = notificationPageSchema.parse({
      notifications: [],
      pagination: { nextCursor: null, hasMore: false },
      unreadCount: 0,
    });
    expect(page).toEqual({
      notifications: [],
      pagination: { nextCursor: null, hasMore: false },
      unreadCount: 0,
    });
    expect(JSON.stringify(page)).not.toMatch(
      /recipientId|claimantId|reporterId|reviewNote|verification|email/,
    );
  });
});
