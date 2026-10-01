import type { Story } from "core/models/Story.js";
import type { Resolution, Stat, Thread } from "core/types/index.js";
import { getThreadType } from "core/types/thread.js";
import { isContestedOutcome } from "core/utils/outcomeReadiness.js";

/*
 * A contest's scoreboard is the shared opposites stat its outcome's resonance
 * names ("Scored by …"): setup round 3's form (production since 2026-09-28),
 * which also puts player1's side first (with three players, player1's camp),
 * so the value is that side's share and a move up is a move toward it. A
 * story set up before then names no scoreboard, and its opposites stats were
 * meters for what changes often ("Order|Chaos"), with either side first, so
 * none is read as one. Side A of a contest player1 is in is player1's (the
 * plan check's PL-11, since 2026-09-27); a contest player1 sits out keeps the
 * planner's sides, which no check reads, so its result says nothing about
 * the scoreboard's direction. The setup's rule moves a scoreboard only after
 * a thread about that contest, 10 to 20 points toward the side that won,
 * none after a mixed result (setupPromptText.ts, SCOREBOARD_LINE).
 */

export type ScoreboardWinner = "sideA" | "sideB";

const SCORED_BY = /Scored by ([^.]+)\.?\s*$/i;

/**
 * A name as a setup writes it after "Scored by", for comparison: lower case,
 * a possessive's 's and every other mark between words left out, a trailing
 * "stat" or "scoreboard" too ("Youssef's Partnership|Friendship's Partnership
 * stat" reads "youssef partnership friendship partnership").
 */
const plainName = (text: string): string =>
  text
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+(?:stat|scoreboard)$/, "");

/**
 * The scoreboard a contested shared outcome names, or undefined (not contested,
 * or it names no shared opposites stat the story has, or two). Setup round 3's
 * form asks for the stat's name ("Scored by <name of its scoreboard stat>."),
 * and the stored setups on that form wrote it 83 times in 91; the others named
 * the stat's id or its id's words (the third playthroughs' food trucks: "Scored
 * by Contract Race" for shared_contract_race, named "Innovator's Lead|Circuit
 * Caterer's Lead"; the first round's space pirates: "Black Star Lead";
 * "shared_bounty_score"), left a possessive out ("Youssef's Courtship" for
 * shared_youssef_courtship) or put " stat" after the name. Until 2026-10-01
 * the name alone was read, so those boards moved however the reply wrote them.
 * The story's only opposites stat is never taken for it: a story set up before
 * round 3 used its opposites stats as meters, with either side first.
 */
export function scoreboardOf(story: Story, outcomeId: string): Stat | undefined {
  const outcome = story.getSharedOutcomes().find((o) => o.id === outcomeId);
  if (!outcome || !isContestedOutcome(outcome)) return undefined;
  const written = SCORED_BY.exec(outcome.resonance ?? "")?.[1]?.trim();
  if (!written) return undefined;
  const opposites = story.getSharedStats().filter((stat) => stat.type === "opposites");
  const byName = opposites.find((stat) => stat.name.trim().toLowerCase() === written.toLowerCase());
  if (byName) return byName;
  const named = plainName(written);
  if (!named) return undefined;
  const matches = opposites.filter((stat) => [stat.name, stat.id, stat.id.replace(/^shared_/, "")].some((form) => plainName(form) === named));
  return matches.length === 1 ? matches[0] : undefined;
}

/** Every contest's scoreboard (scoreboardOf), by its stat id. */
export function scoreboardsOf(story: Story): Map<string, Stat> {
  const boards = story
    .getSharedOutcomes()
    .flatMap((outcome) => {
      const board = scoreboardOf(story, outcome.id);
      return board ? [board] : [];
    });
  return new Map(boards.map((board) => [board.id, board]));
}

/**
 * The results this turn follows, thread by thread: at a switch or the ending,
 * the chapter that just ended (its result); in a chapter, its step just
 * played (none on the chapter's first step). The eval's playthroughs read it
 * too, beside the scoreboard's move.
 */
export function resultsFollowed(story: Story): { thread: Thread; result: Resolution | null }[] {
  const beatType = story.getCurrentBeatType();
  if (beatType === "switch" || beatType === "ending") {
    return (story.getResolvedThreadAnalysis()?.threads ?? []).map((thread) => ({ thread, result: thread.resolution }));
  }
  if (beatType !== "thread") return [];
  return (story.getCurrentThreadAnalysis()?.threads ?? []).flatMap((thread) => {
    const resolved = thread.progression.filter((step) => step.resolution !== null);
    return resolved.length > 0 ? [{ thread, result: resolved[resolved.length - 1].resolution }] : [];
  });
}

/**
 * A contest's result as its scoreboard reads it: the result in contest terms, and whether side A is the board's first
 * side (player1's: a contest player1 is on side A of, or one the plan check made one side's challenge, whose stored side
 * is the board's). Undefined for a thread that is no contest: a challenge without a stored side (planned as one, or
 * converted before 2026-10-01) or an exploration. The eval's playthroughs record it too.
 */
export type BoardResult = { result: "sideAWins" | "mixed" | "sideBWins" | null; oriented: boolean; converted?: true };

export function boardResultOf(thread: Thread, result: Resolution | null): BoardResult | undefined {
  const type = getThreadType(thread);
  if (type === "contest") {
    const read = result === "sideAWins" || result === "mixed" || result === "sideBWins" ? result : null;
    return { result: read, oriented: thread.playersSideA.includes("player1") };
  }
  // A contest the plan check made one side's challenge (PL-12): its favorable result is its stored side's win
  const side = type === "challenge" ? thread.favorableSide : undefined;
  if (!side) return undefined;
  const other = side === "sideA" ? "sideB" : "sideA";
  const read = result === "favorable" ? (`${side}Wins` as const) : result === "unfavorable" ? (`${other}Wins` as const) : result === "mixed" ? "mixed" : null;
  return { result: read, oriented: true, converted: true };
}

/** The side a contest's result names on its scoreboard, or null: none, or one the result can't be oriented by. */
function winnerOf(read: BoardResult): ScoreboardWinner | null {
  if (!read.oriented) return null;
  return read.result === "sideAWins" ? "sideA" : read.result === "sideBWins" ? "sideB" : null;
}

/**
 * Which side won the contest step or chapter this turn follows, per
 * scoreboard stat id. A mixed result names no winner, and neither does a
 * contest player1 is not on side A of (sitting out, or on side B of a plan
 * PL-11 never saw). A contest the plan check made one side's challenge is
 * read by the side it stored (`favorableSide`, since 2026-10-01): its
 * favorable result is that side's win, its unfavorable one the other's; a
 * challenge without one (planned as such, or converted before then) names no
 * winner. A scoreboard is left alone where its contests disagree or any of
 * them names no winner.
 */
export function scoreboardWinners(story: Story): Map<string, ScoreboardWinner> {
  const winners = new Map<string, ScoreboardWinner | null>();
  for (const { thread, result } of resultsFollowed(story)) {
    const read = boardResultOf(thread, result);
    if (!read) continue;
    const board = scoreboardOf(story, thread.outcomeId);
    if (!board) continue;
    const winner = winnerOf(read);
    winners.set(board.id, winners.has(board.id) && winners.get(board.id) !== winner ? null : winner);
  }
  return new Map([...winners].filter((entry): entry is [string, ScoreboardWinner] => entry[1] !== null));
}
