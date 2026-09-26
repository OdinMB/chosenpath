import {
  resolveTextModelConfig,
  settingsFor,
  type Env,
  type ReasoningEffort,
  type TextModelSettings,
  type TextRole,
  type Verbosity,
} from "shared/llm/textModelSettings.js";
import type { VariantId } from "./variants.js";

/*
 * The arm matrix per stage and role, the arm and chain key formats, each
 * variant arm's reference arm, and the pipeline plans. Arms are hard-coded
 * here; the baseline follows production config (resolveTextModelConfig), so
 * "as in production" is literal. Prices and estimates live in pricing.ts.
 */

export type EvalRole = "setup" | "beat" | "switch" | "thread" | "iteration";
export const EVAL_ROLES: EvalRole[] = ["setup", "beat", "switch", "thread", "iteration"];

export type Stage = "0" | "1-2" | "3" | "4";
export const STAGES: Stage[] = ["0", "1-2", "3", "4"];

export type Arm = TextModelSettings & {
  key: string;
  variant: VariantId;
  baseline: boolean;
};

/** Which cases an arm runs on, and how many samples per case. */
export type ArmPlan = {
  arm: Arm;
  samples: number;
  /** subset15 narrows beats only; single-player leaves out multiplayer cases of any role */
  scope: "all" | "subset15" | "single-player";
  /** Only these cases (still intersected with --cases) */
  caseIds?: string[];
  /** Rare-failure batch: this many extra single-sample calls spread over the cases */
  extraCalls?: number;
};

const PRODUCTION_ROLE: Record<EvalRole, TextRole> = {
  setup: "setup",
  beat: "beat",
  switch: "switchAnalysis",
  thread: "threadAnalysis",
  iteration: "templateIteration",
};

export function productionRole(role: EvalRole): TextRole {
  return PRODUCTION_ROLE[role];
}

/** `<model>@<effort | t<temperature>>[+v<verbosity>]/<variant>` */
export function armKey(settings: TextModelSettings, variant: VariantId): string {
  const setting = settings.reasoningEffort ?? `t${settings.temperature ?? "default"}`;
  const verbosity = settings.verbosity ? `+v${settings.verbosity}` : "";
  return `${settings.model}@${setting}${verbosity}/${variant}`;
}

/**
 * The variant each variant builds on: the Stage 3 trims and today's-scaffold
 * rewrite on production's form, the slim rewrite on the slim trim, and the
 * rewrite without examples on the rewrite with them. The count fix (rewrite2*)
 * reads against the same bases as the Stage 4 form it re-runs.
 */
const VARIANT_REFERENCE: Record<VariantId, VariantId | undefined> = {
  prod: undefined,
  slim: "prod",
  minimal: "prod",
  rewrite: "prod",
  rewriteSlim: "slim",
  rewriteZeroShot: "rewrite",
  rewrite2: "prod",
  rewrite2Slim: "slim",
  rewrite2ZeroShot: "rewrite2",
};

/** The Stage 4 form each count-fix variant re-runs, whose measured outputs price it until it has its own. */
const EARLIER_FORM: Partial<Record<VariantId, VariantId>> = {
  rewrite2: "rewrite",
  rewrite2Slim: "rewriteSlim",
  rewrite2ZeroShot: "rewriteZeroShot",
};

const isVariant = (variant: string): variant is VariantId => Object.prototype.hasOwnProperty.call(VARIANT_REFERENCE, variant);

/** An arm key's parts: `<model>@<setting>`, the verbosity part if any, and the variant; undefined for anything else. */
function armKeyParts(key: string): { modelAndSetting: string; verbosity?: string; variant: VariantId } | undefined {
  const match = /^([^@/>+]+@[^@/>+]+)(\+v[^@/>+]+)?\/(\w+)$/.exec(key);
  if (!match || !isVariant(match[3])) return undefined;
  return { modelAndSetting: match[1], verbosity: match[2], variant: match[3] };
}

/**
 * The arm a variant arm is read against: with a verbosity part, the same key
 * without it; otherwise the same model and setting on its variant's base
 * (VARIANT_REFERENCE). Undefined for a prod key and for anything that is not
 * an arm key (a pipeline chain's key, for one).
 */
export function referenceKey(key: string): string | undefined {
  const parts = armKeyParts(key);
  if (!parts) return undefined;
  if (parts.verbosity) return `${parts.modelAndSetting}/${parts.variant}`;
  const base = VARIANT_REFERENCE[parts.variant];
  return base ? `${parts.modelAndSetting}/${base}` : undefined;
}

/**
 * The next arm whose measured outputs an estimate may borrow: a count-fix
 * arm's Stage 4 form (same model and setting, EARLIER_FORM), else the arm's
 * reference.
 */
