import { jest } from "@jest/globals";
import type { Story } from "core/models/Story.js";
import type { Resolution, Thread } from "core/types/index.js";
import { ThreadResolutionService } from "../../../../src/game/services/ThreadResolutionService.js";
import { threadBeat } from "../../../helpers/promptStories.js";
import { outcome, switchAnalysis, thread, threadAnalysis } from "../../../helpers/textFixtures.js";

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

/*
 * A group exploration thread's step (the playthroughs of 2026-09-30: every
 * player of a group chapter in one exploration thread on one player's own
 * outcome, and player1's pick decided it, so Jo's choice wrote Luz's crew
 * promise): the outcome's owner decides a thread on their own outcome; any
 * other thread goes the way most of its players chose, a tie by the game's
 * dice among the tied choices.
 */
describe("ThreadResolutionService: whose choice decides a group exploration step", () => {
  const slots = (players: number) => Array.from({ length: players }, (_, i) => `player${i + 1}`);

  /** Step 1 of a two-step exploration thread on `outcomeId` with these players, each player's own outcome on their list. */
  function groupStep(players: number, outcomeId: string, inThread = slots(players)): Story {
    const chapter = threadAnalysis("exploration", 2, 1, inThread);
    chapter.threads[0].outcomeId = outcomeId;
    const story = threadBeat(players, { storyPhases: [switchAnalysis(slots(players), 0), chapter] });
    const withOutcomes = Object.fromEntries(
      Object.entries(story.getPlayers()).map(([slot, player]) => [slot, { ...player, outcomes: [outcome(`${slot}_own`)] }])
    );
    return story.clone({ sharedOutcomes: [outcome("shared_harbour")], players: withOutcomes });
  }

  const choose = (story: Story, picks: Resolution[]) =>
    picks.reduce((s, pick, i) => s.updateBeatResolution(`player${i + 1}`, pick), story);
  const firstStep = (story: Story) => ThreadResolutionService.resolveCurrentThreads(story).getCurrentThreadAnalysis()?.threads[0].progression[0].resolution;

  it("lets the outcome's owner decide a thread on their own outcome, whoever chose first", () => {
    // Jo (player1) and Luz (player2) on Luz's own outcome: Luz's pick decides
    expect(firstStep(choose(groupStep(2, "player2_own"), ["resolution3", "resolution1"]))).toBe("resolution1");
    // Three players on player3's outcome, the other two agreeing: still the owner's
    expect(firstStep(choose(groupStep(3, "player3_own"), ["resolution2", "resolution2", "resolution3"]))).toBe("resolution3");
  });

  it("goes the way most of its players chose on a shared outcome, or on a player's outcome that player is not in", () => {
    expect(firstStep(choose(groupStep(3, "shared_harbour"), ["resolution1", "resolution2", "resolution2"]))).toBe("resolution2");
    expect(firstStep(choose(groupStep(3, "player3_own", ["player1", "player2"]), ["resolution3", "resolution3", "resolution1"]))).toBe("resolution3");
  });

  it("breaks a tie with the game's dice among the tied choices, not by seat", () => {
    const random = jest.spyOn(Math, "random").mockReturnValue(0.99);
    expect(firstStep(choose(groupStep(2, "shared_harbour"), ["resolution3", "resolution1"]))).toBe("resolution1");
    random.mockReturnValue(0);
    expect(firstStep(choose(groupStep(2, "shared_harbour"), ["resolution3", "resolution1"]))).toBe("resolution3");
    // Three players, three different choices: any of the three
    random.mockReturnValue(0.5);
    expect(firstStep(choose(groupStep(3, "shared_harbour"), ["resolution1", "resolution2", "resolution3"]))).toBe("resolution2");
  });

  it("rolls no dice where one choice decides: a single player, the owner, or a clear majority", () => {
    const random = jest.spyOn(Math, "random");
    const chapter = threadAnalysis("exploration", 2, 1);
    const single = threadBeat(1, { storyPhases: [switchAnalysis(["player1"], 0), chapter] }).updateBeatResolution("player1", "resolution2");
    expect(firstStep(single)).toBe("resolution2");
    expect(firstStep(choose(groupStep(2, "player1_own"), ["resolution2", "resolution3"]))).toBe("resolution2");
    expect(firstStep(choose(groupStep(3, "shared_harbour"), ["resolution1", "resolution1", "resolution3"]))).toBe("resolution1");
    expect(random).not.toHaveBeenCalled();
  });

  it("sets the milestone the deciding choice leads to at the thread's last step", () => {
    const story = choose(groupStep(2, "player2_own"), ["resolution3", "resolution1"]);
    const afterFirst = ThreadResolutionService.resolveCurrentThreads(story);
    const ended = ThreadResolutionService.resolveCurrentThreads(choose(afterFirst, ["resolution1", "resolution2"])).getCurrentThreadAnalysis()?.threads[0];
    expect(ended?.progression.map((step) => step.resolution)).toEqual(["resolution1", "resolution2"]);
    expect([ended?.resolution, ended?.milestone]).toEqual(["resolution2", "two"]);
  });
});
