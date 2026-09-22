import mongoose from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/item-report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/models/item-report")>();
  return {
    ...actual,
    ItemReportModel: {
      find: vi.fn(),
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
      countDocuments: vi.fn(),
    },
  };
});
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
import {
  getStaffReport,
  listStaffReports,
  storeStaffReport,
  verifyStaffReport,
} from "./service";

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
const updateExec = vi.fn();
const updateChain = { select: vi.fn(), lean: vi.fn(), exec: updateExec };

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

const reportId = "64f0123456789abcdef01234";
const staffId = new mongoose.Types.ObjectId(staff.id);
const reportUpdatedAt = new Date("2026-08-29T01:02:03.000Z");
const now = new Date("2026-08-29T04:05:06.000Z");

function reportRecord(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    _id: new mongoose.Types.ObjectId(reportId),
    reportType: "found",
    title: "Found campus card",
    publicDescription: "A campus card found near the library entrance.",
    categoryId: new mongoose.Types.ObjectId("64f0123456789abcdef01235"),
    campusLocationId: new mongoose.Types.ObjectId(
      "64f0123456789abcdef01236",
    ),
    occurredAt: new Date("2026-08-28T01:00:00.000Z"),
    colors: ["blue"],
    tags: ["card"],
    photoUrls: [],
    status: "open",
    moderationStatus: "visible",
    resolvedAt: null,
    staffHandling: {
      verificationStatus: "pending",
      verifiedBy: null,
      verifiedAt: null,
      custodyStatus: "not_held",
      storageLocation: null,
      storedAt: null,
      releasedAt: null,
      updatedBy: null,
    },
    createdAt: new Date("2026-08-28T02:00:00.000Z"),
    updatedAt: reportUpdatedAt,
    ...overrides,
  };
}

describe("staff report verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    updateChain.select.mockReturnValue(updateChain);
    updateChain.lean.mockReturnValue(updateChain);
    detailChain.select.mockReturnValue(detailChain);
    detailChain.lean.mockReturnValue(detailChain);
    vi.mocked(ItemReportModel.findOneAndUpdate).mockReturnValue(
      updateChain as never,
    );
    vi.mocked(ItemReportModel.findOne).mockReturnValue(detailChain as never);
    detailExec.mockResolvedValue(reportRecord());
    updateExec.mockResolvedValue(reportRecord());
    vi.mocked(toStaffReportDetail).mockReturnValue(detail as never);
  });

  afterEach(() => vi.useRealTimers());

  it("atomically verifies a pending Found report", async () => {
    await expect(
      verifyStaffReport(staff, reportId, {
        expectedUpdatedAt: reportUpdatedAt.toISOString(),
      }),
    ).resolves.toBe(detail);

    expect(ItemReportModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: reportId,
        updatedAt: reportUpdatedAt,
        reportType: "found",
        moderationStatus: { $ne: "hidden" },
        status: { $in: ["open", "claim_pending"] },
        $or: [
          { "staffHandling.verificationStatus": "pending" },
          { staffHandling: { $exists: false } },
        ],
      },
      {
        $set: {
          staffHandling: {
            verificationStatus: "verified",
            verifiedBy: staffId,
            verifiedAt: now,
            custodyStatus: "not_held",
            storageLocation: null,
            storedAt: null,
            releasedAt: null,
            updatedBy: staffId,
          },
        },
      },
      { returnDocument: "after", runValidators: true, projection },
    );
    expect(updateChain.select).toHaveBeenCalledWith("+staffHandling");
    expect(toStaffReportDetail).toHaveBeenCalledWith(
      expect.objectContaining({ _id: new mongoose.Types.ObjectId(reportId) }),
    );
  });

  it("writes a complete Lost-report state for legacy records", async () => {
    detailExec.mockResolvedValue(reportRecord({
      reportType: "lost",
      staffHandling: undefined,
    }));
    updateExec.mockResolvedValue(reportRecord({ reportType: "lost" }));

    await verifyStaffReport(staff, reportId, {
      expectedUpdatedAt: reportUpdatedAt.toISOString(),
    });

    const [, update] = vi.mocked(ItemReportModel.findOneAndUpdate).mock.calls[0];
    expect(update).toMatchObject({
      $set: {
        staffHandling: {
          verificationStatus: "verified",
          custodyStatus: "not_applicable",
          storageLocation: null,
          storedAt: null,
          releasedAt: null,
        },
      },
    });
  });

  it("returns conflict for stale or ineligible visible reports", async () => {
    updateExec.mockResolvedValue(null);
    detailExec
      .mockResolvedValueOnce(reportRecord())
      .mockResolvedValueOnce({ _id: reportId });

    await expect(
      verifyStaffReport(staff, reportId, {
        expectedUpdatedAt: reportUpdatedAt.toISOString(),
      }),
    ).rejects.toMatchObject({
      code: "STAFF_REPORT_STATE_CONFLICT",
      status: 409,
    });
    expect(ItemReportModel.findOne).toHaveBeenCalledWith(
      { _id: reportId, moderationStatus: { $ne: "hidden" } },
      { _id: 1 },
    );
  });

  it("returns not found when the report is missing or hidden", async () => {
    updateExec.mockResolvedValue(null);
    detailExec.mockResolvedValue(null);

    await expect(
      verifyStaffReport(staff, reportId, {
        expectedUpdatedAt: reportUpdatedAt.toISOString(),
      }),
    ).rejects.toMatchObject({ code: "STAFF_REPORT_NOT_FOUND", status: 404 });
  });
});

