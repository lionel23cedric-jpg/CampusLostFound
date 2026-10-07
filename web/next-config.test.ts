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

describe("HTTP response headers", () => {
  it("protects every page and prevents sensitive API caching", async () => {
    const rules = await nextConfig.headers!();
    const [globalRule, ...privateApiRules] = rules;
    const globalHeaders = new Map(
      globalRule.headers.map(({ key, value }) => [key, value]),
    );

    expect(globalRule.source).toBe("/(.*)");
    expect(globalHeaders.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(globalHeaders.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(globalHeaders.get("X-Content-Type-Options")).toBe("nosniff");
    expect(globalHeaders.get("X-Frame-Options")).toBe("DENY");
    expect(globalHeaders.get("Permissions-Policy")).toBe(
      "camera=(), geolocation=(), microphone=()",
    );

    expect(privateApiRules.map(({ source }) => source)).toEqual([
      "/api/auth/:path*",
      "/api/profile/:path*",
      "/api/claims/:path*",
      "/api/notifications/:path*",
      "/api/admin/:path*",
      "/api/staff/:path*",
      "/api/reports/:path*",
    ]);
    for (const rule of privateApiRules) {
      expect(rule.headers).toEqual([
        { key: "Cache-Control", value: "no-store" },
      ]);
    }
  });
});
