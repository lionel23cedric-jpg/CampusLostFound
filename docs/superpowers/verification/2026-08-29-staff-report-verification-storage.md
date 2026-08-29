# Staff Report Verification and Storage Verification

Verified on 29 August 2026 against branch
`feature/staff-report-verification-storage`.

## Outcome

The implementation completes the course-scoped staff workflow for reviewing
lost and found reports, marking reports as verified, recording where verified
Found items are held, and releasing stored items when an approved ownership
Claim is completed. The workflow reuses the existing report, Claim,
authentication, image, and notification boundaries rather than adding a
separate inventory system.

All automated quality gates pass: 155 test files and 2,835 tests, lint,
TypeScript, production build, dependency audit, privacy scans, and whitespace
checks. A signed-out browser check also confirms that `/staff/reports`
redirects safely to sign-in without exposing report content. Authenticated
browser mutations were not performed because no isolated local staff fixture
was supplied; no Atlas or production data was accessed.

## Course-brief mapping

| Course expectation | Evidence in this change |
| --- | --- |
| Campus staff manage reports and item storage | Active staff and administrators receive a protected handling queue and detail workspace for verification and Found-item custody. |
| Lost and found report management | Lost and Found reports retain their existing lifecycle while private handling state records verification, storage, and release. |
| Claim and recovery handover | Completing an approved Claim releases a currently stored Found item inside the existing transaction. |
| Search and filtering | The queue supports report type, lifecycle, verification, custody, and fixed ten-item pagination with canonical URL state. |
| Privacy and security | Handling fields are excluded by default, APIs require an active staff role, caller authority is ignored, legacy external images are not embedded, and errors are reduced to safe messages. |
| Responsive and accessible interface | Semantic headings/lists/forms, native controls, visible labels, status announcements, focus management, 44-pixel targets, wrapping grids, and 320-pixel rules are covered. |
| Testing and software engineering | Model, serializer, validation, service, route, browser-contract, component, navigation, transaction, regression, build, and audit evidence passes. |

## Implemented workflow

- `ItemReport.staffHandling` is a one-to-one embedded private subdocument with
  `select: false`. Lost reports default to `not_applicable`; Found reports
  default to `not_held`.
- Legacy records without handling state are normalized in application code.
  No migration, collection, index, or external database access was added.
- `GET /api/staff/reports` exposes a fixed-size protected queue. The detail,
  verify, and storage endpoints use strict request/response schemas,
  `Cache-Control: no-store`, and approved error mappings.
- Verification records the authenticated staff actor and timestamp. Storage is
  available only for visible, active, verified Found reports and requires a
  normalized two-to-160-character staff-only location.
- Mutations require the exact current `updatedAt` value. Stale or invalid
  transitions return HTTP 409; the detail UI reloads the latest record,
  replaces stale input, announces the conflict, and focuses the conflict
  heading.
- Claim completion retains the existing transaction and notification flow. It
  conditionally changes a stored Found item to `released` while Lost,
  `not_held`, and legacy reports remain compatible.
- `/staff/reports` provides four native filters, safe cards, internal image
  previews, empty/error/authentication states, and bounded pagination.
- `/staff/reports/[reportId]` provides controlled report details, the permitted
  state-dependent action only, safe retry/redirect/error states, and no manual
  release action.
- The site header and dashboard expose both `Report handling` and
  `Claim reviews` only to active staff and administrators.

## State and permission evidence

| State or boundary | Verified behaviour |
| --- | --- |
| Pending active Lost report | May be verified; custody remains `not_applicable`. |
| Pending active Found report | May be verified; custody remains `not_held`. |
| Verified Found item not held | Staff may record a storage location. |
| Verified Found item stored | Staff may update the storage location using optimistic concurrency. |
| Stored item with approved Claim completion | Changes to `released` in the existing transaction. |
| Resolved or released report | Read-only in the handling detail UI. |
| Hidden, draft, closed, missing, or malformed report | Not exposed through the staff handling workspace. |
| Active staff or administrator | May use the handling APIs and pages. |
| Student, suspended, deactivated, signed-out, or unavailable session | Receives no handling content or mutation authority. |
| Caller-supplied identity or role | Rejected or ignored; authority comes only from the authenticated session. |
| Legacy HTTPS image reference | Never embedded automatically by the handling UI. |

