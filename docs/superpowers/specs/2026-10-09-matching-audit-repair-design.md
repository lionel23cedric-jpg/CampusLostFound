# Matching and release audit repair design

## Scope and evidence

This release audit covers reproducible functional errors, the reported empty
Possible matches result, and the checks needed before synchronising GitHub.
It does not claim that every latent defect in the application has been found.

The checked-out base is `9eecce1` on a clean `develop` worktree. At the start
of the audit, GitHub `develop` and `main` both pointed to `9f3c509`. TypeScript,
ESLint, and the production build passed. One focus assertion failed in the
full 3,050-test run and passed when its file was rerun alone.

## Matching diagnosis and intended behaviour

The owner of an open Lost or Found report can request suggestions from open,
visible reports of the opposite type published by other accounts. These
eligibility and privacy conditions remain unchanged. An empty success response
can mean that no report is eligible, or that eligible reports scored below the
current 35-point threshold. The current service only runs local model inference
after a candidate has already scored 35 points under the rule scorer, so
semantic similarity cannot rescue a report blocked by lexical text scoring.

Diagnosis first checks the actual source and counterpart reports against the
eligibility conditions. If the pair is ineligible, the remedy is correct demo
data or a clearer user explanation, not weaker access or status checks. If an
eligible pair is excluded only by the pre-model rule gate, the model shortlist
will admit candidates with at least 15 non-text points. This is the minimum
structured score from which the model's maximum 20 text points can reach the
unchanged final threshold of 35. The shortlist remains bounded at 30 and
ranked deterministically. A failed model keeps the original rule-based result
and is labelled as a fallback. The final response remains limited to five
public, explainable suggestions. No suggestion proves ownership or approves a
Claim.

## Other repairs and verification

The intermittent Claim focus test will be rerun under the full suite. If the
only failure is an assertion that races a React effect, the test will wait for
focus rather than weakening the accessibility behaviour. Production code will
change only if the focus itself is reproducibly wrong.

The matching regression tests will cover an otherwise eligible low-lexical
pair that crosses 35 only after semantic scoring, an unrelated pair that stays
below the threshold, a model failure fallback, and the existing privacy and
ownership filters. The labelled synthetic evaluation will be rerun and its
precision and recall compared with the recorded baseline. Full tests,
TypeScript, ESLint, the production build, and relevant route/role tests must
pass before any push. Live authenticated role flows will be checked only where
a safe test session is available; no production report or account will be
changed solely for the audit.

## GitHub synchronisation

After verification, commit the scoped fixes. Fast-forward GitHub `develop`
first, then `main`, only if their branch tips are still the expected ancestors.
Never force-push. If another contributor advances either branch, stop and
reconcile the new work before pushing. Updating `main` may trigger the Vercel
production deployment; confirm the deployed commit and basic public route
afterward.
