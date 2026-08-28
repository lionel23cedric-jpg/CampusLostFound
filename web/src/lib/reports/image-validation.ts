import {
  REPORT_IMAGE_CONTENT_TYPES,
  REPORT_IMAGE_MAX_BYTES,
} from "./photo-reference";
import { ReportImageError } from "./image-errors";

type ReportImageContentType = (typeof REPORT_IMAGE_CONTENT_TYPES)[number];

export type ValidatedReportImage = {
  contentType: ReportImageContentType;
  byteLength: number;
  data: Buffer;
};

const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const RIFF_SIGNATURE = Buffer.from("RIFF", "ascii");
const WEBP_SIGNATURE = Buffer.from("WEBP", "ascii");

function hasSignature(data: Buffer, signature: Buffer, offset = 0) {
  return (
    data.length >= offset + signature.length &&
    data.subarray(offset, offset + signature.length).equals(signature)
  );
}

function detectContentType(data: Buffer): ReportImageContentType | null {
  if (hasSignature(data, JPEG_SIGNATURE)) return "image/jpeg";
  if (hasSignature(data, PNG_SIGNATURE)) return "image/png";
  if (
    hasSignature(data, RIFF_SIGNATURE) &&
    hasSignature(data, WEBP_SIGNATURE, 8)
  ) {
    return "image/webp";
  }
  return null;
}

function isSupportedContentType(
  value: string,
): value is ReportImageContentType {
  return REPORT_IMAGE_CONTENT_TYPES.some((contentType) => contentType === value);
}

function invalidImage(
  code:
    | "IMAGE_REQUIRED"
    | "IMAGE_TYPE_UNSUPPORTED"
    | "IMAGE_TOO_LARGE"
    | "IMAGE_CONTENT_INVALID",
) {
  const error = new ReportImageError(code);
  return new ReportImageError(code, { image: [error.message] });
}

export async function readAndValidateReportImageFile(
  file: File,
): Promise<ValidatedReportImage> {
  if (!(file instanceof File) || file.size === 0) {
    throw invalidImage("IMAGE_REQUIRED");
  }
  if (file.size > REPORT_IMAGE_MAX_BYTES) {
    throw invalidImage("IMAGE_TOO_LARGE");
  }
  if (!isSupportedContentType(file.type)) {
    throw invalidImage("IMAGE_TYPE_UNSUPPORTED");
  }

  let data: Buffer;
  try {
    data = Buffer.from(await file.arrayBuffer());
  } catch {
    throw invalidImage("IMAGE_CONTENT_INVALID");
  }

  if (data.length === 0) throw invalidImage("IMAGE_REQUIRED");
  if (data.length > REPORT_IMAGE_MAX_BYTES) {
    throw invalidImage("IMAGE_TOO_LARGE");
  }

  const contentType = detectContentType(data);
  if (contentType === null || contentType !== file.type) {
    throw invalidImage("IMAGE_CONTENT_INVALID");
  }

  return { contentType, byteLength: data.length, data };
}
