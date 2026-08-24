# Staff Claim Review Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure, accessible staff and administrator workspace for reviewing ownership Claims, making confirmed decisions and recording completed handovers.

**Architecture:** Add a dedicated strict staff browser client, canonical staff queue URLs, a role-protected queue and a role-protected detail workflow. Reuse the existing Claim API and authentication provider, but keep staff-only schemas and evidence outside the student browser client and components.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod 4, CSS Modules, Vitest 4 and Testing Library.

## Global Constraints

- Work only on branch `feature/issue-22-staff-claim-review-frontend`.
- Every commit body contains `Refs #22`.
- Do not modify backend routes, Claim services, database models, dependencies or environment files.
- Do not read, print, stage or commit `.env.local`.
- Do not connect to Atlas or perform a real Claim decision merely for verification.
- Only active `staff` and `administrator` accounts may render staff Claim content.
- Keep student and staff Claim response schemas in separate browser modules.
- Never render expected answers, passwords, session tokens, active Claim keys or raw server/database errors.
- Do not use `localStorage`, `sessionStorage` or sensitive console logging.
- All interactive controls have visible focus and a minimum 44-pixel target.
- Layouts must remain usable without horizontal overflow at 320, 375, 768 and 1440 CSS pixels.
- Use `en-NZ` and `Pacific/Auckland` for visible Claim dates.
- Use TDD, focused checks after every task and no empty commits.
- Add no notifications, chat, scheduling, statistics, AI matching or speculative abstractions.

---

## File responsibility map

### Create

- `web/src/lib/claims/staff-browser-client.ts`: strict staff Claim schemas, safe error mapping and four API operations.
- `web/src/lib/claims/staff-browser-client.test.ts`: request, schema, privacy and safe-error tests.
- `web/src/lib/claims/staff-list-search.ts`: canonical queue query parsing and URL generation.
- `web/src/lib/claims/staff-list-search.test.ts`: malformed, duplicate and canonical URL cases.
- `web/src/components/claims/staff-claim-access-boundary.tsx`: active staff/administrator access gate.
- `web/src/components/claims/staff-claim-access-boundary.test.tsx`: complete session and role matrix.
- `web/src/components/claims/staff-claim-list-client.tsx`: URL-driven queue state and cards.
- `web/src/components/claims/staff-claim-list-client.test.tsx`: queue, pagination, retry and race tests.
- `web/src/components/claims/staff-claim-detail-client.tsx`: detail, refresh, decision and completion workflow.
- `web/src/components/claims/staff-claim-detail-client.test.tsx`: evidence, focus, mutation and privacy tests.
- `web/src/components/claims/staff-claim-review.module.css`: staff queue/detail/state/confirmation styles.
- `web/src/app/staff/claims/page.tsx`: protected queue route.
- `web/src/app/staff/claims/[id]/page.tsx`: protected detail route.
- `docs/superpowers/verification/2026-08-25-staff-claim-review-frontend.md`: final automated, privacy, scope and safe UI evidence.

### Modify

- `web/src/components/site-header.tsx`: active staff/administrator `Claim reviews` destination.
- `web/src/components/site-header.test.tsx`: staff navigation and student exclusion matrix.
- `web/src/components/site-header.module.css`: preserve compact navigation with the added destination.
- `web/src/components/dashboard/dashboard-client.tsx`: role-appropriate third recovery action.
- `web/src/components/dashboard/dashboard-client.test.tsx`: staff/administrator review destination and inactive exclusion.

---

### Task 1: Strict staff Claim browser client

**Files:**
- Create: `web/src/lib/claims/staff-browser-client.ts`
- Create: `web/src/lib/claims/staff-browser-client.test.ts`

**Interfaces:**
- Consumes: `CLAIM_STATUSES`, `ClaimBrowserError`, `ClaimPagination`, `ClaimReportSummary` and `ClaimStatus` from `@/lib/claims/browser-client`.
- Produces:
  - `StaffClaimant`
  - `StaffVerificationSummary`
  - `StaffClaimSummary`
  - `StaffClaimDetail`
  - `StaffClaimPage`
  - `StaffClaimsRequest`
  - `StaffClaimDecision`
  - `getStaffClaims(input)`
  - `getStaffClaim(claimId)`
  - `decideStaffClaim(claimId, input)`
  - `completeStaffClaim(claimId)`

- [ ] **Step 1: Write failing exact-request and safe-shape tests**

Create the staff fixtures and prove all four paths and bodies:

```ts
const summary = {
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
  claimant: {
    id: "64b64c6f2f4d9f1a2b3c4d61",
    email: "student@example.com",
    displayName: "Student Name",
    preferredContactMethod: "email",
  },
  verification: { questionCount: 2, matchedCount: 1 },
  reviewedBy: null,
} satisfies StaffClaimSummary;

const detail = {
  ...summary,
  reviewNote: null,
  responses: [
    {
      questionIndex: 0,
      question: "What is printed on the reverse?",
      answer: "Blue library label",
      matched: true,
    },
    {
      questionIndex: 1,
      question: "Which corner is damaged?",
      answer: "Top right",
      matched: false,
    },
  ],
} satisfies StaffClaimDetail;

it("loads the canonical pending queue without redundant parameters", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    Response.json({
      claims: [summary],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  await expect(getStaffClaims({})).resolves.toMatchObject({
    claims: [summary],
  });
  expect(fetchMock).toHaveBeenCalledWith("/api/staff/claims", {
    method: "GET",
    credentials: "same-origin",
  });
});

it("encodes detail ids and posts only the selected decision and note", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ claim: detail }))
    .mockResolvedValueOnce(Response.json({ claim: detail }));
  vi.stubGlobal("fetch", fetchMock);

  await getStaffClaim("claim/with spaces");
  await decideStaffClaim("claim/with spaces", {
    decision: "approve",
    reviewNote: "Identity confirmed",
  });

  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    "/api/staff/claims/claim%2Fwith%20spaces",
    { method: "GET", credentials: "same-origin" },
  );
  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    "/api/staff/claims/claim%2Fwith%20spaces/decision",
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision: "approve",
        reviewNote: "Identity confirmed",
      }),
    },
  );
});

it("posts an exact empty completion object", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    Response.json({ claim: { ...detail, status: "completed" } }),
  );
  vi.stubGlobal("fetch", fetchMock);

  await completeStaffClaim(summary.id);
  expect(fetchMock).toHaveBeenCalledWith(
    `/api/staff/claims/${summary.id}/complete`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
});
```

