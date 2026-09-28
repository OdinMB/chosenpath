import type { Story } from "core/models/Story.js";
import type {
  GameMode,
  Switch,
  SwitchAnalysis,
  Thread,
  ThreadAnalysis,
  ThreadType,
} from "core/types/index.js";
import { GameModes } from "core/types/index.js";
import { THREAD_TYPE } from "core/types/thread.js";
import { isContestedOutcome } from "core/utils/outcomeReadiness.js";
import { Logger } from "shared/logger.js";
import { outcomeIdsNamed } from "./outcomeIds.js";
import { allowedLengths, fallbackOutcomeId, pickedOutcome, turnsLeft } from "./pacing.js";
import { UnusableResultError, errorClass } from "./retryOnce.js";
import { logRepairs, type Repair } from "./textRepairs.js";

/*
 * Checks on a switch or thread plan before it becomes the story's next
 * phase. What can be put right without guessing is repaired (a player in two
 * switches, junk directions, a length the steps disagree with, contest sides
 * in the wrong order); what can't is a problem, and the planner is called once
 * more with the problem stated (checkedSwitchPlan, checkedThreadPlan). A
 * second problem fails the turn, as a failed call does. A story that holds no
 * outcomes at all (one that started before the start check) skips every
 * outcome rule.
 */

export type PlanCheck<P> = {
  /** The plan with its repairs applied */
  plan: P;
  repairs: Repair[];
  /** Why the plan can't be used, phrased to follow a colon; absent when it can */
  problem?: string;
  /**
   * A chapter length PACING does not allow (only with the `lengths` option):
   * worth the one retry, but never a reason to fail the turn, so a plan with
   * only this problem is still used.
   */
  lengthProblem?: string;
};

/** What a thread plan check reads beyond the plan's structure: `lengths`, the length PACING allows (production's planner call). */
export type ThreadCheckOptions = { lengths?: boolean };

const OUTCOME_CHECKS_SKIPPED = "outcomeChecksSkipped";

function planCheck<P>(plan: P, repairs: Repair[], problems: string[]): PlanCheck<P> {
  return problems.length > 0 ? { plan, repairs, problem: problems.join("; ") } : { plan, repairs };
}

// --- The story's outcomes and players ---

type StoryOutcomes = {
  /** Every outcome id: shared first, then each player's */
  all: string[];
  shared: string[];
  contestedShared: string[];
  /** The story holds no outcomes: the outcome rules are skipped */
  skip: boolean;
};

function storyOutcomes(story: Story, repairs: Repair[]): StoryOutcomes {
  const shared = story.getSharedOutcomes();
  const players = story.getPlayerSlots().flatMap((slot) => story.getPlayer(slot)?.outcomes ?? []);
  const all = [...new Set([...shared, ...players].map((outcome) => outcome.id))];
  const skip = all.length === 0;
  if (skip) repairs.push({ kind: OUTCOME_CHECKS_SKIPPED, note: true });
  return {
    all,
    shared: shared.map((outcome) => outcome.id),
    contestedShared: shared.filter(isContestedOutcome).map((outcome) => outcome.id),
    skip,
  };
}

function unknownOutcomeProblem(what: string, outcomeId: string, known: string[]): string {
  const named = outcomeId?.trim() ? `names the outcome id "${outcomeId}", which is not in this story` : "names no outcome id";
  return `${what} ${named}; use one of: ${known.join(", ")}`;
}

/**
 * The slots of this list that stay: a slot the story doesn't have, or one
 * already placed in an earlier list, leaves it (repaired).
 */
function placePlayers(
  written: string[],
  slots: Set<string>,
  placed: Set<string>,
  prefix: "switch" | "thread",
  label: string,
  repairs: Repair[]
): string[] {
  return written.filter((slot) => {
    if (!slots.has(slot)) {
      repairs.push({ kind: `${prefix}SlotUnknown`, detail: `${label}: ${slot}` });
      return false;
    }
    if (placed.has(slot)) {
      repairs.push({ kind: `${prefix}PlayerRepeated`, detail: `${label}: ${slot}` });
      return false;
    }
    placed.add(slot);
    return true;
  });
}

// --- Switch plans ---

