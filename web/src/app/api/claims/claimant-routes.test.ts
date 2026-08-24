import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/claims/claimant-service", () => ({
  getClaimQuestions: vi.fn(),
  createClaim: vi.fn(),
  listOwnClaims: vi.fn(),
  getOwnClaim: vi.fn(),
  withdrawOwnClaim: vi.fn(),
}));

import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { PublicUser } from "@/lib/auth/public-user";
import {
  createClaim,
  getClaimQuestions,
  getOwnClaim,
  listOwnClaims,
  withdrawOwnClaim,
} from "@/lib/claims/claimant-service";
import { ClaimError, type ClaimErrorCode } from "@/lib/claims/errors";
import type { ClaimantClaim } from "@/lib/claims/public-claim";
import { BodyTooLarge } from "@/lib/claims/request-body";

import { GET as questionsGet } from "../reports/[id]/claim-questions/route";
import { POST as claimsPost } from "../reports/[id]/claims/route";
import { GET as ownDetailGet } from "./[id]/route";
import { POST as withdrawPost } from "./[id]/withdraw/route";
import { GET as mineGet } from "./mine/route";

const reportId = "64b64c6f2f4d9f1a2b3c4d54";
const claimId = "64b64c6f2f4d9f1a2b3c4d55";

const student = {
  id: "64b64c6f2f4d9f1a2b3c4d51",
  email: "student@example.com",
  role: "student",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Student Name",
    preferredContactMethod: "in_app",
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
} satisfies PublicUser;

const claimantClaim = {
  id: claimId,
  report: {
    id: reportId,
    title: "Black laptop charger",
    reportType: "found",
    status: "open",
  },
  status: "pending",
  reviewedAt: null,
  withdrawnAt: null,
  completedAt: null,
  createdAt: "2026-08-24T01:00:00.000Z",
  updatedAt: "2026-08-24T01:01:00.000Z",
} satisfies ClaimantClaim;

const withdrawnClaim = {
  ...claimantClaim,
  status: "withdrawn",
  withdrawnAt: "2026-08-24T02:00:00.000Z",
} satisfies ClaimantClaim;

const claimQuestions = {
  report: {
    id: reportId,
    title: "Black laptop charger",
    reportType: "found" as const,
  },
  questions: [
    { questionIndex: 0, question: "What mark is near the plug?" },
  ],
};

const claimPage = {
  claims: [claimantClaim],
  pagination: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
};

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const rejectedContext = (secret = "PRIVATE-PARAMS") => ({
  params: {
    then() {
      throw new Error(secret);
    },
  } as unknown as Promise<{ id: string }>,
});
const jsonRequest = (url: string, body: unknown) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const malformedPost = (url: string) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
const emptyPost = (url: string) => new Request(url, { method: "POST" });
const failingBodyPost = (error: Error) => ({
  headers: new Headers(),
  body: new ReadableStream<Uint8Array>({
    pull() {
      throw error;
    },
  }),
}) as Request;
const oversizedJsonRequest = (url: string, body: unknown) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: `${JSON.stringify(body)}${" ".repeat(16 * 1024)}`,
  });
const invalidUtf8Post = (url: string) =>
  new Request(url, {
    method: "POST",
    body: new Blob([new Uint8Array([0xff])]),
  });

function expectNoClaimSecrets(value: unknown) {
  expect(JSON.stringify(value)).not.toMatch(
    /expectedAnswer|verificationMatchedCount|reviewNote|activeClaimKey|passwordHash|tokenHash|PRIVATE-ANSWER/,
  );
}

async function expectAuthenticationRequired(response: Response) {
  expect(response.status).toBe(401);
  const body = await response.json();
  expect(body).toEqual({
    error: {
      code: "AUTHENTICATION_REQUIRED",
      message: "Authentication required",
    },
  });
  expectNoClaimSecrets(body);
}

async function expectValidationError(response: Response) {
  expect(response.status).toBe(400);
  const body = await response.json();
  expect(body).toEqual({
    error: {
      code: "VALIDATION_ERROR",
      message: "Invalid claim request",
      ...(body.error.fields ? { fields: expect.any(Object) } : {}),
    },
  });
  expectNoClaimSecrets(body);
}

