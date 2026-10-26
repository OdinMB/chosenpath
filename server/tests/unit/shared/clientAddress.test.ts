import { describe, expect, it } from "@jest/globals";
import {
  clientAddress,
  describeConnection,
  legacyClientAddress,
  parseTrustProxy,
} from "../../../src/shared/clientAddress.js";

/*
 * The address every per-address limit counts by. A visitor behind three
 * proxies; each proxy appends the address it received the request from, and
 * the nearest one is only the socket. The forged entry is what a visitor
 * writes into X-Forwarded-For themselves.
 */

const VISITOR = "198.51.100.23";
const CHAIN = `${VISITOR}, 172.16.0.2, 10.0.0.3`;
const FORGED = "203.0.113.7";
const SOCKET = "10.0.0.4";

describe("clientAddress", () => {
  it("counts proxies from the right: 0 is the socket, 1 the nearest entry, 3 the visitor", () => {
    expect(clientAddress(SOCKET, CHAIN, 0)).toBe(SOCKET);
    expect(clientAddress(SOCKET, CHAIN, 1)).toBe("10.0.0.3");
    expect(clientAddress(SOCKET, CHAIN, 3)).toBe(VISITOR);
  });

  it("ignores an entry the visitor forged at the right count, and believes it one count too high", () => {
    const forgedChain = `${FORGED}, ${CHAIN}`;

    expect(clientAddress(SOCKET, forgedChain, 3)).toBe(VISITOR);
    expect(clientAddress(SOCKET, forgedChain, 4)).toBe(FORGED);
  });

  it("gives no address on a chain shorter than the count, never the leftmost entry or the socket", () => {
    expect(clientAddress(SOCKET, CHAIN, 4)).toBeNull();
  });

  it("gives no address without a header, or with garbage at the counted position", () => {
    expect(clientAddress(SOCKET, undefined, 1)).toBeNull();
    expect(clientAddress(SOCKET, "", 1)).toBeNull();
    expect(clientAddress(SOCKET, `${VISITOR}, unknown`, 1)).toBeNull();
    expect(clientAddress(SOCKET, `${VISITOR}, , 10.0.0.3`, 2)).toBeNull();
  });

  it("reads IPv4-mapped IPv6 as IPv4 and strips ports", () => {
    expect(clientAddress(SOCKET, `::ffff:${VISITOR}`, 1)).toBe(VISITOR);
    expect(clientAddress(SOCKET, `${VISITOR}:5678`, 1)).toBe(VISITOR);
    expect(clientAddress(SOCKET, "[::1]:80", 1)).toBe("::1");
    expect(clientAddress(`::ffff:${VISITOR}`, undefined, 0)).toBe(VISITOR);
  });

  it("joins repeated header lines in order", () => {
    expect(clientAddress(SOCKET, [VISITOR, "172.16.0.2, 10.0.0.3"], 3)).toBe(
      VISITOR
    );
    expect(clientAddress(SOCKET, [VISITOR, "172.16.0.2, 10.0.0.3"], 2)).toBe(
      "172.16.0.2"
    );
  });
});

describe("legacyClientAddress (TRUST_PROXY unset)", () => {
  it("takes the leftmost entry, as the app did before the count existed", () => {
    expect(legacyClientAddress(SOCKET, `${FORGED}, ${CHAIN}`)).toBe(FORGED);
  });

  it("falls back to the socket without a header", () => {
    expect(legacyClientAddress(`::ffff:${SOCKET}`, undefined)).toBe(SOCKET);
  });
});

describe("describeConnection", () => {
  it("reports the chain as sent and what each count would give", () => {
    const report = describeConnection(SOCKET, CHAIN, 3, "api.example.org", "https");

    expect(report.forwardedFor).toEqual([VISITOR, "172.16.0.2", "10.0.0.3"]);
    expect(report.candidates).toEqual([
      { hops: 0, address: SOCKET },
      { hops: 1, address: "10.0.0.3" },
      { hops: 2, address: "172.16.0.2" },
      { hops: 3, address: VISITOR },
    ]);
    expect(report.address).toBe(VISITOR);
    expect(report.trustProxy).toBe(3);
    expect(report.connectionAddress).toBe(SOCKET);
    expect(report.host).toBe("api.example.org");
    expect(report.protocol).toBe("https");
  });

  it("gives at every count the candidate the limits would count by", () => {
    for (const hops of [0, 1, 2, 3]) {
      const report = describeConnection(SOCKET, CHAIN, hops, null, "http");
      expect(report.candidates[hops]?.address).toBe(report.address);
    }
  });

  it("has only the socket as candidate when no header came", () => {
    const report = describeConnection(SOCKET, undefined, 1, null, "http");

    expect(report.forwardedFor).toEqual([]);
    expect(report.candidates).toEqual([{ hops: 0, address: SOCKET }]);
  });

  it("answers with exactly the diagnostic's seven keys", () => {
    const report = describeConnection(SOCKET, CHAIN, null, null, "http");

    expect(Object.keys(report).sort()).toEqual(
      [
        "address",
        "candidates",
        "connectionAddress",
        "forwardedFor",
        "host",
        "protocol",
        "trustProxy",
      ].sort()
    );
    // Unset: the address is the leftmost entry, as the limits read it
    expect(report.trustProxy).toBeNull();
    expect(report.address).toBe(VISITOR);
  });
});

describe("parseTrustProxy", () => {
  it("accepts a whole number of proxies from 0 to 10", () => {
    expect(parseTrustProxy("0")).toBe(0);
    expect(parseTrustProxy("2")).toBe(2);
    expect(parseTrustProxy("10")).toBe(10);
  });

  it("reads unset or empty as not set", () => {
    expect(parseTrustProxy(undefined)).toBeNull();
    expect(parseTrustProxy("")).toBeNull();
  });

  it.each(["true", "11", "-1", "1,2", "10.0.0.0/8"])(
    "refuses %s, naming the setting",
    (raw) => {
      expect(() => parseTrustProxy(raw)).toThrow(/TRUST_PROXY/);
    }
  );
});
