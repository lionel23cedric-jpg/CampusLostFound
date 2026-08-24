# Claim Management Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure, transactional Claim Management Backend that lets active students submit ownership claims for found reports and lets staff or administrators review, decide and complete those claims without exposing expected verification answers.

**Architecture:** Store workflow state in `Claim` and private claimant responses in a one-to-one `ClaimEvidence` document. Thin Next.js Route Handlers authenticate and validate, focused claimant/staff services enforce role and state transitions, MongoDB transactions coordinate Claim and ItemReport updates, and explicit role-specific mappers build every response.

**Tech Stack:** Next.js 16 App Router Route Handlers, TypeScript 5, Mongoose 9, MongoDB Atlas transactions and indexes, Zod 4, Vitest 4.

## Global Constraints

- Work only on `feature/issue-19-claim-management-backend`; never push, open a pull request, merge or delete the branch from an implementation task.
- Claimant endpoints require an authenticated active account whose role is exactly `student`; staff endpoints require role `staff` or `administrator`.
- Only another user's `found` report in `open` status with 1–5 verification questions is claimable.
- Allow multiple different pending claimants per report, but allow only one active claim per claimant/report pair.
- Use the exact workflow `pending -> approved -> completed`, `pending -> rejected`, and `pending|approved -> withdrawn`; reject every other transition with `CLAIM_STATE_CONFLICT`.
- Keep ItemReport `open` while claims are pending, set it to `claim_pending` on approval, reopen it when the approved claimant withdraws, and set it to `resolved` with `resolvedAt` on completion.
- Approval must reject all competing pending claims for the same report in the same transaction.
- Never return, copy into Claim data, log or test-fixture-leak a stored `expectedAnswer`; claimant responses and deterministic match booleans live only in `ClaimEvidence` and are hidden by default.
- Match answers only by Unicode NFKC normalisation, trim, internal-whitespace collapse, `en-NZ` locale lowercase and exact comparison; never auto-approve or auto-reject.
- Reuse `connectToDatabase`, `PublicUser`, the existing report/authentication models, Zod, Mongoose and Vitest; add no dependency and no speculative abstraction.
- Every request schema is strict, ObjectIds are 24 hexadecimal characters, response objects are mapped field by field, and unknown internal failures use the safe `CLAIM_OPERATION_FAILED` envelope.
- Tests mock database operations and never connect to Atlas, read `.env.local`, create real records or print credentials.
- Use TDD for every implementation task and commit only the exact files named by that task.
- Run `npm.cmd`, `npx.cmd` and source scans from `web`; run Git status, scope and commit commands from the repository root.

## File Map

- Create `web/src/models/claim.ts`: Claim workflow schema, status constants and concurrency/query indexes.
- Create `web/src/models/claim-evidence.ts`: one-to-one private response schema whose answer and match fields are hidden by default.
- Create `web/src/models/claim.test.ts`: Claim validation, hidden-field and index tests.
- Create `web/src/models/claim-evidence.test.ts`: evidence validation, hidden-field and unique-index tests.
- Create `web/src/lib/claims/verification.ts`: the single deterministic answer-normalisation and comparison implementation.
- Create `web/src/lib/claims/verification.test.ts`: Unicode, locale, whitespace and exact-match tests.
- Create `web/src/lib/claims/validation.ts`: strict body, ID and paginated-list schemas.
- Create `web/src/lib/claims/validation.test.ts`: accepted transformations, limits, duplicates, unknown fields and safe-offset tests.
- Create `web/src/lib/claims/errors.ts`: Claim domain errors plus safe validation/auth/domain response mapping.
- Create `web/src/lib/claims/errors.test.ts`: exact 400/401/403/404/409/500 contracts and disclosure regressions.
- Create `web/src/lib/claims/public-claim.ts`: claimant, staff-summary and staff-detail response mappers.
- Create `web/src/lib/claims/public-claim.test.ts`: exact role-specific shapes and injected-secret exclusion tests.
- Create `web/src/lib/claims/claimant-service.ts`: question retrieval, creation, own-list/detail and withdrawal operations.
- Create `web/src/lib/claims/claimant-service.test.ts`: mocked eligibility, transaction, duplicate, privacy and withdrawal coverage.
- Create `web/src/lib/claims/staff-service.ts`: review queue/detail, approve/reject and completion operations.
- Create `web/src/lib/claims/staff-service.test.ts`: mocked role, queue, evidence, competing-claim and transition coverage.
- Create `web/src/app/api/reports/[id]/claim-questions/route.ts`: claimant-safe question retrieval.
- Create `web/src/app/api/reports/[id]/claims/route.ts`: claim submission.
- Create `web/src/app/api/claims/mine/route.ts`: current claimant's paginated history.
- Create `web/src/app/api/claims/[id]/route.ts`: current claimant's safe claim detail.
- Create `web/src/app/api/claims/[id]/withdraw/route.ts`: strict empty-body withdrawal command.
- Create `web/src/app/api/claims/claimant-routes.test.ts`: consolidated claimant Route Handler contracts.
- Create `web/src/app/api/staff/claims/route.ts`: staff review queue.
- Create `web/src/app/api/staff/claims/[id]/route.ts`: staff-controlled claim/evidence detail.
- Create `web/src/app/api/staff/claims/[id]/decision/route.ts`: approve/reject command.
- Create `web/src/app/api/staff/claims/[id]/complete/route.ts`: strict empty-body completion command.
- Create `web/src/app/api/staff/claims/staff-claim-routes.test.ts`: consolidated staff Route Handler contracts.

---

### Task 1: Claim and ClaimEvidence models

**Files:**
- Create: `web/src/models/claim.ts`
- Create: `web/src/models/claim-evidence.ts`
- Create: `web/src/models/claim.test.ts`
- Create: `web/src/models/claim-evidence.test.ts`

**Interfaces:**
- Consumes: existing Mongoose model-cache convention and `User`/`ItemReport` references.
- Produces: `CLAIM_STATUSES`, `ClaimStatus`, `claimSchema`, `Claim`, `ClaimModel`, `claimEvidenceSchema`, `ClaimEvidence` and `ClaimEvidenceModel`.

- [ ] **Step 1: Write failing model tests**

Create `claim.test.ts` with real in-memory Mongoose document validation, not a database connection:

```ts
import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import { ClaimModel, claimSchema } from "./claim";

const reportId = new mongoose.Types.ObjectId();
const claimantId = new mongoose.Types.ObjectId();

describe("Claim model", () => {
  it("applies the pending workflow defaults", async () => {
    const claim = new ClaimModel({
      reportId,
      claimantId,
      activeClaimKey: `${reportId}:${claimantId}`,
      verificationQuestionCount: 2,
      verificationMatchedCount: 1,
    });

    await expect(claim.validate()).resolves.toBeUndefined();
    expect(claim.status).toBe("pending");
    expect(claim.reviewedBy).toBeNull();
    expect(claim.reviewedAt).toBeNull();
    expect(claim.reviewNote).toBeNull();
    expect(claim.completedAt).toBeNull();
    expect(claim.withdrawnAt).toBeNull();
  });

  it.each(["unknown", "cancelled"])("rejects status %s", async (status) => {
    const claim = new ClaimModel({
      reportId,
      claimantId,
      status,
      activeClaimKey: `${reportId}:${claimantId}`,
      verificationQuestionCount: 1,
      verificationMatchedCount: 0,
    });
    await expect(claim.validate()).rejects.toMatchObject({
      errors: { status: expect.anything() },
    });
  });

  it.each([
    [0, 0],
    [6, 0],
    [2, -1],
    [2, 3],
  ])("rejects question count %s with match count %s", async (questions, matches) => {
    const claim = new ClaimModel({
      reportId,
      claimantId,
      activeClaimKey: `${reportId}:${claimantId}`,
      verificationQuestionCount: questions,
      verificationMatchedCount: matches,
    });
    await expect(claim.validate()).rejects.toBeDefined();
  });

  it("defines claimant, queue, report and unique active-key indexes", () => {
    expect(claimSchema.indexes()).toEqual(expect.arrayContaining([
      [{ claimantId: 1, createdAt: -1 }, expect.any(Object)],
      [{ status: 1, createdAt: 1 }, expect.any(Object)],
      [{ reportId: 1, status: 1, createdAt: 1 }, expect.any(Object)],
      [
        { activeClaimKey: 1 },
        expect.objectContaining({
          unique: true,
          partialFilterExpression: { activeClaimKey: { $type: "string" } },
        }),
      ],
    ]));
  });

  it("hides aggregate matches and review notes by default", () => {
    expect(claimSchema.path("verificationMatchedCount").options.select).toBe(false);
    expect(claimSchema.path("reviewNote").options.select).toBe(false);
  });
});
```

Create `claim-evidence.test.ts`:

```ts
import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import { ClaimEvidenceModel, claimEvidenceSchema } from "./claim-evidence";

describe("ClaimEvidence model", () => {
  it("validates bounded response snapshots", async () => {
    const evidence = new ClaimEvidenceModel({
      claimId: new mongoose.Types.ObjectId(),
      responses: [{
        questionIndex: 0,
        question: "What mark is near the plug?",
        answer: "Small blue paint mark",
        matched: true,
      }],
    });
    await expect(evidence.validate()).resolves.toBeUndefined();
  });

  it.each([
    ["empty responses", []],
    ["negative index", [{ questionIndex: -1, question: "Valid question?", answer: "x", matched: false }]],
    ["short question", [{ questionIndex: 0, question: "bad", answer: "x", matched: false }]],
    ["long answer", [{ questionIndex: 0, question: "Valid question?", answer: "x".repeat(501), matched: false }]],
  ])("rejects %s", async (_case, responses) => {
    const evidence = new ClaimEvidenceModel({
      claimId: new mongoose.Types.ObjectId(),
      responses,
    });
    await expect(evidence.validate()).rejects.toBeDefined();
  });

  it("defines one evidence record per claim", () => {
    expect(claimEvidenceSchema.indexes()).toEqual(expect.arrayContaining([
      [{ claimId: 1 }, expect.objectContaining({ unique: true })],
    ]));
  });

  it("hides claimant answers and match booleans by default", () => {
    expect(claimEvidenceSchema.path("responses.answer").options.select).toBe(false);
    expect(claimEvidenceSchema.path("responses.matched").options.select).toBe(false);
  });
});
```

- [ ] **Step 2: Run the model tests and confirm the red state**

```powershell
npm.cmd test -- src/models/claim.test.ts src/models/claim-evidence.test.ts
```

Expected: FAIL because both model modules do not exist.

- [ ] **Step 3: Implement the Claim schema**

Create `claim.ts` with the complete schema and no transition logic:

```ts
import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

export const CLAIM_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "withdrawn",
  "completed",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const claimSchema = new Schema(
  {
    reportId: { type: Schema.Types.ObjectId, ref: "ItemReport", required: true },
    claimantId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: CLAIM_STATUSES, default: "pending", required: true },
    activeClaimKey: { type: String, trim: true, default: null },
    verificationQuestionCount: { type: Number, required: true, min: 1, max: 5 },
    verificationMatchedCount: {
      type: Number,
      required: true,
      min: 0,
      select: false,
      validate: {
        validator(this: { verificationQuestionCount?: number }, value: number) {
          return value <= (this.verificationQuestionCount ?? 0);
        },
        message: "Matched count cannot exceed question count",
      },
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, trim: true, maxlength: 1000, default: null, select: false },
    completedAt: { type: Date, default: null },
    withdrawnAt: { type: Date, default: null },
  },
  { collection: "claims", timestamps: true },
);

claimSchema.index({ claimantId: 1, createdAt: -1 });
claimSchema.index({ status: 1, createdAt: 1 });
claimSchema.index({ reportId: 1, status: 1, createdAt: 1 });
claimSchema.index(
  { activeClaimKey: 1 },
  { unique: true, partialFilterExpression: { activeClaimKey: { $type: "string" } } },
);

export type Claim = InferSchemaType<typeof claimSchema>;
export const ClaimModel =
  (models.Claim as Model<Claim> | undefined) ?? model<Claim>("Claim", claimSchema);
```

