import type { CreateStoryFromTemplateRequest } from "core/types/api";
import {
  clampStoryCount,
  multiStoryRequest,
  seatCardsPath,
  severalStoriesHeading,
  startSeveralLabel,
  startSequentially,
  stepStoryCount,
  storiesToStart,
  storyCountMax,
} from "../../../src/page/hooks/useMultiStoryCreation";

/*
 * "Start several stories at once": the same World started several times, one
 * start after another through the ordinary route, so each counts against the
 * signed-in user's text-start limit and a refusal stops the rest.
 */

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../src/config", () =>
  jest.requireActual("../../__mocks__/client/config")
);

const SETTINGS: CreateStoryFromTemplateRequest = {
  templateId: "template-1",
  playerCount: 3,
  maxTurns: 10,
  generateImages: true,
  pregenerateBeats: false,
  difficultyLevel: { modifier: 0, title: "Normal" },
};

describe("startSequentially", () => {
  it("starts each one after the previous one finished, in order", async () => {
    const order: string[] = [];
    let running = 0;
    let next = 0;
    const start = jest.fn(async () => {
      running += 1;
      expect(running).toBe(1);
      const id = `story-${++next}`;
      await Promise.resolve();
      order.push(id);
      running -= 1;
      return id;
    });

    await expect(startSequentially(3, start)).resolves.toEqual([
      "story-1",
      "story-2",
      "story-3",
    ]);
    expect(order).toEqual(["story-1", "story-2", "story-3"]);
    expect(start).toHaveBeenCalledTimes(3);
  });

  it("stops at the first refusal and returns what started before it", async () => {
    const start = jest
      .fn<Promise<string>, []>()
      .mockResolvedValueOnce("story-1")
      .mockResolvedValueOnce("story-2")
      .mockRejectedValueOnce({ status: "rate_limited" })
      .mockResolvedValue("never");

    await expect(startSequentially(5, start)).resolves.toEqual([
      "story-1",
      "story-2",
    ]);
    expect(start).toHaveBeenCalledTimes(3);
  });

  it("returns nothing when the first start is refused", async () => {
    const start = jest.fn().mockRejectedValue(new Error("ceiling"));

    await expect(startSequentially(4, start)).resolves.toEqual([]);
    expect(start).toHaveBeenCalledTimes(1);
  });
});

describe("multiStoryRequest", () => {
  it("starts every story without unique images, whatever the form said", () => {
    const { request } = multiStoryRequest(SETTINGS, 4);

    expect(request).toEqual({ ...SETTINGS, generateImages: false });
    expect(SETTINGS.generateImages).toBe(true);
  });

  it("keeps the number of stories within 2 to 12", () => {
    expect(multiStoryRequest(SETTINGS, 4).count).toBe(4);
    expect(multiStoryRequest(SETTINGS, 1).count).toBe(2);
    expect(multiStoryRequest(SETTINGS, 0).count).toBe(2);
    expect(multiStoryRequest(SETTINGS, 13).count).toBe(12);
    expect(multiStoryRequest(SETTINGS, 40).count).toBe(12);
    expect(clampStoryCount(Number.NaN)).toBe(2);
    expect(clampStoryCount(5.4)).toBe(5);
  });
});

describe("stepStoryCount", () => {
  it("moves the count one story up or down", () => {
    expect(stepStoryCount(4, 1)).toBe(5);
    expect(stepStoryCount(4, -1)).toBe(3);
  });

  it("stops at 2 and at 12", () => {
    expect(stepStoryCount(2, -1)).toBe(2);
    expect(stepStoryCount(12, 1)).toBe(12);
  });

  it("steps from what the summary shows when the field is empty or out of range", () => {
    // An empty field reads as 2, the fewest the start allows
    expect(stepStoryCount(Number.NaN, 1)).toBe(3);
    expect(stepStoryCount(Number.NaN, -1)).toBe(2);
    expect(stepStoryCount(40, -1)).toBe(11);
    expect(stepStoryCount(5.4, 1)).toBe(6);
  });
});

describe("the account's starts left", () => {
  it("caps the number to choose at the starts left, never below 2 or above 12", () => {
    expect(storyCountMax(undefined)).toBe(12);
    expect(storyCountMax(null)).toBe(12);
    expect(storyCountMax(15)).toBe(12);
    expect(storyCountMax(7)).toBe(7);
    expect(storyCountMax(1)).toBe(2);
    expect(storyCountMax(0)).toBe(2);
  });

  it("keeps the count and its stepper within that cap", () => {
    expect(clampStoryCount(8, 7)).toBe(7);
    expect(clampStoryCount(5, 7)).toBe(5);
    expect(clampStoryCount(Number.NaN, 7)).toBe(2);
    expect(stepStoryCount(7, 1, 7)).toBe(7);
    expect(stepStoryCount(8, -1, 7)).toBe(6);
  });

  it("starts no more stories than can start, even fewer than 2", () => {
    expect(storiesToStart(4, undefined)).toBe(4);
    expect(storiesToStart(40, 15)).toBe(12);
    expect(storiesToStart(8, 7)).toBe(7);
    expect(storiesToStart(2, 1)).toBe(1);
    expect(storiesToStart(2, 0)).toBe(0);
    expect(multiStoryRequest(SETTINGS, 8, 7).count).toBe(7);
    expect(multiStoryRequest(SETTINGS, 8).count).toBe(8);
  });

  it("names on Start the number that will start", () => {
    expect(startSeveralLabel(4, undefined)).toBe("Start 4 stories");
    expect(startSeveralLabel(8, 7)).toBe("Start 7 stories");
    expect(startSeveralLabel(2, 1)).toBe("Start 1 story");
    // Start is disabled then
    expect(startSeveralLabel(3, 0)).toBe("No starts left");
  });

  it("heads the panel with the number that will start", () => {
    expect(severalStoriesHeading(4, undefined)).toBe("You're starting 4 stories at once");
    expect(severalStoriesHeading(8, 7)).toBe("You're starting 7 stories at once");
    expect(severalStoriesHeading(2, 1)).toBe("You're starting 1 story");
    expect(severalStoriesHeading(3, 0)).toBe("No stories can start right now");
  });
});

describe("seatCardsPath", () => {
  it("preselects the started stories on the seat-card page", () => {
    expect(seatCardsPath(["a-1", "b-2"])).toBe("/users/seat-cards?stories=a-1,b-2");
  });
});
