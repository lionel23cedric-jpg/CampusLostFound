# Report Browsing and Search Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build protected, privacy-safe `/reports` search and `/reports/[id]` detail pages on the existing Issue #18 APIs.

**Architecture:** Extend the existing same-origin report browser client with strict member-report response schemas, keep canonical search state in the URL through one browser-safe query module, and implement separate authenticated list and detail clients inside the current application shell. Reuse React, Zod, native controls, Next.js routing, CSS Modules and existing session/reference-data clients; add no dependency or backend change.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Zod 4, CSS Modules, Vitest 4, Testing Library, ESLint.

## Global Constraints

- Work only on `feature/issue-20-report-browsing-frontend`; every commit body is `Refs #20`.
- Do not read `.env.local`, connect to Atlas, call a live application API, create a real report, push, open a PR or merge.
- Do not modify database models, API Route Handlers, backend browse contracts, report submission behaviour, package manifests or dependency versions.
- Never expose `reporterId`, raw `privacySettings`, serial numbers, exact private locations, distinguishing features, verification questions, expected answers, private notes, passwords or session values.
- All browser requests remain same-origin and use the existing HttpOnly session cookie without reading it.
- Keep the existing Campus Find visual system and plain-English copy; do not add gradients, glass effects, decorative icons or speculative actions.
- Target WCAG 2.2 AA, visible focus, semantic labels and landmarks, non-colour state text, 44-by-44 CSS-pixel targets and no horizontal overflow at 320 CSS pixels.
- Use TDD. Each implementation task starts from a focused failing test, ends green, passes focused ESLint and TypeScript, and receives one independently reviewable commit.
- Use `apply_patch` for edits. Stage only the task's named files. Preserve unrelated user changes if any appear.

---

## File map

### Create

- `web/src/lib/reports/browse-search.ts`: browser-safe search values, validation, local-date conversion and canonical list/page URLs.
- `web/src/lib/reports/browse-search.test.ts`: boundaries, defaults, invalid URL recovery and URL round trips.
- `web/src/components/reports/report-card.tsx`: one semantic, privacy-safe result link.
- `web/src/components/reports/report-card.test.tsx`: visible fields, hidden-state copy, owner copy and secret exclusion.
- `web/src/components/reports/report-browser.tsx`: authenticated search form, independent list/reference state, stale-request protection, results and pagination.
- `web/src/components/reports/report-browser.test.tsx`: session, query, loading, empty, retry, privacy, race and pagination behaviour.
- `web/src/components/reports/report-detail-client.tsx`: authenticated detail and reference loading with safe detail states.
- `web/src/components/reports/report-detail-client.test.tsx`: success, privacy, reference fallback, 404, retry, access and stale-account behaviour.
- `web/src/components/reports/report-browsing.module.css`: shared list, card, detail, state and responsive rules.
- `web/src/app/reports/page.tsx`: metadata, Suspense boundary and semantic main for `/reports`.
- `web/src/app/reports/[id]/page.tsx`: metadata and semantic main for `/reports/[id]`.

### Modify

- `web/src/lib/reports/browser-client.ts`: strict member-report/list schemas and `getReports`/`getReportById`.
- `web/src/lib/reports/browser-client.test.ts`: list/detail fetch, schema, error and secret-exclusion tests.
- `web/src/components/dashboard/dashboard-client.tsx`: activate `Search possible matches` for `/reports`.
- `web/src/components/dashboard/dashboard-client.test.tsx`: browse route metadata and dashboard action.
- `web/src/components/site-header.tsx`: authenticated `Browse` link.
- `web/src/components/site-header.test.tsx`: authenticated-only Browse link and narrow target contract.
- `web/src/components/site-header.module.css`: minimal compact authenticated-navigation adjustments.

---

### Task 1: Strict member-report browser API

**Files:**
- Modify: `web/src/lib/reports/browser-client.ts`
- Modify: `web/src/lib/reports/browser-client.test.ts`

**Interfaces:**
- Consumes: existing `fetchSameOrigin`, `parseResponse`, `BrowserReportError`, and Issue #18 response contract.
- Produces:
  - `MemberReport`
  - `ReportPagination`
  - `ReportPage`
  - `ReportBrowseRequest`
  - `getReports(input: ReportBrowseRequest): Promise<ReportPage>`
  - `getReportById(id: string): Promise<MemberReport>`

- [ ] **Step 1: Add focused failing contract tests**

Extend imports and add fixtures matching the backend contract exactly:

```ts
import {
  BrowserReportError,
  getReportById,
  getReports,
  type MemberReport,
} from "./browser-client";

const memberReport = {
  id: "64b64c6f2f4d9f1a2b3c4d54",
  reportType: "lost",
  title: "Black laptop bag",
  publicDescription: "Black laptop bag with a shoulder strap.",
  categoryId: "64b64c6f2f4d9f1a2b3c4d52",
  campusLocationId: null,
  occurredAt: null,
  colors: ["black"],
  tags: ["laptop", "bag"],
  photoUrls: [],
  status: "open",
  resolvedAt: null,
  createdAt: "2026-08-15T02:05:00.000Z",
  updatedAt: "2026-08-15T02:05:00.000Z",
  isOwner: false,
} satisfies MemberReport;
```

Test all of these exact behaviours:

