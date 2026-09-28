import { z } from "zod";
import type { Story } from "core/models/Story.js";
import {
  createSwitchAnalysisSchema,
  PLAYER_SLOTS,
  switchSchema,
  switchTypeSchema,
  threadSchema,
  type PlayerCount,
  type SwitchAnalysis,
  type ThreadAnalysis,
} from "core/types/index.js";
import { fallbackOutcomeId, outcomesFor, pickedOutcome } from "./pacing.js";

/*
 * The planners' replies, adopted with planner v2 on 2026-09-28 (turn doc A2,
 * A3, A5): lean replies with nothing the game doesn't read, and each put back
 * into today's stored plan shape before the plan check and the story read it
 * (assembleSwitchPlan, assembleThreadPlan).
 * - A switch direction is a sentence plus the one outcome it pushes, from the
 *   story's outcome ids as a list (free text for a story without outcomes);
 *   stored as today's "text (outcome id)" string, with the pair beside it
 *   (`topicDirections`), which the chapter planner's pick reads.
 * - A chapter states its kind first, then its question (nearer than its
 *   outcome's since 2026-09-28, planner v2c) and its kind of milestone, its
 *   milestones, the steps before the last and a last step whose three
 *   results are the milestones, and its plan. A single player's chapter writes no outcome:
 *   the player's pick sets it (pacing.ts, pickedOutcome), or, when the pick
 *   names none the story knows, the fallback the planner's prompt was told
 *   (fallbackOutcomeId). The code fills the
 *   last step's results, the length and the ids. The kind, question and plan
 *   ride along on the stored thread.
 * The eval's form is storyTextRounds/turnRound1Planners.ts (planV2b for the
 * switch, planV2c for the chapter); adoptedPlanners.test.ts holds these equal to it.
 */

const NO_BLANK_ITEMS = "Every item in a list carries real content; a list never holds an empty or blank item.";

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asString = (value: unknown): string => (typeof value === "string" ? value : "");

/** A short id from a title, as today's ids read ("Harnessing Community Support" -> "harnessing_community_support"). */
export function slugOf(title: string, fallback = "thread"): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48)
    .replace(/_+$/g, "");
  return slug || fallback;
}

/** The story's outcome ids, shared first, each once. */
function storyOutcomeIds(story: Story): string[] {
  return [...new Set(story.getPlayerSlots().flatMap((slot) => outcomesFor(story, slot).map((o) => o.id)))];
}

/** An enum of the story's outcome ids (and ""), or free text for a story without outcomes (A2). */
function outcomeIdSchema(ids: string[], withEmpty: boolean): z.ZodTypeAny {
  const values = withEmpty ? [...ids, ""] : ids;
  const [first, ...rest] = values;
  return ids.length === 0 || first === undefined ? z.string() : z.enum([first, ...rest]);
}

// ---------------------------------------------------------------- the switch

const DIRECTION = z
  .string()
  .describe(
    "One direction as the player will read it: a concrete next move that names a person, place, lead or problem from the story (a story element, a fact that is a hook, or a consequence of the last thread). One sentence, no ids and no game words. Weak: 'Work on who you want to become.' (restates the outcome) Good: 'Meet Zelda at the print shop and ask why she left the movement.'"
  );

function topicChoicesSchema(ids: string[]) {
  return z
    .array(
      z.object({
        direction: DIRECTION,
        outcomeId: outcomeIdSchema(ids, false).describe(
          "The id of the one outcome whose next milestone this direction's thread would decide, exactly as the OUTCOMES sections list it."
        ),
      })
    )
    .max(3)
    .describe(
      `Topic switch: three directions, in the order the player will see them. While the player has three outcomes that still need milestones (see PACING), each direction pushes a different one, and each is a different thread type. When the last thread was about the story's main conflict (PACING marks the main outcome), one direction is personal (a friend, a relationship, a doubt); when it was personal, one returns to the main conflict, as far as step b's priority allows. ${NO_BLANK_ITEMS} Flavor switch: leave empty.`
    );
}

function switchFields(ids: string[]) {
  return {
    type: switchTypeSchema,
    outcomeId: outcomeIdSchema(ids, true).describe("Flavor switch: the id of the outcome the next thread must push. Topic switch: empty."),
    question: z.string().describe("Flavor switch: the question the next thread explores about that outcome. Topic switch: empty."),
    topicChoices: topicChoicesSchema(ids),
  };
}

