# Administrator Reference Data Management Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build active-administrator-only APIs for listing, creating, editing, deactivating, and restoring Category and CampusLocation records without breaking historical report references.

**Architecture:** Keep the existing member-facing active-only endpoints unchanged. Add strict administrator contracts and a closed safety boundary, then implement separate Category and CampusLocation services and REST routes that share conventions without introducing a generic CRUD abstraction. Every update filters atomically by `_id` and the submitted `updatedAt` concurrency token.

**Tech Stack:** Next.js 16 App Router route handlers, TypeScript 5, Zod 4, Mongoose 9, and Vitest 4.

## Global Constraints

- Work only on `feature/issue-40-administrator-reference-data-backend`.
- Keep `GET /api/categories` and `GET /api/campus-locations` unchanged and active-only.
- Add `GET` and `POST` under `/api/admin/categories` and `/api/admin/campus-locations`.
- Add `PATCH` under `/api/admin/categories/{categoryId}` and `/api/admin/campus-locations/{campusLocationId}`.
- Provide no `DELETE` route, permanent deletion, bulk operation, import, export, or seed path.
- Permit only a `PublicUser` whose role is `administrator` and status is `active`.
- Authenticate and authorize before parsing business input or connecting to MongoDB.
- Never accept an administrator ID, role, status, or other authority claim from request data.
- Use a fixed page size of 20 and accept canonical pages from 1 through 10,000.
- Recognize only `q`, `status`, and `page` list-query keys; reject unknown and duplicate keys.
- Limit POST and PATCH bodies to exactly 8 KiB and decode them as fatal UTF-8.
- Use strict Zod schemas and fixed safe error codes/messages.
- New records are server-controlled `isActive: true` records.
- Require the exact current `updatedAt` value for every update.
- Use soft deactivation only; never rewrite ItemReport references.
- Add no dependency and change no Category or CampusLocation schema.
- Tests use mocks and fixtures and never connect to MongoDB Atlas.
- Never read, print, stage, or commit `.env.local`.
- All success and error responses set `Cache-Control: no-store`.

## File Structure

- `web/src/lib/admin/reference-data-contract.ts`: strict query, path, create, update, public-record, and page schemas plus safe mappers.
- `web/src/lib/admin/reference-data-contract.test.ts`: contract normalization, rejection, mapping, and pagination tests.
- `web/src/lib/admin/reference-data-errors.ts`: closed error class, duplicate-key classification, and safe HTTP mapping.
- `web/src/lib/admin/reference-data-errors.test.ts`: exact code/status/message and redaction tests.
- `web/src/lib/admin/reference-data-access.ts`: current-session resolution and active-administrator enforcement.
- `web/src/lib/admin/reference-data-access.test.ts`: role/status matrix and authentication-order tests.
- `web/src/lib/admin/reference-data-request-body.ts`: 8 KiB streaming fatal-UTF-8 reader.
- `web/src/lib/admin/reference-data-request-body.test.ts`: declared, streamed, encoding, cancellation, and boundary tests.
- `web/src/lib/admin/category-service.ts`: Category list, create, and optimistic update operations.
- `web/src/lib/admin/category-service.test.ts`: Category authorization, query, mutation, duplicate, conflict, and redaction tests.
- `web/src/lib/admin/campus-location-service.ts`: CampusLocation list, create, and optimistic update operations.
- `web/src/lib/admin/campus-location-service.test.ts`: CampusLocation authorization, query, mutation, duplicate, conflict, and redaction tests.
- `web/src/app/api/admin/categories/route.ts`: administrator Category GET and POST adapters.
- `web/src/app/api/admin/categories/[categoryId]/route.ts`: administrator Category PATCH adapter.
- `web/src/app/api/admin/categories/admin-category-routes.test.ts`: Category route behavior and ordering tests.
- `web/src/app/api/admin/campus-locations/route.ts`: administrator CampusLocation GET and POST adapters.
- `web/src/app/api/admin/campus-locations/[campusLocationId]/route.ts`: administrator CampusLocation PATCH adapter.
- `web/src/app/api/admin/campus-locations/admin-campus-location-routes.test.ts`: CampusLocation route behavior and ordering tests.
- `docs/superpowers/verification/2026-08-27-administrator-reference-data-backend.md`: exact final evidence.

---

### Task 1: Define strict administrator reference-data contracts

**Files:**
- Create: `web/src/lib/admin/reference-data-contract.test.ts`
- Create: `web/src/lib/admin/reference-data-contract.ts`

**Interfaces:**
- Consumes: Zod 4 and the existing Category/CampusLocation field limits.
- Produces: `ADMIN_REFERENCE_DATA_PAGE_SIZE`, `referenceDataListQuerySchema`, `referenceDataObjectIdSchema`, `createAdminCategorySchema`, `updateAdminCategorySchema`, `createAdminCampusLocationSchema`, `updateAdminCampusLocationSchema`, `adminCategorySchema`, `adminCampusLocationSchema`, `adminCategoryPageSchema`, `adminCampusLocationPageSchema`, `toReferenceDataListQueryInput`, `toAdminCategory`, `toAdminCampusLocation`, and their inferred types.

- [ ] **Step 1: Write failing query and mutation contract tests**

Create `web/src/lib/admin/reference-data-contract.test.ts` with concrete valid fixtures and rejection cases:

```ts
import { describe, expect, it } from "vitest";

import {
  ADMIN_REFERENCE_DATA_PAGE_SIZE,
  adminCampusLocationPageSchema,
  adminCategoryPageSchema,
  createAdminCampusLocationSchema,
  createAdminCategorySchema,
  referenceDataListQuerySchema,
  referenceDataObjectIdSchema,
  toAdminCampusLocation,
  toAdminCategory,
  toReferenceDataListQueryInput,
  type AdminCategoryRecord,
  updateAdminCampusLocationSchema,
  updateAdminCategorySchema,
} from "./reference-data-contract";

const id = "64b64c6f2f4d9f1a2b3c4d51";
const updatedAt = "2026-08-27T02:00:00.000Z";

describe("administrator reference-data contracts", () => {
  it("normalizes a valid list query", () => {
    const input = toReferenceDataListQueryInput(
      new URLSearchParams("q=%EF%BC%ACibrary++desk&status=inactive&page=2"),
    );
    expect(referenceDataListQuerySchema.parse(input)).toEqual({
      q: "Library desk",
      status: "inactive",
      page: 2,
    });
  });

  it.each([
    "page=01",
    "page=0",
    "page=10001",
    "status=archived",
    "page=1&page=2",
    "unknown=value",
  ])("rejects the list query %s", (query) => {
    expect(
      referenceDataListQuerySchema.safeParse(
        toReferenceDataListQueryInput(new URLSearchParams(query)),
      ).success,
    ).toBe(false);
  });

  it("normalizes blank descriptions and controls active state", () => {
    expect(
      createAdminCategorySchema.parse({ name: " Electronics ", description: " " }),
    ).toEqual({ name: "Electronics", description: null });
    expect(
      createAdminCampusLocationSchema.parse({
        campusName: " Auckland ",
        locationName: " Library ",
      }),
    ).toEqual({
      campusName: "Auckland",
      locationName: "Library",
      description: null,
    });
  });

  it("requires one mutable field and a concurrency timestamp", () => {
    expect(updateAdminCategorySchema.safeParse({ updatedAt }).success).toBe(false);
    expect(
      updateAdminCategorySchema.parse({ updatedAt, isActive: false }),
    ).toEqual({ updatedAt, isActive: false });
    expect(
      updateAdminCampusLocationSchema.parse({
        updatedAt,
        description: " Reception level ",
      }),
    ).toEqual({ updatedAt, description: "Reception level" });
  });

  it("rejects server-owned and unknown fields", () => {
    expect(
      createAdminCategorySchema.safeParse({ name: "Keys", isActive: false }).success,
    ).toBe(false);
    expect(
      updateAdminCampusLocationSchema.safeParse({
        updatedAt,
        locationName: "Library",
        administratorId: id,
      }).success,
    ).toBe(false);
  });

  it("canonicalizes ObjectIds and maps allow-listed records", () => {
    expect(referenceDataObjectIdSchema.parse(id.toUpperCase())).toBe(id);
    const record: AdminCategoryRecord & { privateValue: string } = {
      _id: { toString: () => id },
      name: "Electronics",
      description: null,
      isActive: true,
      createdAt: new Date("2026-08-27T01:00:00.000Z"),
      updatedAt: new Date(updatedAt),
      privateValue: "not mapped",
    };
    expect(toAdminCategory(record)).toEqual({
      id,
      name: "Electronics",
      description: null,
      isActive: true,
      createdAt: "2026-08-27T01:00:00.000Z",
      updatedAt,
    });
  });

  it("validates exact page invariants", () => {
    expect(ADMIN_REFERENCE_DATA_PAGE_SIZE).toBe(20);
    const page = {
      categories: [],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    };
    expect(
      adminCategoryPageSchema.parse(page),
    ).toEqual(page);
    expect(
      adminCampusLocationPageSchema.safeParse({
        campusLocations: [],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 2,
      }).success,
    ).toBe(false);
  });

  it("maps a campus location without unknown fields", () => {
    expect(
      toAdminCampusLocation({
        _id: { toString: () => id },
        campusName: "Auckland",
        locationName: "Library",
        description: null,
        isActive: false,
        createdAt: new Date("2026-08-27T01:00:00.000Z"),
        updatedAt: new Date(updatedAt),
      }),
    ).toEqual({
      id,
      campusName: "Auckland",
      locationName: "Library",
      description: null,
      isActive: false,
      createdAt: "2026-08-27T01:00:00.000Z",
      updatedAt,
    });
  });
});
```

- [ ] **Step 2: Run the contract test and verify the module is missing**

Run from `web/`:

```powershell
npm.cmd test -- src/lib/admin/reference-data-contract.test.ts
```

Expected: FAIL because `reference-data-contract.ts` does not exist.

- [ ] **Step 3: Implement the strict contracts and mappers**

Create `web/src/lib/admin/reference-data-contract.ts`. Use these exact public shapes and parser boundaries:

