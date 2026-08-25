import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_KINDS,
  NotificationModel,
  notificationSchema,
} from "./notification";

const recipientId = new mongoose.Types.ObjectId();
const reportId = new mongoose.Types.ObjectId();
const claimId = new mongoose.Types.ObjectId();

function validNotification() {
  return {
    recipientId,
    reportId,
    claimId,
    kind: "claim_approved",
    eventKey: `notification:v1:claim_approved:${claimId}:${recipientId}`,
  };
}

describe("Notification model", () => {
  it("applies an unread default", async () => {
    const notification = new NotificationModel(validNotification());
    await expect(notification.validate()).resolves.toBeUndefined();
    expect(notification.readAt).toBeNull();
  });

  it.each(NOTIFICATION_KINDS)("accepts kind %s", async (kind) => {
    const notification = new NotificationModel({
      ...validNotification(),
      kind,
      eventKey: `notification:v1:${kind}:${claimId}:${recipientId}`,
    });
    await expect(notification.validate()).resolves.toBeUndefined();
  });

  it("rejects an unknown kind", async () => {
    const notification = new NotificationModel({
      ...validNotification(),
      kind: "private_staff_message",
    });
    await expect(notification.validate()).rejects.toMatchObject({
      errors: { kind: expect.anything() },
    });
  });

  it("requires recipient, report, claim, kind and event key", async () => {
    const notification = new NotificationModel({});
    await expect(notification.validate()).rejects.toMatchObject({
      errors: {
        recipientId: expect.anything(),
        reportId: expect.anything(),
        claimId: expect.anything(),
        kind: expect.anything(),
        eventKey: expect.anything(),
      },
    });
  });

  it("trims and bounds event keys", async () => {
    const trimmed = new NotificationModel({
      ...validNotification(),
      eventKey: "  notification:v1:test  ",
    });
    await expect(trimmed.validate()).resolves.toBeUndefined();
    expect(trimmed.eventKey).toBe("notification:v1:test");

    const oversized = new NotificationModel({
      ...validNotification(),
      eventKey: "x".repeat(201),
    });
    await expect(oversized.validate()).rejects.toMatchObject({
      errors: { eventKey: expect.anything() },
    });
  });

  it("defines recipient seek, unread and unique event indexes", () => {
    expect(notificationSchema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { recipientId: 1, createdAt: -1, _id: -1 },
          expect.any(Object),
        ],
        [{ recipientId: 1, readAt: 1 }, expect.any(Object)],
        [
          { eventKey: 1 },
          expect.objectContaining({ unique: true }),
        ],
      ]),
    );
    expect(notificationSchema.indexes()).toHaveLength(3);
  });

  it("enables timestamps", () => {
    expect(notificationSchema.get("timestamps")).toBe(true);
  });
});
