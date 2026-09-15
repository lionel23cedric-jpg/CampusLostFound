# Submission Readiness Polish Verification

**Date:** 15 September 2026
**Branch:** `fix/auth-visual-chart-polish`

## Verified scope

- Added the existing top-left return-link pattern to Profile, My reports, and administrator reference-data views.
- Removed the nested `main` landmark from the reference-data client while retaining the route's single `main#main-content` landmark.
- Replaced obsolete home-page copy with an accurate statement that authenticated members can browse live reports.
- Converted the pre-existing home hero from PNG to a metadata-free WebP without changing its composition.
- Moved the login route's `createHash` import into the import block.
- Renamed `vitest.config.ts` to `vitest.config.mts`, removing the Vite module-format warning without changing `package.json` module mode.
- Added a dry-run-first setup command for promoting existing active accounts to staff or administrator roles.
- Documented the fresh-database setup sequence and added role provisioning to the requirement/test matrix.

## Automated verification

All commands were run from `web` and exited with code 0 unless otherwise noted.

| Check | Result |
| --- | --- |
| Focused return-navigation tests | 4 files, 44 tests passed |
| Focused authentication route test | 1 file, 20 tests passed; no Vitest module-format warning |
| Focused role provisioning test | 1 file, 18 tests passed |
| Full Vitest suite | 169 files, 2940 tests passed |
| ESLint | Passed with no reported error or warning |
| `npx tsc --noEmit --incremental false` | Passed after correcting the invalid-argument test table's TypeScript inference |
| Matching evaluation | 2 files, 6 tests passed; precision 0.8276, recall 1.0, F1 0.9057, accuracy 0.9167, top-match accuracy 1.0 across 12 cases and 60 comparisons |
| Next.js production build | Passed; 38 static pages generated and all listed dynamic routes compiled |
| `npm audit` | 0 vulnerabilities |

The first TypeScript run correctly reported one test-only callback type mismatch. The invalid-argument cases were retained in a typed loop, the role test passed again, and the complete non-incremental TypeScript check then passed.

## Role-command safety evidence

`scripts/set-account-role.test.ts` uses fake collections and fake sessions only. It proves:

- incomplete, malformed, duplicate, unknown, and unsafe role arguments are rejected;
- email input is normalised and dry-run mode is the default;
- dry-run and same-role requests perform no write and start no transaction;
- only student-to-staff, student-to-administrator, and staff-to-administrator promotions are allowed;
- inactive accounts and administrator demotion are rejected before writes;
- apply mode uses a conditional `updatedAt` update and revokes sessions in the same transaction;
- concurrent updates do not revoke sessions;
- an opened session is ended on both success and failure.

The CLI command was deliberately not run against `.env.local`, so this verification did not change any configured database record.

## Image evidence

| Property | Original PNG | Final WebP |
| --- | ---: | ---: |
| Dimensions | 1536 by 1024 | 1536 by 1024 |
| File size | 2,448,303 bytes | 157,092 bytes |
| EXIF/ICC/XMP | Not used as final evidence | None present |

The final file is about 93.6 percent smaller. Sharp reported WebP format, 1536 by 1024 dimensions, three colour channels, and no EXIF, ICC, or XMP metadata. The superseded PNG was removed only after the WebP passed the component test and loaded through the Next.js image optimiser.

## Browser verification

The latest production build was started at `http://localhost:3000` and checked in the in-app browser.

- The page displayed the revised live-report copy.
- The hero requested `/_next/image?url=%2Fcampus-find-hero.webp...`.
- The desktop hero and text occupied separate columns without overlap.
- Browser developer logs contained zero errors for the checked page.
- At a temporary 390 by 844 viewport, the document reported `innerWidth: 390`, `scrollWidth: 375`, and no horizontal overflow; the hero stacked below the copy without overlap.
- The temporary viewport override was reset after the check.

This is a focused home-page check, not evidence that every authenticated page has completed manual responsive testing.

## Configured-database end-to-end verification (16 September 2026)

A live browser acceptance run completed the main recovery workflow across two
student accounts, a staff account, and an administrator account. The run used
clearly labelled QA data and did not modify account roles, administrator
reference data, or moderation decisions.

- A student submitted the Found report `QA test: black AirPods headphones`
  (`6aa949e12278a6e2d9eb6ebb`) with one WebP image.
- The pre-submit image preview rendered correctly. The success view reported
  one of one images uploaded, and the stored image loaded at 960 by 640 pixels
  on member and staff report views.
- Explainable matching returned three opposite-type reports. The highest result
  was `airpods` at 62/100 with category, location, date, tag, and wording factors.
- An intentionally incorrect Claim (`6aa94ad32278a6e2d9eb6ebe`) against an
  existing demonstration report was assessed as zero of one answers matched and
  rejected with a factual staff note.
- Staff verified the QA Found report and recorded custody at
  `QA storage shelf A-1`.
- A second student submitted the correct ownership answer. Claim
  `6aa94d902278a6e2d9eb6ec2` was assessed as one of one answers matched and
  approved by staff.
- Approval created `Claim approved` and `Recovery handover ready`
  notifications. Marking them read changed the unread badge from two to one to
  zero without an error.
- The notification Claim link supplied a contextual `Back to notifications`
  link, which returned to the notification centre correctly.
- Staff completed the handover. The final Claim status was `Completed`; the
  report was `Resolved`, `Verified`, and `Released`, with the handling view
  becoming read-only.
- The administrator overview reported 10 submitted reports, five Claims, and
  15 accounts. All three doughnut charts displayed totals, legends, and matching
  percentages without overlap in the checked narrow window.
- Administrator category and campus-location panels loaded correctly. The
  moderation queue displayed one pending concern and its safe report actions.
  No reference record or moderation status was changed.
- The checked administrator page produced no browser console errors.

One pre-existing test category named `weqwe` remains in the configured database.
It is a data-cleanliness issue rather than a source-code failure and was not
removed during this read-only administrator check.

## Remaining manual checks

The following items remain accurately marked `Not run` in `docs/test-matrix.md`:

- complete responsive inspection of every role page at 320, 390, 768, and desktop widths;
- keyboard-only and screen-reader-oriented accessibility acceptance;
- a complete authenticated visual review of every contextual image and chart.

Running `db:bootstrap` or `db:set-role -- --apply` remains a separately approved
live-database action. Neither setup command was run during this acceptance test;
the only database changes were the clearly labelled QA report, Claims,
notifications, staff handling states, and handover states recorded above.
