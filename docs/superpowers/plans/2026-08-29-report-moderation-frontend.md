# Report Moderation Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an accessible member report-flag form and administrator moderation workspace over the existing secure moderation APIs.

**Architecture:** A strict client-only moderation contract validates every browser response before focused React components use it. The report-detail flag panel and two administrator panels independently own their request state, while the existing server routes remain the sole authority for access, validation, concurrency, and state transitions.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Zod 4, CSS Modules, Vitest, Testing Library, existing same-origin REST APIs.

## Global Constraints

- Do not add dependencies, database fields, endpoints, audit event types, notification kinds, or AI moderation.
- Do not add deletion, bulk actions, chat, appeals, flag history, audit-log browsing, charts, or exports.
- Use only the existing member flag and administrator moderation endpoints.
- Treat server authorisation, ownership, visibility, state transitions, and optimistic concurrency as authoritative.
- Never expose reporter, flagger, or administrator identities; private verification evidence; serial numbers; exact private locations; credentials; sessions; or audit internals.
- Never render raw server error messages; branch only on approved codes and use fixed safe copy.
- Preserve keyboard operation, visible focus, semantic controls, live status announcements, 44-by-44 CSS-pixel touch targets, and usability at 320 CSS pixels.
- Tests must not access MongoDB Atlas or perform a real moderation mutation.
- Use TDD and commit each independently reviewable task.

---

## File structure

### Create

- `web/src/lib/moderation/browser-contract.ts` — browser-safe enums, strict Zod schemas, public client types, and mutation input types.
- `web/src/lib/moderation/browser-contract.test.ts` — strict-contract, invariant, and privacy-boundary tests.
- `web/src/lib/moderation/browser-client.ts` — same-origin list and mutation requests with approved error mapping and abort preservation.
- `web/src/lib/moderation/browser-client.test.ts` — URL, method, body, schema, error, network, and abort tests.
- `web/src/components/reports/report-flag-panel.tsx` — member inline flag workflow.
- `web/src/components/reports/report-flag-panel.test.tsx` — member workflow and accessibility tests.
- `web/src/components/reports/report-flagging.module.css` — focused member flag styling.
- `web/src/components/admin/admin-moderation-client.tsx` — workspace heading and the two independent moderation panels.
- `web/src/components/admin/admin-moderation-client.test.tsx` — page composition and heading tests.
- `web/src/components/admin/admin-moderation-flag-queue.tsx` — flag filters, pagination, dismiss/hide confirmations, and reload behaviour.
- `web/src/components/admin/admin-moderation-flag-queue.test.tsx` — flag queue states and mutation tests.
- `web/src/components/admin/admin-moderation-report-list.tsx` — report filters, pagination, hide/restore confirmations, and reload behaviour.
- `web/src/components/admin/admin-moderation-report-list.test.tsx` — report list states and mutation tests.
- `web/src/components/admin/admin-moderation.module.css` — shared responsive moderation workspace styles.
- `web/src/app/admin/moderation/page.tsx` — protected route shell and metadata.
- `web/src/app/admin/moderation/admin-moderation-page.test.tsx` — access-boundary wiring test.
- `docs/superpowers/verification/2026-08-29-report-moderation-frontend.md` — final test, privacy, scope, and browser evidence.

### Modify

- `web/src/components/reports/report-detail-client.tsx` — mount the member flag panel for active non-owners.
- `web/src/components/reports/report-detail-client.test.tsx` — integration visibility and eligibility cases.
- `web/src/components/admin/admin-overview-client.tsx` — add a moderation-workspace link.
- `web/src/components/admin/admin-overview-client.test.tsx` — verify the new administrator link.
- `web/src/components/site-header.tsx` — add administrator moderation navigation.
- `web/src/components/site-header.test.tsx` — role/status navigation matrix.
- `PRODUCT.md` — replace the stale delivered-capability summary with the implemented course workflows.

---

### Task 1: Define strict browser contracts

**Files:**
- Create: `web/src/lib/moderation/browser-contract.ts`
- Create: `web/src/lib/moderation/browser-contract.test.ts`

**Interfaces:**
- Consumes: The response shapes already defined by `web/src/lib/moderation/contracts.ts` and the controlled values from `web/src/models/report-flag.ts`, `web/src/models/report-moderation-event.ts`, and `web/src/models/item-report.ts`.
- Produces: `REPORT_FLAG_REASON_VALUES`, `REPORT_FLAG_STATUS_VALUES`, `DIRECT_HIDE_REASON_VALUES`, `reportFlagReceiptResponseSchema`, `adminReportPageSchema`, `adminReportFlagPageSchema`, `adminReportFlagDecisionResponseSchema`, `adminReportResponseSchema`, `BrowserReportFlag`, `BrowserAdminReport`, `BrowserAdminReportFlag`, `BrowserAdminReportPage`, `BrowserAdminReportFlagPage`, `BrowserAdminFlagQuery`, `BrowserAdminReportQuery`, `SubmitBrowserReportFlagInput`, `BrowserReportFlagDecisionInput`, and `BrowserReportModerationInput`.

