// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { AdminModerationClient } from "./admin-moderation-client";

it("provides one moderation heading and two labelled work areas", () => {
  render(<AdminModerationClient />);
  expect(screen.getByRole("heading", { level: 1, name: "Report moderation" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Flag queue" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Report visibility" })).toBeTruthy();
});
