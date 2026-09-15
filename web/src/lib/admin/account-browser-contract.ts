import { z } from "zod";

export const ACCOUNT_BROWSER_ROLES = ["student", "staff"] as const;
export const ACCOUNT_BROWSER_STATUSES = [
  "active",
  "suspended",
  "deactivated",
] as const;
export const ACCOUNT_BROWSER_REASONS = [
  "security_concern",
  "policy_violation",
  "administrative_review",
  "account_restored",
  "account_closed",
] as const;
export const ACCOUNT_BROWSER_PAGE_SIZE = 20;

const CONTROL_OR_FORMAT_PATTERN = /[\p{Cc}\p{Cf}]/u;

export const accountBrowserSearchSchema = z
  .string()
  .refine((value) => !CONTROL_OR_FORMAT_PATTERN.test(value))
  .transform((value) => value.normalize("NFKC").trim().replace(/\s+/gu, " "))
  .pipe(z.string().min(1).max(80));

export const managedBrowserAccountSchema = z.strictObject({
  id: z.string().regex(/^[a-f\d]{24}$/),
  email: z.string().email(),
  displayName: z.string().min(2).max(80),
  role: z.enum(ACCOUNT_BROWSER_ROLES),
  status: z.enum(ACCOUNT_BROWSER_STATUSES),
  createdAt: z.string().datetime({ offset: true }),
  lastLoginAt: z.string().datetime({ offset: true }).nullable(),
  updatedAt: z.string().datetime({ offset: true }),
});

export const managedBrowserAccountPageSchema = z
  .strictObject({
    accounts: z.array(managedBrowserAccountSchema).max(ACCOUNT_BROWSER_PAGE_SIZE),
    pagination: z.strictObject({
      page: z.number().int().min(1).max(500),
      pageSize: z.literal(ACCOUNT_BROWSER_PAGE_SIZE),
      totalItems: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      totalPages: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    }),
  })
  .superRefine(({ pagination }, context) => {
    if (
      pagination.totalPages !==
      Math.ceil(pagination.totalItems / ACCOUNT_BROWSER_PAGE_SIZE)
    ) {
      context.addIssue({
        code: "custom",
        path: ["pagination", "totalPages"],
        message: "Account pagination total is inconsistent",
      });
    }
  });

export const managedBrowserAccountResponseSchema = z.strictObject({
  account: managedBrowserAccountSchema,
});

export type AccountBrowserQuery = {
  q?: string;
  role?: (typeof ACCOUNT_BROWSER_ROLES)[number];
  status?: (typeof ACCOUNT_BROWSER_STATUSES)[number];
  page: number;
};
export type AccountBrowserStatusInput = {
  status: (typeof ACCOUNT_BROWSER_STATUSES)[number];
  expectedUpdatedAt: string;
  reason: (typeof ACCOUNT_BROWSER_REASONS)[number];
};
export type ManagedBrowserAccount = z.infer<typeof managedBrowserAccountSchema>;
export type ManagedBrowserAccountPage = z.infer<
  typeof managedBrowserAccountPageSchema
>;
