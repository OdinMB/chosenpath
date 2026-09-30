import { armKey, LEVER_DIRECTION_CASES, LEVER_DIRECTION_PROMPT_STATE, secondReferenceKeys, type Stage } from "./arms.js";
import type { EvalCase } from "./cases.js";
import { jobEstimateUsd } from "./jobPlan.js";
import { JUDGE_ARMS, outputIdOf } from "./judgedChecks.js";
import {
  LEVER_CALIBRATION,
  LEVER_JUDGE_PROMPT_VERSION,
  leverEvidenceFrom,
  leverJudgeCaseId,
  leverJudgeJobs,
  leverJudgeRequest,
  leverLabelsFrom,
  leverTally,
  leverVerdictFrom,
  renderLeverJudge,
  scoreLeverCalibration,
  type LeverArmCounts,
  type LeverCalibrationItem,
  type LeverFailure,
  type LeverLabel,
  type LeverShareReading,
  type LeverTarget,
} from "./leverDirectionJudge.js";
import { finishedPrepRecord, prepArmKey } from "./prepCalls.js";
import { finishedJobKeys, jobKey, keyOf, runJobs, usable, type CallRecord } from "./runner.js";
import { stageReadings, type JudgedPlan } from "./stageJudge.js";
import { rateMove } from "./stopRule.js";
import { spendBeside, type PrepContext } from "./turnPrep.js";
import { referenceKeyOf } from "./variantComparison.js";

/*
 * The lever-direction stage's judged check (2026-09-30, fix 3 of the second
 * playthroughs' review), kept out of run.ts: --judge-levers sends
 * leversRunRightWay (leverDirectionJudge.ts) on its calibration (hand-read
 * stored setups, two samples) and on every setup of the stage's arms under
 * adopted10 (one sample), into prep-calls.jsonl, booked to the stage, then
 * writes judged-levers.md and .json: the calibration, the setups passing per
 * arm with the variant against production under the stop rule, and the
 * judge's lever labels counted (levers on stats where more is worse, those
 * running backwards). A setup is read as the game keeps it (the assembled
 * reply the executor stores).
 */

const STAGE: Stage = "lever-direction";
const CALIBRATION_SAMPLES = 2;

const lunaLow = (variant: "adopted" | "leverDirection") => armKey({ model: "gpt-6-luna", reasoningEffort: "low" }, variant);

/** The stage's arms: production's setup and the variant, on the setup group's model. */
export const LEVER_ARMS = [lunaLow("adopted"), lunaLow("leverDirection")];

const STAGE_CASES = new Set<string>(LEVER_DIRECTION_CASES);

type Lookup = { records: CallRecord[]; cases: EvalCase[]; load: (record: CallRecord) => unknown };

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const isNone = (value: unknown) => typeof value !== "string" || value.trim() === "" || /^none\b/i.test(value.trim());

/** A setup's stats, and those with a sacrifice or a reward, counted from the setup itself. */
function statCounts(setup: unknown): { stats: number; statsWithLever: number } {
  const s = asObject(setup);
  const stats = [...asArray(s.sharedStats), ...asArray(s.playerStats)].map(asObject);
  return { stats: stats.length, statsWithLever: stats.filter((stat) => !isNone(stat.optionsToSacrifice) || !isNone(stat.optionsToGainAsReward)).length };
}

export type LeverCalibrationTarget = LeverTarget & { itemId: string };

/** The hand-read setups' judge requests, each at two samples, and what could not be built. */
export function leverCalibrationTargets(loadOutput: (output: string) => unknown, items: LeverCalibrationItem[] = LEVER_CALIBRATION): { targets: LeverCalibrationTarget[]; problems: string[] } {
  const problems: string[] = [];
  const targets: LeverCalibrationTarget[] = [];
  for (const item of items) {
    try {
      const setup = loadOutput(item.output);
      if (setup === undefined) throw new Error(`no stored setup ${item.output}`);
      const request = leverJudgeRequest(setup);
      if (!request) throw new Error(`setup ${item.output} has no stat with a sacrifice or reward`);
      targets.push({ itemId: item.id, key: `cal-${item.id}`, request, samples: CALIBRATION_SAMPLES });
    } catch (error) {
      problems.push(`${item.id}: ${(error as Error).message}`);
    }
  }
  return { targets, problems };
}

