import { describe, expect, it } from "vitest";

import { ReportImageError, reportImageErrorResponse } from "./image-errors";

const knownErrors = [
  ["IMAGE_REQUIRED", 400],
  ["IMAGE_TYPE_UNSUPPORTED", 400],
  ["IMAGE_TOO_LARGE", 413],
  ["IMAGE_CONTENT_INVALID", 400],
  ["IMAGE_LIMIT_REACHED", 409],
  ["REPORT_IMAGE_CONFLICT", 409],
  ["REPORT_IMAGE_FORBIDDEN", 403],
  ["REPORT_NOT_FOUND", 404],
  ["REPORT_IMAGE_NOT_FOUND", 404],
  ["AUTHENTICATION_REQUIRED", 401],
  ["ACCOUNT_UNAVAILABLE", 403],
] as const;

describe("report image errors", () => {
  it.each(knownErrors)("maps %s to %s", async (code, status) => {
    const error = new ReportImageError(code);
    const response = reportImageErrorResponse(error);

    expect(error).toMatchObject({
      name: "ReportImageError",
      code,
      status,
    });
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({
      error: { code, message: error.message },
    });
  });

  it("keeps field errors limited to image and uploadKey", async () => {
    const response = reportImageErrorResponse(
      new ReportImageError("IMAGE_CONTENT_INVALID", {
        image: ["PRIVATE-campus-location-image.bin FF D8 FF"],
        uploadKey: ["PRIVATE raw UUID"],
        filename: ["PRIVATE-campus-location-image.bin"],
        database: ["PRIVATE-MONGODB-HOST"],
      }),
    );

    await expect(response.json()).resolves.toEqual({
      error: {
        code: "IMAGE_CONTENT_INVALID",
        message: "Image content is invalid",
        fields: {
          image: ["Image content is invalid"],
          uploadKey: ["Upload key is invalid"],
        },
      },
    });
  });

  it("rebuilds canonical details for a mutated known error", async () => {
    const failure = new ReportImageError("REPORT_IMAGE_NOT_FOUND");
    failure.message = "PRIVATE image document and database host";
    Reflect.set(failure, "status", 299);

    const response = reportImageErrorResponse(failure);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "REPORT_IMAGE_NOT_FOUND",
        message: "Report image not found",
      },
    });
  });

  it.each([
    new Error(
      "PRIVATE-campus-location-image.bin FF D8 FF stack MongoServerError database",
    ),
    {
      code: "REPORT_NOT_FOUND",
      status: 404,
      message: "PRIVATE forged model detail",
      data: Buffer.from([0xff, 0xd8, 0xff]),
    },
    "PRIVATE raw failure",
  ])("closes an unknown failure", async (failure) => {
    const response = reportImageErrorResponse(failure);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: {
        code: "IMAGE_REQUEST_FAILED",
        message: "Unable to process image request",
      },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /PRIVATE|FF D8 FF|stack|MongoServerError|database|model detail/i,
    );
  });

  it("closes an image error with a forged code", async () => {
    const failure = new ReportImageError("REPORT_NOT_FOUND");
    Reflect.set(failure, "code", "toString");
    failure.message = "PRIVATE inherited definition";

    const response = reportImageErrorResponse(failure);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "IMAGE_REQUEST_FAILED",
        message: "Unable to process image request",
      },
    });
  });
});
