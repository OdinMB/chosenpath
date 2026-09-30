import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { Story } from "core/models/Story.js";
import type { Beat, BeatOption, ThreadAnalysis } from "core/types/index.js";
import { beatStep } from "../../../../../src/game/services/storyTextSteps.js";
import { sacrificeRewardLine } from "../../../../../src/game/services/storyTextRounds/turnRound2.js";
import {
  OPTIONS_CONTINUITY_TEXT,
  chapterLeverLine,
  chapterLeverRule,
  chapterLevers,
  optionsContinuityRequest,
  previousBeatBlock,
  productionTurnForm,
} from "../../../../../src/game/services/storyTextRounds/turnOptionsContinuity.js";
import { evalFiles } from "../../../../../src/evals/textModelEval/evalFiles.js";
import { caseStory } from "../../../../../src/evals/textModelEval/cases.js";
import { callLimitsOf, requestFor, requestText } from "../../../../../src/evals/textModelEval/variants.js";
import { endingBeat, firstSwitchBeat, laterSwitchBeat, threadBeat } from "../../../../helpers/promptStories.js";
import { endedChapter, outcome, roundStory, topicSwitch } from "../../../../helpers/roundStories.js";
import { beatGeneration, challengeOptions, threadAnalysis, type ThreadKind } from "../../../../helpers/textFixtures.js";

/*
 * The owner's feedback of 2026-09-30 on options and continuity, as three eval
 * arms on production's single-player turn form (the adopted form: today's
 * form with the option rules, B6, on rolled chapter steps, and no chapter
 * rules on a switch turn): arm O (each option leans on a different strength,
 * risk alone tells none apart, and the game's lever line counted per chapter),
 * arm C (the switch's full text on a chapter's first step, and one instruction
 * to pick up where the previous beat ended and move the story forward), and
 * both. Built from the frozen round0 copy and turn round 2's B6, so no later
 * production change moves them; the base is production's request byte for byte.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));
const occurrences = (text: string, passage: string) => text.split(passage).length - 1;

const CASES_DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const frozen = fs.existsSync(path.join(CASES_DIR, "cases", "cases.json")) ? evalFiles(CASES_DIR).readCases() : [];

const GUILD = "player1_guild_reform";
const ENCLAVE = "player1_enclave_trust";
const OUTCOMES = { player1: [outcome(GUILD, { milestones: ["Sir Bram listened"] }), outcome(ENCLAVE)] };
const DIRECTIONS: [string, string][] = [
  ["Petition the Guild", GUILD],
  ["Win over the enclave", ENCLAVE],
  ["Print the pamphlet", GUILD],
];

const SWITCH_TEXT = "The bell over the print shop rings twice.\n\nGruk leans on the counter. 'Sir Bram wants the pamphlet by dusk,' he says.";

function chapterStep(kind: ThreadKind, done: number, duration = 3): Story {
  const analysis = threadAnalysis(kind, duration, 1);
  const chapter: ThreadAnalysis = {
    ...analysis,
    threads: analysis.threads.map((t) => ({
      ...t,
      outcomeId: GUILD,
      progression: t.progression.map((step, i) => ({ ...step, resolution: i < done ? (kind === "exploration" ? ("resolution1" as const) : ("favorable" as const)) : null })),
    })),
  };
  const story = roundStory({ turns: 1 + done, maxTurns: 20, playerOutcomes: OUTCOMES, phases: [topicSwitch(DIRECTIONS, 0), chapter] });
  // The switch that opened the chapter, as a player read it
  const state = story.getState();
  const history = state.players.player1.beatHistory.map((beat, i) => (i === 0 ? { ...beat, text: SWITCH_TEXT } : beat));
  return Story.create({ ...state, players: { player1: { ...state.players.player1, beatHistory: history } } });
}

const firstTurn = () => roundStory({ turns: 0, maxTurns: 20, playerOutcomes: OUTCOMES, phases: [topicSwitch(DIRECTIONS, 0)] });
const switchAfterChapter = () =>
  roundStory({ turns: 5, maxTurns: 20, playerOutcomes: OUTCOMES, phases: [topicSwitch(DIRECTIONS, 0), endedChapter(GUILD, 4, 1, "The Guild hears the petition"), topicSwitch(DIRECTIONS, 5)] });

/** A challenge beat of the player's history with these levers among its options, the first option chosen. */
function challengeBeat(levers: BeatOption["resourceType"][] = [], choice = 0): Beat {
  const options = challengeOptions().map((o, i) => ({ ...o, resourceType: levers[i] ?? "normal" }));
  return { ...beatGeneration({ options }), choice, resolution: "favorable" };
}
const switchBeat = (): Beat => ({ ...beatGeneration(), choice: 0, resolution: null });

