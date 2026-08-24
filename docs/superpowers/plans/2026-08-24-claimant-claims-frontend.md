# Claimant Claims Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the protected claimant-side flow for submitting, listing, viewing, refreshing and withdrawing the current active student's claims through the existing Issue #19 APIs.

**Architecture:** Add one strict same-origin Claim browser client and one small canonical list-URL module, then place three focused client surfaces behind a shared active-student access boundary. Reuse the existing session provider, report detail, header, dashboard, native controls, React state, Zod and CSS Modules; keep the backend authoritative and add no dependency, backend contract or global cache.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Zod 4, CSS Modules, Vitest 4, Testing Library, ESLint.

## Global Constraints

- Work only on `feature/issue-21-claimant-claims-frontend`; every implementation commit body is `Refs #21`.
- Do not read `.env.local`, connect to MongoDB Atlas, call a live application API, create or mutate a real Claim, push, open a PR, merge or delete branches.
- Do not modify database models, Claim API Route Handlers, authentication contracts, package manifests, dependency versions, report submission behaviour or staff/admin interfaces.
- All Claim pages require an authenticated account with role exactly `student` and status exactly `active`; the API remains authoritative after the initial UI check.
- Never render or persist submitted answers, expected answers, match results/counts, review notes, reviewer IDs, claimant identity records, reporter contact data, credentials, tokens or session values.
- All browser requests remain same-origin and use the existing HttpOnly session cookie through `credentials: "same-origin"` without reading the cookie.
- Successful Claim responses use strict Zod schemas that reject unknown fields. Components never render raw error bodies or arbitrary error messages.
- Preserve answer text in component memory after a failed submission, but never place answers in URL parameters, local storage, session storage, logs or detail/list state.
- Keep the existing Campus Find visual language and plain-English copy. Add no gradients, glass effects, decorative icon system, global state library, form library, query library, polling, WebSocket or speculative abstraction.
- Format user-facing dates with locale `en-NZ` and time zone `Pacific/Auckland`.
- Target WCAG 2.2 AA, semantic landmarks and headings, visible labels and focus, non-colour status text, 44-by-44 CSS-pixel targets, reduced-motion safety and no horizontal overflow at 320 CSS pixels.
- Use TDD. Every implementation task begins with a focused failing test, ends green, passes focused ESLint and TypeScript, and receives one independently reviewable commit.
- Use `apply_patch` for edits. Stage only each task's named files and preserve unrelated user changes.

---

## File map

### Create

- `web/src/lib/claims/browser-client.ts`: strict claimant-safe schemas, safe browser errors and the five Issue #19 browser operations.
- `web/src/lib/claims/browser-client.test.ts`: exact request, response, privacy-rejection and safe-error tests.
- `web/src/lib/claims/list-search.ts`: canonical `status`/`page` parsing and `/claims` URL construction.
- `web/src/lib/claims/list-search.test.ts`: defaults, duplicate/unknown recovery, page bounds and URL round trips.
- `web/src/components/claims/claimant-access-boundary.tsx`: shared loading, redirect, retry and active-student permission states.
- `web/src/components/claims/claimant-access-boundary.test.tsx`: access matrix and user-ID remount tests.
- `web/src/components/claims/claim-submission-client.tsx`: question loading, local answer validation and single-flight submission.
- `web/src/components/claims/claim-submission-client.test.tsx`: question, validation, privacy, error preservation and redirect tests.
- `web/src/components/claims/claim-list-client.tsx`: URL-driven own-claim list, empty/retry states, stale guards and pagination.
- `web/src/components/claims/claim-list-client.test.tsx`: query, history, empty, stale, access-error and pagination tests.
- `web/src/components/claims/claim-detail-client.tsx`: claimant-safe detail, manual refresh and inline withdrawal.
- `web/src/components/claims/claim-detail-client.test.tsx`: status, refresh, conflict, confirmation and privacy tests.
- `web/src/components/claims/claim-management.module.css`: shared Claim page, form, card, state, responsive and focus rules.
- `web/src/app/reports/[id]/claim/page.tsx`: metadata, async report ID and protected claim-submission shell.
- `web/src/app/claims/page.tsx`: metadata, Suspense boundary and protected list shell.
- `web/src/app/claims/[id]/page.tsx`: metadata, async claim ID and protected detail shell.
- `docs/superpowers/verification/2026-08-24-claimant-claims-frontend.md`: final commit, automated checks, privacy scans and bounded visual-review evidence.

### Modify

- `web/src/components/reports/report-detail-client.tsx`: add the eligible active-student `Claim this item` link.
- `web/src/components/reports/report-detail-client.test.tsx`: report-entry eligibility matrix.
- `web/src/components/site-header.tsx`: add active-student-only `My claims`.
- `web/src/components/site-header.test.tsx`: navigation role/status matrix and narrow-screen contract.
- `web/src/components/site-header.module.css`: keep the extra authenticated destination usable at 320 pixels.
- `web/src/components/dashboard/dashboard-client.tsx`: activate `Manage recovery requests` only for active students.
- `web/src/components/dashboard/dashboard-client.test.tsx`: claimant dashboard destination and non-student exclusion.

---

### Task 1: Strict claimant browser API

**Files:**
- Create: `web/src/lib/claims/browser-client.ts`
- Create: `web/src/lib/claims/browser-client.test.ts`
- Modify: `docs/superpowers/plans/2026-08-24-claimant-claims-frontend.md`: align the reviewed local error whitelist and explicit request-field projection.

**Interfaces:**
- Consumes: Issue #19 JSON contracts at `/api/reports/[id]/claim-questions`, `/api/reports/[id]/claims`, `/api/claims/mine`, `/api/claims/[id]` and `/api/claims/[id]/withdraw`.
- Produces:
  - `CLAIM_STATUSES`
  - `ClaimStatus`
  - `ClaimReportSummary`
  - `ClaimantClaim`
  - `ClaimPagination`
  - `ClaimPage`
  - `ClaimQuestion`
  - `ClaimQuestions`
  - `ClaimAnswer`
  - `MyClaimsRequest`
  - `ClaimBrowserError`
  - `getClaimQuestionsForReport(reportId: string): Promise<ClaimQuestions>`
  - `submitClaim(reportId: string, responses: ClaimAnswer[]): Promise<ClaimantClaim>`
  - `getMyClaims(input: MyClaimsRequest): Promise<ClaimPage>`
  - `getMyClaim(claimId: string): Promise<ClaimantClaim>`
  - `withdrawMyClaim(claimId: string): Promise<ClaimantClaim>`

- [ ] **Step 1: Write failing request and privacy-contract tests**

Create the exact safe fixtures and test all five request shapes:

```ts
const claimantClaim = {
  id: "64b64c6f2f4d9f1a2b3c4d60",
  report: {
    id: "64b64c6f2f4d9f1a2b3c4d54",
    title: "Found student card",
    reportType: "found",
    status: "open",
  },
  status: "pending",
  reviewedAt: null,
  withdrawnAt: null,
  completedAt: null,
  createdAt: "2026-08-24T01:00:00.000Z",
  updatedAt: "2026-08-24T01:00:00.000Z",
} satisfies ClaimantClaim;

const claimQuestions = {
  report: {
    id: "64b64c6f2f4d9f1a2b3c4d54",
    title: "Found student card",
    reportType: "found",
  },
  questions: [
    { questionIndex: 0, question: "What is printed on the reverse?" },
  ],
} satisfies ClaimQuestions;

it("loads strict claim questions with an encoded report id", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json(claimQuestions));
  vi.stubGlobal("fetch", fetchMock);

  await expect(getClaimQuestionsForReport("id/with spaces")).resolves.toEqual(
    claimQuestions,
  );
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/reports/id%2Fwith%20spaces/claim-questions",
    { method: "GET", credentials: "same-origin" },
  );
});

it("posts only indexed responses and returns the safe created claim", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    Response.json({ claim: claimantClaim }, { status: 201 }),
  );
  vi.stubGlobal("fetch", fetchMock);

  await expect(
    submitClaim(claimantClaim.report.id, [
      { questionIndex: 0, answer: "Blue label" },
    ]),
  ).resolves.toEqual(claimantClaim);
  expect(fetchMock).toHaveBeenCalledWith(
    `/api/reports/${claimantClaim.report.id}/claims`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        responses: [{ questionIndex: 0, answer: "Blue label" }],
      }),
    },
  );
});

it("uses typed list filters and omits the default page", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    Response.json({
      claims: [claimantClaim],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  await getMyClaims({ status: "pending", page: 1 });
  expect(fetchMock).toHaveBeenCalledWith("/api/claims/mine?status=pending", {
    method: "GET",
    credentials: "same-origin",
  });
});

it("encodes detail ids and posts an exact empty withdrawal object", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ claim: claimantClaim }))
    .mockResolvedValueOnce(Response.json({ claim: claimantClaim }));
  vi.stubGlobal("fetch", fetchMock);

  await getMyClaim("claim/with spaces");
  await withdrawMyClaim("claim/with spaces");

  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    "/api/claims/claim%2Fwith%20spaces",
    { method: "GET", credentials: "same-origin" },
  );
  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    "/api/claims/claim%2Fwith%20spaces/withdraw",
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
});
```

Add table cases proving every successful schema rejects an extra or malformed property, including `expectedAnswer`, `answer`, `matched`, `verification`, `reviewNote`, `reviewedBy`, `claimant`, `reporterId`, unknown pagination fields, invalid dates, an unsupported status, duplicate question indexes and a non-integer pagination value. Add 400/401/403/404/409/500, non-JSON, malformed-success and rejected-fetch cases; assert only local `ClaimBrowserError` code/status/message/fields are observable and raw internal response text is not.

- [ ] **Step 2: Run the focused test and confirm red**

Run:

```powershell
cd web
npm test -- src/lib/claims/browser-client.test.ts
```

Expected: FAIL because `browser-client.ts` and its exports do not exist.

- [ ] **Step 3: Implement the strict schemas and five operations**

Use these exact public types and request shapes:

```ts
import { z } from "zod";

const GENERIC_MESSAGE = "We could not complete that request. Please try again.";
const NETWORK_MESSAGE = "We could not reach the service. Please try again.";
const VALIDATION_RESPONSES_MESSAGE = "Check every answer and try again.";

const claimErrorDefinitions = {
  VALIDATION_ERROR: { status: 400, message: "Invalid claim request" },
  AUTHENTICATION_REQUIRED: { status: 401, message: "Authentication required" },
  CLAIM_FORBIDDEN: { status: 403, message: "Claim action is not permitted" },
  CLAIM_NOT_FOUND: { status: 404, message: "Claim not found" },
  CLAIM_ALREADY_EXISTS: {
    status: 409,
    message: "An active claim already exists",
  },
  REPORT_NOT_CLAIMABLE: {
    status: 409,
    message: "Report is not available for claiming",
  },
  CLAIM_STATE_CONFLICT: { status: 409, message: "Claim state has changed" },
  CLAIM_OPERATION_FAILED: { status: 500, message: "Claim operation failed" },
} as const;

export const CLAIM_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "withdrawn",
  "completed",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export type ClaimReportSummary = {
  id: string;
  title: string;
  reportType: "lost" | "found";
  status: "open" | "claim_pending" | "resolved" | "closed";
};

export type ClaimantClaim = {
  id: string;
  report: ClaimReportSummary;
  status: ClaimStatus;
  reviewedAt: string | null;
  withdrawnAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClaimPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ClaimPage = {
  claims: ClaimantClaim[];
  pagination: ClaimPagination;
};

export type ClaimQuestion = { questionIndex: number; question: string };
export type ClaimQuestions = {
  report: { id: string; title: string; reportType: "found" };
  questions: ClaimQuestion[];
};
export type ClaimAnswer = { questionIndex: number; answer: string };
export type MyClaimsRequest = { status?: ClaimStatus; page?: number };
```

Implement the exact strict schemas:

```ts
const dateTimeSchema = z.string().datetime({ offset: true });
const reportSummarySchema = z.strictObject({
  id: z.string().min(1),
  title: z.string(),
  reportType: z.enum(["lost", "found"]),
  status: z.enum(["open", "claim_pending", "resolved", "closed"]),
}) satisfies z.ZodType<ClaimReportSummary>;

const claimantClaimSchema = z.strictObject({
  id: z.string().min(1),
  report: reportSummarySchema,
  status: z.enum(CLAIM_STATUSES),
  reviewedAt: dateTimeSchema.nullable(),
  withdrawnAt: dateTimeSchema.nullable(),
  completedAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
}) satisfies z.ZodType<ClaimantClaim>;

const paginationSchema = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
}) satisfies z.ZodType<ClaimPagination>;

const questionSchema = z.strictObject({
  questionIndex: z.number().int().min(0).max(4),
  question: z.string().min(1),
});
const questionsSchema = z
  .array(questionSchema)
  .min(1)
  .max(5)
  .superRefine((questions, context) => {
    if (questions.some(({ questionIndex }, index) => questionIndex !== index)) {
      context.addIssue({
        code: "custom",
        message: "Question indexes must be contiguous and ordered",
      });
    }
  });

const claimQuestionsSchema = z.strictObject({
  report: z.strictObject({
    id: z.string().min(1),
    title: z.string(),
    reportType: z.literal("found"),
  }),
  questions: questionsSchema,
}) satisfies z.ZodType<ClaimQuestions>;

const claimResponseSchema = z.strictObject({
  claim: claimantClaimSchema,
});
const claimPageSchema = z.strictObject({
  claims: z.array(claimantClaimSchema),
  pagination: paginationSchema,
}) satisfies z.ZodType<ClaimPage>;
const errorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum([
      "VALIDATION_ERROR",
      "AUTHENTICATION_REQUIRED",
      "CLAIM_FORBIDDEN",
      "CLAIM_NOT_FOUND",
      "CLAIM_ALREADY_EXISTS",
      "REPORT_NOT_CLAIMABLE",
      "CLAIM_STATE_CONFLICT",
      "CLAIM_OPERATION_FAILED",
    ]),
    message: z.string().min(1),
    fields: z
      .strictObject({ responses: z.array(z.string()).min(1).optional() })
      .optional(),
  }),
});
```

Use this exact fetch/error boundary and public operations:

