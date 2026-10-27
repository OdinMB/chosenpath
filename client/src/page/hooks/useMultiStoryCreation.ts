import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logger } from "shared/logger";
import { storyApi } from "shared/apiClient";
import { notificationService } from "shared/notifications/notificationService";
import type {
  CreateStoryFromTemplateRequest,
  CreateStoryInfo,
} from "core/types/api";
import type { ReflectionQuestions } from "core/types";
import { authApi } from "../../shared/auth/authApi";
import { addCodeSetStartedForOthers } from "../../shared/utils/codeSetUtils";
import { useSession } from "../../shared/session/useSession";

/*
 * "Start several stories at once" on a World's settings (TemplateConfigurator):
 * the same template started several times, one after another, each through
 * the ordinary start route and its limits. Each story has its own seat codes
 * and as many seats as the form's player count; the created stories go on to
 * the printable seat cards.
 *
 * The stories belong to the signed-in account, so the start first asks the
 * server who that is: started after the sign-in lapsed, they would belong to
 * no account. Each story's codes are stored on this device, so the stories
 * show among its stories, marked as started for other players: their seats
 * are never linked to this account.
 */

/** How a several-stories start ended: some started, none did, or the sign-in had lapsed. */
export type MultiStartOutcome = "started" | "not-started" | "signed-out";

/**
 * Whether the server still knows who is signed in, or undefined when the
 * check itself failed (the API client has announced why).
 */
export async function stillSignedIn(): Promise<boolean | undefined> {
  try {
    return (await authApi.getCurrentUser()) !== null;
  } catch (error) {
    Logger.App.warn("Could not check the sign-in before starting stories", error);
    return undefined;
  }
}

export const STORY_COUNT_MIN = 2;
export const STORY_COUNT_MAX = 12;

/**
 * The most stories to choose: 12, or fewer when fewer starts are left, though
 * never fewer than 2 (the start then starts what it can). `startsLeft` is
 * undefined or null while the account's starts left aren't known.
 */
export function storyCountMax(startsLeft?: number | null): number {
  if (startsLeft === undefined || startsLeft === null) return STORY_COUNT_MAX;
  return Math.max(STORY_COUNT_MIN, Math.min(STORY_COUNT_MAX, startsLeft));
}

/** The number of stories to start: a whole number from 2 to `max` (12 by default). */
export function clampStoryCount(count: number, max = STORY_COUNT_MAX): number {
  if (!Number.isFinite(count)) return STORY_COUNT_MIN;
  return Math.min(max, Math.max(STORY_COUNT_MIN, Math.round(count)));
}

/**
 * The count one stepper press away, from the count the start would use (an
 * empty field counts as 2), kept within 2 to `max`.
 */
export function stepStoryCount(
  count: number,
  step: 1 | -1,
  max = STORY_COUNT_MAX
): number {
  return clampStoryCount(clampStoryCount(count, max) + step, max);
}

/** How many stories Start starts: the count chosen, and no more than can start. */
export function storiesToStart(count: number, startsLeft?: number | null): number {
  const chosen = clampStoryCount(count);
  if (startsLeft === undefined || startsLeft === null) return chosen;
  return Math.min(chosen, Math.max(0, startsLeft));
}

/**
 * The Start button's words: the number that will start, or that none are
 * left (the button is disabled then).
 */
export function startSeveralLabel(count: number, startsLeft?: number | null): string {
  const starting = storiesToStart(count, startsLeft);
  if (starting === 0) return "No starts left";
  return starting === 1 ? "Start 1 story" : `Start ${starting} stories`;
}

/** The panel's heading: the number that will start, or that none can. */
export function severalStoriesHeading(count: number, startsLeft?: number | null): string {
  const starting = storiesToStart(count, startsLeft);
  if (starting === 0) return "No stories can start right now";
  return starting === 1
    ? "You're starting 1 story"
    : `You're starting ${starting} stories at once`;
}

/**
 * What each start sends, and how many: the settings without unique images
 * (several image starts would use up the image limit at once), the batch's
 * reflection questions if it has any to send (in place of the World's), and
 * the count within 2 to 12 and the starts left.
 */
export function multiStoryRequest(
  settings: CreateStoryFromTemplateRequest,
  count: number,
  startsLeft?: number | null,
  reflectionQuestions?: ReflectionQuestions
): { request: CreateStoryFromTemplateRequest; count: number } {
  return {
    request: {
      ...settings,
      generateImages: false,
      ...(reflectionQuestions ? { reflectionQuestions } : {}),
    },
    count: storiesToStart(count, startsLeft),
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
   * Starts the stories, no more than `startsLeft` when it is known, and opens
   * their seat cards; stays on the form when not even the first one started,
   * or when the sign-in has lapsed (the form then asks the person to sign in
   * again).
   */
  const startStories = async (
    settings: CreateStoryFromTemplateRequest,
    requestedCount: number,
    startsLeft?: number | null,
    reflectionQuestions?: ReflectionQuestions
  ): Promise<MultiStartOutcome> => {
    const { request, count } = multiStoryRequest(
      settings,
      requestedCount,
      startsLeft,
      reflectionQuestions
    );
    setIsStarting(true);
    const signedIn = await stillSignedIn();
    if (signedIn !== true) {
      setIsStarting(false);
      return signedIn === false ? "signed-out" : "not-started";
    }

    const started = await startSequentially<CreateStoryInfo>(count, async () => {
      const info = await storyApi.createStoryFromTemplate(request);
      const codes = Object.values(info.codes);
      if (codes.length > 0) addCodeSetStartedForOthers(codes);
      return info;
    });
    refreshStoredCodeSets();
    setIsStarting(false);

    if (started.length === 0) return "not-started";
    if (started.length < count) {
      notificationService.addNotification({
        type: "warning",
        title: "Not every story started",
        message: `Started ${started.length} of ${count} stories`,
        autoClose: false,
      });
    }
    navigate(seatCardsPath(started.map((story) => story.storyId)));
    return "started";
  };

  return { isStarting, startStories };
}
