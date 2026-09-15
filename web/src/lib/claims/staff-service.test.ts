import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/lib/notifications/delivery", () => ({
  createNotificationPlan: vi.fn((input) => input),
  deliverNotifications: vi.fn(),
}));
vi.mock("@/models/claim", () => ({
  ClaimModel: {
    find: vi.fn(),
    findById: vi.fn(),
    countDocuments: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateMany: vi.fn(),
  },
}));
vi.mock("@/models/claim-evidence", () => ({
  ClaimEvidenceModel: { findOne: vi.fn() },
}));
vi.mock("@/models/item-report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/models/item-report")>();
  return {
    ...actual,
    ItemReportModel: {
      find: vi.fn(),
      findOne: vi.fn(),
      findById: vi.fn(),
      findOneAndUpdate: vi.fn(),
    },
  };
});
vi.mock("@/models/profile", () => ({
  ProfileModel: { find: vi.fn(), findOne: vi.fn() },
}));
vi.mock("@/models/user", () => ({
  UserModel: { find: vi.fn(), findById: vi.fn() },
}));
vi.mock("./public-claim", () => ({
  toStaffClaimDetail: vi.fn(),
  toStaffClaimSummary: vi.fn(),
}));

import { connectToDatabase } from "@/lib/db";
import {
  createNotificationPlan,
  deliverNotifications,
} from "@/lib/notifications/delivery";
import { ClaimEvidenceModel } from "@/models/claim-evidence";
import { ClaimModel } from "@/models/claim";
import { ItemReportModel } from "@/models/item-report";
import { ProfileModel } from "@/models/profile";
import { UserModel } from "@/models/user";

import { toStaffClaimDetail, toStaffClaimSummary } from "./public-claim";
import {
  completeClaim,
  decideClaim,
  getStaffClaim,
  listStaffClaims,
} from "./staff-service";

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

const staff = {
  id: "64b64c6f2f4d9f1a2b3c4d50",
  email: "staff@example.com",
  role: "staff" as const,
  status: "active" as const,
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Staff Member",
    preferredContactMethod: "email" as const,
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
};
const student = { ...staff, role: "student" as const };
const claimantId = "64b64c6f2f4d9f1a2b3c4d51";
const reportId = "64b64c6f2f4d9f1a2b3c4d52";
const claimId = "64b64c6f2f4d9f1a2b3c4d53";
const reportOwnerId = "64b64c6f2f4d9f1a2b3c4d54";
const competingClaimId = "64b64c6f2f4d9f1a2b3c4d55";
const competingClaimantId = "64b64c6f2f4d9f1a2b3c4d56";
const secondCompetingClaimId = "64b64c6f2f4d9f1a2b3c4d57";
const secondCompetingClaimantId = "64b64c6f2f4d9f1a2b3c4d58";
const now = new Date("2026-08-24T05:00:00.000Z");

const pendingClaim = {
  _id: identifier(claimId),
  reportId: identifier(reportId),
  claimantId: identifier(claimantId),
  status: "pending" as const,
  activeClaimKey: `${reportId}:${claimantId}`,
  verificationQuestionCount: 2,
  verificationMatchedCount: 1,
  reviewedBy: null,
  reviewedAt: null,
  reviewNote: null,
  completedAt: null,
  withdrawnAt: null,
  createdAt: now,
  updatedAt: now,
};
const approvedClaim = { ...pendingClaim, status: "approved" as const };
const completedClaim = {
  ...approvedClaim,
  status: "completed" as const,
  activeClaimKey: null,
  completedAt: now,
};
const report = {
  _id: identifier(reportId),
  reporterId: identifier(reportOwnerId),
  title: "Black charger",
  reportType: "found" as const,
  status: "open" as const,
  updatedAt: now,
};
const resolvedReport = { ...report, status: "resolved" as const };
const claimPendingReport = { ...report, status: "claim_pending" as const };
const verifiedHandling = {
  verificationStatus: "verified" as const,
  verifiedBy: staff.id,
  verifiedAt: now,
  custodyStatus: "not_held" as const,
  storageLocation: null,
  storedAt: null,
  releasedAt: null,
  updatedBy: staff.id,
};
const storedAt = new Date("2026-08-24T04:00:00.000Z");
const storedHandling = {
  ...verifiedHandling,
  custodyStatus: "stored" as const,
  storageLocation: "Library desk - locker B12",
  storedAt,
};
const competingClaims = [
  {
    _id: identifier(competingClaimId),
    claimantId: identifier(competingClaimantId),
  },
  {
    _id: identifier(secondCompetingClaimId),
    claimantId: identifier(secondCompetingClaimantId),
  },
];
const account = {
  _id: identifier(claimantId),
  email: "claimant@example.com",
  passwordHash: "DO-NOT-RETURN",
};
const profile = {
  userId: identifier(claimantId),
  displayName: "Claimant Name",
  preferredContactMethod: "email" as const,
  tokenHash: "DO-NOT-RETURN",
};
const evidence = {
  claimId: identifier(claimId),
  responses: [
    {
      questionIndex: 0,
      question: "What mark is near the plug?",
      answer: "A blue mark",
      matched: true,
      expectedAnswer: "DO-NOT-RETURN",
    },
  ],
};
const staffSummary = { id: claimId, kind: "summary" };
const staffDetail = {
  id: claimId,
  reviewNote: null,
  responses: [{ answer: "A blue mark", matched: true }],
};
const staffPage = {
  claims: [staffSummary],
  pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
};

