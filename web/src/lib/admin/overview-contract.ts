import { z } from "zod";

const safeCountSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

const reportAggregateRowSchema = z.strictObject({
  _id: z.null(),
  submittedLost: safeCountSchema,
  submittedFound: safeCountSchema,
  unresolved: safeCountSchema,
  recovered: safeCountSchema,
});

const claimAggregateRowSchema = z.strictObject({
  _id: z.null(),
  pending: safeCountSchema,
  approved: safeCountSchema,
  rejected: safeCountSchema,
  withdrawn: safeCountSchema,
  completed: safeCountSchema,
  matched: safeCountSchema,
});

const accountAggregateRowSchema = z.strictObject({
  _id: z.null(),
  active: safeCountSchema,
  suspended: safeCountSchema,
  deactivated: safeCountSchema,
});

const reportsSchema = z.strictObject({
  submittedLost: safeCountSchema,
  submittedFound: safeCountSchema,
  submittedTotal: safeCountSchema,
  unresolved: safeCountSchema,
  recovered: safeCountSchema,
  matched: safeCountSchema,
});

const claimsSchema = z.strictObject({
  pending: safeCountSchema,
  approved: safeCountSchema,
  rejected: safeCountSchema,
  withdrawn: safeCountSchema,
  completed: safeCountSchema,
  total: safeCountSchema,
});

const accountsSchema = z.strictObject({
  active: safeCountSchema,
  suspended: safeCountSchema,
  deactivated: safeCountSchema,
  total: safeCountSchema,
});

export const administratorOverviewSchema = z
  .strictObject({
    generatedAt: z.string().datetime({ offset: true }),
    reports: reportsSchema,
    claims: claimsSchema,
    accounts: accountsSchema,
  })
  // Cross-field checks ensure that a structurally valid response cannot carry
  // contradictory totals into the administrator interface.
  .superRefine((value, context) => {
    if (
      value.reports.submittedTotal !==
      value.reports.submittedLost + value.reports.submittedFound
    ) {
      context.addIssue({
        code: "custom",
        path: ["reports", "submittedTotal"],
        message: "Submitted total is inconsistent",
      });
    }
    if (
      value.claims.total !==
      value.claims.pending +
        value.claims.approved +
        value.claims.rejected +
        value.claims.withdrawn +
        value.claims.completed
    ) {
      context.addIssue({
        code: "custom",
        path: ["claims", "total"],
        message: "Claim total is inconsistent",
      });
    }
    if (
      value.accounts.total !==
      value.accounts.active +
        value.accounts.suspended +
        value.accounts.deactivated
    ) {
      context.addIssue({
        code: "custom",
        path: ["accounts", "total"],
        message: "Account total is inconsistent",
      });
    }
  });

export type ReportOverviewCounts = Omit<
  z.infer<typeof reportAggregateRowSchema>,
  "_id"
>;
export type ClaimOverviewCounts = Omit<
  z.infer<typeof claimAggregateRowSchema>,
  "_id"
>;
export type AccountOverviewCounts = Omit<
  z.infer<typeof accountAggregateRowSchema>,
  "_id"
>;
export type AdministratorOverview = z.infer<
  typeof administratorOverviewSchema
>;

function oneRow<T>(input: unknown, schema: z.ZodType<T>): T | undefined {
  // MongoDB returns no group row for an empty collection; more than one row
  // would violate the fixed aggregate contract and is rejected.
  return z.array(schema).max(1).parse(input)[0];
}

export function parseReportAggregate(input: unknown): ReportOverviewCounts {
  const row = oneRow(input, reportAggregateRowSchema);
  return row
    ? {
        submittedLost: row.submittedLost,
        submittedFound: row.submittedFound,
        unresolved: row.unresolved,
        recovered: row.recovered,
      }
    : {
        submittedLost: 0,
        submittedFound: 0,
        unresolved: 0,
        recovered: 0,
      };
}

export function parseClaimAggregate(input: unknown): ClaimOverviewCounts {
  const row = oneRow(input, claimAggregateRowSchema);
  return row
    ? {
        pending: row.pending,
        approved: row.approved,
        rejected: row.rejected,
        withdrawn: row.withdrawn,
        completed: row.completed,
        matched: row.matched,
      }
    : {
        pending: 0,
        approved: 0,
        rejected: 0,
        withdrawn: 0,
        completed: 0,
        matched: 0,
      };
}

export function parseAccountAggregate(input: unknown): AccountOverviewCounts {
  const row = oneRow(input, accountAggregateRowSchema);
  return row
    ? {
        active: row.active,
        suspended: row.suspended,
        deactivated: row.deactivated,
      }
    : { active: 0, suspended: 0, deactivated: 0 };
}

export function buildAdministratorOverview(
  generatedAt: string,
  reports: ReportOverviewCounts,
  claims: ClaimOverviewCounts,
  accounts: AccountOverviewCounts,
): AdministratorOverview {
  // This builder derives totals once and then applies the same schema used by
  // the browser. A mismatch is rejected before it can reach the UI or donut.
  // Derived totals are calculated on the server, then the complete object is
  // validated once more before it crosses the API boundary.
  return administratorOverviewSchema.parse({
    generatedAt,
    reports: {
      ...reports,
      submittedTotal: reports.submittedLost + reports.submittedFound,
      matched: claims.matched,
    },
    claims: {
      pending: claims.pending,
      approved: claims.approved,
      rejected: claims.rejected,
      withdrawn: claims.withdrawn,
      completed: claims.completed,
      total:
        claims.pending +
        claims.approved +
        claims.rejected +
        claims.withdrawn +
        claims.completed,
    },
    accounts: {
      ...accounts,
      total: accounts.active + accounts.suspended + accounts.deactivated,
    },
  });
}
