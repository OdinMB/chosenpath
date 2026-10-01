import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { Story } from "core/models/Story.js";
import {
  LATE_PACING_TEXT,
  isLatePart,
  latePacingRequest,
  mostThreads,
  neededAfterChapter,
  pacedLengths,
  pacedLengthsFor,
  pacingCluesRequest,
  switchPacingProblem,
} from "../../../../../src/game/services/storyTextRounds/latePacing.js";
import type { SwitchAnalysis } from "core/types/index.js";
import { allowedLengths, fewestThreads, turnsLeft } from "../../../../../src/game/services/pacing.js";
import { beatStep, switchStep, threadStep } from "../../../../../src/game/services/storyTextSteps.js";
import { evalFiles } from "../../../../../src/evals/textModelEval/evalFiles.js";
import { caseStory } from "../../../../../src/evals/textModelEval/cases.js";
import { callLimitsOf, requestFor, requestText } from "../../../../../src/evals/textModelEval/variants.js";
import { productionCallLimits } from "../../../../../src/shared/llm/chatModel.js";
import { endingBeat, firstSwitchBeat, laterSwitchBeat, switchAnalysisAfterThread, threadAnalysisAfterSwitch, threadBeat } from "../../../../helpers/promptStories.js";
import { outcome, switchAnalysis } from "../../../../helpers/textFixtures.js";

/*
 * Pacing so the story's last chapter still has a milestone to settle, story
 * instructions ranked below pacing, and planted details paid off rather than
 * piled up (eval only; fix 8 of the second playthroughs' review, 2026-10-01).
 * Found in the stored stories: in three of the four 25-turn stories every
 * outcome was complete before the last chapter (New Avalon and the food
 * trucks: the chapter planned at turn 17 took 3 beats where only 4 leave as
 * few threads as milestones; the estate agents: turn 13 took 2 where 3 or 4
 * would), so the last chapter settled nothing; in the space pirates' story a
 * stat threshold's instruction gave two chapters to the complete ship while
 * the scout's own outcome waited; and every turn is asked to plant a hint,
 * none to pay one off. The variant: the chapter planner's allowed lengths
 * narrowed to those whose threads after it match the milestones still needed
 * (in the PACING line and the plan check), the switch planner's priority step
 * keeping a milestone for the last thread and ranking a forced situation
 * below a player's needed milestones, and the turn's hint line planting early
 * and paying off late (the interludes and the ending too); production's
 * requests byte for byte elsewhere.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));
const occurrences = (text: string, passage: string) => text.split(passage).length - 1;

const CASES_DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const frozen = fs.existsSync(path.join(CASES_DIR, "cases", "cases.json")) ? evalFiles(CASES_DIR).readCases() : [];

describe("the threads a number of turns holds", () => {
  it("mostThreads: switch-and-two-beat threads, the rest absorbed by longer chapters; none in 1 or 2 turns", () => {
    expect([0, 3, 4, 5, 6, 7, 8, 9, 12, 13].map((n) => mostThreads(n))).toEqual([0, 1, 1, 1, 2, 2, 2, 3, 4, 4]);
    expect(mostThreads(1)).toBeUndefined();
    expect(mostThreads(2)).toBeUndefined();
  });

  it("never fewer than production's fewestThreads", () => {
    for (let n = 3; n <= 25; n++) expect(mostThreads(n)!).toBeGreaterThanOrEqual(fewestThreads(n)!);
  });
});

describe("pacedLengthsFor: the allowed lengths whose threads after them match the milestones still needed", () => {
  it("New Avalon and the food trucks at turn 17 (9 turns left, one milestone still needed after the chapter): only 4 beats", () => {
    expect(pacedLengthsFor(9, 1)).toEqual({ lengths: [4], narrowed: "longer" });
  });

  it("the estate agents at turn 13 (13 left, two still needed after it): 3 or 4, not 2", () => {
    expect(pacedLengthsFor(13, 2)).toEqual({ lengths: [3, 4], narrowed: "longer" });
  });

  it("a short story with more milestones than four beats leave room for: shorter (the lemonade story's turn 2)", () => {
    expect(pacedLengthsFor(9, 2)).toEqual({ lengths: [2, 3], narrowed: "shorter" });
  });

  it("leaves production's lengths where every one fits, or where none does better (the space pirates' turn 10)", () => {
    expect(pacedLengthsFor(24, 5)).toEqual({ lengths: allowedLengths(24) });
    expect(pacedLengthsFor(17, 3)).toEqual({ lengths: allowedLengths(17) });
    expect(pacedLengthsFor(16, 2)).toEqual({ lengths: allowedLengths(16) });
    expect(pacedLengthsFor(6, 1)).toEqual({ lengths: allowedLengths(6) });
  });

  it("never adds a length production's rule doesn't allow", () => {
    for (let left = 2; left <= 25; left++) for (let need = 0; need <= 8; need++) expect(allowedLengths(left)).toEqual(expect.arrayContaining(pacedLengthsFor(left, need).lengths));
  });
});

/** A chapter planner's story after a switch, with these outcomes and this length, at turn 5 (4 turns written). */
const planning = (players: number, maxTurns: number, outcomes = [outcome("shared_main", { intendedNumberOfMilestones: 3 }), outcome("shared_side", { intendedNumberOfMilestones: 1 })]) =>
  threadAnalysisAfterSwitch(players, { maxTurns, sharedOutcomes: outcomes });

