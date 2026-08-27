import type { PipelineStage } from "mongoose";

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { UserModel } from "@/models/user";

import { requireAccountAdministrator } from "./account-access";
import {
  ADMIN_ACCOUNT_PAGE_SIZE,
  MANAGEABLE_ACCOUNT_ROLES,
  parseManagedAccountPage,
  type AccountListQuery,
  type ManagedAccountPage,
} from "./account-contract";
import { AccountManagementError } from "./account-errors";

export function escapeAccountSearch(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function listManagedAccounts(
  user: PublicUser,
  query: AccountListQuery,
): Promise<ManagedAccountPage> {
  requireAccountAdministrator(user);

  try {
    await connectToDatabase();
    const search = query.q ? escapeAccountSearch(query.q) : undefined;
    const pipeline: PipelineStage[] = [
      {
        $match: {
          role: {
            $in: query.role ? [query.role] : [...MANAGEABLE_ACCOUNT_ROLES],
          },
          ...(query.status ? { status: query.status } : {}),
        },
      },
      {
        $lookup: {
          from: "profiles",
          localField: "_id",
          foreignField: "userId",
          as: "profile",
        },
      },
      { $unwind: "$profile" },
      ...(search
        ? [
            {
              $match: {
                $or: [
                  { email: { $regex: search, $options: "i" } },
                  {
                    "profile.displayName": {
                      $regex: search,
                      $options: "i",
                    },
                  },
                ],
              },
            } as PipelineStage,
          ]
        : []),
      {
        $facet: {
          accounts: [
            { $sort: { createdAt: -1, _id: -1 } },
            { $skip: (query.page - 1) * ADMIN_ACCOUNT_PAGE_SIZE },
            { $limit: ADMIN_ACCOUNT_PAGE_SIZE },
            {
              $project: {
                _id: 1,
                email: 1,
                displayName: "$profile.displayName",
                role: 1,
                status: 1,
                createdAt: 1,
                lastLoginAt: 1,
                updatedAt: 1,
              },
            },
          ],
          metadata: [{ $count: "totalItems" }],
        },
      },
    ];

    return parseManagedAccountPage(
      await UserModel.aggregate(pipeline).exec(),
      query,
    );
  } catch (error) {
    if (error instanceof AccountManagementError) throw error;
    throw new AccountManagementError("ACCOUNT_OPERATION_FAILED");
  }
}
