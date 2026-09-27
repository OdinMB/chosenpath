import { jest } from "@jest/globals";
import type { Story } from "core/models/Story.js";
import type {
  BeatGeneration,
  BeatOption,
  Change,
  Outcome,
  SetOfBeatGenerationSchema,
  StoryState,
} from "core/types/index.js";
import { GameModes } from "core/types/index.js";
import { POINTS_FOR_REWARD, POINTS_FOR_SACRIFICE } from "core/config.js";
import { expectedOptionType, repairBeatReply } from "../../../../src/game/services/beatRepairs.js";
import { logRepairs, type Repair } from "../../../../src/game/services/textRepairs.js";
import { beatStep, switchStep } from "../../../../src/game/services/storyTextSteps.js";
import { ChangeService } from "../../../../src/game/services/ChangeService.js";
import { ThreadResolutionService } from "../../../../src/game/services/ThreadResolutionService.js";
import {
  endingBeat,
  firstSwitchBeat,
  laterSwitchBeat,
  resolvedThread,
  slotsOf,
  threadBeat,
} from "../../../helpers/promptStories.js";
import {
  beatGeneration,
  beatSet,
  challengeOptions,
  explorationOptions,
  outcome,
  stat,
  switchAnalysis,
  threadAnalysis,
} from "../../../helpers/textFixtures.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Morale (shared), Energy and Rank (player stats, Rank a ladder), and one story element. */
function withStats(story: Story, extra: Partial<StoryState> = {}): Story {
  const players = Object.fromEntries(
    Object.entries(story.getPlayers()).map(([slot, player]) => [
      slot,
      {
        ...player,
        statValues: [
          { statId: "player_energy", value: 50 },
          { statId: "player_rank", value: "Novice" },
        ],
      },
    ])
  );
  return story.clone({
    sharedStats: [stat("shared_morale", { name: "Morale" })],
    sharedStatValues: [{ statId: "shared_morale", value: 50 }],
    playerStats: [
      stat("player_energy", { name: "Energy" }),
      stat("player_rank", {
        name: "Rank",
        type: "string",
        possibleValues: "Novice, Apprentice, Master",
        initialValue: "Novice",
      }),
    ],
    storyElements: [{ id: "inn", name: "Inn", role: "", instructions: "", appearance: "", facts: [] }],
    players,
    ...extra,
  });
}

/** The story with these outcomes on the shared list and on the players' lists. */
function withOutcomes(story: Story, outcomes: { shared?: Outcome[] } & Record<string, Outcome[] | undefined>): Story {
  const { shared, ...perPlayer } = outcomes;
  const players = Object.fromEntries(
    Object.entries(story.getPlayers()).map(([slot, player]) => [
      slot,
      { ...player, outcomes: perPlayer[slot] ?? player.outcomes },
    ])
  );
  return story.clone({ sharedOutcomes: shared ?? story.getSharedOutcomes(), players });
}

type StatChange = Extract<Change, { type: "statChange" }>;
type NewFact = BeatGeneration["plan"]["establishedFacts"][number];
type Introduction = BeatGeneration["plan"]["newIntroductionsOfStoryElements"][number];
type NewElement = BeatGeneration["plan"]["newGameElements"][number];

function statChange(group: string, id: string, change: StatChange["change"] = "subtractNumber", value: number | string = 10): Change {
  return { type: "statChange", group, stat: id, change, value };
}

function milestone(outcomeGroup: string, outcomeId: string, text = "It happened."): Change {
  return { type: "newMilestone", outcomeGroup, outcome: outcomeId, newMilestone: text };
}

function kinds(repairs: Repair[], prefix = ""): string[] {
  return repairs.map((r) => r.kind).filter((k) => k.startsWith(prefix));
}

function beatOf(reply: SetOfBeatGenerationSchema, slot = "player1"): BeatGeneration {
  return reply[slot as `player${number}`];
}

function beatWith(plan: Partial<BeatGeneration["plan"]>, options?: BeatOption[]): BeatGeneration {
  const base = beatGeneration();
  return beatGeneration({ plan: { ...base.plan, ...plan }, ...(options ? { options } : {}) });
}