describe("the milestones still needed after the chapter, the most any player has", () => {
  it("counts the player's outcomes less one on the outcome their pick sets (a single player's fallback: the most needed)", () => {
    // main 0 of 3 is picked (the fallback), side 0 of 1: 2 + 1 after the chapter
    expect(neededAfterChapter(planning(1, 13))).toBe(3);
  });

  it("is the most any player still needs", () => {
    expect(neededAfterChapter(planning(2, 13))).toBe(4);
  });
});

describe("the chapter planner's PACING line", () => {
  // 9 turns left at turn 5 of 13; one milestone still needed after the chapter
  const narrowed = () => planning(1, 13, [outcome("shared_main", { intendedNumberOfMilestones: 2 })]);

  it("names the narrowed lengths and why, once, in place of production's line; the plan check reads the same lengths", () => {
    const story = narrowed();
    expect(turnsLeft(story)).toBe(9);
    expect(pacedLengths(story)).toEqual({ lengths: [4], narrowed: "longer" });
    const production = threadStep.request(story);
    const variant = latePacingRequest(story, "thread");
    expect(production.prompt).toContain("Allowed lengths for this thread: 2, 3 or 4 beats.");
    expect(variant.prompt).toContain(`Allowed lengths for this thread: 4 beats. ${LATE_PACING_TEXT.longer}`);
    expect(occurrences(variant.prompt, "Allowed lengths for this thread:")).toBe(1);
    expect(variant.prompt.replace(`Allowed lengths for this thread: 4 beats. ${LATE_PACING_TEXT.longer}`, "Allowed lengths for this thread: 2, 3 or 4 beats.")).toBe(production.prompt);
    expect(json(variant.schema)).toBe(json(production.schema));
  });

  it("says why a shorter chapter where more milestones are needed than longer ones leave threads for", () => {
    const story = planning(1, 13, [outcome("shared_main", { intendedNumberOfMilestones: 3 }), outcome("shared_side", { intendedNumberOfMilestones: 2 })]);
    expect(pacedLengths(story)).toEqual({ lengths: [2, 3], narrowed: "shorter" });
    expect(latePacingRequest(story, "thread").prompt).toContain(`Allowed lengths for this thread: 2 or 3 beats. ${LATE_PACING_TEXT.shorter}`);
  });

  it("is production's request byte for byte where nothing narrows, and at the story's last chapter", () => {
    for (const story of [planning(1, 25), planning(1, 7)]) {
      expect(pacedLengths(story).narrowed).toBeUndefined();
      expect(latePacingRequest(story, "thread").prompt).toBe(threadStep.request(story).prompt);
    }
  });
});

