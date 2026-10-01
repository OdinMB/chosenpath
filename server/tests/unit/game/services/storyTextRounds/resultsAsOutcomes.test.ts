import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { Story } from "core/models/Story.js";
import type { SwitchAnalysis } from "core/types/index.js";
import { GameModes } from "core/types/index.js";
import { RESULTS_AS_OUTCOMES_TEXT, resultsAsOutcomesRequest } from "../../../../../src/game/services/storyTextRounds/resultsAsOutcomes.js";
import { threadStep } from "../../../../../src/game/services/storyTextSteps.js";
import { evalFiles } from "../../../../../src/evals/textModelEval/evalFiles.js";
import { caseStory } from "../../../../../src/evals/textModelEval/cases.js";
import { callLimitsOf, requestFor, requestText } from "../../../../../src/evals/textModelEval/variants.js";
import { productionCallLimits } from "../../../../../src/shared/llm/chatModel.js";
import { plannerV2ThreadRequest } from "../../../../../src/game/services/storyTextRounds/turnRound1Planners.js";
import { threadAnalysisAfterSwitch, firstThreadAnalysis } from "../../../../helpers/promptStories.js";
import { outcome } from "../../../../helpers/textFixtures.js";
import { withPacedLengths } from "../../../../helpers/adoptedDeltas.js";

/*
 * Challenge and contest results say how the attempt turns out, not the
 * player's approach (eval only; fix 5 of the second playthroughs' review,
 * 2026-10-01). Only 13 of the second round's 33 chapter plans passed the
 * calibrated resultsFitKind check, and 14 of the 16 chapters planned after a
 * flavor switch failed it, each by writing the approach the players chose at
 * the switch into its results and milestones: the space pirates' switch picks
 * "coordinated repair", "reserve the scarce parts" and "a scheduled window"
 * came back as "Bex coordinates the work while Jori confirms the right
 * fittings", the estate agents' "separate documented defects from what no one
 * can verify" as "Rory's careful separation of documented defects". Production
 * tells the chapter planner that a flavor choice "sets the approach, not the
 * outcome", its results rule's weak example is only a different decision
 * ("Rikkit bribes the guard instead"), and its milestone fields ask for "an
 * event that happened, naming who did what". The variant is production's
 * chapter planner with the rule's approach sentence, the flavor pick's line
 * and the challenge and contest milestone fields worded so; production's
 * request byte for byte elsewhere.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));
const occurrences = (text: string, passage: string) => text.split(passage).length - 1;
/** A description as it sits inside the JSON schema's text */
const inJson = (text: string) => JSON.stringify(text).slice(1, -1);

const CASES_DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const frozen = fs.existsSync(path.join(CASES_DIR, "cases", "cases.json")) ? evalFiles(CASES_DIR).readCases() : [];

/**
 * The chapter planner after a later switch (turn 4), each player with an outcome of their own and, in a group, a
 * contested shared one; the switch is a flavor switch on `flavorOn` for every player, or else the fixture's topic switch.
 */
function chapterPlanning(players: number, flavorOn?: string): Story {
  const base = threadAnalysisAfterSwitch(players).getState();
  const withOutcomes = Object.fromEntries(Object.entries(base.players).map(([slot, player]) => [slot, { ...player, outcomes: [outcome(`${slot}_own`)] }]));
  const shared =
    players > 1 ? [outcome("shared_sale", { question: "Who sells the house?", possibleResolutions: { sideAWins: "Rory sells it.", mixed: "Neither sells it.", sideBWins: "Nia sells it." } })] : [];
  const phases = base.storyPhases.map((phase, i) => {
    if (i !== base.storyPhases.length - 1) return phase;
    const sw = phase as SwitchAnalysis;
    if (flavorOn) return { ...sw, switches: sw.switches.map((s) => ({ ...s, type: "flavor" as const, outcomeId: flavorOn, question: "How does it go?", topicChoices: [] })) };
    // A topic switch whose directions name their outcomes, as planner v2 writes them
    const directions = ["a", "b", "c"].map((direction) => ({ direction, outcomeId: "player1_own" }));
    return { ...sw, switches: sw.switches.map((s) => ({ ...s, topicChoices: directions.map((d) => `${d.direction} (${d.outcomeId})`), topicDirections: directions })) };
  });
  return Story.create({ ...base, gameMode: players > 1 ? GameModes.Competitive : base.gameMode, players: withOutcomes, sharedOutcomes: shared, storyPhases: phases });
}