```ts
it("loads a canonical member report page with same-origin credentials", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({
    reports: [memberReport],
    pagination: { page: 2, pageSize: 12, total: 13, totalPages: 2 },
  }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(getReports({
    q: "laptop bag",
    reportType: "lost",
    status: "open",
    hasPhoto: false,
    page: 2,
  })).resolves.toEqual({
    reports: [memberReport],
    pagination: { page: 2, pageSize: 12, total: 13, totalPages: 2 },
  });
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/reports?q=laptop+bag&reportType=lost&status=open&hasPhoto=false&page=2",
    { method: "GET", credentials: "same-origin" },
  );
});

it("encodes the report id before loading detail", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    Response.json({ report: memberReport }),
  );
  vi.stubGlobal("fetch", fetchMock);
  await getReportById("id/with spaces");
  expect(fetchMock).toHaveBeenCalledWith("/api/reports/id%2Fwith%20spaces", {
    method: "GET",
    credentials: "same-origin",
  });
});
```

Add table cases proving list/detail schemas reject extra `reporterId`, `privacySettings`, `serialNumber`, malformed dates, unknown pagination fields and a non-integer page. Reuse the existing 401/403/404/500 public-error test pattern and verify exact `BrowserReportError` status/code without raw response leakage.

- [ ] **Step 2: Run the tests and confirm red**

Run:

```powershell
cd web
npm test -- src/lib/reports/browser-client.test.ts
```

Expected: FAIL because `MemberReport`, `getReports` and `getReportById` do not exist.

- [ ] **Step 3: Add exact member contracts and fetch functions**

Add these public types:

```ts
export type MemberReport = {
  id: string;
  reportType: "lost" | "found";
  title: string;
  publicDescription: string;
  categoryId: string;
  campusLocationId: string | null;
  occurredAt: string | null;
  colors: string[];
  tags: string[];
  photoUrls: string[];
  status: "open" | "claim_pending" | "resolved" | "closed";
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isOwner: boolean;
};

export type ReportPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ReportPage = {
  reports: MemberReport[];
  pagination: ReportPagination;
};

export type ReportBrowseRequest = {
  q?: string;
  reportType?: "lost" | "found";
  categoryId?: string;
  campusLocationId?: string;
  status?: MemberReport["status"];
  color?: string;
  occurredFrom?: string;
  occurredTo?: string;
  hasPhoto?: boolean;
  page?: number;
};
```

Use `z.strictObject` for every member-report and pagination property. Dates use `z.string().datetime({ offset: true })`; hidden `occurredAt`/location and `resolvedAt` are nullable. Pagination numbers are non-negative integers, except `page` and `pageSize`, which are positive integers.

Build list parameters in this fixed order and omit defaults/undefined values:

```ts
export async function getReports(input: ReportBrowseRequest): Promise<ReportPage> {
  const search = new URLSearchParams();
  if (input.q) search.set("q", input.q);
  if (input.reportType) search.set("reportType", input.reportType);
  if (input.categoryId) search.set("categoryId", input.categoryId);
  if (input.campusLocationId) search.set("campusLocationId", input.campusLocationId);
  if (input.status) search.set("status", input.status);
  if (input.color) search.set("color", input.color);
  if (input.occurredFrom) search.set("occurredFrom", input.occurredFrom);
  if (input.occurredTo) search.set("occurredTo", input.occurredTo);
  if (input.hasPhoto !== undefined) search.set("hasPhoto", String(input.hasPhoto));
  if (input.page && input.page !== 1) search.set("page", String(input.page));

  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  const response = await fetchSameOrigin(`/api/reports${suffix}`, { method: "GET" });
  return parseResponse(response, reportPageSchema);
}

export async function getReportById(id: string): Promise<MemberReport> {
  const response = await fetchSameOrigin(`/api/reports/${encodeURIComponent(id)}`, {
    method: "GET",
  });
  const data = await parseResponse(response, memberReportResponseSchema);
  return data.report;
}
```

- [ ] **Step 4: Verify green and type safety**

Run:

```powershell
npm test -- src/lib/reports/browser-client.test.ts
npx eslint src/lib/reports/browser-client.ts src/lib/reports/browser-client.test.ts
npx tsc --noEmit --incremental false
```

Expected: all commands PASS; no schema accepts a private or unknown field.

- [ ] **Step 5: Commit Task 1**

```powershell
git add web/src/lib/reports/browser-client.ts web/src/lib/reports/browser-client.test.ts
git diff --cached --check
git commit -m "feat(report-ui): add browsing browser contracts" -m "Refs #20"
```

---

### Task 2: Canonical search URL module

**Files:**
- Create: `web/src/lib/reports/browse-search.ts`
- Create: `web/src/lib/reports/browse-search.test.ts`

**Interfaces:**
- Consumes: `ReportBrowseRequest` and `MemberReport["status"]` from Task 1.
- Produces:
  - `ReportSearchValues`
  - `ReportSearchErrors`
  - `createEmptyReportSearchValues(): ReportSearchValues`
  - `parseReportSearchParams(params: URLSearchParams): { values; request; ignoredInvalidValues }`
  - `validateReportSearch(values: ReportSearchValues): { success: true; request } | { success: false; errors }`
  - `reportSearchHref(request: ReportBrowseRequest): string`

