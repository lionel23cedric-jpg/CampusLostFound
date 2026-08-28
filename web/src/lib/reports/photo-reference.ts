import { z } from "zod";

export const REPORT_IMAGE_LIMIT = 5;
export const REPORT_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const REPORT_IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const INTERNAL_REPORT_IMAGE_PATH =
  /^\/api\/report-images\/([a-f\d]{24})$/i;

export function isInternalReportImagePath(value: string): boolean {
  return INTERNAL_REPORT_IMAGE_PATH.test(value);
}

export function internalReportImagePath(imageId: string): string {
  const path = `/api/report-images/${imageId}`;
  if (!isInternalReportImagePath(path)) {
    throw new Error("Report image ID must be a valid ObjectId");
  }
  return path;
}

export function isLegacyHttpsPhotoUrl(value: string): boolean {
  if (typeof value !== "string" || value.trim() !== value) return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

export function isReportPhotoReference(value: string): boolean {
  return (
    isInternalReportImagePath(value) || isLegacyHttpsPhotoUrl(value)
  );
}

export const reportPhotoReferenceSchema: z.ZodType<string> = z
  .string()
  .refine(isReportPhotoReference, {
    message:
      "Photo reference must be a report image path or credential-free HTTPS URL",
  });
