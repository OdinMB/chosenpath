import { z } from "zod";
import type { Story } from "core/models/Story.js";
import { PLAYER_SLOTS, getThreadType, type Stat, type Thread } from "core/types/index.js";
import { StoryStatePromptService } from "../prompts/StoryStatePromptService.js";
import type { TextRequest } from "../storyTextSteps.js";
// Production's beat request as it stood at the round0 prompt state, so these requests stay as they ran
import { round0BeatStep as beatStep } from "../storyTextRound0/round0Steps.js";
import { trimmedBeatRequest } from "../storyTextTrims.js";
import { replaceOnce, replaceUntil, splitAtState } from "./roundEdits.js";
import { withoutScoreLine } from "./turnRound1Planners.js";

/*
 * Turn round 1's chapter turns (turn doc section 4, round 1; Appendix A B2,
 * B3 rows 11, 14 and 15, B4), an eval-only variant of production's beat
 * request for a chapter's steps, in production's one-message shape:
 * - B2: a THIS THREAD block at the top of the chapter's configuration, in
 *   place of its "Related Outcome" line: the kind and position, the thread
 *   type, the chapter's question and plan (the chapter's own from planner v2,
 *   else the backfilled frame of a stored chapter, else today's "kind of
 *   milestone"), the outcome with its milestones, why it matters, a
 *   contest's sides and score, and the step; the story's switch/thread
 *   instructions reach chapter turns too; one progress rule replaces the two
 *   unclear paragraphs, and the last step is the decisive moment;
 * - B3 row 11: a thread pushes one outcome; row 14: the summary carries the
 *   player's decision (the "tracked separately" line goes); row 15: B2's rule
 *   is the one statement of "the step stays open", so its other copies go (the
 *   text section's line, the text field's and the show-don't-tell field's);
 * - "slim" adds B4 on Stage 3's slim trim: the facts, introductions and
 *   new-elements rules stated in their fields (their prompt copies go), the
 *   title written by code in today's "<thread title> (k/n)" form (the game
 *   screen reads that suffix to tell a new chapter), and one option line in
 *   place of the dropped "key conflicts" field. Single player only in round 1:
 *   multiplayer keeps its coordination note under B4, and that form is
 *   unmeasured.
 * The rest of B3 (switch and ending lines, the stat and fourth-wall rows) is
 * round 2's. Edits are anchored on production's wording, each exactly once
 * (roundEdits.ts); the state's thread section is rewritten from the story.
 * Model-facing text says "thread" and "beat" (turn doc Appendix A).
 */

/**
 * "slimPlans" is slim's one fix-and-retest after round 1, where slim was worse
 * than today's form on two checks its own changes target: facts per turn fell
 * from 3.97 to 3.28 (B4's gate is 3.5) and the step left open for the options
 * from 91% to 81% of turns (B2, B3 row 15). Both read what a planning field
 * that slim drops asked for: worldBuilding (the new details to establish) and
 * beatTypeConsiderations (the step this beat implements). The retest keeps
 * those two, in production's places; everything else is slim's.
 */
export type ChapterTurnForm = "full" | "slim" | "slimPlans";

/** The planning fields slimPlans keeps, as production writes them. */
const KEPT_PLANS = ["beatTypeConsiderations", "worldBuilding"];

const isSlim = (form: ChapterTurnForm) => form !== "full";
/** A stored chapter's backfilled question and plan, per thread id (the eval's chapterFrames). */
export type ChapterFrameText = Record<string, { question: string; plan: string }>;

export type ChapterTurnRequest = TextRequest & { assemble?: (parsed: unknown) => unknown };

const LABEL = "Turn round 1 chapter turn";

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});

/** A thread as planner v2 stores it: today's fields plus its question and plan. */
type FramedThread = Thread & { question?: string; plan?: string };

const PROGRESS_RULE = (who: string) => `- This step moves the thread's question. By the last paragraph something concrete has changed that bears on it: a clue found, an ally won or lost, a price paid, ground gained or given up. The step's own question stays open: how the ${who} on it is what the options decide.
  Weak: "Sir Bram listens, nods, and agrees to consider reform." (the step answered before the choice)
  Weak: "The tension in the hall is palpable." (nothing changed)
  Good: "Sir Bram lets you finish, then slides a sealed letter across the desk: the names of three goblins his men arrested last night. 'Convince me they deserved it less than I think,' he says."`;

