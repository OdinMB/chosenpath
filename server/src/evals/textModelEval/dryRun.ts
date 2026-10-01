import type { PlayerCount, StoryState, StoryTemplate } from "core/types/index.js";
import type { TextRequest } from "../../game/services/storyTextSteps.js";
// Case building sends today's form (the round0 prompt state, frozen at the adoption of 2026-09-28)
import { round0BeatStep as beatStep } from "../../game/services/storyTextRound0/round0Steps.js";
import { baselineArm, FEEDBACK_STAGES, type EvalRole, type FeedbackStage, type Stage } from "./arms.js";
import { HARD_CEILING, LEDGER_STAGES, resolveCaps, spentByStage, STAGE_CAP_REASONS, UNRECORDED_STAGE4_USD, type SpendRecord } from "./budget.js";
import { buildCases } from "./caseBuilder.js";
import { caseStory, type EvalCase, type Snapshot } from "./cases.js";
import { FILTER_CASES } from "./filterCases.js";
import { DEFAULT_FILTER_ARMS, filterCheckEstimateUsd } from "./filterCheck.js";
import { jobEstimateUsd, planJobs, requestChars, type PlanOptions } from "./jobPlan.js";
import { estimateCall, outputTokensPerSecond } from "./pricing.js";
import { estimateCheckCost, probeChecks } from "./probe.js";
import { finishedJobKeys, keyOf, type CallRecord, type Job } from "./runner.js";
import { CURRENT_PROMPT_STATE, retiredPromptStateProblem } from "./variants.js";

/*
 * The no-API planning report (--dry-run): the cases that exist without any
 * call, what case building would cost, and per stage the jobs, estimated
 * dollars and duration against the owner's caps, plus spend so far. The jobs
 * are those a --run under the same --prompt-state would still send.
 */

export type LocalCaseSources = {
  snapshots: Snapshot[];
  templates: StoryTemplate[];
  newStory: (template: StoryTemplate, playerCount: PlayerCount, caseId: string) => StoryState;
};

export type LocalCases = Awaited<ReturnType<typeof localCases>>;

/** Cases without API calls: stored, endings, premises, iteration; synthetic analysis turns and template builds wait. */
export async function localCases(sources: LocalCaseSources) {
  const requests: { role: EvalRole; caseId: string; request: TextRequest; players: number }[] = [];
  const { cases, report } = await buildCases({
    ...sources,
    callBaseline: async (role, caseId, request, players) => {
      requests.push({ role, caseId, request, players });
      return undefined;
    },
    log: () => undefined,
  });
  return { cases, report, requests };
}

/**
 * What --build-cases would spend: the first call of every build is known
 * (a switch analysis); each template build then needs a first beat (median
 * stored beat prompt) and, for multiplayer continuations, a thread analysis.
 */
export function buildEstimate(local: LocalCases): number {
  const beatChars = local.cases
    .filter((c) => c.role === "beat")
    .map((c) => requestChars(beatStep.request(caseStory(c))))
    .sort((a, b) => a - b);
  const medianBeatChars = beatChars[Math.floor(beatChars.length / 2)] ?? 80_000;
  return local.requests.reduce((sum, r) => {
    const est = (role: EvalRole, promptChars: number) =>
      estimateCall({ role, arm: baselineArm(role), players: r.players, promptChars }).costUsd;
    const known = est(r.role, requestChars(r.request));
    if (!r.caseId.startsWith("switch-tpl-")) return sum + known;
    // Each extra player adds prompt and schema (probe: the beat schema is about 4.5K tokens at 1p, 15K at 3p)
    const beat = est("beat", medianBeatChars + 30_000 * (r.players - 1));
    const thread = r.players > 1 ? est("thread", requestChars(r.request)) : 0;
    return sum + known + beat + thread;
  }, 0);
}

