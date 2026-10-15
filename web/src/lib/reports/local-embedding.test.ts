import { describe, expect, it } from "vitest";

import { embedPublicText } from "./local-embedding";

describe("local public-text embedding", () => {
  it("returns finite, normalized vectors from the packaged quantized model", async () => {
    const first = await embedPublicText("red canvas backpack near the library");
    const second = await embedPublicText("red backpack found beside library desks");

    expect(first).toHaveLength(384);
    expect(second).toHaveLength(384);
    expect(Array.from(first).every(Number.isFinite)).toBe(true);
    expect(Math.hypot(...first)).toBeCloseTo(1, 5);
    expect(Math.hypot(...second)).toBeCloseTo(1, 5);
    expect(first).not.toEqual(second);
  });

  it("truncates long text at the model boundary while retaining special tokens", async () => {
    const bounded = await embedPublicText("a ".repeat(510));
    const long = await embedPublicText("a ".repeat(900));

    expect(long).toHaveLength(384);
    expect(Array.from(long).every(Number.isFinite)).toBe(true);
    expect(Math.hypot(...long)).toBeCloseTo(1, 5);
    expect(long).toEqual(bounded);
  });
});