```ts
import { z } from "zod";

export const ADMIN_REFERENCE_DATA_PAGE_SIZE = 20;
export const REFERENCE_DATA_STATUSES = ["all", "active", "inactive"] as const;

const CONTROL_OR_FORMAT_PATTERN = /[\p{Cc}\p{Cf}]/u;
const normalizeText = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/gu, " ");
const boundedText = (minimum: number, maximum: number) =>
  z
    .string()
    .refine((value) => !CONTROL_OR_FORMAT_PATTERN.test(value))
    .transform(normalizeText)
    .pipe(z.string().min(minimum).max(maximum));
const descriptionInput = z
  .union([z.string().trim().max(300), z.null()])
  .transform((value) => (value === "" ? null : value));
const canonicalPage = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(10_000));
const optionalSearch = z
  .string()
  .refine((value) => !CONTROL_OR_FORMAT_PATTERN.test(value))
  .transform(normalizeText)
  .pipe(z.string().max(80))
  .transform((value) => (value === "" ? undefined : value))
  .optional();

export const referenceDataListQuerySchema = z.strictObject({
  q: optionalSearch,
  status: z.enum(REFERENCE_DATA_STATUSES).default("all"),
  page: canonicalPage.default(1),
});

export const referenceDataObjectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Reference data ID is invalid")
  .transform((value) => value.toLowerCase());

export const createAdminCategorySchema = z.strictObject({
  name: boundedText(2, 80),
  description: descriptionInput.optional().transform((value) => value ?? null),
});

export const updateAdminCategorySchema = z
  .strictObject({
    updatedAt: z.string().datetime({ offset: true }),
    name: boundedText(2, 80).optional(),
    description: descriptionInput.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    ({ name, description, isActive }) =>
      name !== undefined || description !== undefined || isActive !== undefined,
    { message: "Provide at least one category change" },
  );

export const createAdminCampusLocationSchema = z.strictObject({
  campusName: boundedText(2, 80),
  locationName: boundedText(2, 120),
  description: descriptionInput.optional().transform((value) => value ?? null),
});

export const updateAdminCampusLocationSchema = z
  .strictObject({
    updatedAt: z.string().datetime({ offset: true }),
    campusName: boundedText(2, 80).optional(),
    locationName: boundedText(2, 120).optional(),
    description: descriptionInput.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    ({ campusName, locationName, description, isActive }) =>
      campusName !== undefined ||
      locationName !== undefined ||
      description !== undefined ||
      isActive !== undefined,
    { message: "Provide at least one campus location change" },
  );

export const adminCategorySchema = z.strictObject({
  id: referenceDataObjectIdSchema,
  name: z.string().min(2).max(80),
  description: z.string().max(300).nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const adminCampusLocationSchema = z.strictObject({
  id: referenceDataObjectIdSchema,
  campusName: z.string().min(2).max(80),
  locationName: z.string().min(2).max(120),
  description: z.string().max(300).nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

const paginationFields = {
  page: z.number().int().min(1).max(10_000),
  pageSize: z.literal(ADMIN_REFERENCE_DATA_PAGE_SIZE),
  total: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  totalPages: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
};
const hasConsistentPagination = ({ total, totalPages }: {
  total: number;
  totalPages: number;
}) => totalPages === Math.ceil(total / ADMIN_REFERENCE_DATA_PAGE_SIZE);

export const adminCategoryPageSchema = z
  .strictObject({
    categories: z.array(adminCategorySchema).max(ADMIN_REFERENCE_DATA_PAGE_SIZE),
    ...paginationFields,
  })
  .refine(hasConsistentPagination, {
    message: "Reference data pagination total is inconsistent",
  });

export const adminCampusLocationPageSchema = z
  .strictObject({
    campusLocations: z
      .array(adminCampusLocationSchema)
      .max(ADMIN_REFERENCE_DATA_PAGE_SIZE),
    ...paginationFields,
  })
  .refine(hasConsistentPagination, {
    message: "Reference data pagination total is inconsistent",
  });

export type ReferenceDataListQuery = z.output<typeof referenceDataListQuerySchema>;
export type CreateAdminCategoryInput = z.output<typeof createAdminCategorySchema>;
export type UpdateAdminCategoryInput = z.output<typeof updateAdminCategorySchema>;
export type CreateAdminCampusLocationInput = z.output<
  typeof createAdminCampusLocationSchema
>;
export type UpdateAdminCampusLocationInput = z.output<
  typeof updateAdminCampusLocationSchema
>;
export type AdminCategory = z.infer<typeof adminCategorySchema>;
export type AdminCampusLocation = z.infer<typeof adminCampusLocationSchema>;
export type AdminCategoryPage = z.infer<typeof adminCategoryPageSchema>;
export type AdminCampusLocationPage = z.infer<typeof adminCampusLocationPageSchema>;

type Identifier = { toString(): string };
export type AdminCategoryRecord = {
  _id: Identifier;
  name: unknown;
  description?: unknown;
  isActive: unknown;
  createdAt: Date;
  updatedAt: Date;
};
export type AdminCampusLocationRecord = {
  _id: Identifier;
  campusName: unknown;
  locationName: unknown;
  description?: unknown;
  isActive: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export function toReferenceDataListQueryInput(searchParams: URLSearchParams) {
  const input: Record<string, string | string[]> = {};
  for (const [key, value] of searchParams) {
    const current = input[key];
    input[key] =
      current === undefined
        ? value
        : Array.isArray(current)
          ? [...current, value]
          : [current, value];
  }
  return input;
}

export function toAdminCategory(record: AdminCategoryRecord): AdminCategory {
  return adminCategorySchema.parse({
    id: record._id.toString(),
    name: record.name,
    description: record.description ?? null,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

export function toAdminCampusLocation(
  record: AdminCampusLocationRecord,
): AdminCampusLocation {
  return adminCampusLocationSchema.parse({
    id: record._id.toString(),
    campusName: record.campusName,
    locationName: record.locationName,
    description: record.description ?? null,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}
```

- [ ] **Step 4: Run the contract tests**

```powershell
npm.cmd test -- src/lib/admin/reference-data-contract.test.ts
```

Expected: PASS with every contract test green.

- [ ] **Step 5: Run TypeScript and ESLint for the new boundary**

```powershell
npm.cmd exec -- tsc --noEmit --incremental false
npm.cmd run lint -- src/lib/admin/reference-data-contract.ts src/lib/admin/reference-data-contract.test.ts
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit Task 1**

```powershell
git add web/src/lib/admin/reference-data-contract.ts web/src/lib/admin/reference-data-contract.test.ts
git commit -m "feat(admin): define reference data contracts"
```

---

### Task 2: Add the closed safety boundary

**Files:**
- Create: `web/src/lib/admin/reference-data-errors.test.ts`
- Create: `web/src/lib/admin/reference-data-errors.ts`
- Create: `web/src/lib/admin/reference-data-access.test.ts`
- Create: `web/src/lib/admin/reference-data-access.ts`
- Create: `web/src/lib/admin/reference-data-request-body.test.ts`
- Create: `web/src/lib/admin/reference-data-request-body.ts`

**Interfaces:**
- Consumes: `PublicUser`, `readSessionCookie`, `getCurrentUser`, and `AuthError`.
- Produces: `ReferenceDataManagementError`, `referenceDataManagementErrorResponse`, `invalidReferenceDataResponse`, `isDuplicateKeyError`, `requireReferenceDataAdministrator`, `getCurrentReferenceDataAdministrator`, `REFERENCE_DATA_REQUEST_BODY_LIMIT`, `ReferenceDataBodyTooLarge`, `InvalidReferenceDataBodyEncoding`, and `readReferenceDataRequestBody`.

- [ ] **Step 1: Write failing error, access, and request-reader tests**

Create table-driven tests with these exact assertions:

```ts
// reference-data-errors.test.ts
import { describe, expect, it } from "vitest";
import { AuthError } from "@/lib/auth/errors";
import {
  ReferenceDataManagementError,
  invalidReferenceDataResponse,
  isDuplicateKeyError,
  referenceDataManagementErrorResponse,
} from "./reference-data-errors";

describe("reference data management errors", () => {
  it.each([
    ["ADMINISTRATOR_REQUIRED", 403, "Administrator access required"],
    ["REFERENCE_DATA_NOT_FOUND", 404, "Reference data not found"],
    ["REFERENCE_DATA_DUPLICATE", 409, "Reference data already exists"],
    ["REFERENCE_DATA_STATE_CONFLICT", 409, "Reference data has changed"],
    ["REFERENCE_DATA_OPERATION_FAILED", 500, "Reference data operation failed"],
  ] as const)("maps %s safely", async (code, status, message) => {
    const response = referenceDataManagementErrorResponse(
      new ReferenceDataManagementError(code),
    );
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: { code, message } });
  });

  it("maps authentication and invalid requests exactly", async () => {
    expect(
      referenceDataManagementErrorResponse(
        new AuthError("AUTHENTICATION_REQUIRED"),
      ).status,
    ).toBe(401);
    const invalid = invalidReferenceDataResponse();
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({
      error: {
        code: "INVALID_REFERENCE_DATA_REQUEST",
        message: "Reference data request is invalid",
      },
    });
  });

  it("redacts unknown failures and recognizes only code 11000", async () => {
    const response = referenceDataManagementErrorResponse(
      new Error("mongodb://private-host stack detail"),
    );
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("private-host");
    expect(isDuplicateKeyError({ code: 11000 })).toBe(true);
    expect(isDuplicateKeyError({ code: "11000" })).toBe(false);
  });
});
```

```ts
// reference-data-access.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { PublicUser } from "@/lib/auth/public-user";
import {
  getCurrentReferenceDataAdministrator,
  requireReferenceDataAdministrator,
} from "./reference-data-access";

const administrator = {
  id: "64b64c6f2f4d9f1a2b3c4d50",
  email: "admin@example.test",
  displayName: "Admin User",
  role: "administrator",
  status: "active",
  lastLoginAt: null,
  profile: {
    preferredContactMethod: "email",
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
} satisfies PublicUser;

describe("reference data administrator access", () => {
  beforeEach(() => {
    vi.mocked(readSessionCookie).mockResolvedValue("session-token");
    vi.mocked(getCurrentUser).mockResolvedValue(administrator);
  });

  it("returns the active administrator from the current session", async () => {
    await expect(getCurrentReferenceDataAdministrator()).resolves.toBe(
      administrator,
    );
    expect(getCurrentUser).toHaveBeenCalledWith("session-token");
  });

  it.each([
    [{ ...administrator, role: "student" as const }, "student"],
    [{ ...administrator, role: "staff" as const }, "staff"],
    [{ ...administrator, status: "suspended" as const }, "suspended"],
    [{ ...administrator, status: "deactivated" as const }, "deactivated"],
  ])("rejects the %s account", (user) => {
    expect(() => requireReferenceDataAdministrator(user)).toThrow(
      expect.objectContaining({ code: "ADMINISTRATOR_REQUIRED" }),
    );
  });

  it("rejects a missing current user as authentication required", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(getCurrentReferenceDataAdministrator()).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
    });
  });
});
```

```ts
// reference-data-request-body.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  InvalidReferenceDataBodyEncoding,
  REFERENCE_DATA_REQUEST_BODY_LIMIT,
  ReferenceDataBodyTooLarge,
  readReferenceDataRequestBody,
} from "./reference-data-request-body";

describe("reference data request body", () => {
  it("accepts exactly 8 KiB", async () => {
    const text = "a".repeat(8 * 1024);
    await expect(
      readReferenceDataRequestBody(new Request("http://localhost", {
        method: "POST",
        body: text,
      })),
    ).resolves.toBe(text);
    expect(REFERENCE_DATA_REQUEST_BODY_LIMIT).toBe(8 * 1024);
  });

  it("rejects declared and streamed overflow", async () => {
    await expect(
      readReferenceDataRequestBody(new Request("http://localhost", {
        method: "POST",
        headers: { "content-length": String(8 * 1024 + 1) },
        body: "{}",
      })),
    ).rejects.toBeInstanceOf(ReferenceDataBodyTooLarge);
    await expect(
      readReferenceDataRequestBody(new Request("http://localhost", {
        method: "POST",
        body: "a".repeat(8 * 1024 + 1),
      })),
    ).rejects.toBeInstanceOf(ReferenceDataBodyTooLarge);
  });

  it("rejects invalid UTF-8", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: new Uint8Array([0xc3, 0x28]),
    });
    await expect(readReferenceDataRequestBody(request)).rejects.toBeInstanceOf(
      InvalidReferenceDataBodyEncoding,
    );
  });
});
```

Insert these cases inside the same `describe` block:

```ts
it("preserves an unknown stream failure for safe 500 mapping", async () => {
  const request = new Request("http://localhost", {
    method: "POST",
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("private stream detail"));
      },
    }),
  });
  let failure: unknown;
  try {
    await readReferenceDataRequestBody(request);
  } catch (error) {
    failure = error;
  }
  expect(failure).toEqual(
    expect.objectContaining({ message: "Reference data request body stream failed" }),
  );
  expect(failure).not.toBeInstanceOf(ReferenceDataBodyTooLarge);
  expect(failure).not.toBeInstanceOf(InvalidReferenceDataBodyEncoding);
});

