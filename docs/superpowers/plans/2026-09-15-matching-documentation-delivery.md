# Matching Evaluation, Documentation, and Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Independently evaluate the explainable matcher, remove only proven redundancy, complete course-facing technical evidence, and deliver a verified clean source archive.

**Architecture:** Evaluate the existing deterministic scorer with versioned synthetic labelled data inside Vitest, so no live database or external AI API is needed. Keep documentation as GitHub-renderable Markdown/Mermaid and use Git itself to produce the clean archive after all automated and manual gates pass.

**Tech Stack:** TypeScript, JSON, Vitest, existing matching scorer, Markdown, Mermaid, Git, PowerShell.

## Global Constraints

- Work only under `D:\Massey`.
- Do not invent AI performance results; generate every reported metric from committed labelled fixtures.
- Do not use real member, report, location-detail, verification-answer, or contact data.
- Keep the current local deterministic explainable matcher; do not add a generative-AI API.
- Remove code only after reference search, tests, and a focused diff prove it is unused or duplicated.
- Keep contribution records factual and attributable; do not fabricate hours, authorship, meetings, or individual work.
- Do not merge, push, mutate Atlas, or create the final archive until all verification gates pass and the user confirms the final integration step.

---

## File structure

- Create `web/src/lib/reports/fixtures/matching-evaluation.json`: versioned labelled synthetic pairs.
- Create `web/src/lib/reports/matching-evaluation.ts`: pure classification metrics.
- Create `web/src/lib/reports/matching-evaluation.test.ts`: repeatable evaluation and thresholds.
- Modify `web/package.json`: `evaluate:matching` command.
- Create `docs/ai-matching-evaluation.md`: algorithm, dataset, metrics, limitations.
- Create `docs/erd.md`: Mermaid database model and privacy boundaries.
- Create `docs/architecture.md`: Mermaid client/API/service/database flow.
- Create `docs/user-guide.md`: role-based operation and verification guide.
- Create `docs/test-matrix.md`: automated/manual requirement coverage.
- Update `README.md`, `web/README.md`, `PRODUCT.md`, `TEAM.md`, and existing contribution records only with verified final facts.
- Create final verification and archive-manifest records under `docs/superpowers/verification`.

### Task 1: Create the independent labelled matching dataset

**Files:**
- Create: `web/src/lib/reports/fixtures/matching-evaluation.json`
- Create: `web/src/lib/reports/matching-evaluation-fixture.test.ts`

**Interfaces:**
- Consumes: `ScoringReport` shape from `matching-score.ts`.
- Produces: `MatchingEvaluationCase[]` with one source, candidates, and exact relevant IDs per case.

- [ ] **Step 1: Write the failing fixture-contract test**

Define the test-side schema with Zod and assert:

```ts
const scoringReportSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string(),
  publicDescription: z.string(),
  categoryId: z.string().min(1),
  campusLocationId: z.string().nullable(),
  occurredAt: z.string().datetime().nullable(),
  colors: z.array(z.string()),
  tags: z.array(z.string()),
  createdAt: z.string().datetime(),
});

const evaluationCaseSchema = z.strictObject({
  id: z.string().min(1),
  source: scoringReportSchema,
  candidates: z.array(scoringReportSchema).min(4),
  relevantCandidateIds: z.array(z.string()).min(1),
});
```

Assert the file contains exactly 12 source cases, at least 60 candidate comparisons, unique IDs within each case, opposite-type semantics documented in the case ID (`lost-*` or `found-*`), and every relevant ID exists in candidates.

- [ ] **Step 2: Verify the missing fixture fails**

```powershell
npx vitest run src/lib/reports/matching-evaluation-fixture.test.ts
```

- [ ] **Step 3: Add 12 privacy-safe synthetic scenarios**

Use these exact scenario identities:

