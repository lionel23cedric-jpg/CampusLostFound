import { Types, type ClientSession } from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { ItemReportModel } from "@/models/item-report";
import {
  REPORT_IMAGE_UPLOAD_KEY_INDEX,
  ReportImageModel,
} from "@/models/report-image";
import { UserModel } from "@/models/user";

import { ReportImageError } from "./image-errors";
import type { ValidatedReportImage } from "./image-validation";
import {
  REPORT_IMAGE_LIMIT,
  internalReportImagePath,
} from "./photo-reference";

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const UUID_PATTERN =
  /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/;
const REPORT_SELECT = {
  _id: 1,
  reporterId: 1,
  status: 1,
  photoUrls: 1,
} as const;

type ReportRecord = {
  _id: Types.ObjectId;
  reporterId: { toString(): string };
  status: string;
  photoUrls: string[];
};

type ReportImageRecord = {
  _id: { toString(): string };
  contentType: ValidatedReportImage["contentType"];
  byteLength: number;
  data: Buffer;
};

export type UploadReportImageInput = {
  reportId: string;
  actorId: string;
  uploadKey: string;
  image: ValidatedReportImage;
};

export type ReportImageReceipt = {
  url: string;
  contentType: ValidatedReportImage["contentType"];
  byteLength: number;
};

export type UploadReportImageResult = {
  image: ReportImageReceipt;
  created: boolean;
};

function parseInput(input: UploadReportImageInput) {
  if (!OBJECT_ID_PATTERN.test(input.reportId)) {
    throw new ReportImageError("REPORT_NOT_FOUND");
  }
  if (!OBJECT_ID_PATTERN.test(input.actorId)) {
    throw new ReportImageError("ACCOUNT_UNAVAILABLE");
  }
  if (!UUID_PATTERN.test(input.uploadKey)) {
    throw new ReportImageError("IMAGE_CONTENT_INVALID", {
      uploadKey: ["Upload key is invalid"],
    });
  }
  return {
    reportId: new Types.ObjectId(input.reportId),
    actorId: new Types.ObjectId(input.actorId),
  };
}

async function findReport(
  reportId: Types.ObjectId,
  session: ClientSession,
) {
  return ItemReportModel.findById(reportId, REPORT_SELECT)
    .session(session)
    .lean<ReportRecord | null>()
    .exec();
}

async function findExistingImage(
  reportId: Types.ObjectId,
  uploadKey: string,
  session?: ClientSession,
) {
  const query = ReportImageModel.findOne({ reportId, uploadKey }).select(
    "+uploadKey +data",
  );
  if (session) query.session(session);
  return query.lean<ReportImageRecord | null>().exec();
}

function assertOwnedOpenReport(
  report: ReportRecord | null,
  actorId: Types.ObjectId,
): asserts report is ReportRecord {
  if (!report) throw new ReportImageError("REPORT_NOT_FOUND");
  if (report.reporterId.toString() !== actorId.toString()) {
    throw new ReportImageError("REPORT_IMAGE_FORBIDDEN");
  }
  if (report.status !== "open") {
    throw new ReportImageError("REPORT_IMAGE_CONFLICT");
  }
}

function imagesMatch(
  existing: ReportImageRecord,
  image: ValidatedReportImage,
) {
  return (
    existing.contentType === image.contentType &&
    existing.byteLength === image.byteLength &&
    Buffer.isBuffer(existing.data) &&
    existing.data.equals(image.data)
  );
}

function replayResult(
  existing: ReportImageRecord,
  image: ValidatedReportImage,
): UploadReportImageResult {
  if (!imagesMatch(existing, image)) {
    throw new ReportImageError("REPORT_IMAGE_CONFLICT");
  }
  return {
    image: {
      url: internalReportImagePath(existing._id.toString()),
      contentType: existing.contentType,
      byteLength: existing.byteLength,
    },
    created: false,
  };
}

