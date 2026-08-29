import { mongo, Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/item-report", () => ({ ItemReportModel: { findById: vi.fn() } }));
vi.mock("@/models/report-image", () => ({ ReportImageModel: { findById: vi.fn() } }));
vi.mock("@/models/user", () => ({ UserModel: { findById: vi.fn() } }));

import { connectToDatabase } from "@/lib/db";
import { ItemReportModel } from "@/models/item-report";
import { ReportImageModel } from "@/models/report-image";
import { UserModel } from "@/models/user";

import { readReportImage } from "./image-read-service";

const imageId = "64b64c6f2f4d9f1a2b3c4d51";
const reportId = new Types.ObjectId("64b64c6f2f4d9f1a2b3c4d52");
const ownerId = new Types.ObjectId("64b64c6f2f4d9f1a2b3c4d53");
const memberId = new Types.ObjectId("64b64c6f2f4d9f1a2b3c4d54");
const administratorId = new Types.ObjectId("64b64c6f2f4d9f1a2b3c4d55");
const data = Buffer.from([0xff, 0xd8, 0xff, 0x01]);

function query<T>(value: T) {
  const chain = {
    select: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn(async () => value),
  };
  chain.select.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  return chain;
}

function imageRecord() {
  return {
    reportId,
    uploadedByUserId: ownerId,
    contentType: "image/jpeg",
    byteLength: data.length,
    data,
  };
}

function reportRecord(overrides: Record<string, unknown> = {}) {
  return {
    reporterId: ownerId,
    status: "open",
    moderationStatus: "visible",
    privacySettings: { showPhoto: true },
    ...overrides,
  };
}

function configure(options: {
  actorId?: Types.ObjectId;
  role?: "student" | "staff" | "administrator";
  active?: boolean;
  image?: unknown;
  report?: unknown;
} = {}) {
  const actor = options.active === false
    ? null
    : {
        _id: options.actorId ?? memberId,
        role: options.role ?? "student",
        status: "active",
      };
  const userQuery = query(actor);
  const imageQuery = query(options.image === undefined ? imageRecord() : options.image);
  const reportQuery = query(options.report === undefined ? reportRecord() : options.report);
  vi.mocked(UserModel.findById).mockReturnValue(userQuery as never);
  vi.mocked(ReportImageModel.findById).mockReturnValue(imageQuery as never);
  vi.mocked(ItemReportModel.findById).mockReturnValue(reportQuery as never);
  return { userQuery, imageQuery, reportQuery };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(connectToDatabase).mockResolvedValue({} as never);
  configure();
});

describe("report image read service", () => {
  it("rejects a malformed image ID before database access", async () => {
    await expect(
      readReportImage({ imageId: "not-an-id", actorId: memberId.toString(), actorRole: "student" }),
    ).rejects.toMatchObject({ code: "REPORT_IMAGE_NOT_FOUND" });
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed actor", "not-an-id", "student"],
    ["inactive actor", memberId.toString(), "student"],
  ] as const)("rejects an %s", async (_label, actorId, actorRole) => {
    if (actorId !== "not-an-id") configure({ active: false });
    await expect(readReportImage({ imageId, actorId, actorRole })).rejects.toMatchObject({
      code: "ACCOUNT_UNAVAILABLE",
    });
  });

  it("re-authorises the stored role instead of trusting the caller", async () => {
    configure({ actorId: memberId, role: "staff" });
    await expect(
      readReportImage({ imageId, actorId: memberId.toString(), actorRole: "student" }),
    ).rejects.toMatchObject({ code: "ACCOUNT_UNAVAILABLE" });
    expect(ReportImageModel.findById).not.toHaveBeenCalled();
  });

  it.each([
    ["missing image", null, reportRecord()],
    ["missing report", imageRecord(), null],
  ])("closes a %s as not found", async (_label, image, report) => {
    configure({ image, report });
    await expect(
      readReportImage({ imageId, actorId: memberId.toString(), actorRole: "student" }),
    ).rejects.toMatchObject({ code: "REPORT_IMAGE_NOT_FOUND", status: 404 });
  });

  it.each([
    ["owner visible", ownerId, "student", reportRecord()],
    ["owner hidden", ownerId, "student", reportRecord({ moderationStatus: "hidden" })],
    ["administrator hidden", administratorId, "administrator", reportRecord({ moderationStatus: "hidden", privacySettings: { showPhoto: false } })],
    ["member visible", memberId, "student", reportRecord()],
    ["staff visible", memberId, "staff", reportRecord()],
  ] as const)("allows %s", async (_label, actorId, actorRole, report) => {
    const configured = configure({ actorId, role: actorRole, report });
    await expect(
      readReportImage({ imageId, actorId: actorId.toString(), actorRole }),
    ).resolves.toEqual({ contentType: "image/jpeg", byteLength: 4, data });
    expect(configured.imageQuery.select).toHaveBeenCalledWith(
      "reportId contentType byteLength +data +uploadedByUserId",
    );
    expect(ItemReportModel.findById).toHaveBeenCalledWith(reportId, {
      reporterId: 1,
      status: 1,
      moderationStatus: 1,
      "privacySettings.showPhoto": 1,
    });
  });

  it("reads BSON Binary bytes returned by a lean MongoDB query", async () => {
    configure({
      actorId: ownerId,
      image: {
        ...imageRecord(),
        data: new mongo.Binary(data),
      },
    });

    await expect(
      readReportImage({
        imageId,
        actorId: ownerId.toString(),
        actorRole: "student",
      }),
    ).resolves.toEqual({ contentType: "image/jpeg", byteLength: 4, data });
  });

  it.each([
    ["private photo", reportRecord({ privacySettings: { showPhoto: false } })],
    ["hidden report", reportRecord({ moderationStatus: "hidden" })],
    ["draft report", reportRecord({ status: "draft" })],
  ])("hides a %s from another member", async (_label, report) => {
    configure({ actorId: memberId, report });
    await expect(
      readReportImage({ imageId, actorId: memberId.toString(), actorRole: "student" }),
    ).rejects.toMatchObject({ code: "REPORT_IMAGE_NOT_FOUND", status: 404 });
  });

  it.each([
    ["unsupported content type", { contentType: "image/svg+xml" }],
    ["mismatched byte length", { byteLength: data.length + 1 }],
    ["missing bytes", { data: undefined }],
  ])("closes malformed stored image data: %s", async (_label, override) => {
    configure({ image: { ...imageRecord(), ...override } });
    await expect(
      readReportImage({ imageId, actorId: ownerId.toString(), actorRole: "student" }),
    ).rejects.toMatchObject({ code: "REPORT_IMAGE_NOT_FOUND", status: 404 });
  });
});
