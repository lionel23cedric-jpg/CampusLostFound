import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/models/item-report", () => ({
  ItemReportModel: { find: vi.fn() },
}));
vi.mock("@/lib/notifications/delivery", () => ({
  createNotificationPlan: vi.fn((input: unknown) => input),
}));
vi.mock("./matching-score", () => ({ scoreReportMatch: vi.fn() }));
vi.mock("./matching-service", () => ({
  MATCH_CANDIDATE_LIMIT: 500,
  MATCH_MINIMUM_SCORE: 35,
  MATCH_REPORT_PROJECTION: { _id: 1 },
  MATCH_RESULT_LIMIT: 5,
  toCandidateInput: vi.fn((report: { id: string }) => ({
    id: report.id,
  })),
  toSourceInput: vi.fn((report: { _id: { toString(): string } }) => ({
    id: report._id.toString(),
  })),
}));
vi.mock("./public-report", () => ({
  toMemberReport: vi.fn(
    (report: { _id: { toString(): string } }, viewerId: string) => ({
      id: report._id.toString(),
      viewerId,
    }),
  ),
}));

import { createNotificationPlan } from "@/lib/notifications/delivery";
import { ItemReportModel } from "@/models/item-report";

import { planPossibleMatchNotifications } from "./match-notifications";
import { scoreReportMatch } from "./matching-score";
import {
  MATCH_CANDIDATE_LIMIT,
  MATCH_REPORT_PROJECTION,
  toCandidateInput,
  toSourceInput,
} from "./matching-service";
import { toMemberReport } from "./public-report";

function identifier(value: string) {
  return { toString: () => value };
}

function queryChain<T>(result: T) {
  const chain = {
    sort: vi.fn(),
    limit: vi.fn(),
    session: vi.fn(),
    exec: vi.fn(async () => result),
  };
  chain.sort.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.session.mockReturnValue(chain);
  return chain;
}

const newReportId = "64b64c6f2f4d9f1a2b3c4d51";
const newOwnerId = "64b64c6f2f4d9f1a2b3c4d52";
const ownerIds = [
  "64b64c6f2f4d9f1a2b3c4d61",
  "64b64c6f2f4d9f1a2b3c4d62",
  "64b64c6f2f4d9f1a2b3c4d63",
  "64b64c6f2f4d9f1a2b3c4d64",
  "64b64c6f2f4d9f1a2b3c4d65",
  "64b64c6f2f4d9f1a2b3c4d66",
];
const reportIds = [
  "64b64c6f2f4d9f1a2b3c4d71",
  "64b64c6f2f4d9f1a2b3c4d72",
  "64b64c6f2f4d9f1a2b3c4d73",
  "64b64c6f2f4d9f1a2b3c4d74",
  "64b64c6f2f4d9f1a2b3c4d75",
  "64b64c6f2f4d9f1a2b3c4d76",
  "64b64c6f2f4d9f1a2b3c4d77",
];
const session = { id: "report-transaction" };
const newReport = {
  _id: identifier(newReportId),
  reporterId: identifier(newOwnerId),
  reportType: "lost" as const,
};

function candidate(
  index: number,
  ownerIndex: number,
  createdAt: string,
) {
  return {
    _id: identifier(reportIds[index]),
    reporterId: identifier(ownerIds[ownerIndex]),
    createdAt: new Date(createdAt),
  };
}

describe("possible-match notification planning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createNotificationPlan).mockImplementation(
      (input) => input as never,
    );
  });

  it("uses eligible candidates, public new-report fields and bounded ranking", async () => {
    const candidates = [
      candidate(0, 0, "2026-08-29T01:00:00.000Z"),
      candidate(1, 0, "2026-08-29T02:00:00.000Z"),
      candidate(2, 1, "2026-08-29T03:00:00.000Z"),
      candidate(3, 2, "2026-08-29T04:00:00.000Z"),
      candidate(4, 3, "2026-08-29T05:00:00.000Z"),
      candidate(5, 4, "2026-08-29T06:00:00.000Z"),
      candidate(6, 5, "2026-08-29T07:00:00.000Z"),
    ];
    const scores = new Map([
      [reportIds[0], 90],
      [reportIds[1], 95],
      [reportIds[2], 80],
      [reportIds[3], 70],
      [reportIds[4], 60],
      [reportIds[5], 50],
      [reportIds[6], 34],
    ]);
    const query = queryChain(candidates);
    vi.mocked(ItemReportModel.find).mockReturnValue(query as never);
    vi.mocked(scoreReportMatch).mockImplementation((source) => ({
      score: scores.get(source.id) ?? 0,
      factors: [],
    }));

    const result = await planPossibleMatchNotifications(
      newReport as never,
      session as never,
    );

    expect(ItemReportModel.find).toHaveBeenCalledWith(
      {
        _id: { $ne: newReport._id },
        reporterId: { $ne: newReport.reporterId },
        reportType: "found",
        status: "open",
        moderationStatus: { $ne: "hidden" },
      },
      MATCH_REPORT_PROJECTION,
    );
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(query.limit).toHaveBeenCalledWith(MATCH_CANDIDATE_LIMIT);
    expect(query.session).toHaveBeenCalledWith(session);
    expect(toSourceInput).toHaveBeenCalledTimes(candidates.length);
    expect(toMemberReport).toHaveBeenCalledWith(newReport, ownerIds[0]);
    expect(toCandidateInput).toHaveBeenCalledWith(
      expect.objectContaining({ id: newReportId, viewerId: ownerIds[0] }),
    );
    expect(result).toEqual([
      {
        kind: "possible_match",
        recipientId: ownerIds[0],
        reportId: reportIds[1],
        claimId: null,
        eventId: newReportId,
      },
      {
        kind: "possible_match",
        recipientId: ownerIds[1],
        reportId: reportIds[2],
        claimId: null,
        eventId: newReportId,
      },
      {
        kind: "possible_match",
        recipientId: ownerIds[2],
        reportId: reportIds[3],
        claimId: null,
        eventId: newReportId,
      },
      {
        kind: "possible_match",
        recipientId: ownerIds[3],
        reportId: reportIds[4],
        claimId: null,
        eventId: newReportId,
      },
    ]);
    expect(createNotificationPlan).toHaveBeenCalledTimes(4);
  });

  it("returns no plans when no candidate reaches the threshold", async () => {
    const query = queryChain([
      candidate(0, 0, "2026-08-29T01:00:00.000Z"),
    ]);
    vi.mocked(ItemReportModel.find).mockReturnValue(query as never);
    vi.mocked(scoreReportMatch).mockReturnValue({ score: 34, factors: [] });

    await expect(
      planPossibleMatchNotifications(newReport as never, session as never),
    ).resolves.toEqual([]);
    expect(createNotificationPlan).not.toHaveBeenCalled();
  });

  it("preserves candidate lookup failures for transaction rollback", async () => {
    const failure = new Error("candidate lookup failed");
    const query = queryChain(Promise.reject(failure));
    vi.mocked(ItemReportModel.find).mockReturnValue(query as never);

    await expect(
      planPossibleMatchNotifications(newReport as never, session as never),
    ).rejects.toBe(failure);
  });
});
