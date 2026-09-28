import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The text model is server-only. The portable WASM runtime is statically
  // bundled; only the pinned model files need explicit server tracing.
  outputFileTracingIncludes: {
    "/api/reports": [
      "./models/Xenova/all-MiniLM-L6-v2/**/*",
    ],
    "/api/reports/\\[id\\]/matches": ["./models/Xenova/all-MiniLM-L6-v2/**/*"],
    "/api/ai/report-assistant": ["./models/Xenova/all-MiniLM-L6-v2/**/*"],
    "/api/admin/ai/duplicates": ["./models/Xenova/all-MiniLM-L6-v2/**/*"],
  },
};

export default nextConfig;
