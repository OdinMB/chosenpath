import { z } from "zod";
import type { Story } from "core/models/Story.js";
import { PLAYER_SLOTS, switchSchema, switchTypeSchema, threadAnalysisSchema, threadSchema } from "core/types/index.js";
import { StoryStatePromptService } from "../prompts/StoryStatePromptService.js";
import type { TextRequest } from "../storyTextSteps.js";
// Production's requests as they stood at the round0 prompt state, so planner v2's requests stay as they ran
import { round0SwitchStep as switchStep, round0ThreadStep as threadStep } from "../storyTextRound0/round0Steps.js";
import { outcomesFor, pickedOutcome, switchPacingBlock, threadPacingBlock } from "./pacing.js";
import { replaceOnce, replaceUntil, slugOf, splitAtState } from "./roundEdits.js";

/*
 * Turn round 1's planner v2 (turn doc section 4, round 1; Appendix A2 to A6),
 * an eval-only variant of production's switch and thread analysis requests,
 * in production's one-message shape:
 * - A2: a topic direction is a sentence plus the one outcome it pushes (the
 *   story's outcome ids as a list); code sets the chapter's outcome from the
 *   player's pick, so a single player's chapter plan writes none;
 * - A3: the chapter's question and plan, which the chapter's turns read;
 * - A4: the PACING block, with the owner's binding late pacing (decision 3
 *   (b)): the switch planner's continuity and priority steps, the chapter
 *   planner's length rule (a length PACING allows; the last chapter takes
 *   exactly the turns left) and milestone size rule;
 * - A5: lean replies (no per-player notes, no restated lists, the last step
 *   written as a title and a question whose results are the milestones), and
 *   the planners' view of the state cleaned (the ended chapter's header, the
 *   chosen option only, no image library, and STORY PROGRESS folded into
 *   PACING, which carries the turn and the turns left);
 * - A6: one situation rising to a climax, the kind rule, named-event
 *   milestones, a named character in a single player's examples.
 * `full` keeps the field that restates the story's switch/thread
 * instructions (A5's trigger comparison, lean against full).
 *
 * Each reply is assembled (assemble) into today's stored plan shape, so the
 * game's plan checks, the chains and every reader see what production would
 * store; the round's own fields ride along (topicDirections on a switch;
 * kind, question and plan on a thread). Prompt edits are anchored on
 * production's wording, each exactly once (roundEdits.ts), in the
 * instructions before the state, apart from the state's own sections, which
 * are cut and replaced by the renderer's exact text. Model-facing text says
 * "thread" and "beat" (turn doc Appendix A, vocabulary).
 */

export type AssembledRequest = TextRequest & { assemble: (parsed: unknown) => unknown };

const LABEL = "Turn round 1 planner";
const NO_BLANK_ITEMS = "Every item in a list carries real content; a list never holds an empty or blank item.";

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asString = (value: unknown): string => (typeof value === "string" ? value : "");

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

// ---------------------------------------------------------------- shared text

const CONTEXT_EDITS: [string, string][] = [
  [
    "are a narrative structure of 2-4 beats that push one or more story outcomes closer to their resolution.",
    "are a narrative structure of 2-4 beats that push one story outcome closer to its resolution.",
  ],
];

// ---------------------------------------------------------------- switch planner

/** A4 step a: continuity in its narrow form (replaces the Continuity paragraph and its NOT-list). */
const STEP_A = `a) Continuity. Is the next thread's outcome forced? Only these things force it:
- the last thread's immediate consequences (the player betrayed an NPC, and the NPC strikes back);
- an event the story can't ignore: a stat reaches a threshold its narrative implications name, or a SWITCH/THREAD INSTRUCTION is due (a timing rule, or at the story's first switch an opening rule);
- a change of focus that would make no sense (the player just got past the traps into the mines).
A forced situation makes this a flavor switch on the open outcome it bears on most. If no open outcome fits, keep the switch you would otherwise choose and let the situation shape the next thread. When an instruction says topic switches must offer something (an escape, a feeding thread), make it one of the three directions, on the outcome it bears on most.
Something time-sensitive, a tempting opportunity or a partial failure does not force it: offer it as one of the directions.`;

