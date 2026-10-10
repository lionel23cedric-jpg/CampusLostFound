# Release-hardening verification — 10 October 2026

## Changes verified

- npm upgraded direct and deduplicated `sharp` from 0.35.4 to 0.35.5, including platform-specific `@img/sharp*` lock entries and libvips from 1.3.3 to 1.3.4.
- NotificationProvider now updates its `stateRef` in a layout effect. Before the change, its existing load-more retry test failed in one of five isolated runs. After the change, the complete 22-test file passed in ten consecutive runs.
- Production matching and the local-AI evaluation use the same semantic-shortlist eligibility helper. The final 35-point threshold and result/shortlist caps are unchanged.
- Current documentation explains the new gate and separately labels historical evaluation values.

## Command results

| Check | Result |
| --- | --- |
| Focused semantic-score, matching-service and notification tests | 47/47 passed |
| Notification-provider file, ten consecutive runs | 22/22 passed every run |
| Full `npm test -- --reporter=dot` | 183 files, 3,051/3,051 tests passed |
| `npx tsc --noEmit` | Passed |
| `npx eslint .` | Passed |
| `npm run build` | Passed, 41 static pages generated (normal Windows permissions required because sandbox path canonicalisation failed) |
| `npm ls sharp --all` | Next.js and direct dependency both use 0.35.5 |
| `npm audit --omit=dev --audit-level=moderate` | 0 vulnerabilities |
| Full `npm audit --audit-level=moderate` | 6 high findings remain in the development-tool dependency tree; no forced downgrade or broad dependency update was attempted |
| `npm run evaluate:matching` | 24 TP, 5 FP, 0 FN, 31 TN; precision 0.828, recall 1.000 |
| `npm run evaluate:matching:ai` | 24 TP, 19 FP, 0 FN, 17 TN; precision 0.558, recall 1.000, top-match accuracy 1.000 |
| Local production HTTP smoke | `/`, `/login`, `/register`, `/reports`, `/dashboard`, `/profile`, `/admin`, `/staff/reports` returned 200; unauthenticated `/api/auth/me`, `/api/admin/overview`, and report matches returned 401 |
| Local database health | 503 because this isolated checkout has no `.env.local` or database connection; not evidence of a production database failure |

The current broad model shortlist increased synthetic false positives. The 12-source/60-pair fixture does not establish real-campus performance; threshold tuning needs a larger independently labelled set. Authenticated browser journeys, responsive layouts and live production deployment were not repeated in this task. No GitHub branches were pushed.
