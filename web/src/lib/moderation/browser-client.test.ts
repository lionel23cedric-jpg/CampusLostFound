import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BrowserModerationError,
  decideBrowserReportFlag,
  listBrowserAdminReportFlags,
  listBrowserAdminReports,
  moderateBrowserReport,
  submitBrowserReportFlag,
} from "./browser-client";

const timestamp = "2026-08-29T01:00:00.000Z";
const report = {
  id: "a".repeat(24),
  reportType: "lost",
  title: "Black laptop charger",
  publicDescription: "A black laptop charger left near the library.",
  categoryId: "b".repeat(24),
  campusLocationId: "c".repeat(24),
  occurredAt: timestamp,
  colors: ["black"],
  tags: ["charger"],
  photoUrls: [],
  status: "open",
  moderationStatus: "visible",
  privacySettings: {
    showPhoto: true,
    showEventDate: true,
    showCampusLocation: true,
  },
  resolvedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
} as const;
const flag = {
  id: "d".repeat(24),
  reason: "privacy_concern",
  details: "The description contains a phone number.",
  status: "pending",
  reviewedAt: null,
  resolutionNote: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  report,
} as const;
const pagination = {
  page: 1,
  pageSize: 20,
  totalItems: 1,
  totalPages: 1,
} as const;

afterEach(() => vi.unstubAllGlobals());

describe("moderation browser client requests", () => {
  it("submits a report flag with the exact body", async () => {
    const controller = new AbortController();
    const receipt = {
      id: flag.id,
      reportId: report.id,
      reason: flag.reason,
      status: "pending" as const,
      createdAt: timestamp,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ flag: receipt }, { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      submitBrowserReportFlag(
        report.id,
        { reason: "privacy_concern", details: "Private phone number" },
        controller.signal,
      ),
    ).resolves.toEqual(receipt);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/reports/${report.id}/flags`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          reason: "privacy_concern",
          details: "Private phone number",
        }),
        signal: controller.signal,
      },
    );
  });

  it("lists encoded flags and reports", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ flags: [flag], pagination }))
      .mockResolvedValueOnce(Response.json({ reports: [report], pagination }));
    vi.stubGlobal("fetch", fetchMock);

    await listBrowserAdminReportFlags({
      status: "pending",
      reason: "privacy_concern",
      page: 2,
    });
    await listBrowserAdminReports({
      q: "laptop charger",
      reportType: "lost",
      reportStatus: "open",
      moderationStatus: "visible",
      page: 3,
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/admin/report-flags?status=pending&reason=privacy_concern&page=2",
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/admin/reports?q=laptop+charger&reportType=lost&reportStatus=open&moderationStatus=visible&page=3",
    );
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
      });
    }
  });

  it("sends exact flag-decision and report-moderation bodies", async () => {
    const hiddenReport = { ...report, moderationStatus: "hidden" as const };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ flag, report }))
      .mockResolvedValueOnce(Response.json({ report: hiddenReport }));
    vi.stubGlobal("fetch", fetchMock);

    await decideBrowserReportFlag(flag.id, {
      decision: "dismiss",
      expectedFlagUpdatedAt: flag.updatedAt,
      note: null,
    });
    await moderateBrowserReport(report.id, {
      moderationStatus: "hidden",
      reason: "administrative_review",
      expectedUpdatedAt: report.updatedAt,
      note: "Pending review",
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      decision: "dismiss",
      expectedFlagUpdatedAt: flag.updatedAt,
      note: null,
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      moderationStatus: "hidden",
      reason: "administrative_review",
      expectedUpdatedAt: report.updatedAt,
      note: "Pending review",
    });
  });
});

describe("moderation browser client safety", () => {
  it.each([
    [400, "VALIDATION_ERROR", "Moderation request is invalid"],
    [401, "AUTHENTICATION_REQUIRED", "Authentication required"],
    [403, "ACTIVE_ACCOUNT_REQUIRED", "An active account is required"],
    [403, "ADMINISTRATOR_REQUIRED", "Administrator access required"],
    [403, "REPORT_FLAG_FORBIDDEN", "Report cannot be flagged"],
    [404, "REPORT_NOT_FOUND", "Report not found"],
    [404, "REPORT_FLAG_NOT_FOUND", "Report flag not found"],
    [409, "REPORT_FLAG_ALREADY_PENDING", "A pending flag already exists"],
    [409, "REPORT_FLAG_STATE_CONFLICT", "Report flag state has changed"],
    [409, "REPORT_MODERATION_CONFLICT", "Report moderation state has changed"],
    [500, "REPORT_MODERATION_FAILED", "Report moderation could not be completed"],
  ] as const)("accepts approved %i %s errors", async (status, code, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ error: { code, message } }, { status }),
      ),
    );
    const error = await listBrowserAdminReports({ page: 1 }).catch(
      (reason) => reason,
    );
    expect(error).toMatchObject({
      code,
      status,
      message:
        code === "REPORT_MODERATION_FAILED"
          ? "Report moderation is temporarily unavailable"
          : message,
    });
  });

  it.each([
    [500, { error: { code: "MONGODB_ERROR", message: "PRIVATE-HOST" } }],
    [403, { error: { code: "ADMINISTRATOR_REQUIRED", message: "PRIVATE" } }],
    [200, { reports: [{ ...report, reporterId: "PRIVATE" }], pagination }],
  ])("redacts an unsafe %i response", async (status, body) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json(body, { status })),
    );
    const error = await listBrowserAdminReports({ page: 1 }).catch(
      (reason) => reason,
    );
    expect(error).toBeInstanceOf(BrowserModerationError);
    expect(error).toMatchObject({
      code: "REPORT_MODERATION_FAILED",
      status,
      message: "Report moderation is temporarily unavailable",
    });
    expect(error.message).not.toMatch(/PRIVATE|MONGODB|HOST|reporterId/i);
  });

  it("preserves AbortError and redacts other network failures", async () => {
    const controller = new AbortController();
    controller.abort();
    const aborted = new DOMException("PRIVATE-ABORT", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(aborted));
    await expect(
      listBrowserAdminReports({ page: 1 }, controller.signal),
    ).rejects.toBe(aborted);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValueOnce(new Error("PRIVATE-HOST")),
    );
    const error = await listBrowserAdminReports({ page: 1 }).catch(
      (reason) => reason,
    );
    expect(error).toMatchObject({
      code: "REPORT_MODERATION_FAILED",
      status: 0,
      message: "Report moderation is temporarily unavailable",
    });
  });

  it.each([200, 500])("redacts a non-JSON %i body", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("PRIVATE-BODY", { status })),
    );
    const error = await listBrowserAdminReports({ page: 1 }).catch(
      (reason) => reason,
    );
    expect(error).toMatchObject({
      code: "REPORT_MODERATION_FAILED",
      status,
      message: "Report moderation is temporarily unavailable",
    });
  });
});