- [ ] **Step 4: Implement the ClaimEvidence schema**

Create `claim-evidence.ts`:

```ts
import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

const claimResponseSchema = new Schema(
  {
    questionIndex: { type: Number, required: true, min: 0, max: 4 },
    question: { type: String, required: true, trim: true, minlength: 5, maxlength: 200 },
    answer: { type: String, required: true, trim: true, minlength: 1, maxlength: 500, select: false },
    matched: { type: Boolean, required: true, select: false },
  },
  { _id: false },
);

export const claimEvidenceSchema = new Schema(
  {
    claimId: { type: Schema.Types.ObjectId, ref: "Claim", required: true },
    responses: {
      type: [claimResponseSchema],
      validate: {
        validator: (responses: unknown[]) => responses.length >= 1 && responses.length <= 5,
        message: "Provide between 1 and 5 claim responses",
      },
    },
  },
  { collection: "claimEvidence", timestamps: true },
);

claimEvidenceSchema.index({ claimId: 1 }, { unique: true });

export type ClaimEvidence = InferSchemaType<typeof claimEvidenceSchema>;
export const ClaimEvidenceModel =
  (models.ClaimEvidence as Model<ClaimEvidence> | undefined) ??
  model<ClaimEvidence>("ClaimEvidence", claimEvidenceSchema);
```

- [ ] **Step 5: Run focused verification**

```powershell
npm.cmd test -- src/models/claim.test.ts src/models/claim-evidence.test.ts
npx.cmd eslint src/models/claim.ts src/models/claim-evidence.ts src/models/claim.test.ts src/models/claim-evidence.test.ts
npx.cmd tsc --noEmit --incremental false
```

Expected: both model suites pass; ESLint and TypeScript exit 0.

- [ ] **Step 6: Commit only Task 1**

```powershell
git diff --check
git add web/src/models/claim.ts web/src/models/claim-evidence.ts web/src/models/claim.test.ts web/src/models/claim-evidence.test.ts
git diff --cached --check
git commit -m "feat(claims): add claim data models" -m "Refs #19"
```

---

### Task 2: Strict validation and deterministic answer matching

**Files:**
- Create: `web/src/lib/claims/verification.ts`
- Create: `web/src/lib/claims/verification.test.ts`
- Create: `web/src/lib/claims/validation.ts`
- Create: `web/src/lib/claims/validation.test.ts`

**Interfaces:**
- Consumes: `CLAIM_STATUSES`, Zod 4 and browser-standard `URLSearchParams`.
- Produces: `normaliseVerificationAnswer`, `matchesVerificationAnswer`, `claimIdSchema`, `createClaimSchema`, `CreateClaimInput`, `claimDecisionSchema`, `ClaimDecisionInput`, `emptyClaimBodySchema`, `claimListQuerySchema`, `ClaimListQuery` and `toClaimListQueryInput`.

- [ ] **Step 1: Write failing verification tests**

Create `verification.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { matchesVerificationAnswer, normaliseVerificationAnswer } from "./verification";

describe("claim verification matching", () => {
  it.each([
    ["  Small\tblue\nmark  ", "small blue mark"],
    ["ＢＬＵＥ", "blue"],
    ["CAFÉ", "café"],
  ])("normalises %j", (input, expected) => {
    expect(normaliseVerificationAnswer(input)).toBe(expected);
  });

  it("matches only after deterministic normalisation", () => {
    expect(matchesVerificationAnswer(" Small Blue Mark ", "small\tblue mark")).toBe(true);
    expect(matchesVerificationAnswer("blue mark", "blue marks")).toBe(false);
  });
});
```

- [ ] **Step 2: Write failing boundary-validation tests**

Create `validation.test.ts` and use this helper so duplicate query parameters remain arrays and are rejected by the strict schema:

```ts
import { describe, expect, it } from "vitest";
import {
  claimDecisionSchema,
  claimIdSchema,
  claimListQuerySchema,
  createClaimSchema,
  emptyClaimBodySchema,
  toClaimListQueryInput,
} from "./validation";

const response = (questionIndex: number, answer = "Blue paint mark") => ({ questionIndex, answer });
const parseQuery = (query = "") => claimListQuerySchema.safeParse(
  toClaimListQueryInput(new URLSearchParams(query)),
);

describe("claim validation", () => {
  it("trims valid responses without changing their indexes", () => {
    expect(createClaimSchema.parse({ responses: [response(0, "  Blue mark  ")] })).toEqual({
      responses: [response(0, "Blue mark")],
    });
  });

  it.each([
    ["empty responses", { responses: [] }],
    ["missing zero index", { responses: [response(1)] }],
    ["duplicate index", { responses: [response(0), response(0)] }],
    ["non-contiguous indexes", { responses: [response(0), response(2)] }],
    ["too many responses", { responses: [0, 1, 2, 3, 4, 5].map((index) => response(index)) }],
    ["blank answer", { responses: [response(0, " ")] }],
    ["long answer", { responses: [response(0, "x".repeat(501))] }],
    ["unknown body field", { responses: [response(0)], status: "approved" }],
  ])("rejects %s", (_case, input) => {
    expect(createClaimSchema.safeParse(input).success).toBe(false);
  });

  it("normalises a blank review note to null", () => {
    expect(claimDecisionSchema.parse({ decision: "approve", reviewNote: "  " })).toEqual({
      decision: "approve",
      reviewNote: null,
    });
  });

  it.each([
    {},
    { decision: "accept" },
    { decision: "reject", reviewNote: "x".repeat(1001) },
    { decision: "approve", reviewedBy: "client-owned" },
  ])("rejects malformed decisions %#", (input) => {
    expect(claimDecisionSchema.safeParse(input).success).toBe(false);
  });

  it("accepts only an empty command object", () => {
    expect(emptyClaimBodySchema.safeParse({}).success).toBe(true);
    expect(emptyClaimBodySchema.safeParse({ status: "withdrawn" }).success).toBe(false);
  });

  it("applies list defaults and transforms bounded values", () => {
    expect(parseQuery()).toEqual({ success: true, data: { page: 1, pageSize: 20 } });
    expect(parseQuery("status=pending&page=2&pageSize=50")).toEqual({
      success: true,
      data: { status: "pending", page: 2, pageSize: 50 },
    });
  });

  it.each([
    "status=unknown",
    "page=0",
    "page=1.5",
    "pageSize=51",
    "sort=createdAt",
    "status=pending&status=approved",
    `page=${Number.MAX_SAFE_INTEGER}&pageSize=50`,
  ])("rejects list query %s", (query) => {
    expect(parseQuery(query).success).toBe(false);
  });

  it("validates claim IDs", () => {
    expect(claimIdSchema.safeParse("64b64c6f2f4d9f1a2b3c4d54").success).toBe(true);
    expect(claimIdSchema.safeParse("not-an-id").success).toBe(false);
  });
});
```

- [ ] **Step 3: Run both test files and confirm the red state**

```powershell
npm.cmd test -- src/lib/claims/verification.test.ts src/lib/claims/validation.test.ts
```

Expected: FAIL because both implementation modules do not exist.

- [ ] **Step 4: Implement the single matching algorithm**

Create `verification.ts`:

```ts
export function normaliseVerificationAnswer(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en-NZ");
}

export function matchesVerificationAnswer(expected: string, submitted: string) {
  return normaliseVerificationAnswer(expected) === normaliseVerificationAnswer(submitted);
}
```

- [ ] **Step 5: Implement all strict Claim schemas**

Create `validation.ts`:

```ts
import { z } from "zod";
import { CLAIM_STATUSES } from "@/models/claim";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Must be a valid ObjectId");
const positiveInteger = z.string().regex(/^[1-9]\d*$/).transform(Number)
  .pipe(z.number().int().min(1).max(Number.MAX_SAFE_INTEGER));

const responseSchema = z.strictObject({
  questionIndex: z.number().int().min(0).max(4),
  answer: z.string().trim().min(1).max(500),
});

export const createClaimSchema = z.strictObject({
  responses: z.array(responseSchema).min(1).max(5),
}).superRefine(({ responses }, context) => {
  const indexes = responses.map(({ questionIndex }) => questionIndex).sort((a, b) => a - b);
  if (indexes.some((value, index) => value !== index)) {
    context.addIssue({
      code: "custom",
      path: ["responses"],
      message: "Response indexes must be unique and contiguous from zero",
    });
  }
});
export type CreateClaimInput = z.infer<typeof createClaimSchema>;

const reviewNoteSchema = z.union([z.string().trim().max(1000), z.null()])
  .optional()
  .transform((value) => value === undefined || value === "" ? null : value);
export const claimDecisionSchema = z.strictObject({
  decision: z.enum(["approve", "reject"]),
  reviewNote: reviewNoteSchema,
});
export type ClaimDecisionInput = z.infer<typeof claimDecisionSchema>;

export const emptyClaimBodySchema = z.strictObject({});
export const claimIdSchema = objectIdSchema;

export const claimListQuerySchema = z.strictObject({
  status: z.enum(CLAIM_STATUSES).optional(),
  page: positiveInteger.default(1),
  pageSize: positiveInteger.pipe(z.number().max(50)).default(20),
}).superRefine((value, context) => {
  if (!Number.isSafeInteger((value.page - 1) * value.pageSize)) {
    context.addIssue({ code: "custom", path: ["page"], message: "Page offset exceeds the safe integer range" });
  }
});
export type ClaimListQuery = z.output<typeof claimListQuerySchema>;

export function toClaimListQueryInput(searchParams: URLSearchParams) {
  const input: Record<string, string | string[]> = {};
  for (const [key, value] of searchParams) {
    const current = input[key];
    input[key] = current === undefined ? value : Array.isArray(current) ? [...current, value] : [current, value];
  }
  return input;
}
```

- [ ] **Step 6: Run focused verification**

```powershell
npm.cmd test -- src/lib/claims/verification.test.ts src/lib/claims/validation.test.ts
npx.cmd eslint src/lib/claims/verification.ts src/lib/claims/verification.test.ts src/lib/claims/validation.ts src/lib/claims/validation.test.ts
npx.cmd tsc --noEmit --incremental false
```

Expected: all normalisation and validation cases pass.

- [ ] **Step 7: Commit only Task 2**

```powershell
git diff --check
git add web/src/lib/claims/verification.ts web/src/lib/claims/verification.test.ts web/src/lib/claims/validation.ts web/src/lib/claims/validation.test.ts
git diff --cached --check
git commit -m "feat(claims): validate claim requests" -m "Refs #19"
```

---

### Task 3: Safe Claim error contracts

**Files:**
- Create: `web/src/lib/claims/errors.ts`
- Create: `web/src/lib/claims/errors.test.ts`

**Interfaces:**
- Consumes: `AuthError`, `authErrorResponse`, Zod errors and unknown failures.
- Produces: `ClaimErrorCode`, `ClaimError`, `invalidClaimResponse` and `claimErrorResponse`.

- [ ] **Step 1: Write failing exact-contract tests**