const MAX_DIRECTIONS = 3;
const MIN_DIRECTIONS = 2;
const MIN_DIRECTION_LETTERS = 12;
const QUOTES = '"״“”';
const FIELD_NAMES = ["relationshipToOtherSwitches", "title", "id", "description", "players", "type"];
/** A switch field's name written as a direction: followed by a quote, a colon, or nothing but whitespace */
const FIELD_NAME_START = new RegExp(`^\\s*(?:${FIELD_NAMES.join("|")})(?:[${QUOTES}:]|\\s*$)`);
const QUOTE_THEN_COLON = new RegExp(`[${QUOTES}]:`);

/** Reply text that is not a direction: blank, too short, or a piece of the reply's JSON. */
function isJunkDirection(direction: string): boolean {
  if (typeof direction !== "string") return true;
  const letters = direction.match(/\p{L}/gu)?.length ?? 0;
  return letters < MIN_DIRECTION_LETTERS || FIELD_NAME_START.test(direction) || QUOTE_THEN_COLON.test(direction);
}

export { outcomeIdsNamed };

/**
 * Planner v2's directions beside their outcomes (`topicDirections`, one pair
 * per `topicChoices` string, in the same order). The switch turn offers the
 * strings and the chapter planner's pick reads the pair at the chosen
 * position, so whatever the check drops or trims leaves both lists.
 */
const directionsBeside = (sw: Switch): unknown[] | undefined => {
  const held = (sw as Switch & { topicDirections?: unknown }).topicDirections;
  return Array.isArray(held) ? held : undefined;
};

function checkFlavorSwitch(written: Switch, outcomes: StoryOutcomes, repairs: Repair[], problems: string[]): Switch {
  const label = `the flavor switch "${written.id}"`;
  if (!outcomes.skip && !outcomes.all.includes(written.outcomeId)) {
    problems.push(unknownOutcomeProblem(label, written.outcomeId, outcomes.all));
  }
  if (!written.question?.trim()) problems.push(`${label} has no question`);
  if ((written.topicChoices ?? []).length === 0) return written;
  repairs.push({ kind: "flavorDirectionsCleared", detail: written.id });
  return { ...written, topicChoices: [], ...(directionsBeside(written) ? { topicDirections: [] } : {}) };
}

function checkTopicSwitch(written: Switch, outcomes: StoryOutcomes, repairs: Repair[], problems: string[]): Switch {
  const choices = written.topicChoices ?? [];
  const usable = choices
    .map((direction, index) => ({ direction, index }))
    .filter(({ direction }) => {
      if (isJunkDirection(direction)) {
        repairs.push({ kind: "directionJunk", detail: `${written.id}: ${JSON.stringify(direction)}` });
        return false;
      }
      if (outcomes.skip) return true;
      const named = outcomeIdsNamed(direction, outcomes.all);
      if (named.known.length === 0 && named.unknown.length > 0) {
        repairs.push({ kind: "directionUnknownOutcomes", detail: `${written.id}: ${named.unknown.join(", ")}` });
        return false;
      }
      return true;
    });

  const kept = usable.slice(0, MAX_DIRECTIONS);
  for (const { direction } of usable.slice(MAX_DIRECTIONS)) {
    repairs.push({ kind: "directionsTrimmed", detail: `${written.id}: ${direction}` });
  }
  // Planner v2 writes each direction's one outcome in its own field (topicDirections); these notes read the text, so
  // they fire on switches planned before it and on a direction whose text names another outcome's id
  if (!outcomes.skip) {
    for (const { direction } of kept) {
      const count = outcomeIdsNamed(direction, outcomes.all).known.length;
      if (count > 1) repairs.push({ kind: "directionManyOutcomes", note: true, detail: `${written.id}: ${direction}` });
      if (count === 0) repairs.push({ kind: "directionNoOutcome", note: true, detail: `${written.id}: ${direction}` });
    }
  }
  if (kept.length < MIN_DIRECTIONS) {
    problems.push(
      `the topic switch "${written.id}" has ${kept.length} usable ${kept.length === 1 ? "direction" : "directions"} in topicChoices, and it needs ${MAX_DIRECTIONS}`
    );
  }
  const beside = directionsBeside(written);
  // A list out of step with the strings (never written by the assembly) is dropped: the pick then reads the strings
  const paired = beside ? { topicDirections: beside.length === choices.length ? kept.map(({ index }) => beside[index]) : undefined } : {};
  return { ...written, topicChoices: kept.map(({ direction }) => direction), ...paired };
}