const DECISIVE = "- This is the decisive moment of the thread. Bring its question to a head: the three options are three different ways to settle it, and nothing is settled in the text.";

const SUMMARY =
  "One sentence for later threads: what the player did at the start of this beat and how it turned out, and the one thing this beat changed. Name people and things. Don't include this beat's options.";

const FACTS =
  "From the second beat on, three or more new facts that this beat's text establishes, each on the element it is about: names, places, promises, prices, secrets, who knows what. A detail planted to make the player curious is a fact too, so a later beat can pay it off.";
const INTRODUCTIONS = "Elements that appear in this beat's text and that this player meets here for the first time.";
const NEW_ELEMENTS = "Only elements likely to return in later beats; most beats add none.";
const DECISION_OPTION = "- Where the scene allows, let one option embody one of the story's types of decisions (STORY GUIDELINES).";

// ---------------------------------------------------------------- the instructions

function instructionEdits(production: string, story: Story, form: ChapterTurnForm): string {
  const done = story.getCurrentThreadBeatsCompleted();
  const duration = story.getCurrentThreadDuration();
  const last = done + 1 === duration;
  const who = story.isMultiplayer() ? "players act" : "player acts";
  let text = production;
  // B3 row 11 (A2's context sentences)
  text = replaceOnce(
    LABEL,
    text,
    "are a narrative structure of 2-4 beats that push one or more story outcomes closer to their resolution.",
    "are a narrative structure of 2-4 beats that push one story outcome closer to its resolution."
  );
  text = replaceOnce(
    LABEL,
    text,
    `For each outcome that this thread is about, the thread poses a question: "Which of these possible milestones will be added to that outcome at the end of the thread?"`,
    "The thread poses one question about its outcome: which of its possible milestones will the outcome get at the end of the thread?"
  );
  text = replaceOnce(LABEL, text, "A thread can have one or more players involved. It can pose questions relating to one or more outcomes.", "A thread can have one or more players involved.");
  text = replaceOnce(LABEL, text, "After the final beat, a favorable/mixed/unfavorable milestone is added to the outcome.", "After the final beat, one of the thread's possible milestones is added to its outcome.");
  // B2: the plan in THIS THREAD, one progress rule, the decisive last step
  text = replaceOnce(
    LABEL,
    text,
    "- Follow the thread's plan. If it outlines a progression of beats like greeting (establishing first impression) / conversation (learning about interests or weaknesses) / call-to-action (success/failure), make sure that this progression is followed.",
    "- Follow the thread's plan (THIS THREAD) and its steps."
  );
  text = replaceUntil(
    LABEL,
    text,
    "The current step in the thread progression poses a question that should be answered in this beat.",
    last ? "- This is the last beat of the thread." : "- This is not yet the last beat of the thread.",
    `${PROGRESS_RULE(who)}\n`
  );
  text = last
    ? replaceOnce(
        LABEL,
        text,
        "- This is the last beat of the thread. Remember that the resolution of the overall thread will only be determined AFTER this beat, based on players' choices in this beat. Don't define or narrate the resolution of the thread. (That will happen in the next round, based on players' choices.)\n",
        `${DECISIVE}\n`
      )
    : replaceOnce(
        LABEL,
        text,
        "- This is not yet the last beat of the thread. While each beat should contribute toward the resolution of the thread, the question of how the thread overall will be resolved should only be answered after the players' decisions in the last step of the thread.\n--- Example: In a 3-beat thread, if the question is 'Will [insert player name] acquire the artifact?', the player will not gain or permanently lose the chance to gain the artifact in steps 1 and 2.\n",
        ""
      );
  // B3 row 15: B2's rule is the one statement of it
  text = replaceOnce(
    LABEL,
    text,
    "\n- Remember that the resolution of the beat will only be determined AFTER this beat, based on players' choices. Only lead up to the player options that will address the question posed in the current step of the thread progression.",
    ""
  );
  // B3 row 14: the summary carries the decision
  text = replaceOnce(LABEL, text, "\n- The players' decisions are tracked separately and don't have to be tracked.", "");
  if (isSlim(form)) {
    // B4: the facts and new-elements rules live in their fields
    text = replaceOnce(
      LABEL,
      text,
      "--- Aim for adding 3 or more new facts per switch and per step in a thread. These are the details that make the world come to life. By recording them, we ensure consistency in future beats.\n",
      ""
    );
    text = replaceOnce(LABEL, text, "--- Do this whenever a new element is introduced that is likely to be used in later beats.\n--- In most beats, you don't have to add a new story element.\n", "");
    text = replaceOnce(
      LABEL,
      text,
      `Title: [title for the thread that this beat is part of]\nAdd '(${done + 1}/${duration})' after the title to indicate the beat number of the current thread.\n\n`,
      ""
    );
    text = replaceOnce(
      LABEL,
      text,
      "--- Example: If force|agility stat leans toward force, the options should be forceful rather than sneaky.",
      `--- Example: If force|agility stat leans toward force, the options should be forceful rather than sneaky.\n${DECISION_OPTION}`
    );
  }
  return text;
}

