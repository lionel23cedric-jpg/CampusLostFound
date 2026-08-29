import { mongo, Types } from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { ItemReportModel } from "@/models/item-report";
import { ReportImageModel } from "@/models/report-image";
import { UserModel, type User } from "@/models/user";

import { ReportImageError } from "./image-errors";
import type { ValidatedReportImage } from "./image-validation";
import {
  REPORT_IMAGE_CONTENT_TYPES,
  REPORT_IMAGE_MAX_BYTES,
} from "./photo-reference";

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const SUBMITTED_REPORT_STATUSES = new Set([
  "open",
  "claim_pending",
  "resolved",
  "closed",
]);

export type ReadReportImageInput = {
  imageId: string;
  actorId: string;
  actorRole: User["role"];
};

export type ReadReportImageReceipt = ValidatedReportImage;

type ImageRecord = {
  reportId: Types.ObjectId;
  uploadedByUserId: Types.ObjectId;
  contentType: ValidatedReportImage["contentType"];
  byteLength: number;
  data: Buffer | mongo.Binary;
};

type ReportRecord = {
  reporterId: Types.ObjectId;
  status: string;
  moderationStatus?: string;
  privacySettings: { showPhoto: boolean };
};

function normaliseImageData(data: unknown): Buffer | null {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof mongo.Binary) return Buffer.from(data.value());
  return null;
}

export async function readReportImage(
  input: ReadReportImageInput,
): Promise<ReadReportImageReceipt> {
  if (!OBJECT_ID_PATTERN.test(input.imageId)) {
    throw new ReportImageError("REPORT_IMAGE_NOT_FOUND");
  }
  if (!OBJECT_ID_PATTERN.test(input.actorId)) {
    throw new ReportImageError("ACCOUNT_UNAVAILABLE");
  }

  await connectToDatabase();
  const actor = await UserModel.findById(input.actorId, {
    role: 1,
    status: 1,
  })
    .lean<{ role: User["role"]; status: User["status"] } | null>()
    .exec();
  if (
    !actor ||
    actor.status !== "active" ||
    actor.role !== input.actorRole
  ) {
    throw new ReportImageError("ACCOUNT_UNAVAILABLE");
  }

  const image = await ReportImageModel.findById(input.imageId)
    .select("reportId contentType byteLength +data +uploadedByUserId")
    .lean<ImageRecord | null>()
    .exec();
  if (!image) throw new ReportImageError("REPORT_IMAGE_NOT_FOUND");
  const data = normaliseImageData(image.data);
  if (
    !REPORT_IMAGE_CONTENT_TYPES.includes(image.contentType) ||
    !data ||
    image.byteLength < 1 ||
    image.byteLength > REPORT_IMAGE_MAX_BYTES ||
    data.length !== image.byteLength
  ) {
    throw new ReportImageError("REPORT_IMAGE_NOT_FOUND");
  }

  const report = await ItemReportModel.findById(image.reportId, {
    reporterId: 1,
    status: 1,
    moderationStatus: 1,
    "privacySettings.showPhoto": 1,
  })
    .lean<ReportRecord | null>()
    .exec();
  if (!report) throw new ReportImageError("REPORT_IMAGE_NOT_FOUND");

  const isOwner = report.reporterId.toString() === input.actorId.toLowerCase();
  const canReadAsMember =
    report.moderationStatus !== "hidden" &&
    SUBMITTED_REPORT_STATUSES.has(report.status) &&
    report.privacySettings.showPhoto;
  if (!isOwner && actor.role !== "administrator" && !canReadAsMember) {
    throw new ReportImageError("REPORT_IMAGE_NOT_FOUND");
  }

  return {
    contentType: image.contentType,
    byteLength: image.byteLength,
    data,
  };
}
