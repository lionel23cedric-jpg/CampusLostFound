import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/category", () => ({
  CategoryModel: { find: vi.fn() },
}));
vi.mock("@/models/campus-location", () => ({
  CampusLocationModel: { find: vi.fn() },
}));

import { connectToDatabase } from "@/lib/db";
import { CampusLocationModel } from "@/models/campus-location";
import { CategoryModel } from "@/models/category";

import {
  listActiveCampusLocations,
  listActiveCategories,
} from "./reference-data";

function queryReturning(rows: unknown[]) {
  const query = {
    select: vi.fn(),
    sort: vi.fn(),
    lean: vi.fn().mockResolvedValue(rows),
  };
  query.select.mockReturnValue(query);
  query.sort.mockReturnValue(query);
  return query;
}

describe("report reference data", () => {
  beforeEach(() => {
    vi.mocked(connectToDatabase).mockResolvedValue({} as never);
  });

  it("returns only active categories with allow-listed fields", async () => {
    const query = queryReturning([
      {
        _id: { toString: () => "category-id" },
        name: "Electronics",
        description: null,
        isActive: true,
        internalValue: "must not leak",
      },
    ]);
    vi.mocked(CategoryModel.find).mockReturnValue(query as never);

    await expect(listActiveCategories()).resolves.toEqual([
      { id: "category-id", name: "Electronics", description: null },
    ]);

    expect(CategoryModel.find).toHaveBeenCalledWith({ isActive: true });
    expect(connectToDatabase).toHaveBeenCalledOnce();
    expect(query.select).toHaveBeenCalledWith({
      _id: 1,
      name: 1,
      description: 1,
    });
    expect(query.sort).toHaveBeenCalledWith({ name: 1 });
    expect(query.lean).toHaveBeenCalledOnce();
  });

  it("returns active campus locations in stable campus/name order", async () => {
    const query = queryReturning([
      {
        _id: { toString: () => "location-id" },
        campusName: "Auckland",
        locationName: "Library",
        isActive: true,
      },
    ]);
    vi.mocked(CampusLocationModel.find).mockReturnValue(query as never);

    await expect(listActiveCampusLocations()).resolves.toEqual([
      {
        id: "location-id",
        campusName: "Auckland",
        locationName: "Library",
        description: null,
      },
    ]);

    expect(CampusLocationModel.find).toHaveBeenCalledWith({ isActive: true });
    expect(connectToDatabase).toHaveBeenCalledOnce();
    expect(query.select).toHaveBeenCalledWith({
      _id: 1,
      campusName: 1,
      locationName: 1,
      description: 1,
    });
    expect(query.sort).toHaveBeenCalledWith({
      campusName: 1,
      locationName: 1,
    });
    expect(query.lean).toHaveBeenCalledOnce();
  });
});
