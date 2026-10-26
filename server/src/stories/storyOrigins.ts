import { storyDbService } from "./StoryDbService.js";

/*
 * Whether a story was started from an account ("account") or without one
 * ("anonymous"), remembered per story, so the per-choice limit (websocket.ts)
 * and the spend ledger don't query the database on every choice or AI call.
 *
 * A story's creator is written once, when the story is created. Its only
 * later change is to none, when the account is deleted (ON DELETE SET NULL),
 * which makes the story anonymous: the stricter side. So a remembered answer
 * can only ever be too lax about an account-started story, and never wrong
 * the other way. forgetStoriesOfCreator() drops those when this process
 * deletes an account; ORIGIN_TTL_MS bounds them when another process does.
 */

/** Who started a story: a signed-in user, or someone without an account. */
export type StoryOrigin = "account" | "anonymous";

const ORIGIN_TTL_MS = 10 * 60 * 1000;
const MAX_REMEMBERED = 10_000;

type Remembered = {
  origin: Promise<StoryOrigin>;
  expiresAt: number;
  /** Known once the lookup answered with a creator */
  creatorId?: string;
  settled: boolean;
};

const remembered = new Map<string, Remembered>();

function forget(storyId: string, entry: Remembered): void {
  if (remembered.get(storyId) === entry) remembered.delete(storyId);
}

function lookUp(storyId: string, now: number): Remembered {
  const entry: Remembered = {
    expiresAt: now + ORIGIN_TTL_MS,
    settled: false,
    origin: Promise.resolve("anonymous"),
  };
  entry.origin = storyDbService.getStoryCreatorId(storyId).then(
    (creatorId) => {
      entry.settled = true;
      // No such story (yet): answered as anonymous, but not remembered
      if (creatorId === undefined) forget(storyId, entry);
      if (creatorId) entry.creatorId = creatorId;
      return creatorId ? "account" : "anonymous";
    },
    (error: unknown) => {
      forget(storyId, entry);
      throw error;
    }
  );
  return entry;
}

/**
 * The story's origin; a story without a row reads as anonymous. Concurrent
 * calls for one story share one lookup; a failed lookup rejects and is not
 * remembered.
 */
export function storyOrigin(
  storyId: string,
  now: number = Date.now()
): Promise<StoryOrigin> {
  const known = remembered.get(storyId);
  if (known && known.expiresAt > now) return known.origin;

  const entry = lookUp(storyId, now);
  remembered.delete(storyId);
  remembered.set(storyId, entry);
  // The oldest entries go first (a Map keeps insertion order)
  while (remembered.size > MAX_REMEMBERED) {
    const oldest = remembered.keys().next().value;
    if (oldest === undefined) break;
    remembered.delete(oldest);
  }
  return entry.origin;
}

/**
 * Forgets the stories of a deleted account, which are anonymous from now on,
 * and every lookup still running, which may have read the creator before the
 * deletion.
 */
export function forgetStoriesOfCreator(userId: string): void {
  for (const [storyId, entry] of remembered) {
    if (!entry.settled || entry.creatorId === userId) remembered.delete(storyId);
  }
}

/** Forgets everything; for tests. */
export function forgetAllStoryOrigins(): void {
  remembered.clear();
}