describe("staff report storage", () => {
  const verifiedAt = new Date("2026-08-29T02:00:00.000Z");
  const verified = {
    verificationStatus: "verified",
    verifiedBy: staffId,
    verifiedAt,
    custodyStatus: "not_held",
    storageLocation: null,
    storedAt: null,
    releasedAt: null,
    updatedBy: staffId,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    detailChain.select.mockReturnValue(detailChain);
    detailChain.lean.mockReturnValue(detailChain);
    updateChain.select.mockReturnValue(updateChain);
    updateChain.lean.mockReturnValue(updateChain);
    vi.mocked(ItemReportModel.findOne).mockReturnValue(detailChain as never);
    vi.mocked(ItemReportModel.findOneAndUpdate).mockReturnValue(
      updateChain as never,
    );
    detailExec.mockResolvedValue(reportRecord({ staffHandling: verified }));
    updateExec.mockResolvedValue(reportRecord({ staffHandling: verified }));
    vi.mocked(toStaffReportDetail).mockReturnValue(detail as never);
  });

  afterEach(() => vi.useRealTimers());

  it("stores a verified Found report with the first intake time", async () => {
    await expect(
      storeStaffReport(staff, reportId, {
        expectedUpdatedAt: reportUpdatedAt.toISOString(),
        storageLocation: "Library desk - locker B12",
      }),
    ).resolves.toBe(detail);

    expect(ItemReportModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: reportId,
        updatedAt: reportUpdatedAt,
        reportType: "found",
        moderationStatus: { $ne: "hidden" },
        status: { $in: ["open", "claim_pending"] },
        "staffHandling.verificationStatus": "verified",
        "staffHandling.custodyStatus": "not_held",
      },
      {
        $set: {
          staffHandling: {
            ...verified,
            custodyStatus: "stored",
            storageLocation: "Library desk - locker B12",
            storedAt: now,
            updatedBy: staffId,
          },
        },
      },
      { returnDocument: "after", runValidators: true, projection },
    );
  });

  it("updates the location while retaining the original intake time", async () => {
    const storedAt = new Date("2026-08-29T03:00:00.000Z");
    const stored = {
      ...verified,
      custodyStatus: "stored",
      storageLocation: "Old locker",
      storedAt,
    };
    detailExec.mockResolvedValue(reportRecord({ staffHandling: stored }));

    await storeStaffReport(staff, reportId, {
      expectedUpdatedAt: reportUpdatedAt.toISOString(),
      storageLocation: "New locker",
    });

    const [, update] = vi.mocked(ItemReportModel.findOneAndUpdate).mock.calls[0];
    expect(update).toMatchObject({
      $set: {
        staffHandling: {
          custodyStatus: "stored",
          storageLocation: "New locker",
          storedAt,
          releasedAt: null,
        },
      },
    });
  });

  it.each([
    ["Lost", { reportType: "lost" }],
    ["pending", { staffHandling: { ...verified, verificationStatus: "pending" } }],
    ["released", { staffHandling: { ...verified, custodyStatus: "released" } }],
    ["resolved", { status: "resolved" }],
    ["stale", { updatedAt: new Date("2026-08-29T01:02:04.000Z") }],
  ])("rejects an ineligible %s report", async (_label, overrides) => {
    detailExec.mockResolvedValue(reportRecord(overrides));

    await expect(
      storeStaffReport(staff, reportId, {
        expectedUpdatedAt: reportUpdatedAt.toISOString(),
        storageLocation: "Locker B12",
      }),
    ).rejects.toMatchObject({
      code: "STAFF_REPORT_STATE_CONFLICT",
      status: 409,
    });
    expect(ItemReportModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("returns not found for a missing or hidden report", async () => {
    detailExec.mockResolvedValue(null);

    await expect(
      storeStaffReport(staff, reportId, {
        expectedUpdatedAt: reportUpdatedAt.toISOString(),
        storageLocation: "Locker B12",
      }),
    ).rejects.toMatchObject({ code: "STAFF_REPORT_NOT_FOUND", status: 404 });
  });

  it("returns conflict when the guarded storage update loses a race", async () => {
    updateExec.mockResolvedValue(null);

    await expect(
      storeStaffReport(staff, reportId, {
        expectedUpdatedAt: reportUpdatedAt.toISOString(),
        storageLocation: "Locker B12",
      }),
    ).rejects.toMatchObject({
      code: "STAFF_REPORT_STATE_CONFLICT",
      status: 409,
    });
  });
});
