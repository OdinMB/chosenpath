import { isIP } from "net";
import type { Request } from "express";
import type { Socket } from "socket.io";
import type { ConnectionReport } from "core/types/api.js";
import { Logger } from "shared/logger.js";
import { noteAddressRead } from "shared/unreadableAddresses.js";

/*
 * The visitor's address, which every per-address limit counts by, for HTTP
 * and Socket.IO alike. Each proxy in front of the app appends to
 * X-Forwarded-For the address it received the request from; the nearest one
 * is only the socket. So with TRUST_PROXY = N proxies, the visitor is the Nth
 * entry from the right. Anything further left the visitor may have written.
 * Background and the procedure for measuring N: .context/deployment.md,
 * "Client address (TRUST_PROXY)".
 */

const log = Logger.forService("ClientAddress");

/** The hop count's only accepted form: a whole number from 0 to 10. */
const HOP_COUNT = /^(\d|10)$/;

/**
 * TRUST_PROXY as a hop count, or null when it is unset or empty (legacy mode).
 * Anything else stops the server: "true" would let every visitor pick their
 * own address, and an address list can't name Render's proxies.
 */
export function parseTrustProxy(raw: string | undefined): number | null {
  const value = raw?.trim() ?? "";
  if (value === "") return null;
  if (!HOP_COUNT.test(value)) {
    throw new Error(
      "TRUST_PROXY must be a whole number of proxies from 0 to 10, or unset"
    );
  }
  return Number(value);
}

/** The header's entries left to right; repeated header lines join in order. */
function forwardedEntries(header: string | string[] | undefined): string[] {
  const joined = Array.isArray(header) ? header.join(",") : header ?? "";
  if (joined.trim() === "") return [];
  return joined.split(",").map((entry) => entry.trim());
}

/** "1.2.3.4:5678" gives "1.2.3.4" and "[::1]:80" gives "::1"; bare IPv6 stays. */
function hostOf(entry: string): string {
  if (entry.startsWith("[")) {
    const end = entry.indexOf("]");
    return end === -1 ? "" : entry.slice(1, end);
  }
  // One colon is an IPv4 address with a port; IPv6 has several
  const colons = entry.split(":").length - 1;
  return colons === 1 ? entry.slice(0, entry.indexOf(":")) : entry;
}

/** An entry as an IP address (IPv4-mapped IPv6 as IPv4), or null when it is none. */
function normalizeAddress(entry: string | undefined): string | null {
  if (!entry) return null;
  const host = hostOf(entry.trim());
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(host);
  const address = mapped ? mapped[1] : host;
  return isIP(address) ? address : null;
}

/** An IPv6 address's groups, "::" expanded; a dotted IPv4 tail counts as its two groups. */
function ipv6Groups(address: string): string[] {
  const [head, tail] = address.split("::");
  const groupsOf = (part: string | undefined) =>
    (part ? part.split(":") : []).flatMap((group) =>
      group.includes(".") ? ["0", "0"] : [group]
    );
  const before = groupsOf(head);
  const after = tail === undefined ? [] : groupsOf(tail);
  const missing = tail === undefined ? 0 : 8 - before.length - after.length;
  return [...before, ...Array<string>(Math.max(0, missing)).fill("0"), ...after];
}

/**
 * The /64 network of an IPv6 address, written "2001:db8:1:2::/64"; null for
 * anything else. One connection is usually handed a whole /64, so per-address
 * limits count it as one address (rateLimiter.ts, addressKey).
 */
export function ipv6Network64(address: string): string | null {
  const bare = address.split("%")[0];
  if (isIP(bare) !== 6) return null;
  const network = ipv6Groups(bare)
    .slice(0, 4)
    .map((group) => parseInt(group, 16).toString(16));
  return `${network.join(":")}::/64`;
}

