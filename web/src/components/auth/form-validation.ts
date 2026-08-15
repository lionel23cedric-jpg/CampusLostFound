import { z } from "zod";

import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from "@/lib/auth/validation";

export type LoginFormValues = { email: string; password: string };
export type RegisterFormValues = LoginFormValues & {
  displayName: string;
  confirmPassword: string;
};

export type LoginFieldErrors = Partial<Record<keyof LoginFormValues, string>>;
export type RegisterFieldErrors = Partial<Record<keyof RegisterFormValues, string>>;

export type ValidationResult<TData, TErrors> =
  | { success: true; data: TData }
  | { success: false; errors: TErrors };

function firstFieldErrors<TErrors>(error: z.ZodError): TErrors {
  const fields = z.flattenError(error).fieldErrors as Record<
    string,
    string[] | undefined
  >;

  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, messages]) => messages?.[0])
      .map(([field, messages]) => [field, messages?.[0]]),
  ) as TErrors;
}

export function validateLoginForm(
  values: LoginFormValues,
): ValidationResult<LoginInput, LoginFieldErrors> {
  const result = loginSchema.safeParse(values);

  return result.success
    ? { success: true, data: result.data }
    : { success: false, errors: firstFieldErrors<LoginFieldErrors>(result.error) };
}

export function validateRegisterForm(
  values: RegisterFormValues,
): ValidationResult<RegisterInput, RegisterFieldErrors> {
  const result = registerSchema.safeParse({
    displayName: values.displayName,
    email: values.email,
    password: values.password,
  });
  const errors = result.success
    ? ({} as RegisterFieldErrors)
    : firstFieldErrors<RegisterFieldErrors>(result.error);

  if (values.password !== values.confirmPassword) {
    errors.confirmPassword = "Passwords must match";
  }

  if (!result.success || Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  return { success: true, data: result.data };
}