Create `errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AuthError } from "@/lib/auth/errors";
import { ClaimError, claimErrorResponse, invalidClaimResponse } from "./errors";

describe("claim error responses", () => {
  it("returns field errors for invalid claim input", async () => {
    const parsed = z.strictObject({ answer: z.string().min(1) }).safeParse({ answer: "" });
    if (parsed.success) throw new Error("Expected invalid fixture");
    const response = invalidClaimResponse(parsed.error);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "VALIDATION_ERROR", message: "Invalid claim request", fields: { answer: expect.any(Array) } },
    });
  });

  it.each([
    ["VALIDATION_ERROR", 400, "Invalid claim request"],
    ["CLAIM_FORBIDDEN", 403, "Claim action is not permitted"],
    ["CLAIM_NOT_FOUND", 404, "Claim not found"],
    ["CLAIM_ALREADY_EXISTS", 409, "An active claim already exists"],
    ["REPORT_NOT_CLAIMABLE", 409, "Report is not available for claiming"],
    ["CLAIM_STATE_CONFLICT", 409, "Claim state has changed"],
  ] as const)("maps %s", async (code, status, message) => {
    const response = claimErrorResponse(new ClaimError(code));
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: { code, message } });
  });

  it("preserves only authentication-required AuthErrors", async () => {
    const response = claimErrorResponse(new AuthError("AUTHENTICATION_REQUIRED"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication required" },
    });
  });

  it.each([
    new Error("mongodb private detail"),
    new SyntaxError("internal parser detail"),
    new AuthError("ACCOUNT_UNAVAILABLE"),
  ])("hides unknown or disallowed failures", async (failure) => {
    const response = claimErrorResponse(failure);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: { code: "CLAIM_OPERATION_FAILED", message: "Claim operation failed" },
    });
    expect(JSON.stringify(body)).not.toMatch(/mongodb private detail|internal parser detail|Account is unavailable/);
  });
});
```

- [ ] **Step 2: Run the test and confirm the red state**

```powershell
npm.cmd test -- src/lib/claims/errors.test.ts
```

Expected: FAIL because `./errors` does not exist.

- [ ] **Step 3: Implement the isolated error domain**

Create `errors.ts`:

```ts
import { z, type ZodError } from "zod";
import { AuthError, authErrorResponse } from "@/lib/auth/errors";

const definitions = {
  VALIDATION_ERROR: { message: "Invalid claim request", status: 400 },
  CLAIM_FORBIDDEN: { message: "Claim action is not permitted", status: 403 },
  CLAIM_NOT_FOUND: { message: "Claim not found", status: 404 },
  CLAIM_ALREADY_EXISTS: { message: "An active claim already exists", status: 409 },
  REPORT_NOT_CLAIMABLE: { message: "Report is not available for claiming", status: 409 },
  CLAIM_STATE_CONFLICT: { message: "Claim state has changed", status: 409 },
  CLAIM_OPERATION_FAILED: { message: "Claim operation failed", status: 500 },
} as const;

export type ClaimErrorCode = keyof typeof definitions;

export class ClaimError extends Error {
  readonly code: ClaimErrorCode;
  readonly status: number;
  constructor(code: ClaimErrorCode) {
    const definition = definitions[code];
    super(definition.message);
    this.name = "ClaimError";
    this.code = code;
    this.status = definition.status;
  }
}

export function invalidClaimResponse(error?: ZodError) {
  const fields = error ? z.flattenError(error).fieldErrors : undefined;
  const includeFields = fields && Object.keys(fields).length > 0;
  return Response.json({
    error: {
      code: "VALIDATION_ERROR",
      message: "Invalid claim request",
      ...(includeFields ? { fields } : {}),
    },
  }, { status: 400 });
}

export function claimErrorResponse(error: unknown) {
  if (error instanceof AuthError && error.code === "AUTHENTICATION_REQUIRED") {
    return authErrorResponse(error);
  }
  const safe = error instanceof ClaimError ? error : new ClaimError("CLAIM_OPERATION_FAILED");
  return Response.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
}
```

- [ ] **Step 4: Run focused verification**

```powershell
npm.cmd test -- src/lib/claims/errors.test.ts
npx.cmd eslint src/lib/claims/errors.ts src/lib/claims/errors.test.ts
npx.cmd tsc --noEmit --incremental false
```

Expected: all exact envelopes pass and internal messages are absent.

- [ ] **Step 5: Commit only Task 3**

```powershell
git diff --check
git add web/src/lib/claims/errors.ts web/src/lib/claims/errors.test.ts
git diff --cached --check
git commit -m "feat(claims): define safe error contracts" -m "Refs #19"
```

---

### Task 4: Role-specific Claim response mappers

**Files:**
- Create: `web/src/lib/claims/public-claim.ts`
- Create: `web/src/lib/claims/public-claim.test.ts`

**Interfaces:**
- Consumes: plain Claim, ItemReport, User/Profile and ClaimEvidence-shaped records loaded by the services.
- Produces: `ClaimViewRecord`, `StaffClaimRecord`, `StaffClaimDetailRecord`, `ClaimReportRecord`, `SafeClaimantRecord`, `ClaimEvidenceRecord`, `ClaimantClaim`, `StaffClaimSummary`, `StaffClaimDetail`, `toClaimantClaim`, `toStaffClaimSummary` and `toStaffClaimDetail`.

- [ ] **Step 1: Write failing exact-shape and disclosure tests**

Create `public-claim.test.ts` with these fixed records and assertions:

```ts
import { describe, expect, it } from "vitest";
import { toClaimantClaim, toStaffClaimDetail, toStaffClaimSummary } from "./public-claim";

const claim = {
  _id: { toString: () => "claim-id" },
  reportId: { toString: () => "report-id" },
  claimantId: { toString: () => "claimant-id" },
  status: "pending" as const,
  activeClaimKey: "report-id:claimant-id",
  verificationQuestionCount: 2,
  verificationMatchedCount: 1,
  reviewedBy: null,
  reviewedAt: null,
  reviewNote: "PRIVATE STAFF NOTE",
  completedAt: null,
  withdrawnAt: null,
  createdAt: new Date("2026-08-24T01:00:00.000Z"),
  updatedAt: new Date("2026-08-24T01:01:00.000Z"),
  passwordHash: "DO-NOT-RETURN",
};
const report = {
  _id: { toString: () => "report-id" },
  title: "Black laptop charger",
  reportType: "found" as const,
  status: "open" as const,
  reporterId: { toString: () => "owner-id" },
  expectedAnswer: "DO-NOT-RETURN",
};
const claimant = {
  _id: { toString: () => "claimant-id" },
  email: "student@example.com",
  displayName: "Student Name",
  preferredContactMethod: "email" as const,
  tokenHash: "DO-NOT-RETURN",
};
const evidence = {
  _id: { toString: () => "evidence-id" },
  claimId: { toString: () => "claim-id" },
  responses: [{
    questionIndex: 0,
    question: "What mark is near the plug?",
    answer: "Small blue mark",
    matched: true,
    expectedAnswer: "DO-NOT-RETURN",
  }],
};

describe("Claim response mappers", () => {
  it("returns only claimant-safe workflow and report fields", () => {
    const result = toClaimantClaim(claim, report);
    expect(result).toEqual({
      id: "claim-id",
      report: { id: "report-id", title: "Black laptop charger", reportType: "found", status: "open" },
      status: "pending",
      reviewedAt: null,
      withdrawnAt: null,
      completedAt: null,
      createdAt: "2026-08-24T01:00:00.000Z",
      updatedAt: "2026-08-24T01:01:00.000Z",
    });
    expect(JSON.stringify(result)).not.toMatch(/answer|matched|reviewNote|reviewedBy|activeClaimKey|claimant|passwordHash|expectedAnswer/);
  });

  it("returns aggregate review data but not individual evidence in summaries", () => {
    const result = toStaffClaimSummary(claim, report, claimant);
    expect(result.claimant).toEqual({
      id: "claimant-id",
      email: "student@example.com",
      displayName: "Student Name",
      preferredContactMethod: "email",
    });
    expect(result.verification).toEqual({ questionCount: 2, matchedCount: 1 });
    expect(result.reviewedBy).toBeNull();
    expect(result).not.toHaveProperty("responses");
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE STAFF NOTE|DO-NOT-RETURN|tokenHash/);
  });

  it("returns controlled answers and match results only in staff detail", () => {
    const result = toStaffClaimDetail(claim, report, claimant, evidence);
    expect(result.reviewNote).toBe("PRIVATE STAFF NOTE");
    expect(result.responses).toEqual([{
      questionIndex: 0,
      question: "What mark is near the plug?",
      answer: "Small blue mark",
      matched: true,
    }]);
    expect(JSON.stringify(result)).not.toMatch(/expectedAnswer|DO-NOT-RETURN|tokenHash|passwordHash|activeClaimKey/);
  });
});
```

- [ ] **Step 2: Run the mapper test and confirm the red state**

```powershell
npm.cmd test -- src/lib/claims/public-claim.test.ts
```

Expected: FAIL because `./public-claim` does not exist.

- [ ] **Step 3: Implement structural mapper types and explicit objects**

Create `public-claim.ts`:

```ts
import type { ClaimStatus } from "@/models/claim";
import { REPORT_STATUSES, REPORT_TYPES } from "@/models/item-report";
import { CONTACT_METHODS } from "@/models/profile";

type Identifier = { toString(): string };

export type ClaimViewRecord = {
  _id: Identifier;
  reportId: Identifier;
  claimantId: Identifier;
  status: ClaimStatus;
  verificationQuestionCount: number;
  reviewedBy: Identifier | null;
  reviewedAt: Date | null;
  completedAt: Date | null;
  withdrawnAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StaffClaimRecord = ClaimViewRecord & {
  verificationMatchedCount: number;
};

export type StaffClaimDetailRecord = StaffClaimRecord & {
  reviewNote: string | null;
};

export type ClaimReportRecord = {
  _id: Identifier;
  title: string;
  reportType: (typeof REPORT_TYPES)[number];
  status: (typeof REPORT_STATUSES)[number];
};

export type SafeClaimantRecord = {
  _id: Identifier;
  email: string;
  displayName: string;
  preferredContactMethod: (typeof CONTACT_METHODS)[number];
};

export type ClaimEvidenceRecord = {
  claimId: Identifier;
  responses: Array<{
    questionIndex: number;
    question: string;
    answer: string;
    matched: boolean;
  }>;
};

function toReportSummary(report: ClaimReportRecord) {
  return {
    id: report._id.toString(),
    title: report.title,
    reportType: report.reportType,
    status: report.status,
  };
}

export function toClaimantClaim(claim: ClaimViewRecord, report: ClaimReportRecord) {
  return {
    id: claim._id.toString(),
    report: toReportSummary(report),
    status: claim.status,
    reviewedAt: claim.reviewedAt?.toISOString() ?? null,
    withdrawnAt: claim.withdrawnAt?.toISOString() ?? null,
    completedAt: claim.completedAt?.toISOString() ?? null,
    createdAt: claim.createdAt.toISOString(),
    updatedAt: claim.updatedAt.toISOString(),
  };
}
export type ClaimantClaim = ReturnType<typeof toClaimantClaim>;

export function toStaffClaimSummary(
  claim: StaffClaimRecord,
  report: ClaimReportRecord,
  claimant: SafeClaimantRecord,
) {
  return {
    ...toClaimantClaim(claim, report),
    claimant: {
      id: claimant._id.toString(),
      email: claimant.email,
      displayName: claimant.displayName,
      preferredContactMethod: claimant.preferredContactMethod,
    },
    verification: {
      questionCount: claim.verificationQuestionCount,
      matchedCount: claim.verificationMatchedCount,
    },
    reviewedBy: claim.reviewedBy?.toString() ?? null,
  };
}
export type StaffClaimSummary = ReturnType<typeof toStaffClaimSummary>;

export function toStaffClaimDetail(
  claim: StaffClaimDetailRecord,
  report: ClaimReportRecord,
  claimant: SafeClaimantRecord,
  evidence: ClaimEvidenceRecord,
) {
  return {
    ...toStaffClaimSummary(claim, report, claimant),
    reviewNote: claim.reviewNote,
    responses: evidence.responses.map((response) => ({
      questionIndex: response.questionIndex,
      question: response.question,
      answer: response.answer,
      matched: response.matched,
    })),
  };
}
export type StaffClaimDetail = ReturnType<typeof toStaffClaimDetail>;
```

