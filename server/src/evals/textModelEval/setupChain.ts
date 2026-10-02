import { Story } from "core/models/Story.js";
import {
  PLAYER_SLOTS,
  kidAgesFrom,
  kidAgesFromPremise,
  type DifficultyLevel,
  type PlayerOptionsGeneration,
  type SetOfBeatGenerationSchema,
  type Stat,
  type StatValueEntry,
  type StoryState,
  type SwitchAnalysis,
  type ThreadAnalysis,
} from "core/types/index.js";
import { repairBeatReply } from "../../game/services/beatRepairs.js";
import { ChangeService } from "../../game/services/ChangeService.js";
import { checkSwitchPlan, checkThreadPlan } from "../../game/services/planChecks.js";
import { campsOfSetup } from "../../game/services/scoreboards.js";
import { createEmptyPlayerState } from "../../game/services/StoryStateFactory.js";
import { analysisBefore, beatStep } from "../../game/services/storyTextSteps.js";
import { ThreadResolutionService } from "../../game/services/ThreadResolutionService.js";
import { makeArm, type Arm, type EvalRole } from "./arms.js";
import { chooseAndResolve, selectCharacters } from "./caseBuilder.js";
import { storyAfterAnalysis } from "./jobPlan.js";
import { checkSetupDesign } from "./setupDesignChecks.js";
import { SETUP_PREMISES } from "./setupPremises.js";
import { checkSetup, merge, type CheckResult, type SetupShape } from "./textChecks.js";
import { checkBeatDesign, checkSwitchDesign, checkThreadDesign } from "./turnDesignChecks.js";
import type { TurnKind } from "./turnWaits.js";
import { requestFor, type EvalRequest, type SetupInput } from "./variants.js";

/*
 * Setup round 3's setup-to-play chain (setup doc section 4 "Round 3"; turn
 * doc section 4 step 3; the rounds status note, section 9): a new setup on
 * the final setup form, then play as the game plays it, turn by turn, through
 * the first chapter to the switch turn after it:
 *   setup -> switch plan -> first turn -> (choice) -> chapter plan ->
 *   chapter opening -> chapter steps (choices, dice) -> switch plan ->
 *   switch turn after the chapter,
 * with each plan checked and applied as the game keeps it (storyAfterAnalysis),
 * each turn repaired and its changes applied as production does
 * (StoryProgressionService, AIStoryGenerator.generateBeats), and each player's
 * choice picked by hash and rolled with the game's own dice (chooseAndResolve).
 * Before the switch plan after the chapter, a trigger probe asks the planner
 * once more on a copy of the state in which the stat a switch rule names sits
 * at the rule's threshold; the chain goes on without it.
 * Arms: the final setup form (setupR3) on Luna low; planner v2 with two-sided
 * contests (planV2b) on Luna low; today's turn form with B6 alone (turnB6) on
 * Luna medium for one player, today's form on Luna low for groups (B6 is
 * single-player; the group round did not run). No images, no pregeneration.
 * The calls go to prep-calls.jsonl in the setup-rounds stage (run.ts,
 * --setup-chain); this module plays and reports, and never calls a model
 * itself.
 */

/** One chain premise: a frozen setup premise, at the chain's story length. */
export type ChainPremise = { id: string; premiseId: string; maxTurns: number; tests: string };

export const SETUP_CHAIN_PREMISES: ChainPremise[] = [
  { id: "chain-short-subscription", premiseId: "setup-vent-subscription", maxTurns: 10, tests: "the story length: a 10-turn story, 3 milestones per player" },
  { id: "chain-kids-animal-rescue", premiseId: "setup-kids-animal-rescue", maxTurns: 25, tests: "the kids stat budget with plain names (two players, cooperative, a child of 7-10)" },
  { id: "chain-bounty-hunters", premiseId: "setup-fiction-bounty-hunters", maxTurns: 25, tests: "a two-player contest: player1 on side A, the scoreboard after a contest" },
  { id: "chain-cofounders", premiseId: "setup-pretend-cofounders", maxTurns: 25, tests: "three players, cooperative-competitive: a two-sided contest between two camps" },
];

