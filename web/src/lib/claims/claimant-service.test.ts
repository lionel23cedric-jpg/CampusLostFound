import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/lib/notifications/delivery", () => ({
  createNotificationPlan: vi.fn((input: unknown) => input),
  deliverNotifications: vi.fn(),
}));
vi.mock("@/models/claim", () => ({
  ClaimModel: {
    exists: vi.fn(),
    create: vi.fn(),
    find: vi.fn(),
    countDocuments: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));
vi.mock("@/models/claim-evidence", () => ({
  ClaimEvidenceModel: { create: vi.fn() },
}));
vi.mock("@/models/item-report", () => ({
  ItemReportModel: {
    findOne: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));
vi.mock("@/models/private-verification-details", () => ({
  PrivateVerificationDetailsModel: { findOne: vi.fn() },
}));
vi.mock("./public-claim", () => ({ toClaimantClaim: vi.fn() }));

import { connectToDatabase } from "@/lib/db";
import {
  createNotificationPlan,
  deliverNotifications,
} from "@/lib/notifications/delivery";
import { ClaimEvidenceModel } from "@/models/claim-evidence";
import { ClaimModel } from "@/models/claim";
import { ItemReportModel } from "@/models/item-report";
import { PrivateVerificationDetailsModel } from "@/models/private-verification-details";

import { toClaimantClaim } from "./public-claim";
import {
  createClaim,
  getClaimQuestions,
  getOwnClaim,
  listOwnClaims,
  withdrawOwnClaim,
} from "./claimant-service";

function identifier(value: string) {
  return { toString: () => value };
}

function queryChain<T>(result: T) {
  const chain = {
    select: vi.fn(),
    session: vi.fn(),
    sort: vi.fn(),
    skip: vi.fn(),
    limit: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn(async () => result),
  };
  chain.select.mockReturnValue(chain);
  chain.session.mockReturnValue(chain);
  chain.sort.mockReturnValue(chain);
  chain.skip.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  return chain;
}

const student = {
  id: "64b64c6f2f4d9f1a2b3c4d51",
  email: "student@example.com",
  role: "student" as const,
  status: "active" as const,
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Student Name",
    preferredContactMethod: "in_app" as const,
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
};

const reportId = "64b64c6f2f4d9f1a2b3c4d52";
const claimId = "64b64c6f2f4d9f1a2b3c4d53";
const reportOwnerId = "64b64c6f2f4d9f1a2b3c4d50";
const reportObjectId = identifier(reportId);
const claimObjectId = identifier(claimId);
const now = new Date("2026-08-24T04:00:00.000Z");

const foundReport = {
  _id: reportObjectId,
  reporterId: identifier(reportOwnerId),
  title: "Black charger",
  reportType: "found" as const,
  status: "open" as const,
};

const verification = {
  verificationQuestions: [
    {
      question: "What mark is near the plug?",
      expectedAnswer: "small blue mark",
    },
    {
      question: "What is printed underneath?",
      expectedAnswer: "Massey 123",
    },
  ],
};

const validInput = {
  responses: [
    { questionIndex: 0, answer: "Small Blue Mark" },
    { questionIndex: 1, answer: "Wrong value" },
  ],
};

const pendingClaim = {
  _id: claimObjectId,
  reportId: reportObjectId,
  claimantId: identifier(student.id),
  status: "pending" as const,
  verificationQuestionCount: 2,
  reviewedBy: null,
  reviewedAt: null,
  completedAt: null,
  withdrawnAt: null,
  createdAt: now,
  updatedAt: now,
};

const withdrawnClaim = {
  ...pendingClaim,
  status: "withdrawn" as const,
  withdrawnAt: now,
};

const mappedClaim = {
  id: claimId,
  report: {
    id: reportId,
    title: "Black charger",
    reportType: "found" as const,
    status: "open" as const,
  },
  status: "pending" as const,
  reviewedAt: null,
  withdrawnAt: null,
  completedAt: null,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};

const transaction = {
  withTransaction: vi.fn(
    async (work: () => Promise<unknown>) => await work(),
  ),
  endSession: vi.fn(async () => undefined),
};
const startSession = vi.fn(async () => transaction);

function configureQuestionRead(
  report: typeof foundReport | null = foundReport,
  details: typeof verification | null = verification,
) {
  const reportQuery = queryChain(report);
  const duplicateQuery = queryChain<{ _id: typeof claimObjectId } | null>(
    null,
  );
  const verificationQuery = queryChain(details);
  vi.mocked(ItemReportModel.findOne).mockReturnValue(reportQuery as never);
  vi.mocked(ClaimModel.exists).mockReturnValue(duplicateQuery as never);
  vi.mocked(PrivateVerificationDetailsModel.findOne).mockReturnValue(
    verificationQuery as never,
  );
  return { reportQuery, duplicateQuery, verificationQuery };
}

function configureCreate() {
  const reportQuery = queryChain<typeof foundReport | null>(foundReport);
  const duplicateQuery = queryChain<{ _id: typeof claimObjectId } | null>(
    null,
  );
  const verificationQuery = queryChain<typeof verification | null>(
    verification,
  );
  vi.mocked(ItemReportModel.findOneAndUpdate).mockReturnValue(
    reportQuery as never,
  );
  vi.mocked(ClaimModel.exists).mockReturnValue(duplicateQuery as never);
  vi.mocked(PrivateVerificationDetailsModel.findOne).mockReturnValue(
    verificationQuery as never,
  );
  vi.mocked(ClaimModel.create).mockResolvedValue([pendingClaim] as never);
  vi.mocked(ClaimEvidenceModel.create).mockResolvedValue([] as never);
  return { reportQuery, duplicateQuery, verificationQuery };
}

describe("claimant service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transaction.withTransaction.mockImplementation(
      async (work: () => Promise<unknown>) => await work(),
    );
    vi.mocked(connectToDatabase).mockResolvedValue({ startSession } as never);
    vi.mocked(createNotificationPlan).mockImplementation((input) => input);
    vi.mocked(deliverNotifications).mockResolvedValue(undefined);
    vi.mocked(toClaimantClaim).mockReturnValue(mappedClaim);
  });

  it.each([
    ["staff", { ...student, role: "staff" as const }],
    ["administrator", { ...student, role: "administrator" as const }],
    ["suspended", { ...student, status: "suspended" as const }],
  ])("rejects %s before any database access", async (_case, account) => {
    const calls = [
      () => getClaimQuestions(account, reportId),
      () => createClaim(account, reportId, validInput),
      () => listOwnClaims(account, { page: 1, pageSize: 20 }),
      () => getOwnClaim(account, claimId),
      () => withdrawOwnClaim(account, claimId),
    ];

    for (const call of calls) {
      await expect(call()).rejects.toMatchObject({ code: "CLAIM_FORBIDDEN" });
    }

    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  it("returns only eligible report and question text", async () => {
    const { verificationQuery } = configureQuestionRead();

    await expect(getClaimQuestions(student, reportId)).resolves.toEqual({
      report: { id: reportId, title: "Black charger", reportType: "found" },
      questions: [
        { questionIndex: 0, question: "What mark is near the plug?" },
        {
          questionIndex: 1,
          question: "What is printed underneath?",
        },
      ],
    });

    expect(ItemReportModel.findOne).toHaveBeenCalledWith(
      {
        _id: reportId,
        reportType: "found",
        status: "open",
        reporterId: { $ne: student.id },
        moderationStatus: { $ne: "hidden" },
      },
      { _id: 1, reporterId: 1, title: 1, reportType: 1, status: 1 },
    );
    expect(PrivateVerificationDetailsModel.findOne).toHaveBeenCalledWith(
      { reportId },
      { "verificationQuestions.question": 1 },
    );
    expect(verificationQuery.select).not.toHaveBeenCalled();
    expect(
      JSON.stringify(
        vi.mocked(PrivateVerificationDetailsModel.findOne).mock.calls,
      ),
    ).not.toContain("expectedAnswer");
  });

  it("uses one canonical active key for uppercase ObjectId question requests", async () => {
    configureQuestionRead();
    const uppercaseReportId = reportId.toUpperCase();
    const uppercaseStudent = { ...student, id: student.id.toUpperCase() };

    await getClaimQuestions(uppercaseStudent, uppercaseReportId);

    expect(ClaimModel.exists).toHaveBeenCalledWith({
      activeClaimKey: `${reportId}:${student.id}`,
    });
  });

  it.each([
    ["missing report", null, verification],
    ["missing verification", foundReport, null],
    ["empty verification", foundReport, { verificationQuestions: [] }],
  ])("rejects %s as not claimable", async (_case, report, details) => {
    configureQuestionRead(report, details);

    await expect(getClaimQuestions(student, reportId)).rejects.toMatchObject({
      code: "REPORT_NOT_CLAIMABLE",
    });
  });

  it("rejects a hidden report before loading claim state or private questions", async () => {
    configureQuestionRead(null);

    await expect(getClaimQuestions(student, reportId)).rejects.toMatchObject({
      code: "REPORT_NOT_CLAIMABLE",
    });

    expect(ItemReportModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ moderationStatus: { $ne: "hidden" } }),
      expect.any(Object),
    );
    expect(ClaimModel.exists).not.toHaveBeenCalled();
    expect(PrivateVerificationDetailsModel.findOne).not.toHaveBeenCalled();
  });

  it("rejects an existing active claim before loading private questions", async () => {
    const { duplicateQuery } = configureQuestionRead();
    duplicateQuery.exec.mockResolvedValue({ _id: claimObjectId });

    await expect(getClaimQuestions(student, reportId)).rejects.toMatchObject({
      code: "CLAIM_ALREADY_EXISTS",
    });

    expect(PrivateVerificationDetailsModel.findOne).not.toHaveBeenCalled();
  });

  it("creates Claim and private evidence atomically from exact matches", async () => {
    const { verificationQuery } = configureCreate();

    await expect(
      createClaim(student, reportId, validInput),
    ).resolves.toBe(mappedClaim);

    expect(ItemReportModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: reportId,
        reportType: "found",
        status: "open",
        reporterId: { $ne: student.id },
        moderationStatus: { $ne: "hidden" },
      },
      { $set: { status: "open" } },
      expect.objectContaining({ returnDocument: "after", session: transaction }),
    );
    expect(verificationQuery.select).toHaveBeenCalledWith(
      "+verificationQuestions.expectedAnswer",
    );
    expect(verificationQuery.session).toHaveBeenCalledWith(transaction);
    expect(ClaimModel.create).toHaveBeenCalledWith(
      [
        {
          reportId,
          claimantId: student.id,
          status: "pending",
          activeClaimKey: `${reportId}:${student.id}`,
          verificationQuestionCount: 2,
          verificationMatchedCount: 1,
        },
      ],
      { session: transaction },
    );
    expect(ClaimEvidenceModel.create).toHaveBeenCalledWith(
      [
        {
          claimId: claimObjectId,
          responses: [
            {
              questionIndex: 0,
              question: "What mark is near the plug?",
              answer: "Small Blue Mark",
              matched: true,
            },
            {
              questionIndex: 1,
              question: "What is printed underneath?",
              answer: "Wrong value",
              matched: false,
            },
          ],
        },
      ],
      { session: transaction },
    );
    expect(toClaimantClaim).toHaveBeenCalledWith(pendingClaim, foundReport);
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("notifies the report owner after Claim evidence is created", async () => {
    configureCreate();

    await expect(
      createClaim(student, reportId, validInput),
    ).resolves.toBe(mappedClaim);

    expect(createNotificationPlan).toHaveBeenCalledWith({
      kind: "claim_received",
      recipientId: reportOwnerId,
      reportId,
      claimId,
    });
    expect(deliverNotifications).toHaveBeenCalledWith(
      [
        {
          kind: "claim_received",
          recipientId: reportOwnerId,
          reportId,
          claimId,
        },
      ],
      transaction,
    );
    expect(
      vi.mocked(ClaimEvidenceModel.create).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(deliverNotifications).mock.invocationCallOrder[0],
    );
  });

  it("does not deliver when Claim creation fails before persistence", async () => {
    configureCreate();
    vi.mocked(ClaimModel.create).mockRejectedValueOnce(
      new Error("claim insert failed"),
    );

    await expect(
      createClaim(student, reportId, validInput),
    ).rejects.toThrow("claim insert failed");

    expect(deliverNotifications).not.toHaveBeenCalled();
  });

  it("does not deliver when Claim evidence creation fails", async () => {
    configureCreate();
    vi.mocked(ClaimEvidenceModel.create).mockRejectedValueOnce(
      new Error("evidence insert failed"),
    );

    await expect(
      createClaim(student, reportId, validInput),
    ).rejects.toThrow("evidence insert failed");

    expect(deliverNotifications).not.toHaveBeenCalled();
  });

  it("rejects Claim creation when notification delivery fails", async () => {
    configureCreate();
    const failure = new Error("notification delivery failed");
    vi.mocked(deliverNotifications).mockRejectedValueOnce(failure);

    await expect(createClaim(student, reportId, validInput)).rejects.toBe(
      failure,
    );

    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("stores a canonical active key for uppercase ObjectId creation", async () => {
    configureCreate();
    const uppercaseReportId = reportId.toUpperCase();
    const uppercaseStudent = { ...student, id: student.id.toUpperCase() };

    await createClaim(uppercaseStudent, uppercaseReportId, validInput);

    expect(ClaimModel.exists).toHaveBeenCalledWith({
      activeClaimKey: `${reportId}:${student.id}`,
    });
    expect(ClaimModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          activeClaimKey: `${reportId}:${student.id}`,
        }),
      ],
      { session: transaction },
    );
  });

  it.each([
    ["wrong count", { responses: validInput.responses.slice(0, 1) }],
    [
      "missing zero index",
      {
        responses: [
          { questionIndex: 1, answer: "Massey 123" },
          { questionIndex: 2, answer: "unused" },
        ],
      },
    ],
  ])("rejects %s before inserting claim records", async (_case, input) => {
    configureCreate();

    await expect(
      createClaim(student, reportId, input),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(ClaimModel.create).not.toHaveBeenCalled();
    expect(ClaimEvidenceModel.create).not.toHaveBeenCalled();
    expect(deliverNotifications).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("rejects a same-user active claim during the transaction", async () => {
    const { duplicateQuery } = configureCreate();
    duplicateQuery.exec.mockResolvedValue({ _id: claimObjectId });

    await expect(
      createClaim(student, reportId, validInput),
    ).rejects.toMatchObject({ code: "CLAIM_ALREADY_EXISTS" });

    expect(PrivateVerificationDetailsModel.findOne).not.toHaveBeenCalled();
    expect(ClaimModel.create).not.toHaveBeenCalled();
    expect(deliverNotifications).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("maps only an active-claim duplicate-key race", async () => {
    configureCreate();
    vi.mocked(ClaimModel.create).mockRejectedValue(
      Object.assign(new Error("duplicate active key"), {
        code: 11000,
        keyPattern: { activeClaimKey: 1 },
      }),
    );

    await expect(
      createClaim(student, reportId, validInput),
    ).rejects.toMatchObject({ code: "CLAIM_ALREADY_EXISTS" });
    expect(deliverNotifications).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("preserves unrelated duplicate-key and transaction failures", async () => {
    configureCreate();
    const duplicate = Object.assign(new Error("other duplicate"), {
      code: 11000,
      keyPattern: { claimId: 1 },
    });
    vi.mocked(ClaimModel.create).mockRejectedValueOnce(duplicate);

    await expect(createClaim(student, reportId, validInput)).rejects.toBe(
      duplicate,
    );
    expect(transaction.endSession).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    vi.mocked(connectToDatabase).mockResolvedValue({ startSession } as never);
    configureCreate();
    const failure = new Error("transaction failed");
    transaction.withTransaction.mockRejectedValueOnce(failure);

    await expect(createClaim(student, reportId, validInput)).rejects.toBe(
      failure,
    );
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("rejects an ineligible report or missing verification inside creation", async () => {
    const { reportQuery } = configureCreate();
    reportQuery.exec.mockResolvedValue(null);

    await expect(
      createClaim(student, reportId, validInput),
    ).rejects.toMatchObject({ code: "REPORT_NOT_CLAIMABLE" });
    expect(ClaimModel.create).not.toHaveBeenCalled();
    expect(deliverNotifications).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    vi.mocked(connectToDatabase).mockResolvedValue({ startSession } as never);
    const { verificationQuery } = configureCreate();
    verificationQuery.exec.mockResolvedValue(null);

    await expect(
      createClaim(student, reportId, validInput),
    ).rejects.toMatchObject({ code: "REPORT_NOT_CLAIMABLE" });
    expect(ClaimModel.create).not.toHaveBeenCalled();
    expect(deliverNotifications).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("rejects a hidden report before verification, Claim, evidence or notification writes", async () => {
    const { reportQuery } = configureCreate();
    reportQuery.exec.mockResolvedValue(null);

    await expect(
      createClaim(student, reportId, validInput),
    ).rejects.toMatchObject({ code: "REPORT_NOT_CLAIMABLE" });

    expect(ItemReportModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ moderationStatus: { $ne: "hidden" } }),
      expect.any(Object),
      expect.any(Object),
    );
    expect(ClaimModel.exists).not.toHaveBeenCalled();
    expect(PrivateVerificationDetailsModel.findOne).not.toHaveBeenCalled();
    expect(ClaimModel.create).not.toHaveBeenCalled();
    expect(ClaimEvidenceModel.create).not.toHaveBeenCalled();
    expect(deliverNotifications).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("fails if a transaction callback never produces a claim", async () => {
    configureCreate();
    transaction.withTransaction.mockResolvedValueOnce(undefined);

    await expect(createClaim(student, reportId, validInput)).rejects.toThrow(
      "Claim transaction did not produce a result",
    );
    expect(ClaimModel.create).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("lists only the claimant's records with bounded pagination", async () => {
    const claimsQuery = queryChain([pendingClaim]);
    const totalQuery = queryChain(21);
    const reportsQuery = queryChain([foundReport]);
    vi.mocked(ClaimModel.find).mockReturnValue(claimsQuery as never);
    vi.mocked(ClaimModel.countDocuments).mockReturnValue(totalQuery as never);
    vi.mocked(ItemReportModel.find).mockReturnValue(reportsQuery as never);

    await expect(
      listOwnClaims(student, { page: 2, pageSize: 10, status: "pending" }),
    ).resolves.toEqual({
      claims: [mappedClaim],
      pagination: { page: 2, pageSize: 10, total: 21, totalPages: 3 },
    });

    const filter = { claimantId: student.id, status: "pending" };
    expect(ClaimModel.find).toHaveBeenCalledWith(filter);
    expect(ClaimModel.countDocuments).toHaveBeenCalledWith(filter);
    expect(claimsQuery.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(claimsQuery.skip).toHaveBeenCalledWith(10);
    expect(claimsQuery.limit).toHaveBeenCalledWith(10);
    expect(ItemReportModel.find).toHaveBeenCalledWith(
      { _id: { $in: [reportObjectId] } },
      { _id: 1, reporterId: 1, title: 1, reportType: 1, status: 1 },
    );
    expect(
      JSON.stringify(vi.mocked(ItemReportModel.find).mock.calls),
    ).not.toContain("moderationStatus");
    expect(ClaimEvidenceModel.create).not.toHaveBeenCalled();
  });

  it("omits the optional status and supports an empty history", async () => {
    const claimsQuery = queryChain([]);
    vi.mocked(ClaimModel.find).mockReturnValue(claimsQuery as never);
    vi.mocked(ClaimModel.countDocuments).mockReturnValue(
      queryChain(0) as never,
    );
    vi.mocked(ItemReportModel.find).mockReturnValue(queryChain([]) as never);

    await expect(
      listOwnClaims(student, { page: 1, pageSize: 20 }),
    ).resolves.toEqual({
      claims: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });

    expect(ClaimModel.find).toHaveBeenCalledWith({ claimantId: student.id });
    expect(claimsQuery.skip).toHaveBeenCalledWith(0);
  });

  it("fails safely when a listed claim's report is missing", async () => {
    vi.mocked(ClaimModel.find).mockReturnValue(
      queryChain([pendingClaim]) as never,
    );
    vi.mocked(ClaimModel.countDocuments).mockReturnValue(
      queryChain(1) as never,
    );
    vi.mocked(ItemReportModel.find).mockReturnValue(queryChain([]) as never);

    await expect(
      listOwnClaims(student, { page: 1, pageSize: 20 }),
    ).rejects.toThrow("Claim report is missing");
  });

  it("returns only the student's own claim without loading evidence", async () => {
    const claimQuery = queryChain(pendingClaim);
    const reportQuery = queryChain(foundReport);
    vi.mocked(ClaimModel.findOne).mockReturnValue(claimQuery as never);
    vi.mocked(ItemReportModel.findById).mockReturnValue(reportQuery as never);

    await expect(getOwnClaim(student, claimId)).resolves.toBe(mappedClaim);

    expect(ClaimModel.findOne).toHaveBeenCalledWith({
      _id: claimId,
      claimantId: student.id,
    });
    expect(ItemReportModel.findById).toHaveBeenCalledWith(
      reportObjectId,
      { _id: 1, reporterId: 1, title: 1, reportType: 1, status: 1 },
      { session: undefined },
    );
    expect(
      JSON.stringify(vi.mocked(ItemReportModel.findById).mock.calls),
    ).not.toContain("moderationStatus");
    expect(toClaimantClaim).toHaveBeenCalledWith(pendingClaim, foundReport);
    expect(ClaimEvidenceModel.create).not.toHaveBeenCalled();
  });

  it("treats a missing or another user's claim as not found", async () => {
    vi.mocked(ClaimModel.findOne).mockReturnValue(queryChain(null) as never);

    await expect(getOwnClaim(student, claimId)).rejects.toMatchObject({
      code: "CLAIM_NOT_FOUND",
    });
    expect(ItemReportModel.findById).not.toHaveBeenCalled();
  });

  it("withdraws a pending claim without updating the report", async () => {
    const currentQuery = queryChain(pendingClaim);
    const updateQuery = queryChain(withdrawnClaim);
    const reportQuery = queryChain(foundReport);
    vi.mocked(ClaimModel.findOne).mockReturnValue(currentQuery as never);
    vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
      updateQuery as never,
    );
    vi.mocked(ItemReportModel.findById).mockReturnValue(reportQuery as never);

    await expect(withdrawOwnClaim(student, claimId)).resolves.toBe(mappedClaim);

    expect(currentQuery.session).toHaveBeenCalledWith(transaction);
    expect(ItemReportModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(ClaimModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: claimId, claimantId: student.id, status: "pending" },
      {
        $set: {
          status: "withdrawn",
          activeClaimKey: null,
          withdrawnAt: expect.any(Date),
        },
      },
      { returnDocument: "after", session: transaction },
    );
    expect(ItemReportModel.findById).toHaveBeenCalledWith(
      reportObjectId,
      { _id: 1, reporterId: 1, title: 1, reportType: 1, status: 1 },
      { session: transaction },
    );
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("notifies the report owner after a successful withdrawal", async () => {
    const reportQuery = queryChain(foundReport);
    vi.mocked(ClaimModel.findOne).mockReturnValue(
      queryChain(pendingClaim) as never,
    );
    vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
      queryChain(withdrawnClaim) as never,
    );
    vi.mocked(ItemReportModel.findById).mockReturnValue(reportQuery as never);

    await expect(
      withdrawOwnClaim(student, claimId),
    ).resolves.toBe(mappedClaim);

    expect(createNotificationPlan).toHaveBeenCalledWith({
      kind: "claim_withdrawn",
      recipientId: reportOwnerId,
      reportId,
      claimId,
    });
    expect(deliverNotifications).toHaveBeenCalledWith(
      [
        {
          kind: "claim_withdrawn",
          recipientId: reportOwnerId,
          reportId,
          claimId,
        },
      ],
      transaction,
    );
    expect(reportQuery.exec.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deliverNotifications).mock.invocationCallOrder[0],
    );
  });

  it("rejects withdrawal when notification delivery fails", async () => {
    vi.mocked(ClaimModel.findOne).mockReturnValue(
      queryChain(pendingClaim) as never,
    );
    vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
      queryChain(withdrawnClaim) as never,
    );
    vi.mocked(ItemReportModel.findById).mockReturnValue(
      queryChain(foundReport) as never,
    );
    const failure = new Error("notification delivery failed");
    vi.mocked(deliverNotifications).mockRejectedValueOnce(failure);

    await expect(withdrawOwnClaim(student, claimId)).rejects.toBe(failure);

    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("withdraws an approved claim and conditionally reopens its report", async () => {
    const approvedClaim = { ...pendingClaim, status: "approved" as const };
    const approvedWithdrawal = {
      ...withdrawnClaim,
      status: "withdrawn" as const,
    };
    vi.mocked(ClaimModel.findOne).mockReturnValue(
      queryChain(approvedClaim) as never,
    );
    vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
      queryChain(approvedWithdrawal) as never,
    );
    vi.mocked(ItemReportModel.findOneAndUpdate).mockReturnValue(
      queryChain(foundReport) as never,
    );
    vi.mocked(ItemReportModel.findById).mockReturnValue(
      queryChain(foundReport) as never,
    );

    await expect(withdrawOwnClaim(student, claimId)).resolves.toBe(mappedClaim);

    expect(ItemReportModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: reportObjectId, status: "claim_pending" },
      { $set: { status: "open", resolvedAt: null } },
      expect.objectContaining({ returnDocument: "after", session: transaction }),
    );
    expect(
      JSON.stringify(vi.mocked(ItemReportModel.findOneAndUpdate).mock.calls),
    ).not.toContain("moderationStatus");
    expect(ClaimModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: claimId, claimantId: student.id, status: "approved" },
      expect.any(Object),
      { returnDocument: "after", session: transaction },
    );
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it.each(["rejected", "withdrawn", "completed"] as const)(
    "rejects withdrawal from %s without writes",
    async (status) => {
      vi.mocked(ClaimModel.findOne).mockReturnValue(
        queryChain({ ...pendingClaim, status }) as never,
      );

      await expect(withdrawOwnClaim(student, claimId)).rejects.toMatchObject({
        code: "CLAIM_STATE_CONFLICT",
      });

      expect(ClaimModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(ItemReportModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(deliverNotifications).not.toHaveBeenCalled();
      expect(transaction.endSession).toHaveBeenCalledOnce();
    },
  );

  it("treats a missing own claim as not found and ends the session", async () => {
    vi.mocked(ClaimModel.findOne).mockReturnValue(queryChain(null) as never);

    await expect(withdrawOwnClaim(student, claimId)).rejects.toMatchObject({
      code: "CLAIM_NOT_FOUND",
    });
    expect(deliverNotifications).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("rejects stale claim and approved-report conditional writes", async () => {
    vi.mocked(ClaimModel.findOne).mockReturnValue(
      queryChain(pendingClaim) as never,
    );
    vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
      queryChain(null) as never,
    );

    await expect(withdrawOwnClaim(student, claimId)).rejects.toMatchObject({
      code: "CLAIM_STATE_CONFLICT",
    });
    expect(deliverNotifications).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    vi.mocked(connectToDatabase).mockResolvedValue({ startSession } as never);
    vi.mocked(ClaimModel.findOne).mockReturnValue(
      queryChain({ ...pendingClaim, status: "approved" as const }) as never,
    );
    vi.mocked(ItemReportModel.findOneAndUpdate).mockReturnValue(
      queryChain(null) as never,
    );

    await expect(withdrawOwnClaim(student, claimId)).rejects.toMatchObject({
      code: "CLAIM_STATE_CONFLICT",
    });
    expect(ClaimModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(deliverNotifications).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("preserves a withdrawal transaction failure and ends the session", async () => {
    const failure = new Error("withdraw transaction failed");
    transaction.withTransaction.mockRejectedValueOnce(failure);

    await expect(withdrawOwnClaim(student, claimId)).rejects.toBe(failure);
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("fails if a withdrawal transaction never produces a result", async () => {
    transaction.withTransaction.mockResolvedValueOnce(undefined);

    await expect(withdrawOwnClaim(student, claimId)).rejects.toThrow(
      "Claim withdrawal did not produce a result",
    );
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });
});
