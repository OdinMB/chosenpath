import { describe, expect, it } from "@jest/globals";
import { Story } from "core/models/Story.js";
import type { Beat, BeatOption, ThreadAnalysis } from "core/types/index.js";
import {
  GROUP_LEVER_QUESTION,
  GROUP_OPTION_VARIETY,
  GROUP_SHARED_AND_OWN,
  NO_DOUBLE_SACRIFICE,
  THREE_WAYS,
  groupLeverLine,
  groupLeverRule,
  groupLeverSlots,
  groupRewardTurn,
  groupSacrificeRewardLines,
  optionLeverLine,
  rewardTurn,
  sacrificeRewardLine,
  takesGroupLeverRules,
  takesOptionRules,
} from "../../../../src/game/services/optionRules.js";
import { OPTIONS_CONTINUITY_TEXT } from "../../../../src/game/services/storyTextRounds/turnOptionsContinuity.js";
import { OPTIONS_O2C_TEXT, o2cLeverLine, o2cRewardTurn } from "../../../../src/game/services/storyTextRounds/optionsO2c.js";
import {
  GROUP_OPTIONS_TEXT,
  groupOptionsLine,
  groupOptionsRule,
  groupRewardTurn as groupOptionsRewardTurn,
} from "../../../../src/game/services/storyTextRounds/groupOptions.js";
import { endingBeat, firstSwitchBeat, laterSwitchBeat, slotsOf, threadBeat } from "../../../helpers/promptStories.js";
import { endedChapter, outcome, roundStory, topicSwitch } from "../../../helpers/roundStories.js";
import { beatGeneration, challengeOptions, stat, switchAnalysis, threadAnalysis, type ThreadKind } from "../../../helpers/textFixtures.js";

/*
 * The option rules (B6) in production: which turns take them, and the lever
 * line the game computes from the player's history.
 */

const GUILD = "player1_guild_reform";
const OUTCOMES = { player1: [outcome(GUILD)] };

function chapterStep(kind: ThreadKind, history?: Beat[]): Story {
  const analysis = threadAnalysis(kind, 3, 1);
  const chapter: ThreadAnalysis = {
    ...analysis,
    threads: analysis.threads.map((t) => ({
      ...t,
      outcomeId: GUILD,
      progression: t.progression.map((step, i) => ({ ...step, resolution: i < 1 ? (kind === "exploration" ? ("resolution1" as const) : ("favorable" as const)) : null })),
    })),
  };
  const story = roundStory({ turns: 2, maxTurns: 20, playerOutcomes: OUTCOMES, phases: [topicSwitch([["Petition", GUILD]], 0), chapter] });
  if (!history) return story;
  const state = story.getState();
  return Story.create({ ...state, players: { player1: { ...state.players.player1, beatHistory: history } } });
}

function challengeBeat(levers: BeatOption["resourceType"][] = []): Beat {
  const options = challengeOptions().map((o, i) => ({ ...o, resourceType: levers[i] ?? "normal" }));
  return { ...beatGeneration({ options }), choice: 0, resolution: "favorable" };
}

const switchBeat = (): Beat => ({ ...beatGeneration(), choice: 0, resolution: null });

describe("takesOptionRules: a single player's rolled chapter steps", () => {
  it("takes a challenge step", () => {
    expect(takesOptionRules(chapterStep("challenge"))).toBe(true);
    expect(takesOptionRules(threadBeat(1))).toBe(true);
  });

  it.each([
    ["an exploration step", () => chapterStep("exploration")],
    ["the first switch", () => firstSwitchBeat(1)],
    ["a later switch", () => laterSwitchBeat(1)],
    ["the ending", () => endingBeat(1)],
    ["a group's chapter step", () => threadBeat(2)],
  ] as const)("leaves out %s", (_, build) => {
    expect(takesOptionRules(build())).toBe(false);
  });
});

