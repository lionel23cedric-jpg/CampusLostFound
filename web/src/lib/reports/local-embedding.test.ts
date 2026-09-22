import { beforeEach, describe, expect, it, vi } from "vitest";

const extractor = vi.fn();
const pipeline = vi.fn();
vi.mock("@huggingface/transformers", () => ({ pipeline }));

describe("local public-text embedding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pipeline.mockResolvedValue(extractor);
    extractor.mockResolvedValue({ data: new Float32Array([0.6, 0.8]) });
  });

  it("lazily reuses the quantized model and requests pooled normalized vectors", async () => {
    const { embedPublicText } = await import("./local-embedding");
    expect(await embedPublicText("Public item wording")).toEqual(new Float32Array([0.6, 0.8]));
    await embedPublicText("Another public report");
    expect(pipeline).toHaveBeenCalledOnce();
    expect(pipeline).toHaveBeenCalledWith("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      dtype: "q8",
      revision: "751bff37182d3f1213fa05d7196b954e230abad9",
    });
    expect(extractor).toHaveBeenCalledWith("Public item wording", { pooling: "mean", normalize: true });
    expect(extractor).toHaveBeenCalledTimes(2);
  });
});
