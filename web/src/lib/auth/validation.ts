import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Email must be valid");

const passwordSchema = z
  .string()
  .min(10, "Password must contain at least 10 characters")
  .max(128, "Password must contain at most 128 characters");

export const registerSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
  displayName: z
    .string()
    .trim()
    .min(2, "Display name must contain at least 2 characters")
    .max(80, "Display name must contain at most 80 characters"),
});

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