describe("repairBeatReply: stat changes (TR-1)", () => {
  const single = () => withStats(laterSwitchBeat(1));
  const multi = () => withStats(laterSwitchBeat(2));

  function repairStats(story: Story, changes: Change[]) {
    const { reply, repairs } = repairBeatReply(story, beatSet(story.getNumberOfPlayers(), { statChanges: changes }));
    return { changes: reply.statChanges, kinds: kinds(repairs, "stat") };
  }

  it("leaves exact ids in their group's list untouched, with no repair", () => {
    const changes = [statChange("player1", "player_energy"), statChange("shared", "shared_morale")];
    expect(repairStats(single(), changes)).toEqual({ changes, kinds: [] });
    const multiChanges = [statChange("player2", "player_energy"), statChange("shared", "shared_morale")];
    expect(repairStats(multi(), multiChanges)).toEqual({ changes: multiChanges, kinds: [] });
  });

  it("reads the seat form as the plain player stat under its own seat", () => {
    const result = repairStats(multi(), [statChange("player2", "player2_energy")]);
    expect(result.changes).toEqual([statChange("player2", "player_energy")]);
    expect(result.kinds).toEqual(["statIdSeatForm"]);
  });

  it("moves a seat-form change filed under shared to that seat", () => {
    const result = repairStats(multi(), [statChange("shared", "player2_energy")]);
    expect(result.changes).toEqual([statChange("player2", "player_energy")]);
    expect(result.kinds).toEqual(["statIdSeatForm", "statGroupMoved"]);
  });

  it("drops a seat-form change filed under another player's group as ambiguous", () => {
    const result = repairStats(multi(), [statChange("player1", "player2_energy")]);
    expect(result.changes).toEqual([]);
    expect(result.kinds).toEqual(["statChangeAmbiguous"]);
  });

  it("reads doubled and seat-plus-plain forms as the plain id", () => {
    const result = repairStats(multi(), [
      statChange("player1", "player_player_energy"),
      statChange("player2", "player2_player_energy"),
    ]);
    expect(result.changes).toEqual([statChange("player1", "player_energy"), statChange("player2", "player_energy")]);
    expect(result.kinds).toEqual(["statIdSeatForm", "statIdSeatForm"]);
  });

  it("moves a shared stat filed under a player to shared", () => {
    const result = repairStats(multi(), [statChange("player1", "shared_morale")]);
    expect(result.changes).toEqual([statChange("shared", "shared_morale")]);
    expect(result.kinds).toEqual(["statGroupMoved"]);
  });

  it("moves a player stat filed under shared to player1 in single player, and drops it in multiplayer", () => {
    const one = repairStats(single(), [statChange("shared", "player_energy")]);
    expect(one.changes).toEqual([statChange("player1", "player_energy")]);
    expect(one.kinds).toEqual(["statGroupMoved"]);

    const many = repairStats(multi(), [statChange("shared", "player_energy")]);
    expect(many.changes).toEqual([]);
    expect(many.kinds).toEqual(["statChangeAmbiguous"]);
  });

  it("sends every player-stat change to player1 in single player", () => {
    const result = repairStats(single(), [
      statChange("player2", "player_energy"),
      statChange("player1", "player2_energy"),
      statChange("player1", "player1_energy"),
    ]);
    expect(result.changes).toEqual([
      statChange("player1", "player_energy"),
      statChange("player1", "player_energy"),
      statChange("player1", "player_energy"),
    ]);
    expect(result.kinds).toEqual(["statGroupMoved", "statIdSeatForm", "statIdSeatForm"]);
  });

  it("drops unknown stats and seats that are not in the story, counted", () => {
    const result = repairStats(multi(), [statChange("player1", "player_luck"), statChange("player3", "player3_energy")]);
    expect(result.changes).toEqual([]);
    expect(result.kinds).toEqual(["statChangeUnknown", "statChangeUnknown"]);
  });

  it("moves the value on player_energy end to end through ChangeService", () => {
    const story = single();
    const { reply } = repairBeatReply(story, beatSet(1, { statChanges: [statChange("player1", "player1_energy")] }));
    const [updated, changes] = beatStep.apply(story, reply);
    const applied = new ChangeService().applyChanges(updated, changes);
    expect(applied.getPlayer("player1")?.statValues).toContainEqual({ statId: "player_energy", value: 40 });
  });
});