```ts
export class ClaimBrowserError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields?: Record<string, string[]>;

  constructor(options: {
    code: string;
    status: number;
    message: string;
    fields?: Record<string, string[]>;
  }) {
    super(options.message);
    this.name = "ClaimBrowserError";
    this.code = options.code;
    this.status = options.status;
    this.fields = options.fields;
  }
}

async function fetchSameOrigin(path: string, init: RequestInit) {
  try {
    return await fetch(path, { ...init, credentials: "same-origin" });
  } catch {
    throw new ClaimBrowserError({
      code: "NETWORK_ERROR",
      status: 0,
      message: NETWORK_MESSAGE,
    });
  }
}

async function parseResponse<T>(response: Response, schema: z.ZodType<T>) {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ClaimBrowserError({
      code: "REQUEST_FAILED",
      status: response.status,
      message: GENERIC_MESSAGE,
    });
  }

  if (!response.ok) {
    const parsed = errorResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new ClaimBrowserError({
        code: "REQUEST_FAILED",
        status: response.status,
        message: GENERIC_MESSAGE,
      });
    }
    const definition = claimErrorDefinitions[parsed.data.error.code];
    if (
      response.status !== definition.status ||
      (parsed.data.error.code !== "VALIDATION_ERROR" &&
        parsed.data.error.fields !== undefined)
    ) {
      throw new ClaimBrowserError({
        code: "REQUEST_FAILED",
        status: response.status,
        message: GENERIC_MESSAGE,
      });
    }
    const fields = parsed.data.error.fields?.responses
      ? { responses: [VALIDATION_RESPONSES_MESSAGE] }
      : undefined;
    throw new ClaimBrowserError({
      code: parsed.data.error.code,
      status: response.status,
      message: definition.message,
      fields,
    });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ClaimBrowserError({
      code: "REQUEST_FAILED",
      status: response.status,
      message: GENERIC_MESSAGE,
    });
  }
  return parsed.data;
}

export async function getClaimQuestionsForReport(
  reportId: string,
): Promise<ClaimQuestions> {
  const response = await fetchSameOrigin(
    `/api/reports/${encodeURIComponent(reportId)}/claim-questions`,
    { method: "GET" },
  );
  return parseResponse(response, claimQuestionsSchema);
}

export async function submitClaim(
  reportId: string,
  responses: ClaimAnswer[],
): Promise<ClaimantClaim> {
  const response = await fetchSameOrigin(
    `/api/reports/${encodeURIComponent(reportId)}/claims`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        responses: responses.map(({ questionIndex, answer }) => ({
          questionIndex,
          answer,
        })),
      }),
    },
  );
  return (await parseResponse(response, claimResponseSchema)).claim;
}

export async function getMyClaims(
  input: MyClaimsRequest,
): Promise<ClaimPage> {
  const search = new URLSearchParams();
  if (input.status) search.set("status", input.status);
  if (input.page && input.page !== 1) search.set("page", String(input.page));
  const query = search.toString();
  const response = await fetchSameOrigin(
    query ? `/api/claims/mine?${query}` : "/api/claims/mine",
    { method: "GET" },
  );
  return parseResponse(response, claimPageSchema);
}

export async function getMyClaim(claimId: string): Promise<ClaimantClaim> {
  const response = await fetchSameOrigin(
    `/api/claims/${encodeURIComponent(claimId)}`,
    { method: "GET" },
  );
  return (await parseResponse(response, claimResponseSchema)).claim;
}

export async function withdrawMyClaim(
  claimId: string,
): Promise<ClaimantClaim> {
  const response = await fetchSameOrigin(
    `/api/claims/${encodeURIComponent(claimId)}/withdraw`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
  return (await parseResponse(response, claimResponseSchema)).claim;
}
```

- [ ] **Step 4: Verify focused behaviour, lint and types**

Run:

```powershell
npm test -- src/lib/claims/browser-client.test.ts
npx eslint src/lib/claims/browser-client.ts src/lib/claims/browser-client.test.ts
npx tsc --noEmit --incremental false
```

Expected: all commands PASS; privacy-shaped success objects fail closed.

- [ ] **Step 5: Commit Task 1**

```powershell
git add docs/superpowers/plans/2026-08-24-claimant-claims-frontend.md web/src/lib/claims/browser-client.ts web/src/lib/claims/browser-client.test.ts
git diff --cached --check
git commit -m "feat(claim-ui): add claimant browser contracts" -m "Refs #21"
```

---

### Task 2: Canonical Claim list URL state

**Files:**
- Create: `web/src/lib/claims/list-search.ts`
- Create: `web/src/lib/claims/list-search.test.ts`

**Interfaces:**
- Consumes: `ClaimStatus`, `MyClaimsRequest` and `CLAIM_STATUSES` from Task 1.
- Produces:
  - `ClaimListSearch`
  - `parseClaimListSearchParams(params: URLSearchParams): { values: ClaimListSearch; request: MyClaimsRequest; ignoredInvalidValues: boolean }`
  - `claimListHref(input: ClaimListSearch): string`

- [ ] **Step 1: Write failing canonicalisation tests**

```ts
it("uses safe defaults for an empty query", () => {
  expect(parseClaimListSearchParams(new URLSearchParams())).toEqual({
    values: { status: "", page: 1 },
    request: {},
    ignoredInvalidValues: false,
  });
});

it.each([
  ["status=pending&status=approved"],
  ["page=2&page=3"],
  ["status=unknown"],
  ["page=0"],
  ["page=1.5"],
  ["page=9007199254740992"],
  ["extra=value"],
])("recovers invalid or duplicate values without forwarding them: %s", (query) => {
  expect(
    parseClaimListSearchParams(new URLSearchParams(query)),
  ).toMatchObject({
    ignoredInvalidValues: true,
  });
});

it("round trips a filtered later page in a fixed key order", () => {
  const href = claimListHref({ status: "approved", page: 3 });
  expect(href).toBe("/claims?status=approved&page=3");
  expect(
    parseClaimListSearchParams(new URL(href, "https://example.test").searchParams),
  ).toEqual({
    values: { status: "approved", page: 3 },
    request: { status: "approved", page: 3 },
    ignoredInvalidValues: false,
  });
});
```

Also prove all five statuses are accepted, page 1 is omitted from the generated URL and page 10,000 is accepted while 10,001 is rejected to match the backend boundary.

- [ ] **Step 2: Run the focused test and confirm red**

Run:

```powershell
npm test -- src/lib/claims/list-search.test.ts
```

Expected: FAIL because `list-search.ts` does not exist.

- [ ] **Step 3: Implement the two-key parser and URL builder**

```ts
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
```

- [ ] **Step 4: Verify focused behaviour and types**

Run:

```powershell
npm test -- src/lib/claims/list-search.test.ts
npx eslint src/lib/claims/list-search.ts src/lib/claims/list-search.test.ts
npx tsc --noEmit --incremental false
```

Expected: all commands PASS.

- [ ] **Step 5: Commit Task 2**

```powershell
git add web/src/lib/claims/list-search.ts web/src/lib/claims/list-search.test.ts
git diff --cached --check
git commit -m "feat(claim-ui): add canonical claim list URLs" -m "Refs #21"
```

---

### Task 3: Shared claimant access and navigation

