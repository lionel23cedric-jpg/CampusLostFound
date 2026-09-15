import { describe, expect, it } from "vitest";
import { z } from "zod";

import rawCases from "./fixtures/matching-evaluation.json";

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
  id: z.string().regex(/^(lost|found)-/),
  source: scoringReportSchema,
  candidates: z.array(scoringReportSchema).min(5),
  relevantCandidateIds: z.array(z.string()).min(1),
});

const expectedCases = [
  "lost-black-usbc-charger",
  "found-blue-water-bottle",
  "lost-student-id-card",
  "found-silver-keyring",
  "lost-grey-backpack",
  "found-wireless-earbuds",
  "lost-red-umbrella",
  "found-calculus-textbook",
  "lost-prescription-glasses",
  "found-black-wallet",
  "lost-green-hoodie",
  "found-bicycle-helmet",
];

describe("independent matching evaluation fixture", () => {
  it("contains the twelve planned privacy-safe scenarios", () => {
    const cases = z.array(evaluationCaseSchema).parse(rawCases);
    expect(cases.map((item) => item.id)).toEqual(expectedCases);
    expect(cases.reduce((sum, item) => sum + item.candidates.length, 0)).toBe(60);
  });

  it("uses unique candidates and valid relevance labels in every scenario", () => {
    const cases = z.array(evaluationCaseSchema).parse(rawCases);

    for (const item of cases) {
      const candidateIds = item.candidates.map((candidate) => candidate.id);
      expect(new Set(candidateIds).size).toBe(candidateIds.length);
      expect(candidateIds).not.toContain(item.source.id);
      expect(item.relevantCandidateIds).toHaveLength(2);
      for (const relevantId of item.relevantCandidateIds) {
        expect(candidateIds).toContain(relevantId);
      }
    }
  });
});
