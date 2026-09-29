# Final Production Acceptance Report

## Acceptance target

- Production application: https://campus-lost-found-flame.vercel.app/
- Acceptance date: 29 September 2026 (Pacific/Auckland)
- Accepted application commit: `8147748`
- Branches: `develop` and `main`
- Runtime: Vercel-hosted Next.js 16 application with MongoDB persistence

This report records the final production checks and the subsequent reversible
demonstration-data cleanup. The run did not approve or reject Claims, change an
account role, delete a report, submit a duplicate flag, create reference data,
or save a test report. The only uploaded image was analysed in memory by the
category assistant and was not persisted.

## Overall result

**PASS.** The Student, Staff, and Administrator experiences load with distinct
navigation and responsibilities. The five AI-related functions required by the
project brief produce visibly labelled model-assisted results in production.
The full automated suite, static checks, production build, dependency audit, and
matching evaluation also pass.

## Requested interface and role changes

| Requirement | Production evidence | Result |
| --- | --- | --- |
| More useful and visually varied home page | Public landing page presents the recovery journey, illustrations, calls to action, and live-role navigation rather than text-only placeholder cards. | PASS |
| Student experience remains member-focused | Student navigation exposes Browse, My reports, Claims, Notifications, Dashboard, and Profile. Report creation, report history, Smart Search, matching, and Claim entry points load. | PASS |
| Staff has a distinct operational home page | `/dashboard` displays **Recovery Operations Desk**, a Staff account summary, Report handling, Claim reviews, and recovery notifications. Student and Administrator controls are absent. | PASS |
| Administrator has a distinct high-level workspace | `/admin` displays **Campus Find Operations**, Administrator-only navigation, operational artwork, current totals, three percentage charts, and direct links to the Administrator's responsibilities. Student recovery cards are absent. | PASS |
| Registration guidance | Registration fields include concise length/format guidance and validation feedback. | PASS |
| Images support the interface without covering copy | The final responsive illustrations render in dedicated figure regions. The production role pages and forms showed no image/text overlap during acceptance. | PASS |
| Consistent in-page return navigation | Detail and management pages expose labelled **Back to ...** links at the top of the main workspace. | PASS |

## Role-specific production checks

### Student

- The Student dashboard and member navigation loaded.
- Report creation loaded its public fields, private verification fields, image
  selection, AI description/tag assistant, and image-category assistant.
- Smart Search returned a visibly labelled AI-assisted result.
- An owned open report returned three possible matches with AI-assisted text
  comparison.
- A Student request to an Administrator-only route was rejected without exposing
  Administrator data.

Result: **PASS**.

### Staff

- `/dashboard` displayed **Recovery Operations Desk**, Role `Staff`, Status
  `Active`, and only operational navigation.
- `/staff/reports` loaded the Report handling queue, filters, verification state,
  custody state, and report-detail links.
- `/staff/claims` loaded the Claim review queue and explicitly stated that Claim
  evidence is restricted to authorised Staff and Administrators.
- No Student report-submission actions or Administrator account/reference-data
  controls appeared in the Staff navigation.

Result: **PASS**.

### Administrator

- `/admin` loaded Report, Claim, and Account totals with accessible percentage
  charts. The observed production values were:
  - Reports: Lost 8 (42%), Found 11 (58%).
  - Claims: Pending 1 (9%), Approved 0, Rejected 4 (36%), Withdrawn 0,
    Completed 6 (55%).
  - Accounts: Active 19 (95%), Suspended 1 (5%), Deactivated 0.
- **Refresh overview** completed without an error.
- `/admin/accounts` loaded search, role/status filters, and controls to add or
  remove Staff access, suspend, or deactivate an account. The acceptance run
  deliberately did not mutate a real account.
- `/admin/reference-data` loaded Category and Campus location creation, search,
  edit, activation, and pagination controls. Both tabs loaded successfully.
- `/admin/moderation` loaded the pending flag queue, safe report links, visibility
  controls, report filters, and the AI duplicate scan.

Result: **PASS**.

## Five AI-related functions

| Function | Production action and visible evidence | Result |
| --- | --- | --- |
| Intelligent Lost/Found matching | On an owned open report, **Find possible matches** returned three candidates and displayed **AI-assisted text comparison**. | PASS |
| Natural-language Smart Search | A public-item query on Browse returned ranked results labelled **AI-assisted search**. | PASS |
| Description and tag assistant | The report form returned a proposed public description/tags labelled **AI-assisted suggestion**; it remained unapplied until the user chose **Apply suggestion**. | PASS |
| Image-assisted categorisation | **Suggest category from first photo** returned three confidence-ranked options labelled **AI-assisted category suggestions**. The image was processed in memory and not saved. | PASS |
| Duplicate report detection | Administrator **Scan for possible duplicates** returned two same-type backpack reports at 100% similarity, labelled **AI-assisted**, with structured explanations. **Send to moderation queue** was not pressed. | PASS |

The system uses locally packaged, pinned ONNX models rather than OpenAI, Gemini,
or another paid inference API. `Xenova/all-MiniLM-L6-v2` supports semantic text
work and `Xenova/mobileclip_s0` supports zero-shot image classification. ONNX
Runtime WebAssembly avoids unsupported native bindings on Vercel. Deterministic
fallbacks remain available and are clearly labelled; they do not silently claim
to be AI results.

## Verification evidence

Run from `web`:

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
npm audit --omit=dev --json
npm run evaluate:matching
npm run evaluate:matching:ai
```

Recorded results:

- 182 test files passed.
- 3,045 tests passed.
- TypeScript passed with no emitted files.
- ESLint passed.
- Next.js production build passed, including `/api/ai/image-category`.
- Production dependency audit reported 0 vulnerabilities.
- The production trace contains the packaged MobileCLIP models, Sharp, and ONNX
  WebAssembly assets, and does not contain `onnxruntime-node`.
- Matching evaluation: precision 0.828, recall 1.000, F1 0.906, accuracy 0.917,
  top-match accuracy 1.000 over 60 labelled comparisons.

## Privacy and safety checks

- AI text features use public report wording and bounded structured fields, not
  ownership answers, passwords, session tokens, private notes, or contact data.
- Image analysis accepts one bounded JPEG, PNG, or WebP image, processes it in
  memory, responds with `no-store`, and does not create a report/image record.
- Matching and duplicate scores are recommendations, not proof of ownership.
- Duplicate scanning is read-only. A separate Administrator action is required
  before a normal moderation flag is created.
- Role-restricted routes enforce an active Student, Staff, or Administrator
  session on the server; hiding a navigation link is not the security boundary.

## Demonstration-data cleanup

After the project owner explicitly authorised the cleanup, the Administrator
interface was used to:

- deactivate the placeholder Category `weqwe`, preserving every historical
  report reference;
- hide nine reports whose title or description was unambiguously numeric,
  placeholder text, or explicitly labelled as a QA test;
- record `Administrative review` and an internal cleanup note for each hidden
  report.

These actions are reversible through the same Administrator interface. No report
was deleted, no recovery or Claim record was changed, and plausible recovery and
AI demonstration reports (including the backpack, bottle, notebook, AirPods,
and charger examples) remain available.

## Final conclusion

The requested role redesign, Administrator workspace, percentage charts, image
improvements, Staff management workflow, five bounded AI functions, privacy
controls, automated verification, Vercel deployment, and demonstration-data
cleanup are complete.
