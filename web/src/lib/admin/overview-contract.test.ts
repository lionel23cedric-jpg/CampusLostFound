import { describe, expect, it } from "vitest";

import {
  administratorOverviewSchema,
  buildAdministratorOverview,
  parseAccountAggregate,
  parseClaimAggregate,
  parseReportAggregate,
} from "./overview-contract";

const generatedAt = "2026-08-25T03:30:00.000Z";

const reports = {
  submittedLost: 4,
  submittedFound: 3,
  unresolved: 2,
  recovered: 1,
};
const claims = {
  pending: 2,
  approved: 1,
  rejected: 3,
  withdrawn: 1,
  completed: 2,
  matched: 2,
};
const accounts = { active: 8, suspended: 1, deactivated: 2 };

describe("administrator overview contracts", () => {
  it("normalises empty aggregate rows to zero", () => {
    expect(parseReportAggregate([])).toEqual({
      submittedLost: 0,
      submittedFound: 0,
      unresolved: 0,
      recovered: 0,
    });
    expect(parseClaimAggregate([])).toEqual({
      pending: 0,
      approved: 0,
      rejected: 0,
      withdrawn: 0,
      completed: 0,
      matched: 0,
    });
    expect(parseAccountAggregate([])).toEqual({
      active: 0,
      suspended: 0,
      deactivated: 0,
    });
  });

  it("parses exact aggregate rows without exposing the MongoDB group key", () => {
    expect(parseReportAggregate([{ _id: null, ...reports }])).toEqual(reports);
    expect(parseClaimAggregate([{ _id: null, ...claims }])).toEqual(claims);
    expect(parseAccountAggregate([{ _id: null, ...accounts }])).toEqual(
      accounts,
    );
  });

  it("derives public totals from parsed component counts", () => {
    expect(
      buildAdministratorOverview(generatedAt, reports, claims, accounts),
    ).toEqual({
      generatedAt,
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
  });

  it.each([-1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects unsafe aggregate count %s",
    (value) => {
      expect(() =>
        parseReportAggregate([
          {
            _id: null,
            submittedLost: value,
            submittedFound: 0,
            unresolved: 0,
            recovered: 0,
          },
        ]),
      ).toThrow();
    },
  );

  it.each([
    [parseReportAggregate, { _id: null, ...reports, reporterId: "private" }],
    [parseClaimAggregate, { _id: null, ...claims, reviewNote: "private" }],
    [parseAccountAggregate, { _id: null, ...accounts, passwordHash: "private" }],
  ] as const)("rejects private or unknown aggregate properties", (parse, row) => {
    expect(() => parse([row])).toThrow();
  });

  it("rejects more than one aggregate row", () => {
    expect(() =>
      parseAccountAggregate([
        { _id: null, active: 0, suspended: 0, deactivated: 0 },
        { _id: null, active: 0, suspended: 0, deactivated: 0 },
      ]),
    ).toThrow();
  });

  it("rejects inconsistent totals and private response fields", () => {
    const valid = buildAdministratorOverview(
      generatedAt,
      reports,
      claims,
      accounts,
    );
    expect(
      administratorOverviewSchema.safeParse({
        ...valid,
        reports: { ...valid.reports, submittedTotal: 99 },
      }).success,
    ).toBe(false);
    expect(
      administratorOverviewSchema.safeParse({
        ...valid,
        claims: { ...valid.claims, total: 99 },
      }).success,
    ).toBe(false);
    expect(
      administratorOverviewSchema.safeParse({
        ...valid,
        accounts: { ...valid.accounts, total: 99 },
      }).success,
    ).toBe(false);
    expect(
      administratorOverviewSchema.safeParse({
        ...valid,
        passwordHash: "must not pass",
      }).success,
    ).toBe(false);
  });

  it("rejects malformed timestamps", () => {
    const valid = buildAdministratorOverview(
      generatedAt,
      reports,
      claims,
      accounts,
    );
    expect(
      administratorOverviewSchema.safeParse({
        ...valid,
        generatedAt: "not-a-date",
      }).success,
    ).toBe(false);
  });
});
