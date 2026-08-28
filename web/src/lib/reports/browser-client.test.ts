import { afterEach, describe, expect, it, vi } from "vitest";

import type { CreateReportInput } from "./validation";

import {
  BrowserReportError,
  getReportById,
  getReportCampusLocations,
  getReportCategories,
  getReportMatches,
  getReports,
  getOwnReports,
  submitReport,
  uploadReportImage,
  type MemberReport,
  type OwnerReportHistoryPage,
  type ReportMatches,
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

const internalPhotoPath =
  "/api/report-images/64f0123456789abcdef01234";

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
  moderationStatus: "visible",
  privacySettings: {
    showPhoto: true,
    showEventDate: true,
    showCampusLocation: true,
  },
  resolvedAt: null,
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
} as const;

const ownerReport = {
  ...report,
  colors: [...report.colors],
  tags: [...report.tags],
  photoUrls: [internalPhotoPath, "https://example.com/legacy.jpg"],
  status: "draft" as const,
  moderationStatus: "hidden" as const,
  privacySettings: {
    showPhoto: false,
    showEventDate: false,
    showCampusLocation: false,
  },
};

const ownerPage = {
  reports: [ownerReport],
  pagination: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
} satisfies OwnerReportHistoryPage;

const memberReport = {
  id: "64b64c6f2f4d9f1a2b3c4d54",
  reportType: "lost",
  title: "Black laptop bag",
  publicDescription: "Black laptop bag with a shoulder strap.",
  categoryId: "64b64c6f2f4d9f1a2b3c4d52",
  campusLocationId: null,
  occurredAt: null,
  colors: ["black"],
  tags: ["laptop", "bag"],
  photoUrls: ["https://example.com/laptop-bag.jpg"],
  status: "open",
  moderationStatus: "visible",
  resolvedAt: null,
  createdAt: "2026-08-15T02:05:00.000Z",
  updatedAt: "2026-08-15T02:05:00.000Z",
  isOwner: false,
} satisfies MemberReport;

