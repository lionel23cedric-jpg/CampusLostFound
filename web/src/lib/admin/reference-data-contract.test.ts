import { describe, expect, it } from "vitest";

import {
  ADMIN_REFERENCE_DATA_PAGE_SIZE,
  adminCampusLocationSchema,
  adminCampusLocationPageSchema,
  adminCategorySchema,
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
const category = {
  id,
  name: "Electronics",
  description: null,
  isActive: true,
  createdAt: "2026-08-27T01:00:00.000Z",
  updatedAt,
};
const campusLocation = {
  id,
  campusName: "Auckland",
  locationName: "Library",
  description: null,
  isActive: true,
  createdAt: "2026-08-27T01:00:00.000Z",
  updatedAt,
};

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

  it("applies empty-query defaults", () => {
    expect(
      referenceDataListQuerySchema.parse(
        toReferenceDataListQueryInput(new URLSearchParams()),
      ),
    ).toEqual({ status: "all", page: 1 });
  });

  it("omits a blank normalized search", () => {
    expect(
      referenceDataListQuerySchema.parse(
        toReferenceDataListQueryInput(new URLSearchParams("q=+++")),
      ),
    ).toEqual({ status: "all", page: 1 });
  });

  it.each([
    "page=01",
    "page=0",
    "page=10001",
    "status=archived",
    "q=one&q=two",
    "status=all&status=active",
    "page=1&page=2",
    `q=${"a".repeat(81)}`,
    "q=library%00desk",
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

  it.each([
    ["category", updateAdminCategorySchema, { name: "Keys" }],
    [
      "campus location",
      updateAdminCampusLocationSchema,
      { locationName: "Library" },
    ],
  ])("rejects a %s change without updatedAt", (_name, schema, input) => {
    expect(schema.safeParse(input).success).toBe(false);
  });

  it.each(["", "not-an-object-id", id.slice(1), `${id}0`])(
    "rejects the malformed ObjectId %j",
    (value) => {
      expect(referenceDataObjectIdSchema.safeParse(value).success).toBe(false);
    },
  );

  it.each(["not-a-date", "2026-08-27", "2026-13-27T02:00:00.000Z"])(
    "rejects the malformed timestamp %s",
    (value) => {
      expect(
        updateAdminCategorySchema.safeParse({ updatedAt: value, name: "Keys" })
          .success,
      ).toBe(false);
      expect(
        updateAdminCampusLocationSchema.safeParse({
          updatedAt: value,
          locationName: "Library",
        }).success,
      ).toBe(false);
    },
  );

  it.each([
    ["category name minimum", createAdminCategorySchema, { name: "ab" }, true],
    [
      "category name maximum",
      createAdminCategorySchema,
      { name: "a".repeat(80) },
      true,
    ],
    ["category name below minimum", createAdminCategorySchema, { name: "a" }, false],
    [
      "category name above maximum",
      createAdminCategorySchema,
      { name: "a".repeat(81) },
      false,
    ],
    [
      "campus name minimum",
      createAdminCampusLocationSchema,
      { campusName: "ab", locationName: "Library" },
      true,
    ],
    [
      "campus name maximum",
      createAdminCampusLocationSchema,
      { campusName: "a".repeat(80), locationName: "Library" },
      true,
    ],
    [
      "campus name below minimum",
      createAdminCampusLocationSchema,
      { campusName: "a", locationName: "Library" },
      false,
    ],
    [
      "campus name above maximum",
      createAdminCampusLocationSchema,
      { campusName: "a".repeat(81), locationName: "Library" },
      false,
    ],
    [
      "location name minimum",
      createAdminCampusLocationSchema,
      { campusName: "Auckland", locationName: "ab" },
      true,
    ],
    [
      "location name maximum",
      createAdminCampusLocationSchema,
      { campusName: "Auckland", locationName: "a".repeat(120) },
      true,
    ],
    [
      "location name below minimum",
      createAdminCampusLocationSchema,
      { campusName: "Auckland", locationName: "a" },
      false,
    ],
    [
      "location name above maximum",
      createAdminCampusLocationSchema,
      { campusName: "Auckland", locationName: "a".repeat(121) },
      false,
    ],
    [
      "category description maximum",
      createAdminCategorySchema,
      { name: "Keys", description: "a".repeat(300) },
      true,
    ],
    [
      "category description above maximum",
      createAdminCategorySchema,
      { name: "Keys", description: "a".repeat(301) },
      false,
    ],
    [
      "campus location description maximum",
      createAdminCampusLocationSchema,
      {
        campusName: "Auckland",
        locationName: "Library",
        description: "a".repeat(300),
      },
      true,
    ],
    [
      "campus location description above maximum",
      createAdminCampusLocationSchema,
      {
        campusName: "Auckland",
        locationName: "Library",
        description: "a".repeat(301),
      },
      false,
    ],
  ])("enforces the %s boundary", (_name, schema, input, expected) => {
    expect(schema.safeParse(input).success).toBe(expected);
  });

  it.each([
    ["category create", createAdminCategorySchema, { name: "Keys", isActive: false }],
    [
      "category update",
      updateAdminCategorySchema,
      { updatedAt, name: "Keys", administratorId: id },
    ],
    [
      "campus location create",
      createAdminCampusLocationSchema,
      { campusName: "Auckland", locationName: "Library", isActive: false },
    ],
    [
      "campus location update",
      updateAdminCampusLocationSchema,
      { updatedAt, locationName: "Library", administratorId: id },
    ],
  ])("rejects server-owned or unknown fields from %s", (_name, schema, input) => {
    expect(schema.safeParse(input).success).toBe(false);
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

  it("rejects unknown fields from public records and page envelopes", () => {
    expect(
      adminCategorySchema.safeParse({ ...category, privateValue: "hidden" }).success,
    ).toBe(false);
    expect(
      adminCampusLocationSchema.safeParse({
        ...campusLocation,
        privateValue: "hidden",
      }).success,
    ).toBe(false);
    expect(
      adminCategoryPageSchema.safeParse({
        categories: [category],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
        privateValue: "hidden",
      }).success,
    ).toBe(false);
    expect(
      adminCampusLocationPageSchema.safeParse({
        campusLocations: [campusLocation],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
        privateValue: "hidden",
      }).success,
    ).toBe(false);
  });

  it("rejects malformed timestamps from public records", () => {
    expect(
      adminCategorySchema.safeParse({ ...category, createdAt: "not-a-date" })
        .success,
    ).toBe(false);
    expect(
      adminCampusLocationSchema.safeParse({
        ...campusLocation,
        updatedAt: "not-a-date",
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
