import { describe, expect, it } from "vitest";

import {
  emptyNotificationBodySchema,
  encodeNotificationCursor,
  notificationIdSchema,
  notificationListQuerySchema,
  toNotificationListQueryInput,
} from "./validation";

const id = "64b64c6f2f4d9f1a2b3c4d54";
const createdAt = new Date("2026-08-25T06:00:00.000Z");

describe("notification validation", () => {
  it("applies the default page size and decodes a canonical cursor", () => {
    expect(notificationListQuerySchema.parse({})).toEqual({ pageSize: 20 });
    const cursor = encodeNotificationCursor({ createdAt, id });
    expect(notificationListQuerySchema.parse({ cursor })).toEqual({
      pageSize: 20,
      cursor: { createdAt, id },
    });
  });

  it.each(["0", "51", "1.5", "01", "value"])(
    "rejects page size %s",
    (pageSize) => {
      expect(notificationListQuerySchema.safeParse({ pageSize }).success).toBe(
        false,
      );
    },
  );

  it.each([
    "not-base64!",
    Buffer.from("{", "utf8").toString("base64url"),
    Buffer.from(
      JSON.stringify({ createdAt: "invalid", id }),
      "utf8",
    ).toString("base64url"),
    Buffer.from(
      JSON.stringify({ createdAt: createdAt.toISOString(), id: "bad" }),
      "utf8",
    ).toString("base64url"),
    "a".repeat(513),
  ])("rejects malformed cursor %s", (cursor) => {
    expect(notificationListQuerySchema.safeParse({ cursor }).success).toBe(
      false,
    );
  });

  it("rejects non-canonical cursor encodings and payloads", () => {
    const cursor = encodeNotificationCursor({ createdAt, id });
    const trailingData = Buffer.from(
      `${JSON.stringify({ createdAt: createdAt.toISOString(), id })} `,
      "utf8",
    ).toString("base64url");

    expect(
      notificationListQuerySchema.safeParse({ cursor: `${cursor}=` }).success,
    ).toBe(false);
    expect(
      notificationListQuerySchema.safeParse({ cursor: trailingData }).success,
    ).toBe(false);
    expect(
      notificationListQuerySchema.safeParse({
        cursor: Buffer.from(
          JSON.stringify({ id, createdAt: createdAt.toISOString() }),
          "utf8",
        ).toString("base64url"),
      }).success,
    ).toBe(
      false,
    );
  });

  it("rejects unknown and duplicate query keys", () => {
    expect(
      notificationListQuerySchema.safeParse(
        toNotificationListQueryInput(
          new URLSearchParams("pageSize=10&pageSize=20"),
        ),
      ).success,
    ).toBe(false);
    expect(
      notificationListQuerySchema.safeParse({ pageSize: "20", owner: "other" })
        .success,
    ).toBe(false);
  });

  it("accepts only canonical ObjectIds and an empty object body", () => {
    expect(notificationIdSchema.parse(id)).toBe(id);
    expect(notificationIdSchema.safeParse(id.toUpperCase()).success).toBe(false);
    expect(emptyNotificationBodySchema.parse({})).toEqual({});
    expect(
      emptyNotificationBodySchema.safeParse({ readAt: createdAt }).success,
    ).toBe(false);
  });
});
