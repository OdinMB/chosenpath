import type { CaseTags } from "./cases.js";
import { costFromUsage } from "./pricing.js";
import type { CheckResult } from "./textChecks.js";
import { usable, type CallRecord } from "./runner.js";
import { modelAttemptsByStep, validityReading, type ValidityReading } from "./validityGate.js";

/*
 * Per-arm statistics from the call records and the automatic checks:
 * validity, rule rates and their noise floor, latencies, tokens, state counts
 * and cost on the billed and the uncached basis.
 */

type Quantiles = { n: number; p50?: number; p95?: number };

/** Billed: as charged. Uncached: priced as if nothing came from cache (gpt-4.1 caches implicitly). */
export type CostBasis = "billed" | "uncached";
export const COST_BASES: CostBasis[] = ["billed", "uncached"];

export type CostReading = {
  /** Mean cost of a call, every attempt summed (production pays for re-sends too) */
  perCall: number;
  /** The same over calls with this many players */
  byPlayers: Record<number, number>;
};

export type ArmStats = {
  promptState: string;
  group: CallRecord["group"];
  armKey: string;
  model: string;
  baseline: boolean;
  calls: number;
  validity: ValidityReading;
  /** Over each call's first model attempt, so a re-send cannot hide them (rejectedParam: over all records) */
  rates: {
    repaired: number;
    refusal: number;
    length: number;
    rejectedParam: number;
    textAfterJson: number;
    junk: number;
  };
  /** check name -> pass rate over usable outputs */
  ruleRates: Record<string, number>;
  /** check name -> |rate(sample 1) − rate(sample 2)|, the noise floor (baseline) */
  noiseFloor: Record<string, number>;
  /** Seconds, usable final calls */
  latency: Quantiles;
  /** Single-player beat calls on turns without analysis */
  beatOnlyLatencies: number[];
  /** Single-player pipeline chains: analysis plus beat */
  turnLatencies: number[];
  latencyByPlayers: Record<number, number[]>;
  /** visible = output minus reasoning */
  medianTokens: { input: number; cached: number; cacheWrite: number; output: number; reasoning: number; visible: number };
  /** check count name -> mean over usable final calls whose check reports it (facts, newElements, switches, …) */
  meanCounts: Record<string, number>;
  cost: Record<CostBasis, CostReading>;
};

