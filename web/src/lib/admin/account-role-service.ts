import { Types, type ClientSession } from "mongoose";

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { AccountRoleChangeEventModel } from "@/models/account-role-change-event";
import { ProfileModel } from "@/models/profile";
import { SessionModel } from "@/models/session";
import { UserModel } from "@/models/user";

import { requireAccountAdministrator } from "./account-access";
import {
  toManagedAccount,
  type AccountRoleInput,
  type ManagedAccount,
  type ManagedAccountProfileRecord,
  type ManagedAccountUserRecord,
} from "./account-contract";
import { AccountManagementError } from "./account-errors";

type CurrentAccountRecord = {
  role: "student" | "staff" | "administrator";
  status: "active" | "suspended" | "deactivated";
  updatedAt: Date;
};

export async function updateManagedAccountRole(
  administrator: PublicUser,
  targetUserId: string,
  input: AccountRoleInput,
): Promise<ManagedAccount> {
  requireAccountAdministrator(administrator);
  if (administrator.id === targetUserId) {
    throw new AccountManagementError("ACCOUNT_ACTION_FORBIDDEN");
  }

  let transaction: ClientSession | null = null;
  let result: ManagedAccount | undefined;
  let failure: unknown;

  try {
    const database = await connectToDatabase();
    transaction = await database.startSession();
    const actorId = new Types.ObjectId(administrator.id);
    const targetId = new Types.ObjectId(targetUserId);

    await transaction.withTransaction(async () => {
      const actor = await UserModel.findOne({
        _id: actorId,
        role: "administrator",
        status: "active",
      })
        .select({ _id: 1 })
        .session(transaction!)
        .lean<{ _id: unknown } | null>()
        .exec();
      if (!actor) throw new AccountManagementError("ADMINISTRATOR_REQUIRED");

      const current = await UserModel.findById(targetId)
        .select({ _id: 1, role: 1, status: 1, updatedAt: 1 })
        .session(transaction!)
        .lean<CurrentAccountRecord | null>()
        .exec();
      if (!current) throw new AccountManagementError("ACCOUNT_NOT_FOUND");
      if (current.role === "administrator") {
        throw new AccountManagementError("ACCOUNT_ACTION_FORBIDDEN");
      }
      if (current.role !== "student" && current.role !== "staff") {
        throw new AccountManagementError("ACCOUNT_NOT_FOUND");
      }
      if (
        current.status === "deactivated" ||
        current.role === input.role ||
        current.updatedAt.toISOString() !== input.expectedUpdatedAt
      ) {
        throw new AccountManagementError("ACCOUNT_STATE_CONFLICT");
      }

      const updated = await UserModel.findOneAndUpdate(
        {
          _id: targetId,
          role: current.role,
          status: current.status,
          updatedAt: new Date(input.expectedUpdatedAt),
        },
        { $set: { role: input.role } },
        { returnDocument: "after", runValidators: true, session: transaction! },
      )
        .select({
          _id: 1,
          email: 1,
          role: 1,
          status: 1,
          createdAt: 1,
          lastLoginAt: 1,
          updatedAt: 1,
        })
        .lean<ManagedAccountUserRecord | null>()
        .exec();
      if (!updated) throw new AccountManagementError("ACCOUNT_STATE_CONFLICT");

      await SessionModel.deleteMany({ userId: targetId }, { session: transaction! });
      await AccountRoleChangeEventModel.create(
        [{
          actorAdministratorId: actorId,
          targetUserId: targetId,
          previousRole: current.role,
          newRole: input.role,
        }],
        { session: transaction! },
      );
      const profile = await ProfileModel.findOne(
        { userId: targetId },
        { _id: 0, displayName: 1 },
      )
        .session(transaction!)
        .lean<ManagedAccountProfileRecord | null>()
        .exec();
      if (!profile) throw new Error("Managed account profile is incomplete");
      result = toManagedAccount(updated, profile);
    });
  } catch (error) {
    failure = error;
  }

  if (transaction) {
    try {
      await transaction.endSession();
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) {
    if (failure instanceof AccountManagementError) throw failure;
    throw new AccountManagementError("ACCOUNT_OPERATION_FAILED");
  }
  if (!result) throw new AccountManagementError("ACCOUNT_OPERATION_FAILED");
  return result;
}
