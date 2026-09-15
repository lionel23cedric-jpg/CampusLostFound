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

## Remaining manual checks

The following items remain accurately marked `Not run` in `docs/test-matrix.md`:

- complete responsive inspection of every role page at 320, 390, 768, and desktop widths;
- keyboard-only and screen-reader-oriented accessibility acceptance;
- a live report-to-match-to-Claim-to-handover flow across student, staff, and administrator accounts;
- a complete authenticated visual review of every contextual image and chart.

Running `db:bootstrap` or `db:set-role -- --apply` also remains a separately approved live-database action. No manual result or database mutation is claimed by this record.
