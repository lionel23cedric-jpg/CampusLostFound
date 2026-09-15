import { describe, expect, it, vi } from "vitest";

import {
  auditLegacyPhotoUrls,
  partitionPhotoReferences,
} from "./audit-legacy-photo-urls.mjs";

const internal = "/api/report-images/507f1f77bcf86cd799439011";
const legacy = "https://old.example/photo.jpg";
const invalid = "javascript:alert(1)";

function collectionFor(reports: object[], matchedCount = 1) {
  return {
    find: vi.fn(() => reports),
    updateOne: vi.fn().mockResolvedValue({ matchedCount }),
  };
}

describe("legacy report image audit", () => {
  it("classifies references without mutating the input", () => {
    const source = [internal, legacy, invalid];

    expect(partitionPhotoReferences(source)).toEqual({
      internal: [internal],
      legacy: [legacy],
      invalid: [invalid],
    });
    expect(source).toEqual([internal, legacy, invalid]);
  });

  it("defaults to a read-only dry run and does not print URLs", async () => {
    const collection = collectionFor([
      { _id: "report-1", updatedAt: new Date(0), photoUrls: [internal, legacy, invalid] },
    ]);
    const log = vi.fn();

    const result = await auditLegacyPhotoUrls(collection, { log });

    expect(result).toEqual({
      reports: 1,
      internal: 1,
      legacy: 1,
      invalid: 1,
      updated: 0,
      conflicts: 0,
    });
    expect(collection.updateOne).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "Report report-1: 1 internal, 1 legacy, 1 invalid.",
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(legacy);
    expect(JSON.stringify(log.mock.calls)).not.toContain(invalid);
  });

  it("keeps only internal images in explicit apply mode", async () => {
    const updatedAt = new Date("2026-09-14T00:00:00.000Z");
    const replacementDate = new Date("2026-09-15T00:00:00.000Z");
    const collection = collectionFor([
      { _id: "report-1", updatedAt, photoUrls: [internal, legacy, invalid] },
    ]);

    const result = await auditLegacyPhotoUrls(collection, {
      apply: true,
      now: () => replacementDate,
      log: vi.fn(),
    });

    expect(collection.updateOne).toHaveBeenCalledWith(
      { _id: "report-1", updatedAt },
      { $set: { photoUrls: [internal], updatedAt: replacementDate } },
    );
    expect(result.updated).toBe(1);
  });

  it("counts optimistic concurrency conflicts", async () => {
    const collection = collectionFor(
      [{ _id: "report-1", updatedAt: new Date(0), photoUrls: [legacy] }],
      0,
    );

    const result = await auditLegacyPhotoUrls(collection, {
      apply: true,
      log: vi.fn(),
    });

    expect(result.conflicts).toBe(1);
    expect(result.updated).toBe(0);
  });
});
