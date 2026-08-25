import { describe, expect, it } from "vitest";

import {
  scoreReportMatch,
  type ScoringReport,
} from "./matching-score";

const source: ScoringReport = {
  id: "source",
  title: "Black laptop charger",
  publicDescription: "Lost a notebook power adapter near the library",
  categoryId: "electronics",
  campusLocationId: "library",
  occurredAt: "2026-08-20T00:00:00.000Z",
  colors: ["Black"],
  tags: ["laptop", "charger"],
  createdAt: "2026-08-20T01:00:00.000Z",
};

function candidate(overrides: Partial<ScoringReport> = {}): ScoringReport {
  return {
    ...source,
    id: "candidate",
    ...overrides,
  };
}

function factorPoints(
  result: ReturnType<typeof scoreReportMatch>,
  key: string,
) {
  return result.factors.find((factor) => factor.key === key)?.points ?? 0;
}

describe("explainable report matching score", () => {
  it("awards the fixed maximum and reports every positive factor", () => {
    const result = scoreReportMatch(source, candidate());

    expect(result.score).toBe(100);
    expect(result.factors.map((factor) => factor.key)).toEqual([
      "category",
      "location",
      "date",
      "colors",
      "tags",
      "text",
    ]);
    expect(
      result.factors.reduce((sum, factor) => sum + factor.points, 0),
    ).toBe(result.score);
    expect(result.factors.every((factor) => factor.points > 0)).toBe(true);
  });

  it.each([
    [0, 15],
    [1, 12],
    [3, 12],
    [4, 8],
    [7, 8],
    [8, 4],
    [14, 4],
    [15, 0],
  ])(
    "awards the documented date bucket for %i elapsed days",
    (days, points) => {
      const occurredAt = new Date(
        Date.parse(source.occurredAt!) + days * 86_400_000,
      ).toISOString();
      const result = scoreReportMatch(source, candidate({ occurredAt }));

      expect(factorPoints(result, "date")).toBe(points);
    },
  );

  it("omits hidden candidate location and date completely", () => {
    const result = scoreReportMatch(
      source,
      candidate({ campusLocationId: null, occurredAt: null }),
    );

    expect(result.factors.map((factor) => factor.key)).not.toContain(
      "location",
    );
    expect(result.factors.map((factor) => factor.key)).not.toContain("date");
    expect(result.score).toBe(70);
  });

  it("rounds colour and tag Jaccard scores over normalised unique sets", () => {
    const result = scoreReportMatch(
      candidate({
        colors: [" BLACK ", "black", "Blue"],
        tags: ["laptop", "charger", "usb-c"],
      }),
      candidate({
        colors: ["black", "Green"],
        tags: ["charger", "USB-C", "power"],
      }),
    );

    expect(factorPoints(result, "colors")).toBe(5);
    expect(factorPoints(result, "tags")).toBe(5);
    expect(
      result.factors.find((factor) => factor.key === "colors")?.explanation,
    ).toBe("Shared colours: black");
    expect(
      result.factors.find((factor) => factor.key === "tags")?.explanation,
    ).toBe("Shared tags: charger, usb-c");
  });

  it("normalises Unicode, punctuation, stop words and domain synonyms", () => {
    const result = scoreReportMatch(
      candidate({
        title: "ＴＨＥ ＭＯＢＩＬＥ notebook adapter",
        publicDescription: "",
        colors: [],
        tags: [],
      }),
      candidate({
        title: "phone, laptop & charger",
        publicDescription: "",
        colors: [],
        tags: [],
      }),
    );

    expect(factorPoints(result, "text")).toBe(20);
  });

  it("returns finite zero text and set points for empty inputs", () => {
    const result = scoreReportMatch(
      candidate({
        title: "the and",
        publicDescription: "in the",
        colors: [],
        tags: [],
      }),
      candidate({
        title: "a of",
        publicDescription: "to the",
        colors: [],
        tags: [],
      }),
    );

    expect(Number.isFinite(result.score)).toBe(true);
    expect(factorPoints(result, "text")).toBe(0);
    expect(factorPoints(result, "colors")).toBe(0);
    expect(factorPoints(result, "tags")).toBe(0);
  });

  it("returns no factors for unrelated public information", () => {
    const result = scoreReportMatch(
      source,
      candidate({
        title: "Silver water bottle",
        publicDescription: "Found beside the gym entrance",
        categoryId: "drinkware",
        campusLocationId: "gym",
        occurredAt: "2026-09-20T00:00:00.000Z",
        colors: ["Silver"],
        tags: ["bottle"],
      }),
    );

    expect(result).toEqual({ score: 0, factors: [] });
  });

  it("emits only bounded safe positive explanations", () => {
    const result = scoreReportMatch(source, candidate());
    const serialised = JSON.stringify(result);

    expect(
      result.factors.every(
        (factor) =>
          factor.points <= factor.maximum && factor.explanation.length <= 80,
      ),
    ).toBe(true);
    expect(serialised).not.toMatch(
      /expectedAnswer|serialNumber|exactLocationDetails|privateNotes|reporterId/i,
    );
  });

  it("ranks the strongest labelled fixture first with precision at five of 0.8", () => {
    const fixtures = [
      { id: "strong", relevant: true, report: candidate({ id: "strong" }) },
      {
        id: "category-location",
        relevant: true,
        report: candidate({
          id: "category-location",
          title: "Green umbrella",
          publicDescription: "Found after class",
          occurredAt: "2026-09-20T00:00:00.000Z",
          colors: ["Green"],
          tags: ["umbrella"],
        }),
      },
      {
        id: "category-colour",
        relevant: true,
        report: candidate({
          id: "category-colour",
          title: "Silver calculator",
          publicDescription: "Found in a lecture theatre",
          campusLocationId: null,
          occurredAt: "2026-09-20T00:00:00.000Z",
          tags: ["calculator"],
        }),
      },
      {
        id: "category-tags",
        relevant: true,
        report: candidate({
          id: "category-tags",
          title: "Unmarked electronics",
          publicDescription: "Item handed to reception",
          campusLocationId: null,
          occurredAt: "2026-09-20T00:00:00.000Z",
          colors: ["White"],
        }),
      },
      {
        id: "labelled-distractor",
        relevant: false,
        report: candidate({
          id: "labelled-distractor",
          title: "Red camera",
          publicDescription: "Found camera body",
          occurredAt: "2026-09-20T00:00:00.000Z",
          colors: ["Red"],
          tags: ["camera"],
        }),
      },
      {
        id: "irrelevant",
        relevant: false,
        report: candidate({
          id: "irrelevant",
          title: "Blue scarf",
          publicDescription: "Found outside the sports hall",
          categoryId: "clothing",
          campusLocationId: "sports-hall",
          occurredAt: "2026-09-20T00:00:00.000Z",
          colors: ["Blue"],
          tags: ["scarf"],
        }),
      },
    ];

    const ranked = fixtures
      .map((fixture) => ({
        ...fixture,
        score: scoreReportMatch(source, fixture.report).score,
      }))
      .filter((fixture) => fixture.score >= 35)
      .sort(
        (left, right) =>
          right.score - left.score || right.id.localeCompare(left.id),
      )
      .slice(0, 5);

    expect(ranked[0]).toMatchObject({ id: "strong", relevant: true });
    expect(ranked).toHaveLength(5);
    expect(ranked.filter((fixture) => fixture.relevant)).toHaveLength(4);
    expect(ranked.filter((fixture) => fixture.relevant).length / 5).toBe(0.8);
    expect(
      fixtures.find((fixture) => fixture.id === "irrelevant") &&
        scoreReportMatch(
          source,
          fixtures.find((fixture) => fixture.id === "irrelevant")!.report,
        ).score,
    ).toBeLessThan(35);
  });
});