- [ ] **Step 4: Run focused verification**

```powershell
npm.cmd test -- src/lib/claims/public-claim.test.ts
npx.cmd eslint src/lib/claims/public-claim.ts src/lib/claims/public-claim.test.ts
npx.cmd tsc --noEmit --incremental false
```

Expected: all three exact response shapes pass and injected secret fields are absent.

- [ ] **Step 5: Commit only Task 4**

```powershell
git diff --check
git add web/src/lib/claims/public-claim.ts web/src/lib/claims/public-claim.test.ts
git diff --cached --check
git commit -m "feat(claims): map role-safe responses" -m "Refs #19"
```

---

### Task 5: Claimant query and mutation service

**Files:**
- Create: `web/src/lib/claims/claimant-service.ts`
- Create: `web/src/lib/claims/claimant-service.test.ts`

**Interfaces:**
- Consumes: `PublicUser`, `CreateClaimInput`, `ClaimListQuery`, both Claim models, ItemReport, PrivateVerificationDetails, `connectToDatabase`, answer matching, Claim errors and claimant mapper.
- Produces: `ClaimQuestions`, `ClaimPage`, `getClaimQuestions(user, reportId)`, `createClaim(user, reportId, input)`, `listOwnClaims(user, query)`, `getOwnClaim(user, claimId)` and `withdrawOwnClaim(user, claimId)`.

- [ ] **Step 1: Write failing service tests with mocked database boundaries**

Create `claimant-service.test.ts`. Mock every imported model and mapper; use the existing report service's transaction shape:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/claim", () => ({ ClaimModel: {
  exists: vi.fn(), create: vi.fn(), find: vi.fn(), countDocuments: vi.fn(),
  findOne: vi.fn(), findOneAndUpdate: vi.fn(),
} }));
vi.mock("@/models/claim-evidence", () => ({ ClaimEvidenceModel: { create: vi.fn() } }));
vi.mock("@/models/item-report", () => ({ ItemReportModel: {
  findOne: vi.fn(), find: vi.fn(), findById: vi.fn(), findOneAndUpdate: vi.fn(),
} }));
vi.mock("@/models/private-verification-details", () => ({
  PrivateVerificationDetailsModel: { findOne: vi.fn() },
}));
vi.mock("./public-claim", () => ({ toClaimantClaim: vi.fn() }));

import { connectToDatabase } from "@/lib/db";
import { ClaimModel } from "@/models/claim";
import { ClaimEvidenceModel } from "@/models/claim-evidence";
import { ItemReportModel } from "@/models/item-report";
import { PrivateVerificationDetailsModel } from "@/models/private-verification-details";
import { toClaimantClaim } from "./public-claim";
import { createClaim, getClaimQuestions, getOwnClaim, listOwnClaims, withdrawOwnClaim } from "./claimant-service";

function queryChain<T>(result: T) {
  const chain = {
    select: vi.fn(), session: vi.fn(), sort: vi.fn(), skip: vi.fn(),
    limit: vi.fn(), lean: vi.fn(), exec: vi.fn(async () => result),
  };
  chain.select.mockReturnValue(chain);
  chain.session.mockReturnValue(chain);
  chain.sort.mockReturnValue(chain);
  chain.skip.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  return chain;
}
```

Use `student`, `staff`, `administrator` and suspended fixtures with the full `PublicUser` shape. Use `queryChain` for every fluent mocked read. Add these exact test groups:

```ts
it.each([
  ["staff", { ...student, role: "staff" as const }],
  ["administrator", { ...student, role: "administrator" as const }],
  ["suspended", { ...student, status: "suspended" as const }],
])("rejects %s before database access", async (_case, account) => {
  await expect(getClaimQuestions(account, reportId)).rejects.toMatchObject({ code: "CLAIM_FORBIDDEN" });
  await expect(createClaim(account, reportId, validInput)).rejects.toMatchObject({ code: "CLAIM_FORBIDDEN" });
  expect(connectToDatabase).not.toHaveBeenCalled();
});

it("returns question text without selecting expected answers", async () => {
  await expect(getClaimQuestions(student, reportId)).resolves.toEqual({
    report: { id: reportId, title: "Black charger", reportType: "found" },
    questions: [{ questionIndex: 0, question: "What mark is near the plug?" }],
  });
  expect(PrivateVerificationDetailsModel.findOne).toHaveBeenCalledWith(
    { reportId },
    { "verificationQuestions.question": 1 },
  );
  expect(JSON.stringify(vi.mocked(PrivateVerificationDetailsModel.findOne).mock.calls)).not.toContain("expectedAnswer");
});

it.each([
  ["missing report", null, null, "REPORT_NOT_CLAIMABLE"],
  ["missing questions", foundReport, null, "REPORT_NOT_CLAIMABLE"],
])("rejects %s", async (_case, report, verification, code) => {
  configureQuestionRead(report, verification);
  await expect(getClaimQuestions(student, reportId)).rejects.toMatchObject({ code });
});

it("creates Claim and ClaimEvidence atomically from exact answers", async () => {
  const result = await createClaim(student, reportId, validInput);
  expect(ItemReportModel.findOneAndUpdate).toHaveBeenCalledWith(
    { _id: reportId, reportType: "found", status: "open", reporterId: { $ne: student.id } },
    { $set: { status: "open" } },
    expect.objectContaining({ new: true, session: transaction }),
  );
  expect(ClaimModel.create).toHaveBeenCalledWith([expect.objectContaining({
    reportId,
    claimantId: student.id,
    status: "pending",
    activeClaimKey: `${reportId}:${student.id}`,
    verificationQuestionCount: 2,
    verificationMatchedCount: 1,
  })], { session: transaction });
  expect(ClaimEvidenceModel.create).toHaveBeenCalledWith([{
    claimId: claimDocument._id,
    responses: [
      { questionIndex: 0, question: "What mark is near the plug?", answer: "Small Blue Mark", matched: true },
      { questionIndex: 1, question: "What is printed underneath?", answer: "Wrong value", matched: false },
    ],
  }], { session: transaction });
  expect(result).toBe(mappedClaim);
  expect(transaction.endSession).toHaveBeenCalledOnce();
});
```

Also implement explicit cases asserting:

- source verification is selected with `+verificationQuestions.expectedAnswer` only inside `createClaim`;
- wrong response count throws `VALIDATION_ERROR` before either insert;
- same-user active precheck and an E11000 whose `keyPattern.activeClaimKey === 1` both become `CLAIM_ALREADY_EXISTS`;
- unrelated E11000 and transaction failures are preserved for the safe route boundary;
- list filter always includes `claimantId`, optional status, newest-first sort, bounded skip/limit and exact pagination;
- list/detail batch-load reports and never load evidence;
- another user's or missing detail is `CLAIM_NOT_FOUND`;
- pending withdrawal clears `activeClaimKey`, sets `withdrawnAt`, and does not update ItemReport;
- approved withdrawal conditionally changes ItemReport `claim_pending -> open` in the same transaction;
- rejected/completed/withdrawn claims return `CLAIM_STATE_CONFLICT` without writes;
- stale Claim or ItemReport conditional writes return `CLAIM_STATE_CONFLICT`;
- every transaction path calls `endSession` once.

- [ ] **Step 2: Run the focused test and confirm the red state**

```powershell
npm.cmd test -- src/lib/claims/claimant-service.test.ts
```

Expected: FAIL because `./claimant-service` does not exist.

- [ ] **Step 3: Implement role, key, projection and record-loading helpers**

Start `claimant-service.ts` with these exact boundaries:

```ts
import type { ClientSession } from "mongoose";
import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { ClaimModel } from "@/models/claim";
import { ClaimEvidenceModel } from "@/models/claim-evidence";
import { ItemReportModel } from "@/models/item-report";
import { PrivateVerificationDetailsModel } from "@/models/private-verification-details";
import { ClaimError } from "./errors";
import { matchesVerificationAnswer } from "./verification";
import { type ClaimantClaim, type ClaimReportRecord, type ClaimViewRecord, toClaimantClaim } from "./public-claim";
import type { ClaimListQuery, CreateClaimInput } from "./validation";

const CLAIM_REPORT_PROJECTION = { _id: 1, title: 1, reportType: 1, status: 1 } as const;

function requireStudent(user: PublicUser) {
  if (user.status !== "active" || user.role !== "student") throw new ClaimError("CLAIM_FORBIDDEN");
}

function activeClaimKey(reportId: string, claimantId: string) {
  return `${reportId}:${claimantId}`;
}

function isActiveClaimDuplicate(error: unknown): error is { code: 11000; keyPattern: { activeClaimKey: 1 } } {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000 &&
    "keyPattern" in error && typeof error.keyPattern === "object" && error.keyPattern !== null &&
    "activeClaimKey" in error.keyPattern && error.keyPattern.activeClaimKey === 1;
}

async function loadReport(reportId: { toString(): string }, session?: ClientSession) {
  return ItemReportModel.findById(reportId, CLAIM_REPORT_PROJECTION, { session })
    .lean<ClaimReportRecord | null>().exec();
}
```

- [ ] **Step 4: Implement question retrieval and transactional creation**

Use the report query below for both privacy and ownership eligibility. The write of the unchanged `open` status intentionally serialises claim creation with approval's write to the same report document:

```ts
export async function getClaimQuestions(user: PublicUser, reportId: string) {
  requireStudent(user);
  await connectToDatabase();
  const report = await ItemReportModel.findOne(
    { _id: reportId, reportType: "found", status: "open", reporterId: { $ne: user.id } },
    CLAIM_REPORT_PROJECTION,
  ).lean<ClaimReportRecord | null>().exec();
  if (!report) throw new ClaimError("REPORT_NOT_CLAIMABLE");
  if (await ClaimModel.exists({ activeClaimKey: activeClaimKey(reportId, user.id) })) {
    throw new ClaimError("CLAIM_ALREADY_EXISTS");
  }
  const verification = await PrivateVerificationDetailsModel.findOne(
    { reportId },
    { "verificationQuestions.question": 1 },
  ).lean<{ verificationQuestions: Array<{ question: string }> } | null>().exec();
  if (!verification?.verificationQuestions.length) throw new ClaimError("REPORT_NOT_CLAIMABLE");
  return {
    report: { id: report._id.toString(), title: report.title, reportType: "found" as const },
    questions: verification.verificationQuestions.map(({ question }, questionIndex) => ({ questionIndex, question })),
  };
}

export type ClaimQuestions = Awaited<ReturnType<typeof getClaimQuestions>>;