it("cancels the stream when streamed bytes exceed 8 KiB", async () => {
  const cancel = vi.fn();
  const request = new Request("http://localhost", {
    method: "POST",
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8 * 1024 + 1));
      },
      cancel,
    }),
  });
  await expect(readReferenceDataRequestBody(request)).rejects.toBeInstanceOf(
    ReferenceDataBodyTooLarge,
  );
  expect(cancel).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run the safety tests and verify the modules are missing**

```powershell
npm.cmd test -- src/lib/admin/reference-data-errors.test.ts src/lib/admin/reference-data-access.test.ts src/lib/admin/reference-data-request-body.test.ts
```

Expected: FAIL because the three production modules do not exist.

- [ ] **Step 3: Implement closed errors and duplicate classification**

Create `web/src/lib/admin/reference-data-errors.ts`:

```ts
import { AuthError, authErrorResponse } from "@/lib/auth/errors";

const definitions = {
  ADMINISTRATOR_REQUIRED: {
    status: 403,
    message: "Administrator access required",
  },
  REFERENCE_DATA_NOT_FOUND: {
    status: 404,
    message: "Reference data not found",
  },
  REFERENCE_DATA_DUPLICATE: {
    status: 409,
    message: "Reference data already exists",
  },
  REFERENCE_DATA_STATE_CONFLICT: {
    status: 409,
    message: "Reference data has changed",
  },
  REFERENCE_DATA_OPERATION_FAILED: {
    status: 500,
    message: "Reference data operation failed",
  },
} as const;

export type ReferenceDataManagementErrorCode = keyof typeof definitions;

export class ReferenceDataManagementError extends Error {
  readonly code: ReferenceDataManagementErrorCode;
  readonly status: number;

  constructor(code: ReferenceDataManagementErrorCode) {
    const definition = definitions[code];
    super(definition.message);
    this.name = "ReferenceDataManagementError";
    this.code = code;
    this.status = definition.status;
  }
}

export function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

export function invalidReferenceDataResponse() {
  return Response.json(
    {
      error: {
        code: "INVALID_REFERENCE_DATA_REQUEST",
        message: "Reference data request is invalid",
      },
    },
    { status: 400 },
  );
}

export function referenceDataManagementErrorResponse(error: unknown) {
  if (error instanceof AuthError && error.code === "AUTHENTICATION_REQUIRED") {
    return authErrorResponse(new AuthError("AUTHENTICATION_REQUIRED"));
  }
  const safe =
    error instanceof ReferenceDataManagementError
      ? new ReferenceDataManagementError(error.code)
      : new ReferenceDataManagementError("REFERENCE_DATA_OPERATION_FAILED");
  return Response.json(
    { error: { code: safe.code, message: safe.message } },
    { status: safe.status },
  );
}
```

- [ ] **Step 4: Implement current-administrator resolution**

Create `web/src/lib/admin/reference-data-access.ts`:

```ts
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";

import { ReferenceDataManagementError } from "./reference-data-errors";

export function requireReferenceDataAdministrator(user: PublicUser) {
  if (user.role !== "administrator" || user.status !== "active") {
    throw new ReferenceDataManagementError("ADMINISTRATOR_REQUIRED");
  }
}

export async function getCurrentReferenceDataAdministrator() {
  const user = await getCurrentUser(await readSessionCookie());
  if (!user) throw new AuthError("AUTHENTICATION_REQUIRED");
  requireReferenceDataAdministrator(user);
  return user;
}
```

- [ ] **Step 5: Implement the exact 8 KiB reader**

Create `web/src/lib/admin/reference-data-request-body.ts` with the complete
domain-specific bounded reader:

```ts
export const REFERENCE_DATA_REQUEST_BODY_LIMIT = 8 * 1024;

export class ReferenceDataBodyTooLarge extends Error {
  constructor() {
    super("Reference data request body exceeds the size limit");
    this.name = "ReferenceDataBodyTooLarge";
  }
}

export class InvalidReferenceDataBodyEncoding extends Error {
  constructor() {
    super("Reference data request body is not valid UTF-8");
    this.name = "InvalidReferenceDataBodyEncoding";
  }
}

async function cancelBody(body: ReadableStream<Uint8Array> | null) {
  try {
    await body?.cancel();
  } catch {
    // Preserve the original request-body error classification.
  }
}

export async function readReferenceDataRequestBody(
  request: Request,
): Promise<string> {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > REFERENCE_DATA_REQUEST_BODY_LIMIT
  ) {
    await cancelBody(request.body);
    throw new ReferenceDataBodyTooLarge();
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteLength = 0;
  let text = "";

  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        throw new Error("Reference data request body stream failed");
      }

      if (chunk.done) {
        try {
          return text + decoder.decode();
        } catch {
          throw new InvalidReferenceDataBodyEncoding();
        }
      }

      byteLength += chunk.value.byteLength;
      if (byteLength > REFERENCE_DATA_REQUEST_BODY_LIMIT) {
        throw new ReferenceDataBodyTooLarge();
      }
      try {
        text += decoder.decode(chunk.value, { stream: true });
      } catch {
        throw new InvalidReferenceDataBodyEncoding();
      }
    }
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // Preserve the original request-body error classification.
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}
```

- [ ] **Step 6: Run the safety boundary tests**

```powershell
npm.cmd test -- src/lib/admin/reference-data-errors.test.ts src/lib/admin/reference-data-access.test.ts src/lib/admin/reference-data-request-body.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run TypeScript and ESLint**

```powershell
npm.cmd exec -- tsc --noEmit --incremental false
npm.cmd run lint -- src/lib/admin/reference-data-errors.ts src/lib/admin/reference-data-errors.test.ts src/lib/admin/reference-data-access.ts src/lib/admin/reference-data-access.test.ts src/lib/admin/reference-data-request-body.ts src/lib/admin/reference-data-request-body.test.ts
```

Expected: both commands exit 0.

- [ ] **Step 8: Commit Task 2**

```powershell
git add web/src/lib/admin/reference-data-errors.ts web/src/lib/admin/reference-data-errors.test.ts web/src/lib/admin/reference-data-access.ts web/src/lib/admin/reference-data-access.test.ts web/src/lib/admin/reference-data-request-body.ts web/src/lib/admin/reference-data-request-body.test.ts
git commit -m "feat(admin): add reference data safety boundary"
```

---

### Task 3: Implement Category list, create, and optimistic update services

**Files:**
- Create: `web/src/lib/admin/category-service.test.ts`
- Create: `web/src/lib/admin/category-service.ts`

**Interfaces:**
- Consumes: `ReferenceDataListQuery`, `CreateAdminCategoryInput`, `UpdateAdminCategoryInput`, `AdminCategory`, `AdminCategoryPage`, `toAdminCategory`, `adminCategoryPageSchema`, `requireReferenceDataAdministrator`, `ReferenceDataManagementError`, `isDuplicateKeyError`, `connectToDatabase`, and `CategoryModel`.
- Produces: `escapeReferenceDataSearch(value: string): string`, `listAdminCategories(administrator, query): Promise<AdminCategoryPage>`, `createAdminCategory(administrator, input): Promise<AdminCategory>`, and `updateAdminCategory(administrator, categoryId, input): Promise<AdminCategory>`.

- [ ] **Step 1: Write failing Category service tests**

Create `web/src/lib/admin/category-service.test.ts` with model and database mocks:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/category", () => ({
  CategoryModel: {
    aggregate: vi.fn(),
    create: vi.fn(),
    findOneAndUpdate: vi.fn(),
    exists: vi.fn(),
  },
}));

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { CategoryModel } from "@/models/category";
import {
  createAdminCategory,
  escapeReferenceDataSearch,
  listAdminCategories,
  updateAdminCategory,
} from "./category-service";

const id = "64b64c6f2f4d9f1a2b3c4d51";
const administrator = {
  id: "64b64c6f2f4d9f1a2b3c4d50",
  email: "admin@example.test",
  displayName: "Admin User",
  role: "administrator",
  status: "active",
  lastLoginAt: null,
  profile: {
    preferredContactMethod: "email",
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
} satisfies PublicUser;
const row = {
  _id: { toString: () => id },
  name: "Electronics",
  description: null,
  isActive: true,
  createdAt: new Date("2026-08-27T01:00:00.000Z"),
  updatedAt: new Date("2026-08-27T02:00:00.000Z"),
};

function aggregateReturning(result: unknown) {
  const query = {
    collation: vi.fn(),
    exec: vi.fn().mockResolvedValue(result),
  };
  query.collation.mockReturnValue(query);
  vi.mocked(CategoryModel.aggregate).mockReturnValue(query as never);
  return query;
}

function updateReturning(result: unknown) {
  const query = {
    lean: vi.fn(),
    exec: vi.fn().mockResolvedValue(result),
  };
  query.lean.mockReturnValue(query);
  vi.mocked(CategoryModel.findOneAndUpdate).mockReturnValue(query as never);
  return query;
}

describe("administrator Category service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectToDatabase).mockResolvedValue({} as never);
  });

  it("authorizes before connecting", async () => {
    await expect(
      listAdminCategories(
        { ...administrator, role: "student" },
        { status: "all", page: 1 },
      ),
    ).rejects.toMatchObject({ code: "ADMINISTRATOR_REQUIRED" });
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  it("escapes search and returns a stable inactive page", async () => {
    const query = aggregateReturning([
      { categories: [row], metadata: [{ totalItems: 1 }] },
    ]);
    await expect(
      listAdminCategories(administrator, {
        q: "lap(top)+",
        status: "inactive",
        page: 2,
      }),
    ).resolves.toEqual({
      categories: [expect.objectContaining({ id, name: "Electronics" })],
      page: 2,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    expect(escapeReferenceDataSearch("lap(top)+")).toBe("lap\\(top\\)\\+");
    expect(CategoryModel.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $match: expect.objectContaining({ isActive: false }),
        }),
      ]),
    );
    expect(query.collation).toHaveBeenCalledWith({ locale: "en", strength: 2 });
  });

  it("creates a server-controlled active category", async () => {
    vi.mocked(CategoryModel.create).mockResolvedValue({
      toObject: () => row,
    } as never);
    await expect(
      createAdminCategory(administrator, {
        name: "Electronics",
        description: null,
      }),
    ).resolves.toEqual(expect.objectContaining({ id, isActive: true }));
    expect(CategoryModel.create).toHaveBeenCalledWith({
      name: "Electronics",
      description: null,
      isActive: true,
    });
  });

  it("updates with the exact ID and timestamp", async () => {
    const query = updateReturning({ ...row, isActive: false });
    await expect(
      updateAdminCategory(administrator, id, {
        updatedAt: "2026-08-27T02:00:00.000Z",
        isActive: false,
      }),
    ).resolves.toEqual(expect.objectContaining({ id, isActive: false }));
    expect(CategoryModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: expect.anything(), updatedAt: new Date("2026-08-27T02:00:00.000Z") },
      { $set: { isActive: false } },
      { new: true, runValidators: true },
    );
    expect(query.lean).toHaveBeenCalledOnce();
  });

  it.each([
    [null, null, "REFERENCE_DATA_NOT_FOUND"],
    [null, { _id: id }, "REFERENCE_DATA_STATE_CONFLICT"],
  ])("classifies a failed atomic update", async (updated, exists, code) => {
    updateReturning(updated);
    vi.mocked(CategoryModel.exists).mockResolvedValue(exists as never);
    await expect(
      updateAdminCategory(administrator, id, {
        updatedAt: "2026-08-27T02:00:00.000Z",
        name: "Devices",
      }),
    ).rejects.toMatchObject({ code });
  });

  it("maps duplicate and unknown failures without leaking details", async () => {
    vi.mocked(CategoryModel.create).mockRejectedValueOnce({
      code: 11000,
      keyValue: { name: "private stored value" },
    });
    await expect(
      createAdminCategory(administrator, { name: "Electronics", description: null }),
    ).rejects.toMatchObject({ code: "REFERENCE_DATA_DUPLICATE" });
    vi.mocked(CategoryModel.create).mockRejectedValueOnce(
      new Error("mongodb private detail"),
    );
    await expect(
      createAdminCategory(administrator, { name: "Keys", description: null }),
    ).rejects.toMatchObject({ code: "REFERENCE_DATA_OPERATION_FAILED" });
  });
});
```