## Privacy and scope evidence

The handling serializer explicitly constructs its output and never spreads a
database record. Queue results omit storage location and actor IDs; detail adds
only the controlled staff fields. Reporter identity, private verification
answers, exact private locations, serial numbers, private notes, Claim evidence,
review notes, password data, and token data are not exposed.

The source scans found:

- no browser `localStorage` or `sessionStorage` use in the feature;
- no `console.log`, `console.debug`, or `console.info` statements;
- no package manifest or lockfile changes;
- only intentional staff-route test assertions referencing private handling
  names outside the model, Claim integration, report creation, and dedicated
  staff-report modules.

Explicitly not added: a general inventory, a second handover workflow, manual
release, chat, scanning, analytics, exports, new notification kinds, external
AI/image services, dependencies, indexes, schemas, or migrations.

## Automated command evidence

All npm commands were run from `web/`.

| Command | Result |
| --- | --- |
| Focused staff-report and neighbouring regression suite | PASS — 22 files, 381 tests |
| Navigation and dashboard suite | PASS — 2 files, 52 tests |
| `npm test` | PASS — 155 files, 2,835 tests |
| `npm run lint` | PASS — no findings |
| `npx tsc --noEmit --incremental false` | PASS — no diagnostics |
| `npm run build` | PASS — Next.js 16.2.12 production build; 37 pages generated; staff report pages and all four staff report APIs included |
| `npm audit` | PASS — 0 vulnerabilities |
| `git diff --check` | PASS — no whitespace errors |
| Dependency diff | PASS — no `package.json` or `package-lock.json` change |
| Persistence/logging and private-boundary scans | PASS — no unexpected production references |

The first sandboxed build attempt could not write `.next/trace-build` and
returned Windows `EPERM`; the same production build passed with project write
permission. The first sandboxed audit could not reach the npm registry; the
same audit passed against the official endpoint.

One existing administrator category test was intermittently asserting its
cards before its initial timer-triggered request completed. Its assertion now
waits for the first card rather than for a static section heading. The test
passed twice in isolation and the complete repository suite then passed; no
administrator production code changed.

## Browser acceptance record

The local application was started with its normal development command and
checked using a temporary browser tab.

- `http://127.0.0.1:3000/staff/reports` safely redirected to
  `http://127.0.0.1:3000/login` after `/api/auth/me` returned 401.
- The page title was `Sign in | Campus Find`, meaningful sign-in content was
  present, and no `Report handling` content was rendered.
- No Next.js error overlay or browser console error was detected.
- At a 320-by-720 viewport there was no horizontal document overflow and the
  header brand/navigation rectangles did not overlap.
- The temporary viewport was reset, the browser tab was closed, and the local
  development server was stopped.

Authenticated queue, detail, verification, storage, conflict, and release
states remain pending manual browser acceptance with isolated local staff and
report fixtures. Their service, route, browser-schema, component, focus,
privacy, and 320-pixel contracts are covered by automated tests. Real coursework
or Atlas data was deliberately not used to manufacture visual evidence.

## Commits reviewed

- `1a44271` design record
- `abdc298` implementation plan
- `2f02169` private handling model and report defaults
- `bde92a6` safe contracts, validation, access, and errors
- `c834116` protected list and detail queries
- `26e6210` verification and storage mutations
- `e63c65f` protected staff report API
- `5a9230c` stored-item release during Claim handover
- `5702afc` strict browser and canonical URL contracts
- `7b7b7cf` shared staff access boundary
- `00cd2c2` handling queue
- `30b644b` report detail, verification, and storage UI
- `335339b` deterministic administrator category loading assertion

The final navigation and verification-record commit is intentionally not given
a self-referential hash in this document.

## Known limitation

Storage is a staff-only location string attached to the existing report, not a
general-purpose inventory. That is intentional: it satisfies staff item
storage and handover tracking in the course brief while avoiding a separate
warehouse, scanning, or asset-management subsystem.