const luna = (reasoningEffort: "low" | "medium", variant: Parameters<typeof makeArm>[1]) => makeArm({ model: "gpt-6-luna", reasoningEffort }, variant);

export const CHAIN_ARMS = {
  setup: luna("low", "setupR3"),
  planner: luna("low", "planV2b"),
  turn: (players: number): Arm => (players > 1 ? luna("low", "prod") : luna("medium", "turnB6")),
};

/** A chain premise's setup input: the frozen premise text at the chain's story length, with the kids tag. */
export function chainSetupInput(premise: ChainPremise, premises = SETUP_PREMISES): SetupInput {
  const frozen = premises.find((p) => p.id === premise.premiseId);
  if (!frozen) throw new Error(`Setup chain: no frozen premise ${premise.premiseId}`);
  return {
    premise: frozen.premise,
    playerCount: frozen.playerCount,
    gameMode: frozen.gameMode,
    maxTurns: premise.maxTurns,
    ...(frozen.tags.kids ? { kids: true } : {}),
  };
}

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const ALLOWED_MODIFIERS = new Set([-20, -10, 0, 10, 20]);

/**
 * The story a custom setup starts: AIStoryGenerator.createInitialState's
 * state, from the reply as the game saves it (COPY of that method's state
 * building, which is private to production's generator). A setup without a
 * shared list (one player on the new form) starts with none (setup doc B1.8).
 * No images and no pregeneration; a kids premise is a read-with-kids story,
 * with the children's ages (the input's setting, else its premise's line), as
 * StoryCreationService records them, and a learning input a learn-something
 * story, the category production records. The camps the seat roles name are kept,
 * as production keeps them since 2026-10-01 (campsOfSetup).
 */
export function storyFromSetup(setup: unknown, input: SetupInput, id: string): StoryState {
  const reply = asObject(setup);
  const camps = campsOfSetup(setup, input.playerCount);
  const slots = PLAYER_SLOTS.slice(0, input.playerCount);
  const sharedStats = asArray(reply.sharedStats) as Stat[];
  const written = asObject(reply.difficultyLevel) as DifficultyLevel;
  const difficultyLevel: DifficultyLevel = ALLOWED_MODIFIERS.has(written.modifier) ? written : { modifier: 0, title: "Balanced" };
  const seat = (slot: string) => asObject(reply[slot]) as unknown as PlayerOptionsGeneration;
  return {
    id,
    title: String(reply.title ?? ""),
    imageInstructions: reply.imageInstructions as StoryState["imageInstructions"],
    gameMode: input.gameMode,
    difficultyLevel,
    guidelines: reply.guidelines as StoryState["guidelines"],
    storyElements: asArray(reply.storyElements) as StoryState["storyElements"],
    worldFacts: [],
    sharedOutcomes: asArray(reply.sharedOutcomes) as StoryState["sharedOutcomes"],
    sharedStats,
    sharedStatValues: sharedStats.map((stat) => ({ statId: stat.id, value: stat.initialValue }) as StatValueEntry),
    playerStats: asArray(reply.playerStats) as Stat[],
    players: Object.fromEntries(slots.map((slot) => [slot, createEmptyPlayerState(asArray(seat(slot).outcomes) as never)])),
    storyPhases: [],
    maxTurns: input.maxTurns,
    characterSelectionCompleted: false,
    characterSelectionOptions: Object.fromEntries(slots.map((slot) => [slot, seat(slot)])),
    characterSelectionIntroduction: reply.characterSelectionIntroduction as StoryState["characterSelectionIntroduction"],
    generateImages: false,
    pregenerateBeats: false,
    images: [],
    playerCodes: {},
    ...(camps ? { camps } : {}),
    ...(input.kids ? { category: "read-with-kids" as const } : {}),
    // A learning story as production records the setup form's learn-something category (the money-2 stage, 2026-10-02)
    ...(input.learning ? { category: "learn-something" as const } : {}),
    // The children's ages as the game records them (StoryCreationService: the read-with-kids setting, else the premise's
    // age line, since 2026-10-01); the second round's stored runs predate them and recorded none
    ...(input.kids && kidAgesOf(input) ? { kidAges: kidAgesOf(input) } : {}),
  };
}