Insert these cases inside the same `describe` block:

```ts
it.each([
  ["all", undefined],
  ["active", true],
] as const)("applies the %s status filter and bounded page skip", async (status, active) => {
  aggregateReturning([{ categories: [], metadata: [] }]);
  await listAdminCategories(administrator, { status, page: 2 });
  const pipeline = vi.mocked(CategoryModel.aggregate).mock.calls.at(-1)?.[0] as
    | Array<Record<string, unknown>>
    | undefined;
  expect(pipeline).toBeDefined();
  const match = pipeline?.[0]?.$match as Record<string, unknown>;
  if (active === undefined) expect(match).not.toHaveProperty("isActive");
  else expect(match).toHaveProperty("isActive", active);
  expect(pipeline?.[1]).toEqual(
    expect.objectContaining({
      $facet: expect.objectContaining({
        categories: expect.arrayContaining([
          { $skip: 20 },
          { $limit: 20 },
        ]),
      }),
    }),
  );
});

it("returns a valid empty page", async () => {
  aggregateReturning([{ categories: [], metadata: [] }]);
  await expect(
    listAdminCategories(administrator, { status: "all", page: 1 }),
  ).resolves.toEqual({
    categories: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
});

it("maps duplicate updates and unsafe model output safely", async () => {
  const updateQuery = updateReturning(null);
  updateQuery.exec.mockRejectedValueOnce({ code: 11000 });
  await expect(
    updateAdminCategory(administrator, id, {
      updatedAt: "2026-08-27T02:00:00.000Z",
      name: "Devices",
    }),
  ).rejects.toMatchObject({ code: "REFERENCE_DATA_DUPLICATE" });

  aggregateReturning([
    {
      categories: [{ ...row, name: "x", privateValue: "hidden" }],
      metadata: [{ totalItems: 1 }],
    },
  ]);
  await expect(
    listAdminCategories(administrator, { status: "all", page: 1 }),
  ).rejects.toMatchObject({ code: "REFERENCE_DATA_OPERATION_FAILED" });
});

it("maps an authorized model failure to the closed operation error", async () => {
  vi.mocked(CategoryModel.aggregate).mockImplementationOnce(() => {
    throw new Error("mongodb private detail");
  });
  await expect(
    listAdminCategories(administrator, { status: "all", page: 1 }),
  ).rejects.toMatchObject({ code: "REFERENCE_DATA_OPERATION_FAILED" });
  expect(connectToDatabase).toHaveBeenCalledOnce();
});
```

Task 7 performs the unchanged-model and no-ItemReport scope checks against the
complete branch diff.

- [ ] **Step 2: Run the Category service test and verify failure**

```powershell
npm.cmd test -- src/lib/admin/category-service.test.ts
```

Expected: FAIL because `category-service.ts` does not exist.

- [ ] **Step 3: Implement Category service operations**

Create `web/src/lib/admin/category-service.ts` with these signatures and the
approved aggregate/update behavior:

```ts
import { Types, type PipelineStage } from "mongoose";

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { CategoryModel } from "@/models/category";

import { requireReferenceDataAdministrator } from "./reference-data-access";
import {
  ADMIN_REFERENCE_DATA_PAGE_SIZE,
  adminCategoryPageSchema,
  toAdminCategory,
  type AdminCategory,
  type AdminCategoryPage,
  type AdminCategoryRecord,
  type CreateAdminCategoryInput,
  type ReferenceDataListQuery,
  type UpdateAdminCategoryInput,
} from "./reference-data-contract";
import {
  isDuplicateKeyError,
  ReferenceDataManagementError,
} from "./reference-data-errors";

type CategoryFacet = {
  categories: AdminCategoryRecord[];
  metadata: Array<{ totalItems: number }>;
};

export function escapeReferenceDataSearch(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rethrowCategoryError(error: unknown): never {
  if (error instanceof ReferenceDataManagementError) throw error;
  if (isDuplicateKeyError(error)) {
    throw new ReferenceDataManagementError("REFERENCE_DATA_DUPLICATE");
  }
  throw new ReferenceDataManagementError("REFERENCE_DATA_OPERATION_FAILED");
}

export async function listAdminCategories(
  administrator: PublicUser,
  query: ReferenceDataListQuery,
): Promise<AdminCategoryPage> {
  requireReferenceDataAdministrator(administrator);
  try {
    await connectToDatabase();
    const search = query.q ? escapeReferenceDataSearch(query.q) : undefined;
    const match = {
      ...(query.status === "active" ? { isActive: true } : {}),
      ...(query.status === "inactive" ? { isActive: false } : {}),
      ...(search
        ? {
            $or: [
              { name: { $regex: search, $options: "i" } },
              { description: { $regex: search, $options: "i" } },
            ],
          }
        : {}),
    };
    const pipeline: PipelineStage[] = [
      { $match: match },
      {
        $facet: {
          categories: [
            { $sort: { name: 1, _id: 1 } },
            { $skip: (query.page - 1) * ADMIN_REFERENCE_DATA_PAGE_SIZE },
            { $limit: ADMIN_REFERENCE_DATA_PAGE_SIZE },
            {
              $project: {
                _id: 1,
                name: 1,
                description: 1,
                isActive: 1,
                createdAt: 1,
                updatedAt: 1,
              },
            },
          ],
          metadata: [{ $count: "totalItems" }],
        },
      },
    ];
    const result = (await CategoryModel.aggregate(pipeline)
      .collation({ locale: "en", strength: 2 })
      .exec()) as CategoryFacet[];
    const facet = result[0];
    if (!facet) throw new Error("Category aggregate returned no facet");
    const total = facet.metadata[0]?.totalItems ?? 0;
    return adminCategoryPageSchema.parse({
      categories: facet.categories.map(toAdminCategory),
      page: query.page,
      pageSize: ADMIN_REFERENCE_DATA_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / ADMIN_REFERENCE_DATA_PAGE_SIZE),
    });
  } catch (error) {
    rethrowCategoryError(error);
  }
}

export async function createAdminCategory(
  administrator: PublicUser,
  input: CreateAdminCategoryInput,
): Promise<AdminCategory> {
  requireReferenceDataAdministrator(administrator);
  try {
    await connectToDatabase();
    const created = await CategoryModel.create({
      name: input.name,
      description: input.description,
      isActive: true,
    });
    return toAdminCategory(created.toObject() as AdminCategoryRecord);
  } catch (error) {
    rethrowCategoryError(error);
  }
}

export async function updateAdminCategory(
  administrator: PublicUser,
  categoryId: string,
  input: UpdateAdminCategoryInput,
): Promise<AdminCategory> {
  requireReferenceDataAdministrator(administrator);
  try {
    await connectToDatabase();
    const { updatedAt, ...changes } = input;
    const objectId = new Types.ObjectId(categoryId);
    const updated = await CategoryModel.findOneAndUpdate(
      { _id: objectId, updatedAt: new Date(updatedAt) },
      { $set: changes },
      { new: true, runValidators: true },
    )
      .lean<AdminCategoryRecord | null>()
      .exec();
    if (!updated) {
      const exists = await CategoryModel.exists({ _id: objectId });
      throw new ReferenceDataManagementError(
        exists ? "REFERENCE_DATA_STATE_CONFLICT" : "REFERENCE_DATA_NOT_FOUND",
      );
    }
    return toAdminCategory(updated);
  } catch (error) {
    rethrowCategoryError(error);
  }
}
```

Use the exact tested search escape regex from the implementation, even if the
Markdown renderer displays the character class differently; verify its runtime
result with the `lap(top)+` assertion before committing.

- [ ] **Step 4: Run Category service tests**

```powershell
npm.cmd test -- src/lib/admin/category-service.test.ts src/lib/admin/reference-data-contract.test.ts src/lib/admin/reference-data-access.test.ts src/lib/admin/reference-data-errors.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run TypeScript and ESLint**

```powershell
npm.cmd exec -- tsc --noEmit --incremental false
npm.cmd run lint -- src/lib/admin/category-service.ts src/lib/admin/category-service.test.ts
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit Task 3**

```powershell
git add web/src/lib/admin/category-service.ts web/src/lib/admin/category-service.test.ts
git commit -m "feat(admin): manage report categories safely"
```

---

### Task 4: Expose administrator Category routes

**Files:**
- Create: `web/src/app/api/admin/categories/admin-category-routes.test.ts`
- Create: `web/src/app/api/admin/categories/route.ts`
- Create: `web/src/app/api/admin/categories/[categoryId]/route.ts`

**Interfaces:**
- Consumes: current-administrator resolution, strict Category schemas, the 8 KiB reader, safe errors, and the three Category service functions from Tasks 1-3.
- Produces: `GET` and `POST` for `/api/admin/categories`, plus `PATCH` for `/api/admin/categories/{categoryId}`.

- [ ] **Step 1: Write failing Category route tests**

Mock the access and service boundary rather than MongoDB:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/reference-data-access", () => ({
  getCurrentReferenceDataAdministrator: vi.fn(),
}));
vi.mock("@/lib/admin/category-service", () => ({
  listAdminCategories: vi.fn(),
  createAdminCategory: vi.fn(),
  updateAdminCategory: vi.fn(),
}));

import { getCurrentReferenceDataAdministrator } from "@/lib/admin/reference-data-access";
import {
  createAdminCategory,
  listAdminCategories,
  updateAdminCategory,
} from "@/lib/admin/category-service";
import { ReferenceDataManagementError } from "@/lib/admin/reference-data-errors";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { GET, POST } from "./route";
import { PATCH } from "./[categoryId]/route";

const id = "64b64c6f2f4d9f1a2b3c4d51";
const administrator = {
  id: "64b64c6f2f4d9f1a2b3c4d50",
  role: "administrator",
  status: "active",
} as PublicUser;
const category = {
  id,
  name: "Electronics",
  description: null,
  isActive: true,
  createdAt: "2026-08-27T01:00:00.000Z",
  updatedAt: "2026-08-27T02:00:00.000Z",
};

