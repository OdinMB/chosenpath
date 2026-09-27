import { jest } from "@jest/globals";
import type { Resolution } from "core/types/index.js";
import { ThreadResolutionService } from "../../../../src/game/services/ThreadResolutionService.js";
import { threadBeat } from "../../../helpers/promptStories.js";
import { switchAnalysis, thread, threadAnalysis } from "../../../helpers/textFixtures.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("ThreadResolutionService.getMilestone", () => {
  it.each([
    ["resolution1", "one"],
    ["resolution2", "two"],
    ["resolution3", "three"],
  ] as [Resolution, string][])("returns an exploration thread's milestone for %s", (resolution, expected) => {
    expect(ThreadResolutionService.getMilestone(thread("exploration", 2, 0), resolution)).toBe(expected);
  });

  it("keeps the challenge and contest milestones", () => {
    expect(ThreadResolutionService.getMilestone(thread("challenge", 2, 0), "unfavorable")).toBe("bad");
    expect(ThreadResolutionService.getMilestone(thread("contest", 2, 0, ["player1"], ["player2"]), "sideBWins")).toBe("B");
  });

  it("returns null for a result the thread's milestones don't have", () => {
    expect(ThreadResolutionService.getMilestone(thread("exploration", 2, 0), "favorable")).toBeNull();
    expect(ThreadResolutionService.getMilestone(thread("challenge", 2, 0), "resolution1")).toBeNull();
  });
});

describe("ThreadResolutionService.resolveCurrentThreads", () => {
  it("sets the milestone of a finished exploration thread", () => {
    const chapter = threadAnalysis("exploration", 2, 1);
    chapter.threads[0].progression[0].resolution = "resolution1";
    const story = threadBeat(1, { storyPhases: [switchAnalysis(["player1"], 0), chapter] }).updateBeatResolution(
      "player1",
      "resolution2"
    );

    const resolved = ThreadResolutionService.resolveCurrentThreads(story);
    const ended = resolved.getCurrentThreadAnalysis()?.threads[0];
    expect(ended?.resolution).toBe("resolution2");
    expect(ended?.milestone).toBe("two");
  });
});