/** A three-step challenge chapter from history index `first`, as far as the history goes, with this history. */
function withHistory(history: Beat[], first = 1, earlier: ThreadAnalysis[] = []): Story {
  const done = history.length - first;
  const analysis = threadAnalysis("challenge", 4, first);
  const chapter: ThreadAnalysis = {
    ...analysis,
    threads: analysis.threads.map((t) => ({ ...t, outcomeId: GUILD, progression: t.progression.map((step, i) => ({ ...step, resolution: i < done ? ("favorable" as const) : null })) })),
  };
  const phases = first === 1 ? [topicSwitch(DIRECTIONS, 0), chapter] : [topicSwitch(DIRECTIONS, 0), ...earlier, topicSwitch(DIRECTIONS, first - 1), chapter];
  const story = roundStory({ turns: history.length, maxTurns: 20, playerOutcomes: OUTCOMES, phases });
  const state = story.getState();
  return Story.create({ ...state, players: { player1: { ...state.players.player1, beatHistory: history } } });
}

const BASE = { options: false, continuity: false };
const O = { options: true, continuity: false };
const C = { options: false, continuity: true };
const OC = { options: true, continuity: true };

const SINGLE_PLAYER: [string, () => Story][] = [
  ["the first turn", () => firstSwitchBeat(1)],
  ["a later switch", () => laterSwitchBeat(1)],
  ["a switch after a chapter", switchAfterChapter],
  ["a challenge step", () => threadBeat(1)],
  ["a chapter's first step", () => chapterStep("challenge", 0)],
  ["a chapter's middle step", () => chapterStep("challenge", 1)],
  ["a chapter's last step", () => chapterStep("challenge", 2)],
  ["an exploration step", () => chapterStep("exploration", 1)],
  ["an exploration chapter's first step", () => chapterStep("exploration", 0)],
  ["the ending", () => endingBeat(1)],
];

describe("the base: production's single-player turn form, built from the frozen copy", () => {
  it.each(SINGLE_PLAYER)("%s: production's request byte for byte", (_, build) => {
    const story = build();
    const [ours, production] = [productionTurnForm(story), beatStep.request(story)];
    expect(ours.prompt).toBe(production.prompt);
    expect(json(ours.schema)).toBe(json(production.schema));
    expect(optionsContinuityRequest(story, BASE).prompt).toBe(production.prompt);
  });

  (frozen.length ? it : it.skip)("every frozen single-player turn: production's request byte for byte", () => {
    const cases = frozen.filter((c) => c.role === "beat" && !c.tags.multiplayer);
    expect(cases.length).toBeGreaterThan(40);
    for (const c of cases) {
      const story = caseStory(c);
      const [ours, production] = [productionTurnForm(story), beatStep.request(story)];
      expect({ id: c.id, same: ours.prompt === production.prompt }).toEqual({ id: c.id, same: true });
      expect(json(ours.schema)).toBe(json(production.schema));
    }
  });

  it("is single-player: group turns stay on production's group form", () => {
    const group = roundStory({ players: 2, turns: 0, maxTurns: 20, phases: [topicSwitch(DIRECTIONS, 0, ["player1", "player2"])] });
    expect(() => optionsContinuityRequest(group, O)).toThrow(/single-player/);
  });
});