/**
 * The visitor behind `hops` proxies: the socket at 0, otherwise the hops-th
 * header entry from the right. Null on a shorter chain, no header, or an entry
 * that is no address: never the leftmost entry (the visitor wrote it) and
 * never the socket (on Render, a proxy).
 */
export function clientAddress(
  peer: string | undefined,
  forwardedFor: string | string[] | undefined,
  hops: number
): string | null {
  if (hops === 0) return normalizeAddress(peer);
  const entries = forwardedEntries(forwardedFor);
  if (entries.length < hops) return null;
  return normalizeAddress(entries[entries.length - hops]);
}

/**
 * The address while TRUST_PROXY is unset: the leftmost entry, else the
 * socket, as the app counted before the hop count existed. Forgeable.
 */
export function legacyClientAddress(
  peer: string | undefined,
  forwardedFor: string | string[] | undefined
): string | null {
  return (
    normalizeAddress(forwardedEntries(forwardedFor)[0]) ??
    normalizeAddress(peer)
  );
}

function addressFor(
  peer: string | undefined,
  forwardedFor: string | string[] | undefined,
  hops: number | null
): string | null {
  return hops === null
    ? legacyClientAddress(peer, forwardedFor)
    : clientAddress(peer, forwardedFor, hops);
}

/**
 * The caller's own request as the server sees it, for the admin check that
 * finds the right hop count (/admin/system). Exactly these keys: the derived
 * address, the configured count, the socket, the chain as sent, and the
 * address each count from 0 to the chain's length would give.
 */
export function describeConnection(
  peer: string | undefined,
  forwardedFor: string | string[] | undefined,
  hops: number | null,
  host: string | null | undefined,
  protocol: string
): ConnectionReport {
  const chain = forwardedEntries(forwardedFor);
  return {
    address: addressFor(peer, forwardedFor, hops),
    trustProxy: hops,
    connectionAddress: normalizeAddress(peer),
    forwardedFor: chain,
    candidates: Array.from({ length: chain.length + 1 }, (_, count) => ({
      hops: count,
      address: clientAddress(peer, forwardedFor, count),
    })),
    host: host ?? null,
    protocol,
  };
}

let configuredHops: { hops: number | null } | undefined;

/**
 * TRUST_PROXY, read once. index.ts calls it before the server listens, so a
 * bad value refuses startup. Unset logs a one-time warning.
 */
export function trustProxyHops(): number | null {
  if (!configuredHops) {
    configuredHops = { hops: parseTrustProxy(process.env.TRUST_PROXY) };
    if (configuredHops.hops === null) {
      log.warn(
        "TRUST_PROXY is not set: limits count by the leftmost X-Forwarded-For entry, which a visitor can forge. Measure the count on /admin/system and set it (.context/deployment.md, \"Client address (TRUST_PROXY)\")."
      );
    }
  }
  return configuredHops.hops;
}

/**
 * The visitor's address for an HTTP request, by the configured hop count.
 * Each read is counted (unreadableAddresses.ts), so an unreadable share shows
 * on /admin/system.
 */
export function requestAddress(
  req: Pick<Request, "socket" | "headers">
): string | null {
  return noteAddressRead(
    addressFor(
      req.socket.remoteAddress,
      req.headers["x-forwarded-for"],
      trustProxyHops()
    )
  );
}

/** The visitor's address for a Socket.IO connection, by the configured hop count. */
export function socketAddress(socket: Pick<Socket, "handshake">): string | null {
  return noteAddressRead(
    addressFor(
      socket.handshake.address,
      socket.handshake.headers["x-forwarded-for"],
      trustProxyHops()
    )
  );
}

/** The diagnostic's report of an HTTP request (GET /admin/system/connection). */
export function describeRequest(
  req: Pick<Request, "socket" | "headers" | "protocol">
): ConnectionReport {
  return describeConnection(
    req.socket.remoteAddress,
    req.headers["x-forwarded-for"],
    trustProxyHops(),
    req.headers.host,
    req.protocol
  );
}
