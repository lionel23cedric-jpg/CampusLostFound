# Administrator overview backend verification

## Scope

Issue #31 adds one read-only overview endpoint for active administrators at
`GET /api/admin/overview`. It changes no database model, dependency, user
interface or MongoDB Atlas data.

The endpoint authenticates and authorises before validating the request,
rejects every query parameter, disables browser caching and returns only
strictly parsed aggregate counts with a generation timestamp.

## Metric evidence

The service executes exactly three read-only aggregation pipelines:

- Reports: submitted lost and submitted found count non-draft reports in
  `open`, `claim_pending`, `resolved` or `closed`; unresolved counts `open` and
  `claim_pending`; recovered counts `resolved`.
- Matches: matched reports are distinct report IDs referenced by claims in
  `approved` or `completed`, so multiple qualifying claims for one report do
  not inflate the count.
- Claims: pending, approved, rejected, withdrawn and completed are counted
  separately, and the public total is derived from those five validated
  counts.
- Accounts: active, suspended and deactivated are counted separately, and the
  public total is derived from those three validated counts.

Empty collections are normalised to zero. Negative, fractional, infinite,
unsafe, duplicate-row, unknown-field or internally inconsistent aggregation
results fail closed instead of reaching the response.

## Automated verification

Run from `web/` on 25 August 2026:

| Check | Result |
| --- | --- |
| Focused administrator overview tests | 4 files passed; 46 tests passed |
| `npm test` | 72 files passed; 1,330 tests passed |
| `npm run lint` | Passed |
| `npx tsc --noEmit --incremental false` | Passed |
| `npm run build` | Passed; `ƒ /api/admin/overview` included |
| `npm audit` | 0 vulnerabilities |
| `git diff --check develop...HEAD` | Passed |

Focused tests cover strict contracts, derived totals, empty collections,
permission ordering, every non-administrator account state, aggregation
semantics, no-cache behaviour, invalid queries and error redaction.

## Privacy, environment and scope

- Only an active user with the `administrator` role can reach the aggregation
  service; the service repeats the permission check as defence in depth.
- Responses contain aggregate counts and `generatedAt` only. They cannot
  contain account email, user/report/claim IDs, passwords, session tokens,
  private verification answers, review notes or model internals.
- Database, authentication and malformed aggregation failures are reduced to
  approved error codes and messages without raw errors or connection details.
- `.env.local` remains ignored by `web/.gitignore`, and no real environment
  file is tracked.
- Tests use mocked models and in-memory fixtures. They do not connect to,
  create, update or delete MongoDB Atlas data.
- The Issue #31 diff does not change `package.json`, `package-lock.json`, files
  under `web/src/models/`, files under `web/src/components/` or administrator
  UI routes.
