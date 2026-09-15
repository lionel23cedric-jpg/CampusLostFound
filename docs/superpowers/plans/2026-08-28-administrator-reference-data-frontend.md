# Administrator Reference Data Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure, accessible and responsive `/admin/reference-data` workspace where active administrators can search, create, edit, deactivate and restore report categories and campus locations through the existing Issue #40 APIs.

**Architecture:** A page-level administrator boundary mounts a small tab workspace. Each explicit resource panel owns its list, form, editor, concurrency token and request lifecycle, while a dedicated browser client strictly validates the existing API contract; only identical filter and pagination presentation is shared. The implementation keeps the Issue #40 backend, Mongoose models, member endpoints and package dependencies unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Zod 4, CSS Modules, Vitest 4, Testing Library and the native Fetch/AbortController APIs.

## Global Constraints

- The approved design is `docs/superpowers/specs/2026-08-28-administrator-reference-data-frontend-design.md` and is the source of truth.
- The route is exactly `/admin/reference-data`; the overview link copy is exactly `Manage reference data`.
- The tab names are exactly `Categories` and `Campus locations`; Categories is selected first.
- The category panel mounts on first render. The campus-location panel mounts on first activation. Once mounted, either panel stays mounted and becomes inactive with the native `hidden` attribute.
- List requests use explicit search submission, `all | active | inactive` status filtering, page numbers starting at 1 and the backend fixed page size of 20.
- Category input limits are name 2–80 characters and optional description 0–300 characters.
- Campus-location input limits are campus name 2–80 characters, location name 2–120 characters and optional description 0–300 characters.
- Every PATCH sends the displayed record's exact `updatedAt` value. A stale token is never silently retried.
- There is no permanent deletion, no `DELETE` request, no bulk action, no polling, no browser-persisted draft and no generic CRUD abstraction.
- No backend API, service, model, database schema, member endpoint, package manifest or lockfile changes are allowed.
- All fetches use same-origin credentials, `Accept: application/json`, `cache: no-store` and an abort signal; POST/PATCH also use `Content-Type: application/json`.
- Browser-visible errors use only approved fixed messages. Raw payloads, rejected values, exception messages, database details and endpoint internals are never rendered.
- Tests use mocked browser requests and never read `.env.local`, connect to MongoDB Atlas or mutate real reference data.
- The complete workspace must remain usable without page-level horizontal scrolling at a 320-pixel viewport.

---

## File Structure

### New files

- `web/src/lib/admin/reference-data-browser-client.ts` — explicit list/create/update fetch operations, strict success parsing and safe browser error normalization for both resources.
- `web/src/lib/admin/reference-data-browser-client.test.ts` — request-shape, response-schema, error-redaction and abort tests for that browser boundary.
- `web/src/components/admin/reference-data-panel-controls.tsx` — the only shared presentation: labelled search/status controls and bounded Previous/Next pagination.
- `web/src/components/admin/reference-data-panel-controls.test.tsx` — accessible control names, callbacks, disabled states and page summary tests.
- `web/src/components/admin/category-management-panel.tsx` — category list, create form, inline editor, mutation recovery, focus and announcements.
- `web/src/components/admin/category-management-panel.test.tsx` — category state-machine and accessibility tests.
- `web/src/components/admin/campus-location-management-panel.tsx` — campus-location list, create form, inline editor, mutation recovery, focus and announcements.
- `web/src/components/admin/campus-location-management-panel.test.tsx` — campus-location state-machine and accessibility tests.
- `web/src/components/admin/admin-reference-data-client.tsx` — workspace heading and keyboard-operable lazy tabs.
- `web/src/components/admin/admin-reference-data-client.test.tsx` — tab semantics, keyboard behaviour, lazy mount and retained-panel tests.
- `web/src/components/admin/admin-reference-data.module.css` — cohesive responsive workspace, controls, cards, forms, status and focus styles.
- `web/src/app/admin/reference-data/page.tsx` — metadata, semantic main element and existing administrator boundary composition.
- `web/src/app/admin/reference-data/admin-reference-data-page.test.tsx` — page composition and boundary-copy test.
- `docs/superpowers/verification/2026-08-28-administrator-reference-data-frontend.md` — exact focused/full quality-gate results and scope/privacy evidence.

### Modified files

- `web/src/components/admin/admin-overview-client.tsx` — add the single administrator-hub link to `/admin/reference-data`.
- `web/src/components/admin/admin-overview-client.test.tsx` — verify the new link without changing header navigation.

No other production file belongs in Issue #42 unless a failing test demonstrates that the approved design cannot be met within these boundaries.

---

### Task 1: Strict Reference-Data Browser Client

**Files:**
- Create: `web/src/lib/admin/reference-data-browser-client.ts`
- Test: `web/src/lib/admin/reference-data-browser-client.test.ts`

**Interfaces:**
- Consumes: `ReferenceDataListQuery`, `CreateAdminCategoryInput`, `UpdateAdminCategoryInput`, `CreateAdminCampusLocationInput`, `UpdateAdminCampusLocationInput`, `AdminCategoryPage`, `AdminCampusLocationPage`, `AdminCategory`, `AdminCampusLocation` and their exported schemas from `@/lib/admin/reference-data-contract`.
- Produces:

```ts
export type BrowserReferenceDataErrorCode =
  | "INVALID_REFERENCE_DATA_REQUEST"
  | "AUTHENTICATION_REQUIRED"
  | "ADMINISTRATOR_REQUIRED"
  | "REFERENCE_DATA_NOT_FOUND"
  | "REFERENCE_DATA_DUPLICATE"
  | "REFERENCE_DATA_STATE_CONFLICT"
  | "REFERENCE_DATA_OPERATION_FAILED";

export class BrowserReferenceDataError extends Error {
  readonly code: BrowserReferenceDataErrorCode;
  readonly status: number;

  constructor(
    code: BrowserReferenceDataErrorCode,
    status: number,
    message: string,
  );
}

export function listAdministratorCategories(
  query: ReferenceDataListQuery,
  signal?: AbortSignal,
): Promise<AdminCategoryPage>;
export function createAdministratorCategory(
  input: CreateAdminCategoryInput,
  signal?: AbortSignal,
): Promise<AdminCategory>;
export function updateAdministratorCategory(
  categoryId: string,
  input: UpdateAdminCategoryInput,
  signal?: AbortSignal,
): Promise<AdminCategory>;
export function listAdministratorCampusLocations(
  query: ReferenceDataListQuery,
  signal?: AbortSignal,
): Promise<AdminCampusLocationPage>;
export function createAdministratorCampusLocation(
  input: CreateAdminCampusLocationInput,
  signal?: AbortSignal,
): Promise<AdminCampusLocation>;
export function updateAdministratorCampusLocation(
  campusLocationId: string,
  input: UpdateAdminCampusLocationInput,
  signal?: AbortSignal,
): Promise<AdminCampusLocation>;
```

- [ ] **Step 1: Write failing request and success-schema tests**

Create fixtures with valid 24-character IDs and ISO timestamps. Assert the exact request for all six exported operations. The list assertion must prove canonical query encoding and omission of an absent `q`:

```ts
it("lists categories with a canonical encoded query", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(categoryPage)));

  await expect(
    listAdministratorCategories({ q: "wallet & keys", status: "inactive", page: 2 }),
  ).resolves.toEqual(categoryPage);

  expect(fetch).toHaveBeenCalledWith(
    "/api/admin/categories?q=wallet+%26+keys&status=inactive&page=2",
    {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal: undefined,
    },
  );
});

it("updates a campus location with an encoded identifier", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(jsonResponse({ campusLocation })),
  );
  const input = { updatedAt: campusLocation.updatedAt, isActive: false };

  await expect(
    updateAdministratorCampusLocation(campusLocation.id, input),
  ).resolves.toEqual(campusLocation);

  expect(fetch).toHaveBeenCalledWith(
    `/api/admin/campus-locations/${encodeURIComponent(campusLocation.id)}`,
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify(input),
      credentials: "same-origin",
      cache: "no-store",
    }),
  );
});
```

Add strict-schema failures for an extra top-level property, an extra record property, invalid pagination, a malformed ID and a malformed timestamp. Cover both `{ category }` and `{ campusLocation }` response wrappers.

- [ ] **Step 2: Run the browser-client tests and confirm the red state**

Run:

```powershell
cd D:\Massey\CampusLostFound\web
npm.cmd test -- src/lib/admin/reference-data-browser-client.test.ts
```

Expected: FAIL because `reference-data-browser-client.ts` and its exports do not exist.

- [ ] **Step 3: Implement strict request and success parsing**

Define strict mutation response schemas locally and route every operation through one private request helper without exporting a generic framework:

```ts
import { z } from "zod";
import {
  adminCampusLocationPageSchema,
  adminCampusLocationSchema,
  adminCategoryPageSchema,
  adminCategorySchema,
  type ReferenceDataListQuery,
} from "@/lib/admin/reference-data-contract";

const categoryResponseSchema = z.strictObject({ category: adminCategorySchema });
const campusLocationResponseSchema = z.strictObject({
  campusLocation: adminCampusLocationSchema,
});

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
```

The private JSON reader must preserve a real `AbortError`, convert an aborted signal plus a non-Abort rejection into `new DOMException("The operation was aborted", "AbortError")`, and otherwise return only a generic browser error.

- [ ] **Step 4: Write failing safe-error, network and abort tests**

Test every approved `(status, code, message)` tuple and reject mismatched status/code/message combinations. Use this exact allowlist:

```ts
const approvedErrors = [
  [400, "INVALID_REFERENCE_DATA_REQUEST", "Reference data request is invalid"],
  [401, "AUTHENTICATION_REQUIRED", "Authentication required"],
  [403, "ADMINISTRATOR_REQUIRED", "Administrator access required"],
  [404, "REFERENCE_DATA_NOT_FOUND", "Reference data not found"],
  [409, "REFERENCE_DATA_DUPLICATE", "Reference data already exists"],
  [409, "REFERENCE_DATA_STATE_CONFLICT", "Reference data has changed"],
  [500, "REFERENCE_DATA_OPERATION_FAILED", "Reference data operation failed"],
] as const;
```

Assert that non-JSON bodies, invalid JSON shapes, network messages such as `PRIVATE-MONGODB-HOST`, error payload extras and unsuccessful 2xx body parsing all produce:

```ts
{
  code: "REFERENCE_DATA_OPERATION_FAILED",
  status: expectedStatus,
  message: "Reference data management is temporarily unavailable",
}
```