function jsonRequest(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("administrator Category routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentReferenceDataAdministrator).mockResolvedValue(administrator);
  });

  it("lists a validated query with no-store", async () => {
    vi.mocked(listAdminCategories).mockResolvedValue({
      categories: [category],
      page: 2,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    const response = await GET(
      new Request("http://localhost/api/admin/categories?q=Keys&status=active&page=2"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(listAdminCategories).toHaveBeenCalledWith(administrator, {
      q: "Keys",
      status: "active",
      page: 2,
    });
  });

  it("creates a category with HTTP 201", async () => {
    vi.mocked(createAdminCategory).mockResolvedValue(category);
    const response = await POST(
      jsonRequest("http://localhost/api/admin/categories", "POST", {
        name: " Electronics ",
        description: " ",
      }),
    );
    expect(response.status).toBe(201);
    expect(createAdminCategory).toHaveBeenCalledWith(administrator, {
      name: "Electronics",
      description: null,
    });
    await expect(response.json()).resolves.toEqual({ category });
  });

  it("updates a category with the path ID and timestamp", async () => {
    vi.mocked(updateAdminCategory).mockResolvedValue({
      ...category,
      isActive: false,
    });
    const response = await PATCH(
      jsonRequest(`http://localhost/api/admin/categories/${id}`, "PATCH", {
        updatedAt: category.updatedAt,
        isActive: false,
      }),
      { params: Promise.resolve({ categoryId: id }) },
    );
    expect(response.status).toBe(200);
    expect(updateAdminCategory).toHaveBeenCalledWith(administrator, id, {
      updatedAt: category.updatedAt,
      isActive: false,
    });
  });

  it("authenticates before parsing an invalid request", async () => {
    vi.mocked(getCurrentReferenceDataAdministrator).mockRejectedValue(
      new ReferenceDataManagementError("ADMINISTRATOR_REQUIRED"),
    );
    const request = new Request("http://localhost/api/admin/categories", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "not-json",
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(createAdminCategory).not.toHaveBeenCalled();
  });
});
```

Insert these executable cases inside the same `describe` block:

```ts
it.each([
  [new AuthError("AUTHENTICATION_REQUIRED"), 401],
  [new ReferenceDataManagementError("ADMINISTRATOR_REQUIRED"), 403],
])("rejects access before parsing input", async (failure, status) => {
  vi.mocked(getCurrentReferenceDataAdministrator).mockRejectedValue(failure);
  const response = await POST(
    new Request("http://localhost/api/admin/categories", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "not-json",
    }),
  );
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(createAdminCategory).not.toHaveBeenCalled();
});

it.each([
  "?page=01",
  "?status=active&status=inactive",
  "?unknown=value",
])("rejects the list query %s", async (query) => {
  const response = await GET(
    new Request(`http://localhost/api/admin/categories${query}`),
  );
  expect(response.status).toBe(400);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(listAdminCategories).not.toHaveBeenCalled();
});

it.each([
  new Request("http://localhost/api/admin/categories", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: " ",
  }),
  new Request("http://localhost/api/admin/categories", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "{}",
  }),
  new Request("http://localhost/api/admin/categories", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  }),
  jsonRequest("http://localhost/api/admin/categories", "POST", {
    name: "Keys",
    administratorId: administrator.id,
  }),
])("returns safe 400 for an invalid create body", async (request) => {
  const response = await POST(request);
  expect(response.status).toBe(400);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(createAdminCategory).not.toHaveBeenCalled();
});

it.each([
  new Request("http://localhost/api/admin/categories", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "a".repeat(8 * 1024 + 1),
  }),
  new Request("http://localhost/api/admin/categories", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: new Uint8Array([0xc3, 0x28]),
  }),
])("maps body boundary failures to safe 400", async (request) => {
  const response = await POST(request);
  expect(response.status).toBe(400);
  expect(createAdminCategory).not.toHaveBeenCalled();
});

it.each([
  ["REFERENCE_DATA_NOT_FOUND", 404],
  ["REFERENCE_DATA_DUPLICATE", 409],
  ["REFERENCE_DATA_STATE_CONFLICT", 409],
  ["REFERENCE_DATA_OPERATION_FAILED", 500],
] as const)("maps %s without leaking details", async (code, status) => {
  vi.mocked(updateAdminCategory).mockRejectedValue(
    new ReferenceDataManagementError(code),
  );
  const response = await PATCH(
    jsonRequest(`http://localhost/api/admin/categories/${id}`, "PATCH", {
      updatedAt: category.updatedAt,
      description: null,
    }),
    { params: Promise.resolve({ categoryId: id }) },
  );
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(JSON.stringify(await response.json())).not.toContain("mongodb");
});

it("rejects invalid IDs and updates without mutable fields", async () => {
  const invalidIdResponse = await PATCH(
    jsonRequest("http://localhost/api/admin/categories/not-an-id", "PATCH", {
      updatedAt: category.updatedAt,
      isActive: false,
    }),
    { params: Promise.resolve({ categoryId: "not-an-id" }) },
  );
  const noChangeResponse = await PATCH(
    jsonRequest(`http://localhost/api/admin/categories/${id}`, "PATCH", {
      updatedAt: category.updatedAt,
    }),
    { params: Promise.resolve({ categoryId: id }) },
  );
  expect(invalidIdResponse.status).toBe(400);
  expect(noChangeResponse.status).toBe(400);
  expect(updateAdminCategory).not.toHaveBeenCalled();
});

it("maps a rejected parameter promise to a closed 500", async () => {
  const response = await PATCH(
    jsonRequest(`http://localhost/api/admin/categories/${id}`, "PATCH", {
      updatedAt: category.updatedAt,
      isActive: false,
    }),
    { params: Promise.reject(new Error("private routing detail")) },
  );
  expect(response.status).toBe(500);
  expect(JSON.stringify(await response.json())).not.toContain("private routing detail");
});
```

The existing role/status matrix in
`reference-data-access.test.ts` supplies the student, staff, suspended, and
deactivated variants behind the same mocked access boundary.

- [ ] **Step 2: Run Category route tests and verify failure**

```powershell
npm.cmd test -- src/app/api/admin/categories/admin-category-routes.test.ts
```

Expected: FAIL because the Category route modules do not exist.

- [ ] **Step 3: Implement the Category collection route**

Create `web/src/app/api/admin/categories/route.ts` with this complete
implementation:

```ts
import { getCurrentReferenceDataAdministrator } from "@/lib/admin/reference-data-access";
import {
  createAdminCategorySchema,
  referenceDataListQuerySchema,
  toReferenceDataListQueryInput,
} from "@/lib/admin/reference-data-contract";
import {
  invalidReferenceDataResponse,
  referenceDataManagementErrorResponse,
} from "@/lib/admin/reference-data-errors";
import {
  InvalidReferenceDataBodyEncoding,
  readReferenceDataRequestBody,
  ReferenceDataBodyTooLarge,
} from "@/lib/admin/reference-data-request-body";
import {
  createAdminCategory,
  listAdminCategories,
} from "@/lib/admin/category-service";
import type { PublicUser } from "@/lib/auth/public-user";

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function isJsonContentType(request: Request) {
  const value = request.headers.get("content-type");
  return value !== null && /^application\/json(?:\s*;|$)/i.test(value);
}

