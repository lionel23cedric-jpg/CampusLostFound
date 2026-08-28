import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import {
  REPORT_IMAGE_CONTENT_TYPES,
  REPORT_IMAGE_MAX_BYTES,
} from "@/lib/reports/photo-reference";

import {
  REPORT_IMAGE_UPLOAD_KEY_INDEX,
  ReportImageModel,
  reportImageSchema,
} from "./report-image";

const reportId = new mongoose.Types.ObjectId();
const uploadedByUserId = new mongoose.Types.ObjectId();

function reportImage(overrides: Record<string, unknown> = {}) {
  return new ReportImageModel({
    reportId,
    uploadedByUserId,
    uploadKey: "550e8400-e29b-41d4-a716-446655440000",
    contentType: "image/jpeg",
    byteLength: 1,
    data: Buffer.from([0xff]),
    ...overrides,
  });
}

describe("ReportImage model", () => {
  it("requires only the persisted image fields", async () => {
    await expect(reportImage().validate()).resolves.toBeUndefined();
    await expect(new ReportImageModel({}).validate()).rejects.toMatchObject({
      errors: {
        reportId: expect.anything(),
        uploadedByUserId: expect.anything(),
        uploadKey: expect.anything(),
        contentType: expect.anything(),
        byteLength: expect.anything(),
        data: expect.anything(),
      },
    });
  });

  it.each(["reportId", "uploadedByUserId", "uploadKey"])(
    "marks %s immutable",
    (path) => {
      expect(reportImageSchema.path(path).options.immutable).toBe(true);
    },
  );

  it.each(REPORT_IMAGE_CONTENT_TYPES)("accepts %s", async (contentType) => {
    await expect(
      reportImage({ contentType }).validate(),
    ).resolves.toBeUndefined();
  });

  it("rejects content outside the supported image types", async () => {
    await expect(
      reportImage({ contentType: "image/gif" }).validate(),
    ).rejects.toMatchObject({ errors: { contentType: expect.anything() } });
    expect(reportImageSchema.path("contentType").options.enum).toEqual(
      REPORT_IMAGE_CONTENT_TYPES,
    );
  });

  it.each([1, REPORT_IMAGE_MAX_BYTES])(
    "accepts byte length %s",
    async (byteLength) => {
      await expect(
        reportImage({ byteLength }).validate(),
      ).resolves.toBeUndefined();
    },
  );

  it.each([0, 1.5, REPORT_IMAGE_MAX_BYTES + 1])(
    "rejects byte length %s",
    async (byteLength) => {
      await expect(
        reportImage({ byteLength }).validate(),
      ).rejects.toMatchObject({ errors: { byteLength: expect.anything() } });
    },
  );

  it("stores bounded Buffer data", async () => {
    const maximum = reportImage({ data: Buffer.alloc(REPORT_IMAGE_MAX_BYTES) });

    expect(reportImageSchema.path("data").instance).toBe("Buffer");
    expect(Buffer.isBuffer(maximum.data)).toBe(true);
    await expect(maximum.validate()).resolves.toBeUndefined();
    await expect(
      reportImage({ data: Buffer.alloc(REPORT_IMAGE_MAX_BYTES + 1) }).validate(),
    ).rejects.toMatchObject({ errors: { data: expect.anything() } });
  });

  it.each(["uploadedByUserId", "uploadKey", "data"])(
    "hides %s by default",
    (path) => {
      expect(reportImageSchema.path(path).options.select).toBe(false);
    },
  );

  it("uses only a created timestamp in the reportImages collection", () => {
    expect(reportImageSchema.get("collection")).toBe("reportImages");
    expect(reportImageSchema.get("timestamps")).toEqual({
      createdAt: true,
      updatedAt: false,
    });
    expect(reportImageSchema.path("createdAt").instance).toBe("Date");
    expect(reportImageSchema.path("updatedAt")).toBeUndefined();
    expect(Object.keys(reportImageSchema.paths).sort()).toEqual(
      [
        "__v",
        "_id",
        "byteLength",
        "contentType",
        "createdAt",
        "data",
        "reportId",
        "uploadKey",
        "uploadedByUserId",
      ].sort(),
    );
  });

  it("defines the named retry and ordered report indexes", () => {
    expect(REPORT_IMAGE_UPLOAD_KEY_INDEX).toBe(
      "report_image_report_upload_key_unique",
    );
    expect(reportImageSchema.indexes()).toHaveLength(2);
    expect(reportImageSchema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { reportId: 1, uploadKey: 1 },
          expect.objectContaining({
            name: REPORT_IMAGE_UPLOAD_KEY_INDEX,
            unique: true,
          }),
        ],
        [
          { reportId: 1, createdAt: 1, _id: 1 },
          expect.any(Object),
        ],
      ]),
    );
  });
});
