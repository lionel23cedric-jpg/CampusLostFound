import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import {
  ACCOUNT_ADMINISTRATION_REASONS,
  AccountAdministrationEventModel,
  accountAdministrationEventSchema,
} from "./account-administration-event";

const actorAdministratorId = new mongoose.Types.ObjectId();
const targetUserId = new mongoose.Types.ObjectId();

function event(overrides: Record<string, unknown> = {}) {
  return new AccountAdministrationEventModel({
    actorAdministratorId,
    targetUserId,
    previousStatus: "active",
    newStatus: "suspended",
    reason: "security_concern",
    ...overrides,
  });
}

describe("AccountAdministrationEvent model", () => {
  it("requires the controlled audit fields and defaults occurredAt", async () => {
    const record = event();
    await expect(record.validate()).resolves.toBeUndefined();
    expect(record.occurredAt).toBeInstanceOf(Date);

    await expect(
      new AccountAdministrationEventModel({}).validate(),
    ).rejects.toMatchObject({
      errors: {
        actorAdministratorId: expect.anything(),
        targetUserId: expect.anything(),
        previousStatus: expect.anything(),
        newStatus: expect.anything(),
        reason: expect.anything(),
      },
    });
  });

  it.each(ACCOUNT_ADMINISTRATION_REASONS)("accepts reason %s", async (reason) => {
    const overrides =
      reason === "account_restored"
        ? { previousStatus: "suspended", newStatus: "active", reason }
        : reason === "account_closed"
          ? { newStatus: "deactivated", reason }
          : { reason };
    await expect(event(overrides).validate()).resolves.toBeUndefined();
  });

  it.each([
    ["active", "active", "security_concern"],
    ["deactivated", "active", "account_restored"],
    ["suspended", "deactivated", "account_restored"],
    ["active", "suspended", "account_closed"],
  ])(
    "rejects invalid audit transition %s -> %s with %s",
    async (previousStatus, newStatus, reason) => {
      await expect(
        event({ previousStatus, newStatus, reason }).validate(),
      ).rejects.toMatchObject({ errors: { newStatus: expect.anything() } });
    },
  );

  it("rejects an actor targeting the same User", async () => {
    await expect(
      event({ targetUserId: actorAdministratorId }).validate(),
    ).rejects.toMatchObject({ errors: { targetUserId: expect.anything() } });
  });

  it.each([
    "actorAdministratorId",
    "targetUserId",
    "previousStatus",
    "newStatus",
    "reason",
    "occurredAt",
  ])("marks %s immutable", (path) => {
    expect(accountAdministrationEventSchema.path(path).options.immutable).toBe(
      true,
    );
  });

  it("defines actor and target audit indexes without update timestamps", () => {
    expect(accountAdministrationEventSchema.indexes()).toEqual(
      expect.arrayContaining([
        [{ targetUserId: 1, occurredAt: -1, _id: -1 }, expect.any(Object)],
        [
          { actorAdministratorId: 1, occurredAt: -1, _id: -1 },
          expect.any(Object),
        ],
      ]),
    );
    expect(accountAdministrationEventSchema.indexes()).toHaveLength(2);
    expect(accountAdministrationEventSchema.get("timestamps")).toBe(false);
  });
});