export async function GET(request: Request) {
  let administrator: PublicUser;
  try {
    administrator = await getCurrentReferenceDataAdministrator();
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }
  let parsed;
  try {
    parsed = referenceDataListQuerySchema.safeParse(
      toReferenceDataListQueryInput(new URL(request.url).searchParams),
    );
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }
  if (!parsed.success) return noStore(invalidReferenceDataResponse());
  try {
    return Response.json(await listAdminCategories(administrator, parsed.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }
}

export async function POST(request: Request) {
  let administrator: PublicUser;
  try {
    administrator = await getCurrentReferenceDataAdministrator();
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }
  if (!isJsonContentType(request)) return noStore(invalidReferenceDataResponse());
  let text;
  try {
    text = await readReferenceDataRequestBody(request);
  } catch (error) {
    return noStore(
      error instanceof ReferenceDataBodyTooLarge ||
        error instanceof InvalidReferenceDataBodyEncoding
        ? invalidReferenceDataResponse()
        : referenceDataManagementErrorResponse(error),
    );
  }
  if (text.trim() === "") return noStore(invalidReferenceDataResponse());
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (error) {
    return noStore(
      error instanceof SyntaxError
        ? invalidReferenceDataResponse()
        : referenceDataManagementErrorResponse(error),
    );
  }
  const parsed = createAdminCategorySchema.safeParse(body);
  if (!parsed.success) return noStore(invalidReferenceDataResponse());
  try {
    return Response.json(
      { category: await createAdminCategory(administrator, parsed.data) },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }
}
```

- [ ] **Step 4: Implement the Category member route**

Create `web/src/app/api/admin/categories/[categoryId]/route.ts`:

```ts
import { getCurrentReferenceDataAdministrator } from "@/lib/admin/reference-data-access";
import {
  referenceDataObjectIdSchema,
  updateAdminCategorySchema,
} from "@/lib/admin/reference-data-contract";
import {
  invalidReferenceDataResponse,
  referenceDataManagementErrorResponse,
} from "@/lib/admin/reference-data-errors";
import {
  InvalidReferenceDataBodyEncoding,
  readReferenceDataRequestBody,
  ReferenceDataBodyTooLarge,
} from "@/lib/admin/reference-data-request-body";
import { updateAdminCategory } from "@/lib/admin/category-service";
import type { PublicUser } from "@/lib/auth/public-user";

type Context = { params: Promise<{ categoryId: string }> };

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function isJsonContentType(request: Request) {
  const value = request.headers.get("content-type");
  return value !== null && /^application\/json(?:\s*;|$)/i.test(value);
}

export async function PATCH(request: Request, context: Context) {
  let administrator: PublicUser;
  try {
    administrator = await getCurrentReferenceDataAdministrator();
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }

  let rawCategoryId: string;
  try {
    rawCategoryId = (await context.params).categoryId;
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }
  const parsedId = referenceDataObjectIdSchema.safeParse(rawCategoryId);
  if (!parsedId.success || !isJsonContentType(request)) {
    return noStore(invalidReferenceDataResponse());
  }

  let text: string;
  try {
    text = await readReferenceDataRequestBody(request);
  } catch (error) {
    return noStore(
      error instanceof ReferenceDataBodyTooLarge ||
        error instanceof InvalidReferenceDataBodyEncoding
        ? invalidReferenceDataResponse()
        : referenceDataManagementErrorResponse(error),
    );
  }
  if (text.trim() === "") return noStore(invalidReferenceDataResponse());

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (error) {
    return noStore(
      error instanceof SyntaxError
        ? invalidReferenceDataResponse()
        : referenceDataManagementErrorResponse(error),
    );
  }
  const parsedBody = updateAdminCategorySchema.safeParse(body);
  if (!parsedBody.success) return noStore(invalidReferenceDataResponse());

  try {
    return Response.json(
      {
        category: await updateAdminCategory(
          administrator,
          parsedId.data,
          parsedBody.data,
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }
}
```

The route exports only `PATCH`; it must not export `DELETE`.

- [ ] **Step 5: Run Category route and service tests**

```powershell
npm.cmd test -- src/app/api/admin/categories/admin-category-routes.test.ts src/lib/admin/category-service.test.ts src/lib/admin/reference-data-contract.test.ts src/lib/admin/reference-data-access.test.ts src/lib/admin/reference-data-errors.test.ts src/lib/admin/reference-data-request-body.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run TypeScript and ESLint**

```powershell
npm.cmd exec -- tsc --noEmit --incremental false
npm.cmd run lint -- src/app/api/admin/categories src/lib/admin/category-service.ts src/lib/admin/category-service.test.ts
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit Task 4**

```powershell
git add web/src/app/api/admin/categories
git commit -m "feat(admin): expose category management API"
```

---

### Task 5: Implement CampusLocation list, create, and optimistic update services

**Files:**
- Create: `web/src/lib/admin/campus-location-service.test.ts`
- Create: `web/src/lib/admin/campus-location-service.ts`

**Interfaces:**
- Consumes: `ReferenceDataListQuery`, `CreateAdminCampusLocationInput`, `UpdateAdminCampusLocationInput`, `AdminCampusLocation`, `AdminCampusLocationPage`, `toAdminCampusLocation`, `adminCampusLocationPageSchema`, `requireReferenceDataAdministrator`, `ReferenceDataManagementError`, `isDuplicateKeyError`, `connectToDatabase`, and `CampusLocationModel`.
- Produces: `escapeCampusLocationSearch(value: string): string`, `listAdminCampusLocations(administrator, query): Promise<AdminCampusLocationPage>`, `createAdminCampusLocation(administrator, input): Promise<AdminCampusLocation>`, and `updateAdminCampusLocation(administrator, campusLocationId, input): Promise<AdminCampusLocation>`.

- [ ] **Step 1: Write the failing CampusLocation service tests**

Create `web/src/lib/admin/campus-location-service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/campus-location", () => ({
  CampusLocationModel: {
    aggregate: vi.fn(),
    create: vi.fn(),
    findOneAndUpdate: vi.fn(),
    exists: vi.fn(),
  },
}));

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { CampusLocationModel } from "@/models/campus-location";
import {
  createAdminCampusLocation,
  escapeCampusLocationSearch,
  listAdminCampusLocations,
  updateAdminCampusLocation,
} from "./campus-location-service";

const id = "64b64c6f2f4d9f1a2b3c4d52";
const administrator = {
  id: "64b64c6f2f4d9f1a2b3c4d50",
  role: "administrator",
  status: "active",
} as PublicUser;
const row = {
  _id: { toString: () => id },
  campusName: "Auckland",
  locationName: "Library",
  description: "Reception level",
  isActive: true,
  createdAt: new Date("2026-08-27T01:00:00.000Z"),
  updatedAt: new Date("2026-08-27T02:00:00.000Z"),
};

function aggregateReturning(result: unknown) {
  const query = {
    collation: vi.fn(),
    exec: vi.fn().mockResolvedValue(result),
  };
  query.collation.mockReturnValue(query);
  vi.mocked(CampusLocationModel.aggregate).mockReturnValue(query as never);
  return query;
}

function updateReturning(result: unknown) {
  const query = {
    lean: vi.fn(),
    exec: vi.fn().mockResolvedValue(result),
  };
  query.lean.mockReturnValue(query);
  vi.mocked(CampusLocationModel.findOneAndUpdate).mockReturnValue(query as never);
  return query;
}

describe("administrator CampusLocation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectToDatabase).mockResolvedValue({} as never);
  });

  it("authorizes before connecting", async () => {
    await expect(
      listAdminCampusLocations(
        { ...administrator, status: "suspended" },
        { status: "all", page: 1 },
      ),
    ).rejects.toMatchObject({ code: "ADMINISTRATOR_REQUIRED" });
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  it("escapes three-field search and returns a stable inactive page", async () => {
    const query = aggregateReturning([
      { campusLocations: [row], metadata: [{ totalItems: 41 }] },
    ]);
    await expect(
      listAdminCampusLocations(administrator, {
        q: "lib(rary)+",
        status: "inactive",
        page: 3,
      }),
    ).resolves.toEqual({
      campusLocations: [
        expect.objectContaining({ id, campusName: "Auckland" }),
      ],
      page: 3,
      pageSize: 20,
      total: 41,
      totalPages: 3,
    });
    expect(escapeCampusLocationSearch("lib(rary)+")).toBe(
      "lib\\(rary\\)\\+",
    );
    expect(CampusLocationModel.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $match: expect.objectContaining({
            isActive: false,
            $or: expect.arrayContaining([
              { campusName: { $regex: "lib\\(rary\\)\\+", $options: "i" } },
              { locationName: { $regex: "lib\\(rary\\)\\+", $options: "i" } },
              { description: { $regex: "lib\\(rary\\)\\+", $options: "i" } },
            ]),
          }),
        }),
        expect.objectContaining({
          $facet: expect.objectContaining({
            campusLocations: expect.arrayContaining([
              { $sort: { campusName: 1, locationName: 1, _id: 1 } },
              { $skip: 40 },
              { $limit: 20 },
            ]),
          }),
        }),
      ]),
    );
    expect(query.collation).toHaveBeenCalledWith({ locale: "en", strength: 2 });
  });

  it("creates a server-controlled active campus location", async () => {
    vi.mocked(CampusLocationModel.create).mockResolvedValue({
      toObject: () => row,
    } as never);
    await expect(
      createAdminCampusLocation(administrator, {
        campusName: "Auckland",
        locationName: "Library",
        description: "Reception level",
      }),
    ).resolves.toEqual(expect.objectContaining({ id, isActive: true }));
    expect(CampusLocationModel.create).toHaveBeenCalledWith({
      campusName: "Auckland",
      locationName: "Library",
      description: "Reception level",
      isActive: true,
    });
  });

  it("updates approved fields with the exact ID and timestamp", async () => {
    const query = updateReturning({ ...row, isActive: false });
    await expect(
      updateAdminCampusLocation(administrator, id, {
        updatedAt: "2026-08-27T02:00:00.000Z",
        locationName: "Library reception",
        isActive: false,
      }),
    ).resolves.toEqual(expect.objectContaining({ id, isActive: false }));
    expect(CampusLocationModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: expect.anything(), updatedAt: new Date("2026-08-27T02:00:00.000Z") },
      { $set: { locationName: "Library reception", isActive: false } },
      { new: true, runValidators: true },
    );
    expect(query.lean).toHaveBeenCalledOnce();
  });

  it.each([
    [null, null, "REFERENCE_DATA_NOT_FOUND"],
    [null, { _id: id }, "REFERENCE_DATA_STATE_CONFLICT"],
  ])("classifies a failed atomic update", async (updated, exists, code) => {
    updateReturning(updated);
    vi.mocked(CampusLocationModel.exists).mockResolvedValue(exists as never);
    await expect(
      updateAdminCampusLocation(administrator, id, {
        updatedAt: "2026-08-27T02:00:00.000Z",
        description: null,
      }),
    ).rejects.toMatchObject({ code });
  });

  it("maps duplicate and unknown failures without leaking model details", async () => {
    vi.mocked(CampusLocationModel.create).mockRejectedValueOnce({ code: 11000 });
    await expect(
      createAdminCampusLocation(administrator, {
        campusName: "Auckland",
        locationName: "Library",
        description: null,
      }),
    ).rejects.toMatchObject({ code: "REFERENCE_DATA_DUPLICATE" });
    vi.mocked(CampusLocationModel.create).mockRejectedValueOnce(
      new Error("mongodb private detail"),
    );
    await expect(
      createAdminCampusLocation(administrator, {
        campusName: "Manawatū",
        locationName: "Library",
        description: null,
      }),
    ).rejects.toMatchObject({ code: "REFERENCE_DATA_OPERATION_FAILED" });
  });
});
```

Insert these cases inside the same `describe` block before running the file:

```ts
it.each([
  ["all", undefined],
  ["active", true],
] as const)("applies the %s status filter", async (status, active) => {
  aggregateReturning([{ campusLocations: [], metadata: [] }]);
  await expect(
    listAdminCampusLocations(administrator, { status, page: 1 }),
  ).resolves.toEqual({
    campusLocations: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const pipeline = vi.mocked(CampusLocationModel.aggregate).mock.calls.at(-1)?.[0] as
    | Array<Record<string, unknown>>
    | undefined;
  const match = pipeline?.[0]?.$match as Record<string, unknown>;
  if (active === undefined) expect(match).not.toHaveProperty("isActive");
  else expect(match).toHaveProperty("isActive", active);
});

it("maps duplicate updates and unsafe aggregate records safely", async () => {
  const updateQuery = updateReturning(null);
  updateQuery.exec.mockRejectedValueOnce({ code: 11000 });
  await expect(
    updateAdminCampusLocation(administrator, id, {
      updatedAt: "2026-08-27T02:00:00.000Z",
      campusName: "Auckland",
    }),
  ).rejects.toMatchObject({ code: "REFERENCE_DATA_DUPLICATE" });

  aggregateReturning([
    {
      campusLocations: [{ ...row, locationName: "x", privateValue: "hidden" }],
      metadata: [{ totalItems: 1 }],
    },
  ]);
  await expect(
    listAdminCampusLocations(administrator, { status: "all", page: 1 }),
  ).rejects.toMatchObject({ code: "REFERENCE_DATA_OPERATION_FAILED" });
});
```

- [ ] **Step 2: Run the CampusLocation service test and verify failure**

```powershell
npm.cmd test -- src/lib/admin/campus-location-service.test.ts
```

Expected: FAIL because `campus-location-service.ts` does not exist.

- [ ] **Step 3: Implement the CampusLocation service**

Create `web/src/lib/admin/campus-location-service.ts`:

```ts
import { Types, type PipelineStage } from "mongoose";

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { CampusLocationModel } from "@/models/campus-location";

import { requireReferenceDataAdministrator } from "./reference-data-access";
import {
  ADMIN_REFERENCE_DATA_PAGE_SIZE,
  adminCampusLocationPageSchema,
  toAdminCampusLocation,
  type AdminCampusLocation,
  type AdminCampusLocationPage,
  type AdminCampusLocationRecord,
  type CreateAdminCampusLocationInput,
  type ReferenceDataListQuery,
  type UpdateAdminCampusLocationInput,
} from "./reference-data-contract";
import {
  isDuplicateKeyError,
  ReferenceDataManagementError,
} from "./reference-data-errors";

type CampusLocationFacet = {
  campusLocations: AdminCampusLocationRecord[];
  metadata: Array<{ totalItems: number }>;
};

export function escapeCampusLocationSearch(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rethrowCampusLocationError(error: unknown): never {
  if (error instanceof ReferenceDataManagementError) throw error;
  if (isDuplicateKeyError(error)) {
    throw new ReferenceDataManagementError("REFERENCE_DATA_DUPLICATE");
  }
  throw new ReferenceDataManagementError("REFERENCE_DATA_OPERATION_FAILED");
}

export async function listAdminCampusLocations(
  administrator: PublicUser,
  query: ReferenceDataListQuery,
): Promise<AdminCampusLocationPage> {
  requireReferenceDataAdministrator(administrator);
  try {
    await connectToDatabase();
    const search = query.q ? escapeCampusLocationSearch(query.q) : undefined;
    const match = {
      ...(query.status === "active" ? { isActive: true } : {}),
      ...(query.status === "inactive" ? { isActive: false } : {}),
      ...(search
        ? {
            $or: [
              { campusName: { $regex: search, $options: "i" } },
              { locationName: { $regex: search, $options: "i" } },
              { description: { $regex: search, $options: "i" } },
            ],
          }
        : {}),
    };
    const pipeline: PipelineStage[] = [
      { $match: match },
      {
        $facet: {
          campusLocations: [
            { $sort: { campusName: 1, locationName: 1, _id: 1 } },
            { $skip: (query.page - 1) * ADMIN_REFERENCE_DATA_PAGE_SIZE },
            { $limit: ADMIN_REFERENCE_DATA_PAGE_SIZE },
            {
              $project: {
                _id: 1,
                campusName: 1,
                locationName: 1,
                description: 1,
                isActive: 1,
                createdAt: 1,
                updatedAt: 1,
              },
            },
          ],
          metadata: [{ $count: "totalItems" }],
        },
      },
    ];
    const result = (await CampusLocationModel.aggregate(pipeline)
      .collation({ locale: "en", strength: 2 })
      .exec()) as CampusLocationFacet[];
    const facet = result[0];
    if (!facet) throw new Error("CampusLocation aggregate returned no facet");
    const total = facet.metadata[0]?.totalItems ?? 0;
    return adminCampusLocationPageSchema.parse({
      campusLocations: facet.campusLocations.map(toAdminCampusLocation),
      page: query.page,
      pageSize: ADMIN_REFERENCE_DATA_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / ADMIN_REFERENCE_DATA_PAGE_SIZE),
    });
  } catch (error) {
    rethrowCampusLocationError(error);
  }
}

export async function createAdminCampusLocation(
  administrator: PublicUser,
  input: CreateAdminCampusLocationInput,
): Promise<AdminCampusLocation> {
  requireReferenceDataAdministrator(administrator);
  try {
    await connectToDatabase();
    const created = await CampusLocationModel.create({
      campusName: input.campusName,
      locationName: input.locationName,
      description: input.description,
      isActive: true,
    });
    return toAdminCampusLocation(
      created.toObject() as AdminCampusLocationRecord,
    );
  } catch (error) {
    rethrowCampusLocationError(error);
  }
}

export async function updateAdminCampusLocation(
  administrator: PublicUser,
  campusLocationId: string,
  input: UpdateAdminCampusLocationInput,
): Promise<AdminCampusLocation> {
  requireReferenceDataAdministrator(administrator);
  try {
    await connectToDatabase();
    const { updatedAt, ...changes } = input;
    const objectId = new Types.ObjectId(campusLocationId);
    const updated = await CampusLocationModel.findOneAndUpdate(
      { _id: objectId, updatedAt: new Date(updatedAt) },
      { $set: changes },
      { new: true, runValidators: true },
    )
      .lean<AdminCampusLocationRecord | null>()
      .exec();
    if (!updated) {
      const exists = await CampusLocationModel.exists({ _id: objectId });
      throw new ReferenceDataManagementError(
        exists ? "REFERENCE_DATA_STATE_CONFLICT" : "REFERENCE_DATA_NOT_FOUND",
      );
    }
    return toAdminCampusLocation(updated);
  } catch (error) {
    rethrowCampusLocationError(error);
  }
}
```

- [ ] **Step 4: Run the CampusLocation service tests**

```powershell
npm.cmd test -- src/lib/admin/campus-location-service.test.ts src/lib/admin/reference-data-contract.test.ts src/lib/admin/reference-data-access.test.ts src/lib/admin/reference-data-errors.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run TypeScript and ESLint**

```powershell
npm.cmd exec -- tsc --noEmit --incremental false
npm.cmd run lint -- src/lib/admin/campus-location-service.ts src/lib/admin/campus-location-service.test.ts
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit Task 5**

```powershell
git add web/src/lib/admin/campus-location-service.ts web/src/lib/admin/campus-location-service.test.ts
git commit -m "feat(admin): manage campus locations safely"
```

---

### Task 6: Expose administrator CampusLocation routes

**Files:**
- Create: `web/src/app/api/admin/campus-locations/admin-campus-location-routes.test.ts`
- Create: `web/src/app/api/admin/campus-locations/route.ts`
- Create: `web/src/app/api/admin/campus-locations/[campusLocationId]/route.ts`

**Interfaces:**
- Consumes: current-administrator resolution, strict CampusLocation schemas, the 8 KiB request reader, safe error mappers, and the three CampusLocation service functions from Tasks 1, 2, and 5.
- Produces: `GET` and `POST` for `/api/admin/campus-locations`, plus `PATCH` for `/api/admin/campus-locations/{campusLocationId}`. No route exports `DELETE`.

- [ ] **Step 1: Write the failing CampusLocation route tests**

Create `web/src/app/api/admin/campus-locations/admin-campus-location-routes.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/reference-data-access", () => ({
  getCurrentReferenceDataAdministrator: vi.fn(),
}));
vi.mock("@/lib/admin/campus-location-service", () => ({
  listAdminCampusLocations: vi.fn(),
  createAdminCampusLocation: vi.fn(),
  updateAdminCampusLocation: vi.fn(),
}));

