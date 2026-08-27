import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/user", () => ({
  USER_STATUSES: ["active", "suspended", "deactivated"],
  UserModel: {
    findOne: vi.fn(),
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));
vi.mock("@/models/profile", () => ({
  ProfileModel: { findOne: vi.fn() },
}));
vi.mock("@/models/session", () => ({
  SessionModel: { deleteMany: vi.fn() },
}));
vi.mock("@/models/account-administration-event", () => ({
  ACCOUNT_ADMINISTRATION_REASONS: [
    "security_concern",
    "policy_violation",
    "administrative_review",
    "account_restored",
    "account_closed",
  ],
  AccountAdministrationEventModel: { create: vi.fn() },
}));

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { AccountAdministrationEventModel } from "@/models/account-administration-event";
import { ProfileModel } from "@/models/profile";
import { SessionModel } from "@/models/session";
import { UserModel } from "@/models/user";

import {
  accountTransitionIsAllowed,
  updateManagedAccountStatus,
} from "./account-status-service";

const administrator = {
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

const targetUserId = "64b64c6f2f4d9f1a2b3c4d52";
const previousUpdatedAt = "2026-08-26T23:30:00.000Z";
const nextUpdatedAt = new Date("2026-08-27T01:00:00.000Z");
const createdAt = new Date("2026-08-20T01:00:00.000Z");

type Query = ReturnType<typeof queryResult>;
function queryResult(value: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    session: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(value),
  };
}

let actorQuery: Query;
let targetQuery: Query;
let updateQuery: Query;
let profileQuery: Query;
const session = {
  withTransaction: vi.fn(async (work: () => Promise<void>) => work()),
  endSession: vi.fn().mockResolvedValue(undefined),
};
const database = { startSession: vi.fn().mockResolvedValue(session) };

function target(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => targetUserId },
    email: "student@example.test",
    role: "student",
    status: "active",
    createdAt,
    lastLoginAt: null,
    updatedAt: new Date(previousUpdatedAt),
    ...overrides,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    status: "suspended" as const,
    expectedUpdatedAt: previousUpdatedAt,
    reason: "security_concern" as const,
    ...overrides,
  };
}

