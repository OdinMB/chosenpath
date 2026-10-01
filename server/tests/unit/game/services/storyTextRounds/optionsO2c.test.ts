import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { Story } from "core/models/Story.js";
import type { Beat, BeatOption, Stat, StoryPhase, ThreadAnalysis } from "core/types/index.js";
import { beatStep } from "../../../../../src/game/services/storyTextSteps.js";
import { sacrificeRewardLine } from "../../../../../src/game/services/optionRules.js";
import { OPTIONS_CONTINUITY_TEXT } from "../../../../../src/game/services/storyTextRounds/turnOptionsContinuity.js";
import {
  OPTIONS_O2C_TEXT,
  o2cLeverLine,
  o2cLeverRule,
  o2cRewardTurn,
  optionsO2cBase,
  optionsO2cRequest,
} from "../../../../../src/game/services/storyTextRounds/optionsO2c.js";
import { evalFiles } from "../../../../../src/evals/textModelEval/evalFiles.js";
import { OPTIONS_O2_CASES, stagePlansCase } from "../../../../../src/evals/textModelEval/arms.js";
import { caseStory } from "../../../../../src/evals/textModelEval/cases.js";
import { callLimitsOf, requestFor, requestText } from "../../../../../src/evals/textModelEval/variants.js";
import { endingBeat, firstSwitchBeat, laterSwitchBeat, threadBeat } from "../../../../helpers/promptStories.js";
import { endedChapter, outcome, roundStory, topicSwitch } from "../../../../helpers/roundStories.js";
import { beatGeneration, challengeOptions, stat, threadAnalysis, type ThreadKind } from "../../../../helpers/textFixtures.js";

/*
 * Option variety with fewer rewards (O2c, the owner's feedback of 2026-10-01 on
 * O2b: "14 reward options in 32 choice sets is a bit too much"): O2b's stat
 * lines (options draw on different stats, no risk-only sets, the strength option
 * keeps its negative base) on production's single-player turn, and a lever line
 * whose reward the game places: on a chapter's first step only, where the
 * player's previous chapter offered none and a stat allows one, so at most one
 * a chapter and about one chapter in two or three; sacrifices on today's rate,
 * a second one in a chapter only for a strong reason in the option's text.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));
const occurrences = (text: string, passage: string) => text.split(passage).length - 1;

const CASES_DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const frozen = (fs.existsSync(path.join(CASES_DIR, "cases", "cases.json")) ? evalFiles(CASES_DIR).readCases() : []).filter((c) => stagePlansCase("options-o2c", c.id));

const GUILD = "player1_guild_reform";
const ENCLAVE = "player1_enclave_trust";
const OUTCOMES = { player1: [outcome(GUILD, { milestones: ["Sir Bram listened"] }), outcome(ENCLAVE)] };
const DIRECTIONS: [string, string][] = [
  ["Petition the Guild", GUILD],
  ["Win over the enclave", ENCLAVE],
  ["Print the pamphlet", GUILD],
];

/** A stat whose rules allow a sacrifice and a reward, and one that allows only a sacrifice. */
const NERVE = stat("player1_nerve", { name: "Nerve", optionsToSacrifice: "Spend 10% Nerve to push through", optionsToGainAsReward: "Regain 10% Nerve by stopping to catch your breath" });
const COIN = stat("player1_coin", { name: "Coin", optionsToSacrifice: "Spend 5 Coin on a bribe", optionsToGainAsReward: "None" });

/** A challenge beat of the player's history with these levers among its options, the first option chosen. */
function challengeBeat(levers: BeatOption["resourceType"][] = [], choice = 0): Beat {
  const options = challengeOptions().map((o, i) => ({ ...o, resourceType: levers[i] ?? "normal" }));
  return { ...beatGeneration({ options }), choice, resolution: "favorable" };
}
const switchBeat = (): Beat => ({ ...beatGeneration(), choice: 0, resolution: null });

/**
 * A chapter of `duration` steps of this kind from history index `first`, as far as the history goes, with the
 * earlier phases before its own switch, and these player stats.
 */