/** A kids setup input's ages: the setting it carries, else its premise's age line. */
const kidAgesOf = (input: SetupInput) => kidAgesFrom(input.kidAges) ?? kidAgesFromPremise(input.premise);

// ---------------------------------------------------------------- the trigger probe

/** The stat value a switch rule names, set on a copy of the state for the trigger probe. */
export type TriggerEdit = { rule: string; statId: string; statName: string; shared: boolean; value: number };

const BELOW = /\b(below|under|less than|lower than|drops?|falls?|sinks?|dips?|goes down)\b/i;
const ABOVE = /\b(above|over|exceeds?|more than|greater than|higher than|rises?|climbs?|goes up)\b/i;
const OR_BELOW = /^\s*%?\s*or\s+(below|less|lower|under|fewer)\b/i;
const OR_ABOVE = /^\s*%?\s*or\s+(above|more|higher|over|greater)\b/i;
const NUMBER = /(\d+(?:\.\d+)?)/;

const namesOf = (stat: Stat) => [stat.name, ...(stat.type === "opposites" ? stat.name.split("|") : [])].map((n) => n.trim()).filter((n) => n.length >= 3);

/**
 * The first switch rule that sets a numeric threshold on one of the story's
 * number, percentage or opposites stats, as the value just across it: 5
 * below a "below" and 5 above an "above" (kept within 0 to 100 where the
 * stat is a share), the number itself for "at", "reaches" and "or below".
 * An opposites stat's second side reads as 100 minus its value. String stats
 * are left out: their steps can't be read from a rule reliably.
 */
export function triggerEdit(story: Story): TriggerEdit | undefined {
  const state = story.getState();
  const stats = [...state.sharedStats.map((stat) => ({ stat, shared: true })), ...state.playerStats.map((stat) => ({ stat, shared: false }))].filter(({ stat }) =>
    ["number", "percentage", "opposites"].includes(stat.type)
  );
  const byLength = stats.flatMap(({ stat, shared }) => namesOf(stat).map((name, i) => ({ stat, shared, name, second: stat.type === "opposites" && i === 2 }))).sort((a, b) => b.name.length - a.name.length);
  for (const rule of state.guidelines?.switchAndThreadInstructions ?? []) {
    const lower = rule.toLowerCase();
    for (const { stat, shared, name, second } of byLength) {
      const at = lower.indexOf(name.toLowerCase());
      if (at < 0) continue;
      const before = rule.slice(Math.max(0, at - 30), at);
      const after = rule.slice(at + name.length, at + name.length + 50);
      const number = NUMBER.exec(after);
      if (!number || /[.;:]/.test(after.slice(0, number.index))) continue;
      const between = after.slice(0, number.index);
      const trailing = after.slice(number.index + number[0].length);
      const threshold = Number(number[1]);
      const bounded = stat.type !== "number";
      let value = threshold;
      if (OR_BELOW.test(trailing) || OR_ABOVE.test(trailing)) value = threshold;
      else if (BELOW.test(between) || (BELOW.test(before) && !ABOVE.test(between))) value = threshold - 5;
      else if (ABOVE.test(between) || (ABOVE.test(before) && !BELOW.test(between))) value = threshold + 5;
      if (bounded) value = Math.max(0, Math.min(100, value));
      if (second) value = 100 - value;
      return { rule, statId: stat.id, statName: stat.name, shared, value };
    }
  }
  return undefined;
}

/** The story with the probe's stat at its value: the shared value, or every player's. */
export function withTriggerEdit(story: Story, edit: TriggerEdit): Story {
  const state = story.getState();
  const set = (values: StatValueEntry[]) => [...values.filter((v) => v.statId !== edit.statId), { statId: edit.statId, value: edit.value }];
  if (edit.shared) return Story.create({ ...state, sharedStatValues: set(state.sharedStatValues) });
  const players = Object.fromEntries(Object.entries(state.players).map(([slot, player]) => [slot, { ...player, statValues: set(player.statValues) }]));
  return Story.create({ ...state, players });
}

