import { armStatsOf, isResultRecord, percentile, type ArmStats } from "./armStats.js";
import { chainKey, chainSides, prodSiblingKey } from "./arms.js";
import type { CaseTags } from "./cases.js";
import { PER_STORY_WITH_PREGEN } from "./gateReadings.js";
import type { CallRecord } from "./runner.js";
import type { CheckResult } from "./textChecks.js";

/*
 * The Stage 3 reading: each trimmed-variant arm against the full (prod) arm
 * of the same model and effort, on the (case, sample) pairs both finished.
 * Tokens, waits, cost, validity, state counts, and the rule checks that read
 * lower or higher than the full form beyond its own noise floor (sample 1
 * against sample 2). Readings, not verdicts: nothing is dropped or picked.
 */

export type CheckReading = { name: string; full: number; trimmed: number; flag?: "lower" | "higher" };
/** noise: the full arm's |mean(sample 1) − mean(sample 2)|, when both samples are matched */
export type CountReading = { name: string; full: number; trimmed: number; noise?: number };

export type VariantComparison = {
  group: CallRecord["group"];
  trimmedKey: string;
  fullKey: string;
  /** (case, sample) pairs both arms finished; both sides are read on these only */
  pairs: number;
  trimmed: ArmStats;
  full: ArmStats;
  /** Whether both samples are matched, so the full arm has a noise floor */
  hasNoise: boolean;
  counts: CountReading[];
  checks: CheckReading[];
};

const EPSILON = 1e-9;

/** The full form's key: the prod sibling, or for a chain the sibling of each side. */
function fullKeyOf(armKey: string): string | undefined {
  const chain = chainSides(armKey);
  if (!chain) return prodSiblingKey(armKey);
  const fullAnalysis = prodSiblingKey(chain.analysis);
  const fullBeat = prodSiblingKey(chain.beat);
  return fullAnalysis || fullBeat ? chainKey(fullAnalysis ?? chain.analysis, fullBeat ?? chain.beat) : undefined;
}

const pairOf = (r: CallRecord) => `${r.caseId}|${r.sample}`;
const finishedPairs = (records: CallRecord[]) => new Set(records.filter((r) => r.jobFinal).map(pairOf));

type Inputs = { checks: Map<string, CheckResult>; tags: Map<string, CaseTags> };

function sampleStats(records: CallRecord[], sample: number, inputs: Inputs): ArmStats | undefined {
  const inSample = records.filter((r) => r.sample === sample);
  return inSample.length ? armStatsOf(inSample, inputs.checks, inputs.tags) : undefined;
}

function countReadings(trimmed: ArmStats, full: ArmStats, fullRecords: CallRecord[], hasNoise: boolean, inputs: Inputs): CountReading[] {
  const s1 = hasNoise ? sampleStats(fullRecords, 1, inputs) : undefined;
  const s2 = hasNoise ? sampleStats(fullRecords, 2, inputs) : undefined;
  return Object.keys(full.meanCounts)
    .filter((name) => name in trimmed.meanCounts)
    .sort()
    .map((name) => {
      const reading: CountReading = { name, full: full.meanCounts[name], trimmed: trimmed.meanCounts[name] };
      const [a, b] = [s1?.meanCounts[name], s2?.meanCounts[name]];
      return a !== undefined && b !== undefined ? { ...reading, noise: Math.abs(a - b) } : reading;
    });
}

function checkReadings(trimmed: ArmStats, full: ArmStats, hasNoise: boolean): CheckReading[] {
  return Object.keys(full.ruleRates)
    .filter((name) => name in trimmed.ruleRates)
    .sort()
    .map((name) => {
      const reading: CheckReading = { name, full: full.ruleRates[name], trimmed: trimmed.ruleRates[name] };
      const noise = hasNoise ? full.noiseFloor[name] : undefined;
      if (noise === undefined) return reading;
      if (reading.trimmed < reading.full - noise - EPSILON) return { ...reading, flag: "lower" };
      if (reading.trimmed > reading.full + noise + EPSILON) return { ...reading, flag: "higher" };
      return reading;
    });
}

