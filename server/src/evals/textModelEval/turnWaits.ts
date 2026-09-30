import { chainSides, productionArm } from "./arms.js";
import { isCheckedRetry, percentile } from "./armStats.js";
import { caseStory, type EvalCase } from "./cases.js";
import { PREGEN_TURN_CAP_S } from "./gateReadings.js";
import { PRODUCTION_RETRIED_OUTCOMES, usable, type CallRecord } from "./runner.js";

/*
 * The turn rounds' wait allowance (stop rule, owner 2026-09-27): the p95 per
 * turn kind at or under about 45 s on Luna medium and at or under 60 s
 * everywhere. A switch turn waits for the switch planner and the switch
 * turn, a chapter opening for the chapter planner and the chapter's first
 * step, every other turn for itself (turn doc A.C). Where a chain measured
 * the planner and the turn together, its wait is read; otherwise the
 * planner's p95 is added to the turn's, which reads high. Per prompt state,
 * isolated beat arm and player count. Hung calls (the eval's timeout) are in
 * no percentile, so they are counted apart. A turn alone waits for its whole
 * job: an attempt the runner re-sent at once, as production's parse retries
 * do (a reply cut at the output cap among them, turn round 3's B9), adds its
 * wait to the answer's; a transport failure, retried after a backoff, does
 * not. Cut attempts are counted apart too. Readings, not verdicts.
 */

export type TurnKind = "first turn" | "chapter step" | "chapter opening" | "switch turn" | "ending";

/** The kinds a planner's wait sits in front of, and the planner role it is. */
const PLANNED_KINDS: Partial<Record<TurnKind, "switch" | "thread">> = { "switch turn": "switch", "chapter opening": "thread" };

/** Luna medium's allowance, with a 15 s margin under the 60 s cap (turn doc section 4, "Stop rule, per change"). */
export const LUNA_MEDIUM_ALLOWANCE_S = 45;

const LUNA_MEDIUM = /^gpt-6-luna@medium[+/]/;

/**
 * The allowance per arm and kind. A chapter opening waits for the chapter
 * planner and the chapter's first step, and may take up to 60 s p95 if no
 * slower than today's form (coordinator, 2026-09-28, on the turn baseline
 * report's question; the "no slower" half is read beside the table against
 * today's form); 45 s stays for every other Luna medium turn.
 */
export function allowanceFor(armKey: string, kind?: TurnKind): number {
  if (kind === "chapter opening") return PREGEN_TURN_CAP_S;
  return LUNA_MEDIUM.test(armKey) ? LUNA_MEDIUM_ALLOWANCE_S : PREGEN_TURN_CAP_S;
}

/**
 * The turn a case measures: a beat case's own kind, from its tags and fixed
 * analysis; a planner case the turn it plans (a chapter plan opens a chapter;
 * a switch plan on turn 0 is the first turn's, a later one a switch turn's).
 */
export function turnKindOf(evalCase: EvalCase): TurnKind | undefined {
  switch (evalCase.role) {
    case "beat":
      if (evalCase.tags.firstBeat) return "first turn";
      if (evalCase.tags.ending) return "ending";
      if (evalCase.fixedAnalysis?.kind === "switch") return "switch turn";
      if (evalCase.fixedAnalysis?.kind === "thread") return "chapter opening";
      return "chapter step";
    case "thread":
      return "chapter opening";
    case "switch":
      return caseStory(evalCase, false).getCurrentTurn() === 0 ? "first turn" : "switch turn";
    default:
      return undefined;
  }
}

export type TurnWaitSource = "turn" | "chain" | "summed" | "turn only";