- [ ] **Step 1: Write table-driven failing tests**

Define the browser form shape explicitly:

```ts
export type ReportSearchValues = {
  q: string;
  reportType: "" | "lost" | "found";
  categoryId: string;
  campusLocationId: string;
  status: "" | "open" | "claim_pending" | "resolved" | "closed";
  color: string;
  occurredFrom: string;
  occurredTo: string;
  hasPhoto: "" | "true" | "false";
};

export type ReportSearchErrors = Partial<
  Record<keyof ReportSearchValues | "_form", string[]>
>;
```

Tests must cover:

```ts
it("round-trips valid filters and preserves a requested page", () => {
  const params = new URLSearchParams(
    "q=laptop+bag&reportType=lost&status=open&hasPhoto=true&page=3",
  );
  const parsed = parseReportSearchParams(params);
  expect(parsed.values.q).toBe("laptop bag");
  expect(parsed.request).toMatchObject({
    q: "laptop bag", reportType: "lost", status: "open", hasPhoto: true, page: 3,
  });
  expect(reportSearchHref(parsed.request)).toBe(
    "/reports?q=laptop+bag&reportType=lost&status=open&hasPhoto=true&page=3",
  );
});

it("converts complete local date bounds to explicit ISO offsets", () => {
  const result = validateReportSearch({
    ...createEmptyReportSearchValues(),
    occurredFrom: "2026-08-01",
    occurredTo: "2026-08-02",
  });
  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.request.occurredFrom).toBe(
    new Date(2026, 7, 1, 0, 0, 0, 0).toISOString(),
  );
  expect(result.request.occurredTo).toBe(
    new Date(2026, 7, 2, 23, 59, 59, 999).toISOString(),
  );
});
```

Add cases for blank defaults, trimming, keyword 1/2/100/101, colour 1/32/33, invalid ObjectIds, invalid enum/boolean/page, duplicate and unknown URL keys, invalid calendar dates, reversed dates, canonical omission of page 1, page-only hrefs, filter-preserving page changes and no unsafe integer page.

- [ ] **Step 2: Confirm the missing module fails**

Run:

```powershell
npm test -- src/lib/reports/browse-search.test.ts
```

Expected: FAIL because `browse-search.ts` is absent.

- [ ] **Step 3: Implement one dependency-free browser module**

Use Zod only. Keep all runtime imports browser-safe. The module must:

```ts
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

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
```

`validateReportSearch` trims text, rejects a nonblank one-character keyword, converts booleans and dates, returns field-specific strings, and omits blank values. `parseReportSearchParams` accepts each known key at most once; duplicate, unknown or invalid values set `ignoredInvalidValues: true` and are excluded rather than sent to the API. `reportSearchHref` calls `URLSearchParams` in the Task 1 parameter order and returns `/reports` when empty.

- [ ] **Step 4: Verify the URL contract**

Run:

```powershell
npm test -- src/lib/reports/browse-search.test.ts src/lib/reports/browser-client.test.ts
npx eslint src/lib/reports/browse-search.ts src/lib/reports/browse-search.test.ts
npx tsc --noEmit --incremental false
```

Expected: PASS with timezone-independent expectations.

- [ ] **Step 5: Commit Task 2**

```powershell
git add web/src/lib/reports/browse-search.ts web/src/lib/reports/browse-search.test.ts
git diff --cached --check
git commit -m "feat(report-ui): define canonical browse queries" -m "Refs #20"
```

---

### Task 3: Privacy-safe report card

**Files:**
- Create: `web/src/components/reports/report-card.tsx`
- Create: `web/src/components/reports/report-card.test.tsx`
- Create: `web/src/components/reports/report-browsing.module.css`

**Interfaces:**
- Consumes: `MemberReport` from Task 1.
- Produces:

```ts
export type ReportCardProps = {
  report: MemberReport;
  categoryName: string;
  campusLocationName: string;
};

export function ReportCard(props: ReportCardProps): React.JSX.Element;
```

- [ ] **Step 1: Write the failing component tests**

Use a member fixture with no location/date/photo and assert:

```ts
const memberReport: MemberReport = {
  id: "64b64c6f2f4d9f1a2b3c4d54",
  reportType: "lost",
  title: "Black laptop bag",
  publicDescription: "Black laptop bag with a shoulder strap.",
  categoryId: "64b64c6f2f4d9f1a2b3c4d52",
  campusLocationId: null,
  occurredAt: null,
  colors: ["black"],
  tags: ["laptop", "bag"],
  photoUrls: [],
  status: "open",
  resolvedAt: null,
  createdAt: "2026-08-15T02:05:00.000Z",
  updatedAt: "2026-08-15T02:05:00.000Z",
  isOwner: true,
};

render(
  <ReportCard
    report={{ ...memberReport, campusLocationId: null, occurredAt: null, photoUrls: [], isOwner: true }}
    categoryName="Electronics"
    campusLocationName="Location hidden"
  />,
);

expect(screen.getByRole("link", { name: /Black laptop bag/ }).getAttribute("href"))
  .toBe(`/reports/${memberReport.id}`);
expect(screen.getByText("Location hidden")).toBeTruthy();
expect(screen.getByText("Date hidden")).toBeTruthy();
expect(screen.getByText("Your report")).toBeTruthy();
expect(document.body.textContent).not.toMatch(
  /reporterId|privacySettings|serialNumber|expectedAnswer|privateNotes/i,
);
```

