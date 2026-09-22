# Campus Find Requirement and Test Matrix

`Automated pass` means the cited tests passed in the recorded local verification.
`Browser success-path pass` means the named workflow was also completed against
the configured database in the local browser on 16 September 2026.
`Not run` means a human must still complete that browser/database check; it is
not presented as passed evidence.

| ID | Requirement | Role | Automated evidence | Manual steps | Expected result | Status |
| --- | --- | --- | --- | --- | --- | --- |
| AUTH-01 | Register and sign in with safe validation | Public/student | `auth-routes.test.ts`, `register-form.test.tsx`, `login-form.test.tsx` | Create an account, sign out, and sign in | Active student session and safe errors | Automated pass |
| AUTH-02 | Revocable cookie session and sign-out | All | `cookie.test.ts`, `token.test.ts`, `service.test.ts`, `site-header.test.tsx` | Sign out and reload a protected page | Session is revoked and protected actions disappear | Automated pass |
| PROF-01 | Manage profile and notification preferences | Student | `profile-routes.test.ts`, `profile-settings-client.test.tsx` | Change preferences and reload | Normalised settings persist | Automated pass |
| REP-01 | Submit Lost report with public/private separation | Student | `report-routes.test.ts`, `service.test.ts`, `report-form.test.tsx` | Create a Lost report | Report appears in My reports; private evidence is not public | Automated pass |
| REP-02 | Submit Found report | Student | `report-routes.test.ts`, `service.test.ts`, `report-submission-client.test.tsx` | Create a Found report | Found report enters the open workflow | Automated + browser success-path pass |
| IMG-01 | Select, preview, retry, and store images | Student | `report-image-picker.test.tsx`, `report-image-upload-route.test.ts`, `image-upload-service.test.ts` | Choose valid and invalid files | Valid previews/uploads work; invalid files show safe errors | Automated + browser success-path pass |
| IMG-02 | Validate signature and remove metadata | Student/privacy | `image-validation.test.ts` | Upload an EXIF-oriented image and download it | Orientation is correct and EXIF is absent | Automated pass |
| BROWSE-01 | Search/filter public reports | Member | `browse-search.test.ts`, `browse-service.test.ts`, `report-browser.test.tsx` | Filter by type, date, category, location, colour, status, and photo | Results and pagination match filters | Automated pass |
| PRIV-01 | Protect private report fields | Member | `public-report.test.ts`, `browser-client.test.ts`, `browse-routes.test.ts` | Inspect a report response in browser developer tools | No private answers, reporter ID, exact private location, or secret token | Automated pass |
| OWNER-01 | View own report history and previews | Student | `owner-history-service.test.ts`, `owner-report-history.test.tsx` | Open My reports and change filters | Only the signed-in owner's history is shown | Automated pass |
| MATCH-01 | Explainable opposite-type ranking | Student | `matching-score.test.ts`, `matching-service.test.ts`, `matching-routes.test.ts` | Select Find possible matches | Up to five results at score 35+, with safe factors | Automated + browser success-path pass |
| MATCH-02 | Independent AI-feature evaluation | Project team | `matching-evaluation-fixture.test.ts`, `matching-evaluation.test.ts` | Run `npm run evaluate:matching` | 12 cases/60 comparisons and committed metrics reproduce | Automated pass |
| MATCH-03 | Local pretrained model and safe fallback | Student | `semantic-score.test.ts`, `local-embedding.test.ts`, `matching-service.test.ts`, `report-matches-panel.test.tsx` | Run `npm run evaluate:matching:ai`, request matches, then simulate model failure | Model uses public wording only; rule gate and fallback remain; method label is visible | Automated and local model evaluation pass; browser not run |
| CLAIM-01 | Submit ownership Claim with questions | Student | `claimant-service.test.ts`, `claim-submission-client.test.tsx`, `claimant-routes.test.ts` | Claim another user's open report | Pending Claim stores protected evidence | Automated + browser success-path pass |
| CLAIM-02 | Track and withdraw own Claim | Student | `claim-list-client.test.tsx`, `claim-detail-client.test.tsx` | Open My claims and withdraw a pending Claim | State and timeline update safely | Automated pass |
| STAFF-01 | Verify reports and record Found-item storage | Staff/admin | `staff-report-routes.test.ts`, `staff-report-detail-client.test.tsx`, `staff-reports/service.test.ts` | Verify a Found report and save storage | Handling state changes with stale-update protection | Automated + browser success-path pass |
| STAFF-02 | Approve/reject Claims and complete handover | Staff/admin | `staff-claim-routes.test.ts`, `staff-service.test.ts`, `staff-claim-detail-client.test.tsx` | Approve one Claim, then complete handover | Other pending Claims close; report becomes recovered | Automated + browser success-path pass |
| NOTE-01 | Create/list/read notifications | Active account | `delivery.test.ts`, `notifications/service.test.ts`, `notification-provider.test.tsx`, `notification-centre.test.tsx` | Open Notifications and mark one read | Card updates and unread count decreases once | Automated + browser success-path pass |
| ADMIN-01 | Overview totals and three doughnut charts | Administrator | `overview-service.test.ts`, `overview-contract.test.ts`, `admin-overview-client.test.tsx`, `overview-donut.test.tsx` | Compare cards, charts, and known sample data | Report/Claim/account totals remain internally consistent | Automated + browser success-path pass |
| ADMIN-02 | Manage account status safely | Administrator | `account-status-service.test.ts`, `admin-account-status-route.test.ts`, `admin-account-management-client.test.tsx` | Suspend and restore a test user | Valid transition is audited; self-target is blocked | Automated pass |
| ADMIN-05 | Configure Staff membership | Administrator | `account-role-service.test.ts`, `admin-account-role-route.test.ts`, `admin-account-management-client.test.tsx` | Promote a registered test student, sign in again, then demote | Role change is audited, sessions are revoked, and administrator promotion is unavailable | Automated pass; browser not run |
| ADMIN-03 | Manage categories and campus locations | Administrator | `category-service.test.ts`, `campus-location-service.test.ts`, management panel tests | Create, edit, deactivate, and restore records | Duplicates/stale writes are rejected; history remains | Automated pass |
| ADMIN-04 | Review flags and moderate reports | Administrator | `flag-service.test.ts`, `admin-service.test.ts`, moderation route/client tests | Submit a member flag, dismiss or hide, then restore | Queue and visibility update with audit event | Automated pass |
| HTTP-01 | Limit JSON request bodies | All APIs | `request-body.test.ts` and grouped route tests | Submit over 16 KiB JSON | HTTP 413 with no body echo | Automated pass |
| RATE-01 | Limit authentication and sensitive writes | All APIs | `rate-limit.test.ts`, `auth-routes.test.ts` | Repeatedly exceed a limit on disposable data | HTTP 429 includes `Retry-After` | Automated pass |
| DB-01 | Idempotent reference bootstrap | Administrator/setup | `bootstrap-reference-data.test.ts` | With approval, run bootstrap twice on a test DB | Second run preserves records and administrator edits | Automated pass |
| DB-02 | Dry-run legacy image audit | Administrator/setup | `audit-legacy-photo-urls.test.ts` | With approval, run dry mode on a backup/test DB | Counts print; no record changes | Automated pass |
| DB-03 | Dry-run-first staff/administrator provisioning | Setup | `set-account-role.test.ts` | Register test accounts, dry-run each role change, then apply with approval | Only safe promotions succeed transactionally and existing sessions are revoked | Automated pass |
| RESP-01 | Responsive layouts at narrow viewport | All | Component/CSS regression suite | Test 320, 390, 768, and desktop widths | No clipped actions, overlap, or horizontal page scroll | Not run |
| A11Y-01 | Keyboard, focus, labels, and live messages | All | Testing Library role/label/user-event assertions | Complete core workflows using keyboard only | Visible focus; logical order; errors/status announced | Not run |
| MANUAL-01 | End-to-end recovery on configured Atlas database | Student/staff/admin | Unit/integration layers mock database boundaries | Perform report→match→Claim→approve→handover across accounts | Final report recovered; Claim completed; notifications visible | Browser success-path pass |
| MANUAL-02 | Browser visual review of every contextual image and chart | All | Asset/component tests | Visit all role entry pages on desktop and mobile | Images load with alt text; charts and legends agree | Not run |

## Automated baseline

The 16 September delivery gate passed 169 test files and 2940 tests. The
22 September supervisor-feedback gate adds Staff membership and local-model
matching: **174 test files / 2973 tests**, lint, TypeScript, and the Next.js
16.3.5 production build all passed. The [Staff verification](superpowers/verification/2026-09-22-client-managed-staff.md)
and [AI verification](superpowers/verification/2026-09-22-local-ai-matching.md)
record what was and was not demonstrated. `npm audit` reports zero known
vulnerabilities. Baseline and real local-model evaluation both use 12 synthetic
cases and 60 comparisons. `MANUAL-01` was completed against the configured
database on 16 September 2026. Live Staff-role changes and a browser AI-label
demonstration have **not** been run against the shared database; wider
responsive, accessibility, and all-page visual checks also remain open.