/** A group's step 2 of a 3-beat thread with player1 exploring beside the others' challenge. */
function mixedGroupStep(players: number): Story {
  const state = structuredClone(threadBeat(players).getState());
  const analysis = state.storyPhases[1] as ThreadAnalysis;
  const [shared] = analysis.threads;
  const results = { resolution1: "one", resolution2: "two", resolution3: "three" };
  analysis.threads = [
    { ...shared, id: "explore", playersSideA: ["player1"], possibleMilestones: results, progression: shared.progression.map((s, i) => ({ ...s, possibleResolutions: results, resolution: i === 0 ? ("resolution1" as const) : null })) },
    { ...shared, id: "fight", playersSideA: shared.playersSideA.filter((s) => s !== "player1") },
  ];
  return Story.create(state);
}

describe("groupLeverSlots: a group's players in a challenge or contest thread (the group-levers stage, 2026-10-01)", () => {
  it("names every rolled player of a group's chapter step, in seat order, and not one exploring beside them", () => {
    expect(groupLeverSlots(threadBeat(2))).toEqual(["player1", "player2"]);
    expect(groupLeverSlots(threadBeat(3))).toEqual(["player1", "player2", "player3"]);
    expect(groupLeverSlots(mixedGroupStep(3))).toEqual(["player2", "player3"]);
    expect(takesGroupLeverRules(mixedGroupStep(2))).toBe(true);
  });

  it.each([
    ["a single player's chapter step (B6's)", () => threadBeat(1)],
    ["a group's first switch", () => firstSwitchBeat(2)],
    ["a group's later switch", () => laterSwitchBeat(3)],
    ["a group's ending", () => endingBeat(2)],
  ] as const)("names none on %s", (_, build) => {
    expect(groupLeverSlots(build())).toEqual([]);
    expect(takesGroupLeverRules(build())).toBe(false);
  });

  it("gives each rolled player their own computed line, then the group sentence and no second sacrifice", () => {
    // Step 2 of the chapter, no lever offered before: a sacrifice fits and no reward (the owner's rules for groups since
    // the group-options stage of 2026-10-01; B6's "one fits" before)
    const story = mixedGroupStep(3);
    expect(groupSacrificeRewardLines(story)).toBe(
      "--- Sacrifice or reward, for each player in a Challenge or Contest thread (each player's own options):\n" +
        "----- player2 (Test Player 2): a sacrifice fits this turn if a stat allows it. No reward this turn.\n" +
        "----- player3 (Test Player 3): a sacrifice fits this turn if a stat allows it. No reward this turn.\n" +
        `--- ${GROUP_SHARED_AND_OWN}\n--- ${NO_DOUBLE_SACRIFICE}\n`
    );
  });
});

/*
 * A group's levers and the owner's roll (the review of 2026-10-01): on one
 * player's own outcome, with that owner in the thread, only the owner's roll
 * decides the step (ThreadResolutionService.rollingOwner, the owner's decision
 * "Yes, only count the owner's roll."). Another player's lever there would
 * move a roll the game discards: a reward a free stat gain, a sacrifice a stat
 * paid for nothing. So that player's line says none this turn (the measured
 * line's own wording); the owner, and every player where rolls pool, keep B6's
 * rate line.
 */
