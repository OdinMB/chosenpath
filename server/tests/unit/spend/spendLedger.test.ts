import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { SpendBucket } from "core/types/api.js";
import type { DailySpend, SpendKind } from "../../../src/spend/spendStore.js";
import type { StoryOrigin } from "../../../src/stories/StoryDbService.js";
import type { LlmCallRecord } from "../../../src/shared/llm/usageRecorder.js";

const addSpend =
  jest.fn<(day: string, bucket: SpendBucket, usd: number, kind: SpendKind) => Promise<void>>();
const bucketTotalOn = jest.fn<(day: string, bucket: SpendBucket) => Promise<number>>();
const totalsSince = jest.fn<(firstDay: string) => Promise<DailySpend[]>>();
const getStoryOrigin = jest.fn<(storyId: string) => Promise<StoryOrigin>>();

jest.unstable_mockModule("../../../src/spend/spendStore.js", () => ({
  addSpend,
  bucketTotalOn,
  totalsSince,
  utcDay: (date: Date) => date.toISOString().slice(0, 10),
}));
jest.unstable_mockModule("../../../src/stories/StoryDbService.js", () => ({
  storyDbService: { getStoryOrigin },
}));

const {
  imagesAllowedFor,
  isOverCeiling,
  recordImageCall,
  recordTextCall,
  resolveSpendCeilings,
  spendTotals,
} = await import("../../../src/spend/spendLedger.js");

const METRICS = {
  model: "gpt-6-luna-2026-09-01",
  inputTokens: 4_000,
  cachedTokens: 1_000,
  cacheWriteTokens: 0,
  outputTokens: 900,
  reasoningTokens: 200,
  refusal: false,
};

function textRecord(overrides: Partial<LlmCallRecord> = {}): LlmCallRecord {
  return { model: "gpt-6-luna", ms: 1200, ok: true, metrics: METRICS, ...overrides };
}

const NOW = new Date("2026-10-26T15:00:00Z");
const CEILINGS = { anonymous: 5, account: 20 };

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  addSpend.mockResolvedValue(undefined);
  getStoryOrigin.mockResolvedValue("anonymous");
});

afterEach(() => {
  jest.restoreAllMocks();
  addSpend.mockReset();
  bucketTotalOn.mockReset();
  totalsSince.mockReset();
  getStoryOrigin.mockReset();
});

describe("recordTextCall", () => {
  it("books a story's call to its story's bucket", async () => {
    getStoryOrigin.mockResolvedValue("account");

    await recordTextCall(textRecord({ storyId: "story-1" }));

    expect(getStoryOrigin).toHaveBeenCalledWith("story-1");
    expect(addSpend).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      "account",
      expect.any(Number),
      "text"
    );
    expect(addSpend.mock.calls[0]![2]).toBeGreaterThan(0);
  });

  it("books a call without a story (editor, content filter) to other", async () => {
    await recordTextCall(textRecord());

    expect(getStoryOrigin).not.toHaveBeenCalled();
    expect(addSpend.mock.calls[0]![1]).toBe("other");
  });

  it("records nothing for a failed call, whose cost isn't reported", async () => {
    await recordTextCall(textRecord({ ok: false, metrics: undefined, storyId: "story-1" }));

    expect(addSpend).not.toHaveBeenCalled();
  });

  it("never throws into the model call when the store fails", async () => {
    addSpend.mockRejectedValue(new Error("connection refused"));

    await expect(recordTextCall(textRecord())).resolves.toBeUndefined();
  });
});

describe("recordImageCall", () => {
  it("books an in-game image to its story's bucket and an editor image to other", async () => {
    getStoryOrigin.mockResolvedValue("anonymous");
    const usage = { inputTextTokens: 500, inputImageTokens: 0, outputTokens: 439 };

    await recordImageCall({ storyId: "story-2" }, "gpt-image-2.5-flare", usage);
    await recordImageCall({ bucket: "other" }, "gpt-image-2.5-sunburst", usage);

    expect(addSpend.mock.calls.map((call) => [call[1], call[3]])).toEqual([
      ["anonymous", "image"],
      ["other", "image"],
    ]);
  });
});

