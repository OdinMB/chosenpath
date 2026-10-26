import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logger } from "shared/logger";
import { storyApi } from "shared/apiClient";
import { notificationService } from "shared/notifications/notificationService";
import type {
  CreateStoryFromTemplateRequest,
  CreateStoryInfo,
} from "core/types/api";
import { addCodeSetToStorage } from "../../shared/utils/codeSetUtils";
import { useSession } from "../../shared/session/useSession";

/*
 * "Start several stories at once" on a World's settings (TemplateConfigurator):
 * the same template started several times, one after another, each through
 * the ordinary start route and its limits. Each story has its own seat codes
 * and as many seats as the form's player count; the created stories go on to
 * the printable seat cards.
 */

export const STORY_COUNT_MIN = 2;
export const STORY_COUNT_MAX = 12;

/** The number of stories to start: a whole number from 2 to 12. */
export function clampStoryCount(count: number): number {
  if (!Number.isFinite(count)) return STORY_COUNT_MIN;
  return Math.min(STORY_COUNT_MAX, Math.max(STORY_COUNT_MIN, Math.round(count)));
}

/**
 * The count one stepper press away, from the count the start would use (an
 * empty field counts as 2), kept within 2 to 12.
 */
export function stepStoryCount(count: number, step: 1 | -1): number {
  return clampStoryCount(clampStoryCount(count) + step);
}

/**
 * What each start sends, and how many: the settings without unique images
 * (several image starts would use up the image limit at once), and the count
 * within 2 to 12.
 */
export function multiStoryRequest(
  settings: CreateStoryFromTemplateRequest,
  count: number
): { request: CreateStoryFromTemplateRequest; count: number } {
  return {
    request: { ...settings, generateImages: false },
    count: clampStoryCount(count),
  };
}

/**
 * Runs `start` up to `count` times, each after the previous one finished, and
 * stops at the first rejection (a limit, the spend ceiling, an error, each of
 * which the API client has announced). Returns what was started so far.
 */
export async function startSequentially<T>(
  count: number,
  start: () => Promise<T>
): Promise<T[]> {
  const started: T[] = [];
  for (let index = 0; index < count; index++) {
    try {
      started.push(await start());
    } catch (error) {
      Logger.App.warn(`Story start ${index + 1} of ${count} failed`, error);
      break;
    }
  }
  return started;
}

/** The seat-card page for the given stories, preselected. */
export function seatCardsPath(storyIds: string[]): string {
  return `/users/seat-cards?stories=${storyIds.map(encodeURIComponent).join(",")}`;
}

export function useMultiStoryCreation() {
  const navigate = useNavigate();
  const { refreshStoredCodeSets } = useSession();
  const [isStarting, setIsStarting] = useState(false);

  /**
   * Starts the stories and opens their seat cards; stays on the form when not
   * even the first one started.
   */
  const startStories = async (
    settings: CreateStoryFromTemplateRequest,
    requestedCount: number
  ): Promise<void> => {
    const { request, count } = multiStoryRequest(settings, requestedCount);
    setIsStarting(true);
    const started = await startSequentially<CreateStoryInfo>(count, async () => {
      const info = await storyApi.createStoryFromTemplate(request);
      // Each story's codes are kept on this device, as for a single start
      const codes = Object.values(info.codes);
      if (codes.length > 0) addCodeSetToStorage(codes);
      return info;
    });
    refreshStoredCodeSets();
    setIsStarting(false);

    if (started.length === 0) return;
    if (started.length < count) {
      notificationService.addNotification({
        type: "warning",
        title: "Not every story started",
        message: `Started ${started.length} of ${count} stories`,
        autoClose: false,
      });
    }
    navigate(seatCardsPath(started.map((story) => story.storyId)));
  };

  return { isStarting, startStories };
}