Add cases for lost/found and every status label, description excerpt, category/location fallbacks, visible date formatted `en-NZ`, tags/colours, visible photo with safe alt/loading/referrer attributes, and non-owner output.

- [ ] **Step 2: Confirm red**

Run:

```powershell
npm test -- src/components/reports/report-card.test.tsx
```

Expected: FAIL because the card module is absent.

- [ ] **Step 3: Implement one semantic linked card**

Use this topology:

```tsx
const statusLabels: Record<MemberReport["status"], string> = {
  open: "Open",
  claim_pending: "Claim pending",
  resolved: "Resolved",
  closed: "Closed",
};

const dateFormatter = new Intl.DateTimeFormat("en-NZ", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

<article className={styles.card}>
  <Link className={styles.cardLink} href={`/reports/${report.id}`}>
    <div className={styles.cardHeading}>
      <p>{report.reportType === "lost" ? "Lost" : "Found"} · {statusLabel}</p>
      {report.isOwner ? <span>Your report</span> : null}
    </div>
    <h2>{report.title}</h2>
    <p>{report.publicDescription}</p>
    <dl>
      <div><dt>Category</dt><dd>{categoryName}</dd></div>
      <div><dt>Location</dt><dd>{campusLocationName}</dd></div>
      <div><dt>Date</dt><dd>{report.occurredAt ? dateFormatter.format(new Date(report.occurredAt)) : "Date hidden"}</dd></div>
    </dl>
    {report.photoUrls[0] ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={report.photoUrls[0]}
        alt={`Submitted photo for ${report.title}`}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />
    ) : null}
  </Link>
</article>
```

Use text plus restrained border colour for type/status. Give `.cardLink` a 44-pixel minimum target, visible focus from globals, stable overflow wrapping and a single-column mobile layout. Do not nest buttons or links.

- [ ] **Step 4: Verify card behaviour and style floor**

Run:

```powershell
npm test -- src/components/reports/report-card.test.tsx
npx eslint src/components/reports/report-card.tsx src/components/reports/report-card.test.tsx
npx tsc --noEmit --incremental false
```

Expected: PASS; no private-name match in rendered output.

- [ ] **Step 5: Commit Task 3**

```powershell
git add web/src/components/reports/report-card.tsx web/src/components/reports/report-card.test.tsx web/src/components/reports/report-browsing.module.css
git diff --cached --check
git commit -m "feat(report-ui): add privacy-safe report cards" -m "Refs #20"
```

---

### Task 4: Protected report search workspace

**Files:**
- Create: `web/src/components/reports/report-browser.tsx`
- Create: `web/src/components/reports/report-browser.test.tsx`
- Modify: `web/src/components/reports/report-browsing.module.css`
- Create: `web/src/app/reports/page.tsx`

**Interfaces:**
- Consumes: `useAuthSession`, Task 1 fetch functions/types, Task 2 query functions/types, existing reference loaders and Task 3 `ReportCard`.
- Produces: `ReportBrowser(): React.JSX.Element` and the `/reports` route.

- [ ] **Step 1: Write route and client tests before implementation**

Mock `next/navigation`, auth, browser-client functions and `ReportCard`. Cover:

```ts
const push = vi.fn();
const replace = vi.fn();
const refreshSession = vi.fn().mockResolvedValue(undefined);
const safeUser: NonNullable<AuthSessionContextValue["user"]> = {
  id: "user-id",
  email: "student@example.com",
  role: "student",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Student Name",
    preferredContactMethod: "in_app",
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
};

const memberReport: MemberReport = {
  id: "64b64c6f2f4d9f1a2b3c4d54",
  reportType: "lost",
  title: "Black laptop bag",
  publicDescription: "Black laptop bag with a shoulder strap.",
  categoryId: "64b64c6f2f4d9f1a2b3c4d52",
  campusLocationId: null,
  occurredAt: null,
  colors: ["black"],
  tags: ["laptop", "bag"],
  photoUrls: [],
  status: "open",
  resolvedAt: null,
  createdAt: "2026-08-15T02:05:00.000Z",
  updatedAt: "2026-08-15T02:05:00.000Z",
  isOwner: false,
};

function mockAuthenticatedSession() {
  vi.mocked(useAuthSession).mockReturnValue({
    status: "authenticated",
    user: safeUser,
    setAuthenticatedUser: vi.fn(),
    refreshSession,
    logout: vi.fn(),
  });
}

function mockReadyResponses() {
  vi.mocked(getReports).mockResolvedValue({
    reports: [memberReport],
    pagination: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
  });
  vi.mocked(getReportCategories).mockResolvedValue([
    { id: memberReport.categoryId, name: "Electronics", description: null },
  ]);
  vi.mocked(getReportCampusLocations).mockResolvedValue([]);
}

it("submits validated filters to a canonical URL and resets the page", async () => {
  const user = userEvent.setup();
  mockAuthenticatedSession();
  mockReadyResponses();
  render(<ReportBrowser />);
  await screen.findByText("Black laptop bag");

  await user.type(screen.getByLabelText("Keyword"), "laptop bag");
  await user.selectOptions(screen.getByLabelText("Report type"), "lost");
  await user.click(screen.getByRole("button", { name: "Search reports" }));

  expect(push).toHaveBeenCalledWith("/reports?q=laptop+bag&reportType=lost");
});
```

