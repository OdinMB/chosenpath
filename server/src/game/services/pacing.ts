import type { Story } from "core/models/Story.js";
import type { Outcome, StoryPhase, Switch, ThreadAnalysis } from "core/types/index.js";
import { isContestedOutcome } from "core/utils/outcomeReadiness.js";
import { outcomeIdsNamed } from "./outcomeIds.js";

/*
 * The planners' pacing (turn doc A4, with the owner's binding late pacing,
 * decision 3 (b)), adopted with planner v2 on 2026-09-28: the arithmetic both
 * planners are handed instead of the recipe, the PACING block that prints it,
 * and the player's pick (A2), which sets the next chapter's outcome in code.
 * The eval's measured copy stays in storyTextRounds/pacing.ts, so planner
 * v2's requests stay as they ran; adoptedPlanners.test.ts holds the two
 * equal on every case. One helper for every rule, each unit-tested:
 * - turns left = the story's length minus the turns written, this one
 *   included (STORY PROGRESS counts it the same way);
 * - chapters that fit = turns left ÷ 4, rounded down (a switch and a chapter
 *   of about three turns);
 * - still needed = intended − recorded − pending, never below 0; pending is
 *   the chapter that just ended, which the switch turn records only after the
 *   switch planner has run;
 * - allowed lengths: 2 to 4, and either exactly the turns left (the story ends
 *   with this chapter) or leaving at least 3 (a switch and a two-turn chapter);
 * - the last chapter: 4 or fewer turns left after the switch, exactly that many;
 * - the phase: the first quarter of the turns, up to two thirds, then late.
 * Model-facing text says "thread" and "beat" (turn doc Appendix A, vocabulary).
 */

export const TURNS_PER_CHAPTER = 4;

/** Turns left, this one included. */
export const turnsLeft = (story: Story): number => story.getMaxTurns() - story.getCurrentTurn();

export const chaptersThatFit = (left: number): number => Math.max(0, Math.floor(left / TURNS_PER_CHAPTER));

/** The lengths a chapter may have when it starts with this many turns left, this one included. */
export function allowedLengths(left: number): number[] {
  return [2, 3, 4].filter((length) => left - length === 0 || left - length >= 3);
}

/** A chapter starting with this many turns left is the story's last: it takes exactly them. */
export const isLastChapter = (left: number): boolean => left >= 2 && left <= 4;

/** The length of the chapter a switch opens when it is the story's last (4 or fewer turns after the switch turn), else undefined. */
export function lastChapterAfterSwitch(left: number): number | undefined {
  const after = left - 1;
  return isLastChapter(after) ? after : undefined;
}

export type Phase = "opening" | "middle" | "late" | "final";

/** The story's phase at this turn (1-based): the first quarter, up to two thirds, then late; the last chapter is the final one. */
export function phaseOf(turn: number, maxTurns: number, lastChapter: boolean): Phase {
  if (lastChapter) return "final";
  if (turn <= maxTurns / 4) return "opening";
  if (turn <= (2 * maxTurns) / 3) return "middle";
  return "late";
}

/** A shared outcome (a contested one first), else the one with the most intended milestones, the first listed on a tie. */
export function mainOutcomeId(outcomes: Outcome[], sharedIds: Set<string>): string | undefined {
  const shared = outcomes.filter((o) => sharedIds.has(o.id));
  if (shared.length > 0) return (shared.find(isContestedOutcome) ?? shared[0]).id;
  let best: Outcome | undefined;
  for (const o of outcomes) if (!best || o.intendedNumberOfMilestones > best.intendedNumberOfMilestones) best = o;
  return best?.id;
}

/** A player's outcomes as the planners count them: the shared ones, then the player's own, each id once. */
export function outcomesFor(story: Story, slot: string): Outcome[] {
  const seen = new Set<string>();
  return [...story.getSharedOutcomes(), ...(story.getPlayer(slot)?.outcomes ?? [])].filter((o) => {
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    return true;
  });
}

const isThreadPhase = (phase: StoryPhase): phase is ThreadAnalysis => "threads" in phase;