const SWITCH_TITLE = z.string().describe("The switch's title, shown as the beat's title: a chapter or episode title.");

/** The switch planner's reply: one switch for a single player, a list of switches for a group. */
export function switchReplySchema(story: Story): z.AnyZodObject {
  const ids = storyOutcomeIds(story);
  if (!story.isMultiplayer()) return z.object({ switch: z.object({ ...switchFields(ids), title: SWITCH_TITLE }) });
  const element = z.object({
    players: switchSchema.shape.players,
    ...switchFields(ids),
    relationshipToOtherSwitches: switchSchema.shape.relationshipToOtherSwitches,
    title: SWITCH_TITLE,
  });
  const today = createSwitchAnalysisSchema(story.getNumberOfPlayers() as PlayerCount);
  return z.object({
    coordinationPatternSummary: today.shape.coordinationPatternSummary,
    switches: z.array(element).max(3).describe(`One switch for each group of players; every player is in exactly one. ${NO_BLANK_ITEMS}`),
  });
}

/** A written switch in today's stored shape, its directions as "text (outcome id)" strings and, beside them, as written. */
function storedSwitch(written: Loose, players: string[], relationship: string): Loose {
  const directions = asArray(written.topicChoices).map((d) => ({ direction: asString(asObject(d).direction), outcomeId: asString(asObject(d).outcomeId) }));
  const type = asString(written.type);
  return {
    players,
    type,
    relevantSuggestedThreadTypes: [],
    previousThreadTypesToBeAvoided: [],
    relevantSwitchAndThreadInstructions: asString(written.relevantSwitchAndThreadInstructions),
    outcomeId: type === "flavor" ? asString(written.outcomeId) : "",
    question: type === "flavor" ? asString(written.question) : "",
    topicChoices: directions.map((d) => (d.outcomeId ? `${d.direction} (${d.outcomeId})` : d.direction)),
    topicDirections: directions,
    relationshipToOtherSwitches: relationship,
    title: asString(written.title),
    id: slugOf(asString(written.title), "switch"),
  };
}

/** A switch planner's reply as the switch plan the story stores. */
export function assembleSwitchPlan(story: Story, parsed: unknown): SwitchAnalysis {
  const reply = asObject(parsed);
  if (!story.isMultiplayer()) {
    return {
      coordinationPatternAnalysis: "single-player",
      coordinationPatternSummary: "single-player",
      switches: [storedSwitch(asObject(reply.switch), ["player1"], "single-player")],
    } as unknown as SwitchAnalysis;
  }
  return {
    coordinationPatternAnalysis: "",
    coordinationPatternSummary: asString(reply.coordinationPatternSummary),
    switches: asArray(reply.switches).map((s) => {
      const written = asObject(s);
      return storedSwitch(written, asArray(written.players).map(asString), asString(written.relationshipToOtherSwitches));
    }),
  } as unknown as SwitchAnalysis;
}

// ---------------------------------------------------------------- the chapter

const TODAY_STEP = threadSchema.shape.progression.element;
const STEP_RESULTS = TODAY_STEP.shape.possibleResolutions;
const [CHALLENGE_STEP_RESULTS, , EXPLORATION_STEP_RESULTS] = STEP_RESULTS.options;

/** The chapter's question, nearer than its outcome's (planner v2c, the owner's feedback of 2026-09-28). */
const QUESTION =
  "The one question this thread decides, nearer than its outcome's: its three possible milestones are the answers, and each is one milestone of the outcome. Ask it about this thread's own situation (a place, a person, a deadline, an object), in the story's own names, so that its beats can answer it; never the outcome's question reworded. After a flavor switch: the switch's question, narrowed to this thread. After a topic switch: the chosen direction, asked as a question. Weak: 'Will Rikkit stop the noble's conspiracy?' (the outcome's question) Good: 'Will Rikkit get the noble's letters out of the manor before the guards change shifts?'";
/** The kind of milestone, written by the planner (stored as the thread's typeOfMilestone) instead of copied from the question. */
const MILESTONE_KIND =
  "The kind of milestone this thread adds to its outcome: the concrete thing its answer settles, in a few words and the story's own names. Weak: 'progress toward stopping the conspiracy'. Good: 'whether the letters prove the noble's hand in the conspiracy'.";
