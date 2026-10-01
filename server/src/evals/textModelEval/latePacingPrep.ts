import type { SetOfBeatGenerationSchema, SwitchAnalysis } from "core/types/index.js";
import { repairBeatReply } from "../../game/services/beatRepairs.js";
import { checkSwitchPlan } from "../../game/services/planChecks.js";
import { armKey, LATE_PACING_CASES, LATE_PACING_PROMPT_STATE, type Stage } from "./arms.js";
import { DEFAULT_STAGE_CAPS, spentByStage } from "./budget.js";
import type { EvalFiles } from "./evalFiles.js";
import { caseStory, type EvalCase } from "./cases.js";
import {
  CLUES_CALIBRATION,
  EXPLAINED_CHECK,
  NEW_MYSTERY_CHECK,
  cluesEvidenceFrom,
  cluesJudgeCaseId,
  cluesJudgeJobs,
  cluesJudgeRequests,
  cluesVerdictFrom,
  scoreCluesCalibration,
  type ClueCheck,
  type CluesCalibrationItem,
  type CluesJudgeVersion,
  type CluesTarget,
} from "./cluesJudge.js";
import { replyVerdict } from "./endingJudge.js";
import { jobEstimateUsd } from "./jobPlan.js";
import { JUDGE_ARMS, outputIdOf } from "./judgedChecks.js";
import { latePacingCasesToFreeze, latePacingRetestCases, LATE_PACING_STARTS, type LatePacingStart } from "./latePacingCases.js";
import { latePacingComparisons, playOn, readLatePacing, renderLatePacing, switchPacingReading, type LatePacingReading, type SwitchPacingReading } from "./latePacingPlay.js";
import { withEdits } from "./outcomeSettledPrep.js";
import { measuredCallCosts, playthroughRunsFrom, type ModeCall, type RoleCosts } from "./playthroughMode.js";
import { replayRun, replayedTurn } from "./playthroughReplay.js";
import { playthroughArm, type PlayRun } from "./playthroughs.js";
import { finishedPrepRecord, prepArmKey } from "./prepCalls.js";
import { finishedJobKeys, jobKey, keyOf, runJobs, usable, type CallRecord } from "./runner.js";
import { budgetedPrepCall } from "./setupChainMode.js";
import { stageReadings, type JudgedPlan, type StageArmReading } from "./stageJudge.js";
import { spendBeside, type PrepContext } from "./turnPrep.js";
import { referenceKeyOf } from "./variantComparison.js";
import type { VariantId } from "./variants.js";

/*
 * The late-pacing stage's CLI modes (2026-10-01, fix 8 of the second
 * playthroughs' review), kept out of run.ts:
 * - --build-late-pacing-cases: the stage's switch cases from the second
 *   round's stored runs (latePacingCases.ts), frozen beside the others; no
 *   calls;
 * - --late-pacing-play [--samples N] [--turns N] [--cases <story ids>]: the
 *   short playthroughs, production's code (adopted) and the variant
 *   (latePacing) side by side from each start (LATE_PACING_STARTS) to the
 *   story's last chapter plan, each call a prep job in the stage under
 *   adopted15 (a finished call on the same request is reused, so a smoke's
 *   turns are the full run's first); then late-pacing.json and .md: the runs,
 *   their readings and the stage's switch plans read the same way
 *   (switchPacingReading), no calls; --report-only writes them without a call;
 * - --judge-clues: the stage's judged checks on planted details (cluesJudge.ts)
 *   on their calibration (two samples) and on the short playthroughs' late
 *   turns and the stage's endings (one sample), then judged-clues.md and .json.
 */

const STAGE: Stage = "late-pacing";
const PLAY_FILE = "late-pacing";
/** The clue judge's prompt as this stage ran it (v1; its one fix, v2, runs in the pacing-clues stage) */
export const LATE_PACING_CLUES_VERSION: CluesJudgeVersion = 1;
const CALIBRATION_SAMPLES = 2;
const PLAYTHROUGHS_2 = "playthroughs-2";
const LUNA_LOW = { model: "gpt-6-luna", reasoningEffort: "low" } as const;
const LUNA_MEDIUM = { model: "gpt-6-luna", reasoningEffort: "medium" } as const;
const VARIANTS: VariantId[] = ["adopted", "latePacing"];
/** The arms a short playthrough can play: production, the variant and its fix-and-retest, in the file's order. */
const PLAY_VARIANTS: VariantId[] = [...VARIANTS, "latePacingB"];

