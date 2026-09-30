import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Story } from "core/models/Story.js";
import type { StoryPhase } from "core/types/index.js";
import { CHOICE_LINE_SP_PROMPT_STATE } from "../../../../src/evals/textModelEval/arms.js";
import type { CheckedTurn } from "../../../../src/evals/textModelEval/checkedTurns.js";
import { CHOICE_LINE_ARMS, lineJudgeItems, lineTallies, lineVerdicts, renderChoiceLine } from "../../../../src/evals/textModelEval/choiceLinePrep.js";
import { OPTIONS_CHECK } from "../../../../src/evals/textModelEval/choiceResultJudge.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import type { CheckResult } from "../../../../src/evals/textModelEval/textChecks.js";
import { createMockStory } from "../../../helpers/testHelpers.js";
import { beatGeneration, beatSet, explorationOptions, switchAnalysis, threadAnalysis } from "../../../helpers/textFixtures.js";
import { evalCase, record } from "./fixtures.js";

/*
 * The choice-line-sp stage's report (--choice-line-sp): each reply of a
 * checked turn judged once (the first, and the retry where production's check
 * asked again), the turn read by the reply the game keeps, and per arm the
 * retries, the short replies before and after them, words, sentences and cost.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const [ADOPTED, LINE] = CHOICE_LINE_ARMS;

/** A single player at step 2 of 3 of an exploration chapter. */
function exploringStep(): Story {
  const base = createMockStory().getState();
  const history = Array.from({ length: 3 }, (_, i) => ({ ...beatGeneration({ text: `beat ${i}` }), choice: 0, resolution: "resolution1" as const }));
  const chapter = threadAnalysis("exploration", 3, 2, ["player1"]);
  chapter.threads[0].progression = chapter.threads[0].progression.map((s, i) => ({ ...s, resolution: i === 0 ? ("resolution1" as const) : null }));
  const phases: StoryPhase[] = [switchAnalysis(["player1"], 1), chapter];
  return Story.create({ ...base, players: Object.fromEntries(Object.entries(base.players).map(([slot, p]) => [slot, { ...p, beatHistory: history }])), storyPhases: phases });
}

const rec = (outputId: string, overrides: Partial<CallRecord> = {}) =>
  record({ caseId: "c", armKey: LINE, callArmKey: LINE, promptState: CHOICE_LINE_SP_PROMPT_STATE, stage: "choice-line-sp", baseline: false, outputFile: `outputs/${outputId}.json`, ...overrides });

function turn(overrides: Partial<CheckedTurn> & { sample: number; first: CallRecord }): CheckedTurn {
  return {
    jobKey: `c|${overrides.armKey ?? LINE}|${CHOICE_LINE_SP_PROMPT_STATE}|s${overrides.sample}`,
    promptState: CHOICE_LINE_SP_PROMPT_STATE,
    armKey: LINE,
    caseId: "c",
    players: 1,
    kept: 1,
    firstShort: false,
    firstWithoutOptions: false,
    keptShort: false,
    firstWaitMs: 20_000,
    waitMs: 20_000,
    firstCostUsd: 0.004,
    costUsd: 0.004,
    hangs: 0,
    ...overrides,
  };
}

describe("lineJudgeItems: each reply of a checked turn judged once", () => {
  it("judges every turn's first reply, and the retry where production's check asked again, one call per exploring player", () => {
    const cases = [evalCase("c", "beat", { state: exploringStep().getState() })];
    const reply = { ...beatSet(1), player1: beatGeneration({ options: explorationOptions() }) };
    const turns = [
      turn({ sample: 1, first: rec("f1") }),
      turn({ sample: 2, first: rec("f2", { jobFinal: false, checkedRetry: "short" }), retry: rec("r2", { step: 2, checkedRetry: "short" }), retried: "short", kept: 2 }),
    ];
    const items = lineJudgeItems(turns, cases, () => reply);
    expect(items.map((i) => [i.turn.sample, i.first?.targets.map((t) => t.key), i.retry?.targets.map((t) => t.key)])).toEqual([
      [1, ["f1-player1"], undefined],
      [2, ["f2-player1"], ["r2-player1"]],
    ]);
    expect(items[1].retry?.targets[0].check).toBe(OPTIONS_CHECK);
  });
});

