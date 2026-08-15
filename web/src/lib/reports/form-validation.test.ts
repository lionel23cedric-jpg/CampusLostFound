import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createInitialReportFormValues,
  validateReportForm,
  type ReportFormValues,
} from "./form-validation";

const categoryId = "64b64c6f2f4d9f1a2b3c4d5e";
const campusLocationId = "64b64c6f2f4d9f1a2b3c4d5f";

const validValues = (): ReportFormValues => ({
  reportType: "lost",
  title: "  Black laptop bag  ",
  publicDescription: "  Black laptop bag with a shoulder strap.  ",
  categoryId,
  campusLocationId,
  occurredAt: "2026-08-14T14:00",
  colors: " Black,  Silver ",
  tags: " Laptop, BAG ",
  photoUrls: [
    { id: "photo-1", value: " https://images.example/item.jpg " },
    { id: "photo-2", value: " " },
  ],
  privacySettings: {
    showPhoto: false,
    showEventDate: true,
    showCampusLocation: false,
  },
  privateVerification: {
    distinguishingFeatures: [
      { id: "feature-1", value: " Small scratch beneath the handle " },
    ],
    exactLocationDetails: "  Second-floor study area  ",
    serialNumber: "   ",
    verificationQuestions: [
      {
        id: "question-1",
        question: " What is attached to the zipper? ",
        expectedAnswer: " A blue tag ",
      },
    ],
    privateNotes: "   ",
  },
});

function expectInvalid(values: ReportFormValues, path: string) {
  const result = validateReportForm(values);

  expect(result.success).toBe(false);
  if (!result.success) expect(result.errors[path]).toBeDefined();
}

