import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/item-report", () => ({
  ItemReportModel: {
    find: vi.fn(),
    countDocuments: vi.fn(),
    findOne: vi.fn(),
  },
}));
vi.mock("./public-report", () => ({ toMemberReport: vi.fn() }));

import { connectToDatabase } from "@/lib/db";
import { ItemReportModel } from "@/models/item-report";

import type { ReportBrowseQuery } from "./browse-validation";
import { ReportError } from "./errors";
import { toMemberReport } from "./public-report";
import { getReport, listReports } from "./browse-service";

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

const firstDocument = { _id: "first-report" };
const secondDocument = { _id: "second-report" };
const firstMemberReport = { id: "first-report" };
const secondMemberReport = { id: "second-report" };

const memberReportProjection = {
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
  privacySettings: 1,
  resolvedAt: 1,
  createdAt: 1,
  updatedAt: 1,
};

const findExec = vi.fn();
const findChain = {
  sort: vi.fn(),
  skip: vi.fn(),
  limit: vi.fn(),
  exec: findExec,
};
const countExec = vi.fn();
const countChain = { exec: countExec };
const detailExec = vi.fn();
const detailChain = { exec: detailExec };

function query(
  overrides: Partial<ReportBrowseQuery> = {},
): ReportBrowseQuery {
  return { page: 1, pageSize: 12, ...overrides };
}