describe("repairBeatReply: string values off the ladder (TR-8)", () => {
  function notesFor(story: Story, change: Change) {
    const { reply, repairs } = repairBeatReply(story, beatSet(1, { statChanges: [change] }));
    return { changes: reply.statChanges, notes: repairs.filter((r) => r.note).map((r) => r.kind) };
  }

  it("notes a value its possible values don't list, and keeps the change", () => {
    const change = statChange("player1", "player_rank", "setString", "Discredited");
    expect(notesFor(withStats(laterSwitchBeat(1)), change)).toEqual({ changes: [change], notes: ["offLadderValue"] });
  });

  it("does not note a listed value (any case) or a stat with blank possible values", () => {
    const listed = statChange("player1", "player_rank", "setString", "apprentice");
    expect(notesFor(withStats(laterSwitchBeat(1)), listed).notes).toEqual([]);

    const blank = withStats(laterSwitchBeat(1), {
      playerStats: [stat("player_rank", { type: "string", possibleValues: "  " })],
    });
    expect(notesFor(blank, statChange("player1", "player_rank", "setString", "Anything")).notes).toEqual([]);
  });
});

describe("repairBeatReply: facts (TR-2)", () => {
  const story = () =>
    withOutcomes(withStats(laterSwitchBeat(1)), { player1: [outcome("outcome_1", { question: "Will the pact hold?" })] });

  const newElement: NewElement = {
    type: "newStoryElement",
    element: { id: "ferry", name: "Ferry", role: "", instructions: "", appearance: "", facts: [] },
  };

  it("keeps facts on world, a story element and an element created in the same reply", () => {
    const facts: NewFact[] = [
      { type: "newFact", storyElementId: "world", fact: "w" },
      { type: "newFact", storyElementId: "inn", fact: "i" },
      { type: "newFact", storyElementId: "ferry", fact: "f" },
    ];
    const reply = beatSet(1, { player1: beatWith({ establishedFacts: facts, newGameElements: [newElement] }) });
    const { reply: repaired, repairs } = repairBeatReply(story(), reply);
    expect(beatOf(repaired).plan.establishedFacts).toEqual(facts);
    expect(kinds(repairs, "fact")).toEqual([]);
  });

  it("re-files facts under stat, outcome, player and other ids as world facts, prefixed where it names something", () => {
    const facts: NewFact[] = [
      { type: "newFact", storyElementId: "player_energy", fact: "runs low" },
      { type: "newFact", storyElementId: "player1_energy", fact: "is back" },
      { type: "newFact", storyElementId: "shared_morale", fact: "is shaken" },
      { type: "newFact", storyElementId: "outcome_1", fact: "the envoy wavers" },
      { type: "newFact", storyElementId: "player1", fact: "limps" },
      { type: "newFact", storyElementId: "shared", fact: "the bells ring" },
      { type: "newFact", storyElementId: "ghost_ship", fact: "was seen" },
    ];
    const { reply, repairs } = repairBeatReply(story(), beatSet(1, { player1: beatWith({ establishedFacts: facts }) }));
    expect(beatOf(reply).plan.establishedFacts).toEqual(
      [
        "Energy: runs low",
        "Energy: is back",
        "Morale: is shaken",
        "Will the pact hold?: the envoy wavers",
        "Test Player: limps",
        "the bells ring",
        "was seen",
      ].map((fact) => ({ type: "newFact", storyElementId: "world", fact }))
    );
    expect(kinds(repairs, "fact")).toEqual(Array.from({ length: 7 }, () => "factRefiled"));
  });

  it("keeps the world list's exact-duplicate rule after re-filing", () => {
    const base = story().clone({ worldFacts: ["Energy: runs low"] });
    const fact: NewFact = { type: "newFact", storyElementId: "player_energy", fact: "runs low" };
    const shared: NewFact = { type: "newFact", storyElementId: "shared", fact: "the bells ring" };
    const reply = beatSet(1, { player1: beatWith({ establishedFacts: [fact, shared, shared] }) });
    const { reply: repaired } = repairBeatReply(base, reply);
    const [updated, changes] = beatStep.apply(base, repaired);
    expect(new ChangeService().applyChanges(updated, changes).getWorldFacts()).toEqual([
      "Energy: runs low",
      "the bells ring",
    ]);
  });
});

