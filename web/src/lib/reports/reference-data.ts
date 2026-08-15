import { connectToDatabase } from "@/lib/db";
import { CampusLocationModel } from "@/models/campus-location";
import { CategoryModel } from "@/models/category";

type Identifier = { toString(): string };

type CategoryRow = {
  _id: Identifier;
  name: string;
  description?: string | null;
};

type CampusLocationRow = {
  _id: Identifier;
  campusName: string;
  locationName: string;
  description?: string | null;
};

export async function listActiveCategories() {
  await connectToDatabase();
  const rows = await CategoryModel.find({ isActive: true })
    .select({ _id: 1, name: 1, description: 1 })
    .sort({ name: 1 })
    .lean<CategoryRow[]>();

  return rows.map((row) => ({
    id: row._id.toString(),
    name: row.name,
    description: row.description ?? null,
  }));
}

export async function listActiveCampusLocations() {
  await connectToDatabase();
  const rows = await CampusLocationModel.find({ isActive: true })
    .select({ _id: 1, campusName: 1, locationName: 1, description: 1 })
    .sort({ campusName: 1, locationName: 1 })
    .lean<CampusLocationRow[]>();

  return rows.map((row) => ({
    id: row._id.toString(),
    campusName: row.campusName,
    locationName: row.locationName,
    description: row.description ?? null,
  }));
}

export type CategoryOption = Awaited<
  ReturnType<typeof listActiveCategories>
>[number];
export type CampusLocationOption = Awaited<
  ReturnType<typeof listActiveCampusLocations>
>[number];
