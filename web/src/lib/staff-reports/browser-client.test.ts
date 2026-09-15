import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StaffReportBrowserError,
  getStaffReport,
  getStaffReports,
  storeStaffReport,
  verifyStaffReport,
  type StaffReportDetail,
  type StaffReportPage,
  type StaffReportSummary,
} from "./browser-client";

const reportId = "64f0123456789abcdef01234";
const summary = {
  id: reportId,
  reportType: "found",
  title: "Found campus card",
  photoUrls: ["/api/report-images/64f0123456789abcdef01239"],
  status: "open",
  moderationStatus: "visible",
  occurredAt: "2026-08-28T01:00:00.000Z",
  createdAt: "2026-08-28T02:00:00.000Z",
  updatedAt: "2026-08-29T03:00:00.000Z",
  handling: {
    verificationStatus: "pending",
    custodyStatus: "not_held",
    verifiedAt: null,
    storedAt: null,
    releasedAt: null,
  },
} satisfies StaffReportSummary;
const detail = {
  ...summary,
  publicDescription: "A campus card found near the library entrance.",
  categoryId: "64f0123456789abcdef01235",
  campusLocationId: "64f0123456789abcdef01236",
  colors: ["blue"],
  tags: ["card"],
  resolvedAt: null,
  handling: {
    ...summary.handling,
    verifiedBy: null,
    storageLocation: null,
    updatedBy: null,
  },
} satisfies StaffReportDetail;
const page = {
  reports: [summary],
  pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
} satisfies StaffReportPage;

afterEach(() => vi.unstubAllGlobals());

async function expectRequestFailed(work: () => Promise<unknown>, status = 200) {
  await expect(work()).rejects.toMatchObject({
    name: "StaffReportBrowserError",
    code: "REQUEST_FAILED",
    status,
  });
}

describe("staff report browser client", () => {
  it("loads the initial pending queue with the exact signal and credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(page));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await expect(
      getStaffReports({ verificationStatus: "pending" }, controller.signal),
    ).resolves.toEqual(page);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/staff/reports?verificationStatus=pending",
      { method: "GET", signal: controller.signal, credentials: "same-origin" },
    );
  });

  it("uses stable query ordering and omits page one", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(page));
    vi.stubGlobal("fetch", fetchMock);

    await getStaffReports({
      reportType: "found",
      reportStatus: "resolved",
      verificationStatus: "verified",
      custodyStatus: "stored",
      page: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/staff/reports?reportType=found&reportStatus=resolved&verificationStatus=verified&custodyStatus=stored",
      { method: "GET", signal: undefined, credentials: "same-origin" },
    );
  });

  it("encodes detail IDs and sends exact mutation bodies", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => Response.json({ report: detail }));
    vi.stubGlobal("fetch", fetchMock);
    const timestamp = "2026-08-29T03:00:00.000Z";

    await getStaffReport("report/with spaces");
    await verifyStaffReport("report/with spaces", {
      expectedUpdatedAt: timestamp,
      role: "administrator",
    } as Parameters<typeof verifyStaffReport>[1] & { role: string });
    await storeStaffReport("report/with spaces", {
      expectedUpdatedAt: timestamp,
      storageLocation: "Library desk - locker B12",
      reporterId: "private",
    } as Parameters<typeof storeStaffReport>[1] & { reporterId: string });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/staff/reports/report%2Fwith%20spaces",
      { method: "GET", signal: undefined, credentials: "same-origin" },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/staff/reports/report%2Fwith%20spaces/verify",
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt: timestamp }),
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/staff/reports/report%2Fwith%20spaces/storage",
      {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedUpdatedAt: timestamp,
          storageLocation: "Library desk - locker B12",
        }),
      },
    );
  });

  it.each([
    ["unknown summary key", { ...summary, reporterId: "private" }],
    ["invalid photo reference", { ...summary, photoUrls: ["javascript:alert(1)"] }],
    ["Lost stored state", { ...summary, reportType: "lost", handling: { ...summary.handling, verificationStatus: "verified", custodyStatus: "stored", verifiedAt: "2026-08-29T02:00:00.000Z", storedAt: "2026-08-29T02:30:00.000Z" } }],
    ["pending verification time", { ...summary, handling: { ...summary.handling, verifiedAt: "2026-08-29T02:00:00.000Z" } }],
    ["stored without intake", { ...summary, handling: { ...summary.handling, verificationStatus: "verified", custodyStatus: "stored", verifiedAt: "2026-08-29T02:00:00.000Z" } }],
    ["released without release time", { ...summary, handling: { ...summary.handling, verificationStatus: "verified", custodyStatus: "released", verifiedAt: "2026-08-29T02:00:00.000Z", storedAt: "2026-08-29T02:30:00.000Z" } }],
  ])("rejects %s", async (_case, unsafeSummary) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          reports: [unsafeSummary],
          pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
        }),
      ),
    );
    await expectRequestFailed(() => getStaffReports({}));
  });

  it.each([
    ["unknown detail key", { ...detail, privateNotes: "private" }],
    ["verified without actors", { ...detail, handling: { ...detail.handling, verificationStatus: "verified", verifiedAt: "2026-08-29T02:00:00.000Z" } }],
    ["stored without location", { ...detail, handling: { ...detail.handling, verificationStatus: "verified", verifiedAt: "2026-08-29T02:00:00.000Z", verifiedBy: "64f0123456789abcdef01238", updatedBy: "64f0123456789abcdef01238", custodyStatus: "stored", storedAt: "2026-08-29T02:30:00.000Z" } }],
  ])("rejects %s", async (_case, unsafeDetail) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ report: unsafeDetail })),
    );
    await expectRequestFailed(() => getStaffReport(reportId));
  });

  it.each([
    [
      { reports: [], pagination: { page: 1, pageSize: 10, total: 11, totalPages: 1 } },
      "wrong page count",
    ],
    [
      { reports: [summary], pagination: { page: 2, pageSize: 10, total: 1, totalPages: 1 } },
      "nonempty page beyond total pages",
    ],
  ])("rejects inconsistent pagination: %s", async (unsafePage) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(unsafePage)));
    await expectRequestFailed(() => getStaffReports({}));
  });

  it.each([
    ["VALIDATION_ERROR", 400],
    ["AUTHENTICATION_REQUIRED", 401],
    ["STAFF_REPORT_FORBIDDEN", 403],
    ["STAFF_REPORT_NOT_FOUND", 404],
    ["STAFF_REPORT_STATE_CONFLICT", 409],
    ["STAFF_REPORT_OPERATION_FAILED", 500],
  ] as const)("maps the exact %s error", async (code, status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { error: { code, message: "server wording is not trusted" } },
          { status },
        ),
      ),
    );
    await expect(getStaffReport(reportId)).rejects.toMatchObject({ code, status });
  });

  it("rejects mismatched or forged error payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { error: { code: "STAFF_REPORT_NOT_FOUND", message: "private", stack: "private" } },
          { status: 409 },
        ),
      ),
    );
    await expectRequestFailed(() => getStaffReport(reportId), 409);
  });

  it("maps fetch failures without leaking their reason", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private URL")));
    const error = await getStaffReport(reportId).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(StaffReportBrowserError);
    expect(error).toMatchObject({ code: "NETWORK_ERROR", status: 0 });
    expect(String(error)).not.toContain("private URL");
  });
});
