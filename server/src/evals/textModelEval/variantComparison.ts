import { armStatsOf, isResultRecord, type ArmStats } from "./armStats.js";
import { chainKey, chainReferenceKey, chainSides, noiseReferenceKey, referenceKey, secondReferenceKeys, standInKey } from "./arms.js";
import type { CaseTags } from "./cases.js";
import { RATIOS } from "./checkBaselines.js";
import { finishesJob, type CallRecord } from "./runner.js";
import { meanMove, rateMove, type MeanMove, type RateMove, type Tally } from "./stopRule.js";
import type { CheckResult } from "./textChecks.js";

/*
 * The variant readings of Stages 3 and 4 and the rounds: each variant arm
 * against its reference arm (referenceKey: a Stage 3 trim against its full
 * form, a Stage 4 rewrite against the form it rewrites, a verbosity arm
 * against the same arm without it, a round's candidate against production's
 * form), and against any second reference its round reads (arms.ts,
 * secondReferenceKeys), on the (case, sample) pairs both finished. The
 * baseline's records can be a reference; the baseline is never a candidate.
 * Tokens, waits, cost, caching, validity, state counts, the design checks'
 * pooled shares, and the rule checks, each read against the reference under
 * the stop rule (stopRule.ts): beyond its own noise floor (the reference's
 * sample 1 against its sample 2 on the matched cases, so a one-sample arm is
 * read against a two-sample reference's noise), and moved only at a Fisher
 * p < 0.10 (checks, shares) or 2 standard errors (counts). A reference is
 * read in the arm's own prompt state, unless stored records of another
 * state, whose request today's code rebuilds byte for byte, cover more of the
 * arm's pairs (the setup rounds read the stored postfix setups until a full
 * same-state run exists). Readings only, rendered by resultsReport.ts;
 * nothing is dropped or picked.
 */

/** A rule check's pass rate: beyondNoise past the reference's two-sample noise, with p; moved when p < 0.10 too */
export type CheckReading = { name: string; reference: number; arm: number } & RateMove;
/** noise: the reference's |mean(sample 1) − mean(sample 2)| on the matched cases, when it has both samples there; moved at 2 standard errors too */
export type CountReading = { name: string; reference: number; arm: number; noise?: number } & MeanMove;
/** A pooled share (checkBaselines' RATIOS), with the reference's two-sample noise; moved at a Fisher p < 0.10 on the pooled counts too */
export type ShareReading = { name: string; reference: number; arm: number; noise?: number } & RateMove;

/**
 * Whether a stored record of another prompt state may stand in as a
 * reference: today's code builds its request byte for byte (run.ts compares
 * its promptHash with today's request for the case).
 */
export type StoredReference = (record: CallRecord) => boolean;

/**
 * Whether a stand-in arm's record (standInKey) may be read as the reference
 * arm's: the request today's code builds for its case on the reference arm's
 * variant is the record's, prompt and schema (run.ts builds it from jobPlan.ts).
 */
export type SameRequest = (record: CallRecord, referenceArmKey: string) => boolean;

export type VariantComparison = {
  group: CallRecord["group"];
  armKey: string;
  referenceKey: string;
  /** The reference's prompt state when it is a stored reference from another state */
  referenceState?: string;
  /** A second reference the round reads beside the arm's own (secondReferenceKeys) */
  secondReference?: true;
  /** Another arm's records read as the reference's where its request is the reference's byte for byte (standInKey) */
  standIns?: { armKey: string; records: number };
  /** The arm whose two samples gave the noise, where the reference ran once (noiseReferenceKey) */
  noiseFrom?: { armKey: string; promptState: string };
  /** (case, sample) pairs both arms finished; both sides are read on these only */
  pairs: number;
  arm: ArmStats;
  reference: ArmStats;
  /** Whether the reference has samples 1 and 2 on the matched cases, so it has a noise floor */
  hasNoise: boolean;
  counts: CountReading[];
  checks: CheckReading[];
  shares: ShareReading[];
};

