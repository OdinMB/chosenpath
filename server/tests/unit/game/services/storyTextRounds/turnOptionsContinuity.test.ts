import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { Story } from "core/models/Story.js";
import { getThreadType, type Beat, type BeatOption, type ThreadAnalysis } from "core/types/index.js";
import { beatStep } from "../../../../../src/game/services/storyTextSteps.js";
import { EXPLORATION_ORDER, takesExplorationOrder } from "../../../../../src/game/services/optionRules.js";
import { sacrificeRewardLine } from "../../../../../src/game/services/storyTextRounds/turnRound2.js";
import { endingStateRequest, productionEndingForm } from "../../../../../src/game/services/storyTextRounds/endingState.js";
import {
  OPTIONS_CONTINUITY_TEXT,
  chapterLeverLine,
  chapterLeverRule,
  chapterLevers,
  o2LeverLine,
  o2LeverRule,
  o2bLeverLine,
  o2bLeverRule,
  optionsContinuityRequest,
  previousBeatBlock,
  productionTurnForm,
} from "../../../../../src/game/services/storyTextRounds/turnOptionsContinuity.js";
import { evalFiles } from "../../../../../src/evals/textModelEval/evalFiles.js";
import { OPTIONS_O2_CASES, stagePlansCase } from "../../../../../src/evals/textModelEval/arms.js";
import { takesKidsRules } from "../../../../../src/game/services/kidsTurnRules.js";
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
// The cases the options stages could plan: none frozen for a later stage (the kids-turns stage's mouse turns among them,
// two of them rolled steps)
const frozen = (fs.existsSync(path.join(CASES_DIR, "cases", "cases.json")) ? evalFiles(CASES_DIR).readCases() : []).filter((c) => stagePlansCase("options-o2", c.id));

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

