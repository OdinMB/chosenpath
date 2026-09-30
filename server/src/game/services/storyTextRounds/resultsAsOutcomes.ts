import { z } from "zod";
import type { Story } from "core/models/Story.js";
import type { ThreadAnalysis } from "core/types/index.js";
import { threadStep, type PlanRequest } from "../storyTextSteps.js";
import { replaceOnce, splitAtState } from "./roundEdits.js";

/*
 * Challenge and contest results say how the attempt turns out, not the
 * player's approach (eval only; fix 5 of the second playthroughs' review,
 * 2026-10-01). A challenge or contest step is rolled against the option the
 * player picks, so its results have to fit whatever the player chose; a
 * result that says how the player acts tells the next turn to narrate that
 * action whatever the player picked. Planner v2f (adopted 2026-09-30) says so
 * in its results rule, and still only 13 of the second round's 33 chapter
 * plans passed the calibrated resultsFitKind check (estate agents 0 of 7).
 *
 * Found in the stored plans and production's requests: 14 of the 16 chapters
 * planned after a flavor switch failed it, 6 of the 17 after a topic switch,
 * and each failure after a flavor switch writes the approach the players
 * chose at the switch into its results and milestones:
 * - space pirates turn 19: the picks "have each person name one risk", "map a
 *   safe sequence for venting", "mark a clear, grit-free access lane" came
 *   back as "Bex gets each crew member to name a risk their work must avoid,
 *   Jori marks the drive-idle points in a clear venting sequence, and Pip lays
 *   out a grit-free tool lane" (turn 2: "Bex coordinates the work while Jori
 *   confirms the right fittings");
 * - estate agents turn 2: "separate documented defects from what no one can
 *   verify" and "distinguish what records establish from what remains rumor"
 *   as "Rory's careful separation of documented defects" and "Nia's
 *   distinction between records and rumor" (turns 9, 16, 20 and 23 the same);
 * - food trucks turns 9 and 24: "shape your trial preparation around what
 *   they tell you" as "Suri gathers Slowglass residents' advice and adapts her
 *   service", "a measured, familiar service with the crew's rota visible" as
 *   "Jo's measured familiar service, with the rota and handoffs plainly
 *   visible"; the mouse story's turn 9: "watch the loose board" as "Bran
 *   steadies the loose board while Pip leads the listening".
 * After a topic switch the failures name the approach a direction or a
 * step's question carries ("hear how the delayed queue affected nearby
 * workers" as "Suri listens to the waiting workers and adapts").
 *
 * The causes, in production's chapter planner: PLAYER DECISIONS tells it that
 * a flavor choice "sets the approach, not the outcome", and nothing says the
 * results don't restate it; the results rule's weak example is a different
 * decision ("Rikkit bribes the guard instead"), not the approach carried out
 * well; and the challenge and contest milestone fields ask for "an event that
 * happened, naming who did what".
 *
 * The variant is production's chapter planner with:
 * - after the results rule's challenge sentence, one sentence that the same
 *   goes for the approach chosen at the switch and the one a step's question
 *   names: the thread can start from it, but no result restates it, not even
 *   as the way the player succeeds, with a weak and a good example (a group's
 *   also names a side's manner as why it comes out ahead);
 * - the flavor pick's line in PLAYER DECISIONS: the choice sets the approach
 *   the thread starts from, not the outcome, and no step result or milestone
 *   restates it;
 * - the challenge and contest milestone fields: after "naming who did what",
 *   what was won or lost or what others did in answer, never how the players
 *   went about it.
 * Everywhere else production's request byte for byte; its reply assembled as
 * production assembles it.
 *
 * Run 2026-10-01 (stage challenge-results): resultsFitKind 8 of 30 -> 22 of
 * 30 plans (moved; by hand 8 -> 23), nothing moved the wrong way. Adopted as
 * measured the same day (ThreadPromptService's STEP_RESULTS_APPROACH and
 * FLAVOR_APPROACH_LINE, plannerReplies' milestone fields), so production is
 * this variant byte for byte; the variant takes production's copies out
 * before it inserts its own (measuredBase), so it builds as measured.
 */

