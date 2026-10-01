import type { Story } from "core/models/Story.js";
import type { Outcome, StoryPhase, Switch, SwitchAnalysis, ThreadAnalysis } from "core/types/index.js";
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
 *   of about three turns), and since 2026-09-30 never fewer than the length
 *   rule makes come (the one change against the measured copy);
 * - still needed = intended − recorded − pending, never below 0; pending is
 *   the chapter that just ended, which the switch turn records only after the
 *   switch planner has run;
 * - allowed lengths: 2 to 4, and either exactly the turns left (the story ends
 *   with this chapter) or leaving at least 3 (a switch and a two-turn chapter);
 * - the last chapter: 4 or fewer turns left after the switch, exactly that many;
 * - the phase: the first quarter of the turns, up to two thirds, then late;
 * - the stage a chapter settles (planner v2e, since 2026-09-30): the one after
 *   the pushed outcome's milestones so far;
 * - the paced lengths (since the pacing-clues stage of 2026-10-01): of the
 *   allowed lengths, those whose threads after the chapter fit the milestones
 *   still needed, with the reason, and the switch plan read against the same
 *   arithmetic (switchPacingProblem). Measured as the eval's pacingCluesB, not
 *   in the measured copy, so planner v2's requests stay as they ran
 *   (adoptedPlanners.test.ts reads them as the adopted edits).
 * Model-facing text says "thread" and "beat" (turn doc Appendix A, vocabulary).
 */

export const TURNS_PER_CHAPTER = 4;

/** Turns left, this one included. */
export const turnsLeft = (story: Story): number => story.getMaxTurns() - story.getCurrentTurn();

/** The lengths a chapter may have when it starts with this many turns left, this one included. */
export function allowedLengths(left: number): number[] {
  return [2, 3, 4].filter((length) => left - length === 0 || left - length >= 3);
}

/**
 * The fewest threads, each a switch turn and a chapter of a length
 * allowedLengths gives, that use up exactly this many turns; undefined when
 * none can (1 or 2 turns left).
 */
export function fewestThreads(left: number): number | undefined {
  const fewest: (number | undefined)[] = [0];
  for (let n = 1; n <= left; n++) {
    const after = allowedLengths(n - 1)
      .map((length) => fewest[n - 1 - length])
      .filter((count): count is number => count !== undefined);
    fewest[n] = after.length ? 1 + Math.min(...after) : undefined;
  }
  return fewest[Math.max(0, left)];
}

/**
 * The most threads, each a switch turn and a chapter of a length
 * allowedLengths gives, that use up exactly this many turns; undefined when
 * none can (1 or 2 turns left). fewestThreads' other end.
 */
export function mostThreads(left: number): number | undefined {
  const most: (number | undefined)[] = [0];
  for (let n = 1; n <= left; n++) {
    const after = allowedLengths(n - 1)
      .map((length) => most[n - 1 - length])
      .filter((count): count is number => count !== undefined);
    most[n] = after.length ? 1 + Math.max(...after) : undefined;
  }
  return most[Math.max(0, left)];
}

/**
 * Threads that fit: turns left ÷ 4, rounded down (a switch and a chapter of
 * about three turns), but never fewer than the threads that must still come
 * (fewestThreads). Near the end the length rule leaves few ways to finish, and
 * ÷ 4 alone undercounted them: at 3 turns left the switch planner read "about
 * 0 more threads fit" beside "exactly 2 beats", at 6 and 7 one where two come
 * (the playthroughs of 2026-09-30). A logged delta against planner v2b's
 * measured ÷ 4 (tests/helpers/adoptedDeltas.ts).
 */
export const chaptersThatFit = (left: number): number => Math.max(0, Math.floor(left / TURNS_PER_CHAPTER), fewestThreads(left) ?? 0);

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

