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
    <section aria-label={workspaceLabel} data-forbidden-description={forbiddenDescription}>
      {children}
    </section>
  ),
}));
vi.mock("@/components/admin/admin-moderation-client", () => ({
  AdminModerationClient: () => <section data-testid="moderation-client" />,
}));

import AdminModerationPage, { metadata } from "./page";

it("composes the protected moderation route", () => {
  const { container } = render(<AdminModerationPage />);
  expect(metadata.title).toBe("Report moderation");
  expect(container.querySelector("main#main-content")).toBeTruthy();
  const boundary = screen.getByLabelText("Administrator report moderation workspace");
  expect(boundary.getAttribute("data-forbidden-description")).toBe(
    "Only active administrators can review flagged reports and report visibility.",
  );
  expect(screen.getByTestId("moderation-client")).toBeTruthy();
});
