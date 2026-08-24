import { CLAIM_STATUSES, type ClaimStatus } from "./browser-client";
import type { StaffClaimsRequest } from "./staff-browser-client";

export type StaffClaimListSearch = {
  status: ClaimStatus;
  page: number;
};

const statusSet = new Set<string>(CLAIM_STATUSES);
const knownKeys = new Set(["status", "page"]);

function safePage(value: string | undefined) {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return undefined;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= 10_000 ? page : undefined;
}

export function parseStaffClaimListSearchParams(params: URLSearchParams): {
  values: StaffClaimListSearch;
  request: StaffClaimsRequest;
  ignoredInvalidValues: boolean;
} {
  let ignoredInvalidValues = Array.from(params.keys()).some(
    (key) => !knownKeys.has(key),
  );
  const readOne = (key: "status" | "page") => {
    const values = params.getAll(key);
    if (values.length > 1) {
      ignoredInvalidValues = true;
      return undefined;
    }
    return values[0];
  };

  const rawStatus = readOne("status");
  const status =
    rawStatus !== undefined && statusSet.has(rawStatus)
      ? (rawStatus as ClaimStatus)
      : "pending";
  if (rawStatus !== undefined && !statusSet.has(rawStatus)) {
    ignoredInvalidValues = true;
  }

  const rawPage = readOne("page");
  const parsedPage = rawPage === undefined ? 1 : safePage(rawPage);
  const page = parsedPage ?? 1;
  if (rawPage !== undefined && parsedPage === undefined) {
    ignoredInvalidValues = true;
  }

  const request: StaffClaimsRequest = {};
  if (status !== "pending") request.status = status;
  if (page !== 1) request.page = page;
  return { values: { status, page }, request, ignoredInvalidValues };
}

export function staffClaimListHref(input: StaffClaimListSearch) {
  const search = new URLSearchParams();
  if (input.status !== "pending") search.set("status", input.status);
  if (
    input.page !== 1 &&
    Number.isSafeInteger(input.page) &&
    input.page >= 1 &&
    input.page <= 10_000
  ) {
    search.set("page", String(input.page));
  }
  const query = search.toString();
  return query ? `/staff/claims?${query}` : "/staff/claims";
}