**Files:**
- Create: `web/src/components/claims/claimant-access-boundary.tsx`
- Create: `web/src/components/claims/claimant-access-boundary.test.tsx`
- Create: `web/src/components/claims/claim-management.module.css`
- Modify: `web/src/components/site-header.tsx`
- Modify: `web/src/components/site-header.test.tsx`
- Modify: `web/src/components/site-header.module.css`
- Modify: `web/src/components/dashboard/dashboard-client.tsx`
- Modify: `web/src/components/dashboard/dashboard-client.test.tsx`

**Interfaces:**
- Consumes: `useAuthSession()` and `useRouter()` from the existing auth/navigation layers.
- Produces: `ClaimantAccessBoundary({ children }: { children: ReactNode })`, which mounts children only for an active student and remounts them when the authenticated user ID changes.

- [ ] **Step 1: Write failing access and navigation tests**

Test the exact session matrix:

```tsx
it("mounts content only for an active student and remounts on account change", () => {
  const mountedAccounts: string[] = [];
  function Probe() {
    const session = useAuthSession();
    useEffect(() => {
      if (session.user) mountedAccounts.push(session.user.id);
    }, [session.user]);
    return <p>Claim workspace</p>;
  }

  mockSession({ status: "authenticated", user: activeStudent });
  const view = render(
    <ClaimantAccessBoundary>
      <Probe />
    </ClaimantAccessBoundary>,
  );
  expect(screen.getByText("Claim workspace")).toBeTruthy();

  mockSession({
    status: "authenticated",
    user: { ...activeStudent, id: "second-student" },
  });
  view.rerender(
    <ClaimantAccessBoundary>
      <Probe />
    </ClaimantAccessBoundary>,
  );
  expect(mountedAccounts).toEqual([activeStudent.id, "second-student"]);
});

it.each([
  [{ ...activeStudent, role: "staff" }, "Claim access unavailable"],
  [{ ...activeStudent, role: "administrator" }, "Claim access unavailable"],
  [{ ...activeStudent, status: "suspended" }, "Claim access unavailable"],
])("blocks non-claimant account %#", (user, heading) => {
  mockSession({ status: "authenticated", user: user as never });
  render(
    <ClaimantAccessBoundary>
      <p>Private claim content</p>
    </ClaimantAccessBoundary>,
  );
  expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
  expect(screen.queryByText("Private claim content")).toBeNull();
});
```

Add tests for loading, unauthenticated `router.replace("/login")`, unavailable-session retry and no private child content in every blocked state.

Extend header/dashboard tests:

```tsx
expect(screen.getByRole("link", { name: "My claims" }).getAttribute("href"))
  .toBe("/claims");
expect(
  screen.getByRole("link", { name: "Manage recovery requests" }).getAttribute("href"),
).toBe("/claims");
```

Use table cases for staff, administrator, suspended, unauthenticated and unavailable sessions proving `My claims` and a linked recovery request are absent.

- [ ] **Step 2: Run focused tests and confirm red**

Run:

```powershell
npm test -- src/components/claims/claimant-access-boundary.test.tsx src/components/site-header.test.tsx src/components/dashboard/dashboard-client.test.tsx
```

Expected: FAIL because the boundary and claimant navigation do not exist.

- [ ] **Step 3: Implement the access boundary**

```tsx
"use client";

import { Fragment, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuthSession } from "@/components/auth/auth-session-provider";
import styles from "./claim-management.module.css";

export function ClaimantAccessBoundary({ children }: { children: ReactNode }) {
  const router = useRouter();
  const session = useAuthSession();

  useEffect(() => {
    if (session.status === "unauthenticated") router.replace("/login");
  }, [router, session.status]);

  if (session.status === "unavailable") {
    return (
      <section className={styles.statePanel} role="alert" aria-labelledby="claim-session-error">
        <p className={styles.kicker}>Claim recovery</p>
        <h1 id="claim-session-error">We could not check your account</h1>
        <p>Your session may still be active. Retry when the service is available.</p>
        <button type="button" onClick={() => void session.refreshSession()}>
          Retry session check
        </button>
      </section>
    );
  }

  if (session.status !== "authenticated" || !session.user) {
    return (
      <section className={styles.loading} role="status" aria-live="polite">
        {session.status === "unauthenticated"
          ? "Taking you to sign in"
          : "Checking your account"}
      </section>
    );
  }

  if (session.user.role !== "student" || session.user.status !== "active") {
    return (
      <section className={styles.statePanel} role="alert" aria-labelledby="claim-permission">
        <p className={styles.kicker}>Claim recovery</p>
        <h1 id="claim-permission">Claim access unavailable</h1>
        <p>Your account cannot use the student claim workspace.</p>
        <Link href="/dashboard">Back to dashboard</Link>
      </section>
    );
  }

  return <Fragment key={session.user.id}>{children}</Fragment>;
}
```

Start `claim-management.module.css` with centred `.loading`/`.statePanel`, wrapped copy, 44-pixel links/buttons and existing colour tokens. Do not style global elements.

- [ ] **Step 4: Add active-student-only header and dashboard destinations**

In `SiteHeader`, place `My claims` next to `Browse` only under this exact check:

```tsx
{user.role === "student" && user.status === "active" ? (
  <Link className={`${styles.navLink} text-link`} href="/claims">
    My claims
  </Link>
) : null}
```

Replace the fixed third dashboard item with a value computed after the authenticated user exists:

```tsx
const canManageClaims = user.role === "student" && user.status === "active";
const workflow = [
  recoveryWorkflow[0],
  recoveryWorkflow[1],
  {
    title: "Manage recovery requests",
    description: "Track verification, handover arrangements and recovery progress.",
    ...(canManageClaims ? { href: "/claims" } : {}),
  },
];
```

Render `workflow` instead of `recoveryWorkflow`. Update the header's 24-rem compact rule so the navigation can wrap and every `.navLink`, `.signOut` and `.retry` remains at least 44 pixels; keep all destinations visible rather than hiding a link.

- [ ] **Step 5: Verify focused behaviour, styles and types**

Run:

```powershell
npm test -- src/components/claims/claimant-access-boundary.test.tsx src/components/site-header.test.tsx src/components/dashboard/dashboard-client.test.tsx
npx eslint src/components/claims/claimant-access-boundary.tsx src/components/claims/claimant-access-boundary.test.tsx src/components/site-header.tsx src/components/site-header.test.tsx src/components/dashboard/dashboard-client.tsx src/components/dashboard/dashboard-client.test.tsx
npx tsc --noEmit --incremental false
```

Expected: all commands PASS; no blocked session renders claimant content or navigation.

- [ ] **Step 6: Commit Task 3**

```powershell
git add web/src/components/claims/claimant-access-boundary.tsx web/src/components/claims/claimant-access-boundary.test.tsx web/src/components/claims/claim-management.module.css web/src/components/site-header.tsx web/src/components/site-header.test.tsx web/src/components/site-header.module.css web/src/components/dashboard/dashboard-client.tsx web/src/components/dashboard/dashboard-client.test.tsx
git diff --cached --check
git commit -m "feat(claim-ui): add claimant access navigation" -m "Refs #21"
```

---

### Task 4: Protected Claim submission and report entry

**Files:**
- Create: `web/src/app/reports/[id]/claim/page.tsx`
- Create: `web/src/components/claims/claim-submission-client.tsx`
- Create: `web/src/components/claims/claim-submission-client.test.tsx`
- Modify: `web/src/components/claims/claim-management.module.css`
- Modify: `web/src/components/reports/report-detail-client.tsx`
- Modify: `web/src/components/reports/report-detail-client.test.tsx`