```text
lost-black-usbc-charger
found-blue-water-bottle
lost-student-id-card
found-silver-keyring
lost-grey-backpack
found-wireless-earbuds
lost-red-umbrella
found-calculus-textbook
lost-prescription-glasses
found-black-wallet
lost-green-hoodie
found-bicycle-helmet
```

Each case must have at least five candidates: one clear relevant item, one hard relevant variation using a synonym or missing public field, one same-category hard negative, one same-location hard negative, and one unrelated easy negative. Dates must include same-day, 1–3 day, 4–7 day, and over-14-day examples across the dataset. Use only public matching fields.

- [ ] **Step 4: Run fixture validation**

```powershell
npx vitest run src/lib/reports/matching-evaluation-fixture.test.ts
```

Expected: PASS with 12 cases and at least 60 comparisons.

- [ ] **Step 5: Commit**

```powershell
git add -- web/src/lib/reports/fixtures/matching-evaluation.json web/src/lib/reports/matching-evaluation-fixture.test.ts
git commit -m "test(matching): add labelled evaluation dataset"
```

### Task 2: Compute reproducible matching metrics

**Files:**
- Create: `web/src/lib/reports/matching-evaluation.ts`
- Create: `web/src/lib/reports/matching-evaluation.test.ts`
- Modify: `web/package.json`

**Interfaces:**
- Consumes: `scoreReportMatch`, evaluation JSON.
- Produces: `evaluateMatching(cases, threshold)` and a documented `MATCH_THRESHOLD = 35`.

- [ ] **Step 1: Write failing metric arithmetic tests**

Use a small scored fixture independent of the matcher:

```ts
expect(calculateClassificationMetrics({
  truePositive: 8,
  falsePositive: 2,
  falseNegative: 2,
  trueNegative: 8,
})).toEqual({
  precision: 0.8,
  recall: 0.8,
  f1: 0.8,
  accuracy: 0.8,
});
```

Test zero denominators return `0`, not `NaN`. Test top-match accuracy with one correct and one incorrect top candidate equals `0.5`.

- [ ] **Step 2: Verify the missing module fails**

```powershell
npx vitest run src/lib/reports/matching-evaluation.test.ts
```

- [ ] **Step 3: Implement pure metric functions**

Use these exact public types:

```ts
export const MATCH_THRESHOLD = 35;

export type ConfusionMatrix = {
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  trueNegative: number;
};

export type MatchingEvaluation = ConfusionMatrix & {
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  topMatchAccuracy: number;
  cases: number;
  comparisons: number;
};
```

`evaluateMatching` scores every candidate, classifies `score >= 35` as positive, and resolves top-score ties by candidate ID so results are deterministic. Use this safe division helper:

```ts
function divide(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : numerator / denominator;
}
```

- [ ] **Step 4: Evaluate the committed data without inventing thresholds**

The integration test must print a single stable summary and assert only course-appropriate floors supported by the committed data:

```ts
const result = evaluateMatching(cases, MATCH_THRESHOLD);
console.info(JSON.stringify(result, null, 2));
expect(result.comparisons).toBeGreaterThanOrEqual(60);
expect(result.precision).toBeGreaterThanOrEqual(0.7);
expect(result.recall).toBeGreaterThanOrEqual(0.7);
expect(result.f1).toBeGreaterThanOrEqual(0.7);
expect(result.topMatchAccuracy).toBeGreaterThanOrEqual(0.75);
```

If the real result misses a floor, do not alter labels to force a pass. Record the misses and improve the matcher only through a separately reviewed change based on explainable public features.

- [ ] **Step 5: Add the reproducible command**

```json
"evaluate:matching": "vitest run src/lib/reports/matching-evaluation-fixture.test.ts src/lib/reports/matching-evaluation.test.ts --reporter=verbose"
```

- [ ] **Step 6: Run and commit**

```powershell
npm run evaluate:matching
git add -- web/src/lib/reports/matching-evaluation.ts web/src/lib/reports/matching-evaluation.test.ts web/package.json
git commit -m "test(matching): measure independent evaluation metrics"
```