/** The arms an invocation plays: production and the variant, or those --arms names (the retest alone). */
export function playVariantsOf(armKeys?: string[]): VariantId[] {
  if (!armKeys?.length) return [...VARIANTS];
  const unknown = armKeys.filter((key) => !PLAY_VARIANTS.includes(key as VariantId));
  if (unknown.length) throw new Error(`--arms for --late-pacing-play names variants, one of ${PLAY_VARIANTS.join(", ")}; not ${unknown.join(", ")}`);
  return armKeys as VariantId[];
}

/** The stage's switch planners and turns on their frozen cases. */
export const LATE_PACING_SWITCH_ARMS = PLAY_VARIANTS.map((v) => armKey(LUNA_LOW, v));
export const LATE_PACING_BEAT_ARMS = VARIANTS.flatMap((v) => [armKey(LUNA_MEDIUM, v), armKey(LUNA_LOW, v)]);

type Lookup = { records: CallRecord[]; cases: EvalCase[]; load: (record: CallRecord) => unknown };

const runs2Of = (ctx: Pick<PrepContext, "files">): PlayRun[] => playthroughRunsFrom(ctx.files.readPlaythroughs(PLAYTHROUGHS_2));
const playRunsOf = (ctx: Pick<PrepContext, "files">): PlayRun[] => playthroughRunsFrom(ctx.files.readPlaythroughs(PLAY_FILE));

/** The prompt hash each stored playthrough call sent, by its output file. */
const promptHashesOf = (ctx: Pick<PrepContext, "files">) => {
  const byId = new Map(ctx.files.readPrepRecords().flatMap((r) => (r.outputFile && r.promptHash ? [[outputIdOf(r.outputFile), r.promptHash] as [string, string]] : [])));
  return (outputFile: string) => byId.get(outputIdOf(outputFile));
};

// --- --build-late-pacing-cases ---

export function buildLatePacingCasesMode(ctx: Pick<PrepContext, "files" | "log">, replace: boolean): void {
  const { files, log } = ctx;
  if (!files.casesExist()) throw new Error("No frozen cases. Run --build-cases first.");
  const runs = runs2Of(ctx);
  if (runs.length === 0) throw new Error("No stored second-round playthroughs (playthroughs-2.json). Run --playthroughs --round 2 first.");
  const built = latePacingCasesToFreeze(files.readCases(), runs, promptHashesOf(ctx), replace);
  // The fix-and-retest's case, once the variant's short playthroughs are played (late-pacing.json)
  const retest = playRunsOf(ctx).length ? latePacingRetestCases(playRunsOf(ctx), promptHashesOf(ctx)) : { cases: [], problems: [] };
  const known = new Set(files.readCases().map((c) => c.id));
  const retestNew = retest.cases.filter((c) => replace || !known.has(c.id));
  const cases = [...built.cases, ...retestNew];
  const problems = [...built.problems, ...retest.problems];
  const skipped = [...built.skipped, ...retest.cases.filter((c) => !retestNew.includes(c)).map((c) => c.id)];
  if (problems.length) throw new Error(problems.join("; "));
  if (skipped.length) log(`Already frozen, left as they are: ${skipped.join(", ")}.`);
  if (cases.length === 0) return log("Nothing new to freeze; no calls.");
  files.addCases(cases, undefined, replace);
  log(`Froze ${cases.map((c) => c.id).join(", ")} beside the other cases; no calls.`);
}

// --- --late-pacing-play ---

/** The short playthroughs' calls: prep jobs in the stage under its tag, never past `limitUsd` for this invocation. */
export function latePacingCall(ctx: PrepContext, sample: number, limitUsd: number): ModeCall {
  return budgetedPrepCall(ctx, {
    stage: STAGE,
    promptState: LATE_PACING_PROMPT_STATE,
    sample,
    limitUsd,
    rerunHint: "the dice are seeded, so the code or a reply changed; play a new sample with --samples <n>",
  });
}

/** A short playthrough's key: its story, start, arm and sample. */
export const playRunKey = (run: PlayRun) => `${run.spec.id}|${run.from?.turn ?? 1}|${run.from?.variant ?? "adopted"}|${run.sample}`;

