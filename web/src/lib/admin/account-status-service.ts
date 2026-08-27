import { Types, type ClientSession } from "mongoose";

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { AccountAdministrationEventModel } from "@/models/account-administration-event";
import { ProfileModel } from "@/models/profile";
import { SessionModel } from "@/models/session";
import { UserModel } from "@/models/user";

import { requireAccountAdministrator } from "./account-access";
import {
  toManagedAccount,
  type AccountStatusInput,
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

export function accountTransitionIsAllowed(
  previousStatus: string,
  nextStatus: string,
  reason: string,
) {
  if (previousStatus === "active" && nextStatus === "suspended") {
    return [
      "security_concern",
      "policy_violation",
      "administrative_review",
    ].includes(reason);
  }
  if (previousStatus === "suspended" && nextStatus === "active") {
    return reason === "account_restored";
  }
  return (
    (previousStatus === "active" || previousStatus === "suspended") &&
    nextStatus === "deactivated" &&
    reason === "account_closed"
  );
}

function rethrowSafeAccountError(error: unknown): never {
  if (error instanceof AccountManagementError) throw error;
  throw new AccountManagementError("ACCOUNT_OPERATION_FAILED");
}

export async function updateManagedAccountStatus(
  administrator: PublicUser,
  targetUserId: string,
  input: AccountStatusInput,
): Promise<ManagedAccount> {
  requireAccountAdministrator(administrator);
  if (administrator.id === targetUserId) {
    throw new AccountManagementError("ACCOUNT_ACTION_FORBIDDEN");
  }

  let result: ManagedAccount | undefined;
  let transaction: ClientSession | null = null;
  let failure: unknown;
  let failed = false;

  try {
    const database = await connectToDatabase();
    const activeTransaction = await database.startSession();
    transaction = activeTransaction;
    const actorObjectId = new Types.ObjectId(administrator.id);
    const targetObjectId = new Types.ObjectId(targetUserId);

    await activeTransaction.withTransaction(async () => {
      const actor = await UserModel.findOne({
        _id: actorObjectId,
        role: "administrator",
        status: "active",
      })
        .select({ _id: 1 })
        .session(activeTransaction)
        .lean<{ _id: unknown } | null>()
        .exec();
      if (!actor) {
        throw new AccountManagementError("ADMINISTRATOR_REQUIRED");
      }

      const current = await UserModel.findById(targetObjectId)
        .select({ _id: 1, role: 1, status: 1, updatedAt: 1 })
        .session(activeTransaction)
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
        (current.status !== "active" && current.status !== "suspended") ||
        current.updatedAt.toISOString() !== input.expectedUpdatedAt ||
        !accountTransitionIsAllowed(current.status, input.status, input.reason)
      ) {
        throw new AccountManagementError("ACCOUNT_STATE_CONFLICT");
      }

      const updated = await UserModel.findOneAndUpdate(
        {
          _id: targetObjectId,
          role: { $in: ["student", "staff"] },
          status: current.status,
          updatedAt: new Date(input.expectedUpdatedAt),
        },
        { $set: { status: input.status } },
        { new: true, runValidators: true, session: activeTransaction },
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
      if (!updated) {
        throw new AccountManagementError("ACCOUNT_STATE_CONFLICT");
      }

      await SessionModel.deleteMany(
        { userId: targetObjectId },
        { session: activeTransaction },
      );
      await AccountAdministrationEventModel.create(
        [
          {
            actorAdministratorId: actorObjectId,
            targetUserId: targetObjectId,
            previousStatus: current.status,
            newStatus: input.status,
            reason: input.reason,
          },
        ],
        { session: activeTransaction },
      );

      const profile = await ProfileModel.findOne(
        { userId: targetObjectId },
        { _id: 0, displayName: 1 },
      )
        .session(activeTransaction)
        .lean<ManagedAccountProfileRecord | null>()
        .exec();
      if (!profile) throw new Error("Managed account profile is incomplete");

      result = toManagedAccount(updated, profile);
    });
  } catch (error) {
    failure = error;
    failed = true;
  }

  if (transaction) {
    try {
      await transaction.endSession();
    } catch (error) {
      if (!failed) {
        failure = error;
        failed = true;
      }
    }
  }

  if (failed) rethrowSafeAccountError(failure);
  if (!result) throw new AccountManagementError("ACCOUNT_OPERATION_FAILED");
  return result;
}
