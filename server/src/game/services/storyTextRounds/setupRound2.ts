import { z } from "zod";
import { GameModes, PLAYER_SLOTS, type GameMode, type PlayerCount } from "core/types/index.js";
import type { TextRequest } from "../storyTextSteps.js";
import { PASSING_ROUND1_PARTS, ROUND1C_PARTS, iterationRequestFromRound1, setupRequestFromRound1, type Round1Parts } from "./setupRound1.js";

/*
 * Setup round 2 of DOCS/2026-09-27_setup-generation-improvements.md (section
 * 4, "Round 2"), eval only until the owner adopts it: proposal 7 (thread
 * types, switch rules and stat thresholds that steer; Appendix A7) on top of
 * round 1's changes that passed the stop rule (proposals 3, 4 and 6 and the
 * blank-items sentence; 1, 2 and 5 failed it and are left out, see
 * setupRound1.ts's Round1Parts), in two arms:
 * - "fieldOrder" (A): production's field order, with A7.1's fallback line,
 *   since the rules are written before the stats they name;
 * - "generationOrder" (B): proposal 9's order (A9), decisions before what
 *   depends on them, with the reply assembled back into the fields saved
 *   today (assembleGenerationOrder), so the game, the editor and the eval's
 *   readers see today's shape.
 * Both arms send the same prompt text. The adjustments to the document's text
 * are listed in .plans/2026-09-26_build-followup.md ("Setup rounds, round 2").
 * Round 2b is the same two arms on the fix run's passing changes (round 1c,
 * ROUND2B_BASE_PARTS): with the outcome slate's seat roles back, arm B
 * writes A9's playerRoles first, and with the worked example back there is
 * no production narrative block or example to edit.
 * The eval's variants.ts is the one caller.
 */

export type Round2Order = "fieldOrder" | "generationOrder";

/**
 * Round 2b's base: round 1c, every round-1 change with the report's fixes and
 * proposal 1's fix-and-retest, which passed the stop rule's moved reading
 * (.plans/2026-09-26_build-followup.md, "Setup rounds: fix run").
 */
export const ROUND2B_BASE_PARTS: Round1Parts = ROUND1C_PARTS;

/** A request whose reply is reshaped into the saved fields before anything reads it (the generation order). */
export type Round2Request = TextRequest & { assemble?: (reply: unknown) => unknown };

type On = { players: PlayerCount; mode: GameMode };

const SEPARATOR = "#".repeat(50);

const contested = (on: On) => on.players > 1 && (on.mode === GameModes.Competitive || on.mode === GameModes.CooperativeCompetitive);

// ---------------------------------------------------------------- the text

/** A7.1's fallback while the rules are written before the stats (A7.1: "Until A9 lands"). */
export const INSTRUCTIONS_FALLBACK = "You define the stats below; name a stat by what it measures.";

/**
 * A7.3's prompt line, in place of production's "Narrative Thresholds and
 * Implications" block (B7.2), which stays in round 2's base because
 * proposal 5's removal of the "For each stat" block did not carry forward.
 * The block's other entries are headings without a dash, so this one has none.
 */
export const NARRATIVE_PROMPT_LINE =
  "Narrative implications: the switch designer reads them at every switch. Write thresholds that force or offer threads, or open and close scenes.";
const NARRATIVE_BLOCK: [string, string] = ["Narrative Thresholds and Implications.\n", '(e.g., "1000+ gold represents upper class status")\n'];

/**
 * A7.3 on production's example stat setups, which round 2's base keeps: the
 * implications that name no value or state the stat reaches are cut, so the
 * examples beside the field show thresholds only. Each stat keeps at least
 * one. Each passage must occur exactly once in the instructions.
 */
const EXAMPLE_IMPLICATION_CUTS: [string, string][] = [
  ['",\n    "Special followers may develop their own storylines and conflicts requiring resolution"\n', '"\n'],
  ['    "Gear quality affects all performance descriptions and audience reactions",\n', ""],
  ['",\n    "Chemistry level affects all inter-band dialogue and decision options"\n', '"\n'],
];

