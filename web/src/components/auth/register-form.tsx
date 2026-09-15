"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { BrowserAuthError, registerAccount } from "@/lib/auth/browser-client";

import styles from "./auth-form.module.css";
import { useAuthSession } from "./auth-session-provider";
import { FieldError, FormAlert } from "./form-message";
import {
  validateRegisterForm,
  type RegisterFieldErrors,
  type RegisterFormValues,
} from "./form-validation";
import { PasswordField } from "./password-field";

const GENERIC_ERROR = "We could not complete that request. Please try again.";

export function RegisterForm() {
  const router = useRouter();
  const { status, setAuthenticatedUser } = useAuthSession();
  const [values, setValues] = useState<RegisterFormValues>({
    displayName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<RegisterFieldErrors>({});
  const [formMessage, setFormMessage] = useState<string>();
  const [isPending, setIsPending] = useState(false);
  const displayNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [router, status]);

  function focusFirstInvalid(nextErrors: RegisterFieldErrors) {
    if (nextErrors.displayName) {
      displayNameRef.current?.focus();
    } else if (nextErrors.email) {
      emailRef.current?.focus();
    } else if (nextErrors.password) {
      passwordRef.current?.focus();
    } else if (nextErrors.confirmPassword) {
      confirmPasswordRef.current?.focus();
    }
  }

  function updateValue(field: keyof RegisterFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    setFormMessage(undefined);
    const validation = validateRegisterForm(values);

    if (!validation.success) {
      setErrors(validation.errors);
      focusFirstInvalid(validation.errors);
      return;
    }

    setErrors({});
    setIsPending(true);

    try {
      const user = await registerAccount(validation.data);
      setAuthenticatedUser(user);
      router.replace("/dashboard");
    } catch (error) {
      if (error instanceof BrowserAuthError) {
        const serverErrors: RegisterFieldErrors = {
          displayName: error.fields?.displayName?.[0],
          email: error.fields?.email?.[0],
          password: error.fields?.password?.[0],
        };

        if (error.code === "EMAIL_ALREADY_REGISTERED") {
          serverErrors.email = error.message;
          setFormMessage(error.message);
        } else if (!serverErrors.displayName && !serverErrors.email && !serverErrors.password) {
          setFormMessage(GENERIC_ERROR);
        }

        setErrors(serverErrors);
        focusFirstInvalid(serverErrors);
      } else {
        setFormMessage(GENERIC_ERROR);
      }
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.field}>
        <label htmlFor="displayName">Display name</label>
        <input
          ref={displayNameRef}
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          value={values.displayName}
          onChange={(event) => updateValue("displayName", event.target.value)}
          disabled={isPending}
          aria-invalid={Boolean(errors.displayName)}
          aria-describedby={
            errors.displayName
              ? "displayName-hint displayName-error"
              : "displayName-hint"
          }
        />
        <p className={styles.hint} id="displayName-hint">
          Use 2–80 characters.
        </p>
        <FieldError id="displayName-error" message={errors.displayName} />
      </div>

      <div className={styles.field}>
        <label htmlFor="email">Email address</label>
        <input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(event) => updateValue("email", event.target.value)}
          disabled={isPending}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "email-hint email-error" : "email-hint"}
        />
        <p className={styles.hint} id="email-hint">
          Use a valid email address, for example name@example.com.
        </p>
        <FieldError id="email-error" message={errors.email} />
      </div>

      <PasswordField
        ref={passwordRef}
        id="password"
        label="Password"
        autoComplete="new-password"
        value={values.password}
        onChange={(event) => updateValue("password", event.target.value)}
        hint="Use 10–128 characters."
        error={errors.password}
        disabled={isPending}
      />

      <PasswordField
        ref={confirmPasswordRef}
        id="confirmPassword"
        label="Confirm password"
        autoComplete="new-password"
        value={values.confirmPassword}
        onChange={(event) => updateValue("confirmPassword", event.target.value)}
        hint="Enter the same password again."
        error={errors.confirmPassword}
        disabled={isPending}
      />

      <FormAlert message={formMessage} />

      <button className={styles.submit} type="submit" disabled={isPending}>
        {isPending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