import { getCurrentReferenceDataAdministrator } from "@/lib/admin/reference-data-access";
import {
  createAdminCampusLocation,
  listAdminCampusLocations,
  updateAdminCampusLocation,
} from "@/lib/admin/campus-location-service";
import { ReferenceDataManagementError } from "@/lib/admin/reference-data-errors";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { GET, POST } from "./route";
import { PATCH } from "./[campusLocationId]/route";

const id = "64b64c6f2f4d9f1a2b3c4d52";
const administrator = {
  id: "64b64c6f2f4d9f1a2b3c4d50",
  role: "administrator",
  status: "active",
} as PublicUser;
const campusLocation = {
  id,
  campusName: "Auckland",
  locationName: "Library",
  description: null,
  isActive: true,
  createdAt: "2026-08-27T01:00:00.000Z",
  updatedAt: "2026-08-27T02:00:00.000Z",
};

function jsonRequest(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("administrator CampusLocation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentReferenceDataAdministrator).mockResolvedValue(administrator);
  });

  it("lists a normalized query with a flat page and no-store", async () => {
    vi.mocked(listAdminCampusLocations).mockResolvedValue({
      campusLocations: [campusLocation],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    const response = await GET(
      new Request(
        "http://localhost/api/admin/campus-locations?q=Library&status=all&page=1",
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(listAdminCampusLocations).toHaveBeenCalledWith(administrator, {
      q: "Library",
      status: "all",
      page: 1,
    });
    await expect(response.json()).resolves.toEqual({
      campusLocations: [campusLocation],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it("creates an active campus location with HTTP 201", async () => {
    vi.mocked(createAdminCampusLocation).mockResolvedValue(campusLocation);
    const response = await POST(
      jsonRequest("http://localhost/api/admin/campus-locations", "POST", {
        campusName: " Auckland ",
        locationName: " Library ",
        description: " ",
      }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(createAdminCampusLocation).toHaveBeenCalledWith(administrator, {
      campusName: "Auckland",
      locationName: "Library",
      description: null,
    });
    await expect(response.json()).resolves.toEqual({ campusLocation });
  });

  it("updates by path ID and exact timestamp", async () => {
    vi.mocked(updateAdminCampusLocation).mockResolvedValue({
      ...campusLocation,
      isActive: false,
    });
    const response = await PATCH(
      jsonRequest(`http://localhost/api/admin/campus-locations/${id}`, "PATCH", {
        updatedAt: campusLocation.updatedAt,
        isActive: false,
      }),
      { params: Promise.resolve({ campusLocationId: id }) },
    );
    expect(response.status).toBe(200);
    expect(updateAdminCampusLocation).toHaveBeenCalledWith(administrator, id, {
      updatedAt: campusLocation.updatedAt,
      isActive: false,
    });
  });

  it.each([
    [new AuthError("AUTHENTICATION_REQUIRED"), 401],
    [new ReferenceDataManagementError("ADMINISTRATOR_REQUIRED"), 403],
  ])("rejects access before parsing input", async (failure, status) => {
    vi.mocked(getCurrentReferenceDataAdministrator).mockRejectedValue(failure);
    const response = await POST(
      new Request("http://localhost/api/admin/campus-locations", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "not-json",
      }),
    );
    expect(response.status).toBe(status);
    expect(createAdminCampusLocation).not.toHaveBeenCalled();
  });

  it.each([
    ["?page=01", 400],
    ["?status=active&status=inactive", 400],
    ["?unknown=value", 400],
  ])("rejects the list query %s", async (query, status) => {
    const response = await GET(
      new Request(`http://localhost/api/admin/campus-locations${query}`),
    );
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(listAdminCampusLocations).not.toHaveBeenCalled();
  });

  it.each([
    [
      new Request("http://localhost/api/admin/campus-locations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: " ",
      }),
      POST,
    ],
    [
      new Request("http://localhost/api/admin/campus-locations", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "{}",
      }),
      POST,
    ],
    [
      new Request("http://localhost/api/admin/campus-locations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      POST,
    ],
    [
      jsonRequest("http://localhost/api/admin/campus-locations", "POST", {
        campusName: "Auckland",
        locationName: "Library",
        administratorId: administrator.id,
      }),
      POST,
    ],
  ])("returns safe 400 for an invalid collection body", async (request, handler) => {
    const response = await handler(request);
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(createAdminCampusLocation).not.toHaveBeenCalled();
  });

  it.each([
    ["REFERENCE_DATA_NOT_FOUND", 404],
    ["REFERENCE_DATA_DUPLICATE", 409],
    ["REFERENCE_DATA_STATE_CONFLICT", 409],
    ["REFERENCE_DATA_OPERATION_FAILED", 500],
  ] as const)("maps %s without leaking details", async (code, status) => {
    vi.mocked(updateAdminCampusLocation).mockRejectedValue(
      new ReferenceDataManagementError(code),
    );
    const response = await PATCH(
      jsonRequest(`http://localhost/api/admin/campus-locations/${id}`, "PATCH", {
        updatedAt: campusLocation.updatedAt,
        description: null,
      }),
      { params: Promise.resolve({ campusLocationId: id }) },
    );
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await response.json())).not.toContain("mongodb");
  });

  it("rejects invalid path IDs and updates without mutable fields", async () => {
    const invalidIdResponse = await PATCH(
      jsonRequest("http://localhost/api/admin/campus-locations/not-an-id", "PATCH", {
        updatedAt: campusLocation.updatedAt,
        isActive: false,
      }),
      { params: Promise.resolve({ campusLocationId: "not-an-id" }) },
    );
    const noChangeResponse = await PATCH(
      jsonRequest(`http://localhost/api/admin/campus-locations/${id}`, "PATCH", {
        updatedAt: campusLocation.updatedAt,
      }),
      { params: Promise.resolve({ campusLocationId: id }) },
    );
    expect(invalidIdResponse.status).toBe(400);
    expect(noChangeResponse.status).toBe(400);
    expect(updateAdminCampusLocation).not.toHaveBeenCalled();
  });
});
```

Add these two boundary cases to the same test file with executable requests:

```ts
it("rejects streamed bodies above 8 KiB", async () => {
  const response = await POST(
    new Request("http://localhost/api/admin/campus-locations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "a".repeat(8 * 1024 + 1),
    }),
  );
  expect(response.status).toBe(400);
  expect(createAdminCampusLocation).not.toHaveBeenCalled();
});

it("maps a rejected parameter promise to a closed 500", async () => {
  const response = await PATCH(
    jsonRequest(`http://localhost/api/admin/campus-locations/${id}`, "PATCH", {
      updatedAt: campusLocation.updatedAt,
      isActive: false,
    }),
    { params: Promise.reject(new Error("private routing detail")) },
  );
  expect(response.status).toBe(500);
  expect(JSON.stringify(await response.json())).not.toContain("private routing detail");
});
```

- [ ] **Step 2: Run the route test and verify failure**

```powershell
npm.cmd test -- src/app/api/admin/campus-locations/admin-campus-location-routes.test.ts
```

Expected: FAIL because the CampusLocation route modules do not exist.

- [ ] **Step 3: Implement the CampusLocation collection route**

Create `web/src/app/api/admin/campus-locations/route.ts`:

```ts
import { getCurrentReferenceDataAdministrator } from "@/lib/admin/reference-data-access";
import {
  createAdminCampusLocationSchema,
  referenceDataListQuerySchema,
  toReferenceDataListQueryInput,
} from "@/lib/admin/reference-data-contract";
import {
  invalidReferenceDataResponse,
  referenceDataManagementErrorResponse,
} from "@/lib/admin/reference-data-errors";
import {
  InvalidReferenceDataBodyEncoding,
  readReferenceDataRequestBody,
  ReferenceDataBodyTooLarge,
} from "@/lib/admin/reference-data-request-body";
import {
  createAdminCampusLocation,
  listAdminCampusLocations,
} from "@/lib/admin/campus-location-service";
import type { PublicUser } from "@/lib/auth/public-user";

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function isJsonContentType(request: Request) {
  const value = request.headers.get("content-type");
  return value !== null && /^application\/json(?:\s*;|$)/i.test(value);
}

export async function GET(request: Request) {
  let administrator: PublicUser;
  try {
    administrator = await getCurrentReferenceDataAdministrator();
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }
  let parsed;
  try {
    parsed = referenceDataListQuerySchema.safeParse(
      toReferenceDataListQueryInput(new URL(request.url).searchParams),
    );
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }
  if (!parsed.success) return noStore(invalidReferenceDataResponse());
  try {
    return Response.json(
      await listAdminCampusLocations(administrator, parsed.data),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }
}

export async function POST(request: Request) {
  let administrator: PublicUser;
  try {
    administrator = await getCurrentReferenceDataAdministrator();
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }
  if (!isJsonContentType(request)) return noStore(invalidReferenceDataResponse());
  let text: string;
  try {
    text = await readReferenceDataRequestBody(request);
  } catch (error) {
    return noStore(
      error instanceof ReferenceDataBodyTooLarge ||
        error instanceof InvalidReferenceDataBodyEncoding
        ? invalidReferenceDataResponse()
        : referenceDataManagementErrorResponse(error),
    );
  }
  if (text.trim() === "") return noStore(invalidReferenceDataResponse());
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (error) {
    return noStore(
      error instanceof SyntaxError
        ? invalidReferenceDataResponse()
        : referenceDataManagementErrorResponse(error),
    );
  }
  const parsed = createAdminCampusLocationSchema.safeParse(body);
  if (!parsed.success) return noStore(invalidReferenceDataResponse());
  try {
    return Response.json(
      {
        campusLocation: await createAdminCampusLocation(
          administrator,
          parsed.data,
        ),
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }
}
```

- [ ] **Step 4: Implement the CampusLocation member route**

Create `web/src/app/api/admin/campus-locations/[campusLocationId]/route.ts`:

```ts
import { getCurrentReferenceDataAdministrator } from "@/lib/admin/reference-data-access";
import {
  referenceDataObjectIdSchema,
  updateAdminCampusLocationSchema,
} from "@/lib/admin/reference-data-contract";
import {
  invalidReferenceDataResponse,
  referenceDataManagementErrorResponse,
} from "@/lib/admin/reference-data-errors";
import {
  InvalidReferenceDataBodyEncoding,
  readReferenceDataRequestBody,
  ReferenceDataBodyTooLarge,
} from "@/lib/admin/reference-data-request-body";
import { updateAdminCampusLocation } from "@/lib/admin/campus-location-service";
import type { PublicUser } from "@/lib/auth/public-user";

type Context = { params: Promise<{ campusLocationId: string }> };

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function isJsonContentType(request: Request) {
  const value = request.headers.get("content-type");
  return value !== null && /^application\/json(?:\s*;|$)/i.test(value);
}

export async function PATCH(request: Request, context: Context) {
  let administrator: PublicUser;
  try {
    administrator = await getCurrentReferenceDataAdministrator();
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }

  let rawCampusLocationId: string;
  try {
    rawCampusLocationId = (await context.params).campusLocationId;
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }
  const parsedId = referenceDataObjectIdSchema.safeParse(rawCampusLocationId);
  if (!parsedId.success || !isJsonContentType(request)) {
    return noStore(invalidReferenceDataResponse());
  }

  let text: string;
  try {
    text = await readReferenceDataRequestBody(request);
  } catch (error) {
    return noStore(
      error instanceof ReferenceDataBodyTooLarge ||
        error instanceof InvalidReferenceDataBodyEncoding
        ? invalidReferenceDataResponse()
        : referenceDataManagementErrorResponse(error),
    );
  }
  if (text.trim() === "") return noStore(invalidReferenceDataResponse());

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (error) {
    return noStore(
      error instanceof SyntaxError
        ? invalidReferenceDataResponse()
        : referenceDataManagementErrorResponse(error),
    );
  }
  const parsedBody = updateAdminCampusLocationSchema.safeParse(body);
  if (!parsedBody.success) return noStore(invalidReferenceDataResponse());

  try {
    return Response.json(
      {
        campusLocation: await updateAdminCampusLocation(
          administrator,
          parsedId.data,
          parsedBody.data,
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }
}
```

The file exports only `PATCH`; do not add `DELETE`.

- [ ] **Step 5: Run CampusLocation route and service tests**

```powershell
npm.cmd test -- src/app/api/admin/campus-locations/admin-campus-location-routes.test.ts src/lib/admin/campus-location-service.test.ts src/lib/admin/reference-data-contract.test.ts src/lib/admin/reference-data-access.test.ts src/lib/admin/reference-data-errors.test.ts src/lib/admin/reference-data-request-body.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run TypeScript and ESLint**

```powershell
npm.cmd exec -- tsc --noEmit --incremental false
npm.cmd run lint -- src/app/api/admin/campus-locations src/lib/admin/campus-location-service.ts src/lib/admin/campus-location-service.test.ts
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit Task 6**

```powershell
git add web/src/app/api/admin/campus-locations
git commit -m "feat(admin): expose campus location management API"
```

---

### Task 7: Prove regressions, scope, privacy, and delivery readiness

**Files:**
- Create: `docs/superpowers/verification/2026-08-27-administrator-reference-data-backend.md`
- Verify unchanged: `web/package.json`
- Verify unchanged: `web/package-lock.json`
- Verify unchanged: `web/src/models/category.ts`
- Verify unchanged: `web/src/models/campus-location.ts`
- Verify unchanged: `web/src/models/item-report.ts`
- Verify unchanged: `web/src/lib/reports/reference-data.ts`
- Verify unchanged: `web/src/app/api/categories/route.ts`
- Verify unchanged: `web/src/app/api/campus-locations/route.ts`

**Interfaces:**
- Consumes: all modules and tests from Tasks 1-6 plus the existing member-facing report reference-data and report-submission suites.
- Produces: a committed verification record showing exact gates, unchanged schemas/dependencies/member routes, no permanent deletion, and no credential exposure.

- [ ] **Step 1: Run the complete focused and regression suite**

Run from `web/`:

```powershell
npm.cmd test -- src/lib/admin/reference-data-contract.test.ts src/lib/admin/reference-data-errors.test.ts src/lib/admin/reference-data-access.test.ts src/lib/admin/reference-data-request-body.test.ts src/lib/admin/category-service.test.ts src/app/api/admin/categories/admin-category-routes.test.ts src/lib/admin/campus-location-service.test.ts src/app/api/admin/campus-locations/admin-campus-location-routes.test.ts src/lib/reports/reference-data.test.ts src/lib/reports/service.test.ts src/app/api/reports/report-routes.test.ts
```

Expected: all selected files pass. The existing member loaders still assert
`{ isActive: true }`, and report submission still rejects inactive or unknown
reference IDs.

- [ ] **Step 2: Run every repository quality gate**

Run from `web/`, one command at a time so a failure is attributable:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd exec -- tsc --noEmit --incremental false
npm.cmd run build
npm.cmd audit
```

Expected: every command exits 0; the build route table includes:

```text
/api/admin/categories
/api/admin/categories/[categoryId]
/api/admin/campus-locations
/api/admin/campus-locations/[campusLocationId]
```

`npm audit` must end with `found 0 vulnerabilities`.

- [ ] **Step 3: Verify branch scope and privacy without reading `.env.local`**

Run from the repository root:

```powershell
git diff --check origin/develop...HEAD
git status --short --branch
git diff --name-only origin/develop...HEAD -- web/package.json web/package-lock.json web/src/models/category.ts web/src/models/campus-location.ts web/src/models/item-report.ts web/src/lib/reports/reference-data.ts web/src/app/api/categories/route.ts web/src/app/api/campus-locations/route.ts
git check-ignore web/.env.local
rg -n "export (async )?function DELETE" web/src/app/api/admin/categories web/src/app/api/admin/campus-locations
git grep -n -E "mongodb\\+srv://[^<]|mongodb://[^<[:space:]]+@" -- . ":(exclude)web/.env.example"
```

Expected:

```text
git diff --check: no output
git status: only the verification document may be uncommitted
scoped unchanged-file diff: no output
git check-ignore: web/.env.local
DELETE export scan: no output
credential-pattern scan: no output
```

Do not run `Get-Content`, `type`, `cat`, or any command that prints
`web/.env.local`.

- [ ] **Step 4: Record exact verification evidence**

Create
`docs/superpowers/verification/2026-08-27-administrator-reference-data-backend.md`
with this content after every preceding command has passed:

```markdown
# Administrator Reference Data Management Backend Verification

## Scope

- Branch: `feature/issue-40-administrator-reference-data-backend`
- Issue: `#40`
- Added active-administrator-only Category and CampusLocation list, create,
  update, deactivate, and restore APIs.
- Preserved existing member-facing active-only reference-data behavior.
- Added no DELETE route, dependency, database schema, seed, bulk operation, or
  live Atlas test.

## Automated checks

| Check | Result |
| --- | --- |
| Focused admin and report regression suite | PASS |
| Full `npm test` | PASS |
| `npm run lint` | PASS |
| `npx tsc --noEmit --incremental false` | PASS |
| `npm run build` | PASS; all four administrator routes listed |
| `npm audit` | PASS; 0 vulnerabilities |
| `git diff --check origin/develop...HEAD` | PASS |

## Security and privacy evidence

- Authentication and active-administrator authorization precede input parsing
  and every database service operation.
- Strict query, path, create, and update schemas reject unknown fields and
  client-supplied authority.
- POST and PATCH bodies are capped at 8 KiB and decoded as fatal UTF-8.
- Search input is regex-escaped and length-bounded.
- Every update atomically filters by `_id` and the submitted `updatedAt`.
- Duplicate, missing, stale, invalid, unauthorized, and unexpected failures
  return fixed closed error responses.
- All success and error responses set `Cache-Control: no-store`.
- `.env.local` remains ignored; no environment file or real credential was
  read, printed, staged, or committed.

## Regression and scope evidence

- Existing Category and CampusLocation member loaders still query
  `{ isActive: true }`.
- Historical ItemReport references are neither deleted nor rewritten.
- Category, CampusLocation, and ItemReport schemas are unchanged.
- `package.json` and `package-lock.json` are unchanged.
- The new administrator route groups export no `DELETE` handler.
- All tests use mocks or fixtures and make no live MongoDB Atlas connection.
```

- [ ] **Step 5: Commit the verification record**

```powershell
git add docs/superpowers/verification/2026-08-27-administrator-reference-data-backend.md
git commit -m "docs: record administrator reference data backend verification"
```

- [ ] **Step 6: Confirm a clean, reviewable branch**

```powershell
git status --short --branch
git log --oneline origin/develop..HEAD
```

Expected: the working tree is clean, the branch remains
`feature/issue-40-administrator-reference-data-backend`, and the log contains
the approved design, this plan, Tasks 1-6, and the verification commit only.

---
