import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/item-report", () => ({
  ItemReportModel: { aggregate: vi.fn() },
}));
vi.mock("@/models/claim", () => ({
  ClaimModel: { aggregate: vi.fn() },
}));
vi.mock("@/models/user", () => ({
  UserModel: { aggregate: vi.fn() },
}));

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { ClaimModel } from "@/models/claim";
import { ItemReportModel } from "@/models/item-report";
import { UserModel } from "@/models/user";

import {
  getAdministratorOverview,
  requireAdministrator,
} from "./overview-service";

const administrator = {
  id: "admin-id",
  email: "admin@example.test",
  role: "administrator",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Admin User",
    preferredContactMethod: "in_app",
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
} satisfies PublicUser;

function aggregateResult(value: unknown) {
  return { exec: vi.fn().mockResolvedValue(value) };
}

describe("administrator overview service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ItemReportModel.aggregate).mockReturnValue(
      aggregateResult([]) as never,
    );
    vi.mocked(ClaimModel.aggregate).mockReturnValue(
      aggregateResult([]) as never,
    );
    vi.mocked(UserModel.aggregate).mockReturnValue(
      aggregateResult([]) as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["student", { ...administrator, role: "student" as const }],
    ["staff", { ...administrator, role: "staff" as const }],
    [
      "suspended administrator",
      { ...administrator, status: "suspended" as const },
    ],
    [
      "deactivated administrator",
      { ...administrator, status: "deactivated" as const },
    ],
  ])("rejects %s before database work", async (_label, user) => {
    expect(() => requireAdministrator(user)).toThrow(
      "Administrator access required",
    );
    await expect(getAdministratorOverview(user)).rejects.toMatchObject({
      code: "ADMINISTRATOR_REQUIRED",
    });
    expect(connectToDatabase).not.toHaveBeenCalled();
    expect(ItemReportModel.aggregate).not.toHaveBeenCalled();
    expect(ClaimModel.aggregate).not.toHaveBeenCalled();
    expect(UserModel.aggregate).not.toHaveBeenCalled();
  });

  it("normalises empty collections to a complete zero overview", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T03:30:00.000Z"));

    await expect(getAdministratorOverview(administrator)).resolves.toEqual({
      generatedAt: "2026-08-25T03:30:00.000Z",
      reports: {
        submittedLost: 0,
        submittedFound: 0,
        submittedTotal: 0,
        unresolved: 0,
        recovered: 0,
        matched: 0,
      },
      claims: {
        pending: 0,
        approved: 0,
        rejected: 0,
        withdrawn: 0,
        completed: 0,
        total: 0,
      },
      accounts: { active: 0, suspended: 0, deactivated: 0, total: 0 },
    });
  });

  it("runs three aggregations and returns derived counts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T03:30:00.000Z"));
    vi.mocked(ItemReportModel.aggregate).mockReturnValue(
      aggregateResult([
        {
          _id: null,
          submittedLost: 4,
          submittedFound: 3,
          unresolved: 2,
          recovered: 1,
        },
      ]) as never,
    );
    vi.mocked(ClaimModel.aggregate).mockReturnValue(
      aggregateResult([
        {
          _id: null,
          pending: 2,
          approved: 1,
          rejected: 3,
          withdrawn: 1,
          completed: 2,
          matched: 2,
        },
      ]) as never,
    );
    vi.mocked(UserModel.aggregate).mockReturnValue(
      aggregateResult([
        { _id: null, active: 8, suspended: 1, deactivated: 2 },
      ]) as never,
    );

    await expect(getAdministratorOverview(administrator)).resolves.toEqual({
      generatedAt: "2026-08-25T03:30:00.000Z",
      reports: {
        submittedLost: 4,
        submittedFound: 3,
        submittedTotal: 7,
        unresolved: 2,
        recovered: 1,
        matched: 2,
      },
      claims: {
        pending: 2,
        approved: 1,
        rejected: 3,
        withdrawn: 1,
        completed: 2,
        total: 9,
      },
      accounts: { active: 8, suspended: 1, deactivated: 2, total: 11 },
    });
    expect(connectToDatabase).toHaveBeenCalledOnce();
    expect(ItemReportModel.aggregate).toHaveBeenCalledOnce();
    expect(ClaimModel.aggregate).toHaveBeenCalledOnce();
    expect(UserModel.aggregate).toHaveBeenCalledOnce();
  });

  it("uses aggregate-only pipelines with the documented metric semantics", async () => {
    await getAdministratorOverview(administrator);

    const reportPipeline = vi.mocked(ItemReportModel.aggregate).mock.calls[0][0];
    const claimPipeline = vi.mocked(ClaimModel.aggregate).mock.calls[0][0];
    const accountPipeline = vi.mocked(UserModel.aggregate).mock.calls[0][0];
    const reportJson = JSON.stringify(reportPipeline);
    const claimJson = JSON.stringify(claimPipeline);
    const accountJson = JSON.stringify(accountPipeline);

    expect(reportPipeline).toHaveLength(1);
    expect(reportJson).toContain('"open"');
    expect(reportJson).toContain('"claim_pending"');
    expect(reportJson).toContain('"resolved"');
    expect(reportJson).toContain('"closed"');
    expect(reportJson).not.toContain('"draft"');
    expect(reportJson).not.toMatch(/title|description|photo|reporterId/i);

    expect(claimPipeline).toHaveLength(2);
    expect(claimJson).toContain('"$addToSet"');
    expect(claimJson).toContain('"$setDifference"');
    expect(claimJson).toContain('"approved"');
    expect(claimJson).toContain('"completed"');
    expect(claimJson).not.toMatch(/reviewNote|verification|claimantId/i);

    expect(accountPipeline).toHaveLength(1);
    expect(accountJson).toContain('"active"');
    expect(accountJson).toContain('"suspended"');
    expect(accountJson).toContain('"deactivated"');
    expect(accountJson).not.toMatch(/password|email|lastLogin|userId/i);
  });

  it("does not aggregate when the database connection fails", async () => {
    vi.mocked(connectToDatabase).mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    await expect(getAdministratorOverview(administrator)).rejects.toThrow(
      "database unavailable",
    );
    expect(ItemReportModel.aggregate).not.toHaveBeenCalled();
    expect(ClaimModel.aggregate).not.toHaveBeenCalled();
    expect(UserModel.aggregate).not.toHaveBeenCalled();
  });

  it.each([
    [
      "negative account count",
      () =>
        vi.mocked(UserModel.aggregate).mockReturnValue(
          aggregateResult([
            { _id: null, active: 1, suspended: -1, deactivated: 0 },
          ]) as never,
        ),
    ],
    [
      "private account field",
      () =>
        vi.mocked(UserModel.aggregate).mockReturnValue(
          aggregateResult([
            {
              _id: null,
              active: 1,
              suspended: 0,
              deactivated: 0,
              passwordHash: "secret",
            },
          ]) as never,
        ),
    ],
    [
      "duplicate report rows",
      () =>
        vi.mocked(ItemReportModel.aggregate).mockReturnValue(
          aggregateResult([
            {
              _id: null,
              submittedLost: 1,
              submittedFound: 0,
              unresolved: 1,
              recovered: 0,
            },
            {
              _id: null,
              submittedLost: 1,
              submittedFound: 0,
              unresolved: 1,
              recovered: 0,
            },
          ]) as never,
        ),
    ],
  ])("fails closed for %s", async (_label, arrange) => {
    arrange();
    await expect(getAdministratorOverview(administrator)).rejects.toThrow();
  });
});
