"use client";

import { forwardRef, useState, type ChangeEventHandler } from "react";

import { FieldError } from "./form-message";

type PasswordFieldProps = {
  id: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  hint?: string;
  error?: string;
  disabled?: boolean;
};

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField(
    { id, label, autoComplete, value, onChange, hint, error, disabled },
    ref,
  ) {
    const [isVisible, setIsVisible] = useState(false);
    const hintId = `${id}-hint`;
    const errorId = `${id}-error`;
    const describedBy = [hint ? hintId : undefined, error ? errorId : undefined]
      .filter(Boolean)
      .join(" ") || undefined;

    return (
      <div className="form-field">
        <label htmlFor={id}>{label}</label>
        <div className="password-control">
          <input
            ref={ref}
            id={id}
            name={id}
            autoComplete={autoComplete}
            type={isVisible ? "text" : "password"}
            value={value}
            onChange={onChange}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setIsVisible((visible) => !visible)}
            disabled={disabled}
            aria-pressed={isVisible}
            aria-label={isVisible ? "Hide password" : "Show password"}
          >
            {isVisible ? "Hide" : "Show"}
          </button>
        </div>
        {hint ? (
          <p className="field-hint" id={hintId}>
            {hint}
          </p>
        ) : null}
        <FieldError id={errorId} message={error} />
      </div>
    );
  },
);