describe("repairBeatReply: introductions (TR-3)", () => {
  it("drops an unknown element and keeps known and same-reply elements", () => {
    const intro = (id: string): Introduction => ({ type: "addIntroductionOfStoryElement", player: "player1", storyElementId: id });
    const element: NewElement = {
      type: "newStoryElement",
      element: { id: "ferry", name: "Ferry", role: "", instructions: "", appearance: "", facts: [] },
    };
    const reply = beatSet(1, {
      player1: beatWith({
        newIntroductionsOfStoryElements: [intro("ghost"), intro("inn"), intro("ferry")],
        newGameElements: [element],
      }),
    });
    const { reply: repaired, repairs } = repairBeatReply(withStats(laterSwitchBeat(1)), reply);
    expect(beatOf(repaired).plan.newIntroductionsOfStoryElements).toEqual([intro("inn"), intro("ferry")]);
    expect(repairs).toContainEqual(expect.objectContaining({ kind: "introductionDropped" }));
    expect(kinds(repairs, "introduction")).toHaveLength(1);
  });
});

describe("repairBeatReply: milestones (TR-4)", () => {
  const single = () => withOutcomes(laterSwitchBeat(1), { player1: [outcome("outcome_1")] });

  /** Two players, each with an own chapter that just ended on their own outcome. */
  function twoChapters(): Story {
    const ended = resolvedThread(2, 1, 2);
    ended.threads = [
      { ...ended.threads[0], id: "t1", outcomeId: "p1_goal", playersSideA: ["player1"], milestone: "P1 planned" },
      { ...ended.threads[0], id: "t2", outcomeId: "p2_goal", playersSideA: ["player2"], milestone: "P2 planned" },
    ];
    const story = laterSwitchBeat(2, {
      storyPhases: [switchAnalysis(slotsOf(2), 0), ended, switchAnalysis(slotsOf(2), 3)],
    });
    return withOutcomes(story, { player1: [outcome("p1_goal")], player2: [outcome("p2_goal")] });
  }

  function milestonesOf(story: Story, milestones: Change[]) {
    const { reply, repairs } = repairBeatReply(story, beatSet(story.getNumberOfPlayers(), { newMilestones: milestones }));
    return { milestones: reply.newMilestones, repairs };
  }

  it("takes the group from the outcome", () => {
    const { milestones, repairs } = milestonesOf(single(), [milestone("shared", "outcome_1")]);
    expect(milestones).toEqual([milestone("player1", "outcome_1")]);
    expect(kinds(repairs, "milestone")).toEqual(["milestoneGroup"]);
  });

  it("maps an unknown id onto the one ended chapter's outcome the reply left without a milestone", () => {
    const { milestones, repairs } = milestonesOf(single(), [milestone("player1", "outcome_one", "The pact holds.")]);
    expect(milestones).toEqual([milestone("player1", "outcome_1", "The pact holds.")]);
    expect(kinds(repairs, "milestone")).toEqual(["milestoneIdMapped"]);

    const multi = milestonesOf(twoChapters(), [milestone("player1", "p1_goal"), milestone("player2", "p2_goal_x")]);
    expect(multi.milestones).toEqual([milestone("player1", "p1_goal"), milestone("player2", "p2_goal")]);
  });

  it("drops unknown ids when two are unknown or two ended chapters are uncovered, and falls back to the plan", () => {
    const twoUnknown = milestonesOf(single(), [milestone("player1", "x"), milestone("player1", "y")]);
    expect(twoUnknown.milestones).toEqual([milestone("player1", "outcome_1", "A Thread milestone")]);
    expect(kinds(twoUnknown.repairs, "milestone")).toEqual(["milestoneDropped", "milestoneDropped", "milestoneFromPlan"]);

    const twoUncovered = milestonesOf(twoChapters(), [milestone("player1", "x")]);
    expect(twoUncovered.milestones).toEqual([
      milestone("player1", "p1_goal", "P1 planned"),
      milestone("player2", "p2_goal", "P2 planned"),
    ]);
    expect(kinds(twoUncovered.repairs, "milestone")).toEqual([
      "milestoneDropped",
      "milestoneFromPlan",
      "milestoneFromPlan",
    ]);
  });

  it("lands an id held in two lists on the shared copy and notes it", () => {
    const base = laterSwitchBeat(1);
    const ended = resolvedThread(2, 1, 1);
    ended.threads[0].outcomeId = "goal";
    const story = withOutcomes(
      base.clone({ storyPhases: [switchAnalysis(["player1"], 0), ended, switchAnalysis(["player1"], 3)] }),
      { shared: [outcome("goal")], player1: [outcome("goal")] }
    );
    const { milestones, repairs } = milestonesOf(story, [milestone("player1", "goal")]);
    expect(milestones).toEqual([milestone("shared", "goal")]);
    expect(repairs).toContainEqual(expect.objectContaining({ kind: "milestoneAmbiguousId", note: true }));

    const [updated, changes] = beatStep.apply(story, { ...beatSet(1), newMilestones: milestones });
    const applied = new ChangeService().applyChanges(updated, changes);
    expect(applied.getSharedOutcomes()[0].milestones).toEqual(["It happened."]);
    expect(applied.getPlayer("player1")?.outcomes[0].milestones).toEqual([]);
  });

  it("keeps a milestone on a known outcome that no ended chapter pushed", () => {
    const story = withOutcomes(laterSwitchBeat(1), { player1: [outcome("outcome_1"), outcome("side_quest")] });
    const { milestones } = milestonesOf(story, [milestone("player1", "outcome_1"), milestone("player1", "side_quest")]);
    expect(milestones).toEqual([milestone("player1", "outcome_1"), milestone("player1", "side_quest")]);
  });
});

