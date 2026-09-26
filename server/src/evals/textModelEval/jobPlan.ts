import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { Env } from "shared/llm/textModelSettings.js";
import { switchStep, threadStep, type TextRequest } from "../../game/services/storyTextSteps.js";
import type { SwitchAnalysis, ThreadAnalysis } from "core/types/index.js";
import {
  armsFor,
  baselineArm,
  chainKey,
  estimateCall,
  MIN_MEASURED_RECORDS,
  pipelinePlan,
  prodSiblingKey,
  type Arm,
  type ArmPlan,
  type EvalRole,
  type Stage,
} from "./arms.js";
import { caseStory, hashOrder, type EvalCase } from "./cases.js";
import { usable, type CallRecord, type Job, type PlannedCall } from "./runner.js";
import { requestFor, type RequestInput } from "./variants.js";

/*
 * Turns frozen cases and the stage's arm matrix into runner jobs: every
 * case's baseline, the candidate arms on their scope (all cases, the 15-case
 * subset, single-player cases, or a case list), the rare-failure batch, and
 * pipeline chains (analysis, then the beat built from it) in pipeline mode.
 * Filters narrow the plan; estimates use measured output sizes once there
 * are enough, and a new variant borrows its prod sibling's until then.
 */

export type PlanOptions = {
  stage: Stage;
  promptState: string;
  roles: EvalRole[];
  mode: "isolated" | "pipeline";
  armKeys?: string[];
  caseIds?: string[];
  /** Overrides every arm's sample count */
  samples?: number;
  subset15: boolean;
  /** --no-mp-continuations: leave out multiplayer beats that are neither a first beat nor an ending */
  skipMultiplayerContinuations?: boolean;
  /**
   * --rare-failure skip|only: leave the rare-failure batch out, or plan only
   * it (no baseline, no regular samples), so it can run after everything else
   */
  rareFailure?: "skip" | "only";
  /** Earlier records, for measured output sizes */
  records: CallRecord[];
  env?: Env;
};

const DEFAULT_BASELINE_SAMPLES = 2;

function inputFor(evalCase: EvalCase): RequestInput {
  switch (evalCase.role) {
    case "setup":
      if (!evalCase.setup) throw new Error(`${evalCase.id} has no setup input`);
      return { role: "setup", setup: evalCase.setup };
    case "iteration":
      if (!evalCase.iteration) throw new Error(`${evalCase.id} has no iteration input`);
      return { role: "iteration", iteration: evalCase.iteration };
    case "beat":
      return { role: "beat", story: caseStory(evalCase) };
    case "switch":
    case "thread":
      return { role: evalCase.role, story: caseStory(evalCase, false) };
  }
}

/**
 * Characters a request puts in front of the model: the prompt plus its JSON
 * schema, which OpenAI bills as input. The probe of 2026-09-26 measured 4K to
 * 16.5K input tokens for the production schemas alone (setup about 14K).
 */
export function requestChars(request: TextRequest): number {
  return request.prompt.length + JSON.stringify(toJsonSchema(request.schema)).length;
}

/** role|armKey -> output tokens of usable final calls */
export function measuredOutputs(records: CallRecord[]): Map<string, number[]> {
  const measured = new Map<string, number[]>();
  for (const r of records) {
    if (!r.final || !usable(r) || r.outputTokens === 0) continue;
    const key = `${r.role}|${r.callArmKey}`;
    measured.set(key, [...(measured.get(key) ?? []), r.outputTokens]);
  }
  return measured;
}

/**
 * The arm's own measured outputs once it has MIN_MEASURED_RECORDS; until then
 * its prod sibling's (a trim writes less than its full form, so this errs
 * high), else whatever it has.
 */
function measuredFor(measured: Map<string, number[]>, role: EvalRole, arm: Arm): number[] | undefined {
  const own = measured.get(`${role}|${arm.key}`);
  if ((own?.length ?? 0) >= MIN_MEASURED_RECORDS) return own;
  const sibling = prodSiblingKey(arm.key);
  return (sibling ? measured.get(`${role}|${sibling}`) : undefined) ?? own;
}

