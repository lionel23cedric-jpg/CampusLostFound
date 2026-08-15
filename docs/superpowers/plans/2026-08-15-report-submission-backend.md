# Report Submission Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated reference-data endpoints and a secure transactional endpoint for active students to submit complete lost or found reports.

**Architecture:** Thin Next.js Route Handlers reuse the existing cookie-session resolver and delegate to focused report modules. Zod defines the only accepted request shape, a service validates active references and creates public/private records in one Mongoose transaction, and explicit mappers prevent private evidence from entering API responses.

**Tech Stack:** Next.js 16.2.12 App Router, TypeScript 5, Node.js 20.9+, MongoDB Atlas, Mongoose 9.9.1, Zod 4.4.3, Vitest 4.1.10.

## Global Constraints

- Work only on `feature/issue-12-report-submission-backend`, based on the latest `develop`.
- Implement only the two active reference-data endpoints, the report-submission endpoint, their focused modules and automated tests.
- Reuse `readSessionCookie`, `getCurrentUser`, `connectToDatabase`, `CategoryModel`, `CampusLocationModel`, `ItemReportModel` and `PrivateVerificationDetailsModel`.
- All three endpoints require a valid session belonging to an active account; only an active `student` may create a report.
- The server controls `reporterId`, `status: "open"` and `resolvedAt: null`.
- Create ItemReport and PrivateVerificationDetails in one Mongoose transaction and always end the database session.
- Never expose private verification fields, passwords, raw session tokens, session hashes, MongoDB errors or stack traces.
- Accept zero to five photo URLs and require the HTTPS protocol at the API boundary.
- Keep request parsing in its own error boundary so only malformed request JSON maps to HTTP 400.
- Do not add report browsing, editing, deletion, drafts, uploads, search, claims, notifications, matching, administration, seed writes, pages or forms.
- Do not modify `.env.local`, read its contents in tests, connect automated tests to Atlas or create real application records.
- Do not add or upgrade dependencies.
- Every task follows red-green TDD, focused ESLint and a small commit referencing `#12`.

## File Map

- `web/src/lib/reports/validation.ts`: strict request schema and `CreateReportInput`.
- `web/src/lib/reports/validation.test.ts`: request-boundary tests.
- `web/src/lib/reports/errors.ts`: report error types and safe response factories.
- `web/src/lib/reports/errors.test.ts`: exact status/message and hidden-error tests.
- `web/src/lib/reports/public-report.ts`: owner-safe report mapper and output type.
- `web/src/lib/reports/public-report.test.ts`: field allow-list and date conversion tests.
- `web/src/lib/reports/reference-data.ts`: active category/location queries and safe mapping.
- `web/src/lib/reports/reference-data.test.ts`: query, sorting and output tests.
- `web/src/lib/reports/service.ts`: role check, active-reference checks and two-record transaction.
- `web/src/lib/reports/service.test.ts`: transaction, permission, reference and failure tests.
- `web/src/app/api/categories/route.ts`: authenticated category endpoint.
- `web/src/app/api/campus-locations/route.ts`: authenticated campus-location endpoint.
- `web/src/app/api/reports/route.ts`: authenticated report-submission endpoint.
- `web/src/app/api/reports/report-routes.test.ts`: consolidated HTTP contract tests.

---

### Task 1: Define the Strict Submission Contract

**Files:**
- Create: `web/src/lib/reports/validation.ts`
- Create: `web/src/lib/reports/validation.test.ts`

**Interfaces:**
- Consumes: `REPORT_TYPES` from `@/models/item-report`.
- Produces: `createReportSchema` and `CreateReportInput`.
- `CreateReportInput.occurredAt` is a `Date`, optional private strings are `string | null`, and all defaults are materialised before the service receives the value.

- [ ] **Step 1: Write the failing validation tests**

Create `web/src/lib/reports/validation.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createReportSchema } from "./validation";

const categoryId = "64b64c6f2f4d9f1a2b3c4d5e";
const campusLocationId = "64b64c6f2f4d9f1a2b3c4d5f";

const validBody = {
  reportType: "lost",
  title: "Black laptop bag",
  publicDescription: "Black laptop bag with a shoulder strap.",
  categoryId,
  campusLocationId,
  occurredAt: "2026-08-14T02:00:00.000Z",
  colors: ["Black"],
  tags: ["Laptop", "Bag"],
  photoUrls: ["https://images.example/item.jpg"],
  privateVerification: {
    distinguishingFeatures: ["Small scratch beneath the handle"],
    exactLocationDetails: "Second-floor study area",
    serialNumber: "",
    verificationQuestions: [
      {
        question: "What is attached to the zipper?",
        expectedAnswer: "A blue tag",
      },
    ],
    privateNotes: null,
  },
};

describe("report submission validation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("normalises a complete report and applies privacy defaults", () => {
    expect(createReportSchema.parse(validBody)).toEqual({
      ...validBody,
      occurredAt: new Date("2026-08-14T02:00:00.000Z"),
      tags: ["laptop", "bag"],
      privacySettings: {
        showPhoto: true,
        showEventDate: true,
        showCampusLocation: true,
      },
      privateVerification: {
        ...validBody.privateVerification,
        serialNumber: null,
      },
    });
  });

  it.each([
    ["unknown root field", { ...validBody, status: "resolved" }],
    [
      "unknown private field",
      {
        ...validBody,
        privateVerification: {
          ...validBody.privateVerification,
          reviewerRole: "administrator",
        },
      },
    ],
    ["malformed category id", { ...validBody, categoryId: "not-an-id" }],
    [
      "future event date",
      { ...validBody, occurredAt: "2026-08-16T00:00:00.000Z" },
    ],
    [
      "non-HTTPS image",
      { ...validBody, photoUrls: ["http://images.example/item.jpg"] },
    ],
    [
      "too many colours",
      { ...validBody, colors: ["a", "b", "c", "d", "e", "f"] },
    ],
    [
      "missing verification evidence",
      {
        ...validBody,
        privateVerification: {
          ...validBody.privateVerification,
          distinguishingFeatures: [],
        },
      },
    ],
  ])("rejects %s", (_case, body) => {
    expect(createReportSchema.safeParse(body).success).toBe(false);
  });

  it("accepts no photos and preserves explicit privacy choices", () => {
    const result = createReportSchema.parse({
      ...validBody,
      photoUrls: [],
      privacySettings: {
        showPhoto: false,
        showEventDate: false,
        showCampusLocation: false,
      },
    });

    expect(result.photoUrls).toEqual([]);
    expect(result.privacySettings).toEqual({
      showPhoto: false,
      showEventDate: false,
      showCampusLocation: false,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify the red state**

Run from `web/`:

```powershell
npm.cmd test -- src/lib/reports/validation.test.ts
```

Expected: FAIL because `./validation` does not exist.

- [ ] **Step 3: Implement the strict schema**

Create `web/src/lib/reports/validation.ts`:

```ts
import { z } from "zod";

