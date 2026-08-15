import { z } from "zod";

import { REPORT_TYPES } from "@/models/item-report";

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Reference must be a valid ObjectId");

const boundedText = (label: string, minimum: number, maximum: number) =>
  z
    .string()
    .trim()
    .min(minimum, `${label} must contain at least ${minimum} characters`)
    .max(maximum, `${label} must contain at most ${maximum} characters`);

const optionalPrivateText = (label: string, maximum: number) =>
  z
    .union([
      z
        .string()
        .trim()
        .max(maximum, `${label} must contain at most ${maximum} characters`),
      z.null(),
    ])
    .optional()
    .transform((value) => (value === undefined || value === "" ? null : value));

const occurredAtSchema = z
  .string()
  .datetime({ offset: true, message: "Event date must be a valid ISO date" })
  .superRefine((value, context) => {
    if (new Date(value).getTime() > Date.now()) {
      context.addIssue({
        code: "custom",
        message: "Event date cannot be in the future",
      });
    }
  })
  .transform((value) => new Date(value));

const photoUrlSchema = z
  .string()
  .trim()
  .url("Photo URL must be valid")
  .refine(
    (value) => {
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Photo URL must use HTTPS" },
  );

const privacySettingsSchema = z
  .strictObject({
    showPhoto: z.boolean().default(true),
    showEventDate: z.boolean().default(true),
    showCampusLocation: z.boolean().default(true),
  })
  .default({
    showPhoto: true,
    showEventDate: true,
    showCampusLocation: true,
  });

const verificationQuestionSchema = z.strictObject({
  question: boundedText("Verification question", 5, 200),
  expectedAnswer: boundedText("Expected answer", 1, 500),
});

const privateVerificationSchema = z.strictObject({
  distinguishingFeatures: z
    .array(boundedText("Distinguishing feature", 1, 200))
    .min(1, "Provide at least one distinguishing feature")
    .max(10, "Provide at most 10 distinguishing features"),
  exactLocationDetails: optionalPrivateText("Exact location details", 500),
  serialNumber: optionalPrivateText("Serial number", 200),
  verificationQuestions: z
    .array(verificationQuestionSchema)
    .min(1, "Provide at least one verification question")
    .max(5, "Provide at most 5 verification questions"),
  privateNotes: optionalPrivateText("Private notes", 2000),
});

export const createReportSchema = z.strictObject({
  reportType: z.enum(REPORT_TYPES),
  title: boundedText("Title", 5, 120),
  publicDescription: boundedText("Public description", 10, 2000),
  categoryId: objectIdSchema,
  campusLocationId: objectIdSchema,
  occurredAt: occurredAtSchema,
  colors: z
    .array(boundedText("Colour", 1, 32))
    .min(1, "Provide at least one colour")
    .max(5, "Provide at most 5 colours"),
  tags: z
    .array(
      boundedText("Tag", 1, 40).transform((value) => value.toLowerCase()),
    )
    .max(10, "Provide at most 10 tags")
    .default([]),
  photoUrls: z
    .array(photoUrlSchema)
    .max(5, "Provide at most 5 photo URLs")
    .default([]),
  privacySettings: privacySettingsSchema,
  privateVerification: privateVerificationSchema,
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