function planned(
  role: EvalRole,
  arm: Arm,
  players: number,
  build: () => TextRequest,
  measured: Map<string, number[]>,
  promptChars?: number
): PlannedCall {
  let cached: TextRequest | undefined;
  const request = () => (cached ??= build());
  return {
    role,
    arm,
    players,
    request,
    estimate: estimateCall({
      role,
      arm,
      players,
      promptChars: promptChars ?? requestChars(request()),
      measuredOutputTokens: measuredFor(measured, role, arm),
    }),
  };
}

function callJob(options: PlanOptions, evalCase: EvalCase, arm: Arm, sample: number, measured: Map<string, number[]>): Job {
  return {
    stage: options.stage,
    promptState: options.promptState,
    caseId: evalCase.id,
    armKey: arm.key,
    sample,
    baseline: arm.baseline,
    group: evalCase.role,
    first: planned(evalCase.role, arm, evalCase.tags.players, () => requestFor(arm.variant, inputFor(evalCase)), measured),
  };
}

/** Analysis, then the beat built from its output: the real wait on an analysis turn. */
function chainJob(
  options: PlanOptions,
  evalCase: EvalCase,
  analysisArm: Arm,
  beatArm: Arm,
  sample: number,
  measured: Map<string, number[]>,
  beatPromptChars: number
): Job {
  const kind = evalCase.role === "thread" ? "thread" : "switch";
  const story = () => caseStory(evalCase, false);
  const players = evalCase.tags.players;
  // The beat prompt exists only after the analysis; estimate from the median beat prompt
  const beatEstimate = estimateCall({
    role: "beat",
    arm: beatArm,
    players,
    promptChars: beatPromptChars,
    measuredOutputTokens: measuredFor(measured, "beat", beatArm),
  });
  return {
    stage: options.stage,
    promptState: options.promptState,
    caseId: evalCase.id,
    armKey: chainKey(analysisArm.key, beatArm.key),
    sample,
    baseline: analysisArm.baseline && beatArm.baseline,
    group: "pipeline",
    first: planned(kind, analysisArm, players, () => requestFor(analysisArm.variant, { role: kind, story: story() }), measured),
    then: {
      arm: beatArm,
      players,
      estimate: beatEstimate,
      build: (analysis) =>
        planned(
          "beat",
          beatArm,
          players,
          () => {
            const base = story();
            const next =
              kind === "switch"
                ? switchStep.apply(base, analysis as SwitchAnalysis)
                : threadStep.apply(base, analysis as ThreadAnalysis);
            return requestFor(beatArm.variant, { role: "beat", story: next });
          },
          measured
        ),
    },
  };
}

/** The owner's first shrink lever: multiplayer beats in the middle of a story. */
function isMultiplayerContinuation(c: EvalCase): boolean {
  return c.role === "beat" && c.tags.multiplayer && !c.tags.firstBeat && !c.tags.ending;
}

/** The role's cases after the filters and the arm's scope and case list; the 15-case subset narrows beats only. */
function casesFor(
  cases: EvalCase[],
  role: EvalRole,
  options: PlanOptions,
  plan: Pick<ArmPlan, "scope" | "caseIds"> = { scope: "all" }
): EvalCase[] {
  const subsetOnly = role === "beat" && (options.subset15 || plan.scope === "subset15");
  return cases.filter(
    (c) =>
      c.role === role &&
      (!options.caseIds || options.caseIds.includes(c.id)) &&
      (!plan.caseIds || plan.caseIds.includes(c.id)) &&
      (!subsetOnly || c.tags.subset15) &&
      !(plan.scope === "single-player" && c.tags.multiplayer) &&
      !(options.skipMultiplayerContinuations && isMultiplayerContinuation(c))
  );
}

function armAllowed(options: PlanOptions, key: string): boolean {
  return !options.armKeys || options.armKeys.includes(key);
}