// ---------------------------------------------------------------- the state

const names = (story: Story, slots: string[]) => slots.map((slot) => story.getPlayer(slot)?.name ?? slot);

/** The chapter's question and plan: its own (planner v2), else the backfilled frame, else today's kind of milestone or the switch's question. */
function frameOf(story: Story, thread: FramedThread, frames?: ChapterFrameText): { question?: string; plan?: string } {
  const own = { question: thread.question?.trim(), plan: thread.plan?.trim() };
  if (own.question) return own;
  const frame = frames?.[thread.id];
  if (frame) return { question: frame.question, plan: frame.plan };
  const previous = story.getPreviousPhase();
  const sw = previous && "switches" in previous ? previous.switches.find((s) => thread.playersSideA.includes(s.players[0])) : undefined;
  const question = thread.typeOfMilestone?.trim() || (sw?.type === "flavor" ? sw.question?.trim() : undefined);
  return question ? { question } : {};
}

function formatValue(stat: Stat, value: unknown): string {
  if (stat.type === "opposites" && typeof value === "number") return `${value}|${100 - value}`;
  if (stat.type === "percentage" && typeof value === "number") return `${value}%`;
  return Array.isArray(value) ? value.join(", ") : String(value);
}

/** A contest's scoreboard: the stat its outcome's resonance says scores it, else the story's one shared opposites stat. */
function scoreLine(story: Story, resonance: string): string | undefined {
  const shared = story.getSharedStats();
  const named = /Scored by ([^.]+)\.?\s*$/i.exec(resonance)?.[1]?.trim().toLowerCase();
  const byName = named ? shared.find((s) => s.name.trim().toLowerCase() === named) : undefined;
  const opposites = shared.filter((s) => s.type === "opposites");
  const stat = byName ?? (opposites.length === 1 ? opposites[0] : undefined);
  const value = stat ? story.getState().sharedStatValues.find((v) => v.statId === stat.id)?.value : undefined;
  return stat && value !== undefined ? `Score: ${stat.name}: ${formatValue(stat, value)}` : undefined;
}