Assert that an actual `DOMException("PRIVATE-ABORT", "AbortError")` is returned by identity and never replaced.

- [ ] **Step 5: Implement safe error normalization and run the focused tests**

Use a prototype-safe `Map` keyed by code, compare both status and fixed message, and expose only approved values:

```ts
const GENERIC_MESSAGE = "Reference data management is temporarily unavailable";

function genericError(status: number) {
  return new BrowserReferenceDataError(
    "REFERENCE_DATA_OPERATION_FAILED",
    status,
    GENERIC_MESSAGE,
  );
}

function isAbortError(error: unknown): error is DOMException {
  return error instanceof DOMException && error.name === "AbortError";
}
```

Run:

```powershell
npm.cmd test -- src/lib/admin/reference-data-browser-client.test.ts
npm.cmd exec -- tsc --noEmit --incremental false
```

Expected: all client tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit the browser boundary**

```powershell
git add web/src/lib/admin/reference-data-browser-client.ts web/src/lib/admin/reference-data-browser-client.test.ts
git commit -m "feat(admin-ui): add reference data browser client"
```

---

### Task 2: Shared Search, Status and Pagination Controls

**Files:**
- Create: `web/src/components/admin/reference-data-panel-controls.tsx`
- Test: `web/src/components/admin/reference-data-panel-controls.test.tsx`
- Create: `web/src/components/admin/admin-reference-data.module.css`

**Interfaces:**
- Consumes: `REFERENCE_DATA_STATUSES` from `@/lib/admin/reference-data-contract`.
- Produces:

```ts
export type ReferenceDataStatus = "all" | "active" | "inactive";

export function ReferenceDataFilters(props: {
  resourceLabel: string;
  searchDraft: string;
  status: ReferenceDataStatus;
  isBusy: boolean;
  onSearchDraftChange(value: string): void;
  onStatusChange(value: ReferenceDataStatus): void;
  onSearch(): void;
  onReset(): void;
}): React.JSX.Element;

export function ReferenceDataPagination(props: {
  resourceLabel: string;
  page: number;
  totalPages: number;
  total: number;
  isBusy: boolean;
  onPageChange(page: number): void;
}): React.JSX.Element;
```

- [ ] **Step 1: Write failing accessible-control tests**

Render filters with `resourceLabel="categories"` and assert visible labels `Search categories` and `Category status`, buttons `Search categories` and `Reset category filters`, and option labels `All`, `Active`, `Inactive`. Submit the form and change the select with `userEvent`; assert exact callback values. Render pagination at page 2 of 4 with 61 results and assert `Page 2 of 4 · 61 categories`, Previous calls 1, Next calls 3, and boundary/busy buttons disable safely.

```tsx
await user.type(screen.getByLabelText("Search categories"), "wallet");
expect(onSearchDraftChange).toHaveBeenLastCalledWith("wallet");
await user.selectOptions(screen.getByLabelText("Category status"), "inactive");
expect(onStatusChange).toHaveBeenCalledWith("inactive");
await user.click(screen.getByRole("button", { name: "Search categories" }));
expect(onSearch).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Run the control tests and confirm the red state**

```powershell
npm.cmd test -- src/components/admin/reference-data-panel-controls.test.tsx
```

Expected: FAIL because the control module does not exist.

- [ ] **Step 3: Implement the two presentational controls**

Use a real `<form role="search">`, visible `<label>` elements and a `select` whose accepted values are checked against `REFERENCE_DATA_STATUSES` before calling the parent. The status callback fires immediately; the search callback fires only on form submission. The reset button is `type="button"`. Pagination never generates page numbers outside `1..totalPages`.

```tsx
<form className={styles.filters} role="search" onSubmit={handleSubmit}>
  <label htmlFor={`${resourceLabel}-search`}>Search {resourceLabel}</label>
  <input
    id={`${resourceLabel}-search`}
    value={searchDraft}
    maxLength={80}
    disabled={isBusy}
    onChange={(event) => onSearchDraftChange(event.target.value)}
  />
  <button type="submit" disabled={isBusy}>Search {resourceLabel}</button>
  <button type="button" disabled={isBusy} onClick={onReset}>
    Reset {resourceLabel === "categories" ? "category" : "campus location"} filters
  </button>
