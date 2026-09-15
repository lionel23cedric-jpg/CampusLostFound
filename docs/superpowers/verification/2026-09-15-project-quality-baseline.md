# Project Quality Baseline

**Recorded:** 15 September 2026  
**Feature worktree:** `D:\Massey\CampusLostFound-project-quality-polish`  
**Branch:** `feature/project-quality-polish`  
**Starting commit:** `72a9ad5264a45176a1c623a1b87b91d99e8fbb7e`

## Worktree safety

The feature worktree was created from the committed source with:

```powershell
git worktree add -b feature/project-quality-polish `
  'D:\Massey\CampusLostFound-project-quality-polish' HEAD
```

The original `D:\Massey\CampusLostFound` worktree remains on
`docs/team-division-bilingual-manuals` with its pre-existing uncommitted files
untouched. No file was copied from, cleaned in, or restored in that worktree.

## Automated baseline

Commands were run from the feature worktree's `web` directory after `npm ci`.

| Check | Result |
| --- | --- |
| `npm test` | PASS — 164 test files, 2,906 tests |
| `npm run lint` | PASS |
| `npx tsc --noEmit --incremental false` | PASS |
| `npm run build` | PASS — 38 static pages generated; all listed dynamic routes compiled |
| `npm audit --json` | FAIL — 5 vulnerabilities: 1 critical, 2 high, 2 moderate |

The first sandboxed build attempt could not create the D-drive `.next`
directory (`EPERM`). The same command succeeded unchanged with the required
D-drive write permission. This was an execution-environment restriction, not a
project build defect.

## Audited dependency findings

| Dependency | Installed/range | Severity | Remediation reported by npm |
| --- | --- | --- | --- |
| Next.js | 16.2.12 | Critical | 16.3.5 |
| Sharp | below 0.35.4 | High | at least 0.35.4 through the compatible Next.js update |
| js-yaml | below 4.3.2 | High | at least 4.3.2 |
| Vitest / @vitest/mocker | 4.1.10 | Moderate | at least 4.1.11 |

## Non-blocking baseline warning

Vitest reported that `vitest.config.ts` uses ESM syntax while being loaded as
CommonJS. The suite still passed. The dependency-update task must re-check this
warning after Vitest is upgraded and may rename the configuration to
`vitest.config.mts` only if that removes the warning without changing test
behaviour.