/** At least the token-per-minute limit, and at least the calls' writing time over the in-flight slots. */
export function estimateMinutes(jobs: Job[], tpm: number, maxInFlight: number): number {
  const tokens = new Map<string, number>();
  let seconds = 0;
  for (const job of jobs) {
    for (const call of [job.first, ...(job.then ? [{ arm: job.then.arm, estimate: job.then.estimate }] : [])]) {
      const t = call.estimate.inputTokens + call.estimate.outputTokens;
      tokens.set(call.arm.model, (tokens.get(call.arm.model) ?? 0) + t);
      seconds += 2 + call.estimate.outputTokens / outputTokensPerSecond(call.arm.model);
    }
  }
  const tokenMinutes = Math.max(0, ...[...tokens.values()].map((t) => t / tpm));
  return Math.max(tokenMinutes, seconds / maxInFlight / 60);
}

/** The stages whose rows also list their arms. */
const ROUND_STAGES: Stage[] = ["setup-rounds", "turn-rounds", ...FEEDBACK_STAGES];

/** The owner's feedback workflow's runs (2026-09-28), each on its own stage and cap. */
const FEEDBACK_LABELS: Record<FeedbackStage, string> = {
  "plan-refresh": "Plan refresh",
  reruns: "Reruns",
  "setup-retests": "Setup retests",
  groups: "Groups (B10)",
  "form-gate": "Request-form gate (B9)",
  "final-check": "Final check",
  "stage-scoping": "Stage scoping (planner v2d)",
  "options-continuity": "Options and continuity (turnO, turnC, turnOC; retest turnOb)",
  "options-o2": "Options O2 (turnO2 beside production's form; retest turnO2b)",
  "planner-v2e": "Planner v2e (planner v2d, its last step listed once)",
  "ending-state": "The ending as its milestones leave it (endingStateB beside production's ending; the smoke's draft endingState)",
  runaway: "The runaway turn (noSwitchReminder beside production's request on the case that ran away)",
  playthroughs: "Whole-story playthroughs (no --run jobs: --playthroughs plays them, listed below)",
  "choice-result": "Choices and results (choiceResult beside production's turn under adopted5, --role beat; planV2f beside planV2e under round0, --role thread)",
  "choice-line-sp": "The exploration line for one player (choiceResult beside production's turn under adopted6, each with production's one checked retry)",
  "playthroughs-2": "Whole-story playthroughs, round 2, on production's current code (no --run jobs: --playthroughs --round 2 plays them, listed below)",
  "outcome-settled": "The turn that completes an outcome, and the ending (outcomeSettled beside production's turn under adopted8, --role beat)",
  "recorded-result": "The turn after an exploration step told as the game recorded it (recordedResult beside production's turn under adopted9, --role beat)",
  "lever-direction": "The setup whose sacrifices cost and rewards help whichever way a stat runs (leverDirection beside production's setup under adopted10, --role setup)",
  "parallel-threads":
    "Parallel threads in one world, contests with both sides (parallelThreads beside production under adopted11: --role switch, and --role thread --mode pipeline for the chapter openings' chains)",
  "challenge-results": "Challenge and contest results that tell how the attempt turns out, not the approach (resultsAsOutcomes beside production's chapter planner under adopted12, --role thread)",
  "kids-turns": "Read-with-kids turns shorter and simpler for the child's age (kidsTurn beside production's turn under adopted13, --role beat, each with production's checked retry)",
  "money-adds-up": "Money and counts that add up in a learning story (moneyAddsUp beside production's turn under adopted14, --role beat)",
  "late-pacing":
    "Pacing that leaves the last chapter a milestone, instructions below pacing, hints paid off (latePacing beside production under adopted15: --role switch and --role beat; the short playthroughs with --late-pacing-play, listed below)",
  "kids-ages":
    "Read-with-kids turns and setups by the children's age band (kidsAges beside production under adopted16: --role beat, each turn with production's checked retry, and --role setup)",
  "group-levers": "Group sacrifices, rewards and own stats (groupLevers beside production's group turn under adopted17, --role beat, each with production's checked retry)",
  "short-replies": "Turns that come back as one short paragraph (shortReplies beside production's turn under adopted18, --role beat, each with production's checked retry)",
  "runaway-2": "The runaway turn's cause again (noThreadAudit and noNewMilestones beside production's closing turn under adopted19, --role beat, on the case that ran away most)",
};

