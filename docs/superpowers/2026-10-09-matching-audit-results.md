# Matching audit results — 9 October 2026

## Finding and repair

The matching service ran local embeddings only after a candidate had already
reached 35 points under the rule scorer. A same-category pair with 25
structured points and semantically equivalent public wording could therefore
return no suggestion. A new regression reproduced that result before the fix:
the service returned `rule_fallback` instead of the expected model-assisted
45-point candidate.

The semantic shortlist now also admits a candidate with at least 15 non-text
points, the minimum from which the model's maximum 20 text points can reach
the unchanged final 35-point threshold. The bounded shortlist, final result
limit, owner/opposite-type/open/visible query filters, public-field mapping
and rule fallback remain unchanged. An unrelated 14-point candidate is neither
embedded nor returned in the regression.

An intermittent test assertion for the Staff Claim error heading was waiting
for the heading to exist, but asserted focus before its React effect was
guaranteed to run. The test now waits for the same focus requirement. No
production Claim behaviour changed.

## Verification

| Check | Result |
| --- | --- |
| Focused matching service, score, API route and panel tests | 57 passed |
| Staff Claim detail test, two consecutive runs | 40 passed on each run |
| Full Vitest suite at final source state | 183 files, 3,050 tests passed |
| `npx tsc --noEmit` | Passed |
| `npx eslint .` | Passed |
| Default `npm run build` | Passed; 41 static pages generated |
| `git diff --check` | Passed before commit |

The existing labelled synthetic matching fixture reported precision
`0.8275862068965517` and recall `1`, unchanged from the recorded baseline.
That fixture exercises the rule scorer and is not an estimate of real-campus
AI duplicate or Lost/Found matching accuracy.

The user did not provide identifiers for the specific Lost/Found reports that
returned no candidate. Their account ownership, report type, open/visibility
state and score could not be checked against live data. If those reports are
owned by the same account or otherwise ineligible, this code change will not
make them match. No production report or account data was modified, and no
authenticated live role flow was claimed as tested.