### Task 3: Document the AI feature and generated evidence

**Files:**
- Create: `docs/ai-matching-evaluation.md`
- Modify: `README.md`
- Modify: `PRODUCT.md`

**Interfaces:**
- Consumes: actual output of `npm run evaluate:matching` and `matching-score.ts` weights.
- Produces: course-readable AI method, evidence, ethics, and limitations.

- [ ] **Step 1: Capture actual metric output**

Run:

```powershell
npm run evaluate:matching
```

Copy only the resulting counts and decimal metrics into the document. Do not round more aggressively than three decimal places and do not call the system machine learning if it remains rule-based.

- [ ] **Step 2: Write the evaluation document with exact sections**

Use these headings:

```markdown
# Explainable Item Matching Evaluation
## Purpose and AI-enhanced classification
## Public input data
## Scoring algorithm and weights
## Independent labelled dataset
## Decision threshold
## Results
## Error analysis
## Privacy and ethics
## Limitations
## Reproduction command
```

The scoring table must record category 25, location 15, date 15, colours 15, tags 10, and text cosine similarity 20. Explain that private verification answers, reporter identity, exact private locations, and contact details are excluded.

- [ ] **Step 3: Add actual result and confusion-matrix tables**

Build these two tables directly from the named `MatchingEvaluation` fields so
the document contains generated values rather than template tokens:

```markdown
| Measure | Result |
| --- | ---: |
| Precision | `result.precision` rounded to three decimals |
| Recall | `result.recall` rounded to three decimals |
| F1 score | `result.f1` rounded to three decimals |
| Accuracy | `result.accuracy` rounded to three decimals |
| Top-match accuracy | `result.topMatchAccuracy` rounded to three decimals |

| Actual / predicted | Match | No match |
| --- | ---: | ---: |
| Match | `result.truePositive` | `result.falseNegative` |
| No match | `result.falsePositive` | `result.trueNegative` |
```

Convert the backticked field expressions to their generated numeric values
before staging; none of the `result.` expressions may remain in the final
evaluation document.

- [ ] **Step 4: Update top-level descriptions consistently**

Use the product name `Campus Find` in README and PRODUCT.md so documentation matches the existing UI. Describe the feature as `local, deterministic, explainable matching` and link to `docs/ai-matching-evaluation.md`.

- [ ] **Step 5: Verify and commit**

```powershell
rg -n "0\.xxx|\bTP\b|\bFN\b|\bFP\b|\bTN\b|Campus Noticeboard" docs/ai-matching-evaluation.md README.md PRODUCT.md
npm run evaluate:matching
git add -- docs/ai-matching-evaluation.md README.md PRODUCT.md
git commit -m "docs: explain and evaluate item matching"
```

Expected: the first command finds no placeholder or old product name.

### Task 4: Perform evidence-based redundancy and legacy cleanup

**Files:**
- Inspect: all production files under `web/src` and asset files under `web/public`.
- Modify or delete only paths with proven dead or duplicated content.
- Create: `docs/superpowers/verification/2026-09-15-redundancy-cleanup.md`

**Interfaces:**
- Consumes: completed request-body migration, local illustration integration, legacy-image audit.
- Produces: a narrow cleanup diff with evidence for every deletion.

- [ ] **Step 1: Generate candidate inventories**

Run:

```powershell
rg -n "request\.json\(\)|read[A-Za-z]+RequestBody|isLegacyHttpsPhotoUrl|https?://" web/src web/public
rg -n "useState\(|type .*State|status:" web/src/components web/src/lib
rg --files web/public
git diff --stat develop...HEAD
```

Classify each finding as required current code, temporary compatibility, confirmed duplicate, or confirmed unused.

- [ ] **Step 2: Prove unused exports before deletion**

Run exact reference searches for the known compatibility and duplicate-reader
candidates:

