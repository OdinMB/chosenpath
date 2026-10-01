import { describe, expect, it } from "@jest/globals";
import { Story } from "core/models/Story.js";
import type { Beat, BeatOption, ThreadAnalysis } from "core/types/index.js";
import {
  GROUP_SHARED_AND_OWN,
  NO_DOUBLE_SACRIFICE,
  groupLeverSlots,
  groupSacrificeRewardLines,
  sacrificeRewardLine,
  takesGroupLeverRules,
  takesOptionRules,
} from "../../../../src/game/services/optionRules.js";
import { endingBeat, firstSwitchBeat, laterSwitchBeat, threadBeat } from "../../../helpers/promptStories.js";
import { outcome, roundStory, topicSwitch } from "../../../helpers/roundStories.js";
import { beatGeneration, challengeOptions, threadAnalysis, type ThreadKind } from "../../../helpers/textFixtures.js";

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
    const story = mixedGroupStep(3);
    expect(groupSacrificeRewardLines(story)).toBe(
      "--- Sacrifice or reward, for each player in a Challenge or Contest thread (each player's own options):\n" +
        "----- player2 (Test Player 2): one fits this turn if a stat allows it.\n" +
        "----- player3 (Test Player 3): one fits this turn if a stat allows it.\n" +
        `--- ${GROUP_SHARED_AND_OWN}\n--- ${NO_DOUBLE_SACRIFICE}\n`
    );
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

  it("fits again two challenge turns after a lever, naming how long ago it was offered", () => {
    const history = [challengeBeat(), challengeBeat(), challengeBeat(["reward"])];
    // The last two challenge turns include the reward, so none fits; one more challenge turn later it fits again
    expect(sacrificeRewardLine(chapterStep("challenge", history), "player1")).toBe("Sacrifice or reward: none this turn.");
    const later = [...history, challengeBeat(), challengeBeat()];
    expect(sacrificeRewardLine(chapterStep("challenge", later), "player1")).toBe(
      "Sacrifice or reward: one fits this turn if a stat allows it (the last one offered was a reward, 3 turns ago; prefer a sacrifice)."
    );
  });
});
