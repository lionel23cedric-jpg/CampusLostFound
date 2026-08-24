import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/claims/staff-service", () => ({
  listStaffClaims: vi.fn(), getStaffClaim: vi.fn(),
  decideClaim: vi.fn(), completeClaim: vi.fn(),
}));

import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { PublicUser } from "@/lib/auth/public-user";
import { ClaimError, type ClaimErrorCode } from "@/lib/claims/errors";
import type { StaffClaimDetail, StaffClaimSummary } from "@/lib/claims/public-claim";
import { BodyTooLarge } from "@/lib/claims/request-body";
import { completeClaim, decideClaim, getStaffClaim, listStaffClaims } from "@/lib/claims/staff-service";

import { GET as detailGet } from "./[id]/route";
import { POST as completePost } from "./[id]/complete/route";
import { POST as decisionPost } from "./[id]/decision/route";
import { GET as queueGet } from "./route";

const reportId = "64b64c6f2f4d9f1a2b3c4d54";
const claimId = "64b64c6f2f4d9f1a2b3c4d55";
const claimantId = "64b64c6f2f4d9f1a2b3c4d51";
const reviewerId = "64b64c6f2f4d9f1a2b3c4d52";

const staff = {
  id: reviewerId,
  email: "staff@example.com",
  role: "staff",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Staff Reviewer",
    preferredContactMethod: "in_app",
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true, claimUpdates: true,
      statusChanges: true, handoverInstructions: true,
    },
  },
} satisfies PublicUser;

const staffSummary = {
  id: claimId,
  report: { id: reportId, title: "Black laptop charger", reportType: "found", status: "open" },
  status: "pending",
  reviewedAt: null,
  withdrawnAt: null,
  completedAt: null,
  createdAt: "2026-08-24T01:00:00.000Z",
  updatedAt: "2026-08-24T01:01:00.000Z",
  claimant: {
    id: claimantId,
    email: "student@example.com",
    displayName: "Student Name",
    preferredContactMethod: "email",
  },
  verification: { questionCount: 1, matchedCount: 1 },
  reviewedBy: null,
} satisfies StaffClaimSummary;

const staffDetail = {
  ...staffSummary,
  reviewNote: "Identity evidence is ready for review.",
  responses: [{
    questionIndex: 0,
    question: "What mark is near the plug?",
    answer: "Small blue paint mark",
    matched: true,
  }],
} satisfies StaffClaimDetail;

const approvedDetail = {
  ...staffDetail,
  report: { ...staffDetail.report, status: "claim_pending" },
  status: "approved",
  reviewedAt: "2026-08-24T02:00:00.000Z",
  reviewedBy: reviewerId,
  reviewNote: "ID checked at desk",
} satisfies StaffClaimDetail;

const completedDetail = {
  ...approvedDetail,
  report: { ...approvedDetail.report, status: "resolved" },
  status: "completed",
  completedAt: "2026-08-24T03:00:00.000Z",
} satisfies StaffClaimDetail;