function withHistory(history: Beat[], first = 1, earlier: StoryPhase[] = [], duration = 3, stats: Stat[] = [NERVE], kind: ThreadKind = "challenge"): Story {
  const done = history.length - first;
  const analysis = threadAnalysis(kind, duration, first);
  const chapter: ThreadAnalysis = {
    ...analysis,
    threads: analysis.threads.map((t) => ({
      ...t,
      outcomeId: GUILD,
      progression: t.progression.map((step, i) => ({ ...step, resolution: i < done ? (kind === "exploration" ? ("resolution1" as const) : ("favorable" as const)) : null })),
    })),
  };
  const phases = first === 1 ? [topicSwitch(DIRECTIONS, 0), chapter] : [topicSwitch(DIRECTIONS, 0), ...earlier, topicSwitch(DIRECTIONS, first - 1), chapter];
  const story = roundStory({ turns: history.length, maxTurns: 20, playerOutcomes: OUTCOMES, phases });
  const state = story.getState();
  return Story.create({ ...state, playerStats: stats, players: { player1: { ...state.players.player1, beatHistory: history } } });
}

/** The story's first chapter (history 1-2) ended, and the second chapter's first step; `levers` on the first chapter's two steps. */
function secondChapterFirstStep(levers: [BeatOption["resourceType"][], BeatOption["resourceType"][]], stats: Stat[] = [NERVE]): Story {
  const history = [switchBeat(), challengeBeat(levers[0], 1), challengeBeat(levers[1], 1), switchBeat()];
  return withHistory(history, 4, [endedChapter(ENCLAVE, 2, 1, "The enclave listens")], 3, stats);
}

const firstTurn = () => roundStory({ turns: 0, maxTurns: 20, playerOutcomes: OUTCOMES, phases: [topicSwitch(DIRECTIONS, 0)] });
const switchAfterChapter = () =>
  roundStory({ turns: 5, maxTurns: 20, playerOutcomes: OUTCOMES, phases: [topicSwitch(DIRECTIONS, 0), endedChapter(GUILD, 4, 1, "The Guild hears the petition"), topicSwitch(DIRECTIONS, 5)] });

const THIRD_WAY = "--- one costs or risks something the others don't (a sacrifice, a chased reward, a relationship put on the line), or serves a different stake of the character's.\n";
const WEAK_ONE_APPROACH = '--- Weak: "Use your speech skill to…" / "Use your charm to…" / "Use your knowledge of law to…" (one approach three times)\n';

/** O2c's request with its edits undone: production's request, if O2c changed nothing else. */
const withoutO2c = (story: Story, prompt: string) =>
  prompt
    .replace(`${THIRD_WAY}${OPTIONS_CONTINUITY_TEXT.o2Stats}\n${OPTIONS_CONTINUITY_TEXT.o2NegativeBase}\n`, THIRD_WAY)
    .replace(`${WEAK_ONE_APPROACH}${OPTIONS_CONTINUITY_TEXT.riskOnlyWeak}\n`, WEAK_ONE_APPROACH)
    .replace(`--- ${o2cLeverLine(story, "player1")}\n`, `--- ${sacrificeRewardLine(story, "player1")}\n`);

