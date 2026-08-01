import { z } from "zod";

const serverEnvironmentSchema = z.object({
  MONGODB_URI: z
    .string()
    .min(1, "MONGODB_URI is required")
    .refine(
      (value) =>
        value.startsWith("mongodb://") ||
        value.startsWith("mongodb+srv://"),
      "MONGODB_URI must be a valid MongoDB connection string",
    ),
});

export function getServerEnvironment() {
  return serverEnvironmentSchema.parse({
    MONGODB_URI: process.env.MONGODB_URI,
  });
}