describe("a group's lever lines where only the owner's roll counts", () => {
  /** A group's step 2 of a 3-beat thread of this kind on `outcomeId`, these players on its sides, each player holding an own outcome `<slot>_own`. */
  function ownOutcomeStep(players: number, outcomeId: string, kind: "challenge" | "contest" = "challenge", sideA = slotsOf(players), sideB: string[] = []): Story {
    const chapter = threadAnalysis(kind, 3, 2, sideA, sideB);
    chapter.threads[0].outcomeId = outcomeId;
    chapter.threads[0].progression[0].resolution = kind === "contest" ? "sideAWins" : "favorable";
    const story = threadBeat(players, { storyPhases: [switchAnalysis(slotsOf(players), 1), chapter] });
    const withOutcomes = Object.fromEntries(Object.entries(story.getPlayers()).map(([slot, player]) => [slot, { ...player, outcomes: [outcome(`${slot}_own`)] }]));
    return story.clone({ sharedOutcomes: [outcome("shared_sale")], players: withOutcomes });
  }

  const linesOf = (story: Story) =>
    groupSacrificeRewardLines(story)
      .split("\n")
      .filter((line) => line.startsWith("----- "));
  // Step 2 of the chapter, no lever before: the owner's rules for groups give a sacrifice and no reward (since the
  // group-options stage of 2026-10-01)
  const FITS = "a sacrifice fits this turn if a stat allows it. No reward this turn.";
  const NONE = "none this turn.";

  it("gives a player in a thread on another player's own outcome none this turn when that owner is in it; the owner keeps their own line", () => {
    expect(linesOf(ownOutcomeStep(2, "player2_own"))).toEqual([`----- player1 (Test Player 1): ${NONE}`, `----- player2 (Test Player 2): ${FITS}`]);
    expect(linesOf(ownOutcomeStep(3, "player3_own"))).toEqual([`----- player1 (Test Player 1): ${NONE}`, `----- player2 (Test Player 2): ${NONE}`, `----- player3 (Test Player 3): ${FITS}`]);
    expect(groupLeverLine(ownOutcomeStep(2, "player2_own"), "player1")).toBe("Sacrifice or reward: none this turn.");
    expect(groupLeverLine(ownOutcomeStep(2, "player2_own"), "player2")).toBe(`Sacrifice or reward: ${FITS}`);
  });

  it("does the same in a contest on one player's own outcome, on both sides", () => {
    expect(linesOf(ownOutcomeStep(2, "player1_own", "contest", ["player1"], ["player2"]))).toEqual([`----- player1 (Test Player 1): ${FITS}`, `----- player2 (Test Player 2): ${NONE}`]);
    expect(linesOf(ownOutcomeStep(3, "player3_own", "contest", ["player1", "player3"], ["player2"]))).toEqual([
      `----- player1 (Test Player 1): ${NONE}`,
      `----- player2 (Test Player 2): ${NONE}`,
      `----- player3 (Test Player 3): ${FITS}`,
    ]);
  });

  it("keeps every player's own line where every roll pools: a shared outcome, or a player's own outcome its owner is not in", () => {
    expect(linesOf(ownOutcomeStep(3, "shared_sale"))).toEqual([1, 2, 3].map((n) => `----- player${n} (Test Player ${n}): ${FITS}`));
    // player3 sits in no thread here, so has no line at all
    expect(linesOf(ownOutcomeStep(3, "player3_own", "challenge", ["player1", "player2"]))).toEqual([1, 2].map((n) => `----- player${n} (Test Player ${n}): ${FITS}`));
  });

  it("keeps such a player among the lever slots, so their fields still ask the plan's lever question from the line (which says None)", () => {
    expect(groupLeverSlots(ownOutcomeStep(2, "player2_own"))).toEqual(["player1", "player2"]);
  });
});

describe("sacrificeRewardLine (B6's computed rate)", () => {
  it("fits when none was offered in the player's last two challenge turns, naming the last one and the other kind", () => {
    const history = [challengeBeat(["sacrifice"]), switchBeat(), challengeBeat(), challengeBeat()];
    expect(sacrificeRewardLine(chapterStep("challenge", history), "player1")).toBe(
      "Sacrifice or reward: one fits this turn if a stat allows it (the last one offered was a sacrifice, 4 turns ago; prefer a reward)."
    );
  });

  it("is none when one of the last two challenge turns offered one; switch turns don't count", () => {
    const history = [challengeBeat(), challengeBeat(["normal", "reward"]), switchBeat()];
    expect(sacrificeRewardLine(chapterStep("challenge", history), "player1")).toBe("Sacrifice or reward: none this turn.");
  });

  it("fits without a preference when none was ever offered", () => {
    expect(sacrificeRewardLine(chapterStep("challenge", [switchBeat(), challengeBeat()]), "player1")).toBe(
      "Sacrifice or reward: one fits this turn if a stat allows it."
    );
  });

  it("fits again two challenge turns after a lever, naming how long ago it was offered (group turns read it; a single player's turn reads optionLeverLine)", () => {
    const history = [challengeBeat(), challengeBeat(), challengeBeat(["reward"])];
    // The last two challenge turns include the reward, so none fits; one more challenge turn later it fits again
    expect(sacrificeRewardLine(chapterStep("challenge", history), "player1")).toBe("Sacrifice or reward: none this turn.");
    const later = [...history, challengeBeat(), challengeBeat()];
    expect(sacrificeRewardLine(chapterStep("challenge", later), "player1")).toBe(
      "Sacrifice or reward: one fits this turn if a stat allows it (the last one offered was a reward, 3 turns ago; prefer a sacrifice)."
    );
  });
});

