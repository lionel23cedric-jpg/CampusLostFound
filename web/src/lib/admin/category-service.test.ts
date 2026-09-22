import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/category", () => ({
  CategoryModel: {
    aggregate: vi.fn(),
    create: vi.fn(),
    findOneAndUpdate: vi.fn(),
    exists: vi.fn(),
  },
}));

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { CategoryModel } from "@/models/category";

import {
  createAdminCategory,
  escapeReferenceDataSearch,
  listAdminCategories,
  updateAdminCategory,
} from "./category-service";

const id = "64b64c6f2f4d9f1a2b3c4d51";
const updatedAt = "2026-08-27T02:00:00.000Z";
const administrator = {
  id: "64b64c6f2f4d9f1a2b3c4d50",
  email: "admin@example.test",
  role: "administrator",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Admin User",
    preferredContactMethod: "email",
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
} satisfies PublicUser;
const row = {
  _id: { toString: () => id },
  name: "Electronics",
  description: null,
  isActive: true,
  createdAt: new Date("2026-08-27T01:00:00.000Z"),
  updatedAt: new Date(updatedAt),
};

function aggregateReturning(result: unknown) {
  const aggregateQuery = {
    collation: vi.fn(),
    exec: vi.fn().mockResolvedValue(result),
  };
  aggregateQuery.collation.mockReturnValue(aggregateQuery);
  vi.mocked(CategoryModel.aggregate).mockReturnValue(aggregateQuery as never);
  return aggregateQuery;
}

function updateReturning(result: unknown) {
  const updateQuery = {
    lean: vi.fn(),
    exec: vi.fn().mockResolvedValue(result),
  };
  updateQuery.lean.mockReturnValue(updateQuery);
  vi.mocked(CategoryModel.findOneAndUpdate).mockReturnValue(updateQuery as never);
  return updateQuery;
}

