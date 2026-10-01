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

/*
 * A group challenge or contest step on one player's own outcome (the owner's
 * decision of 2026-10-01: "Yes, only count the owner's roll."): only the
 * owner's roll decides it when the owner is in the thread. The second
 * playthroughs' estate agents, chapter 6: a group challenge on Nia's own
 * protégé outcome, her roll unfavorable and Rory's favorable, pooled into the
 * mixed result her milestone records. A shared outcome, and a player's own
 * outcome its owner is not in, keep pooling every roll.
 */
describe("ThreadResolutionService: whose roll decides a group challenge or contest step", () => {
  const slots = (players: number) => Array.from({ length: players }, (_, i) => `player${i + 1}`);

  /** Step 1 of a two-step thread of this kind on `outcomeId`, each player's own outcome on their list. */
  function rolledStep(players: number, kind: "challenge" | "contest", outcomeId: string, sideA = slots(players), sideB: string[] = []): Story {
    const chapter = threadAnalysis(kind, 2, 1, sideA, sideB);
    chapter.threads[0].outcomeId = outcomeId;
    const story = threadBeat(players, { storyPhases: [switchAnalysis(slots(players), 0), chapter] });
    const withOutcomes = Object.fromEntries(
      Object.entries(story.getPlayers()).map(([slot, player]) => [slot, { ...player, outcomes: [outcome(`${slot}_own`)] }])
    );
    return story.clone({ sharedOutcomes: [outcome("shared_sale")], players: withOutcomes });
  }

  const roll = (story: Story, rolls: Resolution[]) => rolls.reduce((s, r, i) => s.updateBeatResolution(`player${i + 1}`, r), story);
  const firstStep = (story: Story) => ThreadResolutionService.resolveCurrentThreads(story).getCurrentThreadAnalysis()?.threads[0].progression[0].resolution;

  it("reads only the owner's roll in a challenge on their own outcome (the estate agents' chapter 6: Nia unfavorable, Rory favorable)", () => {
    // The owner's roll is the result, whatever the game's dice then draw
    for (const dice of [0, 0.999]) {
      jest.spyOn(Math, "random").mockReturnValue(dice);
      expect(firstStep(roll(rolledStep(2, "challenge", "player2_own"), ["favorable", "unfavorable"]))).toBe("unfavorable");
      expect(firstStep(roll(rolledStep(2, "challenge", "player2_own"), ["unfavorable", "favorable"]))).toBe("favorable");
      expect(firstStep(roll(rolledStep(3, "challenge", "player1_own"), ["mixed", "favorable", "favorable"]))).toBe("mixed");
    }
  });

  it("keeps pooling every roll on a shared outcome, and on a player's own outcome its owner is not in", () => {
    // Pooled: one favorable against one unfavorable leaves no side, so the step is mixed
    expect(firstStep(roll(rolledStep(2, "challenge", "shared_sale"), ["favorable", "unfavorable"]))).toBe("mixed");
    const random = jest.spyOn(Math, "random").mockReturnValue(0.2);
    // Two favorable, one unfavorable: a 1-in-3 chance of favorable, which a roll of 20 takes
    expect(firstStep(roll(rolledStep(3, "challenge", "shared_sale"), ["favorable", "favorable", "unfavorable"]))).toBe("favorable");
    random.mockReturnValue(0.5);
    expect(firstStep(roll(rolledStep(3, "challenge", "shared_sale"), ["favorable", "favorable", "unfavorable"]))).toBe("mixed");
    // player3's own outcome, player3 not in the thread
    random.mockReturnValue(0.5);
    expect(firstStep(roll(rolledStep(3, "challenge", "player3_own", ["player1", "player2"]), ["favorable", "unfavorable"]))).toBe("mixed");
  });

  it("reads only the owner's roll in a contest on their own outcome, for the owner's side", () => {
    // Owner on side A: their favorable roll wins it for side A, whatever side B rolled
    expect(firstStep(roll(rolledStep(2, "contest", "player1_own", ["player1"], ["player2"]), ["favorable", "favorable"]))).toBe("sideAWins");
    expect(firstStep(roll(rolledStep(2, "contest", "player1_own", ["player1"], ["player2"]), ["unfavorable", "unfavorable"]))).toBe("sideBWins");
    // Owner on side B
    expect(firstStep(roll(rolledStep(2, "contest", "player2_own", ["player1"], ["player2"]), ["favorable", "favorable"]))).toBe("sideBWins");
    expect(firstStep(roll(rolledStep(2, "contest", "player2_own", ["player1"], ["player2"]), ["favorable", "mixed"]))).toBe("mixed");
    // A camp: player1 and player3 against player2, on player3's own outcome
    expect(firstStep(roll(rolledStep(3, "contest", "player3_own", ["player1", "player3"], ["player2"]), ["favorable", "unfavorable", "unfavorable"]))).toBe("sideBWins");
  });

  it("keeps the tug of war on a shared contested outcome", () => {
    expect(firstStep(roll(rolledStep(2, "contest", "shared_sale", ["player1"], ["player2"]), ["favorable", "favorable"]))).toBe("mixed");
    expect(firstStep(roll(rolledStep(3, "contest", "shared_sale", ["player1", "player3"], ["player2"]), ["favorable", "unfavorable", "favorable"]))).toBe("sideAWins");
  });

  it("pools the others' rolls when the owner's own step has no result", () => {
    const rolled = roll(rolledStep(2, "challenge", "player2_own"), ["favorable", "unfavorable"]);
    const players = structuredClone(rolled.getState().players);
    const ownersBeats = players.player2.beatHistory;
    ownersBeats[ownersBeats.length - 1] = { ...ownersBeats[ownersBeats.length - 1], resolution: null };
    expect(firstStep(rolled.clone({ players }))).toBe("favorable");
  });

  /*
   * Whose roll can count at all, read before anyone rolls: the group's lever
   * lines (optionRules.ts) give a player whose roll the step discards no lever,
   * since its points would land on a roll that never counts.
   */
  it("names the owner whose roll alone decides a thread on their own outcome, on either side; none where every roll pools", () => {
    const owner = (story: Story) => ThreadResolutionService.rollingOwner(story.getCurrentThreadAnalysis()!.threads[0], story);
    expect(owner(rolledStep(2, "challenge", "player2_own"))).toBe("player2");
    expect(owner(rolledStep(3, "challenge", "player1_own"))).toBe("player1");
    expect(owner(rolledStep(2, "contest", "player2_own", ["player1"], ["player2"]))).toBe("player2");
    expect(owner(rolledStep(3, "contest", "player3_own", ["player1", "player3"], ["player2"]))).toBe("player3");
    // A shared outcome, an id no player holds, a player's own outcome its owner is not in
    expect(owner(rolledStep(3, "challenge", "shared_sale"))).toBeUndefined();
    expect(owner(rolledStep(2, "challenge", "outcome_nobody_holds"))).toBeUndefined();
    expect(owner(rolledStep(3, "challenge", "player3_own", ["player1", "player2"]))).toBeUndefined();
  });

  it("sets the milestone the owner's roll leads to at the thread's last step", () => {
    const afterFirst = ThreadResolutionService.resolveCurrentThreads(roll(rolledStep(2, "challenge", "player2_own"), ["favorable", "favorable"]));
    const ended = ThreadResolutionService.resolveCurrentThreads(roll(afterFirst, ["favorable", "unfavorable"])).getCurrentThreadAnalysis()?.threads[0];
    expect(ended?.progression.map((step) => step.resolution)).toEqual(["favorable", "unfavorable"]);
    expect([ended?.resolution, ended?.milestone]).toEqual(["unfavorable", "bad"]);
  });
});
