import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import {
  DIRECT_REPORT_HIDE_REASONS,
  REPORT_MODERATION_ACTIONS,
  ReportModerationEventModel,
  reportModerationEventSchema,
} from "./report-moderation-event";

const actorAdministratorId = new mongoose.Types.ObjectId();
const reportId = new mongoose.Types.ObjectId();
const sourceFlagId = new mongoose.Types.ObjectId();

const dismissal = {
  actorAdministratorId,
  reportId,
  sourceFlagId,
  action: "flag_dismissed",
  reason: "flag_dismissed",
  previousModerationStatus: null,
  newModerationStatus: null,
};
const hiding = {
  actorAdministratorId,
  reportId,
  sourceFlagId,
  action: "report_hidden",
  reason: "privacy_concern",
  previousModerationStatus: "visible",
  newModerationStatus: "hidden",
};
const restoring = {
  actorAdministratorId,
  reportId,
  sourceFlagId: null,
  action: "report_restored",
  reason: "moderation_reversed",
  previousModerationStatus: "hidden",
  newModerationStatus: "visible",
};

function event(overrides: Record<string, unknown> = {}) {
  return new ReportModerationEventModel({ ...hiding, ...overrides });
}

describe("ReportModerationEvent model", () => {
  it.each([
    ["dismissal", dismissal],
    ["hiding", hiding],
    ["restoring", restoring],
  ])("accepts a valid %s event", async (_label, input) => {
    const record = new ReportModerationEventModel(input);

    await expect(record.validate()).resolves.toBeUndefined();
    expect(record.occurredAt).toBeInstanceOf(Date);
  });

  it.each(REPORT_MODERATION_ACTIONS)("recognizes action %s", (action) => {
    expect(
      reportModerationEventSchema.path("action").options.enum,
    ).toContain(action);
  });

  it.each(DIRECT_REPORT_HIDE_REASONS)(
    "accepts direct hide reason %s",
    async (reason) => {
      await expect(
        event({ sourceFlagId: null, reason }).validate(),
      ).resolves.toBeUndefined();
    },
  );

  it("accepts other only for a flag-driven hide", async () => {
    await expect(event({ reason: "other" }).validate()).resolves.toBeUndefined();
    await expect(
      event({ sourceFlagId: null, reason: "other" }).validate(),
    ).rejects.toMatchObject({ errors: { action: expect.anything() } });
  });

  it("rejects a dismissal without a source flag", async () => {
    await expect(
      new ReportModerationEventModel({
        ...dismissal,
        sourceFlagId: null,
      }).validate(),
    ).rejects.toMatchObject({ errors: { sourceFlagId: expect.anything() } });
  });

  it("rejects a dismissal with moderation states or a wrong reason", async () => {
    await expect(
      new ReportModerationEventModel({
        ...dismissal,
        reason: "privacy_concern",
        previousModerationStatus: "visible",
        newModerationStatus: "hidden",
      }).validate(),
    ).rejects.toMatchObject({ errors: { action: expect.anything() } });
  });

  it.each([
    ["wrong transition", { previousModerationStatus: "hidden" }],
    ["dismiss reason", { reason: "flag_dismissed" }],
    ["restore reason", { reason: "moderation_reversed" }],
  ])("rejects a hide with %s", async (_label, override) => {
    await expect(event(override).validate()).rejects.toMatchObject({
      errors: { action: expect.anything() },
    });
  });

  it.each([
    ["source flag", { sourceFlagId }],
    ["wrong reason", { reason: "administrative_review" }],
    ["wrong previous state", { previousModerationStatus: "visible" }],
    ["wrong new state", { newModerationStatus: "hidden" }],
  ])("rejects a restore with %s", async (_label, override) => {
    await expect(
      new ReportModerationEventModel({
        ...restoring,
        ...override,
      }).validate(),
    ).rejects.toMatchObject({ errors: { action: expect.anything() } });
  });

  it("requires actor, report, action and reason", async () => {
    await expect(
      new ReportModerationEventModel({}).validate(),
    ).rejects.toMatchObject({
      errors: {
        actorAdministratorId: expect.anything(),
        reportId: expect.anything(),
        action: expect.anything(),
        reason: expect.anything(),
      },
    });
  });

  it("rejects an unknown action, reason and overlong note", async () => {
    await expect(event({ action: "deleted" }).validate()).rejects.toBeDefined();
    await expect(event({ reason: "unknown" }).validate()).rejects.toBeDefined();
    await expect(
      event({ note: "a".repeat(501) }).validate(),
    ).rejects.toMatchObject({ errors: { note: expect.anything() } });
  });

  it.each([
    "actorAdministratorId",
    "reportId",
    "sourceFlagId",
    "action",
    "reason",
    "previousModerationStatus",
    "newModerationStatus",
    "note",
    "occurredAt",
  ])("marks %s immutable", (path) => {
    expect(reportModerationEventSchema.path(path).options.immutable).toBe(
      true,
    );
  });

  it("defines two audit indexes without update timestamps", () => {
    expect(reportModerationEventSchema.indexes()).toHaveLength(2);
    expect(reportModerationEventSchema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { reportId: 1, occurredAt: -1, _id: -1 },
          expect.any(Object),
        ],
        [
          { actorAdministratorId: 1, occurredAt: -1, _id: -1 },
          expect.any(Object),
        ],
      ]),
    );
    expect(reportModerationEventSchema.get("timestamps")).toBe(false);
  });
});