const LABEL = "Results-as-outcomes chapter planner";

type Count = "single" | "group";

/** The results rule's challenge sentence (ThreadPromptService.stepResultRules), by player count. */
const RULE: Record<Count, string> = {
  single:
    'Each challenge result, the milestones included, says how the player\'s attempt turns out, whatever they chose to do: what they achieve or fail to achieve, and how others respond; never which approach the player takes or what they say or decide, since the option they choose decides that (weak: "Rikkit bribes the guard instead"; good: "The guard pockets the coin and calls his sergeant anyway").',
  group:
    'Each challenge or contest result, the milestones included, says how the players\' attempts turn out, whatever they chose to do: what each side achieves or fails to achieve, and how others respond; never which approach a player takes or what they say or decide, since the options they choose decide that (weak: "The group bribes the guard instead"; good: "The guard pockets the coin and calls his sergeant anyway").',
};

const APPROACH_LINE: Record<Count, string> = {
  single:
    ' The same goes for the approach the player chose at the switch (PLAYER DECISIONS) and the one a step\'s question names: the thread can start from it, but no result restates it, not even as the way the player succeeds; each result says what comes of it (weak: "Rikkit keeps his forged papers steady, and the guard waves him through"; good: "The guard waves Rikkit through without a second look").',
  group:
    ' The same goes for the approaches the players chose at the switch (PLAYER DECISIONS) and the ones a step\'s question names: the thread can start from them, but no result restates them, not even as the way a player succeeds or why a side comes out ahead; each result says what comes of them (weak: "The group keeps its forged papers steady, and the guard waves them through", "Side A\'s careful account sways the council"; good: "The guard waves the group through without a second look", "The council leans toward Side A").',
};

/** A flavor pick's line in PLAYER DECISIONS (ThreadPromptService.playerDecisions), once per player a flavor switch set an outcome for. */
const FLAVOR_ANCHOR = "The choice sets the approach, not the outcome.";
const FLAVOR_LINE = "The choice sets the approach the thread starts from, not the outcome; no step result or milestone restates it.";

type Edit = { from: string; to: string };

const challengeEdit = (result: string, who: string): Edit => {
  const from = `The milestone if ${result}: an event that happened, naming who did what, sized as the milestone rule says.`;
  return { from, to: `${from.replace(/\.$/, "")}: what the ${who} won or lost, or what others did in answer, never how the ${who} went about it.` };
};

const challengeEdits = (who: string): Edit[] => ["the thread ends favorably", "the thread ends mixed", "the thread ends unfavorably"].map((result) => challengeEdit(result, who));

const CONTEST_EDITS: Edit[] = [
  {
    from: "The milestone if side A wins the thread: an event that happened, naming who did what.",
    to: "The milestone if side A wins the thread: an event that happened, naming who did what: what side A won, or what others decided in its favor, never how its players went about it.",
  },
  {
    from: "The milestone on a draw: an event that happened, naming who did what.",
    to: "The milestone on a draw: an event that happened, naming who did what: what each side won or lost, never how their players went about it.",
  },
  {
    from: "The milestone if side B wins the thread: an event that happened, naming who did what.",
    to: "The milestone if side B wins the thread: an event that happened, naming who did what: what side B won, or what others decided in its favor, never how its players went about it.",
  },
];

/** The milestone fields' descriptions, production's and the variant's, by player count (a group's schema also has the contest's). */
const MILESTONES: Record<Count, Edit[]> = { single: challengeEdits("player"), group: [...challengeEdits("players"), ...CONTEST_EDITS] };

/** The passages the tests pin. */
export const RESULTS_AS_OUTCOMES_TEXT = { rule: RULE, approachLine: APPROACH_LINE, flavorAnchor: FLAVOR_ANCHOR, flavorLine: FLAVOR_LINE, milestones: MILESTONES };

const CHALLENGE_KEYS = ["favorable", "mixed", "unfavorable"] as const;
const CONTEST_KEYS = ["sideAWins", "mixed", "sideBWins"] as const;

/** Forward: production's description as it stood, reworded (it must hold the passage once). Back: an adopted description returned to it, where it holds the new wording. */
type Direction = "forward" | "back";