describe("repairBeatReply: the planned milestone as a safety net (TR-5)", () => {
  const withOutcome = (story: Story) => withOutcomes(story, { player1: [outcome("outcome_1")] });

  it("adds the ended chapter's planned milestone when a later switch writes none", () => {
    const { reply, repairs } = repairBeatReply(withOutcome(laterSwitchBeat(1)), beatSet(1, { newMilestones: [] }));
    expect(reply.newMilestones).toEqual([milestone("player1", "outcome_1", "A Thread milestone")]);
    expect(kinds(repairs)).toEqual(["milestoneFromPlan"]);
  });

  it("does not duplicate a milestone the reply wrote", () => {
    const written = [milestone("player1", "outcome_1", "The pact holds.")];
    const { reply, repairs } = repairBeatReply(withOutcome(laterSwitchBeat(1)), beatSet(1, { newMilestones: written }));
    expect(reply.newMilestones).toEqual(written);
    expect(repairs).toEqual([]);
  });

  it("adds the final chapter's planned milestone at the ending", () => {
    const story = withOutcome(endingBeat(1));
    expect(story.getCurrentBeatType()).toBe("ending");
    const { reply } = repairBeatReply(story, beatSet(1, { newMilestones: [] }));
    expect(reply.newMilestones).toEqual([milestone("player1", "outcome_1", "Final Thread milestone")]);
  });

  it("adds nothing on the first switch, in a chapter turn, or when the reply's milestones are \"\"", () => {
    const first = repairBeatReply(withOutcome(firstSwitchBeat(1)), beatSet(1, { newMilestones: [] }));
    expect(first.reply.newMilestones).toEqual([]);

    const secondChapter = threadAnalysis("challenge", 3, 4);
    secondChapter.threads[0].progression[0].resolution = "favorable";
    const chapterTurn = withOutcome(
      threadBeat(1, {
        storyPhases: [switchAnalysis(["player1"], 0), resolvedThread(2, 1, 1), switchAnalysis(["player1"], 3), secondChapter],
      })
    );
    expect(chapterTurn.getCurrentBeatType()).toBe("thread");
    const inChapter = repairBeatReply(chapterTurn, beatSet(1, { newMilestones: [], player1: beatWith({}, challengeOptions()) }));
    expect(inChapter.reply.newMilestones).toEqual([]);

    expect(repairBeatReply(withOutcome(laterSwitchBeat(1)), beatSet(1)).reply.newMilestones).toBe("");
  });

  it("skips and notes an ended chapter with no planned milestone or an unknown outcome", () => {
    const noMilestone = resolvedThread(2, 1, 1);
    noMilestone.threads[0].milestone = null;
    const story = withOutcome(
      laterSwitchBeat(1, { storyPhases: [switchAnalysis(["player1"], 0), noMilestone, switchAnalysis(["player1"], 3)] })
    );
    const missing = repairBeatReply(story, beatSet(1, { newMilestones: [] }));
    expect(missing.reply.newMilestones).toEqual([]);
    expect(missing.repairs).toEqual([expect.objectContaining({ kind: "milestoneFromPlanSkipped", note: true })]);

    const unknown = repairBeatReply(laterSwitchBeat(1), beatSet(1, { newMilestones: [] }));
    expect(unknown.reply.newMilestones).toEqual([]);
    expect(unknown.repairs).toEqual([expect.objectContaining({ kind: "milestoneFromPlanSkipped", note: true })]);
  });

  it("covers an exploration chapter once its milestone is recorded", () => {
    const chapter = threadAnalysis("exploration", 2, 1);
    chapter.threads[0].progression[0].resolution = "resolution1";
    const atLastStep = withOutcome(threadBeat(1, { storyPhases: [switchAnalysis(["player1"], 0), chapter] }));
    const chosen = atLastStep.updateBeatResolution("player1", "resolution3");

    const resolved = ThreadResolutionService.resolveCurrentThreads(chosen);
    const atSwitch = switchStep.apply(resolved, switchAnalysis(["player1"], resolved.getCurrentTurn()));
    const { reply } = repairBeatReply(atSwitch, beatSet(1, { newMilestones: [] }));
    expect(reply.newMilestones).toEqual([milestone("player1", "outcome_1", "three")]);
  });
});