import { REPORT_TYPES } from "@/models/item-report";

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Reference must be a valid ObjectId");

const boundedText = (label: string, minimum: number, maximum: number) =>
  z
    .string()
    .trim()
    .min(minimum, `${label} must contain at least ${minimum} characters`)
    .max(maximum, `${label} must contain at most ${maximum} characters`);

const optionalPrivateText = (label: string, maximum: number) =>
  z
    .union([
      z
        .string()
        .trim()
        .max(maximum, `${label} must contain at most ${maximum} characters`),
      z.null(),
    ])
    .optional()
    .transform((value) => (value === undefined || value === "" ? null : value));

const occurredAtSchema = z
  .string()
  .datetime({ offset: true, message: "Event date must be a valid ISO date" })
  .superRefine((value, context) => {
    if (new Date(value).getTime() > Date.now()) {
      context.addIssue({
        code: "custom",
        message: "Event date cannot be in the future",
      });
    }
  })
  .transform((value) => new Date(value));

const photoUrlSchema = z
  .string()
  .trim()
  .url("Photo URL must be valid")
  .refine((value) => new URL(value).protocol === "https:", {
    message: "Photo URL must use HTTPS",
  });

const privacySettingsSchema = z
  .strictObject({
    showPhoto: z.boolean().default(true),
    showEventDate: z.boolean().default(true),
    showCampusLocation: z.boolean().default(true),
  })
  .default({});

const verificationQuestionSchema = z.strictObject({
  question: boundedText("Verification question", 5, 200),
  expectedAnswer: boundedText("Expected answer", 1, 500),
});

const privateVerificationSchema = z.strictObject({
  distinguishingFeatures: z
    .array(boundedText("Distinguishing feature", 1, 200))
    .min(1, "Provide at least one distinguishing feature")
    .max(10, "Provide at most 10 distinguishing features"),
  exactLocationDetails: optionalPrivateText("Exact location details", 500),
  serialNumber: optionalPrivateText("Serial number", 200),
  verificationQuestions: z
    .array(verificationQuestionSchema)
    .min(1, "Provide at least one verification question")
    .max(5, "Provide at most 5 verification questions"),
  privateNotes: optionalPrivateText("Private notes", 2000),
});

export const createReportSchema = z.strictObject({
  reportType: z.enum(REPORT_TYPES),
  title: boundedText("Title", 5, 120),
  publicDescription: boundedText("Public description", 10, 2000),
  categoryId: objectIdSchema,
  campusLocationId: objectIdSchema,
  occurredAt: occurredAtSchema,
  colors: z
    .array(boundedText("Colour", 1, 32))
    .min(1, "Provide at least one colour")
    .max(5, "Provide at most 5 colours"),
  tags: z
    .array(
      boundedText("Tag", 1, 40).transform((value) => value.toLowerCase()),
    )
    .max(10, "Provide at most 10 tags")
    .default([]),
  photoUrls: z.array(photoUrlSchema).max(5, "Provide at most 5 photo URLs").default([]),
  privacySettings: privacySettingsSchema,
  privateVerification: privateVerificationSchema,
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
```

- [ ] **Step 4: Run focused tests and lint**

```powershell
npm.cmd test -- src/lib/reports/validation.test.ts
npm.cmd run lint -- src/lib/reports/validation.ts src/lib/reports/validation.test.ts
```

Expected: the validation test file passes and ESLint emits no errors or warnings.

- [ ] **Step 5: Commit the validation contract**

```powershell
git add web/src/lib/reports/validation.ts web/src/lib/reports/validation.test.ts
git diff --cached --check
git commit -m "feat(reports): define submission validation" -m "Refs #12"
```

---

### Task 2: Define Safe Errors and the Owner Response

**Files:**
- Create: `web/src/lib/reports/errors.ts`
- Create: `web/src/lib/reports/errors.test.ts`
- Create: `web/src/lib/reports/public-report.ts`
- Create: `web/src/lib/reports/public-report.test.ts`

**Interfaces:**
- Consumes: `AuthError` and `authErrorResponse` from `@/lib/auth/errors`, plus `ItemReport` from `@/models/item-report`.
- Produces: `ReportError`, `invalidReportResponse`, `reportErrorResponse`, `referenceDataErrorResponse`, `toOwnerReport` and `OwnerReport`.
- Unknown creation failures always map to `REPORT_CREATION_FAILED`; unknown reference failures always map to `REFERENCE_DATA_FAILED`.

- [ ] **Step 1: Write failing error-contract tests**

Create `web/src/lib/reports/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AuthError } from "@/lib/auth/errors";

import {
  invalidReportResponse,
  referenceDataErrorResponse,
  ReportError,
  reportErrorResponse,
} from "./errors";

describe("report errors", () => {
  it("returns flattened fields only for schema validation", async () => {
    const parsed = z.strictObject({ title: z.string().min(5) }).safeParse({
      title: "x",
    });
    if (parsed.success) throw new Error("Expected validation to fail");

    const response = invalidReportResponse(parsed.error);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid report",
        fields: { title: expect.any(Array) },
      },
    });
  });

  it.each([
    ["REPORT_CREATION_FORBIDDEN", 403, "Only active student accounts can create reports"],
    ["CATEGORY_UNAVAILABLE", 422, "Category is unavailable"],
    ["CAMPUS_LOCATION_UNAVAILABLE", 422, "Campus location is unavailable"],
  ] as const)("maps %s exactly", async (code, status, message) => {
    const response = reportErrorResponse(new ReportError(code));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({
      error: { code, message },
    });
  });

  it("reuses the authentication-required response", async () => {
    const response = reportErrorResponse(
      new AuthError("AUTHENTICATION_REQUIRED"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Authentication required",
      },
    });
  });

  it("hides unknown creation and reference-data failures", async () => {
    const creation = reportErrorResponse(new Error("database details"));
    const reference = referenceDataErrorResponse(
      new SyntaxError("internal parser details"),
    );

    expect(creation.status).toBe(500);
    await expect(creation.json()).resolves.toEqual({
      error: {
        code: "REPORT_CREATION_FAILED",
        message: "Unable to create report",
      },
    });
    expect(reference.status).toBe(500);
    await expect(reference.json()).resolves.toEqual({
      error: {
        code: "REFERENCE_DATA_FAILED",
        message: "Unable to load reference data",
      },
    });
  });
});
```

- [ ] **Step 2: Write the failing owner-response tests**

Create `web/src/lib/reports/public-report.test.ts`:

```ts
import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import { toOwnerReport } from "./public-report";

