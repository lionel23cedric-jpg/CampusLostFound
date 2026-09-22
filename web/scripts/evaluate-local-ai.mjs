// Explicit course evaluation: this is the only setup command that intentionally downloads the model.
import { readFile } from "node:fs/promises";

import { scoreReportMatch } from "../src/lib/reports/matching-score.ts";
import { semanticTextPoints, replaceTextFactor } from "../src/lib/reports/semantic-score.ts";
import { embedPublicText } from "../src/lib/reports/local-embedding.ts";

const cases = JSON.parse(
  await readFile(new URL("../src/lib/reports/fixtures/matching-evaluation.json", import.meta.url), "utf8"),
);
const startedAt = performance.now();
const confusion = { truePositive: 0, falsePositive: 0, falseNegative: 0, trueNegative: 0 };
let topMatchCorrect = 0;

for (const item of cases) {
  const sourceText = `${item.source.title}. ${item.source.publicDescription}`;
  const sourceVector = await embedPublicText(sourceText);
  const ranked = [];
  for (const candidate of item.candidates) {
    const baseline = scoreReportMatch(item.source, candidate);
    const candidateVector = baseline.score >= 35
      ? await embedPublicText(`${candidate.title}. ${candidate.publicDescription}`)
      : null;
    const score = candidateVector
      ? replaceTextFactor(baseline, semanticTextPoints(sourceVector, candidateVector)).score
      : baseline.score;
    const relevant = item.relevantCandidateIds.includes(candidate.id);
    if (baseline.score >= 35) ranked.push({ id: candidate.id, score, relevant });
    const predicted = baseline.score >= 35 && score >= 35;
    if (predicted && relevant) confusion.truePositive += 1;
    else if (predicted) confusion.falsePositive += 1;
    else if (relevant) confusion.falseNegative += 1;
    else confusion.trueNegative += 1;
  }
  ranked.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  if (ranked[0]?.relevant) topMatchCorrect += 1;
}

const { truePositive: tp, falsePositive: fp, falseNegative: fn, trueNegative: tn } = confusion;
const ratio = (numerator, denominator) => denominator === 0 ? 0 : numerator / denominator;
console.info(`LOCAL_AI_EVALUATION=${JSON.stringify({
  model: "Xenova/all-MiniLM-L6-v2",
  cases: cases.length,
  comparisons: tp + fp + fn + tn,
  ...confusion,
  precision: ratio(tp, tp + fp),
  recall: ratio(tp, tp + fn),
  f1: ratio(2 * tp, 2 * tp + fp + fn),
  accuracy: ratio(tp + tn, tp + fp + fn + tn),
  topMatchAccuracy: ratio(topMatchCorrect, cases.length),
  durationSeconds: Math.round((performance.now() - startedAt) / 1000),
})}`);