const STORIES: [string, () => Story][] = [
  ["one player after a topic switch", () => chapterPlanning(1)],
  ["one player after a flavor switch", () => chapterPlanning(1, "player1_own")],
  ["two players after a topic switch", () => chapterPlanning(2)],
  ["two players after a flavor switch on the contest", () => chapterPlanning(2, "shared_sale")],
  ["three players after a flavor switch on the contest", () => chapterPlanning(3, "shared_sale")],
  ["a group's first chapter", () => firstThreadAnalysis(2)],
];

const { rule, approachLine, flavorAnchor, flavorLine, milestones } = RESULTS_AS_OUTCOMES_TEXT;
const countOf = (story: Story) => (story.isMultiplayer() ? "group" : "single");

/** Production's chapter planner as it stood before the adoption: planner v2f, byte for byte (adoptedPlanners.test.ts held it). */
const measuredBase = (story: Story) => plannerV2ThreadRequest(story, false, { twoSided: true, nearerQuestion: true, stages: true, stepsOnce: true, outcomeResults: true });

/**
 * The measured base's prompt with the variant's two edits made by hand; the variant builds on production's live
 * planner, so since the pacing-clues adoption (later on 2026-10-01) it carries the paced lengths where they narrow.
 */
function expectedPrompt(story: Story): string {
  const base = measuredBase(story).prompt;
  const which = countOf(story);
  return withPacedLengths(base.replace(rule[which], `${rule[which]}${approachLine[which]}`).split(flavorAnchor).join(flavorLine), story);
}

/** The measured base's JSON schema with the milestone descriptions reworded by hand. */
function expectedSchema(story: Story): string {
  const which = countOf(story);
  return milestones[which].reduce((text, edit) => text.split(inJson(edit.from)).join(inJson(edit.to)), json(measuredBase(story).schema));
}