// ---------------------------------------------------------------- the chain

export type ChainCallSpec = { caseId: string; role: EvalRole; arm: Arm; players: number; request: EvalRequest };
export type ChainCallResult = { parsed: unknown; outputFile: string; latencyMs: number; costUsd: number };
/** One model call of the chain; undefined when it produced no usable reply (or the budget stopped it). */
export type ChainCall = (spec: ChainCallSpec) => Promise<ChainCallResult | undefined>;

export type ChainStepKind = "setup" | "switch plan" | "chapter plan" | "trigger probe" | TurnKind;

export type ChainChoice = { slot: string; option: number; text: string; resourceType: string; resolution: string | null };

export type ChainStep = {
  kind: ChainStepKind;
  /** The story's turn when the call was made (beats written so far) */
  turn: number;
  caseId: string;
  armKey: string;
  outputFile?: string;
  latencyMs?: number;
  costUsd?: number;
  /** The reply as the game keeps it: the setup, the checked plan, the repaired turn (in memory; the JSON keeps the output file) */
  output?: unknown;
  /** A plan the game's check would ask for again */
  problem?: string;
  checks?: CheckResult;
  /** Each player's choice on this turn and its rolled result */
  choices?: ChainChoice[];
  edit?: TriggerEdit;
};

export type ChainRun = {
  premise: ChainPremise;
  sample: number;
  input: SetupInput;
  steps: ChainStep[];
  /** After character selection */
  start?: StoryState;
  /** After the last step */
  end?: StoryState;
  stopped: string;
};

/** A call's case id: the chain, its sample, the call's place and kind. */
export const chainCaseId = (premise: ChainPremise, sample: number, index: number, kind: ChainStepKind) =>
  `${premise.id}-s${sample}-${String(index).padStart(2, "0")}-${kind.replace(/\s+/g, "-")}`;

function turnKindAt(story: Story): TurnKind {
  const type = story.getCurrentBeatType();
  if (type === "ending") return "ending";
  if (type === "thread") return story.getCurrentThreadBeatsCompleted() === 0 ? "chapter opening" : "chapter step";
  return story.isFirstBeat() ? "first turn" : "switch turn";
}

const DEFAULT_MAX_CALLS = 14;

/**
 * Plays one chain. Stops after the switch turn that follows the first
 * chapter, before an ending (the ending's scoreboard rule is not in any turn
 * form yet), at the call limit, or where a call brings back nothing usable.
 */