- [ ] **Step 1: Write failing contract tests**

```ts
import { describe, expect, it } from "vitest";
import {
  adminReportFlagPageSchema,
  adminReportPageSchema,
  reportFlagReceiptResponseSchema,
} from "./browser-contract";

describe("moderation browser contracts", () => {
  it("accepts a minimal flag receipt and rejects identity-shaped fields", () => {
    const valid = {
      flag: {
        id: "a".repeat(24),
        reportId: "b".repeat(24),
        reason: "privacy_concern",
        status: "pending",
        createdAt: "2026-08-29T01:00:00.000Z",
      },
    };
    expect(reportFlagReceiptResponseSchema.safeParse(valid).success).toBe(true);
    expect(
      reportFlagReceiptResponseSchema.safeParse({
        ...valid,
        flag: { ...valid.flag, submittedByUserId: "c".repeat(24) },
      }).success,
    ).toBe(false);
  });

  it("rejects inconsistent pagination and restricted report fields", () => {
    expect(
      adminReportPageSchema.safeParse({
        reports: [],
        pagination: { page: 1, pageSize: 20, totalItems: 21, totalPages: 1 },
      }).success,
    ).toBe(false);
    expect(
      adminReportFlagPageSchema.safeParse({
        flags: [{ reporterId: "c".repeat(24) }],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the contract test and verify it fails because the module does not exist**

```powershell
cd D:\Massey\CampusLostFound\web
npx vitest run src/lib/moderation/browser-contract.test.ts
```

Expected: FAIL with `Cannot find module './browser-contract'`.

- [ ] **Step 3: Implement the browser-safe contract**

```ts
export const REPORT_FLAG_REASON_VALUES = [
  "inappropriate_content",
  "suspected_fraud",
  "privacy_concern",
  "duplicate_report",
  "other",
] as const;
export const REPORT_FLAG_STATUS_VALUES = [
  "pending",
  "dismissed",
  "actioned",
] as const;
export const DIRECT_HIDE_REASON_VALUES = [
  "inappropriate_content",
  "suspected_fraud",
  "privacy_concern",
  "duplicate_report",
  "administrative_review",
] as const;