/** The chapter plans so far, oldest first. */
const chapterPlans = (story: Story): ThreadAnalysis[] => story.getState().storyPhases.filter(isThreadPhase);

export type OutcomeNeed = {
  id: string;
  question: string;
  recorded: number;
  intended: number;
  /** Milestones the chapter that just ended will add (switch planner only) */
  pending: number;
  /** The planned milestone of that chapter, when it has one */
  pendingText?: string;
  /** No chapter has pushed it yet, the one that just ended included */
  noChapterYet: boolean;
  stillNeeded: number;
  complete: boolean;
  main: boolean;
};

/** Each of a player's outcomes with what it still needs; `atSwitch` counts the chapter that just ended as pending. */
export function outcomeNeeds(story: Story, slot: string, atSwitch: boolean): OutcomeNeed[] {
  const outcomes = outcomesFor(story, slot);
  const main = mainOutcomeId(outcomes, new Set(story.getSharedOutcomes().map((o) => o.id)));
  const ended = atSwitch ? (story.getCurrentThreadAnalysis()?.threads ?? []).filter((t) => t.resolution !== null) : [];
  const pushed = new Set(chapterPlans(story).flatMap((p) => p.threads.map((t) => t.outcomeId)));
  return outcomes.map((o) => {
    const endedHere = ended.filter((t) => t.outcomeId === o.id);
    const recorded = o.milestones?.length ?? 0;
    const pending = endedHere.length;
    const stillNeeded = Math.max(0, o.intendedNumberOfMilestones - recorded - pending);
    const text = endedHere.map((t) => t.milestone).find((m): m is string => typeof m === "string" && m.trim() !== "");
    return {
      id: o.id,
      question: o.question,
      recorded,
      intended: o.intendedNumberOfMilestones,
      pending,
      ...(text ? { pendingText: text.trim() } : {}),
      noChapterYet: !pushed.has(o.id),
      stillNeeded,
      complete: recorded + pending >= o.intendedNumberOfMilestones,
      main: o.id === main,
    };
  });
}

// --- The player's pick (turn doc A2) ---

export type Pick = {
  kind: "topic" | "flavor";
  /** The chosen option's position */
  choice: number;
  /** How many directions the switch offered (topic) */
  directions: number;
  optionText: string;
  /**
   * The outcome the pick sets. For a single player whose pick names none the
   * story knows, the fallback (fallbackOutcomeId); undefined for a group, or
   * when the story has no outcomes
   */
  outcomeId?: string;
  /** The outcome is the single player's fallback, not the pick's own */
  fallback?: true;
};

/**
 * The outcome a single player's next chapter pushes when the pick names none
 * the story knows: the one that still needs the most milestones, the main
 * outcome on a tie, then the first listed. A single player's chapter reply
 * writes no outcome, so without this the plan would store none, fail the plan
 * check on both attempts and stop the story at that switch. It happens when
 * the switch turn offers a third option beside two planned directions (the
 * turn always offers three) and the player picks it, or when a switch planned
 * before planner v2 has a chosen direction whose text names no id.
 */
export function fallbackOutcomeId(story: Story, slot: string): string | undefined {
  let best: OutcomeNeed | undefined;
  for (const need of outcomeNeeds(story, slot, false)) {
    if (!best || need.stillNeeded > best.stillNeeded || (need.stillNeeded === best.stillNeeded && need.main && !best.main)) best = need;
  }
  return best?.id;
}

/** A round switch plan keeps each direction's outcome beside its text (turnRound1Planners.ts). */
type StructuredDirection = { direction: string; outcomeId: string };
const structuredDirections = (sw: Switch): StructuredDirection[] | undefined => {
  const held = (sw as Switch & { topicDirections?: unknown }).topicDirections;
  return Array.isArray(held) ? (held as StructuredDirection[]) : undefined;
};

/** The story's outcome ids a direction names, in the order its text names them. */
function namedInOrder(direction: string, known: string[]): string[] {
  return outcomeIdsNamed(direction, known).known.sort((a, b) => direction.indexOf(a) - direction.indexOf(b));
}

