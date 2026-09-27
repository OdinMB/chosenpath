import { jest } from "@jest/globals";
import { Story } from "core/models/Story.js";
import { GameModes, type Beat, type SetOfBeatGenerationSchema, type StoryState, type SwitchAnalysis, type ThreadAnalysis } from "core/types/index.js";
import {
  allowedLengths,
  checkBeatDesign,
  checkSwitchDesign,
  checkThreadDesign,
  statReadouts,
} from "../../../../src/evals/textModelEval/turnDesignChecks.js";
import {
  endingBeat,
  firstSwitchBeat,
  firstThreadAnalysis,
  laterSwitchBeat,
  switchAnalysisAfterThread,
  threadAnalysisAfterSwitch,
  threadBeat,
} from "../../../helpers/promptStories.js";
import { beatGeneration, beatSet, challengeOptions, outcome, stat, switchAnalysis, threadAnalysis } from "../../../helpers/textFixtures.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** A story with its state edited. */
function edited(story: Story, edit: (state: StoryState) => void): Story {
  const state = structuredClone(story.getState());
  edit(state);
  return Story.create(state);
}

function topicSwitch(directions: string[], slot = "player1"): SwitchAnalysis {
  const plan = switchAnalysis([slot]);
  plan.switches[0].topicChoices = directions;
  return plan;
}

function flavorSwitch(outcomeId: string): SwitchAnalysis {
  const plan = switchAnalysis(["player1"]);
  plan.switches[0] = { ...plan.switches[0], type: "flavor", outcomeId, question: "What now?", topicChoices: [] };
  return plan;
}

describe("allowedLengths: the chapter lengths that let a story end on its turn count (turn doc A4)", () => {
  it("allows exactly the turns left from 2 to 4, 2 at 5, 2 or 3 at 6, and 2 to 4 from 7", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 12].map(allowedLengths)).toEqual([[], [2], [3], [4], [2], [2, 3], [2, 3, 4], [2, 3, 4]]);
  });
});

describe("checkSwitchDesign", () => {
  // Turn 3 of 10: the thread that just ended pushed outcome_1 (one milestone pending)
  const outcomes = {
    sharedOutcomes: [outcome("outcome_1", { intendedNumberOfMilestones: 1 })],
  };
  const withOwn = (story: Story) =>
    edited(story, (state) => {
      state.players.player1.outcomes = [outcome("player1_trust", { intendedNumberOfMilestones: 2 }), outcome("player1_home", { intendedNumberOfMilestones: 2 })];
    });
  const story = withOwn(switchAnalysisAfterThread(1, { ...outcomes, maxTurns: 40 }));

  it("wants each direction to name one known outcome, a different one each", () => {
    const good = checkSwitchDesign(story, topicSwitch(["Win Mira's trust at the docks (player1_trust)", "Find a room above the bakery (player1_home)"]));
    expect(good.checks).toMatchObject({ directionsOneOutcome: true, directionsDistinctOutcomes: true });
    const two = checkSwitchDesign(story, topicSwitch(["Win Mira's trust and a room (player1_trust, player1_home)", "Find a room above the bakery (player1_home)"]));
    expect(two.checks).toMatchObject({ directionsOneOutcome: false, directionsDistinctOutcomes: false });
  });

  it("finds a complete outcome offered while others still need milestones", () => {
    // outcome_1 needs one milestone, and the chapter that just ended adds it
    const offered = checkSwitchDesign(story, topicSwitch(["Return to the storm wall (outcome_1)", "Find a room above the bakery (player1_home)"]));
    expect(offered.checks.noCompleteOutcomeOffered).toBe(false);
    expect(checkSwitchDesign(story, flavorSwitch("outcome_1")).checks.noCompleteOutcomeOffered).toBe(false);
    expect(checkSwitchDesign(story, flavorSwitch("player1_trust")).checks.noCompleteOutcomeOffered).toBe(true);
  });

  it("binds late in the story: every direction on an outcome that still needs milestones", () => {
    // Turn 3 of 10: 7 turns left fit one chapter, and 1 + 2 + 2 milestones are still needed
    const late = withOwn(switchAnalysisAfterThread(1, outcomes));
    expect(checkSwitchDesign(late, topicSwitch(["Win Mira's trust (player1_trust)", "Find a room (player1_home)"])).checks.lateDirectionsOnNeeded).toBe(true);
    expect(checkSwitchDesign(late, topicSwitch(["Win Mira's trust (player1_trust)", "Guard the wall (outcome_1)"])).checks.lateDirectionsOnNeeded).toBe(false);
    expect(checkSwitchDesign(story, topicSwitch(["Win Mira's trust (player1_trust)"])).checks).not.toHaveProperty("lateDirectionsOnNeeded");
  });

  it("reports no outcome check on a story without outcomes", () => {
    const { checks } = checkSwitchDesign(switchAnalysisAfterThread(1), topicSwitch(["Anything at all will do"]));
    expect(checks).toEqual({});
  });
});

