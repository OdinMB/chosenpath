import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { Story } from "core/models/Story.js";
import type { StoryState } from "core/types/index.js";
import { MONEY_ADDS_UP_TEXT, moneyAddsUpRequest, productionTurnMeasured, takesMoneyRule } from "../../../../../src/game/services/storyTextRounds/moneyAddsUp.js";
import { beatStep } from "../../../../../src/game/services/storyTextSteps.js";
import { evalFiles } from "../../../../../src/evals/textModelEval/evalFiles.js";
import { caseStory } from "../../../../../src/evals/textModelEval/cases.js";
import { callLimitsOf, requestFor, requestText } from "../../../../../src/evals/textModelEval/variants.js";
import { productionCallLimits } from "../../../../../src/shared/llm/chatModel.js";
import { takesKidsRules } from "../../../../../src/game/services/kidsTurnRules.js";
import { endingBeat, firstSwitchBeat, laterSwitchBeat, threadBeat } from "../../../../helpers/promptStories.js";
import { stat } from "../../../../helpers/textFixtures.js";
import { beforeEndingOnlyPlayed, productionBeforeKidsAges, productionThen, withKidsImageSlots } from "../../../../helpers/adoptedDeltas.js";

/*
 * Money and counts that add up in a learning story (eval only; fix 7 of the
 * second playthroughs' review, 2026-10-01). The second round's lemonade story
 * teaches budgets and profit margins, and its ledger never added up: turn 3's
 * text paid five coins for fruit and one more for paper sleeves and sold cups
 * into a cashbox that "fills with a handful of mixed coins", and the stat
 * changes took only the sacrifice's five; the switch turn after raised the
 * profit margin 25% -> 30% as a reward for the chapter, with no sum in the
 * text; the ending counted "the four coins still there". The variant is
 * production's turn with one block at the end of the stat-changes section on
 * a learning story that keeps a counted (number) stat; production's request
 * byte for byte everywhere else.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));
const occurrences = (text: string, passage: string) => text.split(passage).length - 1;

const CASES_DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const frozen = fs.existsSync(path.join(CASES_DIR, "cases", "cases.json")) ? evalFiles(CASES_DIR).readCases() : [];

const CASHBOX = stat("player_cashbox", { name: "Cashbox", type: "number", initialValue: 10 });
const MARGIN = stat("player_margin", { name: "Profit Margin", initialValue: 25 });
const BUZZ = stat("shared_buzz", { name: "Market Buzz" });

/** A learning story's stats: a counted cashbox and a margin, each player's, and a shared meter. */
const LEARNING: Partial<StoryState> = { category: "learn-something", playerStats: [CASHBOX, MARGIN], sharedStats: [BUZZ] };

const TURNS: [string, (players: number, overrides: Partial<StoryState>) => Story][] = [
  ["a chapter step", (players, overrides) => threadBeat(players, overrides)],
  ["a switch turn after a chapter", (players, overrides) => laterSwitchBeat(players, overrides)],
  ["the ending", (players, overrides) => endingBeat(players, overrides)],
];

/** The prompt with the variant's block taken out again. */
const withoutBlock = (prompt: string) => prompt.split(`\n${MONEY_ADDS_UP_TEXT.block}`).join("");

describe("which turns take the money block", () => {
  it.each(TURNS)("a learning story with a counted stat: %s, every player count", (_, build) => {
    for (const players of [1, 2, 3]) expect(takesMoneyRule(build(players, LEARNING))).toBe(true);
  });

  it("a shared counted stat is enough", () => {
    expect(takesMoneyRule(threadBeat(1, { category: "learn-something", sharedStats: [{ ...CASHBOX, id: "shared_supplies", name: "Supplies" }] }))).toBe(true);
  });

  it("not the first turn, which changes no stats", () => {
    expect(takesMoneyRule(firstSwitchBeat(1, LEARNING))).toBe(false);
  });

  it("not another category, a story with no category, or a learning story that counts nothing", () => {
    expect(takesMoneyRule(threadBeat(1, { ...LEARNING, category: "enjoy-fiction" }))).toBe(false);
    expect(takesMoneyRule(threadBeat(1, { ...LEARNING, category: undefined }))).toBe(false);
    expect(takesMoneyRule(threadBeat(1, { ...LEARNING, playerStats: [MARGIN] }))).toBe(false);
  });
});