function compare(trimmedRecords: CallRecord[], fullRecords: CallRecord[], fullKey: string, inputs: Inputs): VariantComparison | undefined {
  const fullFinished = finishedPairs(fullRecords);
  const shared = new Set([...finishedPairs(trimmedRecords)].filter((pair) => fullFinished.has(pair)));
  if (shared.size === 0) return undefined;
  const onShared = (records: CallRecord[]) => records.filter((r) => shared.has(pairOf(r)));
  const matchedFull = onShared(fullRecords);
  const trimmed = armStatsOf(onShared(trimmedRecords), inputs.checks, inputs.tags);
  const full = armStatsOf(matchedFull, inputs.checks, inputs.tags);
  const samples = new Set(matchedFull.map((r) => r.sample));
  const hasNoise = samples.has(1) && samples.has(2);
  return {
    group: trimmed.group,
    trimmedKey: trimmed.armKey,
    fullKey,
    pairs: shared.size,
    trimmed,
    full,
    hasNoise,
    counts: countReadings(trimmed, full, matchedFull, hasNoise, inputs),
    checks: checkReadings(trimmed, full, hasNoise),
  };
}

/** Every trimmed arm in the prompt state that has its full form in the same group. */
export function variantComparisons(
  records: CallRecord[],
  checks: Map<string, CheckResult>,
  tags: Map<string, CaseTags>,
  promptState: string
): VariantComparison[] {
  const byArm = new Map<string, CallRecord[]>();
  for (const r of records) {
    if (r.promptState !== promptState || r.baseline || !isResultRecord(r, tags)) continue;
    const key = `${r.group}|${r.armKey}`;
    byArm.set(key, [...(byArm.get(key) ?? []), r]);
  }
  const comparisons: VariantComparison[] = [];
  for (const trimmedRecords of byArm.values()) {
    const { group, armKey } = trimmedRecords[0];
    const fullKey = fullKeyOf(armKey);
    const fullRecords = fullKey ? byArm.get(`${group}|${fullKey}`) : undefined;
    const comparison = fullKey && fullRecords ? compare(trimmedRecords, fullRecords, fullKey, { checks, tags }) : undefined;
    if (comparison) comparisons.push(comparison);
  }
  return comparisons;
}

// ---------------------------------------------------------------- rendering

const secs = (x?: number) => (x === undefined ? "–" : `${x.toFixed(1)} s`);
const usd = (x?: number) => (x === undefined ? "–" : `$${x.toFixed(4)}`);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const tokens = (x?: number) => (x === undefined ? "–" : String(Math.round(x)));

/** "full → trimmed (±n%)" */
function fromTo(full: number | undefined, trimmed: number | undefined, format: (x?: number) => string): string {
  const change =
    full && trimmed !== undefined ? ` (${trimmed >= full ? "+" : "-"}${Math.abs(Math.round(((trimmed - full) / full) * 100))}%)` : "";
  return `${format(full)} → ${format(trimmed)}${change}`;
}

/** Calls of this role in a single-player story with pregeneration (85/19/21, and one setup). */
function callsPerStory(group: CallRecord["group"]): number | undefined {
  switch (group) {
    case "setup":
      return 1;
    case "beat":
    case "switch":
    case "thread":
      return PER_STORY_WITH_PREGEN[group];
    default:
      return undefined;
  }
}

function storyShare(stats: ArmStats): number | undefined {
  const calls = callsPerStory(stats.group);
  const onePlayer = stats.cost.billed.byPlayers[1] ?? stats.cost.billed.perCall;
  return calls === undefined ? undefined : calls * onePlayer;
}