</form>
```

Add initial CSS tokens for `.workspace`, `.tabs`, `.tab`, `.panel`, `.filters`, `.pagination`, `.buttonRow` and `.visuallyHidden`. Use `min-width: 0`, wrapping flex/grid layouts and visible `:focus-visible` outlines.

- [ ] **Step 4: Run focused tests, lint the files and commit**

```powershell
npm.cmd test -- src/components/admin/reference-data-panel-controls.test.tsx
npm.cmd exec -- eslint src/components/admin/reference-data-panel-controls.tsx src/components/admin/reference-data-panel-controls.test.tsx
git add web/src/components/admin/reference-data-panel-controls.tsx web/src/components/admin/reference-data-panel-controls.test.tsx web/src/components/admin/admin-reference-data.module.css
git commit -m "feat(admin-ui): add reference data panel controls"
```

Expected: tests and ESLint PASS.

---

### Task 3: Category Management Panel

**Files:**
- Create: `web/src/components/admin/category-management-panel.tsx`
- Test: `web/src/components/admin/category-management-panel.test.tsx`
- Modify: `web/src/components/admin/admin-reference-data.module.css`

**Interfaces:**
- Consumes: `ReferenceDataFilters`, `ReferenceDataPagination`, the three category browser-client functions, `BrowserReferenceDataError`, `createAdminCategorySchema`, `updateAdminCategorySchema`, `AdminCategory`, `AdminCategoryPage`, `useAuthSession()` and `useRouter()`.
- Produces: `export function CategoryManagementPanel(): React.JSX.Element`.
- Panel callback contract: 400 list errors show `Check the category filters and try again.`; 400 write errors show `Check the category values and try again.`; 401 calls `refreshSession()` then `router.replace("/login")`; 403 calls `refreshSession()` and renders `Administrator access changed`; all unsafe/unexpected failures use `Category management is temporarily unavailable. Try again.`

- [ ] **Step 1: Write failing list-flow tests**

Mock the browser-client module rather than `fetch`. Cover initial loading, valid cards, initial failure/retry, filtered/unfiltered empty states, explicit search, status-to-page-1, reset-to-page-1, bounded pagination, last-valid-page retention during refresh failure, aborted requests, stale completion order and unmount protection.

Use deferred promises for stale-response assertions:

```tsx
const first = deferred<AdminCategoryPage>();
const second = deferred<AdminCategoryPage>();
listAdministratorCategories
  .mockReturnValueOnce(first.promise)
  .mockReturnValueOnce(second.promise);

render(<CategoryManagementPanel />);
await user.type(screen.getByLabelText("Search categories"), "keys");
await user.click(screen.getByRole("button", { name: "Search categories" }));
second.resolve(categoryPage({ categories: [keysCategory] }));
expect(await screen.findByRole("heading", { name: "Keys" })).toBeVisible();
first.resolve(categoryPage({ categories: [walletCategory] }));
expect(screen.queryByRole("heading", { name: "Wallet" })).toBeNull();
```

- [ ] **Step 2: Run the category tests and confirm the red state**

```powershell
npm.cmd test -- src/components/admin/category-management-panel.test.tsx
```

Expected: FAIL because `CategoryManagementPanel` does not exist.

- [ ] **Step 3: Implement mounted/list/filter state**

Use explicit state, not a generic resource hook:

```ts
type CategoryListState =
  | { status: "loading"; page: null }
  | { status: "error"; page: null }
  | {
      status: "ready";
      page: AdminCategoryPage;
      isRefreshing: boolean;
      refreshFailed: boolean;
    }
  | { status: "accessChanged"; page: null };

type CategoryEditor = {
  recordId: string;
  updatedAt: string;
  name: string;
  description: string;
  desiredActive: boolean;
  conflict: boolean;
};
```

Keep `mounted`, `listRequestId`, `listController`, `mutationId` and `mutationController` refs. `loadCategories(query, mode)` aborts the prior list request, increments the ID, retains a ready page during refresh, and commits a result only when mounted, un-aborted and current. First mount schedules page 1 using `window.setTimeout(..., 0)` to match existing client patterns.

- [ ] **Step 4: Write failing create-flow tests**

Assert visible labels and limits, local validation with no client call, one mutation at a time, pending copy `Creating category`, successful form clearing/filter reset/page-1 reload/announcement, duplicate draft retention with `A category with that name already exists. Choose a unique name.`, server validation retention with `Check the category values and try again.`, unavailable retry and focus on the success live region.

```tsx
await user.type(screen.getByLabelText("Category name"), "ID cards");
await user.type(screen.getByLabelText("Category description"), "Student identification cards");
await user.click(screen.getByRole("button", { name: "Create category" }));

expect(createAdministratorCategory).toHaveBeenCalledWith(
  { name: "ID cards", description: "Student identification cards" },
  expect.any(AbortSignal),
);
expect(await screen.findByText("Category ID cards created")).toHaveFocus();
```

- [ ] **Step 5: Implement category creation**

Validate with `createAdminCategorySchema.safeParse`, map Zod issues to the visible Name/Description error paragraphs using `aria-describedby`, and send only parsed output. Store form values as strings, passing an empty description so the shared schema canonicalises it to `null`. Guard the operation with the panel mutation identity. On success set the submitted filters to `{ q: undefined, status: "all", page: 1 }`, clear both draft inputs and reload page 1.

- [ ] **Step 6: Write failing edit, state-change and conflict tests**

Cover one expanded editor, exact `updatedAt`, successful edit, deactivate and restore confirmation copy, missing record recovery, duplicate preservation, 401 redirect, 403 workspace removal, generic failure, focus restoration, conflict draft preservation, stale-save disablement, `Reload latest`, refreshed editor fields/token and Cancel availability.

The conflict assertion must prove there is no automatic PATCH retry:

```tsx
await user.click(screen.getByRole("button", { name: "Save category Wallet" }));
expect(await screen.findByRole("alert")).toHaveTextContent(
  "This category changed after you opened it. Reload the latest version before saving again.",
);
expect(screen.getByRole("button", { name: "Save category Wallet" })).toBeDisabled();
expect(updateAdministratorCategory).toHaveBeenCalledTimes(1);
await user.click(screen.getByRole("button", { name: "Reload latest category Wallet" }));
expect(updateAdministratorCategory).toHaveBeenCalledTimes(1);
```

- [ ] **Step 7: Implement inline editing and safe recovery**

Render records as `<article>` cards with a heading, description fallback, status text and dates in a definition list. `Edit category {name}` opens the inline form from the validated record. PATCH bodies are produced by `updateAdminCategorySchema.safeParse` and always contain `updatedAt` plus changed approved fields. Deactivate/restore uses explicit confirmation text and sends `{ updatedAt, isActive: false | true }`; no code path constructs a DELETE request.

On `REFERENCE_DATA_STATE_CONFLICT`, set `conflict: true` without altering the draft. `Reload latest` reloads the current list; if the record exists, replace the editor fields and `updatedAt`, then clear conflict. A 404 closes the editor and refreshes. Successful mutation replaces the matching card immediately, closes the editor, announces the result and focuses the card heading through a record-ref map.

- [ ] **Step 8: Finish responsive category styles and run focused checks**

Add one-column create/editor grids, wrapping action rows, text status badges and card sizing. Include this exact mobile guard:

```css
.workspace,
.panel,
.card,
.formGrid,
.field {
  min-width: 0;
}

