import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/item-report", () => ({
  ItemReportModel: {
    findById: vi.fn(),
    updateOne: vi.fn(),
  },
}));
vi.mock("@/models/report-image", () => ({
  REPORT_IMAGE_UPLOAD_KEY_INDEX:
    "report_image_report_upload_key_unique",
  ReportImageModel: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock("@/models/user", () => ({
  UserModel: { findOne: vi.fn() },
}));

import { connectToDatabase } from "@/lib/db";
import { ItemReportModel } from "@/models/item-report";
import {
  REPORT_IMAGE_UPLOAD_KEY_INDEX,
  ReportImageModel,
} from "@/models/report-image";
import { UserModel } from "@/models/user";

import type { ValidatedReportImage } from "./image-validation";
import {
  type UploadReportImageInput,
  uploadReportImage,
} from "./image-upload-service";

const reportId = "64b64c6f2f4d9f1a2b3c4d51";
const actorId = "64b64c6f2f4d9f1a2b3c4d52";
const otherActorId = "64b64c6f2f4d9f1a2b3c4d53";
const imageId = "64b64c6f2f4d9f1a2b3c4d54";
const uploadKey = "550e8400-e29b-41d4-a716-446655440000";
const reportObjectId = new Types.ObjectId(reportId);
const actorObjectId = new Types.ObjectId(actorId);
const otherActorObjectId = new Types.ObjectId(otherActorId);
const imageObjectId = new Types.ObjectId(imageId);
const image = {
  contentType: "image/jpeg",
  byteLength: 4,
  data: Buffer.from([0xff, 0xd8, 0xff, 0x01]),
} satisfies ValidatedReportImage;
const input = { reportId, actorId, uploadKey, image } satisfies UploadReportImageInput;
const imageUrl = `/api/report-images/${imageId}`;

function queryChain<T>(value: T) {
  const query = {
    select: vi.fn(),
    session: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn(async () => value),
  };
  query.select.mockReturnValue(query);
  query.session.mockReturnValue(query);
  query.lean.mockReturnValue(query);
  return query;
}

function reportRecord(overrides: Record<string, unknown> = {}) {
  return {
    _id: reportObjectId,
    reporterId: actorObjectId,
    status: "open",
    moderationStatus: "visible",
    photoUrls: [] as string[],
    ...overrides,
  };
}

function existingImage(overrides: Record<string, unknown> = {}) {
  return {
    _id: imageObjectId,
    reportId: reportObjectId,
    uploadedByUserId: actorObjectId,
    uploadKey,
    contentType: image.contentType,
    byteLength: image.byteLength,
    data: Buffer.from(image.data),
    ...overrides,
  };
}

const transaction = {
  withTransaction: vi.fn(),
  endSession: vi.fn(),
};
const startSession = vi.fn();

function configure(options: {
  actor?: unknown;
  report?: unknown;
  existing?: unknown;
  modifiedCount?: number;
} = {}) {
  const actorQuery = queryChain(
    options.actor === undefined ? { _id: actorObjectId } : options.actor,
  );
  const reportQuery = queryChain(
    options.report === undefined ? reportRecord() : options.report,
  );
  const imageQuery = queryChain(options.existing ?? null);

  vi.mocked(UserModel.findOne).mockReturnValue(actorQuery as never);
  vi.mocked(ItemReportModel.findById).mockReturnValue(reportQuery as never);
  vi.mocked(ReportImageModel.findOne).mockReturnValue(imageQuery as never);
  vi.mocked(ReportImageModel.create).mockResolvedValue([
    { _id: imageObjectId },
  ] as never);
  vi.mocked(ItemReportModel.updateOne).mockResolvedValue({
    modifiedCount: options.modifiedCount ?? 1,
  } as never);

  return { actorQuery, reportQuery, imageQuery };
}

let configured: ReturnType<typeof configure>;

beforeEach(() => {
  vi.mocked(connectToDatabase).mockReset();
  vi.mocked(UserModel.findOne).mockReset();
  vi.mocked(ItemReportModel.findById).mockReset();
  vi.mocked(ItemReportModel.updateOne).mockReset();
  vi.mocked(ReportImageModel.findOne).mockReset();
  vi.mocked(ReportImageModel.create).mockReset();
  startSession.mockReset();
  transaction.withTransaction.mockReset();
  transaction.endSession.mockReset();

  transaction.withTransaction.mockImplementation(
    async (work: () => Promise<unknown>) => await work(),
  );
  transaction.endSession.mockResolvedValue(undefined);
  startSession.mockResolvedValue(transaction);
  vi.mocked(connectToDatabase).mockResolvedValue({ startSession } as never);
  configured = configure();
});

describe("report image upload service", () => {
  it.each([
    ["malformed report id", { ...input, reportId: "not-an-object-id" }, "REPORT_NOT_FOUND"],
    ["malformed actor id", { ...input, actorId: "not-an-object-id" }, "ACCOUNT_UNAVAILABLE"],
    ["non-UUID upload key", { ...input, uploadKey: "not-a-uuid" }, "IMAGE_CONTENT_INVALID"],
  ] as const)("rejects a %s before connecting", async (_case, invalid, code) => {
    await expect(uploadReportImage(invalid)).rejects.toMatchObject({ code });

    expect(connectToDatabase).not.toHaveBeenCalled();
    expect(startSession).not.toHaveBeenCalled();
    expect(UserModel.findOne).not.toHaveBeenCalled();
  });

  it("re-authorises an active student inside the transaction", async () => {
    configured = configure({ actor: null });

    await expect(uploadReportImage(input)).rejects.toMatchObject({
      code: "ACCOUNT_UNAVAILABLE",
      status: 403,
    });

    expect(UserModel.findOne).toHaveBeenCalledWith({
      _id: actorObjectId,
      role: "student",
      status: "active",
    });
    expect(configured.actorQuery.select).toHaveBeenCalledWith({ _id: 1 });
    expect(configured.actorQuery.session).toHaveBeenCalledWith(transaction);
    expect(ItemReportModel.findById).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing", null, "REPORT_NOT_FOUND"],
    [
      "owned by another user",
      reportRecord({ reporterId: otherActorObjectId }),
      "REPORT_IMAGE_FORBIDDEN",
    ],
    ["draft", reportRecord({ status: "draft" }), "REPORT_IMAGE_CONFLICT"],
    [
      "claim pending",
      reportRecord({ status: "claim_pending" }),
      "REPORT_IMAGE_CONFLICT",
    ],
    ["resolved", reportRecord({ status: "resolved" }), "REPORT_IMAGE_CONFLICT"],
    [
      "closed",
      reportRecord({
        status: "closed",
        photoUrls: Array.from({ length: 5 }, () => imageUrl),
      }),
      "REPORT_IMAGE_CONFLICT",
    ],
  ] as const)("rejects a %s report", async (_case, report, code) => {
    configure({ report });

    await expect(uploadReportImage(input)).rejects.toMatchObject({ code });

    expect(ReportImageModel.findOne).not.toHaveBeenCalled();
    expect(ReportImageModel.create).not.toHaveBeenCalled();
    expect(ItemReportModel.updateOne).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("returns an idempotent replay before enforcing the five-image limit", async () => {
    configured = configure({
      report: reportRecord({
        photoUrls: Array.from({ length: 5 }, (_, index) =>
          `https://example.test/${index}.jpg`,
        ),
      }),
      existing: existingImage({ data: Buffer.from(image.data) }),
    });

    await expect(uploadReportImage(input)).resolves.toEqual({
      image: {
        url: imageUrl,
        contentType: "image/jpeg",
        byteLength: 4,
      },
      created: false,
    });

    expect(ReportImageModel.findOne).toHaveBeenCalledWith({
      reportId: reportObjectId,
      uploadKey,
    });
    expect(configured.imageQuery.select).toHaveBeenCalledWith(
      "+uploadKey +data",
    );
    expect(configured.imageQuery.session).toHaveBeenCalledWith(transaction);
    expect(ReportImageModel.create).not.toHaveBeenCalled();
    expect(ItemReportModel.updateOne).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it.each([
    ["MIME", { contentType: "image/png" }],
    ["length", { byteLength: image.byteLength + 1 }],
    ["bytes", { data: Buffer.from([0xff, 0xd8, 0xff, 0x02]) }],
  ])("rejects replay with different %s", async (_case, overrides) => {
    configure({ existing: existingImage(overrides) });

    await expect(uploadReportImage(input)).rejects.toMatchObject({
      code: "REPORT_IMAGE_CONFLICT",
      status: 409,
    });
    expect(ReportImageModel.create).not.toHaveBeenCalled();
    expect(ItemReportModel.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a sixth image only after finding no replay", async () => {
    configure({
      report: reportRecord({
        photoUrls: Array.from({ length: 5 }, (_, index) =>
          `https://example.test/${index}.jpg`,
        ),
      }),
      existing: null,
    });

    await expect(uploadReportImage(input)).rejects.toMatchObject({
      code: "IMAGE_LIMIT_REACHED",
      status: 409,
    });
    expect(ReportImageModel.findOne).toHaveBeenCalledOnce();
    expect(ReportImageModel.create).not.toHaveBeenCalled();
    expect(ItemReportModel.updateOne).not.toHaveBeenCalled();
  });

  it("creates and conditionally appends one safe internal reference", async () => {
    configured = configure({
      report: reportRecord({ moderationStatus: "hidden" }),
    });

    const result = await uploadReportImage(input);

    expect(result).toEqual({
      image: {
        url: imageUrl,
        contentType: "image/jpeg",
        byteLength: 4,
      },
      created: true,
    });
    expect(Object.keys(result)).toEqual(["image", "created"]);
    expect(Object.keys(result.image)).toEqual([
      "url",
      "contentType",
      "byteLength",
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /"reportId"|"uploadedByUserId"|"uploadKey"|"imageId"|"data"/,
    );
    expect(ItemReportModel.findById).toHaveBeenCalledWith(reportObjectId, {
      _id: 1,
      reporterId: 1,
      status: 1,
      photoUrls: 1,
    });
    expect(configured.reportQuery.session).toHaveBeenCalledWith(transaction);
    expect(ReportImageModel.create).toHaveBeenCalledWith(
      [
        {
          reportId: reportObjectId,
          uploadedByUserId: actorObjectId,
          uploadKey,
          contentType: image.contentType,
          byteLength: image.byteLength,
          data: image.data,
        },
      ],
      { session: transaction },
    );
    expect(ItemReportModel.updateOne).toHaveBeenCalledWith(
      {
        _id: reportObjectId,
        reporterId: actorObjectId,
        status: "open",
        "photoUrls.4": { $exists: false },
      },
      { $push: { photoUrls: imageUrl } },
      { runValidators: true, session: transaction },
    );
    expect(
      JSON.stringify(vi.mocked(ItemReportModel.updateOne).mock.calls),
    ).not.toContain("moderationStatus");
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it.each([
    ["deleted", null, "REPORT_NOT_FOUND"],
    [
      "new owner",
      reportRecord({ reporterId: otherActorObjectId }),
      "REPORT_IMAGE_FORBIDDEN",
    ],
    [
      "closed",
      reportRecord({
        status: "closed",
        photoUrls: Array.from({ length: 5 }, () => imageUrl),
      }),
      "REPORT_IMAGE_CONFLICT",
    ],
    [
      "full",
      reportRecord({ photoUrls: Array.from({ length: 5 }, () => imageUrl) }),
      "IMAGE_LIMIT_REACHED",
    ],
  ] as const)(
    "classifies a stale conditional write when the report is %s",
    async (_case, current, code) => {
      configure({ modifiedCount: 0 });
      const initialQuery = queryChain(reportRecord());
      const currentQuery = queryChain(current);
      vi.mocked(ItemReportModel.findById)
        .mockReset()
        .mockReturnValueOnce(initialQuery as never)
        .mockReturnValueOnce(currentQuery as never);

      await expect(uploadReportImage(input)).rejects.toMatchObject({ code });

      expect(ReportImageModel.create).toHaveBeenCalledWith(
        expect.any(Array),
        { session: transaction },
      );
      expect(ItemReportModel.updateOne).toHaveBeenCalledOnce();
      expect(currentQuery.session).toHaveBeenCalledWith(transaction);
      expect(transaction.endSession).toHaveBeenCalledOnce();
    },
  );

  it("recovers a matching named-index race outside the transaction", async () => {
    const duplicate = Object.assign(new Error("duplicate image upload key"), {
      code: 11000,
      indexName: REPORT_IMAGE_UPLOAD_KEY_INDEX,
    });
    const insideQuery = queryChain(null);
    const outsideQuery = queryChain(existingImage());
    vi.mocked(ReportImageModel.findOne)
      .mockReset()
      .mockReturnValueOnce(insideQuery as never)
      .mockReturnValueOnce(outsideQuery as never);
    vi.mocked(ReportImageModel.create).mockRejectedValueOnce(duplicate);

    await expect(uploadReportImage(input)).resolves.toEqual({
      image: {
        url: imageUrl,
        contentType: "image/jpeg",
        byteLength: 4,
      },
      created: false,
    });

    expect(outsideQuery.select).toHaveBeenCalledWith("+uploadKey +data");
    expect(outsideQuery.session).not.toHaveBeenCalled();
    expect(transaction.endSession.mock.invocationCallOrder[0]).toBeLessThan(
      outsideQuery.exec.mock.invocationCallOrder[0],
    );
    expect(ItemReportModel.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a named-index race whose persisted bytes differ", async () => {
    const duplicate = Object.assign(new Error("duplicate image upload key"), {
      code: 11000,
      index: REPORT_IMAGE_UPLOAD_KEY_INDEX,
    });
    vi.mocked(ReportImageModel.findOne)
      .mockReset()
      .mockReturnValueOnce(queryChain(null) as never)
      .mockReturnValueOnce(
        queryChain(
          existingImage({
            data: Buffer.from([0xff, 0xd8, 0xff, 0x02]),
          }),
        ) as never,
      );
    vi.mocked(ReportImageModel.create).mockRejectedValueOnce(duplicate);

    await expect(uploadReportImage(input)).rejects.toMatchObject({
      code: "REPORT_IMAGE_CONFLICT",
      status: 409,
    });
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("preserves a named-index race when no winner can be reread", async () => {
    const duplicate = Object.assign(new Error("duplicate image upload key"), {
      code: 11000,
      indexName: REPORT_IMAGE_UPLOAD_KEY_INDEX,
    });
    vi.mocked(ReportImageModel.findOne)
      .mockReset()
      .mockReturnValueOnce(queryChain(null) as never)
      .mockReturnValueOnce(queryChain(null) as never);
    vi.mocked(ReportImageModel.create).mockRejectedValueOnce(duplicate);

    await expect(uploadReportImage(input)).rejects.toBe(duplicate);
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it.each([
    Object.assign(new Error("other duplicate"), {
      code: 11000,
      indexName: "other_unique_index",
      keyPattern: { reportId: 1, uploadKey: 1 },
    }),
    new Error("database write failed"),
  ])("preserves an unrelated persistence failure", async (failure) => {
    vi.mocked(ReportImageModel.create).mockRejectedValueOnce(failure);

    await expect(uploadReportImage(input)).rejects.toBe(failure);
    expect(transaction.endSession).toHaveBeenCalledOnce();
    expect(ItemReportModel.updateOne).not.toHaveBeenCalled();
  });

  it("ends the session when the transaction itself fails", async () => {
    const failure = new Error("transaction failed");
    transaction.withTransaction.mockRejectedValueOnce(failure);

    await expect(uploadReportImage(input)).rejects.toBe(failure);

    expect(UserModel.findOne).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("ends the session when no transaction result is produced", async () => {
    transaction.withTransaction.mockResolvedValueOnce(undefined);

    await expect(uploadReportImage(input)).rejects.toThrow(
      "Report image transaction did not produce a result",
    );
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });
});
