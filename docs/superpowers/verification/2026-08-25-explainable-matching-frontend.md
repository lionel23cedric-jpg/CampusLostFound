# Explainable matching frontend verification

## Scope

Issue #27 exposes the existing deterministic matching API on report detail pages without changing backend scoring or persisting match records.

The panel:

- renders only for the current owner's open report;
- requests matches only after explicit activation;
- validates the complete browser response before rendering it;
- displays each score out of 100 with privacy-safe factor explanations;
- links to the candidate's member-visible report detail page;
- handles loading, empty, unavailable, error, retry, expired-session and stale-request states;
- keeps interactive targets at least 44 pixels high and supports a 320-pixel viewport.

## Automated verification

Run from `web/` on 25 August 2026:

| Check | Result |
| --- | --- |
| `npm test` | 63 files passed; 1,205 tests passed |
| `npm run lint` | Passed |
| `npx tsc --noEmit --incremental false` | Passed |
| `npm run build` | Passed; `/reports/[id]` and `/api/reports/[id]/matches` included |
| `npm audit` | 0 vulnerabilities |
| `git diff --check` | Passed |

Focused verification also passed:

- 42 strict browser-client tests;
- 8 matching-panel interaction tests;
- 28 report-detail tests, including three owner/status visibility cases;
- 36 matching-panel and report-detail tests when run together.

## Privacy and safety

- The match response reuses the strict member-visible report schema, which excludes reporter identity, verification answers and hidden report fields.
- Unknown response properties, duplicate candidates, duplicate factors, invalid factor maxima, inconsistent score totals and mismatched source report IDs are rejected before rendering.
- `.env.local` remains ignored by `web/.gitignore`; no real environment file is tracked.
- Tests mock the browser client and do not create, update or delete MongoDB Atlas data.
- Matching remains a suggestion: the interface explicitly states that a score does not prove ownership.

## UI quality check

The required Impeccable batched detector was run once against the completed panel, stylesheet and report-detail integration. It returned no findings (`[]`). Automated tests additionally verify accessible headings, live status announcements, error alerts, link encoding, 44-pixel controls, focus-visible styling and the 20rem (320-pixel) breakpoint.

No production-data screenshot fixture was introduced because the panel is deliberately restricted to an authenticated owner viewing an open Atlas-backed report.
