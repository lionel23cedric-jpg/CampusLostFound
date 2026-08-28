import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import { toMemberReport, toOwnerReport } from "./public-report";

const report = {
  _id: new mongoose.Types.ObjectId("64b64c6f2f4d9f1a2b3c4d50"),
  reporterId: new mongoose.Types.ObjectId("64b64c6f2f4d9f1a2b3c4d51"),
  reportType: "lost",
  title: "Black laptop bag",
  publicDescription: "Black laptop bag with a shoulder strap.",
  categoryId: new mongoose.Types.ObjectId("64b64c6f2f4d9f1a2b3c4d52"),
  campusLocationId: new mongoose.Types.ObjectId(
    "64b64c6f2f4d9f1a2b3c4d53",
  ),
  occurredAt: new Date("2026-08-14T02:00:00.000Z"),
  colors: ["Black"],
  tags: ["laptop", "bag"],
  photoUrls: ["https://images.example/item.jpg"],
  status: "open",
  moderationStatus: "visible",
  privacySettings: {
    showPhoto: true,
    showEventDate: true,
    showCampusLocation: true,
  },
  resolvedAt: null,
  createdAt: new Date("2026-08-15T02:05:00.000Z"),
  updatedAt: new Date("2026-08-15T02:05:00.000Z"),
};

describe("owner report response", () => {
  it("converts IDs and dates and returns only approved report fields", () => {
    expect(
      toOwnerReport({
        ...report,
        privacySettings: {
          ...report.privacySettings,
          showEventDate: false,
        },
      } as never),
    ).toEqual({
      id: "64b64c6f2f4d9f1a2b3c4d50",
      reporterId: "64b64c6f2f4d9f1a2b3c4d51",
      reportType: "lost",
      title: "Black laptop bag",
      publicDescription: "Black laptop bag with a shoulder strap.",
      categoryId: "64b64c6f2f4d9f1a2b3c4d52",
      campusLocationId: "64b64c6f2f4d9f1a2b3c4d53",
      occurredAt: "2026-08-14T02:00:00.000Z",
      colors: ["Black"],
      tags: ["laptop", "bag"],
      photoUrls: ["https://images.example/item.jpg"],
      status: "open",
      moderationStatus: "visible",
      privacySettings: {
        showPhoto: true,
        showEventDate: false,
        showCampusLocation: true,
      },
      resolvedAt: null,
      createdAt: "2026-08-15T02:05:00.000Z",
      updatedAt: "2026-08-15T02:05:00.000Z",
    });
  });

  it("cannot expose private verification or authentication credentials", () => {
    const source = {
      _id: { toString: () => "report-id" },
      reporterId: { toString: () => "user-id" },
      categoryId: { toString: () => "category-id" },
      campusLocationId: { toString: () => "location-id" },
      reportType: "found",
      title: "Found student card",
      publicDescription: "A student card was found near the library.",
      occurredAt: new Date("2026-08-14T02:00:00.000Z"),
      colors: ["white"],
      tags: [],
      photoUrls: [],
      status: "open",
      moderationStatus: "visible",
      privacySettings: {
        showPhoto: true,
        showEventDate: true,
        showCampusLocation: true,
      },
      resolvedAt: null,
      createdAt: new Date("2026-08-15T02:05:00.000Z"),
      updatedAt: new Date("2026-08-15T02:05:00.000Z"),
      distinguishingFeatures: ["secret"],
      expectedAnswer: "secret answer",
      passwordHash: "secret hash",
      tokenHash: "secret token hash",
    };

    expect(JSON.stringify(toOwnerReport(source as never))).not.toMatch(
      /distinguishingFeatures|expectedAnswer|passwordHash|tokenHash|secret/,
    );
  });
});

