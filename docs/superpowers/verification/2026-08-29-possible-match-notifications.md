# Possible Match Notifications and Main Application Verification

Date: 2026-08-29
Branch: `feature/possible-match-notifications`

## Change verified

The existing `possibleMatches` profile setting now controls a real in-app
notification. When a new open Lost or Found report reaches the existing match
threshold against an eligible opposite-type report, the owner of the existing
report receives a controlled notification linked to their own report.

The implementation:

- reuses the fixed explainable 100-point score, threshold 35, candidate limit
  500, and result limit 5;
- scores from the recipient's perspective so hidden event dates, campus
  locations, and photos from the new report do not influence or leak through
  the notification;
- excludes hidden, non-open, same-type, and same-owner reports;
- sends at most one notification to a recipient for each new report;
- honours active-account and `possibleMatches` preference checks;
- stores no Match records and exposes no identity, private verification data,
  hidden fields, or factor scores;
- creates the report, private verification record, and notifications in one
  transaction.

## Automated results

| Command | Result |
| --- | --- |
| `npm test -- src/lib/notifications src/lib/reports` | PASS — 29 files, 638 tests |
| `npm test -- src/models/notification.test.ts src/lib/notifications src/lib/reports` | PASS — 30 files, 653 tests |
| `npm test` | PASS — 163 files, 2893 tests |
| `npm run lint` | PASS |
| `npx tsc --noEmit --incremental false` | PASS |
| `npm run build` | PASS — 38 static pages generated; all API and dynamic routes compiled |
| `npm audit --offline --cache .npm-cache` | PASS — 0 vulnerabilities |

The online audit endpoint was unavailable inside the isolated sandbox. The
offline audit used the existing lockfile/cache, and this branch changes no
dependency manifest or lockfile.

## Course-brief main application coverage

| Requirement | Implemented evidence | Status |
| --- | --- | --- |
| Registration, login, roles and revocable sessions | `/register`, `/login`, auth APIs, active/suspended/deactivated account gates | Complete |
| Profiles and preferences | `/profile`, contact method, preferred campus locations, four notification settings | Complete |
| Lost and Found report submission | `/reports/new` with Lost/Found selection, public/private fields and validation | Complete |
| Actual photo upload and preview | protected report-image upload/read APIs, selection preview, retry, privacy-controlled display | Complete |
| Report browsing and detail | `/reports`, `/reports/[id]`, privacy-safe member contract | Complete |
| Search and filtering | keyword, report type, category, date range, campus location, colour, status and photo availability | Complete |
| Student report history and updates | `/reports/mine`, status history, notifications and recovery tracking | Complete |
| Intelligent item matching | deterministic explainable score, top-five owner panel, fixed factors and safe explanations | Complete |
| Possible-match notifications | report-creation event planning, preference gate and notification centre | Complete |
| Claim submission and verification | claim form, private verification questions, claimant history and withdrawal | Complete |
| Staff claim review and handover | decision queue, safe review, approval/rejection, handover readiness and completion | Complete |
| Staff report verification and storage | verification queue, found-item custody/storage/release workflow | Complete |
| Controlled communication | preferred contact method, approved-claim contact details and handover instructions | Complete |
| Notification centre | claim, status, handover, recovery and possible-match events with read/unread state | Complete |
| Administrator dashboard and statistics | `/admin`, lost/found/matched/recovered/unresolved overview metrics | Complete |
| Administrator account management | account search/filter, suspension, deactivation and safe restoration | Complete |
| Administrator system data | category and campus-location create/edit/activate/deactivate with reference protection | Complete |
| Administrator reports and flagged content | report browser, member flagging, moderation queue, hide/restore decisions | Complete |
| Administrator claims | administrator access to the protected staff claim workflow | Complete |
| Required interface coverage | home, auth, dashboard, report form/list/detail/history, claim, staff, admin and profile pages | Complete |
| Security, privacy, accessibility and responsiveness | strict schemas, server-derived roles, private/public data separation, protected media, access boundaries, accessible status/actions and responsive layouts | Complete |

## Completion boundary

Against the supplied course brief, the main functional web application is
complete. Remaining work belongs to delivery and assessment packaging rather
than missing application functionality: final report prose and references,
ERD/architecture presentation, user guide, deployment configuration, video or
live demonstration preparation, and individual contribution evidence.

No manual browser claim is recorded in this document. The evidence above is
from source inspection, focused automated tests, the complete regression suite,
static analysis, production compilation, and dependency audit.
