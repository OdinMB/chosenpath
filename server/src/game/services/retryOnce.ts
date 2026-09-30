/*
 * One more model call for a reply that parsed but can't be used. A call that
 * fails outright is not retried here: the chat model already retries failed
 * requests.
 */

/** Two replies in a row could not be used. The problem stays off the message (it may name model-written ids). */
export class UnusableResultError extends Error {
  readonly problem: string;

  constructor(what: string, problem: string) {
    super(`Failed to generate a usable ${what}`);
    this.name = "UnusableResultError";
    this.problem = problem;
  }
}

/**
 * How many more times a turn (moveStoryForward) whose writing fails is sent
 * before the players are told it failed: once. Its own safeguards (the chat
 * model's re-sends, the plan check's retry) have already run by then; before
 * 2026-09-30 nothing ever sent it again, so the players were stuck at that
 * turn for good (the playthroughs' group stories). Nothing else is resent.
 * GameQueueProcessor sends it; the eval's playthroughs play by it.
 */
export const TURN_RESENDS = 1;

/** An error's class for a log line ("APIConnectionTimeoutError"); its message can quote the model's reply. */
export const errorClass = (error: unknown): string => (error instanceof Error ? error.name || "Error" : typeof error);

/**
 * Runs `attempt` and checks its result with `problemOf`. A result with a
 * problem gets one more attempt, which is told that problem; when the second
 * result has a problem too, throws an UnusableResultError.
 */
export async function withOneRetry<T>(
  attempt: (previousProblem?: string) => Promise<T>,
  problemOf: (result: T) => string | null | undefined,
  what: string
): Promise<T> {
  const first = await attempt();
  const firstProblem = problemOf(first);
  if (!firstProblem) return first;

  const second = await attempt(firstProblem);
  const secondProblem = problemOf(second);
  if (!secondProblem) return second;

  throw new UnusableResultError(what, secondProblem);
}
