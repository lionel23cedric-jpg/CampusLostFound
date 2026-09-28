import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transformers.js resolves its Node backend dynamically. Keep the package
  // external and trace only the Linux x64 runtime needed by Vercel Functions.
  serverExternalPackages: ["onnxruntime-node"],
  // The text model is server-only. Trace it into only the four API routes
  // that perform embedding work instead of inflating every function bundle.
  outputFileTracingIncludes: {
    "/api/reports": [
      "./models/Xenova/all-MiniLM-L6-v2/**/*",
      "./node_modules/onnxruntime-node/package.json",
      "./node_modules/onnxruntime-node/dist/**/*",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/*",
    ],
    "/api/reports/\\[id\\]/matches": [
      "./models/Xenova/all-MiniLM-L6-v2/**/*",
      "./node_modules/onnxruntime-node/package.json",
      "./node_modules/onnxruntime-node/dist/**/*",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/*",
    ],
    "/api/ai/report-assistant": [
      "./models/Xenova/all-MiniLM-L6-v2/**/*",
      "./node_modules/onnxruntime-node/package.json",
      "./node_modules/onnxruntime-node/dist/**/*",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/*",
    ],
    "/api/admin/ai/duplicates": [
      "./models/Xenova/all-MiniLM-L6-v2/**/*",
      "./node_modules/onnxruntime-node/package.json",
      "./node_modules/onnxruntime-node/dist/**/*",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/*",
    ],
  },
};

export default nextConfig;
