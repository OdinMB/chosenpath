import { jest } from "@jest/globals";
import type { Story } from "core/models/Story.js";
import type {
  BeatGeneration,
  BeatOption,
  ChallengeOption,
  Change,
  Outcome,
  PaidLever,
  SetOfBeatGenerationSchema,
  Stat,
  StoryState,
  ThreadAnalysis,
} from "core/types/index.js";
import { GameModes } from "core/types/index.js";
import { POINTS_FOR_REWARD, POINTS_FOR_SACRIFICE } from "core/config.js";
import { expectedOptionType, repairBeatReply } from "../../../../src/game/services/beatRepairs.js";
import { logRepairs, type Repair } from "../../../../src/game/services/textRepairs.js";
import { beatStep, switchStep } from "../../../../src/game/services/storyTextSteps.js";
import { ChangeService } from "../../../../src/game/services/ChangeService.js";
import { BeatResolutionService } from "../../../../src/game/services/BeatResolutionService.js";
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

describe("repairBeatReply: stat bonuses name their stat as the game resolves it", () => {
  type Bonus = ChallengeOption["modifiersToSuccessRate"][number];
  const bonus = (statId: string, effect = 10): Bonus => ({ statId, reason: "it fits", effect });
  const withBonuses = (...bonuses: Bonus[]): BeatOption[] => {
    const [first, ...rest] = challengeOptions();
    return [{ ...first, modifiersToSuccessRate: bonuses }, ...rest];
  };
  const bonusIds = (reply: SetOfBeatGenerationSchema, slot = "player1") =>
    beatOf(reply, slot).options.flatMap((o) => (o.optionType === "challenge" ? o.modifiersToSuccessRate.map((m) => m.statId) : []));

  /** A challenge chapter with Morale (shared), Energy, Rank and Luck, a player stat whose id has no player_ prefix. */
  const story = (players = 1) =>
    withStats(threadBeat(players), {
      playerStats: [stat("player_energy", { name: "Energy" }), stat("player_rank", { name: "Rank", type: "string" }), stat("luck", { name: "Luck" })],
    });

  function repaired(target: Story, slot: string, ...bonuses: Bonus[]) {
    const reply = beatSet(target.getNumberOfPlayers(), { [slot]: beatWith({}, withBonuses(...bonuses)) });
    const { reply: out, repairs } = repairBeatReply(target, reply);
    return { ids: bonusIds(out, slot), repairs: repairs.filter((r) => r.kind.startsWith("bonus")) };
  }

  it("writes the doubled seat form as the seat form the prompt asks for, which the game's lookup resolves", () => {
    const result = repaired(story(), "player1", bonus("player1_player_energy"), bonus("player_player_energy"));
    expect(result.ids).toEqual(["player1_energy", "player1_energy"]);
    expect(result.repairs).toEqual([
      { kind: "bonusStatIdSeatForm", detail: "player1: player1_player_energy -> player1_energy" },
      { kind: "bonusStatIdSeatForm", detail: "player1: player_player_energy -> player1_energy" },
    ]);
    expect(story().getStatById("player1_player_energy")).toBeNull();
    expect(story().getStatById("player1_energy")?.name).toBe("Energy");
  });

  it("writes the plain id where the stat's id has no player_ to replace, the only form the lookup resolves there", () => {
    const result = repaired(story(), "player1", bonus("player1_luck"));
    expect(result.ids).toEqual(["luck"]);
    expect(result.repairs).toEqual([{ kind: "bonusStatIdSeatForm", detail: "player1: player1_luck -> luck" }]);
  });

  it("leaves the plain seat form, the exact player id and a shared stat untouched, with no repair", () => {
    const result = repaired(story(), "player1", bonus("player1_energy"), bonus("player_energy"), bonus("shared_morale"));
    expect(result.ids).toEqual(["player1_energy", "player_energy", "shared_morale"]);
    expect(result.repairs).toEqual([]);
  });

  it("leaves an unknown id as it was and notes it, since the game still counts its points", () => {
    const result = repaired(story(), "player1", bonus("player1_relationship_with_staff"), bonus("player1_shared_morale"));
    expect(result.ids).toEqual(["player1_relationship_with_staff", "player1_shared_morale"]);
    expect(result.repairs).toEqual([
      { kind: "bonusStatUnknown", note: true, detail: "player1: player1_relationship_with_staff" },
      { kind: "bonusStatUnknown", note: true, detail: "player1: player1_shared_morale" },
    ]);
  });

  it("keeps a group player's own seat, and leaves another player's seat as ambiguous and a seat the story lacks as unknown", () => {
    const own = repaired(story(2), "player2", bonus("player2_player_energy"), bonus("player_player_energy"));
    expect(own.ids).toEqual(["player2_energy", "player2_energy"]);
    expect(own.repairs.map((r) => r.kind)).toEqual(["bonusStatIdSeatForm", "bonusStatIdSeatForm"]);

    const other = repaired(story(2), "player1", bonus("player2_player_energy"), bonus("player3_player_energy"));
    expect(other.ids).toEqual(["player2_player_energy", "player3_player_energy"]);
    expect(other.repairs).toEqual([
      { kind: "bonusStatAmbiguous", note: true, detail: "player1: player2_player_energy" },
      { kind: "bonusStatUnknown", note: true, detail: "player1: player3_player_energy" },
    ]);
  });

  it("gives a single player's bonus that player's seat whatever seat it names, as the stat-change repair does", () => {
    const result = repaired(story(), "player1", bonus("player2_player_energy"));
    expect(result.ids).toEqual(["player1_energy"]);
  });

  it("repairs bonuses on every challenge option, at the ending too", () => {
    const ending = withStats(endingBeat(1));
    expect(expectedOptionType(ending, "player1")).toBeUndefined();
    expect(repaired(ending, "player1", bonus("player1_player_energy")).ids).toEqual(["player1_energy"]);
  });

  it("shows the stat's name in the roll breakdown players see, the points unchanged", () => {
    const target = story();
    const reply = beatSet(1, { player1: beatWith({}, withBonuses(bonus("player1_player_energy", 10), bonus("player1_relationship_with_staff", 5))) });
    const breakdown = (option: BeatOption) => {
      const lines: Array<{ name: string; value: number; tooltip?: string }> = [];
      const points = BeatResolutionService.calculateTotalPoints(option as ChallengeOption, lines, target);
      return { points, lines: lines.map((l) => `${l.name} ${l.value}`) };
    };
    expect(breakdown(beatOf(reply).options[0])).toEqual({ points: 15, lines: ["Choice 0", "player1_player_energy 10", "player1_relationship_with_staff 5"] });
    expect(breakdown(beatOf(repairBeatReply(target, reply).reply).options[0])).toEqual({ points: 15, lines: ["Choice 0", "Energy 10", "player1_relationship_with_staff 5"] });
  });

  it("logs the counts per kind without the ids", () => {
    const lines: string[] = [];
    const { repairs } = repairBeatReply(story(), beatSet(1, { player1: beatWith({}, withBonuses(bonus("player1_player_energy"), bonus("player1_relationship_with_staff"))) }));
    logRepairs("beat", story(), repairs, (line) => lines.push(line));
    expect(JSON.parse(lines[0].slice("repair ".length))).toMatchObject({ repairs: { bonusStatIdSeatForm: 1 }, notes: { bonusStatUnknown: 1 } });
    expect(lines[0]).not.toMatch(/energy|staff/);
  });
});