describe("arm O: options that lean on different strengths, and the lever line counted per chapter", () => {
  it.each([
    ["a chapter's first step", () => chapterStep("challenge", 0)],
    ["a chapter's middle step", () => chapterStep("challenge", 1)],
    ["a chapter's last step", () => chapterStep("challenge", 2)],
  ] as const)("%s: the stats line and its weak example once each, inside B6's three ways, and the chapter's lever line", (_, build) => {
    const story = build();
    const { prompt } = optionsContinuityRequest(story, O);
    const base = productionTurnForm(story).prompt;
    expect(occurrences(prompt, OPTIONS_CONTINUITY_TEXT.drawsOnStats)).toBe(1);
    expect(occurrences(prompt, OPTIONS_CONTINUITY_TEXT.riskOnlyWeak)).toBe(1);
    // The stats line sits after the three ways and before B6's weak example
    const at = prompt.indexOf(OPTIONS_CONTINUITY_TEXT.drawsOnStats);
    expect(prompt.indexOf("--- one costs or risks something the others don't")).toBeLessThan(at);
    expect(at).toBeLessThan(prompt.indexOf("--- Weak: \"Use your speech skill to"));
    expect(prompt).toContain(`--- ${chapterLeverLine(story, "player1")}\n`);
    expect(occurrences(prompt, "Sacrifice or reward: ")).toBe(1);
    // Nothing else changes: the base with the two edits undone
    const undone = prompt
      .replace(`${OPTIONS_CONTINUITY_TEXT.drawsOnStats}\n`, "")
      .replace(`${OPTIONS_CONTINUITY_TEXT.riskOnlyWeak}\n`, "")
      .replace(`--- ${chapterLeverLine(story, "player1")}\n`, `--- ${sacrificeRewardLine(story, "player1")}\n`);
    expect(undone).toBe(base);
    expect(json(optionsContinuityRequest(story, O).schema)).toBe(json(productionTurnForm(story).schema));
  });

  it.each([
    ["the first turn", () => firstSwitchBeat(1)],
    ["a switch after a chapter", switchAfterChapter],
    ["an exploration step", () => chapterStep("exploration", 1)],
    ["the ending", () => endingBeat(1)],
  ] as const)("%s: no rolled options, so the base exactly", (_, build) => {
    const story = build();
    expect(optionsContinuityRequest(story, O).prompt).toBe(productionTurnForm(story).prompt);
    expect(json(optionsContinuityRequest(story, O).schema)).toBe(json(productionTurnForm(story).schema));
  });
});

describe("chapterLevers: the sacrifices and rewards this chapter's options offered so far", () => {
  it("counts offered levers (chosen or not) and taken sacrifices in the current chapter only", () => {
    const earlier = endedChapter(ENCLAVE, 2, 1, "The enclave listens");
    const history = [switchBeat(), challengeBeat(["reward"]), challengeBeat(["sacrifice"]), switchBeat(), challengeBeat(["normal", "sacrifice"], 1), challengeBeat(["normal", "normal", "reward"])];
    expect(chapterLevers(withHistory(history, 4, [earlier]), "player1")).toEqual({ rewards: 1, sacrifices: 1, sacrificesTaken: 1 });
    expect(chapterLevers(withHistory([switchBeat(), challengeBeat(["sacrifice"], 1)]), "player1")).toEqual({ rewards: 0, sacrifices: 1, sacrificesTaken: 0 });
    expect(chapterLevers(chapterStep("challenge", 0), "player1")).toEqual({ rewards: 0, sacrifices: 0, sacrificesTaken: 0 });
  });
});