describe("the reward turn: the game places a chapter's one reward", () => {
  it("is a chapter's first step, where the player's previous chapter offered no reward and a stat allows one", () => {
    // The story's first chapter: no chapter before it
    expect(o2cRewardTurn(withHistory([switchBeat()]), "player1")).toBe(true);
    // The second chapter after one that offered only sacrifices (today's rate gives none there: a lever two turns back)
    const afterSacrifices = secondChapterFirstStep([["normal", "sacrifice"], []]);
    expect(sacrificeRewardLine(afterSacrifices, "player1")).toBe("Sacrifice or reward: none this turn.");
    expect(o2cRewardTurn(afterSacrifices, "player1")).toBe(true);
    // A reward two chapters back, none in the chapter just before
    const history = [switchBeat(), challengeBeat(["reward"]), challengeBeat(), switchBeat(), challengeBeat(), challengeBeat(), switchBeat()];
    const earlier = [endedChapter(ENCLAVE, 2, 1, "The enclave listens"), topicSwitch(DIRECTIONS, 3), endedChapter(GUILD, 2, 4, "The Guild listens")];
    expect(o2cRewardTurn(withHistory(history, 7, earlier), "player1")).toBe(true);
  });

  it("never where the previous chapter offered a reward, chosen or not: rewards come about one chapter in two or three", () => {
    expect(o2cRewardTurn(secondChapterFirstStep([["normal", "normal", "reward"], []]), "player1")).toBe(false);
    expect(o2cRewardTurn(secondChapterFirstStep([[], ["reward"]]), "player1")).toBe(false);
  });

  it("never on a chapter's later steps, so never twice a chapter", () => {
    expect(o2cRewardTurn(withHistory([switchBeat(), challengeBeat()]), "player1")).toBe(false);
    expect(o2cRewardTurn(withHistory([switchBeat(), challengeBeat(), challengeBeat()]), "player1")).toBe(false);
    expect(o2cRewardTurn(withHistory([switchBeat(), challengeBeat(["reward"]), challengeBeat(), challengeBeat()], 1, [], 4), "player1")).toBe(false);
  });

  it("never where no stat allows a reward", () => {
    expect(o2cRewardTurn(withHistory([switchBeat()], 1, [], 3, [COIN]), "player1")).toBe(false);
    expect(o2cRewardTurn(withHistory([switchBeat()], 1, [], 3, []), "player1")).toBe(false);
  });

  it("never on a turn whose options aren't rolled: an exploration chapter, a switch, the ending, a group's turn", () => {
    expect(o2cRewardTurn(withHistory([switchBeat()], 1, [], 3, [NERVE], "exploration"), "player1")).toBe(false);
    for (const story of [firstTurn(), switchAfterChapter(), endingBeat(1), threadBeat(2)]) expect(o2cRewardTurn(story, "player1")).toBe(false);
  });
});

describe("o2cLeverRule and o2cLeverLine: the reward where the game places it, sacrifices on today's rate", () => {
  it("on the reward turn a reward and no sacrifice, whatever today's rate says", () => {
    for (const story of [withHistory([switchBeat()]), secondChapterFirstStep([["normal", "sacrifice"], []])]) {
      expect(o2cLeverRule(story, "player1")).toEqual({ reward: true, sacrifice: "none" });
      expect(o2cLeverLine(story, "player1")).toBe("Sacrifice or reward: offer a reward this turn if a stat allows one. No sacrifice this turn.");
    }
  });

  it("elsewhere no reward, and a sacrifice where today's rate fits", () => {
    // The chapter's second step, nothing offered at its first (the reward turn declined): today's rate fits
    const declined = withHistory([switchBeat(), challengeBeat()]);
    expect(sacrificeRewardLine(declined, "player1")).toBe("Sacrifice or reward: one fits this turn if a stat allows it.");
    expect(o2cLeverRule(declined, "player1")).toEqual({ reward: false, sacrifice: "fits" });
    expect(o2cLeverLine(declined, "player1")).toBe("Sacrifice or reward: a sacrifice fits this turn if a stat allows it. No reward this turn.");
    // A first step where no stat allows a reward: no reward turn, today's rate fits
    const noReward = withHistory([switchBeat()], 1, [], 3, [COIN]);
    expect(o2cLeverLine(noReward, "player1")).toBe("Sacrifice or reward: a sacrifice fits this turn if a stat allows it. No reward this turn.");
    // A four-step chapter's last step after a reward at its first: today's rate fits again, no second reward
    const afterReward = withHistory([switchBeat(), challengeBeat(["reward"]), challengeBeat(), challengeBeat()], 1, [], 4);
    expect(o2cLeverRule(afterReward, "player1")).toEqual({ reward: false, sacrifice: "fits" });
  });

  it("today's 'none this turn' where today's rate gives none and it isn't the reward turn", () => {
    for (const story of [
      withHistory([switchBeat(), challengeBeat(["reward"])]),
      withHistory([switchBeat(), challengeBeat(["reward"]), challengeBeat()]),
      withHistory([switchBeat(), challengeBeat(["sacrifice"])]),
      withHistory([switchBeat(), challengeBeat(["normal", "sacrifice"], 0), challengeBeat()]),
    ]) {
      expect(sacrificeRewardLine(story, "player1")).toBe("Sacrifice or reward: none this turn.");
      expect(o2cLeverRule(story, "player1")).toEqual({ reward: false, sacrifice: "none" });
      expect(o2cLeverLine(story, "player1")).toBe("Sacrifice or reward: none this turn.");
    }
  });

  it("a second sacrifice in a chapter, where today's rate allows one, only for a strong reason stated in the option's text", () => {
    // The owner: "Several sacrifices can sometimes make sense, but should have a strong justification starting at the second one"
    const taken = withHistory([switchBeat(), challengeBeat(["sacrifice"]), challengeBeat(), challengeBeat()], 1, [], 4);
    expect(sacrificeRewardLine(taken, "player1")).toMatch(/one fits this turn/);
    expect(o2cLeverRule(taken, "player1")).toEqual({ reward: false, sacrifice: "strongReason" });
    expect(o2cLeverLine(taken, "player1")).toBe(
      "Sacrifice or reward: this thread already offered a sacrifice, which the player took, so offer another sacrifice only if the scene gives a strong reason for it, and make that reason clear in the option's text. No reward this turn."
    );
    const declined = withHistory([switchBeat(), challengeBeat(["sacrifice"], 1), challengeBeat(), challengeBeat()], 1, [], 4);
    expect(o2cLeverLine(declined, "player1")).toBe(
      "Sacrifice or reward: this thread already offered a sacrifice, which the player didn't take, so offer another sacrifice only if the scene gives a strong reason for it, and make that reason clear in the option's text. No reward this turn."
    );
    for (const story of [taken, declined]) expect(o2cLeverLine(story, "player1")).not.toMatch(/again/);
  });

  it("puts every form in the lever line's own words", () => {
    expect(OPTIONS_O2C_TEXT.rewardTurn).toBe("Sacrifice or reward: offer a reward this turn if a stat allows one. No sacrifice this turn.");
    expect(OPTIONS_O2C_TEXT.sacrificeFits).toBe("Sacrifice or reward: a sacrifice fits this turn if a stat allows it. No reward this turn.");
  });
});

