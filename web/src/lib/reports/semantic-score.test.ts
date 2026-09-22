import { describe, expect, it } from "vitest";

import { replaceTextFactor, semanticTextPoints } from "./semantic-score";

describe("semantic text scoring", () => {
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
