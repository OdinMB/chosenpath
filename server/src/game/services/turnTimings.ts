import { Logger } from "shared/logger.js";

/*
 * Per-turn timings from in-memory timestamps: how long players wait for a new
 * turn, how long they read before choosing, and whether the pregeneration for
 * the chosen option was ready (or is still running, which means the live
 * progression duplicates it). Logs story ids, turns, slots and seconds only,
 * never text. Background: .context/text-model-eval.md.
 */

export type PregenState = "complete" | "partial" | "none";

export type TurnTimingRecord =
  | { event: "delivered"; storyId: string; turn: number; players: number; waitSeconds?: number }
  | {
      event: "choice";
      storyId: string;
      turn: number;
      slot: string;
      readingSeconds?: number;
      pregen: PregenState;
      duplicate: boolean;
    }
  | {
      event: "pregeneration";
      storyId: string;
      turn: number;
      slot: string;
      option: number;
      seconds: number;
      ok: boolean;
    };

type StoryTimes = {
  deliveredTurn: number;
  deliveredAt?: number;
  lastChoiceAt?: number;
};

export const MAX_TRACKED_STORIES = 5_000;

export type TurnTimings = {
  noteBroadcast: (storyId: string, turn: number, players: number) => void;
  noteChoice: (
    storyId: string,
    turn: number,
    slot: string,
    pregenState: PregenState,
    pregenInProgress: boolean
  ) => void;
  notePregenerationFinished: (
    storyId: string,
    turn: number,
    slot: string,
    option: number,
    ms: number,
    ok: boolean
  ) => void;
};

const seconds = (ms: number) => Math.round(ms / 100) / 10;

export function createTurnTimings(
  now: () => number,
  log: (record: TurnTimingRecord) => void,
  maxStories: number = MAX_TRACKED_STORIES
): TurnTimings {
  // Insertion order is recency order: a touched story is re-inserted
  const stories = new Map<string, StoryTimes>();

  const touch = (storyId: string): StoryTimes => {
    const times = stories.get(storyId) ?? { deliveredTurn: 0 };
    stories.delete(storyId);
    stories.set(storyId, times);
    while (stories.size > maxStories) {
      const oldest = stories.keys().next().value;
      if (oldest === undefined) break;
      stories.delete(oldest);
    }
    return times;
  };

  return {
    noteBroadcast(storyId, turn, players) {
      const times = touch(storyId);
      // Broadcasts also carry choices and images; only a new turn is a delivery
      if (turn <= times.deliveredTurn) {
        return;
      }
      const at = now();
      times.deliveredTurn = turn;
      times.deliveredAt = at;
      log({
        event: "delivered",
        storyId,
        turn,
        players,
        waitSeconds: times.lastChoiceAt === undefined ? undefined : seconds(at - times.lastChoiceAt),
      });
    },

    noteChoice(storyId, turn, slot, pregenState, pregenInProgress) {
      const times = touch(storyId);
      const at = now();
      const readingSeconds =
        turn === times.deliveredTurn && times.deliveredAt !== undefined
          ? seconds(at - times.deliveredAt)
          : undefined;
      times.lastChoiceAt = at;
      log({
        event: "choice",
        storyId,
        turn,
        slot,
        readingSeconds,
        pregen: pregenState,
        duplicate: pregenState !== "complete" && pregenInProgress,
      });
    },

    notePregenerationFinished(storyId, turn, slot, option, ms, ok) {
      log({ event: "pregeneration", storyId, turn, slot, option, seconds: seconds(ms), ok });
    },
  };
}

const logger = Logger.forService("TurnTiming");

/** The production instance. */
export const { noteBroadcast, noteChoice, notePregenerationFinished } = createTurnTimings(
  Date.now,
  (record) => logger.log(JSON.stringify(record))
);
