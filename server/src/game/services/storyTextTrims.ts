import { z } from "zod";
import type { Story } from "core/models/Story.js";
import { PLAYER_SLOTS, type GameMode, type PlayerCount } from "core/types/index.js";
import { beatStep, setupStep, switchStep, threadStep, type TextRequest } from "./storyTextSteps.js";

/*
 * Stage 3 of the text-model eval: production's request for an input, minus
 * the planning fields that nothing reads after generation and minus the
 * prompt lines that ask the model to write them. Every rule such a line
 * carried stays. Eval only: the harness's variants.ts is the one caller, and
 * production keeps storyTextSteps.ts as it is.
 *
 * Each trim starts from production's own request. Kept schema fields are
 * production's zod instances; prompt edits are anchored on production's
 * wording, touch only the instructions before the story state or premise,
 * and each must match exactly once, so a production prompt change fails
 * loudly here instead of silently leaving a trim undone. Delete this module
 * once Stage 3 is decided and Stage 4's rewrite supersedes it.
 */

/** slim: beats only, keeps showDontTell and a short options check. minimal: every field Stage 3 may drop. */
export type TrimLevel = "slim" | "minimal";

export type PromptEdit =
  | { name: string; find: string; replace: string }
  /** Replaces from the start of cutFrom up to, not including, cutTo */
  | { name: string; cutFrom: string; cutTo: string; replace: string };

const STATE_MARKER = "======= CURRENT GAME STATE =======";
const SETUP_MARKER = "Remember: everything so far has only been general instructions and examples.";

function onlyIndex(text: string, anchor: string, name: string): number {
  const count = text.split(anchor).length - 1;
  if (count !== 1) throw new Error(`Stage 3 trim "${name}": anchor found ${count} times`);
  return text.indexOf(anchor);
}

function applyEdit(text: string, edit: PromptEdit): string {
  if ("find" in edit) {
    const at = onlyIndex(text, edit.find, edit.name);
    return text.slice(0, at) + edit.replace + text.slice(at + edit.find.length);
  }
  const from = onlyIndex(text, edit.cutFrom, edit.name);
  const to = onlyIndex(text, edit.cutTo, edit.name);
  if (to < from + edit.cutFrom.length) throw new Error(`Stage 3 trim "${edit.name}": cutTo comes before cutFrom ends`);
  return text.slice(0, from) + edit.replace + text.slice(to);
}

/** Applies the edits in order to the text before the first stateMarker; the rest comes back unchanged. */
export function applyPromptEdits(prompt: string, edits: PromptEdit[], stateMarker: string): string {
  const at = prompt.indexOf(stateMarker);
  if (at < 0) throw new Error(`Stage 3 trim: state marker "${stateMarker}" not found`);
  return edits.reduce(applyEdit, prompt.slice(0, at)) + prompt.slice(at);
}

/** The edits whose production branch this input takes. */
const when = (edits: [boolean, PromptEdit][]): PromptEdit[] => edits.filter(([applies]) => applies).map(([, edit]) => edit);

function asObject(schema: unknown, label: string): z.AnyZodObject {
  if (!(schema instanceof z.ZodObject)) throw new Error(`Stage 3 trim: ${label} is not an object schema`);
  return schema;
}

function arrayAt(shape: z.ZodRawShape, key: string): z.ZodArray<z.ZodTypeAny> {
  const schema = shape[key];
  if (!(schema instanceof z.ZodArray)) throw new Error(`Stage 3 trim: ${key} is not an array schema`);
  return schema;
}

function unionAt(shape: z.ZodRawShape, key: string): z.ZodUnion<[z.ZodTypeAny, ...z.ZodTypeAny[]]> {
  const schema = shape[key];
  if (!(schema instanceof z.ZodUnion)) throw new Error(`Stage 3 trim: ${key} is not a union schema`);
  return schema;
}

/** production's object without these fields, which must all exist; key order and description stay. */
function without(schema: z.AnyZodObject, keys: string[]): z.AnyZodObject {
  const missing = keys.filter((key) => !(key in schema.shape));
  if (missing.length) throw new Error(`Stage 3 trim: no field ${missing.join(", ")} to drop`);
  return schema.omit(Object.fromEntries(keys.map((key) => [key, true] as const)));
}

