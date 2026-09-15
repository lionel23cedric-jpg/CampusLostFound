import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/staff-reports/access", () => ({
  getCurrentStaffReportUser: vi.fn(),
}));
vi.mock("@/lib/staff-reports/service", () => ({
  listStaffReports: vi.fn(),
  getStaffReport: vi.fn(),
  verifyStaffReport: vi.fn(),
  storeStaffReport: vi.fn(),
}));

import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { getCurrentStaffReportUser } from "@/lib/staff-reports/access";
import { StaffReportError } from "@/lib/staff-reports/errors";
import {
  getStaffReport,
  listStaffReports,
  storeStaffReport,
  verifyStaffReport,
} from "@/lib/staff-reports/service";

import { GET as getReport } from "./[reportId]/route";
import { PUT as storeReport } from "./[reportId]/storage/route";
import { POST as verifyReport } from "./[reportId]/verify/route";
import { GET as listReports } from "./route";

const reportId = "64f0123456789abcdef01234";
const staff: PublicUser = {
  id: "64f0123456789abcdef01238",
  email: "staff@example.test",
  role: "staff",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Staff Member",
    preferredContactMethod: "in_app",
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
};

const summary = {
  id: reportId,
  reportType: "found",
  title: "Found campus card",
  photoUrls: [],
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
};
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
};
const context = (id = reportId) => ({
  params: Promise.resolve({ reportId: id }),
});
const jsonRequest = (method: "POST" | "PUT", body: unknown) =>
  new Request(`http://localhost/api/staff/reports/${reportId}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

function expectNoStore(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe("no-store");
}

describe("staff report routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentStaffReportUser).mockResolvedValue(staff);
    vi.mocked(listStaffReports).mockResolvedValue({
      reports: [summary],
      pagination: { page: 2, pageSize: 10, total: 1, totalPages: 1 },
    } as never);
    vi.mocked(getStaffReport).mockResolvedValue(detail as never);
    vi.mocked(verifyStaffReport).mockResolvedValue(detail as never);
    vi.mocked(storeStaffReport).mockResolvedValue(detail as never);
  });

  it("lists reports with exact validated query input and no private fields", async () => {
    const response = await listReports(
      new Request(
        "http://localhost/api/staff/reports?reportType=found&verificationStatus=pending&page=2",
      ),
    );
    const text = await response.text();

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(listStaffReports).toHaveBeenCalledWith(staff, {
      reportType: "found",
      verificationStatus: "pending",
      page: 2,
    });
    expect(text).not.toMatch(
      /storageLocation|reporterId|expectedAnswer|exactLocationDetails|serialNumber|privateNotes|password|token|__v/,
    );
  });

  it.each([
    "page=01",
    "page=1&page=2",
    "unknown=value",
    "reportType=lost&custodyStatus=stored",
  ])("rejects invalid list query %s", async (query) => {
    const response = await listReports(
      new Request(`http://localhost/api/staff/reports?${query}`),
    );
    expect(response.status).toBe(400);
    expectNoStore(response);
    expect(listStaffReports).not.toHaveBeenCalled();
  });

  it("returns a controlled detail for a canonical report ID", async () => {
    const response = await getReport(
      new Request(`http://localhost/api/staff/reports/${reportId}`),
      context(reportId.toUpperCase()),
    );

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(getStaffReport).toHaveBeenCalledWith(staff, reportId);
    expect(await response.json()).toEqual({ report: detail });
  });

  it("rejects an invalid detail ID before calling the service", async () => {
    const response = await getReport(
      new Request("http://localhost/api/staff/reports/not-an-id"),
      context("not-an-id"),
    );
    expect(response.status).toBe(400);
    expectNoStore(response);
    expect(getStaffReport).not.toHaveBeenCalled();
  });

  it("passes the exact verification body to the service", async () => {
    const input = { expectedUpdatedAt: "2026-08-29T03:00:00.000Z" };
    const response = await verifyReport(
      jsonRequest("POST", input),
      context(),
    );
    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(verifyStaffReport).toHaveBeenCalledWith(staff, reportId, input);
    expect(await response.json()).toEqual({ report: detail });
  });

  it("normalises and passes the exact storage body to the service", async () => {
    const response = await storeReport(
      jsonRequest("PUT", {
        expectedUpdatedAt: "2026-08-29T03:00:00.000Z",
        storageLocation: "  Library   desk - locker B12  ",
      }),
      context(),
    );
    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(storeStaffReport).toHaveBeenCalledWith(staff, reportId, {
      expectedUpdatedAt: "2026-08-29T03:00:00.000Z",
      storageLocation: "Library desk - locker B12",
    });
  });

  it.each([
    ["missing JSON content type", new Request("http://localhost", { method: "POST", body: "{}" })],
    ["malformed JSON", new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" })],
    ["unknown body key", jsonRequest("POST", { expectedUpdatedAt: "2026-08-29T03:00:00.000Z", role: "administrator" })],
    ["oversized body", new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": "20000" }, body: "{}" })],
  ])("rejects %s", async (_label, request) => {
    const response = await verifyReport(request, context());
    expect(response.status).toBe(_label === "oversized body" ? 413 : 400);
    expectNoStore(response);
    expect(verifyStaffReport).not.toHaveBeenCalled();
  });

  it("rejects invalid UTF-8 request bodies", async () => {
    const response = await verifyReport(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: new Uint8Array([0xff]),
        duplex: "half",
      } as RequestInit),
      context(),
    );
    expect(response.status).toBe(400);
    expectNoStore(response);
  });

  it("authenticates before parsing list queries", async () => {
    vi.mocked(getCurrentStaffReportUser).mockRejectedValueOnce(
      new AuthError("AUTHENTICATION_REQUIRED"),
    );
    const response = await listReports(
      new Request("http://localhost/api/staff/reports?page=invalid"),
    );
    expect(response.status).toBe(401);
    expectNoStore(response);
    expect(listStaffReports).not.toHaveBeenCalled();
  });

  it("authenticates before reading detail parameters", async () => {
    vi.mocked(getCurrentStaffReportUser).mockRejectedValueOnce(
      new AuthError("AUTHENTICATION_REQUIRED"),
    );
    const response = await getReport(new Request("http://localhost"), {
      params: {
        then: () => {
          throw new Error("parameters were read before authentication");
        },
      } as never,
    });
    expect(response.status).toBe(401);
    expectNoStore(response);
    expect(getStaffReport).not.toHaveBeenCalled();
  });

  it.each([
    ["verify", verifyReport, jsonRequest("POST", { expectedUpdatedAt: "2026-08-29T03:00:00.000Z" })],
    ["storage", storeReport, jsonRequest("PUT", { expectedUpdatedAt: "2026-08-29T03:00:00.000Z", storageLocation: "Locker B12" })],
  ])("authenticates before reading %s parameters or body", async (_label, route, request) => {
    vi.mocked(getCurrentStaffReportUser).mockRejectedValueOnce(
      new AuthError("AUTHENTICATION_REQUIRED"),
    );
    const response = await route(request, {
      params: {
        then: () => {
          throw new Error("parameters were read before authentication");
        },
      } as never,
    });
    expect(response.status).toBe(401);
    expectNoStore(response);
    expect(verifyStaffReport).not.toHaveBeenCalled();
    expect(storeStaffReport).not.toHaveBeenCalled();
  });

  it("maps rejected route parameters to a safe no-store response", async () => {
    const response = await getReport(new Request("http://localhost"), {
      params: Promise.reject(new Error("private parameter failure")),
    });
    expect(response.status).toBe(500);
    expectNoStore(response);
    expect(await response.text()).not.toContain("private parameter failure");
  });

  it.each([
    [new StaffReportError("STAFF_REPORT_FORBIDDEN"), 403],
    [new StaffReportError("STAFF_REPORT_NOT_FOUND"), 404],
    [new StaffReportError("STAFF_REPORT_STATE_CONFLICT"), 409],
    [new Error("private database detail"), 500],
    [{ code: "STAFF_REPORT_NOT_FOUND", status: 404 }, 500],
  ])("maps service failures safely", async (error, status) => {
    vi.mocked(getStaffReport).mockRejectedValueOnce(error);
    const response = await getReport(new Request("http://localhost"), context());
    const text = await response.text();
    expect(response.status).toBe(status);
    expectNoStore(response);
    expect(text).not.toContain("private database detail");
  });
});
