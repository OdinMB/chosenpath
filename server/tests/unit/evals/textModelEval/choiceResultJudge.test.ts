import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { Story } from "core/models/Story.js";
import type { StoryPhase, ThreadAnalysis } from "core/types/index.js";
import {
  OPTIONS_CALIBRATION,
  OPTIONS_CHECK,
  RESULTS_CALIBRATION,
  RESULTS_CHECK,
  choiceJudgeCaseId,
  choiceJudgeJobs,
  optionsJudgeRequest,
  renderChoiceResultJudge,
  resultsJudgeRequest,
  scoreChoiceCalibration,
  verdictFrom,
} from "../../../../src/evals/textModelEval/choiceResultJudge.js";
import { JUDGE_ARMS } from "../../../../src/evals/textModelEval/judgedChecks.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import { replayedTurn } from "../../../../src/evals/textModelEval/playthroughReplay.js";
import type { PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { endingBeat, laterSwitchBeat, slotsOf, threadBeat } from "../../../helpers/promptStories.js";
import { createMockMultiplayerStory, createMockStory } from "../../../helpers/testHelpers.js";
import { beatGeneration, beatSet, switchAnalysis, thread, threadAnalysis } from "../../../helpers/textFixtures.js";

/*
 * The choice-result stage's judged checks (2026-09-30), one cheap GPT-6 call
 * each, phrased so yes passes: optionsFollowResults on a player's options at an
 * exploration step (each option carries out the result at its own position,
 * the same action in the same direction), and resultsFitKind on a chapter plan
 * (a challenge or contest result says how the attempt turns out, never the
 * player's choice; an exploration result is the player's choice, never only
 * how others respond). Each is calibrated on turns and plans of the
 * playthroughs read by hand before any judge call.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const RESULTS = { resolution1: "Rikkit lays the ledger open for Sir Bram", resolution2: "Rikkit shows only the verified entries", resolution3: "Rikkit asks Sir Bram to trust him unseen" };

function storyWith(players: number, turns: number, phases: StoryPhase[]): Story {
  const base = (players > 1 ? createMockMultiplayerStory(players) : createMockStory()).getState();
  const history = Array.from({ length: turns }, (_, i) => ({ ...beatGeneration({ text: `beat ${i}` }), choice: 0, resolution: "resolution1" as const }));
  return Story.create({ ...base, players: Object.fromEntries(Object.entries(base.players).map(([slot, p]) => [slot, { ...p, beatHistory: history }])), storyPhases: phases });
}

/** An exploration step (step 2 of 3) for everyone, or one player exploring beside one in a challenge. */
function explorationStep(players = 1, mixed = false): Story {
  const slots = slotsOf(players);
  const exploring = { ...thread("exploration", 3, 2, mixed ? [slots[0]] : slots), id: "explore", question: "Will Sir Bram trust Rikkit's ledger?" };
  exploring.progression = exploring.progression.map((s, i) => ({ ...s, title: `Step ${i + 1}`, question: `Ledger: how does Rikkit show it? (${i + 1})`, possibleResolutions: i === 1 ? RESULTS : s.possibleResolutions, resolution: i === 0 ? ("resolution1" as const) : null }));
  const threads = mixed ? [exploring, { ...thread("challenge", 3, 2, [slots[1]]), id: "fight" }] : [exploring];
  const analysis: ThreadAnalysis = { ...threadAnalysis("exploration", 3, 2, slots), threads };
  return storyWith(players, 3, [switchAnalysis(slots, 1), analysis]);
}

const withOptions = (players: number, texts: string[]) => {
  const beats = beatSet(players);
  for (const slot of slotsOf(players)) (beats as Record<string, unknown>)[slot] = beatGeneration({ options: texts.map((text) => ({ optionType: "exploration" as const, resourceType: "normal" as const, text })) });
  return beats;
};

describe(`${OPTIONS_CHECK}: a player's options at an exploration step against its results`, () => {
  it("shows the step's question and its three results in order, the options in order, and the question", () => {
    const request = optionsJudgeRequest(explorationStep(), withOptions(1, ["Open the ledger", "Show the verified pages", "Ask for trust"]), "player1");
    expect(request).toBeDefined();
    const prompt = request?.prompt ?? "";
    expect(prompt).toContain("Ledger: how does Rikkit show it? (2)");
    expect(prompt).toContain(`Result 1: ${RESULTS.resolution1}\nResult 2: ${RESULTS.resolution2}\nResult 3: ${RESULTS.resolution3}`);
    expect(prompt).toContain("Option 1: Open the ledger\nOption 2: Show the verified pages\nOption 3: Ask for trust");
    expect(prompt).toContain("Chapter question: Will Sir Bram trust Rikkit's ledger?");
    expect(prompt).toContain(`${OPTIONS_CHECK}: Does each option carry out the result at its own position`);
    // The game's rule, and an example from another story
    expect(prompt).toMatch(/records the option by its position/);
    expect(prompt).toMatch(/Mara/);
  });

  it("applies only to a player whose thread explores, on a chapter step, with three options", () => {
    const options = withOptions(2, ["a", "b", "c"]);
    const mixed = explorationStep(2, true);
    expect(optionsJudgeRequest(mixed, options, "player1")).toBeDefined();
    expect(optionsJudgeRequest(mixed, options, "player2")).toBeUndefined();
    for (const story of [threadBeat(1), laterSwitchBeat(1), endingBeat(1)]) expect(optionsJudgeRequest(story, withOptions(1, ["a", "b", "c"]), "player1")).toBeUndefined();
    expect(optionsJudgeRequest(explorationStep(), withOptions(1, ["a", "b"]), "player1")).toBeUndefined();
  });

  it("reads the answer, yes passing", () => {
    expect(verdictFrom({ [OPTIONS_CHECK]: { answer: "yes", evidence: "e" } }, OPTIONS_CHECK)).toBe(true);
    expect(verdictFrom({ [OPTIONS_CHECK]: { answer: "no", evidence: "e" } }, OPTIONS_CHECK)).toBe(false);
    expect(verdictFrom({}, OPTIONS_CHECK)).toBeUndefined();
  });
});

describe(`${RESULTS_CHECK}: a chapter plan's step results against its kind`, () => {
  const plan = (kinds: ("challenge" | "exploration" | "contest")[]): ThreadAnalysis => ({
    ...threadAnalysis(kinds[0], 2, 0),
    threads: kinds.map((kind, i) => ({ ...thread(kind, 2, 0, [`player${i + 1}`], kind === "contest" ? ["player2"] : []), id: `t${i}`, title: `Thread ${i + 1}` })),
  });

  it("shows each thread's kind and every step's results under their names, the last step's as the milestones, and the question", () => {
    const request = resultsJudgeRequest(threadBeat(2), plan(["challenge", "exploration"]));
    const prompt = request?.prompt ?? "";
    expect(prompt).toContain("Thread 1: Thread 1 (a challenge chapter; players: player1)");
    expect(prompt).toContain("Thread 2: Thread 2 (an exploration chapter; players: player2)");
    expect(prompt).toContain("Step 1 of 2: Step 1");
    expect(prompt).toContain("  favorable: good\n  mixed: so-so\n  unfavorable: bad");
    expect(prompt).toContain("  resolution1: one\n  resolution2: two\n  resolution3: three");
    expect(prompt).toMatch(/Step 2 of 2 \(the last step: its results are the chapter's possible milestones\)/);
    expect(prompt).toContain(`${RESULTS_CHECK}: Does every result fit its chapter's kind`);
    expect(resultsJudgeRequest(threadBeat(2), plan(["contest"]))?.prompt).toContain("(a contest chapter; side A: player1; side B: player2)");
  });

  it("applies to a plan with steps only", () => {
    expect(resultsJudgeRequest(threadBeat(1), { ...plan(["challenge"]), threads: [] })).toBeUndefined();
  });
});

describe("the calibration: playthrough turns and plans read by hand before any judge call", () => {
  it("holds both sides of each check, enough to call it reliable, and a few partial items", () => {
    const count = (items: { hand: boolean | "partial" }[]) => [items.filter((i) => i.hand === true).length, items.filter((i) => i.hand === false).length, items.filter((i) => i.hand === "partial").length];
    expect(count(OPTIONS_CALIBRATION)).toEqual([13, 10, 1]);
    expect(count(RESULTS_CALIBRATION)).toEqual([9, 8, 3]);
    const ids = [...OPTIONS_CALIBRATION, ...RESULTS_CALIBRATION].map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("scores agreement with the hand on each side, the samples' agreement, and partial items apart", () => {
    const items = [
      { id: "y1", hand: true as const },
      { id: "y2", hand: true as const },
      { id: "y3", hand: true as const },
      { id: "n1", hand: false as const },
      { id: "n2", hand: false as const },
      { id: "n3", hand: false as const },
      { id: "p", hand: "partial" as const },
    ];
    const judged = [
      { itemId: "y1", samples: [true, true] },
      { itemId: "y2", samples: [true, true] },
      { itemId: "y3", samples: [true, true] },
      { itemId: "n1", samples: [false, false] },
      { itemId: "n2", samples: [false, false] },
      { itemId: "n3", samples: [false, false] },
      { itemId: "p", samples: [true, false] },
    ];
    const score = scoreChoiceCalibration(OPTIONS_CHECK, items, judged);
    expect(score).toMatchObject({ decided: 6, agree: 6, handPasses: 3, handFails: 3, pairs: 7, pairsAgree: 6, partial: { yes: 1, no: 0 }, reliable: false });
    // 6 of 7 samples agree: under the 90% the standard asks
    const flipped = scoreChoiceCalibration(OPTIONS_CHECK, items, judged.map((j) => (j.itemId === "p" ? { ...j, samples: [true, true] } : j)));
    expect(flipped.reliable).toBe(true);
    expect(scoreChoiceCalibration(OPTIONS_CHECK, items, judged.map((j) => (j.itemId === "n1" ? { itemId: "n1", samples: [true, true] } : j))).reliable).toBe(false);
  });

  it("books each judge call under its check, prompt version and key, in the stage's ledger", () => {
    const jobs = choiceJudgeJobs([{ check: OPTIONS_CHECK, key: "k", request: { prompt: "p", schema: {} as never }, samples: 2 }], JUDGE_ARMS[0], "adopted5", "choice-result");
    expect(jobs.map((j) => [j.caseId, j.sample, j.stage])).toEqual([
      [choiceJudgeCaseId(OPTIONS_CHECK, "k"), 1, "choice-result"],
      [choiceJudgeCaseId(OPTIONS_CHECK, "k"), 2, "choice-result"],
    ]);
    expect(choiceJudgeCaseId(OPTIONS_CHECK, "k")).toBe("judge-choice-options-v1-k");
    expect(choiceJudgeCaseId(RESULTS_CHECK, "k")).toBe("judge-choice-results-v1-k");
  });

  it("renders the calibration, the readings and the items of both checks", () => {
    const score = scoreChoiceCalibration(OPTIONS_CHECK, [], []);
    const text = renderChoiceResultJudge({
      checks: [
        { check: OPTIONS_CHECK, items: [], calibration: score, judged: [], readings: [], failures: [] },
        { check: RESULTS_CHECK, items: [], calibration: scoreChoiceCalibration(RESULTS_CHECK, [], []), judged: [], readings: [], failures: [] },
      ],
      spentUsd: 0.01,
      generatedAt: new Date("2026-09-30T20:00:00Z"),
      problems: ["one"],
    });
    expect(text).toMatch(/^# Judged checks: choices and results/);
    expect(text).toContain(`## ${OPTIONS_CHECK}`);
    expect(text).toContain(`## ${RESULTS_CHECK}`);
    expect(text).toContain("- one");
  });
});

const DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const stored: PlayRun[] = fs.existsSync(path.join(DIR, "playthroughs.json")) ? playthroughRunsFrom(JSON.parse(fs.readFileSync(path.join(DIR, "playthroughs.json"), "utf-8"))) : [];

describe("the calibration items on the stored playthroughs (skipped where the output folder is absent)", () => {
  (stored.length ? it : it.skip)("names an exploration step for its player on every options item, and a chapter plan on every results item", () => {
    for (const item of OPTIONS_CALIBRATION) {
      const { before, played } = replayedTurn(stored, item.story, item.turn);
      expect([item.id, optionsJudgeRequest(before, played.reply as never, item.slot) !== undefined]).toEqual([item.id, true]);
    }
    for (const item of RESULTS_CALIBRATION) {
      const { beforePlan, played } = replayedTurn(stored, item.story, item.turn);
      expect([item.id, played.plan?.kind]).toEqual([item.id, "chapter plan"]);
      expect(resultsJudgeRequest(beforePlan, played.plan?.plan as ThreadAnalysis)).toBeDefined();
    }
  });
});
