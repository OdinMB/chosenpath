import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { Story } from "core/models/Story.js";
import { checkSwitchPlan, checkThreadPlan } from "../../game/services/planChecks.js";
import { switchStep, threadStep, type TextRequest } from "../../game/services/storyTextSteps.js";
import type { SwitchAnalysis, ThreadAnalysis } from "core/types/index.js";
import {
  armsFor,
  baselineArm,
  chainKey,
  estimateBaseKey,
  pipelinePlan,
  stageRunsBaseline,
  type Arm,
  type ArmPlan,
  type EvalRole,
  type Stage,
} from "./arms.js";
import { caseStory, hashOrder, type EvalCase } from "./cases.js";
import { sha256 } from "./executor.js";
import { estimateCall, MIN_MEASURED_RECORDS } from "./pricing.js";
import { usable, type CallRecord, type Job, type PlannedCall } from "./runner.js";
import { isSplitRequest, requestFor, requestText, VARIANTS, type EvalRequest, type RequestInput, type VariantId } from "./variants.js";

/*
 * Turns frozen cases and the stage's arm matrix into runner jobs: every
 * case's baseline, the candidate arms on their scope (all cases, the 15-case
 * subset, single-player cases, or a case list), the rare-failure batch, and
 * pipeline chains (analysis, then the beat built from the plan the game
 * keeps, storyAfterAnalysis) in pipeline mode.
 * Filters narrow the plan; estimates use measured output sizes once there
 * are enough, and a new variant borrows until then (estimateBaseKey: a
 * count-fix variant from its Stage 4 form, others along the reference chain).
 * Cases are queued in turn order, and a split request's job carries its
 * cache line, which the runner warms first.
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
};

const DEFAULT_BASELINE_SAMPLES = 2;

/** What a case's request is built from: the setup or iteration input, or the case's story (with its fixed analysis for beats). */
export function requestInputFor(evalCase: EvalCase): RequestInput {
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
 * The sha256 of the request today's code builds for a case on a variant, as
 * the executor hashes a request's text (promptHash); undefined when today's
 * code cannot build it. A stored record whose promptHash matches is today's
 * form, so it can stand in as a reference under a newer prompt state.
 */
export function todaysRequestHash(evalCase: EvalCase, variant: VariantId = "prod"): string | undefined {
  try {
    return sha256(requestText(requestFor(variant, requestInputFor(evalCase))));
  } catch {
    return undefined;
  }
}

/**
 * Whether a stored record's request is the one today's code builds for its
 * case on its arm's variant, byte for byte, so a round can read it as its
 * reference (variantComparison.ts, StoredReference); memoised per case and
 * variant.
 */
export function rebuiltToday(cases: EvalCase[]): (record: CallRecord) => boolean {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const hashes = new Map<string, string | undefined>();
  return (record) => {
    const evalCase = byId.get(record.caseId);
    const variant = record.armKey.split("/").pop() as VariantId;
    if (!evalCase || !record.promptHash || !VARIANTS.includes(variant)) return false;
    const key = `${record.caseId}|${variant}`;
    if (!hashes.has(key)) hashes.set(key, todaysRequestHash(evalCase, variant));
    return hashes.get(key) === record.promptHash;
  };
}

/**
 * Characters a request puts in front of the model: the prompt plus its JSON
 * schema, which OpenAI bills as input. The probe of 2026-09-26 measured 4K to
 * 16.5K input tokens for the production schemas alone (setup about 14K).
 */
export function requestChars(request: EvalRequest): number {
  return requestText(request).length + JSON.stringify(toJsonSchema(request.schema)).length;
}

/**
 * A split request's cache line: the prefix it shares with other calls (arm,
 * JSON schema and fixed rules). Production-shaped requests have none.
 */
function cacheLineOf(armKey: string, request: EvalRequest): string | undefined {
  if (!isSplitRequest(request)) return undefined;
  return sha256(`${armKey}|${JSON.stringify(toJsonSchema(request.schema))}|${request.fixed}`).slice(0, 12);
}

/** Turn-order sort keys, once per case: building a case's story is not free, and a sort asks often. */
const TURN_KEYS = new WeakMap<EvalCase, [string, number]>();

function turnKey(evalCase: EvalCase): [string, number] {
  const known = TURN_KEYS.get(evalCase);
  if (known) return known;
  let key: [string, number];
  if (evalCase.role === "setup") key = ["", evalCase.setup?.playerCount ?? 0];
  else if (evalCase.role === "iteration") key = ["", 0];
  else {
    const story = caseStory(evalCase);
    key = [story.getId(), story.getCurrentTurn()];
  }
  TURN_KEYS.set(evalCase, key);
  return key;
}

/**
 * Execution order only: beat, switch and thread cases by story, then turn,
 * then id; setup by player count, then id. Consecutive calls on one story
 * share the state prefix that gpt-4.1-mini's implicit cache reads (GPT-6's
 * fixed block is story-independent).
 */
function inTurnOrder(cases: EvalCase[]): EvalCase[] {
  return [...cases].sort((a, b) => {
    const [storyA, turnA] = turnKey(a);
    const [storyB, turnB] = turnKey(b);
    return storyA.localeCompare(storyB) || turnA - turnB || a.id.localeCompare(b.id);
  });
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

/** The longest borrowing chain: a verbosity arm on rewrite2ZeroShot, then rewriteZeroShot, then rewrite, then prod. */
const MAX_REFERENCE_STEPS = 4;

/**
 * The measured outputs of the first key with MIN_MEASURED_RECORDS of them,
 * walking from the arm's own key along estimateBaseKey (a count-fix arm's
 * Stage 4 form, else the reference chain); else whatever the arm has. A trim
 * writes less than its full form, so its borrowed estimate errs high.
 */
function measuredFor(measured: Map<string, number[]>, role: EvalRole, arm: Arm): number[] | undefined {
  let key: string | undefined = arm.key;
  for (let step = 0; key && step <= MAX_REFERENCE_STEPS; step++, key = estimateBaseKey(key)) {
    const outputs = measured.get(`${role}|${key}`);
    if ((outputs?.length ?? 0) >= MIN_MEASURED_RECORDS) return outputs;
  }
  return measured.get(`${role}|${arm.key}`);
}

function planned(
  role: EvalRole,
  arm: Arm,
  players: number,
  build: () => EvalRequest,
  measured: Map<string, number[]>,
  promptChars?: number
): PlannedCall {
  let cached: EvalRequest | undefined;
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
  // The estimate has already built the request, so the cache line costs no extra build
  const first = planned(evalCase.role, arm, evalCase.tags.players, () => requestFor(arm.variant, requestInputFor(evalCase)), measured);
  return {
    stage: options.stage,
    promptState: options.promptState,
    caseId: evalCase.id,
    armKey: arm.key,
    sample,
    baseline: arm.baseline,
    group: evalCase.role,
    first,
    cacheLine: cacheLineOf(arm.key, first.request()),
  };
}

/**
 * The story after an analysis turn, as the game keeps it: the plan checked
 * (planChecks.ts) and its repaired form applied. A plan the game would ask
 * for again is applied as written, because the eval cannot retry; its
 * planUsable check fails (outputChecks.ts).
 */
export function storyAfterAnalysis(
  story: Story,
  kind: "switch" | "thread",
  analysis: SwitchAnalysis | ThreadAnalysis
): Story {
  if (kind === "switch") {
    const written = analysis as SwitchAnalysis;
    const checked = checkSwitchPlan(story, written);
    return switchStep.apply(story, checked.problem === undefined ? checked.plan : written);
  }
  const written = analysis as ThreadAnalysis;
  const checked = checkThreadPlan(story, written);
  return threadStep.apply(story, checked.problem === undefined ? checked.plan : written);
}

/** Analysis, then the beat built from its checked output: the real wait on an analysis turn. */
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
            const next = storyAfterAnalysis(story(), kind, analysis as SwitchAnalysis | ThreadAnalysis);
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

/**
 * The role's cases after the filters and the arm's scope and case list, in
 * turn order; the 15-case subset narrows beats only. The cases built for the
 * rounds (source "round") stay out of the closed Stages 0 to 4, the stages
 * that run the baseline, so their dry-run rows and records stay as they ran.
 */
function casesFor(
  cases: EvalCase[],
  role: EvalRole,
  options: PlanOptions,
  plan: Pick<ArmPlan, "scope" | "caseIds"> = { scope: "all" }
): EvalCase[] {
  const subsetOnly = role === "beat" && (options.subset15 || plan.scope === "subset15");
  const roundCasesOut = stageRunsBaseline(options.stage);
  return inTurnOrder(
    cases.filter(
      (c) =>
        c.role === role &&
        !(roundCasesOut && c.tags.source === "round") &&
        (!options.caseIds || options.caseIds.includes(c.id)) &&
        (!plan.caseIds || plan.caseIds.includes(c.id)) &&
        (!subsetOnly || c.tags.subset15) &&
        !(plan.scope === "single-player" && c.tags.multiplayer) &&
        !(plan.scope === "multiplayer" && !c.tags.multiplayer) &&
        !(options.skipMultiplayerContinuations && isMultiplayerContinuation(c))
    )
  );
}

function armAllowed(options: PlanOptions, key: string): boolean {
  return !options.armKeys || options.armKeys.includes(key);
}

function roleJobs(cases: EvalCase[], role: EvalRole, options: PlanOptions, measured: Map<string, number[]>): Job[] {
  const jobs: Job[] = [];
  const regular = options.rareFailure !== "only";
  const baselineSamples = options.samples ?? DEFAULT_BASELINE_SAMPLES;
  // The rounds and the migration check read against stored references (stageRunsBaseline)
  for (const evalCase of regular && stageRunsBaseline(options.stage) ? casesFor(cases, role, options) : []) {
    const arm = baselineArm(role);
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
    ? [...beatCases.map((c) => requestChars(requestFor("prod", requestInputFor(c))))].sort((a, b) => a - b)[Math.floor(beatCases.length / 2)]
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
  // Per case: the baseline chain (every case, in the stages that run it), then the stage's candidate chains (their scope)
  for (const evalCase of casesFor(cases, role, options)) {
    if (stageRunsBaseline(options.stage)) {
      chains(evalCase, baselineArm(role), baselineArm("beat"), options.samples ?? DEFAULT_BASELINE_SAMPLES);
    }
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