/** Jobs by arm key, in plan order. */
function byArm(jobs: Job[]): Map<string, Job[]> {
  const arms = new Map<string, Job[]>();
  for (const job of jobs) arms.set(job.armKey, [...(arms.get(job.armKey) ?? []), job]);
  return arms;
}

export type DryRunInput = {
  outDir: string;
  records: CallRecord[];
  extraSpend: SpendRecord[];
  frozenCases?: EvalCase[];
  sources: LocalCaseSources;
  /** The CLI's filters and sample override, applied to every row */
  options: (stage: Stage, promptState: string, extra: Partial<PlanOptions>) => PlanOptions;
  /** --prompt-state: the tag the rows are planned under, as --run would record them; defaults to CURRENT_PROMPT_STATE */
  promptState?: string;
  samples?: number;
  tpm: number;
  maxInFlight: number;
  log: (line: string) => void;
};

export async function printDryRun(input: DryRunInput): Promise<void> {
  const { log, records } = input;
  const promptState = input.promptState ?? CURRENT_PROMPT_STATE;
  const retired = retiredPromptStateProblem(promptState);
  if (retired) throw new Error(retired);
  const finished = finishedJobKeys(records);
  log(`Output folder: ${input.outDir}`);
  let cases = input.frozenCases;
  if (cases) {
    log(`Frozen cases: ${cases.length}`);
  } else {
    const local = await localCases(input.sources);
    cases = local.cases;
    log(`No frozen cases yet. Local cases (no API calls): ${JSON.stringify(local.report.counts)}`);
    log(`Stored units per story: ${JSON.stringify(local.report.storedUnitsByStory)}`);
    log(`Case building (--build-cases): about $${buildEstimate(local).toFixed(2)}`);
    log("The stage estimates below leave out the cases --build-cases adds (first beats, multiplayer, template analysis).");
  }

  const plan = (stage: Stage, extra: Partial<PlanOptions>) => planJobs(cases ?? [], input.options(stage, promptState, extra));
  const analysis: Partial<PlanOptions> = { mode: "pipeline", roles: ["switch", "thread"] };
  // Rows are planned under the tag --run would record, so only records under it count as done
  log(`\nJobs planned under --prompt-state ${promptState}; records under other tags do not count as done.`);
  const rows: [string, Stage, Job[]][] = [
    ["Stage 0 baseline (2 samples, isolated)", "0", plan("0", { samples: input.samples ?? 2, mode: "isolated" })],
    ["Stage 0 baseline pipeline chains", "0", plan("0", analysis).filter((j) => j.group === "pipeline")],
    ["Stages 1-2 candidates (isolated)", "1-2", plan("1-2", { mode: "isolated" }).filter((j) => !j.baseline)],
    ["Stages 1-2 pipeline chains", "1-2", plan("1-2", analysis).filter((j) => !j.baseline)],
    // Planning builds every trimmed request, so these rows also show that each trim applies to every frozen case
    ["Stage 3 candidates (isolated)", "3", plan("3", { mode: "isolated" }).filter((j) => !j.baseline)],
    ["Stage 3 pipeline chains", "3", plan("3", analysis).filter((j) => !j.baseline)],
    // Likewise every rewrite request on every case in scope; estimates ignore caching
    ["Stage 4 candidates (isolated)", "4", plan("4", { mode: "isolated" }).filter((j) => !j.baseline)],
    // The rounds and the migration check plan no baseline: they read against stored records
    ["Setup rounds candidates (isolated)", "setup-rounds", plan("setup-rounds", { mode: "isolated" })],
    ["Turn rounds candidates (isolated)", "turn-rounds", plan("turn-rounds", { mode: "isolated" })],
    ["Turn rounds pipeline chains", "turn-rounds", plan("turn-rounds", analysis)],
    ["Migration check (production defaults, isolated)", "migration", plan("migration", { mode: "isolated" })],
    ["Migration check pipeline chains", "migration", plan("migration", analysis)],
    ...FEEDBACK_STAGES.flatMap((stage): [string, Stage, Job[]][] => [
      [`${FEEDBACK_LABELS[stage]} (isolated)`, stage, plan(stage, { mode: "isolated" })],
      [`${FEEDBACK_LABELS[stage]} pipeline chains`, stage, plan(stage, analysis)],
    ]),
  ];
  const caps = resolveCaps({}).caps;
  const probeEstimate = probeChecks().reduce((sum, check) => sum + estimateCheckCost(check), 0);
  log(`\nProbe: about $${probeEstimate.toFixed(2)} before the three full completions, about $0.08 (checks over the cap are skipped)`);
  for (const [label, stage, jobs] of rows) {
    const open = jobs.filter((j) => !finished.has(keyOf(j)));
    const cost = open.reduce((sum, j) => sum + jobEstimateUsd(j), 0);
    const byRole = open.reduce<Record<string, number>>((acc, j) => ((acc[j.group] = (acc[j.group] ?? 0) + 1), acc), {});
    const minutes = Math.ceil(estimateMinutes(open, input.tpm, input.maxInFlight));
    log(`${label}: ${open.length} jobs ${JSON.stringify(byRole)}, est $${cost.toFixed(2)} (stage cap $${caps.stageCaps[stage]}), at least ${minutes} min`);
    // Production's one checked retry goes out only where a first reply is short or has no options: its ceiling apart
    const checked = open.filter((j) => j.retry);
    if (checked.length) {
      const ceiling = checked.reduce((sum, j) => sum + (j.retry?.estimate.costUsd ?? 0), 0);
      log(`  plus production's one retry where a first reply is short or has no options: up to ${checked.length} more calls, at most $${ceiling.toFixed(2)} if every first reply were retried`);
    }
    // A round's arms are its candidates: each one's open jobs and estimate, for the check by hand before a paid run
    if (ROUND_STAGES.includes(stage)) {
      for (const [armKey, armJobs] of byArm(open)) {
        const armCost = armJobs.reduce((sum, j) => sum + jobEstimateUsd(j), 0);
        log(`  ${armKey}: ${armJobs.length} open job${armJobs.length === 1 ? "" : "s"}, est $${armCost.toFixed(3)}`);
      }
    }
  }

  log(`Filter check (--filter-check): ${FILTER_CASES.length} cases per arm, about $${filterCheckEstimateUsd(FILTER_CASES, DEFAULT_FILTER_ARMS).toFixed(2)} for the default arms (cap $${caps.stageCaps.filter})`);

  const spend = spentByStage([...records, ...input.extraSpend]);
  log("\nSpend so far vs caps:");
  for (const stage of LEDGER_STAGES) {
    const label = stage === "filter" ? "Filter check" : `Stage ${stage}`;
    log(`  ${label}: $${spend.byStage[stage].toFixed(2)} of $${caps.stageCaps[stage]} (${STAGE_CAP_REASONS[stage]})`);
  }
  log(
    `  Total: $${spend.total.toFixed(2)} of $${HARD_CEILING} (hard cap, raised from $42 by the owner on 2026-10-01 for the fixes of that day and the measurements they need ("few bucks don't matter"), from $40 on 2026-09-30, $33 on 2026-09-28 and $30 on 2026-09-27; the first target was about $25; the stalled Stage 4 calls may add about $${UNRECORDED_STAGE4_USD.toFixed(2)} the ledger does not hold)`
  );
  log(
    `Baseline arms (the pre-migration comparison, fixed in arms.ts): setup ${baselineArm("setup").key}, beat ${baselineArm("beat").key}, analysis ${baselineArm("switch").key}`
  );
}
