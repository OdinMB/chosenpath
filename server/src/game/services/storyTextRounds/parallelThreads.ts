import type { Story } from "core/models/Story.js";
import { GameModes } from "core/types/index.js";
import { isContestedOutcome } from "core/utils/outcomeReadiness.js";
import { outcomeNeeds, pickedOutcome } from "../pacing.js";
import { switchStep, threadStep, type PlanRequest, type TextRequest } from "../storyTextSteps.js";
import type { SwitchAnalysis, ThreadAnalysis } from "core/types/index.js";
import { choiceResultRequest } from "./choiceResult.js";
import { replaceOnce, splitAtState } from "./roundEdits.js";

/*
 * Parallel threads keep people and places where they are, a contest one side
 * alone chose is that side's challenge, and a contest's last stage is decided
 * with both sides there (eval only; fix 4 of the second playthroughs' review,
 * 2026-10-01). Found in the stored stories:
 * - The space pirates' third chapter (turns 10-14): the players chose three
 *   directions, and the chapter planner gave each thread its own place: the
 *   captain at Needlepoint's docks, the pilot flying the Wayward Comet through
 *   the Gloam Reach's pylons, the scout at the galley table "before the ship
 *   leaves Needlepoint". The group turn, one call for every player, followed
 *   the plan: in the same turns the captain stood on the docks in his own
 *   text, spoke on the bridge channel in the pilot's and stood at the galley
 *   table in the scout's, while the ship flew through the pylons.
 * - The same chapter's treasure claim, a contest only the scout had chosen:
 *   the planner wrote it as a contest with "the captain's camp represented by
 *   its stated claim", the plan check's repair made it her challenge
 *   (contestOneSided), and its steps still asked how "Pip and the captain's
 *   camp" argued, its unfavorable result "Bex's captain's camp secures the
 *   agreed captain's extraordinary share" settling the claim, at its last
 *   stage, for a player who wasn't there.
 * - The estate agents' fourth chapter (turns 13-14): Rory chose the archive,
 *   Nia the open house ("Join Rory at a neighborhood open house"), and the
 *   sale's last stage went to Nia alone, its unfavorable result "Mara signs an
 *   offer through Rory". At turn 14 the buyer was at the archive table in
 *   Rory's text and at the open house in Nia's, where Rory stood beside her.
 * The causes, in production's requests: the switch planner offers a contested
 * outcome's last stage as one direction among others ("opt-in grouping"), so
 * one side can take it alone; the chapter planner must follow the picks and
 * is told nothing about where parallel threads happen, or what a contest one
 * side alone chose becomes; and the group turn is told to keep beats
 * consistent "if several players are in the same thread or switch", nothing
 * about players in different threads at the same moment.
 *
 * The variant is production's requests with:
 * - the switch planner (a contest game after the opening, where a contested
 *   shared outcome has one milestone still needed): after the coordination
 *   examples, a line that its next thread is a contest with both sides in it,
 *   so it is offered only as a grouped thread, a flavor switch on it for every
 *   player, never as one direction among others;
 * - the chapter planner (a group after its first chapter): where the players'
 *   choices set more than one outcome, a line after the player configurations
 *   that parallel threads happen at the same time in one world, each person,
 *   crew and vehicle in one place, a player only in their own thread, and
 *   each thread's plan saying where it happens and who is there; where some
 *   but not all players chose a contested outcome in a contest game, a line
 *   after the kind rule that a thread whose players are all on one side is
 *   that side's challenge, the other side neither in its scenes nor winning
 *   or losing in its results;
 * - the group turn (a chapter step whose chapter has more than one thread): a
 *   line in its consistency section that the threads happen at the same
 *   moment, each person, crew and vehicle in one place across the beats, a
 *   player only in their own thread's beats, a shared place in one state.
 * Everywhere else production's request byte for byte; the schemas and the
 * planners' assembly are production's.
 */

const LABEL = "Parallel-threads variant";

const CONTEST_MODES: string[] = [GameModes.Competitive, GameModes.CooperativeCompetitive];

/** The coordination examples' last line (a group's switch planner after the opening prints it). */
const LAST_STAGE_ANCHOR =
  '- In-grouping via an overlap of options: player1 and player2 can both choose how to proceed with a topic switch. Their switches should have one option in common ("Join the expedition"). If they both choose this option, they will be in the same thread.\n';

const LAST_STAGE_LINE =
  "A contested shared outcome (Side A / Side B resolutions) that PACING shows with 1 milestone still needed is settled by its next thread, a contest that needs both sides in it. Offer it only as a grouped thread, a flavor switch on it for every player, never as one direction among others: one side could take that direction alone while the other side is elsewhere, and the contest would be settled without them.\n";

/** The player configurations' last line (a group's chapter planner after its first chapter prints it). */
const PARALLEL_ANCHOR = "- Mixed setup: Some players are in a joint thread while others are in independent threads.";

const PARALLEL_LINE =
  "\nParallel threads happen at the same time, in one world. Start each where the story left its players and the people, crews and vehicles around them, and keep each of those in one place across all the threads: a thread that moves a shared place moves it for everyone (when one thread flies the ship out of port, the players of the other threads are aboard, or stay behind in port without it); a character in one thread's scenes is not in another's; a player is only in their own thread, and a step that needs someone who is in another thread reaches them by message or leaves them for later. Each thread's plan says where it happens and who is there.";

/** The kind rule's last sentence (a group's chapter planner prints it). */
const ONE_SIDED_ANCHOR = "A contest always has exactly two sides.";

const ONE_SIDED_LINE =
  " When the players who chose a contested outcome are all on one side and the other side's players are in other threads, the thread is that side's Challenge thread: its question, steps and results are about what its own players achieve, and the other side's players are not in its scenes and never win or lose in its results.";