/** The file's runs with new ones: a run played again replaces its key, in the starts' order, then sample and arm (a stage's own starts and arms where given). */
export function mergeLatePacingRuns(existing: PlayRun[], added: PlayRun[], starts: LatePacingStart[] = LATE_PACING_STARTS, variants: VariantId[] = PLAY_VARIANTS): PlayRun[] {
  const replaced = new Set(added.map(playRunKey));
  const order = (run: PlayRun) => {
    const at = starts.findIndex((s) => s.story === run.spec.id);
    return [at < 0 ? starts.length : at, variants.indexOf(run.from?.variant ?? "adopted"), run.sample];
  };
  const compare = (a: PlayRun, b: PlayRun) => {
    const [x, y] = [order(a), order(b)];
    return x[0] - y[0] || x[2] - y[2] || x[1] - y[1];
  };
  return [...existing.filter((run) => !replaced.has(playRunKey(run))), ...added].sort(compare);
}

/** Each frozen switch plan of the stage's arms under its tag, as the game keeps it (the plan check's repairs), read against PACING's arithmetic. */
export type SwitchCaseRow = { armKey: string; caseId: string; sample: number; outputId: string; reading: SwitchPacingReading };

export function switchCaseRows({ records, cases, load }: Lookup): SwitchCaseRow[] {
  const switchCases = new Set<string>([...LATE_PACING_CASES.switches, ...LATE_PACING_CASES.retest]);
  return records.flatMap((r): SwitchCaseRow[] => {
    if (r.group !== "switch" || !r.final || !usable(r) || !r.outputFile || r.promptState !== LATE_PACING_PROMPT_STATE || !LATE_PACING_SWITCH_ARMS.includes(r.armKey) || !switchCases.has(r.caseId)) return [];
    const evalCase = cases.find((c) => c.id === r.caseId);
    const plan = load(r) as SwitchAnalysis | undefined;
    if (!evalCase?.state || !plan) return [];
    const story = caseStory(evalCase, false);
    const checked = checkSwitchPlan(story, plan);
    return [{ armKey: r.armKey, caseId: r.caseId, sample: r.sample, outputId: outputIdOf(r.outputFile), reading: switchPacingReading(story, checked.problem === undefined ? checked.plan : plan) }];
  });
}

const referencesOf = (key: string): string[] => [referenceKeyOf(key)].filter((k): k is string => typeof k === "string");

/** The switch cases' readings: no complete outcome taking a needed thread, and a spare thread keeping the last one's milestone, each arm against production. */
export function switchCaseReadings(rows: SwitchCaseRow[]): { neededKept: StageArmReading[]; keepsLast: StageArmReading[] } {
  const asPlan = (row: SwitchCaseRow, passes: boolean): JudgedPlan => ({ armKey: row.armKey, caseId: row.caseId, sample: row.sample, outputId: row.outputId, passes, threads: 1 });
  return {
    neededKept: stageReadings(rows.map((r) => asPlan(r, !r.reading.completeWhileNeeded)), referencesOf),
    keepsLast: stageReadings(rows.filter((r) => r.reading.keepsLast !== undefined).map((r) => asPlan(r, r.reading.keepsLast === true)), referencesOf),
  };
}

const pct = (t: { hits: number; n: number }) => (t.n === 0 ? "–" : `${t.hits} of ${t.n} (${Math.round((100 * t.hits) / t.n)}%)`);
const readingText = (r: StageArmReading) =>
  r.vsReference && r.referenceKey
    ? `${pct(r.vsReference.arm)} against ${pct(r.vsReference.reference)} (${r.referenceKey}); noise ${r.vsReference.noise === undefined ? "–" : `${Math.round(100 * r.vsReference.noise)} pts`}; ${r.vsReference.moved ? `moved ${r.vsReference.moved}${r.vsReference.p !== undefined ? ` (p ${r.vsReference.p.toFixed(3)})` : ""}` : r.vsReference.beyondNoise ? "beyond the noise, not moved" : "within the noise"}`
    : pct(r.plans);

const switchRowLine = (r: SwitchCaseRow) => {
  const who = r.reading.players.map((p) => `${p.slot} ${p.needed}: ${p.offered.join(", ") || "none"}`).join("; ");
  return `| ${r.caseId} | ${r.armKey} | ${r.sample} | ${r.reading.fit} | ${who} | ${r.reading.completeWhileNeeded ? "yes" : "no"} | ${r.reading.keepsLast === undefined ? "–" : r.reading.keepsLast ? "yes" : "no"} |`;
};
const SWITCH_TABLE_HEAD = [
  "| Case | Arm | Sample | Threads fit | Players: needed, offered | A complete outcome took a needed thread | Spare thread kept the last milestone |",
  "|---|---|---|---|---|---|---|",
];

