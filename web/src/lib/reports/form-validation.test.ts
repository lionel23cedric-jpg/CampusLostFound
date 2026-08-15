import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createInitialReportFormValues,
  validateReportForm,
  type ReportFormValues,
  type VerificationFormRow,
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

function expectValid(values: ReportFormValues) {
  const result = validateReportForm(values);

  expect(result.success).toBe(true);
  if (!result.success) throw new Error(JSON.stringify(result.errors));
  return result.data;
}

describe("report form validation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates hydration-stable empty values with privacy enabled", () => {
    const values = createInitialReportFormValues();

    expect(values).toEqual({
      reportType: "lost",
      title: "",
      publicDescription: "",
      categoryId: "",
      campusLocationId: "",
      occurredAt: "",
      colors: "",
      tags: "",
      photoUrls: [{ id: "photo-0", value: "" }],
      privacySettings: {
        showPhoto: true,
        showEventDate: true,
        showCampusLocation: true,
      },
      privateVerification: {
        distinguishingFeatures: [{ id: "feature-0", value: "" }],
        exactLocationDetails: "",
        serialNumber: "",
        verificationQuestions: [
          {
            id: "question-0",
            question: "",
            expectedAnswer: "",
          },
        ],
        privateNotes: "",
      },
    });
    expect(createInitialReportFormValues()).toEqual(values);
  });

  it("has no runtime dependency on server report validation or models", () => {
    const source = readFileSync(
      new URL("./form-validation.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain(
      'import type { CreateReportInput } from "./validation";',
    );
    expect(source).not.toContain("createReportSchema");
    expect(source).not.toContain("@/models/");
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
    ["occurredAt", "2026-08-21T14:00", "occurredAt"],
  ] as const)("rejects invalid %s", (field, value, path) => {
    expectInvalid({ ...validValues(), [field]: value }, path);
  });

  it.each([
    ["title minimum", "title", "t".repeat(5)],
    ["title maximum", "title", "t".repeat(120)],
    ["description minimum", "publicDescription", "d".repeat(10)],
    ["description maximum", "publicDescription", "d".repeat(2000)],
  ] as const)("accepts the %s boundary", (_label, field, value) => {
    const data = expectValid({ ...validValues(), [field]: value });

    expect(data[field]).toBe(value);
  });

  it("converts the local wall-clock event time to the correct UTC instant", () => {
    const values = validValues();
    values.occurredAt = "2026-08-14T14:00";
    const timezoneOffset = new Date(2026, 7, 14, 14, 0).getTimezoneOffset();
    const expectedUtc = new Date(
      Date.UTC(2026, 7, 14, 14, 0) + timezoneOffset * 60_000,
    );

    expect(expectValid(values).occurredAt.toISOString()).toBe(
      expectedUtc.toISOString(),
    );
  });

  it.each([
    ["", "colors"],
    ["red,blue,green,black,white,silver", "colors"],
    [`${"c".repeat(33)}, black`, "colors.0"],
  ])("rejects invalid colour text %#", (colors, path) => {
    expectInvalid({ ...validValues(), colors }, path);
  });

  it.each([
    ["c".repeat(32), ["c".repeat(32)]],
    ["red, blue, green, black, white", ["red", "blue", "green", "black", "white"]],
  ])("accepts colour-count boundaries: %s", (colors, expected) => {
    expect(expectValid({ ...validValues(), colors }).colors).toEqual(expected);
  });

  it.each([
    [Array.from({ length: 11 }, (_, index) => `tag${index}`).join(","), "tags"],
    ["tag," + "t".repeat(41), "tags.1"],
  ])("rejects invalid tag text %#", (tags, path) => {
    expectInvalid({ ...validValues(), tags }, path);
  });

  it.each([
    ["", []],
    [
      ["t".repeat(40), ...Array.from({ length: 9 }, (_, index) => `tag${index}`)].join(","),
      ["t".repeat(40), ...Array.from({ length: 9 }, (_, index) => `tag${index}`)],
    ],
  ])("accepts tag-count boundaries", (tags, expected) => {
    expect(expectValid({ ...validValues(), tags }).tags).toEqual(expected);
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

  it("accepts five nonblank photo URLs and omits blank rows", () => {
    const values = validValues();
    const expected = Array.from(
      { length: 5 },
      (_, index) => `https://images.example/${index}.jpg`,
    );
    values.photoUrls = [
      { id: "blank", value: " " },
      ...expected.map((value, index) => ({ id: `photo-${index}`, value })),
    ];

    expect(expectValid(values).photoUrls).toEqual(expected);
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
    [[{ id: "feature-1", value: "f".repeat(200) }], ["f".repeat(200)]],
    [
      Array.from({ length: 10 }, (_, index) => ({
        id: `feature-${index}`,
        value: `feature ${index}`,
      })),
      Array.from({ length: 10 }, (_, index) => `feature ${index}`),
    ],
  ] as const)("accepts distinguishing-feature boundaries %#", (rows, expected) => {
    const values = validValues();
    values.privateVerification.distinguishingFeatures = [...rows];

    expect(expectValid(values).privateVerification.distinguishingFeatures).toEqual(
      expected,
    );
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

  it("accepts every optional private-text maximum", () => {
    const values = validValues();
    values.privateVerification.exactLocationDetails = "l".repeat(500);
    values.privateVerification.serialNumber = "s".repeat(200);
    values.privateVerification.privateNotes = "n".repeat(2000);

    expect(expectValid(values).privateVerification).toMatchObject({
      exactLocationDetails: "l".repeat(500),
      serialNumber: "s".repeat(200),
      privateNotes: "n".repeat(2000),
    });
  });

  it("normalises every blank optional private field to null", () => {
    const values = validValues();
    values.privateVerification.exactLocationDetails = " ";
    values.privateVerification.serialNumber = " ";
    values.privateVerification.privateNotes = " ";

    expect(expectValid(values).privateVerification).toMatchObject({
      exactLocationDetails: null,
      serialNumber: null,
      privateNotes: null,
    });
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

  it.each([
    [
      [{ id: "question-1", question: "12345", expectedAnswer: "a" }],
      1,
      5,
      1,
    ],
    [
      Array.from({ length: 5 }, (_, index) => ({
        id: `question-${index}`,
        question: index === 0 ? "q".repeat(200) : `Question ${index}?`,
        expectedAnswer: index === 0 ? "a".repeat(500) : "answer",
      })),
      5,
      200,
      500,
    ],
  ] as const)(
    "accepts verification-pair boundaries %#",
    (rows, count, questionLength, answerLength) => {
      const values = validValues();
      values.privateVerification.verificationQuestions = [...rows];

      const questions = expectValid(values).privateVerification
        .verificationQuestions;
      expect(questions).toHaveLength(count);
      expect(questions[0].question).toHaveLength(questionLength);
      expect(questions[0].expectedAnswer).toHaveLength(answerLength);
    },
  );

  it("rejects extra properties in verification pairs", () => {
    const values = validValues();
    const pair = values.privateVerification.verificationQuestions[0] as
      VerificationFormRow & { isPublic?: boolean };
    pair.isPublic = true;

    expectInvalid(values, "privateVerification.verificationQuestions.0");
  });

  it.each(["showPhoto", "showEventDate", "showCampusLocation"] as const)(
    "rejects non-boolean privacy value for %s",
    (field) => {
      const values = validValues();
      values.privacySettings[field] = "true" as unknown as boolean;

      expectInvalid(values, `privacySettings.${field}`);
    },
  );

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