Add table tests for every Claim status, optional dates and `reviewNote`. Add strict rejection cases for `expectedAnswer`, `password`, `sessionToken`, `activeClaimKey`, extra nested fields, malformed email, unsupported contact method, invalid IDs/dates/statuses, duplicate/non-contiguous response indexes, answer lengths above 500, notes above 1000, response/count mismatch, and `matchedCount > questionCount`.

Add 400/401/403/404/409/500, rejected-fetch, non-JSON and malformed-success tests. Assert a `ClaimBrowserError` exposes only a local code, status, generic message and mapped form guidance; raw response text and backend field messages never escape.

- [ ] **Step 2: Run the focused test and confirm red**

```powershell
cd web
npm test -- src/lib/claims/staff-browser-client.test.ts
```

Expected: FAIL because `staff-browser-client.ts` does not exist.

- [ ] **Step 3: Define exact public types and strict schemas**

Implement these public types:

```ts
export type StaffClaimant = {
  id: string;
  email: string;
  displayName: string;
  preferredContactMethod: "in_app" | "email";
};

export type StaffVerificationSummary = {
  questionCount: number;
  matchedCount: number;
};

export type StaffClaimSummary = {
  id: string;
  report: ClaimReportSummary;
  status: ClaimStatus;
  reviewedAt: string | null;
  withdrawnAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  claimant: StaffClaimant;
  verification: StaffVerificationSummary;
  reviewedBy: string | null;
};

export type StaffClaimDetail = StaffClaimSummary & {
  reviewNote: string | null;
  responses: Array<{
    questionIndex: number;
    question: string;
    answer: string;
    matched: boolean;
  }>;
};

export type StaffClaimPage = {
  claims: StaffClaimSummary[];
  pagination: ClaimPagination;
};

export type StaffClaimsRequest = { status?: ClaimStatus; page?: number };
export type StaffClaimDecision = {
  decision: "approve" | "reject";
  reviewNote: string | null;
};
```

Use strict schemas and cross-field refinements:

```ts
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const dateTimeSchema = z.string().datetime({ offset: true });

const verificationSchema = z
  .strictObject({
    questionCount: z.number().int().min(1).max(5),
    matchedCount: z.number().int().min(0).max(5),
  })
  .superRefine(({ questionCount, matchedCount }, context) => {
    if (matchedCount > questionCount) {
      context.addIssue({
        code: "custom",
        path: ["matchedCount"],
        message: "Matched count exceeds question count",
      });
    }
  });

const reportSummarySchema = z.strictObject({
  id: objectIdSchema,
  title: z.string(),
  reportType: z.enum(["lost", "found"]),
  status: z.enum(["open", "claim_pending", "resolved", "closed"]),
}) satisfies z.ZodType<ClaimReportSummary>;

const claimantSchema = z.strictObject({
  id: objectIdSchema,
  email: z.string().email(),
  displayName: z.string().min(1),
  preferredContactMethod: z.enum(["in_app", "email"]),
}) satisfies z.ZodType<StaffClaimant>;

const paginationSchema = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(50),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
}) satisfies z.ZodType<ClaimPagination>;

const staffSummarySchema = z.strictObject({
  id: objectIdSchema,
  report: reportSummarySchema,
  status: z.enum(CLAIM_STATUSES),
  reviewedAt: dateTimeSchema.nullable(),
  withdrawnAt: dateTimeSchema.nullable(),
  completedAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
  claimant: claimantSchema,
  verification: verificationSchema,
  reviewedBy: objectIdSchema.nullable(),
}) satisfies z.ZodType<StaffClaimSummary>;

const responseSchema = z.strictObject({
  questionIndex: z.number().int().min(0).max(4),
  question: z.string().min(1),
  answer: z.string().min(1).max(500),
  matched: z.boolean(),
});

const staffDetailSchema = staffSummarySchema
  .extend({
    reviewNote: z.string().max(1000).nullable(),
    responses: z.array(responseSchema).min(1).max(5),
  })
  .superRefine(({ responses, verification }, context) => {
    if (
      responses.length !== verification.questionCount ||
      responses.some(({ questionIndex }, index) => questionIndex !== index) ||
      responses.filter(({ matched }) => matched).length !==
        verification.matchedCount
    ) {
      context.addIssue({
        code: "custom",
        path: ["responses"],
        message: "Verification evidence is inconsistent",
      });
    }
  });

const staffClaimPageSchema = z.strictObject({
  claims: z.array(staffSummarySchema),
  pagination: paginationSchema,
}) satisfies z.ZodType<StaffClaimPage>;

const staffClaimResponseSchema = z.strictObject({
  claim: staffDetailSchema,
});
```

The staff module must not export its schemas or import staff data into the claimant module.

- [ ] **Step 4: Implement safe response parsing and the four operations**

Use a private same-origin fetch wrapper. Define the existing Claim error code/status pairs locally and accept only exact matching envelopes. Map any validation fields to:

