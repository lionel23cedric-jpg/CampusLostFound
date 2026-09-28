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
});
