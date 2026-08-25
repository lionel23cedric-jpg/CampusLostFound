import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

export const NOTIFICATION_KINDS = [
  "claim_received",
  "claim_withdrawn",
  "claim_approved",
  "claim_rejected",
  "claim_handover_ready",
  "claim_completed",
  "report_recovered",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const notificationSchema = new Schema(
  {
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    kind: {
      type: String,
      enum: NOTIFICATION_KINDS,
      required: true,
    },
    reportId: {
      type: Schema.Types.ObjectId,
      ref: "ItemReport",
      required: true,
    },
    claimId: {
      type: Schema.Types.ObjectId,
      ref: "Claim",
      required: true,
    },
    eventKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    readAt: { type: Date, default: null },
  },
  { collection: "notifications", timestamps: true },
);

notificationSchema.index({ recipientId: 1, createdAt: -1, _id: -1 });
notificationSchema.index({ recipientId: 1, readAt: 1 });
notificationSchema.index({ eventKey: 1 }, { unique: true });

export type Notification = InferSchemaType<typeof notificationSchema>;
export const NotificationModel =
  (models.Notification as Model<Notification> | undefined) ??
  model<Notification>("Notification", notificationSchema);