```ts
const GENERIC_MESSAGE = "We could not complete that request. Please try again.";
const NETWORK_MESSAGE = "We could not reach the service. Please try again.";
const STAFF_VALIDATION_MESSAGE =
  "Review the decision and internal note, then try again.";

const STAFF_ERROR_CODES = [
  "VALIDATION_ERROR",
  "AUTHENTICATION_REQUIRED",
  "CLAIM_FORBIDDEN",
  "CLAIM_NOT_FOUND",
  "CLAIM_ALREADY_EXISTS",
  "REPORT_NOT_CLAIMABLE",
  "CLAIM_STATE_CONFLICT",
  "CLAIM_OPERATION_FAILED",
] as const;

const staffErrorDefinitions = {
  VALIDATION_ERROR: { status: 400, message: "Invalid claim request" },
  AUTHENTICATION_REQUIRED: { status: 401, message: "Authentication required" },
  CLAIM_FORBIDDEN: { status: 403, message: "Claim action is not permitted" },
  CLAIM_NOT_FOUND: { status: 404, message: "Claim not found" },
  CLAIM_ALREADY_EXISTS: { status: 409, message: "An active claim already exists" },
  REPORT_NOT_CLAIMABLE: { status: 409, message: "Report is not available for claiming" },
  CLAIM_STATE_CONFLICT: { status: 409, message: "Claim state has changed" },
  CLAIM_OPERATION_FAILED: { status: 500, message: "Claim operation failed" },
} as const;

const errorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(STAFF_ERROR_CODES),
    message: z.string().min(1),
    fields: z
      .strictObject({
        decision: z.array(z.string()).min(1).optional(),
        reviewNote: z.array(z.string()).min(1).optional(),
      })
      .optional(),
  }),
});

function requestFailed(status: number) {
  return new ClaimBrowserError({
    code: "REQUEST_FAILED",
    status,
    message: GENERIC_MESSAGE,
  });
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
    throw requestFailed(response.status);
  }

  if (!response.ok) {
    const parsed = errorResponseSchema.safeParse(body);
    if (!parsed.success) throw requestFailed(response.status);
    const definition = staffErrorDefinitions[parsed.data.error.code];
    if (
      response.status !== definition.status ||
      (parsed.data.error.code !== "VALIDATION_ERROR" &&
        parsed.data.error.fields !== undefined)
    ) {
      throw requestFailed(response.status);
    }
    throw new ClaimBrowserError({
      code: parsed.data.error.code,
      status: response.status,
      message: definition.message,
      fields:
        parsed.data.error.code === "VALIDATION_ERROR" &&
        parsed.data.error.fields !== undefined
          ? { form: [STAFF_VALIDATION_MESSAGE] }
          : undefined,
    });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) throw requestFailed(response.status);
  return parsed.data;
}
```

Build queue queries in this order: status, then page. Omit `status=pending` and `page=1`. Implement the operations without spreading caller input:

```ts
export async function getStaffClaims(
  input: StaffClaimsRequest,
): Promise<StaffClaimPage> {
  const search = new URLSearchParams();
  if (input.status && input.status !== "pending") {
    search.set("status", input.status);
  }
  if (input.page && input.page !== 1) search.set("page", String(input.page));
  const query = search.toString();
  const response = await fetchSameOrigin(
    query ? `/api/staff/claims?${query}` : "/api/staff/claims",
    { method: "GET" },
  );
  return parseResponse(response, staffClaimPageSchema);
}

export async function getStaffClaim(claimId: string) {
  const response = await fetchSameOrigin(
    `/api/staff/claims/${encodeURIComponent(claimId)}`,
    { method: "GET" },
  );
  return (await parseResponse(response, staffClaimResponseSchema)).claim;
}

export async function decideStaffClaim(
  claimId: string,
  input: StaffClaimDecision,
) {
  const response = await fetchSameOrigin(
    `/api/staff/claims/${encodeURIComponent(claimId)}/decision`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision: input.decision,
        reviewNote: input.reviewNote,
      }),
    },
  );
  return (await parseResponse(response, staffClaimResponseSchema)).claim;
}

export async function completeStaffClaim(claimId: string) {
  const response = await fetchSameOrigin(
    `/api/staff/claims/${encodeURIComponent(claimId)}/complete`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
  return (await parseResponse(response, staffClaimResponseSchema)).claim;
}
```

Do not include detail evidence in a mutation.

- [ ] **Step 5: Run focused client checks**

```powershell
npm test -- src/lib/claims/staff-browser-client.test.ts
npx eslint src/lib/claims/staff-browser-client.ts src/lib/claims/staff-browser-client.test.ts
npx tsc --noEmit --incremental false
```

Expected: all commands PASS and no test prints a raw private response.

- [ ] **Step 6: Commit Task 1**

```powershell
git add web/src/lib/claims/staff-browser-client.ts web/src/lib/claims/staff-browser-client.test.ts
git diff --cached --check
git commit -m "feat(staff-claims): add strict browser contracts" -m "Refs #22"
```

---

### Task 2: Canonical staff queue URLs

**Files:**
- Create: `web/src/lib/claims/staff-list-search.ts`
- Create: `web/src/lib/claims/staff-list-search.test.ts`

**Interfaces:**
- Consumes: `CLAIM_STATUSES`, `ClaimStatus` and `StaffClaimsRequest`.
- Produces:
  - `StaffClaimListSearch`
  - `parseStaffClaimListSearchParams(params)`
  - `staffClaimListHref(input)`

- [ ] **Step 1: Write failing canonicalisation tests**

```ts
it("uses pending page one as the canonical default", () => {
  expect(parseStaffClaimListSearchParams(new URLSearchParams())).toEqual({
    values: { status: "pending", page: 1 },
    request: {},
    ignoredInvalidValues: false,
  });
  expect(staffClaimListHref({ status: "pending", page: 1 })).toBe(
    "/staff/claims",
  );
});

it("preserves a supported status and bounded page", () => {
  expect(
    parseStaffClaimListSearchParams(
      new URLSearchParams("status=completed&page=2"),
    ),
  ).toEqual({
    values: { status: "completed", page: 2 },
    request: { status: "completed", page: 2 },
    ignoredInvalidValues: false,
  });
  expect(staffClaimListHref({ status: "completed", page: 2 })).toBe(
    "/staff/claims?status=completed&page=2",
  );
});
```

Add cases for all statuses, explicit `status=pending`, unknown/empty statuses, unknown keys, duplicates, zero, negative, decimal, exponent, whitespace, unsafe and greater-than-10,000 pages. Prove invalid values fall back to pending/page one and set `ignoredInvalidValues: true`.

- [ ] **Step 2: Run the focused test and confirm red**

```powershell
npm test -- src/lib/claims/staff-list-search.test.ts
```

Expected: FAIL because the parser module does not exist.

- [ ] **Step 3: Implement the minimal parser and href builder**

