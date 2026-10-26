import type { ConnectionReport } from "core/types/api";
import {
  clientAddressVerdict,
  describeUnreadableCounts,
  describeVerdict,
  FORGED_ADDRESS,
} from "../../../src/admin/system/clientAddressVerdict";

/*
 * The admin's TRUST_PROXY check: a request with a forged X-Forwarded-For entry
 * shows how many proxies append to the chain, and so which count is right.
 * The reference case: visitor 198.51.100.23 behind three proxies, each of
 * which appends the address it received the request from.
 */

const VISITOR = "198.51.100.23";
const SOCKET = "10.0.0.9";

/** The report of a request whose chain is `chain`, as the server builds its candidates. */
function report(chain: string[], trustProxy: number | null): ConnectionReport {
  return {
    address: null,
    trustProxy,
    connectionAddress: SOCKET,
    forwardedFor: chain,
    candidates: Array.from({ length: chain.length + 1 }, (_, hops) => ({
      hops,
      address: hops === 0 ? SOCKET : (chain[chain.length - hops] ?? null),
    })),
    host: "api.chosenpath.ai",
    protocol: "https",
  };
}

const BEHIND_THREE = [FORGED_ADDRESS, VISITOR, "172.16.0.2", "10.0.0.3"];

describe("clientAddressVerdict", () => {
  it("calls 3 right for a visitor behind three appending hops", () => {
    expect(clientAddressVerdict(report(BEHIND_THREE, 3))).toEqual({ kind: "right", hops: 3 });
  });

  it("calls 4 and 7 too high, and names 3", () => {
    expect(clientAddressVerdict(report(BEHIND_THREE, 4))).toEqual({
      kind: "too-high",
      configured: 4,
      correct: 3,
    });
    expect(clientAddressVerdict(report(BEHIND_THREE, 7))).toEqual({
      kind: "too-high",
      configured: 7,
      correct: 3,
    });
  });

  it("calls 2 and 0 too low, and names 3", () => {
    expect(clientAddressVerdict(report(BEHIND_THREE, 2))).toEqual({
      kind: "too-low",
      configured: 2,
      correct: 3,
    });
    expect(clientAddressVerdict(report(BEHIND_THREE, 0))).toEqual({
      kind: "too-low",
      configured: 0,
      correct: 3,
    });
  });

  it("with no proxy, calls 0 right and 1 too high", () => {
    // The socket is the visitor; the chain holds only what the browser sent
    expect(clientAddressVerdict(report([FORGED_ADDRESS], 0))).toEqual({ kind: "right", hops: 0 });
    expect(clientAddressVerdict(report([FORGED_ADDRESS], 1))).toEqual({
      kind: "too-high",
      configured: 1,
      correct: 0,
    });
  });

  it("says the header was removed when the chain lacks the forged entry, or there is no chain", () => {
    expect(clientAddressVerdict(report([VISITOR, "10.0.0.3"], 2))).toEqual({
      kind: "header-removed",
    });
    expect(clientAddressVerdict(report([], null))).toEqual({ kind: "header-removed" });
  });

  it("goes by the rightmost forged entry when it appears twice", () => {
    const twice = [FORGED_ADDRESS, FORGED_ADDRESS, VISITOR, "10.0.0.3"];

    expect(clientAddressVerdict(report(twice, 2))).toEqual({ kind: "right", hops: 2 });
  });

  it("names the count to set when none is set", () => {
    expect(clientAddressVerdict(report(BEHIND_THREE, null))).toEqual({
      kind: "not-set",
      correct: 3,
    });
  });
});

describe("describeVerdict", () => {
  it("names the count to set in every verdict that has one", () => {
    expect(describeVerdict({ kind: "too-high", configured: 4, correct: 3 })).toContain("(4 → 3)");
    expect(describeVerdict({ kind: "too-low", configured: 2, correct: 3 })).toContain("(2 → 3)");
    expect(describeVerdict({ kind: "not-set", correct: 3 })).toContain("Set it to 3");
    expect(describeVerdict({ kind: "right", hops: 3 })).toContain("right");
  });
});

describe("describeUnreadableCounts", () => {
  const since = Date.parse("2026-10-26T09:30:00Z");

  it("gives the last hour's and the total counts with the server's start", () => {
    expect(
      describeUnreadableCounts({
        lastHour: { unreadable: 3, total: 1200 },
        sinceStart: { unreadable: 5, total: 24000, since },
      })
    ).toBe("3 of 1,200 in the last hour; 5 of 24,000 since the server started (2026-10-26 09:30 UTC).");
  });

  it("points at TRUST_PROXY once most of the last hour's requests had no address", () => {
    const line = describeUnreadableCounts({
      lastHour: { unreadable: 90, total: 100 },
      sinceStart: { unreadable: 90, total: 100, since },
    });

    expect(line).toContain("Most requests share one bucket");
    expect(line).toContain("TRUST_PROXY");
  });

  it("says nothing more when no request came in the last hour", () => {
    expect(
      describeUnreadableCounts({
        lastHour: { unreadable: 0, total: 0 },
        sinceStart: { unreadable: 0, total: 0, since },
      })
    ).not.toContain("Most requests");
  });
});
