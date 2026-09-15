// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { OverviewDonut } from "./overview-donut";

afterEach(cleanup);

it("renders a labelled chart with a visible numeric legend", () => {
  render(
    <OverviewDonut
      title="Report type"
      total={5}
      segments={[
        { label: "Lost", value: 2, color: "#1f6a52" },
        { label: "Found", value: 3, color: "#b85f3d" },
      ]}
    />,
  );

  const chart = screen.getByRole("img", {
    name: "Report type: Lost 2, Found 3. Total 5.",
  });

  expect(chart.getAttribute("style")).toContain("conic-gradient");
  expect(screen.getByText("Report type")).toBeTruthy();
  expect(screen.getByText("Lost")).toBeTruthy();
  expect(screen.getByText("Found")).toBeTruthy();
});

it("renders an empty ring without dividing by zero", () => {
  render(
    <OverviewDonut
      title="Account status"
      total={0}
      segments={[{ label: "Active", value: 0, color: "#1f6a52" }]}
    />,
  );

  const chart = screen.getByRole("img", {
    name: "Account status: Active 0. Total 0.",
  });

  expect(chart.getAttribute("style")).toContain("var(--line)");
});