```ts
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
```

Read each known key exactly once. Duplicate values are invalid rather than first-value-wins. The returned `request` omits pending/page one so Task 1 produces the canonical API URL.

- [ ] **Step 4: Verify and commit Task 2**

```powershell
npm test -- src/lib/claims/staff-list-search.test.ts
npx eslint src/lib/claims/staff-list-search.ts src/lib/claims/staff-list-search.test.ts
npx tsc --noEmit --incremental false
git add web/src/lib/claims/staff-list-search.ts web/src/lib/claims/staff-list-search.test.ts
git diff --cached --check
git commit -m "feat(staff-claims): add canonical review URLs" -m "Refs #22"
```

Expected: all checks PASS.

---

### Task 3: Staff access, navigation and dashboard entry

**Files:**
- Create: `web/src/components/claims/staff-claim-access-boundary.tsx`
- Create: `web/src/components/claims/staff-claim-access-boundary.test.tsx`
- Create: `web/src/components/claims/staff-claim-review.module.css`
- Modify: `web/src/components/site-header.tsx`
- Modify: `web/src/components/site-header.test.tsx`
- Modify: `web/src/components/site-header.module.css`
- Modify: `web/src/components/dashboard/dashboard-client.tsx`
- Modify: `web/src/components/dashboard/dashboard-client.test.tsx`

**Interfaces:**
- Consumes: `useAuthSession()`, existing router and dashboard/header patterns.
- Produces: `StaffClaimAccessBoundary({ children })` and staff review navigation.

- [ ] **Step 1: Write failing access-boundary tests**

Mock the session provider and router. Cover:

```tsx
it.each(["staff", "administrator"] as const)(
  "renders staff content for an active %s",
  (role) => {
    mockSession({
      status: "authenticated",
      user: { ...safeUser, role, status: "active" },
    });
    render(
      <StaffClaimAccessBoundary>
        <p>Restricted evidence fixture</p>
      </StaffClaimAccessBoundary>,
    );

    expect(screen.getByText("Restricted evidence fixture")).toBeTruthy();
  },
);

it.each([
  ["student", { ...safeUser, role: "student" as const }],
  ["suspended staff", { ...safeUser, role: "staff" as const, status: "suspended" as const }],
])("does not render restricted evidence for a %s", (_label, user) => {
  mockSession({ status: "authenticated", user });
  render(
    <StaffClaimAccessBoundary>
      <p>Restricted evidence fixture</p>
    </StaffClaimAccessBoundary>,
  );

  expect(screen.queryByText("Restricted evidence fixture")).toBeNull();
  expect(screen.getByRole("heading", { name: "Claim review access unavailable" }))
    .toBeTruthy();
});
```

Add loading, inconsistent authenticated/null, unauthenticated redirect, unavailable retry, account-ID remount and safe-copy tests.

- [ ] **Step 2: Add failing header and dashboard role tests**

Extend the header matrix:

```tsx
it.each(["staff", "administrator"] as const)(
  "shows Claim reviews only to an active %s",
  (role) => {
    mockSession({
      status: "authenticated",
      user: { ...safeUser, role, status: "active" },
    });
    render(<SiteHeader />);

    expect(
      screen.getByRole("link", { name: "Claim reviews" }).getAttribute("href"),
    ).toBe("/staff/claims");
    expect(screen.queryByRole("link", { name: "My claims" })).toBeNull();
  },
);
```

Extend dashboard tests so active staff/administrators see `Review ownership claims` -> `/staff/claims`; active students still see only `Manage recovery requests` -> `/claims`; suspended accounts receive neither link.

- [ ] **Step 3: Run focused tests and confirm red**

```powershell
npm test -- src/components/claims/staff-claim-access-boundary.test.tsx src/components/site-header.test.tsx src/components/dashboard/dashboard-client.test.tsx
```

Expected: FAIL because the boundary and staff destinations do not exist.

- [ ] **Step 4: Implement the access boundary**

Follow the claimant boundary but use this exact permission:

```ts
const hasStaffClaimAccess =
  session.user.status === "active" &&
  (session.user.role === "staff" ||
    session.user.role === "administrator");
```

Return:

- loading/status text `Checking Claim review access`;
- unauthenticated text `Taking you to sign in` plus `router.replace("/login")`;
- unavailable heading `We could not check your account` and `Retry session check`;
- forbidden heading `Claim review access unavailable`, safe explanation and `/dashboard`;
- `<Fragment key={session.user.id}>{children}</Fragment>` when allowed.

Never render `children` while loading, unavailable or forbidden.

- [ ] **Step 5: Add role-appropriate navigation**

In `SiteHeader`, derive:

```ts
const isActive = user.status === "active";
const canReviewClaims =
  isActive && (user.role === "staff" || user.role === "administrator");
const canManageOwnClaims = isActive && user.role === "student";
```

Render `Claim reviews` only for `canReviewClaims` and `My claims` only for `canManageOwnClaims`.

In `DashboardClient`, construct the third workflow card:

```ts
const recoveryAction =
  user.status === "active" && user.role === "student"
    ? {
        title: "Manage recovery requests",
        description:
          "Track verification, handover arrangements and recovery progress.",
        href: "/claims",
      }
    : user.status === "active" &&
        (user.role === "staff" || user.role === "administrator")
      ? {
          title: "Review ownership claims",
          description:
            "Review ownership evidence and record recovery handovers.",
          href: "/staff/claims",
        }
      : {
          title: "Manage recovery requests",
          description:
            "Track verification, handover arrangements and recovery progress.",
        };
```

Keep the first two workflow actions unchanged.

- [ ] **Step 6: Add the minimum shared styles**

Create staff CSS rules for state panels/loading with safe wrapping and 44-pixel links/buttons. Update compact header styles only if the existing 24-rem test fails with the added link; never hide a destination.

- [ ] **Step 7: Verify and commit Task 3**

