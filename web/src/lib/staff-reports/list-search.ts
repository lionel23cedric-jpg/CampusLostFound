import type { StaffReportListRequest } from "./browser-client";

export type StaffReportListSearch = {
  reportType: "all" | "lost" | "found";
  reportStatus: "active" | "open" | "claim_pending" | "resolved";
  verificationStatus: "all" | "pending" | "verified";
  custodyStatus: "all" | "not_applicable" | "not_held" | "stored" | "released";
  page: number;
};

const sets = {
  reportType: new Set(["all", "lost", "found"]),
  reportStatus: new Set(["active", "open", "claim_pending", "resolved"]),
  verificationStatus: new Set(["all", "pending", "verified"]),
  custodyStatus: new Set([
    "all",
    "not_applicable",
    "not_held",
    "stored",
    "released",
  ]),
};
const knownKeys = new Set([...Object.keys(sets), "page"]);
const defaults: StaffReportListSearch = {
  reportType: "all",
  reportStatus: "active",
  verificationStatus: "pending",
  custodyStatus: "all",
  page: 1,
};

function safePage(value: string | undefined) {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return undefined;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= 10_000 ? page : undefined;
}

function custodyIsCompatible(values: StaffReportListSearch) {
  return !(
    (values.reportType === "lost" &&
      values.custodyStatus !== "all" &&
      values.custodyStatus !== "not_applicable") ||
    (values.reportType === "found" &&
      values.custodyStatus === "not_applicable") ||
    (values.verificationStatus === "pending" &&
      (values.custodyStatus === "stored" ||
        values.custodyStatus === "released"))
  );
}

function toRequest(values: StaffReportListSearch): StaffReportListRequest {
  const request: StaffReportListRequest = {};
  if (values.reportType !== "all") request.reportType = values.reportType;
  if (values.reportStatus !== "active") {
    request.reportStatus = values.reportStatus;
  }
  if (values.verificationStatus !== "all") {
    request.verificationStatus = values.verificationStatus;
  }
  if (values.custodyStatus !== "all") {
    request.custodyStatus = values.custodyStatus;
  }
  if (values.page !== 1) request.page = values.page;
  return request;
}

export function parseStaffReportListSearchParams(params: URLSearchParams) {
  let ignoredInvalidValues = Array.from(params.keys()).some(
    (key) => !knownKeys.has(key),
  );
  const values = { ...defaults };

  for (const key of Object.keys(sets) as Array<keyof typeof sets>) {
    const entries = params.getAll(key);
    if (entries.length > 1) {
      ignoredInvalidValues = true;
      continue;
    }
    if (entries.length === 1) {
      if (sets[key].has(entries[0])) {
        values[key] = entries[0] as never;
      } else {
        ignoredInvalidValues = true;
      }
    }
  }

  const pages = params.getAll("page");
  if (pages.length > 1) {
    ignoredInvalidValues = true;
  } else if (pages.length === 1) {
    const page = safePage(pages[0]);
    if (page === undefined) ignoredInvalidValues = true;
    else values.page = page;
  }

  if (!custodyIsCompatible(values)) {
    values.custodyStatus = "all";
    ignoredInvalidValues = true;
  }
  return { values, request: toRequest(values), ignoredInvalidValues };
}

export function staffReportListHref(input: StaffReportListSearch) {
  const values = { ...input };
  if (!custodyIsCompatible(values)) values.custodyStatus = "all";
  const search = new URLSearchParams();
  if (sets.reportType.has(values.reportType) && values.reportType !== "all") {
    search.set("reportType", values.reportType);
  }
  if (
    sets.reportStatus.has(values.reportStatus) &&
    values.reportStatus !== "active"
  ) {
    search.set("reportStatus", values.reportStatus);
  }
  if (
    sets.verificationStatus.has(values.verificationStatus) &&
    values.verificationStatus !== "pending"
  ) {
    search.set("verificationStatus", values.verificationStatus);
  }
  if (
    sets.custodyStatus.has(values.custodyStatus) &&
    values.custodyStatus !== "all"
  ) {
    search.set("custodyStatus", values.custodyStatus);
  }
  if (
    values.page !== 1 &&
    Number.isSafeInteger(values.page) &&
    values.page >= 1 &&
    values.page <= 10_000
  ) {
    search.set("page", String(values.page));
  }
  const query = search.toString();
  return query ? `/staff/reports?${query}` : "/staff/reports";
}