describe("administrator account status service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.withTransaction.mockImplementation(
      async (work: () => Promise<void>) => work(),
    );
    session.endSession.mockResolvedValue(undefined);
    database.startSession.mockResolvedValue(session);
    vi.mocked(connectToDatabase).mockResolvedValue(database as never);

    actorQuery = queryResult({ _id: administrator.id });
    targetQuery = queryResult(target());
    updateQuery = queryResult(
      target({ status: "suspended", updatedAt: nextUpdatedAt }),
    );
    profileQuery = queryResult({ displayName: "Example Student" });
    vi.mocked(UserModel.findOne).mockReturnValue(actorQuery as never);
    vi.mocked(UserModel.findById).mockReturnValue(targetQuery as never);
    vi.mocked(UserModel.findOneAndUpdate).mockReturnValue(updateQuery as never);
    vi.mocked(ProfileModel.findOne).mockReturnValue(profileQuery as never);
    vi.mocked(SessionModel.deleteMany).mockResolvedValue({
      acknowledged: true,
      deletedCount: 2,
    } as never);
    vi.mocked(AccountAdministrationEventModel.create).mockResolvedValue(
      [{}] as never,
    );
  });

  it.each([
    ["active", "suspended", "security_concern", true],
    ["active", "suspended", "policy_violation", true],
    ["active", "suspended", "administrative_review", true],
    ["suspended", "active", "account_restored", true],
    ["active", "deactivated", "account_closed", true],
    ["suspended", "deactivated", "account_closed", true],
    ["active", "active", "account_restored", false],
    ["suspended", "suspended", "security_concern", false],
    ["deactivated", "active", "account_restored", false],
    ["active", "suspended", "account_closed", false],
  ])(
    "checks %s -> %s with %s",
    (previous, next, reason, expected) => {
      expect(accountTransitionIsAllowed(previous, next, reason)).toBe(expected);
    },
  );

  it("rejects a public non-administrator before database work", async () => {
    await expect(
      updateManagedAccountStatus(
        { ...administrator, role: "staff" },
        targetUserId,
        input(),
      ),
    ).rejects.toMatchObject({ code: "ADMINISTRATOR_REQUIRED" });
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  it("rejects self before database work", async () => {
    await expect(
      updateManagedAccountStatus(administrator, administrator.id, input()),
    ).rejects.toMatchObject({ code: "ACCOUNT_ACTION_FORBIDDEN" });
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  it("updates, revokes sessions and audits in one transaction", async () => {
    await expect(
      updateManagedAccountStatus(administrator, targetUserId, input()),
    ).resolves.toEqual({
      id: targetUserId,
      email: "student@example.test",
      displayName: "Example Student",
      role: "student",
      status: "suspended",
      createdAt: createdAt.toISOString(),
      lastLoginAt: null,
      updatedAt: nextUpdatedAt.toISOString(),
    });

    expect(UserModel.findOne).toHaveBeenCalledWith({
      _id: expect.anything(),
      role: "administrator",
      status: "active",
    });
    expect(actorQuery.session).toHaveBeenCalledWith(session);
    expect(actorQuery.select).toHaveBeenCalledWith({ _id: 1 });
    expect(targetQuery.session).toHaveBeenCalledWith(session);
    expect(UserModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: expect.anything(),
        role: { $in: ["student", "staff"] },
        status: "active",
        updatedAt: new Date(previousUpdatedAt),
      },
      { $set: { status: "suspended" } },
      expect.objectContaining({
        new: true,
        runValidators: true,
        session,
      }),
    );
    expect(SessionModel.deleteMany).toHaveBeenCalledWith(
      { userId: expect.anything() },
      { session },
    );
    expect(AccountAdministrationEventModel.create).toHaveBeenCalledWith(
      [
        {
          actorAdministratorId: expect.anything(),
          targetUserId: expect.anything(),
          previousStatus: "active",
          newStatus: "suspended",
          reason: "security_concern",
        },
      ],
      { session },
    );
    expect(profileQuery.session).toHaveBeenCalledWith(session);
    const actorFilter = vi.mocked(UserModel.findOne).mock.calls[0]?.[0] as
      | { _id?: { toString(): string } }
      | undefined;
    const sessionFilter = vi.mocked(SessionModel.deleteMany).mock
      .calls[0]?.[0] as { userId?: { toString(): string } } | undefined;
    expect(actorFilter?._id?.toString()).toBe(administrator.id);
    expect(sessionFilter?.userId?.toString()).toBe(targetUserId);
    expect(session.withTransaction).toHaveBeenCalledOnce();
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it("revokes sessions when reactivating an account", async () => {
    targetQuery.exec.mockResolvedValue(
      target({ status: "suspended" }),
    );
    updateQuery.exec.mockResolvedValue(
      target({ status: "active", updatedAt: nextUpdatedAt }),
    );

    await updateManagedAccountStatus(
      administrator,
      targetUserId,
      input({ status: "active", reason: "account_restored" }),
    );
    expect(SessionModel.deleteMany).toHaveBeenCalledOnce();
  });

  it("reauthorises the actor inside the transaction", async () => {
    actorQuery.exec.mockResolvedValue(null);
    await expect(
      updateManagedAccountStatus(administrator, targetUserId, input()),
    ).rejects.toMatchObject({ code: "ADMINISTRATOR_REQUIRED" });
    expect(UserModel.findById).not.toHaveBeenCalled();
    expect(SessionModel.deleteMany).not.toHaveBeenCalled();
  });

  it.each([
    [null, "ACCOUNT_NOT_FOUND"],
    [target({ role: "administrator" }), "ACCOUNT_ACTION_FORBIDDEN"],
    [target({ role: "unknown" }), "ACCOUNT_NOT_FOUND"],
  ])("rejects unsafe target %#", async (record, code) => {
    targetQuery.exec.mockResolvedValue(record);
    await expect(
      updateManagedAccountStatus(administrator, targetUserId, input()),
    ).rejects.toMatchObject({ code });
    expect(UserModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each([
    [target({ updatedAt: new Date("2026-08-26T00:00:00.000Z") }), input()],
    [target(), input({ status: "active", reason: "account_restored" })],
    [
      target({ status: "deactivated" }),
      input({ status: "active", reason: "account_restored" }),
    ],
    [target(), input({ status: "suspended", reason: "account_closed" })],
  ])("rejects stale or invalid state %#", async (record, request) => {
    targetQuery.exec.mockResolvedValue(record);
    await expect(
      updateManagedAccountStatus(administrator, targetUserId, request as never),
    ).rejects.toMatchObject({ code: "ACCOUNT_STATE_CONFLICT" });
    expect(SessionModel.deleteMany).not.toHaveBeenCalled();
  });

  it("treats a lost conditional update as a conflict", async () => {
    updateQuery.exec.mockResolvedValue(null);
    await expect(
      updateManagedAccountStatus(administrator, targetUserId, input()),
    ).rejects.toMatchObject({ code: "ACCOUNT_STATE_CONFLICT" });
    expect(SessionModel.deleteMany).not.toHaveBeenCalled();
  });

  it.each(["session deletion", "audit insert", "profile read"])(
    "sanitises a %s failure and ends the session",
    async (stage) => {
      const failure = new Error(`PRIVATE ${stage}`);
      if (stage === "session deletion") {
        vi.mocked(SessionModel.deleteMany).mockRejectedValueOnce(failure);
      } else if (stage === "audit insert") {
        vi.mocked(AccountAdministrationEventModel.create).mockRejectedValueOnce(
          failure,
        );
      } else {
        profileQuery.exec.mockRejectedValueOnce(failure);
      }

      await expect(
        updateManagedAccountStatus(administrator, targetUserId, input()),
      ).rejects.toMatchObject({
        code: "ACCOUNT_OPERATION_FAILED",
        message: "Account operation could not be completed",
      });
      expect(session.endSession).toHaveBeenCalledOnce();
    },
  );

  it("sanitises connection and end-session failures", async () => {
    vi.mocked(connectToDatabase).mockRejectedValueOnce(
      new Error("PRIVATE CONNECTION"),
    );
    await expect(
      updateManagedAccountStatus(administrator, targetUserId, input()),
    ).rejects.toMatchObject({ code: "ACCOUNT_OPERATION_FAILED" });

    vi.mocked(connectToDatabase).mockResolvedValue(database as never);
    session.endSession.mockRejectedValueOnce(new Error("PRIVATE END"));
    await expect(
      updateManagedAccountStatus(administrator, targetUserId, input()),
    ).rejects.toMatchObject({ code: "ACCOUNT_OPERATION_FAILED" });
  });
});
