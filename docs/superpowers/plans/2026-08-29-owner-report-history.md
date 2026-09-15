# Owner Report History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a private, read-only `/reports/mine` workflow that lists every report owned by the authenticated account with strict filters, fixed pagination, safe thumbnails, and existing detail links.

**Architecture:** A dedicated strict query schema feeds an owner-only Mongoose service and `GET /api/reports/mine`. The existing report browser client gains a strict owner-page contract, while a focused URL helper and client component render the page without changing public browsing or report persistence.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, MongoDB/Mongoose 9, Zod 4, Vitest 4, Testing Library, CSS Modules.

## Global Constraints

- Work only on `feature/owner-report-history`, based on the current `develop` tip.
- Keep the feature read-only: no edit, delete, archive, status, claim, handover, storage, messaging, export, chart, or analytics actions.
- Do not change MongoDB schemas, indexes, dependencies, lockfiles, environment files, or external services.
- Derive ownership only from `PublicUser.id`; never accept `reporterId` or `userId` from a request.
- Include all five report statuses and both moderation statuses for the proven owner.
- Fix the page size at `10`; accept only canonical page integers from `1` through `10_000`.
- Do not query `PrivateVerificationDetails`, claims, user profiles, moderation events, or report image bytes.
- Embed only same-origin `/api/report-images/{imageId}` references; count but never embed legacy HTTPS URLs.
- Reuse existing authentication, safe error, date-formatting, session retry, stale-request, focus, touch-target, and 320-pixel responsive patterns.
- Tests must mock persistence and must not read `.env.local` or access MongoDB Atlas.
- Keep `npm audit` at zero known vulnerabilities and add no package.

## File map

- Create `web/src/lib/reports/owner-history-validation.ts`: strict API query contract and fixed page-size constant.
- Create `web/src/lib/reports/owner-history-validation.test.ts`: canonical and adversarial query cases.
- Create `web/src/lib/reports/owner-history-service.ts`: owner-bound projection, query, sort, pagination, and serialization.
- Create `web/src/lib/reports/owner-history-service.test.ts`: persistence boundary and privacy tests.
- Create `web/src/app/api/reports/mine/route.ts`: authentication-first GET handler.
- Create `web/src/app/api/reports/mine/owner-report-history-route.test.ts`: route access, validation, and redaction tests.
- Create `web/src/lib/reports/owner-history-search.ts`: URL parsing and href generation for the page.
- Create `web/src/lib/reports/owner-history-search.test.ts`: URL-state tests.
- Modify `web/src/lib/reports/browser-client.ts`: owner report/page types, strict schemas, and `getOwnReports`.
- Modify `web/src/lib/reports/browser-client.test.ts`: request, abort, response-integrity, and error tests.
- Create `web/src/components/reports/owner-report-history.tsx`: access boundary, filters, list, states, and pagination.
- Create `web/src/components/reports/owner-report-history.test.tsx`: browser workflow, accessibility, privacy, and stale-request tests.
- Create `web/src/components/reports/owner-report-history.module.css`: responsive history layout and accessible controls.
- Create `web/src/app/reports/mine/page.tsx`: page metadata, main landmark, and Suspense boundary.
- Modify `web/src/components/site-header.tsx` and its test: active-account `My reports` link.
- Modify `web/src/components/dashboard/dashboard-client.tsx` and its test: active-account history action.
- Create `docs/superpowers/verification/2026-08-29-owner-report-history.md`: final evidence and deferred-scope record.

---

### Task 1: Define the strict owner-history query boundary

**Files:**
- Create: `web/src/lib/reports/owner-history-validation.ts`
- Create: `web/src/lib/reports/owner-history-validation.test.ts`

**Interfaces:**
- Consumes: `REPORT_STATUSES` from `@/models/item-report`.
- Produces: `OWNER_REPORT_HISTORY_PAGE_SIZE`, `ownerReportHistoryQuerySchema`, and `OwnerReportHistoryQuery`.

- [ ] **Step 1: Write the failing validation tests**

Create table-driven Vitest cases that exercise the exact server input shape:

