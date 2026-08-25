// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("@/components/admin/administrator-access-boundary", () => ({
  AdministratorAccessBoundary: ({ children }: { children: React.ReactNode }) => (
    <section aria-label="Administrator access fixture">{children}</section>
  ),
}));
vi.mock("@/components/admin/admin-overview-client", () => ({
  AdminOverviewClient: () => <section aria-label="Administrator overview fixture" />,
}));

import AdminPage, { metadata } from "./page";

it("composes the protected administrator overview route", () => {
  const { container } = render(<AdminPage />);

  expect(metadata.title).toBe("Administrator overview");
  expect(container.querySelector("main#main-content")).toBeTruthy();
  expect(screen.getByLabelText("Administrator access fixture")).toBeTruthy();
  expect(screen.getByLabelText("Administrator overview fixture")).toBeTruthy();
});
