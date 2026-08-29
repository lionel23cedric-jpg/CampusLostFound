import type { QueryFilter } from "mongoose";

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import {
  type Notification,
  NotificationModel,
} from "@/models/notification";

import {
  notificationPageSchema,
  toPublicNotification,
  type NotificationPage,
  type NotificationRecord,
  type PublicNotification,
} from "./contracts";
import { NotificationError } from "./errors";
import {
  encodeNotificationCursor,
  type NotificationListQuery,
} from "./validation";

export function requireNotificationUser(user: PublicUser) {
  if (user.status !== "active") {
    throw new NotificationError("NOTIFICATION_FORBIDDEN");
  }
}

export async function listNotifications(
  user: PublicUser,
  query: NotificationListQuery,
): Promise<NotificationPage> {
  requireNotificationUser(user);
  await connectToDatabase();

  const filter: QueryFilter<Notification> = {
    recipientId: user.id,
    ...(query.cursor
      ? {
          $or: [
            { createdAt: { $lt: query.cursor.createdAt } },
            {
              createdAt: query.cursor.createdAt,
              _id: { $lt: query.cursor.id },
            },
          ],
        }
      : {}),
  };
  const rowsQuery = NotificationModel.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(query.pageSize + 1)
    .lean<NotificationRecord[]>();

  const [rows, unreadCount] = await Promise.all([
    rowsQuery.exec(),
    NotificationModel.countDocuments({
      recipientId: user.id,
      readAt: null,
    }).exec(),
  ]);

  const hasMore = rows.length > query.pageSize;
  const visible = rows.slice(0, query.pageSize);
  const last = visible.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeNotificationCursor({
          createdAt: last.createdAt,
          id: last._id.toString(),
        })
      : null;

  return notificationPageSchema.parse({
    notifications: visible.map(toPublicNotification),
    pagination: { nextCursor, hasMore },
    unreadCount,
  });
}

export async function markNotificationRead(
  user: PublicUser,
  notificationId: string,
): Promise<PublicNotification> {
  requireNotificationUser(user);
  await connectToDatabase();

  const updated = await NotificationModel.findOneAndUpdate(
    { _id: notificationId, recipientId: user.id },
    [
      {
        $set: {
          readAt: { $ifNull: ["$readAt", new Date()] },
        },
      },
    ],
    { returnDocument: "after", updatePipeline: true },
  )
    .lean<NotificationRecord | null>()
    .exec();

  if (!updated) {
    throw new NotificationError("NOTIFICATION_NOT_FOUND");
  }
  return toPublicNotification(updated);
}