function reworded(schema: z.ZodTypeAny, edit: Edit, direction: Direction): z.ZodTypeAny {
  const description = schema.description ?? "";
  if (direction === "forward") return schema.describe(replaceOnce(LABEL, description, edit.from, edit.to));
  return description.includes(edit.to) ? schema.describe(replaceOnce(LABEL, description, edit.to, edit.from)) : schema;
}

/** One milestone object with its three fields reworded, or as it is where it holds none of them (exploration). */
function milestoneObject(option: z.ZodTypeAny, count: Count, direction: Direction): z.ZodTypeAny {
  if (!(option instanceof z.ZodObject)) return option;
  const shape = option.shape as Record<string, z.ZodTypeAny>;
  const [first, second] = [MILESTONES[count].slice(0, 3), MILESTONES[count].slice(3)];
  if ("favorable" in shape) return option.extend(Object.fromEntries(CHALLENGE_KEYS.map((key, i) => [key, reworded(shape[key], first[i], direction)])));
  if ("sideAWins" in shape) return option.extend(Object.fromEntries(CONTEST_KEYS.map((key, i) => [key, reworded(shape[key], second[i], direction)])));
  return option;
}

/** A thread's fields with its possible milestones' challenge and contest descriptions reworded; the union's order and description kept. */
function withMilestoneWording(thread: z.AnyZodObject, count: Count, direction: Direction): z.AnyZodObject {
  const milestones = thread.shape.possibleMilestones;
  if (!(milestones instanceof z.ZodUnion)) throw new Error(`${LABEL}: the thread's possible milestones are no union`);
  const options = (milestones.options as z.ZodTypeAny[]).map((o) => milestoneObject(o, count, direction)) as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]];
  return thread.extend({ possibleMilestones: z.union(options).describe(milestones.description ?? "") });
}

/** The chapter planner's reply schema with the milestone fields reworded: the one thread of a single player, each thread of a group's list. */
function withReworded(schema: z.AnyZodObject, count: Count, direction: Direction): z.AnyZodObject {
  if (count === "single") {
    const thread = schema.shape.thread;
    if (!(thread instanceof z.ZodObject)) throw new Error(`${LABEL}: the reply has no thread`);
    return schema.extend({ thread: withMilestoneWording(thread, count, direction) });
  }
  const threads = schema.shape.threads;
  if (!(threads instanceof z.ZodArray) || !(threads.element instanceof z.ZodObject)) throw new Error(`${LABEL}: the reply has no thread list`);
  const cap = threads._def.maxLength?.value;
  const list = z.array(withMilestoneWording(threads.element, count, direction));
  return schema.extend({ threads: (cap === undefined ? list : list.max(cap)).describe(threads.description ?? "") });
}

/**
 * Production's chapter planner as it stood when the stage measured it: since
 * the adoption (2026-10-01) production prints the same edits (the approach
 * sentence, the flavor pick's line, the milestone fields), so they are taken
 * out first and the variant builds as it was measured.
 */
function measuredBase(story: Story, count: Count): PlanRequest<ThreadAnalysis> {
  const production = threadStep.request(story);
  const prompt = production.prompt.split(`${RULE[count]}${APPROACH_LINE[count]}`).join(RULE[count]).split(FLAVOR_LINE).join(FLAVOR_ANCHOR);
  return { ...production, prompt, schema: withReworded(production.schema, count, "back") };
}

/** Production's chapter planner as measured with the results rule's approach sentence, the flavor pick's line and the milestone fields reworded. */
export function resultsAsOutcomesRequest(story: Story): PlanRequest<ThreadAnalysis> {
  const count: Count = story.isMultiplayer() ? "group" : "single";
  const base = measuredBase(story, count);
  const { instructions, state } = splitAtState(LABEL, base.prompt);
  const withRule = replaceOnce(LABEL, instructions, RULE[count], `${RULE[count]}${APPROACH_LINE[count]}`);
  return { ...base, prompt: withRule + state.split(FLAVOR_ANCHOR).join(FLAVOR_LINE), schema: withReworded(base.schema, count, "forward") };
}