/** Checks a switch plan (PL-1 to PL-3): the plan with its repairs, and the problem that keeps it from use, if any. */
export function checkSwitchPlan(story: Story, reply: SwitchAnalysis): PlanCheck<SwitchAnalysis> {
  const repairs: Repair[] = [];
  const problems: string[] = [];
  const outcomes = storyOutcomes(story, repairs);
  const slots = new Set<string>(story.getPlayerSlots());
  const placed = new Set<string>();

  const switches = (reply.switches ?? []).flatMap((written): Switch[] => {
    const players = placePlayers(written.players ?? [], slots, placed, "switch", written.id, repairs);
    if (players.length === 0) {
      repairs.push({ kind: "switchDropped", detail: written.id });
      return [];
    }
    const placedSwitch = { ...written, players };
    return [
      written.type === "flavor"
        ? checkFlavorSwitch(placedSwitch, outcomes, repairs, problems)
        : checkTopicSwitch(placedSwitch, outcomes, repairs, problems),
    ];
  });
  for (const slot of slots) {
    if (!placed.has(slot)) problems.push(`${slot} is in no switch`);
  }
  return planCheck({ ...reply, switches }, repairs, problems);
}

// --- Thread plans ---

const MIN_STEPS = 2;
const MAX_STEPS = 4;
const CONTEST_MODES: GameMode[] = [GameModes.Competitive, GameModes.CooperativeCompetitive];
const RESULT_KEYS: Record<ThreadType, readonly string[]> = {
  challenge: ["favorable", "mixed", "unfavorable"],
  contest: ["sideAWins", "mixed", "sideBWins"],
  exploration: ["resolution1", "resolution2", "resolution3"],
};

type Results = Thread["possibleMilestones"];

/** The kind of thread these results belong to: the one kind whose result names they all hold (also the eval's kind check). */
export function resultKind(results: unknown): ThreadType | undefined {
  if (typeof results !== "object" || results === null) return undefined;
  const kinds = THREAD_TYPE.filter((kind) => RESULT_KEYS[kind].every((key) => key in results));
  return kinds.length === 1 ? kinds[0] : undefined;
}

/** Duplicate ids get a numeric suffix, so updating one thread doesn't replace both (PL-9). */
function withUniqueIds(threads: Thread[], repairs: Repair[]): Thread[] {
  const taken = new Set<string>();
  return threads.map((thread) => {
    if (!taken.has(thread.id)) {
      taken.add(thread.id);
      return thread;
    }
    let suffix = 2;
    while (taken.has(`${thread.id}_${suffix}`)) suffix++;
    const id = `${thread.id}_${suffix}`;
    taken.add(id);
    repairs.push({ kind: "threadIdDuplicate", detail: `${thread.id} -> ${id}` });
    return { ...thread, id };
  });
}

/** The length the steps give, when every thread has the same number of steps, 2 to 4 (PL-7). */
function durationFromSteps(written: number, threads: Thread[], repairs: Repair[], problems: string[]): number {
  const counts = [...new Set(threads.map((thread) => thread.progression?.length ?? 0))];
  if (counts.length === 0) return written;
  if (counts.length > 1) {
    problems.push(
      `the threads have different numbers of steps (${counts.join(", ")}); every thread needs the same number of steps, ${MIN_STEPS} to ${MAX_STEPS}, and the duration must equal it`
    );
    return written;
  }
  const [steps] = counts;
  if (steps < MIN_STEPS || steps > MAX_STEPS) {
    problems.push(`the threads have ${steps} steps; a thread needs ${MIN_STEPS} to ${MAX_STEPS} steps, as many as the duration`);
    return written;
  }
  if (steps !== written) repairs.push({ kind: "durationFromSteps", detail: `${written} -> ${steps}` });
  return steps;
}

function swapSides(results: Results): Results {
  if (!("sideAWins" in results)) return results;
  return { ...results, sideAWins: results.sideBWins, sideBWins: results.sideAWins };
}

