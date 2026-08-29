// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { PageBackLink } from "./page-back-link";

it("renders a deterministic, accessible application return link", () => {
  render(
    <PageBackLink href="/admin" className="consumer-position">
      Back to administrator overview
    </PageBackLink>,
  );

  const link = screen.getByRole("link", {
    name: "Back to administrator overview",
  });
  expect(link.getAttribute("href")).toBe("/admin");
  expect(link.className).toContain("consumer-position");
  expect(link.querySelector('[aria-hidden="true"]')).toBeTruthy();
});
