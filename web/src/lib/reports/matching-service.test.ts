import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/item-report", () => ({
  ItemReportModel: {
    findOne: vi.fn(),
    find: vi.fn(),
  },
}));
vi.mock("./public-report", () => ({ toMemberReport: vi.fn() }));
vi.mock("./matching-score", () => ({ scoreReportMatch: vi.fn() }));

import { connectToDatabase } from "@/lib/db";
import { ItemReportModel } from "@/models/item-report";

import { MatchingError } from "./matching-errors";
import { scoreReportMatch } from "./matching-score";
import { findReportMatches } from "./matching-service";
import { toMemberReport, type MemberReport } from "./public-report";

const user = {
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

const reportId = "64b64c6f2f4d9f1a2b3c4d54";
const sourceOwnerId = user.id;

const sourceDocument = {
  _id: reportId,
  reporterId: sourceOwnerId,
  reportType: "lost",
  title: "Black laptop charger",
  publicDescription: "Lost near the library",
  categoryId: "64b64c6f2f4d9f1a2b3c4d52",
  campusLocationId: "64b64c6f2f4d9f1a2b3c4d53",
  occurredAt: new Date("2026-08-20T00:00:00.000Z"),
  colors: ["Black"],
  tags: ["laptop", "charger"],
  photoUrls: [],
  status: "open",
  moderationStatus: "visible",
  privacySettings: {
    showPhoto: true,
    showEventDate: false,
    showCampusLocation: false,
  },
  resolvedAt: null,
  createdAt: new Date("2026-08-20T01:00:00.000Z"),
  updatedAt: new Date("2026-08-20T01:00:00.000Z"),
};

const matchProjection = {
  _id: 1,
  reporterId: 1,
  reportType: 1,
  title: 1,
  publicDescription: 1,
  categoryId: 1,
  campusLocationId: 1,
  occurredAt: 1,
  colors: 1,
  tags: 1,
  photoUrls: 1,
  status: 1,
  moderationStatus: 1,
  privacySettings: 1,
  resolvedAt: 1,
  createdAt: 1,
  updatedAt: 1,
};

const sourceExec = vi.fn();
const sourceChain = { exec: sourceExec };
const candidateExec = vi.fn();
const candidateChain = {
  sort: vi.fn(),
  limit: vi.fn(),
  exec: candidateExec,
};

function memberReport(
  id: string,
  overrides: Partial<MemberReport> = {},
): MemberReport {
  return {
    id,
    reportType: "found",
    title: `Candidate ${id}`,
    publicDescription: "Found candidate report",
    categoryId: "64b64c6f2f4d9f1a2b3c4d52",
    campusLocationId: "64b64c6f2f4d9f1a2b3c4d53",
    occurredAt: "2026-08-20T00:00:00.000Z",
    colors: ["Black"],
    tags: ["charger"],
    photoUrls: [],
    status: "open",
    moderationStatus: "visible",
    resolvedAt: null,
    createdAt: "2026-08-20T02:00:00.000Z",
    updatedAt: "2026-08-20T02:00:00.000Z",
    isOwner: false,
    ...overrides,
  };
}

function document(id: string) {
  return { _id: id };
}

describe("report matching service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sourceExec.mockResolvedValue(sourceDocument);
    candidateExec.mockResolvedValue([document("candidate")]);
    candidateChain.sort.mockReturnValue(candidateChain);
    candidateChain.limit.mockReturnValue(candidateChain);
    vi.mocked(connectToDatabase).mockResolvedValue(undefined as never);
    vi.mocked(ItemReportModel.findOne).mockReturnValue(sourceChain as never);
    vi.mocked(ItemReportModel.find).mockReturnValue(candidateChain as never);
    vi.mocked(toMemberReport).mockImplementation((candidate) =>
      memberReport(String(candidate._id)),
    );
    vi.mocked(scoreReportMatch).mockReturnValue({
      score: 70,
      factors: [
        {
          key: "category",
          points: 25,
          maximum: 25,
          explanation: "Same category",
        },
      ],
    });
  });

  it("loads the owner's source and bounded opposite-type candidates", async () => {
    await expect(findReportMatches(user, reportId)).resolves.toMatchObject({
      sourceReportId: reportId,
      matches: [{ report: { id: "candidate" }, score: 70 }],
    });

    expect(connectToDatabase).toHaveBeenCalledOnce();
    expect(ItemReportModel.findOne).toHaveBeenCalledWith(
      {
        _id: reportId,
        reporterId: user.id,
        moderationStatus: { $ne: "hidden" },
      },
      matchProjection,
    );
    expect(ItemReportModel.find).toHaveBeenCalledWith(
      {
        _id: { $ne: sourceDocument._id },
        reporterId: { $ne: sourceDocument.reporterId },
        reportType: "found",
        status: "open",
        moderationStatus: { $ne: "hidden" },
      },
      matchProjection,
    );
    expect(candidateChain.sort).toHaveBeenCalledWith({
      createdAt: -1,
      _id: -1,
    });
    expect(candidateChain.limit).toHaveBeenCalledWith(500);
    expect(toMemberReport).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "candidate" }),
      user.id,
    );
  });

  it("searches lost candidates for a found source", async () => {
    sourceExec.mockResolvedValue({ ...sourceDocument, reportType: "found" });

    await findReportMatches(user, reportId);

    expect(ItemReportModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ reportType: "lost", status: "open" }),
      matchProjection,
    );
  });

  it.each(["missing or non-owned", "hidden"])(
    "treats a %s source returned outside the visible owner query as not found",
    async () => {
      sourceExec.mockResolvedValue(null);

      await expect(findReportMatches(user, reportId)).rejects.toEqual(
        new MatchingError("REPORT_NOT_FOUND"),
      );
      expect(ItemReportModel.find).not.toHaveBeenCalled();
    },
  );

  it("scores only the visible candidates returned by the filtered database query", async () => {
    candidateExec.mockResolvedValue([document("visible-candidate")]);

    await findReportMatches(user, reportId);

    expect(ItemReportModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ moderationStatus: { $ne: "hidden" } }),
      matchProjection,
    );
    expect(toMemberReport).toHaveBeenCalledTimes(1);
    expect(scoreReportMatch).toHaveBeenCalledTimes(1);
    expect(toMemberReport).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "visible-candidate" }),
      user.id,
    );
  });

  it.each(["draft", "claim_pending", "resolved", "closed"])(
    "rejects a %s source before loading candidates",
    async (status) => {
      sourceExec.mockResolvedValue({ ...sourceDocument, status });

      await expect(findReportMatches(user, reportId)).rejects.toEqual(
        new MatchingError("REPORT_NOT_MATCHABLE"),
      );
      expect(ItemReportModel.find).not.toHaveBeenCalled();
    },
  );

  it("uses the owner's actual source values but only public candidate values", async () => {
    vi.mocked(toMemberReport).mockReturnValue(
      memberReport("candidate", {
        campusLocationId: null,
        occurredAt: null,
      }),
    );

    await findReportMatches(user, reportId);

    expect(scoreReportMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        id: reportId,
        campusLocationId: sourceDocument.campusLocationId,
        occurredAt: sourceDocument.occurredAt.toISOString(),
      }),
      expect.objectContaining({
        id: "candidate",
        campusLocationId: null,
        occurredAt: null,
      }),
    );
  });

  it("filters, stably ranks and limits qualifying matches", async () => {
    const candidates = [
      document("low"),
      document("older-tie"),
      document("newer-tie"),
      document("same-time-a"),
      document("same-time-b"),
      document("sixth"),
      document("below-threshold"),
    ];
    candidateExec.mockResolvedValue(candidates);
    vi.mocked(toMemberReport).mockImplementation((candidate) => {
      const id = String(candidate._id);
      const createdAt =
        id === "older-tie"
          ? "2026-08-19T00:00:00.000Z"
          : id === "newer-tie"
            ? "2026-08-21T00:00:00.000Z"
            : "2026-08-20T00:00:00.000Z";
      return memberReport(id, { createdAt });
    });
    vi.mocked(scoreReportMatch).mockImplementation((_source, candidate) => ({
      score:
        candidate.id === "below-threshold"
          ? 34
          : candidate.id === "low"
            ? 40
            : candidate.id === "sixth"
              ? 50
              : 80,
      factors: [],
    }));

    const result = await findReportMatches(user, reportId);

    expect(result.matches.map((match) => match.report.id)).toEqual([
      "newer-tie",
      "same-time-b",
      "same-time-a",
      "older-tie",
      "sixth",
    ]);
    expect(result.matches).toHaveLength(5);
    expect(result.matches.every((match) => match.score >= 35)).toBe(true);
  });

  it("returns a safe empty result when no candidates qualify", async () => {
    candidateExec.mockResolvedValue([]);

    await expect(findReportMatches(user, reportId)).resolves.toEqual({
      sourceReportId: reportId,
      matches: [],
    });
    expect(toMemberReport).not.toHaveBeenCalled();
    expect(scoreReportMatch).not.toHaveBeenCalled();
  });

  it("preserves a database connection failure for the route boundary", async () => {
    const failure = new Error("connection private detail");
    vi.mocked(connectToDatabase).mockRejectedValueOnce(failure);

    await expect(findReportMatches(user, reportId)).rejects.toBe(failure);
  });

  it("preserves a source query failure for the route boundary", async () => {
    const failure = new Error("source query private detail");
    sourceExec.mockRejectedValueOnce(failure);

    await expect(findReportMatches(user, reportId)).rejects.toBe(failure);
  });

  it("preserves a candidate query failure for the route boundary", async () => {
    const failure = new Error("candidate query private detail");
    candidateExec.mockRejectedValueOnce(failure);

    await expect(findReportMatches(user, reportId)).rejects.toBe(failure);
  });

  it("preserves a public mapper failure for the route boundary", async () => {
    const failure = new Error("public mapper private detail");
    vi.mocked(toMemberReport).mockImplementationOnce(() => {
      throw failure;
    });

    await expect(findReportMatches(user, reportId)).rejects.toBe(failure);
  });

  it("preserves a scorer failure for the route boundary", async () => {
    const failure = new Error("scorer private detail");
    vi.mocked(scoreReportMatch).mockImplementationOnce(() => {
      throw failure;
    });

    await expect(findReportMatches(user, reportId)).rejects.toBe(failure);
  });
});
