import { z } from "zod";

import {
  CLAIM_STATUSES,
  ClaimBrowserError,
  type ClaimPagination,
  type ClaimReportSummary,
  type ClaimStatus,
} from "./browser-client";

const GENERIC_MESSAGE = "We could not complete that request. Please try again.";
const NETWORK_MESSAGE = "We could not reach the service. Please try again.";
const STAFF_VALIDATION_MESSAGE =
  "Review the decision and internal note, then try again.";

const STAFF_ERROR_CODES = [
  "VALIDATION_ERROR",
  "AUTHENTICATION_REQUIRED",
  "CLAIM_FORBIDDEN",
  "CLAIM_NOT_FOUND",
  "CLAIM_ALREADY_EXISTS",
  "REPORT_NOT_CLAIMABLE",
  "CLAIM_STATE_CONFLICT",
  "CLAIM_OPERATION_FAILED",
] as const;

type StaffErrorCode = (typeof STAFF_ERROR_CODES)[number];

const staffErrorDefinitions = {
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
  StaffErrorCode,
  { status: number; message: string }
>;

export type StaffClaimant = {
  id: string;
  email: string;
  displayName: string;
  preferredContactMethod: "in_app" | "email";
};

export type StaffVerificationSummary = {
  questionCount: number;
  matchedCount: number;
};

export type StaffClaimSummary = {
  id: string;
  report: ClaimReportSummary;
  status: ClaimStatus;
  reviewedAt: string | null;
  withdrawnAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  claimant: StaffClaimant;
  verification: StaffVerificationSummary;
  reviewedBy: string | null;
};

export type StaffClaimDetail = StaffClaimSummary & {
  reviewNote: string | null;
  responses: Array<{
    questionIndex: number;
    question: string;
    answer: string;
    matched: boolean;
  }>;
};

export type StaffClaimPage = {
  claims: StaffClaimSummary[];
  pagination: ClaimPagination;
};

export type StaffClaimsRequest = { status?: ClaimStatus; page?: number };

export type StaffClaimDecision = {
  decision: "approve" | "reject";
  reviewNote: string | null;
};

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const dateTimeSchema = z.string().datetime({ offset: true });

const verificationSchema = z
  .strictObject({
    questionCount: z.number().int().min(1).max(5),
    matchedCount: z.number().int().min(0).max(5),
  })
  .superRefine(({ questionCount, matchedCount }, context) => {
    if (matchedCount > questionCount) {
      context.addIssue({
        code: "custom",
        path: ["matchedCount"],
        message: "Matched count exceeds question count",
      });
    }
  }) satisfies z.ZodType<StaffVerificationSummary>;

const reportSummarySchema = z.strictObject({
  id: objectIdSchema,
  title: z.string(),
  reportType: z.enum(["lost", "found"]),
  status: z.enum(["open", "claim_pending", "resolved", "closed"]),
}) satisfies z.ZodType<ClaimReportSummary>;

const claimantSchema = z.strictObject({
  id: objectIdSchema,
  email: z.string().email(),
  displayName: z.string().min(1),
  preferredContactMethod: z.enum(["in_app", "email"]),
}) satisfies z.ZodType<StaffClaimant>;

const paginationSchema = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(50),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
}) satisfies z.ZodType<ClaimPagination>;

const staffSummarySchema = z.strictObject({
  id: objectIdSchema,
  report: reportSummarySchema,
  status: z.enum(CLAIM_STATUSES),
  reviewedAt: dateTimeSchema.nullable(),
  withdrawnAt: dateTimeSchema.nullable(),
  completedAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
  claimant: claimantSchema,
  verification: verificationSchema,
  reviewedBy: objectIdSchema.nullable(),
}) satisfies z.ZodType<StaffClaimSummary>;

const responseSchema = z.strictObject({
  questionIndex: z.number().int().min(0).max(4),
  question: z.string().min(5).max(200),
  answer: z.string().min(1).max(500),
  matched: z.boolean(),
});

