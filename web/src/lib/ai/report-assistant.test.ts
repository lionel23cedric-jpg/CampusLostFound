import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/reports/local-embedding", () => ({
  embedPublicText: vi.fn(),
}));

import { embedPublicText } from "@/lib/reports/local-embedding";

import { suggestReportDetails } from "./report-assistant";

const request = {
  title: "Red canvas backpack",
  publicDescription: "A red backpack was left beside the library desk",
  colors: ["Red", "Black"],
  reportType: "lost" as const,
};

describe("report assistant", () => {
  beforeEach(() => {
    vi.mocked(embedPublicText).mockReset();
  });

  it("uses only public request text and returns up to five controlled semantic tags", async () => {
    vi.mocked(embedPublicText).mockImplementation(async (text) => {
      if (text === "Red canvas backpack. A red backpack was left beside the library desk. Red Black") {
        return new Float32Array([1, 0]);
      }
      if (["backpack", "bag", "red", "library"].includes(text)) {
        return new Float32Array([1, 0]);
      }
      return new Float32Array([0, 1]);
    });

    const result = await suggestReportDetails(request);

    expect(result).toEqual({
      method: "model_assisted",
      suggestedDescription:
        "A red backpack was left beside the library desk. The item is red and black.",
      suggestedTags: ["backpack", "bag", "red", "library"],
    });
    expect(result.suggestedTags).toHaveLength(4);
    expect(vi.mocked(embedPublicText).mock.calls[0]).toEqual([
      "Red canvas backpack. A red backpack was left beside the library desk. Red Black",
    ]);
    expect(JSON.stringify(vi.mocked(embedPublicText).mock.calls)).not.toMatch(
      /serial|verification|exactLocation|reporter|contact/i,
    );
  });

  it("uses a visible deterministic fallback without changing the public-only description", async () => {
    vi.mocked(embedPublicText).mockRejectedValue(new Error("model unavailable"));

    await expect(
      suggestReportDetails({
        title: "Black laptop charger",
        publicDescription: "USB-C charger near the library!",
        colors: ["Black"],
        reportType: "found",
      }),
    ).resolves.toEqual({
      method: "fallback",
      suggestedDescription:
        "USB-C charger near the library. The item is black.",
      suggestedTags: ["charger", "laptop", "black", "library"],
    });
  });

  it("keeps deterministic suggestions inside the public response limit", async () => {
    vi.mocked(embedPublicText).mockRejectedValue(new Error("model unavailable"));

    const result = await suggestReportDetails({
      ...request,
      publicDescription: "x".repeat(2000),
    });

    expect(result.suggestedDescription.length).toBeLessThanOrEqual(2000);
    expect(result.suggestedDescription.endsWith(".")).toBe(true);
  });
});