function thisThreadBlock(story: Story, thread: FramedThread, frames?: ChapterFrameText): string {
  const kind = getThreadType(thread);
  const done = thread.progression.filter((s) => s.resolution !== null).length;
  const step = thread.progression[done];
  const outcome = story.getOutcomeById(thread.outcomeId);
  const frame = frameOf(story, thread, frames);
  const players = names(story, [...thread.playersSideA, ...thread.playersSideB]);
  const milestones = outcome?.milestones ?? [];
  const lines = [
    `======= THIS THREAD: ${thread.title} (${kind}, beat ${done + 1} of ${thread.duration}) =======`,
    thread.typeOfThread?.trim() ? `Thread type: ${thread.typeOfThread.trim()}` : "",
    frame.question ? `It decides: ${frame.question}` : "",
    outcome
      ? `For the outcome: ${outcome.question} (${outcome.id}). So far ${milestones.length} of ${outcome.intendedNumberOfMilestones} milestones: ${milestones.length ? milestones.join("; ") : "none yet"}`
      : `For the outcome: ${thread.outcomeId} (not among the story's outcomes)`,
    outcome?.resonance?.trim() ? `Why it matters to ${players.join(" and ")}: ${withoutScoreLine(outcome.resonance)}` : "",
    kind === "contest" ? `Sides: ${names(story, thread.playersSideA).join(", ")} (side A) against ${names(story, thread.playersSideB).join(", ")} (side B)` : "",
    kind === "contest" && outcome ? (scoreLine(story, outcome.resonance ?? "") ?? "") : "",
    frame.plan ? `Plan: ${frame.plan}` : "",
    step ? `This step: ${step.title}: ${step.question}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/** The players line the renderer writes under a thread's header (StoryStatePromptService's milestones section). */
function playersLine(thread: Thread): string {
  const pm = thread.possibleMilestones as Record<string, string>;
  return getThreadType(thread) === "contest" && "sideAWins" in pm
    ? `Side A (${thread.playersSideA.join(", ")})\nSide B (${thread.playersSideB.join(", ")})`
    : `Players: ${thread.playersSideA.join(", ")}`;
}

function stateEdits(state: string, story: Story, frames?: ChapterFrameText, chapterRules = true): string {
  let text = state;
  for (const thread of story.getCurrentThreadAnalysis()?.threads ?? []) {
    const outcome = story.getOutcomeById(thread.outcomeId);
    const related = outcome ? `Related Outcome: ${outcome.question} (${outcome.id})` : `Related Outcome: Unknown (ID: ${thread.outcomeId})`;
    const header = `==== ${getThreadType(thread).toUpperCase()} THREAD: ${thread.title} (${thread.id}) ====`;
    text = replaceOnce(LABEL, text, `${header}\n${playersLine(thread)}\n\n${related}\n`, `${thisThreadBlock(story, thread, frames)}\n${playersLine(thread)}\n`);
  }
  const step = `\n\nCURRENT STEP IN THREAD PROGRESSION: Turn ${story.getCurrentThreadBeatsCompleted() + 1}/${story.getCurrentThreadDuration()}\n`;
  text = replaceOnce(LABEL, text, step, "\n");
  if (!chapterRules) return text;
  const instructions = StoryStatePromptService.createStoryStatePrompt(story, { switchAndThreadInstructions: true });
  return instructions ? `${text}\n${instructions}\n` : text;
}

// ---------------------------------------------------------------- the reply

function reworded<T extends z.ZodTypeAny>(schema: T, find: string, replace: string): T {
  const description = schema.description ?? "";
  if (description.split(find).length !== 2) throw new Error(`${LABEL}: "${find.slice(0, 60)}" is not in the field's description exactly once`);
  return schema.describe(description.replace(find, replace));
}

function asZodObject(schema: unknown, label: string): z.AnyZodObject {
  if (!(schema instanceof z.ZodObject)) throw new Error(`${LABEL}: ${label} is not an object schema`);
  return schema;
}

/** The slim plan with production's kept planning fields back, in production's key order (slimPlans, the retest). */
function withKeptPlans(slimPlan: z.AnyZodObject, productionPlan: z.AnyZodObject): z.AnyZodObject {
  const shape = Object.fromEntries(
    Object.keys(productionPlan.shape).flatMap((key) =>
      KEPT_PLANS.includes(key) ? [[key, productionPlan.shape[key]]] : key in slimPlan.shape ? [[key, slimPlan.shape[key]]] : []
    )
  );
  const plan = z.object(shape);
  return slimPlan.description === undefined ? plan : plan.describe(slimPlan.description);
}

/** One player's beat with B2/B3's field edits, and on the slim forms B4's; production reuses one instance for every slot, so this does too. */
function editedBeat(player: z.AnyZodObject, form: ChapterTurnForm, productionPlan: z.AnyZodObject): z.AnyZodObject {
  const trimmed = asZodObject(player.shape.plan, "plan");
  const plan = form === "slimPlans" ? withKeptPlans(trimmed, productionPlan) : trimmed;
  const planEdits: z.ZodRawShape = {
    showDontTell: reworded(plan.shape.showDontTell, " Remember: don't define the resolution of this step in the thread progression. That will happen in the next round, based on players' choices in this beat.", ""),
  };
  if (isSlim(form)) {
    planEdits.establishedFacts = plan.shape.establishedFacts.describe(FACTS);
    planEdits.newIntroductionsOfStoryElements = plan.shape.newIntroductionsOfStoryElements.describe(INTRODUCTIONS);
    planEdits.newGameElements = plan.shape.newGameElements.describe(NEW_ELEMENTS);
  }
  const beat = player.extend({
    plan: plan.extend(planEdits),
    text: reworded(
      player.shape.text,
      "- Remember that the resolution of the beat will only be determined AFTER this beat, based on players' choices. Only lead up to the player options. Don't define or narrate the resolution of the beat. (That will happen in the next round, based on players' choices.)\n",
      ""
    ),
    summary: player.shape.summary.describe(SUMMARY),
  });
  return isSlim(form) ? beat.omit({ title: true }) : beat;
}

function editedSchema(root: z.AnyZodObject, form: ChapterTurnForm, productionPlan: z.AnyZodObject): z.AnyZodObject {
  const done = new Map<z.ZodTypeAny, z.AnyZodObject>();
  const slots = Object.keys(root.shape).filter((key) => PLAYER_SLOTS.includes(key));
  return root.extend(
    Object.fromEntries(
      slots.map((slot) => {
        const player = root.shape[slot];
        const edited = done.get(player) ?? editedBeat(asZodObject(player, slot), form, productionPlan);
        done.set(player, edited);
        return [slot, edited];
      })
    )
  );
}

/** Code writes each player's title (B4): "<thread title> (k/n)", the form the game screen reads to tell a new chapter. */
function withTitles(story: Story, parsed: unknown): unknown {
  const reply = { ...asObject(parsed) };
  for (const slot of story.getPlayerSlots()) {
    if (!(slot in reply)) continue;
    const thread = story.getCurrentThreadAnalysis()?.threads.find((t) => t.playersSideA.includes(slot) || t.playersSideB.includes(slot));
    if (!thread) continue;
    const done = thread.progression.filter((s) => s.resolution !== null).length;
    reply[slot] = { ...asObject(reply[slot]), title: `${thread.title} (${done + 1}/${thread.duration})` };
  }
  return reply;
}

/**
 * Round 1's request for a chapter step, on production's full reply or B4's
 * slim one. `chapterRules: false` (chapterFullB, the reruns of the owner's
 * feedback of 2026-09-28: the chapter rules are for the planners only, as
 * production's turns have them since then) leaves the story's switch/thread
 * instructions off the end; everything else is the form as it ran.
 */
export function chapterTurnRequest(story: Story, form: ChapterTurnForm, frames?: ChapterFrameText, options: { chapterRules?: boolean } = {}): ChapterTurnRequest {
  if (story.getCurrentBeatType() !== "thread") throw new Error(`${LABEL}: round 1's chapter turns cover chapter steps only, not a ${story.getCurrentBeatType()} beat`);
  if (isSlim(form) && story.isMultiplayer()) throw new Error(`${LABEL}: the slim form is single-player in round 1 (B4 keeps the coordination note for groups, unmeasured)`);
  const production = beatStep.request(story);
  const base = isSlim(form) ? trimmedBeatRequest(story, "slim") : production;
  const productionPlan = asZodObject(asZodObject(asZodObject(production.schema, "reply").shape.player1, "player1").shape.plan, "plan");
  const { instructions, state } = splitAtState(LABEL, base.prompt);
  const request: ChapterTurnRequest = {
    prompt: instructionEdits(instructions, story, form) + stateEdits(state, story, frames, options.chapterRules ?? true),
    schema: editedSchema(asZodObject(base.schema, "reply"), form, productionPlan),
  };
  return isSlim(form) ? { ...request, assemble: (parsed) => withTitles(story, parsed) } : request;
}

/** The passages the tests pin. */
export const CHAPTER_TURN_TEXT = {
  progressRuleStart: "- This step moves the thread's question.",
  decisive: DECISIVE,
  summary: SUMMARY,
  facts: FACTS,
  introductions: INTRODUCTIONS,
  newElements: NEW_ELEMENTS,
  decisionOption: DECISION_OPTION,
};