describe("repairBeatReply: option types (TR-7)", () => {
  const onlyTypes = (repairs: Repair[]) => kinds(repairs, "option");

  it("turns challenge options into exploration ones at a switch, keeping resource type and text", () => {
    const options: BeatOption[] = [
      { ...challengeOptions()[0], resourceType: "sacrifice", basePoints: 30, modifiersToSuccessRate: [{ statId: "x", reason: "r", effect: 5 }] },
      ...explorationOptions().slice(1),
    ];
    const { reply, repairs } = repairBeatReply(laterSwitchBeat(1), beatSet(1, { player1: beatWith({}, options) }));
    expect(beatOf(reply).options[0]).toEqual({ optionType: "exploration", resourceType: "sacrifice", text: "Option 1" });
    expect(beatOf(reply).options.slice(1)).toEqual(explorationOptions().slice(1));
    expect(onlyTypes(repairs)).toEqual(["optionType"]);
  });

  it("turns challenge options into exploration ones in an exploration chapter", () => {
    const chapter = threadAnalysis("exploration", 3, 2);
    chapter.threads[0].progression[0].resolution = "resolution1";
    const story = threadBeat(1, { storyPhases: [switchAnalysis(["player1"], 1), chapter] });
    expect(expectedOptionType(story, "player1")).toBe("exploration");
    const { reply } = repairBeatReply(story, beatSet(1, { player1: beatWith({}, challengeOptions()) }));
    expect(beatOf(reply).options).toEqual(explorationOptions());
  });

  it("turns exploration options into challenge ones in a challenge chapter, with the fixed base points", () => {
    const options: BeatOption[] = [
      { optionType: "exploration", resourceType: "normal", text: "A" },
      { optionType: "exploration", resourceType: "sacrifice", text: "B" },
      { optionType: "exploration", resourceType: "reward", text: "C" },
    ];
    const story = threadBeat(1);
    expect(expectedOptionType(story, "player1")).toBe("challenge");
    const { reply, repairs } = repairBeatReply(story, beatSet(1, { player1: beatWith({}, options) }));
    const challenge = (text: string, resourceType: BeatOption["resourceType"], basePoints: number): BeatOption => ({
      optionType: "challenge",
      resourceType,
      text,
      riskType: "normal",
      basePoints,
      modifiersToSuccessRate: [],
    });
    expect(beatOf(reply).options).toEqual([
      challenge("A", "normal", 0),
      challenge("B", "sacrifice", POINTS_FOR_SACRIFICE),
      challenge("C", "reward", POINTS_FOR_REWARD),
    ]);
    expect(onlyTypes(repairs)).toEqual(["optionType", "optionType", "optionType"]);
  });

  it("turns exploration options into challenge ones for both sides of a contest chapter", () => {
    const contest = threadAnalysis("contest", 3, 2, ["player1"], ["player2"]);
    contest.threads[0].progression[0].resolution = "sideAWins";
    const story = threadBeat(2, { gameMode: GameModes.Competitive, storyPhases: [switchAnalysis(slotsOf(2), 1), contest] });
    const { reply } = repairBeatReply(story, beatSet(2));
    expect(beatOf(reply, "player1").options.every((o) => o.optionType === "challenge")).toBe(true);
    expect(beatOf(reply, "player2").options.every((o) => o.optionType === "challenge")).toBe(true);
  });

  it("leaves matching options and the ending's options untouched", () => {
    const matching = repairBeatReply(threadBeat(1), beatSet(1, { player1: beatWith({}, challengeOptions()) }));
    expect(beatOf(matching.reply).options).toEqual(challengeOptions());
    expect(matching.repairs).toEqual([]);

    const ending = repairBeatReply(endingBeat(1), beatSet(1, { player1: beatWith({}, challengeOptions()) }));
    expect(expectedOptionType(endingBeat(1), "player1")).toBeUndefined();
    expect(beatOf(ending.reply).options).toEqual(challengeOptions());
  });
});

