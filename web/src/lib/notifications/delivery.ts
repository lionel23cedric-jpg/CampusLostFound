import type { ClientSession } from "mongoose";

import {
  type NotificationKind,
  NotificationModel,
} from "@/models/notification";
import { ProfileModel } from "@/models/profile";
import { UserModel } from "@/models/user";

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

type NotificationPreference =
  | "claimUpdates"
  | "statusChanges"
  | "handoverInstructions";

const preferenceByKind = {
  claim_received: "claimUpdates",
  claim_withdrawn: "claimUpdates",
  claim_approved: "statusChanges",
  claim_rejected: "statusChanges",
  claim_handover_ready: "handoverInstructions",
  claim_completed: "statusChanges",
  report_recovered: "statusChanges",
} as const satisfies Record<NotificationKind, NotificationPreference>;

export type NotificationPlan = {
  kind: NotificationKind;
  recipientId: string;
  reportId: string;
  claimId: string;
};

type UserRow = {
  _id: { toString(): string };
  status: "active" | "suspended" | "deactivated";
};

type ProfileRow = {
  userId: { toString(): string };
  notificationSettings: {
    possibleMatches: boolean;
    claimUpdates: boolean;
    statusChanges: boolean;
    handoverInstructions: boolean;
  };
};

function canonicalId(value: string) {
  if (!OBJECT_ID_PATTERN.test(value)) {
    throw new Error("Notification plan ID is invalid");
  }
  return value.toLowerCase();
}

export function createNotificationPlan(
  input: NotificationPlan,
): NotificationPlan {
  return {
    kind: input.kind,
    recipientId: canonicalId(input.recipientId),
    reportId: canonicalId(input.reportId),
    claimId: canonicalId(input.claimId),
  };
}

export function notificationEventKey(plan: NotificationPlan) {
  return `notification:v1:${plan.kind}:${plan.claimId}:${plan.recipientId}`;
}

export async function deliverNotifications(
  plans: readonly NotificationPlan[],
  session: ClientSession,
) {
  const uniquePlans = new Map<string, NotificationPlan>();
  for (const input of plans) {
    const plan = createNotificationPlan(input);
    uniquePlans.set(notificationEventKey(plan), plan);
  }
  if (uniquePlans.size === 0) return;

  const recipientIds = [
    ...new Set(
      [...uniquePlans.values()].map(({ recipientId }) => recipientId),
    ),
  ];
  const users = await UserModel.find(
    { _id: { $in: recipientIds }, status: "active" },
    { _id: 1, status: 1 },
  )
    .session(session)
    .lean<UserRow[]>()
    .exec();
  const activeIds = new Set(
    users
      .filter(({ status }) => status === "active")
      .map(({ _id }) => _id.toString()),
  );
  if (activeIds.size === 0) return;

  const profiles = await ProfileModel.find(
    { userId: { $in: [...activeIds] } },
    { userId: 1, notificationSettings: 1 },
  )
    .session(session)
    .lean<ProfileRow[]>()
    .exec();
  const profileByUser = new Map(
    profiles.map((profile) => [profile.userId.toString(), profile]),
  );

  const operations = [...uniquePlans.entries()].flatMap(
    ([eventKey, plan]) => {
      const profile = profileByUser.get(plan.recipientId);
      const preference = preferenceByKind[plan.kind];
      if (!profile?.notificationSettings[preference]) return [];
      return [
        {
          updateOne: {
            filter: { eventKey },
            update: {
              $setOnInsert: {
                recipientId: plan.recipientId,
                kind: plan.kind,
                reportId: plan.reportId,
                claimId: plan.claimId,
                eventKey,
                readAt: null,
              },
            },
            upsert: true,
          },
        },
      ];
    },
  );
  if (operations.length === 0) return;

  await NotificationModel.bulkWrite(
    operations as Parameters<typeof NotificationModel.bulkWrite>[0],
    {
      session,
      ordered: true,
    },
  );
}
