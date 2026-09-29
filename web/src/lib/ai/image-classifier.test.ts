import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { suggestImageCategories } from "./image-classifier";

const categories = [
  { id: "0123456789abcdef01234567", name: "Electronics" },
  { id: "abcdef0123456789abcdef01", name: "Bags" },
  { id: "111111111111111111111111", name: "Books" },
  { id: "222222222222222222222222", name: "Clothing" },
];

describe("local image category classifier", () => {
  it("returns the best three active categories from model-assisted output", async () => {
    const classifier = vi.fn().mockResolvedValue([
      { label: "Bags", score: 0.91 },
      { label: "Electronics", score: 0.7 },
      { label: "Books", score: 0.4 },
      { label: "Clothing", score: 0.2 },
    ]);
    const fromBlob = vi.fn().mockResolvedValue({ prepared: true });
    const loadRuntime = vi.fn().mockResolvedValue({ classifier, fromBlob });
    const image = new Blob(["image"], { type: "image/png" });

    await expect(
      suggestImageCategories(image, categories, loadRuntime),
    ).resolves.toEqual({
      method: "model_assisted",
      suggestions: [
        { categoryId: categories[1].id, categoryName: "Bags", confidence: 0.91 },
        {
          categoryId: categories[0].id,
          categoryName: "Electronics",
          confidence: 0.7,
        },
        { categoryId: categories[2].id, categoryName: "Books", confidence: 0.4 },
      ],
    });
    expect(fromBlob).toHaveBeenCalledWith(image);
    expect(classifier).toHaveBeenCalledWith(
      { prepared: true },
      ["Electronics", "Bags", "Books", "Clothing"],
      { hypothesis_template: "This is a photo of a {}" },
    );
  });

  it("returns a safe fallback without exposing model failures", async () => {
    const loadRuntime = vi.fn().mockRejectedValue(new Error("private model path"));

    await expect(
      suggestImageCategories(new Blob(["image"]), categories, loadRuntime),
    ).resolves.toEqual({ method: "fallback", suggestions: [] });
  });

  it("does not load the model when no active category exists", async () => {
    const loadRuntime = vi.fn();

    await expect(
      suggestImageCategories(new Blob(["image"]), [], loadRuntime),
    ).resolves.toEqual({ method: "fallback", suggestions: [] });
    expect(loadRuntime).not.toHaveBeenCalled();
  });

  it("runs the packaged model without a network download", async () => {
    const image = new Blob([
      fs.readFileSync(path.join(process.cwd(), "public", "campus-find-hero.webp")),
    ], { type: "image/webp" });

    const result = await suggestImageCategories(image, categories);

    expect(result.method).toBe("model_assisted");
    expect(result.suggestions).toHaveLength(3);
    expect(result.suggestions.every(({ confidence }) => confidence > 0)).toBe(true);
  });
});