describe("chapterLeverLine: today's rate line, counted per chapter", () => {
  it("is today's line while the chapter has offered no lever, an earlier chapter's levers included", () => {
    const earlier = endedChapter(ENCLAVE, 2, 1, "The enclave listens");
    const stories = [
      withHistory([switchBeat()]),
      withHistory([switchBeat(), challengeBeat()]),
      // A sacrifice in the chapter before: today's line names it and prefers a reward, and so does the chapter's
      withHistory([switchBeat(), challengeBeat(["sacrifice"]), challengeBeat(), switchBeat(), challengeBeat()], 4, [earlier]),
      withHistory([switchBeat(), challengeBeat(), challengeBeat(["sacrifice"]), switchBeat()], 4, [earlier]),
    ];
    for (const story of stories) expect(chapterLeverLine(story, "player1")).toBe(sacrificeRewardLine(story, "player1"));
    expect(chapterLeverLine(stories[2], "player1")).toMatch(/prefer a reward/);
    expect(chapterLeverLine(stories[3], "player1")).toBe("Sacrifice or reward: none this turn.");
  });

  it("offers no second reward in a chapter: a sacrifice fits where today's line fits", () => {
    // A four-step chapter: a reward at step 1, none at steps 2 and 3, so today's line fits again at step 4
    const story = withHistory([switchBeat(), challengeBeat(["reward"]), challengeBeat(), challengeBeat()]);
    expect(sacrificeRewardLine(story, "player1")).toMatch(/one fits this turn/);
    expect(chapterLeverLine(story, "player1")).toBe("Sacrifice or reward: a sacrifice fits this turn if a stat allows it. No reward: this thread already offered one.");
    expect(chapterLeverRule(story, "player1")).toEqual({ reward: false, sacrifice: "fits" });
  });

  it("is never looser than today's line: where it gives none, none, whatever the chapter offered", () => {
    for (const history of [
      [switchBeat(), challengeBeat(["reward"])],
      [switchBeat(), challengeBeat(["sacrifice"])],
      [switchBeat(), challengeBeat(["sacrifice"], 1), challengeBeat()],
    ]) {
      const story = withHistory(history);
      expect(sacrificeRewardLine(story, "player1")).toBe("Sacrifice or reward: none this turn.");
      expect(chapterLeverLine(story, "player1")).toBe("Sacrifice or reward: none this turn.");
      expect(chapterLeverRule(story, "player1")).toEqual({ reward: false, sacrifice: "none" });
    }
  });

  it("from the second sacrifice on, where today's line fits: says one was offered and whether it was taken, and asks for a strong reason in the option's text", () => {
    // A four-step chapter: a sacrifice at step 1, none at steps 2 and 3, so today's line fits again at step 4
    const taken = withHistory([switchBeat(), challengeBeat(["sacrifice"]), challengeBeat(), challengeBeat()]);
    expect(sacrificeRewardLine(taken, "player1")).toMatch(/one fits this turn/);
    expect(chapterLeverLine(taken, "player1")).toBe(
      "Sacrifice or reward: this thread already offered a sacrifice, which the player took, so offer another only if the scene gives a strong reason to pay again, and make that reason clear in the option's text. A reward fits this turn if a stat allows it."
    );
    expect(chapterLeverRule(taken, "player1")).toEqual({ reward: true, sacrifice: "strongReason" });
    const declined = withHistory([switchBeat(), challengeBeat(["sacrifice"], 1), challengeBeat(), challengeBeat()]);
    expect(chapterLeverLine(declined, "player1")).toContain("this thread already offered a sacrifice, which the player didn't take, so offer another only if");
  });

  it("counts every sacrifice the chapter offered, one on options the rate doesn't read included, in words", () => {
    // Played history can hold a chapter step whose options were typed as exploration (gpt-4.1-mini in play): today's
    // rate counts only rolled turns, so it fits; the chapter still offered two sacrifices, the player taking one
    const explorationTyped = (choice: number): Beat => ({
      ...beatGeneration({ options: challengeOptions().map((o, i) => ({ optionType: "exploration" as const, resourceType: i === 1 ? ("sacrifice" as const) : ("normal" as const), text: o.text })) }),
      choice,
      resolution: "favorable",
    });
    const story = withHistory([switchBeat(), explorationTyped(0), explorationTyped(1), challengeBeat()]);
    expect(sacrificeRewardLine(story, "player1")).toMatch(/one fits this turn/);
    expect(chapterLevers(story, "player1")).toEqual({ rewards: 0, sacrifices: 2, sacrificesTaken: 1 });
    expect(chapterLeverLine(story, "player1")).toBe(
      "Sacrifice or reward: this thread already offered two sacrifices, and the player took one of them, so offer another only if the scene gives a strong reason to pay again, and make that reason clear in the option's text. A reward fits this turn if a stat allows it."
    );
  });
});

