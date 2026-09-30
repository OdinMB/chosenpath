import type { Story } from "core/models/Story.js";
import type { Resolution, Stat, Thread } from "core/types/index.js";
import { getThreadType } from "core/types/thread.js";
import { isContestedOutcome } from "core/utils/outcomeReadiness.js";

/*
 * A contest's scoreboard is the shared opposites stat that keeps its score:
 * the one its outcome's resonance names ("Scored by …", the setup's rule
 * since setup round 3), else the story's one shared opposites stat. Its value
 * is side A's share (player1's side, or with three players player1's camp),
 * so a move up is a move toward side A. The setup's rule moves it only after
 * a thread about that contest, 10 to 20 points toward the side that won, none
 * after a mixed result (setupPromptText.ts, SCOREBOARD_LINE).
 */

export type ScoreboardWinner = "sideA" | "sideB";

const SCORED_BY = /Scored by ([^.]+)\.?\s*$/i;

/** The scoreboard of a contested shared outcome, or undefined (not contested, or no stat is known to keep its score). */
export function scoreboardOf(story: Story, outcomeId: string): Stat | undefined {
  const outcome = story.getSharedOutcomes().find((o) => o.id === outcomeId);
  if (!outcome || !isContestedOutcome(outcome)) return undefined;
  const opposites = story.getSharedStats().filter((stat) => stat.type === "opposites");
  const named = SCORED_BY.exec(outcome.resonance ?? "")?.[1]?.trim().toLowerCase();
  const byName = named ? opposites.find((stat) => stat.name.trim().toLowerCase() === named) : undefined;
  return byName ?? (opposites.length === 1 ? opposites[0] : undefined);
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
 * scoreboard stat id. A mixed result names no winner, and neither do two
 * contests on one scoreboard that disagree.
 */
export function scoreboardWinners(story: Story): Map<string, ScoreboardWinner> {
  const winners = new Map<string, ScoreboardWinner | null>();
  for (const { thread, result } of resultsFollowed(story)) {
    if (getThreadType(thread) !== "contest") continue;
    const board = scoreboardOf(story, thread.outcomeId);
    if (!board) continue;
    const winner: ScoreboardWinner | null = result === "sideAWins" ? "sideA" : result === "sideBWins" ? "sideB" : null;
    winners.set(board.id, winners.has(board.id) && winners.get(board.id) !== winner ? null : winner);
  }
  return new Map([...winners].filter((entry): entry is [string, ScoreboardWinner] => entry[1] !== null));
}
