import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The text model is server-only. The portable WASM runtime is statically
  // bundled; only the pinned model files need explicit server tracing.
  outputFileTracingIncludes: {
    "/api/reports": [
      "./models/Xenova/all-MiniLM-L6-v2/**/*",
      "./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
      "./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
    ],
    "/api/reports/\\[id\\]/matches": [
      "./models/Xenova/all-MiniLM-L6-v2/**/*",
      "./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
      "./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
    ],
    "/api/ai/report-assistant": [
      "./models/Xenova/all-MiniLM-L6-v2/**/*",
      "./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
      "./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
    ],
    "/api/ai/image-category": [
      "./models/Xenova/mobileclip_s0/**/*",
      "./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
      "./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
    ],
    "/api/admin/ai/duplicates": [
      "./models/Xenova/all-MiniLM-L6-v2/**/*",
      "./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
      "./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
    ],
  },
};

export default nextConfig;
