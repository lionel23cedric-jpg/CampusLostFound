# Release hardening design — 10 October 2026

## Scope and evidence

Three independent findings remain after the `c73c20b` matching release:

1. The lockfile installs `sharp@0.35.4`. GitHub advisory GHSA-wq5f-xc86-pv6w identifies versions below 0.35.5 as affected and 0.35.5 as patched.
2. The notification-provider test that retries a failed “Load more” action failed in one of five isolated runs. The visible state can be ready while `stateRef` is still updated in a passive effect.
3. The local-AI evaluation script admits only candidates with a baseline score of 35 or more. Production now also admits candidates whose non-text factors total at least 15, because semantic text can add 20 points. Current user-facing documentation describes the older gate.

The dependency-doctor manifest check found no surface-level manifest issue; it does not check vulnerabilities. The sandboxed npm registry and audit endpoint are currently unreachable, so the security update requires a successful package-manager fetch before it can be called complete.

## Options considered

- Do nothing and document the discrepancies: smallest diff, but leaves a known vulnerable dependency, flaky test, and misleading evaluation evidence.
- **Targeted repairs (selected):** update `sharp` and lockfile; synchronise the notification state reference before user events; share the semantic eligibility rule between production and evaluation; rerun the evaluation and correct current documentation. This changes only the affected paths.
- Broad dependency refresh and state-management refactor: might eliminate more debt, but has a much larger regression surface and is unnecessary for these findings.

## Behaviour and boundaries

- Keep the existing report-query filters, 500-candidate cap, 30-candidate semantic shortlist, 35-point final threshold, five-result limit, and rule fallback. The AI remains a suggestion, never an ownership or moderation decision.
- The shared semantic-eligibility check admits a report if its rule score is already at least 35, or if its non-text points can reach 35 after a maximum 20-point semantic text factor. The evaluation script uses that same check and classifies only results that still reach the final threshold.
- The notification provider retains account/generation guards, duplicate-click lock, retry cursor, and error state. Only the timing of `stateRef` synchronisation changes. The existing immediate load-more/retry test already detects the race: it failed in one of five pre-fix isolated runs.
- Update only current explanatory docs and the evaluation record. Preserve historical design and verification files as records of the earlier gate; do not rewrite past results as though they were produced by the new implementation.
- No production data writes or GitHub push in this task. A successful local build does not establish authenticated role-flow or real-campus model accuracy.

## Verification

After dependency installation, run the focused notification and matching tests repeatedly, the local-AI evaluation, the full Vitest suite, TypeScript, ESLint, production build, and production-dependency audit. Compare the reported metrics to the previous fixture rather than assuming they are unchanged. The updated evaluation found 19 rather than 5 synthetic false positives, so document the precision cost without tuning a threshold on this tiny fixture. If npm remains inaccessible, mark the dependency update and audit as blocked rather than hand-editing lockfile integrity data.
