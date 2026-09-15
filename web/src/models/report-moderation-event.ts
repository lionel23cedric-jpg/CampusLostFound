import mongoose, { type InferSchemaType, type Model } from "mongoose";

import { REPORT_MODERATION_STATUSES } from "./item-report";
import { REPORT_FLAG_REASONS } from "./report-flag";

const { Schema, model, models } = mongoose;

export const REPORT_MODERATION_ACTIONS = [
  "flag_dismissed",
  "report_hidden",
  "report_restored",
] as const;
export const DIRECT_REPORT_HIDE_REASONS = [
  "inappropriate_content",
  "suspected_fraud",
  "privacy_concern",
  "duplicate_report",
  "administrative_review",
] as const;
export const REPORT_MODERATION_EVENT_REASONS = [
  ...REPORT_FLAG_REASONS,
  "administrative_review",
  "flag_dismissed",
  "moderation_reversed",
] as const;

export type ReportModerationAction =
  (typeof REPORT_MODERATION_ACTIONS)[number];
export type DirectReportHideReason =
  (typeof DIRECT_REPORT_HIDE_REASONS)[number];
export type ReportModerationEventReason =
  (typeof REPORT_MODERATION_EVENT_REASONS)[number];

export const reportModerationEventSchema = new Schema(
  {
    actorAdministratorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
      select: false,
    },
    reportId: {
      type: Schema.Types.ObjectId,
      ref: "ItemReport",
      required: true,
      immutable: true,
    },
    sourceFlagId: {
      type: Schema.Types.ObjectId,
      ref: "ReportFlag",
      default: null,
      immutable: true,
    },
    action: {
      type: String,
      enum: REPORT_MODERATION_ACTIONS,
      required: true,
      immutable: true,
    },
    reason: {
      type: String,
      enum: REPORT_MODERATION_EVENT_REASONS,
      required: true,
      immutable: true,
    },
    previousModerationStatus: {
      type: String,
      enum: REPORT_MODERATION_STATUSES,
      default: null,
      immutable: true,
    },
    newModerationStatus: {
      type: String,
      enum: REPORT_MODERATION_STATUSES,
      default: null,
      immutable: true,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
      immutable: true,
      select: false,
    },
    occurredAt: {
      type: Date,
      required: true,
      default: Date.now,
      immutable: true,
    },
  },
  {
    collection: "report_moderation_events",
    timestamps: false,
  },
);

reportModerationEventSchema.pre("validate", function () {
  if (this.action === "flag_dismissed") {
    if (!this.sourceFlagId) {
      this.invalidate("sourceFlagId", "Flag dismissal requires a source flag");
    }
    if (
      this.reason !== "flag_dismissed" ||
      this.previousModerationStatus !== null ||
      this.newModerationStatus !== null
    ) {
      this.invalidate("action", "Flag dismissal audit state is invalid");
    }
    return;
  }

  if (this.action === "report_hidden") {
    const allowedReasons: readonly string[] = this.sourceFlagId
      ? REPORT_FLAG_REASONS
      : DIRECT_REPORT_HIDE_REASONS;
    if (
      this.previousModerationStatus !== "visible" ||
      this.newModerationStatus !== "hidden" ||
      !allowedReasons.includes(String(this.reason))
    ) {
      this.invalidate("action", "Report hide audit state is invalid");
    }
    return;
  }

  if (
    this.action !== "report_restored" ||
    this.sourceFlagId !== null ||
    this.reason !== "moderation_reversed" ||
    this.previousModerationStatus !== "hidden" ||
    this.newModerationStatus !== "visible"
  ) {
    this.invalidate("action", "Report restore audit state is invalid");
  }
});

reportModerationEventSchema.index({
  reportId: 1,
  occurredAt: -1,
  _id: -1,
});
reportModerationEventSchema.index({
  actorAdministratorId: 1,
  occurredAt: -1,
  _id: -1,
});

export type ReportModerationEvent = InferSchemaType<
  typeof reportModerationEventSchema
>;

export const ReportModerationEventModel =
  (models.ReportModerationEvent as
    | Model<ReportModerationEvent>
    | undefined) ??
  model<ReportModerationEvent>(
    "ReportModerationEvent",
    reportModerationEventSchema,
  );