function describedLike<T extends z.ZodTypeAny>(schema: T, source: z.ZodTypeAny): T {
  return source.description === undefined ? schema : schema.describe(source.description);
}

/** The schema with its description edited exactly once. */
function reworded<T extends z.ZodTypeAny>(schema: T, find: string, replace: string): T {
  const description = schema.description ?? "";
  onlyIndex(description, find, `description: ${find}`);
  return schema.describe(description.split(find).join(replace));
}

/** An array of the edited element, with the production array's description. */
function arrayOf(production: z.ZodArray<z.ZodTypeAny>, element: z.ZodTypeAny): z.ZodArray<z.ZodTypeAny> {
  return describedLike(z.array(element), production);
}

/**
 * Replaces each player slot with its trimmed form. Production reuses one
 * schema instance for every slot, so the trim does too; that keeps the JSON
 * schema's shared references, and with them its size, as production sends it.
 */
function withPlayers(root: z.AnyZodObject, production: z.AnyZodObject, trim: (player: z.AnyZodObject) => z.ZodTypeAny): z.AnyZodObject {
  const trimmed = new Map<z.ZodTypeAny, z.ZodTypeAny>();
  const trimOnce = (slot: string): z.ZodTypeAny => {
    const player = production.shape[slot];
    const done = trimmed.get(player) ?? trim(asObject(player, slot));
    trimmed.set(player, done);
    return done;
  };
  const slots = Object.keys(production.shape).filter((key) => PLAYER_SLOTS.includes(key));
  return root.extend(Object.fromEntries(slots.map((slot) => [slot, trimOnce(slot)])));
}

// ---------------------------------------------------------------- beats

const BEAT_PLAN_STRINGS = [
  "forPlayer",
  "developmentsToNarrate",
  "beatTypeConsiderations",
  "otherBeats",
  "worldBuilding",
  "showDontTellPreviousDecision",
];

/** optionConsiderations cut to previousOptionsToAvoid and upToOneSacrificeOrRewardOption (A6). */
function slimOptionConsiderations(plan: z.AnyZodObject): z.ZodTypeAny {
  const union = unionAt(plan.shape, "optionConsiderations");
  const [text, detailed] = union.options;
  const short = without(asObject(detailed, "optionConsiderations object"), [
    "keyConflictsAndDecisions",
    "phaseRequirements",
    "statsAffectingOptions",
  ]);
  return describedLike(z.union([text, short]), union);
}

function trimmedBeat(player: z.AnyZodObject, level: TrimLevel): z.AnyZodObject {
  const plan = asObject(player.shape.plan, "plan");
  if (level === "slim") {
    return player.extend({
      plan: without(plan, BEAT_PLAN_STRINGS).extend({ optionConsiderations: slimOptionConsiderations(plan) }),
    });
  }
  return player.extend({
    plan: without(plan, [...BEAT_PLAN_STRINGS, "showDontTell", "optionConsiderations"]),
    text: reworded(
      player.shape.text,
      "Follow the 'show don't tell' elements that you generated for the 'plan' attribute.",
      "Follow the principle of 'show don't tell'."
    ),
  });
}