const staffPage = {
  claims: [staffSummary],
  pagination: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
};

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const rejectedContext = (secret = "PRIVATE-PARAMS") => ({
  params: { then() { throw new Error(secret); } } as unknown as Promise<{ id: string }>,
});
const jsonRequest = (url: string, body: unknown) => new Request(url, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const malformedPost = (url: string) => new Request(url, {
  method: "POST", headers: { "content-type": "application/json" }, body: "{",
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

function expectNoStaffSecrets(value: unknown) {
  expect(JSON.stringify(value)).not.toMatch(
    /expectedAnswer|passwordHash|tokenHash|raw-session-token|activeClaimKey|notificationSettings|preferredCampusLocationIds|emailVerifiedAt|lastLoginAt|PRIVATE-SECRET/,
  );
}

async function expectAuthenticationRequired(response: Response) {
  expect(response.status).toBe(401);
  const body = await response.json();
  expect(body).toEqual({ error: {
    code: "AUTHENTICATION_REQUIRED", message: "Authentication required",
  } });
  expectNoStaffSecrets(body);
}

async function expectValidationError(response: Response) {
  expect(response.status).toBe(400);
  const body = await response.json();
  expect(body).toEqual({ error: {
    code: "VALIDATION_ERROR",
    message: "Invalid claim request",
    ...(body.error.fields ? { fields: expect.any(Object) } : {}),
  } });
  expectNoStaffSecrets(body);
}

async function expectOperationFailed(response: Response, secret?: string) {
  expect(response.status).toBe(500);
  const body = await response.json();
  expect(body).toEqual({ error: {
    code: "CLAIM_OPERATION_FAILED", message: "Claim operation failed",
  } });
  if (secret) expect(JSON.stringify(body)).not.toContain(secret);
  expectNoStaffSecrets(body);
}

describe("staff claim routes", () => {
  beforeEach(() => {
    vi.mocked(readSessionCookie).mockReset();
    vi.mocked(getCurrentUser).mockReset();
    vi.mocked(listStaffClaims).mockReset();
    vi.mocked(getStaffClaim).mockReset();
    vi.mocked(decideClaim).mockReset();
    vi.mocked(completeClaim).mockReset();
    vi.mocked(readSessionCookie).mockResolvedValue("raw-session-token");
    vi.mocked(getCurrentUser).mockResolvedValue(staff);
    vi.mocked(listStaffClaims).mockResolvedValue(staffPage);
    vi.mocked(getStaffClaim).mockResolvedValue(staffDetail);
    vi.mocked(decideClaim).mockResolvedValue(approvedDetail);
    vi.mocked(completeClaim).mockResolvedValue(completedDetail);
  });

  it.each(["staff", "administrator"] as const)("lists claims for active %s", async (role) => {
    const reviewer = { ...staff, role } satisfies PublicUser;
    vi.mocked(getCurrentUser).mockResolvedValue(reviewer);
    const response = await queueGet(new Request(
      "http://localhost/api/staff/claims?status=pending&page=2&pageSize=10",
    ));
    expect(response.status).toBe(200);
    expect(listStaffClaims).toHaveBeenCalledWith(reviewer, {
      status: "pending", page: 2, pageSize: 10,
    });
    const body = await response.json();
    expect(body).toEqual(staffPage);
    expectNoStaffSecrets(body);
  });

  it("returns controlled staff detail", async () => {
    const response = await detailGet(
      new Request(`http://localhost/api/staff/claims/${claimId}`), context(claimId),
    );
    expect(response.status).toBe(200);
    expect(getStaffClaim).toHaveBeenCalledWith(staff, claimId);
    const body = await response.json();
    expect(body).toEqual({ claim: staffDetail });
    expect(body.claim.responses[0]).toEqual({
      questionIndex: 0, question: "What mark is near the plug?",
      answer: "Small blue paint mark", matched: true,
    });
    expect(body.claim.reviewNote).toBe("Identity evidence is ready for review.");
    expectNoStaffSecrets(body);
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

  it("normalises an omitted decision note to null", async () => {
    await decisionPost(jsonRequest(
      `http://localhost/api/staff/claims/${claimId}/decision`, { decision: "reject" },
    ), context(claimId));
    expect(decideClaim).toHaveBeenCalledWith(staff, claimId, {
      decision: "reject", reviewNote: null,
    });
  });

  it("accepts a bodyless completion", async () => {
    const response = await completePost(
      emptyPost(`http://localhost/api/staff/claims/${claimId}/complete`), context(claimId),
    );
    expect(response.status).toBe(200);
    expect(completeClaim).toHaveBeenCalledWith(staff, claimId);
    await expect(response.json()).resolves.toEqual({ claim: completedDetail });
  });

  it.each([
    ["queue URL", () => queueGet({ get url() { throw new Error("PRIVATE-SECRET"); } } as unknown as Request)],
    ["detail params", () => detailGet({} as Request, rejectedContext())],
    ["decision params/body", () => decisionPost(
      { json() { throw new Error("PRIVATE-SECRET"); } } as unknown as Request,
      rejectedContext(),
    )],
    ["completion params/body", () => completePost(
      { text() { throw new Error("PRIVATE-SECRET"); } } as unknown as Request,
      rejectedContext(),
    )],
  ])("authenticates before reading %s", async (_case, invoke) => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expectAuthenticationRequired(await invoke());
    expect(listStaffClaims).not.toHaveBeenCalled();
    expect(getStaffClaim).not.toHaveBeenCalled();
    expect(decideClaim).not.toHaveBeenCalled();
    expect(completeClaim).not.toHaveBeenCalled();
  });

  it.each([["cookie", readSessionCookie], ["current user", getCurrentUser]])(
    "hides %s authentication failures", async (_case, dependency) => {
      vi.mocked(dependency).mockRejectedValue(new Error("PRIVATE-AUTH"));
      const response = await detailGet({} as Request, rejectedContext("PRIVATE-PARAMS"));
      await expectOperationFailed(response, "PRIVATE-AUTH");
      expect(getStaffClaim).not.toHaveBeenCalled();
    },
  );

  it("hides queue URL failures", async () => {
    const response = await queueGet({ get url() { throw new Error("PRIVATE-URL"); } } as unknown as Request);
    await expectOperationFailed(response, "PRIVATE-URL");
    expect(listStaffClaims).not.toHaveBeenCalled();
  });

  it.each([
    ["detail", () => detailGet({} as Request, rejectedContext()), getStaffClaim],
    ["decision", () => decisionPost({} as Request, rejectedContext()), decideClaim],
    ["completion", () => completePost({} as Request, rejectedContext()), completeClaim],
  ] as const)("hides rejected %s parameters", async (_case, invoke, service) => {
    await expectOperationFailed(await invoke(), "PRIVATE-PARAMS");
    expect(service).not.toHaveBeenCalled();
  });

  it.each([
    ["decision", () => decisionPost(
      failingBodyPost(new Error("PRIVATE-BODY")),
      context(claimId),
    ), decideClaim],
    ["completion", () => completePost(
      failingBodyPost(new Error("PRIVATE-BODY")),
      context(claimId),
    ), completeClaim],
    ["decision with a size-shaped stream error", () => decisionPost(
      failingBodyPost(new BodyTooLarge()),
      context(claimId),
    ), decideClaim],
    ["completion with a size-shaped stream error", () => completePost(
      failingBodyPost(new BodyTooLarge()),
      context(claimId),
    ), completeClaim],
  ] as const)("hides %s body stream failures", async (_case, invoke, service) => {
    await expectOperationFailed(await invoke(), "PRIVATE-BODY");
    expect(service).not.toHaveBeenCalled();
  });

  it.each([
    ["decision", () => decisionPost(
      failingBodyPost(new SyntaxError("PRIVATE-BODY")),
      context(claimId),
    ), decideClaim],
    ["completion", () => completePost(
      failingBodyPost(new SyntaxError("PRIVATE-BODY")),
      context(claimId),
    ), completeClaim],
  ] as const)("hides a SyntaxError while reading the %s body stream", async (_case, invoke, service) => {
    await expectOperationFailed(await invoke(), "PRIVATE-BODY");
    expect(service).not.toHaveBeenCalled();
  });

  it.each([
    [
      "decision",
      () => decisionPost(
        oversizedJsonRequest(
          `http://localhost/api/staff/claims/${claimId}/decision`,
          { decision: "approve" },
        ),
        context(claimId),
      ),
      decideClaim,
    ],
    [
      "completion",
      () => completePost(
        oversizedJsonRequest(
          `http://localhost/api/staff/claims/${claimId}/complete`,
          {},
        ),
        context(claimId),
      ),
      completeClaim,
    ],
  ] as const)("rejects an oversized %s body", async (_case, invoke, service) => {
    await expectValidationError(await invoke());
    expect(service).not.toHaveBeenCalled();
  });

  it.each([
    [
      "decision",
      () => decisionPost(
        invalidUtf8Post(
          `http://localhost/api/staff/claims/${claimId}/decision`,
        ),
        context(claimId),
      ),
      decideClaim,
    ],
    [
      "completion",
      () => completePost(
        invalidUtf8Post(
          `http://localhost/api/staff/claims/${claimId}/complete`,
        ),
        context(claimId),
      ),
      completeClaim,
    ],
  ] as const)("rejects invalid UTF-8 in the %s body", async (_case, invoke, service) => {
    await expectValidationError(await invoke());
    expect(service).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid page", "?page=0"],
    ["duplicate status", "?status=pending&status=approved"],
    ["duplicate page", "?page=1&page=2"],
    ["unknown key", "?sort=createdAt"],
  ])("rejects queue %s", async (_case, query) => {
    await expectValidationError(await queueGet(new Request(`http://localhost/api/staff/claims${query}`)));
    expect(listStaffClaims).not.toHaveBeenCalled();
  });

  it.each([
    ["detail", () => detailGet({} as Request, context("not-an-id")), getStaffClaim],
    ["decision", () => decisionPost(
      jsonRequest("http://localhost/decision", { decision: "approve" }), context("not-an-id"),
    ), decideClaim],
    ["completion", () => completePost(
      emptyPost("http://localhost/complete"), context("not-an-id"),
    ), completeClaim],
  ] as const)("rejects an invalid %s ID", async (_case, invoke, service) => {
    await expectValidationError(await invoke());
    expect(service).not.toHaveBeenCalled();
  });

  it("rejects malformed decision JSON", async () => {
    await expectValidationError(await decisionPost(
      malformedPost(`http://localhost/api/staff/claims/${claimId}/decision`), context(claimId),
    ));
    expect(decideClaim).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid decision", { decision: "complete" }],
    ["oversized note", { decision: "approve", reviewNote: "x".repeat(1001) }],
    ["client reviewer", { decision: "approve", reviewedBy: reviewerId }],
    ["client status", { decision: "approve", status: "approved" }],
  ])("rejects %s in a decision", async (_case, body) => {
    await expectValidationError(await decisionPost(jsonRequest(
      `http://localhost/api/staff/claims/${claimId}/decision`, body,
    ), context(claimId)));
    expect(decideClaim).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", malformedPost("http://localhost/complete")],
    ["unknown field", jsonRequest("http://localhost/complete", { force: true })],
  ])("rejects a completion body with %s", async (_case, request) => {
    await expectValidationError(await completePost(request, context(claimId)));
    expect(completeClaim).not.toHaveBeenCalled();
  });

  it.each([
    ["CLAIM_FORBIDDEN", 403, "Claim action is not permitted"],
    ["CLAIM_NOT_FOUND", 404, "Claim not found"],
    ["CLAIM_STATE_CONFLICT", 409, "Claim state has changed"],
  ] as const)("preserves %s service errors", async (code, status, message) => {
    vi.mocked(getStaffClaim).mockRejectedValue(new ClaimError(code as ClaimErrorCode));
    const response = await detailGet(
      new Request(`http://localhost/api/staff/claims/${claimId}`), context(claimId),
    );
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body).toEqual({ error: { code, message } });
    expectNoStaffSecrets(body);
  });

  it.each([
    ["student", { ...staff, role: "student" } satisfies PublicUser],
    ["inactive staff", { ...staff, status: "suspended" } satisfies PublicUser],
  ])("preserves service rejection for %s", async (_case, reviewer) => {
    vi.mocked(getCurrentUser).mockResolvedValue(reviewer);
    vi.mocked(listStaffClaims).mockRejectedValue(new ClaimError("CLAIM_FORBIDDEN"));
    const response = await queueGet(new Request("http://localhost/api/staff/claims"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: {
      code: "CLAIM_FORBIDDEN", message: "Claim action is not permitted",
    } });
    expect(listStaffClaims).toHaveBeenCalledWith(reviewer, { page: 1, pageSize: 20 });
  });

  it("does not misclassify an internal service SyntaxError", async () => {
    vi.mocked(decideClaim).mockRejectedValue(
      new SyntaxError("PRIVATE-SECRET internal parser detail"),
    );
    const response = await decisionPost(jsonRequest(
      `http://localhost/api/staff/claims/${claimId}/decision`, { decision: "approve" },
    ), context(claimId));
    await expectOperationFailed(response, "PRIVATE-SECRET");
  });

  it("hides unknown service failures", async () => {
    vi.mocked(completeClaim).mockRejectedValue(new Error("PRIVATE-SECRET database detail"));
    await expectOperationFailed(await completePost(
      emptyPost(`http://localhost/api/staff/claims/${claimId}/complete`), context(claimId),
    ), "PRIVATE-SECRET");
  });
});
