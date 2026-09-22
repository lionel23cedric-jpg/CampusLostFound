import { Types, type PipelineStage } from "mongoose";

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { CampusLocationModel } from "@/models/campus-location";

import { requireReferenceDataAdministrator } from "./reference-data-access";
import {
  ADMIN_REFERENCE_DATA_PAGE_SIZE,
  adminCampusLocationPageSchema,
  toAdminCampusLocation,
  type AdminCampusLocation,
  type AdminCampusLocationPage,
  type AdminCampusLocationRecord,
  type CreateAdminCampusLocationInput,
  type ReferenceDataListQuery,
  type UpdateAdminCampusLocationInput,
} from "./reference-data-contract";
import {
  isDuplicateKeyError,
  ReferenceDataManagementError,
} from "./reference-data-errors";

type CampusLocationFacet = {
  campusLocations: AdminCampusLocationRecord[];
  metadata: Array<{ totalItems: number }>;
};

export function escapeCampusLocationSearch(value: string) {
  // Treat administrator search text as literal text, not executable regex syntax.
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rethrowCampusLocationError(error: unknown): never {
  if (error instanceof ReferenceDataManagementError) throw error;
  if (isDuplicateKeyError(error)) {
    // The public error explains the conflict without exposing database internals.
    throw new ReferenceDataManagementError("REFERENCE_DATA_DUPLICATE");
  }
  throw new ReferenceDataManagementError("REFERENCE_DATA_OPERATION_FAILED");
}

export async function listAdminCampusLocations(
  administrator: PublicUser,
  query: ReferenceDataListQuery,
): Promise<AdminCampusLocationPage> {
  requireReferenceDataAdministrator(administrator);

  try {
    await connectToDatabase();
    const search = query.q ? escapeCampusLocationSearch(query.q) : undefined;
    const match = {
      ...(query.status === "active" ? { isActive: true } : {}),
      ...(query.status === "inactive" ? { isActive: false } : {}),
      ...(search
        ? {
            $or: [
              { campusName: { $regex: search, $options: "i" } },
              { locationName: { $regex: search, $options: "i" } },
              { description: { $regex: search, $options: "i" } },
            ],
          }
        : {}),
    };
    const pipeline: PipelineStage[] = [
      { $match: match },
      {
        // The data page and total count share one filter and one aggregate result.
        $facet: {
          campusLocations: [
            { $sort: { campusName: 1, locationName: 1, _id: 1 } },
            { $skip: (query.page - 1) * ADMIN_REFERENCE_DATA_PAGE_SIZE },
            { $limit: ADMIN_REFERENCE_DATA_PAGE_SIZE },
            {
              $project: {
                _id: 1,
                campusName: 1,
                locationName: 1,
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
    ];
    const result = (await CampusLocationModel.aggregate(pipeline)
      .collation({ locale: "en", strength: 2 })
      .exec()) as CampusLocationFacet[];
    const facet = result[0];
    if (!facet) throw new Error("CampusLocation aggregate returned no facet");
    const total = facet.metadata[0]?.totalItems ?? 0;

    return adminCampusLocationPageSchema.parse({
      campusLocations: facet.campusLocations.map(toAdminCampusLocation),
      page: query.page,
      pageSize: ADMIN_REFERENCE_DATA_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / ADMIN_REFERENCE_DATA_PAGE_SIZE),
    });
  } catch (error) {
    rethrowCampusLocationError(error);
  }
}

export async function createAdminCampusLocation(
  administrator: PublicUser,
  input: CreateAdminCampusLocationInput,
): Promise<AdminCampusLocation> {
  requireReferenceDataAdministrator(administrator);

  try {
    await connectToDatabase();
    const created = await CampusLocationModel.create({
      campusName: input.campusName,
      locationName: input.locationName,
      description: input.description,
      isActive: true,
    });
    return toAdminCampusLocation(
      created.toObject() as AdminCampusLocationRecord,
    );
  } catch (error) {
    rethrowCampusLocationError(error);
  }
}

export async function updateAdminCampusLocation(
  administrator: PublicUser,
  campusLocationId: string,
  input: UpdateAdminCampusLocationInput,
): Promise<AdminCampusLocation> {
  requireReferenceDataAdministrator(administrator);

  try {
    await connectToDatabase();
    const { updatedAt, ...changes } = input;
    const objectId = new Types.ObjectId(campusLocationId);
    const updated = await CampusLocationModel.findOneAndUpdate(
      // The timestamp prevents one administrator from overwriting a newer edit.
      { _id: objectId, updatedAt: new Date(updatedAt) },
      { $set: changes },
      { returnDocument: "after", runValidators: true },
    )
      .lean<AdminCampusLocationRecord | null>()
      .exec();

    if (!updated) {
      // Distinguish stale data (409) from a genuinely missing record (404).
      const exists = await CampusLocationModel.exists({ _id: objectId });
      throw new ReferenceDataManagementError(
        exists ? "REFERENCE_DATA_STATE_CONFLICT" : "REFERENCE_DATA_NOT_FOUND",
      );
    }

    return toAdminCampusLocation(updated);
  } catch (error) {
    rethrowCampusLocationError(error);
  }
}
