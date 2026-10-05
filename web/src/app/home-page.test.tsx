// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import Home from "./page";

afterEach(cleanup);

it("offers clear report and browse actions on the illustrated public homepage", () => {
  const { container } = render(<Home />);

  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "Lost. Found. Back together.",
    }),
  ).toBeTruthy();
  expect(screen.getByRole("link", { name: "Report a lost item" }).getAttribute("href")).toBe(
    "/reports/new",
  );
  expect(screen.getByRole("link", { name: "Report a found item" }).getAttribute("href")).toBe(
    "/reports/new",
  );
  expect(screen.getByRole("link", { name: "Browse reports" }).getAttribute("href")).toBe(
    "/reports",
  );
  expect(screen.getByRole("heading", { name: "How things find their way home" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Share what you know" }).getAttribute("href")).toBe(
    "/reports/new",
  );
  expect(screen.getByRole("link", { name: "Spot a possible match" }).getAttribute("href")).toBe(
    "/reports",
  );
  expect(screen.getByRole("link", { name: "Return it safely" }).getAttribute("href")).toBe(
    "/claims",
  );
  expect(screen.getByText(/ownership evidence stays out of public reports/i)).toBeTruthy();
  expect(screen.queryByText("Illustrative campus notices")).toBeNull();
  expect(container.querySelectorAll("main#main-content")).toHaveLength(1);
  expect(container.querySelectorAll('svg[aria-hidden="true"]').length).toBeGreaterThanOrEqual(4);
  expect(container.querySelectorAll("img")).toHaveLength(0);
});