/**
 * The switch cases' section of late-pacing.md: the stored switches, each arm
 * against production under the stop rule; then the retest's switch (the
 * variant's own state, which production never reaches), each arm's tally.
 */
export function renderSwitchCases(rows: SwitchCaseRow[]): string {
  if (rows.length === 0) return "";
  const retestIds = new Set<string>(LATE_PACING_CASES.retest);
  const stored = rows.filter((r) => !retestIds.has(r.caseId));
  const retest = rows.filter((r) => retestIds.has(r.caseId));
  const readings = switchCaseReadings(stored);
  const lines = [
    "## The stored switches (--run --role switch)",
    "",
    ...SWITCH_TABLE_HEAD,
    ...stored.map(switchRowLine),
    "",
    ...readings.neededKept.map((r) => `- No complete outcome took a needed thread, ${r.armKey}: ${readingText(r)}`),
    ...readings.keepsLast.map((r) => `- A spare thread kept the last thread's milestone, ${r.armKey}: ${readingText(r)}`),
    "",
  ];
  for (const caseId of retestIds) {
    const mine = retest.filter((r) => r.caseId === caseId);
    if (mine.length === 0) continue;
    const arms = [...new Set(mine.map((r) => r.armKey))];
    lines.push(
      `## The retest's switch (${caseId})`,
      "",
      ...SWITCH_TABLE_HEAD,
      ...mine.map(switchRowLine),
      "",
      ...arms.map((armKey) => {
        const own = mine.filter((r) => r.armKey === armKey);
        return `- ${armKey}: a complete outcome took a needed thread ${own.filter((r) => r.reading.completeWhileNeeded).length} of ${own.length}`;
      }),
      ""
    );
  }
  return lines.join("\n");
}

/** late-pacing.md and .json from the file's runs and the stage's switch records; no calls. */
export function writeLatePacing(ctx: Pick<PrepContext, "files" | "log">, runs: PlayRun[]): LatePacingReading[] {
  const { files } = ctx;
  const readings = runs.map(readLatePacing);
  const lookup = { records: files.readRecords(), cases: files.casesExist() ? files.readCases() : [], load: files.loadOutput };
  const rows = switchCaseRows(lookup);
  const now = new Date();
  const markdown = `${renderLatePacing(readings, now)}\n${renderSwitchCases(rows)}`;
  files.writePlaythroughs(markdown, { generatedAt: now.toISOString(), stage: STAGE, promptState: LATE_PACING_PROMPT_STATE, runs, readings, switchCases: rows }, PLAY_FILE);
  return readings;
}

export async function latePacingPlayMode(ctx: PrepContext, options: { sample: number; caseIds?: string[]; turns?: number; reportOnly?: boolean; armKeys?: string[] }): Promise<void> {
  const { files, log } = ctx;
  const variants = playVariantsOf(options.armKeys);
  const stored = runs2Of(ctx);
  const starts = LATE_PACING_STARTS.filter((s) => !options.caseIds?.length || options.caseIds.includes(s.story));
  if (starts.length === 0) throw new Error(`No short playthrough among --cases; one of ${LATE_PACING_STARTS.map((s) => s.story).join(", ")}`);
  const played: PlayRun[] = [];
  if (!options.reportOnly) {
    const spend = spentByStage([...files.readRecords(), ...spendBeside(files, "calls")]);
    const stageLeft = ctx.caps.stageCaps[STAGE] - spend.byStage[STAGE];
    const limit = Math.min(ctx.caps.maxSpend ?? Number.POSITIVE_INFINITY, stageLeft, ctx.caps.globalCap - spend.total);
    log(
      `Playing on: ${starts.map((s) => `${s.story} from turn ${s.turn}`).join(", ")}, ${variants.join(" and ")} (sample ${options.sample}${options.turns ? `, the first ${options.turns} turns each` : ""}); this invocation spends at most $${limit.toFixed(4)} (stage ${STAGE} spent $${spend.byStage[STAGE].toFixed(4)} of $${ctx.caps.stageCaps[STAGE]}; the ledger $${spend.total.toFixed(2)} of $${ctx.caps.globalCap})`
    );
    const call = latePacingCall(ctx, options.sample, limit);
    const jobs = starts.flatMap((start) =>
      variants.map(async (variant) => {
        const run = stored.find((r) => r.spec.id === start.story && r.sample === 1);
        if (!run) throw new Error(`No stored second-round playthrough ${start.story}`);
        return (await playOn(run, start.turn, variant, (s) => call({ kind: "play", ...s }), options.sample, options.turns)).run;
      })
    );
    const settled = await Promise.allSettled(jobs);
    settled.forEach((outcome) => {
      if (outcome.status === "fulfilled") played.push(outcome.value);
      else log(`A short playthrough stopped: ${outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)}`);
    });
  }
  const all = mergeLatePacingRuns(playRunsOf(ctx), played);
  const readings = writeLatePacing(ctx, all);
  for (const run of played) log(`${run.spec.id} from ${run.from?.turn}, ${run.from?.variant}, s${run.sample}: ${run.turns.length} turns, stopped: ${run.stopped}`);
  for (const candidate of ["latePacing", "latePacingB"] as const) {
    if (!readings.some((r) => r.variant === candidate)) continue;
    const c = latePacingComparisons(readings, candidate);
    for (const rate of c.rates) log(`  ${candidate}, ${rate.reading}: production ${rate.production.hits}/${rate.production.n}, ${candidate} ${rate.variant.hits}/${rate.variant.n}`);
  }
  const cost = played.reduce((sum, run) => sum + readLatePacing(run).costUsd, 0);
  log(`Played ${played.length} short playthroughs, $${cost.toFixed(4)}. Wrote late-pacing.md and .json.`);
}

