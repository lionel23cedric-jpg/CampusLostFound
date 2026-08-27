# Accessible Notification Centre Frontend Verification

- Date: 2026-08-26
- Branch: `feature/issue-37-notification-centre-frontend`
- Issue: #37

## Implemented scope

- Added a strict same-origin browser transport for listing notifications and marking one notification read.
- Added a current-account provider that owns list, pagination, unread count, refresh, and per-item mutation state.
- Added an active-account access boundary for students, staff, and administrators.
- Added the accessible `/notifications` centre with explicit read state, safe actions, retry states, pagination, and Auckland timestamps.
- Added a shared header navigation entry with an accessible unread count capped visually at `99+`.

## Automated verification

| Command | Observed result |
| --- | --- |
| `npm.cmd test -- src/lib/notifications/browser-client.test.ts src/components/notifications/notification-provider.test.tsx src/components/notifications/notification-access-boundary.test.tsx src/components/notifications/notification-centre.test.tsx src/app/notifications/notification-page.test.tsx src/components/site-header.test.tsx` | Exit 0; 6 test files passed; 119 tests passed. |
| `npm.cmd test` | Exit 0; 89 test files passed; 1592 tests passed. |
| `npm.cmd run lint` | Exit 0; ESLint completed without an error. |
| `npm.cmd exec -- tsc --noEmit --incremental false` | Exit 0; TypeScript completed without an error. |
| `npm.cmd run build` | Exit 0; Next.js 16.2.12 compiled successfully, generated 26 static pages, and listed `○ /notifications`. |
| `npm.cmd audit` | Exit 0; found 0 vulnerabilities. |
| `git diff --name-status develop...HEAD` and `git diff --stat develop...HEAD` | Exit 0; 17 Issue #37 design, plan, frontend implementation, and test files; 3551 insertions and 5 deletions before this verification file. |
| `git diff --check develop...HEAD` | Exit 0; no whitespace errors. |
| `git diff develop...HEAD -- web/package.json web/package-lock.json` | Exit 0; no dependency manifest changes. |
| `rg -n "recipientId\|eventKey\|reviewNote\|verificationMatchedCount\|expectedAnswer\|MONGODB_URI\|mongodb\\+srv" web/src/lib/notifications/browser-client.ts web/src/components/notifications web/src/app/notifications web/src/components/site-header.tsx` | Exit 1 with no output; no production private-field or credential match. |
| `git check-ignore web/.env.local` | Exit 0; printed `web/.env.local`. |

## Accessibility and privacy evidence

- `web/src/components/notifications/notification-access-boundary.test.tsx` proves the active student, staff, and administrator matrix, inactive-account blocking, signed-out redirects, expired-session redirects, and remounting after an account change.
- `web/src/components/notifications/notification-centre.test.tsx` proves explicit text read state, live status and error regions, Auckland timestamps, retained-data retry states, 44-pixel targets, and the 320-pixel layout.
- `web/src/components/site-header.test.tsx` proves the accessible unread label, visible `99+` cap, active-account visibility, and compact responsive navigation.
- `web/src/lib/notifications/browser-client.test.ts` proves strict closed schemas, canonical IDs, safe relative claim/report actions, error-code/status matching, and rejection of private or unknown fields.
- `web/src/components/notifications/notification-provider.test.tsx` proves stale-account isolation, delayed-response rejection, request locks, independent mark-read state, and safe 401/403 handling.
- Dependency manifests were unchanged and `web/.env.local` remained ignored.
- All automated browser and session boundaries used mocks. No automated verification command contacted MongoDB Atlas or read a real connection string.

## Deferred scope

- Polling and WebSockets.
- Email, push, or other external delivery channels.
- Possible-match notification delivery.
- Mark-all-read and notification deletion.
- Notification retention controls.
- Free-form user communication.
