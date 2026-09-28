import { beforeEach, describe, expect, it, vi } from "vitest";

const classifier = vi.fn();
const pipeline = vi.fn();
const fromBlob = vi.fn();

vi.mock("@huggingface/transformers", () => ({
  pipeline,
  RawImage: { fromBlob },
}));

const categories = [
  { id: "0123456789abcdef01234567", name: "Electronics" },
  { id: "abcdef0123456789abcdef01", name: "Bags" },
  { id: "111111111111111111111111", name: "Books" },
  { id: "222222222222222222222222", name: "Clothing" },
];

describe("local image category classifier", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    pipeline.mockResolvedValue(classifier);
    fromBlob.mockResolvedValue({ prepared: true });
    classifier.mockResolvedValue([
      { label: "Bags", score: 0.91 },
      { label: "Electronics", score: 0.7 },
      { label: "Books", score: 0.4 },
      { label: "Clothing", score: 0.2 },
    ]);
  });

  it("uses the pinned quantized model and returns the best three active categories", async () => {
    const { suggestImageCategories } = await import("./image-classifier");
    const image = new Blob(["image"], { type: "image/png" });

    await expect(suggestImageCategories(image, categories)).resolves.toEqual({
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
    expect(pipeline).toHaveBeenCalledWith(
      "zero-shot-image-classification",
      "Xenova/clip-vit-base-patch32",
      { dtype: "q4", revision: "d15189d" },
    );
    expect(fromBlob).toHaveBeenCalledWith(image);
    expect(classifier).toHaveBeenCalledWith(
      { prepared: true },
      ["Electronics", "Bags", "Books", "Clothing"],
      { hypothesis_template: "This is a photo of a {}" },
    );
  });

  it("returns a safe fallback without exposing model failures", async () => {
    pipeline.mockRejectedValue(new Error("private model cache path"));
    const { suggestImageCategories } = await import("./image-classifier");

    await expect(
      suggestImageCategories(new Blob(["image"]), categories),
    ).resolves.toEqual({ method: "fallback", suggestions: [] });
  });

  it("does not load the model when no active category exists", async () => {
    const { suggestImageCategories } = await import("./image-classifier");

    await expect(
      suggestImageCategories(new Blob(["image"]), []),
    ).resolves.toEqual({ method: "fallback", suggestions: [] });
    expect(pipeline).not.toHaveBeenCalled();
    expect(fromBlob).not.toHaveBeenCalled();
  });
});
