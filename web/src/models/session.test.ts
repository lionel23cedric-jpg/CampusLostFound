import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import { SessionModel, sessionSchema } from "./session";

describe("Session model", () => {
  it("validates a complete session", async () => {
    const session = new SessionModel({
      userId: new mongoose.Types.ObjectId(),
      tokenHash: "a".repeat(64),
      expiresAt: new Date("2026-08-18T00:00:00.000Z"),
    });

    await expect(session.validate()).resolves.toBeUndefined();
  });

  it("rejects a malformed token hash", async () => {
    const session = new SessionModel({
      userId: new mongoose.Types.ObjectId(),
      tokenHash: "not-a-sha256-hash",
      expiresAt: new Date("2026-08-18T00:00:00.000Z"),
    });

    await expect(session.validate()).rejects.toMatchObject({
      errors: { tokenHash: expect.anything() },
    });
  });

  it("defines unique token, TTL expiry and user lookup indexes", () => {
    const indexes = sessionSchema.indexes();

    expect(indexes).toEqual(
      expect.arrayContaining([
        [{ tokenHash: 1 }, expect.objectContaining({ unique: true })],
        [
          { expiresAt: 1 },
          expect.objectContaining({ expireAfterSeconds: 0 }),
        ],
        [{ userId: 1 }, expect.any(Object)],
      ]),
    );
  });

  it("hides tokenHash from ordinary query selection", () => {
    expect(sessionSchema.path("tokenHash").options.select).toBe(false);
  });
});