describe("owner report response", () => {
  it("converts IDs and dates and returns only approved report fields", () => {
    const report = {
      _id: new mongoose.Types.ObjectId("64b64c6f2f4d9f1a2b3c4d50"),
      reporterId: new mongoose.Types.ObjectId("64b64c6f2f4d9f1a2b3c4d51"),
      reportType: "lost",
      title: "Black laptop bag",
      publicDescription: "Black laptop bag with a shoulder strap.",
      categoryId: new mongoose.Types.ObjectId("64b64c6f2f4d9f1a2b3c4d52"),
      campusLocationId: new mongoose.Types.ObjectId("64b64c6f2f4d9f1a2b3c4d53"),
      occurredAt: new Date("2026-08-14T02:00:00.000Z"),
      colors: ["Black"],
      tags: ["laptop", "bag"],
      photoUrls: ["https://images.example/item.jpg"],
      status: "open",
      privacySettings: {
        showPhoto: true,
        showEventDate: false,
        showCampusLocation: true,
      },
      resolvedAt: null,
      createdAt: new Date("2026-08-15T02:05:00.000Z"),
      updatedAt: new Date("2026-08-15T02:05:00.000Z"),
    };

    expect(toOwnerReport(report as never)).toEqual({
      id: "64b64c6f2f4d9f1a2b3c4d50",
      reporterId: "64b64c6f2f4d9f1a2b3c4d51",
      reportType: "lost",
      title: "Black laptop bag",
      publicDescription: "Black laptop bag with a shoulder strap.",
      categoryId: "64b64c6f2f4d9f1a2b3c4d52",
      campusLocationId: "64b64c6f2f4d9f1a2b3c4d53",
      occurredAt: "2026-08-14T02:00:00.000Z",
      colors: ["Black"],
      tags: ["laptop", "bag"],
      photoUrls: ["https://images.example/item.jpg"],
      status: "open",
      privacySettings: {
        showPhoto: true,
        showEventDate: false,
        showCampusLocation: true,
      },
      resolvedAt: null,
      createdAt: "2026-08-15T02:05:00.000Z",
      updatedAt: "2026-08-15T02:05:00.000Z",
    });
  });

  it("cannot expose private verification or authentication credentials", () => {
    const source = {
      _id: { toString: () => "report-id" },
      reporterId: { toString: () => "user-id" },
      categoryId: { toString: () => "category-id" },
      campusLocationId: { toString: () => "location-id" },
      reportType: "found",
      title: "Found student card",
      publicDescription: "A student card was found near the library.",
      occurredAt: new Date("2026-08-14T02:00:00.000Z"),
      colors: ["white"],
      tags: [],
      photoUrls: [],
      status: "open",
      privacySettings: {
        showPhoto: true,
        showEventDate: true,
        showCampusLocation: true,
      },
      resolvedAt: null,
      createdAt: new Date("2026-08-15T02:05:00.000Z"),
      updatedAt: new Date("2026-08-15T02:05:00.000Z"),
      distinguishingFeatures: ["secret"],
      expectedAnswer: "secret answer",
      passwordHash: "secret hash",
      tokenHash: "secret token hash",
    };

    expect(JSON.stringify(toOwnerReport(source as never))).not.toMatch(
      /distinguishingFeatures|expectedAnswer|passwordHash|tokenHash|secret/,
    );
  });
});
```

- [ ] **Step 3: Run both files to verify the red state**

```powershell
npm.cmd test -- src/lib/reports/errors.test.ts src/lib/reports/public-report.test.ts
```

Expected: FAIL because `./errors` and `./public-report` do not exist.

- [ ] **Step 4: Implement safe report errors**

Create `web/src/lib/reports/errors.ts`:

```ts
import { z, type ZodError } from "zod";

import { AuthError, authErrorResponse } from "@/lib/auth/errors";

const reportErrorDefinitions = {
  REPORT_CREATION_FORBIDDEN: {
    message: "Only active student accounts can create reports",
    status: 403,
  },
  CATEGORY_UNAVAILABLE: {
    message: "Category is unavailable",
    status: 422,
  },
  CAMPUS_LOCATION_UNAVAILABLE: {
    message: "Campus location is unavailable",
    status: 422,
  },
  REPORT_CREATION_FAILED: {
    message: "Unable to create report",
    status: 500,
  },
  REFERENCE_DATA_FAILED: {
    message: "Unable to load reference data",
    status: 500,
  },
} as const;