const transaction = {
  withTransaction: vi.fn(
    async (work: () => Promise<unknown>) => await work(),
  ),
  endSession: vi.fn(async () => undefined),
};
const startSession = vi.fn(async () => transaction);

let claimFindChain: ReturnType<typeof queryChain>;
let evidenceChain: ReturnType<typeof queryChain>;
let reportDetailChain: ReturnType<typeof queryChain<typeof report | typeof resolvedReport>>;
let userDetailChain: ReturnType<typeof queryChain<typeof account>>;
let profileDetailChain: ReturnType<typeof queryChain<typeof profile>>;
let detailReportResult: typeof report | typeof resolvedReport;

function configureQueue(claims = [pendingClaim], total = claims.length) {
  claimFindChain = queryChain(claims);
  vi.mocked(ClaimModel.find).mockReturnValue(claimFindChain as never);
  vi.mocked(ClaimModel.countDocuments).mockReturnValue(
    queryChain(total) as never,
  );
  vi.mocked(ItemReportModel.find).mockReturnValue(
    queryChain(claims.length ? [report] : []) as never,
  );
  vi.mocked(UserModel.find).mockReturnValue(
    queryChain(claims.length ? [account] : []) as never,
  );
  vi.mocked(ProfileModel.find).mockReturnValue(
    queryChain(claims.length ? [profile] : []) as never,
  );
}

function configureDetail(
  claim: typeof pendingClaim | typeof approvedClaim | typeof completedClaim | null = pendingClaim,
  claimReport: typeof report | typeof resolvedReport = report,
) {
  const claimChain = queryChain(claim);
  vi.mocked(ClaimModel.findById).mockReturnValue(claimChain as never);
  detailReportResult = claimReport;
  reportDetailChain = queryChain(claimReport);
  vi.mocked(ItemReportModel.findById).mockReturnValue(
    reportDetailChain as never,
  );
  userDetailChain = queryChain(account);
  vi.mocked(UserModel.findById).mockReturnValue(
    userDetailChain as never,
  );
  profileDetailChain = queryChain(profile);
  vi.mocked(ProfileModel.findOne).mockReturnValue(
    profileDetailChain as never,
  );
  evidenceChain = queryChain(evidence);
  vi.mocked(ClaimEvidenceModel.findOne).mockReturnValue(
    evidenceChain as never,
  );
  return claimChain;
}

function trackDetailQueryOverlap() {
  const tracker = { active: 0, maximum: 0 };
  const guardedExec = <T>(result: T) => async () => {
    tracker.active += 1;
    tracker.maximum = Math.max(tracker.maximum, tracker.active);
    await Promise.resolve();
    tracker.active -= 1;
    return result;
  };
  reportDetailChain.exec.mockImplementation(
    guardedExec(detailReportResult),
  );
  userDetailChain.exec.mockImplementation(guardedExec(account));
  profileDetailChain.exec.mockImplementation(guardedExec(profile));
  evidenceChain.exec.mockImplementation(guardedExec(evidence));
  return tracker;
}

