import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { Story } from "core/models/Story.js";
import type { Beat, StoryPhase, ThreadAnalysis } from "core/types/index.js";
import { getThreadType } from "core/types/index.js";
import {
  RECORDED_RESULT_TEXT,
  recordedExplorationThreads,
  recordedResultRequest,
  takesRecordedResult,
} from "../../../../../src/game/services/storyTextRounds/recordedResult.js";
import { choiceResultRequest } from "../../../../../src/game/services/storyTextRounds/choiceResult.js";
import { beatStep } from "../../../../../src/game/services/storyTextSteps.js";
import { evalFiles } from "../../../../../src/evals/textModelEval/evalFiles.js";
import { caseStory } from "../../../../../src/evals/textModelEval/cases.js";
import { callLimitsOf, requestFor, requestText } from "../../../../../src/evals/textModelEval/variants.js";
import { productionCallLimits } from "../../../../../src/shared/llm/chatModel.js";
import { endingBeat, firstSwitchBeat, laterSwitchBeat, threadBeat } from "../../../../helpers/promptStories.js";
import { createMockMultiplayerStory, createMockStory } from "../../../../helpers/testHelpers.js";
import { beatGeneration, switchAnalysis, thread } from "../../../../helpers/textFixtures.js";
import { productionThen } from "../../../../helpers/adoptedDeltas.js";

/*
 * The turn after an exploration step tells the result the game recorded (eval
 * only; fix 2 of the second playthroughs' review, 2026-09-30). At food trucks
 * turn 21 Suri chose to make the cabinet's verified operation a condition and
 * wait; turn 22's text kept the ingredients out and stored facts saying so.
 * At turn 22 she chose result 2, to use the cabinet within disclosed
 * safeguards, and the game recorded it; the switch turn 23 told result 1 ("No
 * ingredients stored here until the operating temperature is independently
 * verified"), its milestone blended the two and the ending followed. The turn
 * is shown the chosen option and its resolution, but it is also told to
 * continue where the previous beat ended and to make the milestone specific
 * from the thread's text, and nothing says that a choice which changes course
 * holds over the earlier text and facts. The variant is production's turn with
 * a line where the turn narrates an exploration step (a chapter step after
 * one, a switch turn or ending after an exploration chapter) and, where it
 * writes that chapter's milestone, a line on the milestone; production's
 * request byte for byte everywhere else.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));
const occurrences = (text: string, passage: string) => text.split(passage).length - 1;
const slotsOf = (players: number) => Array.from({ length: players }, (_, i) => `player${i + 1}`);

const CASES_DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const frozen = fs.existsSync(path.join(CASES_DIR, "cases", "cases.json")) ? evalFiles(CASES_DIR).readCases() : [];

function history(slot: string, length: number): Beat[] {
  return Array.from({ length }, (_, i) => ({ ...beatGeneration({ text: `${slot} text ${i}`, summary: `${slot} summary ${i}` }), choice: 1, resolution: "resolution2" as const }));
}

function storyAt(players: number, turns: number, phases: StoryPhase[], maxTurns = 20): Story {
  const base = (players > 1 ? createMockMultiplayerStory(players) : createMockStory()).getState();
  const withHistory = Object.fromEntries(Object.entries(base.players).map(([slot, player]) => [slot, { ...player, beatHistory: history(slot, turns) }]));
  return Story.create({ ...base, players: withHistory, storyPhases: phases, maxTurns });
}

/** A chapter of the given kinds (one thread per entry, each with its players), `done` steps played. */
function chapter(kinds: ["exploration" | "challenge", string[]][], duration: number, firstBeatIndex: number, done: number): ThreadAnalysis {
  return {
    relevantSwitchAndThreadInstructions: "",
    coordinationPatternSummary: "",
    duration,
    firstBeatIndex,
    threads: kinds.map(([kind, players], i) => {
      const t = thread(kind, duration, firstBeatIndex, players);
      const resolved = kind === "exploration" ? (["resolution1", "resolution2", "resolution3"] as const) : (["favorable", "mixed", "unfavorable"] as const);
      return {
        ...t,
        id: `thread_${i}`,
        progression: t.progression.map((step, k) => ({ ...step, resolution: k < done ? resolved[k % 3] : null })),
        ...(done === duration ? { resolution: resolved[(done - 1) % 3], milestone: `Milestone of thread ${i}` } : {}),
      };
    }),
  };
}