export async function createClaim(user: PublicUser, reportId: string, input: CreateClaimInput) {
  requireStudent(user);
  const database = await connectToDatabase();
  const transaction = await database.startSession();
  let result: ClaimantClaim | undefined;
  try {
    await transaction.withTransaction(async () => {
      const report = await ItemReportModel.findOneAndUpdate(
        { _id: reportId, reportType: "found", status: "open", reporterId: { $ne: user.id } },
        { $set: { status: "open" } },
        { new: true, session: transaction, projection: CLAIM_REPORT_PROJECTION },
      ).exec();
      if (!report) throw new ClaimError("REPORT_NOT_CLAIMABLE");

      const key = activeClaimKey(reportId, user.id);
      if (await ClaimModel.exists({ activeClaimKey: key }).session(transaction)) {
        throw new ClaimError("CLAIM_ALREADY_EXISTS");
      }
      const verification = await PrivateVerificationDetailsModel.findOne({ reportId })
        .select("+verificationQuestions.expectedAnswer")
        .session(transaction).exec();
      const questions = verification?.verificationQuestions ?? [];
      if (!questions.length) throw new ClaimError("REPORT_NOT_CLAIMABLE");
      if (questions.length !== input.responses.length) throw new ClaimError("VALIDATION_ERROR");

      const submitted = new Map(input.responses.map((entry) => [entry.questionIndex, entry.answer]));
      const responses = questions.map((question, questionIndex) => {
        const answer = submitted.get(questionIndex);
        if (answer === undefined) throw new ClaimError("VALIDATION_ERROR");
        return {
          questionIndex,
          question: question.question,
          answer,
          matched: matchesVerificationAnswer(question.expectedAnswer, answer),
        };
      });
      const [claim] = await ClaimModel.create([{
        reportId,
        claimantId: user.id,
        status: "pending",
        activeClaimKey: key,
        verificationQuestionCount: responses.length,
        verificationMatchedCount: responses.filter(({ matched }) => matched).length,
      }], { session: transaction });
      await ClaimEvidenceModel.create([{ claimId: claim._id, responses }], { session: transaction });
      result = toClaimantClaim(claim as unknown as ClaimViewRecord, report);
    });
  } catch (error) {
    if (isActiveClaimDuplicate(error)) throw new ClaimError("CLAIM_ALREADY_EXISTS");
    throw error;
  } finally {
    await transaction.endSession();
  }
  if (!result) throw new Error("Claim transaction did not produce a result");
  return result;
}
```

- [ ] **Step 5: Implement own-history, safe detail and withdrawal**

Implement list/detail with Claim-only reads plus explicit report batch reads; never import ClaimEvidence into these paths. Export this page contract and implementations:

```ts
export type ClaimPage = {
  claims: ClaimantClaim[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

async function loadReportMap(claims: ClaimViewRecord[]) {
  const reports = await ItemReportModel.find(
    { _id: { $in: claims.map(({ reportId }) => reportId) } },
    CLAIM_REPORT_PROJECTION,
  ).lean<ClaimReportRecord[]>().exec();
  return new Map(reports.map((report) => [report._id.toString(), report]));
}

export async function listOwnClaims(
  user: PublicUser,
  query: ClaimListQuery,
): Promise<ClaimPage> {
  requireStudent(user);
  await connectToDatabase();
  const filter = {
    claimantId: user.id,
    ...(query.status ? { status: query.status } : {}),
  };
  const claimsQuery = ClaimModel.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((query.page - 1) * query.pageSize)
    .limit(query.pageSize)
    .lean<ClaimViewRecord[]>();
  const [claims, total] = await Promise.all([
    claimsQuery.exec(),
    ClaimModel.countDocuments(filter).exec(),
  ]);
  const reports = await loadReportMap(claims);
  return {
    claims: claims.map((claim) => {
      const report = reports.get(claim.reportId.toString());
      if (!report) throw new Error("Claim report is missing");
      return toClaimantClaim(claim, report);
    }),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function getOwnClaim(user: PublicUser, claimId: string) {
  requireStudent(user);
  await connectToDatabase();
  const claim = await ClaimModel.findOne({ _id: claimId, claimantId: user.id })
    .lean<ClaimViewRecord | null>().exec();
  if (!claim) throw new ClaimError("CLAIM_NOT_FOUND");
  const report = await loadReport(claim.reportId);
  if (!report) throw new Error("Claim report is missing");
  return toClaimantClaim(claim, report);
}
```

Implement withdrawal with conditional writes:

```ts
export async function withdrawOwnClaim(user: PublicUser, claimId: string) {
  requireStudent(user);
  const database = await connectToDatabase();
  const transaction = await database.startSession();
  let result: ClaimantClaim | undefined;
  try {
    await transaction.withTransaction(async () => {
      const current = await ClaimModel.findOne({ _id: claimId, claimantId: user.id })
        .session(transaction).exec();
      if (!current) throw new ClaimError("CLAIM_NOT_FOUND");
      if (current.status !== "pending" && current.status !== "approved") {
        throw new ClaimError("CLAIM_STATE_CONFLICT");
      }
      if (current.status === "approved") {
        const report = await ItemReportModel.findOneAndUpdate(
          { _id: current.reportId, status: "claim_pending" },
          { $set: { status: "open", resolvedAt: null } },
          { new: true, session: transaction, projection: CLAIM_REPORT_PROJECTION },
        ).exec();
        if (!report) throw new ClaimError("CLAIM_STATE_CONFLICT");
      }
      const now = new Date();
      const updated = await ClaimModel.findOneAndUpdate(
        { _id: claimId, claimantId: user.id, status: current.status },
        { $set: { status: "withdrawn", activeClaimKey: null, withdrawnAt: now } },
        { new: true, session: transaction },
      ).exec();
      if (!updated) throw new ClaimError("CLAIM_STATE_CONFLICT");
      const report = await loadReport(updated.reportId, transaction);
      if (!report) throw new Error("Claim report is missing");
      result = toClaimantClaim(updated as unknown as ClaimViewRecord, report);
    });
  } finally {
    await transaction.endSession();
  }
  if (!result) throw new Error("Claim withdrawal did not produce a result");
  return result;
}
```

- [ ] **Step 6: Run focused verification and private-evidence scan**

```powershell
npm.cmd test -- src/lib/claims/claimant-service.test.ts src/lib/claims/verification.test.ts src/lib/claims/public-claim.test.ts
npx.cmd eslint src/lib/claims/claimant-service.ts src/lib/claims/claimant-service.test.ts
npx.cmd tsc --noEmit --incremental false
rg -n "expectedAnswer|ClaimEvidenceModel|verificationMatchedCount|reviewNote" src/lib/claims/claimant-service.ts
```

Expected: tests, lint and TypeScript pass. `expectedAnswer` and `ClaimEvidenceModel` occur only in the transactional creation path; no own-list/detail mapper exposes them.

- [ ] **Step 7: Commit only Task 5**

```powershell
git diff --check
git add web/src/lib/claims/claimant-service.ts web/src/lib/claims/claimant-service.test.ts
git diff --cached --check
git commit -m "feat(claims): add claimant workflows" -m "Refs #19"
```

---

### Task 6: Staff review and completion service

**Files:**
- Create: `web/src/lib/claims/staff-service.ts`
- Create: `web/src/lib/claims/staff-service.test.ts`

**Interfaces:**
- Consumes: `PublicUser`, `ClaimDecisionInput`, `ClaimListQuery`, Claim/ClaimEvidence/ItemReport/User/Profile models, transactions, Claim errors and staff mappers.
- Produces: `StaffClaimPage`, `listStaffClaims(user, query)`, `getStaffClaim(user, claimId)`, `decideClaim(user, claimId, input)` and `completeClaim(user, claimId)`.

- [ ] **Step 1: Write failing role, queue, detail and transition tests**

Create `staff-service.test.ts` with mocked `connectToDatabase`, all five models and both staff mappers. Define a local `queryChain` helper whose `select`, `session`, `sort`, `skip`, `limit` and `lean` mocks return the chain and whose `exec` mock resolves its configured value. Define a transaction fixture with `withTransaction` invoking the callback and `endSession` resolving once. Begin with these exact checks:

```ts
it.each([
  ["student", student],
  ["suspended staff", { ...staff, status: "suspended" as const }],
])("rejects %s before database access", async (_case, account) => {
  await expect(listStaffClaims(account, { page: 1, pageSize: 20 })).rejects.toMatchObject({ code: "CLAIM_FORBIDDEN" });
  await expect(getStaffClaim(account, claimId)).rejects.toMatchObject({ code: "CLAIM_FORBIDDEN" });
  expect(connectToDatabase).not.toHaveBeenCalled();
});

it.each(["staff", "administrator"] as const)("allows active %s review", async (role) => {
  await expect(listStaffClaims({ ...staff, role }, { page: 1, pageSize: 20 })).resolves.toEqual(staffPage);
});

it("uses oldest pending claims as the default queue", async () => {
  await listStaffClaims(staff, { page: 1, pageSize: 20 });
  expect(ClaimModel.find).toHaveBeenCalledWith({ status: "pending" });
  expect(claimFindChain.select).toHaveBeenCalledWith("+verificationMatchedCount");
  expect(claimFindChain.sort).toHaveBeenCalledWith({ createdAt: 1, _id: 1 });
});

it("uses newest-first ordering for an explicit terminal status", async () => {
  await listStaffClaims(staff, { status: "rejected", page: 2, pageSize: 10 });
  expect(claimFindChain.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
  expect(claimFindChain.skip).toHaveBeenCalledWith(10);
  expect(claimFindChain.limit).toHaveBeenCalledWith(10);
});

it("loads private evidence only for staff detail", async () => {
  const detail = await getStaffClaim(staff, claimId);
  expect(ClaimEvidenceModel.findOne).toHaveBeenCalledWith({ claimId });
  expect(evidenceChain.select).toHaveBeenCalledWith("+responses.answer +responses.matched");
  expect(detail).toBe(staffDetail);
});
```

Add exact transactional assertions for:

- approve requires Claim `pending` and ItemReport `open`;
- selected Claim becomes `approved`, keeps `activeClaimKey`, sets `reviewedBy`, `reviewedAt` and private note;
- `updateMany` changes every other `{ reportId, _id: { $ne: claimId }, status: "pending" }` Claim to `rejected`, clears active keys, records the same reviewer/time and null note;
- approval conditionally changes ItemReport `open -> claim_pending` in the same transaction;
- reject changes only the selected pending Claim to `rejected`, clears its active key and leaves ItemReport/competitors untouched;
- complete requires selected Claim `approved` plus ItemReport `claim_pending`, changes Claim to `completed`, clears its active key, and changes ItemReport to `resolved` with the same timestamp;
- missing claims return `CLAIM_NOT_FOUND`; existing claims in the wrong state or stale conditional writes return `CLAIM_STATE_CONFLICT`;
- staff detail includes selected answers/matches but every mock `expectedAnswer`, `passwordHash` and `tokenHash` is absent from the mapped response;
- read and write failures remain unknown errors for the route boundary;
- `endSession` runs exactly once on success and every failure.

- [ ] **Step 2: Run the focused test and confirm the red state**

```powershell
npm.cmd test -- src/lib/claims/staff-service.test.ts
```

Expected: FAIL because `./staff-service` does not exist.

- [ ] **Step 3: Implement staff role enforcement and batched safe record loading**

Create `staff-service.ts` with these imports, role boundary and projections:

```ts
import type { ClientSession } from "mongoose";
import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { ClaimModel } from "@/models/claim";
import { ClaimEvidenceModel } from "@/models/claim-evidence";
import { ItemReportModel } from "@/models/item-report";
import { ProfileModel } from "@/models/profile";
import { UserModel } from "@/models/user";
import { ClaimError } from "./errors";
import {
  type ClaimEvidenceRecord,
  type ClaimReportRecord,
  type SafeClaimantRecord,
  type StaffClaimDetail,
  type StaffClaimDetailRecord,
  type StaffClaimRecord,
  type StaffClaimSummary,
  toStaffClaimDetail,
  toStaffClaimSummary,
} from "./public-claim";
import type { ClaimDecisionInput, ClaimListQuery } from "./validation";

function requireStaff(user: PublicUser) {
  if (user.status !== "active" || (user.role !== "staff" && user.role !== "administrator")) {
    throw new ClaimError("CLAIM_FORBIDDEN");
  }
}

const CLAIM_REPORT_PROJECTION = { _id: 1, title: 1, reportType: 1, status: 1 } as const;
const SAFE_USER_PROJECTION = { _id: 1, email: 1 } as const;
const SAFE_PROFILE_PROJECTION = { _id: 1, userId: 1, displayName: 1, preferredContactMethod: 1 } as const;

async function loadStaffDetailRecords(claimId: string, session?: ClientSession) {
  const claim = await ClaimModel.findById(claimId).select("+verificationMatchedCount +reviewNote")
    .session(session ?? null).lean<StaffClaimDetailRecord | null>().exec();
  if (!claim) throw new ClaimError("CLAIM_NOT_FOUND");
  const [report, user, profile, evidence] = await Promise.all([
    ItemReportModel.findById(claim.reportId, CLAIM_REPORT_PROJECTION, { session }).lean<ClaimReportRecord | null>().exec(),
    UserModel.findById(claim.claimantId, SAFE_USER_PROJECTION, { session }).lean<{ _id: { toString(): string }; email: string } | null>().exec(),
    ProfileModel.findOne({ userId: claim.claimantId }, SAFE_PROFILE_PROJECTION, { session }).lean<{ displayName: string; preferredContactMethod: "in_app" | "email" } | null>().exec(),
    ClaimEvidenceModel.findOne({ claimId }).select("+responses.answer +responses.matched")
      .session(session ?? null).lean<ClaimEvidenceRecord | null>().exec(),
  ]);
  if (!report || !user || !profile || !evidence) throw new Error("Claim review data is incomplete");
  return {
    claim,
    report,
    claimant: { ...user, displayName: profile.displayName, preferredContactMethod: profile.preferredContactMethod },
    evidence,
  };
}
```

Implement the review queue with one bounded Claim query plus three batched related-record queries:

```ts
type SafeUserRow = { _id: { toString(): string }; email: string };
type SafeProfileRow = {
  userId: { toString(): string };
  displayName: string;
  preferredContactMethod: "in_app" | "email";
};

export type StaffClaimPage = {
  claims: StaffClaimSummary[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

export async function listStaffClaims(
  user: PublicUser,
  query: ClaimListQuery,
): Promise<StaffClaimPage> {
  requireStaff(user);
  await connectToDatabase();
  const status = query.status ?? "pending";
  const filter = { status };
  const claimsQuery = ClaimModel.find(filter)
    .select("+verificationMatchedCount")
    .sort(status === "pending" ? { createdAt: 1, _id: 1 } : { createdAt: -1, _id: -1 })
    .skip((query.page - 1) * query.pageSize)
    .limit(query.pageSize)
    .lean<StaffClaimRecord[]>();
  const [claims, total] = await Promise.all([
    claimsQuery.exec(),
    ClaimModel.countDocuments(filter).exec(),
  ]);
  const reportIds = claims.map(({ reportId }) => reportId);
  const claimantIds = claims.map(({ claimantId }) => claimantId);
  const [reports, users, profiles] = await Promise.all([
    ItemReportModel.find({ _id: { $in: reportIds } }, CLAIM_REPORT_PROJECTION)
      .lean<ClaimReportRecord[]>().exec(),
    UserModel.find({ _id: { $in: claimantIds } }, SAFE_USER_PROJECTION)
      .lean<SafeUserRow[]>().exec(),
    ProfileModel.find({ userId: { $in: claimantIds } }, SAFE_PROFILE_PROJECTION)
      .lean<SafeProfileRow[]>().exec(),
  ]);
  const reportMap = new Map(reports.map((report) => [report._id.toString(), report]));
  const userMap = new Map(users.map((claimant) => [claimant._id.toString(), claimant]));
  const profileMap = new Map(profiles.map((profile) => [profile.userId.toString(), profile]));
  return {
    claims: claims.map((claim) => {
      const claimantId = claim.claimantId.toString();
      const report = reportMap.get(claim.reportId.toString());
      const account = userMap.get(claimantId);
      const profile = profileMap.get(claimantId);
      if (!report || !account || !profile) throw new Error("Claim review data is incomplete");
      const claimant: SafeClaimantRecord = {
        ...account,
        displayName: profile.displayName,
        preferredContactMethod: profile.preferredContactMethod,
      };
      return toStaffClaimSummary(claim, report, claimant);
    }),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function getStaffClaim(user: PublicUser, claimId: string) {
  requireStaff(user);
  await connectToDatabase();
  const records = await loadStaffDetailRecords(claimId);
  return toStaffClaimDetail(records.claim, records.report, records.claimant, records.evidence);
}
```

- [ ] **Step 4: Implement approve/reject as one transaction**

Implement the decision function with conditional filters and one timestamp:

```ts
export async function decideClaim(user: PublicUser, claimId: string, input: ClaimDecisionInput) {
  requireStaff(user);
  const database = await connectToDatabase();
  const transaction = await database.startSession();
  let result: StaffClaimDetail | undefined;
  try {
    await transaction.withTransaction(async () => {
      const current = await ClaimModel.findById(claimId).session(transaction).exec();
      if (!current) throw new ClaimError("CLAIM_NOT_FOUND");
      if (current.status !== "pending") throw new ClaimError("CLAIM_STATE_CONFLICT");
      const now = new Date();
      if (input.decision === "approve") {
        const report = await ItemReportModel.findOneAndUpdate(
          { _id: current.reportId, status: "open" },
          { $set: { status: "claim_pending", resolvedAt: null } },
          { new: true, session: transaction },
        ).exec();
        if (!report) throw new ClaimError("CLAIM_STATE_CONFLICT");
      }
      const updated = await ClaimModel.findOneAndUpdate(
        { _id: claimId, status: "pending" },
        { $set: {
          status: input.decision === "approve" ? "approved" : "rejected",
          activeClaimKey: input.decision === "approve" ? current.activeClaimKey : null,
          reviewedBy: user.id,
          reviewedAt: now,
          reviewNote: input.reviewNote,
        } },
        { new: true, session: transaction },
      ).exec();
      if (!updated) throw new ClaimError("CLAIM_STATE_CONFLICT");
      if (input.decision === "approve") {
        await ClaimModel.updateMany(
          { reportId: current.reportId, _id: { $ne: current._id }, status: "pending" },
          { $set: { status: "rejected", activeClaimKey: null, reviewedBy: user.id, reviewedAt: now, reviewNote: null } },
          { session: transaction },
        );
      }
      const records = await loadStaffDetailRecords(claimId, transaction);
      result = toStaffClaimDetail(records.claim, records.report, records.claimant, records.evidence);
    });
  } finally {
    await transaction.endSession();
  }
  if (!result) throw new Error("Claim decision did not produce a result");
  return result;
}
```

- [ ] **Step 5: Implement handover completion atomically**

```ts
export async function completeClaim(user: PublicUser, claimId: string) {
  requireStaff(user);
  const database = await connectToDatabase();
  const transaction = await database.startSession();
  let result: StaffClaimDetail | undefined;
  try {
    await transaction.withTransaction(async () => {
      const current = await ClaimModel.findById(claimId).session(transaction).exec();
      if (!current) throw new ClaimError("CLAIM_NOT_FOUND");
      if (current.status !== "approved") throw new ClaimError("CLAIM_STATE_CONFLICT");
      const now = new Date();
      const report = await ItemReportModel.findOneAndUpdate(
        { _id: current.reportId, status: "claim_pending" },
        { $set: { status: "resolved", resolvedAt: now } },
        { new: true, session: transaction },
      ).exec();
      if (!report) throw new ClaimError("CLAIM_STATE_CONFLICT");
      const updated = await ClaimModel.findOneAndUpdate(
        { _id: claimId, status: "approved" },
        { $set: { status: "completed", activeClaimKey: null, completedAt: now } },
        { new: true, session: transaction },
      ).exec();
      if (!updated) throw new ClaimError("CLAIM_STATE_CONFLICT");
      const records = await loadStaffDetailRecords(claimId, transaction);
      result = toStaffClaimDetail(records.claim, records.report, records.claimant, records.evidence);
    });
  } finally {
    await transaction.endSession();
  }
  if (!result) throw new Error("Claim completion did not produce a result");
  return result;
}
```

- [ ] **Step 6: Run focused verification and evidence-selection scan**

```powershell
npm.cmd test -- src/lib/claims/staff-service.test.ts src/lib/claims/public-claim.test.ts
npx.cmd eslint src/lib/claims/staff-service.ts src/lib/claims/staff-service.test.ts
npx.cmd tsc --noEmit --incremental false
rg -n "expectedAnswer|passwordHash|tokenHash|responses\.answer|responses\.matched" src/lib/claims/staff-service.ts
```

Expected: tests, lint and TypeScript pass. There is no `expectedAnswer`, `passwordHash` or `tokenHash` selection; answer/match selection appears only in the staff-detail loader.

- [ ] **Step 7: Commit only Task 6**

```powershell
git diff --check
git add web/src/lib/claims/staff-service.ts web/src/lib/claims/staff-service.test.ts
git diff --cached --check
git commit -m "feat(claims): add staff review workflows" -m "Refs #19"
```

---

### Task 7: Authenticated claimant API routes

**Files:**
- Create: `web/src/app/api/reports/[id]/claim-questions/route.ts`
- Create: `web/src/app/api/reports/[id]/claims/route.ts`
- Create: `web/src/app/api/claims/mine/route.ts`
- Create: `web/src/app/api/claims/[id]/route.ts`
- Create: `web/src/app/api/claims/[id]/withdraw/route.ts`
- Create: `web/src/app/api/claims/claimant-routes.test.ts`

**Interfaces:**
- Consumes: existing cookie/current-user authentication, Claim validation/error helpers and the five claimant-service exports.
- Produces: `GET /api/reports/[id]/claim-questions`, `POST /api/reports/[id]/claims`, `GET /api/claims/mine`, `GET /api/claims/[id]` and `POST /api/claims/[id]/withdraw`.

- [ ] **Step 1: Write consolidated failing claimant-route tests**

Create `claimant-routes.test.ts` with these mocks and imports:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/claims/claimant-service", () => ({
  getClaimQuestions: vi.fn(), createClaim: vi.fn(), listOwnClaims: vi.fn(),
  getOwnClaim: vi.fn(), withdrawOwnClaim: vi.fn(),
}));

import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ClaimError } from "@/lib/claims/errors";
import {
  createClaim, getClaimQuestions, getOwnClaim, listOwnClaims, withdrawOwnClaim,
} from "@/lib/claims/claimant-service";
import { GET as questionsGet } from "../reports/[id]/claim-questions/route";
import { POST as claimsPost } from "../reports/[id]/claims/route";
import { GET as mineGet } from "./mine/route";
import { GET as ownDetailGet } from "./[id]/route";
import { POST as withdrawPost } from "./[id]/withdraw/route";
```

Use a full active-student `PublicUser`, `reportId`, `claimId`, mapped Claim fixture and helpers:

```ts
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const jsonRequest = (url: string, body: unknown) => new Request(url, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
const emptyPost = (url: string) => new Request(url, { method: "POST" });

async function expectAuthenticationRequired(response: Response) {
  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({
    error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication required" },
  });
}

function expectNoClaimSecrets(value: unknown) {
  expect(JSON.stringify(value)).not.toMatch(
    /expectedAnswer|verificationMatchedCount|reviewNote|activeClaimKey|passwordHash|tokenHash|PRIVATE-ANSWER/,
  );
}
```

Cover these exact success contracts:

```ts
it("returns claimant-safe verification questions", async () => {
  const response = await questionsGet(new Request(`http://localhost/api/reports/${reportId}/claim-questions`), context(reportId));
  expect(response.status).toBe(200);
  expect(getClaimQuestions).toHaveBeenCalledWith(student, reportId);
  const body = await response.json();
  expect(body).toEqual(claimQuestions);
  expectNoClaimSecrets(body);
});

it("validates and creates a claim", async () => {
  const response = await claimsPost(
    jsonRequest(`http://localhost/api/reports/${reportId}/claims`, {
      responses: [{ questionIndex: 0, answer: "  Blue mark  " }],
    }),
    context(reportId),
  );
  expect(response.status).toBe(201);
  expect(createClaim).toHaveBeenCalledWith(student, reportId, {
    responses: [{ questionIndex: 0, answer: "Blue mark" }],
  });
  await expect(response.json()).resolves.toEqual({ claim: claimantClaim });
});

it("lists only the current student's transformed query", async () => {
  const response = await mineGet(new Request("http://localhost/api/claims/mine?status=pending&page=2&pageSize=10"));
  expect(response.status).toBe(200);
  expect(listOwnClaims).toHaveBeenCalledWith(student, { status: "pending", page: 2, pageSize: 10 });
  await expect(response.json()).resolves.toEqual(claimPage);
});

it("returns one own safe detail", async () => {
  const response = await ownDetailGet(new Request(`http://localhost/api/claims/${claimId}`), context(claimId));
  expect(response.status).toBe(200);
  expect(getOwnClaim).toHaveBeenCalledWith(student, claimId);
  await expect(response.json()).resolves.toEqual({ claim: claimantClaim });
});

it("accepts a bodyless withdrawal", async () => {
  const response = await withdrawPost(emptyPost(`http://localhost/api/claims/${claimId}/withdraw`), context(claimId));
  expect(response.status).toBe(200);
  expect(withdrawOwnClaim).toHaveBeenCalledWith(student, claimId);
  await expect(response.json()).resolves.toEqual({ claim: withdrawnClaim });
});
```

Add exact failure cases:

- all five endpoints return 401 and do not read params, URL or body when `getCurrentUser` returns null;
- cookie/current-user/params/URL failures return hidden 500 `CLAIM_OPERATION_FAILED`;
- invalid report/claim IDs return 400 before services;
- malformed JSON, empty required creation body, unknown fields, duplicate response indexes, invalid pagination, duplicate query keys and a non-empty withdrawal body return 400;
- each ClaimError code retains its exact status/message;
- an internal service `SyntaxError` remains a hidden 500 and is not misclassified as malformed JSON;
- every response fixture is scanned by `expectNoClaimSecrets`.

- [ ] **Step 2: Run the route test and confirm the red state**

```powershell
npm.cmd test -- src/app/api/claims/claimant-routes.test.ts
```

Expected: FAIL because none of the five route modules exist.

- [ ] **Step 3: Implement question and creation routes with authentication-first boundaries**

Create `reports/[id]/claim-questions/route.ts`:

```ts
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { claimErrorResponse, invalidClaimResponse } from "@/lib/claims/errors";
import { getClaimQuestions } from "@/lib/claims/claimant-service";
import { claimIdSchema } from "@/lib/claims/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  let user: PublicUser;
  try {
    const current = await getCurrentUser(await readSessionCookie());
    if (!current) throw new AuthError("AUTHENTICATION_REQUIRED");
    user = current;
  } catch (error) { return claimErrorResponse(error); }
  let rawId: string;
  try { rawId = (await context.params).id; } catch (error) { return claimErrorResponse(error); }
  const parsedId = claimIdSchema.safeParse(rawId);
  if (!parsedId.success) return invalidClaimResponse();
  try {
    return Response.json(await getClaimQuestions(user, parsedId.data));
  } catch (error) { return claimErrorResponse(error); }
}
```

Create `reports/[id]/claims/route.ts`:

```ts
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { createClaim } from "@/lib/claims/claimant-service";
import { claimErrorResponse, invalidClaimResponse } from "@/lib/claims/errors";
import { claimIdSchema, createClaimSchema } from "@/lib/claims/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  let user: PublicUser;
  try {
    const current = await getCurrentUser(await readSessionCookie());
    if (!current) throw new AuthError("AUTHENTICATION_REQUIRED");
    user = current;
  } catch (error) { return claimErrorResponse(error); }
  let rawId: string;
  try { rawId = (await context.params).id; } catch (error) { return claimErrorResponse(error); }
  const parsedId = claimIdSchema.safeParse(rawId);
  if (!parsedId.success) return invalidClaimResponse();
  let body: unknown;
  try { body = await request.json(); }
  catch (error) { return error instanceof SyntaxError ? invalidClaimResponse() : claimErrorResponse(error); }
  const parsed = createClaimSchema.safeParse(body);
  if (!parsed.success) return invalidClaimResponse(parsed.error);
  try {
    return Response.json({ claim: await createClaim(user, parsedId.data, parsed.data) }, { status: 201 });
  } catch (error) { return claimErrorResponse(error); }
}
```

- [ ] **Step 4: Implement own-list and own-detail routes**

Create `claims/mine/route.ts`:

```ts
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { listOwnClaims } from "@/lib/claims/claimant-service";
import { claimErrorResponse, invalidClaimResponse } from "@/lib/claims/errors";
import { claimListQuerySchema, toClaimListQueryInput } from "@/lib/claims/validation";

export async function GET(request: Request) {
  let user: PublicUser;
  try {
    const current = await getCurrentUser(await readSessionCookie());
    if (!current) throw new AuthError("AUTHENTICATION_REQUIRED");
    user = current;
  } catch (error) { return claimErrorResponse(error); }
  let parsed;
  try {
    parsed = claimListQuerySchema.safeParse(toClaimListQueryInput(new URL(request.url).searchParams));
  } catch (error) { return claimErrorResponse(error); }
  if (!parsed.success) return invalidClaimResponse(parsed.error);
  try { return Response.json(await listOwnClaims(user, parsed.data)); }
  catch (error) { return claimErrorResponse(error); }
}
```

Create `claims/[id]/route.ts`:

```ts
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { getOwnClaim } from "@/lib/claims/claimant-service";
import { claimErrorResponse, invalidClaimResponse } from "@/lib/claims/errors";
import { claimIdSchema } from "@/lib/claims/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  let user: PublicUser;
  try {
    const current = await getCurrentUser(await readSessionCookie());
    if (!current) throw new AuthError("AUTHENTICATION_REQUIRED");
    user = current;
  } catch (error) { return claimErrorResponse(error); }
  let rawId: string;
  try { rawId = (await context.params).id; }
  catch (error) { return claimErrorResponse(error); }
  const parsedId = claimIdSchema.safeParse(rawId);
  if (!parsedId.success) return invalidClaimResponse();
  try { return Response.json({ claim: await getOwnClaim(user, parsedId.data) }); }
  catch (error) { return claimErrorResponse(error); }
}
```

- [ ] **Step 5: Implement strict empty-body withdrawal**

Create `claims/[id]/withdraw/route.ts` as a complete authentication-first, strict empty-command handler:

```ts
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { withdrawOwnClaim } from "@/lib/claims/claimant-service";
import { claimErrorResponse, invalidClaimResponse } from "@/lib/claims/errors";
import { claimIdSchema, emptyClaimBodySchema } from "@/lib/claims/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  let user: PublicUser;
  try {
    const current = await getCurrentUser(await readSessionCookie());
    if (!current) throw new AuthError("AUTHENTICATION_REQUIRED");
    user = current;
  } catch (error) { return claimErrorResponse(error); }
  let rawId: string;
  try { rawId = (await context.params).id; }
  catch (error) { return claimErrorResponse(error); }
  const parsedId = claimIdSchema.safeParse(rawId);
  if (!parsedId.success) return invalidClaimResponse();
  let body: unknown = {};
  try {
    const text = await request.text();
    body = text.trim() === "" ? {} : JSON.parse(text);
  } catch (error) {
    return error instanceof SyntaxError ? invalidClaimResponse() : claimErrorResponse(error);
  }
  const parsed = emptyClaimBodySchema.safeParse(body);
  if (!parsed.success) return invalidClaimResponse(parsed.error);
  try { return Response.json({ claim: await withdrawOwnClaim(user, parsedId.data) }); }
  catch (error) { return claimErrorResponse(error); }
}
```

- [ ] **Step 6: Run claimant-route and service verification**

```powershell
npm.cmd test -- src/app/api/claims/claimant-routes.test.ts src/lib/claims/claimant-service.test.ts
npx.cmd eslint src/app/api/reports/[id]/claim-questions/route.ts src/app/api/reports/[id]/claims/route.ts src/app/api/claims src/lib/claims/claimant-service.ts
npx.cmd tsc --noEmit --incremental false
```

Expected: all claimant route/service tests pass, including auth-first and hidden-error cases.

- [ ] **Step 7: Commit only Task 7**

```powershell
git diff --check
git add web/src/app/api/reports/[id]/claim-questions/route.ts web/src/app/api/reports/[id]/claims/route.ts web/src/app/api/claims/mine/route.ts web/src/app/api/claims/[id]/route.ts web/src/app/api/claims/[id]/withdraw/route.ts web/src/app/api/claims/claimant-routes.test.ts
git diff --cached --check
git commit -m "feat(claims): add claimant API routes" -m "Refs #19"
```

---

### Task 8: Staff Claim API routes

**Files:**
- Create: `web/src/app/api/staff/claims/route.ts`
- Create: `web/src/app/api/staff/claims/[id]/route.ts`
- Create: `web/src/app/api/staff/claims/[id]/decision/route.ts`
- Create: `web/src/app/api/staff/claims/[id]/complete/route.ts`
- Create: `web/src/app/api/staff/claims/staff-claim-routes.test.ts`

**Interfaces:**
- Consumes: existing cookie/current-user authentication, Claim validation/error helpers and the four staff-service exports.
- Produces: `GET /api/staff/claims`, `GET /api/staff/claims/[id]`, `POST /api/staff/claims/[id]/decision` and `POST /api/staff/claims/[id]/complete`.

- [ ] **Step 1: Write consolidated failing staff-route tests**

Create `staff-claim-routes.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/claims/staff-service", () => ({
  listStaffClaims: vi.fn(), getStaffClaim: vi.fn(), decideClaim: vi.fn(), completeClaim: vi.fn(),
}));