/**
 * player1 on side A of a contest they are in, the results swapping with the
 * sides (PL-11): side A is player1's side, or with three players player1's
 * camp, as the setup writes contested outcomes and their scoreboards. A
 * contest player1 sits out keeps the sides the planner wrote: which camp a
 * seat is in lives in the setup's text (its roles, backgrounds and the
 * scoreboard's tooltip), which no check reads, and the planner is told that
 * player1's camp is side A (camps {player1, player3} against {player2} put
 * player3 on side A of a contest with player2).
 */
function withPlayer1OnSideA(thread: Thread, repairs: Repair[]): Thread {
  if (!thread.playersSideB.includes("player1")) return thread;
  repairs.push({ kind: "contestSidesSwapped", detail: thread.id });
  return {
    ...thread,
    playersSideA: thread.playersSideB,
    playersSideB: thread.playersSideA,
    possibleMilestones: swapSides(thread.possibleMilestones),
    progression: (thread.progression ?? []).map((step) => ({
      ...step,
      possibleResolutions: swapSides(step.possibleResolutions),
    })),
  };
}

/** One thread's contest, outcome and result kind (PL-5, PL-6, PL-8), then its contest sides (PL-11). */
function checkThread(
  story: Story,
  thread: Thread,
  outcomes: StoryOutcomes,
  repairs: Repair[],
  problems: string[]
): Thread {
  const label = `the thread "${thread.id}"`;
  const isContest = thread.playersSideB.length > 0;
  let sidesUsable = isContest;
  if (isContest && !CONTEST_MODES.includes(story.getGameMode())) {
    problems.push(
      `${label} is a contest (it has players on side B), and only competitive and cooperative-competitive games have contests; put all of its players on side A`
    );
    sidesUsable = false;
  }
  if (isContest && thread.playersSideA.length === 0) {
    problems.push(`${label} is a contest with no players on side A`);
    sidesUsable = false;
  }
  if (!outcomes.skip && !outcomes.all.includes(thread.outcomeId)) {
    problems.push(unknownOutcomeProblem(label, thread.outcomeId, outcomes.all));
  }

  const kinds = [
    resultKind(thread.possibleMilestones),
    ...(thread.progression ?? []).map((step) => resultKind(step.possibleResolutions)),
  ];
  const kind = kinds.every((each) => each !== undefined && each === kinds[0]) ? kinds[0] : undefined;
  if (!kind) {
    problems.push(
      `${label} mixes result kinds: its possibleMilestones and every step's possibleResolutions must all use favorable/mixed/unfavorable, all sideAWins/mixed/sideBWins (contests only) or all resolution1/resolution2/resolution3`
    );
    return thread;
  }
  if (kind === "contest" && !isContest) {
    problems.push(`${label} uses contest results (sideAWins/sideBWins) but has no players on side B`);
    return thread;
  }
  if (kind !== "contest" && isContest) {
    problems.push(`${label} has players on side B, which makes it a contest, but its results are not sideAWins/mixed/sideBWins`);
    return thread;
  }
  return sidesUsable ? withPlayer1OnSideA(thread, repairs) : thread;
}

/**
 * A single player's chapter whose outcome is the fallback, not the pick's own
 * (pacing.ts, fallbackOutcomeId), is noted, so the log counts how often the
 * pick names no outcome.
 */
function noteOutcomeFallback(story: Story, threads: Thread[], outcomes: StoryOutcomes, repairs: Repair[]): void {
  if (story.isMultiplayer() || outcomes.skip || threads.length !== 1) return;
  const pick = pickedOutcome(story, "player1");
  if (pick && !pick.fallback) return;
  const fallback = pick?.outcomeId ?? fallbackOutcomeId(story, "player1");
  if (fallback && threads[0].outcomeId === fallback) repairs.push({ kind: "chapterOutcomeFallback", note: true });
}

/**
 * A multiplayer story's first thread groups every player on a shared outcome,
 * a contested one in a competitive game, when the story holds one (PL-10).
 */