describe("the variant on a learning story", () => {
  it.each(TURNS)("%s: the block once, at the end of the stat-changes section; production's request around it", (_, build) => {
    for (const players of [1, 2, 3]) {
      const story = build(players, LEARNING);
      const [variant, base] = [moneyAddsUpRequest(story), productionTurnMeasured(story)];
      expect(occurrences(variant.prompt, MONEY_ADDS_UP_TEXT.block)).toBe(1);
      const next = players > 1 ? "\n\n3. MULTIPLAYER COORDINATION" : "\n\n3. GENERATE ONE STORY BEAT FOR EACH PLAYER";
      expect(variant.prompt).toContain(`\n${MONEY_ADDS_UP_TEXT.block}${next}`);
      expect(withoutBlock(variant.prompt)).toBe(base.prompt);
      expect(json(variant.schema)).toBe(json(base.schema));
      // The base is production's request today (an ending as it stood before the owner's decision of 2026-10-01 on
      // ending milestones, a group's challenge step before the group-levers adoption of the same day)
      expect(base.prompt).toBe(productionThen(beatStep.request(story), story).prompt);
      expect(json(base.schema)).toBe(json(productionThen(beatStep.request(story), story).schema));
    }
  });

  it("follows the section's last line: the thread's 'keep the changes minor', or the switch turn's milestone lines", () => {
    expect(moneyAddsUpRequest(threadBeat(1, LEARNING)).prompt).toContain(`Even then, keep the changes minor.\n\n${MONEY_ADDS_UP_TEXT.block}`);
    expect(moneyAddsUpRequest(laterSwitchBeat(1, LEARNING)).prompt).toContain(`the council has no choice but to approve the new railroad.'\n\n${MONEY_ADDS_UP_TEXT.block}`);
  });

  it("says amounts paid and earned move their stat in full, a sacrifice is paid once, a worked-out stat moves only by its sum, and no stated total differs", () => {
    const block = MONEY_ADDS_UP_TEXT.block;
    expect(block).toContain("moves that stat by exactly that amount in these stat changes, never put off to a later beat");
    expect(block).toContain("A price quoted, an estimate or a plan moves nothing");
    expect(block).toContain("is paid once");
    expect(block).toContain("It is not raised or lowered for how a thread went, whatever its adjustments after threads say.");
    expect(block).toContain("never state a total for a stat");
    expect(block.endsWith("\n")).toBe(true);
  });
});

describe("production's request byte for byte everywhere else", () => {
  it.each([
    ["a learning story's first turn", () => firstSwitchBeat(1, LEARNING)],
    ["a story of another category with a counted stat", () => threadBeat(1, { ...LEARNING, category: "flexible" })],
    ["a learning story with no counted stat", () => laterSwitchBeat(1, { ...LEARNING, playerStats: [MARGIN] })],
    ["a template story (no category)", () => endingBeat(2, { ...LEARNING, category: undefined })],
    ["a single player's story read with a child, with a counted stat", () => threadBeat(1, { ...LEARNING, category: "read-with-kids", readingAge: "5" })],
    ["a group's story read with a child", () => laterSwitchBeat(2, { ...LEARNING, category: "read-with-kids" })],
  ] as const)("%s", (_, build) => {
    const story = build();
    expect(takesMoneyRule(story)).toBe(false);
    // A kids turn as production sent it before the kids-ages adoption, later that day (productionBeforeKidsAges)
    const production = productionBeforeKidsAges(story);
    expect(moneyAddsUpRequest(story).prompt).toBe(beforeEndingOnlyPlayed(production.prompt, story));
    expect(json(moneyAddsUpRequest(story).schema)).toBe(production.json);
  });

  /*
   * The stage's base is production's turn as it stood then. Since the review of fix 6 (2026-10-01) a single player's
   * kids turn that shows images names other image places (withKidsImageSlots, the kept tests' logged delta), so the
   * frozen template case with images compares with that delta on the variant's base. An ending compares with
   * production as it stood before the owner's decision of 2026-10-01 on ending milestones (productionThen), and a kids
   * turn with production before the kids-ages adoption of the same day (productionBeforeKidsAges).
   */
  const asProductionNow = (prompt: string, story: Story) => (takesKidsRules(story) && !story.isMultiplayer() ? withKidsImageSlots(prompt, story) : prompt);

  (frozen.length ? it : it.skip)("every frozen turn case: production's request around the block, which only a learning story's turn carries", () => {
    const turns = frozen.filter((c) => c.role === "beat" && c.state);
    expect(turns.length).toBeGreaterThan(50);
    for (const c of turns) {
      const story = caseStory(c);
      const variant = asProductionNow(moneyAddsUpRequest(story).prompt, story);
      const production = beforeEndingOnlyPlayed(productionBeforeKidsAges(story).prompt, story);
      expect([c.id, withoutBlock(variant) === production, variant === production]).toEqual([c.id, true, !takesMoneyRule(story)]);
    }
  });
});