export type TurnWait = {
  promptState: string;
  /** The isolated beat arm */
  armKey: string;
  players: number;
  kind: TurnKind;
  /** Usable final calls of the turn alone */
  turns: number;
  turnP95?: number;
  /**
   * What the player waits for: the turn alone; on a switch turn or a chapter
   * opening the chain's measured wait, else the turn's p95 plus the planner's
   * ("turn only" when no planner was measured)
   */
  wait: { p95?: number; n: number; source: TurnWaitSource; planner?: string };
  allowanceS: number;
  within: boolean;
  /** Attempts on these cases that hung until the eval's timeout, the chain's included where its wait is read */
  hangs: number;
  /** Attempts of the turns alone cut at the output cap and re-sent (only an arm that sends production's cap has them) */
  cuts: number;
};

const seconds = (ms: number) => ms / 1000;
const good = (r: CallRecord) => r.final && usable(r);

/** The planner a beat arm is read with: the same key, else production's default for the role and player count, else the only one. */
function plannerFor(beatArm: string, role: "switch" | "thread", players: number, available: string[]): string | undefined {
  if (available.includes(beatArm)) return beatArm;
  const production = productionArm(role, players).key;
  if (available.includes(production)) return production;
  return available.length === 1 ? available[0] : undefined;
}

type Bucket = { records: CallRecord[]; hangs: number; cuts: number };

function bucketed(records: CallRecord[], keyOf: (r: CallRecord) => string | undefined): Map<string, Bucket> {
  const buckets = new Map<string, Bucket>();
  for (const r of records) {
    const key = keyOf(r);
    if (key === undefined) continue;
    const bucket = buckets.get(key) ?? { records: [], hangs: 0, cuts: 0 };
    if (r.outcome === "timeout") bucket.hangs++;
    if (r.outcome === "length") bucket.cuts++;
    if (good(r)) bucket.records.push(r);
    buckets.set(key, bucket);
  }
  return buckets;
}

const SEP = "\u0000";

const attemptKey = (r: CallRecord) => [r.jobKey, r.step].join(SEP);

/** Each job's (and step's) wait in ms: its answer's latency plus that of every attempt re-sent at once before it. */
function jobWaits(records: CallRecord[]): Map<string, number> {
  const resent = new Map<string, number>();
  for (const r of records) {
    if (r.final || !PRODUCTION_RETRIED_OUTCOMES.includes(r.outcome)) continue;
    resent.set(attemptKey(r), (resent.get(attemptKey(r)) ?? 0) + r.latencyMs);
  }
  return resent;
}