Add exact tests for:

- `metadata.title === "Browse reports"`, `main#main-content`, Suspense fallback and client fixture.
- Session loading, unauthenticated redirect, unavailable retry and active student/staff/administrator access.
- Reports/categories/locations start in parallel only after authentication.
- List and reference failures have independent Retry actions.
- A 401 from any request redirects to `/login`; 403/account-unavailable becomes one permission alert.
- Invalid visible form values show a focused summary and do not navigate.
- Invalid URL values are ignored and announced once without calling the API with them.
- True empty collection links to `/reports/new`; filtered empty state offers Clear filters.
- Missing historical category/location IDs use safe unavailable labels.
- Old list/reference promises cannot overwrite newer query or account state.
- Previous/Next preserve filters and show `Page X of Y`.
- A completed user-initiated search or page change focuses the result heading once and announces the updated count; initial page load does not steal focus.
- Out-of-range page replaces once with the authoritative final-page URL.
- Every result uses `ReportCard`; raw IDs and private names are absent from surrounding output.

- [ ] **Step 2: Confirm red**

Run:

```powershell
npm test -- src/components/reports/report-browser.test.tsx
```

Expected: FAIL because the route and client do not exist.

- [ ] **Step 3: Implement protected account and independent request state**

Use an outer session boundary and key active state by account:

```tsx
export function ReportBrowser() {
  const router = useRouter();
  const session = useAuthSession();

  useEffect(() => {
    if (session.status === "unauthenticated") router.replace("/login");
  }, [router, session.status]);

  if (session.status === "unavailable") {
    return (
      <section role="alert" aria-labelledby="browse-session-error">
        <h1 id="browse-session-error">We could not check your account</h1>
        <button type="button" onClick={() => void session.refreshSession()}>
          Retry session check
        </button>
      </section>
    );
  }
  if (session.status !== "authenticated" || !session.user) {
    return (
      <section role="status">
        {session.status === "unauthenticated"
          ? "Taking you to sign in"
          : "Checking your account"}
      </section>
    );
  }
  return <ActiveReportBrowser key={session.user.id} accountId={session.user.id} />;
}
```

Inside `ActiveReportBrowser`, derive `queryKey = useSearchParams().toString()`, parse it through Task 2, and maintain separate discriminated states:

```ts
type ReportState =
  | { status: "loading" }
  | { status: "ready"; page: ReportPage }
  | { status: "error" };

type ReferenceState =
  | { status: "loading" }
  | { status: "ready"; categories: ReportCategory[]; campusLocations: ReportCampusLocation[] }
  | { status: "error" };
```

Use independent request counters plus a mounted flag. Every async completion checks both before writing state. Classify `BrowserReportError` centrally:

```ts
if (error instanceof BrowserReportError) {
  if (error.status === 401 || error.code === "AUTHENTICATION_REQUIRED") {
    router.replace("/login");
    return;
  }
  if (error.status === 403 || error.code === "ACCOUNT_UNAVAILABLE") {
    setPermissionUnavailable(true);
    return;
  }
}
```

Start report and reference loads in the same effect tick, but retain separate errors/retries. A successful list with `reports.length === 0`, `pagination.totalPages > 0` and `page > totalPages` calls `router.replace(reportSearchHref({ ...request, page: totalPages }))` once.

Track whether navigation originated from this form or its pagination controls. After that query's successful response, call `resultsHeadingRef.current?.focus()` once; give the heading `tabIndex={-1}` and place the count in a nested `aria-live="polite"` span. Do not focus on the initial URL load, retries or background reference refreshes.

- [ ] **Step 4: Implement the semantic search and result layout**

The JSX hierarchy is fixed:

```tsx
const categoryOptions = (
  <>
    <option value="">Any category</option>
    {referenceState.status === "ready"
      ? referenceState.categories.map((category) => (
          <option key={category.id} value={category.id}>{category.name}</option>
        ))
      : null}
  </>
);
const campusLocationOptions = (
  <>
    <option value="">Any campus location</option>
    {referenceState.status === "ready"
      ? referenceState.campusLocations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.campusName} · {location.locationName}
          </option>
        ))
      : null}
  </>
);
const referenceWarning = referenceState.status === "error" ? (
  <div role="alert">
    <p>Report labels are temporarily unavailable.</p>
    <button type="button" onClick={() => void loadReferences()}>Retry report labels</button>
  </div>
) : null;
const reportContent = reportState.status === "loading" ? (
  <p role="status">Loading reports</p>
) : reportState.status === "error" ? (
  <div role="alert"><p>We could not load reports.</p><button type="button" onClick={() => void loadReports()}>Retry reports</button></div>
) : reportState.page.reports.length === 0 ? (
  <p>No reports match these filters.</p>
) : (
  <div className={styles.reportList}>{reportCards}</div>
);
const pagination = reportState.status === "ready" ? (
  <nav aria-label="Report result pages" className={styles.pagination}>
    {previousHref ? <Link href={previousHref}>Previous</Link> : <span>Previous</span>}
    <span>Page {reportState.page.pagination.page} of {reportState.page.pagination.totalPages}</span>
    {nextHref ? <Link href={nextHref}>Next</Link> : <span>Next</span>}
  </nav>
) : null;

<div className={styles.browserPage}>
  <header className={styles.introduction}>
    <p className={styles.kicker}>Campus reports</p>
    <h1>Find an item</h1>
    <p>Search privacy-safe lost and found reports shared by campus members.</p>
  </header>
  <div className={styles.workspace}>
    <form role="search" className={styles.filters} onSubmit={handleSubmit}>
      <h2>Filter reports</h2>
      <label>Keyword<input name="q" defaultValue={values.q} /></label>
      <label>Report type<select name="reportType" defaultValue={values.reportType}><option value="">Any type</option><option value="lost">Lost</option><option value="found">Found</option></select></label>
      <label>Status<select name="status" defaultValue={values.status}><option value="">Any status</option><option value="open">Open</option><option value="claim_pending">Claim pending</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></label>
      <label>Category<select name="categoryId" defaultValue={values.categoryId}>{categoryOptions}</select></label>
      <label>Campus location<select name="campusLocationId" defaultValue={values.campusLocationId}>{campusLocationOptions}</select></label>
      <label>Colour<input name="color" defaultValue={values.color} maxLength={32} /></label>
      <label>Occurred from<input name="occurredFrom" type="date" defaultValue={values.occurredFrom} /></label>
      <label>Occurred to<input name="occurredTo" type="date" defaultValue={values.occurredTo} /></label>
      <label>Photo availability<select name="hasPhoto" defaultValue={values.hasPhoto}><option value="">Any</option><option value="true">Has a visible photo</option><option value="false">No visible photo</option></select></label>
      <button type="submit">Search reports</button>
      <Link href="/reports">Clear filters</Link>
    </form>
    <section aria-labelledby="report-results-heading" className={styles.results}>
      <h2 id="report-results-heading" ref={resultsHeadingRef} tabIndex={-1}>
        <span aria-live="polite">{totalLabel}</span>
      </h2>
      {referenceWarning}
      {reportContent}
      {pagination}
    </section>
  </div>
</div>
```

Use `defaultValue` from parsed URL and key the form by `queryKey`. Build `ReportSearchValues` from named `FormData` entries; on failed validation, focus an error-summary heading and connect field errors with `aria-invalid`/`aria-describedby`. On success call `router.push(reportSearchHref(request))`.

Desktop CSS uses `grid-template-columns: minmax(14rem, 18rem) minmax(0, 1fr)`. At `max-width: 48rem`, switch to one column with filters before results. Inputs, actions and pagination controls keep 44-pixel targets; long values wrap; no fixed widths create 320-pixel overflow.

Create the route with a required Suspense boundary:

```tsx
export const metadata: Metadata = { title: "Browse reports" };

export default function ReportsPage() {
  return (
    <main id="main-content">
      <Suspense fallback={<p role="status">Loading report search</p>}>
        <ReportBrowser />
      </Suspense>
    </main>
  );
}
```

- [ ] **Step 5: Verify list-page green**

Run:

```powershell
npm test -- src/components/reports/report-browser.test.tsx src/components/reports/report-card.test.tsx src/lib/reports/browse-search.test.ts src/lib/reports/browser-client.test.ts
npx eslint src/components/reports/report-browser.tsx src/components/reports/report-browser.test.tsx src/app/reports/page.tsx
npx tsc --noEmit --incremental false
```

Expected: PASS with no act warnings or unhandled promise rejection.

- [ ] **Step 6: Commit Task 4**

```powershell
git add web/src/components/reports/report-browser.tsx web/src/components/reports/report-browser.test.tsx web/src/components/reports/report-browsing.module.css web/src/app/reports/page.tsx
git diff --cached --check
git commit -m "feat(report-ui): build report search workspace" -m "Refs #20"
```

---

### Task 5: Protected report detail page

**Files:**
- Create: `web/src/components/reports/report-detail-client.tsx`
- Create: `web/src/components/reports/report-detail-client.test.tsx`
- Modify: `web/src/components/reports/report-browsing.module.css`
- Create: `web/src/app/reports/[id]/page.tsx`

**Interfaces:**
- Consumes: `getReportById`, reference loaders, `BrowserReportError`, `MemberReport`, `useAuthSession`.
- Produces: `ReportDetailClient({ reportId }: { reportId: string }): React.JSX.Element` and `/reports/[id]`.

- [ ] **Step 1: Write failing detail-flow tests**

Cover exact behaviours:

