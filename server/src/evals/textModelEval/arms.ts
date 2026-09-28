import {
  TEXT_MODEL_GROUPS,
  type ReasoningEffort,
  type TextModelGroup,
  type TextModelSettings,
  type TextRole,
  type Verbosity,
} from "shared/llm/textModelSettings.js";
import { TRIGGER_SWITCH_CASES, TRIGGER_THREAD_CASES } from "./triggerCases.js";
import type { VariantId } from "./variants.js";

/*
 * The arm matrix per stage and role, the arm and chain key formats, each
 * variant arm's reference arm, and the pipeline plans. Arms are hard-coded
 * here, the baseline included: it is production's pre-migration settings
 * (gpt-4.1, gpt-4.1-mini), which every stored baseline record carries.
 * Production no longer runs them, so the baseline no longer follows
 * production config. Prices and estimates live in pricing.ts.
 */

export type EvalRole = "setup" | "beat" | "switch" | "thread" | "iteration";
export const EVAL_ROLES: EvalRole[] = ["setup", "beat", "switch", "thread", "iteration"];

/**
 * The --run stages. 0 to 4 are the evaluation of 2026-09-26 (Stage 4 is
 * closed). The rounds after the Round 0 play fixes (2026-09-27) each have their
 * own: "setup-rounds" and "turn-rounds" for the candidates of the two
 * improvement documents, and "migration" for checks of production's GPT-6
 * defaults on today's prompts. Their caps and reasons are in budget.ts.
 */
export type Stage = "0" | "1-2" | "3" | "4" | "setup-rounds" | "turn-rounds" | "migration";
export const STAGES: Stage[] = ["0", "1-2", "3", "4", "setup-rounds", "turn-rounds", "migration"];

/** Stages that read against stored references: they plan no baseline job and gate no candidate on one. */
const STORED_REFERENCE_STAGES: Stage[] = ["setup-rounds", "turn-rounds", "migration"];

/**
 * Whether a stage runs the comparison baseline (gpt-4.1, gpt-4.1-mini) on its
 * cases and runs a candidate only where the baseline worked. The rounds and
 * the migration check do neither: the owner keeps gpt-4.x out of new runs
 * ("except maybe for comparison"), and every stored baseline record stays
 * the comparison.
 */
export function stageRunsBaseline(stage: Stage): boolean {
  return !STORED_REFERENCE_STAGES.includes(stage);
}

export type Arm = TextModelSettings & {
  key: string;
  variant: VariantId;
  baseline: boolean;
};