export function estimateBaseKey(key: string): string | undefined {
  const parts = armKeyParts(key);
  const earlier = parts && !parts.verbosity ? EARLIER_FORM[parts.variant] : undefined;
  return parts && earlier ? `${parts.modelAndSetting}/${earlier}` : referenceKey(key);
}

/** A pipeline chain's key: "pipeline:<analysis arm key>><beat arm key>". */
export function chainKey(analysisKey: string, beatKey: string): string {
  return `pipeline:${analysisKey}>${beatKey}`;
}

/** The two arm keys of a chain key; undefined for anything else. */
export function chainSides(key: string): { analysis: string; beat: string } | undefined {
  const match = /^pipeline:([^>]+)>([^>]+)$/.exec(key);
  return match ? { analysis: match[1], beat: match[2] } : undefined;
}

export function makeArm(
  settings: TextModelSettings,
  variant: VariantId = "prod",
  baseline = false
): Arm {
  return { ...settings, key: armKey(settings, variant), variant, baseline };
}

export function armSettings(arm: Arm): TextModelSettings {
  const { model, temperature, reasoningEffort, verbosity } = arm;
  return { model, temperature, reasoningEffort, verbosity };
}

/** Today's production settings for this role. */
export function baselineArm(role: EvalRole, multiplayer: boolean, env: Env = process.env): Arm {
  const config = resolveTextModelConfig(env, () => undefined);
  return makeArm(settingsFor(config, productionRole(role), { multiplayer }), "prod", true);
}

const luna = (effort: ReasoningEffort, variant: VariantId = "prod", verbosity?: Verbosity) =>
  makeArm({ model: "gpt-6-luna", reasoningEffort: effort, ...(verbosity ? { verbosity } : {}) }, variant);
const sol = (effort: ReasoningEffort, variant: VariantId = "prod", verbosity?: Verbosity) =>
  makeArm({ model: "gpt-6-sol", reasoningEffort: effort, ...(verbosity ? { verbosity } : {}) }, variant);
/** Today's model at production's default settings, on another variant. */
const todays = (model: string, variant: VariantId) => makeArm({ model, temperature: 0.2 }, variant);

export const RARE_FAILURE_CALLS_PER_ARM = 50;

/**
 * The Sol setup premises of Stages 3 and 4: 3 per player count, every
 * multiplayer game mode, a Kids premise and three dark ones (frozen setup
 * case ids).
 */
export const STAGE3_SETUP_PREMISES = [
  "setup-pretend-er-doctor",
  "setup-custom-neo-tokyo",
  "setup-learn-lemonade",
  "setup-fiction-bounty-hunters",
  "setup-kids-animal-rescue",
  "setup-flexible-soul-flat",
  "setup-vent-berlin-flat",
  "setup-flexible-secret-society",
  "setup-pretend-cofounders",
];

/**
 * Candidate arms (the baseline runs separately, first), one static matrix per
 * stage. Stage 1-2 follows the owner decisions of 2026-09-26, Stages 3 and 4
 * the coordinator's carry-forward (Milestone 3), and Stage 4b (planned with
 * Stage 4) the owner's count fix.
 */
export function armsFor(stage: Stage, role: EvalRole): ArmPlan[] {
  switch (stage) {
    case "1-2":
      return stage12Arms(role);
    case "3":
      return stage3Arms(role);
    case "4":
      return [...stage4bArms(role), ...stage4Arms(role)];
    default:
      return [];
  }
}

function stage12Arms(role: EvalRole): ArmPlan[] {
  switch (role) {
    case "setup":
      return [
        { arm: sol("low"), samples: 2, scope: "all" },
        { arm: sol("medium"), samples: 1, scope: "all" },
        { arm: sol("none"), samples: 1, scope: "all" },
        { arm: luna("none"), samples: 2, scope: "all" },
        { arm: luna("low"), samples: 2, scope: "all" },
        { arm: luna("medium"), samples: 2, scope: "all" },
      ];
    case "beat":
      return [
        { arm: luna("medium"), samples: 2, scope: "all", extraCalls: RARE_FAILURE_CALLS_PER_ARM },
        { arm: luna("none"), samples: 2, scope: "all", extraCalls: RARE_FAILURE_CALLS_PER_ARM },
        { arm: luna("low"), samples: 2, scope: "all", extraCalls: RARE_FAILURE_CALLS_PER_ARM },
        { arm: luna("high"), samples: 2, scope: "subset15" },
        { arm: sol("low"), samples: 1, scope: "subset15" },
      ];
    case "switch":
    case "thread":
      // Analysis follows the Luna beat arms; no Sol analysis (owner, 2026-09-26)
      return [
        { arm: luna("none"), samples: 2, scope: "all" },
        { arm: luna("low"), samples: 2, scope: "all" },
        { arm: luna("medium"), samples: 2, scope: "all" },
      ];
    case "iteration":
      return [];
  }
}

