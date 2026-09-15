// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mounts = vi.hoisted(() => ({ categories: 0, campusLocations: 0 }));

vi.mock("./category-management-panel", async () => {
  const { useEffect } = await import("react");
  return {
    CategoryManagementPanel() {
      useEffect(() => {
        mounts.categories += 1;
      }, []);
      return <input data-testid="category-panel" aria-label="Category draft" />;
    },
  };
});

vi.mock("./campus-location-management-panel", async () => {
  const { useEffect } = await import("react");
  return {
    CampusLocationManagementPanel() {
      useEffect(() => {
        mounts.campusLocations += 1;
      }, []);
      return (
        <input data-testid="campus-location-panel" aria-label="Campus location draft" />
      );
    },
  };
});

import { AdminReferenceDataClient } from "./admin-reference-data-client";

beforeEach(() => {
  mounts.categories = 0;
  mounts.campusLocations = 0;
});

afterEach(cleanup);

it("renders one labelled manual-activation tablist with stable relationships", () => {
  render(<AdminReferenceDataClient />);

  expect(
    screen
      .getByRole("link", { name: "Back to administrator overview" })
      .getAttribute("href"),
  ).toBe("/admin");
  expect(screen.queryByRole("main")).toBeNull();
  expect(screen.getByRole("heading", { name: "Manage reference data" })).toBeTruthy();
  expect(
    screen.getByText(
      "Deactivated choices are removed from future report selections while historical report references remain available.",
    ),
  ).toBeTruthy();
  const tablist = screen.getByRole("tablist", { name: "Reference data resources" });
  const tabs = screen.getAllByRole("tab");
  expect(tablist).toBeTruthy();
  expect(tabs).toHaveLength(2);

  const categories = screen.getByRole("tab", { name: "Categories" });
  const campusLocations = screen.getByRole("tab", { name: "Campus locations" });
  expect(categories.id).toBe("reference-data-tab-categories");
  expect(categories.getAttribute("aria-selected")).toBe("true");
  expect(categories.getAttribute("aria-controls")).toBe(
    "reference-data-panel-categories",
  );
  expect(categories.getAttribute("tabindex")).toBe("0");
  expect(campusLocations.id).toBe("reference-data-tab-campus-locations");
  expect(campusLocations.getAttribute("aria-selected")).toBe("false");
  expect(campusLocations.getAttribute("aria-controls")).toBe(
    "reference-data-panel-campus-locations",
  );
  expect(campusLocations.getAttribute("tabindex")).toBe("-1");

  const categoryPanel = screen.getByTestId("category-panel").closest("[role=tabpanel]");
  expect(categoryPanel?.id).toBe("reference-data-panel-categories");
  expect(categoryPanel?.getAttribute("aria-labelledby")).toBe(
    "reference-data-tab-categories",
  );
  expect(categoryPanel?.hasAttribute("hidden")).toBe(false);
  expect(screen.queryByTestId("campus-location-panel")).toBeNull();
  expect(mounts).toEqual({ categories: 1, campusLocations: 0 });
});

it("mounts campus locations lazily and preserves both drafts across switches", async () => {
  const user = userEvent.setup();
  render(<AdminReferenceDataClient />);

  await user.type(screen.getByLabelText("Category draft"), "category draft");
  await user.click(screen.getByRole("tab", { name: "Campus locations" }));

  const categoryPanel = screen.getByTestId("category-panel").closest("[role=tabpanel]");
  const campusInput = screen.getByLabelText("Campus location draft");
  const campusPanel = campusInput.closest("[role=tabpanel]");
  expect(categoryPanel?.hasAttribute("hidden")).toBe(true);
  expect(campusPanel?.id).toBe("reference-data-panel-campus-locations");
  expect(campusPanel?.getAttribute("aria-labelledby")).toBe(
    "reference-data-tab-campus-locations",
  );
  expect(campusPanel?.hasAttribute("hidden")).toBe(false);

  await user.type(campusInput, "campus draft");
  await user.click(screen.getByRole("tab", { name: "Categories" }));
  await user.click(screen.getByRole("tab", { name: "Campus locations" }));
  expect((screen.getByLabelText("Category draft") as HTMLInputElement).value).toBe(
    "category draft",
  );
  expect(
    (screen.getByLabelText("Campus location draft") as HTMLInputElement).value,
  ).toBe("campus draft");
  expect(mounts).toEqual({ categories: 1, campusLocations: 1 });
});

it("moves focus without activation and activates only with Enter or Space", async () => {
  const user = userEvent.setup();
  render(<AdminReferenceDataClient />);
  const categories = screen.getByRole("tab", { name: "Categories" });
  const campusLocations = screen.getByRole("tab", { name: "Campus locations" });

  categories.focus();
  await user.keyboard("{ArrowRight}");
  expect(document.activeElement).toBe(campusLocations);
  expect(categories.getAttribute("aria-selected")).toBe("true");
  expect(screen.queryByTestId("campus-location-panel")).toBeNull();

  await user.keyboard("{Enter}");
  expect(campusLocations.getAttribute("aria-selected")).toBe("true");
  expect(screen.getByTestId("campus-location-panel")).toBeTruthy();

  await user.keyboard("{ArrowLeft}");
  expect(document.activeElement).toBe(categories);
  expect(campusLocations.getAttribute("aria-selected")).toBe("true");
  await user.keyboard(" ");
  expect(categories.getAttribute("aria-selected")).toBe("true");
});

it("wraps arrow focus and supports Home and End", async () => {
  const user = userEvent.setup();
  render(<AdminReferenceDataClient />);
  const categories = screen.getByRole("tab", { name: "Categories" });
  const campusLocations = screen.getByRole("tab", { name: "Campus locations" });

  categories.focus();
  await user.keyboard("{ArrowLeft}");
  expect(document.activeElement).toBe(campusLocations);
  await user.keyboard("{ArrowRight}");
  expect(document.activeElement).toBe(categories);
  await user.keyboard("{End}");
  expect(document.activeElement).toBe(campusLocations);
  await user.keyboard("{Home}");
  expect(document.activeElement).toBe(categories);
  expect(categories.getAttribute("aria-selected")).toBe("true");
});

it("keeps the workspace usable at 320 pixels", () => {
  const css = readFileSync(
    resolve("src/components/admin/admin-reference-data.module.css"),
    "utf8",
  );
  expect(css).toMatch(/@media\s*\(max-width:\s*20rem\)/);
  expect(css).toMatch(/min-height:\s*44px/);
  expect(css).toMatch(/:focus-visible/);
  expect(css).not.toMatch(/overflow-x:\s*(auto|scroll)/);
});