.field input,
.field textarea,
.field select {
  box-sizing: border-box;
  max-width: 100%;
  width: 100%;
}

@media (max-width: 24rem) {
  .filters,
  .formGrid,
  .buttonRow,
  .pagination {
    align-items: stretch;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
}
```

Run:

```powershell
npm.cmd test -- src/components/admin/category-management-panel.test.tsx src/components/admin/reference-data-panel-controls.test.tsx src/lib/admin/reference-data-browser-client.test.ts
npm.cmd exec -- eslint src/components/admin/category-management-panel.tsx src/components/admin/category-management-panel.test.tsx
npm.cmd exec -- tsc --noEmit --incremental false
```

Expected: all focused checks PASS.

- [ ] **Step 9: Commit the category workflow**

```powershell
git add web/src/components/admin/category-management-panel.tsx web/src/components/admin/category-management-panel.test.tsx web/src/components/admin/admin-reference-data.module.css
git commit -m "feat(admin-ui): manage report categories"
```

---

### Task 4: Campus-Location Management Panel

**Files:**
- Create: `web/src/components/admin/campus-location-management-panel.tsx`
- Test: `web/src/components/admin/campus-location-management-panel.test.tsx`
- Modify: `web/src/components/admin/admin-reference-data.module.css`

**Interfaces:**
- Consumes: `ReferenceDataFilters`, `ReferenceDataPagination`, the three campus-location browser-client functions, `BrowserReferenceDataError`, `createAdminCampusLocationSchema`, `updateAdminCampusLocationSchema`, `AdminCampusLocation`, `AdminCampusLocationPage`, `useAuthSession()` and `useRouter()`.
- Produces: `export function CampusLocationManagementPanel(): React.JSX.Element`.
- Exact visible field names: `Campus name`, `Location name`, `Campus location description`.
- Panel callback contract: 400 list errors show `Check the campus location filters and try again.`; 400 write errors show `Check the campus location values and try again.`; 401 refreshes the session and redirects to `/login`; 403 refreshes the session and removes the management workspace; duplicate errors show `That campus and location combination already exists. Choose unique values.`; unsafe/unexpected failures show `Campus location management is temporarily unavailable. Try again.`

- [ ] **Step 1: Write failing campus-location list and filter tests**

Cover initial request `{ q: undefined, status: "all", page: 1 }`, loading, cards, active/inactive status, explicit search, status reset, page bounds, filtered/unfiltered empty copy, retry, retained last-valid data, abort, stale response order and unmount. Assert each card heading is `locationName` and the campus is exposed as labelled text rather than concatenated inaccessible copy.

```tsx
expect(await screen.findByRole("heading", { name: "Library help desk" })).toBeVisible();
expect(screen.getByText("Campus").nextElementSibling).toHaveTextContent("Albany");
```

- [ ] **Step 2: Run the campus-location tests and confirm the red state**

```powershell
npm.cmd test -- src/components/admin/campus-location-management-panel.test.tsx
```

Expected: FAIL because `CampusLocationManagementPanel` does not exist.

- [ ] **Step 3: Implement independent campus-location list state**

Define `CampusLocationListState` and `CampusLocationEditor` explicitly. The editor contains `recordId`, `updatedAt`, `campusName`, `locationName`, `description`, `desiredActive` and `conflict`. Use panel-local request IDs/controllers so a category request can never cancel, overwrite or disable a campus-location request.

```ts
type CampusLocationEditor = {
  recordId: string;
  updatedAt: string;
  campusName: string;
  locationName: string;
  description: string;
  desiredActive: boolean;
  conflict: boolean;
};
```

Initial mount and refresh handling must retain the last valid page on non-access failures and suppress abort/stale/unmounted results.

- [ ] **Step 4: Write failing create and validation tests**

Assert the exact three visible fields and `maxLength` values 80, 120 and 300. Test NFKC/trim validation through `createAdminCampusLocationSchema`, no request for local errors, pending duplicate-submission blocking, successful reset/filter reset/page-1 reload/focus, case-insensitive duplicate safe message, retained drafts and generic unavailable recovery.

```tsx
expect(createAdministratorCampusLocation).toHaveBeenCalledWith(
  {
    campusName: "Albany",
    locationName: "Library help desk",
    description: "Ground floor service desk",
  },
  expect.any(AbortSignal),
);
```

- [ ] **Step 5: Implement campus-location creation**

Parse the three strings with `createAdminCampusLocationSchema.safeParse`. Bind each returned issue to the matching visible error element. While pending, disable only unsafe write controls in this panel and label the button `Creating campus location`. On success announce `Campus location {locationName} created`, clear the form, reset query/status/page and reload.

- [ ] **Step 6: Write failing edit, activate/deactivate and recovery tests**

Test changed campus/location/description PATCH fields with the exact token, explicit deactivation and restoration confirmation, single mutation guard, duplicate retention, 404 close/refresh, 409 conflict gating, manual latest reload, 401 refresh+login redirect, 403 access-changed removal, 500 retention/retry and successful heading focus.

The state-change copy must identify both values:

```tsx
expect(
  screen.getByText(
    "Deactivate Library help desk on Albany? It will no longer be available for new reports, while existing report references remain unchanged.",
  ),
).toBeVisible();
```

- [ ] **Step 7: Implement editing and conflict-safe recovery**

Build update payloads with `updateAdminCampusLocationSchema.safeParse`; include only approved changes plus `updatedAt`. Keep the draft on duplicate, validation, generic failure and state conflict. After conflict, disable save/deactivate/restore until `Reload latest campus location {locationName}` refreshes the list and replaces the editor fields/token. Never retry the failed mutation automatically. A missing item closes the editor and reloads the current page.

- [ ] **Step 8: Run focused checks and commit**

```powershell
npm.cmd test -- src/components/admin/campus-location-management-panel.test.tsx src/components/admin/reference-data-panel-controls.test.tsx src/lib/admin/reference-data-browser-client.test.ts
npm.cmd exec -- eslint src/components/admin/campus-location-management-panel.tsx src/components/admin/campus-location-management-panel.test.tsx
npm.cmd exec -- tsc --noEmit --incremental false
git add web/src/components/admin/campus-location-management-panel.tsx web/src/components/admin/campus-location-management-panel.test.tsx web/src/components/admin/admin-reference-data.module.css
git commit -m "feat(admin-ui): manage campus locations"
```

Expected: all focused checks PASS.

---

### Task 5: Accessible Lazy Tab Workspace

**Files:**
- Create: `web/src/components/admin/admin-reference-data-client.tsx`
- Test: `web/src/components/admin/admin-reference-data-client.test.tsx`
- Modify: `web/src/components/admin/admin-reference-data.module.css`

**Interfaces:**
- Consumes: `CategoryManagementPanel` and `CampusLocationManagementPanel`.
- Produces: `export function AdminReferenceDataClient(): React.JSX.Element`.
- Stable IDs: `reference-data-tab-categories`, `reference-data-panel-categories`, `reference-data-tab-campus-locations`, `reference-data-panel-campus-locations`.

- [ ] **Step 1: Write failing tab semantics and lifecycle tests**

Mock both panel modules with mount counters and local inputs. Assert one labelled tablist, exactly two tabs, stable `aria-controls`/`aria-labelledby`, Categories selected first, category mounted once, campus absent before first activation, inactive panel `hidden` after switching, and typed drafts preserved across repeated switches.

```tsx
expect(screen.getByRole("tab", { name: "Categories" })).toHaveAttribute(
  "aria-selected",
  "true",
);
expect(screen.queryByTestId("campus-location-panel")).toBeNull();
await user.click(screen.getByRole("tab", { name: "Campus locations" }));
expect(screen.getByTestId("category-panel").closest("[role=tabpanel]")).toHaveAttribute("hidden");
expect(screen.getByTestId("campus-location-panel")).toBeVisible();
```

- [ ] **Step 2: Write failing keyboard tests**

Assert Right/Left Arrow wraps focus, Home/End moves focus, and Enter/Space activates only the focused tab. Arrow navigation must not issue requests by itself because selection changes only after activation.

```tsx
categoriesTab.focus();
await user.keyboard("{ArrowRight}");
expect(campusTab).toHaveFocus();
expect(categoriesTab).toHaveAttribute("aria-selected", "true");
await user.keyboard("{Enter}");
expect(campusTab).toHaveAttribute("aria-selected", "true");
```

- [ ] **Step 3: Run the workspace tests and confirm the red state**

```powershell
npm.cmd test -- src/components/admin/admin-reference-data-client.test.tsx
```

Expected: FAIL because the workspace module does not exist.

- [ ] **Step 4: Implement the workspace and roving focus**

Keep `selectedTab` and `campusVisited` state plus two button refs. Click, Enter and Space call `activate(tab)`. Arrow/Home/End only move focus. Categories always renders; campus renders only after `campusVisited` becomes true. Both use native `hidden` on inactive tabpanels.

```tsx
<div role="tablist" aria-label="Reference data resources">
  <button
    ref={categoryTabRef}
    id="reference-data-tab-categories"
    role="tab"
    aria-selected={selectedTab === "categories"}
    aria-controls="reference-data-panel-categories"
    tabIndex={selectedTab === "categories" ? 0 : -1}
  >
    Categories
  </button>
  <button
    ref={campusTabRef}
    id="reference-data-tab-campus-locations"
    role="tab"
    aria-selected={selectedTab === "campusLocations"}
    aria-controls="reference-data-panel-campus-locations"
    tabIndex={selectedTab === "campusLocations" ? 0 : -1}
  >
    Campus locations
  </button>
</div>
```

The visible heading is `Manage reference data`; the description explains that deactivation affects future selections while historical report references remain available.

- [ ] **Step 5: Complete tab/mobile styling, run checks and commit**

```powershell
npm.cmd test -- src/components/admin/admin-reference-data-client.test.tsx src/components/admin/category-management-panel.test.tsx src/components/admin/campus-location-management-panel.test.tsx
npm.cmd exec -- eslint src/components/admin/admin-reference-data-client.tsx src/components/admin/admin-reference-data-client.test.tsx
npm.cmd exec -- tsc --noEmit --incremental false
git add web/src/components/admin/admin-reference-data-client.tsx web/src/components/admin/admin-reference-data-client.test.tsx web/src/components/admin/admin-reference-data.module.css
git commit -m "feat(admin-ui): add reference data workspace"
```

Expected: all workspace and panel checks PASS.

---

### Task 6: Protected Page and Administrator Overview Navigation

**Files:**
- Create: `web/src/app/admin/reference-data/page.tsx`
- Create: `web/src/app/admin/reference-data/admin-reference-data-page.test.tsx`
- Modify: `web/src/components/admin/admin-overview-client.tsx`
- Modify: `web/src/components/admin/admin-overview-client.test.tsx`

**Interfaces:**
- Consumes: `AdministratorAccessBoundary` and `AdminReferenceDataClient`.
- Produces: page metadata title `Manage reference data` and the overview link `/admin/reference-data`.

- [ ] **Step 1: Write failing page-composition tests**

Mock the boundary and workspace so the test proves the page uses a semantic `main#main-content`, the exact boundary configuration and metadata without triggering fetches:

```tsx
expect(metadata.title).toBe("Manage reference data");
expect(boundaryProps).toMatchObject({
  workspaceLabel: "Administrator reference data management workspace",
  forbiddenDescription:
    "Only active administrators can manage report categories and campus locations.",
});
expect(screen.getByTestId("reference-data-client")).toBeInTheDocument();
```

- [ ] **Step 2: Write the failing overview-navigation assertion**

Extend the ready-overview test with:

```tsx
expect(
  screen.getByRole("link", { name: "Manage reference data" }).getAttribute("href"),
).toBe("/admin/reference-data");
```

Also assert there remains no global/header navigation restructuring; only `AdminOverviewClient` gains this link.

- [ ] **Step 3: Run page and overview tests and confirm the red state**

```powershell
npm.cmd test -- src/app/admin/reference-data/admin-reference-data-page.test.tsx src/components/admin/admin-overview-client.test.tsx
```

Expected: FAIL because the page and link do not exist.

- [ ] **Step 4: Implement the protected page**

```tsx
import type { Metadata } from "next";

import { AdminReferenceDataClient } from "@/components/admin/admin-reference-data-client";
import { AdministratorAccessBoundary } from "@/components/admin/administrator-access-boundary";

export const metadata: Metadata = { title: "Manage reference data" };

export default function AdminReferenceDataPage() {
  return (
    <main id="main-content">
      <AdministratorAccessBoundary
        workspaceLabel="Administrator reference data management workspace"
        forbiddenDescription="Only active administrators can manage report categories and campus locations."
      >
        <AdminReferenceDataClient />
      </AdministratorAccessBoundary>
    </main>
  );
}
```

- [ ] **Step 5: Add the overview link in the Reports section**

Wrap the existing Reports heading copy only as needed to place this action beside it:

```tsx
<Link href="/admin/reference-data">Manage reference data</Link>
```

Do not alter the site header, account link or staff Claim link.

- [ ] **Step 6: Run integration/regression checks and commit**

```powershell
npm.cmd test -- src/app/admin/reference-data/admin-reference-data-page.test.tsx src/components/admin/admin-overview-client.test.tsx src/components/admin/administrator-access-boundary.test.tsx src/app/admin/admin-page.test.tsx src/app/admin/accounts/admin-account-page.test.tsx
npm.cmd exec -- eslint src/app/admin/reference-data/page.tsx src/app/admin/reference-data/admin-reference-data-page.test.tsx src/components/admin/admin-overview-client.tsx src/components/admin/admin-overview-client.test.tsx
npm.cmd exec -- tsc --noEmit --incremental false
git add web/src/app/admin/reference-data/page.tsx web/src/app/admin/reference-data/admin-reference-data-page.test.tsx web/src/components/admin/admin-overview-client.tsx web/src/components/admin/admin-overview-client.test.tsx
git commit -m "feat(admin-ui): link reference data management"
```

Expected: focused integration tests, ESLint and TypeScript PASS.

---

### Task 7: Full Regression, Scope, Privacy and Verification Evidence

**Files:**
- Create: `docs/superpowers/verification/2026-08-28-administrator-reference-data-frontend.md`

**Interfaces:**
- Consumes: every Issue #42 commit and the existing Issue #40 backend/member tests.
- Produces: reviewable exact evidence for Issue #42 and a clean feature branch ready to push.

- [ ] **Step 1: Run all new focused tests as one gate**

```powershell
cd D:\Massey\CampusLostFound\web
npm.cmd test -- src/lib/admin/reference-data-browser-client.test.ts src/components/admin/reference-data-panel-controls.test.tsx src/components/admin/category-management-panel.test.tsx src/components/admin/campus-location-management-panel.test.tsx src/components/admin/admin-reference-data-client.test.tsx src/app/admin/reference-data/admin-reference-data-page.test.tsx src/components/admin/admin-overview-client.test.tsx
```

Expected: every listed test file PASS.

- [ ] **Step 2: Run protected regression suites**

```powershell
npm.cmd test -- src/app/api/admin/categories/admin-category-routes.test.ts src/app/api/admin/campus-locations/admin-campus-location-routes.test.ts src/lib/admin/reference-data-contract.test.ts src/lib/admin/reference-data-errors.test.ts src/lib/admin/category-service.test.ts src/lib/admin/campus-location-service.test.ts src/components/admin/administrator-access-boundary.test.tsx src/components/admin/admin-account-management-client.test.tsx src/app/api/reports/report-routes.test.ts src/lib/reports/reference-data.test.ts src/lib/reports/browser-client.test.ts
```

Expected: administrator backend, member reference data, report browser client, boundary and account-management regressions PASS.

- [ ] **Step 3: Run the full quality gates**

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd exec -- tsc --noEmit --incremental false
npm.cmd run build
npm.cmd audit
```

Expected: full Vitest suite PASS, ESLint exits 0, TypeScript exits 0, production build includes `/admin/reference-data`, and audit reports `found 0 vulnerabilities`.

- [ ] **Step 4: Run scope and privacy checks from the repository root**

```powershell
cd D:\Massey\CampusLostFound
git diff --check origin/develop...HEAD
git diff --name-only origin/develop...HEAD -- web/src/app/api web/src/lib/admin/category-service.ts web/src/lib/admin/campus-location-service.ts web/src/models web/package.json web/package-lock.json
git diff --name-only origin/develop...HEAD
git check-ignore web/.env.local
rg -n "method:\s*[\"']DELETE|fetch\([^\r\n]*DELETE" web/src/components/admin web/src/lib/admin/reference-data-browser-client.ts
rg -n "mongodb\+srv|MONGODB_URI|passwordHash|PRIVATE[-_]" web/src/components/admin web/src/lib/admin/reference-data-browser-client.ts web/src/app/admin/reference-data
```

Expected:

- `git diff --check` has no output.
- The protected backend/model/manifest diff has no output.
- The complete name list contains only the Issue #42 plan, client, UI, page, navigation, tests, CSS and verification document.
- `git check-ignore` prints `web/.env.local`.
- DELETE and credential scans have no matches. Exit code 1 from `rg` means the no-match check passed.

- [ ] **Step 5: Record exact verification evidence**

Create the verification file with command, date, exit/result count and scope conclusion. Use this structure and replace the result fields with the actual terminal values from Steps 1–4:

```markdown
# Administrator Reference Data Frontend Verification

**Date:** 2026-08-28
**Issue:** #42
**Branch:** `feature/issue-42-administrator-reference-data-frontend`

## Focused verification

| Command | Result |
| --- | --- |
| Focused Issue #42 test command from Step 1 | PASS — record Vitest's printed test and file counts |
| Protected regression command | PASS — exact test/file counts from terminal |

## Full quality gates

| Command | Result |
| --- | --- |
| `npm.cmd test` | PASS — exact test/file counts from terminal |
| `npm.cmd run lint` | PASS |
| `npm.cmd exec -- tsc --noEmit --incremental false` | PASS |
| `npm.cmd run build` | PASS — `/admin/reference-data` present |
| `npm.cmd audit` | PASS — 0 vulnerabilities |

## Scope and privacy

- No backend API, service, model, schema, package manifest or lockfile changed.
- No permanent deletion or DELETE request was added.
- `.env.local` remains ignored.
- No credentials, MongoDB URI, password hash or raw private error text appears in the frontend diff.
- Tests use mocked browser operations and do not access MongoDB Atlas.
- The workspace was reviewed at 320 CSS pixels without page-level horizontal overflow.
```

- [ ] **Step 6: Verify the evidence file and commit**

```powershell
git diff --check
git status --short
git add docs/superpowers/verification/2026-08-28-administrator-reference-data-frontend.md
git commit -m "docs: record administrator reference data frontend verification"
git status --short --branch
```

Expected: final status is clean on `feature/issue-42-administrator-reference-data-frontend`.

---

## Pull Request Handoff

After all seven tasks pass, push the feature branch and open the PR against `develop` with:

```markdown
## Summary

- add a protected administrator workspace for categories and campus locations
- support strict search, pagination, creation, editing, deactivation and restoration
- preserve drafts and require explicit reload after optimistic-concurrency conflicts
- add accessible lazy tabs, responsive cards and safe request/error handling

## Verification

- `npm test`
- `npm run lint`
- `npm exec -- tsc --noEmit --incremental false`
- `npm run build`
- `npm audit` reports 0 vulnerabilities

Closes #42
```

Use the branch name `feature/issue-42-administrator-reference-data-frontend`. Merge only after GitHub reports no conflicts and the PR diff contains no backend, model, dependency or credential changes.
