export function normaliseVerificationAnswer(value: string) {
  return value
    .normalize("NFKC")
    .replace(/^[\p{White_Space}\uFEFF]+|[\p{White_Space}\uFEFF]+$/gu, "")
    .replace(/\p{White_Space}+/gu, " ")
    .toLocaleLowerCase("en-NZ");
}

export function matchesVerificationAnswer(
  expected: string,
  submitted: string,
) {
  return (
    normaliseVerificationAnswer(expected) ===
    normaliseVerificationAnswer(submitted)
  );
}