/** Whether the turn being written is in the story's late part: past two thirds of its turns (the late clue lines, lateClues.ts). */
export function isLatePart(story: Story): boolean {
  return phaseOf(story.getCurrentTurn() + 1, story.getMaxTurns(), false) === "late";
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

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// --- The paced lengths and a switch plan against the arithmetic (the pacing-clues stage, adopted 2026-10-01) ---

/*
 * Three of the second round's four 25-turn stories had every outcome complete
 * before their last chapter, which then settled nothing: the chapter planner,
 * told the allowed lengths and nothing about the milestones left, chose 3
 * beats where only 4 leave as few threads as milestones; and the switch
 * planner gave threads to a complete outcome where a stat threshold's or the
 * final thread's instruction asked for one. Measured as the eval's
 * pacingCluesB (storyTextRounds/latePacing.ts) in short whole-story
 * playthroughs beside production: the last chapter kept a milestone to settle
 * 2 of 8 -> 8 of 8, a spare thread kept the last thread's milestone 3 of 10 ->
 * 4 of 4, no milestone left unfinished, waits and cost level.
 */

export type PacedLengths = { lengths: number[]; narrowed?: "longer" | "shorter" };

/**
 * The lengths allowedLengths gives whose threads after the chapter fit the
 * milestones still needed best: as few as must come no more than the
 * milestones (else a later thread settles nothing), as many as can come no
 * fewer (else milestones go unsettled). The allowed lengths where every one
 * fits alike; `narrowed` says which way the others were cut.
 */
export function pacedLengthsFor(left: number, need: number): PacedLengths {
  const allowed = allowedLengths(left);
  if (allowed.length < 2) return { lengths: allowed };
  const scored = allowed.map((length) => {
    const after = left - length;
    const spare = Math.max(0, (fewestThreads(after) ?? 0) - need);
    const short = Math.max(0, need - (mostThreads(after) ?? 0));
    return { length, spare, short, cost: spare + short };
  });
  const best = Math.min(...scored.map((s) => s.cost));
  const kept = scored.filter((s) => s.cost === best);
  if (kept.length === scored.length) return { lengths: allowed };
  const cut = scored.filter((s) => s.cost !== best);
  return { lengths: kept.map((s) => s.length), narrowed: cut.some((s) => s.spare > 0) ? "longer" : "shorter" };
}

/**
 * The milestones still needed once the chapter being planned has settled its
 * stage: per player, their outcomes' still needed less one on each outcome a
 * player's switch pick sets (a shared outcome one player picks counts for
 * every player); the most any player still needs.
 */
export function neededAfterChapter(story: Story): number {
  const picked = new Set(
    story
      .getPlayerSlots()
      .map((slot) => pickedOutcome(story, slot)?.outcomeId)
      .filter((id): id is string => id !== undefined)
  );
  const needs = story.getPlayerSlots().map((slot) => outcomeNeeds(story, slot, false).reduce((sum, need) => sum + Math.max(0, need.stillNeeded - (picked.has(need.id) ? 1 : 0)), 0));
  return needs.length ? Math.max(...needs) : 0;
}

/** The lengths the chapter planner may write, and its plan check reads (planChecks.ts): the allowed lengths at the story's last chapter. */
export function pacedLengths(story: Story): PacedLengths {
  const left = turnsLeft(story);
  if (isLastChapter(left)) return { lengths: allowedLengths(left) };
  return pacedLengthsFor(left, neededAfterChapter(story));
}

/** Why PACING allows only the narrowed lengths, after them. */
export const PACED_LENGTHS_TEXT = {
  longer: "A shorter thread would leave more threads after this one than milestones still needed, and the story's last thread would have none left to settle.",
  shorter: "A longer thread would leave fewer threads after this one than milestones still needed.",
} as const;

/** The outcomes a switch offers its players, by position: a flavor switch's one, a topic switch's directions'. */
export function offeredOutcomes(story: Story, sw: Switch, slot: string): string[] {
  if (sw.type === "flavor") return sw.outcomeId ? [sw.outcomeId] : [];
  const structured = structuredDirections(sw);
  if (structured?.length) return structured.map((d) => (typeof d?.outcomeId === "string" ? d.outcomeId : ""));
  const known = outcomesFor(story, slot).map((o) => o.id);
  return (sw.topicChoices ?? []).map((text) => outcomeIdsNamed(text, known).known[0] ?? "");
}

export type SwitchPacingReading = {
  /** Threads that fit after the switch, the one it opens included (chaptersThatFit) */
  fit: number;
  /** Each player's milestones still needed, the chapter that just ended pending, and the outcomes offered */
  players: { slot: string; needed: number; offered: string[]; offeredComplete: string[] }[];
  /** A player with no thread to spare (as many milestones needed as threads, or more) offered a complete outcome: a thread a forced situation took */
  completeWhileNeeded: boolean;
  /** More threads than any player's milestones: one is to spare */
  spare: boolean;
  /** Where one is to spare and threads follow this one: some player still needs a milestone after this chapter, whichever direction they take */
  keepsLast?: boolean;
};

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** A switch plan read against PACING's arithmetic: whether a complete outcome took a needed thread, and whether a spare thread kept the last thread's milestone. */
export function switchPacingReading(story: Story, plan: SwitchAnalysis): SwitchPacingReading {
  const fit = chaptersThatFit(turnsLeft(story));
  const players = story.getPlayerSlots().map((slot) => {
    const needs = outcomeNeeds(story, slot, true);
    const needed = sum(needs.map((n) => n.stillNeeded));
    const sw = plan.switches.find((s) => s.players.includes(slot));
    const offered = sw ? offeredOutcomes(story, sw, slot) : [];
    const complete = new Set(needs.filter((n) => n.complete).map((n) => n.id));
    return { slot, needed, offered, offeredComplete: offered.filter((id) => complete.has(id)), needs };
  });
  const completeWhileNeeded = players.some((p) => p.needed >= fit && p.offeredComplete.length > 0);
  const most = Math.max(0, ...players.map((p) => p.needed));
  const spare = most < fit;
  // Worst case: each player takes a direction on an outcome they still need, where one is offered
  const after = players.map((p) => p.needed - (p.offered.some((id) => p.needs.some((n) => n.id === id && n.stillNeeded > 0)) ? 1 : 0));
  return {
    fit,
    players: players.map(({ slot, needed, offered, offeredComplete }) => ({ slot, needed, offered, offeredComplete })),
    completeWhileNeeded,
    spare,
    ...(spare && fit >= 2 ? { keepsLast: Math.max(0, ...after) >= 1 } : {}),
  };
}

/** What the switch plan check tells the planner where a thread is to spare and the last milestone goes before the last thread. */
export const SPARE_THREAD_PROBLEM =
  "a thread is to spare before the story's last thread, but this switch lets every milestone still needed be settled before it, so the last thread would have none left to settle: keep one outcome's last milestone for the thread the last switch opens, and give this thread to another outcome (a complete one if no other is open)";

/**
 * What the switch plan check (planChecks.ts, checkedSwitchPlan) tells the
 * planner where a usable plan breaks step b's pacing, read from PACING's
 * arithmetic (switchPacingReading), or undefined: a player with no thread to
 * spare offered a complete outcome (the setup's final-thread or threshold
 * instruction taking a needed thread); a thread to spare whose plan lets every
 * milestone still needed be settled before the story's last thread (only where
 * some milestone is still needed). The check asks once more, told the problem,
 * and never fails the turn on it.
 */
export function switchPacingProblem(story: Story, plan: SwitchAnalysis): string | undefined {
  const reading = switchPacingReading(story, plan);
  const problems = reading.players
    .filter((p) => p.needed >= reading.fit && p.offeredComplete.length > 0)
    .map(
      (p) =>
        `${p.slot} still needs ${plural(p.needed, "milestone")} with ${plural(reading.fit, "thread")} left, the one this switch opens included, but its switch offers ${p.offeredComplete.join(", ")}, already complete: offer ${p.slot} an outcome that still needs milestones, and let the story's instructions shape that thread instead`
    );
  if (reading.keepsLast === false && reading.players.some((p) => p.needed > 0)) problems.push(SPARE_THREAD_PROBLEM);
  return problems.length ? problems.join("; ") : undefined;
}

// --- The PACING block ---

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

/** The chapter planner's lengths line: the paced lengths, and why where they narrow the allowed ones (pacedLengths). */
function lengthsLine(story: Story): string {
  const paced = pacedLengths(story);
  const line = `Allowed lengths for this thread: ${lengthsText(paced.lengths)}.`;
  if (!paced.narrowed) return line;
  return `${line} ${paced.narrowed === "longer" ? PACED_LENGTHS_TEXT.longer : PACED_LENGTHS_TEXT.shorter}`;
}

/**
 * The stage a chapter settles (planner v2e, adopted 2026-09-30; the owner's
 * feedback of 2026-09-29 on a first chapter that reached into its outcome's
 * next stage): an outcome with n intended milestones has n stages from start
 * to finish, and the next chapter settles the one after the milestones it has
 * (stage recorded + 1 of n), so a story saved mid-story reads its stage from
 * the milestones it holds. The story's last chapter too settles only its
 * next stage (the owner's decision of 2026-09-30); the ending tells each
 * outcome as its milestones leave it. None once the outcome is complete: that
 * chapter is an aftermath.
 */
export function stageOf(recorded: number, intended: number): { stage: number; of: number; last: boolean } | undefined {
  if (intended < 1 || recorded >= intended) return undefined;
  return { stage: recorded + 1, of: intended, last: recorded + 1 === intended };
}

function pushedLine(need: OutcomeNeed): string {
  const size =
    need.stillNeeded === 0
      ? "complete, so this thread's milestone is an aftermath"
      : need.stillNeeded === 1
        ? "this thread's milestone is its last one"
        : `${need.stillNeeded} still needed`;
  const stage = stageOf(need.recorded, need.intended);
  const settles = stage ? `; this thread settles stage ${stage.stage} of ${stage.of}${stage.last ? ", the last" : ""}` : "";
  return `${need.id}: ${need.recorded} of ${need.intended} milestones; ${size}${settles}.`;
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
  lines.push(last ? `This is the story's last thread: exactly ${left} beats. It is the story's climax.` : lengthsLine(story));
  const picked = pickedNeeds(story);
  if (picked.length === 1 && !story.isMultiplayer()) lines.push(`The outcome this thread pushes: ${pushedLine(picked[0].need)}`);
  else if (picked.length > 0) lines.push("The outcomes the players' choices set:", ...picked.map((p) => `- ${pushedLine(p.need)} (${p.slots.join(", ")})`));
  lines.push(recentLine(story, false));
  lines.push(`Phase: ${THREAD_PHASE[phaseOf(turn, story.getMaxTurns(), last)]}`);
  return lines.join("\n");
}