/**
 * Stage 3: the trimmed variants (slim, minimal) of the carry-forward arms.
 * Their full forms are the Stage 1-2 prod arms. In this order, so a cap stop
 * cuts the Luna none control first.
 */
function stage3Arms(role: EvalRole): ArmPlan[] {
  switch (role) {
    case "setup":
      return [
        { arm: sol("low", "minimal"), samples: 1, scope: "all", caseIds: STAGE3_SETUP_PREMISES },
        { arm: luna("low", "minimal"), samples: 2, scope: "all" },
      ];
    case "beat":
      return [
        { arm: luna("medium", "minimal"), samples: 2, scope: "single-player" },
        { arm: luna("medium", "slim"), samples: 2, scope: "single-player" },
        { arm: luna("low", "minimal"), samples: 2, scope: "single-player" },
        { arm: luna("low", "slim"), samples: 2, scope: "single-player" },
        { arm: luna("none", "minimal"), samples: 2, scope: "single-player" },
      ];
    case "switch":
    case "thread":
      return [{ arm: luna("low", "minimal"), samples: 2, scope: "all" }];
    case "iteration":
      return [];
  }
}

/**
 * Stage 4: the GPT-6-style rewrite (storyTextRewrite/), each arm read against
 * its reference (referenceKey). In the owner's priority order, so a cap stop
 * cuts the verbosity arm and the full-scaffold hedge first. Analysis is not
 * rewritten.
 */
function stage4Arms(role: EvalRole): ArmPlan[] {
  switch (role) {
    case "setup":
      return [
        { arm: sol("low", "rewrite"), samples: 1, scope: "all", caseIds: STAGE3_SETUP_PREMISES },
        { arm: sol("low", "rewriteZeroShot"), samples: 1, scope: "all", caseIds: STAGE3_SETUP_PREMISES },
        { arm: todays("gpt-4.1", "rewrite"), samples: 1, scope: "all", caseIds: STAGE3_SETUP_PREMISES },
        { arm: todays("gpt-4.1", "rewriteZeroShot"), samples: 1, scope: "all", caseIds: STAGE3_SETUP_PREMISES },
      ];
    case "beat":
      return [
        { arm: luna("medium", "rewriteSlim"), samples: 2, scope: "single-player" },
        { arm: todays("gpt-4.1-mini", "rewrite"), samples: 1, scope: "single-player" },
        { arm: luna("medium", "rewriteSlim", "low"), samples: 1, scope: "single-player" },
        // The full-scaffold hedge, in case the owner rates slim below full
        { arm: luna("medium", "rewrite"), samples: 1, scope: "single-player" },
      ];
    case "switch":
    case "thread":
    case "iteration":
      return [];
  }
}

/**
 * Stage 4b, the count fix (owner, 2026-09-26): the lead's turns and Sol low
 * setup, with and without the examples, re-run on the rewrite with its list
 * counts in words and caps only (rewrite2*), each read against the same base
 * as its Stage 4 form. Planned before Stage 4's arms, but that order holds
 * only loosely within one role: the runner runs every setup job before any
 * beat job, and warm-first can start a leftover while a Stage 4b cache line
 * warms. What holds the $6 raise to these arms is --arms, which a run that
 * raises a stage cap must pass (resolveCaps).
 */
function stage4bArms(role: EvalRole): ArmPlan[] {
  switch (role) {
    case "setup":
      return [
        { arm: sol("low", "rewrite2"), samples: 1, scope: "all", caseIds: STAGE3_SETUP_PREMISES },
        { arm: sol("low", "rewrite2ZeroShot"), samples: 1, scope: "all", caseIds: STAGE3_SETUP_PREMISES },
      ];
    case "beat":
      return [{ arm: luna("medium", "rewrite2Slim"), samples: 2, scope: "single-player" }];
    case "switch":
    case "thread":
    case "iteration":
      return [];
  }
}

/** Pipeline chains: this analysis arm, then each beat arm built from its output. */
export type PipelinePlan = { analysis: Arm; beats: Arm[]; samples: number; scope: ArmPlan["scope"] };

/** The stage's candidate chains (the baseline chain runs in every stage). */
export function pipelinePlan(stage: Stage): PipelinePlan | undefined {
  switch (stage) {
    case "1-2":
      // Luna low analysis, as in the lead configurations
      return { analysis: luna("low"), beats: [luna("none"), luna("low"), luna("medium")], samples: 2, scope: "all" };
    case "3":
      return {
        analysis: luna("low", "minimal"),
        beats: [luna("medium", "minimal"), luna("low", "minimal")],
        samples: 1,
        scope: "single-player",
      };
    default:
      return undefined;
  }
}