/**
 * A7.1, each kind printed where the call has it: the multiplayer rule only in
 * multiplayer, and its contest half only where contest threads exist (the
 * engine block: competitive and cooperative-competitive only).
 */
function instructionsText(on: On, fallback: boolean): string {
  const multiplayer = contested(on)
    ? "in multiplayer games: when the players share a thread, and when they face each other in a contest"
    : "in multiplayer games: when the players share a thread";
  const kinds = [
    "the opening: what the first thread is about",
    "a stat trigger: when a named stat reaches a value, the next switch forces a thread about it, or topic switches must offer one",
    "a recipe for one thread type: its length in beats and what its steps are",
    "timing: what happens around the middle of the story, and what the final thread is about",
    ...(on.players > 1 ? [multiplayer] : []),
  ];
  return [
    "Two to four rules that the story's planners apply between threads: they design the next choice and the next thread, while the beats that narrate a thread never see these rules. Each rule names a trigger and what follows. Kinds that pay off:",
    ...kinds.map((kind, i) => `- ${kind}${i === kinds.length - 1 ? "." : ";"}`),
    "At most one rhythm rule, and only if it is specific to this story; the planners are already told to avoid each player's recent thread types. Stat changes after threads belong in each stat's adjustments after threads, how scenes read belongs in tone, and the game's own mechanics need no restating. Example: 'When Public Support falls below 30%, the next thread is about winning back the crowd.'",
    ...(fallback ? [INSTRUCTIONS_FALLBACK] : []),
  ].join("\n");
}

/** A7.2, with the contest kind only where contest threads exist. */
function threadTypesText(on: On): string {
  const kinds = contested(on)
    ? "Kind is challenge (success or failure, rolled), exploration (a choice between paths, no roll) or contest (players against each other);"
    : "Kind is challenge (success or failure, rolled) or exploration (a choice between paths, no roll);";
  return `Six to eight kinds of scene that this story's threads are built from. Write each as 'Name (kind, beats): what the players do and what is at stake'. ${kinds} beats is the usual length, 2, 3 or 4. Together they cover the main conflict, in more than one way (for example negotiation and sabotage), and the characters' private lives (friends, family, romance, reflection). Every outcome has at least one type that can push it, and every stat matters in at least one. Example: 'Public protest (challenge, 3): rally goblins in a square the Hero Guild patrols without handing it an excuse to crack down'.`;
}

/** A7.3, verbatim. */
const IMPLICATIONS =
  "One to three thresholds, each with what the story must do when the stat reaches it. The switch and thread planners see only a stat's name, value and these lines, so this is how a stat steers which threads happen. Name the value and the consequence: which thread the next switch forces or offers, or which scenes and options open or close. Examples: 'At 20% or below: the next switch forces a thread about finding food.' 'At Hunted: every topic switch offers an escape.' 'While Gruk trusts the player: the enclave offers sanctuary.'";

/** The generation order's two new groups; the game never sees them, assembly unpacks them. */
const THREAD_DESIGN = "This story's thread types and switch/thread instructions, written after the outcomes and stats they build on.";
const PLAYER_OUTCOMES = "Each player's own outcomes, one list per player.";
/**
 * A9's playerRoles (multiplayer, with proposal 1's seat roles): the plan's
 * seat roles (A1.4's multiplayerCoordination, "the interim home of the seat
 * roles until A9") as their own field, written before the outcomes, stats and
 * backgrounds that build on them. Assembly saves them in the plan.
 */
const PLAYER_ROLES =
  "One line per player seat, in seat order, such as 'player1: the enclave's organizer': that seat's own role in this story, meaning what the character does for the group or wants that the others don't. All three of the seat's identities and backgrounds stay within the role, and so do its personal outcomes; the outcomes, stats and backgrounds below use these role names. The multiplayerCoordination instructions apply here.";

// ---------------------------------------------------------------- prompt

function count(text: string, passage: string): number {
  return text.split(passage).length - 1;
}