describe("report form validation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates deterministic empty values with privacy enabled", () => {
    let sequence = 0;
    const values = createInitialReportFormValues(() => `row-${++sequence}`);

    expect(values).toEqual({
      reportType: "lost",
      title: "",
      publicDescription: "",
      categoryId: "",
      campusLocationId: "",
      occurredAt: "",
      colors: "",
      tags: "",
      photoUrls: [{ id: "row-1", value: "" }],
      privacySettings: {
        showPhoto: true,
        showEventDate: true,
        showCampusLocation: true,
      },
      privateVerification: {
        distinguishingFeatures: [{ id: "row-2", value: "" }],
        exactLocationDetails: "",
        serialNumber: "",
        verificationQuestions: [
          {
            id: "row-3",
            question: "",
            expectedAnswer: "",
          },
        ],
        privateNotes: "",
      },
    });
  });

  it.each(["lost", "found"] as const)("accepts the %s report type", (reportType) => {
    const result = validateReportForm({ ...validValues(), reportType });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.reportType).toBe(reportType);
  });

  it("rejects an unsupported report type at runtime", () => {
    expectInvalid(
      { ...validValues(), reportType: "missing" as "lost" },
      "reportType",
    );
  });

  it.each([
    ["title", " 1234 ", "title"],
    ["title", "t".repeat(121), "title"],
    ["publicDescription", " ddddddddd ", "publicDescription"],
    ["publicDescription", "d".repeat(2001), "publicDescription"],
    ["categoryId", "not-an-id", "categoryId"],
    ["campusLocationId", "not-an-id", "campusLocationId"],
    ["occurredAt", "", "occurredAt"],
    ["occurredAt", "not-a-date", "occurredAt"],
    ["occurredAt", "2026-08-16T14:00", "occurredAt"],
  ] as const)("rejects invalid %s", (field, value, path) => {
    expectInvalid({ ...validValues(), [field]: value }, path);
  });

  it.each([
    ["", "colors"],
    ["red,blue,green,black,white,silver", "colors"],
    [`${"c".repeat(33)}, black`, "colors.0"],
  ])("rejects invalid colour text %#", (colors, path) => {
    expectInvalid({ ...validValues(), colors }, path);
  });

  it.each([
    [Array.from({ length: 11 }, (_, index) => `tag${index}`).join(","), "tags"],
    ["tag," + "t".repeat(41), "tags.1"],
  ])("rejects invalid tag text %#", (tags, path) => {
    expectInvalid({ ...validValues(), tags }, path);
  });

  it.each([
    ["http://images.example/item.jpg"],
    ["not-a-url"],
  ])("rejects an invalid photo URL: %s", (value) => {
    const values = validValues();
    values.photoUrls = [{ id: "photo-1", value }];

    expectInvalid(values, "photoUrls.0");
  });

  it("rejects more than five nonblank photo URLs", () => {
    const values = validValues();
    values.photoUrls = Array.from({ length: 6 }, (_, index) => ({
      id: `photo-${index}`,
      value: `https://images.example/${index}.jpg`,
    }));

    expectInvalid(values, "photoUrls");
  });

  it.each([
    [[], "privateVerification.distinguishingFeatures"],
    [
      Array.from({ length: 11 }, (_, index) => ({
        id: `feature-${index}`,
        value: "feature",
      })),
      "privateVerification.distinguishingFeatures",
    ],
    [
      [{ id: "feature-1", value: "f".repeat(201) }],
      "privateVerification.distinguishingFeatures.0",
    ],
  ] as const)("rejects invalid distinguishing features %#", (rows, path) => {
    const values = validValues();
    values.privateVerification.distinguishingFeatures = [...rows];

    expectInvalid(values, path);
  });

  it.each([
    ["exactLocationDetails", 501],
    ["serialNumber", 201],
    ["privateNotes", 2001],
  ] as const)("rejects an overlong private %s", (field, length) => {
    const values = validValues();
    values.privateVerification[field] = "x".repeat(length);

    expectInvalid(values, `privateVerification.${field}`);
  });

  it.each([
    [[], "privateVerification.verificationQuestions"],
    [
      Array.from({ length: 6 }, (_, index) => ({
        id: `question-${index}`,
        question: "Valid question?",
        expectedAnswer: "answer",
      })),
      "privateVerification.verificationQuestions",
    ],
    [
      [{ id: "question-1", question: "1234", expectedAnswer: "answer" }],
      "privateVerification.verificationQuestions.0.question",
    ],
    [
      [
        {
          id: "question-1",
          question: "q".repeat(201),
          expectedAnswer: "answer",
        },
      ],
      "privateVerification.verificationQuestions.0.question",
    ],
    [
      [{ id: "question-1", question: "Valid question?", expectedAnswer: " " }],
      "privateVerification.verificationQuestions.0.expectedAnswer",
    ],
    [
      [
        {
          id: "question-1",
          question: "Valid question?",
          expectedAnswer: "a".repeat(501),
        },
      ],
      "privateVerification.verificationQuestions.0.expectedAnswer",
    ],
  ] as const)("rejects invalid verification pairs %#", (rows, path) => {
    const values = validValues();
    values.privateVerification.verificationQuestions = [...rows];

    expectInvalid(values, path);
  });

  it("normalises browser values into the server contract without row IDs", () => {
    const result = validateReportForm(validValues());

    expect(result).toEqual({
      success: true,
      data: {
        reportType: "lost",
        title: "Black laptop bag",
        publicDescription: "Black laptop bag with a shoulder strap.",
        categoryId,
        campusLocationId,
        occurredAt: new Date("2026-08-14T14:00"),
        colors: ["Black", "Silver"],
        tags: ["laptop", "bag"],
        photoUrls: ["https://images.example/item.jpg"],
        privacySettings: {
          showPhoto: false,
          showEventDate: true,
          showCampusLocation: false,
        },
        privateVerification: {
          distinguishingFeatures: ["Small scratch beneath the handle"],
          exactLocationDetails: "Second-floor study area",
          serialNumber: null,
          verificationQuestions: [
            {
              question: "What is attached to the zipper?",
              expectedAnswer: "A blue tag",
            },
          ],
          privateNotes: null,
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("photo-1");
    expect(JSON.stringify(result)).not.toContain("feature-1");
    expect(JSON.stringify(result)).not.toContain("question-1");
  });
});