```powershell
rg -n "isLegacyHttpsPhotoUrl" web/src
rg -n "readClaimRequestBody" web/src
rg -n "readNotificationRequestBody" web/src
rg -n "readAccountRequestBody" web/src
rg -n "readReferenceDataRequestBody" web/src
```

For any additional candidate named by the inventory, copy its exact symbol into
a separate `rg -n` command and record that command and result. Delete it only
when the definition is the sole production match and no dynamic route or schema
contract relies on it.

- [ ] **Step 3: Apply the narrow cleanup**

Expected safe removals include the old domain request readers already migrated by the security plan. Keep legacy HTTPS photo reading until the database audit confirms no such values remain. Prevent new writes through the current create/update schema, but do not break existing reports solely to reduce code.

Do not merge distinct domain statuses merely because they use the same English word; Claim, report, flag, account, and notification states have different semantics.

- [ ] **Step 4: Run complete tests after deletions**

```powershell
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

Expected: PASS.

- [ ] **Step 5: Review the cleanup diff and commit**

```powershell
git diff --check
git diff --stat
git add -- docs/superpowers/verification/2026-09-15-redundancy-cleanup.md
```

Stage each proven cleanup path explicitly, inspect `git diff --cached`, then:

```powershell
git commit -m "refactor: remove proven project redundancy"
```

### Task 5: Create the ERD and architecture documentation

**Files:**
- Create: `docs/erd.md`
- Create: `docs/architecture.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: actual Mongoose models, route/service layout, and privacy boundaries.
- Produces: GitHub-renderable Mermaid diagrams and explanations.

- [ ] **Step 1: Inventory actual models and relationships**

```powershell
rg --files web/src/models | Sort-Object
rg -n "new Schema|ObjectId|ref:|collection:" web/src/models
```

Record only models and foreign-key-like ObjectId fields that exist in source.

- [ ] **Step 2: Write `docs/erd.md`**

Use a Mermaid `erDiagram` containing the implemented User, Profile, Session, Category, CampusLocation, ItemReport, PrivateVerificationDetails, ReportImage, Claim, ClaimVerificationAttempt, Notification, ReportFlag, and ReportModerationEvent entities. Show these key relationships:

```text
USER 1--1 PROFILE
USER 1--many SESSION
USER 1--many ITEM_REPORT
CATEGORY 1--many ITEM_REPORT
CAMPUS_LOCATION 1--many ITEM_REPORT
ITEM_REPORT 1--1 PRIVATE_VERIFICATION_DETAILS
ITEM_REPORT 1--many REPORT_IMAGE
ITEM_REPORT 1--many CLAIM
CLAIM 1--many CLAIM_VERIFICATION_ATTEMPT
USER 1--many NOTIFICATION
ITEM_REPORT 1--many REPORT_FLAG
ITEM_REPORT 1--many REPORT_MODERATION_EVENT
```

Below the diagram, explain indexes, case-insensitive uniqueness, timestamps, historical-reference preservation, and the separation of public report data from private ownership evidence.

- [ ] **Step 3: Write `docs/architecture.md`**

Use a Mermaid `flowchart LR` with:

```text
Browser React components -> browser clients -> Next.js route handlers
-> session/role boundary -> Zod validation -> service layer
-> Mongoose models -> MongoDB Atlas
```

Add separate flows for report image sanitisation, notification creation, and explainable matching. Label trust boundaries and state that tests mock the database.

- [ ] **Step 4: Verify diagrams and references**

Check every named model/file exists with `rg --files`, and visually inspect Mermaid syntax on GitHub preview or a Mermaid renderer. Correct syntax errors before commit.

- [ ] **Step 5: Link and commit**

```powershell
git add -- docs/erd.md docs/architecture.md README.md
git commit -m "docs: add ERD and system architecture"
```

### Task 6: Create the role-based user guide and test matrix

**Files:**
- Create: `docs/user-guide.md`
- Create: `docs/test-matrix.md`
- Modify: `web/README.md`

