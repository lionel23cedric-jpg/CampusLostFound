import { z } from "zod";

import { CLAIM_STATUSES } from "@/models/claim";

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Must be a valid ObjectId");
const positiveInteger = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(Number.MAX_SAFE_INTEGER));
const claimAnswerSchema = z
  .string()
  .transform((value) =>
    value.replace(/^[\p{White_Space}\uFEFF]+|[\p{White_Space}\uFEFF]+$/gu, ""),
  )
  .pipe(z.string().min(1).max(500));

const responseSchema = z.strictObject({
  questionIndex: z.number().int().min(0).max(4),
  answer: claimAnswerSchema,
});

export const createClaimSchema = z
  .strictObject({
    responses: z.array(responseSchema).min(1).max(5),
  })
  .superRefine(({ responses }, context) => {
    const indexes = responses
      .map(({ questionIndex }) => questionIndex)
      .sort((a, b) => a - b);
    if (indexes.some((value, index) => value !== index)) {
      context.addIssue({
        code: "custom",
        path: ["responses"],
        message: "Response indexes must be unique and contiguous from zero",
      });
    }
  });
export type CreateClaimInput = z.infer<typeof createClaimSchema>;

const reviewNoteSchema = z
  .union([z.string().trim().max(1000), z.null()])
  .optional()
  .transform((value) =>
    value === undefined || value === "" ? null : value,
  );
export const claimDecisionSchema = z.strictObject({
  decision: z.enum(["approve", "reject"]),
  reviewNote: reviewNoteSchema,
});
export type ClaimDecisionInput = z.infer<typeof claimDecisionSchema>;

export const emptyClaimBodySchema = z.strictObject({});
export const claimIdSchema = objectIdSchema;

export const claimListQuerySchema = z.strictObject({
  status: z.enum(CLAIM_STATUSES).optional(),
  page: positiveInteger.pipe(z.number().max(10_000)).default(1),
  pageSize: positiveInteger.pipe(z.number().max(50)).default(20),
});
export type ClaimListQuery = z.output<typeof claimListQuerySchema>;

export function toClaimListQueryInput(searchParams: URLSearchParams) {
  const input: Record<string, string | string[]> = {};
  for (const [key, value] of searchParams) {
    const current = input[key];
    input[key] =
      current === undefined
        ? value
        : Array.isArray(current)
          ? [...current, value]
          : [current, value];
  }
  return input;
}
