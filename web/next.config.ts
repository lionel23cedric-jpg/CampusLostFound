import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The text model is server-only. Trace it into only the four API routes
  // that perform embedding work instead of inflating every function bundle.
  outputFileTracingIncludes: {
    "/api/reports": ["./models/Xenova/all-MiniLM-L6-v2/**/*"],
    "/api/reports/\\[id\\]/matches": ["./models/Xenova/all-MiniLM-L6-v2/**/*"],
    "/api/ai/report-assistant": ["./models/Xenova/all-MiniLM-L6-v2/**/*"],
    "/api/admin/ai/duplicates": ["./models/Xenova/all-MiniLM-L6-v2/**/*"],
  },
};

export default nextConfig;