/**
 * A short playthrough's calls and cost before it runs: the turns from its
 * start to the story's last chapter (about the story's length less the start
 * and the last chapter's turns, the last plan included), and a switch plan and
 * a chapter plan per chapter of about four turns. Priced at the measured costs
 * of production's own calls, retries left out.
 */
export function latePacingEstimate(players: number, maxTurns: number, from: number, costs: RoleCosts): { calls: number; usd: number } {
  const turns = Math.max(1, maxTurns - from - 2);
  const chapters = Math.max(1, Math.round((maxTurns - from) / 4));
  return { calls: turns + 2 * chapters, usd: turns * costs.beat + chapters * (costs.switch + costs.thread) };
}

/** The dry run's lines for the short playthroughs: each start's calls and cost per arm and sample, what the file holds, and the stage's spend. */
export function printLatePacingPlan(files: EvalFiles, log: (line: string) => void): void {
  const costsFor = measuredCallCosts(files.readRecords());
  const held = playthroughRunsFrom(files.readPlaythroughs(PLAY_FILE));
  const stored = playthroughRunsFrom(files.readPlaythroughs(PLAYTHROUGHS_2));
  const prep = files.readPrepRecords().filter((r) => r.stage === STAGE);
  log(`\nShort playthroughs (--late-pacing-play, stage ${STAGE}, cap $${DEFAULT_STAGE_CAPS[STAGE]}, under ${LATE_PACING_PROMPT_STATE}; production and latePacing, one sample per invocation):`);
  let total = 0;
  for (const start of LATE_PACING_STARTS) {
    const run = stored.find((r) => r.spec.id === start.story && r.sample === 1);
    if (!run) {
      log(`  ${start.story} from turn ${start.turn}: no stored run`);
      continue;
    }
    const estimate = latePacingEstimate(run.input.playerCount, run.input.maxTurns, start.turn, costsFor(run.input.playerCount));
    total += 2 * estimate.usd;
    const runs = held.filter((r) => r.spec.id === start.story).map((r) => `${r.from?.variant} s${r.sample}: ${r.turns.length} turns, ${r.stopped}`);
    log(`  ${start.story} from turn ${start.turn}: about ${estimate.calls} calls an arm, est $${estimate.usd.toFixed(3)} an arm${runs.length ? `; held: ${runs.join("; ")}` : ""}`);
  }
  log(`  A sample of both arms: est $${total.toFixed(3)} before retries (two samples $${(2 * total).toFixed(3)}); spent in the stage so far $${prep.reduce((sum, r) => sum + r.costUsd, 0).toFixed(4)} over ${prep.length} prep attempts`);
}

// --- --judge-clues ---

/** A judge call on a short playthrough's turn or a frozen ending: the reading's arm, case and sample, the turn and player. */
export type CluesReplyTarget = CluesTarget & { armKey: string; caseId: string; sample: number; turn: number; slot: string; outputId: string };

