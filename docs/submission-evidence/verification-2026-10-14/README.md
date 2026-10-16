# Submission verification, 14 October 2026

This historical record preserves actual results from the Codex-assisted local
submission recheck on Windows, Node.js 24.19.0, Vitest 4.1.11 and Next.js 16.3.8.
Command durations are runtimes, not personal working hours.

Tested commit `59da62a94a1eb60c1199cc865bd0ea18421c1a8b` and release
`58b2ad4b50e902d84d5ab41960f8626a6a7988a7` share source tree
`84e62d5f758b130a29cde4dcae998ca73a372559`. This was an existing installation,
not a clean dependency install. The [16 October reproduction](../verification-2026-10-16/README.md)
records the later clean-install check separately.

| Check | Result | Retained record |
| --- | --- | --- |
| Full suite | 183 files; 3,064 tests passed; zero failures | [Status](checks/tests-status.json), [log](checks/tests.log), [per-file summary](vitest-results-summary.json) |
| TypeScript | Exit 0 | [Status](checks/types-status.json); successful stdout was empty |
| ESLint | Exit 0 | [Status](checks/lint-status.json); successful stdout was empty |
| Production build | Exit 0 | [Status](checks/build-status.json), [log](checks/build.log) |
| Packaged MiniLM | Exit 0 | [Status](checks/ai-status.json), [log](checks/ai.log), [metrics](ai-evaluation.json) |

The synthetic model fixture contains 12 cases/60 comparisons: TP 24, FP 18,
FN 0, TN 18; precision 0.571429, recall 1, F1 0.727273, accuracy 0.7 and
top-match accuracy 1. It does not measure real-campus accuracy or ownership.

The working tree was clean. No deployment, Git push or business-data mutation
was performed by these checks. The build used the existing local environment;
environment values are excluded. This record does not constitute fresh browser
acceptance, accessibility certification or a dependency-security audit.

The published JSON/log copies retain the recorded commands, timestamps, exit
codes and results; local machine paths are omitted. See
[SHA256SUMS.json](SHA256SUMS.json) for this folder's published files. The original
archive remains `Submission_Verification_2026-10-14.zip`, SHA-256
`1d661ddbed1d72e38f1abec51aa9051659e21e4a29626e1953bbe3361c4f2772`.
Its older report citation letter and draft-report hash do not identify the latest
report; this dated page is the current locator for the historical run.
