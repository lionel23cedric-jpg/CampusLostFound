# AI Feature Suite

## Scope

Campus Find implements the five AI-related examples in the course brief without
turning them into autonomous decisions. The features help a student search or
prepare a report and help an administrator find records worth reviewing. They
do not decide ownership, approve a Claim, hide content, or change a category
without a person's action.

No OpenAI, Gemini, or other paid inference API is used. Inference runs inside
the Next.js server process with pinned ONNX models and ONNX Runtime WebAssembly.
The audited model files are packaged with the source, so production inference
does not depend on a first-request download. If a model is unavailable, each
core workflow remains usable through a bounded deterministic fallback.

## Feature summary

| Feature | Model-assisted result | Deterministic fallback | Human decision |
| --- | --- | --- | --- |
| Lost/Found matching | MiniLM semantic wording score reranks rule-qualified opposite-type reports | Original weighted rule score and ranking | Member inspects a result and separately creates a Claim |
| Smart search | MiniLM ranks up to 100 visible reports by natural-language similarity | MongoDB text search using the same query | Member chooses whether to open a result |
| Description and tag assistant | MiniLM ranks a controlled tag vocabulary; description wording is formatted deterministically | Lexical tags from the same controlled vocabulary | Member applies or dismisses the proposed text and tags |
| Image category assistant | MobileCLIP ranks the currently active category names for the first selected photo | Empty, visibly labelled fallback suggestion | Member chooses a proposed category or keeps the current one |
| Duplicate detection | MiniLM replaces only the text factor for structured same-type candidate pairs | The existing explainable rule score | Administrator explicitly sends one candidate to the normal moderation queue |

## Shared text model

Matching, smart search, semantic tag ranking, and duplicate detection reuse
`Xenova/all-MiniLM-L6-v2` at revision
`751bff37182d3f1213fa05d7196b954e230abad9` with quantized `q8` weights. Text
is mean-pooled and normalised before cosine similarity is calculated. Reusing
one local model keeps the implementation understandable and within the course
scope.

The browser receives only bounded results and a method label. `model_assisted`
is displayed as AI-assisted. A deterministic result is displayed as fallback
or rule-based fallback; raw model errors and vectors are never returned.

## 1. Lost/Found matching recommendation

The matching service queries at most 500 open, visible reports of the opposite
type from other members. A transparent 100-point rule score uses category (25),
public location (15), public date (15), colours (15), tags (10), and wording
(20). A report must first reach 35 rule points. At most 30 qualified candidates
are reranked by replacing only the 20-point wording factor with MiniLM semantic
similarity, and at most five results are shown.

Only title, public description, structured public fields, and privacy-permitted
location/date values are used. A model failure restores the complete original
rule ranking. The separate evaluation, dataset, confusion matrix, and limits
are in [Explainable Item Matching Evaluation](ai-matching-evaluation.md).

## 2. Natural-language smart search

The Browse page accepts a 3-240 character smart query such as “black charger
near the library”. Existing filters for type, category, location, status,
colour, photo availability, and pagination still apply. The service loads no
more than 100 visible candidates, embeds each public search text, ranks cosine
similarity deterministically, and labels the result AI-assisted.

If local embeddings fail, the service runs MongoDB text search over the same
query and labels the result Fallback search. Private verification evidence,
reporter identity, contact data, and hidden reports do not enter the ranking.

## 3. Description and controlled-tag assistant

On the report form, a member can explicitly request help after entering a title
and public description. The request contains only the report type, title,
public description, and colours. It never includes private verification
answers, serial numbers, exact private locations, or private notes.

The description is cleaned into consistent public wording by deterministic
formatting; this feature does not claim generative text. MiniLM compares the
public text with a small, course-appropriate controlled vocabulary. Tags with a
cosine score of at least 0.25 are ranked and the top five are returned. If the
model is unavailable, exact lexical matches from the same vocabulary are used.
The form does not change until the member clicks **Apply suggestion**.

## 4. Image-assisted category suggestion

After selecting one or more report photos, a member can click **Suggest
category from first photo**. The API accepts exactly one JPEG, PNG, or WebP file
up to 3 MB and requires an active signed-in account. It uses
`Xenova/mobileclip_s0` at revision
`20c6e4f26ad3f7f7e9cde13c4f9bb54852dd42c6` with separate quantized `q8`
text and vision weights to perform zero-shot image classification against the
current active category names. Up to three category names and bounded
confidence values are returned.

The analysis endpoint processes the uploaded file in memory, sends `Cache-Control:
no-store`, and does not create a report image record. If inference is not
available, it returns an empty, visibly labelled fallback result. The selected
photo and category stay unchanged until the member clicks **Use this category**;
the member can instead keep the current category.

## 5. Administrator duplicate detection

The Report moderation page gives an active administrator an explicit **Scan
for possible duplicates** action. It examines at most the 200 most recent
visible, non-draft reports and compares canonical pairs only when both records
have the same report type. Structured category, location, or date evidence is
required for the pair to reach the semantic stage. MiniLM replaces the existing
20-point wording factor, a combined similarity of at least 0.82 is required,
and at most 20 pairs are returned.

The scan is read-only. A result shows both report links, the similarity,
explanations, and whether it was AI-assisted or fallback. Only a second,
explicit **Send to moderation queue** action creates a standard duplicate flag.
The existing moderation workflow remains responsible for any visibility
decision; scanning never hides or deletes a report.

## Privacy, safety, and limitations

- Text-based features use member-visible fields only; private ownership
  evidence and account details are outside their projections and contracts.
- All request and response bodies are schema-checked, size-bounded, and tested
  to reject extra fields. AI endpoints require the appropriate active role.
- The interface distinguishes AI-assisted and fallback results. Errors are
  closed to safe messages rather than exposing database or model details.
- Packaged local models still require server memory. A cold request can be
  slower, and a missing or damaged model file uses the documented fallback.
- Similarity and confidence are ranking aids, not probabilities of ownership or
  proof that two records describe the same physical item.
- MiniLM is English-focused, CLIP may reflect training-data bias, and the small
  controlled tag list cannot cover every campus object. Users and
  administrators must review every suggestion.

## Main implementation locations

| Area | Main code |
| --- | --- |
| Shared contracts | `web/src/lib/ai/contracts.ts` |
| Local text embeddings | `web/src/lib/reports/local-embedding.ts` |
| Item matching | `web/src/lib/reports/matching-service.ts` |
| Smart search | `web/src/lib/reports/browse-service.ts` |
| Description and tags | `web/src/lib/ai/report-assistant.ts` |
| Image category analysis | `web/src/lib/ai/image-classifier.ts` and `web/src/app/api/ai/image-category/route.ts` |
| Duplicate detection | `web/src/lib/ai/duplicate-detection.ts` and `web/src/app/api/admin/ai/duplicates/route.ts` |

## Verification

From `web`, run:

```powershell
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run evaluate:matching
npm run evaluate:matching:ai
```

The first matching evaluation is deterministic. The second performs real local
MiniLM inference using the model packaged under `web/models`.