describe("administrator Category service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectToDatabase).mockResolvedValue({} as never);
  });

  it.each([
    ["student", { ...administrator, role: "student" as const }],
    ["staff", { ...administrator, role: "staff" as const }],
    ["suspended administrator", { ...administrator, status: "suspended" as const }],
    [
      "deactivated administrator",
      { ...administrator, status: "deactivated" as const },
    ],
  ])("rejects the %s before connecting", async (_label, user) => {
    await expect(
      listAdminCategories(user, { status: "all", page: 1 }),
    ).rejects.toMatchObject({ code: "ADMINISTRATOR_REQUIRED" });
    expect(connectToDatabase).not.toHaveBeenCalled();
    expect(CategoryModel.aggregate).not.toHaveBeenCalled();
  });

  it.each([
    [
      "create",
      () =>
        createAdminCategory(
          { ...administrator, role: "student" },
          { name: "Keys", description: null },
        ),
    ],
    [
      "update",
      () =>
        updateAdminCategory(
          { ...administrator, status: "deactivated" },
          id,
          { updatedAt, name: "Keys" },
        ),
    ],
  ])("authorizes %s before connecting", async (_operation, invoke) => {
    await expect(invoke()).rejects.toMatchObject({
      code: "ADMINISTRATOR_REQUIRED",
    });
    expect(connectToDatabase).not.toHaveBeenCalled();
    expect(CategoryModel.create).not.toHaveBeenCalled();
    expect(CategoryModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("escapes search and returns a stable inactive page", async () => {
    const aggregateQuery = aggregateReturning([
      {
        categories: [{ ...row, isActive: false }],
        metadata: [{ totalItems: 1 }],
      },
    ]);

    await expect(
      listAdminCategories(administrator, {
        q: "lap(top)+",
        status: "inactive",
        page: 2,
      }),
    ).resolves.toEqual({
      categories: [
        {
          id,
          name: "Electronics",
          description: null,
          isActive: false,
          createdAt: "2026-08-27T01:00:00.000Z",
          updatedAt,
        },
      ],
      page: 2,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    expect(escapeReferenceDataSearch("lap(top)+")).toBe("lap\\(top\\)\\+");
    expect(CategoryModel.aggregate).toHaveBeenCalledWith([
      {
        $match: {
          isActive: false,
          $or: [
            { name: { $regex: "lap\\(top\\)\\+", $options: "i" } },
            {
              description: {
                $regex: "lap\\(top\\)\\+",
                $options: "i",
              },
            },
          ],
        },
      },
      {
        $facet: {
          categories: [
            { $sort: { name: 1, _id: 1 } },
            { $skip: 20 },
            { $limit: 20 },
            {
              $project: {
                _id: 1,
                name: 1,
                description: 1,
                isActive: 1,
                createdAt: 1,
                updatedAt: 1,
              },
            },
          ],
          metadata: [{ $count: "totalItems" }],
        },
      },
    ]);
    expect(aggregateQuery.collation).toHaveBeenCalledWith({
      locale: "en",
      strength: 2,
    });
  });

  it.each([
    ["all", undefined],
    ["active", true],
  ] as const)(
    "applies the %s status filter and bounded page skip",
    async (status, active) => {
      aggregateReturning([{ categories: [], metadata: [] }]);

      await listAdminCategories(administrator, { status, page: 2 });

      const pipeline = vi.mocked(CategoryModel.aggregate).mock.calls.at(-1)?.[0] as
        | Array<Record<string, unknown>>
        | undefined;
      expect(pipeline).toBeDefined();
      const match = pipeline?.[0]?.$match as Record<string, unknown>;
      if (active === undefined) expect(match).not.toHaveProperty("isActive");
      else expect(match).toHaveProperty("isActive", active);
      expect(pipeline?.[1]).toEqual(
        expect.objectContaining({
          $facet: expect.objectContaining({
            categories: expect.arrayContaining([
              { $skip: 20 },
              { $limit: 20 },
            ]),
          }),
        }),
      );
    },
  );

  it("returns a valid empty page", async () => {
    aggregateReturning([{ categories: [], metadata: [] }]);

    await expect(
      listAdminCategories(administrator, { status: "all", page: 1 }),
    ).resolves.toEqual({
      categories: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it("creates a server-controlled active category", async () => {
    vi.mocked(CategoryModel.create).mockResolvedValue({
      toObject: () => row,
    } as never);

    await expect(
      createAdminCategory(administrator, {
        name: "Electronics",
        description: null,
      }),
    ).resolves.toEqual({
      id,
      name: "Electronics",
      description: null,
      isActive: true,
      createdAt: "2026-08-27T01:00:00.000Z",
      updatedAt,
    });
    expect(CategoryModel.create).toHaveBeenCalledWith({
      name: "Electronics",
      description: null,
      isActive: true,
    });
  });

  it("updates approved fields with the exact ID and timestamp", async () => {
    const updateQuery = updateReturning({
      ...row,
      description: "Portable devices",
      isActive: false,
    });

    await expect(
      updateAdminCategory(administrator, id, {
        updatedAt,
        description: "Portable devices",
        isActive: false,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id,
        description: "Portable devices",
        isActive: false,
      }),
    );
    expect(CategoryModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: expect.objectContaining({}),
        updatedAt: new Date(updatedAt),
      },
      {
        $set: {
          description: "Portable devices",
          isActive: false,
        },
      },
      { returnDocument: "after", runValidators: true },
    );
    const filter = vi.mocked(CategoryModel.findOneAndUpdate).mock.calls[0][0] as
      unknown as { _id: { toString(): string } };
    expect(filter._id.toString()).toBe(id);
    expect(updateQuery.lean).toHaveBeenCalledOnce();
  });

  it.each([
    [null, null, "REFERENCE_DATA_NOT_FOUND"],
    [null, { _id: id }, "REFERENCE_DATA_STATE_CONFLICT"],
  ])("classifies a failed atomic update", async (updated, exists, code) => {
    updateReturning(updated);
    vi.mocked(CategoryModel.exists).mockResolvedValue(exists as never);

    await expect(
      updateAdminCategory(administrator, id, {
        updatedAt,
        name: "Devices",
      }),
    ).rejects.toMatchObject({ code });
    expect(CategoryModel.exists).toHaveBeenCalledWith({
      _id: expect.objectContaining({}),
    });
  });

  it("maps duplicate create and update failures without leaking details", async () => {
    vi.mocked(CategoryModel.create).mockRejectedValueOnce({
      code: 11000,
      keyValue: { name: "private stored value" },
    });
    await expect(
      createAdminCategory(administrator, {
        name: "Electronics",
        description: null,
      }),
    ).rejects.toMatchObject({
      code: "REFERENCE_DATA_DUPLICATE",
      message: "Reference data already exists",
    });

    const updateQuery = updateReturning(null);
    updateQuery.exec.mockRejectedValueOnce({
      code: 11000,
      keyValue: { name: "another private value" },
    });
    await expect(
      updateAdminCategory(administrator, id, {
        updatedAt,
        name: "Devices",
      }),
    ).rejects.toMatchObject({
      code: "REFERENCE_DATA_DUPLICATE",
      message: "Reference data already exists",
    });

    vi.mocked(CategoryModel.create).mockRejectedValueOnce(
      new Error("mongodb private detail"),
    );
    await expect(
      createAdminCategory(administrator, {
        name: "Keys",
        description: null,
      }),
    ).rejects.toMatchObject({
      code: "REFERENCE_DATA_OPERATION_FAILED",
      message: "Reference data operation failed",
    });
  });

  it.each([
    [
      "unsafe aggregate output",
      () => {
        aggregateReturning([
          {
            categories: [{ ...row, name: "x", privateValue: "hidden" }],
            metadata: [{ totalItems: 1 }],
          },
        ]);
        return listAdminCategories(administrator, { status: "all", page: 1 });
      },
    ],
    [
      "unsafe create output",
      () => {
        vi.mocked(CategoryModel.create).mockResolvedValue({
          toObject: () => ({ ...row, createdAt: "private invalid timestamp" }),
        } as never);
        return createAdminCategory(administrator, {
          name: "Keys",
          description: null,
        });
      },
    ],
    [
      "unsafe update output",
      () => {
        updateReturning({ ...row, isActive: "private invalid state" });
        return updateAdminCategory(administrator, id, {
          updatedAt,
          isActive: false,
        });
      },
    ],
  ])("maps %s to the closed operation error", async (_label, invoke) => {
    await expect(invoke()).rejects.toMatchObject({
      code: "REFERENCE_DATA_OPERATION_FAILED",
      message: "Reference data operation failed",
    });
  });

  it("maps an authorized model failure to the closed operation error", async () => {
    vi.mocked(CategoryModel.aggregate).mockImplementationOnce(() => {
      throw new Error("mongodb private detail");
    });

    await expect(
      listAdminCategories(administrator, { status: "all", page: 1 }),
    ).rejects.toMatchObject({
      code: "REFERENCE_DATA_OPERATION_FAILED",
      message: "Reference data operation failed",
    });
    expect(connectToDatabase).toHaveBeenCalledOnce();
  });
});
