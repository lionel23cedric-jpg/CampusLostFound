import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/item-report", () => ({
  REPORT_STATUSES: ["draft", "open", "claim_pending", "resolved", "closed"],
  ItemReportModel: {
    find: vi.fn(),
    countDocuments: vi.fn(),
  },
}));
vi.mock("./public-report", () => ({ toOwnerReport: vi.fn() }));

import { connectToDatabase } from "@/lib/db";
import { ItemReportModel } from "@/models/item-report";

import { toOwnerReport } from "./public-report";
import { listOwnReports } from "./owner-history-service";

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
const firstOwnerReport = { id: "first-report" };
const secondOwnerReport = { id: "second-report" };

const ownerProjection = {
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

const findExec = vi.fn();
const findChain = {
  sort: vi.fn(),
  skip: vi.fn(),
  limit: vi.fn(),
  exec: findExec,
};
const countExec = vi.fn();
const countChain = { exec: countExec };

describe("owner report history service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findChain.sort.mockReturnValue(findChain);
    findChain.skip.mockReturnValue(findChain);
    findChain.limit.mockReturnValue(findChain);
    findExec.mockResolvedValue([firstDocument, secondDocument]);
    countExec.mockResolvedValue(2);
    vi.mocked(connectToDatabase).mockResolvedValue(undefined as never);
    vi.mocked(ItemReportModel.find).mockReturnValue(findChain as never);
    vi.mocked(ItemReportModel.countDocuments).mockReturnValue(
      countChain as never,
    );
    vi.mocked(toOwnerReport).mockImplementation((document) =>
      document === firstDocument
        ? (firstOwnerReport as never)
        : (secondOwnerReport as never),
    );
  });

  it("binds unfiltered history to the authenticated owner", async () => {
    await expect(listOwnReports(user, { page: 1 })).resolves.toEqual({
      reports: [firstOwnerReport, secondOwnerReport],
      pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
    });

    expect(connectToDatabase).toHaveBeenCalledOnce();
    expect(ItemReportModel.find).toHaveBeenCalledWith(
      { reporterId: user.id },
      ownerProjection,
    );
    expect(findChain.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(findChain.skip).toHaveBeenCalledWith(0);
    expect(findChain.limit).toHaveBeenCalledWith(10);
    expect(ItemReportModel.countDocuments).toHaveBeenCalledWith({
      reporterId: user.id,
    });
  });

  it("adds only approved filters without weakening ownership", async () => {
    await listOwnReports(user, {
      reportType: "found",
      status: "draft",
      page: 3,
    });

    const filter = {
      reporterId: user.id,
      reportType: "found",
      status: "draft",
    };
    expect(ItemReportModel.find).toHaveBeenCalledWith(filter, ownerProjection);
    expect(ItemReportModel.countDocuments).toHaveBeenCalledWith(filter);
    expect(findChain.skip).toHaveBeenCalledWith(20);
    expect(findChain.limit).toHaveBeenCalledWith(10);
  });

  it.each(["draft", "open", "claim_pending", "resolved", "closed"] as const)(
    "supports the owner lifecycle status %s",
    async (status) => {
      await listOwnReports(user, { status, page: 1 });

      expect(ItemReportModel.find).toHaveBeenCalledWith(
        { reporterId: user.id, status },
        ownerProjection,
      );
    },
  );

  it("does not exclude hidden or draft owner records", async () => {
    await listOwnReports(user, { page: 1 });

    const [filter] = vi.mocked(ItemReportModel.find).mock.calls[0];
    expect(filter).not.toHaveProperty("moderationStatus");
    expect(filter).not.toHaveProperty("status");
  });

  it("serializes every result through the existing owner boundary", async () => {
    await listOwnReports(user, { page: 1 });

    expect(toOwnerReport).toHaveBeenNthCalledWith(1, firstDocument);
    expect(toOwnerReport).toHaveBeenNthCalledWith(2, secondDocument);
  });

  it("returns an empty beyond-range page with accurate totals", async () => {
    findExec.mockResolvedValue([]);
    countExec.mockResolvedValue(21);

    await expect(listOwnReports(user, { page: 4 })).resolves.toEqual({
      reports: [],
      pagination: { page: 4, pageSize: 10, total: 21, totalPages: 3 },
    });
    expect(findChain.skip).toHaveBeenCalledWith(30);
  });

  it("starts the page and count queries together", async () => {
    let resolveReports!: (documents: unknown[]) => void;
    findExec.mockReturnValue(
      new Promise((resolve) => {
        resolveReports = resolve;
      }),
    );

    const result = listOwnReports(user, { page: 1 });
    await vi.waitFor(() => expect(countExec).toHaveBeenCalledOnce());
    resolveReports([]);

    await expect(result).resolves.toEqual({
      reports: [],
      pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
    });
  });

  it("preserves database rejection for the safe route boundary", async () => {
    const privateFailure = new Error("private owner index detail");
    findExec.mockRejectedValue(privateFailure);

    await expect(listOwnReports(user, { page: 1 })).rejects.toBe(
      privateFailure,
    );
    expect(toOwnerReport).not.toHaveBeenCalled();
  });
});
