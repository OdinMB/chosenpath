import type { PlayerCount, StoryState, StoryTemplate } from "core/types/index.js";
import { beatStep, type TextRequest } from "../../game/services/storyTextSteps.js";
import {
  baselineArm,
  estimateCall,
  outputTokensPerSecond,
  STAGES,
  type EvalRole,
  type Stage,
} from "./arms.js";
import { resolveCaps, spentByStage, type SpendRecord } from "./budget.js";
import { buildCases } from "./caseBuilder.js";
import { caseStory, type EvalCase, type Snapshot } from "./cases.js";
import { jobEstimateUsd, planJobs, type PlanOptions } from "./jobPlan.js";
import { estimateCheckCost, probeChecks } from "./probe.js";
import { finishedJobKeys, keyOf, type CallRecord, type Job } from "./runner.js";

/*
 * The no-API planning report (--dry-run): the cases that exist without any
 * call, what case building would cost, and per stage the jobs, estimated
 * dollars and duration against the owner's caps, plus spend so far.
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
    .map((c) => beatStep.request(caseStory(c)).prompt.length)
    .sort((a, b) => a - b);
  const medianBeatChars = beatChars[Math.floor(beatChars.length / 2)] ?? 60_000;
  return local.requests.reduce((sum, r) => {
    const est = (role: EvalRole, promptChars: number) =>
      estimateCall({ role, arm: baselineArm(role, r.players > 1), players: r.players, promptChars }).costUsd;
    const known = est(r.role, r.request.prompt.length);
    if (!r.caseId.startsWith("switch-tpl-")) return sum + known;
    const beat = est("beat", medianBeatChars + 4_000 * (r.players - 1));
    const thread = r.players > 1 ? est("thread", r.request.prompt.length) : 0;
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

export type DryRunInput = {
  outDir: string;
  records: CallRecord[];
  extraSpend: SpendRecord[];
  frozenCases?: EvalCase[];
  sources: LocalCaseSources;
  /** The CLI's filters and sample override, applied to every row */
  options: (stage: Stage, promptState: string, extra: Partial<PlanOptions>) => PlanOptions;
  samples?: number;
  tpm: number;
  maxInFlight: number;
  log: (line: string) => void;
};

export async function printDryRun(input: DryRunInput): Promise<void> {
  const { log, records } = input;
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

  const plan = (stage: Stage, promptState: string, extra: Partial<PlanOptions>) =>
    planJobs(cases ?? [], input.options(stage, promptState, extra));
  const analysis: Partial<PlanOptions> = { mode: "pipeline", roles: ["switch", "thread"] };
  const rows: [string, Stage, Job[]][] = [
    ["Stage 0 pre-fix baseline (1 sample, isolated)", "0", plan("0", "prefix", { samples: input.samples ?? 1, mode: "isolated" })],
    ["Stage 0 post-fix baseline (2 samples, isolated)", "0", plan("0", "postfix", { samples: input.samples ?? 2, mode: "isolated" })],
    ["Stage 0 post-fix baseline pipeline chains", "0", plan("0", "postfix", analysis).filter((j) => j.group === "pipeline")],
    ["Stages 1-2 candidates (isolated)", "1-2", plan("1-2", "postfix", { mode: "isolated" }).filter((j) => !j.baseline)],
    ["Stages 1-2 pipeline chains", "1-2", plan("1-2", "postfix", analysis).filter((j) => !j.baseline)],
  ];
  const caps = resolveCaps({}).caps;
  const probeEstimate = probeChecks().reduce((sum, check) => sum + estimateCheckCost(check), 0);
  log(`\nProbe: about $${probeEstimate.toFixed(2)} before the two full completions (checks over the cap are skipped)`);
  for (const [label, stage, jobs] of rows) {
    const open = jobs.filter((j) => !finished.has(keyOf(j)));
    const cost = open.reduce((sum, j) => sum + jobEstimateUsd(j), 0);
    const byRole = open.reduce<Record<string, number>>((acc, j) => ((acc[j.group] = (acc[j.group] ?? 0) + 1), acc), {});
    const minutes = Math.ceil(estimateMinutes(open, input.tpm, input.maxInFlight));
    log(`${label}: ${open.length} jobs ${JSON.stringify(byRole)}, est $${cost.toFixed(2)} (stage cap $${caps.stageCaps[stage]}), at least ${minutes} min`);
  }
  log("Stages 3 and 4: no arms yet (their variants arrive with later milestones).");

  const spend = spentByStage([...records, ...input.extraSpend]);
  log("\nSpend so far vs caps:");
  for (const stage of STAGES) {
    log(`  Stage ${stage}: $${spend.byStage[stage].toFixed(2)} of $${caps.stageCaps[stage]}`);
  }
  log(`  Total: $${spend.total.toFixed(2)} of $${caps.globalCap} (never above $50)`);
  log(
    `Baseline arms from production config: setup ${baselineArm("setup", false).key}, beat ${baselineArm("beat", false).key}, analysis ${baselineArm("switch", false).key}`
  );
}
