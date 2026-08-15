import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/category", () => ({
  CategoryModel: { findOne: vi.fn() },
}));
vi.mock("@/models/campus-location", () => ({
  CampusLocationModel: { findOne: vi.fn() },
}));
vi.mock("@/models/item-report", () => ({
  ItemReportModel: { create: vi.fn() },
}));
vi.mock("@/models/private-verification-details", () => ({
  PrivateVerificationDetailsModel: { create: vi.fn() },
}));
vi.mock("./public-report", () => ({ toOwnerReport: vi.fn() }));

import { connectToDatabase } from "@/lib/db";
import { CampusLocationModel } from "@/models/campus-location";
import { CategoryModel } from "@/models/category";
import { ItemReportModel } from "@/models/item-report";
import { PrivateVerificationDetailsModel } from "@/models/private-verification-details";

import { toOwnerReport } from "./public-report";
import { createReport } from "./service";

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

const input = {
  reportType: "lost" as const,
  title: "Black laptop bag",
  publicDescription: "Black laptop bag with a shoulder strap.",
  categoryId: "64b64c6f2f4d9f1a2b3c4d52",
  campusLocationId: "64b64c6f2f4d9f1a2b3c4d53",
  occurredAt: new Date("2026-08-14T02:00:00.000Z"),
  colors: ["Black"],
  tags: ["laptop", "bag"],
  photoUrls: ["https://images.example/item.jpg"],
  privacySettings: {
    showPhoto: true,
    showEventDate: true,
    showCampusLocation: true,
  },
  privateVerification: {
    distinguishingFeatures: ["Small scratch beneath the handle"],
    exactLocationDetails: "Second-floor study area",
    serialNumber: null,
    verificationQuestions: [
      {
        question: "What is attached to the zipper?",
        expectedAnswer: "A blue tag",
      },
    ],
    privateNotes: null,
  },
};

const reportDocument = { _id: "report-id" };
const ownerReport = { id: "report-id", status: "open" } as never;
const transaction = {
  withTransaction: vi.fn(
    async (work: () => Promise<unknown>) => await work(),
  ),
  endSession: vi.fn(async () => undefined),
};
const startSession = vi.fn(async () => transaction);

describe("report service", () => {
  beforeEach(() => {
    transaction.withTransaction.mockImplementation(
      async (work: () => Promise<unknown>) => await work(),
    );
    vi.mocked(connectToDatabase).mockResolvedValue({ startSession } as never);
    vi.mocked(CategoryModel.findOne).mockResolvedValue({
      _id: input.categoryId,
    } as never);
    vi.mocked(CampusLocationModel.findOne).mockResolvedValue({
      _id: input.campusLocationId,
    } as never);
    vi.mocked(ItemReportModel.create).mockResolvedValue([
      reportDocument,
    ] as never);
    vi.mocked(PrivateVerificationDetailsModel.create).mockResolvedValue(
      [] as never,
    );
    vi.mocked(toOwnerReport).mockReturnValue(ownerReport);
  });

  it("creates public and private records in one transaction", async () => {
    await expect(createReport(user, input)).resolves.toBe(ownerReport);

    expect(connectToDatabase).toHaveBeenCalledOnce();
    expect(startSession).toHaveBeenCalledOnce();
    expect(transaction.withTransaction).toHaveBeenCalledOnce();
    expect(CategoryModel.findOne).toHaveBeenCalledWith(
      { _id: input.categoryId, isActive: true },
      { _id: 1 },
      { session: transaction },
    );
    expect(CampusLocationModel.findOne).toHaveBeenCalledWith(
      { _id: input.campusLocationId, isActive: true },
      { _id: 1 },
      { session: transaction },
    );
    expect(ItemReportModel.create).toHaveBeenCalledWith(
      [
        {
          reporterId: user.id,
          reportType: "lost",
          title: input.title,
          publicDescription: input.publicDescription,
          categoryId: input.categoryId,
          campusLocationId: input.campusLocationId,
          occurredAt: input.occurredAt,
          colors: input.colors,
          tags: input.tags,
          photoUrls: input.photoUrls,
          privacySettings: input.privacySettings,
          status: "open",
          resolvedAt: null,
        },
      ],
      { session: transaction },
    );
    expect(PrivateVerificationDetailsModel.create).toHaveBeenCalledWith(
      [
        {
          reportId: "report-id",
          ...input.privateVerification,
        },
      ],
      { session: transaction },
    );
    expect(toOwnerReport).toHaveBeenCalledWith(reportDocument);
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it.each([
    ["staff role", { ...user, role: "staff" as const }],
    ["administrator role", { ...user, role: "administrator" as const }],
    ["inactive status", { ...user, status: "suspended" as const }],
  ])("rejects %s before connecting to the database", async (_case, account) => {
    await expect(createReport(account, input)).rejects.toMatchObject({
      code: "REPORT_CREATION_FORBIDDEN",
      status: 403,
    });

    expect(connectToDatabase).not.toHaveBeenCalled();
    expect(ItemReportModel.create).not.toHaveBeenCalled();
  });

  it("rejects a missing or inactive category without creating records", async () => {
    vi.mocked(CategoryModel.findOne).mockResolvedValue(null);

    await expect(createReport(user, input)).rejects.toMatchObject({
      code: "CATEGORY_UNAVAILABLE",
      status: 422,
    });

    expect(CampusLocationModel.findOne).not.toHaveBeenCalled();
    expect(ItemReportModel.create).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("rejects a missing or inactive campus location", async () => {
    vi.mocked(CampusLocationModel.findOne).mockResolvedValue(null);

    await expect(createReport(user, input)).rejects.toMatchObject({
      code: "CAMPUS_LOCATION_UNAVAILABLE",
      status: 422,
    });

    expect(ItemReportModel.create).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("preserves a public-report persistence failure and ends the session", async () => {
    const failure = new Error("public insert failed");
    vi.mocked(ItemReportModel.create).mockRejectedValue(failure);

    await expect(createReport(user, input)).rejects.toBe(failure);

    expect(PrivateVerificationDetailsModel.create).not.toHaveBeenCalled();
    expect(toOwnerReport).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("preserves a private persistence failure and ends the session", async () => {
    const failure = new Error("private insert failed");
    vi.mocked(PrivateVerificationDetailsModel.create).mockRejectedValue(failure);

    await expect(createReport(user, input)).rejects.toBe(failure);

    expect(toOwnerReport).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });
});