/** Step 2 of 3 of a chapter (step 1 played). */
const stepAfter = (kinds: ["exploration" | "challenge", string[]][], players = 1) => storyAt(players, 3, [switchAnalysis(slotsOf(players), 1), chapter(kinds, 3, 2, 1)]);
/** The switch turn after a two-step chapter. */
const switchAfter = (kinds: ["exploration" | "challenge", string[]][], players = 1) => storyAt(players, 3, [switchAnalysis(slotsOf(players), 0), chapter(kinds, 2, 1, 2), switchAnalysis(slotsOf(players), 3)]);
/** The ending after a two-step chapter. */
const endingAfter = (kinds: ["exploration" | "challenge", string[]][], players = 1) => storyAt(players, 3, [switchAnalysis(slotsOf(players), 0), chapter(kinds, 2, 1, 2)], 3);

/** The prompt with the variant's insertions taken out again. */
const withoutInsertions = (prompt: string) => [`\n${RECORDED_RESULT_TEXT.narrateLine}`, RECORDED_RESULT_TEXT.milestoneLine].reduce((text, passage) => text.split(passage).join(""), prompt);

function expectBaseAround(story: Story) {
  const [variant, base] = [recordedResultRequest(story), choiceResultRequest(story)];
  expect(withoutInsertions(variant.prompt)).toBe(base.prompt);
  expect(json(variant.schema)).toBe(json(base.schema));
}

describe("which threads a turn narrates the recorded exploration result of", () => {
  it("reads an exploration thread whose step the turn follows: a chapter step after one, a switch turn or ending after the chapter", () => {
    expect(recordedExplorationThreads(stepAfter([["exploration", ["player1"]]])).map((t) => t.id)).toEqual(["thread_0"]);
    expect(recordedExplorationThreads(switchAfter([["exploration", ["player1"]]])).map((t) => t.id)).toEqual(["thread_0"]);
    expect(recordedExplorationThreads(endingAfter([["exploration", ["player1"]]])).map((t) => t.id)).toEqual(["thread_0"]);
    expect(endingAfter([["exploration", ["player1"]]]).getCurrentBeatType()).toBe("ending");
  });

  it("reads only the exploration threads of a group's chapter", () => {
    const story = switchAfter(
      [
        ["challenge", ["player1"]],
        ["exploration", ["player2"]],
      ],
      2
    );
    expect(recordedExplorationThreads(story).map((t) => [t.id, getThreadType(t)])).toEqual([["thread_1", "exploration"]]);
  });

  it("reads none after a challenge chapter, on a chapter's first step, or on the first turn", () => {
    expect(recordedExplorationThreads(switchAfter([["challenge", ["player1"]]]))).toEqual([]);
    expect(recordedExplorationThreads(threadBeat(1))).toEqual([]);
    expect(recordedExplorationThreads(storyAt(1, 2, [switchAnalysis(["player1"], 1), chapter([["exploration", ["player1"]]], 3, 2, 0)]))).toEqual([]);
    expect(recordedExplorationThreads(firstSwitchBeat(1))).toEqual([]);
    expect(recordedExplorationThreads(laterSwitchBeat(1))).toEqual([]);
    expect(takesRecordedResult(laterSwitchBeat(1))).toBe(false);
  });
});

describe("the variant on a chapter step after an exploration step", () => {
  it("adds the line after the narrative-feedback line once, and no milestone line", () => {
    const story = stepAfter([["exploration", ["player1"]]]);
    const prompt = recordedResultRequest(story).prompt;
    expect(occurrences(prompt, RECORDED_RESULT_TEXT.narrateLine)).toBe(1);
    expect(prompt).toContain(`${RECORDED_RESULT_TEXT.narrateAnchor}\n${RECORDED_RESULT_TEXT.narrateLine}`);
    expect(prompt).not.toContain(RECORDED_RESULT_TEXT.milestoneLine);
    // The exploration step carries production's exploration-order line too: the base is production's request today
    expect(choiceResultRequest(story).prompt).toBe(beatStep.request(story).prompt);
    expectBaseAround(story);
  });
});

