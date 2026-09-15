import { describe, expect, it, vi } from "vitest";

import {
  bootstrapReferenceData,
  CAMPUS_LOCATIONS,
  REFERENCE_CATEGORIES,
} from "./bootstrap-reference-data.mjs";

function fakeDatabase() {
  const categoryCollection = { updateOne: vi.fn().mockResolvedValue({}) };
  const locationCollection = { updateOne: vi.fn().mockResolvedValue({}) };
  return {
    database: {
      collection: vi.fn((name: string) =>
        name === "categories" ? categoryCollection : locationCollection,
      ),
    },
    categoryCollection,
    locationCollection,
  };
}

describe("reference-data bootstrap", () => {
  it("defines the stable course reference records", () => {
    expect(REFERENCE_CATEGORIES.map((item) => item.name)).toEqual([
      "Bags",
      "Books and stationery",
      "Clothing",
      "Electronics",
      "Identification",
      "Keys",
      "Other",
    ]);
    expect(CAMPUS_LOCATIONS).toEqual([
      { campusName: "Auckland", locationName: "Library" },
      { campusName: "Auckland", locationName: "Student Central" },
      { campusName: "Manawatū", locationName: "Main Library" },
      { campusName: "Manawatū", locationName: "Student Centre" },
      { campusName: "Wellington", locationName: "Campus reception" },
      { campusName: "Wellington", locationName: "Library" },
    ]);
  });

  it("upserts missing records without overwriting administrator edits", async () => {
    const { database, categoryCollection, locationCollection } = fakeDatabase();
    const now = new Date("2026-09-15T00:00:00.000Z");

    await expect(bootstrapReferenceData(database, now)).resolves.toEqual({
      categories: 7,
      locations: 6,
    });

    expect(categoryCollection.updateOne).toHaveBeenCalledTimes(7);
    expect(locationCollection.updateOne).toHaveBeenCalledTimes(6);

    for (const call of [
      ...categoryCollection.updateOne.mock.calls,
      ...locationCollection.updateOne.mock.calls,
    ]) {
      expect(call[1]).toHaveProperty("$setOnInsert");
      expect(call[1]).not.toHaveProperty("$set");
      expect(call[1].$setOnInsert).toMatchObject({
        description: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      expect(call[2]).toEqual({
        upsert: true,
        collation: { locale: "en", strength: 2 },
      });
    }
  });
});
