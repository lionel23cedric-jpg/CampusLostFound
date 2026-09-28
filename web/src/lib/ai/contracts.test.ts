import { describe, expect, it } from "vitest";

import {
  aiMethodSchema,
  duplicateScanResponseSchema,
  imageCategoryResponseSchema,
  reportAssistantRequestSchema,
  reportAssistantResponseSchema,
} from "./contracts";

const reportAssistantRequest = {
  title: "Black charger",
  publicDescription: "A black USB-C charger left near the library.",
  colors: ["black"],
  reportType: "lost" as const,
};

describe("AI contracts", () => {
  it("accepts only the two public AI result methods", () => {
    expect(aiMethodSchema.parse("model_assisted")).toBe("model_assisted");
    expect(aiMethodSchema.parse("fallback")).toBe("fallback");
    expect(() => aiMethodSchema.parse("rule_fallback")).toThrow();
  });

  it("strictly validates report assistant requests", () => {
    expect(reportAssistantRequestSchema.parse(reportAssistantRequest)).toEqual(
      reportAssistantRequest,
    );
    expect(() =>
      reportAssistantRequestSchema.parse({
        ...reportAssistantRequest,
        extra: true,
      }),
    ).toThrow();
    expect(() =>
      reportAssistantRequestSchema.parse({
        ...reportAssistantRequest,
        title: "x".repeat(121),
      }),
    ).toThrow();
    expect(() =>
      reportAssistantRequestSchema.parse({
        ...reportAssistantRequest,
        publicDescription: "x".repeat(2001),
      }),
    ).toThrow();
  });

  it("strictly bounds report assistant response tags", () => {
    const response = {
      method: "model_assisted" as const,
      suggestedDescription: "A black USB-C charger left near the library.",
      suggestedTags: ["charger", "black", "library"],
    };

    expect(reportAssistantResponseSchema.parse(response)).toEqual(response);
    expect(() =>
      reportAssistantResponseSchema.parse({ ...response, extra: true }),
    ).toThrow();
    expect(() =>
      reportAssistantResponseSchema.parse({
        ...response,
        suggestedTags: Array.from({ length: 11 }, (_, index) => `tag-${index}`),
      }),
    ).toThrow();
    expect(() =>
      reportAssistantResponseSchema.parse({
        ...response,
        suggestedTags: ["x".repeat(41)],
      }),
    ).toThrow();
  });

  it("strictly bounds image category suggestions and confidence", () => {
    const suggestion = {
      categoryId: "0123456789abcdef01234567",
      categoryName: "Chargers",
      confidence: 0.92,
    };
    const response = {
      method: "model_assisted" as const,
      suggestions: [suggestion],
    };

    expect(imageCategoryResponseSchema.parse(response)).toEqual(response);
    expect(() =>
      imageCategoryResponseSchema.parse({
        ...response,
        suggestions: Array.from({ length: 4 }, () => suggestion),
      }),
    ).toThrow();
    expect(() =>
      imageCategoryResponseSchema.parse({
        ...response,
        suggestions: [{ ...suggestion, confidence: 1.01 }],
      }),
    ).toThrow();
    expect(() =>
      imageCategoryResponseSchema.parse({
        ...response,
        suggestions: [{ ...suggestion, extra: true }],
      }),
    ).toThrow();
  });

  it("strictly bounds duplicate pairs and similarity", () => {
    const report = {
      id: "0123456789abcdef01234567",
      reportType: "lost" as const,
      title: "Black charger",
      occurredAt: "2026-09-27T01:00:00.000Z",
    };
    const pair = {
      leftReport: report,
      rightReport: {
        ...report,
        id: "abcdef0123456789abcdef01",
        title: "USB-C charger",
      },
      similarity: 0.88,
      reasons: ["Similar public descriptions", "Same category"],
      method: "model_assisted" as const,
    };
    const response = { pairs: [pair] };

    expect(duplicateScanResponseSchema.parse(response)).toEqual(response);
    expect(() =>
      duplicateScanResponseSchema.parse({
        pairs: Array.from({ length: 21 }, () => pair),
      }),
    ).toThrow();
    expect(() =>
      duplicateScanResponseSchema.parse({
        pairs: [{ ...pair, similarity: -0.01 }],
      }),
    ).toThrow();
    expect(() =>
      duplicateScanResponseSchema.parse({
        pairs: [
          {
            ...pair,
            leftReport: { ...report, extra: true },
          },
        ],
      }),
    ).toThrow();
  });
});