export async function playSetupChain(
  premise: ChainPremise,
  input: SetupInput,
  call: ChainCall,
  options: { sample: number; maxCalls?: number }
): Promise<ChainRun> {
  const steps: ChainStep[] = [];
  const run: ChainRun = { premise, sample: options.sample, input, steps, stopped: "" };
  const players = input.playerCount;
  const maxCalls = options.maxCalls ?? DEFAULT_MAX_CALLS;
  const ask = async (kind: ChainStepKind, role: EvalRole, arm: Arm, request: EvalRequest, turn: number) => {
    const caseId = chainCaseId(premise, options.sample, steps.length, kind);
    const step: ChainStep = { kind, turn, caseId, armKey: arm.key };
    steps.push(step);
    const result = await call({ caseId, role, arm, players, request });
    if (result) Object.assign(step, { outputFile: result.outputFile, latencyMs: result.latencyMs, costUsd: result.costUsd });
    return { step, parsed: result?.parsed };
  };

  const setup = await ask("setup", "setup", CHAIN_ARMS.setup, requestFor(CHAIN_ARMS.setup.variant, { role: "setup", setup: input }), 0);
  if (setup.parsed === undefined) return { ...run, stopped: "the setup: no usable reply" };
  setup.step.output = setup.parsed;
  setup.step.checks = merge([checkSetup(setup.parsed as SetupShape, input), checkSetupDesign(setup.parsed, input)]);
  let story = selectCharacters(Story.create(storyFromSetup(setup.parsed, input, `${premise.id}-s${options.sample}`)), `${premise.id}-s${options.sample}`);
  run.start = story.getState();

  while (steps.length < maxCalls) {
    story = ThreadResolutionService.resolveCurrentThreads(story);
    const next = story.determineNextBeatType();
    if (next === "ending") return { ...run, end: story.getState(), stopped: "before the ending" };
    const turn = story.getCurrentTurn();
    const analysis = analysisBefore(story, next);
    if (analysis === "switch" && !story.isFirstBeat()) {
      const edit = triggerEdit(story);
      if (edit) {
        const probe = await ask("trigger probe", "switch", CHAIN_ARMS.planner, requestFor(CHAIN_ARMS.planner.variant, { role: "switch", story: withTriggerEdit(story, edit) }), turn);
        probe.step.edit = edit;
        if (probe.parsed !== undefined) probe.step.output = checkSwitchPlan(withTriggerEdit(story, edit), probe.parsed as SwitchAnalysis).plan;
      }
    }
    if (analysis) {
      const kind = analysis === "switch" ? "switch plan" : "chapter plan";
      const plan = await ask(kind, analysis, CHAIN_ARMS.planner, requestFor(CHAIN_ARMS.planner.variant, { role: analysis, story }), turn);
      if (plan.parsed === undefined) return { ...run, end: story.getState(), stopped: `the ${kind} at turn ${turn}: no usable reply` };
      if (analysis === "switch") {
        const checked = checkSwitchPlan(story, plan.parsed as SwitchAnalysis);
        Object.assign(plan.step, { output: checked.plan, problem: checked.problem, checks: checkSwitchDesign(story, checked.plan) });
      } else {
        const checked = checkThreadPlan(story, plan.parsed as ThreadAnalysis);
        Object.assign(plan.step, { output: checked.plan, problem: checked.problem, checks: checkThreadDesign(story, checked.plan) });
      }
      story = storyAfterAnalysis(story, analysis, plan.parsed as SwitchAnalysis | ThreadAnalysis);
    }

    const kind = turnKindAt(story);
    const arm = CHAIN_ARMS.turn(players);
    const beat = await ask(kind, "beat", arm, requestFor(arm.variant, { role: "beat", story }), turn);
    if (beat.parsed === undefined) return { ...run, end: story.getState(), stopped: `the ${kind} at turn ${turn}: no usable reply` };
    const written = beat.parsed as SetOfBeatGenerationSchema;
    const { reply } = repairBeatReply(story, written);
    beat.step.output = reply;
    beat.step.checks = checkBeatDesign(story, reply, written);
    const [withBeat, changes] = beatStep.apply(story, reply, true);
    story = new ChangeService().applyChanges(withBeat, changes);
    if (kind === "switch turn") return { ...run, end: story.getState(), stopped: "the switch turn after the first chapter" };
    story = chooseAndResolve(story, `${premise.id}-s${options.sample}|t${turn}`);
    beat.step.choices = story.getPlayerSlots().map((slot) => {
      const current = story.getCurrentBeat(slot);
      const option = current?.choice ?? -1;
      const chosen = current?.options?.[option];
      return { slot, option, text: chosen?.text ?? "", resourceType: chosen?.resourceType ?? "", resolution: current?.resolution ?? null };
    });
  }
  return { ...run, end: story.getState(), stopped: `the call limit (${maxCalls})` };
}

// ---------------------------------------------------------------- the report

const seconds = (ms?: number) => (ms === undefined ? "–" : `${(ms / 1000).toFixed(1)} s`);
const usd = (value: number) => `$${value.toFixed(4)}`;
const quote = (text: unknown) => String(text ?? "").replace(/\s+/g, " ").trim();
const firstParagraph = (text: unknown) => quote(String(text ?? "").split(/\n\s*\n/)[0]).slice(0, 500);

function failing(checks?: CheckResult): string {
  if (!checks) return "–";
  const failed = Object.entries(checks.checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);
  return failed.length ? `fails ${failed.join(", ")}` : `passes all ${Object.keys(checks.checks).length}`;
}

function valueOf(values: StatValueEntry[] | undefined, statId: string): string {
  const entry = values?.find((v) => v.statId === statId);
  return entry === undefined ? "–" : JSON.stringify(entry.value);
}

