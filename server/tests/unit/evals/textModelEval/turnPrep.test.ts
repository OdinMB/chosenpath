import { jest } from "@jest/globals";
import type { SetOfBeatGenerationSchema } from "core/types/index.js";
import { LEDGER_STAGES, type Caps, type LedgerStage } from "../../../../src/evals/textModelEval/budget.js";
import { caseStory } from "../../../../src/evals/textModelEval/cases.js";
import type { EvalFiles } from "../../../../src/evals/textModelEval/evalFiles.js";
import type { ExecutedCall } from "../../../../src/evals/textModelEval/executor.js";
import { jobEstimateUsd } from "../../../../src/evals/textModelEval/jobPlan.js";
import { JUDGE_ARMS, JUDGE_CALIBRATION, judgeJobs, judgeRequest } from "../../../../src/evals/textModelEval/judgedChecks.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import { judgeCalibrationMode, type PrepContext } from "../../../../src/evals/textModelEval/turnPrep.js";
import { CURRENT_PROMPT_STATE } from "../../../../src/evals/textModelEval/variants.js";
import { repairBeatReply } from "../../../../src/game/services/beatRepairs.js";
import { threadBeat } from "../../../helpers/promptStories.js";
import { beatGeneration, beatSet, challengeOptions } from "../../../helpers/textFixtures.js";
import { evalCase, executed, record } from "./fixtures.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Two of the hand-read turns, both read on one stored chapter step
const TURNS = JUDGE_CALIBRATION.filter((c) => c.id === "S3-luna" || c.id === "S4-luna");
const CASE = evalCase("c", "beat", { state: threadBeat(1).getState() });
const TEXT = "You slip past the guard as the lamps gutter.\n\nMira holds up the torn page. \"Tell me why I shouldn't burn it,\" she says.";
const reply = (): SetOfBeatGenerationSchema =>
  beatSet(1, { player1: { ...beatGeneration({ title: "The Ledger (2/3)", text: TEXT }), options: challengeOptions() } });
const JUDGES = JUDGE_ARMS.map((arm) => arm.key);

/** What one judge's calls on the two turns are estimated at, one sample each. */
function judgeEstimate(armIndex: number): number {
  const story = caseStory(CASE);
  const { reply: repaired } = repairBeatReply(story, reply());
  const turns = TURNS.map((t) => {
    const judged = judgeRequest(story, repaired, t.slot);
    if (!judged) throw new Error(`no judge request for ${t.id}`);
    return { outputId: t.outputId, slot: t.slot, request: judged.request };
  });
  return judgeJobs(turns, JUDGE_ARMS[armIndex], 1, CURRENT_PROMPT_STATE).reduce((sum, j) => sum + jobEstimateUsd(j), 0);
}

/**
 * A judge-calibration context over the two turns. Every reply is unreadable,
 * so each call is re-sent twice and bills its estimate (no usage), like a
 * judge whose replies cost more than planned.
 */
function context(maxSpend: number) {
  const prep: CallRecord[] = [];
  const execute = jest.fn(async (): Promise<ExecutedCall> => executed("invalid-json"));
  const files = {
    readRecords: () => TURNS.map((t) => record({ caseId: "c", group: "beat", outputFile: `outputs/${t.outputId}.json`, costUsd: 0 })),
    readCases: () => [CASE],
    loadOutput: () => reply(),
    readPrepRecords: () => [...prep],
    readProbe: () => undefined,
    readFilterRecords: () => [],
    writeJudgeCalibration: jest.fn(),
  } as unknown as EvalFiles;
  const stageCaps = Object.fromEntries(LEDGER_STAGES.map((stage) => [stage, 100])) as Record<LedgerStage, number>;
  const caps: Caps = { stageCaps, globalCap: 100, maxSpend };
  const ctx: PrepContext = {
    files,
    caps,
    deps: () => ({
      execute,
      record: (r: CallRecord) => prep.push(r),
      now: () => 0,
      sleep: async () => undefined,
      warn: () => undefined,
    }),
    // The CLI's --max-spend rule (refuseIfOverCaps)
    refuse: (_stage, estimate) => {
      if (estimate > maxSpend) throw new Error(`refused: est $${estimate.toFixed(4)} over --max-spend`);
    },
    tpm: 1e9,
    maxInFlight: 1,
    log: () => undefined,
  };
  return { ctx, prep, execute };
}

describe("judgeCalibrationMode --max-spend", () => {
  it("refuses the invocation on every judge's estimate together, before anything is sent", async () => {
    const low = judgeEstimate(0);
    const medium = judgeEstimate(1);
    // Each judge alone fits, both together do not
    const maxSpend = Math.max(low, medium) * 1.01;
    expect(maxSpend).toBeLessThan(low + medium);
    const { ctx, execute } = context(maxSpend);
    await expect(judgeCalibrationMode(ctx, JUDGES, 1)).rejects.toThrow(/refused/);
    expect(execute).not.toHaveBeenCalled();
  });

  it("carries what the earlier judges spent into the later ones' allowance", async () => {
    const maxSpend = (judgeEstimate(0) + judgeEstimate(1)) * 1.01;
    const { ctx, prep } = context(maxSpend);
    await judgeCalibrationMode(ctx, JUDGES, 1);
    expect(prep.length).toBeGreaterThan(0);
    const spent = prep.reduce((sum, r) => sum + r.costUsd, 0);
    expect(spent).toBeLessThanOrEqual(maxSpend);
  });
});
