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
vi.mock("@/components/admin/admin-account-management-client", () => ({
  AdminAccountManagementClient: () => (
    <section aria-label="Account management fixture" />
  ),
}));

import AdminAccountsPage, { metadata } from "./page";

it("composes the protected account-management route", () => {
  const { container } = render(<AdminAccountsPage />);

  expect(metadata.title).toBe("Manage accounts");
  expect(container.querySelector("main#main-content")).toBeTruthy();
  const boundary = screen.getByLabelText(
    "Administrator account management workspace",
  );
  expect(boundary.getAttribute("data-forbidden-description")).toBe(
    "Only active administrators can manage student and staff accounts.",
  );
  expect(screen.getByLabelText("Account management fixture")).toBeTruthy();
});
