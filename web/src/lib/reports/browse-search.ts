import { z } from "zod";

import type { MemberReport, ReportBrowseRequest } from "./browser-client";

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoDateTime = z.string().datetime({ offset: true });
const PAGE_SIZE = 12;

const knownKeys = [
  "q",
  "reportType",
  "categoryId",
  "campusLocationId",
  "status",
  "color",
  "occurredFrom",
  "occurredTo",
  "hasPhoto",
  "page",
] as const;

const knownKeySet = new Set<string>(knownKeys);

export type ReportSearchValues = {
  q: string;
  reportType: "" | "lost" | "found";
  categoryId: string;
  campusLocationId: string;
  status: "" | MemberReport["status"];
  color: string;
  occurredFrom: string;
  occurredTo: string;
  hasPhoto: "" | "true" | "false";
};

export type ReportSearchErrors = Partial<
  Record<keyof ReportSearchValues | "_form", string[]>
>;

function localDateIso(value: string, endOfDay: boolean) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  );
  const isSameCalendarDate =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
  return isSameCalendarDate ? date.toISOString() : undefined;
}

function isRealIsoDateTime(value: string) {
  if (!isoDateTime.safeParse(value).success) return false;

  const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));

  return (
    Number.isFinite(Date.parse(value)) &&
    calendarDate.getUTCFullYear() === year &&
    calendarDate.getUTCMonth() === month - 1 &&
    calendarDate.getUTCDate() === day
  );
}

function isoDateToLocalInput(value: string) {
  if (!isRealIsoDateTime(value)) return undefined;

  const date = new Date(value);
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const searchValuesSchema = z
  .strictObject({
    q: z
      .string()
      .trim()
      .max(100, "Use 100 characters or fewer")
      .refine((value) => value.length === 0 || value.length >= 2, {
        message: "Enter at least 2 characters",
      }),
    reportType: z.enum(["", "lost", "found"]),
    categoryId: z.union([z.literal(""), objectId]),
    campusLocationId: z.union([z.literal(""), objectId]),
    status: z.enum(["", "open", "claim_pending", "resolved", "closed"]),
    color: z.string().trim().max(32, "Use 32 characters or fewer"),
    occurredFrom: z
      .string()
      .refine(
        (value) =>
          value.length === 0 ||
          (dateInput.safeParse(value).success &&
            localDateIso(value, false) !== undefined),
        { message: "Enter a valid start date" },
      ),
    occurredTo: z
      .string()
      .refine(
        (value) =>
          value.length === 0 ||
          (dateInput.safeParse(value).success &&
            localDateIso(value, true) !== undefined),
        { message: "Enter a valid end date" },
      ),
    hasPhoto: z.enum(["", "true", "false"]),
  })
  .superRefine((value, context) => {
    if (
      value.occurredFrom &&
      value.occurredTo &&
      value.occurredFrom > value.occurredTo
    ) {
      context.addIssue({
        code: "custom",
        path: ["occurredTo"],
        message: "End date must not be earlier than start date",
      });
    }
  });

export function createEmptyReportSearchValues(): ReportSearchValues {
  return {
    q: "",
    reportType: "",
    categoryId: "",
    campusLocationId: "",
    status: "",
    color: "",
    occurredFrom: "",
    occurredTo: "",
    hasPhoto: "",
  };
}

function searchErrors(error: z.ZodError): ReportSearchErrors {
  const errors: ReportSearchErrors = {};

  for (const issue of error.issues) {
    const key = (issue.path[0] ?? "_form") as keyof ReportSearchErrors;
    errors[key] = [...(errors[key] ?? []), issue.message];
  }

  return errors;
}

export function validateReportSearch(
  values: ReportSearchValues,
):
  | { success: true; request: ReportBrowseRequest }
  | { success: false; errors: ReportSearchErrors } {
  const parsed = searchValuesSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, errors: searchErrors(parsed.error) };
  }

  const data = parsed.data;
  const request: ReportBrowseRequest = {};
  if (data.q) request.q = data.q;
  if (data.reportType) request.reportType = data.reportType;
  if (data.categoryId) request.categoryId = data.categoryId;
  if (data.campusLocationId) request.campusLocationId = data.campusLocationId;
  if (data.status) request.status = data.status;
  if (data.color) request.color = data.color;
  if (data.occurredFrom) {
    request.occurredFrom = localDateIso(data.occurredFrom, false);
  }
  if (data.occurredTo) {
    request.occurredTo = localDateIso(data.occurredTo, true);
  }
  if (data.hasPhoto) request.hasPhoto = data.hasPhoto === "true";

  return { success: true, request };
}

function isSafePage(page: number) {
  return (
    Number.isSafeInteger(page) &&
    page >= 1 &&
    Number.isSafeInteger((page - 1) * PAGE_SIZE)
  );
}

export function parseReportSearchParams(params: URLSearchParams): {
  values: ReportSearchValues;
  request: ReportBrowseRequest;
  ignoredInvalidValues: boolean;
} {
  const values = createEmptyReportSearchValues();
  let ignoredInvalidValues = false;

  for (const key of params.keys()) {
    if (!knownKeySet.has(key)) ignoredInvalidValues = true;
  }

  const read = (key: (typeof knownKeys)[number]) => {
    const all = params.getAll(key);
    if (all.length > 1) {
      ignoredInvalidValues = true;
      return undefined;
    }
    return all[0];
  };

  for (const key of ["q", "reportType", "categoryId", "campusLocationId", "status", "color", "hasPhoto"] as const) {
    const value = read(key);
    if (value !== undefined) values[key] = value as never;
  }

  for (const key of ["occurredFrom", "occurredTo"] as const) {
    const value = read(key);
    if (value === undefined) continue;
    const localValue = isoDateToLocalInput(value);
    if (localValue) values[key] = localValue;
    else ignoredInvalidValues = true;
  }

  let validated = validateReportSearch(values);
  if (!validated.success) {
    ignoredInvalidValues = true;
    for (const key of Object.keys(validated.errors)) {
      if (key !== "_form") values[key as keyof ReportSearchValues] = "";
    }
    validated = validateReportSearch(values);
  }

  const request = validated.success ? validated.request : {};
  const pageValue = read("page");
  if (pageValue !== undefined) {
    const page = Number(pageValue);
    if (/^[1-9]\d*$/.test(pageValue) && isSafePage(page)) {
      if (page !== 1) request.page = page;
    } else {
      ignoredInvalidValues = true;
    }
  }

  return { values, request, ignoredInvalidValues };
}

export function reportSearchHref(input: ReportBrowseRequest): string {
  const search = new URLSearchParams();
  if (input.q) search.set("q", input.q);
  if (input.reportType) search.set("reportType", input.reportType);
  if (input.categoryId) search.set("categoryId", input.categoryId);
  if (input.campusLocationId) {
    search.set("campusLocationId", input.campusLocationId);
  }
  if (input.status) search.set("status", input.status);
  if (input.color) search.set("color", input.color);
  if (input.occurredFrom) search.set("occurredFrom", input.occurredFrom);
  if (input.occurredTo) search.set("occurredTo", input.occurredTo);
  if (input.hasPhoto !== undefined) {
    search.set("hasPhoto", String(input.hasPhoto));
  }
  if (input.page !== undefined && input.page !== 1 && isSafePage(input.page)) {
    search.set("page", String(input.page));
  }

  const query = search.toString();
  return query ? `/reports?${query}` : "/reports";
}