```powershell
npm test -- src/components/claims/staff-claim-access-boundary.test.tsx src/components/site-header.test.tsx src/components/dashboard/dashboard-client.test.tsx
npx eslint src/components/claims/staff-claim-access-boundary.tsx src/components/claims/staff-claim-access-boundary.test.tsx src/components/site-header.tsx src/components/site-header.test.tsx src/components/dashboard/dashboard-client.tsx src/components/dashboard/dashboard-client.test.tsx
npx tsc --noEmit --incremental false
git add web/src/components/claims/staff-claim-access-boundary.tsx web/src/components/claims/staff-claim-access-boundary.test.tsx web/src/components/claims/staff-claim-review.module.css web/src/components/site-header.tsx web/src/components/site-header.test.tsx web/src/components/site-header.module.css web/src/components/dashboard/dashboard-client.tsx web/src/components/dashboard/dashboard-client.test.tsx
git diff --cached --check
git commit -m "feat(staff-claims): add protected review access" -m "Refs #22"
```

Expected: every command PASS and no blocked session renders the fixture.

---

### Task 4: URL-driven Claim review queue

**Files:**
- Create: `web/src/app/staff/claims/page.tsx`
- Create: `web/src/components/claims/staff-claim-list-client.tsx`
- Create: `web/src/components/claims/staff-claim-list-client.test.tsx`
- Modify: `web/src/components/claims/staff-claim-review.module.css`

**Interfaces:**
- Consumes: `StaffClaimAccessBoundary`, `getStaffClaims()`, `StaffClaimPage`, `ClaimBrowserError`, `parseStaffClaimListSearchParams()` and `staffClaimListHref()`.
- Produces: `StaffClaimListClient()` and `/staff/claims`.

- [ ] **Step 1: Write failing route and queue tests**

Test metadata, Suspense, default request, all five statuses, invalid-query notice, canonical correction, Back/Forward, pending/filtered empty states, retry, safe card fields, pagination, stale responses, 401 redirect and 403 replacement.

Use these key tests:

```tsx
it("loads the oldest pending review queue by default", async () => {
  useSearchParamsMock.mockReturnValue(new URLSearchParams());
  getStaffClaimsMock.mockResolvedValue(staffPage);
  render(<StaffClaimListClient />);

  expect(await screen.findByRole("heading", { name: "Claim reviews" }))
    .toBeTruthy();
  expect(getStaffClaimsMock).toHaveBeenCalledWith({});
  expect(screen.getByText("Student Name")).toBeTruthy();
  expect(screen.getByText("1 of 2 answers matched")).toBeTruthy();
  expect(screen.queryByText("student@example.com")).toBeNull();
  expect(screen.queryByText("Blue library label")).toBeNull();
});

it("changes status through the URL and resets the page", async () => {
  const user = userEvent.setup();
  useSearchParamsMock.mockReturnValue(
    new URLSearchParams("status=approved&page=3"),
  );
  getStaffClaimsMock.mockResolvedValue(staffPage);
  render(<StaffClaimListClient />);

  await user.selectOptions(
    await screen.findByRole("combobox", { name: "Claim status" }),
    "completed",
  );
  expect(push).toHaveBeenCalledWith("/staff/claims?status=completed");
});

it("does not let an older queue overwrite the current URL", async () => {
  const pending = deferred<StaffClaimPage>();
  const completed = deferred<StaffClaimPage>();
  getStaffClaimsMock
    .mockReturnValueOnce(pending.promise)
    .mockReturnValueOnce(completed.promise);
  useSearchParamsMock.mockReturnValue(new URLSearchParams());
  const view = render(<StaffClaimListClient />);

  useSearchParamsMock.mockReturnValue(
    new URLSearchParams("status=completed"),
  );
  view.rerender(<StaffClaimListClient />);
  completed.resolve(completedPage);
  expect(await screen.findByText("Completed report")).toBeTruthy();
  pending.resolve(pendingPage);
  expect(screen.queryByText("Pending report")).toBeNull();
});
```

Assert cards never render claimant email, contact preference, evidence answers, internal note or reviewer ID.

- [ ] **Step 2: Run the focused test and confirm red**

```powershell
npm test -- src/components/claims/staff-claim-list-client.test.tsx
```

Expected: FAIL because the route and client do not exist.

- [ ] **Step 3: Add the protected queue route**

```tsx
import { Suspense } from "react";
import type { Metadata } from "next";

import { StaffClaimAccessBoundary } from "@/components/claims/staff-claim-access-boundary";
import { StaffClaimListClient } from "@/components/claims/staff-claim-list-client";

export const metadata: Metadata = { title: "Claim reviews" };

export default function StaffClaimsPage() {
  return (
    <main id="main-content">
      <StaffClaimAccessBoundary>
        <Suspense fallback={<p role="status">Loading Claim reviews</p>}>
          <StaffClaimListClient />
        </Suspense>
      </StaffClaimAccessBoundary>
    </main>
  );
}
```

- [ ] **Step 4: Implement URL-driven queue state**

Model the state with its query key:

```ts
type ListState =
  | { status: "loading"; queryKey: string }
  | { status: "ready"; queryKey: string; page: StaffClaimPage }
  | { status: "forbidden"; queryKey: string }
  | { status: "error"; queryKey: string };
```

For every URL:

1. Parse status/page with Task 2.
2. Increment `requestId`.
3. Set loading for that `queryKey`.
4. Call `getStaffClaims(parsed.request)`.
5. Ignore stale completions.
6. Replace out-of-range pages with `staffClaimListHref()` and return without rendering them.
7. Map 401 to `/login`, 403 to forbidden and all other failures to a generic retry state.

Render only state whose `queryKey` equals the current `useSearchParams().toString()`.

- [ ] **Step 5: Render concise queue cards and pagination**

Use exact visible copy:

- heading `Claim reviews`;
- filter heading `Filter review queue`;
- selector label `Claim status`;
- pending empty `No Claims are waiting for review`;
- filtered empty `No Claims match this status`;
- loading `Loading Claim reviews`;
- error `We could not load Claim reviews`;
- retry `Retry Claim reviews`;
- card link `Review claim for {report title}`;
- pagination label `Claim review pages`.

Show `displayName` but not email/contact. Format `matchedCount of questionCount answers matched`. Preserve status in Previous/Next links.