```ts
import { describe, expect, it } from "vitest";

import {
  OWNER_REPORT_HISTORY_PAGE_SIZE,
  ownerReportHistoryQuerySchema,
} from "./owner-history-validation";

describe("owner report history query", () => {
  it("uses fixed defaults", () => {
    expect(ownerReportHistoryQuerySchema.parse({})).toEqual({ page: 1 });
    expect(OWNER_REPORT_HISTORY_PAGE_SIZE).toBe(10);
  });

  it.each(["lost", "found"])("accepts report type %s", (reportType) => {
    expect(ownerReportHistoryQuerySchema.parse({ reportType })).toEqual({
      reportType,
      page: 1,
    });
  });

  it.each(["draft", "open", "claim_pending", "resolved", "closed"])(
    "accepts status %s",
    (status) => {
      expect(ownerReportHistoryQuerySchema.parse({ status })).toEqual({
        status,
        page: 1,
      });
    },
  );

  it.each(["1", "2", "10000"])("accepts canonical page %s", (page) => {
    expect(ownerReportHistoryQuerySchema.parse({ page }).page).toBe(Number(page));
  });

  it.each(["0", "-1", "+1", "01", "1.0", "1e2", "10001", ""])(
    "rejects non-canonical or out-of-range page %s",
    (page) => expect(ownerReportHistoryQuerySchema.safeParse({ page }).success).toBe(false),
  );

  it.each([
    { reporterId: "64b64c6f2f4d9f1a2b3c4d51" },
    { userId: "64b64c6f2f4d9f1a2b3c4d51" },
    { moderationStatus: "hidden" },
    { pageSize: "50" },
    { sort: "createdAt" },
    { reportType: ["lost", "found"] },
    { status: ["open", "closed"] },
    { page: ["1", "2"] },
  ])("rejects an over-broad or repeated input %#", (input) => {
    expect(ownerReportHistoryQuerySchema.safeParse(input).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run from `web`:

```powershell
npm test -- src/lib/reports/owner-history-validation.test.ts
```

Expected: FAIL because `owner-history-validation.ts` does not exist.

- [ ] **Step 3: Implement the minimal strict schema**

```ts
import { z } from "zod";

import { REPORT_STATUSES } from "@/models/item-report";

export const OWNER_REPORT_HISTORY_PAGE_SIZE = 10;

const canonicalPage = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(10_000));

export const ownerReportHistoryQuerySchema = z.strictObject({
  reportType: z.enum(["lost", "found"]).optional(),
  status: z.enum(REPORT_STATUSES).optional(),
  page: canonicalPage.default(1),
});

export type OwnerReportHistoryQuery = z.output<
  typeof ownerReportHistoryQuerySchema
>;
```

Do not add empty-string preprocessing to the API schema; omitted select values
must be absent from the request. The page URL helper in Task 4 owns browser
empty-string handling.

- [ ] **Step 4: Run the focused test and verify GREEN**

```powershell
npm test -- src/lib/reports/owner-history-validation.test.ts
```

Expected: all owner-history validation cases PASS.

- [ ] **Step 5: Commit the query boundary**

```powershell
git add web/src/lib/reports/owner-history-validation.ts web/src/lib/reports/owner-history-validation.test.ts
git commit -m "feat(report-history): validate owner history queries"
```

---

### Task 2: Query and serialize only the authenticated owner's reports

**Files:**
- Create: `web/src/lib/reports/owner-history-service.ts`
- Create: `web/src/lib/reports/owner-history-service.test.ts`

**Interfaces:**
- Consumes: `PublicUser`, `OwnerReportHistoryQuery`, `OWNER_REPORT_HISTORY_PAGE_SIZE`, `ItemReportModel`, and `toOwnerReport()`.
- Produces: `OwnerReportHistoryPage` and `listOwnReports(user, query): Promise<OwnerReportHistoryPage>`.

- [ ] **Step 1: Write the failing service tests**

Mock `connectToDatabase`, `ItemReportModel.find`,
`ItemReportModel.countDocuments`, and `toOwnerReport` using the same chain style
as `browse-service.test.ts`. Assert the exact owner filter and projection:

```ts
const ownerProjection = {
  _id: 1,
  reporterId: 1,
  reportType: 1,
  title: 1,
  publicDescription: 1,
  categoryId: 1,
  campusLocationId: 1,
  occurredAt: 1,
  colors: 1,
  tags: 1,
  photoUrls: 1,
  status: 1,
  moderationStatus: 1,
  privacySettings: 1,
  resolvedAt: 1,
  createdAt: 1,
  updatedAt: 1,
};