function checkFirstThread(story: Story, threads: Thread[], outcomes: StoryOutcomes, problems: string[]): void {
  const [only] = threads;
  const inThread = (slot: string) => only.playersSideA.includes(slot) || only.playersSideB.includes(slot);
  if (threads.length !== 1 || !story.getPlayerSlots().every(inThread)) {
    problems.push("this is the first thread of a multiplayer story, so it must be exactly one thread with every player in it");
    return;
  }
  const contested = story.getGameMode() === GameModes.Competitive && outcomes.contestedShared.length > 0;
  const required = contested ? outcomes.contestedShared : outcomes.shared;
  if (required.length > 0 && !required.includes(only.outcomeId)) {
    problems.push(
      `the first thread of a ${contested ? "competitive" : "multiplayer"} story must push a ${
        contested ? "contested shared outcome" : "shared outcome"
      }; use one of: ${required.join(", ")}`
    );
  }
}

const lengthsText = (lengths: number[]) =>
  lengths.length === 1 ? `${lengths[0]} beats` : `${lengths.slice(0, -1).join(", ")} or ${lengths[lengths.length - 1]} beats`;

/**
 * A chapter length the PACING block does not allow (turn doc A4): 2 to 4
 * beats that end the story on its turn count or leave at least a switch and a
 * two-beat chapter; the last chapter takes exactly the turns left. When no
 * length fits (too few turns left), any is accepted.
 */
function chapterLengthProblem(story: Story, duration: number): string | undefined {
  const left = turnsLeft(story);
  const lengths = allowedLengths(left);
  if (lengths.length === 0 || lengths.includes(duration)) return undefined;
  return `the thread is ${duration} beats long, and with ${left} turns left, this one included, PACING allows ${lengthsText(lengths)}`;
}

/**
 * Checks a thread plan (PL-4 to PL-11): the plan with its repairs, and the
 * problem that keeps it from use, if any; with `lengths`, also a chapter
 * length PACING does not allow, apart (production's planner call reads it;
 * the eval's plan readings stay on the check as it was measured).
 */
export function checkThreadPlan(story: Story, reply: ThreadAnalysis, options: ThreadCheckOptions = {}): PlanCheck<ThreadAnalysis> {
  const repairs: Repair[] = [];
  const problems: string[] = [];
  const outcomes = storyOutcomes(story, repairs);
  const slots = new Set<string>(story.getPlayerSlots());
  const placed = new Set<string>();

  // Every player in one thread, the first they are in (PL-4)
  const placedThreads = (reply.threads ?? []).flatMap((written): Thread[] => {
    const playersSideA = placePlayers(written.playersSideA ?? [], slots, placed, "thread", written.id, repairs);
    const playersSideB = placePlayers(written.playersSideB ?? [], slots, placed, "thread", written.id, repairs);
    if (playersSideA.length + playersSideB.length === 0) {
      repairs.push({ kind: "threadDropped", detail: written.id });
      return [];
    }
    return [{ ...written, playersSideA, playersSideB }];
  });
  for (const slot of slots) {
    if (!placed.has(slot)) problems.push(`${slot} is in no thread`);
  }

  const uniqueThreads = withUniqueIds(placedThreads, repairs);
  const duration = durationFromSteps(reply.duration, uniqueThreads, repairs, problems);
  const threads = uniqueThreads.map((thread) => checkThread(story, thread, outcomes, repairs, problems));
  noteOutcomeFallback(story, threads, outcomes, repairs);
  if (story.isMultiplayer() && !story.hasThreadAnalysis()) {
    checkFirstThread(story, threads, outcomes, problems);
  }
  const checked = planCheck({ ...reply, duration, threads }, repairs, problems);
  const lengthProblem = options.lengths ? chapterLengthProblem(story, duration) : undefined;
  return lengthProblem ? { ...checked, lengthProblem } : checked;
}

// --- Logging and the retry ---

const MAX_SKIP_NOTED_STORIES = 5000;
/** Stories whose skipped outcome checks were logged in this process */
const skipNoted = new Set<string>();

