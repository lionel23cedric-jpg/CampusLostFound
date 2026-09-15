import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

const INTERNAL_REPORT_IMAGE_PATH = /^\/api\/report-images\/[a-f\d]{24}$/i;

function isCredentialFreeHttpsUrl(value) {
  if (typeof value !== "string" || value.trim() !== value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

export function partitionPhotoReferences(photoUrls) {
  const result = { internal: [], legacy: [], invalid: [] };
  for (const value of photoUrls) {
    if (typeof value === "string" && INTERNAL_REPORT_IMAGE_PATH.test(value)) {
      result.internal.push(value);
    } else if (isCredentialFreeHttpsUrl(value)) {
      result.legacy.push(value);
    } else {
      result.invalid.push(value);
    }
  }
  return result;
}

export async function auditLegacyPhotoUrls(
  collection,
  { apply = false, now = () => new Date(), log = console.log } = {},
) {
  const totals = {
    reports: 0,
    internal: 0,
    legacy: 0,
    invalid: 0,
    updated: 0,
    conflicts: 0,
  };

  const reports = collection.find(
    { "photoUrls.0": { $exists: true } },
    { projection: { photoUrls: 1, updatedAt: 1 } },
  );

  for await (const report of reports) {
    const references = partitionPhotoReferences(
      Array.isArray(report.photoUrls) ? report.photoUrls : [],
    );
    totals.reports += 1;
    totals.internal += references.internal.length;
    totals.legacy += references.legacy.length;
    totals.invalid += references.invalid.length;

    log(
      `Report ${String(report._id)}: ${references.internal.length} internal, ` +
        `${references.legacy.length} legacy, ${references.invalid.length} invalid.`,
    );

    if (!apply || (references.legacy.length === 0 && references.invalid.length === 0)) {
      continue;
    }

    const result = await collection.updateOne(
      { _id: report._id, updatedAt: report.updatedAt },
      { $set: { photoUrls: references.internal, updatedAt: now() } },
    );
    if (result.matchedCount === 0) totals.conflicts += 1;
    else totals.updated += 1;
  }

  return totals;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");
  const apply = process.argv.includes("--apply");

  await mongoose.connect(uri);
  try {
    if (!mongoose.connection.db) throw new Error("MongoDB connection is unavailable");
    console.log(apply ? "Apply mode: removing legacy and invalid references." : "Dry run: no database records will be changed.");
    const totals = await auditLegacyPhotoUrls(
      mongoose.connection.db.collection("itemReports"),
      { apply },
    );
    console.log(
      `Audit complete: ${totals.reports} reports, ${totals.internal} internal, ` +
        `${totals.legacy} legacy, ${totals.invalid} invalid, ` +
        `${totals.updated} updated, ${totals.conflicts} conflicts.`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Image reference audit failed");
    process.exitCode = 1;
  });
}
