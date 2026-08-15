// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Black laptop bag" },
  });
  fireEvent.change(screen.getByLabelText("Public description"), {
    target: { value: "Black laptop bag with a shoulder strap." },
  });
  fireEvent.change(screen.getByLabelText("Category"), {
    target: { value: categoryId },
  });
  fireEvent.change(screen.getByLabelText("Campus location"), {
    target: { value: campusLocationId },
  });
  fireEvent.change(screen.getByLabelText("Event date and time"), {
    target: { value: "2000-01-01T12:00" },
  });
  fireEvent.change(screen.getByLabelText("Colours"), {
    target: { value: " Black, Silver " },
  });
  fireEvent.change(screen.getByLabelText(/^Tags/), {
    target: { value: " Laptop, BAG " },
  });
  fireEvent.change(screen.getByLabelText(/^Photo URL 1/), {
    target: { value: "https://images.example/item.jpg" },
  });
  fireEvent.change(screen.getByLabelText("Distinguishing feature 1"), {
    target: { value: "Small scratch beneath the handle" },
  });
  fireEvent.change(screen.getByLabelText("Verification question 1"), {
    target: { value: "What is attached to the zipper?" },
  });
  fireEvent.change(screen.getByLabelText("Expected answer 1"), {
    target: { value: "A blue tag" },
  });
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
    expect(screen.getByRole("group", { name: "Report type" })).toBeTruthy();
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

    expect(screen.getByLabelText("Photo URL 1 (optional)")).toBeTruthy();
    expect(screen.getByLabelText("Distinguishing feature 1")).toBeTruthy();
    expect(screen.getByLabelText("Verification question 1")).toBeTruthy();
    expect(screen.getByLabelText("Expected answer 1")).toBeTruthy();
    expect(screen.getByLabelText("Exact location details (optional)")).toBeTruthy();
    expect(screen.getByLabelText("Serial number (optional)")).toBeTruthy();
    expect(screen.getByLabelText("Private notes (optional)")).toBeTruthy();
    expect(screen.getByLabelText("Tags (optional)")).toBeTruthy();
    expect(
      screen.getByText(
        "Complete all unmarked text, date and selection fields. Fields marked optional may be left blank. Privacy choices may be changed.",
      ),
    ).toBeTruthy();
  });

  it("uses stable unique IDs and enforces dynamic row limits", async () => {
    const user = userEvent.setup();
    renderForm();

    const firstPhoto = screen.getByLabelText("Photo URL 1 (optional)");
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
    const secondPhoto = screen.getByLabelText("Photo URL 2 (optional)");
    const secondPhotoId = secondPhoto.id;
    expect(secondPhotoId).not.toBe(firstPhoto.id);
    await user.click(screen.getByRole("button", { name: "Remove photo URL 1" }));
    expect(screen.getByLabelText("Photo URL 1 (optional)").id).toBe(secondPhotoId);

    await user.click(
      screen.getByRole("button", { name: "Add distinguishing feature" }),
    );
    const secondFeature = screen.getByLabelText("Distinguishing feature 2");
    const secondFeatureId = secondFeature.id;
    await user.click(
      screen.getByRole("button", { name: "Remove distinguishing feature 1" }),
    );
    expect(screen.getByLabelText("Distinguishing feature 1").id).toBe(
      secondFeatureId,
    );

    await user.click(
      screen.getByRole("button", { name: "Add verification question" }),
    );
    const secondQuestion = screen.getByLabelText("Verification question 2");
    const secondQuestionId = secondQuestion.id;
    await user.click(
      screen.getByRole("button", { name: "Remove verification question 1" }),
    );
    expect(screen.getByLabelText("Verification question 1").id).toBe(
      secondQuestionId,
    );

    for (let index = 0; index < 4; index += 1) {
      await user.click(screen.getByRole("button", { name: "Add photo URL" }));
    }
    expect(screen.getAllByLabelText(/Photo URL \d \(optional\)/)).toHaveLength(5);
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

  it("clears only the edited error when repeated fields have sibling errors", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Add photo URL" }));
    fireEvent.change(screen.getByLabelText("Photo URL 1 (optional)"), {
      target: { value: "http://images.example/one.jpg" },
    });
    fireEvent.change(screen.getByLabelText("Photo URL 2 (optional)"), {
      target: { value: "http://images.example/two.jpg" },
    });
    await user.click(
      screen.getByRole("button", { name: "Add distinguishing feature" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Add verification question" }),
    );

    await user.click(screen.getByRole("button", { name: "Submit report" }));

    const firstPhoto = screen.getByLabelText("Photo URL 1 (optional)");
    const secondPhoto = screen.getByLabelText("Photo URL 2 (optional)");
    const firstFeature = screen.getByLabelText("Distinguishing feature 1");
    const secondFeature = screen.getByLabelText("Distinguishing feature 2");
    const firstQuestion = screen.getByLabelText("Verification question 1");
    const secondQuestion = screen.getByLabelText("Verification question 2");
    for (const control of [
      firstPhoto,
      secondPhoto,
      firstFeature,
      secondFeature,
      firstQuestion,
      secondQuestion,
    ]) {
      expect(control.getAttribute("aria-invalid")).toBe("true");
    }

    fireEvent.change(firstPhoto, {
      target: { value: "https://images.example/one.jpg" },
    });
    fireEvent.change(firstFeature, { target: { value: "Blue stitched lining" } });
    fireEvent.change(firstQuestion, {
      target: { value: "What is attached to the zipper?" },
    });

    expect(firstPhoto.getAttribute("aria-invalid")).toBe("false");
    expect(firstFeature.getAttribute("aria-invalid")).toBe("false");
    expect(firstQuestion.getAttribute("aria-invalid")).toBe("false");
    expect(secondPhoto.getAttribute("aria-invalid")).toBe("true");
    expect(secondFeature.getAttribute("aria-invalid")).toBe("true");
    expect(secondQuestion.getAttribute("aria-invalid")).toBe("true");
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
    ["photoUrls", "Photo URL 1 (optional)", "Review the photo list"],
    ["privacySettings", "Show photos to other members", "Review privacy choices"],
    [
      "privateVerification",
      "Distinguishing feature 1",
      "Review private verification",
    ],
  ])(
    "associates a flattened %s error with a real control and clears it on edit",
    async (field, label, message) => {
      vi.mocked(submitReport).mockRejectedValue(
        new BrowserReportError({
          code: "VALIDATION_ERROR",
          status: 400,
          message: "Review the highlighted fields",
          fields: { [field]: [message] },
        }),
      );
      renderForm();
      const user = await fillValidForm();

      await user.click(screen.getByRole("button", { name: "Submit report" }));

      const summary = await screen.findByRole("alert");
      const control = screen.getByLabelText(label);
      const link = within(summary).getByRole("link", { name: message });
      expect(link.getAttribute("href")).toBe(`#${control.id}`);
      expect(control.getAttribute("aria-invalid")).toBe("true");
      const describedIds = control.getAttribute("aria-describedby")?.split(" ") ?? [];
      expect(describedIds.length).toBeGreaterThan(0);
      expect(
        describedIds.some((id) =>
          document.getElementById(id)?.textContent?.includes(message),
        ),
      ).toBe(true);
      await waitFor(() => expect(document.activeElement).toBe(control));

      if (field === "privacySettings") {
        await user.click(control);
      } else {
        fireEvent.change(control, { target: { value: "Updated safe value" } });
      }

      expect(control.getAttribute("aria-invalid")).toBe("false");
      expect(screen.queryByText(message)).toBeNull();
    },
  );

  it("keeps an unknown flattened field error in the summary", async () => {
    vi.mocked(submitReport).mockRejectedValue(
      new BrowserReportError({
        code: "VALIDATION_ERROR",
        status: 400,
        message: "Review the highlighted fields",
        fields: { unknownServerField: ["Review this report"] },
      }),
    );
    renderForm();
    const user = await fillValidForm();

    await user.click(screen.getByRole("button", { name: "Submit report" }));

    const summary = await screen.findByRole("alert");
    expect(summary.textContent).toContain("Review this report");
    expect(within(summary).queryByRole("link", { name: "Review this report" })).toBeNull();
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    expect(document.activeElement).toBe(summary);
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