**Interfaces:**
- Consumes: final routes, UI labels, scripts, and tests.
- Produces: reproducible student/staff/admin operation and verification instructions.

- [ ] **Step 1: Write the user guide in executable order**

Use exact sections:

```markdown
# Campus Find User Guide
## Prerequisites
## Environment configuration
## Install and database bootstrap
## Start the development application
## Student workflow
## Staff workflow
## Administrator workflow
## Image upload rules
## Explainable matching demonstration
## Common errors and recovery
## Privacy and security notes
```

Commands must use `Set-Location 'D:\Massey\CampusLostFound\web'`, `npm install`, `npm run db:bootstrap`, and `npm run dev`. Do not include a real URI or real account password.

- [ ] **Step 2: Write the test matrix**

Use columns:

```markdown
| ID | Requirement | Role | Automated evidence | Manual steps | Expected result | Status |
```

Include at least authentication, profile, lost report, found report, image upload/metadata, browse/filter, owner history, matching, Claim, staff review/handover, notifications, admin overview/charts, account status, reference data, moderation, request-size limit, rate limit, bootstrap idempotency, responsive layout, keyboard access, and privacy-response checks.

Status may be `Automated pass`, `Manual pass`, `Blocked`, or `Not run`; never mark a manual check passed before it is performed.

- [ ] **Step 3: Validate command and label accuracy**

```powershell
rg -n "Create account|Find possible matches|Submit Claim|Mark as read|Administrator overview|Review flagged reports|Manage reference data" web/src/components web/src/app
npm run
```

Update document labels to match the actual UI and package scripts.

- [ ] **Step 4: Commit**

```powershell
git add -- docs/user-guide.md docs/test-matrix.md web/README.md
git commit -m "docs: add user guide and test matrix"
```

### Task 7: Reconcile factual project and contribution records

**Files:**
- Modify: `TEAM.md`
- Modify: `project_management/contribution_log.csv`
- Modify: `project_management/decision_log.csv`
- Modify: `README.md`

**Interfaces:**
- Consumes: Git history and user-confirmed team allocation.
- Produces: factual final records without invented work.

- [ ] **Step 1: Extract verifiable history**

```powershell
git shortlog -sne --all
git log --date=short --pretty=format:"%h,%ad,%an,%s" --reverse
```

Use history as evidence, not as proof that one commit equals one person's complete contribution.

- [ ] **Step 2: Reconcile rather than fabricate**

Keep existing confirmed five-person roles. Add only entries supported by Git, existing records, meeting notes, or explicit user confirmation. For unknown dates, hours, reviewers, or presenters, leave the existing value unchanged or mark the record `Not recorded`; do not infer it.

- [ ] **Step 3: Record the approved project-quality decisions**

Add dated decisions for local illustrations, native SVG charts, Sharp metadata stripping, shared 16 KB JSON reading, process-local rate limiting, idempotent bootstrap, dry-run legacy cleanup, and independent synthetic matching evaluation.

- [ ] **Step 4: Review and commit**

```powershell
git diff -- TEAM.md project_management/contribution_log.csv project_management/decision_log.csv README.md
git add -- TEAM.md project_management/contribution_log.csv project_management/decision_log.csv README.md
git commit -m "docs: reconcile project and contribution records"
```

### Task 8: Complete the final verification gate

**Files:**
- Create: `docs/superpowers/verification/2026-09-15-final-project-verification.md`
- Modify: `docs/test-matrix.md` statuses only from observed results.

**Interfaces:**
- Consumes: all previous implementation tasks.
- Produces: final automated and manual evidence before integration.

- [ ] **Step 1: Run the final automated matrix from `web`**

```powershell
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm audit
npm run evaluate:matching
node --check scripts/bootstrap-reference-data.mjs
node --check scripts/audit-legacy-photo-urls.mjs
```

Record exact test file/test counts, versions, audit totals, build result, and matching metrics.

- [ ] **Step 2: Run repository safety checks**