export type ReportErrorCode = keyof typeof reportErrorDefinitions;

export class ReportError extends Error {
  readonly code: ReportErrorCode;
  readonly status: number;

  constructor(code: ReportErrorCode) {
    const definition = reportErrorDefinitions[code];
    super(definition.message);
    this.name = "ReportError";
    this.code = code;
    this.status = definition.status;
  }
}

export function invalidReportResponse(error?: ZodError) {
  const fields = error ? z.flattenError(error).fieldErrors : undefined;

  return Response.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid report",
        ...(fields ? { fields } : {}),
      },
    },
    { status: 400 },
  );
}

function safeReportErrorResponse(error: ReportError) {
  return Response.json(
    { error: { code: error.code, message: error.message } },
    { status: error.status },
  );
}

export function reportErrorResponse(error: unknown) {
  if (error instanceof AuthError) return authErrorResponse(error);

  return safeReportErrorResponse(
    error instanceof ReportError
      ? error
      : new ReportError("REPORT_CREATION_FAILED"),
  );
}

export function referenceDataErrorResponse(error: unknown) {
  if (error instanceof AuthError) return authErrorResponse(error);

  return safeReportErrorResponse(
    error instanceof ReportError
      ? error
      : new ReportError("REFERENCE_DATA_FAILED"),
  );
}
```

- [ ] **Step 5: Implement the owner-safe mapper**

Create `web/src/lib/reports/public-report.ts`:

```ts
import type { HydratedDocument } from "mongoose";

import type { ItemReport } from "@/models/item-report";

type ReportDocument = HydratedDocument<ItemReport> & {
  createdAt: Date;
  updatedAt: Date;
};

export function toOwnerReport(report: ReportDocument) {
  return {
    id: report._id.toString(),
    reporterId: report.reporterId.toString(),
    reportType: report.reportType,
    title: report.title,
    publicDescription: report.publicDescription,
    categoryId: report.categoryId.toString(),
    campusLocationId: report.campusLocationId.toString(),
    occurredAt: report.occurredAt.toISOString(),
    colors: [...report.colors],
    tags: [...report.tags],
    photoUrls: [...report.photoUrls],
    status: report.status,
    privacySettings: {
      showPhoto: report.privacySettings.showPhoto,
      showEventDate: report.privacySettings.showEventDate,
      showCampusLocation: report.privacySettings.showCampusLocation,
    },
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
}

export type OwnerReport = ReturnType<typeof toOwnerReport>;
```

- [ ] **Step 6: Run focused tests and lint**

```powershell
npm.cmd test -- src/lib/reports/errors.test.ts src/lib/reports/public-report.test.ts
npm.cmd run lint -- src/lib/reports/errors.ts src/lib/reports/errors.test.ts src/lib/reports/public-report.ts src/lib/reports/public-report.test.ts
```

Expected: both test files pass and ESLint emits no errors or warnings.

- [ ] **Step 7: Commit the safe contracts**

```powershell
git add web/src/lib/reports/errors.ts web/src/lib/reports/errors.test.ts web/src/lib/reports/public-report.ts web/src/lib/reports/public-report.test.ts
git diff --cached --check
git commit -m "feat(reports): define safe API contracts" -m "Refs #12"
```

---

### Task 3: Add Active Reference-Data Queries

**Files:**
- Create: `web/src/lib/reports/reference-data.ts`
- Create: `web/src/lib/reports/reference-data.test.ts`

**Interfaces:**
- Consumes: `connectToDatabase`, `CategoryModel` and `CampusLocationModel`.
- Produces: `listActiveCategories(): Promise<CategoryOption[]>` and `listActiveCampusLocations(): Promise<CampusLocationOption[]>`.
- Both functions return plain allow-listed objects, not Mongoose documents.

- [ ] **Step 1: Write failing reference-data tests**

Create `web/src/lib/reports/reference-data.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/category", () => ({
  CategoryModel: { find: vi.fn() },
}));
vi.mock("@/models/campus-location", () => ({
  CampusLocationModel: { find: vi.fn() },
}));

import { connectToDatabase } from "@/lib/db";
import { CampusLocationModel } from "@/models/campus-location";
import { CategoryModel } from "@/models/category";

import {
  listActiveCampusLocations,
  listActiveCategories,
} from "./reference-data";

function queryReturning(rows: unknown[]) {
  const query = {
    select: vi.fn(),
    sort: vi.fn(),
    lean: vi.fn().mockResolvedValue(rows),
  };
  query.select.mockReturnValue(query);
  query.sort.mockReturnValue(query);
  return query;
}