function replaceOnce(text: string, passage: string, replacement: string): string {
  const n = count(text, passage);
  if (n !== 1) throw new Error(`Setup round 2: "${passage.slice(0, 70)}" found ${n} times in round 2's base instructions`);
  return text.split(passage).join(replacement);
}

/**
 * A7.3's line in place of production's narrative-thresholds block, and its
 * cuts in production's example stat setups, in the general instructions
 * only. A new setup prints both on a base without the worked example
 * (production's "For each stat" block and examples stand there); on a base
 * with it, neither exists, and A7.3's field says what the line would. AI
 * Iteration prints the block only when it regenerates stats or players, and
 * never production's examples.
 */
function round2Prompt(base: string, newSetup: boolean, parts: Round1Parts): string {
  const split = base.indexOf(`${SEPARATOR}\n\n`);
  if (split < 0) throw new Error("Setup round 2: no separator in round 2's base prompt");
  const rest = base.slice(split);
  let instructions = base.slice(0, split);
  const [from, through] = NARRATIVE_BLOCK;
  const [n, m] = [count(instructions, from), count(instructions, through)];
  const productionExamples = newSetup && !parts.example;
  if (n !== 0 || m !== 0 || productionExamples) {
    if (n !== 1 || m !== 1) throw new Error(`Setup round 2: production's narrative-thresholds block found ${n} and ${m} times`);
    const start = instructions.indexOf(from);
    const end = instructions.indexOf(through) + through.length;
    instructions = `${instructions.slice(0, start)}${NARRATIVE_PROMPT_LINE}\n${instructions.slice(end)}`;
  }
  if (productionExamples) for (const [passage, replacement] of EXAMPLE_IMPLICATION_CUTS) instructions = replaceOnce(instructions, passage, replacement);
  return `${instructions}${rest}`;
}

// ---------------------------------------------------------------- schema

function asObject(schema: unknown, label: string): z.AnyZodObject {
  if (!(schema instanceof z.ZodObject)) throw new Error(`Setup round 2: ${label} is not an object schema`);
  return schema;
}

function asArray(schema: unknown, label: string): z.ZodArray<z.ZodTypeAny> {
  if (!(schema instanceof z.ZodArray)) throw new Error(`Setup round 2: ${label} is not an array schema`);
  return schema;
}

/**
 * A7's three fields on the base's instances, where the schema has them (an
 * AI Iteration schema is cut to its sections): the guidelines' thread types
 * and instructions, and the one stat instance both stat lists share. Caps
 * only, matching the counts in words.
 */
function withSteering(schema: z.AnyZodObject, on: On, fallback: boolean): z.AnyZodObject {
  const shape = schema.shape;
  const fields: z.ZodRawShape = {};
  if (shape.guidelines) {
    const guidelines = asObject(shape.guidelines, "guidelines");
    fields.guidelines = guidelines.extend({
      typesOfThreads: asArray(guidelines.shape.typesOfThreads, "typesOfThreads").max(8).describe(threadTypesText(on)),
      switchAndThreadInstructions: asArray(guidelines.shape.switchAndThreadInstructions, "switchAndThreadInstructions").max(4).describe(instructionsText(on, fallback)),
    });
  }
  if (shape.sharedStats) {
    const stat = asObject(asArray(shape.sharedStats, "sharedStats").element, "stat");
    const steering = stat.extend({ narrativeImplications: asArray(stat.shape.narrativeImplications, "narrativeImplications").max(3).describe(IMPLICATIONS) });
    fields.sharedStats = z.array(steering).describe(shape.sharedStats.description ?? "");
    fields.playerStats = z.array(steering).describe(asArray(shape.playerStats, "playerStats").description ?? "");
  }
  return schema.extend(fields);
}

const slotsOf = (shape: z.ZodRawShape) => Object.keys(shape).filter((key) => PLAYER_SLOTS.includes(key));

/** A list of another element under the same cap and description (a list's cap is its schema's own maxItems). */
function sameList(list: z.ZodArray<z.ZodTypeAny>, element: z.ZodTypeAny): z.ZodArray<z.ZodTypeAny> {
  const cap = list._def.maxLength?.value;
  const copy = z.array(element);
  return (cap === undefined ? copy : copy.max(cap)).describe(list.description ?? "");
}

