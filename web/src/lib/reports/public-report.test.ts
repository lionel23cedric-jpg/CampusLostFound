import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import { toOwnerReport } from "./public-report";

describe("owner report response", () => {
  it("converts IDs and dates and returns only approved report fields", () => {
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
      privacySettings: {
        showPhoto: true,
        showEventDate: false,
        showCampusLocation: true,
      },
      resolvedAt: null,
      createdAt: new Date("2026-08-15T02:05:00.000Z"),
      updatedAt: new Date("2026-08-15T02:05:00.000Z"),
    };

    expect(toOwnerReport(report as never)).toEqual({
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
