"use client";

import { forwardRef, useState, type ChangeEventHandler } from "react";

import { FieldError } from "./form-message";

type PasswordFieldProps = {
  id: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  error?: string;
  disabled?: boolean;
};

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField({ id, label, autoComplete, value, onChange, error, disabled }, ref) {
    const [isVisible, setIsVisible] = useState(false);
    const errorId = `${id}-error`;

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
            aria-describedby={error ? errorId : undefined}
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
        <FieldError id={errorId} message={error} />
      </div>
    );
  },
);