/** Every turn of the short playthroughs in the story's late part, once per player, as the game kept it, under the arm's key; the judge's prompt at `version`. */
export function cluesPlayTargets(runs: PlayRun[], version: CluesJudgeVersion = LATE_PACING_CLUES_VERSION): CluesReplyTarget[] {
  return runs.flatMap((run) => {
    const variant = run.from?.variant ?? "adopted";
    const players = run.input.playerCount;
    return replayRun(run).flatMap((r) => {
      const reply = r.played.reply as SetOfBeatGenerationSchema | undefined;
      if (!reply) return [];
      return cluesJudgeRequests(r.before, reply, version).map((q) => ({
        key: `${run.spec.id}-from${run.from?.turn ?? 1}-${variant}-s${run.sample}-t${r.turn}-${q.slot}`,
        check: q.check,
        request: q.request,
        samples: 1,
        armKey: playthroughArm("beat", players, variant).key,
        caseId: `${run.spec.id}-from${run.from?.turn ?? 1}-t${r.turn}`,
        sample: run.sample,
        turn: r.turn,
        slot: q.slot,
        outputId: r.played.calls.at(-1)?.outputFile ? outputIdOf(r.played.calls.at(-1)?.outputFile ?? "") : "",
      }));
    });
  });
}

/** Every frozen ending of the stage's turn arms under its tag, as the game keeps it, once per player. */
export function cluesEndingTargets({ records, cases, load }: Lookup): CluesReplyTarget[] {
  const endings = new Set<string>(LATE_PACING_CASES.endings);
  return records.flatMap((r): CluesReplyTarget[] => {
    if (r.group !== "beat" || !r.final || !usable(r) || !r.outputFile || r.promptState !== LATE_PACING_PROMPT_STATE || !LATE_PACING_BEAT_ARMS.includes(r.armKey) || !endings.has(r.caseId)) return [];
    const evalCase = cases.find((c) => c.id === r.caseId);
    const parsed = load(r) as SetOfBeatGenerationSchema | undefined;
    if (!evalCase?.state || !parsed) return [];
    const story = caseStory(evalCase);
    const outputId = outputIdOf(r.outputFile);
    return cluesJudgeRequests(story, repairBeatReply(story, parsed).reply, LATE_PACING_CLUES_VERSION).map((q) => ({ key: `${outputId}-${q.slot}`, check: q.check, request: q.request, samples: 1, armKey: r.armKey, caseId: r.caseId, sample: r.sample, turn: 0, slot: q.slot, outputId }));
  });
}

export type CluesCalibrationTarget = CluesTarget & { itemId: string };

/** The hand-read items' judge requests at the prompt `version`, each at two samples, and what could not be built. */
export function cluesCalibrationTargets(
  runs: PlayRun[],
  items: CluesCalibrationItem[] = CLUES_CALIBRATION,
  version: CluesJudgeVersion = LATE_PACING_CLUES_VERSION
): { targets: CluesCalibrationTarget[]; problems: string[] } {
  const problems: string[] = [];
  const targets: CluesCalibrationTarget[] = [];
  for (const item of items) {
    try {
      const { before, played } = replayedTurn(runs, item.story, item.turn);
      const reply = withEdits(played.reply as SetOfBeatGenerationSchema, item.edits ?? []);
      const target = cluesJudgeRequests(before, reply, version).find((r) => r.slot === item.slot && r.check === item.check);
      if (!target) throw new Error(`turn ${item.turn} of ${item.story} has no ${item.check} request for ${item.slot}`);
      targets.push({ itemId: item.id, key: `cal-${item.id}`, check: item.check, request: target.request, samples: CALIBRATION_SAMPLES });
    } catch (error) {
      problems.push(`${item.id}: ${(error as Error).message}`);
    }
  }
  return { targets, problems };
}

/** Each check's readings: a reply passes when every judged player passes; the variant against production under the stop rule. */
export function cluesReadings(targets: CluesReplyTarget[], answerOf: (target: CluesReplyTarget) => boolean | undefined): Record<ClueCheck, StageArmReading[]> {
  const byReply = new Map<string, CluesReplyTarget[]>();
  for (const t of targets) byReply.set(`${t.check}|${t.armKey}|${t.caseId}|${t.sample}`, [...(byReply.get(`${t.check}|${t.armKey}|${t.caseId}|${t.sample}`) ?? []), t]);
  const plans = (check: ClueCheck): JudgedPlan[] =>
    [...byReply.values()].flatMap((group) => {
      if (group[0].check !== check) return [];
      const passes = replyVerdict(group.map(answerOf));
      return passes === undefined ? [] : [{ armKey: group[0].armKey, caseId: group[0].caseId, sample: group[0].sample, outputId: group[0].outputId, passes, threads: group.length }];
    });
  return { [NEW_MYSTERY_CHECK]: stageReadings(plans(NEW_MYSTERY_CHECK), referencesOf), [EXPLAINED_CHECK]: stageReadings(plans(EXPLAINED_CHECK), referencesOf) };
}