**Interfaces:**
- Consumes: `ClaimantAccessBoundary`, `ClaimBrowserError`, `ClaimQuestions`, `getClaimQuestionsForReport()` and `submitClaim()` from Tasks 1 and 3.
- Produces: `ClaimSubmissionClient({ reportId }: { reportId: string })` and the route `/reports/[id]/claim`.

- [ ] **Step 1: Write failing route, form and CTA tests**

Test the route metadata/async ID, loading, ordered labelled fields, max length, blank validation, privacy copy, single-flight submit, answer preservation, exact body, success redirect and safe error mapping:

```tsx
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

it("submits only current server indexes and redirects to the safe claim detail", async () => {
  const user = userEvent.setup();
  getClaimQuestionsMock.mockResolvedValue(claimQuestions);
  submitClaimMock.mockResolvedValue(claimantClaim);
  render(<ClaimSubmissionClient reportId={claimQuestions.report.id} />);

  await screen.findByRole("heading", { name: "Claim Found student card" });
  await user.type(screen.getByLabelText("What is printed on the reverse?"), "Blue label");
  await user.click(screen.getByRole("button", { name: "Submit claim" }));

  expect(submitClaimMock).toHaveBeenCalledWith(claimQuestions.report.id, [
    { questionIndex: 0, answer: "Blue label" },
  ]);
  expect(replace).toHaveBeenCalledWith(`/claims/${claimantClaim.id}`);
});

it("keeps answers after a safe retryable failure and prevents duplicate submits", async () => {
  const user = userEvent.setup();
  const pending = deferred<ClaimantClaim>();
  getClaimQuestionsMock.mockResolvedValue(claimQuestions);
  submitClaimMock.mockReturnValue(pending.promise);
  render(<ClaimSubmissionClient reportId={claimQuestions.report.id} />);

  const answer = await screen.findByLabelText("What is printed on the reverse?");
  await user.type(answer, "Blue label");
  await user.dblClick(screen.getByRole("button", { name: "Submit claim" }));
  expect(submitClaimMock).toHaveBeenCalledOnce();
  pending.reject(new ClaimBrowserError({
    code: "NETWORK_ERROR",
    status: 0,
    message: "private network detail",
  }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "We could not submit your claim. Your answers are still here.",
  );
  expect(answer).toHaveValue("Blue label");
  expect(screen.queryByText("private network detail")).toBeNull();
});
```

Add cases for `REPORT_NOT_CLAIMABLE`, `CLAIM_ALREADY_EXISTS`, `VALIDATION_ERROR`, 401 redirect, 403 permission replacement, malformed question data and request retry. Assert that rendered text/source never shows `expectedAnswer`, `matched`, `reviewNote` or another claimant.

Extend report-detail tests with the complete matrix:

```tsx
it.each([
  ["found", "open", false, "student", true],
  ["lost", "open", false, "student", false],
  ["found", "claim_pending", false, "student", false],
  ["found", "open", true, "student", false],
  ["found", "open", false, "staff", false],
])(
  "gates the claim entry for %s %s owner=%s role=%s",
  async (reportType, status, isOwner, role, expected) => {
    mockSession({
      status: "authenticated",
      user: { ...safeUser, role: role as never },
    });
    getReportByIdMock.mockResolvedValue({
      ...memberReport,
      reportType,
      status,
      isOwner,
    } as never);
    render(<ReportDetailClient reportId={memberReport.id} />);
    await screen.findByRole("heading", { name: memberReport.title });
    expect(screen.queryByRole("link", { name: "Claim this item" }) !== null)
      .toBe(expected);
  },
);
```

- [ ] **Step 2: Run focused tests and confirm red**

Run:

```powershell
npm test -- src/components/claims/claim-submission-client.test.tsx src/components/reports/report-detail-client.test.tsx
```

Expected: FAIL because the submission client/route and Claim CTA do not exist.

- [ ] **Step 3: Add the protected route shell**

```tsx
import type { Metadata } from "next";

import { ClaimSubmissionClient } from "@/components/claims/claim-submission-client";
import { ClaimantAccessBoundary } from "@/components/claims/claimant-access-boundary";

export const metadata: Metadata = { title: "Claim an item" };

export default async function ClaimReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main id="main-content">
      <ClaimantAccessBoundary>
        <ClaimSubmissionClient reportId={id} />
      </ClaimantAccessBoundary>
    </main>
  );
}
```

- [ ] **Step 4: Implement the submission state machine and safe errors**

Use this exact state shape and validation:

```tsx
type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: ClaimQuestions }
  | { status: "not-claimable" }
  | { status: "already-claimed" }
  | { status: "forbidden" }
  | { status: "error" };

type SubmitState = "idle" | "submitting";

function answerErrors(
  questions: ClaimQuestions["questions"],
  answers: Record<number, string>,
) {
  return Object.fromEntries(
    questions.flatMap(({ questionIndex }) => {
      const answer = answers[questionIndex]?.trim() ?? "";
      return answer.length === 0
        ? [[questionIndex, "Enter an answer"]]
        : answer.length > 500
          ? [[questionIndex, "Use 500 characters or fewer"]]
          : [];
    }),
  ) as Record<number, string>;
}
```

Load questions once per mounted report ID with an incrementing request ID. Map errors exactly:

```ts
if (error instanceof ClaimBrowserError) {
  if (error.status === 401 || error.code === "AUTHENTICATION_REQUIRED") {
    router.replace("/login");
    return;
  }
  if (error.status === 403 || error.code === "CLAIM_FORBIDDEN") {
    setLoadState({ status: "forbidden" });
    return;
  }
  if (error.code === "REPORT_NOT_CLAIMABLE") {
    setLoadState({ status: "not-claimable" });
    return;
  }
  if (error.code === "CLAIM_ALREADY_EXISTS") {
    setLoadState({ status: "already-claimed" });
    return;
  }
}
setLoadState({ status: "error" });
```

When a valid question response arrives, initialise every answer without copying any other response property:

```ts
setAnswers(
  Object.fromEntries(
    data.questions.map(({ questionIndex }) => [questionIndex, ""]),
  ),
);
setLoadState({ status: "ready", data });
```

Render one `<fieldset>` with legend `Ownership verification`, a visible `<label>` and `<textarea maxLength={500}>` for every sorted question, and the privacy sentence `Your answers are sent to authorised staff for ownership review and are not shown on your claim pages.` Build submission data only from loaded server indexes:

```ts
const responses = loadState.data.questions.map(({ questionIndex }) => ({
  questionIndex,
  answer: answers[questionIndex].trim(),
}));
const claim = await submitClaim(reportId, responses);
router.replace(`/claims/${encodeURIComponent(claim.id)}`);
```

The ready surface starts with `Back to report` and ends with `Cancel` links to `/reports/${encodeURIComponent(reportId)}`. Disable all fields and actions while `submitting`. Use one submit alert, keep `answers` unchanged on failure and map `VALIDATION_ERROR` to `Review every answer and try again.` A generic error uses only `We could not submit your claim. Your answers are still here.`

Render these load states without the form:

