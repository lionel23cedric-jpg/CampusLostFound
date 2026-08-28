import { z } from "zod";

import type { CreateReportInput } from "./validation";

export type TextFormRow = { id: string; value: string };
export type VerificationFormRow = {
  id: string;
  question: string;
  expectedAnswer: string;
};

export type ReportFormValues = {
  reportType: "lost" | "found";
  title: string;
  publicDescription: string;
  categoryId: string;
  campusLocationId: string;
  occurredAt: string;
  colors: string;
  tags: string;
  privacySettings: {
    showPhoto: boolean;
    showEventDate: boolean;
    showCampusLocation: boolean;
  };
  privateVerification: {
    distinguishingFeatures: TextFormRow[];
    exactLocationDetails: string;
    serialNumber: string;
    verificationQuestions: VerificationFormRow[];
    privateNotes: string;
  };
};

export type ReportFormErrors = Record<string, string[]>;

export type ReportFormValidation =
  | { success: true; data: CreateReportInput }
  | { success: false; errors: ReportFormErrors };

const textRowSchema = z.strictObject({
  id: z.string(),
  value: z.string(),
});

const boundedText = (label: string, minimum: number, maximum: number) =>
  z
    .string()
    .trim()
    .min(minimum, `${label} must contain at least ${minimum} characters`)
    .max(maximum, `${label} must contain at most ${maximum} characters`);

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Reference must be a valid ObjectId");

const optionalPrivateText = (label: string, maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum, `${label} must contain at most ${maximum} characters`)
    .transform((value) => value || null);

const commaSeparated = (
  label: string,
  minimum: number,
  maximum: number,
  itemMaximum: number,
) =>
  z
    .string()
    .transform((value) =>
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(boundedText(label, 1, itemMaximum))
        .min(minimum, `Provide at least ${minimum} ${label.toLowerCase()}`)
        .max(maximum, `Provide at most ${maximum} ${label.toLowerCase()}s`),
    );

function parseLocalDateTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    value,
  );
  if (!match) return null;

  const [, year, month, day, hour, minute, second = "0"] = match;
  const date = new Date(value);

  return !Number.isNaN(date.getTime()) &&
    date.getFullYear() === Number(year) &&
    date.getMonth() + 1 === Number(month) &&
    date.getDate() === Number(day) &&
    date.getHours() === Number(hour) &&
    date.getMinutes() === Number(minute) &&
    date.getSeconds() === Number(second)
    ? date
    : null;
}

const localDateTimeSchema = z
  .string()
  .trim()
  .superRefine((value, context) => {
    if (!value) {
      context.addIssue({ code: "custom", message: "Event date is required" });
      return;
    }

    const date = parseLocalDateTime(value);
    if (!date) {
      context.addIssue({
        code: "custom",
        message: "Event date must be a valid local date and time",
      });
    } else if (date.getTime() > Date.now()) {
      context.addIssue({
        code: "custom",
        message: "Event date cannot be in the future",
      });
    }
  })
  .transform((value) => parseLocalDateTime(value) ?? new Date(Number.NaN));

const formSchema = z.strictObject({
  reportType: z.enum(["lost", "found"]),
  title: boundedText("Title", 5, 120),
  publicDescription: boundedText("Public description", 10, 2000),
  categoryId: objectIdSchema,
  campusLocationId: objectIdSchema,
  occurredAt: localDateTimeSchema,
  colors: commaSeparated("Colour", 1, 5, 32),
  tags: commaSeparated("Tag", 0, 10, 40).transform((tags) =>
    tags.map((tag) => tag.toLowerCase()),
  ),
  privacySettings: z.strictObject({
    showPhoto: z.boolean(),
    showEventDate: z.boolean(),
    showCampusLocation: z.boolean(),
  }),
  privateVerification: z.strictObject({
    distinguishingFeatures: z
      .array(textRowSchema)
      .transform((rows) => rows.map((row) => row.value.trim()))
      .pipe(
        z
          .array(boundedText("Distinguishing feature", 1, 200))
          .min(1, "Provide at least one distinguishing feature")
          .max(10, "Provide at most 10 distinguishing features"),
      ),
    exactLocationDetails: optionalPrivateText("Exact location details", 500),
    serialNumber: optionalPrivateText("Serial number", 200),
    verificationQuestions: z
      .array(
        z.strictObject({
          id: z.string(),
          question: boundedText("Verification question", 5, 200),
          expectedAnswer: boundedText("Expected answer", 1, 500),
        }),
      )
      .min(1, "Provide at least one verification question")
      .max(5, "Provide at most 5 verification questions")
      .transform((rows) =>
        rows.map(({ question, expectedAnswer }) => ({
          question,
          expectedAnswer,
        })),
      ),
    privateNotes: optionalPrivateText("Private notes", 2000),
  }),
});

function toDottedErrors(error: z.ZodError): ReportFormErrors {
  return error.issues.reduce<ReportFormErrors>((errors, issue) => {
    const path = issue.path.join(".") || "_form";
    (errors[path] ??= []).push(issue.message);
    return errors;
  }, {});
}

export function createInitialReportFormValues(): ReportFormValues {
  return {
    reportType: "lost",
    title: "",
    publicDescription: "",
    categoryId: "",
    campusLocationId: "",
    occurredAt: "",
    colors: "",
    tags: "",
    privacySettings: {
      showPhoto: true,
      showEventDate: true,
      showCampusLocation: true,
    },
    privateVerification: {
      distinguishingFeatures: [{ id: "feature-0", value: "" }],
      exactLocationDetails: "",
      serialNumber: "",
      verificationQuestions: [
        { id: "question-0", question: "", expectedAnswer: "" },
      ],
      privateNotes: "",
    },
  };
}

export function validateReportForm(
  values: ReportFormValues,
): ReportFormValidation {
  const result = formSchema.safeParse(values);

  if (!result.success) {
    return {
      success: false,
      errors: toDottedErrors(result.error),
    };
  }

  const data: CreateReportInput = { ...result.data, photoUrls: [] };
  return { success: true, data };
}
