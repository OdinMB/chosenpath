import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  noteAddressRead,
  resetUnreadableAddressCounts,
  unreadableAddressCounts,
} from "../../../src/shared/unreadableAddresses.js";

/*
 * A TRUST_PROXY set higher than the real proxy chain makes every visitor's
 * address unreadable, and puts them all in one limit bucket. The counts show
 * it on /admin/system, and the log keeps saying so while it lasts.
 */

const START = Date.parse("2026-10-26T12:00:00Z");
const MINUTE = 60 * 1000;

let warnings: string[];

beforeEach(() => {
  resetUnreadableAddressCounts(START);
  warnings = [];
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("unreadableAddressCounts", () => {
  it("counts unreadable reads among all reads, since start and in the last hour", () => {
    noteAddressRead("198.51.100.23", START);
    noteAddressRead(null, START + MINUTE);
    noteAddressRead(null, START + 2 * MINUTE);

    expect(unreadableAddressCounts(START + 3 * MINUTE)).toEqual({
      sinceStart: { unreadable: 2, total: 3, since: START },
      lastHour: { unreadable: 2, total: 3 },
    });
  });

  it("drops reads older than an hour from the recent count, not from the total", () => {
    noteAddressRead(null, START);
    noteAddressRead("198.51.100.23", START + 90 * MINUTE);

    expect(unreadableAddressCounts(START + 91 * MINUTE)).toEqual({
      sinceStart: { unreadable: 1, total: 2, since: START },
      lastHour: { unreadable: 0, total: 1 },
    });
  });
});

describe("the warning", () => {
  it("comes with the first unreadable read and again at most every ten minutes", () => {
    noteAddressRead(null, START);
    noteAddressRead(null, START + MINUTE);
    noteAddressRead(null, START + 9 * MINUTE);
    expect(warnings).toHaveLength(1);

    noteAddressRead(null, START + 10 * MINUTE);
    expect(warnings).toHaveLength(2);
    expect(warnings[1]).toContain("4 of 4 address reads in the last hour");
  });

  it("never comes for readable reads, and names no address", () => {
    noteAddressRead("198.51.100.23", START);
    expect(warnings).toHaveLength(0);

    noteAddressRead(null, START + MINUTE);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).not.toContain("198.51.100.23");
  });
});
