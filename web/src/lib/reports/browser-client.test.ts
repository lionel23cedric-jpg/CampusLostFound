import { afterEach, describe, expect, it, vi } from "vitest";

import type { CreateReportInput } from "./validation";

import {
  BrowserReportError,
  getReportCampusLocations,
  getReportCategories,
  submitReport,
} from "./browser-client";

const category = {
  id: "507f1f77bcf86cd799439011",
  name: "Electronics",
  description: "Phones, laptops and chargers",
};

const campusLocation = {
  id: "507f191e810c19729de860ea",
  campusName: "Auckland",
  locationName: "Library",
  description: null,
};

const report = {
  id: "507f191e810c19729de860eb",
  reporterId: "507f191e810c19729de860ec",
  reportType: "lost",
  title: "Black laptop charger",
  publicDescription: "A black USB-C laptop charger in a small pouch.",
  categoryId: category.id,
  campusLocationId: campusLocation.id,
  occurredAt: "2026-08-14T23:30:00.000Z",
  colors: ["black"],
  tags: ["charger"],
  photoUrls: ["https://example.com/charger.jpg"],
  status: "open",
  privacySettings: {
    showPhoto: true,
    showEventDate: true,
    showCampusLocation: true,
  },
  resolvedAt: null,
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
} as const;

const input: CreateReportInput = {
  reportType: "lost",
  title: report.title,
  publicDescription: report.publicDescription,
  categoryId: category.id,
  campusLocationId: campusLocation.id,
  occurredAt: new Date(report.occurredAt),
  colors: ["black"],
  tags: ["charger"],
  photoUrls: ["https://example.com/charger.jpg"],
  privacySettings: report.privacySettings,
  privateVerification: {
    distinguishingFeatures: ["Small scratch beside the plug"],
    exactLocationDetails: "Second-floor silent study area",
    serialNumber: null,
    verificationQuestions: [
      { question: "What brand is it?", expectedAnswer: "Example" },
    ],
    privateNotes: null,
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("report browser client", () => {
  it("loads strict category values with same-origin credentials", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ categories: [category] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getReportCategories()).resolves.toEqual([category]);
    expect(fetchMock).toHaveBeenCalledWith("/api/categories", {
      method: "GET",
      credentials: "same-origin",
    });
  });

  it("loads strict campus-location values with same-origin credentials", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ campusLocations: [campusLocation] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getReportCampusLocations()).resolves.toEqual([
      campusLocation,
    ]);
    expect(fetchMock).toHaveBeenCalledWith("/api/campus-locations", {
      method: "GET",
      credentials: "same-origin",
    });
  });

  it("posts the exact validated report body and returns the created report", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ report }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitReport(input)).resolves.toEqual(report);
    expect(fetchMock).toHaveBeenCalledWith("/api/reports", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body)).occurredAt).toBe(
      "2026-08-14T23:30:00.000Z",
    );
  });

  it.each([
    [
      "unknown category fields",
      () => getReportCategories(),
      { categories: [{ ...category, isActive: true }] },
    ],
    [
      "unknown campus-location fields",
      () => getReportCampusLocations(),
      { campusLocations: [{ ...campusLocation, internalCode: "secret" }] },
    ],
    [
      "unknown report fields",
      () => submitReport(input),
      { report: { ...report, privateVerification: input.privateVerification } },
    ],
    [
      "malformed report dates",
      () => submitReport(input),
      { report: { ...report, occurredAt: "not-a-date" } },
    ],
  ])("hides successful responses with %s", async (_name, request, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));

    await expect(request()).rejects.toEqual(
      expect.objectContaining<Partial<BrowserReportError>>({
        code: "REQUEST_FAILED",
        message: "We could not complete that request. Please try again.",
      }),
    );
  });

  it("preserves an exact validated public API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid report",
              fields: { title: ["Title is too short"] },
            },
          },
          { status: 400 },
        ),
      ),
    );

    await expect(submitReport(input)).rejects.toEqual(
      expect.objectContaining<Partial<BrowserReportError>>({
        code: "VALIDATION_ERROR",
        status: 400,
        message: "Invalid report",
        fields: { title: ["Title is too short"] },
      }),
    );
  });

  it.each([
    ["non-JSON", new Response("database trace", { status: 500 })],
    [
      "malformed public",
      Response.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid report",
            fields: { title: "not-an-array" },
          },
        },
        { status: 400 },
      ),
    ],
  ])("replaces a %s error with a generic public failure", async (_name, response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(submitReport(input)).rejects.toEqual(
      expect.objectContaining<Partial<BrowserReportError>>({
        code: "REQUEST_FAILED",
        message: "We could not complete that request. Please try again.",
      }),
    );
  });

  it("hides rejected Fetch details behind a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("private network detail")),
    );

    await expect(getReportCategories()).rejects.toEqual(
      expect.objectContaining<Partial<BrowserReportError>>({
        code: "NETWORK_ERROR",
        status: 0,
        message: "We could not reach the service. Please try again.",
      }),
    );
  });
});