describe("the results-as-outcomes chapter planner", () => {
  it.each(STORIES)("%s: production's prompt as it stood (planner v2f) with the approach sentence after the results rule, and the flavor pick's line reworded", (_, build) => {
    const story = build();
    const production = measuredBase(story).prompt;
    const variant = resultsAsOutcomesRequest(story).prompt;
    const which = countOf(story);
    expect(occurrences(production, rule[which])).toBe(1);
    expect(occurrences(variant, `${rule[which]}${approachLine[which]}`)).toBe(1);
    // The flavor pick's line is reworded wherever production prints it, and nowhere else
    expect(occurrences(variant, flavorAnchor)).toBe(0);
    expect(occurrences(variant, flavorLine)).toBe(occurrences(production, flavorAnchor));
    expect(variant).toBe(expectedPrompt(story));
    // The rule stays in the progression item, before the exploration results' sentence
    expect(variant.indexOf(approachLine[which])).toBeLessThan(variant.indexOf("In exploration threads, each step's three results"));
  });

  it("rewords the flavor pick's line once per player on a flavor switch, and prints none after a topic switch", () => {
    expect(occurrences(resultsAsOutcomesRequest(chapterPlanning(1, "player1_own")).prompt, flavorLine)).toBe(1);
    expect(occurrences(resultsAsOutcomesRequest(chapterPlanning(3, "shared_sale")).prompt, flavorLine)).toBe(3);
    expect(occurrences(resultsAsOutcomesRequest(chapterPlanning(2)).prompt, flavorLine)).toBe(0);
  });

  it.each(STORIES)("%s: production's schema as it stood (planner v2f) with the challenge and contest milestone fields reworded", (_, build) => {
    const story = build();
    const production = json(measuredBase(story).schema);
    const variant = json(resultsAsOutcomesRequest(story).schema);
    for (const edit of milestones[countOf(story)]) {
      expect(production).toContain(inJson(edit.from));
      expect(variant).not.toContain(inJson(edit.from));
      expect(variant).toContain(inJson(edit.to));
    }
    expect(variant).toBe(expectedSchema(story));
  });

  it("rewords the challenge fields for one player and the challenge and contest fields for a group", () => {
    expect(milestones.single.map((m) => m.from)).toEqual([
      "The milestone if the thread ends favorably: an event that happened, naming who did what, sized as the milestone rule says.",
      "The milestone if the thread ends mixed: an event that happened, naming who did what, sized as the milestone rule says.",
      "The milestone if the thread ends unfavorably: an event that happened, naming who did what, sized as the milestone rule says.",
    ]);
    expect(milestones.group.map((m) => m.from)).toEqual([
      ...milestones.single.map((m) => m.from),
      "The milestone if side A wins the thread: an event that happened, naming who did what.",
      "The milestone on a draw: an event that happened, naming who did what.",
      "The milestone if side B wins the thread: an event that happened, naming who did what.",
    ]);
    for (const edit of [...milestones.single, ...milestones.group]) {
      expect(edit.to.startsWith(edit.from.replace(/\.$/, ""))).toBe(true);
      expect(edit.to).toMatch(/never how (the player|the players|its players|their players) went about it\.$/);
    }
  });

  it("says the switch's approach and the step's question are where the thread starts, never what a result restates", () => {
    for (const which of ["single", "group"] as const) {
      expect(approachLine[which]).toContain("(PLAYER DECISIONS)");
      expect(approachLine[which]).toContain("not even as the way");
      expect(approachLine[which]).toContain("the guard waves");
    }
    expect(approachLine.group).toContain("why a side comes out ahead");
    expect(flavorLine).toContain("The choice sets the approach the thread starts from, not the outcome");
    expect(flavorLine).toContain("no step result or milestone restates it");
  });

  it.each(STORIES)("%s: is production's chapter planner byte for byte since the adoption (2026-10-01)", (_, build) => {
    const story = build();
    const production = threadStep.request(story);
    const variant = resultsAsOutcomesRequest(story);
    expect(variant.prompt).toBe(production.prompt);
    expect(json(variant.schema)).toBe(json(production.schema));
  });

  it("assembles the reply as production does", () => {
    for (const story of [chapterPlanning(1, "player1_own"), chapterPlanning(2, "shared_sale")]) {
      const reply = story.isMultiplayer() ? { grouping: "together", duration: 2, threads: [] } : { thread: { kind: "challenge", title: "T", steps: [], finalStep: {}, possibleMilestones: {} } };
      expect(resultsAsOutcomesRequest(story).assemble(reply)).toEqual(threadStep.request(story).assemble(reply));
    }
  });

  (frozen.length ? it : it.skip)("every frozen chapter-planning case: the measured base with the edits, and nothing else; production's request since the adoption", () => {
    const threads = frozen.filter((c) => c.role === "thread" && c.state);
    expect(threads.length).toBeGreaterThan(0);
    for (const c of threads) {
      const story = caseStory(c, false);
      const variant = resultsAsOutcomesRequest(story);
      expect([c.id, variant.prompt === expectedPrompt(story), json(variant.schema) === expectedSchema(story)]).toEqual([c.id, true, true]);
      expect([c.id, variant.prompt === threadStep.request(story).prompt]).toEqual([c.id, true]);
    }
  });
});

describe("the eval variant", () => {
  it("sends the chapter planner with production's limits for the player count, for the chapter planner only", () => {
    for (const players of [1, 2, 3]) {
      const story = chapterPlanning(players, players > 1 ? "shared_sale" : "player1_own");
      const request = requestFor("resultsAsOutcomes", { role: "thread", story });
      expect(requestText(request)).toBe(resultsAsOutcomesRequest(story).prompt);
      expect(callLimitsOf(request)).toEqual(productionCallLimits("threadAnalysis", players));
      expect(callLimitsOf(requestFor("adopted", { role: "thread", story }))).toEqual(callLimitsOf(request));
    }
    for (const role of ["beat", "switch"] as const) expect(() => requestFor("resultsAsOutcomes", { role, story: chapterPlanning(1) })).toThrow(/does not cover/);
  });
});