/** One setup of the stage's arms, with its judge call and its stat counts. */
export type LeverSetup = { armKey: string; caseId: string; sample: number; outputId: string; target: LeverTarget; stats: number; statsWithLever: number };

/** Every final usable setup of the stage's arms under its tag on its cases, with the judge call that reads it. */
export function leverSetupsToJudge(lookup: Lookup, armKeys: string[] = LEVER_ARMS, promptState = LEVER_DIRECTION_PROMPT_STATE): LeverSetup[] {
  return lookup.records.flatMap((r): LeverSetup[] => {
    if (r.role !== "setup" || r.group !== "setup" || !r.final || !r.outputFile || !usable(r) || r.promptState !== promptState || !armKeys.includes(r.armKey) || !STAGE_CASES.has(r.caseId)) return [];
    const setup = lookup.load(r);
    const request = setup === undefined ? undefined : leverJudgeRequest(setup);
    if (!request) return [];
    const outputId = outputIdOf(r.outputFile);
    return [{ armKey: r.armKey, caseId: r.caseId, sample: r.sample, outputId, target: { key: outputId, request, samples: 1 }, ...statCounts(setup) }];
  });
}

/** Every target once, at the most samples any reading asks of it. */
function mergedTargets(targets: LeverTarget[]): LeverTarget[] {
  const byKey = new Map<string, LeverTarget>();
  for (const t of targets) {
    const known = byKey.get(t.key);
    if (!known || known.samples < t.samples) byKey.set(t.key, { ...t, samples: Math.max(t.samples, known?.samples ?? 0) });
  }
  return [...byKey.values()];
}

/** The judge calls a run sends: every target, or with --cases (a smoke) the calibration items and setups named, by item id or case id. */
export function leverTargetsToSend(calibration: LeverCalibrationTarget[], setups: LeverSetup[], caseIds: string[] | undefined): LeverTarget[] {
  const items = caseIds ? calibration.filter((t) => caseIds.includes(t.itemId)) : calibration;
  const read = caseIds ? setups.filter((s) => caseIds.includes(s.caseId)) : setups;
  return mergedTargets([...items.map(({ key, request, samples }) => ({ key, request, samples })), ...read.map((s) => s.target)]);
}

/** A setup's verdict as a judged plan the stage readings take; undefined while its call is unanswered. */
export function leverSetupAsPlan(setup: LeverSetup, verdict: boolean | undefined): JudgedPlan | undefined {
  return verdict === undefined ? undefined : { armKey: setup.armKey, caseId: setup.caseId, sample: setup.sample, outputId: setup.outputId, passes: verdict, threads: setup.statsWithLever };
}

const referencesOf = (key: string): string[] => [referenceKeyOf(key), ...secondReferenceKeys(key)].filter((k): k is string => typeof k === "string");

/** The setups passing per arm, and the variant against production on the (case, sample) pairs both have, under the stop rule. */
export function leverReadings(verdicts: JudgedPlan[]) {
  return stageReadings(verdicts, referencesOf);
}

/** Per arm: the judge's lever labels summed over every setup it read, and the stats with a lever counted from the setups. */
export function leverCounts(setups: LeverSetup[], labelsOf: (outputId: string) => LeverLabel[] | undefined): LeverArmCounts[] {
  const arms = [...new Set(setups.map((s) => s.armKey))].sort();
  return arms.map((armKey) => {
    const own = setups.filter((s) => s.armKey === armKey);
    const tally = leverTally(own.flatMap((s) => labelsOf(s.outputId) ?? []));
    return {
      armKey,
      setups: own.length,
      tally,
      stats: own.reduce((sum, s) => sum + s.stats, 0),
      statsWithLever: own.reduce((sum, s) => sum + s.statsWithLever, 0),
    };
  });
}