describe("arm C: the previous beat in full, and one instruction to pick up where it ended and move the story forward", () => {
  it.each([
    ["a switch after a chapter", switchAfterChapter],
    ["a later switch", () => laterSwitchBeat(1)],
    ["a chapter's first step", () => chapterStep("challenge", 0)],
    ["a chapter's middle step", () => chapterStep("challenge", 1)],
    ["an exploration step", () => chapterStep("exploration", 1)],
    ["the ending", () => endingBeat(1)],
  ] as const)("%s: the one instruction replaces the narrow line in the prompt and the text field", (_, build) => {
    const story = build();
    const request = optionsContinuityRequest(story, C);
    const text = `${request.prompt}\n${json(request.schema)}`;
    expect(occurrences(request.prompt, OPTIONS_CONTINUITY_TEXT.pickUp)).toBe(1);
    expect(request.prompt).toContain(`Text\n${OPTIONS_CONTINUITY_TEXT.pickUp}\n- The first paragraph must\n--- describe how the player performs the action`);
    expect(text).not.toContain(OPTIONS_CONTINUITY_TEXT.oldContinue);
    expect(text).not.toContain(OPTIONS_CONTINUITY_TEXT.oldFieldStart);
    // The first paragraph still narrates the choice, and the field still asks for it
    expect(json(request.schema)).toContain("- Describe in detail the action that the player decided to do in the previous beat.");
    // No ban on repeated openings
    expect(text.toLowerCase()).not.toMatch(/repeat(ed)? opening/);
  });

  it("gives a chapter's first step the switch's full text, which no production turn shows, before the current step", () => {
    const story = chapterStep("challenge", 0);
    const production = productionTurnForm(story).prompt;
    expect(production).not.toContain(SWITCH_TEXT);
    const { prompt } = optionsContinuityRequest(story, C);
    const block = previousBeatBlock(story) as string;
    expect(block).toBe(`\n\n${OPTIONS_CONTINUITY_TEXT.previousBeatHeading}\n${SWITCH_TEXT}`);
    expect(occurrences(prompt, SWITCH_TEXT)).toBe(1);
    expect(prompt).toContain(`${block}\n\nCURRENT STEP IN THREAD PROGRESSION: Turn 1/3\n`);
    // The state is production's with the block inserted, and nothing else
    const state = (p: string) => p.slice(p.indexOf("======= CURRENT GAME STATE ======="));
    expect(state(prompt).replace(block, "")).toBe(state(production));
  });

  it.each([
    ["a chapter's middle step (the chapter's beat texts are there)", () => chapterStep("challenge", 1)],
    ["a switch after a chapter (the ended chapter's last beat is there)", switchAfterChapter],
    ["the ending", () => endingBeat(1)],
  ] as const)("%s: the previous beat's text is already in the state, so no block", (_, build) => {
    const story = build();
    expect(previousBeatBlock(story)).toBeUndefined();
    const state = (p: string) => p.slice(p.indexOf("======= CURRENT GAME STATE ======="));
    expect(state(optionsContinuityRequest(story, C).prompt)).toBe(state(productionTurnForm(story).prompt));
    // The previous beat's own text is in the state already
    const previous = story.getCurrentBeat("player1")?.text as string;
    expect(state(productionTurnForm(story).prompt)).toContain(previous);
  });

  it("leaves the first turn as production sends it: there is no previous beat", () => {
    const story = firstTurn();
    expect(optionsContinuityRequest(story, C).prompt).toBe(productionTurnForm(story).prompt);
    expect(json(optionsContinuityRequest(story, C).schema)).toBe(json(productionTurnForm(story).schema));
  });
});

describe("arm OC: both", () => {
  it.each(SINGLE_PLAYER)("%s: arm O's edits on arm C's request", (_, build) => {
    const story = build();
    const both = optionsContinuityRequest(story, OC);
    const [o, c, base] = [optionsContinuityRequest(story, O), optionsContinuityRequest(story, C), productionTurnForm(story)];
    // O changes the instructions only, C the text rule, the field and the state: each part of OC is one arm's
    const instructions = (p: string) => p.slice(0, p.indexOf("======= CURRENT GAME STATE ======="));
    const state = (p: string) => p.slice(p.indexOf("======= CURRENT GAME STATE ======="));
    expect(state(both.prompt)).toBe(state(c.prompt));
    expect(json(both.schema)).toBe(json(c.schema));
    if (o.prompt === base.prompt) expect(both.prompt).toBe(c.prompt);
    else expect(instructions(both.prompt)).toContain(OPTIONS_CONTINUITY_TEXT.drawsOnStats);
  });
});

describe("the eval's variants", () => {
  it("turnO, turnC and turnOC build the arms with production's single-player turn limits", () => {
    const story = chapterStep("challenge", 0);
    for (const [variant, arm] of [
      ["turnO", O],
      ["turnC", C],
      ["turnOC", OC],
    ] as const) {
      const request = requestFor(variant, { role: "beat", story });
      expect(requestText(request)).toBe(optionsContinuityRequest(story, arm).prompt);
      expect(json(request.schema)).toBe(json(optionsContinuityRequest(story, arm).schema));
      expect(callLimitsOf(request)).toEqual(callLimitsOf(requestFor("adopted", { role: "beat", story })));
      expect(callLimitsOf(request)).toBeDefined();
      expect(() => requestFor(variant, { role: "switch", story })).toThrow(/does not cover role switch/);
    }
  });
});
