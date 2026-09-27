import type {
  StorySetupFailureReason,
  StoryStatusInfo,
} from "core/types/api";

/*
 * Polls a custom story's setup status (GET /stories/:id/status) until the
 * story is ready or its setup has failed for good. A failed request is polled
 * again; after MAX_CONSECUTIVE_POLL_ERRORS in a row the poll gives up as
 * "unreachable", so a server that went away doesn't leave the player waiting
 * forever either. Pure apart from what it is given, for useStoryCreation.
 */

export const MAX_CONSECUTIVE_POLL_ERRORS = 3;

export type StoryPollFailure = StorySetupFailureReason | "unreachable";

export type StoryStatusPoll = {
  check: () => Promise<StoryStatusInfo>;
  schedule: (next: () => void, delayMs: number) => void;
  /** The wait before the next poll. */
  delayFor: () => number;
  /** True once the player left this attempt (went back, tried again, left the page). */
  isCancelled: () => boolean;
  onReady: () => void;
  onFailed: (reason: StoryPollFailure) => void;
};

/** Polls now, then on the schedule, until ready, failed or cancelled. */
export function pollStoryStatus({
  check,
  schedule,
  delayFor,
  isCancelled,
  onReady,
  onFailed,
}: StoryStatusPoll): Promise<void> {
  let consecutiveErrors = 0;

  const poll = async (): Promise<void> => {
    if (isCancelled()) return;
    try {
      const { status, reason } = await check();
      consecutiveErrors = 0;
      if (isCancelled()) return;
      if (status === "ready") {
        onReady();
        return;
      }
      if (status === "failed") {
        onFailed(reason ?? "setup_failed");
        return;
      }
    } catch {
      consecutiveErrors += 1;
      if (isCancelled()) return;
      if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
        onFailed("unreachable");
        return;
      }
    }
    schedule(() => void poll(), delayFor());
  };

  return poll();
}
