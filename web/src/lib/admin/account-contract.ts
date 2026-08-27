import { z } from "zod";

import { ACCOUNT_ADMINISTRATION_REASONS } from "@/models/account-administration-event";
import { USER_STATUSES } from "@/models/user";

export const MANAGEABLE_ACCOUNT_ROLES = ["student", "staff"] as const;
export const ADMIN_ACCOUNT_PAGE_SIZE = 20;

const CONTROL_OR_FORMAT_PATTERN = /[\p{Cc}\p{Cf}]/u;
const canonicalPage = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(500));
const searchText = z
  .string()
  .refine((value) => !CONTROL_OR_FORMAT_PATTERN.test(value))
  .transform((value) => value.normalize("NFKC").trim().replace(/\s+/gu, " "))
  .pipe(z.string().min(1).max(80));

export const accountListQuerySchema = z.strictObject({
  q: searchText.optional(),
  role: z.enum(MANAGEABLE_ACCOUNT_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  page: canonicalPage.default(1),
});

export const accountUserIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/, "Account reference is invalid");

export const accountStatusInputSchema = z.strictObject({
  status: z.enum(USER_STATUSES),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  reason: z.enum(ACCOUNT_ADMINISTRATION_REASONS),
});

export const managedAccountSchema = z.strictObject({
  id: accountUserIdSchema,
  email: z.string().email(),
  displayName: z.string().min(2).max(80),
  role: z.enum(MANAGEABLE_ACCOUNT_ROLES),
  status: z.enum(USER_STATUSES),
  createdAt: z.string().datetime({ offset: true }),
  lastLoginAt: z.string().datetime({ offset: true }).nullable(),
  updatedAt: z.string().datetime({ offset: true }),
});

export const managedAccountPageSchema = z
  .strictObject({
    accounts: z.array(managedAccountSchema).max(ADMIN_ACCOUNT_PAGE_SIZE),
    pagination: z.strictObject({
      page: z.number().int().min(1).max(500),
      pageSize: z.literal(ADMIN_ACCOUNT_PAGE_SIZE),
      totalItems: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      totalPages: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    }),
  })
  .superRefine(({ pagination }, context) => {
    if (
      pagination.totalPages !==
      Math.ceil(pagination.totalItems / ADMIN_ACCOUNT_PAGE_SIZE)
    ) {
      context.addIssue({
        code: "custom",
        path: ["pagination", "totalPages"],
        message: "Account pagination total is inconsistent",
      });
    }
  });

export type AccountListQuery = z.output<typeof accountListQuerySchema>;
export type AccountStatusInput = z.infer<typeof accountStatusInputSchema>;
export type ManagedAccount = z.infer<typeof managedAccountSchema>;
export type ManagedAccountPage = z.infer<typeof managedAccountPageSchema>;

type Identifier = { toString(): string };
export type ManagedAccountUserRecord = {
  _id: Identifier;
  email: unknown;
  role: unknown;
  status: unknown;
  createdAt: Date;
  lastLoginAt: Date | null;
  updatedAt: Date;
};
export type ManagedAccountProfileRecord = { displayName: unknown };

const identifierSchema = z.custom<Identifier>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    "toString" in value &&
    typeof value.toString === "function" &&
    /^[a-f\d]{24}$/.test(value.toString()),
);
const aggregateAccountSchema = z.strictObject({
  _id: identifierSchema,
  email: z.string().email(),
  displayName: z.string().min(2).max(80),
  role: z.enum(MANAGEABLE_ACCOUNT_ROLES),
  status: z.enum(USER_STATUSES),
  createdAt: z.date(),
  lastLoginAt: z.date().nullable(),
  updatedAt: z.date(),
});
const aggregateFacetSchema = z.strictObject({
  accounts: z.array(aggregateAccountSchema).max(ADMIN_ACCOUNT_PAGE_SIZE),
  metadata: z
    .array(
      z.strictObject({
        totalItems: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      }),
    )
    .max(1),
});

export function toAccountListQueryInput(searchParams: URLSearchParams) {
  const input: Record<string, string | string[]> = {};
  for (const [key, value] of searchParams) {
    const current = input[key];
    input[key] =
      current === undefined
        ? value
        : Array.isArray(current)
          ? [...current, value]
          : [current, value];
  }
  return input;
}

export function toManagedAccount(
  user: ManagedAccountUserRecord,
  profile: ManagedAccountProfileRecord,
): ManagedAccount {
  return managedAccountSchema.parse({
    id: user._id.toString(),
    email: user.email,
    displayName: profile.displayName,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    updatedAt: user.updatedAt.toISOString(),
  });
}

export function parseManagedAccountPage(
  input: unknown,
  query: Pick<AccountListQuery, "page">,
): ManagedAccountPage {
  const facet = z.array(aggregateFacetSchema).length(1).parse(input)[0];
  const totalItems = facet.metadata[0]?.totalItems ?? 0;

  return managedAccountPageSchema.parse({
    accounts: facet.accounts.map((account) =>
      toManagedAccount(account, { displayName: account.displayName }),
    ),
    pagination: {
      page: query.page,
      pageSize: ADMIN_ACCOUNT_PAGE_SIZE,
      totalItems,
      totalPages: Math.ceil(totalItems / ADMIN_ACCOUNT_PAGE_SIZE),
    },
  });
}
