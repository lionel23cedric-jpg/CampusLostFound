import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/user", () => ({
  USER_STATUSES: ["active", "suspended", "deactivated"],
  UserModel: { aggregate: vi.fn() },
}));

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { UserModel } from "@/models/user";

import {
  escapeAccountSearch,
  listManagedAccounts,
} from "./account-list-service";

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

const id = "64b64c6f2f4d9f1a2b3c4d52";
const createdAt = new Date("2026-08-20T01:00:00.000Z");
const updatedAt = new Date("2026-08-27T01:00:00.000Z");
function aggregateResult(value: unknown) {
  return { exec: vi.fn().mockResolvedValue(value) };
}

function pipeline() {
  return vi.mocked(UserModel.aggregate).mock.calls[0][0] as unknown as Array<
    Record<string, unknown>
  >;
}

describe("administrator account list service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(UserModel.aggregate).mockReturnValue(
      aggregateResult([{ accounts: [], metadata: [] }]) as never,
    );
  });

  it("rejects non-administrators before connection and model access", async () => {
    await expect(
      listManagedAccounts(
        { ...administrator, role: "staff" },
        { page: 1 },
      ),
    ).rejects.toMatchObject({ code: "ADMINISTRATOR_REQUIRED" });
    expect(connectToDatabase).not.toHaveBeenCalled();
    expect(UserModel.aggregate).not.toHaveBeenCalled();
  });

  it("escapes every regular-expression metacharacter", () => {
    expect(escapeAccountSearch("a.*+?^${}()|[]\\b")).toBe(
      "a\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\b",
    );
  });

  it("enforces role, status, search and page in one bounded aggregate", async () => {
    await listManagedAccounts(administrator, {
      q: "student.*",
      role: "student",
      status: "suspended",
      page: 2,
    });

    const stages = pipeline();
    expect(stages[0]).toEqual({
      $match: {
        role: { $in: ["student"] },
        status: "suspended",
      },
    });
    expect(stages[1]).toMatchObject({
      $lookup: {
        from: "profiles",
        localField: "_id",
        foreignField: "userId",
        as: "profile",
      },
    });
    expect(stages[2]).toEqual({ $unwind: "$profile" });
    expect(stages[3]).toEqual({
      $match: {
        $or: [
          { email: { $regex: "student\\.\\*", $options: "i" } },
          {
            "profile.displayName": {
              $regex: "student\\.\\*",
              $options: "i",
            },
          },
        ],
      },
    });
    expect(stages[4]).toEqual({
      $facet: {
        accounts: [
          { $sort: { createdAt: -1, _id: -1 } },
          { $skip: 20 },
          { $limit: 20 },
          {
            $project: {
              _id: 1,
              email: 1,
              displayName: "$profile.displayName",
              role: 1,
              status: 1,
              createdAt: 1,
              lastLoginAt: 1,
              updatedAt: 1,
            },
          },
        ],
        metadata: [{ $count: "totalItems" }],
      },
    });
  });

  it("retains both manageable roles without a role filter", async () => {
    await listManagedAccounts(administrator, { page: 1 });
    expect(pipeline()[0]).toEqual({
      $match: { role: { $in: ["student", "staff"] } },
    });
    expect(pipeline()).toHaveLength(4);
  });

  it("caps page 500 at a 9,980-row skip", async () => {
    await listManagedAccounts(administrator, { page: 500 });
    const facet = pipeline().at(-1) as {
      $facet: { accounts: Array<Record<string, unknown>> };
    };
    expect(facet.$facet.accounts).toContainEqual({ $skip: 9_980 });
    expect(facet.$facet.accounts).toContainEqual({ $limit: 20 });
  });

  it("maps exact public fields and pagination", async () => {
    vi.mocked(UserModel.aggregate).mockReturnValue(
      aggregateResult([
        {
          accounts: [
            {
              _id: { toString: () => id },
              email: "student@example.test",
              displayName: "Example Student",
              role: "student",
              status: "active",
              createdAt,
              lastLoginAt: null,
              updatedAt,
            },
          ],
          metadata: [{ totalItems: 21 }],
        },
      ]) as never,
    );

    await expect(
      listManagedAccounts(administrator, { page: 2 }),
    ).resolves.toEqual({
      accounts: [
        {
          id,
          email: "student@example.test",
          displayName: "Example Student",
          role: "student",
          status: "active",
          createdAt: createdAt.toISOString(),
          lastLoginAt: null,
          updatedAt: updatedAt.toISOString(),
        },
      ],
      pagination: {
        page: 2,
        pageSize: 20,
        totalItems: 21,
        totalPages: 2,
      },
    });
  });

  it.each([
    new Error("PRIVATE DATABASE FAILURE"),
    [{ accounts: [{ passwordHash: "PRIVATE" }], metadata: [] }],
  ])("fails closed for unsafe result %#", async (failure) => {
    vi.mocked(UserModel.aggregate).mockReturnValue(
      failure instanceof Error
        ? ({ exec: vi.fn().mockRejectedValue(failure) } as never)
        : ({ exec: vi.fn().mockResolvedValue(failure) } as never),
    );

    await expect(
      listManagedAccounts(administrator, { page: 1 }),
    ).rejects.toMatchObject({
      code: "ACCOUNT_OPERATION_FAILED",
      message: "Account operation could not be completed",
    });
  });

  it("does not aggregate when database connection fails", async () => {
    vi.mocked(connectToDatabase).mockRejectedValueOnce(
      new Error("PRIVATE CONNECTION FAILURE"),
    );

    await expect(
      listManagedAccounts(administrator, { page: 1 }),
    ).rejects.toMatchObject({ code: "ACCOUNT_OPERATION_FAILED" });
    expect(UserModel.aggregate).not.toHaveBeenCalled();
  });
});
