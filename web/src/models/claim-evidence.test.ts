import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import { ClaimEvidenceModel, claimEvidenceSchema } from "./claim-evidence";

describe("ClaimEvidence model", () => {
  it("validates bounded response snapshots", async () => {
    const evidence = new ClaimEvidenceModel({
      claimId: new mongoose.Types.ObjectId(),
      responses: [
        {
          questionIndex: 0,
          question: "What mark is near the plug?",
          answer: "Small blue paint mark",
          matched: true,
        },
      ],
    });
    await expect(evidence.validate()).resolves.toBeUndefined();
  });

  it.each([
    ["empty responses", []],
    [
      "negative index",
      [
        {
          questionIndex: -1,
          question: "Valid question?",
          answer: "x",
          matched: false,
        },
      ],
    ],
    [
      "fractional index",
      [
        {
          questionIndex: 0.5,
          question: "Valid question?",
          answer: "x",
          matched: false,
        },
      ],
    ],
    [
      "short question",
      [{ questionIndex: 0, question: "bad", answer: "x", matched: false }],
    ],
    [
      "long answer",
      [
        {
          questionIndex: 0,
          question: "Valid question?",
          answer: "x".repeat(501),
          matched: false,
        },
      ],
    ],
  ])("rejects %s", async (_case, responses) => {
    const evidence = new ClaimEvidenceModel({
      claimId: new mongoose.Types.ObjectId(),
      responses,
    });
    await expect(evidence.validate()).rejects.toBeDefined();
  });

  it("requires a claim and responses", async () => {
    const evidence = new ClaimEvidenceModel({});

    await expect(evidence.validate()).rejects.toMatchObject({
      errors: {
        claimId: expect.anything(),
        responses: expect.anything(),
      },
    });
  });

  it("rejects null responses without exposing an internal property error", async () => {
    const evidence = new ClaimEvidenceModel({
      claimId: new mongoose.Types.ObjectId(),
      responses: null,
    });

    const error = await evidence
      .validate()
      .catch((validationError: unknown) => validationError);
    expect(error).toBeDefined();
    expect(String(error)).not.toContain("Cannot read properties");
  });

  it("requires every response field", async () => {
    const evidence = new ClaimEvidenceModel({
      claimId: new mongoose.Types.ObjectId(),
      responses: [{}],
    });

    await expect(evidence.validate()).rejects.toMatchObject({
      errors: {
        "responses.0.questionIndex": expect.anything(),
        "responses.0.question": expect.anything(),
        "responses.0.answer": expect.anything(),
        "responses.0.matched": expect.anything(),
      },
    });
  });

  it("enables timestamps", () => {
    expect(claimEvidenceSchema.get("timestamps")).toBe(true);
  });

  it("defines one evidence record per claim", () => {
    expect(claimEvidenceSchema.indexes()).toEqual(
      expect.arrayContaining([
        [{ claimId: 1 }, expect.objectContaining({ unique: true })],
      ]),
    );
  });

  it("hides claimant answers and match booleans by default", () => {
    expect(claimEvidenceSchema.path("responses.answer").options.select).toBe(
      false,
    );
    expect(claimEvidenceSchema.path("responses.matched").options.select).toBe(
      false,
    );
  });
});
