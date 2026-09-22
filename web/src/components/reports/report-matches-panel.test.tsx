// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/lib/reports/browser-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/reports/browser-client")
  >("@/lib/reports/browser-client");
  return { ...actual, getReportMatches: vi.fn() };
});

import { useRouter } from "next/navigation";

import {
  BrowserReportError,
  getReportMatches,
  type ReportMatches,
} from "@/lib/reports/browser-client";

import { ReportMatchesPanel } from "./report-matches-panel";

const replace = vi.fn();
const reportId = "64b64c6f2f4d9f1a2b3c4d54";

const reportMatches: ReportMatches = {
  sourceReportId: reportId,
  matchingMethod: "rule_fallback",
  matches: [
    {
      report: {
        id: "candidate/report id",
        reportType: "found",
        title: "Black laptop charger",
        publicDescription: "Found beside the library desk.",
        categoryId: "64b64c6f2f4d9f1a2b3c4d52",
        campusLocationId: null,
        occurredAt: "2026-08-24T01:00:00.000Z",
        colors: ["black"],
        tags: ["laptop", "charger"],
        photoUrls: [],
        status: "open",
        moderationStatus: "visible",
        resolvedAt: null,
        createdAt: "2026-08-24T02:00:00.000Z",
        updatedAt: "2026-08-24T02:00:00.000Z",
        isOwner: false,
      },
      score: 60,
      factors: [
        {
          key: "category",
          points: 25,
          maximum: 25,
          explanation: "Same category",
        },
        {
          key: "location",
          points: 15,
          maximum: 15,
          explanation: "Same public campus location",
        },
        {
          key: "colors",
          points: 10,
          maximum: 15,
          explanation: "Shared colours: black",
        },
        {
          key: "text",
          points: 10,
          maximum: 20,
          explanation: "Similar report wording",
        },
      ],
    },
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function browserError(code: string, status: number, message: string) {
  return new BrowserReportError({ code, status, message });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
});

afterEach(cleanup);

describe("ReportMatchesPanel", () => {
  it("waits for activation, announces loading and renders safe explanations", async () => {
    const user = userEvent.setup();
    const request = deferred<ReportMatches>();
    vi.mocked(getReportMatches).mockReturnValue(request.promise);

    render(<ReportMatchesPanel reportId={reportId} />);

    expect(
      screen.getByRole("heading", { name: "Possible matches" }),
    ).toBeTruthy();
    expect(getReportMatches).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Find possible matches" }),
    );
    expect(getReportMatches).toHaveBeenCalledWith(reportId);
    expect(
      screen
        .getByRole("button", { name: "Finding possible matches" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByRole("status").textContent).toContain(
      "Comparing this report",
    );

    request.resolve(reportMatches);

    expect(
      await screen.findByRole("heading", { name: "Black laptop charger" }),
    ).toBeTruthy();
    expect(screen.getByText("60 / 100")).toBeTruthy();
    expect(screen.getByText("Same category")).toBeTruthy();
    expect(screen.getByText("+25 / 25")).toBeTruthy();
    expect(screen.getByText("Found · Open")).toBeTruthy();
    expect(screen.getByText("Found beside the library desk.")).toBeTruthy();
    expect(screen.getByText("Rule-based comparison (local AI model unavailable).")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Review Black laptop charger" })
        .getAttribute("href"),
    ).toBe("/reports/candidate%2Freport%20id");
    expect(document.body.textContent).not.toContain("reporterId");
  });

  it("identifies a result that used the local AI model", async () => {
    const user = userEvent.setup();
    vi.mocked(getReportMatches).mockResolvedValue({
      ...reportMatches,
      matchingMethod: "model_assisted",
    });
    render(<ReportMatchesPanel reportId={reportId} />);
    await user.click(screen.getByRole("button", { name: "Find possible matches" }));
    expect(await screen.findByText(/AI-assisted text comparison/i)).toBeTruthy();
  });

  it("renders an empty result and permits a deliberate refresh", async () => {
    const user = userEvent.setup();
    vi.mocked(getReportMatches).mockResolvedValue({
      sourceReportId: reportId,
      matchingMethod: "rule_fallback",
      matches: [],
    });

    render(<ReportMatchesPanel reportId={reportId} />);
    await user.click(
      screen.getByRole("button", { name: "Find possible matches" }),
    );

    expect(await screen.findByText("No strong matches yet")).toBeTruthy();
    expect(screen.getByText(/new reports may produce a stronger match/i)).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Check for matches again" }),
    );
    expect(getReportMatches).toHaveBeenCalledTimes(2);
  });

  it("shows a recoverable error and retries only on activation", async () => {
    const user = userEvent.setup();
    vi.mocked(getReportMatches)
      .mockRejectedValueOnce(new Error("private failure"))
      .mockResolvedValueOnce(reportMatches);

    render(<ReportMatchesPanel reportId={reportId} />);
    await user.click(
      screen.getByRole("button", { name: "Find possible matches" }),
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "We could not find matches",
    );
    expect(document.body.textContent).not.toContain("private failure");

    await user.click(
      screen.getByRole("button", { name: "Retry possible matches" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Black laptop charger" }),
    ).toBeTruthy();
    expect(getReportMatches).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["missing", browserError("REPORT_NOT_FOUND", 404, "Report not found")],
    [
      "not matchable",
      browserError(
        "REPORT_NOT_MATCHABLE",
        409,
        "Report is not available for matching",
      ),
    ],
  ])("renders a stable unavailable state for a %s report", async (_case, error) => {
    const user = userEvent.setup();
    vi.mocked(getReportMatches).mockRejectedValue(error);

    render(<ReportMatchesPanel reportId={reportId} />);
    await user.click(
      screen.getByRole("button", { name: "Find possible matches" }),
    );

    expect(await screen.findByText("Matching is unavailable")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /match/i })).toBeNull();
  });

  it("redirects safely when authentication expires", async () => {
    const user = userEvent.setup();
    vi.mocked(getReportMatches).mockRejectedValue(
      browserError("AUTHENTICATION_REQUIRED", 401, "Sign in required"),
    );

    render(<ReportMatchesPanel reportId={reportId} />);
    await user.click(
      screen.getByRole("button", { name: "Find possible matches" }),
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(document.body.textContent).not.toContain("Sign in required");
  });

  it("resets for another report and ignores the older response", async () => {
    const user = userEvent.setup();
    const oldRequest = deferred<ReportMatches>();
    const newRequest = deferred<ReportMatches>();
    vi.mocked(getReportMatches)
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);

    const { rerender } = render(<ReportMatchesPanel reportId="old-report" />);
    await user.click(
      screen.getByRole("button", { name: "Find possible matches" }),
    );

    rerender(<ReportMatchesPanel reportId="new-report" />);
    expect(
      screen.getByRole("button", { name: "Find possible matches" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Find possible matches" }),
    );

    newRequest.resolve({
      ...reportMatches,
      sourceReportId: "new-report",
      matches: [
        {
          ...reportMatches.matches[0],
          report: { ...reportMatches.matches[0].report, title: "New result" },
        },
      ],
    });
    expect(
      await screen.findByRole("heading", { name: "New result" }),
    ).toBeTruthy();

    oldRequest.resolve({
      ...reportMatches,
      sourceReportId: "old-report",
      matches: [
        {
          ...reportMatches.matches[0],
          report: { ...reportMatches.matches[0].report, title: "Old result" },
        },
      ],
    });
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Old result" })).toBeNull();
    });
  });

  it("keeps controls accessible at the 320-pixel layout boundary", () => {
    const stylesheet = readFileSync(
      resolve("src/components/reports/report-matches.module.css"),
      "utf8",
    );
    expect(stylesheet).toMatch(/min-height:\s*44px/);
    expect(stylesheet).toMatch(/:focus-visible/);
    expect(stylesheet).toMatch(/@media\s*\(max-width:\s*20rem\)/);
  });
});