describe("repairBeatReply: a number written as text (the scoreboard's move, setup round 3's chain)", () => {
  /** A two-player story with an opposites scoreboard at 50, as a contest setup writes it. */
  const contest = () =>
    withStats(laterSwitchBeat(2), {
      sharedStats: [stat("shared_bounty_claim", { name: "Paper Claim|Field Claim", type: "opposites", initialValue: 50 })],
      sharedStatValues: [{ statId: "shared_bounty_claim", value: 50 }],
    });

  function repaired(story: Story, change: Change) {
    const { reply, repairs } = repairBeatReply(story, beatSet(story.getNumberOfPlayers(), { statChanges: [change] }));
    return { changes: reply.statChanges, kinds: kinds(repairs, "stat") };
  }

  it("reads an opposites scoreboard written as 'a|b' as the number the game keeps", () => {
    const result = repaired(contest(), statChange("shared", "shared_bounty_claim", "setString", "35|65"));
    expect(result.changes).toEqual([statChange("shared", "shared_bounty_claim", "setNumber", 35)]);
    expect(result.kinds).toEqual(["statNumberAsText"]);
  });

  it("moves the score end to end, where ChangeService dropped the text", () => {
    const story = contest();
    const { reply } = repairBeatReply(story, beatSet(2, { statChanges: [statChange("shared", "shared_bounty_claim", "setString", "35|65")] }));
    const [updated, changes] = beatStep.apply(story, reply);
    const applied = new ChangeService().applyChanges(updated, changes);
    expect(applied.getState().sharedStatValues).toContainEqual({ statId: "shared_bounty_claim", value: 35 });
  });

  it("reads a percentage or a number written as text the same way", () => {
    expect(repaired(withStats(laterSwitchBeat(1)), statChange("player1", "player_energy", "setString", "40%")).changes).toEqual([
      statChange("player1", "player_energy", "setNumber", 40),
    ]);
    const counted = withStats(laterSwitchBeat(1), { playerStats: [stat("player_gold", { type: "number" })] });
    expect(repaired(counted, statChange("player1", "player_gold", "setString", "12")).changes).toEqual([statChange("player1", "player_gold", "setNumber", 12)]);
  });

  it("leaves a text that reads as no number, and string stats, as they were", () => {
    const sides = statChange("shared", "shared_bounty_claim", "setString", "30|60");
    expect(repaired(contest(), sides)).toEqual({ changes: [sides], kinds: [] });
    const rank = statChange("player1", "player_rank", "setString", "Master");
    expect(repaired(withStats(laterSwitchBeat(1)), rank)).toEqual({ changes: [rank], kinds: [] });
  });

  it.each([
    ["-10% on a percentage", "player_energy", "-10%"],
    ["+10% on a percentage", "player_energy", "+10%"],
    ["-10 on a percentage", "player_energy", "-10"],
    ["+5 on a number", "player_gold", "+5"],
    ["-10 on a number", "player_gold", "-10"],
    ["a negative number on a percentage", "player_energy", -10],
  ] as const)("leaves a signed change, %s, as it was: a delta, never an absolute set", (_, id, value) => {
    const story = withStats(laterSwitchBeat(1), { playerStats: [stat("player_energy", { type: "percentage" }), stat("player_gold", { type: "number" })] });
    const signed = statChange("player1", id, "setString", value);
    expect(repaired(story, signed)).toEqual({ changes: [signed], kinds: [] });
  });

  it("leaves a signed scoreboard move as it was", () => {
    const signed = statChange("shared", "shared_bounty_claim", "setString", "-15");
    expect(repaired(contest(), signed)).toEqual({ changes: [signed], kinds: [] });
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

  /*
   * Only what was played (the owner's decision of 2026-10-01: "The idea was -not- for the engine to invent missing
   * milestones for open outcomes. Unfinished outcomes should be narrated as unfinished. Only what was played."): a turn
   * records the milestones of the chapter that just ended, one per thread on that thread's outcome, and none anywhere
   * else. Until then a milestone on a known outcome no ended chapter pushed was kept (TR-4), and the second playthroughs'
   * estate agents' ending added one to each of four outcomes beside the last chapter's.
   */
  it("drops a milestone on an outcome no ended chapter pushed, at a switch and at the ending (the estate agents' ending)", () => {
    for (const build of [laterSwitchBeat, endingBeat]) {
      const story = withOutcomes(build(1), { player1: [outcome("outcome_1"), outcome("side_quest")] });
      const { milestones, repairs } = milestonesOf(story, [milestone("player1", "outcome_1"), milestone("player1", "side_quest", "Invented.")]);
      expect(milestones).toEqual([milestone("player1", "outcome_1")]);
      expect(repairs).toEqual([{ kind: "milestoneNotPlayed", detail: "player1/side_quest" }]);
    }
  });

  it("drops it on an outcome that is still unfinished, and on one already complete", () => {
    const open = outcome("side_quest", { milestones: ["Half done."], intendedNumberOfMilestones: 3 });
    const done = outcome("old_quest", { milestones: ["One.", "Two."] });
    const story = withOutcomes(endingBeat(1), { player1: [outcome("outcome_1"), open, done] });
    const { milestones, repairs } = milestonesOf(story, [
      milestone("player1", "side_quest", "The quest ends after all."),
      milestone("player1", "outcome_1"),
      milestone("player1", "old_quest", "A recap."),
    ]);
    expect(milestones).toEqual([milestone("player1", "outcome_1")]);
    expect(kinds(repairs, "milestone")).toEqual(["milestoneNotPlayed", "milestoneNotPlayed"]);
  });

  it("keeps the first milestone for each ended thread on its outcome, and drops a second written for the same thread", () => {
    const { milestones, repairs } = milestonesOf(single(), [
      milestone("player1", "outcome_1", "The pact holds."),
      milestone("player1", "outcome_1", "And the pact holds again."),
    ]);
    expect(milestones).toEqual([milestone("player1", "outcome_1", "The pact holds.")]);
    expect(repairs).toEqual([{ kind: "milestoneNotPlayed", detail: "player1/outcome_1" }]);
  });

  it("keeps one milestone for each of two ended threads on one shared outcome", () => {
    const ended = resolvedThread(2, 1, 2);
    ended.threads = [
      { ...ended.threads[0], id: "t1", outcomeId: "shared_goal", playersSideA: ["player1"] },
      { ...ended.threads[0], id: "t2", outcomeId: "shared_goal", playersSideA: ["player2"] },
    ];
    const story = withOutcomes(
      laterSwitchBeat(2, { storyPhases: [switchAnalysis(slotsOf(2), 0), ended, switchAnalysis(slotsOf(2), 3)] }),
      { shared: [outcome("shared_goal", { intendedNumberOfMilestones: 3 })] }
    );
    const written = [milestone("shared", "shared_goal", "One."), milestone("shared", "shared_goal", "Two."), milestone("shared", "shared_goal", "Three.")];
    const { milestones, repairs } = milestonesOf(story, written);
    expect(milestones).toEqual(written.slice(0, 2));
    expect(kinds(repairs, "milestone")).toEqual(["milestoneNotPlayed"]);
  });

  it("drops every milestone on a turn that ends no chapter: the first switch and a chapter's step", () => {
    const first = withOutcomes(firstSwitchBeat(1), { player1: [outcome("outcome_1")] });
    expect(milestonesOf(first, [milestone("player1", "outcome_1")])).toEqual({
      milestones: [],
      repairs: [{ kind: "milestoneNotPlayed", detail: "player1/outcome_1" }],
    });
    const step = withOutcomes(threadBeat(1), { player1: [outcome("outcome_1")] });
    expect(milestonesOf(step, [milestone("player1", "outcome_1")]).milestones).toEqual([]);
  });

  it("applies no dropped milestone: the outcome keeps what play gave it", () => {
    const open = outcome("side_quest", { milestones: ["Half done."], intendedNumberOfMilestones: 3 });
    const story = withOutcomes(endingBeat(1), { player1: [outcome("outcome_1"), open] });
    const { milestones } = milestonesOf(story, [milestone("player1", "outcome_1", "The last chapter."), milestone("player1", "side_quest", "Invented.")]);
    const [updated, changes] = beatStep.apply(story, { ...beatSet(1), newMilestones: milestones });
    const applied = new ChangeService().applyChanges(updated, changes);
    expect(applied.getPlayer("player1")?.outcomes.map((o) => o.milestones)).toEqual([["The last chapter."], ["Half done."]]);
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

describe("repairBeatReply: the scoreboard moves toward the side that won (TR-8)", () => {
  const CONTESTED = outcome("shared_license", {
    possibleResolutions: { sideAWins: "Jo wins the license.", mixed: "The license is split.", sideBWins: "Luz wins the license." },
    resonance: "Both owners need the license. Scored by License Race.",
  });
  const RACE = stat("shared_license_race", { type: "opposites", name: "License Race" });
  type ContestResult = "sideAWins" | "mixed" | "sideBWins";

  /** A contest chapter on the license (player1 against player2 unless `sides` says otherwise), its first `resolvedSteps` steps resolved as `result`. */
  function licenseChapter(
    result: ContestResult,
    firstBeatIndex: number,
    duration = 2,
    resolvedSteps = duration,
    sides: [string[], string[]] = [["player1"], ["player2"]]
  ): ThreadAnalysis {
    const analysis = threadAnalysis("contest", duration, firstBeatIndex, ...sides);
    const [written] = analysis.threads;
    const progression = written.progression.map((step, i) => ({ ...step, resolution: i < resolvedSteps ? result : null }));
    const resolved = resolvedSteps === duration ? result : null;
    return { ...analysis, threads: [{ ...written, outcomeId: CONTESTED.id, progression, resolution: resolved, milestone: "The judges decide." }] };
  }

  function withContest(story: Story, score: number, extra: Partial<StoryState> = {}): Story {
    return story.clone({
      gameMode: GameModes.Competitive,
      sharedOutcomes: [CONTESTED],
      sharedStats: [RACE],
      sharedStatValues: [{ statId: RACE.id, value: score }],
      ...extra,
    });
  }

  /** The switch turn after the license chapter ended with `result`. */
  const switchAfter = (result: ContestResult, score = 35, extra: Partial<StoryState> = {}) =>
    withContest(laterSwitchBeat(2, { storyPhases: [switchAnalysis(slotsOf(2), 0), licenseChapter(result, 1), switchAnalysis(slotsOf(2), 3)] }), score, extra);

  const race = (change: StatChange["change"], value: number) => statChange("shared", RACE.id, change, value);

  function repairScore(story: Story, changes: Change[]) {
    const { reply, repairs } = repairBeatReply(story, beatSet(story.getPlayerSlots().length, { statChanges: changes }));
    return { changes: reply.statChanges, kinds: kinds(repairs, "scoreboard"), repairs };
  }

  it("turns a move toward the side that lost around, by the same size (the food trucks' turn 22: side B won, 35|65 went to 50|50)", () => {
    const result = repairScore(switchAfter("sideBWins"), [race("addNumber", 15)]);
    expect(result.changes).toEqual([race("subtractNumber", 15)]);
    expect(result.kinds).toEqual(["scoreboardDirection"]);
    expect(result.repairs[0].detail).toBe("shared_license_race: 35 -> 50 after side B won; 35 -> 20");
    // Applied as the game applies it: 20|80
    const [withBeat, changes] = beatStep.apply(switchAfter("sideBWins"), beatSet(2, { statChanges: result.changes }), true);
    const after = new ChangeService().applyChanges(withBeat, changes);
    expect(after.getState().sharedStatValues).toEqual([{ statId: RACE.id, value: 20 }]);
  });

  it("keeps a move toward the side that won", () => {
    expect(repairScore(switchAfter("sideBWins"), [race("subtractNumber", 15)])).toMatchObject({ changes: [race("subtractNumber", 15)], kinds: [] });
    expect(repairScore(switchAfter("sideAWins"), [race("addNumber", 15)])).toMatchObject({ changes: [race("addNumber", 15)], kinds: [] });
    expect(repairScore(switchAfter("sideAWins", 50), [race("setNumber", 65)])).toMatchObject({ changes: [race("setNumber", 65)], kinds: [] });
  });

  it("reflects a value set on the wrong side of the score, and a negative addition, around the score before", () => {
    expect(repairScore(switchAfter("sideAWins", 50), [race("setNumber", 40)]).changes).toEqual([race("setNumber", 60)]);
    expect(repairScore(switchAfter("sideAWins", 90), [race("setNumber", 70)]).changes).toEqual([race("setNumber", 100)]);
    expect(repairScore(switchAfter("sideAWins", 50), [race("addNumber", -10)]).changes).toEqual([race("subtractNumber", -10)]);
  });

  it("reads the scoreboard's move after the scores the reply wrote before it", () => {
    const result = repairScore(switchAfter("sideBWins", 35), [race("subtractNumber", 10), race("addNumber", 5)]);
    expect(result.changes).toEqual([race("subtractNumber", 10), race("subtractNumber", 5)]);
    expect(result.repairs.map((r) => r.detail)).toEqual(["shared_license_race: 25 -> 30 after side B won; 25 -> 20"]);
  });

  it("leaves every move after a mixed result as written: no side won", () => {
    expect(repairScore(switchAfter("mixed"), [race("addNumber", 10)])).toMatchObject({ changes: [race("addNumber", 10)], kinds: [] });
  });

  it("follows the contest step a chapter's turn comes after", () => {
    const story = withContest(threadBeat(2, { storyPhases: [switchAnalysis(slotsOf(2), 1), licenseChapter("sideAWins", 2, 3, 1)] }), 50);
    expect(repairScore(story, [race("subtractNumber", 10)]).changes).toEqual([race("addNumber", 10)]);
  });

  it("follows the story's last contest chapter at the ending", () => {
    const phases = [switchAnalysis(slotsOf(2), 0), resolvedThread(2, 1, 2, "Older Thread"), switchAnalysis(slotsOf(2), 3), licenseChapter("sideBWins", 4)];
    const story = withContest(endingBeat(2, { storyPhases: phases }), 50);
    expect(story.getCurrentBeatType()).toBe("ending");
    expect(repairScore(story, [race("addNumber", 10)]).changes).toEqual([race("subtractNumber", 10)]);
  });

  it("leaves moves alone where the turn follows no contest result: a chapter's opening, or a switch after a challenge chapter", () => {
    const opening = withContest(threadBeat(2, { storyPhases: [switchAnalysis(slotsOf(2), 1), licenseChapter("sideAWins", 3, 2, 0)] }), 50);
    expect(repairScore(opening, [race("subtractNumber", 10)])).toMatchObject({ changes: [race("subtractNumber", 10)], kinds: [] });
    const afterChallenge = withContest(laterSwitchBeat(2), 50);
    expect(repairScore(afterChallenge, [race("subtractNumber", 10)])).toMatchObject({ changes: [race("subtractNumber", 10)], kinds: [] });
  });

  it("moves only the contest's own scoreboard: the stat its resonance names", () => {
    const calm = stat("shared_calm", { type: "opposites", name: "Calm|Storm" });
    const twoStats = { sharedStats: [RACE, calm], sharedStatValues: [{ statId: RACE.id, value: 35 }, { statId: calm.id, value: 50 }] };
    const named = repairScore(switchAfter("sideBWins", 35, twoStats), [statChange("shared", calm.id, "addNumber", 10), race("addNumber", 10)]);
    expect(named.changes).toEqual([statChange("shared", calm.id, "addNumber", 10), race("subtractNumber", 10)]);
  });

  it("reads no scoreboard where the contested outcome names none: a story set up before setup round 3, whose one shared opposites stat is a meter with either side first", () => {
    // The old setup's opposites were meters for what changes often; here player1 is the Enclave, so side A's win moves "Printers|Enclave" down
    const meter = stat("shared_printers_enclave", { type: "opposites", name: "Printers|Enclave" });
    const oldSetup = {
      sharedOutcomes: [{ ...CONTESTED, resonance: "Both owners need the license." }],
      sharedStats: [meter],
      sharedStatValues: [{ statId: meter.id, value: 50 }],
    };
    const towardEnclave = statChange("shared", meter.id, "subtractNumber", 15);
    expect(repairScore(switchAfter("sideAWins", 50, oldSetup), [towardEnclave])).toMatchObject({ changes: [towardEnclave], kinds: [] });
    // Nor after each contest step in a chapter
    const inChapter = withContest(threadBeat(2, { storyPhases: [switchAnalysis(slotsOf(2), 1), licenseChapter("sideAWins", 2, 3, 1)] }), 50, oldSetup);
    expect(repairScore(inChapter, [towardEnclave])).toMatchObject({ changes: [towardEnclave], kinds: [] });
  });

  it("leaves a scoreboard alone after a contest player1 is not on side A of: which camp its side A is lives only in the planner's text", () => {
    // Three players, camps {player1, player3} against {player2}: the planner put player2 on side A, player3 won, the move up is toward player1's camp
    const satOut = licenseChapter("sideBWins", 1, 2, 2, [["player2"], ["player3"]]);
    const threePlayers = withContest(laterSwitchBeat(3, { storyPhases: [switchAnalysis(slotsOf(3), 0), satOut, switchAnalysis(slotsOf(3), 3)] }), 50);
    expect(repairScore(threePlayers, [race("addNumber", 10)])).toMatchObject({ changes: [race("addNumber", 10)], kinds: [] });
    // player1 on side B (a plan the plan check's PL-11 never saw), and a second contest like it on the same scoreboard
    const onSideB = licenseChapter("sideBWins", 1, 2, 2, [["player2"], ["player1"]]);
    expect(repairScore(switchAfter("sideAWins", 50, { storyPhases: [switchAnalysis(slotsOf(2), 0), onSideB, switchAnalysis(slotsOf(2), 3)] }), [race("addNumber", 10)]).kinds).toEqual([]);
    const chapter = licenseChapter("sideAWins", 1);
    const rematch = { ...licenseChapter("sideAWins", 1, 2, 2, [["player2"], ["player1"]]).threads[0], id: "rematch" };
    const both = { ...chapter, threads: [...chapter.threads, rematch] };
    expect(repairScore(switchAfter("sideAWins", 50, { storyPhases: [switchAnalysis(slotsOf(2), 0), both, switchAnalysis(slotsOf(2), 3)] }), [race("subtractNumber", 10)]).kinds).toEqual([]);
  });

  it("leaves a scoreboard alone when two contests this turn follows disagree on who won", () => {
    const chapter = licenseChapter("sideAWins", 1);
    const other = { ...licenseChapter("sideBWins", 1).threads[0], id: "rematch" };
    const story = switchAfter("sideAWins", 50, { storyPhases: [switchAnalysis(slotsOf(2), 0), { ...chapter, threads: [...chapter.threads, other] }, switchAnalysis(slotsOf(2), 3)] });
    expect(repairScore(story, [race("subtractNumber", 10)]).kinds).toEqual([]);
  });
});

describe("repairBeatReply: a shared sacrifice or reward goes to one player per turn (TR-9)", () => {
  const FAVORS = stat("shared_dockside_favors", {
    type: "string[]",
    name: "Dockside Favors",
    optionsToSacrifice: "Call in one favor; remove that favor from the list.",
    optionsToGainAsReward: "Gain one appropriate dockside favor by accepting a useful obligation instead of immediate payment.",
  });
  const CONTACTS = stat("player_contacts", { type: "string[]", name: "Personal Contacts", optionsToSacrifice: "Burn one contact for a quick favour." });
  const IVO = "Call in Ivo Senn's dockside favor to secure the discreet work arrangement.";

  /** Three players (the space pirates) in one step: the crew's shared favors, each player's own contacts. */
  function withFavors(story: Story, contacts: Partial<Stat> = {}): Story {
    const players = Object.fromEntries(
      Object.entries(story.getPlayers()).map(([slot, player]) => [slot, { ...player, statValues: [{ statId: CONTACTS.id, value: [`Contact of ${slot}`] }] }])
    );
    return story.clone({
      gameMode: GameModes.CooperativeCompetitive,
      sharedStats: [FAVORS],
      sharedStatValues: [{ statId: FAVORS.id, value: ["Ivo Senn"] }],
      playerStats: [{ ...CONTACTS, ...contacts }],
      players,
    });
  }
  const challengeStep = () => withFavors(threadBeat(3));

  const lever = (text: string, resourceType: "sacrifice" | "reward" = "sacrifice"): BeatOption => ({
    optionType: "challenge",
    resourceType,
    riskType: "normal",
    text,
    basePoints: resourceType === "sacrifice" ? POINTS_FOR_SACRIFICE : POINTS_FOR_REWARD,
    modifiersToSuccessRate: [],
  });
  const withLever = (option: BeatOption): BeatOption[] => [...challengeOptions().slice(0, 2), option];

  function levers(story: Story, bySlot: Record<string, BeatOption | undefined>) {
    const beats = Object.fromEntries(
      slotsOf(3).map((slot) => [slot, beatWith({ forPlayer: slot }, bySlot[slot] ? withLever(bySlot[slot] as BeatOption) : challengeOptions())])
    );
    const { reply, repairs } = repairBeatReply(story, beatSet(3, beats));
    return { options: (slot: string) => beatOf(reply, slot).options, repairs: repairs.filter((r) => r.kind.startsWith("sharedLever")) };
  }

  it("offers a shared sacrifice to the first player only; the others' copies leave their options (the space pirates' turn 16)", () => {
    const result = levers(challengeStep(), {
      player1: lever(IVO),
      player3: lever("Call in Ivo Senn's dockside favor to support the discreet repair arrangement."),
    });
    expect(result.options("player1")).toEqual(withLever(lever(IVO)));
    expect(result.options("player3")).toEqual(challengeOptions().slice(0, 2));
    expect(result.repairs).toEqual([{ kind: "sharedLeverRepeated", detail: "player3: shared_dockside_favors (sacrifice) is player1's this turn" }]);
  });

  it("does the same for a shared reward", () => {
    const gain = lever("Accept the harbour-master's obligation and gain a new dockside favor.", "reward");
    const result = levers(challengeStep(), { player2: gain, player3: gain });
    expect(result.options("player2")).toEqual(withLever(gain));
    expect(result.options("player3")).toEqual(challengeOptions().slice(0, 2));
  });

  it("keeps a sacrifice and a reward of one shared stat: they are different favours", () => {
    const result = levers(challengeStep(), { player1: lever(IVO), player2: lever("Take on an obligation to gain a dockside favor.", "reward") });
    expect(result.options("player2")).toHaveLength(3);
    expect(result.repairs).toEqual([]);
  });

  it("keeps a lever on each player's own stat for every player it is offered to", () => {
    const own = lever("Burn one of your Personal Contacts to get the berth cleared.");
    const result = levers(challengeStep(), { player1: own, player2: own, player3: own });
    for (const slot of slotsOf(3)) expect(result.options(slot)).toHaveLength(3);
    expect(result.repairs).toEqual([]);
  });

  it("reads the stat by its name, singular or plural, else by the value it holds, else as the one stat that allows the lever", () => {
    const byName = levers(challengeStep(), { player1: lever("Spend one of the crew's dockside favors on the berth."), player2: lever("Spend a dockside favor on the berth.") });
    expect(byName.options("player2")).toHaveLength(2);
    const onlyOne = withFavors(threadBeat(3), { optionsToSacrifice: "None" });
    const unnamed = levers(onlyOne, { player1: lever("Call in an old debt at the dock."), player2: lever("Call in an old debt at the dock.") });
    expect(unnamed.options("player2")).toHaveLength(2);
  });

  it("leaves a lever whose stat its text doesn't make clear", () => {
    const both = lever("Burn one of your Personal Contacts to call in a dockside favor.");
    const result = levers(challengeStep(), { player1: both, player2: both });
    expect(result.options("player2")).toHaveLength(3);
    expect(result.repairs).toEqual([]);
  });

  it("leaves an exploration step's options in place, where an option's position is its result, and notes the repeat", () => {
    const chapter = threadAnalysis("exploration", 3, 2, slotsOf(3));
    chapter.threads[0].progression[0].resolution = "resolution1";
    const story = withFavors(threadBeat(3, { storyPhases: [switchAnalysis(slotsOf(3), 1), chapter] }));
    const favor: BeatOption = { optionType: "exploration", resourceType: "sacrifice", text: IVO };
    const beats = Object.fromEntries(slotsOf(3).map((slot) => [slot, beatWith({ forPlayer: slot }, [...explorationOptions().slice(0, 2), favor])]));
    const { reply, repairs } = repairBeatReply(story, beatSet(3, beats));
    for (const slot of slotsOf(3)) expect(beatOf(reply, slot).options).toHaveLength(3);
    expect(repairs.filter((r) => r.kind.startsWith("sharedLever"))).toEqual([
      { kind: "sharedLeverRepeatedKept", note: true, detail: "player2: shared_dockside_favors (sacrifice) is player1's this turn" },
      { kind: "sharedLeverRepeatedKept", note: true, detail: "player3: shared_dockside_favors (sacrifice) is player1's this turn" },
    ]);
  });
});

describe("repairBeatReply: a sacrifice or reward charged again on the turn after its payment (TR-10)", () => {
  const RESERVE = stat("player_personal_reserve", {
    name: "Personal Reserve",
    optionsToSacrifice: "Spend 15% Personal Reserve to sustain one difficult effort without stopping.",
    optionsToGainAsReward: "Regain 10% Personal Reserve by taking time to rest instead of pursuing a lead.",
  });
  const CRUMBS = stat("shared_pantry_crumbs", { type: "number", name: "Pantry Crumbs", optionsToSacrifice: "Spend 1 Pantry Crumb to wedge, bait or bribe.", initialValue: 3 });
  const BRACE = "Brace the shuddering control ring and keep it aligned while Mara works the credential and tokens (-15% Personal Reserve).";
  const WEDGE = "Use one Pantry Crumb as a soft wedge beneath the board, spending 1 Pantry Crumb to keep the wood from shifting while Pip listens.";

  const lever = (text: string, resourceType: "sacrifice" | "reward" = "sacrifice"): BeatOption => ({
    optionType: "challenge",
    resourceType,
    riskType: "normal",
    text,
    basePoints: resourceType === "sacrifice" ? POINTS_FOR_SACRIFICE : POINTS_FOR_REWARD,
    modifiersToSuccessRate: [],
  });
  const withLever = (option: BeatOption): BeatOption[] => [...challengeOptions().slice(0, 2), option];
  const reservePaid = (overrides: Partial<PaidLever> = {}): PaidLever => ({ kind: "sacrifice", group: "player1", stat: RESERVE.id, step: -15, ...overrides });

  type History = { tookLever?: BeatOption; paidLever?: PaidLever; lastChoice?: BeatOption };

  /**
   * Each player's history as New Avalon's turns 2-3: the beat before last took a
   * lever, the last beat's turn paid it (its record) and the player chose again
   * (a normal option unless `lastChoice`). Personal Reserve at 45, two Pantry Crumbs.
   */
  function afterPayment(base: Story, bySlot: Record<string, History>): Story {
    const players = Object.fromEntries(
      Object.entries(base.getPlayers()).map(([slot, player]) => {
        const history = bySlot[slot] ?? {};
        const beats = [...player.beatHistory];
        const [previous, last] = [beats.length - 2, beats.length - 1];
        if (history.tookLever) beats[previous] = { ...beats[previous], options: withLever(history.tookLever), choice: 2 };
        beats[last] = {
          ...beats[last],
          ...(history.lastChoice ? { options: withLever(history.lastChoice), choice: 2 } : { options: challengeOptions(), choice: 0 }),
          ...(history.paidLever ? { paidLever: history.paidLever } : {}),
        };
        return [slot, { ...player, beatHistory: beats, statValues: [{ statId: RESERVE.id, value: 45 }] }];
      })
    );
    return base.clone({
      sharedStats: [CRUMBS],
      sharedStatValues: [{ statId: CRUMBS.id, value: 2 }],
      playerStats: [RESERVE],
      players,
    });
  }
  const avalon = (history: History = { tookLever: lever(BRACE), paidLever: reservePaid() }) => afterPayment(threadBeat(1), { player1: history });

  function repaired(story: Story, statChanges: Change[]) {
    const { reply, repairs } = repairBeatReply(story, beatSet(story.getPlayerSlots().length, { statChanges }));
    return { statChanges: reply.statChanges, repairs: repairs.filter((r) => r.kind === "leverChargedAgain") };
  }

  it("drops the same charge again on the turn after the one that paid it (New Avalon turn 4: 45 → 30 for the bracing turn 2 took and turn 3 paid)", () => {
    const other = statChange("shared", CRUMBS.id, "addNumber", 1);
    const result = repaired(avalon(), [statChange("player1", RESERVE.id, "subtractNumber", 15), other]);
    expect(result.statChanges).toEqual([other]);
    expect(result.repairs).toEqual([{ kind: "leverChargedAgain", detail: "player1/player_personal_reserve: -15, the sacrifice the previous turn paid" }]);
  });

  it("drops it on a shared stat at the ending too (the mouse story: a Pantry Crumb spent at turn 9, paid at 10, spent again at 11)", () => {
    const story = afterPayment(endingBeat(1), { player1: { tookLever: lever(WEDGE), paidLever: { kind: "sacrifice", group: "shared", stat: CRUMBS.id, step: -1 } } });
    expect(story.getCurrentBeatType()).toBe("ending");
    const result = repaired(story, [statChange("shared", CRUMBS.id, "subtractNumber", 1)]);
    expect(result.statChanges).toEqual([]);
    expect(result.repairs).toEqual([{ kind: "leverChargedAgain", detail: "shared/shared_pantry_crumbs: -1, the sacrifice the previous turn paid" }]);
  });

  it("reads a value set as the change it makes, and drops a reward gained again the same way", () => {
    expect(repaired(avalon(), [statChange("player1", RESERVE.id, "setNumber", 30)]).statChanges).toEqual([]);
    const rested = avalon({ tookLever: lever("Rest by the fountain and regain 10% Personal Reserve.", "reward"), paidLever: reservePaid({ kind: "reward", step: 10 }) });
    const result = repaired(rested, [statChange("player1", RESERVE.id, "addNumber", 10)]);
    expect(result.statChanges).toEqual([]);
    expect(result.repairs).toEqual([{ kind: "leverChargedAgain", detail: "player1/player_personal_reserve: +10, the reward the previous turn paid" }]);
  });

  it("keeps a change of another size, one the other way, and one on another stat", () => {
    const changes = [statChange("player1", RESERVE.id, "subtractNumber", 10), statChange("player1", RESERVE.id, "addNumber", 15), statChange("shared", CRUMBS.id, "subtractNumber", 15)];
    const result = repaired(avalon(), changes);
    expect(result.statChanges).toEqual(changes);
    expect(result.repairs).toEqual([]);
  });

  it("keeps the charge when the last choice was itself a sacrifice of that stat: a new payment is due", () => {
    const again = avalon({ tookLever: lever(BRACE), paidLever: reservePaid(), lastChoice: lever("Run the full sweep, spending 15% of your Personal Reserve.") });
    const changes = [statChange("player1", RESERVE.id, "subtractNumber", 15)];
    expect(repaired(again, changes)).toEqual({ statChanges: changes, repairs: [] });
  });

  it("keeps a late payment: a turn that paid nothing leaves the next turn's charge alone", () => {
    const unpaid = avalon({ tookLever: lever(BRACE) });
    const changes = [statChange("player1", RESERVE.id, "subtractNumber", 15)];
    expect(repaired(unpaid, changes)).toEqual({ statChanges: changes, repairs: [] });
  });

  it("drops one charge per payment", () => {
    const charge = statChange("player1", RESERVE.id, "subtractNumber", 15);
    const result = repaired(avalon(), [charge, charge]);
    expect(result.statChanges).toEqual([charge]);
    expect(result.repairs).toHaveLength(1);
  });

  it("in a group, drops a shared stat's second charge unless another player's last choice spends it again", () => {
    const crumbPaid: PaidLever = { kind: "sacrifice", group: "shared", stat: CRUMBS.id, step: -1 };
    const charge = statChange("shared", CRUMBS.id, "subtractNumber", 1);
    const paidOnce = afterPayment(threadBeat(2), { player1: { tookLever: lever(WEDGE), paidLever: crumbPaid } });
    expect(repaired(paidOnce, [charge]).statChanges).toEqual([]);
    const spentAgain = afterPayment(threadBeat(2), { player1: { tookLever: lever(WEDGE), paidLever: crumbPaid }, player2: { lastChoice: lever(WEDGE) } });
    expect(repaired(spentAgain, [charge])).toEqual({ statChanges: [charge], repairs: [] });
  });
});

describe("repairBeatReply leaves the model's reply as it was", () => {
  it("does not mutate the input", () => {
    const [first, ...rest] = challengeOptions();
    const reply = beatSet(1, {
      statChanges: [statChange("player1", "player1_energy")],
      player1: beatWith({}, [{ ...first, modifiersToSuccessRate: [{ statId: "player1_player_energy", reason: "r", effect: 5 }] }, ...rest]),
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