function beatEdits(story: Story, level: TrimLevel): PromptEdit[] {
  const multiplayer = story.isMultiplayer();
  const notEnding = story.getCurrentBeatType() !== "ending";
  const minimal = level === "minimal";
  return when([
    [true, { name: "B1 stats list step", cutFrom: "1. IDENTIFY STATS AND STORY ELEMENTS", cutTo: "IDENTIFY CHANGES TO THE STORY STATE BASED", replace: "1. " }],
    // The rule B1's step carried, which nothing else in the prompt states (the first beat's version has none)
    [
      !story.isFirstBeat(),
      {
        name: "B1b stats shape the narration",
        find: "- There should always be clear narrative feedback for players' decisions.",
        replace:
          "- There should always be clear narrative feedback for players' decisions.\n" +
          "- Let the stats and story elements involved shape how the previous beat's resolution came about and what it covers (a bodyguard might be injured; with low stealth, an escape owes something to luck).",
      },
    ],
    [multiplayer, { name: "B2 multiplayer coordination step", cutFrom: "\n\n3. MULTIPLAYER COORDINATION", cutTo: "\n\n4. GENERATE ONE STORY BEAT", replace: "" }],
    [
      true,
      {
        name: "B3 beat step number",
        find: `${multiplayer ? "4" : "3"}. GENERATE ONE STORY BEAT FOR EACH PLAYER`,
        replace: "2. GENERATE ONE STORY BEAT FOR EACH PLAYER",
      },
    ],
    [
      multiplayer,
      {
        name: "B4 other beats list",
        cutFrom: "Which information from other beats",
        cutTo: "How to flesh out the game world",
        replace:
          "Keep this beat consistent with the beats you already created for other players in this turn, especially when several players are in the same thread or switch.\n\n",
      },
    ],
    [
      minimal,
      {
        name: "B5 show-don't-tell list",
        cutFrom: "Create a list of the three most important actions",
        cutTo: "the players performing the action that they chose",
        replace: "Show the three most important actions and developments in this beat instead of telling them.\nStart with ",
      },
    ],
    [
      notEnding,
      {
        name: "B6 options check",
        find: "What should we consider as we create the options for this beat? Cover the following points:",
        replace: "When you design the options for this beat, consider the following:",
      },
    ],
    [minimal, { name: "B7 show-don't-tell reference", find: "--- Use the list of 'show don't tell' instructions that you generated in the plan for the beat.\n", replace: "" }],
    [
      multiplayer && notEnding,
      {
        name: "B8 coordination in options",
        find: "- Take the multiplayer coordination for this set of beats into account. If several players are on the same side in a thread, this will ensure that their options are meaningfully different and both consistent and coordinated with each other.",
        replace: "- If several players are on the same side in a thread, make their options meaningfully different and both consistent and coordinated with each other.",
      },
    ],
    [multiplayer && notEnding, { name: "B9 coordination notes", find: " The multiplayer coordination analysis for this set of beats has notes on how to avoid this.", replace: "" }],
  ]);
}

export function trimmedBeatRequest(story: Story, level: TrimLevel): TextRequest {
  const production = beatStep.request(story);
  const root: z.AnyZodObject = production.schema;
  return {
    prompt: applyPromptEdits(production.prompt, beatEdits(story, level), STATE_MARKER),
    schema: withPlayers(without(root, ["statsAffectingDecisionConsequences", "multiplayerCoordination"]), root, (player) =>
      trimmedBeat(player, level)
    ),
  };
}

// ---------------------------------------------------------------- switch

function switchEdits(story: Story): PromptEdit[] {
  const opening = story.isMultiplayer() && story.getCurrentTurn() === 0;
  return when([
    [true, { name: "S1 step 1", find: "1. Determine the story situation for each player", replace: "1. Decide for each player whether the next switch is a flavor switch or a topic switch" }],
    [
      opening,
      {
        name: "S2 opening analysis",
        cutFrom: "a) Continuity. Since this is the beginning of the story",
        cutTo: "\n\n2. Determine switch coordination between players",
        replace: "This is a multiplayer game. The first thread should always be a grouped thread with all players, so every player gets a flavor switch.",
      },
    ],
    [!opening, { name: "S3 decision", find: "c) Decision. Justify your choice of using a flavor switch or a topic switch.\n\n", replace: "" }],
    [true, { name: "S4 step reference", find: "Follow steps 1a - c for each player", replace: "Follow step 1 for each player" }],
    [true, { name: "S5 output list", cutFrom: "2. Switch type (topic/flavor) and justification", cutTo: "Relationship to other switches", replace: "2. Switch type (topic/flavor)\n3. " }],
    [
      true,
      {
        name: "S6 directions",
        find: "6. If flavor switch: Outcome/question that will be explored in the next thread. If topic switch: Exactly 3 possible directions that the players can follow.",
        replace:
          "4. If flavor switch: Outcome/question that will be explored in the next thread. If topic switch: Exactly 3 possible directions that the players can follow. Draw on the thread types this story suggests, and avoid thread types the players in this switch had lately.",
      },
    ],
  ]);
}