/** p95 per turn kind for every isolated beat arm, per prompt state and player count, against its allowance. */
export function turnWaitReadings(records: CallRecord[], kinds: Map<string, TurnKind>): TurnWait[] {
  const kindOf = (r: CallRecord) => kinds.get(r.caseId);
  const resent = jobWaits(records);
  const jobSeconds = (r: CallRecord) => seconds(r.latencyMs + (resent.get(attemptKey(r)) ?? 0));
  // Turns alone, by their first reply (production's checked retry, a turn's step 2, waits in the checked-turn report)
  const turns = bucketed(records, (r) => {
    const kind = kindOf(r);
    return r.group === "beat" && r.role === "beat" && !isCheckedRetry(r) && kind ? [r.promptState, r.armKey, r.players, kind].join(SEP) : undefined;
  });
  // Planners alone, by role
  const planners = bucketed(records, (r) =>
    (r.group === "switch" || r.group === "thread") && r.role === r.group && kinds.has(r.caseId) ? [r.promptState, r.armKey, r.players, r.role].join(SEP) : undefined
  );
  // Chains, by their beat side and the kind of turn they open; every step counts for hangs, the beat step for the wait
  const chains = bucketed(records, (r) => {
    const sides = r.group === "pipeline" ? chainSides(r.armKey) : undefined;
    const kind = kindOf(r);
    return sides && kind ? [r.promptState, sides.beat, r.players, kind, sides.analysis].join(SEP) : undefined;
  });

  const readings: TurnWait[] = [];
  const keys = new Set([...turns.keys(), ...[...chains.keys()].map((k) => k.split(SEP).slice(0, 4).join(SEP))]);
  for (const key of [...keys].sort()) {
    const [promptState, armKey, playersText, kindText] = key.split(SEP);
    const players = Number(playersText);
    const kind = kindText as TurnKind;
    const alone = turns.get(key) ?? { records: [], hangs: 0, cuts: 0 };
    const turnP95 = percentile(alone.records.map(jobSeconds), 95);
    const role = PLANNED_KINDS[kind];
    let wait: TurnWait["wait"] = { p95: turnP95, n: alone.records.length, source: "turn" };
    let hangs = alone.hangs;
    if (role) {
      const chainPrefix = `${key}${SEP}`;
      const chainAnalyses = [...chains.keys()].filter((k) => k.startsWith(chainPrefix)).map((k) => k.slice(chainPrefix.length));
      const chainPlanner = plannerFor(armKey, role, players, chainAnalyses);
      const chain = chainPlanner ? chains.get(`${chainPrefix}${chainPlanner}`) : undefined;
      const measured = chain?.records.filter((r) => r.step === 2 && r.turnLatencyMs !== undefined) ?? [];
      if (chain && measured.length) {
        wait = { p95: percentile(measured.map((r) => seconds(r.turnLatencyMs as number)), 95), n: measured.length, source: "chain", planner: chainPlanner };
        hangs += chain.hangs;
      } else {
        const plannerKey = (arm: string) => [promptState, arm, players, role].join(SEP);
        const available = [...new Set([...planners.keys()].map((k) => k.split(SEP)[1]))].filter((arm) => planners.has(plannerKey(arm)));
        const planner = plannerFor(armKey, role, players, available);
        const plannerRecords = planner ? planners.get(plannerKey(planner))?.records ?? [] : [];
        const plannerP95 = percentile(plannerRecords.map((r) => seconds(r.latencyMs)), 95);
        wait =
          planner && plannerP95 !== undefined && turnP95 !== undefined
            ? { p95: turnP95 + plannerP95, n: alone.records.length, source: "summed", planner }
            : { p95: turnP95, n: alone.records.length, source: "turn only" };
      }
    }
    const allowanceS = allowanceFor(armKey, kind);
    readings.push({
      promptState,
      armKey,
      players,
      kind,
      turns: alone.records.length,
      turnP95,
      wait,
      allowanceS,
      within: wait.p95 !== undefined && wait.p95 <= allowanceS,
      hangs,
      cuts: alone.cuts,
    });
  }
  return readings;
}

/**
 * One sample of one arm and turn kind, read as its own run (turn round 2):
 * the server's pace drifts by the hour (round 1 met 25-50% more milliseconds
 * per output token within three hours), and each sample of an arm ran at its
 * own hour, so a round reads its candidates against the reference's sample
 * that ran beside them. A chain's row reads the chain's measured wait.
 */
export type SampleWait = {
  promptState: string;
  /** The isolated beat arm, or the chain's key */
  armKey: string;
  players: number;
  kind: TurnKind;
  sample: number;
  turns: number;
  p50?: number;
  p95?: number;
  /** Median milliseconds per output token (reasoning included) of the turn calls: the server's pace */
  msPerToken?: number;
  /** The first and last call's start (ISO) */
  from: string;
  to: string;
};

export function turnWaitsBySample(records: CallRecord[], kinds: Map<string, TurnKind>): SampleWait[] {
  const resent = jobWaits(records);
  const groups = new Map<string, CallRecord[]>();
  for (const r of records) {
    const kind = kinds.get(r.caseId);
    const isTurn = (r.group === "beat" && r.role === "beat" && !isCheckedRetry(r)) || (r.group === "pipeline" && r.step === 2);
    if (!kind || !isTurn || !good(r)) continue;
    const key = [r.promptState, r.armKey, r.players, kind, r.sample].join(SEP);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const [promptState, armKey, players, kind, sample] = key.split(SEP);
      const waits = group.map((r) => seconds(r.group === "pipeline" ? r.turnLatencyMs ?? r.latencyMs : r.latencyMs + (resent.get(attemptKey(r)) ?? 0)));
      const pace = group.filter((r) => r.outputTokens > 0).map((r) => r.latencyMs / r.outputTokens);
      const starts = group.map((r) => r.startedAt).sort();
      return {
        promptState,
        armKey,
        players: Number(players),
        kind: kind as TurnKind,
        sample: Number(sample),
        turns: group.length,
        p50: percentile(waits, 50),
        p95: percentile(waits, 95),
        msPerToken: percentile(pace, 50),
        from: starts[0],
        to: starts[starts.length - 1],
      };
    })
    .sort((a, b) => a.promptState.localeCompare(b.promptState) || a.armKey.localeCompare(b.armKey) || a.players - b.players || a.kind.localeCompare(b.kind) || a.sample - b.sample);
}