function renderArmRows(comparisons: VariantComparison[]): string[] {
  const lines = [
    "| Role | Trimmed arm | Pairs | 1st-attempt valid trim / full | Visible tokens | Reasoning tokens | p50 wait | p95 wait | $/call billed | Per 1-player story with pregeneration |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const { group, trimmedKey, pairs, trimmed: t, full: f } of comparisons) {
    const valid = (s: ArmStats) => `${s.validity.firstAttemptValid}/${s.validity.calls}`;
    lines.push(
      `| ${group} | ${trimmedKey} | ${pairs} | ${valid(t)} / ${valid(f)} | ${fromTo(f.medianTokens.visible, t.medianTokens.visible, tokens)} | ${fromTo(f.medianTokens.reasoning, t.medianTokens.reasoning, tokens)} | ${fromTo(f.latency.p50, t.latency.p50, secs)} | ${fromTo(f.latency.p95, t.latency.p95, secs)} | ${fromTo(f.cost.billed.perCall, t.cost.billed.perCall, usd)} | ${fromTo(storyShare(f), storyShare(t), usd)} |`
    );
  }
  return lines;
}

function renderStateRows(comparisons: VariantComparison[]): string[] {
  const lines = [
    "",
    "| Role | Trimmed arm | State counts per call, full (±noise) → trim | Checks lower than full beyond noise | Checks higher than full beyond noise |",
    "|---|---|---|---|---|",
  ];
  const rates = (checks: CheckReading[]) => checks.map((c) => `${c.name} ${pct(c.full)} → ${pct(c.trimmed)}`).join("; ") || "–";
  for (const c of comparisons) {
    const counts = c.counts
      .map((n) => `${n.name} ${n.full.toFixed(2)}${n.noise === undefined ? "" : ` (±${n.noise.toFixed(2)})`} → ${n.trimmed.toFixed(2)}`)
      .join("; ");
    const flagged = c.hasNoise
      ? `${rates(c.checks.filter((k) => k.flag === "lower"))} | ${rates(c.checks.filter((k) => k.flag === "higher"))}`
      : `one sample, no noise floor; raw rates: ${rates(c.checks)} | –`;
    lines.push(`| ${c.group} | ${c.trimmedKey} | ${counts || "–"} | ${flagged} |`);
  }
  return lines;
}

function renderSetupWaits(comparisons: VariantComparison[]): string[] {
  const setups = comparisons.filter((c) => c.group === "setup");
  if (setups.length === 0) return [];
  const byPlayers = ({ trimmed, full }: VariantComparison) =>
    Object.keys(trimmed.latencyByPlayers)
      .map(Number)
      .sort((a, b) => a - b)
      .map((n) => `${n}p ${fromTo(percentile(full.latencyByPlayers[n] ?? [], 50), percentile(trimmed.latencyByPlayers[n], 50), secs)}`)
      .join("; ");
  return ["", "Setup median wait by player count, full → trim:", ...setups.map((c) => `- ${c.trimmedKey}: ${byPlayers(c)}`)];
}

function renderChainWaits(comparisons: VariantComparison[]): string[] {
  const chains = comparisons.filter((c) => c.group === "pipeline");
  if (chains.length === 0) return [];
  const wait = (c: VariantComparison, p: number) =>
    fromTo(percentile(c.full.turnLatencies, p), percentile(c.trimmed.turnLatencies, p), secs);
  return [
    "",
    "| Chain (analysis-turn wait, single-player) | p50 full → trim | p95 full → trim |",
    "|---|---|---|",
    ...chains.map((c) => `| ${c.trimmedKey} | ${wait(c, 50)} | ${wait(c, 95)} |`),
  ];
}

export function renderVariantComparison(comparisons: VariantComparison[]): string[] {
  if (comparisons.length === 0) return [];
  return [
    "",
    "### Stage 3: trimmed variants against their full form",
    "",
    "Readings on paired cases: each trimmed arm against the full (prod) arm of the same model and effort, on the (case, sample) pairs both finished. Columns read full → trimmed. Waits carry server drift, because the full forms ran earlier; tokens and cost do not. Nothing is dropped or picked.",
    "",
    ...renderArmRows(comparisons),
    ...renderStateRows(comparisons),
    ...renderSetupWaits(comparisons),
    ...renderChainWaits(comparisons),
  ];
}
