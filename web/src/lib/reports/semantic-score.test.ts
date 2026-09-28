import { describe, expect, it } from "vitest";

import {
  cosineSimilarity,
  replaceTextFactor,
  semanticTextPoints,
} from "./semantic-score";

describe("semantic text scoring", () => {
  it("returns a bounded cosine similarity for compatible vectors", () => {
    expect(
      cosineSimilarity(
        new Float32Array([1, 0]),
        new Float32Array([1, 0]),
      ),
    ).toBe(1);
    expect(
      cosineSimilarity(
        new Float32Array([1, 0]),
        new Float32Array([-1, 0]),
      ),
    ).toBe(0);
    expect(
      cosineSimilarity(
        new Float32Array([1, 1]),
        new Float32Array([1, 0]),
      ),
    ).toBeGreaterThan(0);
    expect(
      cosineSimilarity(
        new Float32Array([1, 1]),
        new Float32Array([1, 0]),
      ),
    ).toBeLessThan(1);
  });

  it("returns zero for empty, mismatched, zero-length, or non-finite vectors", () => {
    expect(cosineSimilarity(new Float32Array(), new Float32Array())).toBe(0);
    expect(
      cosineSimilarity(new Float32Array([1]), new Float32Array([1, 0])),
    ).toBe(0);
    expect(
      cosineSimilarity(new Float32Array([0]), new Float32Array([0])),
    ).toBe(0);
    expect(
      cosineSimilarity(
        new Float32Array([Number.POSITIVE_INFINITY]),
        new Float32Array([1]),
      ),
    ).toBe(0);
  });

  it("maps cosine similarity to at most the existing twenty text points", () => {
    expect(semanticTextPoints(new Float32Array([1, 0]), new Float32Array([1, 0]))).toBe(20);
    expect(semanticTextPoints(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBe(0);
    expect(semanticTextPoints(new Float32Array([1, 0]), new Float32Array([-1, 0]))).toBe(0);
    expect(semanticTextPoints(new Float32Array([1]), new Float32Array([1, 0]))).toBe(0);
    expect(semanticTextPoints(new Float32Array([0]), new Float32Array([0]))).toBe(0);
  });

  it("replaces only text points and recalculates the total", () => {
    const category = { key: "category" as const, points: 25, maximum: 25, explanation: "Same category" };
    const text = { key: "text" as const, points: 12, maximum: 20, explanation: "Similar report wording" };
    const base = { score: 37, factors: [category, text] };

    expect(replaceTextFactor(base, 20)).toEqual({
      score: 45,
      factors: [category, { key: "text", points: 20, maximum: 20, explanation: "AI semantic text similarity in public report wording" }],
    });
    expect(replaceTextFactor(base, 0)).toEqual({ score: 25, factors: [category] });
    expect(base).toEqual({ score: 37, factors: [category, text] });
  });
});