- [ ] **Step 6: Add responsive queue styles**

Add a bounded content width, filter panel, one-column card grid below 48rem, safe text wrapping, status pill, 44-pixel select/link/button targets, disabled pagination treatment and a 20rem padding reduction. Reuse global colour variables; add no new font or animation dependency.

- [ ] **Step 7: Verify and commit Task 4**

```powershell
npm test -- src/components/claims/staff-claim-list-client.test.tsx
npx eslint src/app/staff/claims/page.tsx src/components/claims/staff-claim-list-client.tsx src/components/claims/staff-claim-list-client.test.tsx
npx tsc --noEmit --incremental false
git add web/src/app/staff/claims/page.tsx web/src/components/claims/staff-claim-list-client.tsx web/src/components/claims/staff-claim-list-client.test.tsx web/src/components/claims/staff-claim-review.module.css
git diff --cached --check
git commit -m "feat(staff-claims): add review queue" -m "Refs #22"
```

Expected: all checks PASS, URL history is canonical and queue cards remain privacy-limited.

---

### Task 5: Controlled Claim evidence detail and refresh

**Files:**
- Create: `web/src/app/staff/claims/[id]/page.tsx`
- Create: `web/src/components/claims/staff-claim-detail-client.tsx`
- Create: `web/src/components/claims/staff-claim-detail-client.test.tsx`
- Modify: `web/src/components/claims/staff-claim-review.module.css`

**Interfaces:**
- Consumes: `StaffClaimAccessBoundary`, `getStaffClaim()`, `StaffClaimDetail`, `ClaimBrowserError`.
- Produces: `StaffClaimDetailClient({ claimId })` and `/staff/claims/[id]`.

- [ ] **Step 1: Write failing route, safe-detail and refresh tests**

Cover route metadata/async ID, initial loading, complete controlled fields, response order, explicit matched text, dates, no expected answers/raw IDs, manual refresh, duplicate refresh, stale response, ID change, unmount and 401/403/404/500 mapping.

```tsx
it("renders controlled identity and ordered evidence without expected answers", async () => {
  const reviewedDetail = {
    ...staffDetail,
    reviewedBy: "64b64c6f2f4d9f1a2b3c4d62",
  };
  getStaffClaimMock.mockResolvedValue(reviewedDetail);
  const { container } = render(
    <StaffClaimDetailClient claimId={staffDetail.id} />,
  );

  expect(await screen.findByRole("heading", { name: "Claim review" }))
    .toBeTruthy();
  expect(screen.getByText("Student Name")).toBeTruthy();
  expect(screen.getByText("student@example.com")).toBeTruthy();
  expect(screen.getByText("Email")).toBeTruthy();
  const evidence = screen.getAllByRole("listitem");
  expect(evidence[0]).toHaveTextContent("What is printed on the reverse?");
  expect(evidence[0]).toHaveTextContent("Blue library label");
  expect(evidence[0]).toHaveTextContent("Matched");
  expect(evidence[1]).toHaveTextContent("Not matched");
  expect(container.textContent).not.toMatch(
    /expectedAnswer|password|sessionToken|activeClaimKey/,
  );
  expect(container.textContent).not.toContain(reviewedDetail.reviewedBy);
});

it("keeps safe detail visible when refresh fails", async () => {
  const user = userEvent.setup();
  getStaffClaimMock
    .mockResolvedValueOnce(staffDetail)
    .mockRejectedValueOnce(
      new ClaimBrowserError({
        code: "NETWORK_ERROR",
        status: 0,
        message: "private network detail",
      }),
    );
  render(<StaffClaimDetailClient claimId={staffDetail.id} />);

  await user.click(await screen.findByRole("button", { name: "Refresh review" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "We could not refresh this Claim. Please try again.",
  );
  expect(screen.getByText(staffDetail.report.title)).toBeTruthy();
  expect(screen.queryByText("private network detail")).toBeNull();
});
```

- [ ] **Step 2: Run focused tests and confirm red**

```powershell
npm test -- src/components/claims/staff-claim-detail-client.test.tsx
```

Expected: FAIL because the detail route/client do not exist.

- [ ] **Step 3: Add the protected async detail route**

```tsx
import type { Metadata } from "next";

import { StaffClaimAccessBoundary } from "@/components/claims/staff-claim-access-boundary";
import { StaffClaimDetailClient } from "@/components/claims/staff-claim-detail-client";

export const metadata: Metadata = { title: "Claim review" };

export default async function StaffClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main id="main-content">
      <StaffClaimAccessBoundary>
        <StaffClaimDetailClient claimId={id} />
      </StaffClaimAccessBoundary>
    </main>
  );
}
```

- [ ] **Step 4: Implement isolated load and refresh state**

Wrap the surface with `key={claimId}`. Use:

```ts
type DetailState =
  | { status: "loading" }
  | { status: "ready"; claim: StaffClaimDetail }
  | { status: "not-found" }
  | { status: "forbidden" }
  | { status: "error" };
```

Maintain mounted, request-generation and refresh single-flight refs. Initial load replaces the full state. Refresh preserves ready data, announces success, and leaves safe detail visible on generic failure. 401 redirects, 403/404 replace the content, and stale responses do nothing.

- [ ] **Step 5: Render controlled detail**

Use exact top-level copy:

- back link `Back to Claim reviews`;
- heading `Claim review`;
- report link `View report`;
- sections `Claim status`, `Claimant contact`, `Verification summary`, `Ownership evidence`, `Claim timeline`;
- refresh button `Refresh review`.

Render preferred contact as `Email` or `In-app`. Use an ordered `<ol>` for responses and include literal `Matched`/`Not matched`. Show review note only when non-null. Do not display `reviewedBy`.

- [ ] **Step 6: Add detail and evidence styles**

Add a safe two-column fact grid that collapses to one column, evidence list cards, match text with non-colour indicator, wrapping for email/questions/answers, 44-pixel actions and visible focus. The detail header must fit at 320 pixels.

- [ ] **Step 7: Verify and commit Task 5**

