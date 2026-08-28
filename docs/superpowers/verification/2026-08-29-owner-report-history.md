# Owner Report History Verification

Verified on 29 August 2026 against branch `feature/owner-report-history`.

## Outcome

The implementation closes the course requirement for users to retain and review
their report history. Every active authenticated role can open `/reports/mine`
to view only reports owned by that account, including drafts and reports hidden
from public browsing. The workflow is deliberately read-only and reuses the
existing report detail, authentication, image, and error boundaries.

All automated quality gates pass. Manual multi-account and visual browser
acceptance remains pending because no isolated local MongoDB dataset and test
accounts were supplied; no Atlas or production data was accessed.

## Course-brief mapping

| Course expectation | Evidence in this change |
| --- | --- |
| Accounts and profiles retain report history | An active account receives an authenticated `My reports` page plus header and dashboard entry points. |
| Lost and found report management | The history includes Lost and Found reports in Draft, Open, Claim pending, Resolved, and Closed states. |
| Search and filtering | Two labelled native selects filter by report type and status; canonical URL state and fixed pagination are supported. |
| Privacy and security | Ownership comes only from the authenticated server session; hidden reports remain private; private verification collections are never queried. |
| Responsive and accessible interface | Semantic lists, headings, status/alert regions, native controls, visible text labels, 44-pixel targets, reserved thumbnails, and a bounded 320-pixel layout are covered. |
| Testing and software engineering | 236 focused tests, 2,662 repository tests, lint, TypeScript, production build, dependency audit, privacy scan, and scope checks pass. |

## Implemented workflow

- `GET /api/reports/mine` authenticates before reading query input.
- The endpoint accepts only optional `reportType`, `status`, and canonical
  `page` values. Unknown, repeated, ownership, moderation, sort, projection,
  and page-size inputs are rejected.
- `listOwnReports()` always adds `reporterId: user.id`, intentionally includes
  both moderation states, sorts by newest report and `_id`, and fixes pages at
  ten records.
- `/reports/mine` validates the complete response before display and supports
  loading, empty, filtered-empty, invalid-URL, retry, authentication-expiry,
  inactive-account, stale-request, and pagination states.
- Each history entry shows type, lifecycle state, moderation notice, event and
  submission dates, photo count, and a link to its existing authorised detail
  page.
- Only the first same-origin `/api/report-images/{imageId}` reference can be
  embedded. Legacy HTTPS references are counted but never loaded automatically.

## Access and privacy evidence

| Boundary | Verified behaviour |
| --- | --- |
| Missing, expired, suspended, or deactivated session | No history query; safe authentication or unavailable result. |
| Active student, staff, or administrator | May retrieve only records matching the authenticated account ID. |
| Caller-supplied owner ID | Rejected as an unknown query field. |
| Draft or hidden owner report | Included after server-side ownership proof. |
| Another user's report | Excluded by the mandatory server filter. |
| Private verification, claims, profiles, and moderation events | Not queried or joined. |
| External image URL | Never embedded by the history page. |
| Unexpected database or browser failure | Reduced to an approved generic message. |

The source scan found no references to private verification details,
verification answers, exact private locations, serial numbers, private notes,
review notes, password hashes, token hashes, or external fetches in the new
production history path. The UI does not render `reporterId` or privacy-setting
booleans.

## Automated command evidence

All commands were run from `web/` unless stated otherwise.

| Command | Result |
| --- | --- |
| Focused eight-file history and navigation suite | PASS — 8 files, 236 tests |
| `npm test` | PASS — 143 files, 2,662 tests |
| `npm run lint` | PASS — no findings |
| `npx tsc --noEmit --incremental false` | PASS — no diagnostics |
| `npm run build` | PASS — Next.js 16.2.12 production build; 35 pages generated; `/api/reports/mine` and `/reports/mine` included |
| `npm audit` | PASS — 0 vulnerabilities |
| `git diff --check` | PASS — no whitespace errors |
| Dependency and schema diff | PASS — no package manifest, lockfile, model, or environment-file change |
| `git check-ignore -v web/.env.local` | PASS — `.env.local` remains ignored |

The first sandboxed build attempt could not write `.next/trace-build` and
returned Windows `EPERM`; the same build passed with project write permission.
The first sandboxed audit could not reach the npm registry; the same audit
passed against the official endpoint. These were environment restrictions, not
suppressed product failures.

## Scope review

The change is one owner-history vertical slice: design and plan records, strict
query validation, an owner-bound service, one API route, strict browser and URL
contracts, one page and component, navigation links, tests, and this evidence
record. It changes no database model, index, dependency, lockfile, environment
file, external service, or public browsing contract.

Explicitly deferred:

- report editing, deletion, archive, reopen, close, or resolve actions;
- claim, handover, storage, messaging, export, analytics, chart, or badge work;
- advanced keyword, category, location, colour, date, or photo filters;
- external media loading or new AI functionality;
- a new collection, field, index, package, or migration.

These exclusions keep the work within the course's assessed account, report,
privacy, responsive-interface, and testing requirements without creating a
second report-management subsystem.

## Manual browser acceptance record

Status: **pending isolated local test data**.

- [ ] Verify unfiltered history with Draft, Open, Resolved, Closed, visible,
  and hidden owner reports across two isolated accounts.
- [ ] Verify type/status filters, canonical pagination, clear filters, and
  filtered-empty history.
- [ ] Verify a same-origin thumbnail, external-reference non-embedding, photo
  count, and authorised detail navigation.
- [ ] Verify unauthenticated, inactive, session-unavailable, and expired-session
  behaviour.
- [ ] Inspect keyboard focus, announcements, touch targets, and horizontal
  overflow at 320 CSS pixels.
- [ ] Inspect responses and rendered output for cross-account or private
  verification data.

Automated service, route, schema, component, privacy, and responsive-contract
tests cover these rules; the checklist stays open only for human visual and
multi-account end-to-end confirmation.

## Known limitation

History is intentionally read-only. Users follow the existing authorised
report-detail route for the current report workflow; lifecycle mutation and
storage management require separate course-scoped designs and are not implied
by this feature.
