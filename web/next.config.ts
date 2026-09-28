import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The text model is server-only. Keep one shared API trace group so Vercel
  // can reuse the dependency bundle instead of splitting AI routes apart.
  outputFileTracingIncludes: {
    // Keep the local model/runtime in the same trace group for every API
    // route. Vercel can then share the dependency bundle on Hobby (12
    // function limit) instead of splitting the four AI routes apart.
    "/api/**/*": [
      "./models/Xenova/all-MiniLM-L6-v2/**/*",
      "./node_modules/onnxruntime-node/package.json",
      "./node_modules/onnxruntime-node/dist/**/*",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/*",
    ],
  },
};

export default nextConfig;