/**
 * Each candidate's levers on stats where more is worse that run the right way,
 * against its reference's on the (case, sample) pairs both have, with the
 * reference's sample 1 against sample 2 as the noise and the stop rule; a
 * pooled share, whose items cluster within a setup.
 */
export function leverShares(setups: LeverSetup[], labelsOf: (outputId: string) => LeverLabel[] | undefined): LeverShareReading[] {
  const judged = setups.filter((s) => labelsOf(s.outputId) !== undefined);
  const pair = (s: LeverSetup) => `${s.caseId}|${s.sample}`;
  const share = (list: LeverSetup[]) => {
    const t = leverTally(list.flatMap((s) => labelsOf(s.outputId) ?? []));
    return { hits: t.onWorse - t.backwardsOnWorse, n: t.onWorse };
  };
  const arms = [...new Set(judged.map((s) => s.armKey))].sort();
  return arms.flatMap((armKey): LeverShareReading[] =>
    referencesOf(armKey).flatMap((referenceKey): LeverShareReading[] => {
      const own = judged.filter((s) => s.armKey === armKey);
      const reference = judged.filter((s) => s.armKey === referenceKey);
      const shared = new Set(reference.map(pair).filter((p) => own.some((o) => pair(o) === p)));
      if (shared.size === 0) return [];
      const [arm, ref] = [share(own.filter((s) => shared.has(pair(s)))), share(reference.filter((s) => shared.has(pair(s))))];
      const cases = new Set(own.filter((s) => shared.has(pair(s))).map((s) => s.caseId));
      const [s1, s2] = [1, 2].map((sample) => share(reference.filter((s) => cases.has(s.caseId) && s.sample === sample)));
      const noise = s1.n && s2.n ? Math.abs(s1.hits / s1.n - s2.hits / s2.n) : undefined;
      return [{ armKey, referenceKey, arm, reference: ref, ...(noise === undefined ? {} : { noise, ...rateMove(ref, arm, noise) }) }];
    })
  );
}

// --- --judge-levers ---

export async function judgeLeversMode(ctx: PrepContext, options: { caseIds?: string[] } = {}): Promise<void> {
  const { files, log } = ctx;
  const lookup = { records: files.readRecords(), cases: files.readCases(), load: files.loadOutput };
  const loadOutput = (output: string) => files.loadOutputFile(`outputs/${output}.json`);
  const { targets: calibration, problems } = leverCalibrationTargets(loadOutput);
  const setups = leverSetupsToJudge(lookup);
  const targets = leverTargetsToSend(calibration, setups, options.caseIds);
  const arm = JUDGE_ARMS[0];
  const jobs = leverJudgeJobs(targets, arm, LEVER_DIRECTION_PROMPT_STATE, STAGE);
  const done = finishedJobKeys(files.readPrepRecords());
  const open = jobs.filter((j) => !done.has(keyOf(j)));
  const estimate = open.reduce((sum, j) => sum + jobEstimateUsd(j), 0);
  ctx.refuse(STAGE, estimate);
  log(`${calibration.length} calibration items, ${setups.length} setups of the stage's arms on ${arm.key} (stage ${STAGE}): ${jobs.length} calls, ${open.length} open, est $${estimate.toFixed(3)}`);
  const result = await runJobs(jobs, ctx.deps("prep"), { caps: ctx.caps, previous: files.readPrepRecords(), extraSpend: spendBeside(files, "prep"), tokensPerMinute: ctx.tpm, maxInFlight: ctx.maxInFlight });
  if (result.stoppedReason) log(`Stopped: ${result.stoppedReason}`);
  writeJudgedLevers(ctx, calibration, setups, problems);
}