/*
 * Option variety with fewer rewards (the options-o2c stage of 2026-10-01,
 * measured as the eval's turnO2c and adopted): B6's three ways carry O2b's stat
 * lines and the risk-only weak example, and a single player's lever line is the
 * one the game computes: a reward only on the chapter's first step, where the
 * player's previous chapter offered none and a stat allows one; elsewhere no
 * reward, and a sacrifice on B6's rate, a second in a chapter only for a strong
 * reason in the option's text.
 */
describe("the adopted O2c lines (options-o2c, 2026-10-01)", () => {
  const NERVE = stat("player1_nerve", { name: "Nerve", optionsToSacrifice: "Spend 10% Nerve to push through", optionsToGainAsReward: "Regain 10% Nerve by stopping to catch your breath" });

  /** A challenge chapter of `duration` steps from history index `first`, after these earlier phases, with a stat that allows levers. */
  function withHistory(history: Beat[], first = 1, earlier: ThreadAnalysis[] = [], duration = 3): Story {
    const done = history.length - first;
    const analysis = threadAnalysis("challenge", duration, first);
    const chapter: ThreadAnalysis = {
      ...analysis,
      threads: analysis.threads.map((t) => ({ ...t, outcomeId: GUILD, progression: t.progression.map((step, i) => ({ ...step, resolution: i < done ? ("favorable" as const) : null })) })),
    };
    const phases = first === 1 ? [topicSwitch([["Petition", GUILD]], 0), chapter] : [topicSwitch([["Petition", GUILD]], 0), ...earlier, topicSwitch([["Petition", GUILD]], first - 1), chapter];
    const story = roundStory({ turns: history.length, maxTurns: 20, playerOutcomes: OUTCOMES, phases });
    const state = story.getState();
    return Story.create({ ...state, playerStats: [NERVE], players: { player1: { ...state.players.player1, beatHistory: history } } });
  }
  const offered = (levers: BeatOption["resourceType"][], choice = 1): Beat => ({ ...challengeBeat(levers), choice });

  it("B6's three ways carry O2b's stat lines after the third way and the risk-only weak example after B6's, word for word as measured", () => {
    expect(THREE_WAYS).toContain(`${OPTIONS_O2C_TEXT.thirdWay}${OPTIONS_CONTINUITY_TEXT.o2Stats}\n${OPTIONS_CONTINUITY_TEXT.o2NegativeBase}\n`);
    expect(THREE_WAYS).toContain(`${OPTIONS_O2C_TEXT.weakOneApproach}${OPTIONS_CONTINUITY_TEXT.riskOnlyWeak}\n--- Good: `);
  });

  it("places the reward turn as the measured variant does: a chapter's first step after a chapter that offered no reward, where a stat allows one", () => {
    const earlier = [endedChapter("player1_enclave", 2, 1, "The enclave listens")];
    const cases: [string, Story, boolean][] = [
      ["the story's first chapter, its first step", withHistory([switchBeat()]), true],
      ["its second step", withHistory([switchBeat(), challengeBeat()]), false],
      ["the next chapter after one that offered only a sacrifice", withHistory([switchBeat(), offered(["sacrifice"]), offered([]), switchBeat()], 4, earlier), true],
      ["the next chapter after one that offered a reward, not taken", withHistory([switchBeat(), offered(["reward"]), offered([]), switchBeat()], 4, earlier), false],
      ["no stat that allows a reward", Story.create({ ...withHistory([switchBeat()]).getState(), playerStats: [] }), false],
      ["a group's chapter step", threadBeat(2), false],
    ];
    for (const [label, story, expected] of cases) {
      expect({ label, turn: rewardTurn(story, "player1") }).toEqual({ label, turn: expected });
      expect({ label, same: rewardTurn(story, "player1") === o2cRewardTurn(story, "player1") }).toEqual({ label, same: true });
    }
  });

  it("words the line as the measured variant does: the reward turn's, a sacrifice that fits, a second only for a strong reason, or none", () => {
    const stories = [
      withHistory([switchBeat()]),
      withHistory([switchBeat(), challengeBeat()]),
      withHistory([switchBeat(), challengeBeat(["sacrifice"]), challengeBeat(), challengeBeat()], 1, [], 4),
      withHistory([switchBeat(), challengeBeat(["sacrifice"])]),
    ];
    expect(stories.map((s) => optionLeverLine(s, "player1"))).toEqual([
      "Sacrifice or reward: offer a reward this turn if a stat allows one. No sacrifice this turn.",
      "Sacrifice or reward: a sacrifice fits this turn if a stat allows it. No reward this turn.",
      "Sacrifice or reward: this thread already offered a sacrifice, which the player took, so offer another sacrifice only if the scene gives a strong reason for it, and make that reason clear in the option's text. No reward this turn.",
      "Sacrifice or reward: none this turn.",
    ]);
    for (const story of stories) expect(optionLeverLine(story, "player1")).toBe(o2cLeverLine(story, "player1"));
  });
});