describe("the switch planner's priority step", () => {
  it.each([
    ["one player after a chapter", () => switchAnalysisAfterThread(1)],
    ["three players after a chapter", () => switchAnalysisAfterThread(3)],
    ["one player's opening switch", () => firstSwitchBeat(1)],
  ] as const)("%s: production's step b with its last sentence replaced, once", (_, build) => {
    const story = build();
    const production = switchStep.request(story);
    const variant = latePacingRequest(story, "switch");
    expect(occurrences(production.prompt, LATE_PACING_TEXT.stepB)).toBe(1);
    expect(occurrences(variant.prompt, LATE_PACING_TEXT.stepBVariant)).toBe(1);
    expect(variant.prompt.replace(LATE_PACING_TEXT.stepBVariant, LATE_PACING_TEXT.stepB)).toBe(production.prompt);
    expect(json(variant.schema)).toBe(json(production.schema));
  });

  it("keeps a milestone for the last thread and ranks a forced situation below a player's needed milestones", () => {
    const step = LATE_PACING_TEXT.stepBVariant;
    expect(step).toContain("When more threads are left than milestones still needed, the story's last thread must still have a milestone to settle");
    expect(step).toContain("never takes a thread from a player who has no thread to spare");
    expect(step.startsWith(LATE_PACING_TEXT.stepB.split(" A complete outcome is offered")[0])).toBe(true);
  });

  it("B (the fix-and-retest): the variant's step b with the story's instructions ranked below a player's needed milestones, once; nothing else changes", () => {
    for (const build of [() => switchAnalysisAfterThread(1), () => switchAnalysisAfterThread(2)]) {
      const story = build();
      const variant = latePacingRequest(story, "switch");
      const b = latePacingRequest(story, "switch", { b: true });
      expect(occurrences(b.prompt, LATE_PACING_TEXT.stepBVariantB)).toBe(1);
      expect(b.prompt.replace(LATE_PACING_TEXT.stepBVariantB, LATE_PACING_TEXT.stepBVariant)).toBe(variant.prompt);
      expect(json(b.schema)).toBe(json(variant.schema));
    }
    expect(LATE_PACING_TEXT.stepBVariantB.startsWith(LATE_PACING_TEXT.stepBVariant)).toBe(true);
    expect(LATE_PACING_TEXT.stepBVariantB).toContain("SWITCH/THREAD INSTRUCTIONS rank below");
    expect(LATE_PACING_TEXT.stepBVariantB).toContain("never puts a complete outcome in place of a milestone a player still needs");
  });

  it("B leaves the chapter planner and the turn as the variant writes them", () => {
    const sw = threadAnalysisAfterSwitch(1, { maxTurns: 13, sharedOutcomes: [outcome("shared_main", { intendedNumberOfMilestones: 2 })] });
    expect(latePacingRequest(sw, "thread", { b: true }).prompt).toBe(latePacingRequest(sw, "thread").prompt);
    const turn = threadBeat(1, { maxTurns: 5 });
    expect(latePacingRequest(turn, "beat", { b: true }).prompt).toBe(latePacingRequest(turn, "beat").prompt);
  });

  it("is production's request where step b isn't printed: a group's opening switch", () => {
    const story = firstSwitchBeat(2);
    expect(switchStep.request(story).prompt).not.toContain(LATE_PACING_TEXT.stepB);
    expect(latePacingRequest(story, "switch").prompt).toBe(switchStep.request(story).prompt);
  });
});

/** A turn in the story's late part: turn 4 of 5 (three written), past two thirds. */
const late = (players: number) => threadBeat(players, { maxTurns: 5 });
/** A turn early in the story: turn 4 of 25. */
const early = (players: number) => threadBeat(players, { maxTurns: 25 });

