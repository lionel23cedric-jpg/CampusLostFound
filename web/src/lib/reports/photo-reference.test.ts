import { describe, expect, it } from "vitest";

import {
  internalReportImagePath,
  isInternalReportImagePath,
  isLegacyHttpsPhotoUrl,
  isReportPhotoReference,
  reportPhotoReferenceSchema,
} from "./photo-reference";

const imageId = "64f0123456789abcdef01234";
const internalPath = `/api/report-images/${imageId}`;
const legacyUrl = "https://example.test/photo.jpg";

describe("report photo references", () => {
  it("accepts the canonical internal report-image path", () => {
    expect(isInternalReportImagePath(internalPath)).toBe(true);
    expect(isReportPhotoReference(internalPath)).toBe(true);
    expect(reportPhotoReferenceSchema.parse(internalPath)).toBe(internalPath);
  });

  it.each([
    "/api/report-images/not-an-object-id",
    `${internalPath}?download=1`,
    `${internalPath}#preview`,
    `${internalPath}/`,
    "/api/report-images/%2F64f0123456789abcdef01234",
    `/api/reports/${imageId}`,
  ])("rejects a non-canonical internal path: %s", (value) => {
    expect(isInternalReportImagePath(value)).toBe(false);
    expect(isReportPhotoReference(value)).toBe(false);
    expect(reportPhotoReferenceSchema.safeParse(value).success).toBe(false);
  });

  it("builds an internal path only from a valid ObjectId", () => {
    expect(internalReportImagePath(imageId)).toBe(internalPath);
    expect(() => internalReportImagePath("not-an-object-id")).toThrow();
  });

  it("accepts a legacy HTTPS URL", () => {
    expect(isLegacyHttpsPhotoUrl(legacyUrl)).toBe(true);
    expect(isReportPhotoReference(legacyUrl)).toBe(true);
    expect(reportPhotoReferenceSchema.parse(legacyUrl)).toBe(legacyUrl);
  });

  it.each([
    "http://example.test/photo.jpg",
    "data:image/png;base64,AAAA",
    "blob:https://example.test/1234",
    "javascript:alert(1)",
    "//example.test/photo.jpg",
    "https://student:secret@example.test/photo.jpg",
    " https://example.test/photo.jpg ",
  ])("rejects an unsafe legacy reference: %s", (value) => {
    expect(isLegacyHttpsPhotoUrl(value)).toBe(false);
    expect(isReportPhotoReference(value)).toBe(false);
    expect(reportPhotoReferenceSchema.safeParse(value).success).toBe(false);
  });
});
