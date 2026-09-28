import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The text model is server-only. Keep the production Smart Search bundle
  // isolated so Vercel Hobby does not count every API route as new.
  outputFileTracingIncludes: {
    "/api/reports": [
      "./models/Xenova/all-MiniLM-L6-v2/**/*",
      "./node_modules/onnxruntime-node/package.json",
      "./node_modules/onnxruntime-node/dist/**/*",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/*",
    ],
  },
};

export default nextConfig;
