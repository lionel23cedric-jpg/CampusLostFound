import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

export const REPORT_FLAG_REASONS = [
  "inappropriate_content",
  "suspected_fraud",
  "privacy_concern",
  "duplicate_report",
  "other",
] as const;
export const REPORT_FLAG_STATUSES = [
  "pending",
  "dismissed",
  "actioned",
] as const;
export const PENDING_REPORT_FLAG_INDEX =
  "unique_pending_report_flag_per_member";

export type ReportFlagReason = (typeof REPORT_FLAG_REASONS)[number];
export type ReportFlagStatus = (typeof REPORT_FLAG_STATUSES)[number];

export const reportFlagSchema = new Schema(
  {
    reportId: {
      type: Schema.Types.ObjectId,
      ref: "ItemReport",
      required: true,
      immutable: true,
    },
    submittedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
      select: false,
    },
    reason: {
      type: String,
      enum: REPORT_FLAG_REASONS,
      required: true,
      immutable: true,
    },
    details: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
      immutable: true,
      select: false,
    },
    status: {
      type: String,
      enum: REPORT_FLAG_STATUSES,
      default: "pending",
      required: true,
    },
    reviewedByAdministratorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      select: false,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    resolutionNote: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
      select: false,
    },
  },
  {
    collection: "report_flags",
    timestamps: true,
  },
);

reportFlagSchema.pre("validate", function () {
  if (this.reason === "other" && !this.details?.trim()) {
    this.invalidate("details", "Details are required for another concern");
  }

  if (this.status === "pending") {
    if (this.reviewedByAdministratorId !== null) {
      this.invalidate(
        "reviewedByAdministratorId",
        "Pending flags cannot have a reviewer",
      );
    }
    if (this.reviewedAt !== null) {
      this.invalidate("reviewedAt", "Pending flags cannot have a review time");
    }
    if (this.resolutionNote !== null) {
      this.invalidate(
        "resolutionNote",
        "Pending flags cannot have a resolution note",
      );
    }
    return;
  }

  if (!this.reviewedByAdministratorId) {
    this.invalidate(
      "reviewedByAdministratorId",
      "Resolved flags require a reviewer",
    );
  }
  if (!this.reviewedAt) {
    this.invalidate("reviewedAt", "Resolved flags require a review time");
  }
});

reportFlagSchema.index(
  { reportId: 1, submittedByUserId: 1, status: 1 },
  {
    name: PENDING_REPORT_FLAG_INDEX,
    unique: true,
    partialFilterExpression: { status: "pending" },
  },
);
reportFlagSchema.index({ status: 1, createdAt: -1, _id: -1 });
reportFlagSchema.index({
  reason: 1,
  status: 1,
  createdAt: -1,
  _id: -1,
});
reportFlagSchema.index({ reportId: 1, status: 1, createdAt: -1 });

export type ReportFlag = InferSchemaType<typeof reportFlagSchema>;

export const ReportFlagModel =
  (models.ReportFlag as Model<ReportFlag> | undefined) ??
  model<ReportFlag>("ReportFlag", reportFlagSchema);