/** judged-levers.md and .json from every judge call so far; no calls. */
export function writeJudgedLevers(ctx: Pick<PrepContext, "files" | "log">, calibration: LeverCalibrationTarget[], setups: LeverSetup[], problems: string[]): void {
  const { files, log } = ctx;
  const prep = files.readPrepRecords();
  const arm = JUDGE_ARMS[0];
  const parsedAt = (key: string, sample: number) => {
    const record = finishedPrepRecord(prep, jobKey(leverJudgeCaseId(key), prepArmKey("judge", arm), LEVER_DIRECTION_PROMPT_STATE, sample));
    return record ? files.loadOutput(record) : undefined;
  };
  const judged = calibration.map((t) => {
    const parsed = [1, 2].map((sample) => parsedAt(t.key, sample));
    return { itemId: t.itemId, samples: parsed.map(leverVerdictFrom), evidence: parsed.map(leverEvidenceFrom) };
  });
  const verdicts = setups.flatMap((s) => [leverSetupAsPlan(s, leverVerdictFrom(parsedAt(s.target.key, 1)))].filter((v): v is JudgedPlan => v !== undefined));
  const labelsOf = (outputId: string) => {
    const parsed = parsedAt(outputId, 1);
    return parsed === undefined ? undefined : leverLabelsFrom(parsed);
  };
  const failures: LeverFailure[] = setups.flatMap((s) => {
    const parsed = parsedAt(s.target.key, 1);
    if (leverVerdictFrom(parsed) !== false) return [];
    const said = leverEvidenceFrom(parsed);
    const backwards = said.lines.filter((line) => /sacrifice [^;]*helps the player|reward [^;]*costs the player/.test(line));
    return [{ armKey: s.armKey, caseId: s.caseId, sample: s.sample, outputId: s.outputId, evidence: `${said.evidence ?? ""} [${backwards.join("; ")}]` }];
  });
  const calibrationReading = scoreLeverCalibration(LEVER_CALIBRATION, judged);
  const judgedSetups = setups.filter((s) => labelsOf(s.outputId) !== undefined);
  const report = {
    calibration: calibrationReading,
    items: LEVER_CALIBRATION,
    judged,
    readings: leverReadings(verdicts),
    counts: leverCounts(judgedSetups, labelsOf),
    shares: leverShares(judgedSetups, labelsOf),
    failures,
  };
  const spentUsd = prep.filter((r) => r.stage === STAGE).reduce((sum, r) => sum + r.costUsd, 0);
  const generatedAt = new Date();
  files.writeJudgedLevers(renderLeverJudge({ report, spentUsd, generatedAt, problems }), {
    generatedAt: generatedAt.toISOString(),
    promptState: LEVER_DIRECTION_PROMPT_STATE,
    promptVersion: LEVER_JUDGE_PROMPT_VERSION,
    report,
    verdicts,
    problems,
    spentUsd,
  });
  const c = calibrationReading;
  log(`leversRunRightWay: ${c.agree} of ${c.decided} agree (hand yes ${c.handPasses}, no ${c.handFails}), samples ${c.pairsAgree} of ${c.pairs}: ${c.reliable ? "reliable" : "not reliable"}`);
  for (const r of report.readings) log(`  ${r.armKey}: ${r.plans.hits} of ${r.plans.n} pass${r.vsReference && r.referenceKey ? `; against ${r.referenceKey} ${r.vsReference.arm.hits}/${r.vsReference.arm.n} vs ${r.vsReference.reference.hits}/${r.vsReference.reference.n}${r.vsReference.moved ? `, moved ${r.vsReference.moved}` : r.vsReference.beyondNoise ? ", beyond the noise, not moved" : ""}` : ""}`);
  for (const k of report.counts) log(`  ${k.armKey}: ${k.tally.backwardsOnWorse} of ${k.tally.onWorse} levers on stats where more is worse backwards (${k.tally.backwards} of ${k.tally.levers} in all); stats with a lever ${k.statsWithLever} of ${k.stats}`);
  log(`The stage's judge calls so far $${spentUsd.toFixed(4)}. Wrote judged-levers.md and .json.`);
}