function setupSection(step: ChainStep, input: SetupInput): string[] {
  const reply = asObject(step.output);
  const guidelines = asObject(reply.guidelines);
  const stats = [...asArray(reply.sharedStats).map((s) => ({ s: asObject(s), shared: true })), ...asArray(reply.playerStats).map((s) => ({ s: asObject(s), shared: false }))];
  const outcomes = (list: unknown) =>
    asArray(list).map((o) => {
      const outcome = asObject(o);
      const kind = Object.keys(asObject(outcome.possibleResolutions)).join("/");
      return `  - ${quote(outcome.question)} (${outcome.intendedNumberOfMilestones} milestones; ${kind})`;
    });
  const lines = [
    "### Setup",
    "",
    `- Title: ${quote(reply.title)}. Checks: ${failing(step.checks)}.`,
    `- Counts: ${Object.entries(step.checks?.counts ?? {})
      .filter(([name]) => ["visiblePlayerStats", "kidsLongStatNames", "hookFacts", "pronounOnlyFacts", "rolePronouns", "rulesNamingStat", "threadTypesShaped", "steeringImplications"].includes(name))
      .map(([name, n]) => `${name} ${n}`)
      .join(", ")}.`,
    `- Seat roles: ${asArray(asObject(reply.characterSelectionPlan).multiplayerCoordination).map(quote).join(" / ") || "–"}`,
    "- Shared outcomes:",
    ...(outcomes(reply.sharedOutcomes).length ? outcomes(reply.sharedOutcomes) : ["  - none"]),
    ...PLAYER_SLOTS.slice(0, input.playerCount).flatMap((slot) => {
      const seat = asObject(reply[slot]);
      const names = asArray(seat.possibleCharacterIdentities).map((i) => quote(asObject(i).name));
      return [`- ${slot}: identities ${names.join(", ")}; outcomes:`, ...outcomes(seat.outcomes)];
    }),
    "- Stats:",
    ...stats.map(({ s, shared }) => `  - ${shared ? "shared" : "player"}${s.isVisible === false ? ", hidden" : ""}, ${s.type}: ${quote(s.name)} (start ${JSON.stringify(s.initialValue)}). ${quote(s.tooltip)}`),
    "- Switch rules:",
    ...asArray(guidelines.switchAndThreadInstructions).map((rule) => `  - ${quote(rule)}`),
    "- Thread types:",
    ...asArray(guidelines.typesOfThreads).map((type) => `  - ${quote(type)}`),
    "",
  ];
  return lines;
}

/** A switch plan's switches: type, outcome and question, or its directions. */
function switchLines(step: ChainStep): string[] {
  return asArray(asObject(step.output).switches)
    .map(asObject)
    .flatMap((sw) => [
      `- ${asArray(sw.players).join(", ")}: ${sw.type} switch "${quote(sw.title)}"${sw.type === "flavor" ? ` on ${sw.outcomeId}: ${quote(sw.question)}` : ""}`,
      ...asArray(sw.topicChoices).map((choice) => `  - ${quote(choice)}`),
    ]);
}

function switchSection(step: ChainStep, heading: string): string[] {
  return [
    `### ${heading}`,
    "",
    `- Turn ${step.turn}, ${seconds(step.latencyMs)}. ${step.problem ? `Plan check: ${step.problem}. ` : ""}Checks: ${failing(step.checks)}.`,
    ...switchLines(step),
    "",
  ];
}

function probeSection(step: ChainStep): string[] {
  const edit = step.edit;
  return [
    "### Trigger probe",
    "",
    `- Turn ${step.turn}, ${seconds(step.latencyMs)}. Rule: ${quote(edit?.rule)}`,
    `- ${edit?.statName} (${edit?.shared ? "shared" : "every player"}) set to ${edit?.value} on a copy of the state; the planner then wrote:`,
    ...switchLines(step),
    "",
  ];
}

