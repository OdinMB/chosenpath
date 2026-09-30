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

/** The scoreboard a contested shared outcome names, or undefined (not contested, or it names no shared opposites stat the story has). */
export function scoreboardOf(story: Story, outcomeId: string): Stat | undefined {
  const outcome = story.getSharedOutcomes().find((o) => o.id === outcomeId);
  if (!outcome || !isContestedOutcome(outcome)) return undefined;
  const named = SCORED_BY.exec(outcome.resonance ?? "")?.[1]?.trim().toLowerCase();
  if (!named) return undefined;
  return story
    .getSharedStats()
    .find((stat) => stat.type === "opposites" && stat.name.trim().toLowerCase() === named);
}

/**
 * The results this turn follows, thread by thread: at a switch or the ending,
 * the chapter that just ended (its result); in a chapter, its step just
 * played (none on the chapter's first step).
 */
function resultsFollowed(story: Story): { thread: Thread; result: Resolution | null }[] {
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
 * Which side won the contest step or chapter this turn follows, per
 * scoreboard stat id. A mixed result names no winner, and neither does a
 * contest player1 is not on side A of (sitting out, or on side B of a plan
 * PL-11 never saw). A scoreboard is left alone where its contests disagree
 * or any of them names no winner.
 */
export function scoreboardWinners(story: Story): Map<string, ScoreboardWinner> {
  const winners = new Map<string, ScoreboardWinner | null>();
  for (const { thread, result } of resultsFollowed(story)) {
    if (getThreadType(thread) !== "contest") continue;
    const board = scoreboardOf(story, thread.outcomeId);
    if (!board) continue;
    const oriented = thread.playersSideA.includes("player1");
    const winner: ScoreboardWinner | null =
      !oriented ? null : result === "sideAWins" ? "sideA" : result === "sideBWins" ? "sideB" : null;
    winners.set(board.id, winners.has(board.id) && winners.get(board.id) !== winner ? null : winner);
  }
  return new Map([...winners].filter((entry): entry is [string, ScoreboardWinner] => entry[1] !== null));
}
