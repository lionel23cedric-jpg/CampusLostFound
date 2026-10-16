# Submission reproduction checks, 16 October 2026

A clean tracked-source export of repair commit
`12c0acff48b88cd5fc4a2a6547c49e6ee64d0006` was checked on Windows with
Node.js 24.19.0. No existing `node_modules`, `.next` directory or environment
file was copied. This commit and merged release
`50fcd91db17318f38f73e95db34f640404106cb2` have the same `web` tree:
`9e84144cc40c9f638024663118f57b323fb843ae`.

## Observed results

| Check | Result | Evidence |
| --- | --- | --- |
| `npm ci` | Exit 0; 481 packages installed from the lockfile | [Status](checks/install-status.json), [log](checks/install.log) |
| `npm test -- --pool=threads --maxWorkers=4` | 183 files and 3,078 tests passed; zero failures | [Status](checks/tests-status.json), [log](checks/tests.log), [per-file summary](verification-summary.json) |
| `npx tsc --noEmit` | Exit 0 | [Status](checks/types-status.json) |
| `npm run lint` | Exit 0 | [Status](checks/lint-status.json) |
| `npm run build` | Webpack production build passed; 41 static pages generated | [Status](checks/build-status.json), [log](checks/build.log) |
| `npm start` | Homepage/login 200; both anonymous AI suggestion POSTs 401 with `no-store` | [Production smoke result](smoke-production.json) |
| `npm run dev` | Same public-page and anonymous API checks passed using the default development path | [Development smoke result](smoke-development.json) |
| `npm run evaluate:matching:ai` | Packaged MiniLM loaded and reproduced the 12-case/60-comparison metrics | [Status](checks/ai-evaluation-status.json), [log](checks/ai-evaluation.log) |
| `npm audit --omit=dev --json` | Zero reported production vulnerabilities on this date | [Audit](checks/audit-production.log) |
| `npm audit --json` | Five high-severity package entries in one development-tool advisory chain; exit 1 | [Audit](checks/audit-all.log) |

The runner invoked the installed Vitest, TypeScript and ESLint entry points
directly under the same Node runtime. The commands above are the corresponding
project entry points. [Status files](verification-summary.json) retain the exact
arguments, timestamps, exit codes and measured runtimes. Local machine paths
are replaced with labels; those labels are not commands to copy literally.

The semantic fixture reproduced TP 24, FP 18, FN 0 and TN 18, precision
0.571429, recall 1, F1 0.727273, accuracy 0.7 and top-match accuracy 1.
Passing software tests does not establish real-campus model accuracy.

## Release and review

PR [#63](https://github.com/lionel23cedric-jpg/CampusLostFound/pull/63)
merged into `main` as `50fcd91` on 16 October. The coordinator reported that
he and Tianyu Li reviewed the repair, then explicitly authorised the merge and
resulting Vercel production deployment. This records that supplied confirmation,
not a GitHub review submitted through Tianyu's account. Deployment status is
retained separately in [release-status.json](release-status.json).

## Limits

No live database credentials were used and no business records were changed.
Fresh Atlas bootstrap, initial-role promotion and signed-in recovery were not
repeated in this installation check; their scripts/tests and historical manual
evidence remain separate. The README explains how an authorised reviewer can
set up their own database and accounts.

The default development path worked here. The earlier optional Turbopack
production-build worker failure remains documented; `npm run build` uses the
verified Webpack path. The remaining `braces` advisory affects the development
lint chain and has no compatible patched upstream release at this check.
No forced major dependency downgrade was applied.

Codex assisted with these checks and the repository repairs. Explanatory text
was edited with the humanizer skill. See [the audit](../../verification/2026-10-16-repository-audit.md)
for the repair scope and [SHA256SUMS.json](SHA256SUMS.json) for published file hashes.