function chapterSection(step: ChainStep): string[] {
  const plan = asObject(step.output);
  return [
    "### Chapter plan",
    "",
    `- Turn ${step.turn}, ${seconds(step.latencyMs)}, ${plan.duration} beats. ${step.problem ? `Plan check: ${step.problem}. ` : ""}Checks: ${failing(step.checks)}.`,
    ...asArray(plan.threads).flatMap((t) => {
      const thread = asObject(t);
      return [
        `- ${quote(thread.title)}: ${thread.kind ?? "?"} (type "${quote(thread.typeOfThread)}"), on ${thread.outcomeId}; side A ${asArray(thread.playersSideA).join(", ") || "–"}, side B ${asArray(thread.playersSideB).join(", ") || "–"}`,
        `  - Question: ${quote(thread.question ?? thread.typeOfMilestone)}`,
        ...asArray(thread.progression).map((s, i) => `  - Step ${i + 1}: ${quote(asObject(s).question)}`),
        `  - Milestones: ${Object.entries(asObject(thread.possibleMilestones))
          .map(([key, text]) => `${key}: ${quote(text)}`)
          .join(" | ")}`,
      ];
    }),
    "",
  ];
}

function turnSection(step: ChainStep, players: number): string[] {
  const reply = asObject(step.output);
  const changes = [...asArray(reply.statChanges), ...asArray(reply.newMilestones)].map(asObject);
  return [
    `### ${step.kind[0].toUpperCase()}${step.kind.slice(1)} (turn ${step.turn + 1})`,
    "",
    `- ${seconds(step.latencyMs)}. Checks: ${failing(step.checks)}.`,
    ...(changes.length ? [`- Changes: ${changes.map((c) => (c.type === "newMilestone" ? `milestone on ${c.outcome}: "${quote(c.newMilestone)}"` : `${c.stat} ${c.change} ${JSON.stringify(c.value)}`)).join("; ")}`] : []),
    ...PLAYER_SLOTS.slice(0, players).flatMap((slot) => {
      const beat = asObject(reply[slot]);
      const choice = step.choices?.find((c) => c.slot === slot);
      return [
        `- ${slot}: "${quote(beat.title)}". First paragraph: ${firstParagraph(beat.text)}`,
        ...asArray(beat.options).map((o, i) => {
          const option = asObject(o);
          const bonuses = asArray(option.modifiersToSuccessRate).map((m) => `${asObject(m).statId} ${asObject(m).effect}`);
          return `  - ${i + 1}. ${quote(option.text)} [${option.optionType}, ${option.resourceType}${option.basePoints !== undefined ? `, base ${option.basePoints}` : ""}${bonuses.length ? `, ${bonuses.join(", ")}` : ""}]${choice?.option === i ? ` (chosen: ${choice.resolution ?? "no roll"})` : ""}`;
        }),
      ];
    }),
    "",
  ];
}

function statsSection(run: ChainRun): string[] {
  const stats = [...(run.start?.sharedStats ?? []).map((s) => ({ s, shared: true })), ...(run.start?.playerStats ?? []).map((s) => ({ s, shared: false }))];
  const slots = PLAYER_SLOTS.slice(0, run.input.playerCount);
  return [
    "### Stats at the start and after the chain",
    "",
    "| Stat | Start | After |",
    "|---|---|---|",
    ...stats.flatMap(({ s, shared }) =>
      shared
        ? [`| ${s.name} (shared) | ${valueOf(run.start?.sharedStatValues, s.id)} | ${valueOf(run.end?.sharedStatValues, s.id)} |`]
        : slots.map((slot) => `| ${s.name} (${slot}) | ${valueOf(run.start?.players[slot]?.statValues, s.id)} | ${valueOf(run.end?.players[slot]?.statValues, s.id)} |`)
    ),
    "",
    "Milestones after the chain:",
    ...[...(run.end?.sharedOutcomes ?? []), ...slots.flatMap((slot) => run.end?.players[slot]?.outcomes ?? [])].map(
      (o) => `- ${o.id}: ${o.milestones.length ? o.milestones.map((m) => `"${quote(m)}"`).join("; ") : "none"}`
    ),
    "",
  ];
}