/** Every target once, at the most samples any reading asks of it. */
export function mergedTargets(targets: CluesTarget[], version: CluesJudgeVersion = LATE_PACING_CLUES_VERSION): CluesTarget[] {
  const byKey = new Map<string, CluesTarget>();
  for (const t of targets) {
    const id = cluesJudgeCaseId(t.key, t.check, version);
    const known = byKey.get(id);
    if (!known || known.samples < t.samples) byKey.set(id, { ...t, samples: Math.max(t.samples, known?.samples ?? 0) });
  }
  return [...byKey.values()];
}

export async function judgeCluesMode(ctx: PrepContext, options: { caseIds?: string[] } = {}): Promise<void> {
  const { files, log } = ctx;
  const lookup = { records: files.readRecords(), cases: files.readCases(), load: files.loadOutput };
  const { targets: calibration, problems } = cluesCalibrationTargets(runs2Of(ctx));
  const replies = [...cluesPlayTargets(playRunsOf(ctx)), ...cluesEndingTargets(lookup)];
  const items = options.caseIds ? calibration.filter((t) => options.caseIds?.includes(t.itemId)) : calibration;
  const read = options.caseIds ? replies.filter((r) => options.caseIds?.includes(r.caseId)) : replies;
  const targets = mergedTargets([...items, ...read]);
  const arm = JUDGE_ARMS[0];
  const jobs = cluesJudgeJobs(targets, arm, LATE_PACING_PROMPT_STATE, STAGE, LATE_PACING_CLUES_VERSION);
  const done = finishedJobKeys(files.readPrepRecords());
  const open = jobs.filter((j) => !done.has(keyOf(j)));
  const estimate = open.reduce((sum, j) => sum + jobEstimateUsd(j), 0);
  ctx.refuse(STAGE, estimate);
  log(`${calibration.length} calibration items, ${replies.length} player turns of the stage on ${arm.key} (stage ${STAGE}): ${jobs.length} calls, ${open.length} open, est $${estimate.toFixed(3)}`);
  const result = await runJobs(jobs, ctx.deps("prep"), { caps: ctx.caps, previous: files.readPrepRecords(), extraSpend: spendBeside(files, "prep"), tokensPerMinute: ctx.tpm, maxInFlight: ctx.maxInFlight });
  if (result.stoppedReason) log(`Stopped: ${result.stoppedReason}`);
  writeJudgedClues(ctx, calibration, replies, problems);
}