const PLAN = (multiplayer: boolean) =>
  `The plan for the storyteller who writes this thread's beats; they read it at every step. Two or three sentences: the one situation the thread stays in and who pushes back, how it rises to its last step, and what the player can win or lose.${
    multiplayer ? " In multiplayer, also what each player does." : ""
  } No ids.`;

const event = (result: string) => `The milestone if ${result}: an event that happened, naming who did what, sized as the milestone rule says.`;

const CHALLENGE_MILESTONES = z
  .object({
    favorable: z
      .string()
      .describe(
        `${event("the thread ends favorably")} Weak: 'The group makes progress with the Guild.' Good: 'Threatened by the enclave's strike, Sir Bram suspends the Guild's bounty on goblins for one season.'`
      ),
    mixed: z.string().describe(event("the thread ends mixed")),
    unfavorable: z.string().describe(event("the thread ends unfavorably")),
  })
  .describe("Milestones for a challenge thread.");
const CONTEST_MILESTONES = z
  .object({
    sideAWins: z.string().describe("The milestone if side A wins the thread: an event that happened, naming who did what."),
    mixed: z.string().describe("The milestone on a draw: an event that happened, naming who did what."),
    sideBWins: z.string().describe("The milestone if side B wins the thread: an event that happened, naming who did what."),
  })
  .describe("Milestones for a contest thread.");
const path = (n: string) => `The milestone if the player's final choice takes the ${n} path. The three are paths toward the outcome's three resolutions, in the same order.`;
const EXPLORATION_MILESTONES = z
  .object({ resolution1: z.string().describe(path("first")), resolution2: z.string().describe(path("second")), resolution3: z.string().describe(path("third")) })
  .describe("Milestones for an exploration thread.");

const MILESTONES_DESCRIPTION = "One of these is added to the thread's outcome when the thread ends; they are the last step's three results.";

/** A chapter's title: its beats add their own number, so the title carries none (one plan in about 40 wrote "6. …"). */
const THREAD_TITLE = "The thread's title, without a number: its beats show it with their number.";

function stepSchema(multiplayer: boolean) {
  const results = multiplayer ? STEP_RESULTS : z.union([CHALLENGE_STEP_RESULTS, EXPLORATION_STEP_RESULTS]).describe(STEP_RESULTS.description ?? "");
  return z.object({
    title: TODAY_STEP.shape.title,
    question: z
      .string()
      .describe(
        multiplayer
          ? "How the players act in this step, as 'Title: Question'. In a contest, the question is asked of both sides by name. Bad: 'What do [insert player names] find in the cellar?' Good: 'Investigation: How do [insert player names] search for clues in the cellar?'"
          : "How the player acts in this step, as 'Title: Question'. Bad: 'What does Rikkit find in the cellar?' Good: 'Investigation: How does Rikkit search for clues in the cellar?'"
      ),
    possibleResolutions: results,
  });
}

function threadFields(multiplayer: boolean) {
  return {
    kind: (multiplayer ? z.enum(["challenge", "contest", "exploration"]) : z.enum(["challenge", "exploration"])).describe(
      "The thread's kind, by the kind rule (the outcome decides it, not the thread type). Decide it first: the milestones and the steps below use its result names."
    ),
    typeOfThread: z
      .string()
      .describe(
        "The thread type: preferably the name part of one of the story's thread types (the words before any parenthesis), one whose kind fits when the story names one; otherwise a few words (Chase, Negotiation, Fight). Not one of the player's last three (PREVIOUS THREAD TYPES)."
      ),
    title: z.string().describe(THREAD_TITLE),
    question: z.string().describe(QUESTION),
    typeOfMilestone: z.string().describe(MILESTONE_KIND),
    possibleMilestones: (multiplayer ? z.union([CHALLENGE_MILESTONES, CONTEST_MILESTONES, EXPLORATION_MILESTONES]) : z.union([CHALLENGE_MILESTONES, EXPLORATION_MILESTONES])).describe(
      MILESTONES_DESCRIPTION
    ),
    steps: z
      .array(stepSchema(multiplayer))
      .max(3)
      .describe(`The steps before the last one: one for a two-beat thread, two for three beats, three for a four-beat thread. ${NO_BLANK_ITEMS}`),
    finalStep: z
      .object({
        title: TODAY_STEP.shape.title,
        question: z.string().describe(`The decisive moment: how the ${multiplayer ? "players act" : "player acts"} to settle the thread's question.`),
      })
      .describe("The last step. Its three results are the milestones above."),
    plan: z.string().describe(PLAN(multiplayer)),
  };
}

