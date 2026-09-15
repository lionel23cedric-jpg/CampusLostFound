import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/models/notification", () => ({
  NotificationModel: { bulkWrite: vi.fn() },
}));
vi.mock("@/models/profile", () => ({
  ProfileModel: { find: vi.fn() },
}));
vi.mock("@/models/user", () => ({
  UserModel: { find: vi.fn() },
}));

import { NotificationModel } from "@/models/notification";
import { ProfileModel } from "@/models/profile";
import { UserModel } from "@/models/user";

import {
  createNotificationPlan,
  deliverNotifications,
  notificationEventKey,
} from "./delivery";

function identifier(value: string) {
  return { toString: () => value };
}

function queryChain<T>(result: T) {
  const chain = {
    session: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn(async () => result),
  };
  chain.session.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  return chain;
}

const recipientId = "64b64c6f2f4d9f1a2b3c4d51";
const reportId = "64b64c6f2f4d9f1a2b3c4d52";
const claimId = "64b64c6f2f4d9f1a2b3c4d53";
const newReportId = "64b64c6f2f4d9f1a2b3c4d54";
const session = { id: "transaction-session" };
const enabled = {
  possibleMatches: false,
  claimUpdates: true,
  statusChanges: true,
  handoverInstructions: true,
};

function configureRecipients(
  users = [{ _id: identifier(recipientId), status: "active" as const }],
  profiles = [
    {
      userId: identifier(recipientId),
      notificationSettings: enabled,
    },
  ],
) {
  const userQuery = queryChain(users);
  const profileQuery = queryChain(profiles);
  vi.mocked(UserModel.find).mockReturnValue(userQuery as never);
  vi.mocked(ProfileModel.find).mockReturnValue(profileQuery as never);
  return { userQuery, profileQuery };
}

function plan(
  kind: Parameters<typeof createNotificationPlan>[0]["kind"] =
    "claim_received",
) {
  return createNotificationPlan({
    kind,
    recipientId,
    reportId,
    claimId,
  });
}

describe("notification delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureRecipients();
    vi.mocked(NotificationModel.bulkWrite).mockResolvedValue({} as never);
  });

  it("builds canonical deterministic event keys", () => {
    const created = createNotificationPlan({
      kind: "claim_approved",
      recipientId: recipientId.toUpperCase(),
      reportId: reportId.toUpperCase(),
      claimId: claimId.toUpperCase(),
    });
    expect(created).toEqual({
      kind: "claim_approved",
      recipientId,
      reportId,
      claimId,
    });
    expect(notificationEventKey(created)).toBe(
      `notification:v1:claim_approved:${claimId}:${recipientId}`,
    );
    expect(() =>
      createNotificationPlan({
        kind: "claim_approved",
        recipientId: "invalid",
        reportId,
        claimId,
      }),
    ).toThrow("Notification plan ID is invalid");
  });

  it("builds a report-only possible-match event key", () => {
    const created = createNotificationPlan({
      kind: "possible_match",
      recipientId: recipientId.toUpperCase(),
      reportId: reportId.toUpperCase(),
      claimId: null,
      eventId: newReportId.toUpperCase(),
    });

    expect(created).toEqual({
      kind: "possible_match",
      recipientId,
      reportId,
      claimId: null,
      eventId: newReportId,
    });
    expect(notificationEventKey(created)).toBe(
      `notification:v1:possible_match:${newReportId}:${recipientId}`,
    );
    expect(() =>
      createNotificationPlan({
        kind: "possible_match",
        recipientId,
        reportId,
        claimId,
        eventId: newReportId,
      }),
    ).toThrow("Possible-match notifications cannot reference a claim");
    expect(() =>
      createNotificationPlan({
        kind: "claim_received",
        recipientId,
        reportId,
        claimId: null,
        eventId: newReportId,
      }),
    ).toThrow("Claim notifications require a claim ID");
  });

  it("writes an opted-in possible-match event without a claim ID", async () => {
    configureRecipients(undefined, [
      {
        userId: identifier(recipientId),
        notificationSettings: { ...enabled, possibleMatches: true },
      },
    ]);
    await deliverNotifications(
      [
        createNotificationPlan({
          kind: "possible_match",
          recipientId,
          reportId,
          claimId: null,
          eventId: newReportId,
        }),
      ],
      session as never,
    );

    expect(NotificationModel.bulkWrite).toHaveBeenCalledWith(
      [
        {
          updateOne: {
            filter: {
              eventKey: `notification:v1:possible_match:${newReportId}:${recipientId}`,
            },
            update: {
              $setOnInsert: {
                recipientId,
                kind: "possible_match",
                reportId,
                claimId: null,
                eventKey: `notification:v1:possible_match:${newReportId}:${recipientId}`,
                readAt: null,
              },
            },
            upsert: true,
          },
        },
      ],
      { session, ordered: true },
    );
  });

  it("honours the possible-match preference", async () => {
    await deliverNotifications(
      [
        createNotificationPlan({
          kind: "possible_match",
          recipientId,
          reportId,
          claimId: null,
          eventId: newReportId,
        }),
      ],
      session as never,
    );

    expect(NotificationModel.bulkWrite).not.toHaveBeenCalled();
  });

  it("writes an opted-in event once with the caller session", async () => {
    const { userQuery, profileQuery } = configureRecipients();
    await deliverNotifications([plan(), plan()], session as never);

    expect(userQuery.session).toHaveBeenCalledWith(session);
    expect(profileQuery.session).toHaveBeenCalledWith(session);
    expect(NotificationModel.bulkWrite).toHaveBeenCalledWith(
      [
        {
          updateOne: {
            filter: {
              eventKey: `notification:v1:claim_received:${claimId}:${recipientId}`,
            },
            update: {
              $setOnInsert: {
                recipientId,
                kind: "claim_received",
                reportId,
                claimId,
                eventKey: `notification:v1:claim_received:${claimId}:${recipientId}`,
                readAt: null,
              },
            },
            upsert: true,
          },
        },
      ],
      { session, ordered: true },
    );
  });

  it.each([
    ["claim_received", "claimUpdates"],
    ["claim_withdrawn", "claimUpdates"],
    ["claim_approved", "statusChanges"],
    ["claim_rejected", "statusChanges"],
    ["claim_completed", "statusChanges"],
    ["report_recovered", "statusChanges"],
    ["claim_handover_ready", "handoverInstructions"],
  ] as const)("maps %s to %s", async (kind, preference) => {
    configureRecipients(undefined, [
      {
        userId: identifier(recipientId),
        notificationSettings: { ...enabled, [preference]: false },
      },
    ]);
    await deliverNotifications([plan(kind)], session as never);
    expect(NotificationModel.bulkWrite).not.toHaveBeenCalled();
  });

  it.each([
    [[], undefined, "missing user"],
    [
      [{ _id: identifier(recipientId), status: "suspended" as const }],
      undefined,
      "inactive user",
    ],
    [undefined, [], "missing profile"],
  ])("skips %s without failing", async (users, profiles, scenario) => {
    void scenario;
    configureRecipients(users as never, profiles as never);
    await expect(
      deliverNotifications([plan()], session as never),
    ).resolves.toBeUndefined();
    expect(NotificationModel.bulkWrite).not.toHaveBeenCalled();
  });

  it("preserves eligible write failures for transaction rollback", async () => {
    const failure = new Error("notification write failed");
    vi.mocked(NotificationModel.bulkWrite).mockRejectedValueOnce(failure);
    await expect(
      deliverNotifications([plan()], session as never),
    ).rejects.toBe(failure);
  });
});