| State | Exact heading | Action |
|---|---|---|
| `loading` | polite text `Loading ownership questions` | none |
| `not-claimable` | `This report cannot be claimed` | link to `/reports/${encodeURIComponent(reportId)}` |
| `already-claimed` | `You already have an active claim` | link to `/claims` |
| `forbidden` | `Claim access unavailable` | link to `/dashboard` |
| `error` | `We could not load ownership questions` | `Retry ownership questions` button |

- [ ] **Step 5: Add the report-detail entry without fetching Claim data**

Pass `canClaim={session.user.role === "student"}` into `ActiveReportDetail`, add the boolean prop, then render:

```tsx
{canClaim &&
report.reportType === "found" &&
report.status === "open" &&
!report.isOwner ? (
  <Link
    className={styles.primaryButton}
    href={`/reports/${encodeURIComponent(report.id)}/claim`}
  >
    Claim this item
  </Link>
) : null}
```

Do not call the Claim API from report detail and do not add a duplicate-claim precheck.

- [ ] **Step 6: Add accessible submission styles and verify**

Extend the Claim CSS module with a single-column form, visible error summary, labelled textarea, 44-pixel buttons/links, disabled states and a 320-pixel padding reduction. Then run:

```powershell
npm test -- src/components/claims/claim-submission-client.test.tsx src/components/reports/report-detail-client.test.tsx
npx eslint src/app/reports/[id]/claim/page.tsx src/components/claims/claim-submission-client.tsx src/components/claims/claim-submission-client.test.tsx src/components/reports/report-detail-client.tsx src/components/reports/report-detail-client.test.tsx
npx tsc --noEmit --incremental false
```

Expected: all commands PASS; a double activation creates one request and answer text survives retryable failure.

- [ ] **Step 7: Commit Task 4**

```powershell
git add web/src/app/reports/[id]/claim/page.tsx web/src/components/claims/claim-submission-client.tsx web/src/components/claims/claim-submission-client.test.tsx web/src/components/claims/claim-management.module.css web/src/components/reports/report-detail-client.tsx web/src/components/reports/report-detail-client.test.tsx
git diff --cached --check
git commit -m "feat(claim-ui): add protected claim submission" -m "Refs #21"
```

---

### Task 5: URL-driven My Claims list

**Files:**
- Create: `web/src/app/claims/page.tsx`
- Create: `web/src/components/claims/claim-list-client.tsx`
- Create: `web/src/components/claims/claim-list-client.test.tsx`
- Modify: `web/src/components/claims/claim-management.module.css`

**Interfaces:**
- Consumes: `ClaimantAccessBoundary`, `ClaimBrowserError`, `ClaimPage`, `getMyClaims()`, `parseClaimListSearchParams()` and `claimListHref()`.
- Produces: `ClaimListClient()` and the route `/claims`.

- [ ] **Step 1: Write failing route, query, list and race tests**

Test metadata/Suspense, defaults, all statuses, invalid/duplicate recovery, URL push on status change, Back/Forward rerender, empty history, filtered empty, retry, safe cards, preserved filter pagination, stale response rejection, 401 redirect and 403 safe permission state:

```tsx
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

it("changes status through the URL and resets the page", async () => {
  const user = userEvent.setup();
  useSearchParamsMock.mockReturnValue(
    new URLSearchParams("status=pending&page=3"),
  );
  getMyClaimsMock.mockResolvedValue(claimPage);
  render(<ClaimListClient />);
  await screen.findByRole("heading", { name: "My claims" });

  await user.selectOptions(
    screen.getByRole("combobox", { name: "Claim status" }),
    "approved",
  );
  expect(push).toHaveBeenCalledWith("/claims?status=approved");
});

it("preserves the filter in pagination links", async () => {
  useSearchParamsMock.mockReturnValue(new URLSearchParams("status=pending&page=2"));
  getMyClaimsMock.mockResolvedValue({
    ...claimPage,
    pagination: { page: 2, pageSize: 20, total: 41, totalPages: 3 },
  });
  render(<ClaimListClient />);

  expect(
    (await screen.findByRole("link", { name: "Previous page" })).getAttribute("href"),
  ).toBe("/claims?status=pending");
  expect(screen.getByRole("link", { name: "Next page" }).getAttribute("href"))
    .toBe("/claims?status=pending&page=3");
  expect(screen.getByText("Page 2 of 3")).toBeTruthy();
});

it("does not let an older query overwrite the current URL result", async () => {
  const first = deferred<ClaimPage>();
  const second = deferred<ClaimPage>();
  getMyClaimsMock
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  useSearchParamsMock.mockReturnValue(new URLSearchParams("status=pending"));
  const view = render(<ClaimListClient />);

  useSearchParamsMock.mockReturnValue(new URLSearchParams("status=approved"));
  view.rerender(<ClaimListClient />);
  second.resolve(approvedPage);
  expect(await screen.findByText("Approved report")).toBeTruthy();
  first.resolve(pendingPage);
  expect(screen.queryByText("Pending report")).toBeNull();
});
```

Add an out-of-range case where API page 4 returns `totalPages: 2` and at least one total record: expect `replace("/claims?status=pending&page=2")` once. If `total: 0`, stay on page 1 and show the correct empty state.

- [ ] **Step 2: Run the focused test and confirm red**

Run:

```powershell
npm test -- src/components/claims/claim-list-client.test.tsx
```

Expected: FAIL because the list route and component do not exist.

- [ ] **Step 3: Add the Suspense-protected list route**

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";

import { ClaimListClient } from "@/components/claims/claim-list-client";
import { ClaimantAccessBoundary } from "@/components/claims/claimant-access-boundary";

export const metadata: Metadata = { title: "My claims" };

export default function ClaimsPage() {
  return (
    <main id="main-content">
      <Suspense fallback={<p role="status">Loading claim history</p>}>
        <ClaimantAccessBoundary>
          <ClaimListClient />
        </ClaimantAccessBoundary>
      </Suspense>
    </main>
  );
}
```

- [ ] **Step 4: Implement URL-driven loading and safe results**

Use one discriminated state and request counter:

```tsx
type ListState =
  | { status: "loading" }
  | { status: "ready"; page: ClaimPage }
  | { status: "forbidden" }
  | { status: "error" };

const statusLabels: Record<ClaimStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  completed: "Completed",
};

const dateTimeFormatter = new Intl.DateTimeFormat("en-NZ", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Pacific/Auckland",
});
```

Parse `useSearchParams()` with Task 2 on every URL change. Schedule the request in an effect, increment a `requestId` before each request and cleanup, and ignore non-current completions. Call `getMyClaims(parsed.request)`. Redirect 401 to `/login`; render the claimant permission surface for 403; use a generic retry state for everything else.

If `page.pagination.total > 0`, the requested page exceeds `totalPages`, and `totalPages >= 1`, call `router.replace(claimListHref({ status: parsed.values.status, page: totalPages }))` once for that exact URL/result pair. If `page.pagination.total === 0` and the requested page is not 1, replace with `claimListHref({ status: parsed.values.status, page: 1 })`. Do not render stale cards while replacing.

Render a native select:

```tsx
<label>
  Claim status
  <select
    value={parsed.values.status}
    onChange={(event) =>
      router.push(claimListHref({
        status: event.currentTarget.value as "" | ClaimStatus,
        page: 1,
      }))
    }
  >
    <option value="">All statuses</option>
    {CLAIM_STATUSES.map((status) => (
      <option key={status} value={status}>{statusLabels[status]}</option>
    ))}
  </select>