/** judged-clues.md and .json from every judge call so far; no calls. */
export function writeJudgedClues(ctx: Pick<PrepContext, "files" | "log">, calibration: CluesCalibrationTarget[], replies: CluesReplyTarget[], problems: string[]): void {
  const { files, log } = ctx;
  const prep = files.readPrepRecords();
  const arm = JUDGE_ARMS[0];
  const parsedAt = (key: string, check: ClueCheck, sample: number) => {
    const record = finishedPrepRecord(prep, jobKey(cluesJudgeCaseId(key, check, LATE_PACING_CLUES_VERSION), prepArmKey("judge", arm), LATE_PACING_PROMPT_STATE, sample));
    return record ? files.loadOutput(record) : undefined;
  };
  const judged = calibration.map((t) => {
    const parsed = [1, 2].map((sample) => parsedAt(t.key, t.check, sample));
    return { itemId: t.itemId, samples: parsed.map((p) => cluesVerdictFrom(p, t.check)), evidence: parsed.map((p) => cluesEvidenceFrom(p, t.check)) };
  });
  const agreement = scoreCluesCalibration(CLUES_CALIBRATION, judged);
  const readings = cluesReadings(replies, (t) => cluesVerdictFrom(parsedAt(t.key, t.check, 1), t.check));
  const rows = replies.map((t) => {
    const parsed = parsedAt(t.key, t.check, 1);
    const said = cluesEvidenceFrom(parsed, t.check);
    return { armKey: t.armKey, caseId: t.caseId, sample: t.sample, slot: t.slot, check: t.check, verdict: cluesVerdictFrom(parsed, t.check), evidence: said.evidence, lines: said.lines };
  });
  const spentUsd = prep.filter((r) => r.stage === STAGE && r.caseId.startsWith("judge-clues")).reduce((sum, r) => sum + r.costUsd, 0);
  const generatedAt = new Date();
  const verdictText = (v: unknown) => (v === undefined ? "–" : v === "partial" ? "partial" : v ? "yes" : "no");
  const lines = [
    "# Judged checks: planted details in the story's late part and at the ending",
    "",
    `Generated ${generatedAt.toISOString()} from prep-calls.jsonl (cluesJudge.ts, prompt v${LATE_PACING_CLUES_VERSION}). One Luna low call per player's turn. noNewMystery on a turn in the story's late part: no new unexplained detail the story didn't have. detailsExplained on an ending: at least one of the story's unexplained details explained. A check is reliable when sample 1 agrees on at least 85% of the hand yes and of the hand no, each side holding at least 3, and two samples agree on at least 90%. Spent on these judge calls: $${spentUsd.toFixed(4)}.`,
    "",
    "| Check | Agree (sample 1) | Hand yes / no | Judged no where the hand says yes | Judged yes where the hand says no | Samples agree | On partial items (yes / no) | Reading |",
    "|---|---|---|---|---|---|---|---|",
    ...agreement.map((a) => `| ${a.check} | ${a.agree} of ${a.decided} | ${a.handPasses} / ${a.handFails} | ${a.falseFails} | ${a.falsePasses} | ${a.pairs ? `${a.pairsAgree} of ${a.pairs}` : "–"} | ${a.partial.yes} / ${a.partial.no} | ${a.reliable ? "reliable" : "not reliable"} |`),
    "",
    ...([NEW_MYSTERY_CHECK, EXPLAINED_CHECK] as const).flatMap((check) => [`## ${check}`, "", ...readings[check].map((r) => `- ${r.armKey}: ${readingText(r)}`), ""]),
    "## The calibration items",
    "",
    "| Item | Check | Player | Hand | Judged (samples) | Hand reading |",
    "|---|---|---|---|---|---|",
    ...CLUES_CALIBRATION.map((item) => {
      const j = judged.find((x) => x.itemId === item.id);
      return `| ${item.id} | ${item.check} | ${item.slot} | ${verdictText(item.hand)} | ${j?.samples.map(verdictText).join("/") || "–"} | ${item.note} |`;
    }),
    "",
    "Where sample 1 disagrees with the hand:",
    "",
    ...CLUES_CALIBRATION.flatMap((item) => {
      const j = judged.find((x) => x.itemId === item.id);
      const first = j?.samples[0];
      if (item.hand === "partial" || first === undefined || first === item.hand) return [];
      const said = j?.evidence[0];
      return [`- ${item.id}: hand ${verdictText(item.hand)}, judged ${verdictText(first)}. ${(said?.lines ?? []).join("; ")}. Evidence: ${(said?.evidence ?? "").replace(/\s+/g, " ").trim()}`];
    }),
    "",
    "## The stage's turns",
    "",
    "| Case | Arm | Sample | Player | Check | Judged | Details | Evidence |",
    "|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.caseId} | ${r.armKey} | ${r.sample} | ${r.slot} | ${r.check} | ${verdictText(r.verdict)} | ${r.lines.join("; ").replace(/\|/g, "/")} | ${(r.evidence ?? "").replace(/\s+/g, " ").replace(/\|/g, "/")} |`),
    ...(problems.length ? ["", "## Problems", "", ...problems.map((p) => `- ${p}`)] : []),
  ];
  files.writePlaythroughs(`${lines.join("\n")}\n`, { generatedAt: generatedAt.toISOString(), promptState: LATE_PACING_PROMPT_STATE, promptVersion: LATE_PACING_CLUES_VERSION, agreement, judged, readings, rows, problems, spentUsd }, "judged-clues");
  for (const a of agreement) log(`${a.check}: ${a.agree} of ${a.decided} agree (hand yes ${a.handPasses}, no ${a.handFails}), samples ${a.pairsAgree} of ${a.pairs}: ${a.reliable ? "reliable" : "not reliable"}`);
  for (const check of [NEW_MYSTERY_CHECK, EXPLAINED_CHECK] as const) for (const r of readings[check]) log(`  ${check} ${r.armKey}: ${readingText(r)}`);
  log(`The stage's clue judge calls so far $${spentUsd.toFixed(4)}. Wrote judged-clues.md and .json.`);
}
