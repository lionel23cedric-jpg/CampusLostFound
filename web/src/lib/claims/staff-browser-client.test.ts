import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CLAIM_STATUSES,
  ClaimBrowserError,
} from "./browser-client";
import {
  completeStaffClaim,
  decideStaffClaim,
  getStaffClaim,
  getStaffClaims,
  type StaffClaimDetail,
  type StaffClaimPage,
  type StaffClaimSummary,
} from "./staff-browser-client";

const summary = {
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
  claimant: {
    id: "64b64c6f2f4d9f1a2b3c4d61",
    email: "student@example.com",
    displayName: "Student Name",
    preferredContactMethod: "email",
  },
  verification: { questionCount: 2, matchedCount: 1 },
  reviewedBy: null,
} satisfies StaffClaimSummary;

const detail = {
  ...summary,
  reviewNote: null,
  responses: [
    {
      questionIndex: 0,
      question: "What is printed on the reverse?",
      answer: "Blue library label",
      matched: true,
    },
    {
      questionIndex: 1,
      question: "Which corner is damaged?",
      answer: "Top right",
      matched: false,
    },
  ],
} satisfies StaffClaimDetail;

const page = {
  claims: [summary],
  pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubDetail(body: unknown = { claim: detail }) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
}

async function expectSafeRequestFailure(
  request: () => Promise<unknown>,
  status = 200,
) {
  const error = await request().catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(ClaimBrowserError);
  expect(error).toEqual(
    expect.objectContaining<Partial<ClaimBrowserError>>({
      code: "REQUEST_FAILED",
      status,
      message: "We could not complete that request. Please try again.",
    }),
  );
  expect((error as Error & { cause?: unknown }).cause).toBeUndefined();
  expect((error as ClaimBrowserError).fields).toBeUndefined();
  expect(JSON.stringify(error)).not.toContain("private");
  expect(String(error)).not.toContain("private");
}