function roleJobs(cases: EvalCase[], role: EvalRole, options: PlanOptions, measured: Map<string, number[]>): Job[] {
  const jobs: Job[] = [];
  const regular = options.rareFailure !== "only";
  const baselineSamples = options.samples ?? DEFAULT_BASELINE_SAMPLES;
  for (const evalCase of regular ? casesFor(cases, role, options) : []) {
    const arm = baselineArm(role, evalCase.tags.multiplayer, options.env);
    if (!armAllowed(options, arm.key)) continue;
    for (let sample = 1; sample <= baselineSamples; sample++) jobs.push(callJob(options, evalCase, arm, sample, measured));
  }
  for (const plan of armsFor(options.stage, role)) {
    if (!armAllowed(options, plan.arm.key)) continue;
    const scoped = casesFor(cases, role, options, plan);
    const samples = options.samples ?? plan.samples;
    for (const evalCase of regular ? scoped : []) {
      for (let sample = 1; sample <= samples; sample++) jobs.push(callJob(options, evalCase, plan.arm, sample, measured));
    }
    // Rare-failure batch: extra single samples, spread over the cases in hash order
    const ordered = options.rareFailure === "skip" ? [] : hashOrder(scoped, (c) => c.id);
    for (let i = 0; plan.extraCalls && ordered.length && i < plan.extraCalls; i++) {
      const sample = samples + 1 + Math.floor(i / ordered.length);
      jobs.push(callJob(options, ordered[i % ordered.length], plan.arm, sample, measured));
    }
  }
  return jobs;
}

function pipelineJobs(cases: EvalCase[], role: "switch" | "thread", options: PlanOptions, measured: Map<string, number[]>): Job[] {
  const beatCases = cases.filter((c) => c.role === "beat");
  const beatChars = beatCases.length
    ? [...beatCases.map((c) => requestChars(requestFor("prod", inputFor(c))))].sort((a, b) => a - b)[Math.floor(beatCases.length / 2)]
    : 80_000;
  const jobs: Job[] = [];
  const plan = pipelinePlan(options.stage);
  const candidateCases = new Set(plan ? casesFor(cases, role, options, plan).map((c) => c.id) : []);
  const chains = (evalCase: EvalCase, analysisArm: Arm, beatArm: Arm, samples: number) => {
    const key = chainKey(analysisArm.key, beatArm.key);
    if (options.armKeys && !options.armKeys.includes(key) && !options.armKeys.includes(beatArm.key)) return;
    for (let sample = 1; sample <= samples; sample++) {
      jobs.push(chainJob(options, evalCase, analysisArm, beatArm, sample, measured, beatChars));
    }
  };
  // Per case: the baseline chain (every case), then the stage's candidate chains (their scope)
  for (const evalCase of casesFor(cases, role, options)) {
    const multiplayer = evalCase.tags.multiplayer;
    chains(evalCase, baselineArm(role, multiplayer, options.env), baselineArm("beat", multiplayer, options.env), options.samples ?? DEFAULT_BASELINE_SAMPLES);
    if (!plan || !candidateCases.has(evalCase.id)) continue;
    for (const beatArm of plan.beats) chains(evalCase, plan.analysis, beatArm, options.samples ?? plan.samples);
  }
  return jobs;
}

/** Estimated dollars for a job: its call, plus the beat call of a chain. */
export function jobEstimateUsd(job: Job): number {
  return job.first.estimate.costUsd + (job.then?.estimate.costUsd ?? 0);
}

/** A single call with a ready request (case building). */
export function requestJob(input: {
  stage: Stage;
  promptState: string;
  caseId: string;
  role: EvalRole;
  arm: Arm;
  players: number;
  request: TextRequest;
  records: CallRecord[];
}): Job {
  return {
    stage: input.stage,
    promptState: input.promptState,
    caseId: input.caseId,
    armKey: input.arm.key,
    sample: 1,
    baseline: input.arm.baseline,
    group: input.role,
    first: planned(input.role, input.arm, input.players, () => input.request, measuredOutputs(input.records)),
  };
}

export function planJobs(cases: EvalCase[], options: PlanOptions): Job[] {
  const measured = measuredOutputs(options.records);
  return options.roles.flatMap((role) =>
    options.mode === "pipeline" && (role === "switch" || role === "thread")
      ? pipelineJobs(cases, role, options, measured)
      : roleJobs(cases, role, options, measured)
  );
}
