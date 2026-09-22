import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/user", () => ({
  USER_STATUSES: ["active", "suspended", "deactivated"],
  UserModel: { findOne: vi.fn(), findById: vi.fn(), findOneAndUpdate: vi.fn() },
}));
vi.mock("@/models/profile", () => ({ ProfileModel: { findOne: vi.fn() } }));
vi.mock("@/models/session", () => ({ SessionModel: { deleteMany: vi.fn() } }));
vi.mock("@/models/account-role-change-event", () => ({
  AccountRoleChangeEventModel: { create: vi.fn() },
}));

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { AccountRoleChangeEventModel } from "@/models/account-role-change-event";
import { ProfileModel } from "@/models/profile";
import { SessionModel } from "@/models/session";
import { UserModel } from "@/models/user";

import { updateManagedAccountRole } from "./account-role-service";

const admin = {
  id: "64b64c6f2f4d9f1a2b3c4d51",
  email: "admin@example.test",
  role: "administrator",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Administrator",
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
const targetId = "64b64c6f2f4d9f1a2b3c4d52";
const previous = "2026-09-22T00:00:00.000Z";
const next = new Date("2026-09-22T01:00:00.000Z");
const created = new Date("2026-09-01T00:00:00.000Z");

function query(value: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    session: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(value),
  };
}
function target(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => targetId },
    email: "student@example.test",
    role: "student",
    status: "active",
    createdAt: created,
    lastLoginAt: null,
    updatedAt: new Date(previous),
    ...overrides,
  };
}

const transaction = {
  withTransaction: vi.fn(async (work: () => Promise<void>) => work()),
  endSession: vi.fn().mockResolvedValue(undefined),
};
const database = { startSession: vi.fn().mockResolvedValue(transaction) };
let actorQuery: ReturnType<typeof query>;
let targetQuery: ReturnType<typeof query>;
let updateQuery: ReturnType<typeof query>;

describe("client-managed Staff role service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transaction.withTransaction.mockImplementation(async (work) => work());
    transaction.endSession.mockResolvedValue(undefined);
    database.startSession.mockResolvedValue(transaction);
    vi.mocked(connectToDatabase).mockResolvedValue(database as never);
    actorQuery = query({ _id: admin.id });
    targetQuery = query(target());
    updateQuery = query(target({ role: "staff", updatedAt: next }));
    vi.mocked(UserModel.findOne).mockReturnValue(actorQuery as never);
    vi.mocked(UserModel.findById).mockReturnValue(targetQuery as never);
    vi.mocked(UserModel.findOneAndUpdate).mockReturnValue(updateQuery as never);
    vi.mocked(ProfileModel.findOne).mockReturnValue(query({ displayName: "Student" }) as never);
    vi.mocked(SessionModel.deleteMany).mockResolvedValue({ deletedCount: 2 } as never);
    vi.mocked(AccountRoleChangeEventModel.create).mockResolvedValue([{}] as never);
  });

  it("promotes in one transaction, revokes sessions and records actor and roles", async () => {
    await expect(updateManagedAccountRole(admin, targetId, { role: "staff", expectedUpdatedAt: previous })).resolves.toMatchObject({
      id: targetId, role: "staff", status: "active", updatedAt: next.toISOString(),
    });
    expect(UserModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: expect.anything(), role: "student", status: "active", updatedAt: new Date(previous) },
      { $set: { role: "staff" } },
      expect.objectContaining({ new: true, runValidators: true, session: transaction }),
    );
    expect(SessionModel.deleteMany).toHaveBeenCalledWith({ userId: expect.anything() }, { session: transaction });
    expect(AccountRoleChangeEventModel.create).toHaveBeenCalledWith([
      { actorAdministratorId: expect.anything(), targetUserId: expect.anything(), previousRole: "student", newRole: "staff" },
    ], { session: transaction });
    expect(transaction.withTransaction).toHaveBeenCalledOnce();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("demotes a suspended Staff account without changing its status", async () => {
    targetQuery.exec.mockResolvedValue(target({ role: "staff", status: "suspended" }));
    updateQuery.exec.mockResolvedValue(target({ role: "student", status: "suspended", updatedAt: next }));
    await expect(updateManagedAccountRole(admin, targetId, { role: "student", expectedUpdatedAt: previous })).resolves.toMatchObject({
      role: "student", status: "suspended",
    });
  });

  it("denies a non-admin or self before touching the database", async () => {
    await expect(updateManagedAccountRole({ ...admin, role: "staff" }, targetId, { role: "staff", expectedUpdatedAt: previous })).rejects.toMatchObject({ code: "ADMINISTRATOR_REQUIRED" });
    await expect(updateManagedAccountRole(admin, admin.id, { role: "staff", expectedUpdatedAt: previous })).rejects.toMatchObject({ code: "ACCOUNT_ACTION_FORBIDDEN" });
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  it("rechecks the actor inside the transaction", async () => {
    actorQuery.exec.mockResolvedValue(null);
    await expect(updateManagedAccountRole(admin, targetId, { role: "staff", expectedUpdatedAt: previous })).rejects.toMatchObject({ code: "ADMINISTRATOR_REQUIRED" });
    expect(UserModel.findById).not.toHaveBeenCalled();
  });

  it.each([
    [null, "ACCOUNT_NOT_FOUND"],
    [target({ role: "administrator" }), "ACCOUNT_ACTION_FORBIDDEN"],
    [target({ status: "deactivated" }), "ACCOUNT_STATE_CONFLICT"],
    [target({ role: "staff" }), "ACCOUNT_STATE_CONFLICT"],
    [target({ updatedAt: new Date("2026-09-21T00:00:00.000Z") }), "ACCOUNT_STATE_CONFLICT"],
  ])("rejects an unsafe or stale target %#", async (record, code) => {
    targetQuery.exec.mockResolvedValue(record);
    await expect(updateManagedAccountRole(admin, targetId, { role: "staff", expectedUpdatedAt: previous })).rejects.toMatchObject({ code });
    expect(SessionModel.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects a lost conditional update", async () => {
    updateQuery.exec.mockResolvedValue(null);
    await expect(updateManagedAccountRole(admin, targetId, { role: "staff", expectedUpdatedAt: previous })).rejects.toMatchObject({ code: "ACCOUNT_STATE_CONFLICT" });
  });

  it("sanitises audit failure and closes the transaction", async () => {
    vi.mocked(AccountRoleChangeEventModel.create).mockRejectedValueOnce(new Error("PRIVATE DATABASE DETAIL"));
    await expect(updateManagedAccountRole(admin, targetId, { role: "staff", expectedUpdatedAt: previous })).rejects.toMatchObject({ code: "ACCOUNT_OPERATION_FAILED" });
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });
});
