import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("Next.js text model tracing", () => {
  it("includes the pinned local model in one shared API trace group", () => {
    const includes = nextConfig.outputFileTracingIncludes;
    const routeAssets = [
      "./models/Xenova/all-MiniLM-L6-v2/**/*",
      "./node_modules/onnxruntime-node/package.json",
      "./node_modules/onnxruntime-node/dist/**/*",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/*",
    ];
    expect(includes).toEqual({ "/api/**/*": routeAssets });
  });
});
