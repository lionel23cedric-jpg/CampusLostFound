import {
  scoreReportMatch,
  type ScoringReport,
} from "./matching-score";

export const MATCH_THRESHOLD = 35;

export type MatchingEvaluationCase = {
  id: string;
  source: ScoringReport;
  candidates: ScoringReport[];
  relevantCandidateIds: string[];
};

export type ConfusionMatrix = {
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  trueNegative: number;
};

export type ClassificationMetrics = {
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
};

export type MatchingEvaluation = ConfusionMatrix &
  ClassificationMetrics & {
    topMatchAccuracy: number;
    cases: number;
    comparisons: number;
  };

function divide(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function calculateClassificationMetrics(
  matrix: ConfusionMatrix,
): ClassificationMetrics {
  const precision = divide(
    matrix.truePositive,
    matrix.truePositive + matrix.falsePositive,
  );
  const recall = divide(
    matrix.truePositive,
    matrix.truePositive + matrix.falseNegative,
  );
  return {
    precision,
    recall,
    f1: divide(
      2 * matrix.truePositive,
      2 * matrix.truePositive + matrix.falsePositive + matrix.falseNegative,
    ),
    accuracy: divide(
      matrix.truePositive + matrix.trueNegative,
      matrix.truePositive +
        matrix.falsePositive +
        matrix.falseNegative +
        matrix.trueNegative,
    ),
  };
}

export function evaluateMatching(
  cases: MatchingEvaluationCase[],
  threshold = MATCH_THRESHOLD,
): MatchingEvaluation {
  const matrix: ConfusionMatrix = {
    truePositive: 0,
    falsePositive: 0,
    falseNegative: 0,
    trueNegative: 0,
  };
  let correctTopMatches = 0;
  let comparisons = 0;

  for (const item of cases) {
    const relevantIds = new Set(item.relevantCandidateIds);
    const scored = item.candidates
      .map((candidate) => ({
        id: candidate.id,
        relevant: relevantIds.has(candidate.id),
        score: scoreReportMatch(item.source, candidate).score,
      }))
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));

    comparisons += scored.length;
    if (scored[0]?.relevant) correctTopMatches += 1;

    for (const result of scored) {
      const predicted = result.score >= threshold;
      if (predicted && result.relevant) matrix.truePositive += 1;
      else if (predicted) matrix.falsePositive += 1;
      else if (result.relevant) matrix.falseNegative += 1;
      else matrix.trueNegative += 1;
    }
  }

  return {
    ...matrix,
    ...calculateClassificationMetrics(matrix),
    topMatchAccuracy: divide(correctTopMatches, cases.length),
    cases: cases.length,
    comparisons,
  };
}