describe("report reference data", () => {
  beforeEach(() => {
    vi.mocked(connectToDatabase).mockResolvedValue({} as never);
  });

  it("returns only active categories with allow-listed fields", async () => {
    const query = queryReturning([
      { _id: { toString: () => "category-id" }, name: "Electronics", description: null },
    ]);
    vi.mocked(CategoryModel.find).mockReturnValue(query as never);

    await expect(listActiveCategories()).resolves.toEqual([
      { id: "category-id", name: "Electronics", description: null },
    ]);

    expect(CategoryModel.find).toHaveBeenCalledWith({ isActive: true });
    expect(query.select).toHaveBeenCalledWith({
      _id: 1,
      name: 1,
      description: 1,
    });
    expect(query.sort).toHaveBeenCalledWith({ name: 1 });
  });

  it("returns active campus locations in stable campus/name order", async () => {
    const query = queryReturning([
      {
        _id: { toString: () => "location-id" },
        campusName: "Auckland",
        locationName: "Library",
        description: "Main library",
      },
    ]);
    vi.mocked(CampusLocationModel.find).mockReturnValue(query as never);

    await expect(listActiveCampusLocations()).resolves.toEqual([
      {
        id: "location-id",
        campusName: "Auckland",
        locationName: "Library",
        description: "Main library",
      },
    ]);

    expect(CampusLocationModel.find).toHaveBeenCalledWith({ isActive: true });
    expect(query.select).toHaveBeenCalledWith({
      _id: 1,
      campusName: 1,
      locationName: 1,
      description: 1,
    });
    expect(query.sort).toHaveBeenCalledWith({
      campusName: 1,
      locationName: 1,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify the red state**

```powershell
npm.cmd test -- src/lib/reports/reference-data.test.ts
```

Expected: FAIL because `./reference-data` does not exist.

- [ ] **Step 3: Implement active-only reference queries**

Create `web/src/lib/reports/reference-data.ts`:

```ts
import { connectToDatabase } from "@/lib/db";
import { CampusLocationModel } from "@/models/campus-location";
import { CategoryModel } from "@/models/category";

type Identifier = { toString(): string };

type CategoryRow = {
  _id: Identifier;
  name: string;
  description: string | null;
};

type CampusLocationRow = {
  _id: Identifier;
  campusName: string;
  locationName: string;
  description: string | null;
};

export async function listActiveCategories() {
  await connectToDatabase();
  const rows = await CategoryModel.find({ isActive: true })
    .select({ _id: 1, name: 1, description: 1 })
    .sort({ name: 1 })
    .lean<CategoryRow[]>();

  return rows.map((row) => ({
    id: row._id.toString(),
    name: row.name,
    description: row.description ?? null,
  }));
}

export async function listActiveCampusLocations() {
  await connectToDatabase();
  const rows = await CampusLocationModel.find({ isActive: true })
    .select({ _id: 1, campusName: 1, locationName: 1, description: 1 })
    .sort({ campusName: 1, locationName: 1 })
    .lean<CampusLocationRow[]>();

  return rows.map((row) => ({
    id: row._id.toString(),
    campusName: row.campusName,
    locationName: row.locationName,
    description: row.description ?? null,
  }));
}

export type CategoryOption = Awaited<
  ReturnType<typeof listActiveCategories>
>[number];
export type CampusLocationOption = Awaited<
  ReturnType<typeof listActiveCampusLocations>
>[number];
```

- [ ] **Step 4: Run focused tests and lint**

```powershell
npm.cmd test -- src/lib/reports/reference-data.test.ts
npm.cmd run lint -- src/lib/reports/reference-data.ts src/lib/reports/reference-data.test.ts
```

Expected: the reference-data test file passes and ESLint emits no errors or warnings.

- [ ] **Step 5: Commit the reference-data service**

```powershell
git add web/src/lib/reports/reference-data.ts web/src/lib/reports/reference-data.test.ts
git diff --cached --check
git commit -m "feat(reports): list active reference data" -m "Refs #12"
```

---

### Task 4: Add the Transactional Report Service

**Files:**
- Create: `web/src/lib/reports/service.ts`
- Create: `web/src/lib/reports/service.test.ts`

**Interfaces:**
- Consumes: `PublicUser`, `CreateReportInput`, `ReportError`, `toOwnerReport`, the cached database connection and four existing Mongoose models.
- Produces: `createReport(user: PublicUser, input: CreateReportInput): Promise<OwnerReport>`.
- The service accepts already-validated input but independently enforces the active-student role and active references.

- [ ] **Step 1: Write the failing service tests**

Create `web/src/lib/reports/service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/category", () => ({
  CategoryModel: { findOne: vi.fn() },
}));
vi.mock("@/models/campus-location", () => ({
  CampusLocationModel: { findOne: vi.fn() },
}));
vi.mock("@/models/item-report", () => ({
  ItemReportModel: { create: vi.fn() },
}));
vi.mock("@/models/private-verification-details", () => ({
  PrivateVerificationDetailsModel: { create: vi.fn() },
}));
vi.mock("./public-report", () => ({ toOwnerReport: vi.fn() }));

import { connectToDatabase } from "@/lib/db";
import { CampusLocationModel } from "@/models/campus-location";
import { CategoryModel } from "@/models/category";
import { ItemReportModel } from "@/models/item-report";
import { PrivateVerificationDetailsModel } from "@/models/private-verification-details";

import { toOwnerReport } from "./public-report";
import { createReport } from "./service";

const user = {
  id: "64b64c6f2f4d9f1a2b3c4d51",
  email: "student@example.com",
  role: "student" as const,
  status: "active" as const,
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Student Name",
    preferredContactMethod: "in_app" as const,
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
};

const input = {
  reportType: "lost" as const,
  title: "Black laptop bag",
  publicDescription: "Black laptop bag with a shoulder strap.",
  categoryId: "64b64c6f2f4d9f1a2b3c4d52",
  campusLocationId: "64b64c6f2f4d9f1a2b3c4d53",
  occurredAt: new Date("2026-08-14T02:00:00.000Z"),
  colors: ["Black"],
  tags: ["laptop", "bag"],
  photoUrls: ["https://images.example/item.jpg"],
  privacySettings: {
    showPhoto: true,
    showEventDate: true,
    showCampusLocation: true,
  },
  privateVerification: {
    distinguishingFeatures: ["Small scratch beneath the handle"],
    exactLocationDetails: "Second-floor study area",
    serialNumber: null,
    verificationQuestions: [
      {
        question: "What is attached to the zipper?",
        expectedAnswer: "A blue tag",
      },
    ],
    privateNotes: null,
  },
};

const ownerReport = { id: "report-id", status: "open" } as never;
const transaction = {
  withTransaction: vi.fn(async (work: () => Promise<void>) => work()),
  endSession: vi.fn(),
};

describe("report service", () => {
  beforeEach(() => {
    transaction.withTransaction.mockImplementation(async (work) => work());
    vi.mocked(connectToDatabase).mockResolvedValue({
      startSession: vi.fn().mockResolvedValue(transaction),
    } as never);
    vi.mocked(CategoryModel.findOne).mockResolvedValue({ _id: input.categoryId } as never);
    vi.mocked(CampusLocationModel.findOne).mockResolvedValue({
      _id: input.campusLocationId,
    } as never);
    vi.mocked(ItemReportModel.create).mockResolvedValue([
      { _id: "report-id" },
    ] as never);
    vi.mocked(PrivateVerificationDetailsModel.create).mockResolvedValue([] as never);
    vi.mocked(toOwnerReport).mockReturnValue(ownerReport);
  });

  it("creates public and private records in one transaction", async () => {
    await expect(createReport(user, input)).resolves.toBe(ownerReport);

    expect(transaction.withTransaction).toHaveBeenCalledOnce();
    expect(CategoryModel.findOne).toHaveBeenCalledWith(
      { _id: input.categoryId, isActive: true },
      { _id: 1 },
      { session: transaction },
    );
    expect(CampusLocationModel.findOne).toHaveBeenCalledWith(
      { _id: input.campusLocationId, isActive: true },
      { _id: 1 },
      { session: transaction },
    );
    expect(ItemReportModel.create).toHaveBeenCalledWith(
      [
        {
          reporterId: user.id,
          reportType: "lost",
          title: input.title,
          publicDescription: input.publicDescription,
          categoryId: input.categoryId,
          campusLocationId: input.campusLocationId,
          occurredAt: input.occurredAt,
          colors: input.colors,
          tags: input.tags,
          photoUrls: input.photoUrls,
          privacySettings: input.privacySettings,
          status: "open",
          resolvedAt: null,
        },
      ],
      { session: transaction },
    );
    expect(PrivateVerificationDetailsModel.create).toHaveBeenCalledWith(
      [
        {
          reportId: "report-id",
          ...input.privateVerification,
        },
      ],
      { session: transaction },
    );
    expect(toOwnerReport).toHaveBeenCalledWith({ _id: "report-id" });
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it.each([
    ["staff role", { ...user, role: "staff" as const }],
    ["inactive status", { ...user, status: "suspended" as const }],
  ])("rejects %s before connecting to the database", async (_case, account) => {
    await expect(createReport(account, input)).rejects.toMatchObject({
      code: "REPORT_CREATION_FORBIDDEN",
      status: 403,
    });

    expect(connectToDatabase).not.toHaveBeenCalled();
    expect(ItemReportModel.create).not.toHaveBeenCalled();
  });

  it("rejects a missing or inactive category without creating records", async () => {
    vi.mocked(CategoryModel.findOne).mockResolvedValue(null);

    await expect(createReport(user, input)).rejects.toMatchObject({
      code: "CATEGORY_UNAVAILABLE",
      status: 422,
    });

    expect(CampusLocationModel.findOne).not.toHaveBeenCalled();
    expect(ItemReportModel.create).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("rejects a missing or inactive campus location", async () => {
    vi.mocked(CampusLocationModel.findOne).mockResolvedValue(null);

    await expect(createReport(user, input)).rejects.toMatchObject({
      code: "CAMPUS_LOCATION_UNAVAILABLE",
      status: 422,
    });

    expect(ItemReportModel.create).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("ends the session and exposes no result when private persistence fails", async () => {
    const failure = new Error("private insert failed");
    vi.mocked(PrivateVerificationDetailsModel.create).mockRejectedValue(failure);

    await expect(createReport(user, input)).rejects.toBe(failure);

    expect(toOwnerReport).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify the red state**

```powershell
npm.cmd test -- src/lib/reports/service.test.ts
```

Expected: FAIL because `./service` does not exist.

- [ ] **Step 3: Implement the transactional service**

Create `web/src/lib/reports/service.ts`:

```ts
import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { CampusLocationModel } from "@/models/campus-location";
import { CategoryModel } from "@/models/category";
import { ItemReportModel } from "@/models/item-report";
import { PrivateVerificationDetailsModel } from "@/models/private-verification-details";

import { ReportError } from "./errors";
import { type OwnerReport, toOwnerReport } from "./public-report";
import type { CreateReportInput } from "./validation";

export async function createReport(
  user: PublicUser,
  input: CreateReportInput,
): Promise<OwnerReport> {
  if (user.status !== "active" || user.role !== "student") {
    throw new ReportError("REPORT_CREATION_FORBIDDEN");
  }

  const database = await connectToDatabase();
  const transaction = await database.startSession();
  let result: OwnerReport | undefined;

  try {
    await transaction.withTransaction(async () => {
      const category = await CategoryModel.findOne(
        { _id: input.categoryId, isActive: true },
        { _id: 1 },
        { session: transaction },
      );
      if (!category) throw new ReportError("CATEGORY_UNAVAILABLE");

      const campusLocation = await CampusLocationModel.findOne(
        { _id: input.campusLocationId, isActive: true },
        { _id: 1 },
        { session: transaction },
      );
      if (!campusLocation) {
        throw new ReportError("CAMPUS_LOCATION_UNAVAILABLE");
      }

      const [report] = await ItemReportModel.create(
        [
          {
            reporterId: user.id,
            reportType: input.reportType,
            title: input.title,
            publicDescription: input.publicDescription,
            categoryId: input.categoryId,
            campusLocationId: input.campusLocationId,
            occurredAt: input.occurredAt,
            colors: input.colors,
            tags: input.tags,
            photoUrls: input.photoUrls,
            privacySettings: input.privacySettings,
            status: "open",
            resolvedAt: null,
          },
        ],
        { session: transaction },
      );

      await PrivateVerificationDetailsModel.create(
        [
          {
            reportId: report._id,
            ...input.privateVerification,
          },
        ],
        { session: transaction },
      );

      result = toOwnerReport(report);
    });
  } finally {
    await transaction.endSession();
  }

  if (!result) {
    throw new Error("Report transaction did not produce a result");
  }

  return result;
}
```

- [ ] **Step 4: Run focused tests and lint**

```powershell
npm.cmd test -- src/lib/reports/service.test.ts
npm.cmd run lint -- src/lib/reports/service.ts src/lib/reports/service.test.ts
```

Expected: the service tests pass and ESLint emits no errors or warnings.

- [ ] **Step 5: Commit the transactional service**

```powershell
git add web/src/lib/reports/service.ts web/src/lib/reports/service.test.ts
git diff --cached --check
git commit -m "feat(reports): create reports transactionally" -m "Refs #12"
```

---

### Task 5: Add the Authenticated API Routes

**Files:**
- Create: `web/src/app/api/categories/route.ts`
- Create: `web/src/app/api/campus-locations/route.ts`
- Create: `web/src/app/api/reports/route.ts`
- Create: `web/src/app/api/reports/report-routes.test.ts`

**Interfaces:**
- Consumes: `readSessionCookie`, `getCurrentUser`, `AuthError`, the report response factories, `createReportSchema`, `createReport`, `listActiveCategories` and `listActiveCampusLocations`.
- Produces: authenticated GET handlers for reference data and an authenticated POST handler returning `{ report: OwnerReport }` with HTTP 201.
- Authentication occurs before parsing a report body. Only `request.json()` syntax failure maps to validation HTTP 400.

- [ ] **Step 1: Write the failing consolidated route tests**

Create `web/src/app/api/reports/report-routes.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/reports/reference-data", () => ({
  listActiveCategories: vi.fn(),
  listActiveCampusLocations: vi.fn(),
}));
vi.mock("@/lib/reports/service", () => ({ createReport: vi.fn() }));

import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ReportError } from "@/lib/reports/errors";
import {
  listActiveCampusLocations,
  listActiveCategories,
} from "@/lib/reports/reference-data";
import { createReport } from "@/lib/reports/service";

import { GET as campusLocationsGet } from "../campus-locations/route";
import { GET as categoriesGet } from "../categories/route";
import { POST as reportsPost } from "./route";

const user = {
  id: "64b64c6f2f4d9f1a2b3c4d51",
  email: "student@example.com",
  role: "student" as const,
  status: "active" as const,
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Student Name",
    preferredContactMethod: "in_app" as const,
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
};

const validBody = {
  reportType: "lost",
  title: "Black laptop bag",
  publicDescription: "Black laptop bag with a shoulder strap.",
  categoryId: "64b64c6f2f4d9f1a2b3c4d52",
  campusLocationId: "64b64c6f2f4d9f1a2b3c4d53",
  occurredAt: "2026-08-14T02:00:00.000Z",
  colors: ["Black"],
  tags: ["laptop"],
  photoUrls: [],
  privateVerification: {
    distinguishingFeatures: ["Small scratch beneath the handle"],
    verificationQuestions: [
      {
        question: "What is attached to the zipper?",
        expectedAnswer: "A blue tag",
      },
    ],
  },
};

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function malformedRequest() {
  return new Request("http://localhost/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
}

describe("report routes", () => {
  beforeEach(() => {
    vi.mocked(readSessionCookie).mockResolvedValue("raw-session-token");
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(listActiveCategories).mockResolvedValue([
      { id: "category-id", name: "Electronics", description: null },
    ]);
    vi.mocked(listActiveCampusLocations).mockResolvedValue([
      {
        id: "location-id",
        campusName: "Auckland",
        locationName: "Library",
        description: null,
      },
    ]);
  });

  it("returns authenticated active categories and campus locations", async () => {
    const categoryResponse = await categoriesGet();
    const locationResponse = await campusLocationsGet();

    expect(categoryResponse.status).toBe(200);
    await expect(categoryResponse.json()).resolves.toEqual({
      categories: [
        { id: "category-id", name: "Electronics", description: null },
      ],
    });
    expect(locationResponse.status).toBe(200);
    await expect(locationResponse.json()).resolves.toEqual({
      campusLocations: [
        {
          id: "location-id",
          campusName: "Auckland",
          locationName: "Library",
          description: null,
        },
      ],
    });
  });

  it.each([
    ["categories", categoriesGet],
    ["campus locations", campusLocationsGet],
  ])("requires authentication for %s", async (_name, handler) => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await handler();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Authentication required",
      },
    });
  });

  it("hides reference-data failures", async () => {
    vi.mocked(listActiveCategories).mockRejectedValue(
      new Error("mongodb details"),
    );

    const response = await categoriesGet();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "REFERENCE_DATA_FAILED",
        message: "Unable to load reference data",
      },
    });
  });

  it("creates a report and returns only the owner-safe response", async () => {
    const ownerReport = {
      id: "report-id",
      status: "open",
      title: "Black laptop bag",
    } as never;
    vi.mocked(createReport).mockResolvedValue(ownerReport);

    const response = await reportsPost(jsonRequest(validBody));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(createReport).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        reportType: "lost",
        occurredAt: new Date("2026-08-14T02:00:00.000Z"),
      }),
    );
    const submittedInput = vi.mocked(createReport).mock.calls[0]?.[1];
    expect(submittedInput).not.toHaveProperty("reporterId");
    expect(submittedInput).not.toHaveProperty("status");
    expect(submittedInput).not.toHaveProperty("resolvedAt");
    expect(body).toEqual({ report: ownerReport });
    expect(JSON.stringify(body)).not.toMatch(
      /expectedAnswer|privateNotes|serialNumber|tokenHash|passwordHash|raw-session-token/,
    );
  });

  it("authenticates before parsing the report body", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await reportsPost(malformedRequest());

    expect(response.status).toBe(401);
    expect(createReport).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", malformedRequest()],
    ["unknown fields", jsonRequest({ ...validBody, reporterId: user.id })],
  ])("returns HTTP 400 for %s", async (_case, request) => {
    const response = await reportsPost(request);

    expect(response.status).toBe(400);
    expect(createReport).not.toHaveBeenCalled();
  });

  it.each([
    ["CATEGORY_UNAVAILABLE", "Category is unavailable"],
    ["CAMPUS_LOCATION_UNAVAILABLE", "Campus location is unavailable"],
  ] as const)("maps %s exactly", async (code, message) => {
    vi.mocked(createReport).mockRejectedValue(new ReportError(code));

    const response = await reportsPost(jsonRequest(validBody));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: { code, message },
    });
  });

  it("does not misclassify an internal SyntaxError as invalid JSON", async () => {
    vi.mocked(createReport).mockRejectedValue(
      new SyntaxError("internal parser detail"),
    );

    const response = await reportsPost(jsonRequest(validBody));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "REPORT_CREATION_FAILED",
        message: "Unable to create report",
      },
    });
  });
});
```

- [ ] **Step 2: Run the route test to verify the red state**

```powershell
npm.cmd test -- src/app/api/reports/report-routes.test.ts
```

Expected: FAIL because the three Route Handler modules do not exist.

- [ ] **Step 3: Implement the categories handler**

Create `web/src/app/api/categories/route.ts`:

```ts
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import {
  listActiveCategories,
} from "@/lib/reports/reference-data";
import { referenceDataErrorResponse } from "@/lib/reports/errors";