describe("the variant on a switch turn or ending after an exploration chapter", () => {
  it("adds the narrative line and the milestone line after the milestone lines, once each", () => {
    for (const story of [switchAfter([["exploration", ["player1"]]]), endingAfter([["exploration", ["player1"]]])]) {
      const prompt = recordedResultRequest(story).prompt;
      expect(occurrences(prompt, RECORDED_RESULT_TEXT.narrateLine)).toBe(1);
      expect(occurrences(prompt, RECORDED_RESULT_TEXT.milestoneLine)).toBe(1);
      expect(prompt).toContain(`${RECORDED_RESULT_TEXT.milestoneAnchor}${RECORDED_RESULT_TEXT.milestoneLine}`);
      expectBaseAround(story);
    }
  });

  it.each([2, 3])("works the same for %s players, one exploration thread beside a challenge", (players) => {
    const kinds: ["exploration" | "challenge", string[]][] = [
      ["challenge", ["player1"]],
      ["exploration", slotsOf(players).slice(1)],
    ];
    const story = switchAfter(kinds, players);
    const prompt = recordedResultRequest(story).prompt;
    expect(occurrences(prompt, RECORDED_RESULT_TEXT.narrateLine)).toBe(1);
    expect(occurrences(prompt, RECORDED_RESULT_TEXT.milestoneLine)).toBe(1);
    expectBaseAround(story);
    expectBaseAround(stepAfter(kinds, players));
  });

  it("says the chosen result holds over the earlier text and facts, a change of course shown, never folded back or blended", () => {
    expect(RECORDED_RESULT_TEXT.narrateLine).toContain("In an Exploration thread");
    expect(RECORDED_RESULT_TEXT.narrateLine).toContain("the player now changes course");
    expect(RECORDED_RESULT_TEXT.narrateLine).toContain("every fact this beat records follows it");
    expect(RECORDED_RESULT_TEXT.milestoneLine).toContain("made more specific from the thread's text");
    expect(RECORDED_RESULT_TEXT.milestoneLine).toContain("never another resolution or a blend of two");
  });
});

describe("production's request byte for byte everywhere else", () => {
  it.each([
    ["a first turn", () => firstSwitchBeat(1)],
    ["a challenge chapter's step", () => threadBeat(1)],
    ["a switch turn after a challenge chapter", () => laterSwitchBeat(1)],
    ["an ending after a challenge chapter", () => endingBeat(1)],
    ["a group's first turn", () => firstSwitchBeat(3)],
    ["a group's challenge step", () => threadBeat(2)],
    ["a group's switch turn after a challenge chapter", () => laterSwitchBeat(2)],
  ] as const)("%s", (_, build) => {
    const story = build();
    const [variant, base] = [recordedResultRequest(story), choiceResultRequest(story)];
    expect(variant.prompt).toBe(base.prompt);
    // An ending as production sent it before the owner's decision of 2026-10-01 on ending milestones
    expect(variant.prompt).toBe(productionThen(beatStep.request(story), story).prompt);
    expect(json(variant.schema)).toBe(json(base.schema));
  });

  (frozen.length ? it : it.skip)("every frozen turn case: production's request around the insertions, which only a turn after an exploration step carries", () => {
    const turns = frozen.filter((c) => c.role === "beat" && c.state);
    expect(turns.length).toBeGreaterThan(50);
    let carried = 0;
    for (const c of turns) {
      const story = caseStory(c);
      const variant = recordedResultRequest(story).prompt;
      const base = choiceResultRequest(story).prompt;
      expect([c.id, withoutInsertions(variant) === base, variant === base]).toEqual([c.id, true, !takesRecordedResult(story)]);
      if (takesRecordedResult(story)) carried++;
    }
    expect(carried).toBeGreaterThan(0);
  });
});

describe("the eval variant", () => {
  it("sends the request with production's turn limits for the player count", () => {
    for (const [players, story] of [
      [1, switchAfter([["exploration", ["player1"]]])],
      [3, switchAfter([["exploration", ["player1", "player2", "player3"]]], 3)],
    ] as const) {
      const request = requestFor("recordedResult", { role: "beat", story });
      expect(requestText(request)).toBe(recordedResultRequest(story).prompt);
      expect(callLimitsOf(request)).toEqual(productionCallLimits("beat", players));
    }
  });

  it("covers turns only", () => {
    expect(() => requestFor("recordedResult", { role: "switch", story: switchAfter([["exploration", ["player1"]]]) })).toThrow(/does not cover role switch/);
  });
});
