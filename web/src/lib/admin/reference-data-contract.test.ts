import { describe, expect, it } from "vitest";

import {
  ADMIN_REFERENCE_DATA_PAGE_SIZE,
  adminCampusLocationPageSchema,
  adminCategoryPageSchema,
  createAdminCampusLocationSchema,
  createAdminCategorySchema,
  referenceDataListQuerySchema,
  referenceDataObjectIdSchema,
  toAdminCampusLocation,
  toAdminCategory,
  toReferenceDataListQueryInput,
  type AdminCategoryRecord,
  updateAdminCampusLocationSchema,
  updateAdminCategorySchema,
} from "./reference-data-contract";

const id = "64b64c6f2f4d9f1a2b3c4d51";
const updatedAt = "2026-08-27T02:00:00.000Z";

describe("administrator reference-data contracts", () => {
  it("normalizes a valid list query", () => {
    const input = toReferenceDataListQueryInput(
      new URLSearchParams("q=%EF%BC%ACibrary++desk&status=inactive&page=2"),
    );

    expect(referenceDataListQuerySchema.parse(input)).toEqual({
      q: "Library desk",
      status: "inactive",
      page: 2,
    });
  });

  it.each([
    "page=01",
    "page=0",
    "page=10001",
    "status=archived",
    "page=1&page=2",
    "unknown=value",
  ])("rejects the list query %s", (query) => {
    expect(
      referenceDataListQuerySchema.safeParse(
        toReferenceDataListQueryInput(new URLSearchParams(query)),
      ).success,
    ).toBe(false);
  });

  it("normalizes blank descriptions and controls active state", () => {
    expect(
      createAdminCategorySchema.parse({
        name: " Electronics ",
        description: " ",
      }),
    ).toEqual({ name: "Electronics", description: null });
    expect(
      createAdminCampusLocationSchema.parse({
        campusName: " Auckland ",
        locationName: " Library ",
      }),
    ).toEqual({
      campusName: "Auckland",
      locationName: "Library",
      description: null,
    });
  });

  it("requires one mutable field and a concurrency timestamp", () => {
    expect(updateAdminCategorySchema.safeParse({ updatedAt }).success).toBe(false);
    expect(updateAdminCategorySchema.parse({ updatedAt, isActive: false })).toEqual({
      updatedAt,
      isActive: false,
    });
    expect(
      updateAdminCampusLocationSchema.parse({
        updatedAt,
        description: " Reception level ",
      }),
    ).toEqual({ updatedAt, description: "Reception level" });
  });

  it("rejects server-owned and unknown fields", () => {
    expect(
      createAdminCategorySchema.safeParse({ name: "Keys", isActive: false })
        .success,
    ).toBe(false);
    expect(
      updateAdminCampusLocationSchema.safeParse({
        updatedAt,
        locationName: "Library",
        administratorId: id,
      }).success,
    ).toBe(false);
  });

  it("canonicalizes ObjectIds and maps allow-listed records", () => {
    expect(referenceDataObjectIdSchema.parse(id.toUpperCase())).toBe(id);
    const record: AdminCategoryRecord & { privateValue: string } = {
      _id: { toString: () => id },
      name: "Electronics",
      description: null,
      isActive: true,
      createdAt: new Date("2026-08-27T01:00:00.000Z"),
      updatedAt: new Date(updatedAt),
      privateValue: "not mapped",
    };

    expect(toAdminCategory(record)).toEqual({
      id,
      name: "Electronics",
      description: null,
      isActive: true,
      createdAt: "2026-08-27T01:00:00.000Z",
      updatedAt,
    });
  });

  it("validates exact page invariants", () => {
    expect(ADMIN_REFERENCE_DATA_PAGE_SIZE).toBe(20);
    const page = {
      categories: [],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    };

    expect(adminCategoryPageSchema.parse(page)).toEqual(page);
    expect(
      adminCampusLocationPageSchema.safeParse({
        campusLocations: [],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 2,
      }).success,
    ).toBe(false);
  });

  it("maps a campus location without unknown fields", () => {
    expect(
      toAdminCampusLocation({
        _id: { toString: () => id },
        campusName: "Auckland",
        locationName: "Library",
        description: null,
        isActive: false,
        createdAt: new Date("2026-08-27T01:00:00.000Z"),
        updatedAt: new Date(updatedAt),
      }),
    ).toEqual({
      id,
      campusName: "Auckland",
      locationName: "Library",
      description: null,
      isActive: false,
      createdAt: "2026-08-27T01:00:00.000Z",
      updatedAt,
    });
  });
});
