import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { z } from "zod";
import { LEDGER_STAGES, type Caps, type LedgerStage } from "../../../../src/evals/textModelEval/budget.js";
import type { EvalFiles } from "../../../../src/evals/textModelEval/evalFiles.js";
import { sha256, type ExecutedCall } from "../../../../src/evals/textModelEval/executor.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import { CHAIN_ARMS, SETUP_CHAIN_PREMISES } from "../../../../src/evals/textModelEval/setupChain.js";
import { chainCallFor, setupChainMode } from "../../../../src/evals/textModelEval/setupChainMode.js";
import type { PrepContext } from "../../../../src/evals/textModelEval/turnPrep.js";
import { executed, record } from "./fixtures.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const REQUEST = { prompt: "Plan the next switch.", schema: z.object({ ok: z.boolean() }) };

function context(options: { maxSpend?: number; prep?: CallRecord[]; outcome?: "valid" | "invalid-json" } = {}) {
  const prep: CallRecord[] = [...(options.prep ?? [])];
  const execute = jest.fn(async (): Promise<ExecutedCall> => ({ ...executed(options.outcome ?? "valid"), promptHash: sha256(REQUEST.prompt) }));
  const files = {
    readRecords: () => [],
    loadOutput: () => ({ ok: true }),
    readPrepRecords: () => [...prep],
    readProbe: () => undefined,
    readFilterRecords: () => [],
  } as unknown as EvalFiles;
  const stageCaps = Object.fromEntries(LEDGER_STAGES.map((stage) => [stage, 100])) as Record<LedgerStage, number>;
  const caps: Caps = { stageCaps, globalCap: 100, maxSpend: options.maxSpend };
  const ctx: PrepContext = {
    files,
    caps,
    deps: () => ({ execute, record: (r: CallRecord) => prep.push(r), now: () => 0, sleep: async () => undefined, warn: () => undefined }),
    refuse: () => undefined,
    tpm: 1e9,
    maxInFlight: 1,
    log: () => undefined,
  };
  return { ctx, prep, execute };
}

const spec = { caseId: "chain-x-s1-01-switch-plan", role: "switch" as const, arm: CHAIN_ARMS.planner, players: 1, request: REQUEST };

describe("chainCallFor: the chain's calls in the rounds' own ledger", () => {
  it("records each call as a chain call in the setup-rounds stage, and gives back its reply, wait and cost", async () => {
    const { ctx, prep } = context();
    const result = await chainCallFor(ctx, 1)(spec);
    expect(result).toMatchObject({ parsed: { ok: true }, outputFile: "outputs/x.json", latencyMs: 1_000 });
    expect(prep).toHaveLength(1);
    expect(prep[0]).toMatchObject({ caseId: spec.caseId, armKey: `chain>${CHAIN_ARMS.planner.key}`, callArmKey: CHAIN_ARMS.planner.key, stage: "setup-rounds", group: "prep", sample: 1 });
  });

  it("counts a re-sent attempt's wait and cost in the call's, as the player waits for both", async () => {
    const { ctx, execute } = context();
    execute.mockImplementationOnce(async () => ({ ...executed("invalid-json"), promptHash: sha256(REQUEST.prompt) }));
    const result = await chainCallFor(ctx, 1)(spec);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(result?.latencyMs).toBe(2_000);
  });

  it("reuses a finished call on the same request, and refuses one made on another (the dice differ on a rerun)", async () => {
    const finished = record({
      jobKey: `${spec.caseId}|chain>${CHAIN_ARMS.planner.key}|round0|s1`,
      caseId: spec.caseId,
      armKey: `chain>${CHAIN_ARMS.planner.key}`,
      callArmKey: CHAIN_ARMS.planner.key,
      stage: "setup-rounds",
      promptState: "round0",
      group: "prep",
      role: "switch",
      promptHash: sha256(REQUEST.prompt),
    });
    const same = context({ prep: [finished] });
    expect(await chainCallFor(same.ctx, 1)(spec)).toMatchObject({ parsed: { ok: true } });
    expect(same.execute).not.toHaveBeenCalled();
    const other = context({ prep: [{ ...finished, promptHash: "another request" }] });
    await expect(chainCallFor(other.ctx, 1)(spec)).rejects.toThrow(/--samples/);
  });

  it("stops before a call that would pass --max-spend, and gives back nothing", async () => {
    const { ctx, execute } = context({ maxSpend: 0 });
    expect(await chainCallFor(ctx, 1)(spec)).toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
  });

  it("gives back nothing for a reply production could not use after its retries", async () => {
    const { ctx } = context({ outcome: "invalid-json" });
    expect(await chainCallFor(ctx, 1)(spec)).toBeUndefined();
  });
});

describe("setupChainMode --report-only: the chain file rendered afresh, another file's runs merged in", () => {
  const run = (id: string) => ({ premise: SETUP_CHAIN_PREMISES.find((p) => p.id === id), sample: 1, input: {}, steps: [{ kind: "setup", turn: 0, caseId: `${id}-s1-00-setup`, armKey: CHAIN_ARMS.setup.key, outputFile: "outputs/x.json" }], stopped: "the setup: no usable reply" });

  it("sends nothing, keeps the file's runs, adds the merged file's, and loads each step's output where the file lacks it", async () => {
    const { ctx, execute } = context();
    const written: unknown[] = [];
    const chains: Record<string, unknown> = { main: { runs: [run("chain-cofounders")] }, other: { runs: [run("chain-short-subscription")] } };
    Object.assign(ctx.files, {
      readSetupChain: (file?: string) => chains[file ?? "main"],
      loadOutputFile: () => ({ title: "Loaded" }),
      writeSetupChain: (markdown: string, json: unknown) => written.push(markdown, json),
    });
    await setupChainMode(ctx, { sample: 1, reportOnly: true, mergeFile: "other" });
    expect(execute).not.toHaveBeenCalled();
    const [markdown, json] = written as [string, { runs: { premise: { id: string } }[] }];
    expect(json.runs.map((r) => r.premise.id)).toEqual(["chain-short-subscription", "chain-cofounders"]);
    expect(markdown).toContain("## chain-short-subscription (sample 1)");
    expect(markdown).toContain("## chain-cofounders (sample 1)");
  });
});
