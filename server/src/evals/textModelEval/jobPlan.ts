import type { Env } from "shared/llm/textModelSettings.js";
import { switchStep, threadStep, type TextRequest } from "../../game/services/storyTextSteps.js";
import type { SwitchAnalysis, ThreadAnalysis } from "core/types/index.js";
import {
  armsFor,
  baselineArm,
  estimateCall,
  PIPELINE_ANALYSIS_ARM,
  pipelineBeatArms,
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
 * case's baseline, the candidate arms (all cases or the 15-case subset),
 * the rare-failure batch, and pipeline chains (analysis, then the beat
 * built from it) in pipeline mode. Filters narrow the plan; estimates use
 * measured output sizes once there are enough.
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
      promptChars: promptChars ?? request().prompt.length,
      measuredOutputTokens: measured.get(`${role}|${arm.key}`),
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
    measuredOutputTokens: measured.get(`beat|${beatArm.key}`),
  });
  return {
    stage: options.stage,
    promptState: options.promptState,
    caseId: evalCase.id,
    armKey: `pipeline:${analysisArm.key}>${beatArm.key}`,
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

/** The role's cases after the filters; the 15-case subset narrows beats only. */
function casesFor(cases: EvalCase[], role: EvalRole, options: PlanOptions, scope: ArmPlan["scope"] = "all"): EvalCase[] {
  const subsetOnly = role === "beat" && (options.subset15 || scope === "subset15");
  return cases.filter(
    (c) =>
      c.role === role &&
      (!options.caseIds || options.caseIds.includes(c.id)) &&
      (!subsetOnly || c.tags.subset15)
  );
}

function armAllowed(options: PlanOptions, key: string): boolean {
  return !options.armKeys || options.armKeys.includes(key);
}

function roleJobs(cases: EvalCase[], role: EvalRole, options: PlanOptions, measured: Map<string, number[]>): Job[] {
  const jobs: Job[] = [];
  const baselineSamples = options.samples ?? DEFAULT_BASELINE_SAMPLES;
  for (const evalCase of casesFor(cases, role, options)) {
    const arm = baselineArm(role, evalCase.tags.multiplayer, options.env);
    if (!armAllowed(options, arm.key)) continue;
    for (let sample = 1; sample <= baselineSamples; sample++) jobs.push(callJob(options, evalCase, arm, sample, measured));
  }
  for (const plan of armsFor(options.stage, role)) {
    if (!armAllowed(options, plan.arm.key)) continue;
    const scoped = casesFor(cases, role, options, plan.scope);
    const samples = options.samples ?? plan.samples;
    for (const evalCase of scoped) {
      for (let sample = 1; sample <= samples; sample++) jobs.push(callJob(options, evalCase, plan.arm, sample, measured));
    }
    // Rare-failure batch: extra single samples, spread over the cases in hash order
    const ordered = hashOrder(scoped, (c) => c.id);
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
    ? [...beatCases.map((c) => requestFor("prod", inputFor(c)).prompt.length)].sort((a, b) => a - b)[Math.floor(beatCases.length / 2)]
    : 60_000;
  const jobs: Job[] = [];
  const samples = options.samples ?? DEFAULT_BASELINE_SAMPLES;
  for (const evalCase of casesFor(cases, role, options)) {
    const pairs: [Arm, Arm][] = [
      [baselineArm(role, evalCase.tags.multiplayer, options.env), baselineArm("beat", evalCase.tags.multiplayer, options.env)],
      ...pipelineBeatArms(options.stage).map((beat): [Arm, Arm] => [PIPELINE_ANALYSIS_ARM, beat]),
    ];
    for (const [analysisArm, beatArm] of pairs) {
      const key = `pipeline:${analysisArm.key}>${beatArm.key}`;
      if (options.armKeys && !options.armKeys.includes(key) && !options.armKeys.includes(beatArm.key)) continue;
      for (let sample = 1; sample <= samples; sample++) {
        jobs.push(chainJob(options, evalCase, analysisArm, beatArm, sample, measured, beatChars));
      }
    }
  }
  return jobs;
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
