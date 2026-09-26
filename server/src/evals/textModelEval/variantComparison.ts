import { armStatsOf, isResultRecord, type ArmStats } from "./armStats.js";
import { chainKey, chainSides, prodSiblingKey } from "./arms.js";
import type { CaseTags } from "./cases.js";
import type { CallRecord } from "./runner.js";
import type { CheckResult } from "./textChecks.js";

/*
 * The Stage 3 readings: each trimmed-variant arm against the full (prod) arm
 * of the same model and effort, on the (case, sample) pairs both finished.
 * Tokens, waits, cost, validity, state counts, and the rule checks that read
 * lower or higher than the full form beyond its own noise floor (sample 1
 * against sample 2). Readings only, rendered by resultsReport.ts; nothing is
 * dropped or picked.
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
