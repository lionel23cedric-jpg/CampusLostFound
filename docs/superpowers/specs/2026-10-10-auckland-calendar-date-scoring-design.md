# Auckland calendar-date scoring

## Problem and decision

`scoreReportMatch` currently floors an elapsed-time difference to whole 24-hour
periods. Two reports on different displayed dates can therefore receive the
15-point "same day" factor. The same helper feeds member suggestions, possible
match notifications, and administrator duplicate candidates.

Compare the reports' calendar dates in `Pacific/Auckland`, matching the date
display used by the report UI. Keep the existing point values and thresholds:
same local date = 15; 1–3 local dates apart = 12; 4–7 = 8; 8–14 = 4; more
than 14 = 0. The comparison is symmetric. Null or invalid input contributes no
date factor.

## Implementation boundary

Change only the shared date factor in `web/src/lib/reports/matching-score.ts`.
Convert each timestamp into an Auckland year/month/day using the platform's
`Intl.DateTimeFormat` with `formatToParts`, then compare calendar-day ordinals.
This avoids treating a daylight-saving day as exactly 24 hours. Do not add a
dependency or alter category, location, colour, tag, text, model, shortlist,
or final recommendation thresholds.

No API shape or database migration changes. The existing positive-factor
explanations remain accurate: "same day" now means the same Auckland date;
"within N days" refers to Auckland calendar dates. All callers inherit the
fix through `scoreReportMatch`.

## Checks and evidence

Add regression cases for timestamps less than 24 hours apart but on different
Auckland dates; timestamps on the same Auckland date; 3/4, 7/8, and 14/15
local-day boundaries; invalid or hidden dates; and a daylight-saving boundary.
Run matching and downstream notification/duplicate tests, then the full test
suite, type check, lint, build, and both recorded matching evaluations. Update
evaluation documentation only if measured values change. Keep the live
two-account test evidence separate from synthetic evaluation results.

## Alternatives considered

- Rename the existing factor to "within 24 hours": smallest code change, but
  the score would not correspond to the dates shown to members.
- Compare UTC dates: simple, but Auckland reports near local midnight would
  still receive misleading explanations.

The Auckland calendar-date rule is preferred because it matches what members
see and remains correct across daylight-saving transitions.
