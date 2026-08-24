import { describe, expect, it } from "vitest";

import {
  matchesVerificationAnswer,
  normaliseVerificationAnswer,
} from "./verification";

describe("claim verification matching", () => {
  it.each([
    ["  Small\tblue\nmark  ", "small blue mark"],
    ["Small\u00a0blue\u2003mark", "small blue mark"],
    ["Small\u0085blue\u0085mark", "small blue mark"],
    ["\u0085Blue mark\u0085", "blue mark"],
    ["ＢＬＵＥ", "blue"],
    ["CAFÉ", "café"],
    ["CAFE\u0301", "café"],
  ])("normalises %j", (input, expected) => {
    expect(normaliseVerificationAnswer(input)).toBe(expected);
  });

  it("matches only after deterministic normalisation", () => {
    expect(
      matchesVerificationAnswer(" Small Blue Mark ", "small\tblue mark"),
    ).toBe(true);
    expect(matchesVerificationAnswer("blue mark", "blue marks")).toBe(false);
  });
});