export function percentile(values: number[], p: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function quantiles(values: number[]): Quantiles {
  return { n: values.length, p50: percentile(values, 50), p95: percentile(values, 95) };
}

function median(values: number[]): number {
  return percentile(values, 50) ?? 0;
}

/** The q-quantile of weighted samples (weights need not sum to 1). */
export function weightedQuantile(samples: { value: number; weight: number }[], q: number): number | undefined {
  const sorted = samples.filter((s) => s.weight > 0).sort((a, b) => a.value - b.value);
  const total = sorted.reduce((sum, s) => sum + s.weight, 0);
  if (total === 0) return undefined;
  let cumulative = 0;
  for (const sample of sorted) {
    cumulative += sample.weight;
    if (cumulative / total >= q - 1e-12) return sample.value;
  }
  return sorted[sorted.length - 1].value;
}

const rate = (hits: number, n: number) => (n === 0 ? 0 : hits / n);

function ruleRatesOf(records: CallRecord[], checks: Map<string, CheckResult>): Record<string, number> {
  const passes: Record<string, { ok: number; n: number }> = {};
  for (const record of records) {
    const result = record.outputFile ? checks.get(record.outputFile) : undefined;
    for (const [name, ok] of Object.entries(result?.checks ?? {})) {
      passes[name] ??= { ok: 0, n: 0 };
      passes[name].n++;
      if (ok) passes[name].ok++;
    }
  }
  return Object.fromEntries(Object.entries(passes).map(([name, p]) => [name, rate(p.ok, p.n)]));
}

function meanCountsOf(records: CallRecord[], checks: Map<string, CheckResult>): Record<string, number> {
  const sums: Record<string, { total: number; n: number }> = {};
  for (const record of records) {
    const result = record.outputFile ? checks.get(record.outputFile) : undefined;
    for (const [name, value] of Object.entries(result?.counts ?? {})) {
      sums[name] ??= { total: 0, n: 0 };
      sums[name].total += value;
      sums[name].n++;
    }
  }
  return Object.fromEntries(Object.entries(sums).map(([name, s]) => [name, s.total / s.n]));
}

function uncachedCost(r: CallRecord): number {
  return r.costSource === "usage"
    ? costFromUsage(r.model, {
        inputTokens: r.inputTokens,
        cachedTokens: 0,
        cacheWriteTokens: r.cacheWriteTokens,
        outputTokens: r.outputTokens,
      })
    : r.costUsd;
}

const PRICE: Record<CostBasis, (r: CallRecord) => number> = {
  billed: (r) => r.costUsd,
  uncached: uncachedCost,
};

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

/** Every attempt of a call (job and step) summed, then averaged over calls, overall and by player count. */
function costReading(records: CallRecord[], price: (r: CallRecord) => number): CostReading {
  const calls = new Map<string, { players: number; usd: number }>();
  for (const r of records) {
    const key = `${r.jobKey}|${r.step}`;
    const call = calls.get(key) ?? { players: r.players, usd: 0 };
    call.usd += price(r);
    calls.set(key, call);
  }
  const all = [...calls.values()];
  const byPlayers: Record<number, number> = {};
  for (const players of new Set(all.map((c) => c.players))) {
    byPlayers[players] = mean(all.filter((c) => c.players === players).map((c) => c.usd));
  }
  return { perCall: mean(all.map((c) => c.usd)), byPlayers };
}

/** Statistics over one arm's records (every attempt; the first record names the arm). */
export function armStatsOf(
  records: CallRecord[],
  checks: Map<string, CheckResult>,
  tags: Map<string, CaseTags>
): ArmStats {
  const first = records[0];
  const finals = records.filter((r) => r.final);
  const good = finals.filter(usable);
  const firstAttempts = modelAttemptsByStep(records).calls.map((attempts) => attempts[0]);
  const firstRate = (hit: (r: CallRecord) => boolean) => rate(firstAttempts.filter(hit).length, firstAttempts.length);
  const seconds = (r: CallRecord) => r.latencyMs / 1000;
  const bySample = (n: number) => ruleRatesOf(good.filter((r) => r.sample === n), checks);
  const s1 = bySample(1);
  const s2 = bySample(2);
  const latencyByPlayers: Record<number, number[]> = {};
  for (const r of good) (latencyByPlayers[r.players] ??= []).push(seconds(r));
  return {
    promptState: first.promptState,
    group: first.group,
    armKey: first.armKey,
    model: first.model,
    baseline: first.baseline,
    calls: finals.length,
    validity: validityReading(records),
    rates: {
      repaired: firstRate((r) => r.outcome === "repaired"),
      refusal: firstRate((r) => r.outcome === "refusal"),
      length: firstRate((r) => r.outcome === "length"),
      rejectedParam: rate(records.filter((r) => r.rejectedParam).length, records.length),
      textAfterJson: firstRate((r) => r.textAfterJson === true),
      junk: firstRate((r) => r.junkChars > 0),
    },
    ruleRates: ruleRatesOf(good, checks),
    noiseFloor: Object.fromEntries(
      Object.keys(s1)
        .filter((name) => name in s2)
        .map((name) => [name, Math.abs(s1[name] - s2[name])])
    ),
    latency: quantiles(good.map(seconds)),
    beatOnlyLatencies: good
      .filter((r) => r.group === "beat" && r.players === 1 && !tags.get(r.caseId)?.analysisTurn)
      .map(seconds),
    turnLatencies: good.filter((r) => r.turnLatencyMs !== undefined && r.players === 1).map((r) => (r.turnLatencyMs ?? 0) / 1000),
    latencyByPlayers,
    medianTokens: {
      input: median(good.map((r) => r.inputTokens)),
      cached: median(good.map((r) => r.cachedTokens)),
      cacheWrite: median(good.map((r) => r.cacheWriteTokens)),
      output: median(good.map((r) => r.outputTokens)),
      reasoning: median(good.map((r) => r.reasoningTokens)),
      visible: median(good.map((r) => r.outputTokens - r.reasoningTokens)),
    },
    meanCounts: meanCountsOf(good, checks),
    cost: { billed: costReading(records, PRICE.billed), uncached: costReading(records, PRICE.uncached) },
  };
}

/**
 * Whether a record counts towards an arm's results: frozen cases only (case
 * building on other inputs counts as spend, not as results), and chains by
 * their beat step.
 */
export function isResultRecord(record: CallRecord, tags: Map<string, CaseTags>): boolean {
  return tags.has(record.caseId) && (record.group !== "pipeline" || record.step === 2);
}

/** One entry per prompt state, group and arm, over the frozen cases. Chains are summarised by their beat step. */
export function computeArmStats(
  records: CallRecord[],
  checks: Map<string, CheckResult>,
  tags: Map<string, CaseTags>
): ArmStats[] {
  const groups = new Map<string, CallRecord[]>();
  for (const record of records) {
    if (!isResultRecord(record, tags)) continue;
    const key = `${record.promptState}|${record.group}|${record.armKey}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return [...groups.values()].map((group) => armStatsOf(group, checks, tags));
}