</label>
```

Each card shows only report title/type, status text, created/updated formatted dates and a link to `/claims/${encodeURIComponent(claim.id)}`. Empty unfiltered history says `You have not submitted a claim yet` and links to `/reports`; filtered empty says `No claims match this status` and retains the filter control. Build Previous/Next links with `claimListHref`, render disabled text at bounds, and announce `Page N of M`.

- [ ] **Step 5: Add list/card/pagination styles and verify**

Extend the Claim CSS module with a wrapping status row, one-column card grid, 44-pixel select/detail/pagination targets, non-colour status text, stacked pagination at 320 pixels and `overflow-wrap: anywhere` for titles. Then run:

```powershell
npm test -- src/components/claims/claim-list-client.test.tsx src/lib/claims/list-search.test.ts
npx eslint src/app/claims/page.tsx src/components/claims/claim-list-client.tsx src/components/claims/claim-list-client.test.tsx
npx tsc --noEmit --incremental false
```

Expected: all commands PASS; URL history is authoritative and old responses cannot replace current results.

- [ ] **Step 6: Commit Task 5**

```powershell
git add web/src/app/claims/page.tsx web/src/components/claims/claim-list-client.tsx web/src/components/claims/claim-list-client.test.tsx web/src/components/claims/claim-management.module.css
git diff --cached --check
git commit -m "feat(claim-ui): add own claim history" -m "Refs #21"
```

---

### Task 6: Claim detail, manual refresh and withdrawal

**Files:**
- Create: `web/src/app/claims/[id]/page.tsx`
- Create: `web/src/components/claims/claim-detail-client.tsx`
- Create: `web/src/components/claims/claim-detail-client.test.tsx`
- Modify: `web/src/components/claims/claim-management.module.css`

**Interfaces:**
- Consumes: `ClaimantAccessBoundary`, `ClaimBrowserError`, `ClaimantClaim`, `getMyClaim()` and `withdrawMyClaim()`.
- Produces: `ClaimDetailClient({ claimId }: { claimId: string })` and the route `/claims/[id]`.

- [ ] **Step 1: Write failing detail, refresh, privacy and withdrawal tests**

Test every status explanation/timestamp, manual refresh, stale refresh rejection, 404, 401, 403, retry, withdrawal visibility, inline confirm/cancel, duplicate-action prevention, successful returned representation and conflict:

```tsx
it.each([
  ["pending", "Awaiting staff review."],
  ["approved", "Ownership review approved; follow campus handover instructions."],
  ["rejected", "The ownership claim was not approved."],
  ["withdrawn", "The student withdrew the claim."],
  ["completed", "Recovery was recorded as completed."],
])("renders safe explanatory copy for %s", async (status, copy) => {
  getMyClaimMock.mockResolvedValue({ ...claimantClaim, status } as ClaimantClaim);
  render(<ClaimDetailClient claimId={claimantClaim.id} />);
  expect(await screen.findByText(copy)).toBeTruthy();
});

it("requires adjacent confirmation and replaces detail with the withdrawal response", async () => {
  const user = userEvent.setup();
  const withdrawn = {
    ...claimantClaim,
    status: "withdrawn",
    withdrawnAt: "2026-08-24T03:00:00.000Z",
  } satisfies ClaimantClaim;
  getMyClaimMock.mockResolvedValue(claimantClaim);
  withdrawMyClaimMock.mockResolvedValue(withdrawn);
  render(<ClaimDetailClient claimId={claimantClaim.id} />);

  await user.click(await screen.findByRole("button", { name: "Withdraw claim" }));
  expect(screen.getByText("Withdrawal cannot be undone.")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Confirm withdrawal" }));
  expect(withdrawMyClaimMock).toHaveBeenCalledOnce();
  expect(await screen.findByText("The student withdrew the claim.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Withdraw claim" })).toBeNull();
});

it("keeps safe detail and asks for refresh after a state conflict", async () => {
  const user = userEvent.setup();
  getMyClaimMock.mockResolvedValue(claimantClaim);
  withdrawMyClaimMock.mockRejectedValue(new ClaimBrowserError({
    code: "CLAIM_STATE_CONFLICT",
    status: 409,
    message: "private state detail",
  }));
  render(<ClaimDetailClient claimId={claimantClaim.id} />);

  await user.click(await screen.findByRole("button", { name: "Withdraw claim" }));
  await user.click(screen.getByRole("button", { name: "Confirm withdrawal" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This claim changed. Refresh its status before trying again.",
  );
  expect(screen.getByText(claimantClaim.report.title)).toBeTruthy();
  expect(screen.queryByText("private state detail")).toBeNull();
});
```

Assert pending/approved alone expose withdrawal; rejected/withdrawn/completed do not. Assert no answer, match, verification, review note, reviewer or claimant identity appears.

- [ ] **Step 2: Run the focused test and confirm red**

Run:

```powershell
npm test -- src/components/claims/claim-detail-client.test.tsx
```

Expected: FAIL because the detail route and component do not exist.

- [ ] **Step 3: Add the protected async detail route**

```tsx
import type { Metadata } from "next";

import { ClaimDetailClient } from "@/components/claims/claim-detail-client";
import { ClaimantAccessBoundary } from "@/components/claims/claimant-access-boundary";

export const metadata: Metadata = { title: "Claim details" };

export default async function ClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main id="main-content">
      <ClaimantAccessBoundary>
        <ClaimDetailClient claimId={id} />
      </ClaimantAccessBoundary>
    </main>
  );
}
```

- [ ] **Step 4: Implement detail loading, refresh and safe status copy**

Use:

```tsx
type DetailState =
  | { status: "loading" }
  | { status: "ready"; claim: ClaimantClaim }
  | { status: "not-found" }
  | { status: "forbidden" }
  | { status: "error" };

const statusCopy: Record<ClaimStatus, string> = {
  pending: "Awaiting staff review.",
  approved: "Ownership review approved; follow campus handover instructions.",
  rejected: "The ownership claim was not approved.",
  withdrawn: "The student withdrew the claim.",
  completed: "Recovery was recorded as completed.",
};
```

`loadClaim({ preserveReadyClaim = false }: { preserveReadyClaim?: boolean } = {})` increments a request ID, sets loading unless `preserveReadyClaim` is true and the current state is ready, and ignores stale completions. Map 401 to `/login`, 403 to permission and 404/`CLAIM_NOT_FOUND` to a safe not-found surface. An initial generic failure uses the full-page retry state; a manual-refresh failure keeps the current safe Claim visible and sets the inline message `We could not refresh this claim. Please try again.` The manual `Refresh status` button calls `loadClaim({ preserveReadyClaim: true })` and disables only while that refresh is in flight.

Track refresh separately from the safe detail union:

```tsx
const [refreshing, setRefreshing] = useState(false);
const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