/** A challenge chapter of `duration` steps from history index `first`, as far as the history goes, with this history. */
function withHistory(history: Beat[], first = 1, earlier: ThreadAnalysis[] = [], duration = 4): Story {
  const done = history.length - first;
  const analysis = threadAnalysis("challenge", duration, first);
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

/**
 * Production's request as it stood when the arms ran (2026-09-30): the same
 * as today on every turn but the ending, which production has told as its
 * milestones leave it since the ending's adoption later that day (endingStateB),
 * and an exploration step, which carries the exploration-order line since the
 * choice-line-sp adoption of the same day; the arms' base keeps the turns they
 * ran beside. Nor did any turn then read a story's category: a single
 * player's read-with-kids turn takes the kids rules since 2026-10-01.
 */
function productionThen(story: Story) {
  if (story.getCurrentBeatType() === "ending") return productionEndingForm(story);
  const today = beatStep.request(takesKidsRules(story) ? story.clone({ category: undefined, readingAge: undefined }) : story);
  return takesExplorationOrder(story) ? { ...today, prompt: today.prompt.replace(EXPLORATION_ORDER, "") } : today;
}

describe("the base: production's single-player turn form, built from the frozen copy", () => {
  it.each(SINGLE_PLAYER)("%s: production's request byte for byte (the ending as it stood when the arms ran)", (_, build) => {
    const story = build();
    const [ours, production] = [productionTurnForm(story), productionThen(story)];
    expect(ours.prompt).toBe(production.prompt);
    expect(json(ours.schema)).toBe(json(production.schema));
    expect(optionsContinuityRequest(story, BASE).prompt).toBe(production.prompt);
  });

  it("differs from today's production only at the ending, which production now tells as its milestones leave it, and on an exploration step, which now carries the exploration-order line", () => {
    const ending = endingBeat(1);
    expect(beatStep.request(ending).prompt).toBe(endingStateRequest(ending).prompt);
    expect(productionTurnForm(ending).prompt).not.toBe(beatStep.request(ending).prompt);
    const exploring = chapterStep("exploration", 1);
    expect(beatStep.request(exploring).prompt.split(EXPLORATION_ORDER)).toHaveLength(2);
    expect(productionTurnForm(exploring).prompt).toBe(beatStep.request(exploring).prompt.replace(EXPLORATION_ORDER, ""));
  });

  (frozen.length ? it : it.skip)("every frozen single-player turn: production's request byte for byte (the ending as it stood when the arms ran)", () => {
    const cases = frozen.filter((c) => c.role === "beat" && !c.tags.multiplayer);
    expect(cases.length).toBeGreaterThan(40);
    for (const c of cases) {
      const story = caseStory(c);
      const [ours, production] = [productionTurnForm(story), productionThen(story)];
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

  it("where the chapter offered a sacrifice, arms O and OC send the chapter's lever line in place of today's, and production keeps today's", () => {
    // A three-step chapter's second step, after a sacrifice at its first: the two lines differ
    const story = withHistory([switchBeat(), challengeBeat(["sacrifice"])], 1, [], 3);
    const [line, today] = [chapterLeverLine(story, "player1"), sacrificeRewardLine(story, "player1")];
    expect(line).not.toBe(today);
    const base = productionTurnForm(story).prompt;
    expect(base).toContain(`--- ${today}\n`);
    for (const arm of [O, OC]) {
      const { prompt } = optionsContinuityRequest(story, arm);
      expect(prompt).toContain(`--- ${line}\n`);
      expect(prompt).not.toContain(`--- ${today}\n`);
      expect(occurrences(prompt, "Sacrifice or reward: ")).toBe(1);
    }
    // Nothing else changes in arm O: the base with its three edits undone
    const undone = optionsContinuityRequest(story, O)
      .prompt.replace(`${OPTIONS_CONTINUITY_TEXT.drawsOnStats}\n`, "")
      .replace(`${OPTIONS_CONTINUITY_TEXT.riskOnlyWeak}\n`, "")
      .replace(`--- ${line}\n`, `--- ${today}\n`);
    expect(undone).toBe(base);
    // Arm C alone leaves the line as production sends it
    expect(optionsContinuityRequest(story, C).prompt).toContain(`--- ${today}\n`);
  });

  (frozen.length ? it : it.skip)("every frozen rolled chapter step: arm O's request carries the chapter's lever line, on more steps than the played exploration-typed ones", () => {
    const rolled = frozen
      .filter((c) => c.role === "beat" && !c.tags.multiplayer)
      .map((c) => ({ id: c.id, story: caseStory(c) }))
      .filter(({ story }) => story.getCurrentBeatType() === "thread" && story.getCurrentBeat("player1") !== undefined)
      .filter(({ story }) => {
        const thread = story.getCurrentThreadAnalysis()?.threads.find((t) => t.playersSideA.includes("player1"));
        return thread !== undefined && getThreadType(thread) !== "exploration";
      });
    expect(rolled.length).toBeGreaterThan(30);
    const differing = rolled.filter(({ story }) => chapterLeverLine(story, "player1") !== sacrificeRewardLine(story, "player1"));
    for (const { id, story } of rolled) {
      const { prompt } = optionsContinuityRequest(story, O);
      expect({ id, carries: prompt.includes(`--- ${chapterLeverLine(story, "player1")}\n`) }).toEqual({ id, carries: true });
      expect({ id, lines: occurrences(prompt, "Sacrifice or reward: ") }).toEqual({ id, lines: 1 });
    }
    // Not only the gpt-4.1-mini cases whose chapter step typed its options as exploration (cont-7492b211-t2)
    expect(differing.filter(({ id }) => !id.startsWith("cont-7492b211-t2")).length).toBeGreaterThan(0);
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

  it("a first sacrifice and every reward as today's line allows: where it gives none and the chapter offered no sacrifice, none", () => {
    const earlier = endedChapter(ENCLAVE, 2, 1, "The enclave listens");
    for (const story of [
      withHistory([switchBeat(), challengeBeat(["reward"])]),
      withHistory([switchBeat(), challengeBeat(["reward"])], 1, [], 3),
      // The chapter before offered the lever: this chapter offered none
      withHistory([switchBeat(), challengeBeat(), challengeBeat(["sacrifice"]), switchBeat()], 4, [earlier]),
    ]) {
      expect(sacrificeRewardLine(story, "player1")).toBe("Sacrifice or reward: none this turn.");
      expect(chapterLeverLine(story, "player1")).toBe("Sacrifice or reward: none this turn.");
      expect(chapterLeverRule(story, "player1")).toEqual({ reward: false, sacrifice: "none" });
    }
  });

  it("from the second sacrifice on, the chapter's count and not today's rate: in a three-step chapter, one only for a strong reason in the option's text, and no reward where today's line gives none", () => {
    // The owner: "Several sacrifices can sometimes make sense, but should have a strong justification starting at the second one"
    const taken = withHistory([switchBeat(), challengeBeat(["sacrifice"])], 1, [], 3);
    expect(sacrificeRewardLine(taken, "player1")).toBe("Sacrifice or reward: none this turn.");
    expect(chapterLeverRule(taken, "player1")).toEqual({ reward: false, sacrifice: "strongReason" });
    expect(chapterLeverLine(taken, "player1")).toBe(
      "Sacrifice or reward: this thread already offered a sacrifice, which the player took, so offer another sacrifice only if the scene gives a strong reason for it, and make that reason clear in the option's text. No reward this turn."
    );
    // Declined at step 1, nothing at step 2: the last step
    const declined = withHistory([switchBeat(), challengeBeat(["sacrifice"], 1), challengeBeat()], 1, [], 3);
    expect(sacrificeRewardLine(declined, "player1")).toBe("Sacrifice or reward: none this turn.");
    expect(chapterLeverLine(declined, "player1")).toBe(
      "Sacrifice or reward: this thread already offered a sacrifice, which the player didn't take, so offer another sacrifice only if the scene gives a strong reason for it, and make that reason clear in the option's text. No reward this turn."
    );
    // Two offered, neither taken
    const twice = withHistory([switchBeat(), challengeBeat(["sacrifice"], 1), challengeBeat(["normal", "sacrifice"], 0)], 1, [], 3);
    expect(chapterLeverLine(twice, "player1")).toBe(
      "Sacrifice or reward: this thread already offered two sacrifices, and the player took none of them, so offer another sacrifice only if the scene gives a strong reason for it, and make that reason clear in the option's text. No reward this turn."
    );
    // A reward and a sacrifice offered: no second reward either way
    const both = withHistory([switchBeat(), challengeBeat(["reward"]), challengeBeat(["sacrifice"], 1)]);
    expect(chapterLeverRule(both, "player1")).toEqual({ reward: false, sacrifice: "strongReason" });
    expect(chapterLeverLine(both, "player1")).toMatch(/strong reason for it, and make that reason clear in the option's text\. No reward: this thread already offered one\.$/);
    // The line never says "pay again", which a declined sacrifice would contradict
    for (const story of [taken, declined, twice, both]) expect(chapterLeverLine(story, "player1")).not.toMatch(/again/);
  });

  it("from the second sacrifice on, where today's line fits too: says one was offered and whether it was taken, and a reward fits", () => {
    // A four-step chapter: a sacrifice at step 1, none at steps 2 and 3, so today's line fits again at step 4
    const taken = withHistory([switchBeat(), challengeBeat(["sacrifice"]), challengeBeat(), challengeBeat()]);
    expect(sacrificeRewardLine(taken, "player1")).toMatch(/one fits this turn/);
    expect(chapterLeverLine(taken, "player1")).toBe(
      "Sacrifice or reward: this thread already offered a sacrifice, which the player took, so offer another sacrifice only if the scene gives a strong reason for it, and make that reason clear in the option's text. A reward fits this turn if a stat allows it."
    );
    expect(chapterLeverRule(taken, "player1")).toEqual({ reward: true, sacrifice: "strongReason" });
    const declined = withHistory([switchBeat(), challengeBeat(["sacrifice"], 1), challengeBeat(), challengeBeat()]);
    expect(chapterLeverLine(declined, "player1")).toContain("this thread already offered a sacrifice, which the player didn't take, so offer another sacrifice only if");
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
      "Sacrifice or reward: this thread already offered two sacrifices, and the player took one of them, so offer another sacrifice only if the scene gives a strong reason for it, and make that reason clear in the option's text. A reward fits this turn if a stat allows it."
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

describe("arm O's fix-and-retest (turnOb): the option's words never name the stat its bonus comes from", () => {
  // The run of 2026-09-30: arm O's options named their stat ("Use your Technical skill to…" / "Use your Creative skill to…"),
  // so more sets opened with the same word; the fix is one sentence closing arm O's stats line, nothing else
  const OB = { options: true, continuity: false, statsUnnamed: true };
  const withFix = (prompt: string) =>
    prompt.replace(OPTIONS_CONTINUITY_TEXT.drawsOnStats, `${OPTIONS_CONTINUITY_TEXT.drawsOnStats} ${OPTIONS_CONTINUITY_TEXT.statsUnnamed}`);

  it("is one sentence: what the character does, never the bonus stat's name", () => {
    expect(OPTIONS_CONTINUITY_TEXT.statsUnnamed).toBe("An option's words say what the character does; they never name the stat its bonus comes from.");
  });

  it.each([
    ["a chapter's first step", () => chapterStep("challenge", 0)],
    ["a chapter's middle step", () => chapterStep("challenge", 1)],
    ["a chapter's last step", () => chapterStep("challenge", 2)],
  ] as const)("%s: arm O's request with the sentence closing its stats line, once", (_, build) => {
    const story = build();
    const [fixed, o] = [optionsContinuityRequest(story, OB), optionsContinuityRequest(story, O)];
    expect(fixed.prompt).toBe(withFix(o.prompt));
    expect(fixed.prompt).not.toBe(o.prompt);
    expect(occurrences(fixed.prompt, OPTIONS_CONTINUITY_TEXT.statsUnnamed)).toBe(1);
    expect(json(fixed.schema)).toBe(json(o.schema));
  });

  it.each([
    ["the first turn", () => firstSwitchBeat(1)],
    ["a switch after a chapter", switchAfterChapter],
    ["an exploration step", () => chapterStep("exploration", 1)],
    ["the ending", () => endingBeat(1)],
  ] as const)("%s: no rolled options, so the base exactly", (_, build) => {
    const story = build();
    expect(optionsContinuityRequest(story, OB).prompt).toBe(productionTurnForm(story).prompt);
  });

  (frozen.length ? it : it.skip)("every frozen single-player turn: arm O's request with the sentence where arm O applies, the base elsewhere", () => {
    const cases = frozen.filter((c) => c.role === "beat" && !c.tags.multiplayer);
    let fixedCount = 0;
    for (const c of cases) {
      const story = caseStory(c);
      const [fixed, o] = [optionsContinuityRequest(story, OB), optionsContinuityRequest(story, O)];
      expect({ id: c.id, same: fixed.prompt === withFix(o.prompt) }).toEqual({ id: c.id, same: true });
      // The sentence goes exactly where arm O changes production's request
      const armOApplies = o.prompt !== productionTurnForm(story).prompt;
      expect({ id: c.id, fixed: fixed.prompt !== o.prompt }).toEqual({ id: c.id, fixed: armOApplies });
      if (fixed.prompt !== o.prompt) fixedCount++;
    }
    // The 32 rolled steps among the 44 stored turns, and the built rolled step among the round cases
    expect(fixedCount).toBe(33);
  });

  it("needs arm O: the sentence has nothing to close without its stats line", () => {
    expect(() => optionsContinuityRequest(chapterStep("challenge", 1), { options: false, continuity: false, statsUnnamed: true })).toThrow(/arm O/);
  });
});

describe("version O2: O's stat variety with the lever option left out of it, O's retest sentence, B6's negative base kept, and a reward invited once a chapter", () => {
  // The coordinator's brief after the run of 2026-09-30: O's variety gain without its wrong-way moves. O's
  // "at most one has no stat bonus" left no room for a bonus-less sensible option beside a bonus-less lever (production
  // 4 such sets of 64, all lever sets, arm O none), and 6 of production's 7 rewards had no bonus; O's line also said
  // "No reward this turn." where today's rate gives none, which stopped the 3 rewards production offered there
  const O2 = { options: true, continuity: false, o2: true };
  const withoutO2 = (story: Story, prompt: string) =>
    prompt
      .replace(`${OPTIONS_CONTINUITY_TEXT.o2Stats}\n${OPTIONS_CONTINUITY_TEXT.o2NegativeBase}\n`, "")
      .replace(`${OPTIONS_CONTINUITY_TEXT.riskOnlyWeak}\n`, "")
      .replace(`--- ${o2LeverLine(story, "player1")}\n`, `--- ${sacrificeRewardLine(story, "player1")}\n`);

  it("is worded as the brief asks: O's rule with the lever option left out, the retest sentence, and the negative base kept", () => {
    expect(OPTIONS_CONTINUITY_TEXT.o2Stats).toBe(
      "--- The options also draw on different stats: no two take their main stat bonus from the same stat, and at most one option that is neither a sacrifice nor a reward has no stat bonus (as far as the stats' current values give bonuses). A sacrifice or reward option needs no stat bonus: what it spends or gains already sets it apart. Risk alone never tells two options apart. An option's words say what the character does; they never name the stat its bonus comes from."
    );
    expect(OPTIONS_CONTINUITY_TEXT.o2NegativeBase).toBe(
      "--- Drawing on different stats doesn't change basePoints: the option that plays to the character's strength still takes -5 to -15, even when every option earns a bonus."
    );
    // O's retest sentence word for word, closing the stats line as it closed O's
    expect(OPTIONS_CONTINUITY_TEXT.o2Stats.endsWith(` ${OPTIONS_CONTINUITY_TEXT.statsUnnamed}`)).toBe(true);
  });

  it.each([
    ["a chapter's first step", () => chapterStep("challenge", 0)],
    ["a chapter's middle step", () => chapterStep("challenge", 1)],
    ["a chapter's last step", () => chapterStep("challenge", 2)],
    ["a step after a sacrifice", () => withHistory([switchBeat(), challengeBeat(["sacrifice"])], 1, [], 3)],
    ["a step after a reward", () => withHistory([switchBeat(), challengeBeat(["reward"]), challengeBeat(), challengeBeat()])],
  ] as const)("%s: production's request with O2's two lines after B6's third way, O's risk-only weak example and O2's lever line, and nothing else", (_, build) => {
    const story = build();
    const { prompt, schema } = optionsContinuityRequest(story, O2);
    const base = productionTurnForm(story).prompt;
    expect(occurrences(prompt, OPTIONS_CONTINUITY_TEXT.o2Stats)).toBe(1);
    expect(occurrences(prompt, OPTIONS_CONTINUITY_TEXT.o2NegativeBase)).toBe(1);
    expect(occurrences(prompt, OPTIONS_CONTINUITY_TEXT.riskOnlyWeak)).toBe(1);
    // Right after the third way, before B6's weak example
    expect(prompt).toContain(`--- one costs or risks something the others don't (a sacrifice, a chased reward, a relationship put on the line), or serves a different stake of the character's.\n${OPTIONS_CONTINUITY_TEXT.o2Stats}\n${OPTIONS_CONTINUITY_TEXT.o2NegativeBase}\n--- Weak: "Use your speech skill to`);
    // O's own stats line, which left no room for a bonus-less lever, is not sent
    expect(prompt).not.toContain(OPTIONS_CONTINUITY_TEXT.drawsOnStats);
    expect(prompt).toContain(`--- ${o2LeverLine(story, "player1")}\n`);
    expect(occurrences(prompt, "Sacrifice or reward: ")).toBe(1);
    expect(withoutO2(story, prompt)).toBe(base);
    expect(json(schema)).toBe(json(productionTurnForm(story).schema));
  });

  it.each([
    ["the first turn", () => firstSwitchBeat(1)],
    ["a switch after a chapter", switchAfterChapter],
    ["an exploration step", () => chapterStep("exploration", 1)],
    ["the ending", () => endingBeat(1)],
  ] as const)("%s: no rolled options, so the base exactly", (_, build) => {
    const story = build();
    expect(optionsContinuityRequest(story, O2).prompt).toBe(productionTurnForm(story).prompt);
    expect(json(optionsContinuityRequest(story, O2).schema)).toBe(json(productionTurnForm(story).schema));
  });

  it("needs arm O's place and carries the retest sentence itself", () => {
    expect(() => optionsContinuityRequest(chapterStep("challenge", 1), { options: false, continuity: false, o2: true })).toThrow(/O2/);
    expect(() => optionsContinuityRequest(chapterStep("challenge", 1), { options: true, continuity: false, o2: true, statsUnnamed: true })).toThrow(/O2/);
  });

  (frozen.length ? it : it.skip)("every frozen single-player turn: production's request with O2's edits on the rolled steps, the base elsewhere", () => {
    const cases = frozen.filter((c) => c.role === "beat" && !c.tags.multiplayer);
    let edited = 0;
    for (const c of cases) {
      const story = caseStory(c);
      const { prompt } = optionsContinuityRequest(story, O2);
      const base = productionTurnForm(story).prompt;
      expect({ id: c.id, undone: withoutO2(story, prompt) === base }).toEqual({ id: c.id, undone: true });
      if (prompt !== base) {
        edited++;
        expect({ id: c.id, lines: occurrences(prompt, "Sacrifice or reward: ") }).toEqual({ id: c.id, lines: 1 });
      }
    }
    // Where arm O edits: the 32 rolled steps among the 44 stored turns, and the built rolled step among the round cases
    expect(edited).toBe(33);
    // The stage runs it on exactly the stored ones
    const storedEdited = cases.filter((c) => c.tags.source !== "round" &&optionsContinuityRequest(caseStory(c), O2).prompt !== productionTurnForm(caseStory(c)).prompt).map((c) => c.id);
    expect([...storedEdited].sort()).toEqual([...OPTIONS_O2_CASES].sort());
  });
});

describe("o2LeverRule and o2LeverLine: a reward invited until the chapter offered one, sacrifices as arm O counts them", () => {
  const earlier = () => endedChapter(ENCLAVE, 2, 1, "The enclave listens");

  it("invites a reward whenever the chapter has offered none, whatever today's rate says; a sacrifice as arm O allows it", () => {
    const cases: [string, Story, { reward: boolean; sacrifice: string }][] = [
      ["no lever yet, today's rate fits", withHistory([switchBeat(), challengeBeat()]), { reward: true, sacrifice: "fits" }],
      // The chapter before offered a sacrifice in the player's last two rolled turns: today's rate gives none
      ["a lever in the chapter before", withHistory([switchBeat(), challengeBeat(), challengeBeat(["sacrifice"]), switchBeat()], 4, [earlier()]), { reward: true, sacrifice: "none" }],
      ["after a sacrifice", withHistory([switchBeat(), challengeBeat(["sacrifice"])], 1, [], 3), { reward: true, sacrifice: "strongReason" }],
      ["after a reward, today's rate fits again", withHistory([switchBeat(), challengeBeat(["reward"]), challengeBeat(), challengeBeat()]), { reward: false, sacrifice: "fits" }],
      ["right after a reward", withHistory([switchBeat(), challengeBeat(["reward"])], 1, [], 3), { reward: false, sacrifice: "none" }],
      ["after a reward and a sacrifice", withHistory([switchBeat(), challengeBeat(["reward"]), challengeBeat(["sacrifice"], 1)]), { reward: false, sacrifice: "strongReason" }],
    ];
    for (const [label, story, rule] of cases) expect({ label, rule: o2LeverRule(story, "player1") }).toEqual({ label, rule });
    // The sacrifice half is arm O's rule, unchanged
    for (const [, story] of cases) expect(o2LeverRule(story, "player1").sacrifice).toBe(chapterLeverRule(story, "player1").sacrifice);
  });

  it("puts the invitation first in the brief's words, and never says there is no reward while the chapter has offered none", () => {
    const fits = withHistory([switchBeat(), challengeBeat()]);
    expect(o2LeverLine(fits, "player1")).toBe("Sacrifice or reward: a reward fits this turn if a stat allows it, and so does a sacrifice.");
    const noSacrifice = withHistory([switchBeat(), challengeBeat(), challengeBeat(["sacrifice"]), switchBeat()], 4, [earlier()]);
    expect(o2LeverLine(noSacrifice, "player1")).toBe("Sacrifice or reward: a reward fits this turn if a stat allows it. No sacrifice this turn.");
    const taken = withHistory([switchBeat(), challengeBeat(["sacrifice"])], 1, [], 3);
    expect(o2LeverLine(taken, "player1")).toBe(
      "Sacrifice or reward: a reward fits this turn if a stat allows it. This thread already offered a sacrifice, which the player took, so offer another sacrifice only if the scene gives a strong reason for it, and make that reason clear in the option's text."
    );
    const twice = withHistory([switchBeat(), challengeBeat(["sacrifice"], 1), challengeBeat(["normal", "sacrifice"], 0)], 1, [], 3);
    expect(o2LeverLine(twice, "player1")).toBe(
      "Sacrifice or reward: a reward fits this turn if a stat allows it. This thread already offered two sacrifices, and the player took none of them, so offer another sacrifice only if the scene gives a strong reason for it, and make that reason clear in the option's text."
    );
    for (const story of [fits, noSacrifice, taken, twice]) {
      expect(o2LeverLine(story, "player1")).not.toMatch(/No reward/);
      expect(o2LeverLine(story, "player1")).toMatch(/^Sacrifice or reward: a reward fits this turn if a stat allows it/);
    }
  });

  it("closes the reward once the chapter offered one, chosen or not", () => {
    const again = withHistory([switchBeat(), challengeBeat(["reward"]), challengeBeat(), challengeBeat()]);
    expect(o2LeverLine(again, "player1")).toBe("Sacrifice or reward: a sacrifice fits this turn if a stat allows it. No reward: this thread already offered one.");
    const declined = withHistory([switchBeat(), challengeBeat(["normal", "reward"], 0)], 1, [], 3);
    expect(o2LeverLine(declined, "player1")).toBe("Sacrifice or reward: none this turn.");
    const both = withHistory([switchBeat(), challengeBeat(["reward"]), challengeBeat(["sacrifice"], 1)]);
    expect(o2LeverLine(both, "player1")).toBe(
      "Sacrifice or reward: this thread already offered a sacrifice, which the player didn't take, so offer another sacrifice only if the scene gives a strong reason for it, and make that reason clear in the option's text. No reward: this thread already offered one."
    );
    for (const story of [again, declined, both]) expect(o2LeverLine(story, "player1")).not.toMatch(/a reward fits|again\b/);
  });

  (frozen.length ? it : it.skip)("on the frozen rolled steps: invites a reward on every one, since no stored chapter offered a reward before its turn", () => {
    const rolled = frozen
      .filter((c) => c.role === "beat" && !c.tags.multiplayer)
      .map((c) => ({ id: c.id, story: caseStory(c) }))
      .filter(({ story }) => optionsContinuityRequest(story, O).prompt !== productionTurnForm(story).prompt);
    expect(rolled.length).toBe(33);
    for (const { id, story } of rolled) {
      expect({ id, reward: o2LeverRule(story, "player1").reward }).toEqual({ id, reward: true });
      expect({ id, sacrifice: o2LeverRule(story, "player1").sacrifice }).toEqual({ id, sacrifice: chapterLeverRule(story, "player1").sacrifice });
    }
  });
});

/*
 * O2's one fix-and-retest (turnO2b, after its run of 2026-09-30): where today's rate gives none after a chapter
 * sacrifice, O2's strong-reason clause let the model offer a second sacrifice on 22 of the 42 sets production's form
 * held to 5, none with a reason in the scene by hand (the Novi Reg stories' "Spend 20 Resource Credits…"); arm O's same
 * clause gave 0 reasons in 7. O2b keeps the reward invitation and puts sacrifices back on today's rate.
 */
describe("O2b: O2 with sacrifices on today's rate (no strong-reason clause), the reward invitation kept", () => {
  const O2 = { options: true, continuity: false, o2: true };
  const O2B = { options: true, continuity: false, o2: true, o2RateSacrifices: true };
  const earlier = () => endedChapter(ENCLAVE, 2, 1, "The enclave listens");

  it("invites a reward until the chapter offered one, and a sacrifice only as today's rate allows", () => {
    const cases: [string, Story, { reward: boolean; sacrifice: string }][] = [
      ["no lever yet, today's rate fits", withHistory([switchBeat(), challengeBeat()]), { reward: true, sacrifice: "fits" }],
      ["a lever in the chapter before", withHistory([switchBeat(), challengeBeat(), challengeBeat(["sacrifice"]), switchBeat()], 4, [earlier()]), { reward: true, sacrifice: "none" }],
      ["right after a sacrifice", withHistory([switchBeat(), challengeBeat(["sacrifice"])], 1, [], 3), { reward: true, sacrifice: "none" }],
      ["two steps after a sacrifice, today's rate fits again", withHistory([switchBeat(), challengeBeat(["sacrifice"]), challengeBeat(), challengeBeat()]), { reward: true, sacrifice: "fits" }],
      ["after a reward, today's rate fits again", withHistory([switchBeat(), challengeBeat(["reward"]), challengeBeat(), challengeBeat()]), { reward: false, sacrifice: "fits" }],
      ["right after a reward", withHistory([switchBeat(), challengeBeat(["reward"])], 1, [], 3), { reward: false, sacrifice: "none" }],
    ];
    for (const [label, story, rule] of cases) expect({ label, rule: o2bLeverRule(story, "player1") }).toEqual({ label, rule });
    // The reward half is O2's, the sacrifice half today's rate
    for (const [, story] of cases) {
      expect(o2bLeverRule(story, "player1").reward).toBe(o2LeverRule(story, "player1").reward);
      expect(o2bLeverRule(story, "player1").sacrifice === "fits").toBe(sacrificeRewardLine(story, "player1") !== "Sacrifice or reward: none this turn.");
    }
  });

  it("words the line as O2 does, without the strong-reason clause", () => {
    const afterSacrifice = withHistory([switchBeat(), challengeBeat(["sacrifice"])], 1, [], 3);
    expect(o2bLeverLine(afterSacrifice, "player1")).toBe("Sacrifice or reward: a reward fits this turn if a stat allows it. No sacrifice this turn.");
    const twice = withHistory([switchBeat(), challengeBeat(["sacrifice"], 1), challengeBeat(["normal", "sacrifice"], 0)], 1, [], 3);
    expect(o2bLeverLine(twice, "player1")).toBe("Sacrifice or reward: a reward fits this turn if a stat allows it. No sacrifice this turn.");
    const fits = withHistory([switchBeat(), challengeBeat()]);
    expect(o2bLeverLine(fits, "player1")).toBe("Sacrifice or reward: a reward fits this turn if a stat allows it, and so does a sacrifice.");
    const afterReward = withHistory([switchBeat(), challengeBeat(["reward"]), challengeBeat(), challengeBeat()]);
    expect(o2bLeverLine(afterReward, "player1")).toBe("Sacrifice or reward: a sacrifice fits this turn if a stat allows it. No reward: this thread already offered one.");
    expect(o2bLeverLine(withHistory([switchBeat(), challengeBeat(["reward"])], 1, [], 3), "player1")).toBe("Sacrifice or reward: none this turn.");
    for (const story of [afterSacrifice, twice, fits, afterReward]) expect(o2bLeverLine(story, "player1")).not.toMatch(/strong reason|already offered a sacrifice|sacrifices/);
    // Where O2's line has no strong-reason clause, the two lines are the same
    for (const story of [fits, afterReward]) expect(o2bLeverLine(story, "player1")).toBe(o2LeverLine(story, "player1"));
  });

  it.each([
    ["a chapter's first step", () => chapterStep("challenge", 0)],
    ["a step after a sacrifice", () => withHistory([switchBeat(), challengeBeat(["sacrifice"])], 1, [], 3)],
    ["a step after two sacrifices", () => withHistory([switchBeat(), challengeBeat(["sacrifice"], 1), challengeBeat(["normal", "sacrifice"], 0)], 1, [], 3)],
    ["a step after a reward", () => withHistory([switchBeat(), challengeBeat(["reward"]), challengeBeat(), challengeBeat()])],
  ] as const)("%s: O2's request with O2b's lever line in place of O2's, and nothing else", (_, build) => {
    const story = build();
    const [o2, o2b] = [optionsContinuityRequest(story, O2), optionsContinuityRequest(story, O2B)];
    expect(o2b.prompt).toBe(o2.prompt.replace(`--- ${o2LeverLine(story, "player1")}\n`, `--- ${o2bLeverLine(story, "player1")}\n`));
    expect(occurrences(o2b.prompt, "Sacrifice or reward: ")).toBe(1);
    expect(json(o2b.schema)).toBe(json(o2.schema));
  });

  it("where O2 leaves production's request as it is, so does O2b; it needs O2", () => {
    for (const story of [firstSwitchBeat(1), switchAfterChapter(), chapterStep("exploration", 1), endingBeat(1)]) {
      expect(optionsContinuityRequest(story, O2B).prompt).toBe(productionTurnForm(story).prompt);
    }
    expect(() => optionsContinuityRequest(chapterStep("challenge", 1), { options: true, continuity: false, o2RateSacrifices: true })).toThrow(/O2b/);
  });

  (frozen.length ? it : it.skip)("on the frozen rolled steps: no strong-reason clause, and the line differs from O2's only where O2's carries one", () => {
    const rolled = frozen
      .filter((c) => c.role === "beat" && !c.tags.multiplayer)
      .map((c) => ({ id: c.id, story: caseStory(c) }))
      .filter(({ story }) => optionsContinuityRequest(story, O2).prompt !== productionTurnForm(story).prompt);
    expect(rolled.length).toBe(33);
    let differs = 0;
    for (const { id, story } of rolled) {
      const [line, o2Line] = [o2bLeverLine(story, "player1"), o2LeverLine(story, "player1")];
      expect({ id, clause: /strong reason/.test(line) }).toEqual({ id, clause: false });
      expect({ id, same: line === o2Line }).toEqual({ id, same: !/strong reason/.test(o2Line) });
      if (line !== o2Line) differs++;
    }
    // The 21 stored steps after a chapter sacrifice, the 3 cont-7492b211-t2 cases and the built round case's one
    expect(differs).toBeGreaterThanOrEqual(24);
  });
});

describe("the eval's variants", () => {
  it("turnO, turnC, turnOC, turnOb, turnO2 and turnO2b build the arms with production's single-player turn limits", () => {
    const story = chapterStep("challenge", 0);
    for (const [variant, arm] of [
      ["turnO", O],
      ["turnC", C],
      ["turnOC", OC],
      ["turnOb", { options: true, continuity: false, statsUnnamed: true }],
      ["turnO2", { options: true, continuity: false, o2: true }],
      ["turnO2b", { options: true, continuity: false, o2: true, o2RateSacrifices: true }],
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
