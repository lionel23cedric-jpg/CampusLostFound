// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { MemberReport } from "@/lib/reports/browser-client";

import { ReportCard } from "./report-card";

const memberReport = {
  id: "64b64c6f2f4d9f1a2b3c4d54",
  reportType: "lost",
  title: "Black laptop bag",
  publicDescription: "Black laptop bag with a shoulder strap.",
  categoryId: "64b64c6f2f4d9f1a2b3c4d52",
  campusLocationId: null,
  occurredAt: null,
  colors: ["black"],
  tags: ["laptop", "bag"],
  photoUrls: [],
  status: "open",
  resolvedAt: null,
  createdAt: "2026-08-15T02:05:00.000Z",
  updatedAt: "2026-08-15T02:05:00.000Z",
  isOwner: true,
} satisfies MemberReport;

afterEach(cleanup);

describe("ReportCard", () => {
  it("links one privacy-safe owner card and explains hidden fields", () => {
    const { container } = render(
      <ReportCard
        report={memberReport}
        categoryName="Electronics"
        campusLocationName="Auckland Library"
      />,
    );

    const link = screen.getByRole("link", { name: /Black laptop bag/ });
    expect(link.getAttribute("href")).toBe(`/reports/${memberReport.id}`);
    expect(link.querySelectorAll("a, button")).toHaveLength(0);
    expect(screen.getByText("Lost · Open")).toBeTruthy();
    expect(screen.getByText(memberReport.publicDescription)).toBeTruthy();
    expect(screen.getByText("Electronics")).toBeTruthy();
    expect(screen.getByText("Location hidden")).toBeTruthy();
    expect(screen.getByText("Date hidden")).toBeTruthy();
    expect(screen.getByText("Your report")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Colours" }).textContent).toBe(
      "black",
    );
    expect(screen.getByRole("list", { name: "Tags" }).textContent).toBe(
      "laptopbag",
    );
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.textContent).not.toMatch(
      /reporterId|privacySettings|serialNumber|expectedAnswer|privateNotes/i,
    );
  });

  it.each([
    ["lost", "open", "Lost · Open"],
    ["found", "claim_pending", "Found · Claim pending"],
    ["lost", "resolved", "Lost · Resolved"],
    ["found", "closed", "Found · Closed"],
  ] as const)("labels a %s %s report in text", (reportType, status, label) => {
    render(
      <ReportCard
        report={{
          ...memberReport,
          reportType,
          status,
          campusLocationId: "64b64c6f2f4d9f1a2b3c4d53",
          isOwner: false,
        }}
        categoryName="Category unavailable"
        campusLocationName="Campus location unavailable"
      />,
    );

    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText("Category unavailable")).toBeTruthy();
    expect(screen.getByText("Campus location unavailable")).toBeTruthy();
    expect(screen.queryByText("Your report")).toBeNull();
  });

  it("formats a visible date for New Zealand and secures an external photo", () => {
    render(
      <ReportCard
        report={{
          ...memberReport,
          title: 'Bag <script>alert("private")</script>',
          campusLocationId: "64b64c6f2f4d9f1a2b3c4d53",
          occurredAt: "2026-08-15T02:05:00.000Z",
          photoUrls: ["https://images.example.test/bag.jpg"],
          isOwner: false,
        }}
        categoryName="Accessories"
        campusLocationName="Auckland Library"
      />,
    );

    expect(screen.getByText("15 Aug 2026")).toBeTruthy();
    expect(screen.getByText("Auckland Library")).toBeTruthy();
    const image = screen.getByRole("img", {
      name: 'Submitted photo for Bag <script>alert("private")</script>',
    });
    expect(image.getAttribute("src")).toBe(
      "https://images.example.test/bag.jpg",
    );
    expect(image.getAttribute("loading")).toBe("lazy");
    expect(image.getAttribute("decoding")).toBe("async");
    expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(document.querySelector("script")).toBeNull();
  });

  it("keeps the linked card operable and single-column on narrow screens", () => {
    const css = readFileSync(
      resolve("src/components/reports/report-browsing.module.css"),
      "utf8",
    );
    const linkRule = css.match(/\.cardLink\s*\{([^}]*)\}/)?.[1];
    const narrowCss = css.slice(css.indexOf("@media (max-width: 40rem)"));

    expect(linkRule).toMatch(/min-height:\s*44px/);
    expect(css).toMatch(/overflow-wrap:\s*anywhere/);
    expect(narrowCss).toMatch(
      /\.cardLink,\s*\.cardFacts\s*\{[^}]*grid-template-columns:\s*1fr/,
    );
    expect(css).toContain("@media (max-width: 20rem)");
  });
});
