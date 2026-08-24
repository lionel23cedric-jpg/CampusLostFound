import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import { ClaimModel, claimSchema } from "./claim";

const reportId = new mongoose.Types.ObjectId();
const claimantId = new mongoose.Types.ObjectId();

describe("Claim model", () => {
  it("applies the pending workflow defaults", async () => {
    const claim = new ClaimModel({
      reportId,
      claimantId,
      activeClaimKey: `${reportId}:${claimantId}`,
      verificationQuestionCount: 2,
      verificationMatchedCount: 1,
    });

    await expect(claim.validate()).resolves.toBeUndefined();
    expect(claim.status).toBe("pending");
    expect(claim.reviewedBy).toBeNull();
    expect(claim.reviewedAt).toBeNull();
    expect(claim.reviewNote).toBeNull();
    expect(claim.completedAt).toBeNull();
    expect(claim.withdrawnAt).toBeNull();
  });

  it.each(["unknown", "cancelled"])("rejects status %s", async (status) => {
    const claim = new ClaimModel({
      reportId,
      claimantId,
      status,
      activeClaimKey: `${reportId}:${claimantId}`,
      verificationQuestionCount: 1,
      verificationMatchedCount: 0,
    });
    await expect(claim.validate()).rejects.toMatchObject({
      errors: { status: expect.anything() },
    });
  });

  it.each([
    [0, 0],
    [6, 0],
    [1.5, 0],
    [2, -1],
    [2, 0.5],
    [2, 3],
  ])(
    "rejects question count %s with match count %s",
    async (questions, matches) => {
      const claim = new ClaimModel({
        reportId,
        claimantId,
        activeClaimKey: `${reportId}:${claimantId}`,
        verificationQuestionCount: questions,
        verificationMatchedCount: matches,
      });
      await expect(claim.validate()).rejects.toBeDefined();
    },
  );

  it("defines claimant, queue, report and unique active-key indexes", () => {
    const indexes = claimSchema.indexes();

    expect(indexes).toHaveLength(4);
    expect(indexes).toEqual(
      expect.arrayContaining([
        [{ claimantId: 1, createdAt: -1, _id: -1 }, expect.any(Object)],
        [{ status: 1, createdAt: 1, _id: 1 }, expect.any(Object)],
        [{ reportId: 1, status: 1, createdAt: 1 }, expect.any(Object)],
        [
          { activeClaimKey: 1 },
          expect.objectContaining({
            unique: true,
            partialFilterExpression: { activeClaimKey: { $type: "string" } },
          }),
        ],
      ]),
    );
  });

  it("requires report, claimant and verification counts", async () => {
    const claim = new ClaimModel({});

    await expect(claim.validate()).rejects.toMatchObject({
      errors: {
        reportId: expect.anything(),
        claimantId: expect.anything(),
        verificationQuestionCount: expect.anything(),
        verificationMatchedCount: expect.anything(),
      },
    });
  });

  it("enables timestamps", () => {
    expect(claimSchema.get("timestamps")).toBe(true);
  });

  it("hides aggregate matches and review notes by default", () => {
    expect(claimSchema.path("verificationMatchedCount").options.select).toBe(
      false,
    );
    expect(claimSchema.path("reviewNote").options.select).toBe(false);
  });
});