/** One "[LLM] repair" line per reply (counts only), and a story's skipped outcome checks once per process. */
export function logPlanRepairs(
  role: string,
  story: Story,
  repairs: Repair[],
  log: (line: string) => void = (line) => Logger.forService("LLM").log(line)
): void {
  const storyId = story.getId();
  if (repairs.some((repair) => repair.kind === OUTCOME_CHECKS_SKIPPED) && !skipNoted.has(storyId)) {
    if (skipNoted.size >= MAX_SKIP_NOTED_STORIES) {
      const oldest = skipNoted.values().next().value;
      if (oldest !== undefined) skipNoted.delete(oldest);
    }
    skipNoted.add(storyId);
    log(`plan outcome checks skipped: story ${storyId} holds no outcomes`);
  }
  logRepairs(role, story, repairs.filter((repair) => repair.kind !== OUTCOME_CHECKS_SKIPPED), log);
}

/** The prompt of the one retry: the first prompt, told why its plan could not be used. */
export function withPlanProblem(prompt: string, problem: string): string {
  return `${prompt}\n\nYour previous plan could not be used: ${problem}. Write the plan again.`;
}

type PlanKind<P> = {
  what: "switch plan" | "thread plan";
  role: "switchAnalysis" | "threadAnalysis";
  check: (story: Story, reply: P) => PlanCheck<P>;
};

/**
 * One planner call, checked, and one more told the problem when the plan
 * can't be used or its length is one PACING does not allow. A length problem
 * alone never fails the turn: a second reply whose only problem is its
 * length is used (noted as lengthNotAllowed), and so is a first reply whose
 * only problem was its length when the second can't be used at all or its
 * call fails (after the chat model's own re-sends).
 */
async function checkedPlan<P>(
  kind: PlanKind<P>,
  story: Story,
  prompt: string,
  invoke: (prompt: string) => Promise<P>,
  log?: (line: string) => void
): Promise<P> {
  const attempt = async (previousProblem?: string): Promise<PlanCheck<P>> => {
    const reply = await invoke(previousProblem ? withPlanProblem(prompt, previousProblem) : prompt);
    const result = kind.check(story, reply);
    const repairs = result.lengthProblem ? [...result.repairs, { kind: "lengthNotAllowed", note: true }] : result.repairs;
    logPlanRepairs(kind.role, story, repairs, log);
    // The problem stays out of the log: it names model-written ids
    if (result.problem) {
      Logger.Story.warn(`The ${kind.what} for story ${story.getId()} at turn ${story.getCurrentTurn() + 1} could not be used`);
    }
    return result;
  };
  const both = (result: PlanCheck<P>) => [result.problem, result.lengthProblem].filter(Boolean).join("; ");

  const first = await attempt();
  if (!first.problem && !first.lengthProblem) return first.plan;
  if (first.problem) {
    const second = await attempt(both(first));
    if (!second.problem) return second.plan;
    throw new UnusableResultError(kind.what, second.problem);
  }
  // The first plan is usable, only its length is off: the retry may fix it, but a failed call never costs the plan
  try {
    const second = await attempt(both(first));
    return second.problem ? first.plan : second.plan;
  } catch (error) {
    Logger.Story.warn(
      `The ${kind.what} retry for story ${story.getId()} at turn ${story.getCurrentTurn() + 1} failed (${errorClass(error)}); using the first plan`
    );
    return first.plan;
  }
}

/** A switch plan call, checked: the repaired plan, one retry told the problem, else an UnusableResultError. */
export function checkedSwitchPlan(
  story: Story,
  prompt: string,
  invoke: (prompt: string) => Promise<SwitchAnalysis>,
  log?: (line: string) => void
): Promise<SwitchAnalysis> {
  return checkedPlan({ what: "switch plan", role: "switchAnalysis", check: checkSwitchPlan }, story, prompt, invoke, log);
}

/**
 * A thread plan call, checked with the length PACING allows: the repaired
 * plan, one retry told the problem, else an UnusableResultError (never for a
 * length alone).
 */
export function checkedThreadPlan(
  story: Story,
  prompt: string,
  invoke: (prompt: string) => Promise<ThreadAnalysis>,
  log?: (line: string) => void
): Promise<ThreadAnalysis> {
  const check = (checked: Story, reply: ThreadAnalysis) => checkThreadPlan(checked, reply, { lengths: true });
  return checkedPlan({ what: "thread plan", role: "threadAnalysis", check }, story, prompt, invoke, log);
}
