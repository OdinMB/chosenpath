import { useMemo, useState } from "react";
import type { Beat, StoryCategory } from "core/types";
import type { AiNoticeVariant } from "shared/components/AiNotice";
import {
  beatAiNoticeVariant,
  sessionOpeningBeatIndex,
} from "game/utils/aiNotice";

/**
 * The AI notice for the beat on screen. A session starts when the story view
 * mounts: the beat the player first acts on then carries the session notice,
 * so every visit shows it once and nothing hides it for good.
 */
export function useBeatAiNotice(
  category: StoryCategory | undefined,
  beatHistory: Pick<Beat, "title" | "choice">[],
  displayedBeatIndex: number | null
): AiNoticeVariant | undefined {
  const [openingBeatIndex] = useState(() =>
    sessionOpeningBeatIndex(beatHistory)
  );
  return useMemo(
    () =>
      beatAiNoticeVariant(
        category,
        beatHistory,
        displayedBeatIndex,
        openingBeatIndex
      ),
    [category, beatHistory, displayedBeatIndex, openingBeatIndex]
  );
}
