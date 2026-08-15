// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/reports/browser-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/reports/browser-client")
  >("@/lib/reports/browser-client");
  return { ...actual, submitReport: vi.fn() };
});

import {
  BrowserReportError,
  submitReport,
  type CreatedReport,
} from "@/lib/reports/browser-client";

import { ReportForm } from "./report-form";

const categoryId = "64b64c6f2f4d9f1a2b3c4d5e";
const campusLocationId = "64b64c6f2f4d9f1a2b3c4d5f";

const categories = [
  {
    id: categoryId,
    name: "Electronics",
    description: "Phones, laptops and chargers",
  },
];

const campusLocations = [
  {
    id: campusLocationId,
    campusName: "Auckland",
    locationName: "Library",
    description: null,
  },
];

const createdReport: CreatedReport = {
  id: "64b64c6f2f4d9f1a2b3c4d60",
  reporterId: "64b64c6f2f4d9f1a2b3c4d61",
  reportType: "lost",
  title: "Black laptop bag",
  publicDescription: "Black laptop bag with a shoulder strap.",
  categoryId,
  campusLocationId,
  occurredAt: "2000-01-01T12:00:00.000Z",
  colors: ["Black", "Silver"],
  tags: ["laptop", "bag"],
  photoUrls: ["https://images.example/item.jpg"],
  status: "open",
  privacySettings: {
    showPhoto: true,
    showEventDate: true,
    showCampusLocation: true,
  },
  resolvedAt: null,
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
};

const onSuccess = vi.fn();
const onAuthenticationRequired = vi.fn();
const onPermissionLost = vi.fn();
const onReferenceUnavailable = vi.fn().mockResolvedValue(undefined);

function renderForm() {
  return render(
    <ReportForm
      categories={categories}
      campusLocations={campusLocations}
      onSuccess={onSuccess}
      onAuthenticationRequired={onAuthenticationRequired}
      onPermissionLost={onPermissionLost}
      onReferenceUnavailable={onReferenceUnavailable}
    />,
  );
}

