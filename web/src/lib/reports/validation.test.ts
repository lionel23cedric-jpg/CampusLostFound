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
    ["malformed category id", { ...validBody, categoryId: "not-an-id" }],
    [
      "future event date",
      { ...validBody, occurredAt: "2026-08-16T00:00:00.000Z" },
    ],
    [
      "non-HTTPS image",
      { ...validBody, photoUrls: ["http://images.example/item.jpg"] },
    ],
    [
      "too many colours",
      { ...validBody, colors: ["a", "b", "c", "d", "e", "f"] },
    ],
    [
      "missing verification evidence",
      {
        ...validBody,
        privateVerification: {
          ...validBody.privateVerification,
          distinguishingFeatures: [],
        },
      },
    ],
  ])("rejects %s", (_case, body) => {
    expect(createReportSchema.safeParse(body).success).toBe(false);
  });

  it("accepts no photos and preserves explicit privacy choices", () => {
    const result = createReportSchema.parse({
      ...validBody,
      photoUrls: [],
      privacySettings: {
        showPhoto: false,
        showEventDate: false,
        showCampusLocation: false,
      },
    });

    expect(result.photoUrls).toEqual([]);
    expect(result.privacySettings).toEqual({
      showPhoto: false,
      showEventDate: false,
      showCampusLocation: false,
    });
  });
});
