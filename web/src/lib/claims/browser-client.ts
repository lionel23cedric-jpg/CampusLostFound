import { z } from "zod";

const GENERIC_MESSAGE = "We could not complete that request. Please try again.";
const NETWORK_MESSAGE = "We could not reach the service. Please try again.";
const VALIDATION_RESPONSES_MESSAGE = "Check every answer and try again.";

const CLAIM_ERROR_CODES = [
  "VALIDATION_ERROR",
  "AUTHENTICATION_REQUIRED",
  "CLAIM_FORBIDDEN",
  "CLAIM_NOT_FOUND",
  "CLAIM_ALREADY_EXISTS",
  "REPORT_NOT_CLAIMABLE",
  "CLAIM_STATE_CONFLICT",
  "CLAIM_OPERATION_FAILED",
] as const;

type ClaimErrorCode = (typeof CLAIM_ERROR_CODES)[number];

const claimErrorDefinitions = {
  VALIDATION_ERROR: { status: 400, message: "Invalid claim request" },
  AUTHENTICATION_REQUIRED: { status: 401, message: "Authentication required" },
  CLAIM_FORBIDDEN: { status: 403, message: "Claim action is not permitted" },
  CLAIM_NOT_FOUND: { status: 404, message: "Claim not found" },
  CLAIM_ALREADY_EXISTS: {
    status: 409,
    message: "An active claim already exists",
  },
  REPORT_NOT_CLAIMABLE: {
    status: 409,
    message: "Report is not available for claiming",
  },
  CLAIM_STATE_CONFLICT: { status: 409, message: "Claim state has changed" },
  CLAIM_OPERATION_FAILED: { status: 500, message: "Claim operation failed" },
} as const satisfies Record<
  ClaimErrorCode,
  { status: number; message: string }
>;

export const CLAIM_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "withdrawn",
  "completed",
] as const;

export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export type ClaimReportSummary = {
  id: string;
  title: string;
  reportType: "lost" | "found";
  status: "open" | "claim_pending" | "resolved" | "closed";
};

export type ClaimantClaim = {
  id: string;
  report: ClaimReportSummary;
  status: ClaimStatus;
  reviewedAt: string | null;
  withdrawnAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClaimPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ClaimPage = {
  claims: ClaimantClaim[];
  pagination: ClaimPagination;
};

export type ClaimQuestion = {
  questionIndex: number;
  question: string;
};

export type ClaimQuestions = {
  report: { id: string; title: string; reportType: "found" };
  questions: ClaimQuestion[];
};

export type ClaimAnswer = {
  questionIndex: number;
  answer: string;
};

export type MyClaimsRequest = {
  status?: ClaimStatus;
  page?: number;
};

const dateTimeSchema = z.string().datetime({ offset: true });

const reportSummarySchema = z.strictObject({
  id: z.string().min(1),
  title: z.string(),
  reportType: z.enum(["lost", "found"]),
  status: z.enum(["open", "claim_pending", "resolved", "closed"]),
}) satisfies z.ZodType<ClaimReportSummary>;

const claimantClaimSchema = z.strictObject({
  id: z.string().min(1),
  report: reportSummarySchema,
  status: z.enum(CLAIM_STATUSES),
  reviewedAt: dateTimeSchema.nullable(),
  withdrawnAt: dateTimeSchema.nullable(),
  completedAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
}) satisfies z.ZodType<ClaimantClaim>;

const paginationSchema = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
}) satisfies z.ZodType<ClaimPagination>;

const questionSchema = z.strictObject({
  questionIndex: z.number().int().min(0).max(4),
  question: z.string().min(1),
});

const questionsSchema = z
  .array(questionSchema)
  .min(1)
  .max(5)
  .superRefine((questions, context) => {
    if (questions.some(({ questionIndex }, index) => questionIndex !== index)) {
      context.addIssue({
        code: "custom",
        message: "Question indexes must be contiguous and ordered",
      });
    }
  });

const claimQuestionsSchema = z.strictObject({
  report: z.strictObject({
    id: z.string().min(1),
    title: z.string(),
    reportType: z.literal("found"),
  }),
  questions: questionsSchema,
}) satisfies z.ZodType<ClaimQuestions>;

