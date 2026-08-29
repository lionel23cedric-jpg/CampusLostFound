# Notification, Flagging, and Navigation Verification

## Fixed

- Selecting an unread notification action now uses the existing mark-as-read operation and carries the trusted notification source to the destination.
- Report concern submission now completes under React Strict Mode instead of remaining in the submitting state after the development setup-cleanup-setup cycle.
- Notification-sourced report and Claim details return to Notifications; other details return to My reports, public reports, or My claims according to existing ownership context.
- The administrator overview ready state exposes a visible `Back to dashboard` link with a 44-pixel target and keyboard focus styling.
- Report and Claim routes accept only the exact `/notifications` return source. External or otherwise arbitrary values fall back to their fixed application parent routes.

## Automated evidence

- Focused regression suite: 5 files, 106 tests passed.
- Full test suite: 163 files, 2903 tests passed.
- `npm run lint`: passed.
- `npx tsc --noEmit --incremental false`: passed.
- `npm run build`: passed; all 38 pages generated or compiled, including dynamic report and Claim detail routes.
- `npm audit`: passed with 0 vulnerabilities after the approved network retry.
- Impeccable detector: passed with no findings across the six changed interface targets.

## Implementation note

The trusted return source is parsed in each App Router page and passed to its client component as a boolean. This keeps arbitrary URLs outside the client navigation surface and avoids adding a `useSearchParams` suspense boundary solely for one fixed source marker.

## Resume manual verification from step 12

1. Update local `develop`, keep or restart the development server, and hard-refresh the page.
2. Open an unread notification action. Confirm its badge count decreases after the existing read request succeeds and the destination shows `Back to notifications`.
3. Open a report owned by another account, select `Report this listing`, choose a reason, and submit. Confirm the form reaches the administrator-review success state instead of loading indefinitely.
4. Open the administrator overview and confirm `Back to dashboard` is visible and keyboard accessible.
5. Open an owned report from My reports and confirm its return link is `Back to My reports`; open a public report directly and confirm its return link is `Back to reports`.

No account, notification, report, Claim, flag, or moderation data was modified during automated verification.