const reportMatches = {
  sourceReportId: memberReport.id,
  matches: [
    {
      report: {
        ...memberReport,
        id: "64b64c6f2f4d9f1a2b3c4d55",
        reportType: "found",
        title: "Black laptop charger",
        publicDescription: "Found beside the library desk.",
      },
      score: 100,
      factors: [
        {
          key: "category",
          points: 25,
          maximum: 25,
          explanation: "Same category",
        },
        {
          key: "location",
          points: 15,
          maximum: 15,
          explanation: "Same public campus location",
        },
        {
          key: "date",
          points: 15,
          maximum: 15,
          explanation: "Reports occurred on the same day",
        },
        {
          key: "colors",
          points: 15,
          maximum: 15,
          explanation: "Shared colours: black",
        },
        {
          key: "tags",
          points: 10,
          maximum: 10,
          explanation: "Shared tags: laptop, charger",
        },
        {
          key: "text",
          points: 20,
          maximum: 20,
          explanation: "Similar report wording",
        },
      ],
    },
  ],
} satisfies ReportMatches;

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
  it("loads strict owner history with same-origin credentials and abort support", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(Response.json(ownerPage));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getOwnReports(
        { reportType: "found", status: "closed", page: 2 },
        controller.signal,
      ),
    ).resolves.toEqual(ownerPage);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reports/mine?reportType=found&status=closed&page=2",
      {
        method: "GET",
        signal: controller.signal,
        credentials: "same-origin",
      },
    );
  });

  it("omits empty owner history query values and page one", async () => {
    const emptyPage = {
      reports: [],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(emptyPage));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getOwnReports({ page: 1 })).resolves.toEqual(emptyPage);
    expect(fetchMock).toHaveBeenCalledWith("/api/reports/mine", {
      method: "GET",
      signal: undefined,
      credentials: "same-origin",
    });
  });

  it.each([
    ["unknown top-level key", { ...ownerPage, internalVersion: 1 }],
    [
      "private verification field",
      {
        ...ownerPage,
        reports: [{ ...ownerReport, expectedAnswer: "private answer" }],
      },
    ],
    [
      "invalid photo reference",
      {
        ...ownerPage,
        reports: [{ ...ownerReport, photoUrls: ["javascript:alert(1)"] }],
      },
    ],
    [
      "invalid timestamp",
      {
        ...ownerPage,
        reports: [{ ...ownerReport, createdAt: "not-a-date" }],
      },
    ],
    [
      "unknown report status",
      {
        ...ownerPage,
        reports: [{ ...ownerReport, status: "archived" }],
      },
    ],
    [
      "wrong page size",
      { ...ownerPage, pagination: { ...ownerPage.pagination, pageSize: 12 } },
    ],
    [
      "inconsistent total pages",
      { ...ownerPage, pagination: { ...ownerPage.pagination, totalPages: 3 } },
    ],
    [
      "more than ten reports",
      { ...ownerPage, reports: Array.from({ length: 11 }, () => ownerReport) },
    ],
    [
      "reports when total is zero",
      {
        ...ownerPage,
        pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      },
    ],
  ])("rejects owner history containing %s", async (_case, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));

    await expect(getOwnReports({ page: 2 })).rejects.toMatchObject({
      code: "REQUEST_FAILED",
      status: 200,
    });
  });

  it("preserves a safe owner history API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid report query",
              fields: { page: ["Invalid input"] },
            },
          },
          { status: 400 },
        ),
      ),
    );

    await expect(getOwnReports({ page: 2 })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
      message: "Invalid report query",
      fields: { page: ["Invalid input"] },
    });
  });

  it.each([200, 201])(
    "uploads a report image with a strict receipt for status %s",
    async (status) => {
      const image = {
        url: internalPhotoPath,
        contentType: "image/jpeg" as const,
        byteLength: 4,
      };
      const fetchMock = vi.fn().mockResolvedValue(
        Response.json({ image }, { status }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const file = new File([Uint8Array.from([0xff, 0xd8, 0xff, 0x01])], "private.jpg", {
        type: "image/jpeg",
      });
      const uploadKey = "550e8400-e29b-41d4-a716-446655440000";

      await expect(
        uploadReportImage("report/id", file, uploadKey),
      ).resolves.toEqual(image);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(path).toBe("/api/reports/report%2Fid/images");
      expect(init).toMatchObject({ method: "POST", credentials: "same-origin" });
      expect(init.headers).toBeUndefined();
      expect(init.body).toBeInstanceOf(FormData);
      const form = init.body as FormData;
      expect([...form.keys()]).toEqual(["image", "uploadKey"]);
      expect(form.get("image")).toBe(file);
      expect(form.get("uploadKey")).toBe(uploadKey);
    },
  );

  it.each([
    ["extra success key", { image: { url: internalPhotoPath, contentType: "image/jpeg", byteLength: 4, privateId: "secret" } }],
    ["external receipt URL", { image: { url: "https://example.test/image.jpg", contentType: "image/jpeg", byteLength: 4 } }],
    ["unsupported MIME", { image: { url: internalPhotoPath, contentType: "image/gif", byteLength: 4 } }],
    ["invalid byte length", { image: { url: internalPhotoPath, contentType: "image/jpeg", byteLength: 0 } }],
  ])("rejects an upload response with %s", async (_label, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    await expect(
      uploadReportImage(
        report.id,
        new File([Uint8Array.from([0xff])], "x.jpg", { type: "image/jpeg" }),
        "550e8400-e29b-41d4-a716-446655440000",
      ),
    ).rejects.toMatchObject({ code: "REQUEST_FAILED", status: 200 });
  });

  it("preserves safe upload errors and closes network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        Response.json(
          { error: { code: "IMAGE_TOO_LARGE", message: "Image is too large" } },
          { status: 413 },
        ),
      ).mockRejectedValueOnce(new Error("private network detail")),
    );
    const file = new File([Uint8Array.from([0xff])], "x.jpg", { type: "image/jpeg" });

    await expect(uploadReportImage(report.id, file, "key")).rejects.toMatchObject({
      code: "IMAGE_TOO_LARGE",
      status: 413,
    });
    await expect(uploadReportImage(report.id, file, "key")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      status: 0,
    });
  });

  it("loads a canonical member report page with same-origin credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        reports: [memberReport],
        pagination: { page: 2, pageSize: 12, total: 13, totalPages: 2 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getReports({
        q: "laptop bag",
        reportType: "lost",
        status: "open",
        hasPhoto: false,
        page: 2,
      }),
    ).resolves.toEqual({
      reports: [memberReport],
      pagination: { page: 2, pageSize: 12, total: 13, totalPages: 2 },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reports?q=laptop+bag&reportType=lost&status=open&hasPhoto=false&page=2",
      { method: "GET", credentials: "same-origin" },
    );
  });

  it("encodes the report id before loading detail", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ report: memberReport }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getReportById("id/with spaces")).resolves.toEqual(
      memberReport,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reports/id%2Fwith%20spaces",
      { method: "GET", credentials: "same-origin" },
    );
  });

  it("accepts internal photo references at both browser response boundaries", async () => {
    const internalMemberReport = {
      ...memberReport,
      photoUrls: [internalPhotoPath],
    };
    const internalCreatedReport = {
      ...report,
      photoUrls: [internalPhotoPath],
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ report: internalMemberReport }))
        .mockResolvedValueOnce(
          Response.json({ report: internalCreatedReport }, { status: 201 }),
        ),
    );

    await expect(getReportById(memberReport.id)).resolves.toEqual(
      internalMemberReport,
    );
    await expect(submitReport(input)).resolves.toEqual(internalCreatedReport);
  });

  it.each([
    [
      "missing moderation state",
      () => getReportById(memberReport.id),
      (() => {
        const withoutModeration: Record<string, unknown> = {
          ...memberReport,
        };
        delete withoutModeration.moderationStatus;
        return { report: withoutModeration };
      })(),
    ],
    [
      "unknown moderation state",
      () => getReportById(memberReport.id),
      { report: { ...memberReport, moderationStatus: "removed" } },
    ],
    [
      "moderation evidence",
      () => getReportById(memberReport.id),
      {
        report: {
          ...memberReport,
          flag: true,
          reason: "private",
          note: "private",
        },
      },
    ],
    [
      "list reporterId",
      () => getReports({}),
      {
        reports: [{ ...memberReport, reporterId: "private-user-id" }],
        pagination: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
      },
    ],
    [
      "detail privacySettings",
      () => getReportById(memberReport.id),
      { report: { ...memberReport, privacySettings: { showPhoto: true } } },
    ],
    [
      "detail serialNumber",
      () => getReportById(memberReport.id),
      { report: { ...memberReport, serialNumber: "private-serial" } },
    ],
    [
      "malformed dates",
      () => getReportById(memberReport.id),
      { report: { ...memberReport, createdAt: "not-a-date" } },
    ],
    [
      "unknown pagination fields",
      () => getReports({}),
      {
        reports: [memberReport],
        pagination: {
          page: 1,
          pageSize: 12,
          total: 1,
          totalPages: 1,
          cursor: "private-cursor",
        },
      },
    ],
    [
      "non-integer page",
      () => getReports({}),
      {
        reports: [memberReport],
        pagination: { page: 1.5, pageSize: 12, total: 1, totalPages: 1 },
      },
    ],
  ])("rejects member responses containing %s", async (_name, request, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));

    await expect(request()).rejects.toEqual(
      expect.objectContaining<Partial<BrowserReportError>>({
        code: "REQUEST_FAILED",
        status: 200,
        message: "We could not complete that request. Please try again.",
      }),
    );
  });

  it.each([
    [
      "missing report moderation state",
      () => submitReport(input),
      (() => {
        const withoutModeration: Record<string, unknown> = { ...report };
        delete withoutModeration.moderationStatus;
        return { report: withoutModeration };
      })(),
    ],
    [
      "unknown report moderation state",
      () => submitReport(input),
      { report: { ...report, moderationStatus: "removed" } },
    ],
    [
      "created report insecure HTTP URL",
      () => submitReport(input),
      {
        report: {
          ...report,
          photoUrls: ["http://example.com/private.jpg"],
        },
      },
    ],
    [
      "created report javascript URL",
      () => submitReport(input),
      {
        report: {
          ...report,
          photoUrls: ["javascript:alert(1)"],
        },
      },
    ],
    [
      "list malformed URL",
      () => getReports({}),
      {
        reports: [{ ...memberReport, photoUrls: ["not a URL"] }],
        pagination: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
      },
    ],
    [
      "list javascript URL",
      () => getReports({}),
      {
        reports: [
          { ...memberReport, photoUrls: ["javascript:alert(1)"] },
        ],
        pagination: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
      },
    ],
    [
      "detail insecure HTTP URL",
      () => getReportById(memberReport.id),
      {
        report: {
          ...memberReport,
          photoUrls: ["http://example.com/private.jpg"],
        },
      },
    ],
    [
      "detail data URL",
      () => getReportById(memberReport.id),
      {
        report: {
          ...memberReport,
          photoUrls: ["data:image/svg+xml,<svg></svg>"],
        },
      },
    ],
  ])("rejects malformed successful responses containing %s", async (_name, request, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));

    await expect(request()).rejects.toEqual(
      expect.objectContaining<Partial<BrowserReportError>>({
        code: "REQUEST_FAILED",
        status: 200,
      }),
    );
  });

  it.each([
    ["AUTHENTICATION_REQUIRED", 401, () => getReports({})],
    ["ACCOUNT_UNAVAILABLE", 403, () => getReports({})],
    ["REPORT_NOT_FOUND", 404, () => getReportById(memberReport.id)],
    ["REPORT_BROWSE_FAILED", 500, () => getReports({})],
  ])(
    "preserves public %s errors without leaking raw response details",
    async (code, status, request) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          Response.json(
            { error: { code, message: `Public ${status} message` } },
            { status },
          ),
        ),
      );

      const error = await request().catch((reason: unknown) => reason);
      expect(error).toEqual(
        expect.objectContaining<Partial<BrowserReportError>>({
          code,
          status,
          message: `Public ${status} message`,
        }),
      );
      expect(String(error)).not.toContain("private");
    },
  );

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

  it("loads strict matching results from an encoded report path", async () => {
    const encodedReportMatches = {
      ...reportMatches,
      sourceReportId: "source/report id",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json(encodedReportMatches));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getReportMatches("source/report id")).resolves.toEqual(
      encodedReportMatches,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reports/source%2Freport%20id/matches",
      { method: "GET", credentials: "same-origin" },
    );
  });

  it.each([
    [
      "score below the backend threshold",
      {
        ...reportMatches,
        matches: [{ ...reportMatches.matches[0], score: 34 }],
      },
    ],
    [
      "score above the fixed maximum",
      {
        ...reportMatches,
        matches: [{ ...reportMatches.matches[0], score: 101 }],
      },
    ],
    [
      "zero factor points",
      {
        ...reportMatches,
        matches: [
          {
            ...reportMatches.matches[0],
            score: 75,
            factors: [
              ...reportMatches.matches[0].factors.slice(0, 5),
              { ...reportMatches.matches[0].factors[5], points: 0 },
            ],
          },
        ],
      },
    ],
    [
      "incorrect factor maximum",
      {
        ...reportMatches,
        matches: [
          {
            ...reportMatches.matches[0],
            factors: [
              { ...reportMatches.matches[0].factors[0], maximum: 24 },
              ...reportMatches.matches[0].factors.slice(1),
            ],
          },
        ],
      },
    ],
    [
      "factor points above maximum",
      {
        ...reportMatches,
        matches: [
          {
            ...reportMatches.matches[0],
            score: 100,
            factors: [
              { ...reportMatches.matches[0].factors[0], points: 26 },
              { ...reportMatches.matches[0].factors[1], points: 14 },
              ...reportMatches.matches[0].factors.slice(2),
            ],
          },
        ],
      },
    ],
    [
      "duplicate factor keys",
      {
        ...reportMatches,
        matches: [
          {
            ...reportMatches.matches[0],
            factors: [
              reportMatches.matches[0].factors[0],
              { ...reportMatches.matches[0].factors[1], key: "category" },
              ...reportMatches.matches[0].factors.slice(2),
            ],
          },
        ],
      },
    ],
    [
      "factor sum different from score",
      {
        ...reportMatches,
        matches: [{ ...reportMatches.matches[0], score: 99 }],
      },
    ],
    [
      "duplicate candidate reports",
      {
        ...reportMatches,
        matches: [reportMatches.matches[0], reportMatches.matches[0]],
      },
    ],
    [
      "more than five candidates",
      {
        ...reportMatches,
        matches: Array.from({ length: 6 }, (_, index) => ({
          ...reportMatches.matches[0],
          report: {
            ...reportMatches.matches[0].report,
            id: `candidate-${index}`,
          },
        })),
      },
    ],
    [
      "private reporter identity",
      {
        ...reportMatches,
        matches: [
          {
            ...reportMatches.matches[0],
            report: {
              ...reportMatches.matches[0].report,
              reporterId: "private-user-id",
            },
          },
        ],
      },
    ],
    [
      "private verification evidence",
      {
        ...reportMatches,
        matches: [
          {
            ...reportMatches.matches[0],
            expectedAnswer: "private answer",
          },
        ],
      },
    ],
    [
      "unknown top-level field",
      { ...reportMatches, internalVersion: 1 },
    ],
  ])("rejects matching responses containing %s", async (_case, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));

    await expect(getReportMatches(memberReport.id)).rejects.toEqual(
      expect.objectContaining<Partial<BrowserReportError>>({
        code: "REQUEST_FAILED",
        status: 200,
        message: "We could not complete that request. Please try again.",
      }),
    );
  });

  it("preserves a safe matching API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: "REPORT_NOT_MATCHABLE",
              message: "Report is not available for matching",
            },
          },
          { status: 409 },
        ),
      ),
    );

    await expect(getReportMatches(memberReport.id)).rejects.toEqual(
      expect.objectContaining<Partial<BrowserReportError>>({
        code: "REPORT_NOT_MATCHABLE",
        status: 409,
        message: "Report is not available for matching",
      }),
    );
  });

  it("rejects matching results for a different source report", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          ...reportMatches,
          sourceReportId: "different-report-id",
        }),
      ),
    );

    await expect(getReportMatches(memberReport.id)).rejects.toEqual(
      expect.objectContaining<Partial<BrowserReportError>>({
        code: "REQUEST_FAILED",
        status: 200,
        message: "We could not complete that request. Please try again.",
      }),
    );
  });
});