/** The consistency section's line on shared threads (a group's turn prints it). */
const TURN_ANCHOR = "- This is particularly important if several players are in the same thread or switch (so the beats for the different players are consistent with each other).\n";

const TURN_LINE =
  "- Where players are in different threads, the threads happen at the same moment: every person, crew and vehicle is in one place across all the beats of this turn. A character in one player's scenes is not in another player's scenes (a message may reach them), a player appears in another player's beat only if they are in the same thread, and a shared place (a ship, a house) is in the same state in every beat.\n";

/** The passages the tests pin. */
export const PARALLEL_THREADS_TEXT = {
  lastStageAnchor: LAST_STAGE_ANCHOR,
  lastStageLine: LAST_STAGE_LINE,
  parallelAnchor: PARALLEL_ANCHOR,
  parallelLine: PARALLEL_LINE,
  oneSidedAnchor: ONE_SIDED_ANCHOR,
  oneSidedLine: ONE_SIDED_LINE,
  turnAnchor: TURN_ANCHOR,
  turnLine: TURN_LINE,
};

const contestGame = (story: Story) => story.isMultiplayer() && CONTEST_MODES.includes(story.getGameMode());

/** The story's contested shared outcomes' ids. */
const contestedIds = (story: Story) => new Set(story.getSharedOutcomes().filter(isContestedOutcome).map((o) => o.id));

/**
 * Whether the switch planner takes the last-stage line: a group's contest game
 * after the opening switch, where a contested shared outcome has exactly one
 * milestone still needed (the chapter that just ended counted as pending), so
 * its next thread settles its last stage.
 */
export function takesLastStageLine(story: Story): boolean {
  if (!contestGame(story) || story.getCurrentTurn() === 0) return false;
  const contested = contestedIds(story);
  const [slot] = story.getPlayerSlots();
  return outcomeNeeds(story, slot, true).some((need) => contested.has(need.id) && need.stillNeeded === 1);
}

/** The outcome each player's pick sets, by slot (a pick that sets none left out). */
function picks(story: Story): Map<string, string> {
  return new Map(
    story.getPlayerSlots().flatMap((slot) => {
      const id = pickedOutcome(story, slot)?.outcomeId;
      return id ? [[slot, id] as [string, string]] : [];
    })
  );
}

/** Whether the chapter planner takes the parallel line: a group after its first chapter whose choices set more than one outcome. */
export function takesParallelLine(story: Story): boolean {
  if (!story.isMultiplayer() || !story.hasThreadAnalysis()) return false;
  return new Set(picks(story).values()).size > 1;
}

/** Whether the chapter planner takes the one-sided line: a group's contest game after its first chapter where some but not all players chose a contested outcome. */
export function takesOneSidedLine(story: Story): boolean {
  if (!contestGame(story) || !story.hasThreadAnalysis()) return false;
  const chosen = picks(story);
  const players = story.getPlayerSlots().length;
  return [...contestedIds(story)].some((id) => {
    const count = [...chosen.values()].filter((picked) => picked === id).length;
    return count > 0 && count < players;
  });
}

/** Whether the group turn takes the line: a group's chapter step whose chapter has more than one thread. */
export function takesTurnLine(story: Story): boolean {
  if (!story.isMultiplayer() || story.getCurrentBeatType() !== "thread") return false;
  return (story.getCurrentThreadAnalysis()?.threads.length ?? 0) > 1;
}

function insertedAfter(prompt: string, anchor: string, line: string): string {
  const { instructions, state } = splitAtState(LABEL, prompt);
  return replaceOnce(LABEL, instructions, anchor, `${anchor}${line}`) + state;
}

/**
 * The switch planner with the last-stage line, on production's switch planner
 * as it stood before the line's adoption (2026-10-01: production now prints
 * the same line, CONTEST_LAST_STAGE_LINE, on the same condition, so it is
 * taken out first and the variant builds as it was measured).
 */
function switchRequest(story: Story): PlanRequest<SwitchAnalysis> {
  const production = switchStep.request(story);
  if (!takesLastStageLine(story)) return production;
  const before = production.prompt.split(LAST_STAGE_LINE).join("");
  return { ...production, prompt: insertedAfter(before, LAST_STAGE_ANCHOR, LAST_STAGE_LINE) };
}

function threadRequest(story: Story): PlanRequest<ThreadAnalysis> {
  const production = threadStep.request(story);
  let prompt = production.prompt;
  if (takesParallelLine(story)) prompt = insertedAfter(prompt, PARALLEL_ANCHOR, PARALLEL_LINE);
  if (takesOneSidedLine(story)) prompt = insertedAfter(prompt, ONE_SIDED_ANCHOR, ONE_SIDED_LINE);
  return { ...production, prompt };
}

function turnRequest(story: Story): TextRequest {
  const production = choiceResultRequest(story);
  return takesTurnLine(story) ? { ...production, prompt: insertedAfter(production.prompt, TURN_ANCHOR, TURN_LINE) } : production;
}

/** The variant's request for a story role: production's switch planner, chapter planner or turn, each with its line where it applies. */
export function parallelThreadsRequest(story: Story, role: "switch"): PlanRequest<SwitchAnalysis>;
export function parallelThreadsRequest(story: Story, role: "thread"): PlanRequest<ThreadAnalysis>;
export function parallelThreadsRequest(story: Story, role: "beat" | "switch" | "thread"): TextRequest & { assemble?: (reply: unknown) => unknown };
export function parallelThreadsRequest(story: Story, role: "beat" | "switch" | "thread"): TextRequest & { assemble?: (reply: unknown) => unknown } {
  if (role === "switch") return switchRequest(story);
  if (role === "thread") return threadRequest(story);
  return turnRequest(story);
}
