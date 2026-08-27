import { z } from "zod";

import {
  adminCampusLocationPageSchema,
  adminCampusLocationSchema,
  adminCategoryPageSchema,
  adminCategorySchema,
  type AdminCampusLocation,
  type AdminCampusLocationPage,
  type AdminCategory,
  type AdminCategoryPage,
  type CreateAdminCampusLocationInput,
  type CreateAdminCategoryInput,
  type ReferenceDataListQuery,
  type UpdateAdminCampusLocationInput,
  type UpdateAdminCategoryInput,
} from "./reference-data-contract";

const GENERIC_MESSAGE =
  "Reference data management is temporarily unavailable";
const errorCodes = [
  "INVALID_REFERENCE_DATA_REQUEST",
  "AUTHENTICATION_REQUIRED",
  "ADMINISTRATOR_REQUIRED",
  "REFERENCE_DATA_NOT_FOUND",
  "REFERENCE_DATA_DUPLICATE",
  "REFERENCE_DATA_STATE_CONFLICT",
  "REFERENCE_DATA_OPERATION_FAILED",
] as const;

export type BrowserReferenceDataErrorCode = (typeof errorCodes)[number];

const approvedErrors = new Map<
  BrowserReferenceDataErrorCode,
  { status: number; message: string }
>([
  [
    "INVALID_REFERENCE_DATA_REQUEST",
    { status: 400, message: "Reference data request is invalid" },
  ],
  [
    "AUTHENTICATION_REQUIRED",
    { status: 401, message: "Authentication required" },
  ],
  [
    "ADMINISTRATOR_REQUIRED",
    { status: 403, message: "Administrator access required" },
  ],
  [
    "REFERENCE_DATA_NOT_FOUND",
    { status: 404, message: "Reference data not found" },
  ],
  [
    "REFERENCE_DATA_DUPLICATE",
    { status: 409, message: "Reference data already exists" },
  ],
  [
    "REFERENCE_DATA_STATE_CONFLICT",
    { status: 409, message: "Reference data has changed" },
  ],
  [
    "REFERENCE_DATA_OPERATION_FAILED",
    { status: 500, message: "Reference data operation failed" },
  ],
]);

const errorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(errorCodes),
    message: z.string(),
  }),
});
const categoryResponseSchema = z.strictObject({
  category: adminCategorySchema,
});
const campusLocationResponseSchema = z.strictObject({
  campusLocation: adminCampusLocationSchema,
});

export class BrowserReferenceDataError extends Error {
  readonly code: BrowserReferenceDataErrorCode;
  readonly status: number;

  constructor(
    code: BrowserReferenceDataErrorCode,
    status: number,
    message: string,
  ) {
    super(message);
    this.name = "BrowserReferenceDataError";
    this.code = code;
    this.status = status;
  }
}

function genericError(status: number) {
  return new BrowserReferenceDataError(
    "REFERENCE_DATA_OPERATION_FAILED",
    status,
    GENERIC_MESSAGE,
  );
}

function abortError(error: unknown, signal?: AbortSignal) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return error;
  }
  if (signal?.aborted) {
    return new DOMException("The operation was aborted", "AbortError");
  }
}

async function safeFetch(input: RequestInfo | URL, init: RequestInit) {
  try {
    return await fetch(input, init);
  } catch (error) {
    const aborted = abortError(error, init.signal ?? undefined);
    if (aborted) throw aborted;
    throw genericError(0);
  }
}

async function readJson(response: Response, signal?: AbortSignal) {
  try {
    return await response.json();
  } catch (error) {
    const aborted = abortError(error, signal);
    if (aborted) throw aborted;
    throw genericError(response.status);
  }
}

async function responseError(response: Response, signal?: AbortSignal) {
  const parsed = errorResponseSchema.safeParse(await readJson(response, signal));
  if (!parsed.success) return genericError(response.status);

  const definition = approvedErrors.get(parsed.data.error.code);
  if (
    definition === undefined ||
    response.status !== definition.status ||
    parsed.data.error.message !== definition.message
  ) {
    return genericError(response.status);
  }

  return new BrowserReferenceDataError(
    parsed.data.error.code,
    definition.status,
    definition.message,
  );
}

async function request<T>(
  url: string,
  init: RequestInit,
  schema: z.ZodType<T>,
) {
  const response = await safeFetch(url, init);
  if (!response.ok) throw await responseError(response, init.signal ?? undefined);

  const parsed = schema.safeParse(
    await readJson(response, init.signal ?? undefined),
  );
  if (!parsed.success) throw genericError(response.status);
  return parsed.data;
}

function listUrl(path: string, query: ReferenceDataListQuery) {
  const params = new URLSearchParams();
  if (query.q !== undefined) params.set("q", query.q);
  params.set("status", query.status);
  params.set("page", String(query.page));
  return `${path}?${params.toString()}`;
}

const readOptions = (signal?: AbortSignal): RequestInit => ({
  method: "GET",
  headers: { Accept: "application/json" },
  credentials: "same-origin",
  cache: "no-store",
  signal,
});

const writeOptions = (
  method: "POST" | "PATCH",
  body: unknown,
  signal?: AbortSignal,
): RequestInit => ({
  method,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  credentials: "same-origin",
  cache: "no-store",
  signal,
  body: JSON.stringify(body),
});

export async function listAdministratorCategories(
  query: ReferenceDataListQuery,
  signal?: AbortSignal,
): Promise<AdminCategoryPage> {
  return request(
    listUrl("/api/admin/categories", query),
    readOptions(signal),
    adminCategoryPageSchema,
  );
}

export async function createAdministratorCategory(
  input: CreateAdminCategoryInput,
  signal?: AbortSignal,
): Promise<AdminCategory> {
  const result = await request(
    "/api/admin/categories",
    writeOptions("POST", input, signal),
    categoryResponseSchema,
  );
  return result.category;
}

export async function updateAdministratorCategory(
  categoryId: string,
  input: UpdateAdminCategoryInput,
  signal?: AbortSignal,
): Promise<AdminCategory> {
  const result = await request(
    `/api/admin/categories/${encodeURIComponent(categoryId)}`,
    writeOptions("PATCH", input, signal),
    categoryResponseSchema,
  );
  return result.category;
}

export async function listAdministratorCampusLocations(
  query: ReferenceDataListQuery,
  signal?: AbortSignal,
): Promise<AdminCampusLocationPage> {
  return request(
    listUrl("/api/admin/campus-locations", query),
    readOptions(signal),
    adminCampusLocationPageSchema,
  );
}

export async function createAdministratorCampusLocation(
  input: CreateAdminCampusLocationInput,
  signal?: AbortSignal,
): Promise<AdminCampusLocation> {
  const result = await request(
    "/api/admin/campus-locations",
    writeOptions("POST", input, signal),
    campusLocationResponseSchema,
  );
  return result.campusLocation;
}

export async function updateAdministratorCampusLocation(
  campusLocationId: string,
  input: UpdateAdminCampusLocationInput,
  signal?: AbortSignal,
): Promise<AdminCampusLocation> {
  const result = await request(
    `/api/admin/campus-locations/${encodeURIComponent(campusLocationId)}`,
    writeOptions("PATCH", input, signal),
    campusLocationResponseSchema,
  );
  return result.campusLocation;
}