/** The reference's key: the arm's reference, or for a chain the reference of each side. */
export function referenceKeyOf(armKey: string): string | undefined {
  const chain = chainSides(armKey);
  if (!chain) return referenceKey(armKey);
  const set = chainReferenceKey(armKey);
  if (set) return set;
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

/** A count's noise floor: |mean(sample 1) − mean(sample 2)| of the reference on the matched cases; the stop rule's 2 SE on top. */
function countReadings(arm: ArmStats, reference: ArmStats, noise: { s1: ArmStats; s2: ArmStats } | undefined): CountReading[] {
  return Object.keys(reference.meanCounts)
    .filter((name) => name in arm.meanCounts)
    .sort()
    .map((name) => {
      const reading: CountReading = { name, reference: reference.meanCounts[name], arm: arm.meanCounts[name] };
      const [a, b] = [noise?.s1.meanCounts[name], noise?.s2.meanCounts[name]];
      if (a === undefined || b === undefined) return reading;
      const floor = Math.abs(a - b);
      return { ...reading, noise: floor, ...meanMove(reference.countMoments[name], arm.countMoments[name], floor) };
    });
}

/** A rule rate's noise floor: |rate(sample 1) − rate(sample 2)| of the reference on the matched cases; the stop rule's Fisher test on top. */
function checkReadings(arm: ArmStats, reference: ArmStats, noise: { s1: ArmStats; s2: ArmStats } | undefined): CheckReading[] {
  return Object.keys(reference.ruleRates)
    .filter((name) => name in arm.ruleRates)
    .sort()
    .map((name) => {
      const reading: CheckReading = { name, reference: reference.ruleRates[name], arm: arm.ruleRates[name] };
      const [a, b] = [noise?.s1.ruleRates[name], noise?.s2.ruleRates[name]];
      if (a === undefined || b === undefined) return reading;
      return { ...reading, ...rateMove(reference.ruleTallies[name], arm.ruleTallies[name], Math.abs(a - b)) };
    });
}

/** A pooled share from the mean counts (each design count is reported on every reply of its role, so the means pool). */
function shareOf(stats: ArmStats, numerator: string, denominator: string): number | undefined {
  const [num, den] = [stats.meanCounts[numerator], stats.meanCounts[denominator]];
  return num !== undefined && den !== undefined && den > 0 ? num / den : undefined;
}

/** A pooled share's items: the numerator's total among the denominator's (whole counts, so the totals are whole). */
function shareTally(stats: ArmStats, numerator: string, denominator: string): Tally | undefined {
  const [num, den] = [stats.countMoments[numerator], stats.countMoments[denominator]];
  if (!num || !den) return undefined;
  const [hits, n] = [Math.round(num.mean * num.n), Math.round(den.mean * den.n)];
  return hits <= n ? { hits, n } : undefined;
}

function shareReadings(arm: ArmStats, reference: ArmStats, noise: { s1: ArmStats; s2: ArmStats } | undefined): ShareReading[] {
  return RATIOS.flatMap(({ name, numerator, denominator }) => {
    const [ref, own] = [shareOf(reference, numerator, denominator), shareOf(arm, numerator, denominator)];
    if (ref === undefined || own === undefined) return [];
    const reading: ShareReading = { name, reference: ref, arm: own };
    const [a, b] = [noise && shareOf(noise.s1, numerator, denominator), noise && shareOf(noise.s2, numerator, denominator)];
    if (a === undefined || b === undefined) return [reading];
    const floor = Math.abs(a - b);
    const [refTally, armTally] = [shareTally(reference, numerator, denominator), shareTally(arm, numerator, denominator)];
    return [{ ...reading, noise: floor, ...(refTally && armTally ? rateMove(refTally, armTally, floor) : {}) }];
  });
}

function compare(
  armRecords: CallRecord[],
  referenceRecords: CallRecord[],
  key: string,
  inputs: Inputs,
  /** Another arm's records whose two samples give the noise where the reference has only one (noiseReferenceKey) */
  noiseFrom?: CallRecord[]
): VariantComparison | undefined {
  const referenceFinished = finishedPairs(referenceRecords);
  const shared = new Set([...finishedPairs(armRecords)].filter((pair) => referenceFinished.has(pair)));
  if (shared.size === 0) return undefined;
  const onShared = (records: CallRecord[]) => records.filter((r) => shared.has(pairOf(r)));
  const arm = armStatsOf(onShared(armRecords), inputs.checks, inputs.tags);
  const reference = armStatsOf(onShared(referenceRecords), inputs.checks, inputs.tags);
  // The noise: the reference's two samples on the matched cases, whichever samples the arm ran
  const sharedCases = new Set(armRecords.filter((r) => shared.has(pairOf(r))).map((r) => r.caseId));
  const noiseOn = (records: CallRecord[]) => {
    const finished = finishedPairs(records);
    return records.filter((r) => sharedCases.has(r.caseId) && finished.has(pairOf(r)));
  };
  const noise = noiseSamples(noiseOn(referenceRecords), inputs) ?? (noiseFrom ? noiseSamples(noiseOn(noiseFrom), inputs) : undefined);
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
    shares: shareReadings(arm, reference, noise),
  };
}

/** How many of the arm's finished (case, sample) pairs the reference finished too. */
function coverage(armRecords: CallRecord[], referenceRecords: CallRecord[]): number {
  const reference = finishedPairs(referenceRecords);
  return [...finishedPairs(armRecords)].filter((pair) => reference.has(pair)).length;
}

/**
 * The reference's stored records from another prompt state: those whose
 * request today's code rebuilds, from the one state that covers most of the
 * arm's pairs (so no two states' samples mix), then the one with most records.
 */
