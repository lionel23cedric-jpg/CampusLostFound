// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";

import { PasswordField } from "./password-field";

afterEach(cleanup);

function PasswordHarness() {
  const [value, setValue] = useState("secure pass");

  return (
    <PasswordField
      id="password"
      label="Password"
      autoComplete="current-password"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      error="Password is invalid"
    />
  );
}

it("labels the password field and toggles visibility by pointer and keyboard", async () => {
  const user = userEvent.setup();
  render(<PasswordHarness />);

  const input = screen.getByLabelText("Password");
  expect(input.getAttribute("type")).toBe("password");
  expect(input.getAttribute("autocomplete")).toBe("current-password");
  expect(input.getAttribute("aria-describedby")).toBe("password-error");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByText("Password is invalid").getAttribute("id")).toBe(
    "password-error",
  );

  await user.click(screen.getByRole("button", { name: "Show password" }));
  expect(input.getAttribute("type")).toBe("text");
  expect(
    screen.getByRole("button", { name: "Hide password" }).getAttribute("aria-pressed"),
  ).toBe("true");

  await user.keyboard("{Enter}");
  expect(input.getAttribute("type")).toBe("password");
});
