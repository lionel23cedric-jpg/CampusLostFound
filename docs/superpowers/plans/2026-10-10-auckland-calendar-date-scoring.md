# Auckland Calendar-Date Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Score report dates by Pacific/Auckland calendar dates so different displayed days cannot receive the 15-point "same day" factor.

**Architecture:** Keep the existing scoreReportMatch interface and all weights. Replace only its private date calculation with Auckland date-part extraction and calendar-day ordinals; the matching service, match notifications, and duplicate scan already share this function.

**Tech Stack:** TypeScript, built-in Intl.DateTimeFormat, Vitest, Next.js 16.

## Global Constraints

- Preserve point buckets: same local date 15; 1–3 days 12; 4–7 days 8; 8–14 days 4; later 0.
- Null or invalid timestamps contribute no date factor.
- No new dependency, model change, API change, database migration, or threshold change.
- Keep work on branch fix/matching-audit-2026-10-09; do not push.

---

### Task 1: Correct the shared date factor

**Files:**
- Modify: web/src/lib/reports/matching-score.test.ts
- Modify: web/src/lib/reports/matching-score.ts:137-157
- Review after tests: docs/ai-matching-evaluation.md and docs/ai-feature-suite.md

**Interfaces:**
- Consumes: scoreReportMatch(source: ScoringReport, candidate: ScoringReport)
- Produces: the same MatchScore shape, with a date factor based on Auckland calendar dates

- [ ] **Step 1: Add failing regressions in matching-score.test.ts**

Add three table cases using the existing source/candidate helpers, asserting the date factor points and explanation:

~~~typescript
it.each([
  ["2026-10-01T10:30:00.000Z", "2026-10-01T11:30:00.000Z", 12, "Dates are within 3 days"],
  ["2026-10-01T11:30:00.000Z", "2026-10-02T10:30:00.000Z", 15, "Reports occurred on the same day"],
  ["2026-09-26T13:30:00.000Z", "2026-09-26T14:30:00.000Z", 15, "Reports occurred on the same day"],
] as const)(
  "uses Auckland calendar dates for %s and %s",
  (left, right, points, explanation) => {
    const result = scoreReportMatch(
      candidate({ occurredAt: left }),
      candidate({ occurredAt: right }),
    );
    expect(factorPoints(result, "date")).toBe(points);
    expect(result.factors.find((factor) => factor.key === "date")?.explanation).toBe(explanation);
  },
);
~~~

Also assert invalid input produces no date factor, alongside the existing null/hidden case. The existing date-bucket table covers 3/4, 7/8, and 14/15 calendar-day boundaries because its source and candidates share a local time of day.

- [ ] **Step 2: Verify the new tests fail before the fix**

Run: npx vitest run src/lib/reports/matching-score.test.ts --reporter=verbose
Expected: at least the cross-midnight and same-local-day cases fail under elapsed-time flooring.

- [ ] **Step 3: Implement the smallest shared fix**

In matching-score.ts, create one module-level formatter with timeZone set to "Pacific/Auckland" and numeric year, month, day. Add a local helper that parses a timestamp, returns null for invalid input, reads year/month/day via formatToParts, and returns the UTC ordinal of those parts divided by DAY_MS. In dateScore, compare the absolute difference between the two ordinals with the existing 0, 3, 7, 14 buckets. Do not change scoreReportMatch or its callers.

~~~typescript
const aucklandDate = new Intl.DateTimeFormat("en-NZ", {
  timeZone: "Pacific/Auckland",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function localDayOrdinal(value: string): number | null {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const parts = aucklandDate.formatToParts(new Date(timestamp));
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  if (![year, month, day].every(Number.isFinite)) return null;
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}
~~~

- [ ] **Step 4: Verify the focused and downstream checks**

Run: npx vitest run src/lib/reports/matching-score.test.ts src/lib/reports/matching-service.test.ts src/lib/reports/match-notifications.test.ts src/lib/ai/duplicate-detection.test.ts --reporter=dot
Expected: all pass.

- [ ] **Step 5: Verify release checks and evaluation evidence**

Run from web: npm test -- --reporter=dot, npx tsc --noEmit, npm run lint, npm run build, npm run evaluate:matching, and npm run evaluate:matching:ai. If sandbox EPERM blocks Vitest temporary-file rename or Windows path canonicalisation, rerun that command with approved normal filesystem permissions; do not count the sandbox failure as a test failure.

Compare the measured evaluation output to the two current documents above. Edit only numerical or date-rule statements contradicted by the measurements. Do not imply that synthetic precision is real-campus accuracy.

- [ ] **Step 6: Review the diff and commit**

Run git diff --check and git status --short; commit only the scoring change, its regression tests, and any required evaluation-document corrections with message "fix(matching): score Auckland calendar dates". Leave the branch unpushed.