```ts
const memberReport: MemberReport = {
  id: "64b64c6f2f4d9f1a2b3c4d54",
  reportType: "lost",
  title: "Black laptop bag",
  publicDescription: "Black laptop bag with a shoulder strap.",
  categoryId: "64b64c6f2f4d9f1a2b3c4d52",
  campusLocationId: null,
  occurredAt: null,
  colors: ["black"],
  tags: ["laptop", "bag"],
  photoUrls: [],
  status: "open",
  resolvedAt: null,
  createdAt: "2026-08-15T02:05:00.000Z",
  updatedAt: "2026-08-15T02:05:00.000Z",
  isOwner: true,
};

const safeUser: NonNullable<AuthSessionContextValue["user"]> = {
  id: "user-id",
  email: "student@example.com",
  role: "student",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Student Name",
    preferredContactMethod: "in_app",
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
};

function mockAuthenticatedSession() {
  vi.mocked(useAuthSession).mockReturnValue({
    status: "authenticated",
    user: safeUser,
    setAuthenticatedUser: vi.fn(),
    refreshSession: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
  });
}

it("renders only privacy-safe detail and safe hidden labels", async () => {
  mockAuthenticatedSession();
  vi.mocked(getReportById).mockResolvedValue({
    ...memberReport,
    campusLocationId: null,
    occurredAt: null,
    photoUrls: [],
    isOwner: true,
  });
  render(<ReportDetailClient reportId={memberReport.id} />);

  expect(await screen.findByRole("heading", { name: memberReport.title })).toBeTruthy();
  expect(screen.getByText("Location hidden")).toBeTruthy();
  expect(screen.getByText("Date hidden")).toBeTruthy();
  expect(screen.getByText("Your report")).toBeTruthy();
  expect(document.body.textContent).not.toMatch(
    /reporterId|privacySettings|serialNumber|expectedAnswer|privateNotes/i,
  );
});
```

Also test route metadata/async params, session states, student/staff/admin access, report/reference parallel starts, reference fallback and retry without losing loaded detail, visible photo attributes, all visible timestamps, 404 exact state, 500 Retry, 401 redirect, 403 permission alert, stale request after account/ID change, and `/reports` Back link.

- [ ] **Step 2: Confirm red**

Run:

```powershell
npm test -- src/components/reports/report-detail-client.test.tsx
```

Expected: FAIL because detail files are absent.

- [ ] **Step 3: Implement account-keyed detail loading**

Follow the Task 4 session boundary. The active child is keyed by `${user.id}-${reportId}`. Start detail and reference requests together with independent states and request IDs. A reference failure keeps loaded report content visible with `Category unavailable` or `Campus location unavailable` and a `Retry report labels` action.

Exact error behaviour:

```ts
if (error instanceof BrowserReportError) {
  if (error.status === 401 || error.code === "AUTHENTICATION_REQUIRED") {
    router.replace("/login");
    return;
  }
  if (error.status === 404 || error.code === "REPORT_NOT_FOUND") {
    setReportState({ status: "not-found" });
    return;
  }
  if (error.status === 403 || error.code === "ACCOUNT_UNAVAILABLE") {
    setPermissionUnavailable(true);
    return;
  }
}
setReportState({ status: "error" });
```

Render one `article` with a single `h1`, a text type/status line, description, labelled `<dl>`, colour/tag lists, optional owner text and visible photos. External photos use `loading="lazy"`, `decoding="async"` and `referrerPolicy="no-referrer"`; never render raw HTML. Loading uses `role="status"`; not-found is ordinary content; blocking failure/permission uses one `role="alert"`.

Create the async-param route:

```tsx
export const metadata: Metadata = { title: "Report details" };

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main id="main-content">
      <ReportDetailClient reportId={id} />
    </main>
  );
}
```

- [ ] **Step 4: Verify detail-page green**

Run:

```powershell
npm test -- src/components/reports/report-detail-client.test.tsx src/lib/reports/browser-client.test.ts
npx eslint src/components/reports/report-detail-client.tsx src/components/reports/report-detail-client.test.tsx "src/app/reports/[id]/page.tsx"
npx tsc --noEmit --incremental false
```

Expected: PASS; no secret fixture value appears in rendered output.

- [ ] **Step 5: Commit Task 5**

```powershell
git add web/src/components/reports/report-detail-client.tsx web/src/components/reports/report-detail-client.test.tsx web/src/components/reports/report-browsing.module.css "web/src/app/reports/[id]/page.tsx"
git diff --cached --check
git commit -m "feat(report-ui): add privacy-safe report details" -m "Refs #20"
```

---

### Task 6: Dashboard and responsive header integration

**Files:**
- Modify: `web/src/components/dashboard/dashboard-client.tsx`
- Modify: `web/src/components/dashboard/dashboard-client.test.tsx`
- Modify: `web/src/components/site-header.tsx`
- Modify: `web/src/components/site-header.test.tsx`
- Modify: `web/src/components/site-header.module.css`

**Interfaces:**
- Consumes: existing `Link`, session-state rendering and `/reports` route from Task 4.
- Produces: two authenticated entry points without changing signed-out/loading/unavailable navigation.

- [ ] **Step 1: Add failing navigation and 320-pixel contract tests**

Update dashboard expectations:

```ts
expect(screen.getByRole("link", { name: "Search possible matches" }).getAttribute("href"))
  .toBe("/reports");
expect(screen.getAllByText("Available now")).toHaveLength(2);
expect(screen.getAllByText("Upcoming")).toHaveLength(1);
```

Update header expectations:

```ts
expect(screen.getByRole("link", { name: "Browse" }).getAttribute("href"))
  .toBe("/reports");
```

Assert Browse is absent for loading, unauthenticated and unavailable sessions. Extend the CSS source test to require 44-pixel targets for every `.navLink` and an authenticated compact breakpoint that retains Browse, Report item, Dashboard and Sign out without hiding any destination.

- [ ] **Step 2: Confirm red**

Run:

```powershell
npm test -- src/components/dashboard/dashboard-client.test.tsx src/components/site-header.test.tsx
```