const objectId = z.string().regex(/^[a-f\d]{24}$/);
const timestamp = z.string().datetime({ offset: true });
const pagination = z
  .strictObject({
    page: z.number().int().positive().max(10_000),
    pageSize: z.literal(20),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .refine(
    ({ totalItems, totalPages }) =>
      totalPages === Math.ceil(totalItems / 20),
    { message: "Moderation pagination total is inconsistent" },
  );

export const reportFlagReceiptResponseSchema = z.strictObject({
  flag: z.strictObject({
    id: objectId,
    reportId: objectId,
    reason: z.enum(REPORT_FLAG_REASON_VALUES),
    status: z.literal("pending"),
    createdAt: timestamp,
  }),
});
```

Add strict administrator report and flag schemas matching the existing server
contract exactly. Preserve these invariants:

```ts
// resolved report -> non-null resolvedAt
// pending flag -> reviewedAt is null
// dismissed/actioned flag -> reviewedAt is non-null
// reports.length and flags.length <= 20
// page results cannot exceed totalItems
```

Define mutation input types as discriminated unions:

```ts
export type BrowserReportFlagDecisionInput =
  | {
      decision: "dismiss";
      expectedFlagUpdatedAt: string;
      note: string | null;
    }
  | {
      decision: "hide_report";
      expectedFlagUpdatedAt: string;
      expectedReportUpdatedAt: string;
      note: string | null;
    };

export type BrowserReportModerationInput =
  | {
      moderationStatus: "hidden";
      reason: (typeof DIRECT_HIDE_REASON_VALUES)[number];
      expectedUpdatedAt: string;
      note: string | null;
    }
  | {
      moderationStatus: "visible";
      expectedUpdatedAt: string;
      note: string | null;
    };

export type BrowserAdminFlagQuery = {
  status?: (typeof REPORT_FLAG_STATUS_VALUES)[number];
  reason?: (typeof REPORT_FLAG_REASON_VALUES)[number];
  page: number;
};

export type BrowserAdminReportQuery = {
  q?: string;
  reportType?: "lost" | "found";
  reportStatus?: "open" | "claim_pending" | "resolved" | "closed";
  moderationStatus?: "visible" | "hidden";
  page: number;
};
```

- [ ] **Step 4: Add invariant and privacy cases, then run the test**

```powershell
npx vitest run src/lib/moderation/browser-contract.test.ts
```

Expected: PASS; malformed dates, unknown keys, impossible status/timestamp
combinations, inconsistent page totals, oversized arrays, and identity-shaped
fields all fail parsing.

- [ ] **Step 5: Commit the contract**

```powershell
git add web/src/lib/moderation/browser-contract.ts web/src/lib/moderation/browser-contract.test.ts
git commit -m "feat(moderation-ui): define safe browser contracts"
```

---

### Task 2: Add the moderation browser client

**Files:**
- Create: `web/src/lib/moderation/browser-client.ts`
- Create: `web/src/lib/moderation/browser-client.test.ts`

**Interfaces:**
- Consumes: All schemas and mutation input types from Task 1.
- Produces: `BrowserModerationError`, `submitBrowserReportFlag(reportId, input, signal?)`, `listBrowserAdminReportFlags(query, signal?)`, `listBrowserAdminReports(query, signal?)`, `decideBrowserReportFlag(flagId, input, signal?)`, and `moderateBrowserReport(reportId, input, signal?)`.

- [ ] **Step 1: Write failing request and safe-error tests**

```ts
it("lists pending flags with canonical filters", async () => {
  fetchMock.mockResolvedValue(jsonResponse(validFlagPage));
  await listBrowserAdminReportFlags({
    status: "pending",
    reason: "privacy_concern",
    page: 2,
  });
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/admin/report-flags?status=pending&reason=privacy_concern&page=2",
    expect.objectContaining({
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    }),
  );
});

it("sends only the approved flag decision body", async () => {
  fetchMock.mockResolvedValue(jsonResponse(validFlagDecision));
  await decideBrowserReportFlag("a".repeat(24), {
    decision: "dismiss",
    expectedFlagUpdatedAt: "2026-08-29T01:00:00.000Z",
    note: null,
  });
  expect(await requestJson(fetchMock)).toEqual({
    decision: "dismiss",
    expectedFlagUpdatedAt: "2026-08-29T01:00:00.000Z",
    note: null,
  });
});

it("does not trust an unapproved server message", async () => {
  fetchMock.mockResolvedValue(
    jsonResponse(
      { error: { code: "REPORT_MODERATION_FAILED", message: "raw database text" } },
      500,
    ),
  );
  await expect(listBrowserAdminReports({ page: 1 })).rejects.toMatchObject({
    code: "REPORT_MODERATION_FAILED",
    message: "Report moderation is temporarily unavailable",
  });
});
```

- [ ] **Step 2: Run the client test and verify it fails**

```powershell
npx vitest run src/lib/moderation/browser-client.test.ts
```

Expected: FAIL because `browser-client.ts` does not exist.

- [ ] **Step 3: Implement safe fetch, parsing, and error translation**

```ts
const approvedErrors = {
  VALIDATION_ERROR: { status: 400, message: "Moderation request is invalid" },
  AUTHENTICATION_REQUIRED: { status: 401, message: "Authentication required" },
  ACTIVE_ACCOUNT_REQUIRED: { status: 403, message: "An active account is required" },
  ADMINISTRATOR_REQUIRED: { status: 403, message: "Administrator access required" },
  REPORT_FLAG_FORBIDDEN: { status: 403, message: "Report cannot be flagged" },
  REPORT_NOT_FOUND: { status: 404, message: "Report not found" },
  REPORT_FLAG_NOT_FOUND: { status: 404, message: "Report flag not found" },
  REPORT_FLAG_ALREADY_PENDING: { status: 409, message: "A pending flag already exists" },
  REPORT_FLAG_STATE_CONFLICT: { status: 409, message: "Report flag state has changed" },
  REPORT_MODERATION_CONFLICT: { status: 409, message: "Report moderation state has changed" },
  REPORT_MODERATION_FAILED: { status: 500, message: "Report moderation could not be completed" },
} as const;

export class BrowserModerationError extends Error {
  constructor(
    readonly code: keyof typeof approvedErrors,
    readonly status: number,
    readonly fields?: Record<string, string[]>,
  ) {
    super(
      code === "REPORT_MODERATION_FAILED"
        ? "Report moderation is temporarily unavailable"
        : approvedErrors[code].message,
    );
    this.name = "BrowserModerationError";
  }
}
```

Implement `safeFetch`, `readJson`, `responseError`, and `parseResponse` with
the same abort-preserving pattern as `lib/admin/account-browser-client.ts`.
Require the exact approved status/message pair for known errors; otherwise map
to `REPORT_MODERATION_FAILED`.

Implement exact endpoints:

```ts
POST  /api/reports/{reportId}/flags
GET   /api/admin/report-flags?status=&reason=&page=
GET   /api/admin/reports?q=&reportType=&reportStatus=&moderationStatus=&page=
PATCH /api/admin/report-flags/{flagId}
PATCH /api/admin/reports/{reportId}/moderation
```

All calls use `credentials: "same-origin"`, `cache: "no-store"`, an
`Accept: application/json` header, and JSON mutations use
`Content-Type: application/json`.

- [ ] **Step 4: Run all client tests**

```powershell
npx vitest run src/lib/moderation/browser-contract.test.ts src/lib/moderation/browser-client.test.ts
```

Expected: PASS, including malformed JSON, malformed success responses,
status/message mismatch, network failure, and `AbortError` preservation.

- [ ] **Step 5: Commit the browser client**

```powershell
git add web/src/lib/moderation/browser-client.ts web/src/lib/moderation/browser-client.test.ts
git commit -m "feat(moderation-ui): add safe browser client"
```

---

### Task 3: Add the member report-flag panel

**Files:**
- Create: `web/src/components/reports/report-flag-panel.tsx`
- Create: `web/src/components/reports/report-flag-panel.test.tsx`
- Create: `web/src/components/reports/report-flagging.module.css`
- Modify: `web/src/components/reports/report-detail-client.tsx`
- Modify: `web/src/components/reports/report-detail-client.test.tsx`

**Interfaces:**
- Consumes: `submitBrowserReportFlag`, `BrowserModerationError`, and `SubmitBrowserReportFlagInput` from Tasks 1–2; `report.id` and `report.isOwner` from the existing member report contract.
- Produces: `ReportFlagPanel({ reportId }: { reportId: string })` and the report-detail integration.

- [ ] **Step 1: Write failing component tests**

```tsx
it("submits a controlled privacy concern", async () => {
  submitBrowserReportFlagMock.mockResolvedValue(validReceipt);
  render(<ReportFlagPanel reportId={reportId} />);
  await user.click(screen.getByRole("button", { name: "Report this listing" }));
  await user.selectOptions(screen.getByLabelText("Reason"), "privacy_concern");
  await user.type(
    screen.getByLabelText("Additional details (optional)"),
    "The description contains private contact details.",
  );
  await user.click(screen.getByRole("button", { name: "Submit report" }));
  expect(submitBrowserReportFlagMock).toHaveBeenCalledWith(
    reportId,
    {
      reason: "privacy_concern",
      details: "The description contains private contact details.",
    },
    expect.any(AbortSignal),
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Your concern has been sent for administrator review",
  );
});

it("requires details for another concern", async () => {
  render(<ReportFlagPanel reportId={reportId} />);
  await user.click(screen.getByRole("button", { name: "Report this listing" }));
  await user.selectOptions(screen.getByLabelText("Reason"), "other");
  await user.click(screen.getByRole("button", { name: "Submit report" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Add details for another concern",
  );
  expect(submitBrowserReportFlagMock).not.toHaveBeenCalled();
});
```

Add tests for cancel/reset, 500-character enforcement, pending-button lock,
duplicate-pending copy, retry after network failure, 401 redirect, 403 access
refresh, no state update after unmount, and focus on the error heading.

- [ ] **Step 2: Run the panel test and verify it fails**

```powershell
npx vitest run src/components/reports/report-flag-panel.test.tsx
```

Expected: FAIL because `ReportFlagPanel` does not exist.

- [ ] **Step 3: Implement the minimal inline flag workflow**

```tsx
export function ReportFlagPanel({ reportId }: { reportId: string }) {
  const router = useRouter();
  const { refreshSession } = useAuthSession();
  const [phase, setPhase] = useState<
    "closed" | "editing" | "submitting" | "submitted"
  >("closed");
  const [reason, setReason] = useState<ReportFlagReason | "">("");
  const [details, setDetails] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  // Validate reason and the `other` details rule locally.
  // Submit only reason plus normalised details/null.
  // Branch on approved BrowserModerationError codes.
  // Abort on unmount and never show raw error.message.
}
```

Use a native `<select>`, `<textarea maxLength={500}>`, buttons, associated
error text, a visible character count, `aria-live`, and heading focus. Keep
reason labels in one local record:

```ts
const reasonLabels = {
  inappropriate_content: "Inappropriate content",
  suspected_fraud: "Suspected fraud",
  privacy_concern: "Privacy concern",
  duplicate_report: "Duplicate report",
  other: "Other concern",
} as const;
```

- [ ] **Step 4: Integrate only for a non-owner and run focused tests**

Add after the report article and before the owner-only matches panel:

```tsx
{!report.isOwner ? <ReportFlagPanel reportId={report.id} /> : null}
```

Extend the report-detail test to assert the owner never sees the button and a
non-owner does. Then run:

```powershell
npx vitest run src/components/reports/report-flag-panel.test.tsx src/components/reports/report-detail-client.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Add responsive accessible CSS and commit**

```css
.panel {
  box-sizing: border-box;
  width: min(100%, 48rem);
  overflow-wrap: anywhere;
}

.panel button,
.panel select,
.panel textarea {
  min-height: 44px;
  font: inherit;
}

.panel :focus-visible {
  outline: 3px solid var(--campus-green-dark);
  outline-offset: 3px;
}

@media (max-width: 20rem) {
  .actions { grid-template-columns: 1fr; }
}
```

```powershell
git add web/src/components/reports/report-flag-panel.tsx web/src/components/reports/report-flag-panel.test.tsx web/src/components/reports/report-flagging.module.css web/src/components/reports/report-detail-client.tsx web/src/components/reports/report-detail-client.test.tsx
git commit -m "feat(moderation-ui): add protected report flagging"
```

---

### Task 4: Add the protected administrator workspace shell

**Files:**
- Create: `web/src/components/admin/admin-moderation-client.tsx`
- Create: `web/src/components/admin/admin-moderation-client.test.tsx`
- Create: `web/src/components/admin/admin-moderation.module.css`
- Create: `web/src/app/admin/moderation/page.tsx`
- Create: `web/src/app/admin/moderation/admin-moderation-page.test.tsx`
- Modify: `web/src/components/admin/admin-overview-client.tsx`
- Modify: `web/src/components/admin/admin-overview-client.test.tsx`
- Modify: `web/src/components/site-header.tsx`
- Modify: `web/src/components/site-header.test.tsx`

**Interfaces:**
- Consumes: Existing `AdministratorAccessBoundary` and authentication session.
- Produces: `AdminModerationClient`, the `/admin/moderation` page, and discoverable administrator navigation. Tasks 5–6 replace temporary empty panel regions with live components.

- [ ] **Step 1: Write failing page-shell and navigation tests**

```tsx
it("protects the moderation workspace with the administrator boundary", () => {
  render(<AdminModerationPage />);
  expect(administratorBoundaryMock).toHaveBeenCalledWith(
    expect.objectContaining({
      workspaceLabel: "Administrator report moderation workspace",
      forbiddenDescription:
        "Only active administrators can review flagged reports and report visibility.",
    }),
    undefined,
  );
});

it("shows moderation navigation only to an active administrator", () => {
  renderHeader(activeAdministrator);
  expect(
    screen.getByRole("link", { name: "Report moderation" }),
  ).toHaveAttribute("href", "/admin/moderation");
});
```

Add negative cases for student, staff, suspended administrator, deactivated
administrator, unauthenticated, and unavailable sessions.

- [ ] **Step 2: Run the page and navigation tests and verify they fail**

```powershell
npx vitest run src/app/admin/moderation/admin-moderation-page.test.tsx src/components/admin/admin-moderation-client.test.tsx src/components/admin/admin-overview-client.test.tsx src/components/site-header.test.tsx
```

Expected: FAIL because the route and workspace do not exist and links are
missing.

- [ ] **Step 3: Implement the route and semantic workspace shell**

```tsx
export const metadata: Metadata = { title: "Report moderation" };

export default function AdminModerationPage() {
  return (
    <main id="main-content">
      <AdministratorAccessBoundary
        workspaceLabel="Administrator report moderation workspace"
        forbiddenDescription="Only active administrators can review flagged reports and report visibility."
      >
        <AdminModerationClient />
      </AdministratorAccessBoundary>
    </main>
  );
}
```

The client renders one `<h1>Report moderation</h1>`, course-scoped explanatory
copy, and two labelled sections. Use temporary semantic status text instead of
fake data until Tasks 5–6 supply the panels.

- [ ] **Step 4: Add discoverable administrator links and run the tests**

Add `/admin/moderation` to the active-administrator header navigation and a
`Review flagged reports` link in the Reports section of the administrator
overview. Do not show either control to another role or inactive account.

```powershell
npx vitest run src/app/admin/moderation/admin-moderation-page.test.tsx src/components/admin/admin-moderation-client.test.tsx src/components/admin/admin-overview-client.test.tsx src/components/site-header.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Add 320-pixel shell styling and commit**

```css
.workspace {
  display: grid;
  box-sizing: border-box;
  width: min(100% - 2rem, 76rem);
  margin-inline: auto;
  gap: clamp(2rem, 5vw, 4rem);
  overflow-wrap: anywhere;
  padding-block: clamp(2.5rem, 7vw, 5rem);
}

@media (max-width: 20rem) {
  .workspace { width: min(100% - 1rem, 76rem); }
}
```

```powershell
git add web/src/app/admin/moderation web/src/components/admin/admin-moderation-client.tsx web/src/components/admin/admin-moderation-client.test.tsx web/src/components/admin/admin-moderation.module.css web/src/components/admin/admin-overview-client.tsx web/src/components/admin/admin-overview-client.test.tsx web/src/components/site-header.tsx web/src/components/site-header.test.tsx
git commit -m "feat(admin-ui): add moderation workspace shell"
```

---

### Task 5: Implement the administrator flag queue

**Files:**
- Create: `web/src/components/admin/admin-moderation-flag-queue.tsx`
- Create: `web/src/components/admin/admin-moderation-flag-queue.test.tsx`
- Modify: `web/src/components/admin/admin-moderation-client.tsx`
- Modify: `web/src/components/admin/admin-moderation-client.test.tsx`
- Modify: `web/src/components/admin/admin-moderation.module.css`

**Interfaces:**
- Consumes: `listBrowserAdminReportFlags`, `decideBrowserReportFlag`, `BrowserModerationError`, `BrowserAdminReportFlag`, and the existing auth session refresh.
- Produces: `AdminModerationFlagQueue`, independently handling `status`, `reason`, `page`, request cancellation, confirmation, mutation, and reload state.

- [ ] **Step 1: Write failing queue-state tests**

```tsx
it("loads pending flags by default and applies reason filters", async () => {
  listFlagsMock.mockResolvedValue(validFlagPage);
  render(<AdminModerationFlagQueue />);
  expect(await screen.findByText("Privacy concern")).toBeVisible();
  expect(listFlagsMock).toHaveBeenLastCalledWith(
    { status: "pending", page: 1 },
    expect.any(AbortSignal),
  );
  await user.selectOptions(screen.getByLabelText("Flag reason"), "duplicate_report");
  expect(listFlagsMock).toHaveBeenLastCalledWith(
    { status: "pending", reason: "duplicate_report", page: 1 },
    expect.any(AbortSignal),
  );
});

it("dismisses with the exact current flag timestamp", async () => {
  renderReadyQueue();
  await user.click(screen.getByRole("button", { name: "Dismiss concern" }));
  await user.click(screen.getByRole("button", { name: "Confirm dismissal" }));
  expect(decideFlagMock).toHaveBeenCalledWith(
    flagId,
    {
      decision: "dismiss",
      expectedFlagUpdatedAt: flagUpdatedAt,
      note: null,
    },
    expect.any(AbortSignal),
  );
});
```

Add tests for loading, empty, initial error, retry, status/reason/page filters,
late-request suppression, confirmation cancellation, optional note limit,
flag-led hide including both timestamps, disabled pending actions, successful
reload, last-item previous-page fallback, 401 redirect, 403 access refresh,
404 reload, 409 stale alert/reload, generic failure, focus, and unmount abort.

- [ ] **Step 2: Run the queue test and verify it fails**

```powershell
npx vitest run src/components/admin/admin-moderation-flag-queue.test.tsx
```

Expected: FAIL because `AdminModerationFlagQueue` does not exist.

- [ ] **Step 3: Implement cancellable list state and filters**

```tsx
type QueueState =
  | { status: "loading" }
  | { status: "ready"; page: BrowserAdminReportFlagPage }
  | { status: "error" }
  | { status: "accessChanged" };

const [query, setQuery] = useState<BrowserAdminFlagQuery>({
  status: "pending",
  page: 1,
});
const requestId = useRef(0);
const listController = useRef<AbortController | null>(null);

// Increment requestId, abort the previous request, and ignore late results.
// Reset page to 1 when status or reason changes.
```

Render filters as native selects, results as a semantic list, safe report
facts as a definition list, and pagination as Previous/Next buttons with a
polite page announcement.

- [ ] **Step 4: Implement confirmations, mutations, and conflict recovery**

```tsx
type FlagAction =
  | { kind: "dismiss"; flag: BrowserAdminReportFlag }
  | { kind: "hide"; flag: BrowserAdminReportFlag }
  | null;

const input =
  action.kind === "dismiss"
    ? {
        decision: "dismiss" as const,
        expectedFlagUpdatedAt: action.flag.updatedAt,
        note: normaliseOptionalNote(note),
      }
    : {
        decision: "hide_report" as const,
        expectedFlagUpdatedAt: action.flag.updatedAt,
        expectedReportUpdatedAt: action.flag.report.updatedAt,
        note: normaliseOptionalNote(note),
      };
```

Use an inline confirmation section with heading focus. On success, reload the
current page; if a filtered page greater than 1 returns no rows after the
mutation, set the page to `page - 1`. On `REPORT_FLAG_STATE_CONFLICT` or
`REPORT_MODERATION_CONFLICT`, preserve no stale action, announce the change,
and provide `Reload moderation data`.

- [ ] **Step 5: Mount the queue, run tests, and commit**

```powershell
npx vitest run src/components/admin/admin-moderation-flag-queue.test.tsx src/components/admin/admin-moderation-client.test.tsx
```

Expected: PASS.

```powershell
git add web/src/components/admin/admin-moderation-flag-queue.tsx web/src/components/admin/admin-moderation-flag-queue.test.tsx web/src/components/admin/admin-moderation-client.tsx web/src/components/admin/admin-moderation-client.test.tsx web/src/components/admin/admin-moderation.module.css
git commit -m "feat(admin-ui): review report flags"
```

---

### Task 6: Implement administrator report visibility management

**Files:**
- Create: `web/src/components/admin/admin-moderation-report-list.tsx`
- Create: `web/src/components/admin/admin-moderation-report-list.test.tsx`
- Modify: `web/src/components/admin/admin-moderation-client.tsx`
- Modify: `web/src/components/admin/admin-moderation-client.test.tsx`
- Modify: `web/src/components/admin/admin-moderation.module.css`

**Interfaces:**
- Consumes: `listBrowserAdminReports`, `moderateBrowserReport`, `BrowserModerationError`, `BrowserAdminReport`, and the existing auth session refresh.
- Produces: `AdminModerationReportList`, independently handling report search, filters, page state, hide/restore confirmations, conflicts, and reloads.

- [ ] **Step 1: Write failing list and mutation tests**

```tsx
it("searches reports only after form submission", async () => {
  listReportsMock.mockResolvedValue(validReportPage);
  render(<AdminModerationReportList />);
  await screen.findByText("Black laptop charger");
  await user.type(screen.getByLabelText("Search reports"), "charger");
  expect(listReportsMock).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Search" }));
  expect(listReportsMock).toHaveBeenLastCalledWith(
    { q: "charger", page: 1 },
    expect.any(AbortSignal),
  );
});

it("restores a hidden report with its exact timestamp", async () => {
  renderReadyReportList(hiddenReport);
  await user.click(screen.getByRole("button", { name: "Restore report" }));
  await user.click(screen.getByRole("button", { name: "Confirm restoration" }));
  expect(moderateReportMock).toHaveBeenCalledWith(
    reportId,
    {
      moderationStatus: "visible",
      expectedUpdatedAt: reportUpdatedAt,
      note: null,
    },
    expect.any(AbortSignal),
  );
});
```

Add tests for type, recovery, moderation, and page filters; search trimming;
clear filters; loading; empty; retry; late responses; visible report hide
reason requirement; hidden report restore; optional 500-character note;
pending lock; successful reload; page fallback; 401/403/404/409 handling;
generic safe errors; focus; announcements; and unmount abort.

- [ ] **Step 2: Run the report-list test and verify it fails**

```powershell
npx vitest run src/components/admin/admin-moderation-report-list.test.tsx
```

Expected: FAIL because `AdminModerationReportList` does not exist.

- [ ] **Step 3: Implement stable query and responsive report cards**

```tsx
type ReportQuery = {
  q?: string;
  reportType?: "lost" | "found";
  reportStatus?: "open" | "claim_pending" | "resolved" | "closed";
  moderationStatus?: "visible" | "hidden";
  page: number;
};

// `draftSearch` changes while typing; `query.q` changes only on submit.
// Other selects apply immediately and reset page to 1.
// Every list request is abortable and stale-response safe.
```

Each semantic list item displays title, type, recovery status, moderation
status, public description, safe dates, colours/tags, and only privacy-approved
location/photo information already present in the administrator response.
Legacy external photo URLs render as deliberate links, never embedded images.

- [ ] **Step 4: Implement exact hide and restore bodies**

```tsx
const input =
  action.kind === "hide"
    ? {
        moderationStatus: "hidden" as const,
        reason: selectedReason,
        expectedUpdatedAt: action.report.updatedAt,
        note: normaliseOptionalNote(note),
      }
    : {
        moderationStatus: "visible" as const,
        expectedUpdatedAt: action.report.updatedAt,
        note: normaliseOptionalNote(note),
      };
```

The hide confirmation requires one controlled reason. Both flows use an
optional bounded note, heading focus, pending lock, safe code-based errors,
success reload, previous-page fallback, and `Reload moderation data` for
conflicts.

- [ ] **Step 5: Mount the list, run workspace tests, and commit**

```powershell
npx vitest run src/components/admin/admin-moderation-report-list.test.tsx src/components/admin/admin-moderation-flag-queue.test.tsx src/components/admin/admin-moderation-client.test.tsx src/app/admin/moderation/admin-moderation-page.test.tsx
```

Expected: PASS.

```powershell
git add web/src/components/admin/admin-moderation-report-list.tsx web/src/components/admin/admin-moderation-report-list.test.tsx web/src/components/admin/admin-moderation-client.tsx web/src/components/admin/admin-moderation-client.test.tsx web/src/components/admin/admin-moderation.module.css
git commit -m "feat(admin-ui): manage report visibility"
```

---

### Task 7: Align product documentation and run the full verification gate

**Files:**
- Modify: `PRODUCT.md`
- Create: `docs/superpowers/verification/2026-08-29-report-moderation-frontend.md`
- Modify only if a regression is found: directly affected implementation or test files from Tasks 1–6.

**Interfaces:**
- Consumes: The completed member and administrator frontend workflows.
- Produces: Current product documentation and reproducible verification evidence.

- [ ] **Step 1: Replace the stale capability paragraph in `PRODUCT.md`**

Replace the old statement that matching, Claims, notifications,
administration, and AI remain future work with an accurate concise summary:

```markdown
- Delivered workflows include revocable-session authentication, profile
  settings, report submission with uploaded-image preview, privacy-safe report
  browsing and owner history, explainable deterministic matching, ownership
  Claims and handover, in-app notifications, staff report handling, and
  administrator overview, account, reference-data, and report moderation.
- Future work is limited to assessed refinements and deployment/reporting
  evidence; new product subsystems require an explicit course requirement.
```

Also update `Evidence on Hand` so it no longer says the AI feature is absent.

- [ ] **Step 2: Run focused feature and cross-boundary suites**

```powershell
cd D:\Massey\CampusLostFound\web
npx vitest run src/lib/moderation src/components/reports/report-flag-panel.test.tsx src/components/reports/report-detail-client.test.tsx src/components/admin/admin-moderation-client.test.tsx src/components/admin/admin-moderation-flag-queue.test.tsx src/components/admin/admin-moderation-report-list.test.tsx src/app/admin/moderation/admin-moderation-page.test.tsx src/components/admin/admin-overview-client.test.tsx src/components/site-header.test.tsx
```

Expected: PASS with no Atlas access.

- [ ] **Step 3: Run complete repository gates**

```powershell
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm audit
```

Expected: all tests pass, ESLint reports no errors, TypeScript exits 0, Next.js
builds `/admin/moderation`, and npm reports 0 vulnerabilities.

- [ ] **Step 4: Run scope and privacy scans**

```powershell
cd D:\Massey\CampusLostFound
git diff --check develop...HEAD
git diff --name-status develop...HEAD
rg -n "passwordHash|tokenHash|serialNumber|exactLocation|expectedAnswer|submittedByUserId|reviewedByAdministratorId|reporterId" web/src/components/admin/admin-moderation* web/src/components/reports/report-flag-panel* web/src/lib/moderation/browser-*
rg -n "dangerouslySetInnerHTML|window\.open|target=\"_blank\"|error\.message|String\(error\)" web/src/components/admin/admin-moderation* web/src/components/reports/report-flag-panel* web/src/lib/moderation/browser-*
```

Expected: only deliberate negative-test fixtures or strict-schema rejection
assertions may contain restricted field names; no raw error rendering,
dangerous HTML, automatic external navigation, dependency, schema, unrelated
backend, or destructive change exists.

- [ ] **Step 5: Perform bounded browser verification**

Start the app using the local ignored environment file:

```powershell
cd D:\Massey\CampusLostFound\web
npm run dev
```

Verify without persistent moderation mutations:

1. `/reports/aaaaaaaaaaaaaaaaaaaaaaaa` redirects a signed-out session to
   `/login` before any report lookup.
2. `/admin/moderation` redirects a signed-out session to `/login`.
3. Both routes load without browser console errors or failed same-origin
   resources during the safe signed-out check.
4. At 320 CSS pixels, the route shell has no horizontal scrolling and all
   visible controls are at least 44 CSS pixels in both dimensions.
5. No real flag, dismiss, hide, or restore action is submitted.

- [ ] **Step 6: Write verification evidence and commit**

Record exact commands, counts, route output, privacy scan results, browser
limits, absence of real mutations, changed-file scope, and any pre-existing
warnings in:

```text
docs/superpowers/verification/2026-08-29-report-moderation-frontend.md
```

Then commit:

```powershell
git add PRODUCT.md docs/superpowers/verification/2026-08-29-report-moderation-frontend.md
git commit -m "docs: verify report moderation frontend"
```

- [ ] **Step 7: Confirm a clean, reviewable branch**

```powershell
git status --short
git log --oneline develop..HEAD
git diff --stat develop...HEAD
```

Expected: clean worktree, design/plan/feature/verification commits in order,
and changes limited to moderation browser code, member/admin UI integration,
tests, `PRODUCT.md`, and superpowers documentation.