/** A4 step b, binding (owner, decision 3 (b)); it replaces the "1/4 milestones" example. */
const STEP_B = `b) Priority. Read PACING. When fewer threads are left than milestones still needed, every direction pushes an outcome that still needs milestones, those with no thread yet first; when only one outcome can still get its milestones, a flavor switch on it is right. A complete outcome is offered only when every outcome is complete. A situation step a found forced comes first.`;

const SWITCH_OUTPUT_1P = `The switch:
1. Switch type (topic/flavor)
2. If flavor switch: the outcome and the question the next thread explores. If topic switch: three directions the player can follow, each with the one outcome it pushes.
3. A title

For each direction, think of a thread type that isn't one of the player's last three (PREVIOUS THREAD TYPES) and, where one fits, is one of the story's thread types.`;

const SWITCH_OUTPUT_MP = `A list of switches, including

1. Which players are linked to this switch
2. Switch type (topic/flavor)
3. Relationship to other switches
4. If flavor switch: the outcome and the question the next thread explores. If topic switch: three directions the players can follow, each with the one outcome it pushes.
5. A title

For each direction, think of a thread type that isn't one of the players' last three (PREVIOUS THREAD TYPES) and, where one fits, is one of the story's thread types.`;

function switchInstructions(production: string, story: Story): string {
  const opening = story.isMultiplayer() && story.getCurrentTurn() === 0;
  let text = production;
  for (const [find, replace] of CONTEXT_EDITS) text = replaceOnce(LABEL, text, find, replace);
  text = replaceOnce(
    LABEL,
    text,
    `For each outcome that this thread is about, the thread poses a question: "Which of these possible milestones will be added to that outcome at the end of the thread?"`,
    "The thread poses one question about its outcome: which of its possible milestones will the outcome get at the end of the thread?"
  );
  text = replaceOnce(LABEL, text, "A thread can have one or more players involved. It can pose questions relating to one or more outcomes.", "A thread can have one or more players involved.");
  // A2: nothing records a topic switch as a milestone
  text = replaceUntil(LABEL, text, "Topic switches can be used to identify a player's priorities.", "Flavor switches: When the focused outcome", "");
  text = replaceOnce(LABEL, text, "1. Determine the story situation for each player", "1. Decide for each player whether the next switch is a flavor switch or a topic switch");
  if (opening) {
    // The lean reply has no per-player notes to write "introduction" into; the rule itself stays in step 2 b
    text = replaceUntil(
      LABEL,
      text,
      "a) Continuity. Since this is the beginning of the story",
      "\n\n2. Determine switch coordination between players",
      "Every player gets a flavor switch, since the first thread is one grouped thread (step 2 b)."
    );
    text = replaceOnce(LABEL, text, "\n\nSince this will be the first thread of a multiplayer game, ALL players MUST be in a SINGLE GROUPED THREAD together.", "");
  } else {
    text = replaceUntil(LABEL, text, "a) Continuity. Based on the ", "\n\nb) Priority.", STEP_A);
    text = replaceUntil(LABEL, text, "b) Priority. Is there any outcome/question pair", "\n\nOnly mark an outcome/question pair", STEP_B);
    // Binding priority is arithmetic, not narrative: the old line would contradict step b
    text = replaceOnce(LABEL, text, "Only mark an outcome/question pair as important for Continuity or Priority if it is forced as a next thread for narrative reasons.\n", "");
    text = replaceOnce(LABEL, text, "c) Decision. Justify your choice of using a flavor switch or a topic switch.\n\n", "");
  }
  text = replaceOnce(LABEL, text, "Follow steps 1a - c for each player", "Follow step 1 for each player");
  text = replaceUntil(LABEL, text, "A list of switches, including", "\n\nEXAMPLE OUTPUT:", story.isMultiplayer() ? SWITCH_OUTPUT_MP : SWITCH_OUTPUT_1P);
  if (!story.isMultiplayer()) {
    text = replaceOnce(
      LABEL,
      text,
      "Coordination pattern: Single-player story: player1 gets one switch.\n\nSwitch 1:\n- Type: Topic switch (Justification: Nothing forces the focus of the next thread, so the player chooses it)\n- Topic choices: 3 directions, each pushing a different outcome/question",
      "Switch:\n- Type: Topic switch (nothing forces the focus of the next thread, so the player chooses it)\n- Topic choices: three directions, each with the one outcome it pushes"
    );
  }
  return text;
}