describe("lineVerdicts: the first reply's verdict and the kept reply's", () => {
  const item = (sample: number, kept: CheckedTurn["kept"], retried: boolean) => ({
    turn: turn({ sample, first: rec(`f${sample}`), kept, ...(retried ? { retry: rec(`r${sample}`, { step: 2 }), retried: "short" as const } : {}) }),
    first: { armKey: LINE, caseId: "c", sample, outputId: `f${sample}`, targets: [{ check: OPTIONS_CHECK, key: `f${sample}-player1`, request: {} as never, samples: 1 }] },
    ...(retried ? { retry: { armKey: LINE, caseId: "c", sample, outputId: `r${sample}`, targets: [{ check: OPTIONS_CHECK, key: `r${sample}-player1`, request: {} as never, samples: 1 }] } } : {}),
  });

  it("reads the retry's verdict where the game keeps it, the first's where it keeps the first, and none where the turn fails", () => {
    // The first replies fail, the retries pass
    const answer = (key: string) => key.startsWith("r");
    const { first, kept } = lineVerdicts([item(1, 1, false), item(2, 2, true), item(3, 1, true), item(4, undefined, true)], answer);
    expect(first.map((v) => [v.sample, v.passes])).toEqual([
      [1, false],
      [2, false],
      [3, false],
      [4, false],
    ]);
    expect(kept.map((v) => [v.sample, v.outputId, v.passes])).toEqual([
      [1, "f1", false],
      [2, "r2", true],
      [3, "f3", false],
    ]);
    // Unanswered: no verdict yet
    expect(lineVerdicts([item(2, 2, true)], (key) => (key.startsWith("r") ? undefined : true)).kept).toEqual([]);
  });
});

describe("lineTallies: per arm, the retries and the short replies before and after them", () => {
  it("counts turns, short first replies, retries by kind, short kept replies, failed turns, words, sentences and cost", () => {
    const checks = new Map<string, CheckResult>([
      ["outputs/a1.json", { checks: {}, counts: { words: 300, turnSentences: 18 }, unknownIds: [] }],
      ["outputs/l1.json", { checks: {}, counts: { words: 60, turnSentences: 4 }, unknownIds: [] }],
      ["outputs/l1r.json", { checks: {}, counts: { words: 320, turnSentences: 19 }, unknownIds: [] }],
      ["outputs/l2.json", { checks: {}, counts: { words: 280, turnSentences: 16 }, unknownIds: [] }],
    ]);
    const turns = [
      turn({ sample: 1, armKey: ADOPTED, first: rec("a1", { armKey: ADOPTED }) }),
      turn({ sample: 1, first: rec("l1"), retry: rec("l1r", { step: 2 }), retried: "short", kept: 2, firstShort: true, keptShort: false, waitMs: 50_000, costUsd: 0.008 }),
      turn({ sample: 2, first: rec("l2") }),
    ];
    const [adopted, line] = lineTallies(turns, checks);
    expect(adopted).toMatchObject({ armKey: ADOPTED, turns: 1, firstShort: 0, retried: 0, keptShort: 0, failed: 0, words: { first: 300, kept: 300 }, sentences: { first: 18, kept: 18 } });
    expect(line).toMatchObject({ armKey: LINE, turns: 2, firstShort: 1, retried: 1, retriedBy: { short: 1, noOptions: 0, both: 0 }, keptShort: 0, failed: 0, words: { first: 170, kept: 300 }, sentences: { first: 10, kept: 17.5 } });
    expect(line.costPerTurn.first).toBeCloseTo(0.004);
    expect(line.costPerTurn.kept).toBeCloseTo(0.006);
  });
});

describe("renderChoiceLine", () => {
  it("renders the turns, the retries and the readings", () => {
    const tallies = lineTallies([turn({ sample: 1, first: rec("l1"), retry: rec("l1r", { step: 2 }), retried: "short", kept: 2, firstShort: true })], new Map());
    const text = renderChoiceLine({
      generatedAt: new Date(0),
      tallies,
      options: { first: [{ armKey: LINE, plans: { hits: 1, n: 1 } }], kept: [{ armKey: LINE, plans: { hits: 1, n: 1 } }] },
      firstComparisons: [],
      keptComparisons: [],
      waits: { kept: [], keptBySample: [], first: [] },
      spendUsd: { turns: 0.01, judge: 0.001 },
      problems: [],
    });
    expect(text).toContain("# The exploration line for one player, with production's retry in the loop");
    expect(text).toContain(`| ${LINE} | 1 | 1 of 1 | 1 of 1 (short 1, no options 0, both 0) | 0 of 1 | 0 |`);
    expect(text).toContain("Options at their own result");
  });
});