const hour = (iso: string) => iso.slice(11, 16);
const windowOf = (row: SampleWait) => `${row.from.slice(0, 10)} ${hour(row.from)}-${hour(row.to)} UTC`;

/** The by-sample readings as a table (resultsReport.ts renders it after the turn waits). */
export function renderTurnWaitsBySample(rows: SampleWait[]): string[] {
  if (rows.length === 0) return [];
  return [
    "",
    "### Turn waits per sample (each sample of an arm is its own run; the server's pace drifts by the hour)",
    "",
    "Read a candidate against the reference's sample that ran beside it (turn round 2's rerun of today's form is its sample 4). Ms per token is the median of each call's wait over its output tokens, reasoning included: the server's pace, which drifts while the tokens don't. A chain's row reads the chain's measured wait and its turn's pace.",
    "",
    "| Prompt state | Arm | Players | Kind | Sample | Turns | p50 | p95 | Ms per token | Ran |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.promptState} | ${r.armKey} | ${r.players} | ${r.kind} | ${r.sample} | ${r.turns} | ${secs(r.p50)} | ${secs(r.p95)} | ${r.msPerToken === undefined ? "–" : r.msPerToken.toFixed(1)} | ${windowOf(r)} |`
    ),
  ];
}

const secs = (x?: number) => (x === undefined ? "–" : `${x.toFixed(1)} s`);

function sourceText(wait: TurnWait["wait"]): string {
  switch (wait.source) {
    case "chain":
      return `chain, ${wait.n}`;
    case "summed":
      return `summed with ${wait.planner}`;
    case "turn only":
      return "turn only; planner not measured";
    default:
      return "turn";
  }
}

/** The readings as a table (resultsReport.ts renders one per prompt state). */
export function renderTurnWaits(readings: TurnWait[]): string[] {
  if (readings.length === 0) return [];
  return [
    "",
    `### Turn waits per kind (the turn rounds' allowance: p95 at or under ${LUNA_MEDIUM_ALLOWANCE_S} s on Luna medium, at or under ${PREGEN_TURN_CAP_S} s everywhere; a chapter opening at or under ${PREGEN_TURN_CAP_S} s if no slower than today's form)`,
    "",
    "A switch turn waits for the switch planner and the turn, a chapter opening for the chapter planner and the chapter's first step, every other turn for itself (turn doc A.C). Where a chain measured the pair, its wait is read (chain, with its count); otherwise the planner's p95 is added to the turn's (summed, which reads high). A turn alone waits for its whole job: an attempt re-sent at once, as production's parse retries are (a reply cut at the output cap among them), adds its wait to the answer's. Hung calls hit the eval's timeout and are in no percentile, so they are counted apart, and so are the attempts cut at the output cap. Readings, not verdicts.",
    "",
    "| Prompt state | Beat arm | Players | Kind | Turns | Turn alone p95 | Wait p95 (source) | Allowance | Reading | Hung calls | Cut at the output cap |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...readings.map(
      (r) =>
        `| ${r.promptState} | ${r.armKey} | ${r.players} | ${r.kind} | ${r.turns} | ${secs(r.turnP95)} | ${secs(r.wait.p95)} (${sourceText(r.wait)}) | ${r.allowanceS} s | ${r.within ? "within" : "over"} | ${r.hangs} | ${r.cuts} |`
    ),
  ];
}
