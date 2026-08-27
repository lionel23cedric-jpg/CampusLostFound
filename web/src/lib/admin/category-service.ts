import { Types, type PipelineStage } from "mongoose";

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { CategoryModel } from "@/models/category";

import { requireReferenceDataAdministrator } from "./reference-data-access";
import {
  ADMIN_REFERENCE_DATA_PAGE_SIZE,
  adminCategoryPageSchema,
  toAdminCategory,
  type AdminCategory,
  type AdminCategoryPage,
  type AdminCategoryRecord,
  type CreateAdminCategoryInput,
  type ReferenceDataListQuery,
  type UpdateAdminCategoryInput,
} from "./reference-data-contract";
import {
  isDuplicateKeyError,
  ReferenceDataManagementError,
} from "./reference-data-errors";

type CategoryFacet = {
  categories: AdminCategoryRecord[];
  metadata: Array<{ totalItems: number }>;
};

export function escapeReferenceDataSearch(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rethrowCategoryError(error: unknown): never {
  if (error instanceof ReferenceDataManagementError) throw error;
  if (isDuplicateKeyError(error)) {
    throw new ReferenceDataManagementError("REFERENCE_DATA_DUPLICATE");
  }
  throw new ReferenceDataManagementError("REFERENCE_DATA_OPERATION_FAILED");
}

export async function listAdminCategories(
  administrator: PublicUser,
  query: ReferenceDataListQuery,
): Promise<AdminCategoryPage> {
  requireReferenceDataAdministrator(administrator);

  try {
    await connectToDatabase();
    const search = query.q ? escapeReferenceDataSearch(query.q) : undefined;
    const match = {
      ...(query.status === "active" ? { isActive: true } : {}),
      ...(query.status === "inactive" ? { isActive: false } : {}),
      ...(search
        ? {
            $or: [
              { name: { $regex: search, $options: "i" } },
              { description: { $regex: search, $options: "i" } },
            ],
          }
        : {}),
    };
    const pipeline: PipelineStage[] = [
      { $match: match },
      {
        $facet: {
          categories: [
            { $sort: { name: 1, _id: 1 } },
            { $skip: (query.page - 1) * ADMIN_REFERENCE_DATA_PAGE_SIZE },
            { $limit: ADMIN_REFERENCE_DATA_PAGE_SIZE },
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
    ];
    const result = (await CategoryModel.aggregate(pipeline)
      .collation({ locale: "en", strength: 2 })
      .exec()) as CategoryFacet[];
    const facet = result[0];
    if (!facet) throw new Error("Category aggregate returned no facet");
    const total = facet.metadata[0]?.totalItems ?? 0;

    return adminCategoryPageSchema.parse({
      categories: facet.categories.map(toAdminCategory),
      page: query.page,
      pageSize: ADMIN_REFERENCE_DATA_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / ADMIN_REFERENCE_DATA_PAGE_SIZE),
    });
  } catch (error) {
    rethrowCategoryError(error);
  }
}

export async function createAdminCategory(
  administrator: PublicUser,
  input: CreateAdminCategoryInput,
): Promise<AdminCategory> {
  requireReferenceDataAdministrator(administrator);

  try {
    await connectToDatabase();
    const created = await CategoryModel.create({
      name: input.name,
      description: input.description,
      isActive: true,
    });
    return toAdminCategory(created.toObject() as AdminCategoryRecord);
  } catch (error) {
    rethrowCategoryError(error);
  }
}

export async function updateAdminCategory(
  administrator: PublicUser,
  categoryId: string,
  input: UpdateAdminCategoryInput,
): Promise<AdminCategory> {
  requireReferenceDataAdministrator(administrator);

  try {
    await connectToDatabase();
    const { updatedAt, ...changes } = input;
    const objectId = new Types.ObjectId(categoryId);
    const updated = await CategoryModel.findOneAndUpdate(
      { _id: objectId, updatedAt: new Date(updatedAt) },
      { $set: changes },
      { new: true, runValidators: true },
    )
      .lean<AdminCategoryRecord | null>()
      .exec();

    if (!updated) {
      const exists = await CategoryModel.exists({ _id: objectId });
      throw new ReferenceDataManagementError(
        exists ? "REFERENCE_DATA_STATE_CONFLICT" : "REFERENCE_DATA_NOT_FOUND",
      );
    }

    return toAdminCategory(updated);
  } catch (error) {
    rethrowCategoryError(error);
  }
}