describe("the turn: plant early, pay off late", () => {
  it("the late part starts past two thirds of the story's turns", () => {
    expect(isLatePart(late(1))).toBe(true);
    expect(isLatePart(early(1))).toBe(false);
    expect(isLatePart(laterSwitchBeat(1, { maxTurns: 25 }))).toBe(false);
    expect(isLatePart(laterSwitchBeat(1, { maxTurns: 5 }))).toBe(true);
  });

  it.each([1, 3])("early (%i players): the hint tied to something a later beat can explain; nothing else changes", (players) => {
    const story = early(players);
    const production = beatStep.request(story);
    const variant = latePacingRequest(story, "beat");
    expect(occurrences(variant.prompt, LATE_PACING_TEXT.hintEarly)).toBe(1);
    expect(variant.prompt.replace(LATE_PACING_TEXT.hintEarly, LATE_PACING_TEXT.hint)).toBe(production.prompt);
    expect(json(variant.schema)).toBe(json(production.schema));
  });

  it.each([1, 3])("late (%i players): no new mystery, an earlier one explained; the interludes the same", (players) => {
    const story = late(players);
    const production = beatStep.request(story);
    const variant = latePacingRequest(story, "beat");
    expect(occurrences(variant.prompt, LATE_PACING_TEXT.hintLate)).toBe(1);
    expect(occurrences(variant.prompt, LATE_PACING_TEXT.interludeLate)).toBe(1);
    expect(variant.prompt).toContain(`${LATE_PACING_TEXT.interludeAnchor}${LATE_PACING_TEXT.interludeLate}`);
    const back = variant.prompt.replace(LATE_PACING_TEXT.hintLate, LATE_PACING_TEXT.hint).replace(LATE_PACING_TEXT.interludeLate, "");
    expect(back).toBe(production.prompt);
  });

  it.each([1, 2])("the ending (%i players): recurring unexplained details explained, never beyond an outcome's milestones", (players) => {
    const story = endingBeat(players);
    const production = beatStep.request(story);
    const variant = latePacingRequest(story, "beat");
    expect(variant.prompt).toContain(`${LATE_PACING_TEXT.endingAnchor}${LATE_PACING_TEXT.endingLine}`);
    expect(variant.prompt.replace(LATE_PACING_TEXT.endingLine, "")).toBe(production.prompt);
    expect(LATE_PACING_TEXT.endingLine).toContain("without settling any outcome beyond its milestones");
  });

  it("the first turn is production's: it plants nothing", () => {
    const story = firstSwitchBeat(1);
    expect(latePacingRequest(story, "beat").prompt).toBe(beatStep.request(story).prompt);
  });

  (frozen.length ? it : it.skip)("every frozen turn case: production's request around the variant's lines", () => {
    const turns = frozen.filter((c) => c.role === "beat" && c.state);
    expect(turns.length).toBeGreaterThan(50);
    for (const c of turns) {
      const story: Story = caseStory(c);
      const variant = latePacingRequest(story, "beat").prompt;
      const back = [
        [LATE_PACING_TEXT.hintEarly, LATE_PACING_TEXT.hint],
        [LATE_PACING_TEXT.hintLate, LATE_PACING_TEXT.hint],
        [LATE_PACING_TEXT.interludeLate, ""],
        [LATE_PACING_TEXT.endingLine, ""],
      ].reduce((text, [from, to]) => text.split(from).join(to), variant);
      expect([c.id, back === beatStep.request(story).prompt]).toEqual([c.id, true]);
    }
  });
});

/*
 * The pacing-clues stage's variant (2026-10-01, fix 8's retest in whole short
 * playthroughs, the coordinator's call after the owner's decisions): the
 * fix-and-retest's planners (the paced lengths; step b with the story's
 * instructions ranked below a player's needed milestones) and, of the turn's
 * lines, only the late part's: no new mystery, an earlier one explained where it
 * fits, the interludes too. An early turn's hint and the ending stay
 * production's: the early line had no reading of its own, and the ending line
 * moved nothing (0 of 18 -> 1 of 18).
 */
