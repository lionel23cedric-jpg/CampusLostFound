import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("Next.js local model tracing", () => {
  it("includes each pinned model only for the routes that use it", () => {
    const includes = nextConfig.outputFileTracingIncludes;
    const routeAssets = [
      "./models/Xenova/all-MiniLM-L6-v2/**/*",
      "./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
      "./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
    ];
    expect(includes).toEqual({
      "/api/reports": routeAssets,
      "/api/reports/\\[id\\]/matches": routeAssets,
      "/api/ai/report-assistant": routeAssets,
      "/api/ai/image-category": [
        "./models/Xenova/mobileclip_s0/**/*",
        "./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
        "./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
      ],
      "/api/admin/ai/duplicates": routeAssets,
    });
  });
});
