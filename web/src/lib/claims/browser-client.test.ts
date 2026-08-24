import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ClaimBrowserError,
  getClaimQuestionsForReport,
  getMyClaim,
  getMyClaims,
  submitClaim,
  withdrawMyClaim,
  type ClaimantClaim,
  type ClaimQuestions,
} from "./browser-client";

const claimantClaim = {
  id: "64b64c6f2f4d9f1a2b3c4d60",
  report: {
    id: "64b64c6f2f4d9f1a2b3c4d54",
    title: "Found student card",
    reportType: "found",
    status: "open",
  },
  status: "pending",
  reviewedAt: null,
  withdrawnAt: null,
  completedAt: null,
  createdAt: "2026-08-24T01:00:00.000Z",
  updatedAt: "2026-08-24T01:00:00.000Z",
} satisfies ClaimantClaim;

const claimQuestions = {
  report: {
    id: "64b64c6f2f4d9f1a2b3c4d54",
    title: "Found student card",
    reportType: "found",
  },
  questions: [
    { questionIndex: 0, question: "What is printed on the reverse?" },
  ],
} satisfies ClaimQuestions;

const claimPage = {
  claims: [claimantClaim],
  pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("claim browser client", () => {
  it("loads strict claim questions with an encoded report id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(claimQuestions));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getClaimQuestionsForReport("id/with spaces")).resolves.toEqual(
      claimQuestions,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reports/id%2Fwith%20spaces/claim-questions",
      { method: "GET", credentials: "same-origin" },
    );
  });

  it("posts only indexed responses and returns the safe created claim", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ claim: claimantClaim }, { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const responseWithPrivateProperty = {
      questionIndex: 0,
      answer: "Blue label",
      expectedAnswer: "private answer",
    };

    await expect(
      submitClaim(claimantClaim.report.id, [responseWithPrivateProperty]),
    ).resolves.toEqual(claimantClaim);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/reports/${claimantClaim.report.id}/claims`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          responses: [{ questionIndex: 0, answer: "Blue label" }],
        }),
      },
    );
  });

  it("uses typed list filters and omits the default page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(claimPage));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getMyClaims({ status: "pending", page: 1 }),
    ).resolves.toEqual(claimPage);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/claims/mine?status=pending",
      { method: "GET", credentials: "same-origin" },
    );
  });

  it("includes a non-default list page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        claims: [],
        pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getMyClaims({ status: "approved", page: 2 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/claims/mine?status=approved&page=2",
      { method: "GET", credentials: "same-origin" },
    );
  });

  it("encodes detail ids and posts an exact empty withdrawal object", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ claim: claimantClaim }))
      .mockResolvedValueOnce(Response.json({ claim: claimantClaim }));
    vi.stubGlobal("fetch", fetchMock);

    await getMyClaim("claim/with spaces");
    await withdrawMyClaim("claim/with spaces");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/claims/claim%2Fwith%20spaces",
      { method: "GET", credentials: "same-origin" },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/claims/claim%2Fwith%20spaces/withdraw",
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
    );
  });

  it.each([
    [
      "question expectedAnswer",
      () => getClaimQuestionsForReport(claimantClaim.report.id),
      {
        ...claimQuestions,
        questions: [
          {
            ...claimQuestions.questions[0],
            expectedAnswer: "private answer",
          },
        ],
      },
    ],
    [
      "question answer",
      () => getClaimQuestionsForReport(claimantClaim.report.id),
      {
        ...claimQuestions,
        questions: [
          { ...claimQuestions.questions[0], answer: "submitted evidence" },
        ],
      },
    ],
    [
      "duplicate question indexes",
      () => getClaimQuestionsForReport(claimantClaim.report.id),
      {
        ...claimQuestions,
        questions: [
          claimQuestions.questions[0],
          { questionIndex: 0, question: "Second question" },
        ],
      },
    ],
    [
      "matched result",
      () => getMyClaim(claimantClaim.id),
      { claim: { ...claimantClaim, matched: true } },
    ],
    [
      "verification result",
      () => getMyClaim(claimantClaim.id),
      {
        claim: {
          ...claimantClaim,
          verification: { questionCount: 1, matchedCount: 1 },
        },
      },
    ],
    [
      "review note",
      () => getMyClaim(claimantClaim.id),
      { claim: { ...claimantClaim, reviewNote: "private staff note" } },
    ],
    [
      "reviewer id",
      () => getMyClaim(claimantClaim.id),
      { claim: { ...claimantClaim, reviewedBy: "private-staff-id" } },
    ],
    [
      "claimant record",
      () => getMyClaim(claimantClaim.id),
      {
        claim: {
          ...claimantClaim,
          claimant: { id: "private-user-id", email: "private@example.com" },
        },
      },
    ],
    [
      "reporter id",
      () => getMyClaim(claimantClaim.id),
      {
        claim: {
          ...claimantClaim,
          report: { ...claimantClaim.report, reporterId: "private-user-id" },
        },
      },
    ],
    [
      "unknown pagination fields",
      () => getMyClaims({}),
      { ...claimPage, pagination: { ...claimPage.pagination, cursor: "secret" } },
    ],
    [
      "invalid date",
      () => getMyClaim(claimantClaim.id),
      { claim: { ...claimantClaim, updatedAt: "not-a-date" } },
    ],
    [
      "unsupported claim status",
      () => getMyClaim(claimantClaim.id),
      { claim: { ...claimantClaim, status: "archived" } },
    ],
    [
      "non-integer pagination",
      () => getMyClaims({}),
      { ...claimPage, pagination: { ...claimPage.pagination, page: 1.5 } },
    ],
  ])("rejects successful responses containing %s", async (_name, request, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));

    const error = await request().catch((reason: unknown) => reason);
    expect(error).toEqual(
      expect.objectContaining<Partial<ClaimBrowserError>>({
        code: "REQUEST_FAILED",
        status: 200,
        message: "We could not complete that request. Please try again.",
      }),
    );
    expect(String(error)).not.toContain("private");
  });

  it.each([
    [
      "VALIDATION_ERROR",
      400,
      "Invalid claim request",
      () => submitClaim(claimantClaim.report.id, []),
    ],
    [
      "AUTHENTICATION_REQUIRED",
      401,
      "Authentication required",
      () => getMyClaims({}),
    ],
    [
      "CLAIM_FORBIDDEN",
      403,
      "Claim action is not permitted",
      () => getMyClaims({}),
    ],
    [
      "CLAIM_NOT_FOUND",
      404,
      "Claim not found",
      () => getMyClaim(claimantClaim.id),
    ],
    [
      "CLAIM_ALREADY_EXISTS",
      409,
      "An active claim already exists",
      () => submitClaim(claimantClaim.report.id, []),
    ],
    [
      "REPORT_NOT_CLAIMABLE",
      409,
      "Report is not available for claiming",
      () => getClaimQuestionsForReport(claimantClaim.report.id),
    ],
    [
      "CLAIM_STATE_CONFLICT",
      409,
      "Claim state has changed",
      () => withdrawMyClaim(claimantClaim.id),
    ],
    [
      "CLAIM_OPERATION_FAILED",
      500,
      "Claim operation failed",
      () => getMyClaims({}),
    ],
  ])(
    "maps the validated %s code to a local public error",
    async (code, status, message, request) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          Response.json(
            { error: { code, message: "private service detail" } },
            { status },
          ),
        ),
      );

      const error = await request().catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(ClaimBrowserError);
      expect((error as Error & { cause?: unknown }).cause).toBeUndefined();
      expect(JSON.stringify(error)).not.toContain("private");
      expect(error).toEqual(
        expect.objectContaining<Partial<ClaimBrowserError>>({
          code,
          status,
          message,
        }),
      );
      expect((error as ClaimBrowserError).fields).toBeUndefined();
      expect(String(error)).not.toContain("private");
    },
  );

  it("maps response validation fields to local safe copy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "private service detail",
              fields: { responses: ["private validation detail"] },
            },
          },
          { status: 400 },
        ),
      ),
    );

    await expect(
      submitClaim(claimantClaim.report.id, []),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ClaimBrowserError>>({
        code: "VALIDATION_ERROR",
        status: 400,
        message: "Invalid claim request",
        fields: { responses: ["Check every answer and try again."] },
      }),
    );
  });

  it.each([
    [
      "unknown code",
      400,
      {
        error: {
          code: "PRIVATE_DATABASE_ERROR",
          message: "private service detail",
        },
      },
    ],
    [
      "status mismatch",
      500,
      {
        error: {
          code: "CLAIM_NOT_FOUND",
          message: "private service detail",
        },
      },
    ],
    [
      "unexpected validation field",
      400,
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "private service detail",
          fields: { internalPath: ["private validation detail"] },
        },
      },
    ],
    [
      "fields on a non-validation error",
      404,
      {
        error: {
          code: "CLAIM_NOT_FOUND",
          message: "private service detail",
          fields: { responses: ["private validation detail"] },
        },
      },
    ],
  ])("fails closed for a %s", async (_name, status, body) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json(body, { status })),
    );

    const error = await getMyClaim(claimantClaim.id).catch(
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(ClaimBrowserError);
    expect((error as Error & { cause?: unknown }).cause).toBeUndefined();
    expect(JSON.stringify(error)).not.toContain("private");
    expect(error).toEqual(
      expect.objectContaining<Partial<ClaimBrowserError>>({
        code: "REQUEST_FAILED",
        status,
        message: "We could not complete that request. Please try again.",
      }),
    );
    expect((error as ClaimBrowserError).fields).toBeUndefined();
    expect(String(error)).not.toContain("private");
  });

  it.each([
    ["non-JSON", new Response("private database trace", { status: 500 })],
    [
      "malformed public error",
      Response.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "private malformed message",
            trace: "private stack",
          },
        },
        { status: 400 },
      ),
    ],
    [
      "malformed success",
      Response.json({ claim: { id: "missing-safe-fields" } }),
    ],
  ])("replaces a %s response with a generic safe failure", async (_name, response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const error = await getMyClaim(claimantClaim.id).catch(
      (reason: unknown) => reason,
    );
    expect(error).toEqual(
      expect.objectContaining<Partial<ClaimBrowserError>>({
        code: "REQUEST_FAILED",
        status: response.status,
        message: "We could not complete that request. Please try again.",
      }),
    );
    expect(String(error)).not.toContain("private");
  });

  it("hides rejected Fetch details behind a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("private network detail")),
    );

    const error = await getMyClaims({}).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ClaimBrowserError);
    expect((error as Error & { cause?: unknown }).cause).toBeUndefined();
    expect(JSON.stringify(error)).not.toContain("private");
    expect(error).toEqual(
      expect.objectContaining<Partial<ClaimBrowserError>>({
        code: "NETWORK_ERROR",
        status: 0,
        message: "We could not reach the service. Please try again.",
      }),
    );
    expect(String(error)).not.toContain("private");
  });
});
