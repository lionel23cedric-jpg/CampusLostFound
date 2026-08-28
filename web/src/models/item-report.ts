import mongoose, { type InferSchemaType, type Model } from "mongoose";

import {
  REPORT_IMAGE_LIMIT,
  isReportPhotoReference,
} from "@/lib/reports/photo-reference";

const { Schema, model, models } = mongoose;

export const REPORT_TYPES = ["lost", "found"] as const;
export const REPORT_STATUSES = [
  "draft",
  "open",
  "claim_pending",
  "resolved",
  "closed",
] as const;
export const REPORT_MODERATION_STATUSES = ["visible", "hidden"] as const;
export type ReportModerationStatus =
  (typeof REPORT_MODERATION_STATUSES)[number];

export function normalizeReportModerationStatus(
  value: unknown,
): ReportModerationStatus {
  if (value === undefined) return "visible";
  if (value === "visible" || value === "hidden") return value;
  throw new Error("Report moderation status is invalid");
}

const privacySettingsSchema = new Schema(
  {
    showPhoto: {
      type: Boolean,
      default: true,
      required: true,
    },
    showEventDate: {
      type: Boolean,
      default: true,
      required: true,
    },
    showCampusLocation: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  { _id: false },
);

export const itemReportSchema = new Schema(
  {
    reporterId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Reporter is required"],
    },
    reportType: {
      type: String,
      enum: REPORT_TYPES,
      required: [true, "Report type is required"],
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      minlength: [5, "Title must contain at least 5 characters"],
      maxlength: [120, "Title must contain at most 120 characters"],
    },
    publicDescription: {
      type: String,
      required: [true, "Public description is required"],
      trim: true,
      minlength: [10, "Public description must contain at least 10 characters"],
      maxlength: [
        2000,
        "Public description must contain at most 2000 characters",
      ],
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category is required"],
    },
    campusLocationId: {
      type: Schema.Types.ObjectId,
      ref: "CampusLocation",
      required: [true, "Campus location is required"],
    },
    occurredAt: {
      type: Date,
      required: [true, "Lost or found date is required"],
    },
    colors: {
      type: [
        {
          type: String,
          trim: true,
          maxlength: [32, "Each colour must contain at most 32 characters"],
        },
      ],
      validate: {
        validator: (values: string[]) =>
          values.length >= 1 && values.length <= 5,
        message: "Provide between 1 and 5 colours",
      },
    },
    tags: {
      type: [
        {
          type: String,
          trim: true,
          lowercase: true,
          maxlength: [40, "Each tag must contain at most 40 characters"],
        },
      ],
      default: [],
      validate: {
        validator: (values: string[]) => values.length <= 10,
        message: "Provide at most 10 tags",
      },
    },
    photoUrls: {
      type: [
        {
          type: String,
          trim: true,
          validate: {
            validator: isReportPhotoReference,
            message:
              "Photo reference must be a report image path or HTTPS URL",
          },
        },
      ],
      default: [],
      validate: {
        validator: (values: string[]) =>
          values.length <= REPORT_IMAGE_LIMIT,
        message: "Provide at most 5 photo URLs",
      },
    },
    status: {
      type: String,
      enum: REPORT_STATUSES,
      default: "draft",
      required: true,
    },
    moderationStatus: {
      type: String,
      enum: REPORT_MODERATION_STATUSES,
      default: "visible",
      required: true,
    },
    privacySettings: {
      type: privacySettingsSchema,
      default: () => ({}),
      required: true,
    },
    resolvedAt: {
      type: Date,
      default: null,
      validate: {
        validator: function (
          this: { status?: (typeof REPORT_STATUSES)[number] },
          value: Date | null,
        ) {
          return this.status !== "resolved" || value !== null;
        },
        message: "Resolved reports require a resolved date",
      },
    },
  },
  {
    collection: "itemReports",
    timestamps: true,
  },
);

itemReportSchema.index({ reporterId: 1, createdAt: -1 });
itemReportSchema.index({
  reportType: 1,
  status: 1,
  categoryId: 1,
  occurredAt: -1,
});
itemReportSchema.index({
  campusLocationId: 1,
  status: 1,
  occurredAt: -1,
});
itemReportSchema.index(
  { title: "text", publicDescription: "text", tags: "text" },
  {
    name: "item_report_search",
    weights: { title: 5, tags: 3, publicDescription: 1 },
  },
);

export type ItemReport = InferSchemaType<typeof itemReportSchema>;

export const ItemReportModel =
  (models.ItemReport as Model<ItemReport> | undefined) ??
  model<ItemReport>("ItemReport", itemReportSchema);