/**
 * A9's generation-only order: guidelines (world to decisions), difficulty,
 * on a base with proposal 1's seat roles (the slate) A9's playerRoles in
 * multiplayer, story elements, shared outcomes, each seat's outcomes, stats,
 * the balance plan, identities and backgrounds, then the thread design, and
 * the title, introduction and images. The stat groups and the empty milestone
 * lists are left out (assembly adds them back). Without the seat roles (round
 * 2 as it ran) the plan keeps production's multiplayerCoordination, where A9
 * puts the plan; with them, playerRoles replaces it (A9), and assembly saves
 * the roles there. A shared list only where the base has one (the slate gives
 * a single player none, S7). Every field keeps arm A's instance, text and caps.
 */
function generationOrderSchema(schema: z.AnyZodObject, kind: "story" | "template", players: PlayerCount, roles: boolean): z.AnyZodObject {
  const shape = schema.shape;
  const guidelines = asObject(shape.guidelines, "guidelines");
  const seat = asObject(shape.player1, "player1");
  const seatOutcomes = asArray(seat.shape.outcomes, "outcomes");
  const outcome = asObject(seatOutcomes.element, "outcome");
  const written = outcome.omit({ milestones: true }).describe(outcome.description ?? "");
  const ownList = sameList(seatOutcomes, written);
  const seatWritten = seat.omit({ outcomes: true });
  const slots = slotsOf(shape);
  const plan = asObject(shape.characterSelectionPlan, "characterSelectionPlan");
  const playerRoles: z.ZodRawShape = roles && players > 1 ? { playerRoles: z.array(z.string()).max(players).describe(PLAYER_ROLES) } : {};
  const sharedOutcomes: z.ZodRawShape = shape.sharedOutcomes ? { sharedOutcomes: sameList(asArray(shape.sharedOutcomes, "sharedOutcomes"), written) } : {};
  const fields: z.ZodRawShape = {
    guidelines: guidelines.omit({ typesOfThreads: true, switchAndThreadInstructions: true }),
    ...(kind === "story" ? { difficultyLevel: shape.difficultyLevel } : { difficultyLevels: shape.difficultyLevels, teaser: shape.teaser }),
    ...playerRoles,
    storyElements: shape.storyElements,
    ...sharedOutcomes,
    playerOutcomes: z.object(Object.fromEntries(slots.map((slot) => [slot, ownList]))).describe(PLAYER_OUTCOMES),
    sharedStats: shape.sharedStats,
    playerStats: shape.playerStats,
    characterSelectionPlan: roles ? plan.omit({ multiplayerCoordination: true }) : plan,
    ...Object.fromEntries(slots.map((slot) => [slot, seatWritten])),
    threadDesign: z
      .object({ typesOfThreads: guidelines.shape.typesOfThreads, switchAndThreadInstructions: guidelines.shape.switchAndThreadInstructions })
      .describe(THREAD_DESIGN),
    title: shape.title,
    characterSelectionIntroduction: shape.characterSelectionIntroduction,
    imageInstructions: shape.imageInstructions,
  };
  return z.object(fields).describe(schema.description ?? "");
}

// ---------------------------------------------------------------- assembly

type Loose = Record<string, unknown>;
const asRecord = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});
const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** The stat groups as template generation recomputes them (TemplateService.extractStatGroups): each stat's group once, in order, else "General". */
function statGroupsOf(...lists: unknown[]): string[] {
  const groups = new Set<string>();
  for (const stat of lists.flatMap(asList)) {
    const group = asRecord(stat).group;
    if (typeof group === "string" && group.trim() !== "") groups.add(group);
  }
  return groups.size ? [...groups] : ["General"];
}

/** Every outcome with its empty milestone list, which every later prompt reads unguarded (setup doc B9.4). */
const withMilestones = (list: unknown) => asList(list).map((outcome) => ({ ...asRecord(outcome), milestones: [] }));

