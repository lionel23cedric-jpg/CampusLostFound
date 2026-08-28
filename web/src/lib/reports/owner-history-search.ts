import type { OwnerReportHistoryRequest } from "./browser-client";

const knownKeys = new Set(["reportType", "status", "page"]);
const reportTypes = new Set(["lost", "found"]);
const statuses = new Set([
  "draft",
  "open",
  "claim_pending",
  "resolved",
  "closed",
]);

export type OwnerReportHistoryValues = {
  reportType: "" | "lost" | "found";
  status: "" | "draft" | "open" | "claim_pending" | "resolved" | "closed";
};

function isSafePage(value: string) {
  return /^[1-9]\d*$/.test(value) && Number(value) <= 10_000;
}

export function parseOwnerReportHistorySearchParams(params: URLSearchParams): {
  values: OwnerReportHistoryValues;
  request: OwnerReportHistoryRequest;
  ignoredInvalidValues: boolean;
} {
  const values: OwnerReportHistoryValues = { reportType: "", status: "" };
  const request: OwnerReportHistoryRequest = {};
  let ignoredInvalidValues = false;

  for (const key of params.keys()) {
    if (!knownKeys.has(key)) ignoredInvalidValues = true;
  }

  const read = (key: "reportType" | "status" | "page") => {
    const matches = params.getAll(key);
    if (matches.length > 1) {
      ignoredInvalidValues = true;
      return undefined;
    }
    return matches[0];
  };

  const reportType = read("reportType");
  if (reportType && reportTypes.has(reportType)) {
    values.reportType = reportType as OwnerReportHistoryValues["reportType"];
    request.reportType = values.reportType || undefined;
  } else if (reportType) {
    ignoredInvalidValues = true;
  }

  const status = read("status");
  if (status && statuses.has(status)) {
    values.status = status as OwnerReportHistoryValues["status"];
    request.status = values.status || undefined;
  } else if (status) {
    ignoredInvalidValues = true;
  }

  const page = read("page");
  if (page !== undefined && page !== "") {
    if (isSafePage(page)) {
      const value = Number(page);
      if (value !== 1) request.page = value;
    } else {
      ignoredInvalidValues = true;
    }
  } else if (page === "") {
    ignoredInvalidValues = true;
  }

  return { values, request, ignoredInvalidValues };
}

export function ownerReportHistoryHref(input: OwnerReportHistoryRequest) {
  const search = new URLSearchParams();
  if (input.reportType) search.set("reportType", input.reportType);
  if (input.status) search.set("status", input.status);
  if (
    input.page !== undefined &&
    Number.isInteger(input.page) &&
    input.page > 1 &&
    input.page <= 10_000
  ) {
    search.set("page", String(input.page));
  }

  const query = search.toString();
  return query ? `/reports/mine?${query}` : "/reports/mine";
}