describe("isOverCeiling", () => {
  it("only records while no ceiling is set", async () => {
    expect(await isOverCeiling("anonymous", { anonymous: null, account: null }, NOW)).toBe(false);
    expect(bucketTotalOn).not.toHaveBeenCalled();
  });

  it("is false under the ceiling and true at or over it", async () => {
    bucketTotalOn.mockResolvedValueOnce(4.99);
    expect(await isOverCeiling("anonymous", CEILINGS, NOW)).toBe(false);

    bucketTotalOn.mockResolvedValueOnce(5);
    expect(await isOverCeiling("anonymous", CEILINGS, NOW)).toBe(true);

    bucketTotalOn.mockResolvedValueOnce(25);
    expect(await isOverCeiling("account", CEILINGS, NOW)).toBe(true);
    expect(bucketTotalOn).toHaveBeenLastCalledWith("2026-10-26", "account");
  });

  it("refuses everything in a bucket whose ceiling is 0", async () => {
    bucketTotalOn.mockResolvedValueOnce(0);

    expect(await isOverCeiling("account", { anonymous: null, account: 0 }, NOW)).toBe(true);
  });

  it("never ceilings other", async () => {
    expect(await isOverCeiling("other", { anonymous: 0, account: 0 }, NOW)).toBe(false);
  });

  it("lets requests through when the store can't be read", async () => {
    bucketTotalOn.mockRejectedValueOnce(new Error("connection refused"));

    expect(await isOverCeiling("anonymous", CEILINGS, NOW)).toBe(false);
  });
});

describe("imagesAllowedFor", () => {
  it("allows a story's images only while its bucket is under its ceiling", async () => {
    getStoryOrigin.mockResolvedValue("account");
    bucketTotalOn.mockResolvedValueOnce(20);

    expect(await imagesAllowedFor("story-3", CEILINGS, NOW)).toBe(false);

    bucketTotalOn.mockResolvedValueOnce(19);
    expect(await imagesAllowedFor("story-3", CEILINGS, NOW)).toBe(true);
  });
});

describe("resolveSpendCeilings", () => {
  it("reads unset as no ceiling and a number of dollars as the ceiling", () => {
    expect(resolveSpendCeilings({})).toEqual({ anonymous: null, account: null });
    expect(
      resolveSpendCeilings({
        SPEND_CEILING_ANONYMOUS_USD_PER_DAY: "5",
        SPEND_CEILING_ACCOUNT_USD_PER_DAY: "0",
      })
    ).toEqual({ anonymous: 5, account: 0 });
  });

  it.each(["abc", "-1"])("refuses %s, naming the setting", (raw) => {
    expect(() => resolveSpendCeilings({ SPEND_CEILING_ACCOUNT_USD_PER_DAY: raw })).toThrow(
      /SPEND_CEILING_ACCOUNT_USD_PER_DAY/
    );
  });
});

describe("spendTotals", () => {
  it("sums today and this month per bucket, with each ceiling", async () => {
    totalsSince.mockResolvedValue([
      { day: "2026-10-02", bucket: "anonymous", usd: 1.5, textCalls: 10, imageCalls: 2 },
      { day: "2026-10-26", bucket: "anonymous", usd: 0.25, textCalls: 3, imageCalls: 1 },
      { day: "2026-10-26", bucket: "other", usd: 2, textCalls: 4, imageCalls: 0 },
    ]);

    const totals = await spendTotals(CEILINGS, NOW);

    expect(totalsSince).toHaveBeenCalledWith("2026-10-01");
    expect(totals.today).toBe("2026-10-26");
    expect(totals.buckets.anonymous.today).toEqual({ usd: 0.25, textCalls: 3, imageCalls: 1 });
    expect(totals.buckets.anonymous.month).toEqual({ usd: 1.75, textCalls: 13, imageCalls: 3 });
    expect(totals.buckets.account.month).toEqual({ usd: 0, textCalls: 0, imageCalls: 0 });
    expect(totals.buckets.other.today.usd).toBe(2);
    expect(totals.buckets.anonymous.ceilingUsdPerDay).toBe(5);
    expect(totals.buckets.other.ceilingUsdPerDay).toBeNull();
  });
});