/**
 * What a player's switch choice sets for the next chapter: a flavor switch's
 * outcome, or the chosen direction's by position (the option order kept the
 * direction order in 168 of 168 stored switch turns). A direction written with
 * several outcomes gives the first its text names, as the chapter planner
 * picked 21 of 24 times. A single player's pick that names no outcome the
 * story knows takes the fallback, marked as such, so the planner is told the
 * outcome the chapter will store.
 */
export function pickedOutcome(story: Story, slot: string): Pick | undefined {
  const plan = story.getCurrentSwitchAnalysis();
  const sw = plan?.switches.find((s) => s.players.includes(slot));
  const beat = story.getCurrentBeat(slot);
  if (!sw || !beat) return undefined;
  const choice = typeof beat.choice === "number" ? beat.choice : -1;
  const optionText = beat.options?.[choice]?.text ?? "";
  const known = new Set(outcomesFor(story, slot).map((o) => o.id));
  const set = (outcomeId: string | undefined): { outcomeId?: string; fallback?: true } => {
    if (outcomeId && known.has(outcomeId)) return { outcomeId };
    const fallback = story.isMultiplayer() ? undefined : fallbackOutcomeId(story, slot);
    return fallback ? { outcomeId: fallback, fallback: true } : {};
  };
  if (sw.type === "flavor") {
    return { kind: "flavor", choice, directions: 0, optionText, ...set(sw.outcomeId) };
  }
  const structured = structuredDirections(sw);
  const directions = structured?.length ?? sw.topicChoices?.length ?? 0;
  const outcomeId = structured ? structured[choice]?.outcomeId : namedInOrder(sw.topicChoices?.[choice] ?? "", [...known])[0];
  return { kind: "topic", choice, directions, optionText, ...set(outcomeId) };
}

// --- The PACING block ---

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const SWITCH_PHASE: Record<Phase, (players: string) => string> = {
  opening: () => "the opening of the story. What it asks of the next thread: meet the world and its people; the directions range over all outcomes.",
  middle: (players) => `the middle of the story. What it asks of the next thread: complicate what ${players} built (a rival moves, an ally doubts, a price comes due).`,
  late: () => "the late part of the story. What it asks of the next thread: push an outcome that still needs milestones; no new mysteries.",
  // Which outcome the last thread pushes is step b's (binding late: those with no thread yet first), so the phase names none
  final: () => "the story's final thread. What it asks of it: the story's climax, on an outcome step b allows.",
};

const THREAD_PHASE: Record<Phase, string> = {
  opening: "the opening of the story.",
  middle: "the middle of the story.",
  late: "the late part of the story.",
  final: "the story's final thread.",
};

/** The latest two chapters' lengths, newest first; with their outcomes for the switch planner. */
function recentLine(story: Story, withOutcomes: boolean): string {
  const recent = chapterPlans(story).slice(-2).reverse();
  if (recent.length === 0) return "Recent threads: none yet.";
  const parts = recent.map((p) => {
    const ids = [...new Set(p.threads.map((t) => t.outcomeId).filter(Boolean))];
    return `${p.duration} beats${withOutcomes && ids.length ? ` (${ids.join(", ")})` : ""}`;
  });
  return `Recent threads: ${parts.join(", ")}.`;
}

function needLine(need: OutcomeNeed): string {
  const parts = [`${need.recorded} of ${need.intended}`];
  if (need.pending) parts.push(`+${need.pending} pending${need.pendingText ? ` ("${need.pendingText}")` : ""}`);
  if (need.noChapterYet) parts.push("no thread yet");
  return `- ${need.id}${need.main ? " (the main outcome)" : ""}: ${parts.join(", ")} → ${need.stillNeeded ? `${need.stillNeeded} still needed` : "complete"}`;
}

