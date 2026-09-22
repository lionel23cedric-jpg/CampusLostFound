import type { MatchScore } from "./matching-score";

export function semanticTextPoints(left: Float32Array, right: Float32Array) {
  if (left.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftLength = 0;
  let rightLength = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftLength += left[index] ** 2;
    rightLength += right[index] ** 2;
  }
  if (!Number.isFinite(dot) || leftLength <= 0 || rightLength <= 0) return 0;
  const similarity = dot / Math.sqrt(leftLength * rightLength);
  return Number.isFinite(similarity)
    ? Math.round(20 * Math.max(0, Math.min(1, similarity)))
    : 0;
}

export function replaceTextFactor(base: MatchScore, points: number): MatchScore {
  const safePoints = Number.isFinite(points)
    ? Math.max(0, Math.min(20, Math.round(points)))
    : 0;
  const factors = base.factors.filter((factor) => factor.key !== "text");
  if (safePoints > 0) {
    factors.push({
      key: "text",
      points: safePoints,
      maximum: 20,
      explanation: "AI semantic text similarity in public report wording",
    });
  }
  return {
    score: factors.reduce((total, factor) => total + factor.points, 0),
    factors,
  };
}