describe("checkThreadDesign", () => {
  const known = { sharedOutcomes: [outcome("outcome_1"), outcome("outcome_2")] };
  /** The thread analysis after a switch whose directions name outcomes; the player picked direction `choice` */
  function afterSwitch(plan: SwitchAnalysis, choice = 0, overrides: Partial<StoryState> = {}): Story {
    return edited(threadAnalysisAfterSwitch(1, { ...known, ...overrides }), (state) => {
      state.storyPhases[state.storyPhases.length - 1] = { ...plan, firstBeatIndex: 3 };
      const history = state.players.player1.beatHistory;
      history[history.length - 1] = { ...history[history.length - 1], choice };
    });
  }
  const directions = topicSwitch(["Guard the storm wall tonight (outcome_1)", "Search the old archive (outcome_2)"]);

  it("wants the chapter's outcome to be the picked direction's, or the flavor switch's", () => {
    expect(checkThreadDesign(afterSwitch(directions, 0), threadAnalysis("challenge", 2, 4)).checks.chapterFollowsPick).toBe(true);
    expect(checkThreadDesign(afterSwitch(directions, 1), threadAnalysis("challenge", 2, 4)).checks.chapterFollowsPick).toBe(false);
    expect(checkThreadDesign(afterSwitch(flavorSwitch("outcome_2")), threadAnalysis("challenge", 2, 4)).checks.chapterFollowsPick).toBe(false);
  });

  it("wants a known outcome and one kind per chapter", () => {
    const story = afterSwitch(directions);
    expect(checkThreadDesign(story, threadAnalysis("challenge", 2, 4)).checks).toMatchObject({ threadOutcomeKnown: true, oneKindPerChapter: true });
    const mixed = threadAnalysis("challenge", 2, 4);
    mixed.threads[0].possibleMilestones = { resolution1: "a", resolution2: "b", resolution3: "c" };
    mixed.threads[0].outcomeId = "outcome_9";
    expect(checkThreadDesign(story, mixed).checks).toMatchObject({ threadOutcomeKnown: false, oneKindPerChapter: false });
  });

  it("wants a length that lets the story end on its turn count", () => {
    // Turn 4: at 10 turns 6 are left (2 or 3 allowed); at 8, 4 (only 4); at 5, one (none allowed, so any passes)
    const at = (maxTurns: number, duration: number) =>
      checkThreadDesign(afterSwitch(directions, 0, { maxTurns }), threadAnalysis("challenge", duration, 4)).checks.lengthAllowed;
    expect([at(10, 3), at(10, 4), at(8, 4), at(8, 3), at(5, 4)]).toEqual([true, false, true, false, true]);
    expect(checkThreadDesign(afterSwitch(directions), threadAnalysis("challenge", 3, 4)).counts.chapterLength).toBe(3);
  });

  it("finds 'the group' in a single-player chapter's milestones", () => {
    const plan = threadAnalysis("challenge", 2, 4);
    plan.threads[0].possibleMilestones = { favorable: "The group finds the key.", mixed: "A key.", unfavorable: "No key." };
    expect(checkThreadDesign(afterSwitch(directions), plan).checks.noGroupInSinglePlayer).toBe(false);
    expect(checkThreadDesign(afterSwitch(directions), threadAnalysis("challenge", 2, 4)).checks.noGroupInSinglePlayer).toBe(true);
  });

  it("wants the first multiplayer chapter to group everyone on a shared outcome", () => {
    const story = firstThreadAnalysis(2, { sharedOutcomes: [outcome("outcome_1")] });
    expect(checkThreadDesign(story, threadAnalysis("challenge", 2, 1, ["player1", "player2"])).checks.firstChapterGroupsAll).toBe(true);
    const split = threadAnalysis("challenge", 2, 1, ["player1"]);
    split.threads.push({ ...split.threads[0], id: "other", playersSideA: ["player2"] });
    expect(checkThreadDesign(story, split).checks.firstChapterGroupsAll).toBe(false);
    expect(checkThreadDesign(afterSwitch(directions), threadAnalysis("challenge", 2, 4)).checks).not.toHaveProperty("firstChapterGroupsAll");
  });

  it("wants every contest step to name both sides", () => {
    const story = edited(threadAnalysisAfterSwitch(2, { sharedOutcomes: [outcome("outcome_1")], gameMode: GameModes.Competitive }), (state) => {
      state.players.player1.name = "Ada Quill";
      state.players.player2.name = "Bram Tover";
    });
    const plan = threadAnalysis("contest", 2, 4, ["player1"], ["player2"]);
    plan.threads[0].progression.forEach((step) => (step.question = "Race: How do Ada and Bram cross the bay first?"));
    expect(checkThreadDesign(story, plan).checks.contestStepsNameBothSides).toBe(true);
    plan.threads[0].progression[1].question = "Race: How does Ada cross the bay first?";
    expect(checkThreadDesign(story, plan).checks.contestStepsNameBothSides).toBe(false);
    expect(checkThreadDesign(story, threadAnalysis("challenge", 2, 4, ["player1", "player2"])).checks).not.toHaveProperty("contestStepsNameBothSides");
  });
});

