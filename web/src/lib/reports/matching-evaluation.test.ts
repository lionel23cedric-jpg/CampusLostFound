import { describe, expect, it } from "vitest";

import rawCases from "./fixtures/matching-evaluation.json";
import {
  calculateClassificationMetrics,
  evaluateMatching,
  MATCH_THRESHOLD,
  type MatchingEvaluationCase,
} from "./matching-evaluation";
import type { ScoringReport } from "./matching-score";

const cases = rawCases as MatchingEvaluationCase[];

function report(id: string, title: string): ScoringReport {
  return {
    id,
    title,
    publicDescription: title,
    categoryId: "category",
    campusLocationId: "location",
    occurredAt: "2026-09-15T00:00:00.000Z",
    colors: [title],
    tags: [title],
    createdAt: "2026-09-15T01:00:00.000Z",
  };
}

describe("matching evaluation metrics", () => {
  it("calculates the confusion-matrix measures", () => {
    expect(
      calculateClassificationMetrics({
        truePositive: 8,
        falsePositive: 2,
        falseNegative: 2,
        trueNegative: 8,
      }),
    ).toEqual({ precision: 0.8, recall: 0.8, f1: 0.8, accuracy: 0.8 });
  });

  it("returns finite zeros for empty denominators", () => {
    expect(
      calculateClassificationMetrics({
        truePositive: 0,
        falsePositive: 0,
        falseNegative: 0,
        trueNegative: 0,
      }),
    ).toEqual({ precision: 0, recall: 0, f1: 0, accuracy: 0 });
  });

  it("calculates top-match accuracy across source reports", () => {
    const sharedSource = report("source", "target");
    const result = evaluateMatching(
      [
        {
          id: "correct",
          source: sharedSource,
          candidates: [report("relevant", "target"), report("other", "different")],
          relevantCandidateIds: ["relevant"],
        },
        {
          id: "incorrect",
          source: sharedSource,
          candidates: [report("relevant", "different"), report("other", "target")],
          relevantCandidateIds: ["relevant"],
        },
      ],
      MATCH_THRESHOLD,
    );

    expect(result.topMatchAccuracy).toBe(0.5);
  });

  it("meets the recorded course-level floors on independent labelled data", () => {
    const result = evaluateMatching(cases, MATCH_THRESHOLD);
    console.info(`MATCHING_EVALUATION=${JSON.stringify(result)}`);

    expect(result.cases).toBe(12);
    expect(result.comparisons).toBeGreaterThanOrEqual(60);
    expect(result.precision).toBeGreaterThanOrEqual(0.7);
    expect(result.recall).toBeGreaterThanOrEqual(0.7);
    expect(result.f1).toBeGreaterThanOrEqual(0.7);
    expect(result.topMatchAccuracy).toBeGreaterThanOrEqual(0.75);
  });
});
