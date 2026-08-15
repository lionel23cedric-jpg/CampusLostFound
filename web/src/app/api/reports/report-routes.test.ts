import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/reports/reference-data", () => ({
  listActiveCategories: vi.fn(),
  listActiveCampusLocations: vi.fn(),
}));
vi.mock("@/lib/reports/service", () => ({ createReport: vi.fn() }));

import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ReportError } from "@/lib/reports/errors";
import {
  listActiveCampusLocations,
  listActiveCategories,
} from "@/lib/reports/reference-data";
import { createReport } from "@/lib/reports/service";

import { GET as campusLocationsGet } from "../campus-locations/route";
import { GET as categoriesGet } from "../categories/route";
import { POST as reportsPost } from "./route";

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

const validBody = {
  reportType: "lost",
  title: "Black laptop bag",
  publicDescription: "Black laptop bag with a shoulder strap.",
  categoryId: "64b64c6f2f4d9f1a2b3c4d52",
  campusLocationId: "64b64c6f2f4d9f1a2b3c4d53",
  occurredAt: "2026-08-14T02:00:00.000Z",
  colors: ["Black"],
  tags: ["Laptop"],
  photoUrls: [],
  privateVerification: {
    distinguishingFeatures: ["Small scratch beneath the handle"],
    exactLocationDetails: "Second-floor study area",
    serialNumber: "PRIVATE-SERIAL-123",
    verificationQuestions: [
      {
        question: "What is attached to the zipper?",
        expectedAnswer: "A blue tag",
      },
    ],
    privateNotes: "Private evidence",
  },
};

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function malformedRequest() {
  return new Request("http://localhost/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
}

function expectNoSecrets(value: unknown) {
  expect(JSON.stringify(value)).not.toMatch(
    /expectedAnswer|exactLocationDetails|privateNotes|PRIVATE-SERIAL-123|tokenHash|passwordHash|raw-session-token/,
  );
}

describe("report routes", () => {
  beforeEach(() => {
    vi.mocked(readSessionCookie).mockReset();
    vi.mocked(getCurrentUser).mockReset();
    vi.mocked(listActiveCategories).mockReset();
    vi.mocked(listActiveCampusLocations).mockReset();
    vi.mocked(createReport).mockReset();

    vi.mocked(readSessionCookie).mockResolvedValue("raw-session-token");
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(listActiveCategories).mockResolvedValue([
      { id: "category-id", name: "Electronics", description: null },
    ]);
    vi.mocked(listActiveCampusLocations).mockResolvedValue([
      {
        id: "location-id",
        campusName: "Auckland",
        locationName: "Library",
        description: null,
      },
    ]);
  });

  it("returns authenticated active categories and campus locations", async () => {
    const categoryResponse = await categoriesGet();
    const locationResponse = await campusLocationsGet();

    expect(categoryResponse.status).toBe(200);
    await expect(categoryResponse.json()).resolves.toEqual({
      categories: [
        { id: "category-id", name: "Electronics", description: null },
      ],
    });
    expect(locationResponse.status).toBe(200);
    await expect(locationResponse.json()).resolves.toEqual({
      campusLocations: [
        {
          id: "location-id",
          campusName: "Auckland",
          locationName: "Library",
          description: null,
        },
      ],
    });
    expect(getCurrentUser).toHaveBeenNthCalledWith(1, "raw-session-token");
    expect(getCurrentUser).toHaveBeenNthCalledWith(2, "raw-session-token");
  });

  it("allows another active account role to load reference data", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...user, role: "staff" });

    const categoryResponse = await categoriesGet();
    const locationResponse = await campusLocationsGet();

    expect(categoryResponse.status).toBe(200);
    expect(locationResponse.status).toBe(200);
  });

  it.each([
    ["categories", categoriesGet],
    ["campus locations", campusLocationsGet],
  ])("requires authentication for %s", async (_name, handler) => {
    vi.mocked(readSessionCookie).mockResolvedValue(undefined);
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await handler();

    expect(getCurrentUser).toHaveBeenCalledWith(undefined);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Authentication required",
      },
    });
  });

  it.each([
    ["categories", categoriesGet, listActiveCategories],
    ["campus locations", campusLocationsGet, listActiveCampusLocations],
  ])("hides unknown %s data failures", async (_name, handler, loader) => {
    vi.mocked(loader).mockRejectedValue(new Error("mongodb details"));

    const response = await handler();

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: "REFERENCE_DATA_FAILED",
        message: "Unable to load reference data",
      },
    });
    expect(JSON.stringify(body)).not.toContain("mongodb details");
  });

  it.each([
    ["cookie", readSessionCookie, categoriesGet],
    ["current user", getCurrentUser, campusLocationsGet],
  ])(
    "hides unknown %s failures on reference routes",
    async (_name, dependency, handler) => {
      vi.mocked(dependency).mockRejectedValue(
        new Error("internal auth detail"),
      );

      const response = await handler();

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({
        error: {
          code: "REFERENCE_DATA_FAILED",
          message: "Unable to load reference data",
        },
      });
      expect(JSON.stringify(body)).not.toContain("internal auth detail");
    },
  );

  it("creates a report and returns only the owner-safe response", async () => {
    const ownerReport = {
      id: "report-id",
      reporterId: user.id,
      reportType: "lost",
      title: "Black laptop bag",
      publicDescription: "Black laptop bag with a shoulder strap.",
      categoryId: validBody.categoryId,
      campusLocationId: validBody.campusLocationId,
      occurredAt: "2026-08-14T02:00:00.000Z",
      colors: ["Black"],
      tags: ["laptop"],
      photoUrls: [],
      status: "open",
      privacySettings: {
        showPhoto: true,
        showEventDate: true,
        showCampusLocation: true,
      },
      resolvedAt: null,
      createdAt: "2026-08-15T02:05:00.000Z",
      updatedAt: "2026-08-15T02:05:00.000Z",
    } as never;
    vi.mocked(createReport).mockResolvedValue(ownerReport);

    const response = await reportsPost(jsonRequest(validBody));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(readSessionCookie).toHaveBeenCalledOnce();
    expect(getCurrentUser).toHaveBeenCalledWith("raw-session-token");
    expect(createReport).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        reportType: "lost",
        occurredAt: new Date("2026-08-14T02:00:00.000Z"),
        tags: ["laptop"],
      }),
    );
    const submittedInput = vi.mocked(createReport).mock.calls[0]?.[1];
    expect(submittedInput).not.toHaveProperty("reporterId");
    expect(submittedInput).not.toHaveProperty("status");
    expect(submittedInput).not.toHaveProperty("resolvedAt");
    expect(body).toEqual({ report: ownerReport });
    expectNoSecrets(body);
  });

  it("authenticates before parsing the report body", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await reportsPost(malformedRequest());

    expect(response.status).toBe(401);
    expect(createReport).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Authentication required",
      },
    });
  });

  it.each([
    ["cookie", readSessionCookie],
    ["current user", getCurrentUser],
  ])("hides unknown %s failures before parsing", async (_name, dependency) => {
    vi.mocked(dependency).mockRejectedValue(new Error("internal auth detail"));

    const response = await reportsPost(malformedRequest());

    expect(response.status).toBe(500);
    expect(createReport).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: "REPORT_CREATION_FAILED",
        message: "Unable to create report",
      },
    });
    expect(JSON.stringify(body)).not.toContain("internal auth detail");
  });

  it("returns the exact validation response for malformed JSON", async () => {
    const response = await reportsPost(malformedRequest());

    expect(response.status).toBe(400);
    expect(createReport).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid report",
      },
    });
  });

  it("returns field details for a schema validation failure", async () => {
    const response = await reportsPost(
      jsonRequest({ ...validBody, title: "x" }),
    );

    expect(response.status).toBe(400);
    expect(createReport).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid report",
        fields: { title: expect.any(Array) },
      },
    });
  });

  it("rejects server-owned input before calling the service", async () => {
    const response = await reportsPost(
      jsonRequest({ ...validBody, reporterId: user.id, status: "resolved" }),
    );

    expect(response.status).toBe(400);
    expect(createReport).not.toHaveBeenCalled();
  });

  it.each([
    [
      "REPORT_CREATION_FORBIDDEN",
      403,
      "Only active student accounts can create reports",
    ],
    ["CATEGORY_UNAVAILABLE", 422, "Category is unavailable"],
    [
      "CAMPUS_LOCATION_UNAVAILABLE",
      422,
      "Campus location is unavailable",
    ],
  ] as const)("maps %s exactly", async (code, status, message) => {
    vi.mocked(createReport).mockRejectedValue(new ReportError(code));

    const response = await reportsPost(jsonRequest(validBody));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({
      error: { code, message },
    });
  });

  it("does not misclassify an internal SyntaxError as invalid JSON", async () => {
    vi.mocked(createReport).mockRejectedValue(
      new SyntaxError("internal parser detail"),
    );

    const response = await reportsPost(jsonRequest(validBody));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: "REPORT_CREATION_FAILED",
        message: "Unable to create report",
      },
    });
    expect(JSON.stringify(body)).not.toContain("internal parser detail");
  });

  it("hides non-syntax request body failures", async () => {
    const request = {
      json: vi.fn().mockRejectedValue(new Error("request stream detail")),
    } as unknown as Request;

    const response = await reportsPost(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: "REPORT_CREATION_FAILED",
        message: "Unable to create report",
      },
    });
    expect(JSON.stringify(body)).not.toContain("request stream detail");
  });
});