function classifyFailedAppend(
  report: ReportRecord | null,
  actorId: Types.ObjectId,
): never {
  if (!report) throw new ReportImageError("REPORT_NOT_FOUND");
  if (report.reporterId.toString() !== actorId.toString()) {
    throw new ReportImageError("REPORT_IMAGE_FORBIDDEN");
  }
  if (report.status !== "open") {
    throw new ReportImageError("REPORT_IMAGE_CONFLICT");
  }
  if (report.photoUrls.length >= REPORT_IMAGE_LIMIT) {
    throw new ReportImageError("IMAGE_LIMIT_REACHED");
  }
  throw new ReportImageError("REPORT_IMAGE_CONFLICT");
}

function isUploadKeyDuplicate(error: unknown) {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    error.code !== 11000
  ) {
    return false;
  }
  const duplicate = error as {
    index?: unknown;
    indexName?: unknown;
    message?: unknown;
  };
  return (
    duplicate.index === REPORT_IMAGE_UPLOAD_KEY_INDEX ||
    duplicate.indexName === REPORT_IMAGE_UPLOAD_KEY_INDEX ||
    (typeof duplicate.message === "string" &&
      duplicate.message.includes(REPORT_IMAGE_UPLOAD_KEY_INDEX))
  );
}

export async function uploadReportImage(
  input: UploadReportImageInput,
): Promise<UploadReportImageResult> {
  const identifiers = parseInput(input);
  const database = await connectToDatabase();
  const transaction = await database.startSession();
  let result: UploadReportImageResult | undefined;
  let failure: unknown;
  let failed = false;

  try {
    await transaction.withTransaction(async () => {
      const actor = await UserModel.findOne({
        _id: identifiers.actorId,
        role: "student",
        status: "active",
      })
        .select({ _id: 1 })
        .session(transaction)
        .lean<{ _id: unknown } | null>()
        .exec();
      if (!actor) throw new ReportImageError("ACCOUNT_UNAVAILABLE");

      const report = await findReport(identifiers.reportId, transaction);
      assertOwnedOpenReport(report, identifiers.actorId);

      const existing = await findExistingImage(
        identifiers.reportId,
        input.uploadKey,
        transaction,
      );
      if (existing) {
        result = replayResult(existing, input.image);
        return;
      }
      if (report.photoUrls.length >= REPORT_IMAGE_LIMIT) {
        throw new ReportImageError("IMAGE_LIMIT_REACHED");
      }

      const [created] = await ReportImageModel.create(
        [
          {
            reportId: identifiers.reportId,
            uploadedByUserId: identifiers.actorId,
            uploadKey: input.uploadKey,
            contentType: input.image.contentType,
            byteLength: input.image.byteLength,
            data: input.image.data,
          },
        ],
        { session: transaction },
      );
      const url = internalReportImagePath(created._id.toString());
      const appended = await ItemReportModel.updateOne(
        {
          _id: identifiers.reportId,
          reporterId: identifiers.actorId,
          status: "open",
          "photoUrls.4": { $exists: false },
        },
        { $push: { photoUrls: url } },
        { runValidators: true, session: transaction },
      );
      if (appended.modifiedCount !== 1) {
        classifyFailedAppend(
          await findReport(identifiers.reportId, transaction),
          identifiers.actorId,
        );
      }

      result = {
        image: {
          url,
          contentType: input.image.contentType,
          byteLength: input.image.byteLength,
        },
        created: true,
      };
    });
  } catch (error) {
    failure = error;
    failed = true;
  } finally {
    await transaction.endSession();
  }

  if (failed) {
    if (!isUploadKeyDuplicate(failure)) throw failure;
    const existing = await findExistingImage(
      identifiers.reportId,
      input.uploadKey,
    );
    if (!existing) throw failure;
    return replayResult(existing, input.image);
  }
  if (!result) {
    throw new Error("Report image transaction did not produce a result");
  }
  return result;
}