describe("pacingClues: B's planners and the late part's clue lines only", () => {
  it.each([1, 2, 3])("the switch planner is B's (%i players)", (players) => {
    const story = switchAnalysisAfterThread(players);
    expect(pacingCluesRequest(story, "switch").prompt).toBe(latePacingRequest(story, "switch", { b: true }).prompt);
    expect(json(pacingCluesRequest(story, "switch").schema)).toBe(json(switchStep.request(story).schema));
  });

  it("the chapter planner is the variant's: the paced lengths where they narrow, production's elsewhere", () => {
    const narrowed = planning(1, 13, [outcome("shared_main", { intendedNumberOfMilestones: 2 })]);
    expect(pacingCluesRequest(narrowed, "thread").prompt).toBe(latePacingRequest(narrowed, "thread").prompt);
    expect(pacingCluesRequest(narrowed, "thread").prompt).toContain(LATE_PACING_TEXT.longer);
    const wide = planning(1, 25);
    expect(pacingCluesRequest(wide, "thread").prompt).toBe(threadStep.request(wide).prompt);
  });

  it.each([1, 3])("a late turn (%i players): the late lines, as the variant writes them", (players) => {
    const story = late(players);
    const variant = pacingCluesRequest(story, "beat");
    expect(variant.prompt).toBe(latePacingRequest(story, "beat").prompt);
    expect(occurrences(variant.prompt, LATE_PACING_TEXT.hintLate)).toBe(1);
    expect(occurrences(variant.prompt, LATE_PACING_TEXT.interludeLate)).toBe(1);
    expect(json(variant.schema)).toBe(json(beatStep.request(story).schema));
  });

  it.each([1, 3])("an early turn (%i players): production's request byte for byte, no early hint line", (players) => {
    const story = early(players);
    expect(pacingCluesRequest(story, "beat").prompt).toBe(beatStep.request(story).prompt);
    expect(pacingCluesRequest(story, "beat").prompt).not.toContain(LATE_PACING_TEXT.hintEarly);
  });

  it.each([1, 2])("the ending (%i players) and the first turn: production's request byte for byte", (players) => {
    for (const story of [endingBeat(players), firstSwitchBeat(players)]) {
      expect(pacingCluesRequest(story, "beat").prompt).toBe(beatStep.request(story).prompt);
    }
  });

  (frozen.length ? it : it.skip)("every frozen turn case: production's request around the late lines, and no other line", () => {
    const turns = frozen.filter((c) => c.role === "beat" && c.state);
    for (const c of turns) {
      const story: Story = caseStory(c);
      const variant = pacingCluesRequest(story, "beat").prompt;
      expect([c.id, variant.includes(LATE_PACING_TEXT.hintEarly) || variant.includes(LATE_PACING_TEXT.endingLine)]).toEqual([c.id, false]);
      const back = variant.split(LATE_PACING_TEXT.hintLate).join(LATE_PACING_TEXT.hint).split(LATE_PACING_TEXT.interludeLate).join("");
      expect([c.id, back === beatStep.request(story).prompt]).toEqual([c.id, true]);
    }
  });

  it("the eval variant sends them with production's limits for each role and player count", () => {
    for (const players of [1, 3]) {
      const turn = late(players);
      expect(requestText(requestFor("pacingClues", { role: "beat", story: turn }))).toBe(pacingCluesRequest(turn, "beat").prompt);
      expect(callLimitsOf(requestFor("pacingClues", { role: "beat", story: turn }))).toEqual(productionCallLimits("beat", players));
      const sw = switchAnalysisAfterThread(players);
      expect(requestText(requestFor("pacingClues", { role: "switch", story: sw }))).toBe(pacingCluesRequest(sw, "switch").prompt);
      expect(callLimitsOf(requestFor("pacingClues", { role: "switch", story: sw }))).toEqual(productionCallLimits("switchAnalysis", players));
      const plan = threadAnalysisAfterSwitch(players);
      expect(requestText(requestFor("pacingClues", { role: "thread", story: plan }))).toBe(pacingCluesRequest(plan, "thread").prompt);
      expect(callLimitsOf(requestFor("pacingClues", { role: "thread", story: plan }))).toEqual(productionCallLimits("threadAnalysis", players));
    }
    expect(() => requestFor("pacingClues", { role: "setup", setup: { premise: "x", playerCount: 1, gameMode: "singlePlayer" as never, maxTurns: 10 } })).toThrow(/does not cover role setup/);
  });
});

/*
 * The pacing-clues stage's fix-and-retest (2026-10-01): in its short
 * playthroughs step b's sentences did not hold at the switches that decide the
 * last chapter. The food trucks' last switch gave both players' one remaining
 * thread to the complete contract again (the setup's final-thread rule, 1 of 2
 * runs), and the space pirates' switch with a thread to spare let the scout's
 * last milestone go before the last thread (2 of 2), whose chapter then settled
 * nothing. The retest reads each switch plan against PACING's arithmetic in the
 * plan check (switchPacingProblem), worth one retry told the problem, never a
 * reason to fail the turn.
 */