it("binds the unfiltered history to the authenticated owner", async () => {
  await expect(listOwnReports(user, { page: 1 })).resolves.toEqual({
    reports: [firstOwnerReport, secondOwnerReport],
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  });
  expect(ItemReportModel.find).toHaveBeenCalledWith(
    { reporterId: user.id },
    ownerProjection,
  );
  expect(findChain.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
  expect(findChain.skip).toHaveBeenCalledWith(0);
  expect(findChain.limit).toHaveBeenCalledWith(10);
  expect(ItemReportModel.countDocuments).toHaveBeenCalledWith({
    reporterId: user.id,
  });
});

it("adds only approved filters without weakening ownership", async () => {
  await listOwnReports(user, {
    reportType: "found",
    status: "draft",
    page: 3,
  });
  const filter = {
    reporterId: user.id,
    reportType: "found",
    status: "draft",
  };
  expect(ItemReportModel.find).toHaveBeenCalledWith(filter, ownerProjection);
  expect(ItemReportModel.countDocuments).toHaveBeenCalledWith(filter);
  expect(findChain.skip).toHaveBeenCalledWith(20);
});
```

Also assert:

```ts
expect(ItemReportModel.find).not.toHaveBeenCalledWith(
  expect.objectContaining({ moderationStatus: expect.anything() }),
  expect.anything(),
);
expect(toOwnerReport).toHaveBeenNthCalledWith(1, firstDocument);
expect(toOwnerReport).toHaveBeenNthCalledWith(2, secondDocument);
```

Add cases for parallel page/count execution, an empty page with `total: 21`
and `totalPages: 3`, all five statuses including `draft`, and rejection without
logging or transforming a private database message.

- [ ] **Step 2: Run the focused service test and verify RED**

```powershell
npm test -- src/lib/reports/owner-history-service.test.ts
```

Expected: FAIL because the service module does not exist.

- [ ] **Step 3: Implement the owner-bound service**

```ts
import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { ItemReportModel } from "@/models/item-report";

import {
  OWNER_REPORT_HISTORY_PAGE_SIZE,
  type OwnerReportHistoryQuery,
} from "./owner-history-validation";
import { type OwnerReport, toOwnerReport } from "./public-report";

const OWNER_REPORT_PROJECTION = {
  _id: 1,
  reporterId: 1,
  reportType: 1,
  title: 1,
  publicDescription: 1,
  categoryId: 1,
  campusLocationId: 1,
  occurredAt: 1,
  colors: 1,
  tags: 1,
  photoUrls: 1,
  status: 1,
  moderationStatus: 1,
  privacySettings: 1,
  resolvedAt: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

export type OwnerReportHistoryPage = {
  reports: OwnerReport[];
  pagination: {
    page: number;
    pageSize: typeof OWNER_REPORT_HISTORY_PAGE_SIZE;
    total: number;
    totalPages: number;
  };
};

export async function listOwnReports(
  user: PublicUser,
  query: OwnerReportHistoryQuery,
): Promise<OwnerReportHistoryPage> {
  await connectToDatabase();
  const filter = {
    reporterId: user.id,
    ...(query.reportType ? { reportType: query.reportType } : {}),
    ...(query.status ? { status: query.status } : {}),
  };
  const reportsQuery = ItemReportModel.find(filter, OWNER_REPORT_PROJECTION)
    .sort({ createdAt: -1, _id: -1 })
    .skip((query.page - 1) * OWNER_REPORT_HISTORY_PAGE_SIZE)
    .limit(OWNER_REPORT_HISTORY_PAGE_SIZE);
  const [documents, total] = await Promise.all([
    reportsQuery.exec(),
    ItemReportModel.countDocuments(filter).exec(),
  ]);
  return {
    reports: documents.map(toOwnerReport),
    pagination: {
      page: query.page,
      pageSize: OWNER_REPORT_HISTORY_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / OWNER_REPORT_HISTORY_PAGE_SIZE),
    },
  };
}
```

Do not catch database errors here; the route's existing approved error mapper
must redact them.

- [ ] **Step 4: Run validation and service tests**

```powershell
npm test -- src/lib/reports/owner-history-validation.test.ts src/lib/reports/owner-history-service.test.ts
```

Expected: both files PASS and no real database connection occurs.

- [ ] **Step 5: Commit the service**

```powershell
git add web/src/lib/reports/owner-history-service.ts web/src/lib/reports/owner-history-service.test.ts
git commit -m "feat(report-history): list reports for authenticated owner"
```

---

### Task 3: Expose the authentication-first owner-history API

**Files:**
- Create: `web/src/app/api/reports/mine/route.ts`
- Create: `web/src/app/api/reports/mine/owner-report-history-route.test.ts`

**Interfaces:**
- Consumes: Task 1 schema, existing `toReportBrowseQueryInput`, Task 2 service, session helpers, `invalidReportQueryResponse`, and `reportBrowseErrorResponse`.
- Produces: `GET /api/reports/mine` returning `OwnerReportHistoryPage`.

- [ ] **Step 1: Write failing route tests**

Mock the cookie, current-user, and owner-history service modules. Use an owner
page containing one hidden draft and assert the complete exact JSON response.
Add this ordering test so authentication is resolved before URL parsing:

```ts
it("authenticates before reading an invalid request URL", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  const request = { get url() { throw new Error("private URL detail"); } };

  const response = await GET(request as Request);

  expect(response.status).toBe(401);
  expect(listOwnReports).not.toHaveBeenCalled();
  expect(await response.text()).not.toContain("private URL detail");
});
```

Cover:

- no query and transformed `?reportType=found&status=draft&page=3`;
- active `student`, `staff`, and `administrator` values passed unchanged;
- missing/revoked/inactive sessions represented by `getCurrentUser()` returning
  `null`;
- unknown `reporterId`, `pageSize`, and `moderationStatus` parameters;
- repeated type, status, and page parameters;
- invalid page syntax and range;
- thrown cookie, authentication, URL, service, and forged `ReportError` values;
- response text excludes `expectedAnswer`, `exactLocationDetails`,
  `serialNumber`, `privateNotes`, `reviewNote`, `passwordHash`, `tokenHash`, and
  the private thrown message.

- [ ] **Step 2: Run the route test and verify RED**

```powershell
npm test -- src/app/api/reports/mine/owner-report-history-route.test.ts
```

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement the minimal route**

```ts
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { toReportBrowseQueryInput } from "@/lib/reports/browse-validation";
import { reportBrowseErrorResponse, invalidReportQueryResponse } from "@/lib/reports/errors";
import { listOwnReports } from "@/lib/reports/owner-history-service";
import { ownerReportHistoryQuerySchema } from "@/lib/reports/owner-history-validation";