import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ClaimError } from "@/lib/claims/errors";
import { completeClaim, decideClaim, getStaffClaim, listStaffClaims } from "@/lib/claims/staff-service";
import { GET as queueGet } from "./route";
import { GET as detailGet } from "./[id]/route";
import { POST as decisionPost } from "./[id]/decision/route";
import { POST as completePost } from "./[id]/complete/route";
```

Use active staff and administrator fixtures, a student fixture, `context`, `jsonRequest`, `emptyPost`, `staffPage`, `staffDetail`, `approvedDetail` and `completedDetail`. Cover exact successes:

```ts
it.each(["staff", "administrator"] as const)("lists claims for active %s", async (role) => {
  const reviewer = { ...staff, role };
  vi.mocked(getCurrentUser).mockResolvedValue(reviewer);
  const response = await queueGet(new Request("http://localhost/api/staff/claims?status=pending&page=2&pageSize=10"));
  expect(response.status).toBe(200);
  expect(listStaffClaims).toHaveBeenCalledWith(reviewer, { status: "pending", page: 2, pageSize: 10 });
  await expect(response.json()).resolves.toEqual(staffPage);
});

it("returns controlled staff detail", async () => {
  const response = await detailGet(new Request(`http://localhost/api/staff/claims/${claimId}`), context(claimId));
  expect(getStaffClaim).toHaveBeenCalledWith(staff, claimId);
  await expect(response.json()).resolves.toEqual({ claim: staffDetail });
});