/** The chapter planner's reply: one thread for a single player (no outcome: the pick sets it), a batch for a group. */
export function threadReplySchema(story: Story): z.AnyZodObject {
  if (!story.isMultiplayer()) return z.object({ thread: z.object(threadFields(false)) });
  const ids = storyOutcomeIds(story);
  const sides = { playersSideA: threadSchema.shape.playersSideA, playersSideB: threadSchema.shape.playersSideB };
  const { kind, ...rest } = threadFields(true);
  return z.object({
    grouping: z.string().describe("Which players share which thread, and why, in one or two sentences."),
    duration: z.number().describe("Two, three or four beats, the same for every thread in this batch."),
    threads: z
      .array(
        z.object({
          kind,
          outcomeId: outcomeIdSchema(ids, false).describe("The outcome this thread's players chose, or their switch set, as PLAYER DECISIONS shows."),
          ...sides,
          ...rest,
        })
      )
      .max(PLAYER_SLOTS.length)
      .describe(`The next thread or set of threads, in parallel. Every player is in exactly one thread. ${NO_BLANK_ITEMS}`),
  });
}

/**
 * A written thread in today's stored shape, the last step's results the
 * milestones; kind, question and plan ride along. The kind of milestone is
 * the planner's own, or the question where it wrote none.
 */
function storedThread(written: Loose, outcomeId: string, sideA: string[], sideB: string[]): Loose {
  const milestones = asObject(written.possibleMilestones);
  const final = asObject(written.finalStep);
  const question = asString(written.question);
  const kindOfMilestone = asString(written.typeOfMilestone).trim() || question;
  const steps = asArray(written.steps).map((s) => {
    const step = asObject(s);
    return { title: asString(step.title), question: asString(step.question), possibleResolutions: asObject(step.possibleResolutions) };
  });
  return {
    outcomeId,
    playersSideA: sideA,
    playersSideB: sideB,
    previousThreadTypesToBeAvoided: [],
    relevantSuggestedThreadTypes: [],
    typeOfThread: asString(written.typeOfThread),
    typeOfMilestone: kindOfMilestone,
    possibleMilestones: milestones,
    progression: [...steps, { title: asString(final.title), question: asString(final.question), possibleResolutions: milestones }],
    title: asString(written.title),
    id: slugOf(asString(written.title)),
    kind: asString(written.kind),
    question,
    plan: asString(written.plan),
  };
}

/**
 * A chapter planner's reply as the thread plan the story stores; a single
 * player's chapter takes the outcome the pick set, or the fallback when the
 * pick names none the story knows (pacing.ts), so the plan check never finds
 * an outcome the reply had no field to write.
 */
export function assembleThreadPlan(story: Story, parsed: unknown): ThreadAnalysis {
  const reply = asObject(parsed);
  const restated = asString(reply.relevantSwitchAndThreadInstructions);
  if (!story.isMultiplayer()) {
    const written = asObject(reply.thread);
    const outcomeId = pickedOutcome(story, "player1")?.outcomeId ?? fallbackOutcomeId(story, "player1") ?? "";
    const thread = storedThread(written, outcomeId, ["player1"], []);
    return {
      relevantSwitchAndThreadInstructions: restated,
      coordinationPatternSummary: asString(written.plan),
      duration: (thread.progression as unknown[]).length,
      threads: [thread],
    } as unknown as ThreadAnalysis;
  }
  return {
    relevantSwitchAndThreadInstructions: restated,
    coordinationPatternSummary: asString(reply.grouping),
    duration: typeof reply.duration === "number" ? reply.duration : 0,
    threads: asArray(reply.threads).map((t) => {
      const written = asObject(t);
      return storedThread(written, asString(written.outcomeId), asArray(written.playersSideA).map(asString), asArray(written.playersSideB).map(asString));
    }),
  } as unknown as ThreadAnalysis;
}
