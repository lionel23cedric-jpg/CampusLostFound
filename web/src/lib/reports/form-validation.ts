import { z } from "zod";

import {
  createReportSchema,
  type CreateReportInput,
} from "./validation";

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
  photoUrls: TextFormRow[];
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
  .transform((value) => parseLocalDateTime(value)?.toISOString() ?? value);

const photoRowsSchema = z
  .array(textRowSchema)
  .superRefine((rows, context) => {
    const nonblank = rows.filter((row) => row.value.trim());
    if (nonblank.length > 5) {
      context.addIssue({
        code: "custom",
        message: "Provide at most 5 photo URLs",
      });
    }

    rows.forEach((row, index) => {
      const value = row.value.trim();
      if (!value) return;

      try {
        if (new URL(value).protocol !== "https:") throw new Error();
      } catch {
        context.addIssue({
          code: "custom",
          path: [index],
          message: "Photo URL must be a valid HTTPS URL",
        });
      }
    });
  })
  .transform((rows) =>
    rows.map((row) => row.value.trim()).filter(Boolean),
  );

const formSchema = z.strictObject({
  reportType: z.enum(["lost", "found"]),
  title: boundedText("Title", 5, 120),
  publicDescription: boundedText("Public description", 10, 2000),
  categoryId: z.string(),
  campusLocationId: z.string(),
  occurredAt: localDateTimeSchema,
  colors: commaSeparated("Colour", 1, 5, 32),
  tags: commaSeparated("Tag", 0, 10, 40).transform((tags) =>
    tags.map((tag) => tag.toLowerCase()),
  ),
  photoUrls: photoRowsSchema,
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
    exactLocationDetails: z.string(),
    serialNumber: z.string(),
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
    privateNotes: z.string(),
  }),
});

function toDottedErrors(error: z.ZodError): ReportFormErrors {
  return error.issues.reduce<ReportFormErrors>((errors, issue) => {
    const path = issue.path.join(".") || "_form";
    (errors[path] ??= []).push(issue.message);
    return errors;
  }, {});
}

export function createInitialReportFormValues(
  createId: () => string = () => crypto.randomUUID(),
): ReportFormValues {
  return {
    reportType: "lost",
    title: "",
    publicDescription: "",
    categoryId: "",
    campusLocationId: "",
    occurredAt: "",
    colors: "",
    tags: "",
    photoUrls: [{ id: createId(), value: "" }],
    privacySettings: {
      showPhoto: true,
      showEventDate: true,
      showCampusLocation: true,
    },
    privateVerification: {
      distinguishingFeatures: [{ id: createId(), value: "" }],
      exactLocationDetails: "",
      serialNumber: "",
      verificationQuestions: [
        { id: createId(), question: "", expectedAnswer: "" },
      ],
      privateNotes: "",
    },
  };
}

export function validateReportForm(
  values: ReportFormValues,
): ReportFormValidation {
  const browserResult = formSchema.safeParse(values);

  if (!browserResult.success) {
    return {
      success: false,
      errors: toDottedErrors(browserResult.error),
    };
  }

  const result = createReportSchema.safeParse(browserResult.data);

  return result.success
    ? { success: true, data: result.data }
    : { success: false, errors: toDottedErrors(result.error) };
}