export async function GET() {
  try {
    const user = await getCurrentUser(await readSessionCookie());
    if (!user) throw new AuthError("AUTHENTICATION_REQUIRED");

    return Response.json({ categories: await listActiveCategories() });
  } catch (error) {
    return referenceDataErrorResponse(error);
  }
}
```

- [ ] **Step 4: Implement the campus-locations handler**

Create `web/src/app/api/campus-locations/route.ts`:

```ts
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import { referenceDataErrorResponse } from "@/lib/reports/errors";
import {
  listActiveCampusLocations,
} from "@/lib/reports/reference-data";

export async function GET() {
  try {
    const user = await getCurrentUser(await readSessionCookie());
    if (!user) throw new AuthError("AUTHENTICATION_REQUIRED");

    return Response.json({
      campusLocations: await listActiveCampusLocations(),
    });
  } catch (error) {
    return referenceDataErrorResponse(error);
  }
}
```

- [ ] **Step 5: Implement the report-submission handler with separate boundaries**

Create `web/src/app/api/reports/route.ts`:

```ts
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import {
  invalidReportResponse,
  reportErrorResponse,
} from "@/lib/reports/errors";
import { createReport } from "@/lib/reports/service";
import { createReportSchema } from "@/lib/reports/validation";

export async function POST(request: Request) {
  let user: PublicUser;

  try {
    const currentUser = await getCurrentUser(await readSessionCookie());
    if (!currentUser) throw new AuthError("AUTHENTICATION_REQUIRED");
    user = currentUser;
  } catch (error) {
    return reportErrorResponse(error);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    return error instanceof SyntaxError
      ? invalidReportResponse()
      : reportErrorResponse(error);
  }

  const parsed = createReportSchema.safeParse(body);
  if (!parsed.success) return invalidReportResponse(parsed.error);

  try {
    return Response.json(
      { report: await createReport(user, parsed.data) },
      { status: 201 },
    );
  } catch (error) {
    return reportErrorResponse(error);
  }
}
```

- [ ] **Step 6: Run focused route tests and lint**

```powershell
npm.cmd test -- src/app/api/reports/report-routes.test.ts
npm.cmd run lint -- src/app/api/categories/route.ts src/app/api/campus-locations/route.ts src/app/api/reports/route.ts src/app/api/reports/report-routes.test.ts
```

Expected: route tests pass and ESLint emits no errors or warnings.

- [ ] **Step 7: Commit the API routes**

```powershell
git add web/src/app/api/categories/route.ts web/src/app/api/campus-locations/route.ts web/src/app/api/reports/route.ts web/src/app/api/reports/report-routes.test.ts
git diff --cached --check
git commit -m "feat(reports): add submission API routes" -m "Refs #12"
```

---

### Task 6: Full Verification and Delivery Scope

**Files:**
- Review: `docs/superpowers/specs/2026-08-15-report-submission-backend-design.md`
- Review: every file listed in the File Map.
- Verify only; do not change `.env.local`, connect to Atlas, create seed data or add unrelated files.

**Interfaces:**
- Consumes: all Task 1-5 deliverables.
- Produces: a clean Issue #12 branch with reproducible test, lint, build, audit and scope evidence.

- [ ] **Step 1: Run the complete automated test suite**

From `web/`:

```powershell
npm.cmd test
```

Expected: all existing authentication/model tests and all new report tests pass. No test loads `.env.local` or performs a real MongoDB connection.

- [ ] **Step 2: Run full lint**

```powershell
npm.cmd run lint
```

Expected: ESLint exits successfully with no errors or warnings.

- [ ] **Step 3: Run a production build**

```powershell
npm.cmd run build
```

Expected: Next.js compilation and TypeScript checks succeed. The route table contains dynamic routes for `/api/categories`, `/api/campus-locations`, `/api/reports`, the four existing `/api/auth/*` routes and `/api/health/database`.

- [ ] **Step 4: Run the dependency security audit**

```powershell
npm.cmd audit
```

Expected: `found 0 vulnerabilities`. Do not use `npm audit fix --force`.

- [ ] **Step 5: Verify secret handling and patch cleanliness**

From the repository root:

```powershell
git status --short --ignored web/.env.local
git diff --check
git status --short --branch
```

Expected:

- `.env.local` appears only as `!! web/.env.local`.
- `git diff --check` has no output.
- The branch is `feature/issue-12-report-submission-backend` with a clean worktree.

- [ ] **Step 6: Verify branch scope and commits**

```powershell
git diff --name-status develop...HEAD
git diff --stat develop...HEAD
git log --oneline develop..HEAD
```

Expected scope:

- The approved design and implementation plan.
- Five focused report library implementation/test file pairs.
- Three new Route Handlers and one consolidated route test.
- No existing authentication, database, model, page, manifest, lockfile or environment file changes.

- [ ] **Step 7: Prepare the user handoff**

After every check passes, instruct the user to run:

```powershell
git push -u origin feature/issue-12-report-submission-backend
```

Suggested pull-request title:

```text
feat(reports): add secure report submission backend
```

The pull-request body must list the three endpoints, transaction/privacy protections, the exact verification results and `Closes #12`.
