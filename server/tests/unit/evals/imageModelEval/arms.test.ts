import {
  BEAT_BASELINE,
  beatArmsForItem,
  costFromUsage,
} from "../../../../src/evals/imageModelEval/arms.js";

describe("beatArmsForItem", () => {
  const items = Array.from({ length: 12 }, (_, i) => beatArmsForItem(i));

  it("includes the baseline first in every item and at most 4 arms", () => {
    for (const arms of items) {
      expect(arms[0].key).toBe(BEAT_BASELINE.key);
      expect(arms.filter((a) => a.baseline)).toHaveLength(1);
      expect(arms.length).toBeLessThanOrEqual(4);
    }
  });

  it("shows each candidate in exactly 9 of 12 items", () => {
    const counts = new Map<string, number>();
    for (const arm of items.flat().filter((a) => !a.baseline)) {
      counts.set(arm.key, (counts.get(arm.key) ?? 0) + 1);
    }
    expect(counts.size).toBe(4);
    for (const count of counts.values()) {
      expect(count).toBe(9);
    }
  });
});

describe("costFromUsage", () => {
  const usage = {
    inputTextTokens: 1_000_000,
    inputImageTokens: 1_000_000,
    outputTokens: 1_000_000,
  };

  it("prices gpt-image-1.5 output at $32 per 1M tokens", () => {
    // 5 (text in) + 8 (image in) + 32 (image out)
    expect(costFromUsage("gpt-image-1.5", usage)).toBeCloseTo(45);
  });

  it("prices gpt-image-2.5 output at $30 per 1M tokens", () => {
    expect(costFromUsage("gpt-image-2.5-flare", usage)).toBeCloseTo(43);
    expect(costFromUsage("gpt-image-2.5-sunburst", usage)).toBeCloseTo(43);
  });

  it("bills reported cached input at the cached rate, text first", () => {
    const cached = { ...usage, cachedInputTokens: 1_500_000 };
    // text: 1M cached at 1.25; image: 0.5M cached at 2 + 0.5M at 8; out 30
    expect(costFromUsage("gpt-image-2.5-flare", cached)).toBeCloseTo(1.25 + 1 + 4 + 30);
  });
});
