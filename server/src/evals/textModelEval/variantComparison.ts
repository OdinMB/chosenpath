import { armStatsOf, isResultRecord, type ArmStats } from "./armStats.js";
import { chainKey, chainSides, referenceKey } from "./arms.js";
import type { CaseTags } from "./cases.js";
import { finishesJob, type CallRecord } from "./runner.js";
import type { CheckResult } from "./textChecks.js";

/*
 * The variant readings of Stages 3 and 4: each variant arm against its
 * reference arm (referenceKey: a Stage 3 trim against its full form, a Stage
 * 4 rewrite against the form it rewrites, a verbosity arm against the same
 * arm without it), on the (case, sample) pairs both finished. The baseline's
 * records can be a reference; the baseline is never a candidate. Tokens,
 * waits, cost, caching, validity, state counts, and the rule checks that read
 * lower or higher than the reference beyond its own noise floor: the
 * reference's sample 1 against its sample 2 on the matched cases, so a
 * one-sample arm is read against a two-sample reference's noise. Readings
 * only, rendered by resultsReport.ts; nothing is dropped or picked.
 */

export type CheckReading = { name: string; reference: number; arm: number; flag?: "lower" | "higher" };
/** noise: the reference's |mean(sample 1) − mean(sample 2)| on the matched cases, when it has both samples there */
export type CountReading = { name: string; reference: number; arm: number; noise?: number };

export type VariantComparison = {
  group: CallRecord["group"];
  armKey: string;
  referenceKey: string;
  /** (case, sample) pairs both arms finished; both sides are read on these only */
  pairs: number;
  arm: ArmStats;
  reference: ArmStats;
  /** Whether the reference has samples 1 and 2 on the matched cases, so it has a noise floor */
  hasNoise: boolean;
  counts: CountReading[];
  checks: CheckReading[];
};

const EPSILON = 1e-9;

/** The reference's key: the arm's reference, or for a chain the reference of each side. */
function referenceKeyOf(armKey: string): string | undefined {
  const chain = chainSides(armKey);
  if (!chain) return referenceKey(armKey);
  const analysis = referenceKey(chain.analysis);
  const beat = referenceKey(chain.beat);
  return analysis || beat ? chainKey(analysis ?? chain.analysis, beat ?? chain.beat) : undefined;
}

const pairOf = (r: CallRecord) => `${r.caseId}|${r.sample}`;
/** The runner's "finished": a pair whose only final record is a rejected request waits for its re-run, so it is not one. */
const finishedPairs = (records: CallRecord[]) => new Set(records.filter(finishesJob).map(pairOf));

type Inputs = { checks: Map<string, CheckResult>; tags: Map<string, CaseTags> };

function sampleStats(records: CallRecord[], sample: number, inputs: Inputs): ArmStats | undefined {
  const inSample = records.filter((r) => r.sample === sample);
  return inSample.length ? armStatsOf(inSample, inputs.checks, inputs.tags) : undefined;
}

/** The reference's sample 1 and sample 2 statistics on the matched cases, when it has both there. */
function noiseSamples(noiseRecords: CallRecord[], inputs: Inputs): { s1: ArmStats; s2: ArmStats } | undefined {
  const s1 = sampleStats(noiseRecords, 1, inputs);
  const s2 = sampleStats(noiseRecords, 2, inputs);
  return s1 && s2 ? { s1, s2 } : undefined;
}

function countReadings(arm: ArmStats, reference: ArmStats, noise: { s1: ArmStats; s2: ArmStats } | undefined): CountReading[] {
  return Object.keys(reference.meanCounts)
    .filter((name) => name in arm.meanCounts)
    .sort()
    .map((name) => {
      const reading: CountReading = { name, reference: reference.meanCounts[name], arm: arm.meanCounts[name] };
      const [a, b] = [noise?.s1.meanCounts[name], noise?.s2.meanCounts[name]];
      return a !== undefined && b !== undefined ? { ...reading, noise: Math.abs(a - b) } : reading;
    });
}

/** A rule rate's noise floor: |rate(sample 1) − rate(sample 2)| of the reference on the matched cases. */
function checkReadings(arm: ArmStats, reference: ArmStats, noise: { s1: ArmStats; s2: ArmStats } | undefined): CheckReading[] {
  return Object.keys(reference.ruleRates)
    .filter((name) => name in arm.ruleRates)
    .sort()
    .map((name) => {
      const reading: CheckReading = { name, reference: reference.ruleRates[name], arm: arm.ruleRates[name] };
      const [a, b] = [noise?.s1.ruleRates[name], noise?.s2.ruleRates[name]];
      if (a === undefined || b === undefined) return reading;
      const floor = Math.abs(a - b);
      if (reading.arm < reading.reference - floor - EPSILON) return { ...reading, flag: "lower" };
      if (reading.arm > reading.reference + floor + EPSILON) return { ...reading, flag: "higher" };
      return reading;
    });
}

function compare(armRecords: CallRecord[], referenceRecords: CallRecord[], key: string, inputs: Inputs): VariantComparison | undefined {
  const referenceFinished = finishedPairs(referenceRecords);
  const shared = new Set([...finishedPairs(armRecords)].filter((pair) => referenceFinished.has(pair)));
  if (shared.size === 0) return undefined;
  const onShared = (records: CallRecord[]) => records.filter((r) => shared.has(pairOf(r)));
  const arm = armStatsOf(onShared(armRecords), inputs.checks, inputs.tags);
  const reference = armStatsOf(onShared(referenceRecords), inputs.checks, inputs.tags);
  // The noise: the reference's two samples on the matched cases, whichever samples the arm ran
  const sharedCases = new Set(armRecords.filter((r) => shared.has(pairOf(r))).map((r) => r.caseId));
  const noiseRecords = referenceRecords.filter((r) => sharedCases.has(r.caseId) && referenceFinished.has(pairOf(r)));
  const noise = noiseSamples(noiseRecords, inputs);
  return {
    group: arm.group,
    armKey: arm.armKey,
    referenceKey: key,
    pairs: shared.size,
    arm,
    reference,
    hasNoise: noise !== undefined,
    counts: countReadings(arm, reference, noise),
    checks: checkReadings(arm, reference, noise),
  };
}

/** Every non-baseline variant arm in the prompt state whose reference has records in the same group. */
export function variantComparisons(
  records: CallRecord[],
  checks: Map<string, CheckResult>,
  tags: Map<string, CaseTags>,
  promptState: string
): VariantComparison[] {
  const byArm = new Map<string, CallRecord[]>();
  for (const r of records) {
    if (r.promptState !== promptState || !isResultRecord(r, tags)) continue;
    const key = `${r.group}|${r.armKey}`;
    byArm.set(key, [...(byArm.get(key) ?? []), r]);
  }
  const comparisons: VariantComparison[] = [];
  for (const armRecords of byArm.values()) {
    const { group, armKey, baseline } = armRecords[0];
    if (baseline) continue;
    const key = referenceKeyOf(armKey);
    const referenceRecords = key ? byArm.get(`${group}|${key}`) : undefined;
    const comparison = key && referenceRecords ? compare(armRecords, referenceRecords, key, { checks, tags }) : undefined;
    if (comparison) comparisons.push(comparison);
  }
  return comparisons;
}
