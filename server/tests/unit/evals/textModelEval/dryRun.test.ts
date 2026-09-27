import { jest } from "@jest/globals";
import { baselineArm } from "../../../../src/evals/textModelEval/arms.js";
import { printDryRun, type DryRunInput } from "../../../../src/evals/textModelEval/dryRun.js";
import type { PlanOptions } from "../../../../src/evals/textModelEval/jobPlan.js";
import { jobKey, type CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import { threadBeat } from "../../../helpers/promptStories.js";
import { evalCase, record } from "./fixtures.js";

beforeEach(() => {
  // Beat prompts log that the mock stories have no story elements
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("printDryRun: the prompt state it plans under", () => {
  const beatCase = evalCase("sp", "beat", { state: threadBeat(1).getState() });
  /** Sample 1 of the Stage 0 baseline on the case, finished under the tag */
  const finishedBaseline = (promptState: string): CallRecord => {
    const armKey = baselineArm("beat").key;
    return record({ jobKey: jobKey("sp", armKey, promptState, 1), promptState, caseId: "sp", armKey, callArmKey: armKey });
  };

  async function dryRun(records: CallRecord[], promptState?: string): Promise<string[]> {
    const lines: string[] = [];
    const input: DryRunInput = {
      outDir: "out",
      records,
      extraSpend: [],
      frozenCases: [beatCase],
      sources: { snapshots: [], templates: [], newStory: () => { throw new Error("frozen cases need no new stories"); } },
      options: (stage, tag, extra): PlanOptions => ({ stage, promptState: tag, roles: ["beat"], mode: "isolated", subset15: false, records, ...extra }),
      promptState,
      tpm: 1_000_000,
      maxInFlight: 6,
      log: (line) => lines.push(line),
    };
    await printDryRun(input);
    return lines;
  }

  /** Open jobs in the Stage 0 baseline row (2 samples on the one case) */
  const openBaselineJobs = (lines: string[]) => {
    const row = lines.map((line) => /^Stage 0 .*baseline \(2 samples, isolated\): (\d+) jobs/.exec(line)).find(Boolean);
    return row ? Number(row[1]) : undefined;
  };

  it("plans under round0 by default, so a record under the retired postfix tag leaves its job open", async () => {
    expect(openBaselineJobs(await dryRun([finishedBaseline("postfix")]))).toBe(2);
    expect(openBaselineJobs(await dryRun([finishedBaseline("round0")]))).toBe(1);
  });

  it("plans under --prompt-state when given, and names the tag it planned under", async () => {
    const lines = await dryRun([finishedBaseline("round0")], "round1");
    expect(openBaselineJobs(lines)).toBe(2);
    expect(lines.some((line) => line.includes("round1"))).toBe(true);
  });

  it("refuses a retired tag, as --run does", async () => {
    await expect(dryRun([], "postfix")).rejects.toThrow(/round0/);
    await expect(dryRun([], "prefix")).rejects.toThrow(/Run A/);
  });
});
