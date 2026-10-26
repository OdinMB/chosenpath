import type { ConnectionReport, UnreadableAddressCounts } from "core/types/api";

/*
 * Whether TRUST_PROXY (the number of proxies in front of the server) is set
 * right, measured from the admin's own browser. The page asks the server how
 * it sees a request that carries a forged X-Forwarded-For entry: each proxy
 * appends the address it received the request from, so the forged entry sits
 * one place left of the real visitor, and the hop count that reaches the
 * forged entry is one too many.
 */

/** A documentation address (RFC 5737) no real visitor has. */
export const FORGED_ADDRESS = "203.0.113.7";

export type ClientAddressVerdict =
  | { kind: "right"; hops: number }
  | { kind: "too-high"; configured: number; correct: number }
  | { kind: "too-low"; configured: number; correct: number }
  | { kind: "not-set"; correct: number }
  // A proxy dropped the forged header, so the chain says nothing about the count
  | { kind: "header-removed" };

/**
 * The verdict on a report of the request sent with the forged entry. The
 * lowest hop count whose candidate is the forged entry (the rightmost forged
 * entry in the chain) is one past the visitor.
 */
export function clientAddressVerdict(
  forgedReport: Pick<ConnectionReport, "candidates" | "trustProxy">,
  forged: string = FORGED_ADDRESS
): ClientAddressVerdict {
  const reachesForged = [...forgedReport.candidates]
    .sort((a, b) => a.hops - b.hops)
    .find((candidate) => candidate.address === forged);
  if (!reachesForged) return { kind: "header-removed" };

  const correct = reachesForged.hops - 1;
  const configured = forgedReport.trustProxy;
  if (configured === null) return { kind: "not-set", correct };
  if (configured === correct) return { kind: "right", hops: correct };
  return configured > correct
    ? { kind: "too-high", configured, correct }
    : { kind: "too-low", configured, correct };
}

/** The verdict in one line, for the admin page. */
export function describeVerdict(verdict: ClientAddressVerdict): string {
  switch (verdict.kind) {
    case "right":
      return `TRUST_PROXY is right: ${verdict.hops}.`;
    case "too-high":
      return `TRUST_PROXY is too high (${verdict.configured} → ${verdict.correct}): anyone can forge their address. Set it to ${verdict.correct}.`;
    case "too-low":
      return `TRUST_PROXY is too low (${verdict.configured} → ${verdict.correct}): visitors share a proxy's address. Set it to ${verdict.correct}.`;
    case "not-set":
      return `TRUST_PROXY is not set: limits use the leftmost entry, which a visitor can forge. Set it to ${verdict.correct}.`;
    case "header-removed":
      return "A proxy removed the X-Forwarded-For header this page sent, so the count can't be measured from here.";
  }
}

/**
 * How many of the server's address reads found no address, in one line: all
 * such requests share one limit bucket, and most of them means TRUST_PROXY
 * counts more proxies than the chain has.
 */
export function describeUnreadableCounts(counts: UnreadableAddressCounts): string {
  const { lastHour, sinceStart } = counts;
  const since = `${new Date(sinceStart.since).toISOString().slice(0, 16).replace("T", " ")} UTC`;
  const line =
    `${lastHour.unreadable.toLocaleString("en-US")} of ${lastHour.total.toLocaleString("en-US")} in the last hour; ` +
    `${sinceStart.unreadable.toLocaleString("en-US")} of ${sinceStart.total.toLocaleString("en-US")} since the server started (${since}).`;
  return lastHour.unreadable * 2 > lastHour.total
    ? `${line} Most requests share one bucket: TRUST_PROXY is likely higher than the proxy chain.`
    : line;
}