/** The chain's report: per chain, what each step wrote, its checks and waits, and the stats before and after. */
export function renderChainReport(runs: ChainRun[], generatedAt: Date): string {
  const lines = [
    "# Setup round 3: the setup-to-play chain",
    "",
    `Generated ${generatedAt.toISOString()}. Each chain: a new setup on the final setup form, then play through the first chapter to the switch turn after it; choices by hash, the game's own dice. Arms: setup ${CHAIN_ARMS.setup.key}, planners ${CHAIN_ARMS.planner.key}, turns ${CHAIN_ARMS.turn(1).key} (one player) or ${CHAIN_ARMS.turn(2).key} (groups).`,
    "",
    "| Chain | Players | Turns | Calls | Cost | Stopped at |",
    "|---|---|---|---|---|---|",
    ...runs.map((run) => {
      const cost = run.steps.reduce((sum, s) => sum + (s.costUsd ?? 0), 0);
      return `| ${run.premise.id} | ${run.input.playerCount} | ${run.input.maxTurns} | ${run.steps.length} | ${usd(cost)} | ${run.stopped} |`;
    }),
    "",
  ];
  for (const run of runs) {
    lines.push(`## ${run.premise.id} (sample ${run.sample})`, "", `Tests ${run.premise.tests}. Premise: ${run.premise.premiseId}, ${run.input.playerCount} player(s), ${run.input.gameMode}, ${run.input.maxTurns} turns${run.input.kids ? ", read with a child" : ""}.`, "");
    lines.push("| Step | Kind | Turn | Wait | Cost | Output |", "|---|---|---|---|---|---|");
    run.steps.forEach((s, i) => lines.push(`| ${i} | ${s.kind} | ${s.turn} | ${seconds(s.latencyMs)} | ${s.costUsd === undefined ? "–" : usd(s.costUsd)} | ${s.outputFile ?? "–"} |`));
    lines.push("");
    let switches = 0;
    for (const step of run.steps) {
      if (step.output === undefined) continue;
      if (step.kind === "setup") lines.push(...setupSection(step, run.input));
      else if (step.kind === "switch plan") lines.push(...switchSection(step, switches++ === 0 ? "First switch plan" : "Switch plan after the chapter"));
      else if (step.kind === "trigger probe") lines.push(...probeSection(step));
      else if (step.kind === "chapter plan") lines.push(...chapterSection(step));
      else lines.push(...turnSection(step, run.input.playerCount));
    }
    if (run.start) lines.push(...statsSection(run));
  }
  return `${lines.join("\n")}\n`;
}

/**
 * The chain file's runs with new ones: a chain and sample played again
 * replaces its earlier run, every other run stays, in the chains' order and
 * then by sample.
 */
export function mergeChainRuns(existing: ChainRun[], added: ChainRun[]): ChainRun[] {
  const key = (run: ChainRun) => `${run.premise.id}|${run.sample}`;
  const replaced = new Set(added.map(key));
  const order = (run: ChainRun) => {
    const at = SETUP_CHAIN_PREMISES.findIndex((p) => p.id === run.premise.id);
    return at < 0 ? SETUP_CHAIN_PREMISES.length : at;
  };
  return [...existing.filter((run) => !replaced.has(key(run))), ...added].sort((a, b) => order(a) - order(b) || a.sample - b.sample);
}

/**
 * A chain file's runs read back. A step whose output the file lacks (a file
 * written before outputs were kept) gets its output file's reply, the reply
 * as written rather than as the game kept it (before the plan check or the
 * beat repairs).
 */
export function chainRunsFrom(file: unknown, load: (outputFile: string) => unknown): ChainRun[] {
  const runs = asArray(asObject(file).runs) as ChainRun[];
  return runs.map((run) => ({ ...run, steps: run.steps.map((step) => (step.output === undefined && step.outputFile ? { ...step, output: load(step.outputFile) } : step)) }));
}

/** The chain as JSON: every step with the reply as the game kept it, and the states at start and end. */
export function chainFile(runs: ChainRun[], generatedAt: Date) {
  return {
    generatedAt: generatedAt.toISOString(),
    arms: { setup: CHAIN_ARMS.setup.key, planner: CHAIN_ARMS.planner.key, turnOnePlayer: CHAIN_ARMS.turn(1).key, turnGroups: CHAIN_ARMS.turn(2).key },
    runs,
  };
}