export async function GET(request: Request) {
  let user: PublicUser;
  try {
    const currentUser = await getCurrentUser(await readSessionCookie());
    if (!currentUser) throw new AuthError("AUTHENTICATION_REQUIRED");
    user = currentUser;
  } catch (error) {
    return reportBrowseErrorResponse(error);
  }

  let parsed;
  try {
    parsed = ownerReportHistoryQuerySchema.safeParse(
      toReportBrowseQueryInput(new URL(request.url).searchParams),
    );
  } catch (error) {
    return reportBrowseErrorResponse(error);
  }
  if (!parsed.success) return invalidReportQueryResponse(parsed.error);

  try {
    return Response.json(await listOwnReports(user, parsed.data));
  } catch (error) {
    return reportBrowseErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run backend owner-history tests and regressions**

```powershell
npm test -- src/lib/reports/owner-history-validation.test.ts src/lib/reports/owner-history-service.test.ts src/app/api/reports/mine/owner-report-history-route.test.ts src/app/api/reports/browse-routes.test.ts
```

Expected: owner history and existing public browsing routes PASS.

- [ ] **Step 5: Commit the API**

```powershell
git add web/src/app/api/reports/mine/route.ts web/src/app/api/reports/mine/owner-report-history-route.test.ts
git commit -m "feat(report-history): expose owner history API"
```

---

### Task 4: Add strict browser data and URL-state contracts

**Files:**
- Create: `web/src/lib/reports/owner-history-search.ts`
- Create: `web/src/lib/reports/owner-history-search.test.ts`
- Modify: `web/src/lib/reports/browser-client.ts`
- Modify: `web/src/lib/reports/browser-client.test.ts`

**Interfaces:**
- Consumes: existing `CreatedReport`, `createdReportSchema`, `fetchSameOrigin`, `parseResponse`, and server query vocabulary.
- Produces: `OwnerReportHistoryRequest`, `OwnerReportHistoryPage`, `getOwnReports(input, signal?)`, `OwnerReportHistoryValues`, `parseOwnerReportHistorySearchParams`, and `ownerReportHistoryHref`.

- [ ] **Step 1: Write failing URL-state tests**

```ts
import { describe, expect, it } from "vitest";

import {
  ownerReportHistoryHref,
  parseOwnerReportHistorySearchParams,
} from "./owner-history-search";

describe("owner report history URL state", () => {
  it("parses approved filters and page", () => {
    expect(
      parseOwnerReportHistorySearchParams(
        new URLSearchParams("reportType=found&status=closed&page=3"),
      ),
    ).toEqual({
      values: { reportType: "found", status: "closed" },
      request: { reportType: "found", status: "closed", page: 3 },
      ignoredInvalidValues: false,
    });
  });

  it.each([
    "reportType=lost&reportType=found",
    "status=open&status=closed",
    "page=01",
    "page=10001",
    "reporterId=other-user",
  ])("ignores and marks invalid URL state %s", (query) => {
    expect(
      parseOwnerReportHistorySearchParams(new URLSearchParams(query))
        .ignoredInvalidValues,
    ).toBe(true);
  });

  it("builds a canonical href and omits page one", () => {
    expect(ownerReportHistoryHref({ reportType: "lost", status: "draft", page: 1 }))
      .toBe("/reports/mine?reportType=lost&status=draft");
  });
});
```

Also cover all statuses, empty filters, unknown values, signed/decimal/exponent
pages, duplicate parameters, stable parameter order, previous/next hrefs, and
clearing back to `/reports/mine`.

- [ ] **Step 2: Write failing browser-client tests**

Add `getOwnReports` imports and a fixture whose page size is exactly ten:

```ts
const ownerPage = {
  reports: [ownerReport],
  pagination: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
};

it("loads strict owner history with same-origin credentials and abort support", async () => {
  const controller = new AbortController();
  const fetchMock = vi.fn().mockResolvedValue(Response.json(ownerPage));
  vi.stubGlobal("fetch", fetchMock);

  await expect(
    getOwnReports(
      { reportType: "found", status: "closed", page: 2 },
      controller.signal,
    ),
  ).resolves.toEqual(ownerPage);
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/reports/mine?reportType=found&status=closed&page=2",
    { method: "GET", signal: controller.signal, credentials: "same-origin" },
  );
});
```

Reject response variants with an unknown top-level field, private verification
field, invalid photo reference, invalid date, wrong enum, `pageSize: 12`,
incorrect `totalPages`, more than ten reports, or non-zero reports when
`total: 0`. Preserve only the approved API error shape and reduce malformed or
non-JSON responses to `REQUEST_FAILED`.

- [ ] **Step 3: Run both focused tests and verify RED**

```powershell
npm test -- src/lib/reports/owner-history-search.test.ts src/lib/reports/browser-client.test.ts
```

Expected: new imports and functions are missing.

- [ ] **Step 4: Implement the minimal URL helper**

Use exact known-key and canonical-page checks; do not import React or add a
generic query library:

```ts
import type { OwnerReportHistoryRequest } from "./browser-client";

const types = new Set(["lost", "found"]);
const statuses = new Set(["draft", "open", "claim_pending", "resolved", "closed"]);

export type OwnerReportHistoryValues = {
  reportType: "" | "lost" | "found";
  status: "" | "draft" | "open" | "claim_pending" | "resolved" | "closed";
};

function safePage(value: string) {
  return /^[1-9]\d*$/.test(value) && Number(value) <= 10_000;
}
```

`parseOwnerReportHistorySearchParams` must read each known parameter exactly
once, mark unknown/repeated/invalid values, keep valid siblings, omit page one
from the request, and return empty select values for absent filters.
`ownerReportHistoryHref` must emit parameters in `reportType`, `status`, `page`
order and omit empty filters and page one.

- [ ] **Step 5: Add strict owner contracts and fetch function**

In `browser-client.ts`:

```ts
export type OwnerReport = CreatedReport;

export type OwnerReportHistoryRequest = {
  reportType?: OwnerReport["reportType"];
  status?: OwnerReport["status"];
  page?: number;
};

export type OwnerReportHistoryPage = {
  reports: OwnerReport[];
  pagination: {
    page: number;
    pageSize: 10;
    total: number;
    totalPages: number;
  };
};
```

Create a strict page schema with `pageSize: z.literal(10)` and a `superRefine`
that enforces `totalPages === Math.ceil(total / 10)`, no more than ten reports,
and no reports when total is zero. Reuse `createdReportSchema` for every owner
item rather than defining a second report shape.

```ts
export async function getOwnReports(
  input: OwnerReportHistoryRequest,
  signal?: AbortSignal,
): Promise<OwnerReportHistoryPage> {
  const search = new URLSearchParams();
  if (input.reportType) search.set("reportType", input.reportType);
  if (input.status) search.set("status", input.status);
  if (input.page && input.page !== 1) search.set("page", String(input.page));
  const suffix = search.size ? `?${search}` : "";
  const response = await fetchSameOrigin(`/api/reports/mine${suffix}`, {
    method: "GET",
    signal,
  });
  return parseResponse(response, ownerReportHistoryPageSchema);
}
```

- [ ] **Step 6: Run contract tests and TypeScript**

```powershell
npm test -- src/lib/reports/owner-history-search.test.ts src/lib/reports/browser-client.test.ts
npm exec -- tsc --noEmit --incremental false
```

Expected: both test files and TypeScript PASS.

- [ ] **Step 7: Commit browser contracts**

```powershell
git add web/src/lib/reports/owner-history-search.ts web/src/lib/reports/owner-history-search.test.ts web/src/lib/reports/browser-client.ts web/src/lib/reports/browser-client.test.ts
git commit -m "feat(report-history): add strict browser contracts"
```

---

### Task 5: Build the accessible owner-history page

**Files:**
- Create: `web/src/components/reports/owner-report-history.tsx`
- Create: `web/src/components/reports/owner-report-history.test.tsx`
- Create: `web/src/components/reports/owner-report-history.module.css`
- Create: `web/src/app/reports/mine/page.tsx`

**Interfaces:**
- Consumes: `useAuthSession`, `useRouter`, `useSearchParams`, Task 4 URL helpers and `getOwnReports`, `BrowserReportError`, `isInternalReportImagePath`, and `/reports/[id]`.
- Produces: `OwnerReportHistory` and the `/reports/mine` page.

- [ ] **Step 1: Write the failing route and component tests**

Use jsdom, mock `next/navigation`, `useAuthSession`, and `getOwnReports`, and
import the page metadata. Start with these public behaviours:

```tsx
it("renders the owner history page landmark and metadata", () => {
  const { container } = render(<OwnReportsPage />);
  expect(ownReportsMetadata.title).toBe("My reports");
  expect(container.querySelector("main#main-content")).toBeTruthy();
});

it("redirects an unauthenticated visitor without loading history", async () => {
  mockSession({ status: "unauthenticated", user: null });
  render(<OwnerReportHistory />);
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  expect(getOwnReports).not.toHaveBeenCalled();
});

it("loads the URL filters and renders an owner-only list", async () => {
  searchParams = new URLSearchParams("reportType=found&status=closed&page=2");
  vi.mocked(getOwnReports).mockResolvedValue(ownerPage);
  render(<OwnerReportHistory />);
  await screen.findByRole("heading", { name: "Your report history" });
  expect(getOwnReports).toHaveBeenCalledWith(
    { reportType: "found", status: "closed", page: 2 },
    expect.any(AbortSignal),
  );
  expect(screen.getByRole("link", { name: ownerReport.title }).getAttribute("href"))
    .toBe(`/reports/${ownerReport.id}`);
});
```

Add tests for:

- session loading, session retry, active role matrix, and inactive state;
- invalid URL alert without sending invalid values;
- labelled type/status selects, Apply filters, and Clear filters;
- filter submission resets page and uses the canonical href;
- initial, filtered-empty, and unfiltered-empty copy, with `Report an item`
  shown only for an active student;
- all five lifecycle labels and the `Hidden by moderation` notice;
- first internal image rendered with generated alt text and fixed dimensions;
- external HTTPS URLs counted but absent from every `<img src>`;
- event and created dates formatted with `en-NZ`;
- result count, Page n of m, Previous, and Next states;
- generic retry, 401 redirect, stale resolution, account change, and unmount
  abort behaviour;
- response text excludes reporter ID, privacy booleans, and private terms;
- CSS assertions for 44-pixel targets, visible focus, reserved thumbnail size,
  320-pixel breakpoint, and no forced horizontal scrolling.

- [ ] **Step 2: Run the component test and verify RED**

```powershell
npm test -- src/components/reports/owner-report-history.test.tsx
```

Expected: page and component modules do not exist.

- [ ] **Step 3: Implement the page shell**

```tsx
import { Suspense } from "react";
import type { Metadata } from "next";

import { OwnerReportHistory } from "@/components/reports/owner-report-history";

export const metadata: Metadata = { title: "My reports" };

export default function OwnReportsPage() {
  return (
    <main id="main-content">
      <Suspense fallback={<p role="status">Loading your report history</p>}>
        <OwnerReportHistory />
      </Suspense>
    </main>
  );
}
```

- [ ] **Step 4: Implement the access and request state machine**

Use a small discriminated union:

```ts
type HistoryState =
  | { status: "loading"; queryKey: string }
  | { status: "ready"; queryKey: string; page: OwnerReportHistoryPage }
  | { status: "error"; queryKey: string };
```

The outer component must redirect unauthenticated sessions, show the existing
retry/unavailable patterns, reject inactive accounts, and key the active child
by `session.user.id`. The active child must:

- parse `useSearchParams()` through `parseOwnerReportHistorySearchParams`;
- create one `AbortController` per request and abort it on query/account change
  or unmount;
- set state only when the current query key still owns the response;
- redirect 401/`AUTHENTICATION_REQUIRED` to `/login`;
- retain filters and expose `Retry` for all other failures;
- never render a prior account's or prior query's ready page.

- [ ] **Step 5: Implement the filters, semantic list, and pagination**

Use one explicit GET-style form with native selects and an Apply button. On
submit, call:

```ts
router.push(
  ownerReportHistoryHref({
    ...(reportType ? { reportType } : {}),
    ...(status ? { status } : {}),
  }),
);
```

For thumbnails, use only:

```tsx
const internalPhoto = report.photoUrls.find(isInternalReportImagePath);
{internalPhoto ? (
  <Image
    src={internalPhoto}
    alt={`Submitted item photo for ${report.title}`}
    width={160}
    height={120}
    unoptimized
  />
) : (
  <div aria-hidden="true">No preview</div>
)}
```

Render the list with `<ul>`/`<li>`, text status labels, the moderation notice,
`photoUrls.length`, and a title link to `/reports/${report.id}`. Use the
existing `Intl.DateTimeFormat("en-NZ", ...)` pattern for event and creation
dates. Build Previous and Next with `ownerReportHistoryHref` while preserving
the current filters.

- [ ] **Step 6: Implement the bounded responsive CSS**

The CSS module must use a single-column mobile layout by default, reserve a
`160px × 120px` thumbnail box, allow text to wrap with `min-width: 0`, and use
native grid/flex only. Include:

```css
.control,
.button,
.pageLink {
  min-width: 44px;
  min-height: 44px;
}

.control:focus-visible,
.button:focus-visible,
.pageLink:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 3px;
}

.thumbnail {
  width: 160px;
  height: 120px;
  object-fit: cover;
}

@media (max-width: 20rem) {
  .filters,
  .historyItem,
  .pagination {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

Use existing CSS variables from `globals.css`; do not introduce a design
library, animation, horizontal scroller, or custom select.

- [ ] **Step 7: Run component, route, and TypeScript checks**

```powershell
npm test -- src/components/reports/owner-report-history.test.tsx src/lib/reports/owner-history-search.test.ts src/lib/reports/browser-client.test.ts
npm exec -- tsc --noEmit --incremental false
```

Expected: the complete page workflow and TypeScript PASS.

- [ ] **Step 8: Commit the page**

```powershell
git add web/src/app/reports/mine/page.tsx web/src/components/reports/owner-report-history.tsx web/src/components/reports/owner-report-history.test.tsx web/src/components/reports/owner-report-history.module.css
git commit -m "feat(report-history): add owner history page"
```

---

### Task 6: Link active accounts to their report history

**Files:**
- Modify: `web/src/components/site-header.tsx`
- Modify: `web/src/components/site-header.test.tsx`
- Modify: `web/src/components/dashboard/dashboard-client.tsx`
- Modify: `web/src/components/dashboard/dashboard-client.test.tsx`

**Interfaces:**
- Consumes: existing `isActive`, authenticated user roles, header navigation, and dashboard workflow array.
- Produces: `My reports` header link and `Review my report history` dashboard action for active accounts only.

- [ ] **Step 1: Write failing navigation tests**

In the header test, extend the active role matrix:

```tsx
it.each(["student", "staff", "administrator"] as const)(
  "links an active %s to owned report history",
  (role) => {
    mockSession({
      status: "authenticated",
      user: { ...safeUser, role, status: "active" },
    });
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "My reports" }).getAttribute("href"))
      .toBe("/reports/mine");
  },
);
```

Add signed-out, unavailable, suspended, and deactivated cases that assert the
link is absent.

In dashboard tests, assert `Review my report history` points to
`/reports/mine` for every active role, remains absent for inactive accounts,
and update the expected `Available now` counts from `4/4/5` to `5/5/6` for
active student/staff/administrator while leaving inactive counts unchanged.

- [ ] **Step 2: Run navigation tests and verify RED**

```powershell
npm test -- src/components/site-header.test.tsx src/components/dashboard/dashboard-client.test.tsx
```

Expected: the two new links are missing and active action counts differ.

- [ ] **Step 3: Add the two gated links**

In `SiteHeader`, add next to `Browse`:

```tsx
{isActive ? (
  <Link className={`${styles.navLink} text-link`} href="/reports/mine">
    My reports
  </Link>
) : null}
```

In `DashboardClient`, append this action inside the existing
`user.status === "active"` block:

```ts
{
  title: "Review my report history",
  description: "Review every lost or found report submitted by this account.",
  href: "/reports/mine",
}
```

Do not alter claim, profile, notification, report-creation, or administrator
gates.

- [ ] **Step 4: Run navigation and owner-history component tests**

```powershell
npm test -- src/components/site-header.test.tsx src/components/dashboard/dashboard-client.test.tsx src/components/reports/owner-report-history.test.tsx
```

Expected: all navigation and history page tests PASS.

- [ ] **Step 5: Commit navigation**

```powershell
git add web/src/components/site-header.tsx web/src/components/site-header.test.tsx web/src/components/dashboard/dashboard-client.tsx web/src/components/dashboard/dashboard-client.test.tsx
git commit -m "feat(report-history): link owner history navigation"
```

---

### Task 7: Verify the complete course-bounded feature

**Files:**
- Create: `docs/superpowers/verification/2026-08-29-owner-report-history.md`
- Inspect: all branch changes from `97bb293` through `HEAD`

**Interfaces:**
- Consumes: all prior tasks and the approved design document.
- Produces: reproducible verification evidence with no feature-code change unless a gate exposes a defect.

- [ ] **Step 1: Run the complete focused owner-history suite**

From `web`:

```powershell
npm test -- src/lib/reports/owner-history-validation.test.ts src/lib/reports/owner-history-service.test.ts src/app/api/reports/mine/owner-report-history-route.test.ts src/lib/reports/owner-history-search.test.ts src/lib/reports/browser-client.test.ts src/components/reports/owner-report-history.test.tsx src/components/site-header.test.tsx src/components/dashboard/dashboard-client.test.tsx
```

Expected: every focused file PASS. Fix root causes and rerun the same command if
any case fails.

- [ ] **Step 2: Run report, authentication, image, moderation, and claim regressions**

```powershell
npm test -- src/app/api/reports/browse-routes.test.ts src/app/api/reports/report-routes.test.ts src/lib/reports/browse-service.test.ts src/components/reports/report-browser.test.tsx src/components/reports/report-detail-client.test.tsx src/app/api/report-images/[imageId]/report-image-read-route.test.ts src/lib/reports/image-read-service.test.ts src/lib/moderation/admin-service.test.ts src/lib/claims/claimant-service.test.ts src/lib/claims/staff-service.test.ts
```

Expected: public browsing remains non-draft/visible-only, owner image reads
remain protected, and claim/moderation workflows PASS.

- [ ] **Step 3: Run every repository quality gate**

```powershell
npm test
npm run lint
npm exec -- tsc --noEmit --incremental false
npm run build
npm audit
git diff --check 97bb293..HEAD
```

Expected: all tests, lint, TypeScript, and production build PASS; audit reports
zero known vulnerabilities; diff check prints no whitespace errors.

- [ ] **Step 4: Verify repository and privacy boundaries**

From the repository root:

```powershell
git status --short
git diff --name-only 97bb293..HEAD
git diff -- web/package.json web/package-lock.json web/src/models web/.env.local
git check-ignore -v web/.env.local
rg -n "PrivateVerificationDetails|expectedAnswer|exactLocationDetails|serialNumber|privateNotes|reviewNote|passwordHash|tokenHash" web/src/app/api/reports/mine web/src/lib/reports web/src/components/reports -g "owner-history*" -g "owner-report-history*"
```

Expected: no dependency, lockfile, schema, or environment change; `.env.local`
remains ignored; the privacy scan finds only deliberate negative test
assertions, never production response fields or queries.

- [ ] **Step 5: Perform the manual responsive and access demonstration**

Run `npm run dev` only against the developer's configured local database and
record screenshots or equivalent evidence for:

1. unfiltered owner history;
2. filtered history;
3. a hidden-report moderation notice;
4. empty history;
5. 320 CSS-pixel layout;
6. an external HTTPS photo counted but not embedded;
7. signed-out redirect and inactive-account unavailability.

Do not place credentials, cookies, email addresses, private verification data,
or database connection strings in evidence.

- [ ] **Step 6: Write the verification record using observed evidence**

Create the verification document with these exact sections:

- `# Owner Report History Verification`
- `## Requirement coverage`
- `## Automated results`
- `## Privacy and access-control results`
- `## Responsive and accessibility evidence`
- `## Dependency and repository boundaries`
- `## Deferred scope`

Under `Automated results`, copy the actual passing file/test counts and command
outcomes observed in Steps 1–3. Under `Deferred scope`, explicitly list report
editing/deletion/lifecycle actions, staff storage, messaging, exports,
analytics, and schema/dependency changes as not implemented.

- [ ] **Step 7: Commit verification evidence**

```powershell
git add docs/superpowers/verification/2026-08-29-owner-report-history.md
git commit -m "docs: verify owner report history"
git status --short
```

Expected: the verification commit succeeds and the working tree is clean.

---

## Plan self-review result

- Spec coverage: every acceptance criterion maps to Tasks 1–7.
- Scope: one read-only owner-history vertical slice; no independent subsystem is bundled.
- Type consistency: `OwnerReportHistoryQuery`, `OwnerReportHistoryRequest`, `OwnerReportHistoryPage`, and fixed page size `10` are consistent across server, browser, and component tasks.
- Privacy consistency: ownership comes only from `PublicUser.id`; private verification collections and fields are never queried or serialized.
- Placeholder scan: the plan contains executable code, exact paths, concrete assertions, commands, and expected outcomes without unfinished implementation markers.