/*
 * The one fix-and-retest (moneyAddsUpB, after the run of 2026-10-01): the
 * switch turn after the favorable chapter still raised the margin 25 -> 30 in
 * both samples, following the stat's own "+5 percentage points after a
 * favorable thread", which the switch turn's thread-resolution lines tell it
 * to consider; and a chapter step told "each coin received" with no amount
 * and no change. The block names every amount it pays or earns, and the
 * thread-resolution lines carry the exception where they send the turn to the
 * adjustments.
 */
describe("the fix-and-retest, moneyAddsUpB", () => {
  const withoutB = (prompt: string) => [`\n${MONEY_ADDS_UP_TEXT.blockB}`, MONEY_ADDS_UP_TEXT.resolutionLine].reduce((text, passage) => text.split(passage).join(""), prompt);

  it.each(TURNS)("%s: block B once at the end of the stat-changes section; production's request around it", (_, build) => {
    for (const players of [1, 3]) {
      const story = build(players, LEARNING);
      const variant = moneyAddsUpRequest(story, { b: true }).prompt;
      expect(occurrences(variant, MONEY_ADDS_UP_TEXT.blockB)).toBe(1);
      expect(variant).not.toContain(MONEY_ADDS_UP_TEXT.block);
      expect(withoutB(variant)).toBe(productionThen(beatStep.request(story), story).prompt);
    }
  });

  it("puts the margin's exception after the thread-resolution line on the adjustments, on a switch turn and the ending only", () => {
    for (const story of [laterSwitchBeat(1, LEARNING), endingBeat(1, LEARNING)]) {
      const prompt = moneyAddsUpRequest(story, { b: true }).prompt;
      expect(occurrences(prompt, MONEY_ADDS_UP_TEXT.resolutionLine)).toBe(1);
      expect(prompt).toContain(`${MONEY_ADDS_UP_TEXT.adjustmentsAnchor}${MONEY_ADDS_UP_TEXT.resolutionLine}`);
    }
    expect(moneyAddsUpRequest(threadBeat(1, LEARNING), { b: true }).prompt).not.toContain(MONEY_ADDS_UP_TEXT.resolutionLine);
  });

  it("asks the text to name each amount it pays or earns, and skips a worked-out stat's adjustments after threads", () => {
    expect(MONEY_ADDS_UP_TEXT.blockB).toContain('the text names each of those amounts ("two coins"), never a handful or a few');
    expect(MONEY_ADDS_UP_TEXT.resolutionLine).toContain("skip its adjustments after threads");
  });

  it("is production's request byte for byte where the block isn't taken, and an eval variant of turns", () => {
    const story = threadBeat(1, { ...LEARNING, category: "flexible" });
    expect(moneyAddsUpRequest(story, { b: true }).prompt).toBe(beatStep.request(story).prompt);
    const switchTurn = laterSwitchBeat(1, LEARNING);
    expect(requestText(requestFor("moneyAddsUpB", { role: "beat", story: switchTurn }))).toBe(moneyAddsUpRequest(switchTurn, { b: true }).prompt);
    expect(() => requestFor("moneyAddsUpB", { role: "switch", story: switchTurn })).toThrow(/does not cover role switch/);
  });
});

describe("the eval variant", () => {
  it("sends the request with production's turn limits for the player count", () => {
    for (const players of [1, 3]) {
      const story = laterSwitchBeat(players, LEARNING);
      const request = requestFor("moneyAddsUp", { role: "beat", story });
      expect(requestText(request)).toBe(moneyAddsUpRequest(story).prompt);
      expect(callLimitsOf(request)).toEqual(productionCallLimits("beat", players));
    }
  });

  it("covers turns only", () => {
    expect(() => requestFor("moneyAddsUp", { role: "thread", story: threadBeat(1, LEARNING) })).toThrow(/does not cover role thread/);
  });
});