const staffDetailSchema = staffSummarySchema
  .extend({
    reviewNote: z.string().max(1000).nullable(),
    responses: z.array(responseSchema).min(1).max(5),
  })
  .superRefine(({ responses, verification }, context) => {
    if (
      responses.length !== verification.questionCount ||
      responses.some(({ questionIndex }, index) => questionIndex !== index) ||
      responses.filter(({ matched }) => matched).length !==
        verification.matchedCount
    ) {
      context.addIssue({
        code: "custom",
        path: ["responses"],
        message: "Verification evidence is inconsistent",
      });
    }
  }) satisfies z.ZodType<StaffClaimDetail>;

const staffClaimPageSchema = z.strictObject({
  claims: z.array(staffSummarySchema),
  pagination: paginationSchema,
}) satisfies z.ZodType<StaffClaimPage>;

const staffClaimResponseSchema = z.strictObject({
  claim: staffDetailSchema,
});

const errorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(STAFF_ERROR_CODES),
    message: z.string().min(1),
    fields: z
      .strictObject({
        decision: z.array(z.string()).min(1).optional(),
        reviewNote: z.array(z.string()).min(1).optional(),
      })
      .refine(
        ({ decision, reviewNote }) =>
          decision !== undefined || reviewNote !== undefined,
      )
      .optional(),
  }),
});

function requestFailed(status: number) {
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
    throw requestFailed(response.status);
  }

  if (!response.ok) {
    const parsed = errorResponseSchema.safeParse(body);
    if (!parsed.success) throw requestFailed(response.status);

    const definition = staffErrorDefinitions[parsed.data.error.code];
    if (
      response.status !== definition.status ||
      (parsed.data.error.code !== "VALIDATION_ERROR" &&
        parsed.data.error.fields !== undefined)
    ) {
      throw requestFailed(response.status);
    }

    throw new ClaimBrowserError({
      code: parsed.data.error.code,
      status: response.status,
      message: definition.message,
      fields:
        parsed.data.error.code === "VALIDATION_ERROR" &&
        parsed.data.error.fields !== undefined
          ? { form: [STAFF_VALIDATION_MESSAGE] }
          : undefined,
    });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) throw requestFailed(response.status);
  return parsed.data;
}

export async function getStaffClaims(
  input: StaffClaimsRequest,
): Promise<StaffClaimPage> {
  const search = new URLSearchParams();
  if (input.status && input.status !== "pending") {
    search.set("status", input.status);
  }
  if (input.page && input.page !== 1) search.set("page", String(input.page));
  const query = search.toString();
  const response = await fetchSameOrigin(
    query ? `/api/staff/claims?${query}` : "/api/staff/claims",
    { method: "GET" },
  );
  return parseResponse(response, staffClaimPageSchema);
}

export async function getStaffClaim(
  claimId: string,
): Promise<StaffClaimDetail> {
  const response = await fetchSameOrigin(
    `/api/staff/claims/${encodeURIComponent(claimId)}`,
    { method: "GET" },
  );
  return (await parseResponse(response, staffClaimResponseSchema)).claim;
}

export async function decideStaffClaim(
  claimId: string,
  input: StaffClaimDecision,
): Promise<StaffClaimDetail> {
  const response = await fetchSameOrigin(
    `/api/staff/claims/${encodeURIComponent(claimId)}/decision`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision: input.decision,
        reviewNote: input.reviewNote,
      }),
    },
  );
  return (await parseResponse(response, staffClaimResponseSchema)).claim;
}

export async function completeStaffClaim(
  claimId: string,
): Promise<StaffClaimDetail> {
  const response = await fetchSameOrigin(
    `/api/staff/claims/${encodeURIComponent(claimId)}/complete`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
  return (await parseResponse(response, staffClaimResponseSchema)).claim;
}
