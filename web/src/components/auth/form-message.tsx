type FieldErrorProps = {
  id: string;
  message?: string;
};

export function FieldError({ id, message }: FieldErrorProps) {
  return message ? (
    <p className="field-error" id={id} role="alert">
      {message}
    </p>
  ) : null;
}

export function FormAlert({ message }: { message?: string }) {
  return message ? (
    <p className="form-alert" role="alert" aria-live="assertive">
      {message}
    </p>
  ) : null;
}
