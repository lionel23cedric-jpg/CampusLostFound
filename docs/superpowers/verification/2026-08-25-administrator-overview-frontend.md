# Administrator overview frontend verification

## Scope

Issue #33 adds an active-administrator-only `/admin` overview that consumes the
existing read-only `GET /api/admin/overview` endpoint. The frontend displays
validated aggregate report, Claim and account counts with explicit loading,
empty, refresh, error and access-change states. It changes no backend metric,
database model, dependency or MongoDB Atlas data.

## Automated verification

| Check | Result |
| --- | --- |
| Focused Issue #33 tests | 6 test files passed; 76 tests passed |
| `npm test` | 76 test files passed; 1378 tests passed |
| `npm run lint` | Passed |
| `npx tsc --noEmit --incremental false` | Passed |
| `npm run build` | Passed; route table contains `○ /admin` |
| `npm audit` | Passed; found 0 vulnerabilities |
| `git diff --check develop...HEAD` | Passed |

The focused gate covers the browser client, administrator access boundary,
overview request lifecycle and presentation, page composition, site-header
navigation and Dashboard navigation. The complete suite was rerun after the
final interface polish.

## Permission and privacy evidence

- An active administrator mounts the protected overview workspace.
- Active student and staff accounts are blocked from the administrator data
  client.
- Suspended and deactivated administrator accounts are blocked.
- An unauthenticated session redirects to `/login` without mounting the data
  client.
- An unavailable session exposes a safe retry path without private content.
- Authentication expiry and administrator-access changes clear stale metrics,
  refresh the session and use the approved redirect or access-changed state.
- The browser client strictly parses the response, rejects unknown fields,
  unsafe counts, invalid dates and inconsistent totals, and preserves only the
  three approved public error contracts.
- Unapproved response bodies, network details and database errors are reduced
  to a generic safe message.
- The overview contains no reporter, claimant, report, Claim, password, token,
  verification-answer or raw database fields.
- `web/.gitignore` ignores `.env.local`, and no real environment file is
  tracked.
- All administrator frontend tests use mocked data and make no MongoDB Atlas
  connection or mutation.
- The Issue #33 diff changes no dependency manifest, model or backend API file.

## Accessibility and responsive evidence

- Metrics use grouped `section` landmarks and semantic `dl`, `dt` and `dd`
  structures with persistent human-readable definitions.
- Loading, retry, refresh failure, empty and permission states have clear text
  and appropriate polite status or alert semantics.
- Retry completion, account changes and permission changes have tested focus
  destinations.
- Buttons and navigation actions provide at least 44-pixel touch targets and
  visible keyboard focus.
- The layout uses fluid widths, wrapping actions and an explicit 320-pixel
  single-column rule.
- Skeleton motion is removed when `prefers-reduced-motion: reduce` is active.
- The React best-practices review found no request waterfall, inline component,
  browser-storage, unnecessary dependency or unsafe rendering issue.
- The Impeccable technical interface audit initially found one low-severity
  side-accent warning. The decorative side border, eyebrow and non-semantic
  section numbers were removed during the bounded polish pass. The final
  detector result was empty (`[]`).

## Browser evidence

The existing application was started locally without entering, displaying or
transmitting a credential. Visiting `http://localhost:3000/admin` in an
unauthenticated session redirected to `http://localhost:3000/login`.

At the default 1280-pixel viewport, the document scroll width was 1265 pixels,
which is within the viewport. At an explicit 320-pixel viewport, the inner,
document and body scroll widths were all exactly 320 pixels. The page contained
meaningful labelled controls, emitted no console warning or error, and showed
no Next.js error overlay. Browser resource evidence contained no request to
`/api/admin/overview` before authentication. The home route also loaded with
content and no console or framework error.