Expected: FAIL because Browse is not linked or rendered.

- [ ] **Step 3: Add the two real navigation entries**

Set the dashboard item exactly:

```ts
{
  title: "Search possible matches",
  description: "Search privacy-safe lost and found reports across campus.",
  href: "/reports",
}
```

Add this authenticated header link before `Report item`:

```tsx
<Link className={`${styles.navLink} text-link`} href="/reports">
  Browse
</Link>
```

Keep the existing session branches unchanged. At the narrowest breakpoint, reduce only gap and horizontal padding; keep `.brand`, `.navLink`, `.signOut` and `.retry` at least 44 pixels in both dimensions. Do not hide any authenticated action or shrink the brand mark.

- [ ] **Step 4: Verify navigation green**

Run:

```powershell
npm test -- src/components/dashboard/dashboard-client.test.tsx src/components/site-header.test.tsx
npx eslint src/components/dashboard/dashboard-client.tsx src/components/dashboard/dashboard-client.test.tsx src/components/site-header.tsx src/components/site-header.test.tsx
npx tsc --noEmit --incremental false
```

Expected: PASS; signed-out/loading/unavailable states expose no Browse link.

- [ ] **Step 5: Commit Task 6**

```powershell
git add web/src/components/dashboard/dashboard-client.tsx web/src/components/dashboard/dashboard-client.test.tsx web/src/components/site-header.tsx web/src/components/site-header.test.tsx web/src/components/site-header.module.css
git diff --cached --check
git commit -m "feat(report-ui): link report browsing" -m "Refs #20"
```

---

### Task 7: Full verification and bounded visual review

**Files:**
- Modify only if a substantive verification failure requires a minimal Issue #20 fix.
- Review: every file changed by Tasks 1-6.

**Interfaces:**
- Consumes: complete Issue #20 branch.
- Produces: verified branch ready for the user's push/PR workflow.

- [ ] **Step 1: Run the complete automated gate in strict order**

From `web`:

```powershell
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm audit
```

Expected:

- All tests pass with no unhandled errors.
- ESLint and TypeScript produce no errors.
- Next build includes `/reports` and dynamic `/reports/[id]` plus all existing routes.
- Audit reports `found 0 vulnerabilities`.

Stop at the first substantive code failure. A sandbox-only `.next` write or npm-network failure may be rerun once with the minimum required approval; document it separately from code results.

- [ ] **Step 2: Verify privacy, ignored secrets and exact branch scope**

From the repository root:

```powershell
git status --short --ignored web/.env.local
git diff --check
git diff --check develop...HEAD
git diff --name-status develop...HEAD
git status --short --branch
rg -n "reporterId|privacySettings|serialNumber|exactLocationDetails|distinguishingFeatures|verificationQuestions|expectedAnswer|privateNotes|passwordHash|tokenHash" web/src/components/reports web/src/app/reports web/src/lib/reports/browser-client.ts web/src/lib/reports/browse-search.ts
```

Expected:

- `.env.local` appears only as `!! web/.env.local`; do not read it.
- Worktree and both diff checks are clean.
- Scope contains only the approved docs/plan and Task 1-6 frontend files.
- Production browsing components/search/client contain no private/authentication field names. Test-only exclusion assertions may contain the names.

- [ ] **Step 3: Run one visual and interaction review**

Start the local framework with `npm run dev` only after confirming port availability. Use mocked development data or component fixtures; do not submit a real report or connect through a live Atlas operation for this review.

Verify in one bounded browser round:

- 1440 and 768 CSS pixels: filter rail/result hierarchy, detail reading width and no clipped content.
- 375 and 320 CSS pixels: filters stack before results, cards/images fit, pagination fits and authenticated header has no horizontal overflow.
- Keyboard: skip link, every filter, Search, Clear, result link, pagination and Back link.
- URL: Search, Clear, Previous/Next, reload, Back and Forward preserve canonical state.
- States: loading, empty, retry, privacy-hidden labels and detail not-found.
- Console: no hydration, key, accessibility or unhandled-request error.

Capture one desktop and one mobile screenshot under `.impeccable/review/` for the final UI review. Do not commit generated screenshots unless the repository's documented evidence policy explicitly requires them.

- [ ] **Step 4: Run the Impeccable mechanical detector exactly once**

```powershell
node C:\Users\Lenovo\.codex\skills\impeccable\scripts\detect.mjs --json web/src/components/reports/report-card.tsx web/src/components/reports/report-browser.tsx web/src/components/reports/report-detail-client.tsx web/src/components/reports/report-browsing.module.css web/src/components/site-header.tsx web/src/components/site-header.module.css web/src/components/dashboard/dashboard-client.tsx
```

Fix only objective findings that violate the approved design or Global Constraints. Do not run the detector a second time. Re-run the affected focused tests, lint, TypeScript and build once after any fix, then commit the minimal fix with `Refs #20`.

- [ ] **Step 5: Prepare the user handoff without pushing**

Report:

- Commit list and exact changed-file scope.
- Test/lint/type/build/audit results.
- Privacy scan and `.env.local` ignored result.
- Desktop/mobile review result and any unresolved visual finding.
- Exact user command:

```powershell
git push -u origin feature/issue-20-report-browsing-frontend
```

Do not run that command for the user.