describe("repairBeatReply leaves the model's reply as it was", () => {
  it("does not mutate the input", () => {
    const reply = beatSet(1, {
      statChanges: [statChange("player1", "player1_energy")],
      player1: beatWith({}, challengeOptions()),
    });
    const before = JSON.parse(JSON.stringify(reply)) as unknown;
    repairBeatReply(withStats(laterSwitchBeat(1)), reply);
    expect(reply).toEqual(before);
  });
});

describe("logRepairs", () => {
  it("logs one line per reply with the role, story, turn and the count per kind, without details", () => {
    const lines: string[] = [];
    const repairs: Repair[] = [
      { kind: "statIdSeatForm", detail: "player1_energy -> player_energy" },
      { kind: "statIdSeatForm", detail: "player1_energy -> player_energy" },
      { kind: "offLadderValue", note: true, detail: "player_rank: Discredited" },
    ];
    const story = laterSwitchBeat(1);
    logRepairs("beat", story, repairs, (line) => lines.push(line));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^repair /);
    expect(JSON.parse(lines[0].slice("repair ".length))).toEqual({
      role: "beat",
      storyId: story.getId(),
      turn: story.getCurrentTurn() + 1,
      repairs: { statIdSeatForm: 2 },
      notes: { offLadderValue: 1 },
    });
    expect(lines[0]).not.toMatch(/energy|Discredited/);
  });

  it("logs nothing when there is nothing to report", () => {
    const lines: string[] = [];
    logRepairs("beat", laterSwitchBeat(1), [], (line) => lines.push(line));
    expect(lines).toEqual([]);
  });
});