describe("staff Claim browser client", () => {
  it("loads the canonical pending queue without redundant parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(page));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getStaffClaims({})).resolves.toEqual(page);
    expect(fetchMock).toHaveBeenCalledWith("/api/staff/claims", {
      method: "GET",
      credentials: "same-origin",
    });
  });

  it.each(CLAIM_STATUSES)(
    "accepts the %s status in queue summaries and details",
    async (status) => {
      const statusSummary = { ...summary, status } satisfies StaffClaimSummary;
      const statusDetail = { ...detail, status } satisfies StaffClaimDetail;
      const statusPage = {
        ...page,
        claims: [statusSummary],
      } satisfies StaffClaimPage;
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(Response.json(statusPage))
        .mockResolvedValueOnce(Response.json({ claim: statusDetail }));
      vi.stubGlobal("fetch", fetchMock);

      const parsedPage = await getStaffClaims({ status });
      const parsedDetail = await getStaffClaim(statusSummary.id);

      expect(parsedPage.claims[0].status).toBe(status);
      expect(parsedDetail.status).toBe(status);
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        status === "pending"
          ? "/api/staff/claims"
          : `/api/staff/claims?status=${status}`,
        { method: "GET", credentials: "same-origin" },
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        `/api/staff/claims/${statusSummary.id}`,
        { method: "GET", credentials: "same-origin" },
      );
    },
  );

  it("orders status before a non-default page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        claims: [],
        pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getStaffClaims({ status: "approved", page: 2 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/staff/claims?status=approved&page=2",
      { method: "GET", credentials: "same-origin" },
    );
  });

  it("encodes detail ids and posts only the selected decision and note", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ claim: detail }))
      .mockResolvedValueOnce(Response.json({ claim: detail }));
    vi.stubGlobal("fetch", fetchMock);

    await getStaffClaim("claim/with spaces");
    await decideStaffClaim("claim/with spaces", {
      decision: "approve",
      reviewNote: "Identity confirmed",
      responses: detail.responses,
    } as Parameters<typeof decideStaffClaim>[1] & {
      responses: StaffClaimDetail["responses"];
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/staff/claims/claim%2Fwith%20spaces",
      { method: "GET", credentials: "same-origin" },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/staff/claims/claim%2Fwith%20spaces/decision",
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: "approve",
          reviewNote: "Identity confirmed",
        }),
      },
    );
  });

  it("posts an exact empty completion object", async () => {
    const completed = {
      ...detail,
      status: "completed" as const,
      completedAt: "2026-08-25T01:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ claim: completed }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeStaffClaim(summary.id)).resolves.toEqual(completed);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/staff/claims/${summary.id}/complete`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
    );
  });

  it.each([
    ["null workflow fields", detail],
    [
      "optional workflow dates and note",
      {
        ...detail,
        reviewedAt: "2026-08-24T13:00:00+12:00",
        withdrawnAt: "2026-08-24T14:00:00+12:00",
        completedAt: "2026-08-24T15:00:00+12:00",
        reviewNote: "Identity checked at the service desk",
        reviewedBy: "64b64c6f2f4d9f1a2b3c4d62",
      },
    ],
  ])("accepts %s", async (_name, claim) => {
    stubDetail({ claim });

    await expect(getStaffClaim(summary.id)).resolves.toEqual(claim);
  });

  it.each([5, 200])("accepts a %i-character question", async (length) => {
    const claim = {
      ...detail,
      responses: [
        { ...detail.responses[0], question: "q".repeat(length) },
        detail.responses[1],
      ],
    } satisfies StaffClaimDetail;
    stubDetail({ claim });

    const parsed = await getStaffClaim(summary.id);
    expect(parsed.responses[0].question).toHaveLength(length);
  });

  it.each<[
    string,
    (value: StaffClaimDetail) => unknown,
  ]>([
    ["an expected answer", (value) => ({ ...value, expectedAnswer: "private" })],
    [
      "a password",
      (value) => ({
        ...value,
        claimant: { ...value.claimant, password: "private" },
      }),
    ],
    [
      "a session token",
      (value) => ({
        ...value,
        responses: [
          { ...value.responses[0], sessionToken: "private" },
          value.responses[1],
        ],
      }),
    ],
    [
      "an active Claim key",
      (value) => ({
        ...value,
        report: { ...value.report, activeClaimKey: "private" },
      }),
    ],
    [
      "an extra nested field",
      (value) => ({
        ...value,
        verification: { ...value.verification, privateScore: 1 },
      }),
    ],
    [
      "a malformed email",
      (value) => ({
        ...value,
        claimant: { ...value.claimant, email: "not-an-email" },
      }),
    ],
    [
      "an unsupported contact method",
      (value) => ({
        ...value,
        claimant: { ...value.claimant, preferredContactMethod: "phone" },
      }),
    ],
    ["an invalid Claim id", (value) => ({ ...value, id: "not-an-id" })],
    [
      "an invalid report id",
      (value) => ({ ...value, report: { ...value.report, id: "not-an-id" } }),
    ],
    [
      "an invalid claimant id",
      (value) => ({
        ...value,
        claimant: { ...value.claimant, id: "not-an-id" },
      }),
    ],
    ["an invalid date", (value) => ({ ...value, updatedAt: "not-a-date" })],
    [
      "a date without an offset",
      (value) => ({ ...value, updatedAt: "2026-08-24T01:00:00" }),
    ],
    ["an unsupported Claim status", (value) => ({ ...value, status: "archived" })],
    [
      "an unsupported report status",
      (value) => ({
        ...value,
        report: { ...value.report, status: "deleted" },
      }),
    ],
    [
      "duplicate response indexes",
      (value) => ({
        ...value,
        responses: value.responses.map((response) => ({
          ...response,
          questionIndex: 0,
        })),
      }),
    ],
    [
      "non-contiguous response indexes",
      (value) => ({
        ...value,
        responses: value.responses.map((response, index) => ({
          ...response,
          questionIndex: index + 1,
        })),
      }),
    ],
    [
      "a question below 5 characters",
      (value) => ({
        ...value,
        responses: [
          { ...value.responses[0], question: "q".repeat(4) },
          value.responses[1],
        ],
      }),
    ],
    [
      "a question above 200 characters",
      (value) => ({
        ...value,
        responses: [
          { ...value.responses[0], question: "q".repeat(201) },
          value.responses[1],
        ],
      }),
    ],
    [
      "an answer above 500 characters",
      (value) => ({
        ...value,
        responses: [
          { ...value.responses[0], answer: "a".repeat(501) },
          value.responses[1],
        ],
      }),
    ],
    [
      "an empty answer",
      (value) => ({
        ...value,
        responses: [{ ...value.responses[0], answer: "" }, value.responses[1]],
      }),
    ],
    ["a note above 1000 characters", (value) => ({ ...value, reviewNote: "n".repeat(1001) })],
    [
      "a response count mismatch",
      (value) => ({ ...value, responses: [value.responses[0]] }),
    ],
    [
      "a match count mismatch",
      (value) => ({
        ...value,
        responses: value.responses.map((response) => ({
          ...response,
          matched: false,
        })),
      }),
    ],
    [
      "a matched count above the question count",
      (value) => ({
        ...value,
        verification: { questionCount: 1, matchedCount: 2 },
        responses: [value.responses[0]],
      }),
    ],
  ])("rejects a successful detail containing %s", async (_name, mutate) => {
    stubDetail({ claim: mutate(detail) });

    await expectSafeRequestFailure(() => getStaffClaim(summary.id));
  });

  it.each([
    [
      "an extra summary field",
      { ...summary, expectedAnswer: "private" },
    ],
    [
      "a pagination page size above 50",
      summary,
      { ...page.pagination, pageSize: 51 },
    ],
    [
      "an extra pagination field",
      summary,
      { ...page.pagination, cursor: "private" },
    ],
  ])("rejects a successful page containing %s", async (_name, claim, pagination = page.pagination) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ claims: [claim], pagination }),
      ),
    );

    await expectSafeRequestFailure(() => getStaffClaims({}));
  });

  it.each([
    ["VALIDATION_ERROR", 400, "Invalid claim request"],
    ["AUTHENTICATION_REQUIRED", 401, "Authentication required"],
    ["CLAIM_FORBIDDEN", 403, "Claim action is not permitted"],
    ["CLAIM_NOT_FOUND", 404, "Claim not found"],
    ["CLAIM_ALREADY_EXISTS", 409, "An active claim already exists"],
    ["REPORT_NOT_CLAIMABLE", 409, "Report is not available for claiming"],
    ["CLAIM_STATE_CONFLICT", 409, "Claim state has changed"],
    ["CLAIM_OPERATION_FAILED", 500, "Claim operation failed"],
  ])(
    "maps the validated %s code to a local public error",
    async (code, status, message) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          Response.json(
            { error: { code, message: "private service detail" } },
            { status },
          ),
        ),
      );

      const error = await getStaffClaim(summary.id).catch(
        (reason: unknown) => reason,
      );
      expect(error).toBeInstanceOf(ClaimBrowserError);
      expect(error).toEqual(
        expect.objectContaining<Partial<ClaimBrowserError>>({
          code,
          status,
          message,
        }),
      );
      expect((error as Error & { cause?: unknown }).cause).toBeUndefined();
      expect((error as ClaimBrowserError).fields).toBeUndefined();
      expect(JSON.stringify(error)).not.toContain("private");
      expect(String(error)).not.toContain("private");
    },
  );

  it.each([
    { decision: ["private decision detail"] },
    { reviewNote: ["private note detail"] },
    {
      decision: ["private decision detail"],
      reviewNote: ["private note detail"],
    },
  ])("maps validation fields to one local form guidance", async (fields) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "private service detail",
              fields,
            },
          },
          { status: 400 },
        ),
      ),
    );

    await expect(
      decideStaffClaim(summary.id, {
        decision: "reject",
        reviewNote: null,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ClaimBrowserError>>({
        code: "VALIDATION_ERROR",
        status: 400,
        message: "Invalid claim request",
        fields: {
          form: ["Review the decision and internal note, then try again."],
        },
      }),
    );
  });

  it.each([
    [
      "an unknown code",
      400,
      { error: { code: "PRIVATE_DATABASE_ERROR", message: "private" } },
    ],
    [
      "a status mismatch",
      500,
      { error: { code: "CLAIM_NOT_FOUND", message: "private" } },
    ],
    [
      "an unexpected validation field",
      400,
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "private",
          fields: { internalPath: ["private"] },
        },
      },
    ],
    [
      "empty validation fields",
      400,
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "private",
          fields: {},
        },
      },
    ],
    [
      "fields on a non-validation error",
      404,
      {
        error: {
          code: "CLAIM_NOT_FOUND",
          message: "private",
          fields: { reviewNote: ["private"] },
        },
      },
    ],
    [
      "an extra envelope field",
      403,
      {
        error: {
          code: "CLAIM_FORBIDDEN",
          message: "private",
          trace: "private",
        },
      },
    ],
  ])("fails closed for %s", async (_name, status, body) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json(body, { status })),
    );

    await expectSafeRequestFailure(() => getStaffClaim(summary.id), status);
  });

  it.each([
    ["non-JSON", new Response("private database trace", { status: 500 })],
    [
      "malformed success",
      Response.json({ claim: { id: "missing-safe-fields", trace: "private" } }),
    ],
  ])("replaces a %s response with a generic safe failure", async (_name, response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expectSafeRequestFailure(
      () => getStaffClaim(summary.id),
      response.status,
    );
  });

  it("hides rejected Fetch details behind a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("private network detail")),
    );

    const error = await getStaffClaims({}).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ClaimBrowserError);
    expect(error).toEqual(
      expect.objectContaining<Partial<ClaimBrowserError>>({
        code: "NETWORK_ERROR",
        status: 0,
        message: "We could not reach the service. Please try again.",
      }),
    );
    expect((error as Error & { cause?: unknown }).cause).toBeUndefined();
    expect(JSON.stringify(error)).not.toContain("private");
    expect(String(error)).not.toContain("private");
  });
});
