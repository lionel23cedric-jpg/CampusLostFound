import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createReportSchema } from "./validation";

const categoryId = "64b64c6f2f4d9f1a2b3c4d5e";
const campusLocationId = "64b64c6f2f4d9f1a2b3c4d5f";

const validBody = {
  reportType: "lost",
  title: "Black laptop bag",
  publicDescription: "Black laptop bag with a shoulder strap.",
  categoryId,
  campusLocationId,
  occurredAt: "2026-08-14T02:00:00.000Z",
  colors: ["Black"],
  tags: ["Laptop", "Bag"],
  photoUrls: ["https://images.example/item.jpg"],
  privateVerification: {
    distinguishingFeatures: ["Small scratch beneath the handle"],
    exactLocationDetails: "Second-floor study area",
    serialNumber: "",
    verificationQuestions: [
      {
        question: "What is attached to the zipper?",
        expectedAnswer: "A blue tag",
      },
    ],
    privateNotes: null,
  },
};

describe("report submission validation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("normalises a complete report and applies privacy defaults", () => {
    expect(createReportSchema.parse(validBody)).toEqual({
      ...validBody,
      occurredAt: new Date("2026-08-14T02:00:00.000Z"),
      tags: ["laptop", "bag"],
      privacySettings: {
        showPhoto: true,
        showEventDate: true,
        showCampusLocation: true,
      },
      privateVerification: {
        ...validBody.privateVerification,
        serialNumber: null,
      },
    });
  });

  it.each([
    ["unknown root field", { ...validBody, status: "resolved" }],
    [
      "unknown private field",
      {
        ...validBody,
        privateVerification: {
          ...validBody.privateVerification,
          reviewerRole: "administrator",
        },
      },
    ],
    ["invalid report type", { ...validBody, reportType: "missing" }],
    ["malformed category id", { ...validBody, categoryId: "not-an-id" }],
    [
      "malformed campus location id",
      { ...validBody, campusLocationId: "not-an-id" },
    ],
    ["invalid event date", { ...validBody, occurredAt: "not-a-date" }],
    [
      "future event date",
      { ...validBody, occurredAt: "2026-08-16T00:00:00.000Z" },
    ],
  ])("rejects invalid core field: %s", (_case, body) => {
    expect(createReportSchema.safeParse(body).success).toBe(false);
  });

  it("trims public text before applying its bounds", () => {
    const result = createReportSchema.parse({
      ...validBody,
      title: "  12345  ",
      publicDescription: `  ${"d".repeat(10)}  `,
    });

    expect(result.title).toBe("12345");
    expect(result.publicDescription).toBe("d".repeat(10));
  });

  it.each([
    ["title below minimum", { title: " 1234 " }],
    ["title above maximum", { title: "t".repeat(121) }],
    ["description below minimum", { publicDescription: " ddddddddd " }],
    ["description above maximum", { publicDescription: "d".repeat(2001) }],
  ])("rejects bounded public text: %s", (_case, fields) => {
    expect(
      createReportSchema.safeParse({ ...validBody, ...fields }).success,
    ).toBe(false);
  });

  it("trims colour values", () => {
    expect(
      createReportSchema.parse({ ...validBody, colors: ["  Black  "] }).colors,
    ).toEqual(["Black"]);
  });

  it.each([
    ["no colours", []],
    ["too many colours", ["a", "b", "c", "d", "e", "f"]],
    ["blank colour", [" "]],
    ["colour above maximum", ["c".repeat(33)]],
  ])("rejects invalid colours: %s", (_case, colors) => {
    expect(createReportSchema.safeParse({ ...validBody, colors }).success).toBe(
      false,
    );
  });

  it("defaults tags and normalises supplied tags", () => {
    expect(
      createReportSchema.parse({ ...validBody, tags: undefined }).tags,
    ).toEqual([]);
    expect(
      createReportSchema.parse({
        ...validBody,
        tags: ["  Laptop ", "BAG"],
      }).tags,
    ).toEqual(["laptop", "bag"]);
  });

  it.each([
    ["too many tags", Array.from({ length: 11 }, () => "tag")],
    ["blank tag", [" "]],
    ["tag above maximum", ["t".repeat(41)]],
  ])("rejects invalid tags: %s", (_case, tags) => {
    expect(createReportSchema.safeParse({ ...validBody, tags }).success).toBe(
      false,
    );
  });

  it("defaults photos to an empty array", () => {
    expect(
      createReportSchema.parse({ ...validBody, photoUrls: undefined }).photoUrls,
    ).toEqual([]);
  });

  it("rejects malformed photo URLs without throwing", () => {
    const body = { ...validBody, photoUrls: ["not-a-url"] };

    expect(() => createReportSchema.safeParse(body)).not.toThrow();
    expect(createReportSchema.safeParse(body).success).toBe(false);
  });

  it.each([
    ["non-HTTPS photo", ["http://images.example/item.jpg"]],
    [
      "too many photos",
      Array.from(
        { length: 6 },
        (_value, index) => `https://images.example/${index}.jpg`,
      ),
    ],
  ])("rejects invalid photos: %s", (_case, photoUrls) => {
    expect(
      createReportSchema.safeParse({ ...validBody, photoUrls }).success,
    ).toBe(false);
  });

  it("preserves explicit privacy choices", () => {
    const result = createReportSchema.parse({
      ...validBody,
      privacySettings: {
        showPhoto: false,
        showEventDate: false,
        showCampusLocation: false,
      },
    });

    expect(result.privacySettings).toEqual({
      showPhoto: false,
      showEventDate: false,
      showCampusLocation: false,
    });
  });

  it("applies defaults to omitted privacy choices", () => {
    expect(
      createReportSchema.parse({
        ...validBody,
        privacySettings: { showPhoto: false },
      }).privacySettings,
    ).toEqual({
      showPhoto: false,
      showEventDate: true,
      showCampusLocation: true,
    });
  });

  it.each([
    [
      "unknown privacy field",
      {
        ...validBody,
        privacySettings: { showPhoto: true, revealOwner: true },
      },
    ],
    [
      "unknown verification-question field",
      {
        ...validBody,
        privateVerification: {
          ...validBody.privateVerification,
          verificationQuestions: [
            {
              ...validBody.privateVerification.verificationQuestions[0],
              isPublic: true,
            },
          ],
        },
      },
    ],
  ])("rejects unknown nested field: %s", (_case, body) => {
    expect(createReportSchema.safeParse(body).success).toBe(false);
  });

  it("materialises omitted optional private strings as null", () => {
    const result = createReportSchema.parse({
      ...validBody,
      privateVerification: {
        distinguishingFeatures: ["Small scratch beneath the handle"],
        verificationQuestions:
          validBody.privateVerification.verificationQuestions,
      },
    });

    expect(result.privateVerification).toMatchObject({
      exactLocationDetails: null,
      serialNumber: null,
      privateNotes: null,
    });
  });

  it.each([
    [
      "no distinguishing features",
      { distinguishingFeatures: [] },
    ],
    [
      "too many distinguishing features",
      {
        distinguishingFeatures: Array.from({ length: 11 }, () => "feature"),
      },
    ],
    [
      "distinguishing feature above maximum",
      { distinguishingFeatures: ["f".repeat(201)] },
    ],
    [
      "exact location above maximum",
      { exactLocationDetails: "l".repeat(501) },
    ],
    ["serial number above maximum", { serialNumber: "s".repeat(201) }],
    ["private notes above maximum", { privateNotes: "n".repeat(2001) }],
  ])("rejects invalid private evidence: %s", (_case, privateFields) => {
    expect(
      createReportSchema.safeParse({
        ...validBody,
        privateVerification: {
          ...validBody.privateVerification,
          ...privateFields,
        },
      }).success,
    ).toBe(false);
  });

  it.each([
    ["no questions", []],
    [
      "too many questions",
      Array.from({ length: 6 }, () => ({
        question: "Valid question?",
        expectedAnswer: "answer",
      })),
    ],
    ["question below minimum", [{ question: "1234", expectedAnswer: "a" }]],
    [
      "question above maximum",
      [{ question: "q".repeat(201), expectedAnswer: "a" }],
    ],
    ["blank expected answer", [{ question: "Valid question?", expectedAnswer: " " }]],
    [
      "answer above maximum",
      [{ question: "Valid question?", expectedAnswer: "a".repeat(501) }],
    ],
  ])("rejects invalid verification questions: %s", (_case, questions) => {
    expect(
      createReportSchema.safeParse({
        ...validBody,
        privateVerification: {
          ...validBody.privateVerification,
          verificationQuestions: questions,
        },
      }).success,
    ).toBe(false);
  });
});