describe("member report response", () => {
  it("applies member privacy and exposes only ownership, not reporter ID", () => {
    const result = toMemberReport(
      {
        ...report,
        privacySettings: {
          showPhoto: false,
          showEventDate: false,
          showCampusLocation: false,
        },
      } as never,
      "64b64c6f2f4d9f1a2b3c4d51",
    );

    expect(result).toEqual({
      id: "64b64c6f2f4d9f1a2b3c4d50",
      reportType: "lost",
      title: "Black laptop bag",
      publicDescription: "Black laptop bag with a shoulder strap.",
      categoryId: "64b64c6f2f4d9f1a2b3c4d52",
      campusLocationId: null,
      occurredAt: null,
      colors: ["Black"],
      tags: ["laptop", "bag"],
      photoUrls: [],
      status: "open",
      moderationStatus: "visible",
      resolvedAt: null,
      createdAt: "2026-08-15T02:05:00.000Z",
      updatedAt: "2026-08-15T02:05:00.000Z",
      isOwner: true,
    });
    expect(result).not.toHaveProperty("reporterId");
    expect(result).not.toHaveProperty("privacySettings");
  });

  it.each([
    ["photo", { showPhoto: false }, "photoUrls", []],
    ["event date", { showEventDate: false }, "occurredAt", null],
    [
      "campus location",
      { showCampusLocation: false },
      "campusLocationId",
      null,
    ],
  ])("hides %s independently", (_label, privacy, field, hiddenValue) => {
    const result = toMemberReport(
      {
        ...report,
        privacySettings: { ...report.privacySettings, ...privacy },
      } as never,
      "64b64c6f2f4d9f1a2b3c4d99",
    );

    expect(result[field as keyof typeof result]).toEqual(hiddenValue);
    expect(result.isOwner).toBe(false);
  });

  it("returns all visible fields, a resolved date and cloned arrays", () => {
    const result = toMemberReport(
      {
        ...report,
        resolvedAt: new Date("2026-08-15T03:00:00.000Z"),
      } as never,
      "64b64c6f2f4d9f1a2b3c4d99",
    );

    expect(result).toMatchObject({
      campusLocationId: "64b64c6f2f4d9f1a2b3c4d53",
      occurredAt: "2026-08-14T02:00:00.000Z",
      photoUrls: ["https://images.example/item.jpg"],
      resolvedAt: "2026-08-15T03:00:00.000Z",
      isOwner: false,
    });
    expect(result.colors).not.toBe(report.colors);
    expect(result.tags).not.toBe(report.tags);
    expect(result.photoUrls).not.toBe(report.photoUrls);
  });

  it("cannot expose private verification or authentication-shaped properties", () => {
    const result = toMemberReport(
      {
        ...report,
        serialNumber: "secret serial",
        exactLocationDetails: "secret location",
        expectedAnswer: "secret answer",
        privateNotes: "secret notes",
        passwordHash: "secret password hash",
        tokenHash: "secret token hash",
      } as never,
      "64b64c6f2f4d9f1a2b3c4d99",
    );

    expect(JSON.stringify(result)).not.toMatch(
      /reporterId|privacySettings|serialNumber|exactLocationDetails|expectedAnswer|privateNotes|passwordHash|tokenHash|secret/,
    );
  });

  it("normalizes legacy reports and exposes only moderation state", () => {
    const owner = toOwnerReport({
      ...report,
      moderationStatus: undefined,
    } as never);
    const member = toMemberReport(
      { ...report, moderationStatus: "hidden" } as never,
      report.reporterId.toString(),
    );

    expect(owner.moderationStatus).toBe("visible");
    expect(member.moderationStatus).toBe("hidden");
    expect(JSON.stringify(member)).not.toMatch(
      /flag|reason|note|administrator|submittedByUserId/,
    );
  });

  it("fails closed for an unknown stored moderation value", () => {
    expect(() =>
      toMemberReport(
        { ...report, moderationStatus: "removed" } as never,
        "viewer-id",
      ),
    ).toThrow("Report moderation status is invalid");
  });
});