/** Which cases an arm runs on, and how many samples per case. */
export type ArmPlan = {
  arm: Arm;
  samples: number;
  /** subset15 narrows beats only; single-player leaves out multiplayer cases of any role, multiplayer the others */
  scope: "all" | "subset15" | "single-player" | "multiplayer";
  /** Only these cases (still intersected with --cases) */
  caseIds?: string[];
  /** "stored": every case but those built for the rounds (roundCases.ts); "round": only those */
  source?: "stored" | "round";
  /** Rare-failure batch: this many extra single-sample calls spread over the cases */
  extraCalls?: number;
  /** The first sample planned (default 1): extra samples of an arm another plan already runs at 1 and 2 */
  fromSample?: number;
  /** Beats only: only cases whose turn is a chapter step (a thread beat, a chapter's first step included) */
  beatType?: "thread";
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
 * reads against the same bases as the Stage 4 form it re-runs. Setup round
 * 1's candidate reads against production's form of the same arm (the stored
 * postfix setups, which today's code rebuilds byte for byte); round 2's arm A
 * against round 1, and its arm B against arm A, so the order's effect is read
 * on its own.
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
  setupR1: "prod",
  setupR2: "setupR1",
  setupR2Order: "setupR2",
  setupR1b: "prod",
  setupR1c: "prod",
  setupR2b: "setupR1c",
  setupR2bOrder: "setupR1c",
  // Turn round 1: planner v2 and the chapter turns against today's form (the migration check's round0 records);
  // the full planner against the lean one, so the restated instructions' effect reads on its own
  planV2: "prod",
  planV2Full: "planV2",
  chapterFull: "prod",
  chapterSlim: "prod",
  chapterSlimPlans: "prod",
  // Turn round 2: its form against today's (round 1 carried no turn form), the paragraph arm against the round-2 form it builds on
  turnR2: "prod",
  turnR2b: "prod",
  turnR2Paragraphs: "turnR2b",
  turnR2c: "prod",
  // Turn round 3: B9's request form against the round-2 form it sends
  turnR3Form: "turnR2b",
  // Setup round 3: the final setup form against the carried-forward form it builds on (and today's prompt, second);
  // its chain's planner against planner v2, its turn form (B6 alone) against today's
  setupR3: "setupR2bOrder",
  planV2b: "planV2",
  turnB6: "prod",
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
 * The arms a round's report reads a candidate against beside its own
 * reference. Setup round 2's arms A and B against production's form too:
 * their base (round 1 without its three failed proposals) never ran alone,
 * so an existing check counts against steering only when it is worse than
 * both references, and a form carried forward must be no worse than today's
 * prompt on a check the round targets. Sol low's round 1 against Luna low's
 * (the templates question: is Sol clearly better on the same prompt?). Round
 * 1b against round 1 as it ran, so each fix reads against the text it fixes.
 * Round 2b's arms read against round 1c, their base (their own reference), arm B against
 * arm A too (the order alone), and both against today's prompt (the
 * carry-forward guard).
 */
const LUNA_LOW = { model: "gpt-6-luna", reasoningEffort: "low" } as const;
const LUNA_MEDIUM = { model: "gpt-6-luna", reasoningEffort: "medium" } as const;
const SECOND_REFERENCES: Record<string, string[]> = {
  // Turn round 1: slim against the full chapter turn (B4 on its own), and the full planner against today's form too
  [armKey(LUNA_MEDIUM, "chapterSlim")]: [armKey(LUNA_MEDIUM, "chapterFull")],
  // Slim's fix-and-retest against the slim form it retests, and against the full form
  [armKey(LUNA_MEDIUM, "chapterSlimPlans")]: [armKey(LUNA_MEDIUM, "chapterSlim"), armKey(LUNA_MEDIUM, "chapterFull")],
  [armKey(LUNA_LOW, "planV2Full")]: [armKey(LUNA_LOW, "prod")],
  // Turn round 2's paragraph arm against today's form too: a form carried forward must be no worse than today's on its target
  [armKey(LUNA_MEDIUM, "turnR2Paragraphs")]: [armKey(LUNA_MEDIUM, "prod")],
  // B5's fix-and-retest against the round-2 form it retests
  [armKey(LUNA_MEDIUM, "turnR2c")]: [armKey(LUNA_MEDIUM, "turnR2b")],
  // B9 against today's form too: no base carried forward may be worse than today's on a check the round targets
  [armKey(LUNA_MEDIUM, "turnR3Form")]: [armKey(LUNA_MEDIUM, "prod")],
  [armKey(LUNA_LOW, "setupR2")]: [armKey(LUNA_LOW, "prod")],
  [armKey(LUNA_LOW, "setupR2Order")]: [armKey(LUNA_LOW, "prod")],
  [armKey({ model: "gpt-6-sol", reasoningEffort: "low" }, "setupR1")]: [armKey(LUNA_LOW, "setupR1")],
  [armKey(LUNA_LOW, "setupR1b")]: [armKey(LUNA_LOW, "setupR1")],
  [armKey(LUNA_LOW, "setupR1c")]: [armKey(LUNA_LOW, "setupR1b")],
  [armKey(LUNA_LOW, "setupR2b")]: [armKey(LUNA_LOW, "prod")],
  [armKey(LUNA_LOW, "setupR2bOrder")]: [armKey(LUNA_LOW, "setupR2b"), armKey(LUNA_LOW, "prod")],
  // Setup round 3's confirmation: the final form against today's prompt too (the carry-forward guard)
  [armKey(LUNA_LOW, "setupR3")]: [armKey(LUNA_LOW, "prod")],
};

export function secondReferenceKeys(key: string): string[] {
  return SECOND_REFERENCES[key] ?? [];
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

/**
 * The comparison baseline: production's settings before the GPT-6 migration
 * of 2026-09-27 (gpt-4.1 for setup and the template editor, gpt-4.1-mini for
 * turns and analysis, temperature 0.2, single- and multiplayer alike). Every
 * stored baseline record carries these keys, so the eval keeps reading
 * against them; production refuses gpt-4.x (textModelSettings.ts).
 */
const COMPARISON_BASELINE: Record<EvalRole, TextModelSettings> = {
  setup: { model: "gpt-4.1", temperature: 0.2 },
  iteration: { model: "gpt-4.1", temperature: 0.2 },
  beat: { model: "gpt-4.1-mini", temperature: 0.2 },
  switch: { model: "gpt-4.1-mini", temperature: 0.2 },
  thread: { model: "gpt-4.1-mini", temperature: 0.2 },
};

export function baselineArm(role: EvalRole): Arm {
  return makeArm(COMPARISON_BASELINE[role], "prod", true);
}

const luna = (effort: ReasoningEffort, variant: VariantId = "prod", verbosity?: Verbosity) =>
  makeArm({ model: "gpt-6-luna", reasoningEffort: effort, ...(verbosity ? { verbosity } : {}) }, variant);
const sol = (effort: ReasoningEffort, variant: VariantId = "prod", verbosity?: Verbosity) =>
  makeArm({ model: "gpt-6-sol", reasoningEffort: effort, ...(verbosity ? { verbosity } : {}) }, variant);
/** The comparison model at its pre-migration production settings, on another variant. */
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
 * The nine premises of the owner's round-1 setup page (key 3434afcc6f, the
 * Casablanca control left out): three per player count. Not
 * STAGE3_SETUP_PREMISES, which has neo-tokyo instead of Avalon.
 */
export const ROUND1_SETUP_PAGE_PREMISES = [
  "setup-custom-avalon",
  "setup-pretend-er-doctor",
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
 * Stage 4) the owner's count fix. The setup rounds follow the setup document
 * with the owner's decisions of 2026-09-27.
 */
export function armsFor(stage: Stage, role: EvalRole): ArmPlan[] {
  switch (stage) {
    case "1-2":
      return stage12Arms(role);
    case "3":
      return stage3Arms(role);
    case "4":
      return [...stage4bArms(role), ...stage4Arms(role)];
    case "setup-rounds":
      return setupRoundArms(role);
    case "migration":
      return migrationArms(role);
    case "turn-rounds":
      return turnRoundArms(role);
    default:
      return [];
  }
}

/**
 * Turn round 1 (turn doc section 4; coordinator's brief of 2026-09-27):
 * planner v2 on Luna low at two samples on every planning case, stored and
 * built; the lean-against-full trigger comparison on the built trigger cases,
 * both forms at four samples (the lean form's samples 3 and 4 on top of its
 * two); the chapter turns on Luna medium, full then slim, at two samples on
 * every single-player chapter step. Turn rounds 2 and 3 follow (their plans
 * say what they run). gpt-4.x is never a new arm.
 */
function turnRoundArms(role: EvalRole): ArmPlan[] {
  switch (role) {
    case "switch":
    case "thread": {
      const triggers = role === "switch" ? TRIGGER_SWITCH_CASES : TRIGGER_THREAD_CASES;
      return [
        { arm: luna("low", "planV2"), samples: 2, scope: "all" },
        { arm: luna("low", "planV2"), samples: 4, scope: "all", caseIds: triggers, fromSample: 3 },
        { arm: luna("low", "planV2Full"), samples: 4, scope: "all", caseIds: triggers },
      ];
    }
    case "beat":
      return [
        { arm: luna("medium", "chapterFull"), samples: 2, scope: "single-player", beatType: "thread" },
        { arm: luna("medium", "chapterSlim"), samples: 2, scope: "single-player", beatType: "thread" },
        // Slim's one fix-and-retest (round 1: facts 3.97 → 3.28 per turn, the step left open 91% → 81%): the two planning fields kept
        { arm: luna("medium", "chapterSlimPlans"), samples: 2, scope: "single-player", beatType: "thread" },
        // Turn round 2 on every single-player turn: twice on the stored cases, once on the round cases (as the reference ran),
        // then the paragraph arm (B9 item 2) once on the stored cases. It runs as turnR2b: the smoke ran the draft as turnR2,
        // whose first turn was fixed after it (turnR2 is not planned again)
        { arm: luna("medium", "turnR2b"), samples: 2, scope: "single-player", source: "stored" },
        { arm: luna("medium", "turnR2b"), samples: 1, scope: "single-player", source: "round" },
        { arm: luna("medium", "turnR2Paragraphs"), samples: 1, scope: "single-player", source: "stored" },
        // B5's one fix-and-retest (round 2: two-sentence last paragraphs, facts 3.77 → 3.24, options named at the end), once on
        // the stored chapter steps and switch turns, where those readings fell (what the turn-rounds stage has left)
        { arm: luna("medium", "turnR2c"), samples: 1, scope: "single-player", source: "stored", caseIds: ROUND2_RETEST_CASES },
        // Turn round 3's B9, shrunk to the stage's last $0.04: its replay of the problem story turn and the problem first
        // turn, five times each, then the round-2 form's samples 3 to 5 on the problem turn (it has two there already)
        { arm: luna("medium", "turnR3Form"), samples: ROUND3_REPLAY_SAMPLES, scope: "single-player", source: "stored", caseIds: ROUND3_REPLAY_CASES },
        {
          arm: luna("medium", "turnR2b"),
          samples: ROUND3_REPLAY_SAMPLES,
          fromSample: 3,
          scope: "single-player",
          source: "stored",
          caseIds: [ROUND3_PROBLEM_TURN],
        },
      ];
    default:
      return [];
  }
}

/**
 * The setup rounds (setup doc section 4). Round 1 (setupR1): custom-story
 * setup runs on Luna low, the production default, on all 18 premises at two
 * samples, so its checks read against the reference's two-sample noise; Sol
 * low runs beside it once on the owner's round-1 page premises, in round 1
 * only, to decide whether template generation moves to Sol. gpt-4.1 is never a
 * new arm. Luna first, so a cap stop cuts Sol. Round 2 (setupR2, setupR2Order):
 * its two arms on Luna low at two samples on all 18 premises, arm A (today's
 * field order) before arm B (the generation order). Round 1b (setupR1b, the
 * round-1 report's fixes) on Luna low at two samples on all 18 premises, then
 * round 1c (setupR1c, proposal 1's fix-and-retest) and round 2b (setupR2b,
 * setupR2bOrder: round 2's arms on the passing changes) the same way, arm A
 * first. Round 3's confirmation run (setupR3, the final form) last, on Luna
 * low at two samples on all 18 premises; its setup-to-play chain is its own
 * mode (setupChain.ts).
 */
function setupRoundArms(role: EvalRole): ArmPlan[] {
  if (role !== "setup") return [];
  return [
    { arm: luna("low", "setupR1"), samples: 2, scope: "all" },
    { arm: sol("low", "setupR1"), samples: 1, scope: "all", caseIds: ROUND1_SETUP_PAGE_PREMISES },
    { arm: luna("low", "setupR2"), samples: 2, scope: "all" },
    { arm: luna("low", "setupR2Order"), samples: 2, scope: "all" },
    { arm: luna("low", "setupR1b"), samples: 2, scope: "all" },
    { arm: luna("low", "setupR1c"), samples: 2, scope: "all" },
    { arm: luna("low", "setupR2b"), samples: 2, scope: "all" },
    { arm: luna("low", "setupR2bOrder"), samples: 2, scope: "all" },
    { arm: luna("low", "setupR3"), samples: 2, scope: "all" },
  ];
}

/** Production's own default for a settings group (TEXT_MODEL_GROUPS), as an arm on production's form. */
function productionDefault(group: TextModelGroup): Arm {
  const { model, reasoningEffort } = TEXT_MODEL_GROUPS[group];
  return makeArm({ model, reasoningEffort });
}

/**
 * Production's GPT-6 default for a role at a player count, on production's
 * form: what writes a round case's missing history (roundCases.ts), since the
 * owner keeps gpt-4.x out of new runs.
 */
export function productionArm(role: EvalRole, players: number): Arm {
  const multiplayer = players > 1;
  switch (role) {
    case "setup":
      return productionDefault("setup");
    case "iteration":
      return productionDefault("templateEditor");
    case "beat":
      return productionDefault(multiplayer ? "multiplayerBeat" : "beat");
    case "switch":
    case "thread":
      return productionDefault(multiplayer ? "multiplayerAnalysis" : "analysis");
  }
}

/** One plan per player-count group, or one on every case when both groups run the same arm. */
function perPlayerCount(single: Arm, multi: Arm, samples: number): ArmPlan[] {
  return single.key === multi.key
    ? [{ arm: single, samples, scope: "all" }]
    : [
        { arm: single, samples, scope: "single-player" },
        { arm: multi, samples, scope: "multiplayer" },
      ];
}

const MIGRATION_SAMPLES = 2;

/** The sample turn round 2's rerun of today's form records as (samples 1 and 2 are the references, 3 round 1's rerun). */
export const ROUND2_RERUN_SAMPLE = 4;

/**
 * Turn round 2's switch chains (switch planner, then the switch turn), about
 * eight cases as the turn doc plans: four first switches (three single-player
 * templates without a first-turn beat case of their own, and the built IPO to
 * Mars opening rule, a flavor first switch) and four switches after a chapter
 * (two stored Novi Reg branches, the late switch with five turns left, and the
 * stat trigger).
 */
/**
 * Where B5's retest runs: the stored single-player chapter steps (a chapter's
 * first step left out) and switch turns after a chapter, where round 2's
 * sentence and facts readings fell; 32 cases, what the stage has left.
 */
export const ROUND2_RETEST_CASES = [
  "cont-2ee343b6-t2-o0",
  "cont-2ee343b6-t2-o1",
  "cont-2ee343b6-t2-o2",
  "cont-6edd813c-t2-o0",
  "cont-6edd813c-t2-o1",
  "cont-6edd813c-t2-o2",
  "cont-6edd813c-t3-o0",
  "cont-6edd813c-t3-o1",
  "cont-6edd813c-t3-o2",
  "cont-7492b211-t2-o0",
  "cont-7492b211-t2-o1",
  "cont-7492b211-t2-o2",
  "cont-8988006e-t2-o0",
  "cont-8988006e-t2-o1",
  "cont-8988006e-t2-o2",
  "cont-8988006e-t3-o0",
  "cont-8988006e-t3-o1",
  "cont-8988006e-t3-o2",
  "cont-8988006e-t6-o0",
  "cont-8988006e-t6-o1",
  "cont-8988006e-t6-o2",
  "cont-8988006e-t7-o0",
  "cont-8988006e-t7-o1",
  "cont-8988006e-t7-o2",
  "synth-8988006e-t3-pregeneration_2_player1_1-noimg",
  "synth-7492b211-t2-pregeneration_1_player1_1-noimg",
  "synth-8988006e-t7-pregeneration_6_player1_2",
  "cont-8988006e-t4-o0",
  "cont-8988006e-t4-o1",
  "cont-8988006e-t4-o2",
  "synth-8988006e-t8-pregeneration_7_player1_2",
  "synth-8988006e-t4-pregeneration_3_player1_1",
];

/**
 * Turn round 3's replay (turn doc B9, "a replay of the problem turn, five
 * times"): story 8988006e's turn 4, where Stage 4's split rewrite hung or
 * padded on 6 of 14 turns and today's form padded once to 41,190 tokens
 * (cont-8988006e-t4-o0, the switch after its first chapter: every form that
 * ran there had trouble on it), and the first turn that padded to 24,500
 * tokens on the rewrite and hung once on today's form (first-tpl-e401abf2-p1).
 */
export const ROUND3_PROBLEM_TURN = "cont-8988006e-t4-o0";
export const ROUND3_REPLAY_CASES = [ROUND3_PROBLEM_TURN, "first-tpl-e401abf2-p1"];
export const ROUND3_REPLAY_SAMPLES = 5;

export const ROUND2_SWITCH_CHAIN_CASES = [
  "switch-tpl-1c4a4c37-p1-t0",
  "switch-tpl-22b80460-p1-t0",
  "switch-tpl-af322f5d-p1-t0",
  "round-switch-trigger-opening-2db542e9-t0",
  "switch-8988006e-t4-o0",
  "switch-8988006e-t4-o2",
  "round-switch-late5-8988006e-t8",
  "round-switch-trigger-stat-8988006e-t8",
];

/**
 * The migration check: production's GPT-6 defaults (the code's, never env) on
 * today's prompts, the turn rounds' references in today's form (coordinator,
 * 2026-09-27: the Round 0 play fixes changed the state text every turn and
 * plan reads, so no stored turn-side request rebuilds). Single-player beats on
 * Luna medium, twice on the stored cases (their two-sample noise) and once on
 * the round cases; multiplayer beats on Luna low once, on the stored cases
 * (turn round 3's B10); both planners on Luna low twice on every case. No
 * setup: today's code rebuilds every stored production-form setup byte for
 * byte, so the setup rounds read those. AI Iteration (--role iteration, not a
 * default role) has never been run.
 */
function migrationArms(role: EvalRole): ArmPlan[] {
  switch (role) {
    case "setup":
      return [];
    case "iteration":
      return [{ arm: productionDefault("templateEditor"), samples: MIGRATION_SAMPLES, scope: "all" }];
    case "beat":
      return [
        { arm: productionDefault("beat"), samples: MIGRATION_SAMPLES, scope: "single-player", source: "stored" },
        { arm: productionDefault("beat"), samples: 1, scope: "single-player", source: "round" },
        { arm: productionDefault("multiplayerBeat"), samples: 1, scope: "multiplayer", source: "stored" },
        // Turn round 2's rerun of today's form beside its candidates, for the waits (round 1 met 25-50% drift per token in
        // three hours): sample 4 on every stored single-player turn, so no earlier run's sample mixes in
        { arm: productionDefault("beat"), samples: ROUND2_RERUN_SAMPLE, fromSample: ROUND2_RERUN_SAMPLE, scope: "single-player", source: "stored" },
      ];
    case "switch":
    case "thread":
      return perPlayerCount(productionDefault("analysis"), productionDefault("multiplayerAnalysis"), MIGRATION_SAMPLES);
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

/**
 * Pipeline chains: this analysis arm, then each beat arm built from its
 * output, on the cases of `roles` (both planners when absent).
 */
export type PipelinePlan = { analysis: Arm; beats: Arm[]; samples: number; scope: ArmPlan["scope"]; roles?: ("switch" | "thread")[]; caseIds?: string[] };

/** The stage's candidate chains (the baseline chain runs in every stage that runs the baseline). */
export function pipelinePlans(stage: Stage): PipelinePlan[] {
  switch (stage) {
    case "1-2":
      // Luna low analysis, as in the lead configurations
      return [{ analysis: luna("low"), beats: [luna("none"), luna("low"), luna("medium")], samples: 2, scope: "all" }];
    case "3":
      return [
        {
          analysis: luna("low", "minimal"),
          beats: [luna("medium", "minimal"), luna("low", "minimal")],
          samples: 1,
          scope: "single-player",
        },
      ];
    case "migration":
      // A chapter opening's wait (the chapter planner, then the chapter's first step), on production's pair per player count
      return [
        { analysis: productionDefault("analysis"), beats: [productionDefault("beat")], samples: 1, scope: "single-player", roles: ["thread"] },
        {
          analysis: productionDefault("multiplayerAnalysis"),
          beats: [productionDefault("multiplayerBeat")],
          samples: 1,
          scope: "multiplayer",
          roles: ["thread"],
        },
        // Turn round 2's reference switch chains: today's pair on its switch cases, two samples (their noise)
        { analysis: productionDefault("analysis"), beats: [productionDefault("beat")], samples: 2, scope: "single-player", roles: ["switch"], caseIds: ROUND2_SWITCH_CHAIN_CASES },
      ];
    case "turn-rounds":
      // Turn round 1: planner v2 into the chapter's first step, each turn form on production's model per player count
      // (the slim form is single-player only), two samples like the reference's chains after their second sample.
      // Turn round 2: planner v2 (carried forward) into the round-2 switch turn on its switch cases, two samples.
      return [
        { analysis: luna("low", "planV2"), beats: [luna("medium", "chapterFull"), luna("medium", "chapterSlim")], samples: 2, scope: "single-player", roles: ["thread"] },
        { analysis: luna("low", "planV2"), beats: [luna("low", "chapterFull")], samples: 2, scope: "multiplayer", roles: ["thread"] },
        { analysis: luna("low", "planV2"), beats: [luna("medium", "turnR2b")], samples: 2, scope: "single-player", roles: ["switch"], caseIds: ROUND2_SWITCH_CHAIN_CASES },
      ];
    default:
      return [];
  }
}
