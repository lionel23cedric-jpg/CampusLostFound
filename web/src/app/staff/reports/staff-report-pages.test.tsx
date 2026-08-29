// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/staff/staff-access-boundary", () => ({
  StaffAccessBoundary: ({ children, copy }: { children: React.ReactNode; copy: { workspaceLabel: string } }) => <section aria-label={copy.workspaceLabel}>{children}</section>,
}));
vi.mock("@/components/staff-reports/staff-report-list-client", () => ({ StaffReportListClient: () => <p>List client</p> }));
vi.mock("@/components/staff-reports/staff-report-detail-client", () => ({ StaffReportDetailClient: ({ reportId }: { reportId: string }) => <p>Detail {reportId}</p> }));

import StaffReportDetailPage, { metadata as detailMetadata } from "./[reportId]/page";
import StaffReportsPage, { metadata as listMetadata } from "./page";

describe("staff report pages", () => {
  it("wraps the queue in the protected workspace and suspense shell", () => {
    render(<StaffReportsPage />);
    expect(listMetadata.title).toBe("Report handling");
    expect(document.querySelector("main#main-content")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Report handling workspace" })).toBeTruthy();
    expect(screen.getByText("List client")).toBeTruthy();
  });

  it("passes the exact route identifier to the protected detail client", async () => {
    const id = "64f0123456789abcdef01234";
    render(await StaffReportDetailPage({ params: Promise.resolve({ reportId: id }) }));
    expect(detailMetadata.title).toBe("Staff report");
    expect(document.querySelector("main#main-content")).toBeTruthy();
    expect(screen.getByText(`Detail ${id}`)).toBeTruthy();
  });
});