describe("staff claim service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transaction.withTransaction.mockImplementation(
      async (work: () => Promise<unknown>) => await work(),
    );
    vi.mocked(connectToDatabase).mockResolvedValue({ startSession } as never);
    vi.mocked(toStaffClaimSummary).mockReturnValue(staffSummary as never);
    vi.mocked(toStaffClaimDetail).mockReturnValue(staffDetail as never);
    vi.mocked(createNotificationPlan).mockImplementation((input) => input);
    vi.mocked(deliverNotifications).mockResolvedValue(undefined);
    configureQueue();
    configureDetail();
    vi.mocked(ItemReportModel.findOne).mockReturnValue(
      queryChain(claimPendingReport) as never,
    );
  });

  it.each([
    ["student", student],
    ["suspended staff", { ...staff, status: "suspended" as const }],
  ])("rejects %s before database access", async (_case, accountToCheck) => {
    const calls = [
      () => listStaffClaims(accountToCheck, { page: 1, pageSize: 20 }),
      () => getStaffClaim(accountToCheck, claimId),
      () =>
        decideClaim(accountToCheck, claimId, {
          decision: "approve",
          reviewNote: null,
        }),
      () => completeClaim(accountToCheck, claimId),
    ];
    for (const call of calls) {
      await expect(call()).rejects.toMatchObject({ code: "CLAIM_FORBIDDEN" });
    }
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  it.each(["staff", "administrator"] as const)(
    "allows active %s review",
    async (role) => {
      await expect(
        listStaffClaims({ ...staff, role }, { page: 1, pageSize: 20 }),
      ).resolves.toEqual(staffPage);
    },
  );

  it("uses oldest pending claims as the default queue", async () => {
    await listStaffClaims(staff, { page: 1, pageSize: 20 });
    expect(ClaimModel.find).toHaveBeenCalledWith({ status: "pending" });
    expect(claimFindChain.select).toHaveBeenCalledWith(
      "+verificationMatchedCount",
    );
    expect(claimFindChain.sort).toHaveBeenCalledWith({
      createdAt: 1,
      _id: 1,
    });
  });

  it("uses newest-first ordering and bounded pagination for an explicit terminal status", async () => {
    configureQueue();
    await listStaffClaims(staff, {
      status: "rejected",
      page: 2,
      pageSize: 10,
    });
    expect(ClaimModel.find).toHaveBeenCalledWith({ status: "rejected" });
    expect(claimFindChain.sort).toHaveBeenCalledWith({
      createdAt: -1,
      _id: -1,
    });
    expect(claimFindChain.skip).toHaveBeenCalledWith(10);
    expect(claimFindChain.limit).toHaveBeenCalledWith(10);
  });

  it("batch-loads only safe account, profile and report fields for the queue", async () => {
    await listStaffClaims(staff, { page: 1, pageSize: 20 });
    expect(ItemReportModel.find).toHaveBeenCalledWith(
      { _id: { $in: [pendingClaim.reportId] } },
      { _id: 1, reporterId: 1, title: 1, reportType: 1, status: 1 },
    );
    expect(UserModel.find).toHaveBeenCalledWith(
      { _id: { $in: [claimantId] } },
      { _id: 1, email: 1 },
    );
    expect(ProfileModel.find).toHaveBeenCalledWith(
      { userId: { $in: [claimantId] } },
      { _id: 1, userId: 1, displayName: 1, preferredContactMethod: 1 },
    );
    expect(ClaimEvidenceModel.findOne).not.toHaveBeenCalled();
    expect(toStaffClaimSummary).toHaveBeenCalledWith(
      pendingClaim,
      report,
      {
        _id: account._id,
        email: account.email,
        displayName: profile.displayName,
        preferredContactMethod: profile.preferredContactMethod,
      },
    );
  });

  it("returns stable pagination for an empty queue", async () => {
    configureQueue([], 0);
    await expect(
      listStaffClaims(staff, { page: 3, pageSize: 20 }),
    ).resolves.toEqual({
      claims: [],
      pagination: { page: 3, pageSize: 20, total: 0, totalPages: 0 },
    });
  });

  it("preserves read failures for the safe route boundary", async () => {
    const failure = new Error("database unavailable");
    claimFindChain.exec.mockRejectedValueOnce(failure);
    await expect(
      listStaffClaims(staff, { page: 1, pageSize: 20 }),
    ).rejects.toBe(failure);
  });

  it("rejects incomplete queue joins instead of mapping partial data", async () => {
    vi.mocked(ProfileModel.find).mockReturnValue(queryChain([]) as never);
    await expect(
      listStaffClaims(staff, { page: 1, pageSize: 20 }),
    ).rejects.toThrow("Claim review data is incomplete");
  });

  it("loads private evidence only for staff detail", async () => {
    const claimChain = configureDetail();
    const detail = await getStaffClaim(staff, claimId);
    expect(claimChain.select).toHaveBeenCalledWith(
      "+verificationMatchedCount +reviewNote",
    );
    expect(ClaimEvidenceModel.findOne).toHaveBeenCalledWith({ claimId });
    expect(evidenceChain.select).toHaveBeenCalledWith(
      "+responses.answer +responses.matched",
    );
    expect(detail).toBe(staffDetail);
  });

  it("passes only projected safe identity data and selected evidence to the detail mapper", async () => {
    await getStaffClaim(staff, claimId);
    const [, , safeClaimant, selectedEvidence] = vi.mocked(
      toStaffClaimDetail,
    ).mock.calls[0];
    expect(safeClaimant).toEqual({
      _id: account._id,
      email: account.email,
      displayName: profile.displayName,
      preferredContactMethod: profile.preferredContactMethod,
    });
    expect(selectedEvidence).toBe(evidence);
    expect(JSON.stringify(safeClaimant)).not.toMatch(/passwordHash|tokenHash/);
    expect(JSON.stringify(staffDetail)).not.toMatch(
      /expectedAnswer|passwordHash|tokenHash/,
    );
  });

  it("returns not found without loading related detail records", async () => {
    configureDetail(null);
    await expect(getStaffClaim(staff, claimId)).rejects.toMatchObject({
      code: "CLAIM_NOT_FOUND",
    });
    expect(ItemReportModel.findById).not.toHaveBeenCalled();
    expect(ClaimEvidenceModel.findOne).not.toHaveBeenCalled();
  });

  it("rejects incomplete detail joins", async () => {
    vi.mocked(ClaimEvidenceModel.findOne).mockReturnValue(
      queryChain(null) as never,
    );
    await expect(getStaffClaim(staff, claimId)).rejects.toThrow(
      "Claim review data is incomplete",
    );
  });

  it("approves atomically, preserves the active key and rejects only selected competitors", async () => {
    const currentChain = configureDetail();
    const competingChain = queryChain(competingClaims);
    vi.mocked(ClaimModel.find).mockReturnValue(competingChain as never);
    vi.mocked(ItemReportModel.findOneAndUpdate).mockReturnValue(
      queryChain({ ...report, status: "claim_pending" }) as never,
    );
    vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
      queryChain(approvedClaim) as never,
    );
    vi.mocked(ClaimModel.updateMany).mockResolvedValue({
      acknowledged: true,
      matchedCount: 2,
      modifiedCount: 2,
    } as never);

    await expect(
      decideClaim(staff, claimId, {
        decision: "approve",
        reviewNote: "ID checked at desk",
      }),
    ).resolves.toBe(staffDetail);

    expect(currentChain.select).toHaveBeenCalledWith(
      "+verificationMatchedCount",
    );
    expect(ItemReportModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: pendingClaim.reportId, status: "open" },
      { $set: { status: "claim_pending", resolvedAt: null } },
      { new: true, session: transaction },
    );
    const selectedUpdate = vi.mocked(ClaimModel.findOneAndUpdate).mock
      .calls[0][1] as { $set: Record<string, unknown> };
    expect(vi.mocked(ClaimModel.findOneAndUpdate).mock.calls[0][0]).toEqual({
      _id: claimId,
      status: "pending",
    });
    expect(selectedUpdate.$set).toMatchObject({
      status: "approved",
      activeClaimKey: pendingClaim.activeClaimKey,
      reviewedBy: staff.id,
      reviewNote: "ID checked at desk",
    });
    expect(selectedUpdate.$set.reviewedAt).toBeInstanceOf(Date);

    expect(ClaimModel.find).toHaveBeenCalledWith(
      {
        reportId: pendingClaim.reportId,
        _id: { $ne: pendingClaim._id },
        status: "pending",
      },
      { _id: 1, claimantId: 1 },
    );
    expect(competingChain.session).toHaveBeenCalledWith(transaction);
    expect(competingChain.lean).toHaveBeenCalledOnce();

    const competitorUpdate = vi.mocked(ClaimModel.updateMany).mock.calls[0];
    expect(competitorUpdate[0]).toEqual({
      _id: { $in: competingClaims.map(({ _id }) => _id) },
      status: "pending",
    });
    expect(competitorUpdate[1]).toEqual({
      $set: {
        status: "rejected",
        activeClaimKey: null,
        reviewedBy: staff.id,
        reviewedAt: selectedUpdate.$set.reviewedAt,
        reviewNote: null,
      },
    });
    expect(competitorUpdate[2]).toEqual({ session: transaction });
    expect(deliverNotifications).toHaveBeenCalledWith(
      [
        {
          kind: "claim_approved",
          recipientId: claimantId,
          reportId,
          claimId,
        },
        {
          kind: "claim_handover_ready",
          recipientId: claimantId,
          reportId,
          claimId,
        },
        {
          kind: "claim_rejected",
          recipientId: competingClaimantId,
          reportId,
          claimId: competingClaimId,
        },
        {
          kind: "claim_rejected",
          recipientId: secondCompetingClaimantId,
          reportId,
          claimId: secondCompetingClaimId,
        },
      ],
      transaction,
    );
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("rejects corrupt selected verification counters before state writes", async () => {
    configureDetail({
      ...pendingClaim,
      verificationMatchedCount: 3,
    });
    await expect(
      decideClaim(staff, claimId, {
        decision: "approve",
        reviewNote: null,
      }),
    ).rejects.toThrow("Claim verification counts are inconsistent");
    expect(ItemReportModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(ClaimModel.updateMany).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("approves safely when there are no competing claims", async () => {
    configureDetail();
    const competingChain = queryChain([]);
    vi.mocked(ClaimModel.find).mockReturnValue(competingChain as never);
    vi.mocked(ItemReportModel.findOneAndUpdate).mockReturnValue(
      queryChain({ ...report, status: "claim_pending" }) as never,
    );
    vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
      queryChain(approvedClaim) as never,
    );
    await expect(
      decideClaim(staff, claimId, {
        decision: "approve",
        reviewNote: null,
      }),
    ).resolves.toBe(staffDetail);
    expect(ClaimModel.updateMany).not.toHaveBeenCalled();
    expect(deliverNotifications).toHaveBeenCalledWith(
      [
        {
          kind: "claim_approved",
          recipientId: claimantId,
          reportId,
          claimId,
        },
        {
          kind: "claim_handover_ready",
          recipientId: claimantId,
          reportId,
          claimId,
        },
      ],
      transaction,
    );
  });

  it("delivers approval notifications only after every conditional write", async () => {
    const order: string[] = [];
    configureDetail();
    vi.mocked(ClaimModel.find).mockReturnValue(
      queryChain([competingClaims[0]]) as never,
    );
    const reportWrite = queryChain({
      ...report,
      status: "claim_pending" as const,
    });
    reportWrite.exec.mockImplementation(async () => {
      order.push("report");
      return { ...report, status: "claim_pending" as const };
    });
    vi.mocked(ItemReportModel.findOneAndUpdate).mockReturnValue(
      reportWrite as never,
    );
    const claimWrite = queryChain(approvedClaim);
    claimWrite.exec.mockImplementation(async () => {
      order.push("claim");
      return approvedClaim;
    });
    vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
      claimWrite as never,
    );
    vi.mocked(ClaimModel.updateMany).mockImplementation(
      (async () => {
        order.push("competitors");
        return { modifiedCount: 1 };
      }) as never,
    );
    vi.mocked(deliverNotifications).mockImplementation(async () => {
      order.push("notifications");
    });

    await decideClaim(staff, claimId, {
      decision: "approve",
      reviewNote: null,
    });

    expect(order).toEqual([
      "report",
      "claim",
      "competitors",
      "notifications",
    ]);
  });

  it("aborts approval when the competing update count changes", async () => {
    configureDetail();
    vi.mocked(ClaimModel.find).mockReturnValue(
      queryChain([competingClaims[0]]) as never,
    );
    vi.mocked(ItemReportModel.findOneAndUpdate).mockReturnValue(
      queryChain({ ...report, status: "claim_pending" as const }) as never,
    );
    vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
      queryChain(approvedClaim) as never,
    );
    vi.mocked(ClaimModel.updateMany).mockResolvedValue({
      modifiedCount: 0,
    } as never);

    await expect(
      decideClaim(staff, claimId, {
        decision: "approve",
        reviewNote: null,
      }),
    ).rejects.toMatchObject({ code: "CLAIM_STATE_CONFLICT" });
    expect(deliverNotifications).not.toHaveBeenCalled();
  });

  it("does not approve a pending claim whose active key is corrupt", async () => {
    configureDetail({
      ...pendingClaim,
      activeClaimKey: null,
    } as unknown as typeof pendingClaim);
    await expect(
      decideClaim(staff, claimId, {
        decision: "approve",
        reviewNote: null,
      }),
    ).rejects.toThrow("Claim active key is inconsistent");
    expect(ItemReportModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("rejects only the selected pending claim and does not touch report or competitors", async () => {
    configureDetail();
    vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
      queryChain({ ...pendingClaim, status: "rejected" }) as never,
    );
    await expect(
      decideClaim(staff, claimId, {
        decision: "reject",
        reviewNote: null,
      }),
    ).resolves.toBe(staffDetail);
    const update = vi.mocked(ClaimModel.findOneAndUpdate).mock.calls[0];
    expect(update[0]).toEqual({ _id: claimId, status: "pending" });
    expect(update[1]).toMatchObject({
      $set: {
        status: "rejected",
        activeClaimKey: null,
        reviewedBy: staff.id,
        reviewNote: null,
      },
    });
    expect(ItemReportModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(ClaimModel.find).not.toHaveBeenCalled();
    expect(ClaimModel.updateMany).not.toHaveBeenCalled();
    expect(deliverNotifications).toHaveBeenCalledWith(
      [
        {
          kind: "claim_rejected",
          recipientId: claimantId,
          reportId,
          claimId,
        },
      ],
      transaction,
    );
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing", null, "CLAIM_NOT_FOUND"],
    ["wrong state", approvedClaim, "CLAIM_STATE_CONFLICT"],
  ])("returns %s claim decision errors", async (_case, current, code) => {
    configureDetail(current as typeof pendingClaim | null);
    await expect(
      decideClaim(staff, claimId, {
        decision: "reject",
        reviewNote: null,
      }),
    ).rejects.toMatchObject({ code });
    expect(ClaimModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("returns a stale-state conflict when the conditional rejection write misses", async () => {
    configureDetail();
    vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
      queryChain(null) as never,
    );
    await expect(
      decideClaim(staff, claimId, {
        decision: "reject",
        reviewNote: null,
      }),
    ).rejects.toMatchObject({ code: "CLAIM_STATE_CONFLICT" });
    expect(deliverNotifications).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("preserves a detail read failure after a decision and ends the session", async () => {
    const failure = new Error("evidence read failed");
    configureDetail();
    vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
      queryChain({ ...pendingClaim, status: "rejected" }) as never,
    );
    evidenceChain.exec.mockRejectedValueOnce(failure);
    await expect(
      decideClaim(staff, claimId, {
        decision: "reject",
        reviewNote: null,
      }),
    ).rejects.toBe(failure);
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it.each([
    ["report", "report"],
    ["claim", "claim"],
  ])("returns a stale-state conflict when the conditional %s approval write misses", async (_case, missed) => {
    configureDetail();
    vi.mocked(ItemReportModel.findOneAndUpdate).mockReturnValue(
      queryChain(missed === "report" ? null : { ...report, status: "claim_pending" }) as never,
    );
    vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
      queryChain(missed === "claim" ? null : approvedClaim) as never,
    );
    await expect(
      decideClaim(staff, claimId, {
        decision: "approve",
        reviewNote: null,
      }),
    ).rejects.toMatchObject({ code: "CLAIM_STATE_CONFLICT" });
    expect(deliverNotifications).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it.each(["decision", "completion"])(
    "does not overlap %s detail reads on one transaction session",
    async (operation) => {
      if (operation === "decision") {
        configureDetail();
        vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
          queryChain({ ...pendingClaim, status: "rejected" }) as never,
        );
      } else {
        configureDetail(approvedClaim, resolvedReport);
        vi.mocked(ItemReportModel.findOneAndUpdate).mockReturnValue(
          queryChain(resolvedReport) as never,
        );
        vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
          queryChain(completedClaim) as never,
        );
      }
      const tracker = trackDetailQueryOverlap();

      if (operation === "decision") {
        await decideClaim(staff, claimId, {
          decision: "reject",
          reviewNote: null,
        });
      } else {
        await completeClaim(staff, claimId);
      }

      expect(tracker.maximum).toBe(1);
      expect(reportDetailChain.session).toHaveBeenCalledWith(transaction);
      expect(userDetailChain.session).toHaveBeenCalledWith(transaction);
      expect(profileDetailChain.session).toHaveBeenCalledWith(transaction);
      expect(evidenceChain.session).toHaveBeenCalledWith(transaction);
    },
  );

  it("completes an approved claim and resolves its report with one timestamp", async () => {
    configureDetail(approvedClaim, resolvedReport);
    vi.mocked(ItemReportModel.findOneAndUpdate).mockReturnValue(
      queryChain(resolvedReport) as never,
    );
    vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
      queryChain(completedClaim) as never,
    );
    await expect(completeClaim(staff, claimId)).resolves.toBe(staffDetail);
    const reportUpdate = vi.mocked(ItemReportModel.findOneAndUpdate).mock
      .calls[0];
    const completionTime = (reportUpdate[1] as { $set: { resolvedAt: Date } })
      .$set.resolvedAt;
    expect(reportUpdate).toEqual([
      {
        _id: approvedClaim.reportId,
        status: "claim_pending",
        updatedAt: now,
        staffHandling: { $exists: false },
      },
      { $set: { status: "resolved", resolvedAt: completionTime } },
      { new: true, runValidators: true, session: transaction },
    ]);
    expect(ClaimModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: claimId, status: "approved" },
      {
        $set: {
          status: "completed",
          activeClaimKey: null,
          completedAt: completionTime,
        },
      },
      { new: true, session: transaction },
    );
    expect(deliverNotifications).toHaveBeenCalledWith(
      [
        {
          kind: "claim_completed",
          recipientId: claimantId,
          reportId,
          claimId,
        },
        {
          kind: "report_recovered",
          recipientId: reportOwnerId,
          reportId,
          claimId,
        },
      ],
      transaction,
    );
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("releases a stored Found item in the existing completion transaction", async () => {
    configureDetail(approvedClaim, resolvedReport);
    const storedReport = {
      ...claimPendingReport,
      staffHandling: storedHandling,
    };
    const currentReportChain = queryChain(storedReport);
    vi.mocked(ItemReportModel.findOne).mockReturnValue(
      currentReportChain as never,
    );
    vi.mocked(ItemReportModel.findOneAndUpdate).mockReturnValue(
      queryChain(resolvedReport) as never,
    );
    vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
      queryChain(completedClaim) as never,
    );

    await completeClaim(staff, claimId);

    const reportUpdate = vi.mocked(ItemReportModel.findOneAndUpdate).mock
      .calls[0];
    const set = (reportUpdate[1] as { $set: Record<string, unknown> }).$set;
    expect(currentReportChain.select).toHaveBeenCalledWith("+staffHandling");
    expect(currentReportChain.session).toHaveBeenCalledWith(transaction);
    expect(reportUpdate[0]).toEqual({
      _id: approvedClaim.reportId,
      status: "claim_pending",
      updatedAt: now,
      "staffHandling.custodyStatus": "stored",
    });
    expect(set).toMatchObject({
      status: "resolved",
      "staffHandling.custodyStatus": "released",
      "staffHandling.releasedAt": set.resolvedAt,
      "staffHandling.updatedBy": staff.id,
    });
    expect(reportUpdate[2]).toEqual({
      new: true,
      runValidators: true,
      session: transaction,
    });
    expect(deliverNotifications).toHaveBeenCalledOnce();
  });

  it.each([
    ["Found not held", { ...claimPendingReport, staffHandling: verifiedHandling }],
    ["Lost", { ...claimPendingReport, reportType: "lost" as const, staffHandling: { ...verifiedHandling, custodyStatus: "not_applicable" as const } }],
    ["legacy", claimPendingReport],
  ])("completes %s reports without inventing storage history", async (_case, currentReport) => {
    configureDetail(approvedClaim, resolvedReport);
    vi.mocked(ItemReportModel.findOne).mockReturnValue(
      queryChain(currentReport) as never,
    );
    vi.mocked(ItemReportModel.findOneAndUpdate).mockReturnValue(
      queryChain(resolvedReport) as never,
    );
    vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
      queryChain(completedClaim) as never,
    );

    await completeClaim(staff, claimId);

    const [, update] = vi.mocked(ItemReportModel.findOneAndUpdate).mock.calls[0];
    expect((update as { $set: Record<string, unknown> }).$set).toEqual({
      status: "resolved",
      resolvedAt: expect.any(Date),
    });
  });

  it("rejects a concurrent stored-item handling change before Claim completion", async () => {
    configureDetail(approvedClaim, resolvedReport);
    vi.mocked(ItemReportModel.findOne).mockReturnValue(
      queryChain({ ...claimPendingReport, staffHandling: storedHandling }) as never,
    );
    vi.mocked(ItemReportModel.findOneAndUpdate).mockReturnValue(
      queryChain(null) as never,
    );

    await expect(completeClaim(staff, claimId)).rejects.toMatchObject({
      code: "CLAIM_STATE_CONFLICT",
    });
    expect(ClaimModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(deliverNotifications).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null, "CLAIM_NOT_FOUND"],
    ["wrong state", pendingClaim, "CLAIM_STATE_CONFLICT"],
  ])("returns %s completion errors", async (_case, current, code) => {
    configureDetail(current as typeof approvedClaim | null);
    await expect(completeClaim(staff, claimId)).rejects.toMatchObject({ code });
    expect(ItemReportModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it.each([
    ["report", "report"],
    ["claim", "claim"],
  ])("returns a stale-state conflict when the conditional completion %s write misses", async (_case, missed) => {
    configureDetail(approvedClaim);
    vi.mocked(ItemReportModel.findOneAndUpdate).mockReturnValue(
      queryChain(missed === "report" ? null : resolvedReport) as never,
    );
    vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
      queryChain(missed === "claim" ? null : completedClaim) as never,
    );
    await expect(completeClaim(staff, claimId)).rejects.toMatchObject({
      code: "CLAIM_STATE_CONFLICT",
    });
    expect(deliverNotifications).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it.each(["rejection", "completion"] as const)(
    "preserves %s notification delivery failures for transaction rollback",
    async (operation) => {
      const failure = new Error("notification write failed");
      if (operation === "rejection") {
        configureDetail();
        vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
          queryChain({ ...pendingClaim, status: "rejected" as const }) as never,
        );
      } else {
        configureDetail(approvedClaim, resolvedReport);
        vi.mocked(ItemReportModel.findOneAndUpdate).mockReturnValue(
          queryChain(resolvedReport) as never,
        );
        vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
          queryChain(completedClaim) as never,
        );
      }
      vi.mocked(deliverNotifications).mockRejectedValueOnce(failure);

      const operationPromise =
        operation === "rejection"
          ? decideClaim(staff, claimId, {
              decision: "reject",
              reviewNote: null,
            })
          : completeClaim(staff, claimId);

      await expect(operationPromise).rejects.toBe(failure);
      expect(deliverNotifications).toHaveBeenCalledWith(
        expect.any(Array),
        transaction,
      );
      expect(toStaffClaimDetail).not.toHaveBeenCalled();
      expect(transaction.endSession).toHaveBeenCalledOnce();
    },
  );

  it.each(["decision", "completion"])(
    "preserves a %s transaction failure and always ends the session",
    async (operation) => {
      const failure = new Error("transaction failed");
      transaction.withTransaction.mockRejectedValueOnce(failure);
      const call =
        operation === "decision"
          ? decideClaim(staff, claimId, {
              decision: "approve",
              reviewNote: null,
            })
          : completeClaim(staff, claimId);
      await expect(call).rejects.toBe(failure);
      expect(transaction.endSession).toHaveBeenCalledOnce();
    },
  );

  it.each(["decision", "completion"])(
    "fails safely when a %s transaction produces no result",
    async (operation) => {
      transaction.withTransaction.mockResolvedValueOnce(undefined);
      const call =
        operation === "decision"
          ? decideClaim(staff, claimId, {
              decision: "reject",
              reviewNote: null,
            })
          : completeClaim(staff, claimId);
      await expect(call).rejects.toThrow(
        operation === "decision"
          ? "Claim decision did not produce a result"
          : "Claim completion did not produce a result",
      );
      expect(transaction.endSession).toHaveBeenCalledOnce();
    },
  );
});
