import { useMemo } from "react";
import type { Beat, StoryCategory } from "core/types";
import { shouldRemindAtThreadChange } from "game/utils/aiNotice";

/**
 * Whether the beat on screen should carry the AI reminder: true on the first
 * beat of each new Thread in vent and future-self stories. Not used yet; it
 * goes with GameAiNotice once the owner approves the notice copy.
 */
export function useThreadChangeReminder(
  category: StoryCategory | undefined,
  beatHistory: Pick<Beat, "title">[]
): boolean {
  return useMemo(
    () => shouldRemindAtThreadChange(category, beatHistory),
    [category, beatHistory]
  );
}