```powershell
npm test -- src/components/claims/staff-claim-detail-client.test.tsx
npx eslint src/app/staff/claims/[id]/page.tsx src/components/claims/staff-claim-detail-client.tsx src/components/claims/staff-claim-detail-client.test.tsx
npx tsc --noEmit --incremental false
git add web/src/app/staff/claims/[id]/page.tsx web/src/components/claims/staff-claim-detail-client.tsx web/src/components/claims/staff-claim-detail-client.test.tsx web/src/components/claims/staff-claim-review.module.css
git diff --cached --check
git commit -m "feat(staff-claims): add controlled review details" -m "Refs #22"
```

Expected: all checks PASS and the detail exposes only the approved staff contract.

---

### Task 6: Confirmed decisions and handover completion

**Files:**
- Modify: `web/src/components/claims/staff-claim-detail-client.tsx`
- Modify: `web/src/components/claims/staff-claim-detail-client.test.tsx`
- Modify: `web/src/components/claims/staff-claim-review.module.css`

**Interfaces:**
- Consumes: `decideStaffClaim()`, `completeStaffClaim()`, `StaffClaimDecision`.
- Produces: pending decision form, adjacent confirmations and approved handover completion.

- [ ] **Step 1: Write failing approve/reject tests**

```tsx
it("confirms approval, warns about competing Claims and posts the trimmed note once", async () => {
  const user = userEvent.setup();
  const pending = deferred<StaffClaimDetail>();
  getStaffClaimMock.mockResolvedValue(staffDetail);
  decideStaffClaimMock.mockReturnValue(pending.promise);
  render(<StaffClaimDetailClient claimId={staffDetail.id} />);

  await user.type(
    await screen.findByLabelText("Internal review note"),
    "  Identity confirmed  ",
  );
  await user.click(screen.getByRole("button", { name: "Approve Claim" }));
  expect(screen.getByText(/other pending Claims.*rejected/i)).toBeTruthy();
  await user.dblClick(screen.getByRole("button", { name: "Confirm approval" }));

  expect(decideStaffClaimMock).toHaveBeenCalledOnce();
  expect(decideStaffClaimMock).toHaveBeenCalledWith(staffDetail.id, {
    decision: "approve",
    reviewNote: "Identity confirmed",
  });
  pending.resolve({ ...staffDetail, status: "approved" });
  expect(await screen.findByText("Claim status: Approved")).toBeTruthy();
});

it("confirms rejection with a null blank note", async () => {
  const user = userEvent.setup();
  getStaffClaimMock.mockResolvedValue(staffDetail);
  decideStaffClaimMock.mockResolvedValue({
    ...staffDetail,
    status: "rejected",
  });
  render(<StaffClaimDetailClient claimId={staffDetail.id} />);

  await user.click(await screen.findByRole("button", { name: "Reject Claim" }));
  await user.click(screen.getByRole("button", { name: "Confirm rejection" }));
  expect(decideStaffClaimMock).toHaveBeenCalledWith(staffDetail.id, {
    decision: "reject",
    reviewNote: null,
  });
});
```

Add local note length, cancellation/focus restoration, success focus, 401/403/404, validation, 409 and generic failures. Prove a conflict retains the old safe detail, closes confirmation and enables refresh. Prove refresh and decision cannot overlap.

- [ ] **Step 2: Write failing completion tests**

```tsx
it("completes only an approved Claim through one confirmed request", async () => {
  const user = userEvent.setup();
  const approved = { ...staffDetail, status: "approved" as const };
  getStaffClaimMock.mockResolvedValue(approved);
  completeStaffClaimMock.mockResolvedValue({
    ...approved,
    status: "completed",
    completedAt: "2026-08-25T02:00:00.000Z",
  });
  render(<StaffClaimDetailClient claimId={approved.id} />);

  await user.click(
    await screen.findByRole("button", { name: "Mark handover complete" }),
  );
  await user.dblClick(
    screen.getByRole("button", { name: "Confirm handover completion" }),
  );
  expect(completeStaffClaimMock).toHaveBeenCalledOnce();
  expect(completeStaffClaimMock).toHaveBeenCalledWith(approved.id);
  expect(await screen.findByText("Claim status: Completed")).toBeTruthy();
});
```

Table-test pending/rejected/withdrawn/completed exclusion. Add cancellation focus, duplicate activation, conflict, generic failure, unmount and ID-change tests.

- [ ] **Step 3: Run focused tests and confirm red**

```powershell
npm test -- src/components/claims/staff-claim-detail-client.test.tsx
```

Expected: FAIL because the action controls and mutations do not exist.

- [ ] **Step 4: Add local decision state and validation**

Use:

```ts
type Confirmation =
  | { kind: "approve"; trigger: HTMLButtonElement }
  | { kind: "reject"; trigger: HTMLButtonElement }
  | { kind: "complete"; trigger: HTMLButtonElement }
  | null;

const [reviewNote, setReviewNote] = useState("");
const [confirmation, setConfirmation] = useState<Confirmation>(null);
const [mutating, setMutating] = useState(false);
```

Use refs for the current confirmation heading, mutation generation and in-flight guard. Reject a note over 1000 characters locally with `Review notes must be 1000 characters or fewer.` Do not send until valid.

On open, store the triggering button and focus the confirmation heading. On cancel or recoverable failure, close the section and focus that stored trigger.

- [ ] **Step 5: Implement decision mutation**

Guard synchronously with a ref before awaiting. Narrow the confirmation before
building the request:

```ts
if (!confirmation || confirmation.kind === "complete") return;

const input: StaffClaimDecision = {
  decision: confirmation.kind,
  reviewNote: reviewNote.trim() || null,
};
const claim = await decideStaffClaim(claimId, input);
```

Only `approve` and `reject` reach this path. Disable refresh, note and all actions during mutation. On success, replace the ready Claim, clear confirmation, synchronise the note from `claim.reviewNote ?? ""`, and focus the status heading.

Map:

- 401 to login;
- 403/404 to safe full-page states;
- 409 to `This Claim changed. Refresh it before making another decision.`;
- validation to `Review the decision and internal note, then try again.`;
- other failures to `We could not update this Claim. Please try again.`

Never render `error.message`.

