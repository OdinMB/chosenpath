import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  IMAGE_CALL_FALLBACK_USD,
  imageCallCostUsd,
  imageCostFromUsage,
  textCallCostUsd,
  textCostFromUsage,
} from "../../../src/spend/prices.js";

/*
 * Production pricing never throws: a call the app already paid for is
 * recorded even when its model is missing from the table. The table's own
 * numbers are pinned by the evals' pricing and arms tests.
 */

const TEXT_USAGE = {
  inputTokens: 120_000,
  cachedTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 30_000,
};
const KNOWN_TEXT_MODELS = ["gpt-4.1-mini", "gpt-4.1", "gpt-6-sol", "gpt-6.1-sol", "gpt-6-luna"];
const IMAGE_USAGE = { inputTextTokens: 900, inputImageTokens: 3_072, outputTokens: 1_756 };

let warnings: string[];

beforeEach(() => {
  warnings = [];
  jest.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("textCallCostUsd", () => {
  it("prices a known model, dated names included, as the eval does", () => {
    expect(textCallCostUsd("gpt-6-luna-2026-09-01", TEXT_USAGE)).toBeCloseTo(
      textCostFromUsage("gpt-6-luna", TEXT_USAGE),
      10
    );
  });

  it("charges cached input tokens at the cached rate", () => {
    const cached = { ...TEXT_USAGE, cachedTokens: 100_000 };

    expect(textCallCostUsd("gpt-6-sol", cached)).toBeLessThan(
      textCallCostUsd("gpt-6-sol", TEXT_USAGE)
    );
    expect(textCallCostUsd("gpt-6-sol", cached)).toBeCloseTo(
      textCostFromUsage("gpt-6-sol", cached),
      10
    );
  });

  it("prices an unknown model at least as high as any known one, warning once instead of throwing", () => {
    const cost = textCallCostUsd("o9-preview", TEXT_USAGE);
    textCallCostUsd("o9-preview", TEXT_USAGE);

    for (const model of KNOWN_TEXT_MODELS) {
      expect(cost).toBeGreaterThanOrEqual(textCostFromUsage(model, TEXT_USAGE));
    }
    expect(warnings.filter((line) => line.includes("o9-preview"))).toHaveLength(1);
    expect(() => textCallCostUsd(undefined, TEXT_USAGE)).not.toThrow();
  });
});

describe("imageCallCostUsd", () => {
  it("prices an image by the usage the Images API reported", () => {
    expect(imageCallCostUsd("gpt-image-2.5-flare", IMAGE_USAGE)).toBeCloseTo(
      imageCostFromUsage("gpt-image-2.5-flare", IMAGE_USAGE),
      10
    );
  });

  it("books the flat worst-case estimate when no usage was reported", () => {
    expect(imageCallCostUsd("gpt-image-2.5-flare", undefined)).toBe(
      IMAGE_CALL_FALLBACK_USD
    );
  });

  it("prices an unknown image model at least as high as a known one, without throwing", () => {
    const cost = imageCallCostUsd("gpt-image-9", IMAGE_USAGE);

    expect(cost).toBeGreaterThanOrEqual(imageCostFromUsage("gpt-image-1.5", IMAGE_USAGE));
    expect(cost).toBeGreaterThanOrEqual(imageCostFromUsage("gpt-image-2.5-flare", IMAGE_USAGE));
  });
});
