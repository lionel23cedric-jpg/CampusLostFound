import mongoose, { type InferSchemaType, type Model } from "mongoose";

import {
  REPORT_IMAGE_CONTENT_TYPES,
  REPORT_IMAGE_MAX_BYTES,
} from "@/lib/reports/photo-reference";

const { Schema, model, models } = mongoose;

export const REPORT_IMAGE_UPLOAD_KEY_INDEX =
  "report_image_report_upload_key_unique";

export const reportImageSchema = new Schema(
  {
    reportId: {
      type: Schema.Types.ObjectId,
      ref: "ItemReport",
      required: true,
      immutable: true,
    },
    uploadedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
      select: false,
    },
    uploadKey: {
      type: String,
      required: true,
      immutable: true,
      select: false,
    },
    contentType: {
      type: String,
      enum: REPORT_IMAGE_CONTENT_TYPES,
      required: true,
    },
    byteLength: {
      type: Number,
      required: true,
      min: 1,
      max: REPORT_IMAGE_MAX_BYTES,
      validate: {
        validator: Number.isInteger,
        message: "Image byte length must be an integer",
      },
    },
    data: {
      type: Buffer,
      required: true,
      select: false,
      validate: {
        validator: (value: Buffer) => value.length <= REPORT_IMAGE_MAX_BYTES,
        message: "Image data exceeds the size limit",
      },
    },
  },
  {
    collection: "reportImages",
    timestamps: { createdAt: true, updatedAt: false },
  },
);

reportImageSchema.index({ reportId: 1, createdAt: 1, _id: 1 });
reportImageSchema.index(
  { reportId: 1, uploadKey: 1 },
  { name: REPORT_IMAGE_UPLOAD_KEY_INDEX, unique: true },
);

export type ReportImage = InferSchemaType<typeof reportImageSchema>;

export const ReportImageModel =
  (models.ReportImage as Model<ReportImage> | undefined) ??
  model<ReportImage>("ReportImage", reportImageSchema);