/** The switch planner's state: STORY PROGRESS becomes PACING; no image library; the ended chapter named as such, with its chosen option only. */
function switchState(state: string, story: Story): string {
  let text = replaceOnce(LABEL, state, StoryStatePromptService.createStoryStatePrompt(story, { storyProgress: true }), `\n${switchPacingBlock(story)}\n`);
  const library = StoryStatePromptService.createStoryStatePrompt(story, { imageLibrary: true });
  if (library) text = replaceOnce(LABEL, text, `${library}\n`, "");
  if (text.includes("======= CURRENT THREAD CONFIGURATION =======")) {
    text = replaceOnce(LABEL, text, "======= CURRENT THREAD CONFIGURATION =======", "======= THE THREAD THAT JUST ENDED =======");
  }
  return text.replace(/NOT CHOSEN \(ignore for storytelling purposes;[^\n]*\n(?:- [^\n]*\n)*/g, "");
}

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

const RESTATED_INSTRUCTIONS = switchSchema.shape.relevantSwitchAndThreadInstructions;

function switchFields(ids: string[], full: boolean) {
  return {
    ...(full ? { relevantSwitchAndThreadInstructions: RESTATED_INSTRUCTIONS } : {}),
    type: switchTypeSchema,
    outcomeId: outcomeIdSchema(ids, true).describe("Flavor switch: the id of the outcome the next thread must push. Topic switch: empty."),
    question: z.string().describe("Flavor switch: the question the next thread explores about that outcome. Topic switch: empty."),
    topicChoices: topicChoicesSchema(ids),
  };
}

const SWITCH_TITLE = z.string().describe("The switch's title, shown as the beat's title: a chapter or episode title.");

function switchReplySchema(story: Story, full: boolean): z.AnyZodObject {
  const ids = storyOutcomeIds(story);
  if (!story.isMultiplayer()) return z.object({ switch: z.object({ ...switchFields(ids, full), title: SWITCH_TITLE }) });
  const players = switchSchema.shape.players;
  const element = z.object({
    players,
    ...switchFields(ids, full),
    relationshipToOtherSwitches: switchSchema.shape.relationshipToOtherSwitches,
    title: SWITCH_TITLE,
  });
  const production = switchStep.request(story).schema;
  return z.object({
    coordinationPatternSummary: production.shape.coordinationPatternSummary,
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

function assembleSwitch(story: Story, parsed: unknown): unknown {
  const reply = asObject(parsed);
  if (!story.isMultiplayer()) {
    return {
      coordinationPatternAnalysis: "single-player",
      coordinationPatternSummary: "single-player",
      switches: [storedSwitch(asObject(reply.switch), ["player1"], "single-player")],
    };
  }
  return {
    coordinationPatternAnalysis: "",
    coordinationPatternSummary: asString(reply.coordinationPatternSummary),
    switches: asArray(reply.switches).map((s) => {
      const written = asObject(s);
      return storedSwitch(written, asArray(written.players).map(asString), asString(written.relationshipToOtherSwitches));
    }),
  };
}

/** Planner v2's switch analysis request (lean, or `full` with the restated instructions). */
export function plannerV2SwitchRequest(story: Story, full: boolean): AssembledRequest {
  const production = switchStep.request(story);
  const { instructions, state } = splitAtState(LABEL, production.prompt);
  return {
    prompt: switchInstructions(instructions, story) + switchState(state, story),
    schema: switchReplySchema(story, full),
    assemble: (parsed) => assembleSwitch(story, parsed),
  };
}

// ---------------------------------------------------------------- chapter planner

/** A4's length rule; replaces the ~30/50/20% shares' closing lines (the chapter types under each length stay). */
const LENGTH_RULE =
  "Choose the length from what the thread is: two beats for a transaction, a breather or a personal moment; three for a challenge; four for a showdown, or for the thread that settles an outcome's last open milestone. If the story's thread types or SWITCH/THREAD INSTRUCTIONS give this thread type a length, use it. Read PACING: choose one of the lengths it allows, and when it says this is the story's last thread, use exactly its number of beats and make the thread the story's climax.";

/** A4's milestone size rule. */
const MILESTONE_SIZE =
  "Size them to what PACING says the outcome still needs: while it needs more than one, each is one step toward a resolution; when this is its last one, each settles the outcome in its own direction; when the outcome is already complete, each is an aftermath that confirms or complicates the resolution its milestones already point to.";

/** A6's kind rule (the setup document's A8 text), with its contest half in multiplayer only. */
const KIND_RULE_1P =
  "As a rule, match the thread's kind to the outcome it pushes: favorable/mixed/unfavorable resolutions → Challenge thread; three paths → Exploration thread.";
const KIND_RULE_MP =
  "As a rule, match the thread's kind to the outcome it pushes: favorable/mixed/unfavorable resolutions → Challenge thread; Side A/Side B resolutions → Contest thread (in a two-player game, player1 is always Side A and player2 Side B, so the result matches the outcome's sides and its scoreboard); three paths → Exploration thread. An outcome whose three paths name which player wins is a contest: run it as Contest threads between the players taking part.";
/** A6's interim three-player race (the setup document's decision 3 keeps option (a): three-player races approximate). */
const RACE_RULE =
  "A race between three players (an outcome whose three paths each name a player who wins) is run as Contest threads between two of the racing players at a time; the lower player slot is Side A, and the third player gets a thread of their own in this batch. The milestones name who won. Never run a race as an Exploration thread.";

/**
 * Two-sided contests only (owner, 2026-09-28: no contests of three or more
 * parties, an accepted engine limit): the race rule and the three-path
 * contest line go; with three players, the sides are the setup's two camps
 * (setup round 3), player1's camp on Side A.
 */
const TWO_SIDES = "A contest always has exactly two sides.";
const TWO_PLAYER_SIDES = "in a two-player game, player1 is always Side A and player2 Side B";
const CAMP_SIDES = "with three players, the sides are the two camps the outcome's resolutions and its scoreboard name, and player1's camp is always Side A";
const THREE_PATH_CONTEST = " An outcome whose three paths name which player wins is a contest: run it as Contest threads between the players taking part.";
const kindRuleTwoSided = (players: number) => {
  const sided = players === 3 ? replaceOnce(LABEL, KIND_RULE_MP, TWO_PLAYER_SIDES, CAMP_SIDES) : KIND_RULE_MP;
  return `${replaceOnce(LABEL, sided, THREE_PATH_CONTEST, "")} ${TWO_SIDES}`;
};

/** The kind rule and, for three players, the race rule, as planner v2 prints them, or with two-sided contests only. */
function kindRules(story: Story, twoSided: boolean): string {
  if (!story.isMultiplayer()) return KIND_RULE_1P;
  if (twoSided) return kindRuleTwoSided(story.getNumberOfPlayers());
  return `${KIND_RULE_MP}${story.getNumberOfPlayers() === 3 ? `\n${RACE_RULE}` : ""}`;
}

function progressionItem(number: number, multiplayer: boolean): string {
  const who = multiplayer ? "players" : "player";
  return `${number}. A progression of steps, as many as the length, that tells one situation rising to a climax:
   - The thread stays with one situation: the same people, place, rival or problem from step to step. Each step raises the stakes of that situation instead of starting a new activity, and every step stays on the thread's outcome.
   - From the second step on, something pushes back: a rival moves, an ally hesitates, a cost comes due. In challenge${multiplayer ? " and contest" : ""} threads, each result gives an advantage or a disadvantage for the next step without closing it off. In exploration threads, each step's three results are three paths the ${who} can take, and the last step's results lead toward the outcome's three resolutions, in the same order.
   - The last step is the decisive moment: its question brings the thread's question to a head.
   - Each step asks how the ${who} act${multiplayer ? "" : "s"} ("Stealth: How does Rikkit get past the Guild's night watch?").${multiplayer ? " In a contest, every step is the same moment for both sides, and its question names them all." : ""}
   - No step settles the thread early, and the ${who} can't leave or derail it.
   Weak: "Rally supporters" → "Print posters" → "Negotiate with the Guild" (three activities, and the last one belongs to a different question).
   Good: "First impression: How does Rikkit win a hearing with Sir Bram?" → "Leverage: How does Rikkit use what Sir Bram fears?" → "The ask: Sir Bram names his price in front of the Guild. How does Rikkit answer?"`;
}

/**
 * Planner v2c's question item (the owner's feedback of 2026-09-28: a chapter
 * asked its outcome's question again, "Will Arielle uncover enough concrete
 * evidence to expose and dismantle the Clandestine Waste Ring?", with a kind
 * of milestone "marking progress in exposing the Waste Ring"): a nearer
 * question whose answer is one milestone, about the chapter's own situation,
 * and a kind of milestone that names the concrete thing it settles. The
 * example is the prompt's own worked example (Rikkit and the noble's
 * conspiracy), so no stored story's names reach the prompt.
 */
const QUESTION_ITEM_START = "The thread's question and its kind of milestone.";
const NEARER_QUESTION =
  "The question is nearer than its outcome's: its three possible milestones answer it, and each is one milestone of that outcome.";
const CONTEST_QUESTION = " In a contest, it asks which side comes out ahead in this situation.";

function questionItem(number: number, multiplayer: boolean): string {
  const who = multiplayer ? "[insert player names]" : "Rikkit";
  const outcome = multiplayer ? "Will the players stop the noble's conspiracy?" : "Will Rikkit stop the noble's conspiracy?";
  return `${number}. ${QUESTION_ITEM_START} ${NEARER_QUESTION} Ask it about this thread's own situation (a place, a person, a deadline or an object), so that its beats can answer it; never ask the outcome's question again in other words.${
    multiplayer ? CONTEST_QUESTION : ""
  } The kind of milestone names the concrete thing the answer settles, not progress toward the outcome.
   Outcome: "${outcome}" Weak thread question: "Will ${who} find enough evidence to stop the noble's conspiracy?" (the outcome's question again) Good: "Will ${who} get the noble's letters out of the manor before the guards change shifts?", with the kind of milestone "whether the letters prove the noble's hand in the conspiracy", not "progress toward stopping the conspiracy".`;
}

function threadList(multiplayer: boolean, nearer: boolean): string {
  const milestones = `Possible milestones, one of which is added to the outcome when the thread ends. ${MILESTONE_SIZE}`;
  // planV2c inserts its question item before the milestones; the rest renumbers
  const q = nearer ? 1 : 0;
  if (!multiplayer) {
    return `Create the thread, with:
1. The thread's outcome is already set (PLAYER DECISIONS below). Every step and every milestone stays on that outcome.
2. The type of thread.
${nearer ? `${questionItem(3, false)}\n` : ""}${3 + q}. ${milestones}
${progressionItem(4 + q, false)}

`;
  }
  return `Create a list of threads, each with:
1. The outcome ID: for each group of players, the outcome they chose (topic switch) or their switch set (flavor switch), as PLAYER DECISIONS shows. Every step stays on it.
2. Players involved (Side A and, if it's a Contest thread, Side B)
3. The type of thread.
${nearer ? `${questionItem(4, true)}\n` : ""}${4 + q}. ${milestones}
${progressionItem(5 + q, true)}

`;
}

/** A single player's examples with one named character (A6), phrase by phrase: the context's outcome, then the worked example. */
const EXAMPLE_1P_EDITS: [string, string][] = [
  ['("Will [insert player names] unravel the mystery of the dark forest?")', '("Will Rikkit unravel the mystery of the dark forest?")'],
  ["Players (Side A): player1, player2", "Players: player1"],
  ["Outcome: Will the players stop the noble's conspiracy? (with ID shared_uncover_conspiracy)", "Outcome: Will Rikkit stop the noble's conspiracy? (with ID player1_uncover_conspiracy)"],
  ['"The group steals incriminating documents', '"Rikkit steals incriminating documents'],
  ['"The group finds hints', '"Rikkit finds hints'],
  ['"The group flees the noble\'s manor and fails to find', '"Rikkit flees the noble\'s manor and fails to find'],
  ["How do [insert player names] approach the manor's security?", "How does Rikkit approach the manor's security?"],
  ["[insert player names] find a way in but the guards are on higher alert", "Rikkit finds a way in but the guards are on higher alert"],
  ["How do [insert player names] search the study without leaving traces?", "How does Rikkit search the study without leaving traces?"],
  ["[insert player names] find promising leads and the study remains undisturbed", "Rikkit finds promising leads and the study remains undisturbed"],
  ["[insert player names] find some leads but leave signs of searching", "Rikkit finds some leads but leaves signs of searching"],
  ["The study is a mess and [insert player names] alert the household", "The study is a mess and Rikkit alerts the household"],
  ["How do [insert player names] handle the situation?", "How does Rikkit handle the situation?"],
];

function threadInstructions(production: string, story: Story, twoSided: boolean, nearer: boolean): string {
  const multiplayer = story.isMultiplayer();
  let text = production;
  for (const [find, replace] of CONTEXT_EDITS) text = replaceOnce(LABEL, text, find, replace);
  if (!multiplayer) text = replaceOnce(LABEL, text, "A duration for this thread (or set of threads) between 2-4 beats.", "The thread's length: 2 to 4 beats, one step per beat.");
  for (const share of [" (~30% of all threads)", " (~50% of all threads)", " (~20% of all threads)"]) text = replaceOnce(LABEL, text, share, "");
  text = replaceOnce(
    LABEL,
    text,
    "- The duration is the same for all threads in this batch\n- Choose a duration that works for all threads",
    `${LENGTH_RULE}${multiplayer ? " In multiplayer, the length is the same for every thread in this batch." : ""}`
  );
  text = replaceOnce(LABEL, text, "Types of Threads:", "Thread kinds:");
  if (!multiplayer) {
    text = replaceOnce(
      LABEL,
      text,
      `"The group finds the artifact", "The group finds a clue about the artifact's location", "The group fails to find any trace of the artifact"`,
      `"Rikkit finds the artifact", "Rikkit finds a clue about the artifact's location", "Rikkit fails to find any trace of the artifact"`
    );
    text = replaceOnce(
      LABEL,
      text,
      `"[insert player name] takes over the family hotel", "[insert player name] helps at the family hotel while doing occassional photography jobs", "[insert player name] is no longer engaged in the family business"`,
      `"Rikkit takes over the family hotel", "Rikkit helps at the family hotel while doing occasional photography jobs", "Rikkit is no longer engaged in the family business"`
    );
  }
  text = replaceOnce(LABEL, text, "\n- This is the default type of thread. You must have good reasons to use a different type of thread.", "");
  // The kind rule decides when a thread explores; the exploration steps' paths are in the progression item
  text = replaceOnce(LABEL, text, `- Use for character development, or when multiple valid paths exist without clear "better" or "worse" options\n`, "");
  text = replaceOnce(
    LABEL,
    text,
    "- Whenever some resolutions are more desirable than others, use a Challenge or Contest thread instead.\n",
    `\n${kindRules(story, twoSided)}\n`
  );
  // The list, through the first-thread reminder that repeats the MANDATORY FIRST THREAD REQUIREMENT above
  text = replaceUntil(LABEL, text, "Create a list of threads, each with:", "EXAMPLE 1: 3-BEAT CHALLENGE THREAD", threadList(multiplayer, nearer));
  text = replaceOnce(
    LABEL,
    text,
    "\n(Note that the possible milestones only mark one stop toward the outcome's resolution. More than one thread is needed to resolve the outcome.)",
    ""
  );
  if (!multiplayer) for (const [find, replace] of EXAMPLE_1P_EDITS) text = replaceOnce(LABEL, text, find, replace);
  return text;
}

/** The resonance without a scoreboard's trailing "Scored by …" sentence (setup round 1's contested resonance). */
export const withoutScoreLine = (resonance: string): string => resonance.replace(/\s*Scored by\b[^.]*\.?\s*$/i, "").trim();

/** A2's PLAYER DECISIONS: the position chosen and the outcome that sets, or the approach after a flavor switch. */
function playerDecisions(story: Story): string {
  const lines = story.getPlayerSlots().map((slot) => {
    const pick = pickedOutcome(story, slot);
    const option = pick?.optionText || "No decision made";
    const outcome = pick?.outcomeId ? story.getOutcomeById(pick.outcomeId) : null;
    const lead = story.isMultiplayer() ? "That choice pushes" : "This thread pushes";
    if (!pick) return `${slot}: ${option}`;
    if (pick.kind === "flavor") {
      const set = outcome ? `\n${lead} the outcome the switch set: ${outcome.question} (${outcome.id}). The choice sets the approach, not the outcome.` : "";
      return `${slot} chose: "${option}"${set}`;
    }
    const pushes = outcome ? `\n${lead}: ${outcome.question} (${outcome.id}). Why it matters: ${withoutScoreLine(outcome.resonance)}` : "";
    return `${slot} chose direction ${pick.choice + 1} of ${pick.directions}: "${option}"${pushes}`;
  });
  return ["PLAYER DECISIONS:", ...lines].join("\n");
}

/** Production's PLAYER DECISIONS lines, as getSwitchConfiguration writes them. */
function productionDecisions(story: Story): string {
  const lines = story.getPlayerSlots().map((slot) => {
    const beat = story.getCurrentBeat(slot);
    return `${slot}: ${beat?.options?.[beat?.choice]?.text || "No decision made"}`;
  });
  return ["PLAYER DECISIONS:", ...lines].join("\n");
}

function threadState(state: string, story: Story): string {
  const text = replaceOnce(LABEL, state, productionDecisions(story), playerDecisions(story));
  return `${text}\n\n${threadPacingBlock(story)}`;
}

// The reply

const PRODUCTION_STEP = threadSchema.shape.progression.element;
const STEP_RESULTS = PRODUCTION_STEP.shape.possibleResolutions;
const [CHALLENGE_STEP_RESULTS, , EXPLORATION_STEP_RESULTS] = STEP_RESULTS.options;

const QUESTION =
  "The one question this thread decides about its outcome, in the story's own names; its three possible milestones are the answers. After a flavor switch: the switch's question, sharpened for this thread. After a topic switch: the chosen direction, asked as a question. Weak: 'Will Rikkit succeed?' Good: 'Will Sir Bram suspend the Guild's bounty on goblins?'";
/** Planner v2c's question: nearer than the outcome's, about the thread's own situation (the owner's feedback of 2026-09-28). */
const NEARER_QUESTION_FIELD =
  "The one question this thread decides, nearer than its outcome's: its three possible milestones are the answers, and each is one milestone of the outcome. Ask it about this thread's own situation (a place, a person, a deadline, an object), in the story's own names, so that its beats can answer it; never the outcome's question reworded. After a flavor switch: the switch's question, narrowed to this thread. After a topic switch: the chosen direction, asked as a question. Weak: 'Will Rikkit stop the noble's conspiracy?' (the outcome's question) Good: 'Will Rikkit get the noble's letters out of the manor before the guards change shifts?'";
/** Planner v2c's kind of milestone, written by the planner rather than copied from the question. */
const MILESTONE_KIND_FIELD =
  "The kind of milestone this thread adds to its outcome: the concrete thing its answer settles, in a few words and the story's own names. Weak: 'progress toward stopping the conspiracy'. Good: 'whether the letters prove the noble's hand in the conspiracy'.";
/** The chapter title as planner v2 ran it, and with the adoption's "without a number" (planner v2c; a plan once titled its chapter "6. …"). */
const TITLE_AS_RAN = "The thread's title; its beats show it with their number.";
const TITLE_WITHOUT_NUMBER = "The thread's title, without a number: its beats show it with their number.";
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

function stepSchema(multiplayer: boolean) {
  const results = multiplayer ? STEP_RESULTS : z.union([CHALLENGE_STEP_RESULTS, EXPLORATION_STEP_RESULTS]).describe(STEP_RESULTS.description ?? "");
  return z.object({
    title: PRODUCTION_STEP.shape.title,
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

function threadFields(multiplayer: boolean, nearer: boolean) {
  return {
    kind: (multiplayer ? z.enum(["challenge", "contest", "exploration"]) : z.enum(["challenge", "exploration"])).describe(
      "The thread's kind, by the kind rule (the outcome decides it, not the thread type). Decide it first: the milestones and the steps below use its result names."
    ),
    typeOfThread: z
      .string()
      .describe(
        "The thread type: preferably the name part of one of the story's thread types (the words before any parenthesis), one whose kind fits when the story names one; otherwise a few words (Chase, Negotiation, Fight). Not one of the player's last three (PREVIOUS THREAD TYPES)."
      ),
    title: z.string().describe(nearer ? TITLE_WITHOUT_NUMBER : TITLE_AS_RAN),
    question: z.string().describe(nearer ? NEARER_QUESTION_FIELD : QUESTION),
    ...(nearer ? { typeOfMilestone: z.string().describe(MILESTONE_KIND_FIELD) } : {}),
    possibleMilestones: (multiplayer ? z.union([CHALLENGE_MILESTONES, CONTEST_MILESTONES, EXPLORATION_MILESTONES]) : z.union([CHALLENGE_MILESTONES, EXPLORATION_MILESTONES])).describe(
      MILESTONES_DESCRIPTION
    ),
    steps: z
      .array(stepSchema(multiplayer))
      .max(3)
      .describe(`The steps before the last one: one for a two-beat thread, two for three beats, three for a four-beat thread. ${NO_BLANK_ITEMS}`),
    finalStep: z
      .object({
        title: PRODUCTION_STEP.shape.title,
        question: z.string().describe(`The decisive moment: how the ${multiplayer ? "players act" : "player acts"} to settle the thread's question.`),
      })
      .describe("The last step. Its three results are the milestones above."),
    plan: z.string().describe(PLAN(multiplayer)),
  };
}

function threadReplySchema(story: Story, full: boolean, nearer: boolean): z.AnyZodObject {
  const restated: z.ZodRawShape = full ? { relevantSwitchAndThreadInstructions: threadAnalysisSchema.shape.relevantSwitchAndThreadInstructions } : {};
  if (!story.isMultiplayer()) return z.object({ ...restated, thread: z.object(threadFields(false, nearer)) });
  const ids = storyOutcomeIds(story);
  const sides = { playersSideA: threadSchema.shape.playersSideA, playersSideB: threadSchema.shape.playersSideB };
  const { kind, ...rest } = threadFields(true, nearer);
  return z.object({
    ...restated,
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
 * the question (planner v2 writes none), or planner v2c's own where it wrote one.
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

function assembleThread(story: Story, parsed: unknown): unknown {
  const reply = asObject(parsed);
  const restated = asString(reply.relevantSwitchAndThreadInstructions);
  if (!story.isMultiplayer()) {
    const written = asObject(reply.thread);
    const thread = storedThread(written, pickedOutcome(story, "player1")?.outcomeId ?? "", ["player1"], []);
    return {
      relevantSwitchAndThreadInstructions: restated,
      coordinationPatternSummary: asString(written.plan),
      duration: (thread.progression as unknown[]).length,
      threads: [thread],
    };
  }
  return {
    relevantSwitchAndThreadInstructions: restated,
    coordinationPatternSummary: asString(reply.grouping),
    duration: typeof reply.duration === "number" ? reply.duration : 0,
    threads: asArray(reply.threads).map((t) => {
      const written = asObject(t);
      return storedThread(written, asString(written.outcomeId), asArray(written.playersSideA).map(asString), asArray(written.playersSideB).map(asString));
    }),
  };
}

/**
 * Planner v2's thread analysis request (lean, or `full` with the restated
 * instructions); `twoSided` is planV2b, contests with two sides only (setup
 * round 3's chain); `nearerQuestion` with it is planV2c (the owner's feedback
 * of 2026-09-28): the question item in the list, the nearer question and the
 * planner's own kind of milestone in the reply, and the adoption's chapter
 * title "without a number", so production builds it byte for byte.
 */
export function plannerV2ThreadRequest(story: Story, full: boolean, options: { twoSided?: boolean; nearerQuestion?: boolean } = {}): AssembledRequest {
  const production = threadStep.request(story);
  const { instructions, state } = splitAtState(LABEL, production.prompt);
  const nearer = options.nearerQuestion ?? false;
  return {
    prompt: threadInstructions(instructions, story, options.twoSided ?? false, nearer) + threadState(state, story),
    schema: threadReplySchema(story, full, nearer),
    assemble: (parsed) => assembleThread(story, parsed),
  };
}

/** The passages the tests count, so each rule is pinned once. */
export const PLANNER_V2_TEXT = {
  stepA: STEP_A,
  stepB: STEP_B,
  kindRuleStart: "As a rule, match the thread's kind to the outcome it pushes",
  raceRuleStart: "A race between three players",
  twoSides: TWO_SIDES,
  campsSides: "with three players, the sides are the two camps",
  lengthRuleStart: "Choose the length from what the thread is",
  milestoneSizeStart: "Size them to what PACING says the outcome still needs",
  oneSituation: "tells one situation rising to a climax",
  questionItemStart: QUESTION_ITEM_START,
  nearerQuestion: NEARER_QUESTION,
  contestQuestion: CONTEST_QUESTION.trim(),
};
