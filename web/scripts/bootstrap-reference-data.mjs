import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

export const REFERENCE_CATEGORIES = [
  { name: "Bags" },
  { name: "Books and stationery" },
  { name: "Clothing" },
  { name: "Electronics" },
  { name: "Identification" },
  { name: "Keys" },
  { name: "Other" },
];

export const CAMPUS_LOCATIONS = [
  { campusName: "Auckland", locationName: "Library" },
  { campusName: "Auckland", locationName: "Student Central" },
  { campusName: "Manawatū", locationName: "Main Library" },
  { campusName: "Manawatū", locationName: "Student Centre" },
  { campusName: "Wellington", locationName: "Campus reception" },
  { campusName: "Wellington", locationName: "Library" },
];

const CASE_INSENSITIVE_ENGLISH = { locale: "en", strength: 2 };

export async function bootstrapReferenceData(database, now = new Date()) {
  const categories = database.collection("categories");
  const campusLocations = database.collection("campusLocations");

  await Promise.all(
    REFERENCE_CATEGORIES.map(({ name }) =>
      categories.updateOne(
        { name },
        {
          $setOnInsert: {
            name,
            description: null,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true, collation: CASE_INSENSITIVE_ENGLISH },
      ),
    ),
  );

  await Promise.all(
    CAMPUS_LOCATIONS.map(({ campusName, locationName }) =>
      campusLocations.updateOne(
        { campusName, locationName },
        {
          $setOnInsert: {
            campusName,
            locationName,
            description: null,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true, collation: CASE_INSENSITIVE_ENGLISH },
      ),
    ),
  );

  return {
    categories: REFERENCE_CATEGORIES.length,
    locations: CAMPUS_LOCATIONS.length,
  };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");

  await mongoose.connect(uri);
  try {
    if (!mongoose.connection.db) throw new Error("MongoDB connection is unavailable");
    const result = await bootstrapReferenceData(mongoose.connection.db);
    console.log(
      `Reference data ready: ${result.categories} categories, ${result.locations} locations.`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Reference data setup failed");
    process.exitCode = 1;
  });
}
