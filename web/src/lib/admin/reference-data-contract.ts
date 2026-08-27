import { z } from "zod";

export const ADMIN_REFERENCE_DATA_PAGE_SIZE = 20;
export const REFERENCE_DATA_STATUSES = ["all", "active", "inactive"] as const;

const INVALID_TEXT_PATTERN = /[\p{Cc}\p{Cf}\p{Cs}]/u;
const normalizeText = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/gu, " ");
const boundedText = (minimum: number, maximum: number) =>
  z
    .string()
    .refine((value) => !INVALID_TEXT_PATTERN.test(value))
    .transform(normalizeText)
    .pipe(z.string().min(minimum).max(maximum));
const descriptionInput = z
  .union([
    z
      .string()
      .refine((value) => !INVALID_TEXT_PATTERN.test(value))
      .trim()
      .max(300),
    z.null(),
  ])
  .transform((value) => (value === "" ? null : value));
const canonicalPage = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(10_000));
const optionalSearch = z
  .string()
  .refine((value) => !INVALID_TEXT_PATTERN.test(value))
  .transform(normalizeText)
  .pipe(z.string().max(80))
  .transform((value) => (value === "" ? undefined : value))
  .optional();

export const referenceDataListQuerySchema = z.strictObject({
  q: optionalSearch,
  status: z.enum(REFERENCE_DATA_STATUSES).default("all"),
  page: canonicalPage.default(1),
});

export const referenceDataObjectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Reference data ID is invalid")
  .transform((value) => value.toLowerCase());

export const createAdminCategorySchema = z.strictObject({
  name: boundedText(2, 80),
  description: descriptionInput.optional().transform((value) => value ?? null),
});

export const updateAdminCategorySchema = z
  .strictObject({
    updatedAt: z.string().datetime({ offset: true }),
    name: boundedText(2, 80).optional(),
    description: descriptionInput.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    ({ name, description, isActive }) =>
      name !== undefined || description !== undefined || isActive !== undefined,
    { message: "Provide at least one category change" },
  );

export const createAdminCampusLocationSchema = z.strictObject({
  campusName: boundedText(2, 80),
  locationName: boundedText(2, 120),
  description: descriptionInput.optional().transform((value) => value ?? null),
});

export const updateAdminCampusLocationSchema = z
  .strictObject({
    updatedAt: z.string().datetime({ offset: true }),
    campusName: boundedText(2, 80).optional(),
    locationName: boundedText(2, 120).optional(),
    description: descriptionInput.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    ({ campusName, locationName, description, isActive }) =>
      campusName !== undefined ||
      locationName !== undefined ||
      description !== undefined ||
      isActive !== undefined,
    { message: "Provide at least one campus location change" },
  );

export const adminCategorySchema = z.strictObject({
  id: referenceDataObjectIdSchema,
  name: z.string().min(2).max(80),
  description: z.string().max(300).nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const adminCampusLocationSchema = z.strictObject({
  id: referenceDataObjectIdSchema,
  campusName: z.string().min(2).max(80),
  locationName: z.string().min(2).max(120),
  description: z.string().max(300).nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

const paginationFields = {
  page: z.number().int().min(1).max(10_000),
  pageSize: z.literal(ADMIN_REFERENCE_DATA_PAGE_SIZE),
  total: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  totalPages: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
};
const hasConsistentPagination = ({
  total,
  totalPages,
}: {
  total: number;
  totalPages: number;
}) => totalPages === Math.ceil(total / ADMIN_REFERENCE_DATA_PAGE_SIZE);

export const adminCategoryPageSchema = z
  .strictObject({
    categories: z.array(adminCategorySchema).max(ADMIN_REFERENCE_DATA_PAGE_SIZE),
    ...paginationFields,
  })
  .refine(hasConsistentPagination, {
    message: "Reference data pagination total is inconsistent",
  });

export const adminCampusLocationPageSchema = z
  .strictObject({
    campusLocations: z
      .array(adminCampusLocationSchema)
      .max(ADMIN_REFERENCE_DATA_PAGE_SIZE),
    ...paginationFields,
  })
  .refine(hasConsistentPagination, {
    message: "Reference data pagination total is inconsistent",
  });

export type ReferenceDataListQuery = z.output<
  typeof referenceDataListQuerySchema
>;
export type CreateAdminCategoryInput = z.output<
  typeof createAdminCategorySchema
>;
export type UpdateAdminCategoryInput = z.output<
  typeof updateAdminCategorySchema
>;
export type CreateAdminCampusLocationInput = z.output<
  typeof createAdminCampusLocationSchema
>;
export type UpdateAdminCampusLocationInput = z.output<
  typeof updateAdminCampusLocationSchema
>;
export type AdminCategory = z.infer<typeof adminCategorySchema>;
export type AdminCampusLocation = z.infer<typeof adminCampusLocationSchema>;
export type AdminCategoryPage = z.infer<typeof adminCategoryPageSchema>;
export type AdminCampusLocationPage = z.infer<
  typeof adminCampusLocationPageSchema
>;

type Identifier = { toString(): string };
export type AdminCategoryRecord = {
  _id: Identifier;
  name: unknown;
  description?: unknown;
  isActive: unknown;
  createdAt: Date;
  updatedAt: Date;
};
export type AdminCampusLocationRecord = {
  _id: Identifier;
  campusName: unknown;
  locationName: unknown;
  description?: unknown;
  isActive: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export function toReferenceDataListQueryInput(searchParams: URLSearchParams) {
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

export function toAdminCategory(record: AdminCategoryRecord): AdminCategory {
  return adminCategorySchema.parse({
    id: record._id.toString(),
    name: record.name,
    description: record.description ?? null,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

export function toAdminCampusLocation(
  record: AdminCampusLocationRecord,
): AdminCampusLocation {
  return adminCampusLocationSchema.parse({
    id: record._id.toString(),
    campusName: record.campusName,
    locationName: record.locationName,
    description: record.description ?? null,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}
