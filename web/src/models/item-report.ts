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
export const REPORT_VERIFICATION_STATUSES = ["pending", "verified"] as const;
export const REPORT_CUSTODY_STATUSES = [
  "not_applicable",
  "not_held",
  "stored",
  "released",
] as const;
export type ReportModerationStatus =
  (typeof REPORT_MODERATION_STATUSES)[number];
export type ReportVerificationStatus =
  (typeof REPORT_VERIFICATION_STATUSES)[number];
export type ReportCustodyStatus = (typeof REPORT_CUSTODY_STATUSES)[number];

type ReportType = (typeof REPORT_TYPES)[number];
type Identifier = { toString(): string };

export type NormalizedStaffReportHandling = {
  verificationStatus: ReportVerificationStatus;
  verifiedBy: Identifier | null;
  verifiedAt: Date | null;
  custodyStatus: ReportCustodyStatus;
  storageLocation: string | null;
  storedAt: Date | null;
  releasedAt: Date | null;
  updatedBy: Identifier | null;
};

export function defaultStaffReportHandling(reportType: ReportType) {
  return {
    verificationStatus: "pending" as const,
    verifiedBy: null,
    verifiedAt: null,
    custodyStatus:
      reportType === "found" ? ("not_held" as const) : ("not_applicable" as const),
    storageLocation: null,
    storedAt: null,
    releasedAt: null,
    updatedBy: null,
  };
}

function isDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function isIdentifier(value: unknown): value is Identifier {
  return mongoose.isValidObjectId(value);
}

function hasValidStorageLocation(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length >= 2 &&
    value.length <= 160 &&
    !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)
  );
}

function staffReportHandlingIsValid(
  reportType: unknown,
  value: unknown,
): value is NormalizedStaffReportHandling {
  if (
    (reportType !== "lost" && reportType !== "found") ||
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const handling = value as Record<string, unknown>;
  const verificationStatus = handling.verificationStatus;
  const custodyStatus = handling.custodyStatus;
  const verifiedBy = handling.verifiedBy;
  const verifiedAt = handling.verifiedAt;
  const storageLocation = handling.storageLocation;
  const storedAt = handling.storedAt;
  const releasedAt = handling.releasedAt;
  const updatedBy = handling.updatedBy;

  if (verificationStatus === "pending") {
    return (
      verifiedBy === null &&
      verifiedAt === null &&
      updatedBy === null &&
      storageLocation === null &&
      storedAt === null &&
      releasedAt === null &&
      custodyStatus ===
        (reportType === "found" ? "not_held" : "not_applicable")
    );
  }

  if (
    verificationStatus !== "verified" ||
    !isIdentifier(verifiedBy) ||
    !isDate(verifiedAt) ||
    !isIdentifier(updatedBy)
  ) {
    return false;
  }

  if (reportType === "lost") {
    return (
      custodyStatus === "not_applicable" &&
      storageLocation === null &&
      storedAt === null &&
      releasedAt === null
    );
  }

  if (custodyStatus === "not_held") {
    return (
      storageLocation === null && storedAt === null && releasedAt === null
    );
  }

  if (
    (custodyStatus !== "stored" && custodyStatus !== "released") ||
    !hasValidStorageLocation(storageLocation) ||
    !isDate(storedAt)
  ) {
    return false;
  }

  return custodyStatus === "stored"
    ? releasedAt === null
    : isDate(releasedAt);
}

export function normalizeStaffReportHandling(
  reportType: ReportType,
  value: unknown,
): NormalizedStaffReportHandling {
  if (value === undefined) return defaultStaffReportHandling(reportType);
  if (!staffReportHandlingIsValid(reportType, value)) {
    throw new Error("Staff report handling is invalid");
  }

  return {
    verificationStatus: value.verificationStatus,
    verifiedBy: value.verifiedBy,
    verifiedAt: value.verifiedAt,
    custodyStatus: value.custodyStatus,
    storageLocation: value.storageLocation,
    storedAt: value.storedAt,
    releasedAt: value.releasedAt,
    updatedBy: value.updatedBy,
  };
}

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

const staffHandlingSchema = new Schema(
  {
    verificationStatus: {
      type: String,
      enum: REPORT_VERIFICATION_STATUSES,
      required: true,
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    verifiedAt: { type: Date, default: null },
    custodyStatus: {
      type: String,
      enum: REPORT_CUSTODY_STATUSES,
      required: true,
    },
    storageLocation: {
      type: String,
      trim: true,
      minlength: 2,
      maxlength: 160,
      default: null,
      validate: {
        validator: (value: string | null) =>
          value === null || !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value),
        message: "Storage location contains unsupported characters",
      },
    },
    storedAt: { type: Date, default: null },
    releasedAt: { type: Date, default: null },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
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
    staffHandling: {
      type: staffHandlingSchema,
      default: function (this: { reportType?: ReportType }) {
        return defaultStaffReportHandling(
          this.reportType === "found" ? "found" : "lost",
        );
      },
      required: true,
      select: false,
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

itemReportSchema.pre("validate", function () {
  if (!staffReportHandlingIsValid(this.reportType, this.staffHandling)) {
    this.invalidate("staffHandling", "Staff report handling is invalid");
  }
});

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