/**
 * A reply in the generation order, as the fields saved today and in today's
 * key order (A9's assembly): the thread design back into the guidelines,
 * each seat's outcomes back on its seat, empty milestone lists on every
 * outcome, and the stat groups recomputed. A9's seat roles, where the reply
 * has them, go where the base keeps them, in the plan's
 * multiplayerCoordination (a single player's stays empty); a shared list only
 * where the reply has one (the schema asks for every key it has).
 */
export function assembleGenerationOrder(reply: unknown, playerCount: PlayerCount, kind: "story" | "template"): Loose {
  const written = asRecord(reply);
  const own = asRecord(written.playerOutcomes);
  const slots = PLAYER_SLOTS.slice(0, playerCount);
  const difficulty = kind === "story" ? { difficultyLevel: written.difficultyLevel } : { difficultyLevels: written.difficultyLevels, teaser: written.teaser };
  const plan = asRecord(written.characterSelectionPlan);
  const roles = "multiplayerCoordination" in plan ? {} : { multiplayerCoordination: asList(written.playerRoles) };
  return {
    guidelines: { ...asRecord(written.guidelines), ...asRecord(written.threadDesign) },
    ...difficulty,
    storyElements: written.storyElements,
    ...("sharedOutcomes" in written ? { sharedOutcomes: withMilestones(written.sharedOutcomes) } : {}),
    statGroups: statGroupsOf(written.sharedStats, written.playerStats),
    sharedStats: written.sharedStats,
    playerStats: written.playerStats,
    characterSelectionPlan: "multiplayerCoordination" in plan ? written.characterSelectionPlan : { ...roles, ...plan },
    ...Object.fromEntries(slots.map((slot) => [slot, { outcomes: withMilestones(own[slot]), ...asRecord(written[slot]) }])),
    title: written.title,
    characterSelectionIntroduction: written.characterSelectionIntroduction,
    imageInstructions: written.imageInstructions,
  };
}

// ---------------------------------------------------------------- requests

/**
 * Round 2's request for a new custom story or template from a premise, in one
 * of the two arms, on a base of round 1's parts: round 2 as it ran on
 * PASSING_ROUND1_PARTS (the default), round 2b on ROUND2B_BASE_PARTS.
 */
export function setupRound2Request(
  premise: string,
  playerCount: PlayerCount,
  gameMode: GameMode,
  maxTurns: number,
  kind: "story" | "template",
  order: Round2Order,
  parts: Round1Parts = PASSING_ROUND1_PARTS
): Round2Request {
  const base = setupRequestFromRound1(premise, playerCount, gameMode, maxTurns, kind, parts);
  const on: On = { players: playerCount, mode: gameMode };
  const prompt = round2Prompt(base.prompt, true, parts);
  const schema = asObject(base.schema, "setup");
  if (order === "fieldOrder") return { prompt, schema: withSteering(schema, on, true) };
  return {
    prompt,
    schema: generationOrderSchema(withSteering(schema, on, false), kind, playerCount, parts.slate),
    assemble: (reply) => assembleGenerationOrder(reply, playerCount, kind),
  };
}

/**
 * Round 2's AI Iteration request: arm A's text on today's field list and
 * order (A9 leaves iteration out). The fallback line only where the stats are
 * written in the same reply, after the rules; otherwise they stand in the
 * template above.
 */
export function iterationRound2Request(
  feedback: string,
  playerCount: PlayerCount,
  gameMode: GameMode,
  maxTurns: number,
  sections: string[],
  template: object,
  parts: Round1Parts = PASSING_ROUND1_PARTS
): TextRequest {
  const base = iterationRequestFromRound1(feedback, playerCount, gameMode, maxTurns, sections, template, parts);
  const on: On = { players: playerCount, mode: gameMode };
  const fallback = sections.includes("guidelines") && sections.includes("stats");
  return { prompt: round2Prompt(base.prompt, false, parts), schema: withSteering(asObject(base.schema, "iteration"), on, fallback) };
}
