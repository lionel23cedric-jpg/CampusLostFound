import { z } from "zod";

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const CONTROL_OR_FORMAT_PATTERN = /[\p{Cc}\p{Cf}]/u;

const displayNameSchema = z
  .string()
  .refine((value) => !CONTROL_OR_FORMAT_PATTERN.test(value), {
    message: "Display name contains unsupported characters",
  })
  .transform((value) => value.normalize("NFKC").trim().replace(/\s+/gu, " "))
  .pipe(
    z
      .string()
      .min(2, "Display name must contain at least 2 characters")
      .max(80, "Display name must contain at most 80 characters"),
  );

const campusLocationIdSchema = z
  .string()
  .regex(OBJECT_ID_PATTERN, "Choose a valid campus location")
  .transform((value) => value.toLowerCase());

export const notificationSettingsSchema = z.strictObject({
  possibleMatches: z.boolean(),
  claimUpdates: z.boolean(),
  statusChanges: z.boolean(),
  handoverInstructions: z.boolean(),
});

const editableFieldsSchema = z.strictObject({
  displayName: displayNameSchema,
  preferredContactMethod: z.enum(["in_app", "email"]),
  preferredCampusLocationIds: z
    .array(campusLocationIdSchema)
    .max(5, "Choose no more than 5 campus locations")
    .superRefine((locationIds, context) => {
      if (new Set(locationIds).size !== locationIds.length) {
        context.addIssue({
          code: "custom",
          message: "Choose each campus location only once",
        });
      }
    }),
  notificationSettings: notificationSettingsSchema,
});

export const editableProfileSchema = editableFieldsSchema.extend({
  updatedAt: z.string().datetime({ offset: true }),
});

export const updateProfileSchema = editableFieldsSchema.extend({
  expectedUpdatedAt: z.string().datetime({ offset: true }),
});

export type EditableProfile = z.infer<typeof editableProfileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
