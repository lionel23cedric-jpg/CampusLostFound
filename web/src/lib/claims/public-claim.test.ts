import { describe, expect, it } from "vitest";
import {
  toClaimantClaim,
  toStaffClaimDetail,
  toStaffClaimSummary,
} from "./public-claim";

const claim = {
  _id: { toString: () => "claim-id" },
  reportId: { toString: () => "report-id" },
  claimantId: { toString: () => "claimant-id" },
  status: "pending" as const,
  activeClaimKey: "report-id:claimant-id",
  verificationQuestionCount: 2,
  verificationMatchedCount: 1,
  reviewedBy: null,
  reviewedAt: null,
  reviewNote: "PRIVATE STAFF NOTE",
  completedAt: null,
  withdrawnAt: null,
  createdAt: new Date("2026-08-24T01:00:00.000Z"),
  updatedAt: new Date("2026-08-24T01:01:00.000Z"),
  passwordHash: "DO-NOT-RETURN",
};

const report = {
  _id: { toString: () => "report-id" },
  title: "Black laptop charger",
  reportType: "found" as const,
  status: "open" as const,
  reporterId: { toString: () => "owner-id" },
  expectedAnswer: "DO-NOT-RETURN",
};

const claimant = {
  _id: { toString: () => "claimant-id" },
  email: "student@example.com",
  displayName: "Student Name",
  preferredContactMethod: "email" as const,
  tokenHash: "DO-NOT-RETURN",
};

const evidence = {
  _id: { toString: () => "evidence-id" },
  claimId: { toString: () => "claim-id" },
  responses: [
    {
      questionIndex: 0,
      question: "What mark is near the plug?",
      answer: "Small blue mark",
      matched: true,
      expectedAnswer: "DO-NOT-RETURN",
    },
  ],
};

describe("Claim response mappers", () => {
  it("returns only claimant-safe workflow and report fields", () => {
    const result = toClaimantClaim(claim, report);

    expect(result).toEqual({
      id: "claim-id",
      report: {
        id: "report-id",
        title: "Black laptop charger",
        reportType: "found",
        status: "open",
      },
      status: "pending",
      reviewedAt: null,
      withdrawnAt: null,
      completedAt: null,
      createdAt: "2026-08-24T01:00:00.000Z",
      updatedAt: "2026-08-24T01:01:00.000Z",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /answer|matched|reviewNote|reviewedBy|activeClaimKey|claimant|passwordHash|expectedAnswer/,
    );
  });

  it("returns aggregate review data but not individual evidence in summaries", () => {
    const result = toStaffClaimSummary(claim, report, claimant);

    expect(result.claimant).toEqual({
      id: "claimant-id",
      email: "student@example.com",
      displayName: "Student Name",
      preferredContactMethod: "email",
    });
    expect(result.verification).toEqual({ questionCount: 2, matchedCount: 1 });
    expect(result.reviewedBy).toBeNull();
    expect(result).not.toHaveProperty("responses");
    expect(JSON.stringify(result)).not.toMatch(
      /PRIVATE STAFF NOTE|DO-NOT-RETURN|tokenHash/,
    );
  });

  it("returns controlled answers and match results only in staff detail", () => {
    const result = toStaffClaimDetail(claim, report, claimant, evidence);

    expect(result.reviewNote).toBe("PRIVATE STAFF NOTE");
    expect(result.responses).toEqual([
      {
        questionIndex: 0,
        question: "What mark is near the plug?",
        answer: "Small blue mark",
        matched: true,
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /expectedAnswer|DO-NOT-RETURN|tokenHash|passwordHash|activeClaimKey/,
    );
  });
});
