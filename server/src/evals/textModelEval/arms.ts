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
 * defaults on today's prompts. The owner's feedback of 2026-09-28 gives each
 * run of its workflow a stage of its own (FEEDBACK_STAGES): the planner v2c
 * plan refresh, the reruns that rebuild turn round 1's page, the setup
 * retests, the group turn round (B10), the request form's gate (B9) and the
 * paid final check on production's own code, each with the arms its phase
 * set (armsFor, pipelinePlans). The owner's feedback of 2026-09-29 adds the
 * stage scoping (planner v2d and its judged stage check), and that of
 * 2026-09-30 the options and continuity arms on production's turn form, then
 * version O2 beside production's form, then planner v2e (planner v2d with its
 * last step listed once), then the ending told as its milestones leave it
 * beside production's ending, then the replay of the turn that reasons to its
 * output cap (runaway), then whole-story playthroughs on production's own
 * code (playthroughs: no --run arms; its calls are the --playthroughs mode's
 * prep calls, playthroughMode.ts), then the playthroughs' choices that lead
 * somewhere else (choice-result: the exploration-order turn beside
 * production's, planner v2f beside planner v2e), then that line for a single
 * player with production's one checked retry in the loop (choice-line-sp),
 * then a second round of whole-story playthroughs on production's current
 * code (playthroughs-2: no --run arms either, the --playthroughs --round 2
 * mode's prep calls), then the turn that completes an outcome and the ending
 * (outcome-settled: the variant beside production's turn on switch turns and
 * endings of the second round's stored runs), then the turn after an
 * exploration step told as the game recorded it (recorded-result: the variant
 * beside production's turn on the second round's changes of direction), then
 * the setup whose sacrifices cost and rewards help whichever way a stat runs
 * (lever-direction: the variant beside production's setup on six premises),
 * then parallel threads in one world and contests with both sides
 * (parallel-threads: the variant's switch planner beside production's on the
 * switches before a contest's last stage, and its chapter planner into its
 * group turn beside production's chains on the chapter openings), then
 * challenge and contest results that tell how the attempt turns out, not the
 * player's approach (challenge-results: the variant's chapter planner beside
 * production's on chapter plans of the second round's stored runs), then
 * read-with-kids turns shorter and simpler for the child's age (kids-turns:
 * the variant beside production's turn on the mouse story's turns and a
 * template tagged Kids, each turn with production's one checked retry), then
 * money and counts that add up in a learning story (money-adds-up: the
 * variant beside production's turn on the lemonade story's turns), then
 * pacing that leaves the story's last chapter a milestone, story instructions
 * ranked below pacing and hints paid off (late-pacing: the variant's switch
 * planner beside production's on switches of the second round's stored runs,
 * its turn beside production's on their endings, and short playthroughs of
 * both from mid-story, the --late-pacing-play mode's prep calls), then
 * read-with-kids turns and setups by the children's age band (kids-ages: the
 * variant beside production's turn on the mouse story's turns read with a
 * child aged 4 and 10 and a two-player kids story's turns at 4, 7 and 10, each
 * turn with production's one checked retry, and beside production's kids setup
 * at 10), then group sacrifices, rewards and players' own stats (group-levers:
 * the variant beside production's group turn on group chapter steps of the
 * second round's stored runs, each turn with production's one checked retry),
 * then turns that come back as one short paragraph (short-replies: the
 * variant beside production's turn on the second round's short turns, the
 * stored turns that came back short most often and ordinary ones, each turn
 * with production's one checked retry).
 * Their caps and reasons are in budget.ts.
 */
export const FEEDBACK_STAGES = [
  "plan-refresh",
  "reruns",
  "setup-retests",
  "groups",
  "form-gate",
  "final-check",
  "stage-scoping",
  "options-continuity",
  "options-o2",
  "planner-v2e",
  "ending-state",
  "runaway",
  "playthroughs",
  "choice-result",
  "choice-line-sp",
  "playthroughs-2",
  "outcome-settled",
  "recorded-result",
  "lever-direction",
  "parallel-threads",
  "challenge-results",
  "kids-turns",
  "money-adds-up",
  "late-pacing",
  "kids-ages",
  "group-levers",
  "short-replies",
] as const;
export type FeedbackStage = (typeof FEEDBACK_STAGES)[number];
export type Stage = "0" | "1-2" | "3" | "4" | "setup-rounds" | "turn-rounds" | "migration" | FeedbackStage;
export const STAGES: Stage[] = ["0", "1-2", "3", "4", "setup-rounds", "turn-rounds", "migration", ...FEEDBACK_STAGES];

/** Stages that read against stored references: they plan no baseline job and gate no candidate on one. */
const STORED_REFERENCE_STAGES: Stage[] = ["setup-rounds", "turn-rounds", "migration", ...FEEDBACK_STAGES];

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
  // Production's own code since the adoption (the final check) against today's form, the stored round0 references
  adopted: "prod",
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
  // The nearer chapter question (owner's feedback, 2026-09-28) against the planner it edits
  planV2c: "planV2b",
  // The reruns: the framed chapter turn without the chapter rules, on the nearer frames, against today's form (the
  // stored round0 references); the setup retests against the adopted setup form (setupR3, production's byte for byte)
  chapterFullB: "prod",
  setupR3b: "setupR3",
  // The group round (B10): the sharpened coordination note against today's group turn (production's group form, round0)
  turnB10: "prod",
  turnB10b: "prod",
  // The form gate (B9): production's single-player turn form sent as a split request against the one message it splits
  adoptedSplit: "adopted",
  // The final check: the template editor's AI Draft against today's form of the same arm (Sol low's stored custom-story
  // setups; no template form ever ran in the eval)
  adoptedTemplate: "prod",
  // The Casablanca sentence (2026-09-29) against the adopted setup form, as the setup retests read
  setupR3c: "setupR3",
  // Its second retest (the multiplayer clause only) against the adopted form too
  setupR3d: "setupR3",
  // The outcome's stages (owner's feedback, 2026-09-29) against the chapter planner it edits, production's
  planV2d: "planV2c",
  // The climax clause (the owner's open question, 2026-09-30) against planner v2d, whose last-chapter clause it replaces
  planV2dClimax: "planV2d",
  // Planner v2e (2026-09-30, planner v2d with its last step listed once) against production's chapter planner, which it
  // would replace
  planV2e: "planV2c",
  // The options and continuity arms (the owner's feedback, 2026-09-30) against production's single-player turn form,
  // which they edit and which runs beside them
  turnO: "adopted",
  turnC: "adopted",
  turnOC: "adopted",
  // Arm O's one fix-and-retest (after the run of 2026-09-30) against production's form too, arm O second
  turnOb: "adopted",
  // Version O2 (the coordinator's brief after that run) against production's form, which runs beside it
  turnO2: "adopted",
  // O2's one fix-and-retest (after its run of 2026-09-30) against production's form too, O2 second
  turnO2b: "adopted",
  // The ending told as its milestones leave it (the owner's decision of 2026-09-30) against production's ending, which it
  // edits and which runs beside it on the same turn model: the smoke's draft, and the run's form with the smoke's one fix
  endingState: "adopted",
  endingStateB: "adopted",
  // The runaway turn's fix (2026-09-30: no switch reminder on a switch turn, the turn document's B3.13 alone) against
  // production's request, which runs beside it on the case that ran away
  noSwitchReminder: "adopted",
  // The choice-result stage (2026-09-30): the turn with an exploration step's options in its results' order against
  // production's turn, which runs beside it; planner v2f against production's chapter planner (planner v2e), which it edits
  choiceResult: "adopted",
  // Its one fix-and-retest against production's turn too, the run's line second
  choiceResultB: "adopted",
  planV2f: "planV2e",
  // The outcome-settled stage (2026-09-30, the second playthroughs' review): the turn that completes an outcome told and
  // recorded as settled, no stat change against a milestone, the ending's milestones over earlier facts, against
  // production's turn, which runs beside it
  outcomeSettled: "adopted",
  // Its one fix-and-retest against production's turn too, the run's lines second
  outcomeSettledB: "adopted",
  // The recorded-result stage (2026-09-30, fix 2 of the second playthroughs' review): the turn after an exploration step
  // told as the game recorded it, against production's turn, which runs beside it
  recordedResult: "adopted",
  // The lever-direction stage (2026-09-30, fix 3 of the review): the setup whose sacrifices cost and rewards help whichever
  // way a stat runs, against production's setup, which runs beside it
  leverDirection: "adopted",
  // The parallel-threads stage (2026-10-01, fix 4 of the review): the switch planner, chapter planner and group turn with
  // their lines, against production's, which run beside them (its chains against production's chains)
  parallelThreads: "adopted",
  // The challenge-results stage (2026-10-01, fix 5 of the review): the chapter planner whose results and milestones say
  // what comes of an approach, never the approach, against production's chapter planner, which runs beside it
  resultsAsOutcomes: "adopted",
  // The kids-turns stage (2026-10-01, fix 6 of the review): a read-with-kids story's turns short and plain for the
  // child's age, against production's turn, which runs beside it
  kidsTurn: "adopted",
  // The money-adds-up stage (2026-10-01, fix 7 of the review): a learning story's money and counts moved by what the
  // text pays and earns, against production's turn, which runs beside it
  moneyAddsUp: "adopted",
  // Its one fix-and-retest, against production's turn
  moneyAddsUpB: "adopted",
  // The late-pacing stage (2026-10-01, fix 8 of the review): the chapter planner's lengths that leave the last chapter a
  // milestone, the switch planner's priority step and the turn's hints planted early and paid off late, against
  // production's, which runs beside it
  latePacing: "adopted",
  // Its one fix-and-retest (the story's instructions named in the switch planner's step b), against production's
  latePacingB: "adopted",
  // The kids-ages stage (2026-10-01, the owner's decision that a kids story depends on the children's ages): turns by
  // the youngest child's age band, every player count, and the 9-12 band's setup budget, against production's turn and
  // setup, which run beside them
  kidsAges: "adopted",
  // The group-levers stage (2026-10-01): B6's lever parts on a group's challenge and contest steps, against production's
  // group turn, which runs beside it
  groupLevers: "adopted",
  // Its one fix-and-retest (the plan's lever question asked from the player's line), against production's, the run's
  // variant second
  groupLeversB: "adopted",
  // The short-replies stage (2026-10-01): the text goes on after its first paragraph, against production's turn, which
  // runs beside it
  shortReplies: "adopted",
};

/**
 * The earlier form each variant re-runs with one change, whose measured
 * outputs price it until it has its own: the Stage 4 forms of the count fix,
 * arm O for its fix-and-retest, that retest for version O2 (whose
 * sentence O2 carries, measured on rolled steps only, as O2 runs), and O2 for
 * its own fix-and-retest.
 */
const EARLIER_FORM: Partial<Record<VariantId, VariantId>> = {
  rewrite2: "rewrite",
  rewrite2Slim: "rewriteSlim",
  rewrite2ZeroShot: "rewriteZeroShot",
  turnOb: "turnO",
  turnO2: "turnOb",
  turnO2b: "turnO2",
  planV2e: "planV2d",
  endingStateB: "endingState",
  planV2f: "planV2e",
  choiceResultB: "choiceResult",
  outcomeSettledB: "outcomeSettled",
  groupLeversB: "groupLevers",
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
  // Planner v2c: planV2b ran only in the setup chain, so planner v2's isolated plans (and today's form) are its readings too
  [armKey(LUNA_LOW, "planV2c")]: [armKey(LUNA_LOW, "planV2"), armKey(LUNA_LOW, "prod")],
  // The reruns' framed turn against round 1's framed turn too (the nearer frames and no chapter rules on their own), and
  // its chain after planner v2c against round 1's chain (planner v2 into the framed turn)
  [armKey(LUNA_MEDIUM, "chapterFullB")]: [armKey(LUNA_MEDIUM, "chapterFull")],
  [chainKey(armKey(LUNA_LOW, "planV2c"), armKey(LUNA_MEDIUM, "chapterFullB"))]: [chainKey(armKey(LUNA_LOW, "planV2"), armKey(LUNA_MEDIUM, "chapterFull"))],
  // The setup retests against today's prompt too (the carry-forward guard)
  [armKey(LUNA_LOW, "setupR3b")]: [armKey(LUNA_LOW, "prod")],
  // The Casablanca sentence against the retest whose clause it extends (the sentence on its own), and today's prompt
  [armKey(LUNA_LOW, "setupR3c")]: [armKey(LUNA_LOW, "setupR3b"), armKey(LUNA_LOW, "prod")],
  // The second retest against the first (both clauses), and today's prompt
  [armKey(LUNA_LOW, "setupR3d")]: [armKey(LUNA_LOW, "setupR3c"), armKey(LUNA_LOW, "prod")],
  // B10's retest against B10, the note it retests
  [armKey(LUNA_LOW, "turnB10b")]: [armKey(LUNA_LOW, "turnB10")],
  // Planner v2d against today's form too (the carry-forward guard)
  [armKey(LUNA_LOW, "planV2d")]: [armKey(LUNA_LOW, "prod")],
  // The climax clause against production's planner v2c too, on the same last chapters
  [armKey(LUNA_LOW, "planV2dClimax")]: [armKey(LUNA_LOW, "planV2c")],
  // Planner v2e against planner v2d, the form it fixes, and today's form (the carry-forward guard)
  [armKey(LUNA_LOW, "planV2e")]: [armKey(LUNA_LOW, "planV2d"), armKey(LUNA_LOW, "prod")],
  // Both arms together against each part alone: what each adds on top of the other
  [armKey(LUNA_MEDIUM, "turnOC")]: [armKey(LUNA_MEDIUM, "turnO"), armKey(LUNA_MEDIUM, "turnC")],
  // Arm O's fix-and-retest against arm O, the text it fixes
  [armKey(LUNA_MEDIUM, "turnOb")]: [armKey(LUNA_MEDIUM, "turnO")],
  // Version O2 against arm O (its gain and its wrong-way moves) and the retest whose sentence it carries (stored, adopted2)
  [armKey(LUNA_MEDIUM, "turnO2")]: [armKey(LUNA_MEDIUM, "turnO"), armKey(LUNA_MEDIUM, "turnOb")],
  // O2's fix-and-retest against O2, the line it changes
  [armKey(LUNA_MEDIUM, "turnO2b")]: [armKey(LUNA_MEDIUM, "turnO2")],
  // The choice-result turn's fix-and-retest against the run's line, the sentence it changes
  [armKey(LUNA_MEDIUM, "choiceResultB")]: [armKey(LUNA_MEDIUM, "choiceResult")],
  // The outcome-settled retest against the run's lines, the sentences it changes, on both turn models
  [armKey(LUNA_MEDIUM, "outcomeSettledB")]: [armKey(LUNA_MEDIUM, "outcomeSettled")],
  [armKey(LUNA_LOW, "outcomeSettledB")]: [armKey(LUNA_LOW, "outcomeSettled")],
  // The group-levers retest against the run's variant, the question it changes
  [armKey(LUNA_LOW, "groupLeversB")]: [armKey(LUNA_LOW, "groupLevers")],
  // The final check: production's Luna low arm (custom-story setup, both planners, group turns) against the measured
  // variants it builds byte for byte, each read in its own role: setup round 3 (and its retest, whose kids examples
  // production took), planner v2 (its switch planner is planner v2b's and production's byte for byte) and planner v2c
  [armKey(LUNA_LOW, "adopted")]: [armKey(LUNA_LOW, "setupR3"), armKey(LUNA_LOW, "setupR3b"), armKey(LUNA_LOW, "planV2"), armKey(LUNA_LOW, "planV2c")],
};

export function secondReferenceKeys(key: string): string[] {
  return SECOND_REFERENCES[key] ?? [];
}

/**
 * An arm whose records stand in for a reference arm's where that arm has none
 * on a pair and its request for the case is the stand-in's byte for byte
 * (variantComparison.ts, the same-request check in jobPlan.ts): planner v2b's
 * chapter requests are planner v2's for one player (two-sided contests change
 * only group prompts), and planner v2b ran alone only in groups (the plan
 * refresh, 2026-09-28), so planner v2c reads against v2b on every case.
 */
const STAND_INS: Record<string, string> = {
  [armKey(LUNA_LOW, "planV2b")]: armKey(LUNA_LOW, "planV2"),
};

export function standInKey(key: string): string | undefined {
  return STAND_INS[key];
}

/**
 * Where a reference that ran once reads its noise: the arm it builds on,
 * whose two samples on the same cases give the floor. Production's
 * single-player turn form (adopted) ran once beside B9's request form (the
 * form gate, 2026-09-28: the stage had room for one sample of each); it is
 * today's form (prod, two stored samples on every stored single-player turn)
 * with the option rules on rolled chapter steps and the logged deltas.
 */
const NOISE_FROM: Record<string, string> = {
  [armKey(LUNA_MEDIUM, "adopted")]: armKey(LUNA_MEDIUM, "prod"),
};

export function noiseReferenceKey(key: string): string | undefined {
  return NOISE_FROM[key];
}

/**
 * Chains whose reference is not their sides' own references chained: the
 * reruns' planner v2c into the framed turn reads against today's pair, as
 * turn round 1's planner v2 into the framed turn did (planner v2c's own
 * reference, planner v2b, never ran in a chain), with turn round 1's chain as
 * its second reference.
 */
const CHAIN_REFERENCES: Record<string, string> = {
  [chainKey(armKey(LUNA_LOW, "planV2c"), armKey(LUNA_MEDIUM, "chapterFullB"))]: chainKey(armKey(LUNA_LOW, "prod"), armKey(LUNA_MEDIUM, "prod")),
};

/** A chain's own reference where it is set apart (CHAIN_REFERENCES), else undefined. */
export function chainReferenceKey(key: string): string | undefined {
  return CHAIN_REFERENCES[key];
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
    case "plan-refresh":
      return planRefreshArms(role);
    case "reruns":
      return role === "beat" ? [{ arm: luna("medium", "chapterFullB"), samples: 2, scope: "single-player", beatType: "thread" }] : [];
    case "setup-retests":
      return setupRetestArms(role);
    case "groups":
      return groupRoundArms(role);
    case "form-gate":
      return formGateArms(role);
    case "final-check":
      return finalCheckArms(role);
    case "stage-scoping":
      return stageScopingArms(role);
    case "options-continuity":
      return optionsContinuityArms(role);
    case "options-o2":
      return optionsO2Arms(role);
    case "planner-v2e":
      // Planner v2e (coordinator, 2026-09-30) on Luna low, twice on every chapter-planning case, stored and built; planner
      // v2c, v2d and today's form read their stored records, and its switch planner is planner v2b's, so no switch case runs
      return role === "thread" ? [{ arm: luna("low", "planV2e"), samples: 2, scope: "all" }] : [];
    case "ending-state":
      return endingStateArms(role);
    case "runaway":
      return runawayArms(role);
    case "choice-result":
      return choiceResultArms(role);
    case "choice-line-sp":
      return choiceLineSpArms(role);
    case "outcome-settled":
      return outcomeSettledArms(role);
    case "recorded-result":
      return recordedResultArms(role);
    case "lever-direction":
      return leverDirectionArms(role);
    case "parallel-threads":
      return parallelThreadsArms(role);
    case "challenge-results":
      return challengeResultsArms(role);
    case "kids-turns":
      return kidsTurnsArms(role);
    case "money-adds-up":
      return moneyAddsUpArms(role);
    case "late-pacing":
      return latePacingArms(role);
    case "kids-ages":
      return kidsAgesArms(role);
    case "group-levers":
      return groupLeversArms(role);
    case "short-replies":
      return shortRepliesArms(role);
    default:
      return [];
  }
}

/**
 * The short-replies stage (the coordinator's brief of 2026-10-01, after the
 * second playthroughs: 13 of 126 first replies one short paragraph, 2 short
 * again after production's retry): production's turn (adopted) and the
 * variant (shortReplies) on each player count's turn model (Luna medium for
 * one player, Luna low for groups), twice on the stage's cases, interleaved,
 * under adopted18, each turn with production's one checked retry.
 */
function shortRepliesArms(role: EvalRole): ArmPlan[] {
  if (role !== "beat") return [];
  const variants = ["adopted", "shortReplies"] as const;
  return [
    ...variants.map((variant) => ({ arm: adoptedDefault("beat", variant), samples: 2, scope: "single-player" as const, caseIds: [...SHORT_REPLIES_CASES.single] })),
    ...variants.map((variant) => ({ arm: adoptedDefault("multiplayerBeat", variant), samples: 2, scope: "multiplayer" as const, caseIds: [...SHORT_REPLIES_CASES.groups] })),
  ];
}

/**
 * The group-levers stage (the coordinator's brief of 2026-10-01): production's
 * group turn (adopted) and the variant (groupLevers) on the group turn model
 * (Luna low), twice on the stage's group chapter steps, interleaved, under
 * adopted17, each turn with production's one checked retry; then its one
 * fix-and-retest (groupLeversB, the plan's lever question asked from the
 * player's line) on every case, once, and since it moved every target against
 * production on that sample, a second time, so the form to adopt is measured
 * as the run's was (the stage cap raised for its arm, the reason in
 * budget-overrides.jsonl).
 */
function groupLeversArms(role: EvalRole): ArmPlan[] {
  if (role !== "beat") return [];
  return (["adopted", "groupLevers", "groupLeversB"] as const).map((variant) => ({ arm: adoptedDefault("multiplayerBeat", variant), samples: 2, scope: "multiplayer" as const, caseIds: [...GROUP_LEVERS_CASES] }));
}

/**
 * The kids-ages stage (the owner's decision of 2026-10-01): production's turn
 * (adopted) and the variant (kidsAges) on each player count's turn model (Luna
 * medium for one player, Luna low for groups), twice on the stage's turn
 * cases, interleaved, under adopted16, each turn with production's one checked
 * retry (the variant's asks for its band's count); and production's custom
 * setup and the variant's on the setup model (Luna low), once each on the two
 * setups at 10.
 */
function kidsAgesArms(role: EvalRole): ArmPlan[] {
  const variants = ["adopted", "kidsAges"] as const;
  if (role === "beat") {
    return [
      ...variants.map((variant) => ({ arm: adoptedDefault("beat", variant), samples: 2, scope: "single-player" as const, caseIds: [...KIDS_AGES_CASES.single] })),
      ...variants.map((variant) => ({ arm: adoptedDefault("multiplayerBeat", variant), samples: 2, scope: "multiplayer" as const, caseIds: [...KIDS_AGES_CASES.groups] })),
    ];
  }
  if (role === "setup") return variants.map((variant) => ({ arm: adoptedDefault("setup", variant), samples: 1, scope: "all" as const, caseIds: [...KIDS_AGES_CASES.setups] }));
  return [];
}

/**
 * The prompt state of the late-pacing stage (2026-10-01, fix 8 of the second
 * playthroughs' review): production's own code, its requests unchanged since
 * the money-adds-up stage (adopted14), under a tag of its own so production
 * runs beside the variant in the same minutes; the short playthroughs' calls
 * (--late-pacing-play) are prep calls under it too.
 */
export const LATE_PACING_PROMPT_STATE = "adopted15";

/**
 * The stage's cases. The switch plans of the second round's stored runs
 * (latePacingCases.ts, no calls): the space pirates' switches at turns 14 and
 * 18, after the ship's integrity fell to the setup's threshold, where
 * production gave the complete ship a grouped thread while the scout's own
 * outcome waited; and the switches with a thread to spare where production's
 * last chapter then settled nothing (New Avalon's and the food trucks' at 20,
 * the estate agents' at 19). The stored endings the turn's payoff line is read
 * on, frozen by the outcome-settled stage.
 */
export const LATE_PACING_CASES = {
  switches: [
    "round-late-switch-space-pirates-t14",
    "round-late-switch-space-pirates-t18",
    "round-late-switch-avalon-t20",
    "round-late-switch-food-trucks-t20",
    "round-late-switch-estate-agents-t19",
  ],
  endings: ["round-settled-avalon-t26", "round-settled-lemonade-t11", "round-settled-space-pirates-t26", "round-settled-estate-agents-t26", "round-settled-food-trucks-t26"],
  // The fix-and-retest's case: the variant's own last switch in its food-trucks short playthrough (latePacingCases.ts)
  retest: ["round-late-switch-food-trucks-variant-t21"],
} as const;

/**
 * The late-pacing stage (the coordinator's fix 8 after the second
 * playthroughs' review): production's switch planner (adopted) and the
 * variant's (latePacing) on the planner model (Luna low, both player counts'
 * planner groups) twice on the switch cases, and their turns on each player
 * count's turn model twice on the stored endings, interleaved, under
 * adopted15. The short playthroughs are the --late-pacing-play mode's. The
 * fix-and-retest (latePacingB, its switch planner's step b naming the story's
 * instructions): twice on the stored switches, and production, the variant
 * and B four times each on the variant's own last switch in its food-trucks
 * short playthrough, where it gave the last thread to the complete contract.
 */
function latePacingArms(role: EvalRole): ArmPlan[] {
  const variants = ["adopted", "latePacing"] as const;
  if (role === "switch") {
    const switches = (variant: VariantId, samples: number, caseIds: readonly string[]) => ({ arm: adoptedDefault("analysis", variant), samples, scope: "all" as const, caseIds: [...caseIds] });
    return [
      ...variants.map((variant) => switches(variant, 2, LATE_PACING_CASES.switches)),
      switches("latePacingB", 2, LATE_PACING_CASES.switches),
      ...(["adopted", "latePacing", "latePacingB"] as const).map((variant) => switches(variant, 4, LATE_PACING_CASES.retest)),
    ];
  }
  if (role !== "beat") return [];
  const endings = [...LATE_PACING_CASES.endings];
  return [
    ...variants.map((variant) => ({ arm: adoptedDefault("beat", variant), samples: 2, scope: "single-player" as const, caseIds: endings })),
    ...variants.map((variant) => ({ arm: adoptedDefault("multiplayerBeat", variant), samples: 2, scope: "multiplayer" as const, caseIds: endings })),
  ];
}

/**
 * The prompt state of the money-adds-up stage (2026-10-01, fix 7 of the second
 * playthroughs' review): production's own code since the kids-turns stage's
 * adoption (a single player's read-with-kids turn; every other turn request is
 * adopted13's byte for byte), under a tag of its own so production's turn runs
 * beside the variant in the same minutes.
 */
export const MONEY_ADDS_UP_PROMPT_STATE = "adopted14";

/**
 * The stage's cases: turns of the second round's lemonade story, the one
 * stored learning story that counts money (moneyAddsUpCases.ts, no calls), each
 * recorded as a story from the learn-something form. Where its ledger broke:
 * the step after the fruit sacrifice (turn 3: the sleeves and the sales never
 * reached the cashbox), the switch turn after (turn 4: the margin raised as a
 * reward) and the ending (turn 11); beside them the turns where money was only
 * quoted (2, 6) or paid and counted (8).
 */
export const MONEY_ADDS_UP_CASES = [
  "round-money-lemonade-t2",
  "round-money-lemonade-t3",
  "round-money-lemonade-t4",
  "round-money-lemonade-t6",
  "round-money-lemonade-t8",
  "round-money-lemonade-t11",
] as const;

/**
 * The cases where production's ledger broke in the run (the step after the
 * fruit sacrifice, sales never counted; the switch turn after, the margin
 * raised by its after-chapter step), which the fix-and-retest plays twice.
 */
export const MONEY_ADDS_UP_RETEST_CASES = ["round-money-lemonade-t3", "round-money-lemonade-t4"] as const;

/**
 * The money-adds-up stage (the coordinator's fix 7 after the second
 * playthroughs' review): production's turn (adopted) and the variant
 * (moneyAddsUp) on the single-player turn model (Luna medium), twice on the
 * stage's cases, interleaved, under adopted14; then its one fix-and-retest
 * (moneyAddsUpB) twice where production's ledger broke and once on the rest.
 */
function moneyAddsUpArms(role: EvalRole): ArmPlan[] {
  if (role !== "beat") return [];
  const rest = MONEY_ADDS_UP_CASES.filter((id) => !(MONEY_ADDS_UP_RETEST_CASES as readonly string[]).includes(id));
  return [
    ...(["adopted", "moneyAddsUp"] as const).map((variant) => ({ arm: adoptedDefault("beat", variant), samples: 2, scope: "single-player" as const, caseIds: [...MONEY_ADDS_UP_CASES] })),
    { arm: adoptedDefault("beat", "moneyAddsUpB"), samples: 2, scope: "single-player" as const, caseIds: [...MONEY_ADDS_UP_RETEST_CASES] },
    { arm: adoptedDefault("beat", "moneyAddsUpB"), samples: 1, scope: "single-player" as const, caseIds: rest },
  ];
}

/**
 * The prompt state of the kids-turns stage (2026-10-01, fix 6 of the second
 * playthroughs' review): production's own code since the challenge-results
 * stage's adoption (the chapter planner's edits; every turn request is
 * adopted7's byte for byte), under a tag of its own so production's turn runs
 * beside the variant in the same minutes, each with its one checked retry.
 */
export const KIDS_TURNS_PROMPT_STATE = "adopted13";

/**
 * The stage's cases: the second round's mouse story, read with a five-year-old
 * (kidsTurnCases.ts, no calls: its first turn, a challenge chapter's opening
 * and step, a switch turn after it, an exploration step and the ending, each
 * recorded as the game records a read-with-kids story, its category and the
 * child's age), where every turn ran about 300 words of grown-up prose; and a
 * template tagged Kids, which records no age (its frozen first turn, with
 * images), beside them.
 */
export const KIDS_TURNS_CASES = {
  mouse: ["round-kids-mouse-t1", "round-kids-mouse-t2", "round-kids-mouse-t3", "round-kids-mouse-t5", "round-kids-mouse-t7", "round-kids-mouse-t11"],
  template: ["first-tpl-54a4e23b-p1"],
} as const;

/**
 * The kids-turns stage (the coordinator's fix 6 after the second playthroughs'
 * review): production's turn (adopted) and the variant (kidsTurn) on the
 * single-player turn model (Luna medium), twice on the stage's cases,
 * interleaved, under adopted13, each turn with production's one checked retry
 * of a one-paragraph or option-less first reply (the variant's retry asks for
 * its short count).
 */
function kidsTurnsArms(role: EvalRole): ArmPlan[] {
  if (role !== "beat") return [];
  const caseIds = [...KIDS_TURNS_CASES.mouse, ...KIDS_TURNS_CASES.template];
  return (["adopted", "kidsTurn"] as const).map((variant) => ({ arm: adoptedDefault("beat", variant), samples: 2, scope: "single-player" as const, caseIds }));
}

/**
 * The prompt state of the challenge-results stage (2026-10-01, fix 5 of the
 * second playthroughs' review): production's own code since the
 * parallel-threads stage's adoption (the switch planner's last-stage line;
 * the chapter planner's requests are adopted11's byte for byte), under a tag
 * of its own so production's chapter planner runs beside the variant in the
 * same minutes.
 */
export const CHALLENGE_RESULTS_PROMPT_STATE = "adopted12";

/**
 * The stage's cases, built from the second round's stored runs
 * (challengeResultsCases.ts, no calls), by player count: chapter plans whose
 * challenge or contest results told how the player acts (most after a flavor
 * switch, whose chosen approach they restate), and beside them ordinary ones
 * whose results passed.
 */
export const CHALLENGE_RESULTS_CASES = {
  single: ["round-results-lemonade-t2", "round-results-avalon-t2", "round-results-kids-mouse-t9", "round-results-avalon-t21", "round-results-kids-mouse-t2"],
  groups: [
    "round-results-food-trucks-t2",
    "round-results-food-trucks-t6",
    "round-results-food-trucks-t9",
    "round-results-food-trucks-t21",
    "round-results-space-pirates-t2",
    "round-results-space-pirates-t19",
    "round-results-space-pirates-t6",
    "round-results-estate-agents-t2",
    "round-results-estate-agents-t16",
    "round-results-estate-agents-t23",
  ],
} as const;

/**
 * The challenge-results stage (the coordinator's fix 5 after the second
 * playthroughs' review): production's chapter planner (adopted) and the
 * variant (resultsAsOutcomes) on the planner model (Luna low, which the
 * single-player and group planners share), twice on the stage's cases,
 * interleaved, under adopted12.
 */
function challengeResultsArms(role: EvalRole): ArmPlan[] {
  if (role !== "thread") return [];
  const caseIds = [...CHALLENGE_RESULTS_CASES.single, ...CHALLENGE_RESULTS_CASES.groups];
  return (["adopted", "resultsAsOutcomes"] as const).map((variant) => ({ arm: adoptedDefault("analysis", variant), samples: 2, scope: "all" as const, caseIds }));
}

/**
 * The prompt state of the parallel-threads stage (2026-10-01, fix 4 of the
 * second playthroughs' review): production's own code, unchanged since the
 * lever-direction stage, under a tag of its own so production runs beside the
 * variant in the same minutes.
 */
export const PARALLEL_THREADS_PROMPT_STATE = "adopted11";

/**
 * The stage's cases, built from the second round's stored runs
 * (parallelThreadsCases.ts, no calls). The switch plans before a contest's
 * last stage: the space pirates' switch at turn 9 (the treasure claim, which
 * the scout then took alone) and the estate agents' at turn 12 (the sale,
 * Nia alone), where production offered it as one direction among others and
 * one side took it; the food trucks' at turn 16 (the contract), offered the
 * same way, where both players happened to take it. The chapter openings
 * with parallel threads: the space pirates' turn 10 (three threads in three
 * places, the ship at the docks and in the pylons at once, the converted
 * contest) and the estate agents' turn 13 (the sale's last stage for Nia
 * alone, the buyer later in two places), where the defect happened, and the
 * food trucks' turn 13 (two owners in their own places), an ordinary one.
 */
export const PARALLEL_THREADS_CASES = {
  switches: ["round-parallel-switch-space-pirates-t9", "round-parallel-switch-estate-agents-t12", "round-parallel-switch-food-trucks-t16"],
  chapters: ["round-parallel-space-pirates-t10", "round-parallel-estate-agents-t13", "round-parallel-food-trucks-t13"],
} as const;

/**
 * The parallel-threads stage (the coordinator's fix 4 after the second
 * playthroughs' review): production's group switch planner (adopted) and the
 * variant's (parallelThreads) on the group planner model (Luna low), twice on
 * the stage's switch cases, interleaved, under adopted11. Its chapter
 * openings run as chains (pipelinePlans): each side's chapter planner into its
 * own group turn.
 */
function parallelThreadsArms(role: EvalRole): ArmPlan[] {
  if (role !== "switch") return [];
  return (["adopted", "parallelThreads"] as const).map((variant) => ({
    arm: adoptedDefault("multiplayerAnalysis", variant),
    samples: 2,
    scope: "multiplayer" as const,
    caseIds: [...PARALLEL_THREADS_CASES.switches],
  }));
}

/**
 * The prompt state of the lever-direction stage (2026-09-30, fix 3 of the
 * second playthroughs' review): production's own code, unchanged since the
 * recorded-result stage, under a tag of its own so production's setup runs
 * beside the variant in the same minutes.
 */
export const LEVER_DIRECTION_PROMPT_STATE = "adopted10";

/** The mouse story's setup, read with a five-year-old at ten turns (leverDirectionCases.ts): the second round's premise and length. */
export const LEVER_MOUSE_CASE = "round-setup-kids-mouse";

/**
 * The stage's setup premises. Where the defect happened: the mouse story (the
 * second round's Cat's Nearness, a sacrifice that moved the cat away) and New
 * Avalon (the round's Heartwell Feedback; its frozen premise sends the round's
 * request); the bounty hunters, Casablanca and the secret society, where
 * production's stored setups wrote a pressure's levers backwards (Dust and
 * Danger, Pursuit Pressure, Family Pressure, Eclipse Strain); beside them the
 * emergency-room doctor, whose stored setups wrote Department Strain and
 * Hospital Oversight the right way. Every player count; a story read with a
 * child.
 */
export const LEVER_DIRECTION_CASES = [
  LEVER_MOUSE_CASE,
  "setup-custom-avalon",
  "setup-pretend-er-doctor",
  "setup-fiction-bounty-hunters",
  "setup-future-casablanca",
  "setup-flexible-secret-society",
];

/**
 * The lever-direction stage (the coordinator's fix 3 after the second
 * playthroughs' review): production's custom-story setup (adopted) and the
 * variant (leverDirection) on the setup group's model (Luna low), twice on the
 * stage's premises, interleaved, under adopted10.
 */
function leverDirectionArms(role: EvalRole): ArmPlan[] {
  if (role !== "setup") return [];
  return (["adopted", "leverDirection"] as const).map((variant) => ({ arm: adoptedDefault("setup", variant), samples: 2, scope: "all" as const, caseIds: [...LEVER_DIRECTION_CASES] }));
}

/**
 * The prompt state of the kids-ages stage (2026-10-01): production's own code
 * since the owner's decisions of that day (only what was played gets a
 * milestone at the ending, the owner's roll, the cooperative contest, the
 * lever-direction setup, the read-with-kids setting recorded as kidAges),
 * under a tag no earlier stage used: its endings and setups differ from what
 * adopted15 and earlier recorded.
 */
export const KIDS_AGES_PROMPT_STATE = "adopted16";

/** The ages the stage reads, one per band (the youngest child's: 3-5, 6-8, 9-12). */
export const KIDS_AGES = [4, 7, 10] as const;

/** A single player's ages: at 7 (6-8) the variant is production's kids turn byte for byte, so it runs only at 4 and 10. */
export const KIDS_AGES_SINGLE = [4, 10] as const;

/** The kids-turns stage's frozen mouse turns, which the stage records at its single-player ages. */
export const KIDS_AGES_MOUSE_SOURCES = KIDS_TURNS_CASES.mouse;

/** The setups' premises (the mouse story's, and the two-player animal rescue's), read with a child aged 10. */
export const KIDS_AGES_SETUP_SOURCES = { mouse: LEVER_MOUSE_CASE, rescue: "setup-kids-animal-rescue" } as const;

/** Below 9 the variant's setup is production's kids setup byte for byte, so the setups run at 10 only. */
export const KIDS_AGES_SETUP_AGE = 10;

export const kidsAgesMouseId = (source: string, age: number) => `${source.replace("round-kids-mouse-", "round-kids-ages-mouse-")}-a${age}`;
export const kidsAgesGroupId = (turn: "first" | "switch", age: number) => `round-kids-ages-rescue-${turn}-a${age}`;
export const kidsAgesSetupId = (premise: keyof typeof KIDS_AGES_SETUP_SOURCES, age: number) => `round-setup-kids-ages-${premise}-a${age}`;

/**
 * The stage's cases (kidsAgesCases.ts, no calls): the mouse story's six turns
 * read with a child aged 4 and 10; the two-player animal rescue's first turn
 * and switch turn (setup round 3's chain) read with a child aged 4, 7 and 10;
 * and the two setups at 10.
 */
export const KIDS_AGES_CASES = {
  single: KIDS_AGES_SINGLE.flatMap((age) => KIDS_AGES_MOUSE_SOURCES.map((source) => kidsAgesMouseId(source, age))),
  groups: KIDS_AGES.flatMap((age) => (["first", "switch"] as const).map((turn) => kidsAgesGroupId(turn, age))),
  setups: (Object.keys(KIDS_AGES_SETUP_SOURCES) as (keyof typeof KIDS_AGES_SETUP_SOURCES)[]).map((premise) => kidsAgesSetupId(premise, KIDS_AGES_SETUP_AGE)),
};

/**
 * The prompt state of the group-levers stage (2026-10-01): production's own
 * code since the kids-ages adoption (whose review changed no request), under a
 * tag no earlier stage used, so production runs beside the variant in the
 * same minutes.
 */
export const GROUP_LEVERS_PROMPT_STATE = "adopted17";

/**
 * The stage's cases (groupLeversCases.ts, no calls): group chapter steps of
 * the second round's three group stories where a player is in a challenge or
 * contest thread: chapter openings and later steps, a shared contest, shared
 * and own challenges, a player exploring beside the others, a player whose
 * computed line gives none (the pirates' pilot after Ship Integrity), one
 * whose line names the other kind.
 */
export const GROUP_LEVERS_CASES = [
  "round-levers-food-trucks-t2",
  "round-levers-food-trucks-t10",
  "round-levers-food-trucks-t13",
  "round-levers-food-trucks-t15",
  "round-levers-food-trucks-t21",
  "round-levers-estate-agents-t10",
  "round-levers-estate-agents-t16",
  "round-levers-estate-agents-t20",
  "round-levers-space-pirates-t2",
  "round-levers-space-pirates-t10",
  "round-levers-space-pirates-t12",
  "round-levers-space-pirates-t16",
] as const;

/**
 * The prompt state of the short-replies stage (2026-10-01): production's own
 * code since the group-levers adoption, under a tag no earlier stage used, so
 * production runs beside the variant in the same minutes.
 */
export const SHORT_REPLIES_PROMPT_STATE = "adopted18";

/**
 * The second round's short turns no stage had frozen (shortRepliesCases.ts, no
 * calls): New Avalon's chapter openings at turns 2 and 24, its switch turns at 8
 * and 12 and its exploration step at 14, and the food trucks' first turn (both
 * players short, and short again after the retry).
 */
export const SHORT_REPLIES_BUILT_CASES = [
  "round-short-avalon-t2",
  "round-short-avalon-t8",
  "round-short-avalon-t12",
  "round-short-avalon-t14",
  "round-short-avalon-t24",
  "round-short-food-trucks-t1",
] as const;

/**
 * The stage's cases, by the turn model that plays them. The second round's
 * short turns: the built ones and those earlier stages froze (the mouse
 * story's step 3 and switch turn 5, the switch turn short again after the
 * retry; the food trucks' chapter opening 21 and ending 26; the space pirates'
 * step 16; the estate agents' switch turn 15; their switch turn 22 follows the
 * owner's roll at 21, so its stored state is not production's story). The
 * stored turns that came back short most often over the earlier stages
 * (synth-8988006e-t3's step, 13 of 56; the first playthroughs' New Avalon turns
 * 6 and 11, 3 and 2 of 11; the lemonade story's switch turn 4 and step 6, 2 of
 * 6 and 2 of 5, and its ending, 2 of 9; the space pirates' step 25, 2 of 4).
 * Ordinary ones, never short over 5 or 6 earlier replies each: New Avalon's
 * switch turn 23, the lemonade story's chapter opening 2, the estate agents'
 * step 10 and the space pirates' first chapter opening.
 */
export const SHORT_REPLIES_CASES = {
  single: [
    "round-short-avalon-t2",
    "round-short-avalon-t8",
    "round-short-avalon-t12",
    "round-short-avalon-t14",
    "round-short-avalon-t24",
    "round-kids-mouse-t3",
    "round-kids-mouse-t5",
    "synth-8988006e-t3-pregeneration_2_player1_1-noimg",
    "round-choice-avalon-t6",
    "round-choice-avalon-t11",
    "round-money-lemonade-t4",
    "round-money-lemonade-t6",
    "round-settled-lemonade-t11",
    "round-settled-avalon-t23",
    "round-money-lemonade-t2",
  ],
  groups: [
    "round-short-food-trucks-t1",
    "round-levers-food-trucks-t21",
    "round-settled-food-trucks-t26",
    "round-levers-space-pirates-t16",
    "round-settled-estate-agents-t15",
    "round-recorded-space-pirates-t25",
    "round-levers-estate-agents-t10",
    "round-levers-space-pirates-t2",
  ],
} as const;

/**
 * The prompt state of the recorded-result stage (2026-09-30, fix 2 of the
 * second playthroughs' review): production's own code, unchanged since the
 * outcome-settled stage (every turn request is adopted7's byte for byte),
 * under a tag of its own so production runs beside the variant in the same
 * minutes.
 */
export const RECORDED_RESULT_PROMPT_STATE = "adopted9";

/**
 * The stage's cases, built from the second round's stored runs
 * (recordedResultCases.ts, no calls), by the turn model that plays them: turns
 * that narrate an exploration step's recorded result where the player changed
 * direction from the step before. Where the defect happened: food trucks turn
 * 23 (the chosen result told as the earlier one, the milestone a blend);
 * beside it ordinary ones, switch turns and chapter steps.
 */
export const RECORDED_RESULT_CASES = {
  single: ["round-recorded-lemonade-t7", "round-recorded-avalon-t11", "round-recorded-avalon-t16", "round-recorded-kids-mouse-t8"],
  groups: ["round-recorded-food-trucks-t23", "round-recorded-space-pirates-t14", "round-recorded-space-pirates-t25", "round-recorded-estate-agents-t15"],
} as const;

/**
 * The recorded-result stage (the coordinator's fix 2 after the second
 * playthroughs' review): production's turn (adopted) and the variant
 * (recordedResult) on each player count's own turn group (Luna medium for one
 * player, Luna low for groups), twice on the stage's cases, interleaved, under
 * adopted9.
 */
function recordedResultArms(role: EvalRole): ArmPlan[] {
  if (role !== "beat") return [];
  return [
    ...(["adopted", "recordedResult"] as const).map((variant) => ({ arm: adoptedDefault("beat", variant), samples: 2, scope: "single-player" as const, caseIds: [...RECORDED_RESULT_CASES.single] })),
    ...(["adopted", "recordedResult"] as const).map((variant) => ({ arm: adoptedDefault("multiplayerBeat", variant), samples: 2, scope: "multiplayer" as const, caseIds: [...RECORDED_RESULT_CASES.groups] })),
  ];
}

/**
 * The prompt state of the outcome-settled stage (2026-09-30, the second
 * playthroughs' review): production's own code since that review's fix
 * (leverChargedAgain, a beat repair; every turn request is adopted7's byte for
 * byte), under a tag of its own so production runs beside the variant in the
 * same minutes.
 */
export const OUTCOME_SETTLED_PROMPT_STATE = "adopted8";

/**
 * The stage's cases, built from the second round's stored runs
 * (outcomeSettledCases.ts, no calls), by the turn model that plays them:
 * switch turns whose milestones complete an outcome and endings. Where the
 * defect happened: New Avalon's turn 16 (a stat set against the completing
 * milestone) and its ending, the space pirates' turn 14 (the completed claim
 * told and recorded as open) and its ending, the estate agents' ending; beside
 * them ordinary ones.
 */
export const OUTCOME_SETTLED_CASES = {
  single: ["round-settled-avalon-t16", "round-settled-lemonade-t4", "round-settled-kids-mouse-t5", "round-settled-avalon-t23", "round-settled-avalon-t26", "round-settled-lemonade-t11"],
  groups: [
    "round-settled-space-pirates-t14",
    "round-settled-estate-agents-t15",
    "round-settled-food-trucks-t20",
    "round-settled-space-pirates-t26",
    "round-settled-estate-agents-t26",
    "round-settled-food-trucks-t26",
  ],
} as const;

/** The stage's switch turns, by turn model: where the retest's settled line differs from the run's. */
export const OUTCOME_SETTLED_SWITCH_CASES = {
  single: OUTCOME_SETTLED_CASES.single.filter((id) => !id.endsWith("-t26") && !id.endsWith("-t11")),
  groups: OUTCOME_SETTLED_CASES.groups.filter((id) => !id.endsWith("-t26")),
};

/**
 * The outcome-settled stage (the coordinator's fix 1 after the second
 * playthroughs' review): production's turn (adopted) and the variant
 * (outcomeSettled) on each player count's own turn group (Luna medium for one
 * player, Luna low for groups), twice on the stage's cases, interleaved, under
 * adopted8. Then the one fix-and-retest (outcomeSettledB: the completing
 * milestone kept specific, after the run's milestones copied the plan's
 * words), twice on the switch turns, where its settled line differs, and once
 * on the endings, where only its ending line does; what the stage has left.
 */
function outcomeSettledArms(role: EvalRole): ArmPlan[] {
  if (role !== "beat") return [];
  const endings = { single: OUTCOME_SETTLED_CASES.single.filter((id) => !OUTCOME_SETTLED_SWITCH_CASES.single.includes(id)), groups: OUTCOME_SETTLED_CASES.groups.filter((id) => !OUTCOME_SETTLED_SWITCH_CASES.groups.includes(id)) };
  return [
    ...(["adopted", "outcomeSettled"] as const).map((variant) => ({ arm: adoptedDefault("beat", variant), samples: 2, scope: "single-player" as const, caseIds: [...OUTCOME_SETTLED_CASES.single] })),
    ...(["adopted", "outcomeSettled"] as const).map((variant) => ({ arm: adoptedDefault("multiplayerBeat", variant), samples: 2, scope: "multiplayer" as const, caseIds: [...OUTCOME_SETTLED_CASES.groups] })),
    { arm: adoptedDefault("beat", "outcomeSettledB"), samples: 2, scope: "single-player" as const, caseIds: [...OUTCOME_SETTLED_SWITCH_CASES.single] },
    { arm: adoptedDefault("multiplayerBeat", "outcomeSettledB"), samples: 2, scope: "multiplayer" as const, caseIds: [...OUTCOME_SETTLED_SWITCH_CASES.groups] },
    { arm: adoptedDefault("beat", "outcomeSettledB"), samples: 1, scope: "single-player" as const, caseIds: endings.single },
    { arm: adoptedDefault("multiplayerBeat", "outcomeSettledB"), samples: 1, scope: "multiplayer" as const, caseIds: endings.groups },
  ];
}

/**
 * The prompt state of the choice-line-sp stage (2026-09-30): production's own
 * code since the choice-result stage's adoption (planner v2f, the exploration
 * line on group turns), whose single-player turn requests are adopted5's byte
 * for byte, under a tag of its own so production runs beside the variant in the
 * same minutes, each with its one checked retry.
 */
export const CHOICE_LINE_SP_PROMPT_STATE = "adopted6";

/**
 * The choice-line-sp stage (the coordinator's brief of 2026-09-30, after the
 * choice-result run): the exploration-order line for a single player, with
 * production's one retry of a turn that comes back as one short paragraph in
 * the loop as its safety net (stageChecksTurns). Production's turn (adopted)
 * and the line (choiceResult, whose single-player request is production's turn
 * with the line) on Luna medium, twice on the choice-result run's ten
 * single-player exploration steps, interleaved, under adopted6.
 */
function choiceLineSpArms(role: EvalRole): ArmPlan[] {
  if (role !== "beat") return [];
  const single = [...CHOICE_RESULT_STORED_CASES, ...CHOICE_RESULT_BUILT_CASES.single];
  return (["adopted", "choiceResult"] as const).map((variant) => ({ arm: adoptedDefault("beat", variant), samples: 2, scope: "single-player" as const, caseIds: single }));
}

/**
 * The prompt state of the second round of playthroughs (playthroughs-2,
 * 2026-09-30): production's own code since the single-player exploration
 * line's adoption (2db5134) and the failed turn's resend and notice (ed48f48,
 * fe31dc0, ead6e86), under a tag no earlier stage used, so no call of round 1
 * (adopted4) is reused for a request today's code builds differently.
 */
export const PLAYTHROUGHS_2_PROMPT_STATE = "adopted7";

/** Stages whose turns carry production's one checked retry (a text of one paragraph, a beat without options) as a second step. */
const CHECKED_TURN_STAGES: Stage[] = ["choice-line-sp", "kids-turns", "kids-ages", "group-levers", "short-replies"];

export function stageChecksTurns(stage: Stage): boolean {
  return CHECKED_TURN_STAGES.includes(stage);
}

/**
 * The prompt states of the choice-result stage (2026-09-30). The turns:
 * production's own code since the playthroughs' no-call fixes (its beat
 * requests are adopted4's byte for byte; the fixes changed the repairs, the
 * plan check and the queue, not a request), under a tag of their own so
 * production runs beside the variant in the same minutes. The planners: round0,
 * where planner v2e's two samples on every chapter-planning case are stored
 * (production's chapter planner is planner v2e byte for byte, and today's code
 * rebuilds those requests), so planner v2f reads against them on the same
 * pairs, and planner v2e runs beside it on the built plans under the same tag.
 */
export const CHOICE_RESULT_PROMPT_STATE = "adopted5";
export const CHOICE_RESULT_PLANNER_PROMPT_STATE = "round0";

/** The stored exploration steps: the café's exploration chapter opening and its second step (round-built from a stored reply), the only two. */
export const CHOICE_RESULT_STORED_CASES = ["cont-checkpoi-t1-o2", "round-beat-exploration-checkpoi-t2"];

/**
 * The cases built from the playthroughs' stored runs (choiceResultCases.ts, no
 * calls): exploration steps where production's options carried out another
 * result or none (New Avalon turns 6 and 14, lemonade turn 6; the groups' food
 * trucks turns 14 and 17 and space pirates turn 14) and, beside them, steps
 * where they matched (New Avalon turns 7, 10, 11 and 16, lemonade turn 9); and
 * the chapter plans whose challenge or contest results said what the player
 * does (New Avalon turns 18 and 22, food trucks turn 10) or whose exploration
 * results said how others respond (food trucks turn 17), with a plan whose
 * results were outcomes beside them (New Avalon turn 2).
 */
export const CHOICE_RESULT_BUILT_CASES = {
  single: [
    "round-choice-avalon-t6",
    "round-choice-avalon-t7",
    "round-choice-avalon-t10",
    "round-choice-avalon-t11",
    "round-choice-avalon-t14",
    "round-choice-avalon-t16",
    "round-choice-lemonade-t6",
    "round-choice-lemonade-t9",
  ],
  groups: ["round-choice-food-trucks-t14", "round-choice-food-trucks-t17", "round-choice-space-pirates-t14"],
  plans: ["round-choice-plan-avalon-t2", "round-choice-plan-avalon-t18", "round-choice-plan-avalon-t22", "round-choice-plan-food-trucks-t10", "round-choice-plan-food-trucks-t17"],
} as const;

/** Every other chapter-planning case (stored and built for the earlier rounds), where planner v2e's two samples are stored under round0. */
export const CHOICE_RESULT_STORED_PLAN_CASES = [
  "thread-8988006e-t5-o0",
  "thread-8988006e-t5-o1",
  "thread-8988006e-t5-o2",
  "thread-checkpoi-t1-o0",
  "thread-checkpoi-t1-o1",
  "thread-checkpoi-t1-o2",
  "thread-tpl-321db503-p2-t1",
  "thread-tpl-965413e1-p3-t1",
  "thread-tpl-fe7b68c7-p2-t1",
  "thread-tpl-f0ca783b-p2-t1",
  "thread-tpl-4546b046-p2-t1",
  "thread-tpl-2fe196a3-p2-t1",
  "thread-tpl-54a4e23b-p1-t1",
  "thread-tpl-5e1c4d83-p1-t1",
  "thread-tpl-e401abf2-p1-t1",
  "round-thread-short10-8988006e-t5",
  "round-thread-long20-8988006e-t5",
  "round-thread-neonate-feeding-t1",
  "round-thread-mp-965413e1-p3-t5",
  "round-thread-first-8988006e-t1",
  "round-thread-last4-8988006e-t5",
  "round-thread-last2-8988006e-t5",
  "round-thread-last4-mp-965413e1-p3-t5",
];

/**
 * The choice-result stage (the coordinator's brief of 2026-09-30, after the
 * playthroughs): production's turn (adopted) and the exploration-order turn
 * (choiceResult) on each player count's own turn model, twice on the
 * exploration steps, interleaved, under adopted5; planner v2e and planner v2f
 * on Luna low, twice on the built chapter plans, and planner v2f once on every
 * other chapter-planning case, under round0 beside planner v2e's stored plans.
 * The turns run with --role beat under adopted5, the planners with --role
 * thread under round0.
 */
function choiceResultArms(role: EvalRole): ArmPlan[] {
  if (role === "beat") {
    const single = [...CHOICE_RESULT_STORED_CASES, ...CHOICE_RESULT_BUILT_CASES.single];
    const groups = [...CHOICE_RESULT_BUILT_CASES.groups];
    return [
      ...(["adopted", "choiceResult"] as const).map((variant) => ({ arm: adoptedDefault("beat", variant), samples: 2, scope: "single-player" as const, caseIds: single })),
      ...(["adopted", "choiceResult"] as const).map((variant) => ({ arm: adoptedDefault("multiplayerBeat", variant), samples: 2, scope: "multiplayer" as const, caseIds: groups })),
      // The one fix-and-retest (after the run: 3 of the variant's 20 single-player replies one short paragraph), twice on
      // the single-player steps, where they fell
      { arm: adoptedDefault("beat", "choiceResultB"), samples: 2, scope: "single-player" as const, caseIds: single },
    ];
  }
  if (role === "thread") {
    const plans = [...CHOICE_RESULT_BUILT_CASES.plans];
    return [
      { arm: luna("low", "planV2e"), samples: 2, scope: "all", caseIds: plans },
      { arm: luna("low", "planV2f"), samples: 2, scope: "all", caseIds: plans },
      { arm: luna("low", "planV2f"), samples: 1, scope: "all", caseIds: CHOICE_RESULT_STORED_PLAN_CASES },
    ];
  }
  return [];
}

/**
 * The prompt state of the runaway replay (2026-09-30): production's own code
 * since the ending's adoption (6b4908a), under a tag of its own so production's
 * three samples run beside the fix in the same minutes. Production's request on
 * the runaway case is adopted2's byte for byte (a test holds its hash), whose
 * records are the run that saw it run away.
 */
export const RUNAWAY_PROMPT_STATE = "adopted4";

/**
 * The runaway case: story 8988006e's switch turn after its first chapter, the
 * player's last choice a sacrifice that released the exposé, the switch a
 * flavor switch on "the immediate fallout of exposing" the Waste Ring.
 * Production's exact request ran away 3 times in 4 first tries there on 30
 * September and in none of 2 on 28 September; over every form with the
 * reminder, 4 of 17 first tries ever, all four within 20 minutes on 30
 * September.
 */
export const RUNAWAY_CASES = ["cont-8988006e-t4-o1"];
export const RUNAWAY_SAMPLES = 3;

/**
 * The runaway replay (the coordinator's brief of 2026-09-30): production's
 * request and the suspected cause fixed (noSwitchReminder: the switch
 * configuration's reminder left out on a switch turn) on Luna medium,
 * production's single-player turn model, three times each on the runaway case,
 * interleaved.
 */
function runawayArms(role: EvalRole): ArmPlan[] {
  if (role !== "beat") return [];
  return (["adopted", "noSwitchReminder"] as const).map((variant) => ({
    arm: adoptedDefault("beat", variant),
    samples: RUNAWAY_SAMPLES,
    scope: "single-player" as const,
    source: "stored" as const,
    caseIds: RUNAWAY_CASES,
  }));
}

/**
 * The prompt state of the ending's run (2026-09-30): adopted2, whose records
 * hold production's own ending twice on the three stored endings (the options
 * and continuity run). Production's beat code is unchanged since then (only
 * its chapter planner moved, planner v2e), so its ending requests are
 * adopted2's byte for byte, and those two samples serve as production's
 * without being sent again; production runs beside the variant on the built
 * endings in the same hour.
 */
export const ENDING_STATE_PROMPT_STATE = "adopted2";

/** The stored endings: Novi Reg after its first chapter, every outcome unfinished (the Waste Ring 1 of 3 with the ending's milestone). */
export const ENDING_STATE_STORED_CASES = ["end-8988006e-t4-o0", "end-8988006e-t4-o1", "end-8988006e-t4-o2"];

/**
 * The endings built for the run (endingCases.ts, no calls): a single player
 * with one outcome complete and two unfinished; a two-player contest complete
 * and the same contest unfinished; three players in two camps, a cooperative
 * outcome complete and the camps' contest unfinished.
 */
export const ENDING_STATE_BUILT_CASES = {
  single: ["round-end-complete-8988006e-t8"],
  groups: ["round-end-contest-complete-bounty-t4", "round-end-contest-unfinished-bounty-t4", "round-end-camps-cofounders-t4"],
} as const;

/**
 * The ending's run (the coordinator's brief of 2026-09-30, the owner's decision
 * that each outcome is told as its milestones leave it): production's ending
 * (adopted) and the variant on each player count's own turn group, twice on
 * the stored and built endings, interleaved. The variant runs as endingStateB,
 * the smoke's draft (endingState, two records) with its one fix; the draft is
 * not planned again.
 */
function endingStateArms(role: EvalRole): ArmPlan[] {
  if (role !== "beat") return [];
  const single = [...ENDING_STATE_STORED_CASES, ...ENDING_STATE_BUILT_CASES.single];
  const groups = [...ENDING_STATE_BUILT_CASES.groups];
  return [
    ...(["adopted", "endingStateB"] as const).map((variant) => ({ arm: adoptedDefault("beat", variant), samples: 2, scope: "single-player" as const, caseIds: single })),
    ...(["adopted", "endingStateB"] as const).map((variant) => ({ arm: adoptedDefault("multiplayerBeat", variant), samples: 2, scope: "multiplayer" as const, caseIds: groups })),
  ];
}

/**
 * The prompt state of the options and continuity run (2026-09-30):
 * production's own code, which builds the requests adopted1 recorded byte for
 * byte (only the beat repair changed since, 2f24e1e), under a tag of its own so
 * production's form runs at samples 1 and 2 beside the three arms in the same
 * hour, and the form gate's and the final check's readings stay as they ran.
 */
export const OPTIONS_CONTINUITY_PROMPT_STATE = "adopted2";

/**
 * The options and continuity arms (the owner's feedback of 2026-09-30,
 * coordinator's brief): production's single-player turn form (adopted) and
 * arms O, C and OC on it, on Luna medium, production's single-player turn
 * model, twice on the 44 stored single-player turns, interleaved
 * (stageInterleavesArms), so every arm meets the same server pace. Then arm
 * O's one fix-and-retest (turnOb), once on OPTIONS_CONTINUITY_RETEST_CASES.
 */
function optionsContinuityArms(role: EvalRole): ArmPlan[] {
  if (role !== "beat") return [];
  const arms: ArmPlan[] = (["adopted", "turnO", "turnC", "turnOC"] as const).map((variant) => ({
    arm: adoptedDefault("beat", variant),
    samples: 2,
    scope: "single-player" as const,
    source: "stored" as const,
  }));
  return [...arms, { arm: adoptedDefault("beat", "turnOb"), samples: 1, scope: "single-player", source: "stored", caseIds: OPTIONS_CONTINUITY_RETEST_CASES }];
}

/**
 * Where arm O's fix-and-retest runs (after the run of 2026-09-30): the rolled
 * chapter steps of the two Novi Reg stories (8988006e and 7492b211), whose
 * stats are Technical and Creative skills, where arm O's options named their
 * stat ("Use your Technical skill to…" / "Use your Creative skill to…") and more
 * sets opened with the same word; 21 cases, once, what the stage has left.
 */
export const OPTIONS_CONTINUITY_RETEST_CASES = [
  "cont-7492b211-t2-o0",
  "cont-7492b211-t2-o1",
  "cont-7492b211-t2-o2",
  "synth-7492b211-t2-pregeneration_1_player1_1-noimg",
  "cont-8988006e-t2-o0",
  "cont-8988006e-t2-o1",
  "cont-8988006e-t2-o2",
  "cont-8988006e-t3-o0",
  "cont-8988006e-t3-o1",
  "cont-8988006e-t3-o2",
  "synth-8988006e-t3-pregeneration_2_player1_1-noimg",
  "cont-8988006e-t5-o0",
  "cont-8988006e-t5-o1",
  "cont-8988006e-t5-o2",
  "cont-8988006e-t6-o0",
  "cont-8988006e-t6-o1",
  "cont-8988006e-t6-o2",
  "cont-8988006e-t7-o0",
  "cont-8988006e-t7-o1",
  "cont-8988006e-t7-o2",
  "synth-8988006e-t7-pregeneration_6_player1_2",
];

/**
 * The prompt state of version O2's run (2026-09-30): production's own code,
 * unchanged since adopted2 (only eval code moved), under a tag of its own so
 * production's form runs at samples 1 and 2 beside O2 in the same hour; arm O
 * and its retest stay adopted2's records, read as stored references (today's
 * code rebuilds their requests byte for byte).
 */
export const OPTIONS_O2_PROMPT_STATE = "adopted3";

/**
 * Version O2's cases: the 32 stored rolled chapter steps (a single player's
 * challenge and contest steps), the only stored turns whose request O2
 * changes (elsewhere it sends production's byte for byte), so production's
 * form beside it runs only where the two differ. The three cont-7492b211-t2
 * cases (a played step whose options were typed as exploration, a state
 * production never stores) are read with and without.
 */
export const OPTIONS_O2_CASES = [
  "cont-2ee343b6-t2-o0",
  "cont-2ee343b6-t2-o1",
  "cont-2ee343b6-t2-o2",
  "cont-6edd813c-t2-o0",
  "cont-6edd813c-t2-o1",
  "cont-6edd813c-t2-o2",
  "cont-6edd813c-t3-o0",
  "cont-6edd813c-t3-o1",
  "cont-6edd813c-t3-o2",
  "cont-checkpoi-t1-o0",
  "cont-checkpoi-t1-o1",
  ...OPTIONS_CONTINUITY_RETEST_CASES,
];

/**
 * Version O2's run (the coordinator's brief after the run of 2026-09-30):
 * production's single-player turn form (adopted) and O2 (turnO2) on Luna
 * medium, production's single-player turn model, twice on OPTIONS_O2_CASES,
 * interleaved, so both meet the same server pace. Then O2's one
 * fix-and-retest (turnO2b, sacrifices on today's rate), once on the same
 * steps, what the stage has left (production can't run beside it again).
 */
function optionsO2Arms(role: EvalRole): ArmPlan[] {
  if (role !== "beat") return [];
  const arms: ArmPlan[] = (["adopted", "turnO2"] as const).map((variant) => ({
    arm: adoptedDefault("beat", variant),
    samples: 2,
    scope: "single-player" as const,
    source: "stored" as const,
    caseIds: OPTIONS_O2_CASES,
  }));
  return [...arms, { arm: adoptedDefault("beat", "turnO2b"), samples: 1, scope: "single-player", source: "stored", caseIds: OPTIONS_O2_CASES }];
}

/** Stages whose arms run interleaved: sample by sample, every arm on a case before the next case (planJobs). */
const INTERLEAVED_STAGES: Stage[] = [
  "options-continuity",
  "options-o2",
  "ending-state",
  "runaway",
  "choice-result",
  "choice-line-sp",
  "outcome-settled",
  "recorded-result",
  "lever-direction",
  "parallel-threads",
  "challenge-results",
  "kids-turns",
  "money-adds-up",
  "late-pacing",
  "kids-ages",
  "group-levers",
  "short-replies",
];

export function stageInterleavesArms(stage: Stage): boolean {
  return INTERLEAVED_STAGES.includes(stage);
}

/**
 * The chapter-planning case the stage scoping builds (stageCase.ts): story
 * 8988006e (Novi Reg, Arielle and the Waste Ring) before its first chapter,
 * the chapter the owner's feedback of 2026-09-29 read, which no stored case
 * holds.
 */
export const STAGE_SCOPING_NEW_CASES = ["round-thread-first-8988006e-t1"];

/**
 * The climax arm's cases (stageCases.ts, 2026-09-30): chapters in the story's
 * last thread whose outcome still needs several milestones, where the owner's
 * open question (next stage, or the climax settling the outcome) changes the
 * request. No stored or built planning case is one: the stored stories' later
 * chapters are all before their last thread.
 */
export const STAGE_SCOPING_LAST_CHAPTER_CASES = ["round-thread-last4-8988006e-t5", "round-thread-last2-8988006e-t5", "round-thread-last4-mp-965413e1-p3-t5"];

/**
 * Cases frozen after earlier stages had closed, each with the first stage
 * that plans it: casesFor keeps each out of every stage before that one in
 * STAGES, so a closed stage's dry-run rows and records stay as they ran. The
 * stage scoping's built cases were frozen on 2026-09-29 and 2026-09-30, after
 * the rounds, the migration check and the feedback stages before it had
 * closed; the round cases before them were frozen before those stages ran.
 */
const CASE_FIRST_STAGE: ReadonlyMap<string, Stage> = new Map([
  ...[...STAGE_SCOPING_NEW_CASES, ...STAGE_SCOPING_LAST_CHAPTER_CASES].map((id): [string, Stage] => [id, "stage-scoping"]),
  // The built endings (2026-09-30), frozen after every stage before the ending's run had closed
  ...[...ENDING_STATE_BUILT_CASES.single, ...ENDING_STATE_BUILT_CASES.groups].map((id): [string, Stage] => [id, "ending-state"]),
  // The choice-result stage's cases from the playthroughs (2026-09-30), frozen after every earlier stage had closed
  ...[...CHOICE_RESULT_BUILT_CASES.single, ...CHOICE_RESULT_BUILT_CASES.groups, ...CHOICE_RESULT_BUILT_CASES.plans].map((id): [string, Stage] => [id, "choice-result"]),
  // The outcome-settled stage's cases from the second playthroughs (2026-09-30), frozen after every earlier stage had closed
  ...[...OUTCOME_SETTLED_CASES.single, ...OUTCOME_SETTLED_CASES.groups].map((id): [string, Stage] => [id, "outcome-settled"]),
  // The recorded-result stage's cases from the second playthroughs (2026-09-30), frozen after every earlier stage had closed
  ...[...RECORDED_RESULT_CASES.single, ...RECORDED_RESULT_CASES.groups].map((id): [string, Stage] => [id, "recorded-result"]),
  // The lever-direction stage's mouse setup (2026-09-30), frozen after every earlier stage had closed; the frozen premises
  // it runs beside were planned by the setup rounds and stay plannable
  [LEVER_MOUSE_CASE, "lever-direction"],
  // The parallel-threads stage's switch plans and chapter openings from the second playthroughs (2026-10-01), frozen after
  // every earlier stage had closed
  ...[...PARALLEL_THREADS_CASES.switches, ...PARALLEL_THREADS_CASES.chapters].map((id): [string, Stage] => [id, "parallel-threads"]),
  // The challenge-results stage's chapter plans from the second playthroughs (2026-10-01), frozen after every earlier stage
  // had closed
  ...[...CHALLENGE_RESULTS_CASES.single, ...CHALLENGE_RESULTS_CASES.groups].map((id): [string, Stage] => [id, "challenge-results"]),
  // The kids-turns stage's mouse turns from the second playthroughs (2026-10-01), frozen after every earlier stage had
  // closed; the template's first turn it runs beside was frozen long before and stays plannable
  ...KIDS_TURNS_CASES.mouse.map((id): [string, Stage] => [id, "kids-turns"]),
  // The money-adds-up stage's lemonade turns from the second playthroughs (2026-10-01), frozen after every earlier stage
  // had closed
  ...MONEY_ADDS_UP_CASES.map((id): [string, Stage] => [id, "money-adds-up"]),
  // The late-pacing stage's switch plans from the second playthroughs (2026-10-01), frozen after every earlier stage had
  // closed; the stored endings it reads are the outcome-settled stage's
  ...[...LATE_PACING_CASES.switches, ...LATE_PACING_CASES.retest].map((id): [string, Stage] => [id, "late-pacing"]),
  // The kids-ages stage's turns and setups read with a child of each band's age (2026-10-01), frozen after every earlier
  // stage had closed
  ...[...KIDS_AGES_CASES.single, ...KIDS_AGES_CASES.groups, ...KIDS_AGES_CASES.setups].map((id): [string, Stage] => [id, "kids-ages"]),
  // The group-levers stage's group chapter steps from the second playthroughs (2026-10-01), frozen after every earlier
  // stage had closed
  ...GROUP_LEVERS_CASES.map((id): [string, Stage] => [id, "group-levers"]),
  // The short-replies stage's short turns from the second playthroughs (2026-10-01), frozen after every earlier stage had
  // closed; the frozen turns it runs beside were planned by earlier stages and stay plannable
  ...SHORT_REPLIES_BUILT_CASES.map((id): [string, Stage] => [id, "short-replies"]),
]);

/** Whether a stage may plan a case: any case but one frozen for a later stage (CASE_FIRST_STAGE). */
export function stagePlansCase(stage: Stage, caseId: string): boolean {
  const first = CASE_FIRST_STAGE.get(caseId);
  return first === undefined || STAGES.indexOf(stage) >= STAGES.indexOf(first);
}

/**
 * The stage scoping (the owner's feedback of 2026-09-29, coordinator's
 * brief): planner v2d's chapter planner on Luna low at two samples on every
 * chapter-planning case, stored and built, and on the built first chapter
 * planner v2c (its reference) and today's form (its second) at two samples
 * too, since neither ran there; every other case reads their stored records.
 * Its switch planner is planner v2b's, so no switch case runs. The judged
 * stage check books to this stage too (--judge-stages). The climax arm
 * (2026-09-30, the owner's open question) runs at two samples on the built
 * last chapters only, where its request differs from planner v2d's, with
 * planner v2c beside it there.
 */
function stageScopingArms(role: EvalRole): ArmPlan[] {
  if (role !== "thread") return [];
  return [
    { arm: luna("low", "planV2d"), samples: 2, scope: "all" },
    { arm: luna("low", "planV2c"), samples: 2, scope: "all", caseIds: [...STAGE_SCOPING_NEW_CASES, ...STAGE_SCOPING_LAST_CHAPTER_CASES] },
    { arm: luna("low", "prod"), samples: 2, scope: "all", caseIds: STAGE_SCOPING_NEW_CASES },
    { arm: luna("low", "planV2dClimax"), samples: 2, scope: "all", caseIds: STAGE_SCOPING_LAST_CHAPTER_CASES },
  ];
}

/**
 * The final check's new custom-story setups (the owner's feedback workflow,
 * 2026-09-28): two per player count, every game mode, the scoreboard's
 * contests with two and three players (bounty hunters, the Berlin flat's two
 * camps) and a story read with a child (the kids examples production took
 * from the setup retests).
 */
export const FINAL_CHECK_SETUP_PREMISES = [
  "setup-pretend-er-doctor",
  "setup-custom-neo-tokyo",
  "setup-fiction-bounty-hunters",
  "setup-kids-animal-rescue",
  "setup-flexible-secret-society",
  "setup-vent-berlin-flat",
];

/**
 * The final check's two templates on the template editor's model: one single
 * player's, and one where the editor offers a contest (two players,
 * cooperative-competitive). None is read with a child: template generation
 * has no category, so no kids budget.
 */
export const FINAL_CHECK_TEMPLATE_PREMISES = ["setup-custom-avalon", "setup-flexible-soul-flat"];

/** The sample the final check sends on the stored single-player turns: the form gate sent sample 1 on the same code. */
export const FINAL_CHECK_TURN_SAMPLE = 2;

/** Production's own code (adopted, or the template editor's adoptedTemplate) on a settings group's own model and effort. */
function adoptedDefault(group: TextModelGroup, variant: VariantId = "adopted"): Arm {
  const { model, reasoningEffort } = TEXT_MODEL_GROUPS[group];
  return makeArm({ model, reasoningEffort }, variant);
}

/**
 * The paid final check on production's own code (the owner's feedback
 * workflow, 2026-09-28), under ADOPTED_PROMPT_STATE, on production's settings
 * groups (TEXT_MODEL_GROUPS, never env): the stored single-player turns'
 * second sample (the form gate ran the first on the same code), the 12 stored
 * group turns and both planners on every planning case once, two new
 * custom-story setups per player count on the setup group, and two templates
 * on the template editor's (the first AI Drafts on setup round 3's form).
 * AI Iteration is not a default role and has never run.
 */
function finalCheckArms(role: EvalRole): ArmPlan[] {
  switch (role) {
    case "setup":
      return [
        { arm: adoptedDefault("setup"), samples: 1, scope: "all", caseIds: FINAL_CHECK_SETUP_PREMISES },
        { arm: adoptedDefault("templateEditor", "adoptedTemplate"), samples: 1, scope: "all", caseIds: FINAL_CHECK_TEMPLATE_PREMISES },
      ];
    case "beat":
      return [
        { arm: adoptedDefault("beat"), samples: FINAL_CHECK_TURN_SAMPLE, fromSample: FINAL_CHECK_TURN_SAMPLE, scope: "single-player", source: "stored" },
        { arm: adoptedDefault("multiplayerBeat"), samples: 1, scope: "multiplayer", source: "stored" },
      ];
    case "switch":
    case "thread":
      return perPlayerCount(adoptedDefault("analysis"), adoptedDefault("multiplayerAnalysis"), 1);
    case "iteration":
      return [];
  }
}

/**
 * The prompt state of runs on production's own code (the adopted variant and
 * the request form built on it): the code after the adoption of 2026-09-28
 * and the owner's feedback fixes of that day. round0 names the code before the
 * adoption, so these records carry their own tag.
 */
export const ADOPTED_PROMPT_STATE = "adopted1";

/**
 * The request form's gate (B9; the owner's feedback workflow, 2026-09-28):
 * production's own single-player turn form on Luna medium, once as the one
 * message production sends and once as the split request B9 sends, both with
 * production's limits, on the 44 stored single-player turns, one after the
 * other in one invocation so the server's pace is shared. The stage has room
 * for one sample of each; the noise is today's form's two stored samples
 * (noiseReferenceKey).
 */
function formGateArms(role: EvalRole): ArmPlan[] {
  if (role !== "beat") return [];
  return [
    { arm: luna("medium", "adopted"), samples: 1, scope: "single-player", source: "stored" },
    { arm: luna("medium", "adoptedSplit"), samples: 1, scope: "single-player", source: "stored" },
  ];
}

/** The sample the group round's rerun of today's group form records as (sample 1 is the migration check's). */
export const GROUPS_REFERENCE_SAMPLE = 2;

/**
 * The group round (B10; the owner's feedback workflow, 2026-09-28): the
 * sharpened coordination note (turnB10) on Luna low, production's group
 * model, twice on the 12 stored group turns, with today's group form's sample
 * 2 beside it (its sample 1 is the migration check's, so the reference gets
 * its two-sample noise and a run at the candidate's hour for the waits).
 * "Other beats" stays in both.
 */
function groupRoundArms(role: EvalRole): ArmPlan[] {
  if (role !== "beat") return [];
  return [
    { arm: luna("low", "turnB10"), samples: 2, scope: "multiplayer", source: "stored" },
    { arm: productionDefault("multiplayerBeat"), samples: GROUPS_REFERENCE_SAMPLE, fromSample: GROUPS_REFERENCE_SAMPLE, scope: "multiplayer", source: "stored" },
    // B10's one fix-and-retest (B10b): the shared moment's script and each turn's own close, the same way
    { arm: luna("low", "turnB10b"), samples: 2, scope: "multiplayer", source: "stored" },
  ];
}

/**
 * The setup retests' premises (the owner's feedback workflow, 2026-09-28):
 * those whose premise names the player characters (Casablanca's Fatima and
 * Layla, the Okafor siblings, Susan, the stuffed animals), where the identity
 * clause reads, and the two read with a child, where the kids examples do.
 */
export const SETUP_RETEST_PREMISES = [
  "setup-future-casablanca",
  "setup-future-cocoa-farm",
  "setup-custom-susan",
  "setup-kids-stuffed-animals",
  "setup-kids-animal-rescue",
];

/**
 * The Casablanca sentence's retest premises (2026-09-29): the two whose player
 * stats carried a premise's character names on round 3's form and on round
 * 3b's (Casablanca: one set of player stats per named player, 2 of 2 and 1 of
 * 2; Susan: stats named after her, 2 of 2 on both), so the target check can
 * move under the stop rule; the other named premises (the Okafor siblings, the
 * stuffed animals) were clean on both.
 */
export const SETUP_R3C_PREMISES = ["setup-future-casablanca", "setup-custom-susan"];

/**
 * The second retest (2026-09-29, the coordinator's brief): the sentence in
 * the multiplayer clause only, on Casablanca alone at six samples beside
 * production's form at six, where a full fix (6 of 6 against 0 of 6) reads p
 * 0.001; at two samples no reading of Casablanca can move.
 */
export const SETUP_R3D_PREMISES = ["setup-future-casablanca"];
export const SETUP_R3D_SAMPLES = 6;

/** The other thirteen setup premises: the retests' sanity pass (a test holds the two lists to the eighteen). */
export const SETUP_SANITY_PREMISES = [
  "setup-vent-subscription",
  "setup-pretend-er-doctor",
  "setup-learn-lemonade",
  "setup-custom-shed",
  "setup-custom-vanilla",
  "setup-custom-avalon",
  "setup-custom-neo-tokyo",
  "setup-fiction-bounty-hunters",
  "setup-flexible-soul-flat",
  "setup-learn-peer-review",
  "setup-flexible-secret-society",
  "setup-vent-berlin-flat",
  "setup-pretend-cofounders",
];

/**
 * The setup retests: round 3b (setupR3b) on Luna low at two samples on the
 * retest premises, then once on every other premise as the sanity pass, which
 * a cap stop cuts first (three players last).
 */
function setupRetestArms(role: EvalRole): ArmPlan[] {
  if (role !== "setup") return [];
  return [
    { arm: luna("low", "setupR3b"), samples: 2, scope: "all", caseIds: SETUP_RETEST_PREMISES },
    { arm: luna("low", "setupR3b"), samples: 1, scope: "all", caseIds: SETUP_SANITY_PREMISES },
  ];
}

/**
 * The plan refresh (the owner's feedback of 2026-09-28, coordinator's brief):
 * planner v2c's chapter planner on Luna low at two samples on every
 * chapter-planning case, stored and built, and planner v2b beside it on the
 * group cases, where its request differs from planner v2's (on one player
 * planner v2's records stand in, standInKey). Planner v2c's switch planner is
 * planner v2b's, which is planner v2's byte for byte, so no switch case runs.
 * The nearer chapter backfill books to this stage too (--backfill-chapters
 * --frames nearer --stage plan-refresh).
 */
function planRefreshArms(role: EvalRole): ArmPlan[] {
  if (role !== "thread") return [];
  return [
    { arm: luna("low", "planV2c"), samples: 2, scope: "all" },
    { arm: luna("low", "planV2b"), samples: 2, scope: "multiplayer" },
  ];
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
 * mode (setupChain.ts). The Casablanca sentence (setupR3c, 2026-09-29) after
 * it, twice on SETUP_R3C_PREMISES; then its second retest: production's form
 * to SETUP_R3D_SAMPLES on Casablanca (samples 1 and 2 are round 3's, stored),
 * and setupR3d as many times, so the target reads on six pairs.
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
    { arm: luna("low", "setupR3c"), samples: 2, scope: "all", caseIds: SETUP_R3C_PREMISES },
    { arm: luna("low", "setupR3"), samples: SETUP_R3D_SAMPLES, fromSample: 3, scope: "all", caseIds: SETUP_R3D_PREMISES },
    { arm: luna("low", "setupR3d"), samples: SETUP_R3D_SAMPLES, scope: "all", caseIds: SETUP_R3D_PREMISES },
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
 * The reruns' chain of today's pair beside planner v2c into the framed turn
 * (2026-09-28): its chains' samples 1 (the migration check) and 2 (turn round
 * 1's rerun) are stored, so planning up to 3 sends sample 3 only.
 */
export const RERUNS_REFERENCE_SAMPLE = 3;

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
    case "reruns":
      // The reruns (owner's feedback, 2026-09-28): planner v2c into the framed turn without the chapter rules, the chapter
      // openings of turn round 1's page rebuilt, two samples like the reference's chains
      // Today's pair beside them as sample 3 (its samples 1 and 2 are stored), for the chapter openings' wait at this
      // hour's server pace; after the candidate on each case, so a cap stop cuts it too
      return [
        { analysis: luna("low", "planV2c"), beats: [luna("medium", "chapterFullB")], samples: 2, scope: "single-player", roles: ["thread"] },
        { analysis: productionDefault("analysis"), beats: [productionDefault("beat")], samples: RERUNS_REFERENCE_SAMPLE, scope: "single-player", roles: ["thread"] },
      ];
    case "final-check":
      // A chapter opening's wait on production's own code (the chapter planner, then the chapter's first step), on
      // production's pair per player count, once, read against today's pair's stored chains
      return [
        { analysis: adoptedDefault("analysis"), beats: [adoptedDefault("beat")], samples: 1, scope: "single-player", roles: ["thread"] },
        { analysis: adoptedDefault("multiplayerAnalysis"), beats: [adoptedDefault("multiplayerBeat")], samples: 1, scope: "multiplayer", roles: ["thread"] },
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
    case "parallel-threads":
      // Fix 4 of the second playthroughs' review (2026-10-01): each side's group chapter planner into its own group turn,
      // twice on the stage's chapter openings, interleaved (planJobs), production's chains beside the variant's
      return (["adopted", "parallelThreads"] as const).map((variant) => ({
        analysis: adoptedDefault("multiplayerAnalysis", variant),
        beats: [adoptedDefault("multiplayerBeat", variant)],
        samples: 2,
        scope: "multiplayer" as const,
        roles: ["thread" as const],
        caseIds: [...PARALLEL_THREADS_CASES.chapters],
      }));
    default:
      return [];
  }
}