export function trimmedSwitchRequest(story: Story): TextRequest {
  const production = switchStep.request(story);
  const root: z.AnyZodObject = production.schema;
  const slots = Object.keys(root.shape).filter((key) => PLAYER_SLOTS.includes(key));
  const switches = arrayAt(root.shape, "switches");
  const element = without(asObject(switches.element, "switch"), [
    "relevantSuggestedThreadTypes",
    "previousThreadTypesToBeAvoided",
    "relevantSwitchAndThreadInstructions",
  ]);
  return {
    prompt: applyPromptEdits(production.prompt, switchEdits(story), STATE_MARKER),
    schema: without(root, [...slots, "coordinationPatternAnalysis"]).extend({ switches: arrayOf(switches, element) }),
  };
}

// ---------------------------------------------------------------- thread

function threadEdits(story: Story): PromptEdit[] {
  return when([
    [
      story.isMultiplayer() && story.getCurrentTurn() !== 0,
      {
        name: "T1 set-up summary",
        find: "A summary of how you want to set up the threads based on the switch configuration and player choices.",
        replace: "Set up the threads based on the switch configuration and player choices.",
      },
    ],
    [
      true,
      {
        name: "T2 thread type lists",
        cutFrom: "3. A list of previous thread types",
        cutTo: "Possible milestones that might be added to that outcome",
        replace:
          "3. The type of thread, summarized in a few words. Draw on the thread types this story suggests, and avoid types that the players in this thread had lately. Examples: Romantic Date, Physical Fight, Witness Interview, etc.\n4. ",
      },
    ],
    [true, { name: "T3 progression number", find: "7. A progression of 2-4 beats", replace: "5. A progression of 2-4 beats" }],
  ]);
}

export function trimmedThreadRequest(story: Story): TextRequest {
  const production = threadStep.request(story);
  const root: z.AnyZodObject = production.schema;
  const threads = arrayAt(root.shape, "threads");
  const element = without(asObject(threads.element, "thread"), [
    "previousThreadTypesToBeAvoided",
    "relevantSuggestedThreadTypes",
    "typeOfMilestone",
  ]);
  return {
    prompt: applyPromptEdits(production.prompt, threadEdits(story), STATE_MARKER),
    schema: without(root, ["relevantSwitchAndThreadInstructions", "coordinationPatternSummary"]).extend({
      threads: arrayOf(threads, element),
    }),
  };
}

// ---------------------------------------------------------------- setup

/** The backgrounds without their pointers to the dropped character-selection plan. */
function trimmedSetupPlayer(player: z.AnyZodObject): z.AnyZodObject {
  const backgrounds = arrayAt(player.shape, "possibleCharacterBackgrounds");
  const background = reworded(backgrounds.element, " Consider the background archetypes.", "");
  return player.extend({
    possibleCharacterBackgrounds: reworded(
      arrayOf(backgrounds, background),
      " Implement the background archetypes in the character selection plan.",
      ""
    ),
  });
}

function setupEdits(playerCount: PlayerCount): PromptEdit[] {
  return when([
    [playerCount > 1, { name: "U1 coordination heading", find: "\nmultiplayerCoordination:\n", replace: "\n" }],
    [
      true,
      {
        name: "U2 conversion rates and archetypes",
        cutFrom: "playerStatConversionRates:\n",
        cutTo: "- Example: 'No starting gold, but high reputation and high loyalty'",
        replace: "- Each background should represent a different tradeoff between player stats, with no option clearly better than another.\n",
      },
    ],
  ]);
}

/** A custom story's setup (production's "story" kind). */
export function trimmedSetupRequest(premise: string, playerCount: PlayerCount, gameMode: GameMode, maxTurns: number): TextRequest {
  const production = setupStep.request(premise, playerCount, gameMode, maxTurns, "story");
  const root: z.AnyZodObject = production.schema;
  return {
    prompt: applyPromptEdits(production.prompt, setupEdits(playerCount), SETUP_MARKER),
    schema: withPlayers(without(root, ["characterSelectionPlan"]), root, trimmedSetupPlayer),
  };
}
