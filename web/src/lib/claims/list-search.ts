import {
  CLAIM_STATUSES,
  type ClaimStatus,
  type MyClaimsRequest,
} from "./browser-client";

const claimStatusSet = new Set<string>(CLAIM_STATUSES);
const knownKeySet = new Set(["status", "page"]);

export type ClaimListSearch = {
  status: "" | ClaimStatus;
  page: number;
};

function safePage(value: string | undefined) {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return undefined;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= 10_000 ? page : undefined;
}

export function parseClaimListSearchParams(params: URLSearchParams): {
  values: ClaimListSearch;
  request: MyClaimsRequest;
  ignoredInvalidValues: boolean;
} {
  let ignoredInvalidValues = Array.from(params.keys()).some(
    (key) => !knownKeySet.has(key),
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
    rawStatus === undefined || rawStatus === ""
      ? ""
      : claimStatusSet.has(rawStatus)
        ? (rawStatus as ClaimStatus)
        : "";
  if (rawStatus !== undefined && rawStatus !== "" && status === "") {
    ignoredInvalidValues = true;
  }

  const rawPage = readOne("page");
  const parsedPage = rawPage === undefined ? 1 : safePage(rawPage);
  const page = parsedPage ?? 1;
  if (rawPage !== undefined && parsedPage === undefined) {
    ignoredInvalidValues = true;
  }

  const request: MyClaimsRequest = {};
  if (status) request.status = status;
  if (page !== 1) request.page = page;
  return { values: { status, page }, request, ignoredInvalidValues };
}

export function claimListHref(input: ClaimListSearch) {
  const search = new URLSearchParams();
  if (input.status) search.set("status", input.status);
  if (
    input.page !== 1 &&
    Number.isSafeInteger(input.page) &&
    input.page >= 1 &&
    input.page <= 10_000
  ) {
    search.set("page", String(input.page));
  }
  const query = search.toString();
  return query ? `/claims?${query}` : "/claims";
}