function storedReferenceRecords(
  records: CallRecord[],
  tags: Map<string, CaseTags>,
  armRecords: CallRecord[],
  key: string,
  isCurrent: StoredReference
): CallRecord[] | undefined {
  const { group, promptState } = armRecords[0];
  const byState = new Map<string, CallRecord[]>();
  for (const r of records) {
    if (r.promptState === promptState || r.group !== group || r.armKey !== key || !isResultRecord(r, tags) || !isCurrent(r)) continue;
    byState.set(r.promptState, [...(byState.get(r.promptState) ?? []), r]);
  }
  const ranked = [...byState.values()].map((states) => ({ states, covered: coverage(armRecords, states) }));
  ranked.sort((a, b) => b.covered - a.covered || b.states.length - a.states.length || a.states[0].promptState.localeCompare(b.states[0].promptState));
  return ranked[0]?.states;
}

/**
 * Every non-baseline variant arm in the prompt state whose reference has
 * records in the same group: in that state, or (with `storedReference`)
 * stored ones that today's code rebuilds, whichever covers more of the arm's
 * pairs; the own state on a tie. So a partial run of the reference in the
 * arm's state (a narrowed or capped migration run) never silently replaces a
 * fuller stored one. Each second reference the arm has is read the same way,
 * after its own, marked `secondReference`.
 */
export function variantComparisons(
  records: CallRecord[],
  checks: Map<string, CheckResult>,
  tags: Map<string, CaseTags>,
  promptState: string,
  storedReference?: StoredReference,
  sameRequest?: SameRequest
): VariantComparison[] {
  const byArm = new Map<string, CallRecord[]>();
  for (const r of records) {
    if (r.promptState !== promptState || !isResultRecord(r, tags)) continue;
    const key = `${r.group}|${r.armKey}`;
    byArm.set(key, [...(byArm.get(key) ?? []), r]);
  }
  /**
   * The reference's records in this state with its stand-in's (standInKey)
   * on the pairs it has none of, where the stand-in's request is its own byte
   * for byte, read as the reference's.
   */
  const withStandIns = (group: string, key: string, armRecords: CallRecord[]): { records?: CallRecord[]; standIns?: VariantComparison["standIns"] } => {
    const own = byArm.get(`${group}|${key}`) ?? [];
    const standIn = standInKey(key);
    const covered = finishedPairs(own);
    const wanted = finishedPairs(armRecords);
    // Only on the arm's own pairs, so the count says how many of the reference's pairs are stand-ins
    const borrowed =
      standIn && sameRequest
        ? (byArm.get(`${group}|${standIn}`) ?? []).filter((r) => wanted.has(pairOf(r)) && !covered.has(pairOf(r)) && sameRequest(r, key)).map((r) => ({ ...r, armKey: key }))
        : [];
    const all = [...own, ...borrowed];
    return { records: all.length ? all : undefined, ...(standIn && borrowed.length ? { standIns: { armKey: standIn, records: borrowed.length } } : {}) };
  };
  const comparisons: VariantComparison[] = [];
  for (const armRecords of byArm.values()) {
    const { group, armKey, baseline } = armRecords[0];
    if (baseline) continue;
    const own = referenceKeyOf(armKey);
    const keys = [...(own ? [{ key: own, second: false }] : []), ...secondReferenceKeys(armKey).map((key) => ({ key, second: true }))];
    for (const { key, second } of keys) {
      const { records: sameState, standIns } = withStandIns(group, key, armRecords);
      const candidate = storedReference ? storedReferenceRecords(records, tags, armRecords, key, storedReference) : undefined;
      const stored = candidate && (!sameState || coverage(armRecords, candidate) > coverage(armRecords, sameState)) ? candidate : undefined;
      const referenceRecords = stored ?? sameState;
      const first = referenceRecords ? compare(armRecords, referenceRecords, key, { checks, tags }) : undefined;
      if (!first || !referenceRecords) continue;
      // A reference that ran once reads its noise from the arm it builds on, in this state or stored
      const noiseKey = first.hasNoise ? undefined : noiseReferenceKey(key);
      const noiseRecords = noiseKey
        ? (byArm.get(`${group}|${noiseKey}`) ?? (storedReference ? storedReferenceRecords(records, tags, armRecords, noiseKey, storedReference) : undefined))
        : undefined;
      const borrowed = noiseRecords ? compare(armRecords, referenceRecords, key, { checks, tags }, noiseRecords) : undefined;
      const comparison = borrowed?.hasNoise ? borrowed : first;
      comparisons.push({
        ...comparison,
        ...(stored ? { referenceState: stored[0].promptState } : standIns ? { standIns } : {}),
        ...(second ? { secondReference: true as const } : {}),
        ...(borrowed?.hasNoise && noiseKey && noiseRecords ? { noiseFrom: { armKey: noiseKey, promptState: noiseRecords[0].promptState } } : {}),
      });
    }
  }
  return comparisons;
}
