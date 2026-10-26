import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockQuery =
  jest.fn<(query: string, params?: unknown[]) => Promise<{ rows: unknown[] }>>();

jest.unstable_mockModule("../../../src/shared/db.js", () => ({
  getDb: () => ({ query: mockQuery }),
}));

const { addSpend, bucketTotalOn, totalsSince, utcDay } = await import(
  "../../../src/spend/spendStore.js"
);

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [] });
});

describe("utcDay", () => {
  it("names the UTC day, whatever the server's time zone", () => {
    expect(utcDay(new Date("2026-10-26T23:59:59.999Z"))).toBe("2026-10-26");
    expect(utcDay(new Date("2026-10-27T00:00:00.000Z"))).toBe("2026-10-27");
  });
});

describe("addSpend", () => {
  it("adds a text call's cost to the day's bucket in one upsert", async () => {
    await addSpend("2026-10-26", "account", 0.0123, "text");

    const [sql, params] = mockQuery.mock.calls[0]!;
    expect(sql).toMatch(/INSERT INTO spend_daily/);
    expect(sql).toMatch(/ON CONFLICT \(day, bucket\) DO UPDATE/);
    expect(sql).toMatch(/usd = spend_daily\.usd \+ EXCLUDED\.usd/);
    expect(params?.slice(0, 5)).toEqual(["2026-10-26", "account", 0.0123, 1, 0]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("counts an image call as an image call", async () => {
    await addSpend("2026-10-26", "anonymous", 0.04, "image");

    const [, params] = mockQuery.mock.calls[0]!;
    expect(params?.slice(0, 5)).toEqual(["2026-10-26", "anonymous", 0.04, 0, 1]);
  });
});

describe("reading totals", () => {
  it("reads a day's bucket total as a number, 0 when nothing was spent", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ usd: "1.250000" }] });
    expect(await bucketTotalOn("2026-10-26", "anonymous")).toBe(1.25);

    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await bucketTotalOn("2026-10-26", "anonymous")).toBe(0);
  });

  it("reads each day's rows since a day, with numbers as numbers", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { day: "2026-10-25", bucket: "other", usd: "0.500000", text_calls: 3, image_calls: 1 },
      ],
    });

    expect(await totalsSince("2026-10-01")).toEqual([
      { day: "2026-10-25", bucket: "other", usd: 0.5, textCalls: 3, imageCalls: 1 },
    ]);
    expect(mockQuery.mock.calls[0]![1]).toEqual(["2026-10-01"]);
  });
});