it("validates and sends an approval decision", async () => {
  const response = await decisionPost(jsonRequest(
    `http://localhost/api/staff/claims/${claimId}/decision`,
    { decision: "approve", reviewNote: "  ID checked at desk  " },
  ), context(claimId));
  expect(response.status).toBe(200);
  expect(decideClaim).toHaveBeenCalledWith(staff, claimId, {
    decision: "approve", reviewNote: "ID checked at desk",
  });
  await expect(response.json()).resolves.toEqual({ claim: approvedDetail });
});

it("accepts a bodyless completion", async () => {
  const response = await completePost(emptyPost(`http://localhost/api/staff/claims/${claimId}/complete`), context(claimId));
  expect(response.status).toBe(200);
  expect(completeClaim).toHaveBeenCalledWith(staff, claimId);
  await expect(response.json()).resolves.toEqual({ claim: completedDetail });
});
```

Add exact failure cases:

- all four routes authenticate before reading URL, params or body;
- missing session is exact 401; cookie/current-user/params/URL failures are hidden 500;
- invalid/duplicate/unknown queue parameters, invalid IDs, malformed decision JSON, decision other than approve/reject, oversized note, client-owned reviewer/status fields and non-empty completion body return 400 before services;
- mocked service `CLAIM_FORBIDDEN`, `CLAIM_NOT_FOUND` and `CLAIM_STATE_CONFLICT` responses retain exact status/message;
- mocked internal `SyntaxError` and database errors remain hidden 500;
- staff detail may include claimant answer/match/note but a scan proves it excludes `expectedAnswer`, password/session fields and unrelated profile settings.

- [ ] **Step 2: Run the staff-route test and confirm the red state**

```powershell
npm.cmd test -- src/app/api/staff/claims/staff-claim-routes.test.ts
```

Expected: FAIL because none of the four staff route modules exist.

- [ ] **Step 3: Implement the staff queue and detail GET handlers**

Create `staff/claims/route.ts`:

```ts
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { claimErrorResponse, invalidClaimResponse } from "@/lib/claims/errors";
import { listStaffClaims } from "@/lib/claims/staff-service";
import { claimListQuerySchema, toClaimListQueryInput } from "@/lib/claims/validation";