/** The block for the switch planner, in place of STORY PROGRESS (it carries the turn and the turns left). */
export function switchPacingBlock(story: Story): string {
  const left = turnsLeft(story);
  const turn = story.getCurrentTurn() + 1;
  const fit = chaptersThatFit(left);
  const last = lastChapterAfterSwitch(left);
  const ended = (story.getCurrentThreadAnalysis()?.threads ?? []).some((t) => t.resolution !== null);
  const multiplayer = story.isMultiplayer();
  const lines = [
    "======= PACING =======",
    `Turn ${turn} of ${story.getMaxTurns()}; ${plural(left, "turn")} left, this one included. A switch and its thread take about 4 turns, so about ${fit} more ${fit === 1 ? "thread fits" : "threads fit"}, the one this switch opens included.`,
    ended ? "Milestones still needed (the thread that just ended counts as pending):" : "Milestones still needed:",
  ];
  for (const slot of story.getPlayerSlots()) {
    const needs = outcomeNeeds(story, slot, true);
    if (multiplayer) lines.push(`${slot} (${story.getPlayer(slot)?.name ?? slot}):`);
    lines.push(...needs.map(needLine));
    const total = needs.reduce((sum, n) => sum + n.stillNeeded, 0);
    lines.push(`${plural(total, "milestone")} still needed for about ${plural(fit, "thread")}.`);
    const complete = needs.filter((n) => n.complete).map((n) => n.id);
    lines.push(`Complete: ${complete.length ? complete.join(", ") : "none"}.`);
  }
  lines.push(recentLine(story, true));
  lines.push(`Phase: ${SWITCH_PHASE[phaseOf(turn, story.getMaxTurns(), last !== undefined)](multiplayer ? "the players have" : "the player has")}`);
  if (last !== undefined) lines.push(`The thread this switch opens is the last before the ending: it has exactly ${last} beats.`);
  return lines.join("\n");
}

function lengthsText(lengths: number[]): string {
  if (lengths.length === 0) return "any of 2, 3 or 4 beats (too few turns are left for the story to end on its turn count)";
  if (lengths.length === 1) return `${lengths[0]} beats`;
  return `${lengths.slice(0, -1).join(", ")} or ${lengths[lengths.length - 1]} beats`;
}

function pushedLine(need: OutcomeNeed): string {
  const size =
    need.stillNeeded === 0
      ? "complete, so this thread's milestone is an aftermath"
      : need.stillNeeded === 1
        ? "this thread's milestone is its last one"
        : `${need.stillNeeded} still needed`;
  return `${need.id}: ${need.recorded} of ${need.intended} milestones; ${size}.`;
}

/** The outcomes the players' picks set, each once, with the slots that picked it. */
function pickedNeeds(story: Story): { need: OutcomeNeed; slots: string[] }[] {
  const byId = new Map<string, { need: OutcomeNeed; slots: string[] }>();
  for (const slot of story.getPlayerSlots()) {
    const id = pickedOutcome(story, slot)?.outcomeId;
    const need = id ? outcomeNeeds(story, slot, false).find((n) => n.id === id) : undefined;
    if (!id || !need) continue;
    const known = byId.get(id);
    if (known) known.slots.push(slot);
    else byId.set(id, { need, slots: [slot] });
  }
  return [...byId.values()];
}

/** The block for the chapter planner, at the end of its state. */
export function threadPacingBlock(story: Story): string {
  const left = turnsLeft(story);
  const turn = story.getCurrentTurn() + 1;
  const last = isLastChapter(left);
  const lines = ["======= PACING =======", `This thread starts at turn ${turn} of ${story.getMaxTurns()}; ${plural(left, "turn")} ${left === 1 ? "is" : "are"} left, this one included.`];
  lines.push(last ? `This is the story's last thread: exactly ${left} beats. It is the story's climax.` : `Allowed lengths for this thread: ${lengthsText(allowedLengths(left))}.`);
  const picked = pickedNeeds(story);
  if (picked.length === 1 && !story.isMultiplayer()) lines.push(`The outcome this thread pushes: ${pushedLine(picked[0].need)}`);
  else if (picked.length > 0) lines.push("The outcomes the players' choices set:", ...picked.map((p) => `- ${pushedLine(p.need)} (${p.slots.join(", ")})`));
  lines.push(recentLine(story, false));
  lines.push(`Phase: ${THREAD_PHASE[phaseOf(turn, story.getMaxTurns(), last)]}`);
  return lines.join("\n");
}