async function fillValidForm() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Title"), "Black laptop bag");
  await user.type(
    screen.getByLabelText("Public description"),
    "Black laptop bag with a shoulder strap.",
  );
  await user.selectOptions(screen.getByLabelText("Category"), categoryId);
  await user.selectOptions(
    screen.getByLabelText("Campus location"),
    campusLocationId,
  );
  await user.type(screen.getByLabelText("Event date and time"), "2000-01-01T12:00");
  await user.type(screen.getByLabelText("Colours"), " Black, Silver ");
  await user.type(screen.getByLabelText("Tags"), " Laptop, BAG ");
  await user.type(
    screen.getByLabelText("Photo URL 1"),
    "https://images.example/item.jpg",
  );
  await user.type(
    screen.getByLabelText("Distinguishing feature 1"),
    "Small scratch beneath the handle",
  );
  await user.type(
    screen.getByLabelText("Verification question 1"),
    "What is attached to the zipper?",
  );
  await user.type(screen.getByLabelText("Expected answer 1"), "A blue tag");
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  onReferenceUnavailable.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("ReportForm", () => {
  it("renders four semantic groups with labelled initial controls", () => {
    renderForm();

    for (const name of [
      "Basic information",
      "Appearance and photos",
      "Privacy settings",
      "Private ownership verification",
    ]) {
      expect(screen.getByRole("group", { name })).toBeTruthy();
    }

    expect(screen.getByRole("radio", { name: "Lost item" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Found item" })).toBeTruthy();
    expect(screen.getByLabelText("Title")).toBeTruthy();
    expect(screen.getByLabelText("Public description")).toBeTruthy();
    expect(screen.getByLabelText("Event date and time")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Electronics" })).toBeTruthy();
    expect(
      screen.getByRole("option", { name: "Auckland - Library" }),
    ).toBeTruthy();

    for (const name of [
      "Show photos to other members",
      "Show event date to other members",
      "Show campus location to other members",
    ]) {
      expect((screen.getByRole("checkbox", { name }) as HTMLInputElement).checked).toBe(
        true,
      );
    }

    expect(screen.getByLabelText("Photo URL 1")).toBeTruthy();
    expect(screen.getByLabelText("Distinguishing feature 1")).toBeTruthy();
    expect(screen.getByLabelText("Verification question 1")).toBeTruthy();
    expect(screen.getByLabelText("Expected answer 1")).toBeTruthy();
  });

  it("uses stable unique IDs and enforces dynamic row limits", async () => {
    const user = userEvent.setup();
    renderForm();

    const firstPhoto = screen.getByLabelText("Photo URL 1");
    expect(firstPhoto.id).toMatch(/photo-0$/);
    expect(
      screen.getByRole("button", { name: "Remove photo URL 1" }).hasAttribute(
        "disabled",
      ),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Remove distinguishing feature 1" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Remove verification question 1" })
        .hasAttribute("disabled"),
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "Add photo URL" }));
    const secondPhoto = screen.getByLabelText("Photo URL 2");
    const secondPhotoId = secondPhoto.id;
    expect(secondPhotoId).not.toBe(firstPhoto.id);
    await user.click(screen.getByRole("button", { name: "Remove photo URL 1" }));
    expect(screen.getByLabelText("Photo URL 1").id).toBe(secondPhotoId);

    for (let index = 0; index < 4; index += 1) {
      await user.click(screen.getByRole("button", { name: "Add photo URL" }));
    }
    expect(screen.getAllByLabelText(/Photo URL \d/)).toHaveLength(5);
    expect(
      screen.getByRole("button", { name: "Add photo URL" }).hasAttribute("disabled"),
    ).toBe(true);

    for (let index = 0; index < 9; index += 1) {
      await user.click(
        screen.getByRole("button", { name: "Add distinguishing feature" }),
      );
    }
    expect(screen.getAllByLabelText(/Distinguishing feature \d/)).toHaveLength(10);
    expect(
      screen
        .getByRole("button", { name: "Add distinguishing feature" })
        .hasAttribute("disabled"),
    ).toBe(true);

    for (let index = 0; index < 4; index += 1) {
      await user.click(
        screen.getByRole("button", { name: "Add verification question" }),
      );
    }
    expect(screen.getAllByLabelText(/Verification question \d/)).toHaveLength(5);
    expect(
      screen
        .getByRole("button", { name: "Add verification question" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("announces linked validation errors, then focuses the first invalid field", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Submit report" }));

    const summary = screen.getByRole("alert");
    const title = screen.getByLabelText("Title");
    expect(summary.textContent).toContain("Title must contain at least 5 characters");
    expect(summary.contains(within(summary).getByRole("link", { name: /Title must/ }))).toBe(
      true,
    );
    expect(title.getAttribute("aria-invalid")).toBe("true");
    expect(title.getAttribute("aria-describedby")).toContain("title-error");
    expect(document.activeElement).toBe(summary);
    await waitFor(() => expect(document.activeElement).toBe(title));
  });

  it("clears a field's stale error when it is edited", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Submit report" }));
    const title = screen.getByLabelText("Title");
    expect(title.getAttribute("aria-invalid")).toBe("true");

    await user.type(title, "Black laptop bag");
    expect(title.getAttribute("aria-invalid")).toBe("false");
    expect(screen.queryByText("Title must contain at least 5 characters")).toBeNull();
  });

  it("submits the exact transformed payload once and reports success", async () => {
    vi.mocked(submitReport).mockResolvedValue(createdReport);
    renderForm();
    const user = await fillValidForm();

    await user.click(screen.getByRole("button", { name: "Submit report" }));

    await waitFor(() => expect(submitReport).toHaveBeenCalledOnce());
    expect(submitReport).toHaveBeenCalledWith({
      reportType: "lost",
      title: "Black laptop bag",
      publicDescription: "Black laptop bag with a shoulder strap.",
      categoryId,
      campusLocationId,
      occurredAt: new Date("2000-01-01T12:00"),
      colors: ["Black", "Silver"],
      tags: ["laptop", "bag"],
      photoUrls: ["https://images.example/item.jpg"],
      privacySettings: {
        showPhoto: true,
        showEventDate: true,
        showCampusLocation: true,
      },
      privateVerification: {
        distinguishingFeatures: ["Small scratch beneath the handle"],
        exactLocationDetails: null,
        serialNumber: null,
        verificationQuestions: [
          {
            question: "What is attached to the zipper?",
            expectedAnswer: "A blue tag",
          },
        ],
        privateNotes: null,
      },
    });
    expect(onSuccess).toHaveBeenCalledWith(createdReport);
  });

  it("disables and relabels submission while ignoring a second submit", async () => {
    let resolve!: (report: CreatedReport) => void;
    vi.mocked(submitReport).mockReturnValue(
      new Promise((next) => {
        resolve = next;
      }),
    );
    renderForm();
    const user = await fillValidForm();

    await user.click(screen.getByRole("button", { name: "Submit report" }));
    const pendingButton = screen.getByRole("button", { name: "Submitting report..." });
    expect(pendingButton.hasAttribute("disabled")).toBe(true);
    await user.click(pendingButton);
    expect(submitReport).toHaveBeenCalledOnce();

    resolve(createdReport);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(createdReport));
  });

  it("merges safe 400 field errors without exposing private values", async () => {
    vi.mocked(submitReport).mockRejectedValue(
      new BrowserReportError({
        code: "VALIDATION_ERROR",
        status: 400,
        message: "Review the highlighted fields",
        fields: { title: ["That title cannot be used"] },
      }),
    );
    renderForm();
    const user = await fillValidForm();

    await user.click(screen.getByRole("button", { name: "Submit report" }));

    const summary = await screen.findByRole("alert");
    expect(summary.textContent).toContain("Review the highlighted fields");
    expect(summary.textContent).toContain("That title cannot be used");
    expect(summary.textContent).not.toContain("A blue tag");
    expect(screen.getByLabelText("Title").getAttribute("aria-invalid")).toBe("true");
  });

  it.each([
    [
      "AUTHENTICATION_REQUIRED",
      401,
      onAuthenticationRequired,
      "Your session has expired",
    ],
    ["REPORT_CREATION_FORBIDDEN", 403, onPermissionLost, "Not permitted"],
  ])("routes %s to its state callback", async (code, status, callback, message) => {
    vi.mocked(submitReport).mockRejectedValue(
      new BrowserReportError({ code, status, message }),
    );
    renderForm();
    const user = await fillValidForm();

    await user.click(screen.getByRole("button", { name: "Submit report" }));

    await waitFor(() => expect(callback).toHaveBeenCalledOnce());
    expect(screen.queryByText(message)).toBeNull();
  });

  it.each([
    ["CATEGORY_UNAVAILABLE", "Category", "Category is no longer available"],
    [
      "CAMPUS_LOCATION_UNAVAILABLE",
      "Campus location",
      "Campus location is no longer available",
    ],
  ])("marks and refreshes an unavailable %s reference", async (code, label, message) => {
    vi.mocked(submitReport).mockRejectedValue(
      new BrowserReportError({ code, status: 422, message }),
    );
    renderForm();
    const user = await fillValidForm();

    await user.click(screen.getByRole("button", { name: "Submit report" }));

    await waitFor(() => expect(onReferenceUnavailable).toHaveBeenCalledOnce());
    expect(screen.getByLabelText(label).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toContain(message);
  });

  it.each([
    new BrowserReportError({
      code: "NETWORK_ERROR",
      status: 0,
      message: "We could not reach the service. Please try again.",
    }),
    new BrowserReportError({
      code: "REQUEST_FAILED",
      status: 500,
      message: "We could not complete that request. Please try again.",
    }),
    new Error("private database detail"),
  ])("shows only safe retry copy for generic failures", async (error) => {
    vi.mocked(submitReport).mockRejectedValue(error);
    renderForm();
    const user = await fillValidForm();

    await user.click(screen.getByRole("button", { name: "Submit report" }));

    const summary = await screen.findByRole("alert");
    expect(summary.textContent).toMatch(/We could not (reach the service|complete that request)/);
    expect(summary.textContent).not.toContain("private database detail");
  });
});