```powershell
git diff --check
git status --short
git ls-files | rg "(^|/)(\.env\.local|node_modules|\.next)(/|$)"
rg -n "mongodb\+srv://[^<]|MONGODB_URI=.*@|password\s*[:=]\s*['\"]" . --glob '!node_modules/**' --glob '!.git/**'
```

Expected: no tracked environment file, build output, dependency directory, obvious credential, or whitespace error.

- [ ] **Step 3: Execute the manual role matrix**

Verify at least one student, staff, and administrator account through registration/login, report submission with preview, stored image display, matching, Claim, notification read, staff decision/handover, overview charts, account management, reference data, and flag moderation. Verify back navigation, 320 px layout, keyboard-only operation, and a rejected 413/429 request.

Use synthetic local test records. Do not include private answers or account credentials in evidence.

- [ ] **Step 4: Update only observed matrix statuses**

Mark rows `Manual pass` only after the corresponding step succeeds. Record remaining limitations explicitly instead of changing acceptance criteria.

- [ ] **Step 5: Commit final evidence**

```powershell
git add -- docs/test-matrix.md docs/superpowers/verification/2026-09-15-final-project-verification.md
git commit -m "test: record final project verification"
```

### Task 9: Integrate and create the clean source archive

**Files:**
- Create outside the repository but under D drive: `D:\Massey\submission\CampusLostFound-clean-source.zip`
- Create: `docs/superpowers/verification/2026-09-15-submission-manifest.md`

**Interfaces:**
- Consumes: verified `feature/project-quality-polish`, current `develop`, and the repository's formal submission branch (`main` unless the user names another branch).
- Produces: merged Git history, tracked-source ZIP, SHA-256 checksum, and manifest.

- [ ] **Step 1: Stop and obtain final integration approval**

Present the final verification summary, exact feature head commit, target `develop` head, target submission branch, and `git status --short`. Do not merge or archive until the user explicitly approves this final state-changing step.

- [ ] **Step 2: Refresh remote state without altering local work**

```powershell
git fetch --prune origin
git status --short
git log --oneline --decorate --graph --max-count=20 --all
```

Expected: worktree clean and branch relationships understood.

- [ ] **Step 3: Integrate through reviewed branches**

Merge or create PRs in this order:

```text
feature/project-quality-polish -> develop
develop -> main
```

Do not force-push. If either target advanced or conflicts, stop, rebase/merge only the feature branch safely, rerun the final automated matrix, and update the verification record.

- [ ] **Step 4: Create the archive from tracked `main` content**

```powershell
New-Item -ItemType Directory -Path 'D:\Massey\submission' -Force
git archive --format=zip --output='D:\Massey\submission\CampusLostFound-clean-source.zip' main
Get-FileHash -Algorithm SHA256 'D:\Massey\submission\CampusLostFound-clean-source.zip'
```

Because `git archive` includes only tracked files, it excludes `.git`, `.env.local`, `node_modules`, `.next`, and local temporary files.

- [ ] **Step 5: Verify archive contents and record the manifest**

```powershell
tar -tf 'D:\Massey\submission\CampusLostFound-clean-source.zip'
```

Confirm required source and documents exist and forbidden paths do not. Record main commit, ZIP path, byte size, SHA-256, included top-level paths, automated results, manual result summary, and known limitations.

- [ ] **Step 6: Commit the manifest and regenerate once**

Commit the manifest to `main` through the same reviewed branch process, then regenerate the archive so its commit and contents agree:

```powershell
git add -- docs/superpowers/verification/2026-09-15-submission-manifest.md
git commit -m "docs: record submission source manifest"
git archive --format=zip --output='D:\Massey\submission\CampusLostFound-clean-source.zip' main
Get-FileHash -Algorithm SHA256 'D:\Massey\submission\CampusLostFound-clean-source.zip'
```

Update the reported checksum after regeneration; do not amend the archive after reporting it.
