# Release hardening implementation plan

**Goal:** Resolve the three confirmed release findings without broad refactoring or remote deployment.

**Architecture:** A patched image dependency; a notification state reference that is current before user interaction; one shared semantic admission rule used by production and synthetic evaluation.

**Stack:** Next.js 16, React 19, TypeScript, Vitest 4, local MiniLM/ONNX, npm.

## Task 1 — Security dependency

- [x] Confirm the installed and locked `sharp` versions and the upstream patched version.
- [x] Upgrade direct `sharp` to 0.35.5 through npm, allowing npm to regenerate package-lock data. Do not hand-edit integrity hashes.
- [x] Verify `npm ls sharp`, production audit, and the production build. Record the six remaining development-tool audit findings separately.

## Task 2 — Notification retry race

- [x] Preserve the observed pre-fix evidence: one failure in five isolated runs at the load-more retry assertion.
- [x] Retain the existing immediate load-more regression and make the smallest production timing fix in `notification-provider.tsx`.
- [x] Run the notification-provider file ten times and check account-switch, refresh, and mark-read tests remain green.

## Task 3 — Matching evaluation parity

- [x] Add boundary tests for the shared eligibility helper: rule-qualified, 15 non-text points, and 14 non-text points.
- [x] Use the helper in `matching-service.ts` and `scripts/evaluate-local-ai.mjs`; keep the post-model 35-point threshold and shortlist bound.
- [x] Rerun the synthetic AI evaluation. Update `docs/ai-feature-suite.md`, `docs/ai-matching-evaluation.md`, `docs/user-guide.md`, and `web/README.md` with the actual current rule and measured results. Keep historical records unchanged.

## Task 4 — Release checks

- [x] Run full Vitest, type check, ESLint, production build, `git diff --check`, and inspect file scope.
- [x] Report exact pass/fail counts, remaining security findings and unverified live role flows. Do not push develop/main without separate authorisation.