describe("report browse service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findChain.sort.mockReturnValue(findChain);
    findChain.skip.mockReturnValue(findChain);
    findChain.limit.mockReturnValue(findChain);
    findExec.mockResolvedValue([firstDocument, secondDocument]);
    countExec.mockResolvedValue(2);
    detailExec.mockResolvedValue(firstDocument);
    vi.mocked(connectToDatabase).mockResolvedValue(undefined as never);
    vi.mocked(ItemReportModel.find).mockReturnValue(findChain as never);
    vi.mocked(ItemReportModel.countDocuments).mockReturnValue(
      countChain as never,
    );
    vi.mocked(ItemReportModel.findOne).mockReturnValue(detailChain as never);
    vi.mocked(toMemberReport).mockImplementation((document) =>
      document === firstDocument
        ? (firstMemberReport as never)
        : (secondMemberReport as never),
    );
  });

  it("lists allowed reports with explicit projection and stable defaults", async () => {
    await expect(listReports(user, query())).resolves.toEqual({
      reports: [firstMemberReport, secondMemberReport],
      pagination: { page: 1, pageSize: 12, total: 2, totalPages: 1 },
    });

    const allowedStatuses = ["open", "claim_pending", "resolved", "closed"];
    expect(connectToDatabase).toHaveBeenCalledOnce();
    expect(ItemReportModel.find).toHaveBeenCalledWith(
      { status: { $in: allowedStatuses } },
      memberReportProjection,
    );
    expect(findChain.sort).toHaveBeenCalledWith({
      occurredAt: -1,
      _id: -1,
    });
    expect(findChain.skip).toHaveBeenCalledWith(0);
    expect(findChain.limit).toHaveBeenCalledWith(12);
    expect(ItemReportModel.countDocuments).toHaveBeenCalledWith({
      status: { $in: allowedStatuses },
    });
  });

  it("uses the text index, score projection and deterministic score sort", async () => {
    await listReports(user, query({ q: "laptop bag" }));

    expect(ItemReportModel.find).toHaveBeenCalledWith(
      {
        status: { $in: ["open", "claim_pending", "resolved", "closed"] },
        $text: { $search: "laptop bag" },
      },
      { ...memberReportProjection, score: { $meta: "textScore" } },
    );
    expect(findChain.sort).toHaveBeenCalledWith({
      score: { $meta: "textScore" },
      occurredAt: -1,
      _id: -1,
    });
  });

  it("adds exact scalar filters and an escaped exact colour expression", async () => {
    await listReports(
      user,
      query({
        reportType: "found",
        categoryId: "64b64c6f2f4d9f1a2b3c4d52",
        status: "resolved",
        color: "Black.*",
      }),
    );

    expect(ItemReportModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        reportType: "found",
        categoryId: "64b64c6f2f4d9f1a2b3c4d52",
        status: "resolved",
        colors: { $regex: /^Black\.\*$/i },
      }),
      expect.any(Object),
    );
  });

  it("couples campus and date filters to member-visible fields", async () => {
    const occurredFrom = new Date("2026-08-01T00:00:00.000Z");
    const occurredTo = new Date("2026-08-15T23:59:59.000Z");

    await listReports(
      user,
      query({
        campusLocationId: "64b64c6f2f4d9f1a2b3c4d53",
        occurredFrom,
        occurredTo,
      }),
    );

    expect(ItemReportModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        campusLocationId: "64b64c6f2f4d9f1a2b3c4d53",
        "privacySettings.showCampusLocation": true,
        occurredAt: { $gte: occurredFrom, $lte: occurredTo },
        "privacySettings.showEventDate": true,
      }),
      expect.any(Object),
    );
  });

  it.each([
    ["lower boundary", { occurredFrom: new Date("2026-08-01T00:00:00Z") }, { $gte: new Date("2026-08-01T00:00:00Z") }],
    ["upper boundary", { occurredTo: new Date("2026-08-15T00:00:00Z") }, { $lte: new Date("2026-08-15T00:00:00Z") }],
  ])("supports an individual %s for visible dates", async (_case, dates, expected) => {
    await listReports(user, query(dates));

    expect(ItemReportModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        occurredAt: expected,
        "privacySettings.showEventDate": true,
      }),
      expect.any(Object),
    );
  });

  it("requires a stored member-visible photo when hasPhoto is true", async () => {
    await listReports(user, query({ hasPhoto: true }));

    expect(ItemReportModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        "privacySettings.showPhoto": true,
        "photoUrls.0": { $exists: true },
      }),
      expect.any(Object),
    );
  });

  it("treats hidden or absent photos as no member-visible photo", async () => {
    await listReports(user, query({ hasPhoto: false }));

    expect(ItemReportModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: [
          { "privacySettings.showPhoto": false },
          { "photoUrls.0": { $exists: false } },
        ],
      }),
      expect.any(Object),
    );
  });

  it("paginates and maps every document for the current viewer", async () => {
    countExec.mockResolvedValue(61);

    await expect(
      listReports(user, query({ page: 3, pageSize: 25 })),
    ).resolves.toEqual({
      reports: [firstMemberReport, secondMemberReport],
      pagination: { page: 3, pageSize: 25, total: 61, totalPages: 3 },
    });

    expect(findChain.skip).toHaveBeenCalledWith(50);
    expect(findChain.limit).toHaveBeenCalledWith(25);
    expect(toMemberReport).toHaveBeenNthCalledWith(
      1,
      firstDocument,
      user.id,
    );
    expect(toMemberReport).toHaveBeenNthCalledWith(
      2,
      secondDocument,
      user.id,
    );
  });

  it("runs the page and total queries in parallel", async () => {
    let resolveReports!: (documents: unknown[]) => void;
    findExec.mockReturnValue(
      new Promise((resolve) => {
        resolveReports = resolve;
      }),
    );

    const result = listReports(user, query());
    await vi.waitFor(() => expect(countExec).toHaveBeenCalledOnce());
    resolveReports([]);

    await expect(result).resolves.toEqual({
      reports: [],
      pagination: { page: 1, pageSize: 12, total: 2, totalPages: 1 },
    });
  });

  it("returns empty and beyond-range pages with actual totals", async () => {
    findExec.mockResolvedValue([]);
    countExec.mockResolvedValue(13);

    await expect(
      listReports(user, query({ page: 4, pageSize: 6 })),
    ).resolves.toEqual({
      reports: [],
      pagination: { page: 4, pageSize: 6, total: 13, totalPages: 3 },
    });
    expect(findChain.skip).toHaveBeenCalledWith(18);
  });

  it("loads a non-draft detail and maps it for the current viewer", async () => {
    await expect(getReport(user, "64b64c6f2f4d9f1a2b3c4d54")).resolves.toBe(
      firstMemberReport,
    );

    expect(connectToDatabase).toHaveBeenCalledOnce();
    expect(ItemReportModel.findOne).toHaveBeenCalledWith(
      {
        _id: "64b64c6f2f4d9f1a2b3c4d54",
        status: { $in: ["open", "claim_pending", "resolved", "closed"] },
      },
      memberReportProjection,
    );
    expect(toMemberReport).toHaveBeenCalledWith(firstDocument, user.id);
  });

  it("reports missing or draft details with the safe not-found domain error", async () => {
    detailExec.mockResolvedValue(null);

    await expect(
      getReport(user, "64b64c6f2f4d9f1a2b3c4d54"),
    ).rejects.toEqual(new ReportError("REPORT_NOT_FOUND"));
    expect(toMemberReport).not.toHaveBeenCalled();
  });

  it("preserves database failures for the route error boundary", async () => {
    const listFailure = new Error("list failed");
    findExec.mockRejectedValue(listFailure);

    await expect(listReports(user, query())).rejects.toBe(listFailure);

    const detailFailure = new Error("detail failed");
    detailExec.mockRejectedValue(detailFailure);
    await expect(
      getReport(user, "64b64c6f2f4d9f1a2b3c4d54"),
    ).rejects.toBe(detailFailure);
  });
});