describe("checkBeatDesign", () => {
  const ENERGY = stat("player_energy", { name: "Energy", optionsToSacrifice: "Spend 10% Energy" });

  /** A thread beat whose previous choice was a sacrifice naming Energy */
  function afterSacrifice(): Story {
    return edited(threadBeat(1, { playerStats: [ENERGY, stat("player_luck", { name: "Luck" })] }), (state) => {
      const history = state.players.player1.beatHistory;
      const options = challengeOptions();
      options[0] = { ...options[0], resourceType: "sacrifice", basePoints: 30, text: "Spend 10% Energy to force the door" };
      history[history.length - 1] = { ...history[history.length - 1], options, choice: 0 } as Beat;
    });
  }
  const change = (stat: string) => ({ type: "statChange" as const, group: "player1", stat, change: "subtractNumber" as const, value: 10 });

  it("wants a chosen sacrifice or reward applied to the stat it names", () => {
    const story = afterSacrifice();
    const applied = beatSet(1, { statChanges: [change("player_energy")] });
    expect(checkBeatDesign(story, applied, applied).checks.sacrificeApplied).toBe(true);
    const none = beatSet(1);
    expect(checkBeatDesign(story, none, none).checks.sacrificeApplied).toBe(false);
    const other = beatSet(1, { statChanges: [change("player_luck")] });
    expect(checkBeatDesign(story, other, other).checks.sacrificeApplied).toBe(false);
    expect(checkBeatDesign(threadBeat(1), none, none).checks).not.toHaveProperty("sacrificeApplied");
  });

  describe("milestones after a chapter", () => {
    const story = laterSwitchBeat(1, { sharedOutcomes: [outcome("outcome_1"), outcome("outcome_2")] });
    const milestone = (outcomeId: string, text: string) => ({ type: "newMilestone" as const, outcomeGroup: "shared", outcome: outcomeId, newMilestone: text });

    it("wants one milestone per ended chapter, none unearned and none copied from the plan", () => {
      const written = beatSet(1, { newMilestones: [milestone("outcome_1", "Threatened by the strike, the council approves the railroad.")] });
      expect(checkBeatDesign(story, written, written).checks).toMatchObject({ oneMilestonePerEndedChapter: true, noUnearnedMilestones: true, milestoneNotCopied: true });
      const doubled = beatSet(1, { newMilestones: [milestone("outcome_1", "One."), milestone("outcome_1", "Two.")] });
      expect(checkBeatDesign(story, doubled, doubled).checks.oneMilestonePerEndedChapter).toBe(false);
      const unearned = beatSet(1, { newMilestones: [milestone("outcome_1", "One."), milestone("outcome_2", "Out of nowhere.")] });
      expect(checkBeatDesign(story, unearned, unearned).checks.noUnearnedMilestones).toBe(false);
      // The fixture's thread planned "A Thread milestone"
      const copied = beatSet(1, { newMilestones: [milestone("outcome_1", "A thread milestone!")] });
      expect(checkBeatDesign(story, copied, copied).checks.milestoneNotCopied).toBe(false);
    });

    it("reads copies on the reply as written: a milestone the game adds from the plan is not the model's copy", () => {
      const raw = beatSet(1, { newMilestones: [] });
      const repaired = beatSet(1, { newMilestones: [milestone("outcome_1", "A Thread milestone")] });
      expect(checkBeatDesign(story, repaired, raw).checks).not.toHaveProperty("milestoneNotCopied");
    });
  });

  it("wants no sacrifice or reward in a switch turn, and no options at an ending", () => {
    const sacrifice = beatSet(1);
    sacrifice.player1 = beatGeneration({ options: [{ optionType: "exploration", resourceType: "sacrifice", text: "Give up the map" }, ...challengeOptions().slice(1)] });
    expect(checkBeatDesign(firstSwitchBeat(1), sacrifice, sacrifice).checks.noSacrificeInSwitch).toBe(false);
    expect(checkBeatDesign(firstSwitchBeat(1), beatSet(1), beatSet(1)).checks.noSacrificeInSwitch).toBe(true);
    const ending = endingBeat(1);
    expect(checkBeatDesign(ending, beatSet(1), beatSet(1)).checks.noOptionsOnEnding).toBe(false);
    const closed = beatSet(1);
    closed.player1 = beatGeneration({ options: [], text: "By spring the new code is nailed to every door." });
    expect(checkBeatDesign(ending, closed, closed).checks).toMatchObject({ noOptionsOnEnding: true, noSequelHook: true });
    closed.player1 = beatGeneration({ options: [], text: "You look at the long road ahead. This is only the beginning." });
    expect(checkBeatDesign(ending, closed, closed).checks.noSequelHook).toBe(false);
  });

  it("finds a stat's name beside a number, outside sacrifice and reward options", () => {
    const story = threadBeat(1, { playerStats: [ENERGY], sharedStats: [stat("shared_order", { name: "Order|Chaos", type: "opposites" })] });
    const readout = beatSet(1);
    readout.player1 = beatGeneration({ text: "Your Energy drops to 40% as you climb. The crowd turns to Chaos, 60 to 40." });
    expect(statReadouts(story, readout)).toEqual(["Energy drops to 40%", "Chaos, 60"]);
    expect(checkBeatDesign(story, readout, readout).checks.noStatReadouts).toBe(false);
    const priced = beatSet(1);
    priced.player1 = beatGeneration({ options: [{ ...challengeOptions()[0], resourceType: "sacrifice", text: "Burn 10% Energy to sprint" }, ...challengeOptions().slice(1)] });
    expect(checkBeatDesign(story, priced, priced).checks.noStatReadouts).toBe(true);
  });

  it("counts prose habits: paragraphs opening with You, a waiting close, pointing at the choice, stock phrases", () => {
    const beats = beatSet(1);
    beats.player1 = beatGeneration({
      text: "You step in. The air is thick with smoke.\n\nThe clerk looks up. A sense of dread follows.\n\nThe path ahead is uncertain, and the harbour waits for your choice.",
    });
    expect(checkBeatDesign(threadBeat(1), beats, beats).counts).toMatchObject({
      proseParagraphs: 3,
      youParagraphs: 1,
      waitingClose: 1,
      pointingAtChoice: 1,
      stockPhrases: 2,
      pathAhead: 1,
    });
  });

  it("counts option sets: the same odds, a lever, a reward, a shared first word, a negative base on a bonus option", () => {
    const options = challengeOptions().map((o, i) => ({ ...o, text: i < 2 ? `Climb ${i}` : "Wait here" }));
    options[1] = { ...options[1], basePoints: -10, modifiersToSuccessRate: [{ statId: "player1_energy", reason: "fit", effect: 10 }] };
    options[2] = { ...options[2], resourceType: "reward", basePoints: -30, modifiersToSuccessRate: [{ statId: "player1_energy", reason: "fit", effect: 30 }] };
    const beats = beatSet(1);
    beats.player1 = beatGeneration({ options });
    expect(checkBeatDesign(threadBeat(1), beats, beats).counts).toMatchObject({
      optionSets: 1,
      sameFirstWordSets: 1,
      challengeSets: 1,
      sameOddsSets: 1,
      oddsWithin5Sets: 1,
      leverSets: 1,
      rewardSets: 1,
      bonusOptions: 1,
      bonusOptionsNegativeBase: 1,
    });
  });

  it("does not throw on a malformed reply", () => {
    const junk = { statChanges: "x", newMilestones: 3, player1: { options: "x", text: 4 } } as unknown as SetOfBeatGenerationSchema;
    expect(() => checkBeatDesign(laterSwitchBeat(1), junk, junk)).not.toThrow();
    expect(() => checkSwitchDesign(switchAnalysisAfterThread(1), { switches: "x" } as unknown as SwitchAnalysis)).not.toThrow();
    expect(() => checkThreadDesign(threadAnalysisAfterSwitch(1), { threads: [null] } as unknown as ThreadAnalysis)).not.toThrow();
  });
});