- [ ] **Step 6: Implement completion mutation**

Only allow `claim.status === "approved"`. Confirm with:

```text
Record this handover as complete?
This records the item as recovered and cannot be undone here.
```

Call `completeStaffClaim(claimId)` under the same single-flight and generation rules. Reuse safe access/conflict/generic mapping, but use `We could not complete this handover. Please try again.` for generic failure.

- [ ] **Step 7: Add adjacent confirmation styles**

Add a bordered inline region, visible heading focus, optional note help/counter, primary approval action, danger rejection action, neutral completion action, disabled styling, wrapped copy, 44-pixel buttons and a one-column action stack at 20rem. Do not add a modal or animation.

- [ ] **Step 8: Verify and commit Task 6**

```powershell
npm test -- src/components/claims/staff-claim-detail-client.test.tsx
npx eslint src/components/claims/staff-claim-detail-client.tsx src/components/claims/staff-claim-detail-client.test.tsx
npx tsc --noEmit --incremental false
git add web/src/components/claims/staff-claim-detail-client.tsx web/src/components/claims/staff-claim-detail-client.test.tsx web/src/components/claims/staff-claim-review.module.css
git diff --cached --check
git commit -m "feat(staff-claims): add review decisions and handover" -m "Refs #22"
```

Expected: all checks PASS; mutations are single-flight, focus-safe and privacy-safe.

---

### Task 7: Complete quality, privacy and safe UI gate

**Files:**
- Modify only if a failing check identifies a concrete defect: files named in Tasks 1–6.
- Create: `docs/superpowers/verification/2026-08-25-staff-claim-review-frontend.md`

**Interfaces:**
- Consumes: the complete Issue #22 frontend.
- Produces: a verified clean branch and an auditable verification record.

- [ ] **Step 1: Run the complete focused Issue #22 suite**

```powershell
cd web
npm test -- src/lib/claims/staff-browser-client.test.ts src/lib/claims/staff-list-search.test.ts src/components/claims/staff-claim-access-boundary.test.tsx src/components/claims/staff-claim-list-client.test.tsx src/components/claims/staff-claim-detail-client.test.tsx src/components/site-header.test.tsx src/components/dashboard/dashboard-client.test.tsx
```

Expected: PASS with no unhandled rejection, act warning or leaked private fixture.

- [ ] **Step 2: Run repository-wide automated gates**

```powershell
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm audit
```

Expected: every command exits 0 and audit reports `found 0 vulnerabilities`.

- [ ] **Step 3: Run privacy and persistence scans**

From `web/`:

```powershell
$issue22Paths = @(
  "src/app/staff",
  "src/components/claims/staff-claim-access-boundary.tsx",
  "src/components/claims/staff-claim-list-client.tsx",
  "src/components/claims/staff-claim-detail-client.tsx",
  "src/lib/claims/staff-browser-client.ts",
  "src/lib/claims/staff-list-search.ts"
)
rg -n "expectedAnswer|password|sessionToken|activeClaimKey" $issue22Paths
rg -n "localStorage|sessionStorage|console\.(log|debug|info)" $issue22Paths
rg -n "error\\.message|String\\(error\\)" $issue22Paths
git check-ignore -q .env.local
```

Expected: the three `rg` commands return no production-source matches; the ignore check exits 0 without reading the file.

- [ ] **Step 4: Review exact scope and patch integrity**

From the repository root:

```powershell
git status --short --branch
git diff develop...HEAD --check
git diff develop...HEAD --stat
git diff develop...HEAD -- web/package.json web/package-lock.json web/src/app/api web/src/lib/claims/staff-service.ts web/src/models
git log --format="%h %s%n%b" develop..HEAD
```

Expected: package/API/service/model diff is empty, only Issue #22 frontend/docs files changed, every commit body contains `Refs #22`, and the worktree is clean before the verification document.

- [ ] **Step 5: Perform a bounded safe UI review**

Start without printing environment values:

```powershell
cd web
npm run dev
```

Use a non-sensitive test account only if a safe local/mocked environment is available. At 320, 375, 768 and 1440 CSS pixels verify:

- header destinations remain visible;
- queue filters, cards and pagination have no horizontal overflow;
- detail email, questions, answers and notes wrap safely;
- match meaning is textual rather than colour-only;
- confirmation focus order and restoration are correct;
- every target is at least 44 pixels;
- Back/Forward restores queue state;
- no console error or unexpected request loop occurs.

Stop the server after the bounded review. Do not connect to Atlas or perform a real decision/completion for this gate. If safe interception is unavailable, use mocked component tests plus static responsive evidence and record that limitation accurately.

- [ ] **Step 6: Repair only concrete failures**

If a check fails, change only the owning Issue #22 file, add or update the smallest regression test, rerun its focused test, ESLint and TypeScript, then rerun the failed full gate. Commit only real repairs:

```powershell
git add web/src/app/staff web/src/components/claims/staff-* web/src/lib/claims/staff-* web/src/components/site-header.tsx web/src/components/site-header.test.tsx web/src/components/site-header.module.css web/src/components/dashboard/dashboard-client.tsx web/src/components/dashboard/dashboard-client.test.tsx
git diff --cached --check
git commit -m "fix(staff-claims): harden review workflow" -m "Refs #22"
```

If no repair is necessary, create no empty commit.

- [ ] **Step 7: Record final verification**

Create `docs/superpowers/verification/2026-08-25-staff-claim-review-frontend.md` with:

- exact implementation commit SHA;
- focused and full test counts;
- lint, TypeScript, build and audit outcomes;
- privacy/persistence scan outcomes;
- package/API/service/model scope result;
- responsive/keyboard evidence and any mocked-review limitation;
- confirmation that no real Atlas decision or handover was performed.

Then:

```powershell
git add docs/superpowers/verification/2026-08-25-staff-claim-review-frontend.md
git diff --cached --check
git commit -m "docs: record staff claim review frontend verification" -m "Refs #22"
git status --short --branch
```

Expected final state: only the feature branch/tracking line and no file entries. Do not push, open a pull request, merge or delete a branch without the user's explicit next instruction.
