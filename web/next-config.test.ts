import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("Next.js text model tracing", () => {
  it("includes the pinned local model only for text-AI routes", () => {
    const includes = nextConfig.outputFileTracingIncludes;
    expect(includes).toEqual({
      "/api/reports": ["./models/Xenova/all-MiniLM-L6-v2/**/*"],
      "/api/reports/\\[id\\]/matches": ["./models/Xenova/all-MiniLM-L6-v2/**/*"],
      "/api/ai/report-assistant": ["./models/Xenova/all-MiniLM-L6-v2/**/*"],
      "/api/admin/ai/duplicates": ["./models/Xenova/all-MiniLM-L6-v2/**/*"],
    });
  });
});