const SINGLE_PLAYER: [string, () => Story][] = [
  ["the first turn", () => firstSwitchBeat(1)],
  ["a later switch", () => laterSwitchBeat(1)],
  ["a switch after a chapter", switchAfterChapter],
  ["a challenge step", () => threadBeat(1)],
  ["a chapter's first step, the reward turn", () => withHistory([switchBeat()])],
  ["a chapter's middle step", () => withHistory([switchBeat(), challengeBeat()])],
  ["a chapter's last step", () => withHistory([switchBeat(), challengeBeat(["sacrifice"]), challengeBeat()])],
  ["an exploration step", () => withHistory([switchBeat(), challengeBeat()], 1, [], 3, [NERVE], "exploration")],
  ["the ending", () => endingBeat(1)],
];

describe("the request: production's single-player turn with O2b's stat lines and O2c's lever line on rolled steps", () => {
  it.each(SINGLE_PLAYER)("%s: the base is production's request byte for byte", (_, build) => {
    const story = build();
    const [base, production] = [optionsO2cBase(story), beatStep.request(story)];
    expect(base.prompt).toBe(production.prompt);
    expect(json(base.schema)).toBe(json(production.schema));
  });

  it.each([
    ["a chapter's first step, the reward turn", () => withHistory([switchBeat()])],
    ["the second chapter's first step after a sacrifice", () => secondChapterFirstStep([["normal", "sacrifice"], []])],
    ["a chapter's middle step", () => withHistory([switchBeat(), challengeBeat()])],
    ["a step after a sacrifice", () => withHistory([switchBeat(), challengeBeat(["sacrifice"])])],
    ["a four-step chapter's last step after a sacrifice", () => withHistory([switchBeat(), challengeBeat(["sacrifice"]), challengeBeat(), challengeBeat()], 1, [], 4)],
  ] as const)("%s: O2b's two stat lines after B6's third way, its risk-only weak example, O2c's lever line, and nothing else", (_, build) => {
    const story = build();
    const { prompt, schema } = optionsO2cRequest(story);
    const base = optionsO2cBase(story);
    expect(occurrences(prompt, OPTIONS_CONTINUITY_TEXT.o2Stats)).toBe(1);
    expect(occurrences(prompt, OPTIONS_CONTINUITY_TEXT.o2NegativeBase)).toBe(1);
    expect(occurrences(prompt, OPTIONS_CONTINUITY_TEXT.riskOnlyWeak)).toBe(1);
    expect(prompt).toContain(`${THIRD_WAY}${OPTIONS_CONTINUITY_TEXT.o2Stats}\n${OPTIONS_CONTINUITY_TEXT.o2NegativeBase}\n--- Weak: "Use your speech skill to`);
    expect(prompt).toContain(`${WEAK_ONE_APPROACH}${OPTIONS_CONTINUITY_TEXT.riskOnlyWeak}\n--- Good: `);
    expect(prompt).toContain(`--- ${o2cLeverLine(story, "player1")}\n--- Don't offer to sacrifice a stat that was already sacrificed in this thread`);
    expect(occurrences(prompt, "Sacrifice or reward: ")).toBe(1);
    expect(withoutO2c(story, prompt)).toBe(base.prompt);
    expect(json(schema)).toBe(json(base.schema));
  });

  it.each([
    ["the first turn", () => firstSwitchBeat(1)],
    ["a switch after a chapter", switchAfterChapter],
    ["an exploration step", () => withHistory([switchBeat(), challengeBeat()], 1, [], 3, [NERVE], "exploration")],
    ["the ending", () => endingBeat(1)],
  ] as const)("%s: no rolled options, so the base exactly", (_, build) => {
    const story = build();
    expect(optionsO2cRequest(story).prompt).toBe(optionsO2cBase(story).prompt);
    expect(json(optionsO2cRequest(story).schema)).toBe(json(optionsO2cBase(story).schema));
  });

  it("is single-player: group turns stay on production's group form", () => {
    expect(() => optionsO2cRequest(threadBeat(2))).toThrow(/single-player/);
  });

  (frozen.length ? it : it.skip)("the 44 stored single-player turns the options stages ran on: the edits on exactly their 32 rolled chapter steps, production's request elsewhere", () => {
    const cases = frozen.filter((c) => stagePlansCase("options-o2", c.id) && c.role === "beat" && !c.tags.multiplayer && c.tags.source !== "round");
    expect(cases.length).toBeGreaterThan(40);
    const edited: string[] = [];
    for (const c of cases) {
      const story = caseStory(c);
      const { prompt } = optionsO2cRequest(story);
      const base = optionsO2cBase(story).prompt;
      expect({ id: c.id, undone: withoutO2c(story, prompt) === base }).toEqual({ id: c.id, undone: true });
      if (prompt !== base) {
        edited.push(c.id);
        expect({ id: c.id, lines: occurrences(prompt, "Sacrifice or reward: ") }).toEqual({ id: c.id, lines: 1 });
      }
    }
    expect([...edited].sort()).toEqual([...OPTIONS_O2_CASES].sort());
  });

  (frozen.length ? it : it.skip)("on the 32 stored rolled steps: the reward turn on the five chapter first steps, today's 'none' kept on the 21 its rate holds", () => {
    const byId = new Map(frozen.map((c) => [c.id, c]));
    const rewardTurns = OPTIONS_O2_CASES.filter((id) => o2cRewardTurn(caseStory(byId.get(id)!), "player1"));
    expect([...rewardTurns].sort()).toEqual(["cont-8988006e-t5-o0", "cont-8988006e-t5-o1", "cont-8988006e-t5-o2", "cont-checkpoi-t1-o0", "cont-checkpoi-t1-o1"]);
    const differs = OPTIONS_O2_CASES.filter((id) => {
      const story = caseStory(byId.get(id)!);
      return o2cLeverLine(story, "player1") !== sacrificeRewardLine(story, "player1");
    });
    // The reward turns, the café story whose rate fits after a lever-free first step, and the played step typed as exploration
    expect(differs).toHaveLength(11);
    expect(differs.filter((id) => id.startsWith("cont-2ee343b6-t2") || id.startsWith("cont-7492b211-t2"))).toHaveLength(6);
  });
});

describe("the eval's variant", () => {
  it("turnO2c builds O2c's request with production's single-player turn limits; turns only", () => {
    const story = withHistory([switchBeat()]);
    const request = requestFor("turnO2c", { role: "beat", story });
    expect(requestText(request)).toBe(optionsO2cRequest(story).prompt);
    expect(json(request.schema)).toBe(json(optionsO2cRequest(story).schema));
    expect(callLimitsOf(request)).toEqual(callLimitsOf(requestFor("adopted", { role: "beat", story })));
    expect(callLimitsOf(request)).toBeDefined();
    expect(() => requestFor("turnO2c", { role: "switch", story })).toThrow(/does not cover role switch/);
  });
});
