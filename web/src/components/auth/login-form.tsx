"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { BrowserAuthError, loginAccount } from "@/lib/auth/browser-client";

import styles from "./auth-form.module.css";
import { useAuthSession } from "./auth-session-provider";
import { FieldError, FormAlert } from "./form-message";
import {
  validateLoginForm,
  type LoginFieldErrors,
  type LoginFormValues,
} from "./form-validation";
import { PasswordField } from "./password-field";

const GENERIC_ERROR = "We could not complete that request. Please try again.";

export function LoginForm() {
  const router = useRouter();
  const { status, setAuthenticatedUser } = useAuthSession();
  const [values, setValues] = useState<LoginFormValues>({ email: "", password: "" });
  const [errors, setErrors] = useState<LoginFieldErrors>({});
  const [formMessage, setFormMessage] = useState<string>();
  const [isPending, setIsPending] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [router, status]);

  function focusFirstInvalid(nextErrors: LoginFieldErrors) {
    if (nextErrors.email) {
      emailRef.current?.focus();
    } else if (nextErrors.password) {
      passwordRef.current?.focus();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    setFormMessage(undefined);
    const validation = validateLoginForm(values);

    if (!validation.success) {
      setErrors(validation.errors);
      focusFirstInvalid(validation.errors);
      return;
    }

    setErrors({});
    setIsPending(true);

    try {
      const user = await loginAccount(validation.data);
      setAuthenticatedUser(user);
      router.replace("/dashboard");
    } catch (error) {
      if (error instanceof BrowserAuthError) {
        const serverErrors: LoginFieldErrors = {
          email: error.fields?.email?.[0],
          password: error.fields?.password?.[0],
        };

        if (serverErrors.email || serverErrors.password) {
          setErrors(serverErrors);
          focusFirstInvalid(serverErrors);
        }

        if (error.code === "INVALID_CREDENTIALS" || error.code === "ACCOUNT_UNAVAILABLE") {
          setFormMessage(error.message);
        } else if (!serverErrors.email && !serverErrors.password) {
          setFormMessage(GENERIC_ERROR);
        }
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
        <label htmlFor="email">Email address</label>
        <input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(event) => {
            setValues((current) => ({ ...current, email: event.target.value }));
            setErrors((current) => ({ ...current, email: undefined }));
          }}
          disabled={isPending}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "email-error" : undefined}
        />
        <FieldError id="email-error" message={errors.email} />
      </div>

      <PasswordField
        ref={passwordRef}
        id="password"
        label="Password"
        autoComplete="current-password"
        value={values.password}
        onChange={(event) => {
          setValues((current) => ({ ...current, password: event.target.value }));
          setErrors((current) => ({ ...current, password: undefined }));
        }}
        error={errors.password}
        disabled={isPending}
      />

      <FormAlert message={formMessage} />

      <button className={styles.submit} type="submit" disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in securely"}
      </button>
    </form>
  );
}
