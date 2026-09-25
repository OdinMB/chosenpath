import type { Beat, StoryCategory } from "core/types";

/*
 * Which AI notice a story needs, and when to repeat it (AI Act Art. 50(1)):
 * a child-friendly wording for read-with-kids stories, and a reminder at each
 * new Thread in the emotionally loaded categories. Used by GameAiNotice and
 * useThreadChangeReminder, neither of which is mounted yet.
 */

export type GameAiNoticeVariant = "default" | "kids" | "reminder";

/** Stories that repeat the AI notice whenever a new Thread starts. */
export const THREAD_REMINDER_CATEGORIES: ReadonlySet<StoryCategory> = new Set<
  StoryCategory
>(["vent-about-reality", "see-your-future-self"]);

/** The notice shown at the start of a story. */
export function gameAiNoticeVariant(
  category: StoryCategory | undefined
): "default" | "kids" {
  return category === "read-with-kids" ? "kids" : "default";
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
