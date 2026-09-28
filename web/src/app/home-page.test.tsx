// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import Home from "./page";

afterEach(cleanup);

it("presents visual recovery pathways that lead to real product routes", () => {
  const { container } = render(<Home />);

  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "Lost something? Let the campus help.",
    }),
  ).toBeTruthy();
  expect(screen.getByRole("link", { name: "Report a lost item" }).getAttribute("href")).toBe(
    "/reports/new",
  );
  expect(screen.getByRole("link", { name: "Report a found item" }).getAttribute("href")).toBe(
    "/reports/new",
  );
  expect(screen.getByRole("link", { name: "Search reports" }).getAttribute("href")).toBe(
    "/reports",
  );
  expect(screen.getByRole("heading", { name: "How Campus Find works" })).toBeTruthy();
  expect(screen.getByText(/ownership-verification details stay private/i)).toBeTruthy();
  expect(screen.queryByText("Illustrative campus notices")).toBeNull();
  expect(container.querySelectorAll("main#main-content")).toHaveLength(1);
  expect(screen.getAllByRole("listitem", { name: /recovery step:/i })).toHaveLength(3);
  expect(screen.getAllByRole("img")).toHaveLength(4);
  const hero = screen.getByRole("img", {
    name: /found belongings on a campus bench/i,
  });
  expect(decodeURIComponent(hero.getAttribute("src") ?? "")).toContain(
    "/campus-find-hero.webp",
  );
  const matchingImage = screen.getByRole("img", {
    name: /campus notification for a possible item match/i,
  });
  expect(decodeURIComponent(matchingImage.getAttribute("src") ?? "")).toContain(
    "/illustrations/notifications-campus-match.webp",
  );
});