async function expectOperationFailed(response: Response, secret?: string) {
  expect(response.status).toBe(500);
  const body = await response.json();
  expect(body).toEqual({
    error: {
      code: "CLAIM_OPERATION_FAILED",
      message: "Claim operation failed",
    },
  });
  if (secret) expect(JSON.stringify(body)).not.toContain(secret);
  expectNoClaimSecrets(body);
}

describe("claimant claim routes", () => {
  beforeEach(() => {
    vi.mocked(readSessionCookie).mockReset();
    vi.mocked(getCurrentUser).mockReset();
    vi.mocked(getClaimQuestions).mockReset();
    vi.mocked(createClaim).mockReset();
    vi.mocked(listOwnClaims).mockReset();
    vi.mocked(getOwnClaim).mockReset();
    vi.mocked(withdrawOwnClaim).mockReset();

    vi.mocked(readSessionCookie).mockResolvedValue("raw-session-token");
    vi.mocked(getCurrentUser).mockResolvedValue(student);
    vi.mocked(getClaimQuestions).mockResolvedValue(claimQuestions);
    vi.mocked(createClaim).mockResolvedValue(claimantClaim);
    vi.mocked(listOwnClaims).mockResolvedValue(claimPage);
    vi.mocked(getOwnClaim).mockResolvedValue(claimantClaim);
    vi.mocked(withdrawOwnClaim).mockResolvedValue(withdrawnClaim);
  });

  it("returns claimant-safe verification questions", async () => {
    const response = await questionsGet(
      new Request(
        `http://localhost/api/reports/${reportId}/claim-questions`,
      ),
      context(reportId),
    );

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
    const body = await response.json();
    expect(body).toEqual({ claim: claimantClaim });
    expectNoClaimSecrets(body);
  });

  it("lists only the current student's transformed query", async () => {
    const response = await mineGet(
      new Request(
        "http://localhost/api/claims/mine?status=pending&page=2&pageSize=10",
      ),
    );

    expect(response.status).toBe(200);
    expect(listOwnClaims).toHaveBeenCalledWith(student, {
      status: "pending",
      page: 2,
      pageSize: 10,
    });
    const body = await response.json();
    expect(body).toEqual(claimPage);
    expectNoClaimSecrets(body);
  });

  it("returns one own safe detail", async () => {
    const response = await ownDetailGet(
      new Request(`http://localhost/api/claims/${claimId}`),
      context(claimId),
    );

    expect(response.status).toBe(200);
    expect(getOwnClaim).toHaveBeenCalledWith(student, claimId);
    const body = await response.json();
    expect(body).toEqual({ claim: claimantClaim });
    expectNoClaimSecrets(body);
  });

  it("accepts a bodyless withdrawal", async () => {
    const response = await withdrawPost(
      emptyPost(`http://localhost/api/claims/${claimId}/withdraw`),
      context(claimId),
    );

    expect(response.status).toBe(200);
    expect(withdrawOwnClaim).toHaveBeenCalledWith(student, claimId);
    const body = await response.json();
    expect(body).toEqual({ claim: withdrawnClaim });
    expectNoClaimSecrets(body);
  });

  it.each([
    ["questions", () => questionsGet({} as Request, rejectedContext("PRIVATE-ANSWER"))],
    [
      "creation",
      () =>
        claimsPost(
          { json: () => Promise.reject(new Error("PRIVATE-ANSWER")) } as Request,
          rejectedContext("PRIVATE-ANSWER"),
        ),
    ],
    [
      "own list",
      () =>
        mineGet({
          get url() {
            throw new Error("PRIVATE-ANSWER");
          },
        } as unknown as Request),
    ],
    ["own detail", () => ownDetailGet({} as Request, rejectedContext("PRIVATE-ANSWER"))],
    [
      "withdrawal",
      () =>
        withdrawPost(
          { text: () => Promise.reject(new Error("PRIVATE-ANSWER")) } as Request,
          rejectedContext("PRIVATE-ANSWER"),
        ),
    ],
  ])("authenticates before reading %s inputs", async (_case, invoke) => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    await expectAuthenticationRequired(await invoke());
    expect(getClaimQuestions).not.toHaveBeenCalled();
    expect(createClaim).not.toHaveBeenCalled();
    expect(listOwnClaims).not.toHaveBeenCalled();
    expect(getOwnClaim).not.toHaveBeenCalled();
    expect(withdrawOwnClaim).not.toHaveBeenCalled();
  });

  it.each([
    ["cookie", readSessionCookie],
    ["current user", getCurrentUser],
  ])("hides %s authentication failures", async (_case, dependency) => {
    vi.mocked(dependency).mockRejectedValue(new Error("PRIVATE-AUTH"));

    const response = await questionsGet(
      new Request(`http://localhost/api/reports/${reportId}/claim-questions`),
      rejectedContext("PRIVATE-PARAMS"),
    );

    await expectOperationFailed(response, "PRIVATE-AUTH");
    expect(getClaimQuestions).not.toHaveBeenCalled();
  });

  it.each([
    ["questions", () => questionsGet({} as Request, rejectedContext()), getClaimQuestions],
    ["creation", () => claimsPost({} as Request, rejectedContext()), createClaim],
    ["own detail", () => ownDetailGet({} as Request, rejectedContext()), getOwnClaim],
    ["withdrawal", () => withdrawPost({} as Request, rejectedContext()), withdrawOwnClaim],
  ] as const)(
    "hides rejected %s parameters",
    async (_case, invoke, service) => {
      await expectOperationFailed(await invoke(), "PRIVATE-PARAMS");
      expect(service).not.toHaveBeenCalled();
    },
  );

  it("hides list request URL failures", async () => {
    const response = await mineGet({
      get url() {
        throw new Error("PRIVATE-URL");
      },
    } as unknown as Request);

    await expectOperationFailed(response, "PRIVATE-URL");
    expect(listOwnClaims).not.toHaveBeenCalled();
  });

  it.each([
    [
      "creation",
      () => claimsPost(failingBodyPost(new Error("PRIVATE-BODY")), context(reportId)),
      createClaim,
    ],
    [
      "withdrawal",
      () => withdrawPost(failingBodyPost(new Error("PRIVATE-BODY")), context(claimId)),
      withdrawOwnClaim,
    ],
    [
      "creation with a size-shaped stream error",
      () => claimsPost(failingBodyPost(new BodyTooLarge()), context(reportId)),
      createClaim,
    ],
    [
      "withdrawal with a size-shaped stream error",
      () => withdrawPost(failingBodyPost(new BodyTooLarge()), context(claimId)),
      withdrawOwnClaim,
    ],
  ] as const)("hides %s body stream failures", async (_case, invoke, service) => {
    await expectOperationFailed(await invoke(), "PRIVATE-BODY");
    expect(service).not.toHaveBeenCalled();
  });

  it.each([
    [
      "creation",
      () => claimsPost(failingBodyPost(new SyntaxError("PRIVATE-BODY")), context(reportId)),
      createClaim,
    ],
    [
      "withdrawal",
      () => withdrawPost(failingBodyPost(new SyntaxError("PRIVATE-BODY")), context(claimId)),
      withdrawOwnClaim,
    ],
  ] as const)("hides a SyntaxError while reading the %s body stream", async (_case, invoke, service) => {
    await expectOperationFailed(await invoke(), "PRIVATE-BODY");
    expect(service).not.toHaveBeenCalled();
  });

  it.each([
    [
      "creation",
      () => claimsPost(
        oversizedJsonRequest(
          `http://localhost/api/reports/${reportId}/claims`,
          { responses: [{ questionIndex: 0, answer: "Blue mark" }] },
        ),
        context(reportId),
      ),
      createClaim,
    ],
    [
      "withdrawal",
      () => withdrawPost(
        oversizedJsonRequest(
          `http://localhost/api/claims/${claimId}/withdraw`,
          {},
        ),
        context(claimId),
      ),
      withdrawOwnClaim,
    ],
  ] as const)("rejects an oversized %s body", async (_case, invoke, service) => {
    await expectValidationError(await invoke());
    expect(service).not.toHaveBeenCalled();
  });

  it.each([
    [
      "creation",
      () => claimsPost(
        invalidUtf8Post(`http://localhost/api/reports/${reportId}/claims`),
        context(reportId),
      ),
      createClaim,
    ],
    [
      "withdrawal",
      () => withdrawPost(
        invalidUtf8Post(`http://localhost/api/claims/${claimId}/withdraw`),
        context(claimId),
      ),
      withdrawOwnClaim,
    ],
  ] as const)("rejects invalid UTF-8 in the %s body", async (_case, invoke, service) => {
    await expectValidationError(await invoke());
    expect(service).not.toHaveBeenCalled();
  });

  it.each([
    ["question report", () => questionsGet({} as Request, context("not-an-id")), getClaimQuestions],
    [
      "creation report",
      () => claimsPost(jsonRequest("http://localhost/api/reports/not-an-id/claims", { responses: [{ questionIndex: 0, answer: "Blue mark" }] }), context("not-an-id")),
      createClaim,
    ],
    ["own detail claim", () => ownDetailGet({} as Request, context("not-an-id")), getOwnClaim],
    ["withdrawal claim", () => withdrawPost(emptyPost("http://localhost"), context("not-an-id")), withdrawOwnClaim],
  ] as const)("rejects an invalid %s ID", async (_case, invoke, service) => {
    await expectValidationError(await invoke());
    expect(service).not.toHaveBeenCalled();
  });

  it("rejects malformed claim-creation JSON", async () => {
    const response = await claimsPost(
      malformedPost(`http://localhost/api/reports/${reportId}/claims`),
      context(reportId),
    );

    await expectValidationError(response);
    expect(createClaim).not.toHaveBeenCalled();
  });

  it.each([
    ["missing body", undefined],
    ["unknown field", { responses: [], status: "approved" }],
    [
      "duplicate response indexes",
      { responses: [{ questionIndex: 0, answer: "Blue mark" }, { questionIndex: 0, answer: "Other mark" }] },
    ],
  ])("rejects %s during claim creation", async (_case, body) => {
    const request = body === undefined
      ? emptyPost(`http://localhost/api/reports/${reportId}/claims`)
      : jsonRequest(`http://localhost/api/reports/${reportId}/claims`, body);

    await expectValidationError(await claimsPost(request, context(reportId)));
    expect(createClaim).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid pagination", "?page=0"],
    ["duplicate status", "?status=pending&status=approved"],
    ["duplicate page", "?page=1&page=2"],
    ["unknown query key", "?sort=createdAt"],
  ])("rejects %s", async (_case, query) => {
    await expectValidationError(await mineGet(new Request(`http://localhost/api/claims/mine${query}`)));
    expect(listOwnClaims).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", malformedPost("http://localhost/withdraw")],
    ["unknown field", jsonRequest("http://localhost/withdraw", { force: true })],
  ])("rejects a non-empty withdrawal body with %s", async (_case, request) => {
    await expectValidationError(await withdrawPost(request, context(claimId)));
    expect(withdrawOwnClaim).not.toHaveBeenCalled();
  });

  it.each([
    ["VALIDATION_ERROR", 400, "Invalid claim request"],
    ["CLAIM_FORBIDDEN", 403, "Claim action is not permitted"],
    ["CLAIM_NOT_FOUND", 404, "Claim not found"],
    ["CLAIM_ALREADY_EXISTS", 409, "An active claim already exists"],
    ["REPORT_NOT_CLAIMABLE", 409, "Report is not available for claiming"],
    ["CLAIM_STATE_CONFLICT", 409, "Claim state has changed"],
    ["CLAIM_OPERATION_FAILED", 500, "Claim operation failed"],
  ] as const)("preserves %s service errors", async (code, status, message) => {
    vi.mocked(getOwnClaim).mockRejectedValue(new ClaimError(code as ClaimErrorCode));

    const response = await ownDetailGet(
      new Request(`http://localhost/api/claims/${claimId}`),
      context(claimId),
    );

    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body).toEqual({ error: { code, message } });
    expectNoClaimSecrets(body);
  });

  it("does not misclassify an internal service SyntaxError", async () => {
    vi.mocked(createClaim).mockRejectedValue(new SyntaxError("PRIVATE-ANSWER internal parser detail"));

    const response = await claimsPost(
      jsonRequest(`http://localhost/api/reports/${reportId}/claims`, {
        responses: [{ questionIndex: 0, answer: "Blue mark" }],
      }),
      context(reportId),
    );

    await expectOperationFailed(response, "PRIVATE-ANSWER");
  });

  it("hides unknown service failures", async () => {
    vi.mocked(withdrawOwnClaim).mockRejectedValue(new Error("PRIVATE-ANSWER database detail"));

    await expectOperationFailed(
      await withdrawPost(emptyPost(`http://localhost/api/claims/${claimId}/withdraw`), context(claimId)),
      "PRIVATE-ANSWER",
    );
  });
});
