import { jest } from "@jest/globals";
import type { Story } from "core/models/Story.js";
import type { Resolution, Thread } from "core/types/index.js";
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

  it("records each parallel thread's step at its own index, so every thread ends on its last beat", () => {
    const chapter = threadAnalysis("exploration", 2, 1, ["player1"]);
    chapter.threads.push({ ...thread("exploration", 2, 1, ["player2"]), id: "b_thread", title: "B Thread" });
    const start = threadBeat(2, { storyPhases: [switchAnalysis(["player1", "player2"], 0), chapter] });
    const choose = (story: Story, first: Resolution, second: Resolution) =>
      story.updateBeatResolution("player1", first).updateBeatResolution("player2", second);
    const steps = (t: Thread) => t.progression.map((step) => step.resolution);

    const afterFirst = ThreadResolutionService.resolveCurrentThreads(choose(start, "resolution1", "resolution2"));
    const [a1, b1] = afterFirst.getCurrentThreadAnalysis()?.threads ?? [];
    expect(steps(a1)).toEqual(["resolution1", null]);
    expect(steps(b1)).toEqual(["resolution2", null]);
    // Still running: no result yet, so the beat prompts show no "Thread Resolution" or "Thread type" for it
    expect(b1.resolution).toBeNull();

    const afterSecond = ThreadResolutionService.resolveCurrentThreads(choose(afterFirst, "resolution3", "resolution1"));
    const [a2, b2] = afterSecond.getCurrentThreadAnalysis()?.threads ?? [];
    expect(steps(b2)).toEqual(["resolution2", "resolution1"]);
    expect([a2.resolution, a2.milestone]).toEqual(["resolution3", "three"]);
    expect([b2.resolution, b2.milestone]).toEqual(["resolution1", "one"]);
  });
});
