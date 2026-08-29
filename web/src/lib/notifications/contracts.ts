import { z } from "zod";

import {
  NOTIFICATION_KINDS,
  type NotificationKind,
} from "@/models/notification";

type Identifier = { toString(): string };

export type NotificationRecord = {
  _id: Identifier;
  kind: NotificationKind;
  reportId: Identifier;
  claimId: Identifier | null;
  readAt: Date | null;
  createdAt: Date;
};

const content = {
  possible_match: {
    title: "Possible item match",
    summary: "A new opposite-type report may match one of your open reports.",
    label: "View report",
    target: "report",
  },
  claim_received: {
    title: "New claim received",
    summary: "A claim was submitted for one of your reports.",
    label: "View report",
    target: "report",
  },
  claim_withdrawn: {
    title: "Claim withdrawn",
    summary: "A claim on one of your reports was withdrawn.",
    label: "View report",
    target: "report",
  },
  claim_approved: {
    title: "Claim approved",
    summary: "Campus staff approved your claim.",
    label: "View claim",
    target: "claim",
  },
  claim_rejected: {
    title: "Claim not approved",
    summary: "Campus staff did not approve your claim.",
    label: "View claim",
    target: "claim",
  },
  claim_handover_ready: {
    title: "Recovery handover ready",
    summary: "Review your approved claim before arranging recovery with campus staff.",
    label: "View claim",
    target: "claim",
  },
  claim_completed: {
    title: "Recovery completed",
    summary: "Campus staff marked your recovery as completed.",
    label: "View claim",
    target: "claim",
  },
  report_recovered: {
    title: "Report resolved",
    summary: "Recovery for one of your reports was completed.",
    label: "View report",
    target: "report",
  },
} as const satisfies Record<
  NotificationKind,
  {
    title: string;
    summary: string;
    label: string;
    target: "claim" | "report";
  }
>;

export const publicNotificationSchema = z
  .strictObject({
    id: z.string().regex(/^[a-f\d]{24}$/),
    kind: z.enum(NOTIFICATION_KINDS),
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(240),
    action: z.strictObject({
      label: z.string().min(1).max(40),
      href: z.string().regex(/^\/(claims|reports)\/[a-f\d]{24}$/),
    }),
    createdAt: z.string().datetime({ offset: true }),
    readAt: z.string().datetime({ offset: true }).nullable(),
    isRead: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.isRead !== (value.readAt !== null)) {
      context.addIssue({
        code: "custom",
        path: ["isRead"],
        message: "Read state is inconsistent",
      });
    }
  });

export const notificationPageSchema = z.strictObject({
  notifications: z.array(publicNotificationSchema).max(50),
  pagination: z.strictObject({
    nextCursor: z.string().min(1).max(512).nullable(),
    hasMore: z.boolean(),
  }),
  unreadCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

export type PublicNotification = z.infer<typeof publicNotificationSchema>;
export type NotificationPage = z.infer<typeof notificationPageSchema>;

export function toPublicNotification(
  record: NotificationRecord,
): PublicNotification {
  const copy = content[record.kind];
  if (copy.target === "claim" && record.claimId === null) {
    throw new Error("Claim notification is missing a claim ID");
  }
  const targetId =
    copy.target === "report"
      ? record.reportId.toString()
      : record.claimId!.toString();
  const readAt = record.readAt?.toISOString() ?? null;

  return publicNotificationSchema.parse({
    id: record._id.toString(),
    kind: record.kind,
    title: copy.title,
    summary: copy.summary,
    action: {
      label: copy.label,
      href: `/${copy.target}s/${targetId}`,
    },
    createdAt: record.createdAt.toISOString(),
    readAt,
    isRead: readAt !== null,
  });
}