export async function GET(request: Request) {
  let user: PublicUser;
  try {
    const current = await getCurrentUser(await readSessionCookie());
    if (!current) throw new AuthError("AUTHENTICATION_REQUIRED");
    user = current;
  } catch (error) { return claimErrorResponse(error); }
  let parsed;
  try {
    parsed = claimListQuerySchema.safeParse(toClaimListQueryInput(new URL(request.url).searchParams));
  } catch (error) { return claimErrorResponse(error); }
  if (!parsed.success) return invalidClaimResponse(parsed.error);
  try { return Response.json(await listStaffClaims(user, parsed.data)); }
  catch (error) { return claimErrorResponse(error); }
}
```

Create `staff/claims/[id]/route.ts`:

```ts
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { claimErrorResponse, invalidClaimResponse } from "@/lib/claims/errors";
import { getStaffClaim } from "@/lib/claims/staff-service";
import { claimIdSchema } from "@/lib/claims/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  let user: PublicUser;
  try {
    const current = await getCurrentUser(await readSessionCookie());
    if (!current) throw new AuthError("AUTHENTICATION_REQUIRED");
    user = current;
  } catch (error) { return claimErrorResponse(error); }
  let rawId: string;
  try { rawId = (await context.params).id; }
  catch (error) { return claimErrorResponse(error); }
  const parsedId = claimIdSchema.safeParse(rawId);
  if (!parsedId.success) return invalidClaimResponse();
  try { return Response.json({ claim: await getStaffClaim(user, parsedId.data) }); }
  catch (error) { return claimErrorResponse(error); }
}
```

- [ ] **Step 4: Implement strict decision POST**

Create `staff/claims/[id]/decision/route.ts`:

```ts
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { claimErrorResponse, invalidClaimResponse } from "@/lib/claims/errors";
import { decideClaim } from "@/lib/claims/staff-service";
import { claimDecisionSchema, claimIdSchema } from "@/lib/claims/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  let user: PublicUser;
  try {
    const current = await getCurrentUser(await readSessionCookie());
    if (!current) throw new AuthError("AUTHENTICATION_REQUIRED");
    user = current;
  } catch (error) { return claimErrorResponse(error); }
  let rawId: string;
  try { rawId = (await context.params).id; }
  catch (error) { return claimErrorResponse(error); }
  const parsedId = claimIdSchema.safeParse(rawId);
  if (!parsedId.success) return invalidClaimResponse();
  let body: unknown;
  try { body = await request.json(); }
  catch (error) {
    return error instanceof SyntaxError ? invalidClaimResponse() : claimErrorResponse(error);
  }
  const parsed = claimDecisionSchema.safeParse(body);
  if (!parsed.success) return invalidClaimResponse(parsed.error);
  try { return Response.json({ claim: await decideClaim(user, parsedId.data, parsed.data) }); }
  catch (error) { return claimErrorResponse(error); }
}
```

The service call is outside the JSON `try/catch`, which prevents an internal service `SyntaxError` from becoming a false 400.

- [ ] **Step 5: Implement strict empty-body completion POST**

Create `staff/claims/[id]/complete/route.ts`:

```ts
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { claimErrorResponse, invalidClaimResponse } from "@/lib/claims/errors";
import { completeClaim } from "@/lib/claims/staff-service";
import { claimIdSchema, emptyClaimBodySchema } from "@/lib/claims/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  let user: PublicUser;
  try {
    const current = await getCurrentUser(await readSessionCookie());
    if (!current) throw new AuthError("AUTHENTICATION_REQUIRED");
    user = current;
  } catch (error) { return claimErrorResponse(error); }
  let rawId: string;
  try { rawId = (await context.params).id; }
  catch (error) { return claimErrorResponse(error); }
  const parsedId = claimIdSchema.safeParse(rawId);
  if (!parsedId.success) return invalidClaimResponse();
  let body: unknown = {};
  try {
    const text = await request.text();
    body = text.trim() === "" ? {} : JSON.parse(text);
  } catch (error) {
    return error instanceof SyntaxError ? invalidClaimResponse() : claimErrorResponse(error);
  }
  const parsed = emptyClaimBodySchema.safeParse(body);
  if (!parsed.success) return invalidClaimResponse(parsed.error);
  try { return Response.json({ claim: await completeClaim(user, parsedId.data) }); }
  catch (error) { return claimErrorResponse(error); }
}
```

- [ ] **Step 6: Run staff route/service verification**

```powershell
npm.cmd test -- src/app/api/staff/claims/staff-claim-routes.test.ts src/lib/claims/staff-service.test.ts
npx.cmd eslint src/app/api/staff/claims src/lib/claims/staff-service.ts
npx.cmd tsc --noEmit --incremental false
```

Expected: staff and administrator success cases pass; student/inactive, malformed and stale-state cases return their exact safe responses.

- [ ] **Step 7: Commit only Task 8**

```powershell
git diff --check
git add web/src/app/api/staff/claims/route.ts web/src/app/api/staff/claims/[id]/route.ts web/src/app/api/staff/claims/[id]/decision/route.ts web/src/app/api/staff/claims/[id]/complete/route.ts web/src/app/api/staff/claims/staff-claim-routes.test.ts
git diff --cached --check
git commit -m "feat(claims): add staff claim API routes" -m "Refs #19"
```

---

### Task 9: Full quality, security and scope verification

**Files:**
- Verify only; no planned source change.

**Interfaces:**
- Consumes: all Issue #19 commits and the existing application configuration.
- Produces: evidence that the branch is test-complete, buildable, dependency-clean, privacy-safe and limited to the approved backend scope.

- [ ] **Step 1: Run every automated test**

```powershell
npm.cmd test
```

Expected: every existing and new Vitest file passes. No test connects to Atlas.

- [ ] **Step 2: Run static and production checks**

```powershell
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run build
```

Expected: ESLint, standalone TypeScript and Next.js production build all exit 0. The route table contains all nine new Claim endpoints.

- [ ] **Step 3: Run the dependency audit**

```powershell
npm.cmd audit
```

Expected: `found 0 vulnerabilities`. Do not run `npm audit fix --force`; if anything appears, identify the exact dependency path before changing manifests.

- [ ] **Step 4: Confirm the secret environment file remains ignored without reading it**

From the repository root:

```powershell
git status --short --ignored web/.env.local
```

Expected exactly: `!! web/.env.local`. Never open or print the file.

- [ ] **Step 5: Run explicit Claim privacy scans**

```powershell
rg -n "expectedAnswer" web/src/lib/claims web/src/app/api/claims web/src/app/api/staff/claims "web/src/app/api/reports/[id]/claims" "web/src/app/api/reports/[id]/claim-questions"
rg -n "passwordHash|tokenHash|raw-session-token|activeClaimKey" web/src/lib/claims/public-claim.ts web/src/app/api/claims web/src/app/api/staff/claims
rg -n "ClaimEvidenceModel|responses\.answer|responses\.matched" web/src/lib/claims/claimant-service.ts web/src/lib/claims/staff-service.ts
```

Expected:

- production `expectedAnswer` occurs only in `claimant-service.ts` where creation explicitly selects and compares it; every other match is a test non-disclosure assertion;
- response mappers/routes contain no password, session or active-key output;
- ClaimEvidence answer/match access occurs only during creation and staff detail, never claimant list/detail.

- [ ] **Step 6: Verify the complete transition and permission matrix from test names**

```powershell
rg -n "pending|approved|rejected|withdrawn|completed|student|staff|administrator|suspended" web/src/lib/claims web/src/app/api/claims web/src/app/api/staff/claims -g "*.test.ts"
```

Expected: tests explicitly cover every approved transition, every rejected transition family, competing-claim rejection, report reopen/resolve behavior and the three roles plus inactive accounts.

- [ ] **Step 7: Verify branch scope and commit integrity**

From the repository root:

```powershell
git diff --check
git diff --check develop...HEAD
git status --short --branch
git diff --stat develop...HEAD
git diff --name-status develop...HEAD
git log --oneline develop..HEAD
```

Expected:

- clean `feature/issue-19-claim-management-backend` worktree;
- changes limited to the approved design/plan plus listed Claim models, Claim library modules and Claim routes/tests;
- no package manifest, lockfile, environment file, existing authentication implementation, existing report contract or frontend component changed;
- every branch commit references Issue #19.

- [ ] **Step 8: Prepare the user handoff without external mutations**

Report:

- exact test file and test counts;
- lint, TypeScript, build and audit results;
- privacy/role/transition audit evidence;
- `.env.local` ignored status without contents;
- exact branch name and commit list;
- the manual command `git push -u origin feature/issue-19-claim-management-backend` only after the user confirms readiness.

Do not push, create a pull request, merge, delete the branch or write to Atlas from this task.
