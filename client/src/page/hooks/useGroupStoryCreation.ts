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
 * "Start several groups" on a World's settings (TemplateConfigurator): the same
 * template started once per group, one after another, each through the
 * ordinary start route and its limits. The created stories go on to the
 * printable seat cards.
 */

export const GROUP_COUNT_MIN = 2;
export const GROUP_COUNT_MAX = 12;

/** The number of groups to start: a whole number from 2 to 12. */
export function clampGroupCount(count: number): number {
  if (!Number.isFinite(count)) return GROUP_COUNT_MIN;
  return Math.min(GROUP_COUNT_MAX, Math.max(GROUP_COUNT_MIN, Math.round(count)));
}

/**
 * What each group's start sends, and how many: the settings without unique
 * images (several image starts would use up the image limit at once), and the
 * count within 2 to 12.
 */
export function groupStartRequest(
  settings: CreateStoryFromTemplateRequest,
  count: number
): { request: CreateStoryFromTemplateRequest; count: number } {
  return {
    request: { ...settings, generateImages: false },
    count: clampGroupCount(count),
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
      Logger.App.warn(`Group start ${index + 1} of ${count} failed`, error);
      break;
    }
  }
  return started;
}

/** The seat-card page for the given stories, preselected. */
export function seatCardsPath(storyIds: string[]): string {
  return `/users/seat-cards?stories=${storyIds.map(encodeURIComponent).join(",")}`;
}

export function useGroupStoryCreation() {
  const navigate = useNavigate();
  const { refreshStoredCodeSets } = useSession();
  const [isStarting, setIsStarting] = useState(false);

  /**
   * Starts the groups and opens their seat cards; stays on the form when not
   * even the first one started.
   */
  const startGroups = async (
    settings: CreateStoryFromTemplateRequest,
    requestedCount: number
  ): Promise<void> => {
    const { request, count } = groupStartRequest(settings, requestedCount);
    setIsStarting(true);
    const started = await startSequentially<CreateStoryInfo>(count, async () => {
      const info = await storyApi.createStoryFromTemplate(request);
      // Each group's codes are kept on this device, as for a single start
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
        title: "Not every group started",
        message: `Started ${started.length} of ${count} groups`,
        autoClose: false,
      });
    }
    navigate(seatCardsPath(started.map((story) => story.storyId)));
  };

  return { isStarting, startGroups };
}
