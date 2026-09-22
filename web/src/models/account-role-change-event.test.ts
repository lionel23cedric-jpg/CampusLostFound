import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import { AccountRoleChangeEventModel, accountRoleChangeEventSchema } from "./account-role-change-event";

const actorAdministratorId = new mongoose.Types.ObjectId();
const targetUserId = new mongoose.Types.ObjectId();

function event(overrides: Record<string, unknown> = {}) {
  return new AccountRoleChangeEventModel({
    actorAdministratorId,
    targetUserId,
    previousRole: "student",
    newRole: "staff",
    ...overrides,
  });
}

describe("AccountRoleChangeEvent", () => {
  it("accepts promotion and demotion but not unrelated or self changes", async () => {
    await expect(event().validate()).resolves.toBeUndefined();
    await expect(event({ previousRole: "staff", newRole: "student" }).validate()).resolves.toBeUndefined();
    await expect(event({ previousRole: "staff", newRole: "staff" }).validate()).rejects.toBeTruthy();
    await expect(event({ newRole: "administrator" }).validate()).rejects.toBeTruthy();
    await expect(event({ targetUserId: actorAdministratorId }).validate()).rejects.toBeTruthy();
  });

  it("keeps audit fields immutable and indexed", () => {
    for (const path of ["actorAdministratorId", "targetUserId", "previousRole", "newRole", "occurredAt"]) {
      expect(accountRoleChangeEventSchema.path(path).options.immutable).toBe(true);
    }
    expect(accountRoleChangeEventSchema.indexes()).toEqual(expect.arrayContaining([
      [{ targetUserId: 1, occurredAt: -1, _id: -1 }, expect.any(Object)],
    ]));
  });
});
