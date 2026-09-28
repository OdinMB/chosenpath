import { describe, expect, it } from "@jest/globals";
import { Story } from "core/models/Story.js";
import type { Beat, BeatOption, ThreadAnalysis } from "core/types/index.js";
import { sacrificeRewardLine, takesOptionRules } from "../../../../src/game/services/optionRules.js";
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