/*
 * The owner's option rules for a group's rolled players (the group-options
 * stage, decision A of the evening of 2026-10-01, measured as the eval's
 * groupOptions and adopted): each rolled player's line computed per player and
 * chapter as a single player's is (the reward turn the game places, a
 * sacrifice on B6's rate, a second only for a strong reason, none), none where
 * the step discards the player's roll, O2b's stat lines for their options,
 * and the plan's lever question asked from those lines.
 */
describe("the adopted group-options lines (group-options, 2026-10-01)", () => {
  const NERVE = stat("player_nerve", { name: "Nerve", optionsToSacrifice: "Spend 10% Nerve to push through", optionsToGainAsReward: "Regain 10% Nerve by stopping to catch your breath" });
  const slots = (n: number) => slotsOf(n);

  /** A group chapter (every player in one challenge thread on `outcomeId`, `duration` steps) from history index `first`, with a stat that allows levers. */
  function groupChapter(histories: Beat[][], first: number, duration = 3, outcomeId = "shared_goal", own: Record<string, string> = {}): Story {
    const players = slots(histories.length);
    const turns = histories[0].length;
    const analysis = threadAnalysis("challenge", duration, first, players);
    const chapter: ThreadAnalysis = {
      ...analysis,
      threads: analysis.threads.map((t) => ({ ...t, outcomeId, progression: t.progression.map((step, i) => ({ ...step, resolution: i < turns - first ? ("favorable" as const) : null })) })),
    };
    const phases =
      first === 1 ? [switchAnalysis(players, 0), chapter] : [switchAnalysis(players, 0), endedChapter("shared_goal", first - 2, 1, "Done", players), switchAnalysis(players, first - 1), chapter];
    const playerOutcomes = Object.fromEntries(Object.entries(own).map(([slot, id]) => [slot, [outcome(id)]]));
    const story = roundStory({ players: players.length, turns, maxTurns: 20, phases, sharedOutcomes: [outcome("shared_goal")], playerOutcomes });
    const state = story.getState();
    return Story.create({ ...state, playerStats: [NERVE], players: Object.fromEntries(players.map((slot, i) => [slot, { ...state.players[slot], beatHistory: histories[i] }])) });
  }
  const offered = (levers: BeatOption["resourceType"][], choice = 1): Beat => ({ ...challengeBeat(levers), choice });

  const STORIES: [string, Story][] = [
    ["the story's first chapter, its first step", groupChapter([[switchBeat()], [switchBeat()]], 1)],
    ["its second step", groupChapter([[switchBeat(), challengeBeat()], [switchBeat(), challengeBeat()]], 1)],
    ["after a lever", groupChapter([[switchBeat(), offered(["sacrifice"])], [switchBeat(), offered(["reward"])]], 1)],
    ["a four-step chapter's last step after a first-step sacrifice, taken", groupChapter([0, 1].map(() => [switchBeat(), offered(["normal", "sacrifice"]), challengeBeat(), challengeBeat()]), 1, 4)],
    [
      "the next chapter after one that offered player1 a reward",
      groupChapter(
        [
          [switchBeat(), offered(["reward"]), offered([]), switchBeat()],
          [switchBeat(), offered([]), offered([]), switchBeat()],
        ],
        4
      ),
    ],
    ["a chapter on player2's own outcome", groupChapter([[switchBeat()], [switchBeat()]], 1, 3, "player2_own", { player2: "player2_own" })],
    ["a group's mixed step", mixedGroupStep(3)],
  ];

  it("computes each rolled player's line as the measured variant does: the reward turn, a sacrifice that fits, a second only for a strong reason, none, and none for a discarded roll", () => {
    for (const [label, story] of STORIES) {
      for (const slot of groupLeverSlots(story)) {
        expect({ label, slot, line: groupLeverLine(story, slot) }).toEqual({ label, slot, line: groupOptionsLine(story, slot) });
        expect({ label, slot, turn: groupRewardTurn(story, slot) }).toEqual({ label, slot, turn: groupOptionsRewardTurn(story, slot) });
        expect({ label, slot, rule: groupLeverRule(story, slot) }).toEqual({ label, slot, rule: groupOptionsRule(story, slot) });
      }
    }
    const lines = (story: Story) => groupLeverSlots(story).map((slot) => groupLeverLine(story, slot).replace("Sacrifice or reward: ", ""));
    expect(lines(STORIES[0][1])).toEqual(["offer a reward this turn if a stat allows one. No sacrifice this turn.", "offer a reward this turn if a stat allows one. No sacrifice this turn."]);
    expect(lines(STORIES[3][1])[0]).toMatch(/^this thread already offered a sacrifice, which the player took, so offer another sacrifice only if the scene gives a strong reason/);
    expect(lines(STORIES[4][1])).toEqual(["none this turn.", "offer a reward this turn if a stat allows one. No sacrifice this turn."]);
    expect(lines(STORIES[5][1])).toEqual(["none this turn.", "offer a reward this turn if a stat allows one. No sacrifice this turn."]);
  });

  it("prints the measured texts: O2b's stat lines for a group's rolled players, and the plan's lever question from the lines", () => {
    expect(`${GROUP_OPTION_VARIETY}\n`).toBe(GROUP_OPTIONS_TEXT.variety);
    expect(GROUP_LEVER_QUESTION).toBe(GROUP_OPTIONS_TEXT.leverQuestion);
    expect(GROUP_OPTION_VARIETY).toContain(OPTIONS_CONTINUITY_TEXT.o2NegativeBase);
    expect(GROUP_OPTION_VARIETY).toContain(OPTIONS_CONTINUITY_TEXT.riskOnlyWeak);
  });

  it("keeps a single player's line as it was (the strong-reason clause is shared)", () => {
    expect(optionLeverLine(threadBeat(1), "player1")).toBe(o2cLeverLine(threadBeat(1), "player1"));
    expect(groupRewardTurn(threadBeat(1), "player1")).toBe(false);
  });
});
