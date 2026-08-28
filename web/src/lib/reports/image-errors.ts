const reportImageErrorDefinitions = {
  IMAGE_REQUIRED: { message: "Image is required", status: 400 },
  IMAGE_TYPE_UNSUPPORTED: {
    message: "Image type is not supported",
    status: 400,
  },
  IMAGE_TOO_LARGE: { message: "Image is too large", status: 413 },
  IMAGE_CONTENT_INVALID: {
    message: "Image content is invalid",
    status: 400,
  },
  IMAGE_LIMIT_REACHED: {
    message: "Report image limit reached",
    status: 409,
  },
  REPORT_IMAGE_CONFLICT: {
    message: "Report image upload conflicts with an existing image",
    status: 409,
  },
  REPORT_IMAGE_FORBIDDEN: {
    message: "Report image action is not permitted",
    status: 403,
  },
  REPORT_NOT_FOUND: { message: "Report not found", status: 404 },
  REPORT_IMAGE_NOT_FOUND: {
    message: "Report image not found",
    status: 404,
  },
  AUTHENTICATION_REQUIRED: {
    message: "Authentication required",
    status: 401,
  },
  ACCOUNT_UNAVAILABLE: {
    message: "Account is unavailable",
    status: 403,
  },
  IMAGE_REQUEST_FAILED: {
    message: "Unable to process image request",
    status: 500,
  },
} as const;

export type ReportImageErrorCode = keyof typeof reportImageErrorDefinitions;

function safeFields(
  code: ReportImageErrorCode,
  fields?: Record<string, string[]>,
) {
  if (!fields) return undefined;

  const safe: Record<string, string[]> = {};
  for (const field of ["image", "uploadKey"] as const) {
    const messages = fields[field];
    if (
      Array.isArray(messages) &&
      messages.length > 0 &&
      messages.every((message) => typeof message === "string")
    ) {
      safe[field] = [
        field === "image"
          ? reportImageErrorDefinitions[code].message
          : "Upload key is invalid",
      ];
    }
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
}

export class ReportImageError extends Error {
  readonly code: ReportImageErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string[]>;

  constructor(
    code: ReportImageErrorCode,
    fields?: Record<string, string[]>,
  ) {
    const definition = reportImageErrorDefinitions[code];
    super(definition.message);
    this.name = "ReportImageError";
    this.code = code;
    this.status = definition.status;
    this.fields = safeFields(code, fields);
  }
}

export function reportImageErrorResponse(error: unknown): Response {
  const imageError = error instanceof ReportImageError ? error : undefined;
  const safeError =
    imageError !== undefined &&
    Object.hasOwn(reportImageErrorDefinitions, imageError.code)
      ? new ReportImageError(imageError.code, imageError.fields)
      : new ReportImageError("IMAGE_REQUEST_FAILED");

  return Response.json(
    {
      error: {
        code: safeError.code,
        message: safeError.message,
        ...(safeError.fields ? { fields: safeError.fields } : {}),
      },
    },
    { status: safeError.status },
  );
}
