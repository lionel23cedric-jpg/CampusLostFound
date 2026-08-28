import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/item-report", () => ({
  REPORT_TYPES: ["lost", "found"],
  REPORT_VERIFICATION_STATUSES: ["pending", "verified"],
  REPORT_CUSTODY_STATUSES: [
    "not_applicable",
    "not_held",
    "stored",
    "released",
  ],
  ItemReportModel: {
    find: vi.fn(),
    findOne: vi.fn(),
    countDocuments: vi.fn(),
  },
}));
vi.mock("./access", () => ({ requireStaffReportUser: vi.fn() }));
vi.mock("./contracts", () => ({
  toStaffReportSummary: vi.fn(),
  toStaffReportDetail: vi.fn(),
}));

import { connectToDatabase } from "@/lib/db";
import type { PublicUser } from "@/lib/auth/public-user";
import { ItemReportModel } from "@/models/item-report";
import { requireStaffReportUser } from "./access";
import { toStaffReportDetail, toStaffReportSummary } from "./contracts";
import { getStaffReport, listStaffReports } from "./service";

const staff: PublicUser = {
  id: "64f0123456789abcdef01238",
  email: "staff@example.test",
  role: "staff",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Staff Member",
    preferredContactMethod: "in_app",
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
};

const projection = {
  _id: 1,
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
  resolvedAt: 1,
  createdAt: 1,
  updatedAt: 1,
};
const first = { _id: "first" };
const second = { _id: "second" };
const firstSummary = { id: "first" };
const secondSummary = { id: "second" };
const detail = { id: "first", handling: { storageLocation: "Desk B12" } };

const listExec = vi.fn();
const listChain = {
  select: vi.fn(),
  sort: vi.fn(),
  skip: vi.fn(),
  limit: vi.fn(),
  lean: vi.fn(),
  exec: listExec,
};
const countExec = vi.fn();
const countChain = { exec: countExec };
const detailExec = vi.fn();
const detailChain = { select: vi.fn(), lean: vi.fn(), exec: detailExec };

describe("staff report read service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const method of ["select", "sort", "skip", "limit", "lean"] as const) {
      listChain[method].mockReturnValue(listChain);
    }
    detailChain.select.mockReturnValue(detailChain);
    detailChain.lean.mockReturnValue(detailChain);
    listExec.mockResolvedValue([first, second]);
    countExec.mockResolvedValue(12);
    detailExec.mockResolvedValue(first);
    vi.mocked(ItemReportModel.find).mockReturnValue(listChain as never);
    vi.mocked(ItemReportModel.findOne).mockReturnValue(detailChain as never);
    vi.mocked(ItemReportModel.countDocuments).mockReturnValue(countChain as never);
    vi.mocked(toStaffReportSummary).mockImplementation((value) =>
      (value as unknown) === first
        ? (firstSummary as never)
        : (secondSummary as never),
    );
    vi.mocked(toStaffReportDetail).mockReturnValue(detail as never);
  });

  it("lists visible active reports with fixed deterministic pagination", async () => {
    await expect(listStaffReports(staff, { page: 2 })).resolves.toEqual({
      reports: [firstSummary, secondSummary],
      pagination: { page: 2, pageSize: 10, total: 12, totalPages: 2 },
    });

    const filter = {
      moderationStatus: { $ne: "hidden" },
      status: { $in: ["open", "claim_pending"] },
    };
    expect(requireStaffReportUser).toHaveBeenCalledWith(staff);
    expect(connectToDatabase).toHaveBeenCalledOnce();
    expect(ItemReportModel.find).toHaveBeenCalledWith(filter, projection);
    expect(listChain.select).toHaveBeenCalledWith("+staffHandling");
    expect(listChain.sort).toHaveBeenCalledWith({ createdAt: 1, _id: 1 });
    expect(listChain.skip).toHaveBeenCalledWith(10);
    expect(listChain.limit).toHaveBeenCalledWith(10);
    expect(ItemReportModel.countDocuments).toHaveBeenCalledWith(filter);
  });

  it("adds a legacy-compatible pending verification filter", async () => {
    await listStaffReports(staff, { verificationStatus: "pending", page: 1 });

    const [filter] = vi.mocked(ItemReportModel.find).mock.calls[0];
    expect(filter).toEqual({
      moderationStatus: { $ne: "hidden" },
      status: { $in: ["open", "claim_pending"] },
      $or: [
        { "staffHandling.verificationStatus": "pending" },
        { staffHandling: { $exists: false } },
      ],
    });
  });

  it("applies approved explicit filters without weakening visibility", async () => {
    await listStaffReports(staff, {
      reportType: "found",
      reportStatus: "resolved",
      verificationStatus: "verified",
      custodyStatus: "stored",
      page: 1,
    });

    expect(ItemReportModel.find).toHaveBeenCalledWith(
      {
        moderationStatus: { $ne: "hidden" },
        status: "resolved",
        reportType: "found",
        "staffHandling.verificationStatus": "verified",
        "staffHandling.custodyStatus": "stored",
      },
      projection,
    );
  });

  it("uses legacy type defaults for not-held custody", async () => {
    await listStaffReports(staff, { custodyStatus: "not_held", page: 1 });
    const [filter] = vi.mocked(ItemReportModel.find).mock.calls[0];
    expect(filter).toMatchObject({
      $or: [
        { "staffHandling.custodyStatus": "not_held" },
        { reportType: "found", staffHandling: { $exists: false } },
      ],
    });
  });

  it("returns an empty beyond-range page without changing it", async () => {
    listExec.mockResolvedValue([]);
    countExec.mockResolvedValue(21);
    await expect(listStaffReports(staff, { page: 4 })).resolves.toEqual({
      reports: [],
      pagination: { page: 4, pageSize: 10, total: 21, totalPages: 3 },
    });
  });

  it("loads a visible controlled detail without reporter identity", async () => {
    await expect(
      getStaffReport(staff, "64f0123456789abcdef01234"),
    ).resolves.toBe(detail);

    expect(ItemReportModel.findOne).toHaveBeenCalledWith(
      {
        _id: "64f0123456789abcdef01234",
        moderationStatus: { $ne: "hidden" },
        status: { $in: ["open", "claim_pending", "resolved"] },
      },
      projection,
    );
    expect(detailChain.select).toHaveBeenCalledWith("+staffHandling");
    expect(toStaffReportDetail).toHaveBeenCalledWith(first);
    expect(projection).not.toHaveProperty("reporterId");
  });

  it("maps an inaccessible detail to the safe not-found error", async () => {
    detailExec.mockResolvedValue(null);
    await expect(
      getStaffReport(staff, "64f0123456789abcdef01234"),
    ).rejects.toMatchObject({ code: "STAFF_REPORT_NOT_FOUND", status: 404 });
  });

  it("rejects access before connecting to the database", async () => {
    vi.mocked(requireStaffReportUser).mockImplementationOnce(() => {
      throw Object.assign(new Error("forbidden"), { code: "STAFF_REPORT_FORBIDDEN" });
    });
    await expect(listStaffReports(staff, { page: 1 })).rejects.toMatchObject({
      code: "STAFF_REPORT_FORBIDDEN",
    });
    expect(connectToDatabase).not.toHaveBeenCalled();
  });
});
