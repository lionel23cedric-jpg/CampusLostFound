// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("./admin-moderation-flag-queue", () => ({
  AdminModerationFlagQueue: () => <div data-testid="flag-queue" />,
}));
vi.mock("./admin-moderation-report-list", () => ({
  AdminModerationReportList: () => <div data-testid="report-list" />,
}));

import { AdminModerationClient } from "./admin-moderation-client";

it("provides one moderation heading and two labelled work areas", () => {
  render(<AdminModerationClient />);
  expect(screen.getByRole("heading", { level: 1, name: "Report moderation" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Flag queue" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Report visibility" })).toBeTruthy();
  expect(screen.getByTestId("flag-queue")).toBeTruthy();
  expect(screen.getByTestId("report-list")).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Back to administrator overview" })
      .getAttribute("href"),
  ).toBe("/admin");
});
