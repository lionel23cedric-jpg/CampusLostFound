import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/item-report", () => ({ ItemReportModel: { find: vi.fn() } }));
vi.mock("@/lib/reports/local-embedding", () => ({ embedPublicText: vi.fn() }));

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { embedPublicText } from "@/lib/reports/local-embedding";
import { ItemReportModel } from "@/models/item-report";

import {
  DUPLICATE_REPORT_LIMIT,
  DUPLICATE_REPORT_PROJECTION,
  scanDuplicateReports,
} from "./duplicate-detection";

const administrator = {
  id: "1".repeat(24),
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

function report(index: number, overrides: Record<string, unknown> = {}) {
  return {
    _id: (index + 2).toString(16).padStart(24, "0"),
    reportType: "lost",
    title: "Black laptop charger",
    publicDescription: "Black USB-C laptop charger beside the library desk.",
    categoryId: "a".repeat(24),
    campusLocationId: "b".repeat(24),
    occurredAt: new Date("2026-09-25T01:00:00.000Z"),
    colors: ["black"],
    tags: ["charger", "usb-c"],
    status: "open",
    moderationStatus: "visible",
    createdAt: new Date(`2026-09-${String(20 + index).padStart(2, "0")}T01:00:00.000Z`),
    ...overrides,
  };
}

function queryResult(rows: ReturnType<typeof report>[]) {
  const chain = {
    sort: vi.fn(),
    limit: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn().mockResolvedValue(rows),
  };
  chain.sort.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  vi.mocked(ItemReportModel.find).mockReturnValue(chain as never);
  return chain;
}

describe("administrator duplicate detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectToDatabase).mockResolvedValue({} as never);
    vi.mocked(embedPublicText).mockResolvedValue(new Float32Array([1, 0]));
  });

  it("loads a bounded safe projection and returns one canonical same-type pair", async () => {
    const second = report(1, { _id: "c".repeat(24) });
    const first = report(0, { _id: "d".repeat(24) });
    const chain = queryResult([
      first,
      second,
      report(2, { reportType: "found" }),
      report(3, { moderationStatus: "hidden" }),
      report(4, { status: "draft" }),
    ]);

    const result = await scanDuplicateReports(administrator);

    expect(ItemReportModel.find).toHaveBeenCalledWith(
      {
        status: { $in: ["open", "claim_pending", "resolved", "closed"] },
        moderationStatus: { $ne: "hidden" },
      },
      DUPLICATE_REPORT_PROJECTION,
    );
    expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(chain.limit).toHaveBeenCalledWith(DUPLICATE_REPORT_LIMIT);
    expect(DUPLICATE_REPORT_PROJECTION).not.toHaveProperty("reporterId");
    expect(DUPLICATE_REPORT_PROJECTION).not.toHaveProperty("privateVerification");
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0]).toMatchObject({
      leftReport: { id: "c".repeat(24), reportType: "lost" },
      rightReport: { id: "d".repeat(24), reportType: "lost" },
      method: "model_assisted",
    });
    expect(result.pairs[0].leftReport.id < result.pairs[0].rightReport.id).toBe(true);
    expect(result.pairs[0].leftReport.id).not.toBe(result.pairs[0].rightReport.id);
  });

  it("embeds only shortlisted public wording and excludes pairs below 0.82", async () => {
    queryResult([
      report(0),
      report(1),
      report(2, {
        title: "Green rain jacket",
        publicDescription: "A green rain jacket left outside the gym entrance.",
        campusLocationId: "f".repeat(24),
        occurredAt: new Date("2026-07-01T01:00:00.000Z"),
        colors: ["green"],
        tags: ["jacket"],
        privateVerification: "PRIVATE-SERIAL",
        reporterId: "9".repeat(24),
      }),
    ]);

    const result = await scanDuplicateReports(administrator);

    expect(result.pairs).toHaveLength(1);
    expect(embedPublicText).toHaveBeenCalledTimes(3);
    expect(embedPublicText).toHaveBeenCalledWith(
      "Black laptop charger. Black USB-C laptop charger beside the library desk. charger usb-c black",
    );
    expect(JSON.stringify(vi.mocked(embedPublicText).mock.calls)).not.toMatch(
      /PRIVATE-SERIAL|reporterId|verification/i,
    );
    expect(result.pairs.every((pair) => pair.similarity >= 0.82)).toBe(true);
  });

  it("uses a deterministic fallback when the local model fails", async () => {
    queryResult([report(0), report(1)]);
    vi.mocked(embedPublicText).mockRejectedValue(new Error("private model path"));

    const result = await scanDuplicateReports(administrator);

    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].method).toBe("fallback");
    expect(JSON.stringify(result)).not.toContain("private model path");
  });

  it("rejects non-administrator callers before database access", async () => {
    await expect(
      scanDuplicateReports({ ...administrator, role: "staff" }),
    ).rejects.toMatchObject({ code: "ADMINISTRATOR_REQUIRED" });
    expect(connectToDatabase).not.toHaveBeenCalled();
  });
});
