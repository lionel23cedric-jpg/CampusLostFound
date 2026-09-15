// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import Home from "./page";

afterEach(cleanup);

it("presents the real product workflow without fake report links", () => {
  const { container } = render(<Home />);

  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "Lost something? Let the campus help.",
    }),
  ).toBeTruthy();
  expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href")).toBe(
    "/register",
  );
  expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
  expect(screen.getByRole("heading", { name: "How Campus Find works" })).toBeTruthy();
  expect(screen.getByText(/ownership-verification details stay private/i)).toBeTruthy();
  expect(screen.getByText("Illustrative campus notices")).toBeTruthy();
  expect(
    screen.getByText("These are examples. Signed-in members can browse live reports."),
  ).toBeTruthy();
  expect(screen.queryByRole("link", { name: /browse reports/i })).toBeNull();
  expect(container.querySelectorAll("main#main-content")).toHaveLength(1);
  expect(screen.getAllByRole("listitem", { name: /workflow:/i })).toHaveLength(3);
  const hero = screen.getByRole("img", {
    name: /found belongings on a campus bench/i,
  });
  expect(decodeURIComponent(hero.getAttribute("src") ?? "")).toContain(
    "/campus-find-hero.webp",
  );
});
