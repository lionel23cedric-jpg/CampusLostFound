// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("@/components/admin/administrator-access-boundary", () => ({
  AdministratorAccessBoundary: ({
    children,
    workspaceLabel,
    forbiddenDescription,
  }: {
    children: React.ReactNode;
    workspaceLabel?: string;
    forbiddenDescription?: string;
  }) => (
    <section
      aria-label={workspaceLabel}
      data-forbidden-description={forbiddenDescription}
    >
      {children}
    </section>
  ),
}));
vi.mock("@/components/admin/admin-reference-data-client", () => ({
  AdminReferenceDataClient: () => (
    <section data-testid="reference-data-client" />
  ),
}));

import AdminReferenceDataPage, { metadata } from "./page";

it("composes the protected reference-data route", () => {
  const { container } = render(<AdminReferenceDataPage />);

  expect(metadata.title).toBe("Manage reference data");
  expect(container.querySelector("main#main-content")).toBeTruthy();
  expect(container.querySelectorAll("main")).toHaveLength(1);
  const boundary = screen.getByLabelText(
    "Administrator reference data management workspace",
  );
  expect(boundary.getAttribute("data-forbidden-description")).toBe(
    "Only active administrators can manage report categories and campus locations.",
  );
  expect(screen.getByTestId("reference-data-client")).toBeTruthy();
});