describe("switchPacingProblem: a switch plan read against PACING's arithmetic", () => {
  const PENDING = "outcome_1";
  /** A single player's switch after a chapter on outcome_1 (pending, its one milestone), the main outcome 1 of 2: this many turns in all. */
  const atSwitch = (maxTurns: number, mainIntended = 2) =>
    switchAnalysisAfterThread(1, {
      maxTurns,
      sharedOutcomes: [outcome(PENDING, { intendedNumberOfMilestones: 1 }), outcome("main", { intendedNumberOfMilestones: mainIntended, milestones: ["The first stage"] })],
    });
  const plan = (story: Story, outcomeId: string): SwitchAnalysis => {
    const base = switchAnalysis(story.getPlayerSlots());
    return { ...base, switches: [{ ...base.switches[0], type: "flavor", outcomeId, question: "How?", topicChoices: [] }] };
  };

  it("one thread left, the player one milestone short, offered only a complete outcome: the milestone would stay unfinished", () => {
    const story = atSwitch(7);
    expect(turnsLeft(story)).toBe(4);
    expect(switchPacingProblem(story, plan(story, PENDING))).toBe(
      `player1 still needs 1 milestone with 1 thread left, the one this switch opens included, but its switch offers ${PENDING}, already complete: offer player1 an outcome that still needs milestones, and let the story's instructions shape that thread instead`
    );
    expect(switchPacingProblem(story, plan(story, "main"))).toBeUndefined();
  });

  it("a thread to spare, the last milestone offered now: the story's last thread would have none to settle", () => {
    const story = atSwitch(9);
    expect(turnsLeft(story)).toBe(6);
    expect(switchPacingProblem(story, plan(story, "main"))).toBe(LATE_PACING_TEXT.spareProblem);
    // A complete outcome now keeps the last milestone for the last thread
    expect(switchPacingProblem(story, plan(story, PENDING))).toBeUndefined();
  });

  it("asks nothing where every thread is needed, or where a milestone is left for the last thread whichever way the player goes", () => {
    // One thread fits, one milestone needed
    expect(switchPacingProblem(atSwitch(8), plan(atSwitch(8), "main"))).toBeUndefined();
    // Five threads fit, three milestones needed: one taken now leaves two
    expect(switchPacingProblem(atSwitch(25, 4), plan(atSwitch(25, 4), "main"))).toBeUndefined();
    // Every outcome complete: no plan can keep a milestone, so nothing is asked
    expect(switchPacingProblem(atSwitch(9, 1), plan(atSwitch(9, 1), "main"))).toBeUndefined();
  });
});

describe("the eval variant", () => {
  it("sends each role's request with production's limits for the role and player count", () => {
    for (const players of [1, 3]) {
      const turn = late(players);
      expect(requestText(requestFor("latePacing", { role: "beat", story: turn }))).toBe(latePacingRequest(turn, "beat").prompt);
      expect(callLimitsOf(requestFor("latePacing", { role: "beat", story: turn }))).toEqual(productionCallLimits("beat", players));
      const sw = switchAnalysisAfterThread(players);
      expect(requestText(requestFor("latePacing", { role: "switch", story: sw }))).toBe(latePacingRequest(sw, "switch").prompt);
      expect(callLimitsOf(requestFor("latePacing", { role: "switch", story: sw }))).toEqual(productionCallLimits("switchAnalysis", players));
    }
  });

  it("latePacingB sends B's switch planner and the variant's chapter planner and turn, with production's limits", () => {
    const sw = switchAnalysisAfterThread(2);
    expect(requestText(requestFor("latePacingB", { role: "switch", story: sw }))).toBe(latePacingRequest(sw, "switch", { b: true }).prompt);
    expect(callLimitsOf(requestFor("latePacingB", { role: "switch", story: sw }))).toEqual(productionCallLimits("switchAnalysis", 2));
    const turn = late(1);
    expect(requestText(requestFor("latePacingB", { role: "beat", story: turn }))).toBe(latePacingRequest(turn, "beat").prompt);
  });

  it("covers the story roles only", () => {
    expect(() => requestFor("latePacing", { role: "setup", setup: { premise: "x", playerCount: 1, gameMode: "singlePlayer" as never, maxTurns: 10 } })).toThrow(/does not cover role setup/);
  });
});
