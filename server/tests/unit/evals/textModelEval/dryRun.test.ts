import { jest } from "@jest/globals";
import { GameModes } from "core/types/index.js";
import { baselineArm } from "../../../../src/evals/textModelEval/arms.js";
import type { EvalCase } from "../../../../src/evals/textModelEval/cases.js";
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

  async function dryRun(records: CallRecord[], promptState?: string, cases: EvalCase[] = [beatCase], roles: PlanOptions["roles"] = ["beat"]): Promise<string[]> {
    const lines: string[] = [];
    const input: DryRunInput = {
      outDir: "out",
      records,
      extraSpend: [],
      frozenCases: cases,
      sources: { snapshots: [], templates: [], newStory: () => { throw new Error("frozen cases need no new stories"); } },
      options: (stage, tag, extra): PlanOptions => ({ stage, promptState: tag, roles, mode: "isolated", subset15: false, records, ...extra }),
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

  it("plans a row for each round stage and the migration check against its own cap", async () => {
    const lines = await dryRun([]);
    expect(lines.some((line) => /^Setup rounds candidates \(isolated\): 0 jobs .*\(stage cap \$3\)/.test(line))).toBe(true);
    // Turn round 1's three chapter-turn arms (full, slim, slim's retest) on the one chapter step, two samples each, then
    // turn round 2's form at two samples and its paragraph arm at one
    expect(lines.some((line) => /^Turn rounds candidates \(isolated\): 9 jobs .*\(stage cap \$2\)/.test(line))).toBe(true);
    // The one single-player beat case at production's beat arm, two samples and turn round 2's rerun (sample 4), and no baseline
    expect(lines.some((line) => /^Migration check \(production defaults, isolated\): 3 jobs .*\(stage cap \$1\.2\)/.test(line))).toBe(true);
    expect(lines.some((line) => /Stage migration: \$0\.00 of \$1\.2 \(.+\)/.test(line))).toBe(true);
  });

  it("plans a row for each run of the owner's feedback workflow against its own cap, and names the $45 hard cap and why it was raised", async () => {
    const lines = await dryRun([]);
    for (const [label, cap] of [
      ["Plan refresh", "0.1"],
      ["Reruns", "0.6"],
      ["Setup retests", "0.1"],
      ["Groups \\(B10\\)", "0.4"],
      ["Request-form gate \\(B9\\)", "0.4"],
      ["Final check", "0.6"],
    ]) {
      expect([label, lines.some((line) => new RegExp(`^${label} \\(isolated\\): \\d+ jobs .*\\(stage cap \\$${cap}\\)`).test(line))]).toEqual([label, true]);
      expect([label, lines.some((line) => new RegExp(`^${label} pipeline chains: \\d+ jobs .*\\(stage cap \\$${cap}\\)`).test(line))]).toEqual([label, true]);
    }
    expect(lines.some((line) => /Stage final-check: \$0\.00 of \$0\.6 \(.*2026-09-28.*\)/.test(line))).toBe(true);
    expect(lines).toContainEqual(
      expect.stringMatching(
        /^ {2}Total: \$\d+\.\d\d of \$45 \(hard cap, raised from \$42 by the owner on 2026-10-01 for the fixes of that day and the measurements they need \("few bucks don't matter"\), from \$40 on 2026-09-30, \$33 on 2026-09-28 and \$30 on 2026-09-27;/
      )
    );
  });

  it("lists the round stages' open jobs per arm, each with its estimate", async () => {
    const setupCase = evalCase("setup-learn-lemonade", "setup", { setup: { premise: "A premise", playerCount: 1, gameMode: GameModes.SinglePlayer, maxTurns: 25 } });
    const lines = await dryRun([], undefined, [setupCase], ["setup"]);
    expect(lines.some((line) => /^Setup rounds candidates \(isolated\): 17 jobs \{"setup":17\}, est \$\d+\.\d\d \(stage cap \$3\)/.test(line))).toBe(true);
    expect(lines).toContainEqual(expect.stringMatching(/^ {2}gpt-6-luna@low\/setupR1b: 2 open jobs, est \$\d+\.\d{3}$/));
    // Setup round 3's confirmation run
    expect(lines).toContainEqual(expect.stringMatching(/^ {2}gpt-6-luna@low\/setupR3: 2 open jobs, est \$\d+\.\d{3}$/));
    expect(lines).toContainEqual(expect.stringMatching(/^ {2}gpt-6-luna@low\/setupR2bOrder: 2 open jobs, est \$\d+\.\d{3}$/));
    expect(lines).toContainEqual(expect.stringMatching(/^ {2}gpt-6-luna@low\/setupR1: 2 open jobs, est \$\d+\.\d{3}$/));
    expect(lines).toContainEqual(expect.stringMatching(/^ {2}gpt-6-sol@low\/setupR1: 1 open job, est \$\d+\.\d{3}$/));
    expect(lines).toContainEqual(expect.stringMatching(/^ {2}gpt-6-luna@low\/setupR2: 2 open jobs, est \$\d+\.\d{3}$/));
    expect(lines).toContainEqual(expect.stringMatching(/^ {2}gpt-6-luna@low\/setupR2Order: 2 open jobs, est \$\d+\.\d{3}$/));
    // Rows outside the round stages keep their one line
    expect(lines.filter((line) => line.startsWith("  gpt-6-luna@low/prod"))).toEqual([]);
  });

  it("refuses a retired tag, as --run does", async () => {
    await expect(dryRun([], "postfix")).rejects.toThrow(/round0/);
    await expect(dryRun([], "prefix")).rejects.toThrow(/Run A/);
  });
});
