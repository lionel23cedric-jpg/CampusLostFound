// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("@/components/notifications/notification-access-boundary", () => ({
  NotificationAccessBoundary: ({ children }: { children: React.ReactNode }) => (
    <section aria-label="Notification access fixture">{children}</section>
  ),
}));
vi.mock("@/components/notifications/notification-centre", () => ({
  NotificationCentre: () => <section aria-label="Notification centre fixture" />,
}));

import NotificationsPage, { metadata } from "./page";

it("composes the protected notification centre route", () => {
  const { container } = render(<NotificationsPage />);

  expect(metadata.title).toBe("Notifications");
  expect(container.querySelector("main#main-content")).toBeTruthy();
  expect(screen.getByLabelText("Notification access fixture")).toBeTruthy();
  expect(screen.getByLabelText("Notification centre fixture")).toBeTruthy();
});
