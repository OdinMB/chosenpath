import type { Beat, StoryCategory } from "core/types";
import type { AiNoticeVariant } from "shared/components/AiNotice";

/*
 * Which AI notice sits above the beat on screen (AI Act Art. 50(1)): the
 * session notice (child-friendly in read-with-kids stories) on the first beat
 * a player sees in a session, and a reminder at each new Thread in the
 * emotionally loaded categories. Used by useBeatAiNotice.
 */

/**
 * Stories that repeat the AI notice whenever a new Thread starts. Coaching
 * stories are future-self stories: the coach pages link to that category.
 */
export const THREAD_REMINDER_CATEGORIES: ReadonlySet<StoryCategory> = new Set<
  StoryCategory
>(["vent-about-reality", "see-your-future-self"]);

/** The notice shown at the start of a session. */
export function gameAiNoticeVariant(
  category: StoryCategory | undefined
): "session" | "kids" {
  return category === "read-with-kids" ? "kids" : "session";
}

// Thread beats are titled "[thread title] ([beat in thread]/[beats in thread])"
const THREAD_TITLE = /^(.*\S)\s*\(\s*\d+\s*\/\s*\d+\s*\)\s*$/;

/** The thread a beat belongs to, or undefined for switches, intros and the ending. */
export function threadKeyOf(
  beat: Pick<Beat, "title"> | undefined
): string | undefined {
  const match = beat?.title.match(THREAD_TITLE);
  return match?.[1] ? match[1].trim().toLowerCase() : undefined;
}

/** Whether the latest beat opens a Thread the previous beat was not part of. */
export function startsNewThread(beatHistory: Pick<Beat, "title">[]): boolean {
  const latest = threadKeyOf(beatHistory[beatHistory.length - 1]);
  if (!latest) {
    return false;
  }
  return threadKeyOf(beatHistory[beatHistory.length - 2]) !== latest;
}

export function shouldRemindAtThreadChange(
  category: StoryCategory | undefined,
  beatHistory: Pick<Beat, "title">[]
): boolean {
  return (
    category !== undefined &&
    THREAD_REMINDER_CATEGORIES.has(category) &&
    startsNewThread(beatHistory)
  );
}

/**
 * The first beat a player acts on in a session: the latest beat, or the one
 * still being written when the latest already has a choice. 0 before the
 * story's first beat exists.
 */
export function sessionOpeningBeatIndex(
  beatHistory: Pick<Beat, "choice">[]
): number {
  const latest = beatHistory[beatHistory.length - 1];
  if (!latest) {
    return 0;
  }
  return latest.choice === -1 ? beatHistory.length - 1 : beatHistory.length;
}

/**
 * The notice above the beat on screen, if any. A null index is the story
 * view's first paint, before it has picked a beat: that is the session's
 * start, so it carries the session notice.
 */
export function beatAiNoticeVariant(
  category: StoryCategory | undefined,
  beatHistory: Pick<Beat, "title">[],
  displayedBeatIndex: number | null,
  openingBeatIndex: number
): AiNoticeVariant | undefined {
  if (displayedBeatIndex === null || displayedBeatIndex === openingBeatIndex) {
    return gameAiNoticeVariant(category);
  }
  if (displayedBeatIndex >= beatHistory.length) {
    return undefined;
  }
  const upToDisplayed = beatHistory.slice(0, displayedBeatIndex + 1);
  return shouldRemindAtThreadChange(category, upToDisplayed)
    ? "reminder"
    : undefined;
}