async function refreshClaim() {
  if (refreshing) return;
  setRefreshMessage(null);
  setRefreshing(true);
  try {
    await loadClaim({ preserveReadyClaim: true });
  } finally {
    setRefreshing(false);
  }
}
```

Render:

- `Back to My claims` -> `/claims`;
- report link -> `/reports/${encodeURIComponent(claim.report.id)}`;
- safe report title/type/status;
- Claim status plus `statusCopy[claim.status]`;
- created/updated and non-null reviewed/withdrawn/completed dates using `en-NZ` and `Pacific/Auckland`.

- [ ] **Step 5: Implement adjacent single-flight withdrawal**

Keep `confirmingWithdrawal`, `withdrawing` and one safe mutation message local to the ready surface. Show `Withdraw claim` only when:

```ts
const canWithdraw =
  detailState.status === "ready" &&
  (detailState.claim.status === "pending" ||
    detailState.claim.status === "approved");
```

First activation opens:

```tsx
<section className={styles.confirmation} aria-labelledby="withdraw-heading">
  <h2 id="withdraw-heading">Withdraw this claim?</h2>
  <p>Withdrawal cannot be undone.</p>
  <div className={styles.actions}>
    <button type="button" disabled={withdrawing} onClick={confirmWithdrawal}>
      {withdrawing ? "Withdrawing claim" : "Confirm withdrawal"}
    </button>
    <button
      type="button"
      disabled={withdrawing}
      onClick={() => setConfirmingWithdrawal(false)}
    >
      Keep claim
    </button>
  </div>
</section>
```

Guard `confirmWithdrawal` with `if (withdrawing) return`. Replace `detailState` with the returned Claim on success. On `CLAIM_STATE_CONFLICT`, close confirmation and show `This claim changed. Refresh its status before trying again.` while preserving the existing Claim. Map 401/403/404 like load; every other failure says `We could not withdraw this claim. Please try again.` without raw messages.

- [ ] **Step 6: Add detail/confirmation styles and verify**

Extend the shared CSS module with safe fact grids, wrapped status text, adjacent confirmation, 44-pixel controls, visible focus, disabled styling and a one-column 320-pixel layout. Then run:

```powershell
npm test -- src/components/claims/claim-detail-client.test.tsx
npx eslint src/app/claims/[id]/page.tsx src/components/claims/claim-detail-client.tsx src/components/claims/claim-detail-client.test.tsx
npx tsc --noEmit --incremental false
```

Expected: all commands PASS; withdrawal is single-flight and no hidden evidence appears.

- [ ] **Step 7: Commit Task 6**

```powershell
git add web/src/app/claims/[id]/page.tsx web/src/components/claims/claim-detail-client.tsx web/src/components/claims/claim-detail-client.test.tsx web/src/components/claims/claim-management.module.css
git diff --cached --check
git commit -m "feat(claim-ui): add own claim detail and withdrawal" -m "Refs #21"
```

---

### Task 7: Complete quality, privacy and visual gate

**Files:**
- Modify only if a failing check identifies a concrete defect: files already named in Tasks 1–6.
- Test: all tests already named in Tasks 1–6.

**Interfaces:**
- Consumes: the complete Claimant Claims frontend.
- Produces: one verified branch with no uncommitted repair, privacy regression, responsive defect or dependency change.

- [ ] **Step 1: Run the focused claimant suite**

```powershell
cd web
npm test -- src/lib/claims/browser-client.test.ts src/lib/claims/list-search.test.ts src/components/claims/claimant-access-boundary.test.tsx src/components/claims/claim-submission-client.test.tsx src/components/claims/claim-list-client.test.tsx src/components/claims/claim-detail-client.test.tsx src/components/reports/report-detail-client.test.tsx src/components/site-header.test.tsx src/components/dashboard/dashboard-client.test.tsx
```

Expected: PASS with no unhandled rejection or React act warning.

- [ ] **Step 2: Run complete automated quality checks**

```powershell
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm audit
```

Expected: every command exits 0; `npm audit` reports `found 0 vulnerabilities`.

- [ ] **Step 3: Run exact privacy and persistence scans**

```powershell
rg -n "expectedAnswer|verificationMatchedCount|matchedCount|reviewNote|reviewedBy|claimantId|reporterId|password|sessionToken|activeClaimKey" src/app/claims src/app/reports/[id]/claim src/components/claims src/lib/claims/browser-client.ts
rg -n "localStorage|sessionStorage|console\.(log|debug|info)" src/app/claims src/app/reports/[id]/claim src/components/claims src/lib/claims/browser-client.ts
git check-ignore -q .env.local
```

Expected: both `rg` commands return no production-source matches; `git check-ignore -q .env.local` exits 0 without reading the file.

- [ ] **Step 4: Review scope and patch integrity**

From the repository root:

```powershell
git status --short --branch
git diff develop...HEAD --stat
git diff develop...HEAD --check
git diff develop...HEAD -- web/package.json web/package-lock.json web/src/app/api web/src/models
git log --oneline --decorate develop..HEAD
```

Expected: only Issue #21 frontend/docs files changed; package/API/model diff is empty; every implementation commit body contains `Refs #21`; worktree is clean.

- [ ] **Step 5: Run one bounded browser review**

Start the app without exposing environment values:

```powershell
cd web
npm run dev
```

Use only a test account and non-sensitive test data. At 320, 375, 768 and 1440 CSS pixels verify:

- header destinations remain visible and usable;
- submission labels, fieldset, errors and actions follow keyboard order;
- list filtering changes URL, Back/Forward restores state and pagination retains status;
- detail refresh and inline confirmation are keyboard usable;
- no horizontal overflow, clipped text, colour-only state or target below 44 pixels;
- no browser-console error or unexpected network loop.

Stop the development server after the bounded review. Do not connect to Atlas or submit/withdraw a real Claim merely for this visual gate; use mocked component evidence when a safe test environment is unavailable.

- [ ] **Step 6: Perform focused UI quality review**

Review the rendered Claim pages against the approved design and existing Campus Find interface. Accept only changes that improve hierarchy, narrow-screen fit, focus visibility, copy clarity or state comprehension without changing scope. Re-run the exact focused test, ESLint and TypeScript command for every touched file.

- [ ] **Step 7: Commit only concrete verification repairs**

If Step 5 or Step 6 required a real code/test repair, stage only the repaired files and commit:

```powershell
git add web/src/app/claims web/src/app/reports/[id]/claim web/src/components/claims web/src/components/reports/report-detail-client.tsx web/src/components/reports/report-detail-client.test.tsx web/src/components/site-header.tsx web/src/components/site-header.test.tsx web/src/components/site-header.module.css web/src/components/dashboard/dashboard-client.tsx web/src/components/dashboard/dashboard-client.test.tsx web/src/lib/claims/browser-client.ts web/src/lib/claims/browser-client.test.ts web/src/lib/claims/list-search.ts web/src/lib/claims/list-search.test.ts
git diff --cached --check
git commit -m "fix(claim-ui): harden claimant workflow" -m "Refs #21"
```

If no repair was necessary, create no empty commit.

- [ ] **Step 8: Record final verification**

Create `docs/superpowers/verification/2026-08-24-claimant-claims-frontend.md` containing the exact commit under test, the five automated command outcomes, the privacy scan outcomes and the viewport/keyboard review result. Then commit:

```powershell
git add docs/superpowers/verification/2026-08-24-claimant-claims-frontend.md
git diff --cached --check
git commit -m "docs: record claimant claims frontend verification" -m "Refs #21"
```

Expected final state: `git status --short --branch` reports only the feature branch tracking line and no file entries.
