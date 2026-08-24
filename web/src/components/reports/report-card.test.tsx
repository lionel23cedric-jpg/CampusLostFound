// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

  it("formats the event in the New Zealand timezone without loading a photo", () => {
    const { container } = render(
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
    expect(screen.getByText("Photo available")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("[src]")).toBeNull();
    expect(container.innerHTML).not.toContain(
      "https://images.example.test/bag.jpg",
    );
    expect(document.querySelector("script")).toBeNull();
  });

  it.each(["UTC", "America/Los_Angeles"])(
    "keeps the New Zealand event date when the runtime timezone is %s",
    async (runtimeTimeZone) => {
      const previousTimeZone = process.env.TZ;
      process.env.TZ = runtimeTimeZone;
      vi.resetModules();

      try {
        const { ReportCard: TimeZoneReportCard } = await import("./report-card");
        render(
          <TimeZoneReportCard
            report={{
              ...memberReport,
              occurredAt: "2026-08-15T02:05:00.000Z",
            }}
            categoryName="Electronics"
            campusLocationName="Location hidden"
          />,
        );

        expect(screen.getByText("15 Aug 2026")).toBeTruthy();
      } finally {
        if (previousTimeZone === undefined) {
          delete process.env.TZ;
        } else {
          process.env.TZ = previousTimeZone;
        }
        vi.resetModules();
      }
    },
  );

  it("encodes the report id before building the detail route", () => {
    render(
      <ReportCard
        report={{ ...memberReport, id: "id/with spaces" }}
        categoryName="Electronics"
        campusLocationName="Location hidden"
      />,
    );

    expect(
      screen
        .getByRole("link", { name: /Black laptop bag/ })
        .getAttribute("href"),
    ).toBe("/reports/id%2Fwith%20spaces");
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
      /\.cardFacts\s*\{[^}]*grid-template-columns:\s*1fr/,
    );
    expect(css).toContain("@media (max-width: 20rem)");
  });
});