const claimResponseSchema = z.strictObject({
  claim: claimantClaimSchema,
});

const claimPageSchema = z.strictObject({
  claims: z.array(claimantClaimSchema),
  pagination: paginationSchema,
}) satisfies z.ZodType<ClaimPage>;

const errorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(CLAIM_ERROR_CODES),
    message: z.string().min(1),
    fields: z
      .strictObject({ responses: z.array(z.string()).min(1).optional() })
      .optional(),
  }),
});

export class ClaimBrowserError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields?: Record<string, string[]>;

  constructor(options: {
    code: string;
    status: number;
    message: string;
    fields?: Record<string, string[]>;
  }) {
    super(options.message);
    this.name = "ClaimBrowserError";
    this.code = options.code;
    this.status = options.status;
    this.fields = options.fields;
  }
}

function requestFailedError(status: number) {
  return new ClaimBrowserError({
    code: "REQUEST_FAILED",
    status,
    message: GENERIC_MESSAGE,
  });
}

async function fetchSameOrigin(path: string, init: RequestInit) {
  try {
    return await fetch(path, { ...init, credentials: "same-origin" });
  } catch {
    throw new ClaimBrowserError({
      code: "NETWORK_ERROR",
      status: 0,
      message: NETWORK_MESSAGE,
    });
  }
}

async function parseResponse<T>(response: Response, schema: z.ZodType<T>) {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw requestFailedError(response.status);
  }

  if (!response.ok) {
    const parsed = errorResponseSchema.safeParse(body);
    if (!parsed.success) throw requestFailedError(response.status);

    const definition = claimErrorDefinitions[parsed.data.error.code];
    if (
      response.status !== definition.status ||
      (parsed.data.error.code !== "VALIDATION_ERROR" &&
        parsed.data.error.fields !== undefined)
    ) {
      throw requestFailedError(response.status);
    }

    const fields = parsed.data.error.fields?.responses
      ? { responses: [VALIDATION_RESPONSES_MESSAGE] }
      : undefined;

    throw new ClaimBrowserError({
      code: parsed.data.error.code,
      status: response.status,
      message: definition.message,
      fields,
    });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) throw requestFailedError(response.status);
  return parsed.data;
}

export async function getClaimQuestionsForReport(
  reportId: string,
): Promise<ClaimQuestions> {
  const response = await fetchSameOrigin(
    `/api/reports/${encodeURIComponent(reportId)}/claim-questions`,
    { method: "GET" },
  );
  return parseResponse(response, claimQuestionsSchema);
}

export async function submitClaim(
  reportId: string,
  responses: ClaimAnswer[],
): Promise<ClaimantClaim> {
  const response = await fetchSameOrigin(
    `/api/reports/${encodeURIComponent(reportId)}/claims`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        responses: responses.map(({ questionIndex, answer }) => ({
          questionIndex,
          answer,
        })),
      }),
    },
  );
  return (await parseResponse(response, claimResponseSchema)).claim;
}

export async function getMyClaims(
  input: MyClaimsRequest,
): Promise<ClaimPage> {
  const search = new URLSearchParams();
  if (input.status) search.set("status", input.status);
  if (input.page && input.page !== 1) search.set("page", String(input.page));
  const query = search.toString();
  const response = await fetchSameOrigin(
    query ? `/api/claims/mine?${query}` : "/api/claims/mine",
    { method: "GET" },
  );
  return parseResponse(response, claimPageSchema);
}

export async function getMyClaim(claimId: string): Promise<ClaimantClaim> {
  const response = await fetchSameOrigin(
    `/api/claims/${encodeURIComponent(claimId)}`,
    { method: "GET" },
  );
  return (await parseResponse(response, claimResponseSchema)).claim;
}

export async function withdrawMyClaim(
  claimId: string,
): Promise<ClaimantClaim> {
  const response = await fetchSameOrigin(
    `/api/claims/${encodeURIComponent(claimId)}/withdraw`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
  return (await parseResponse(response, claimResponseSchema)).claim;
}
