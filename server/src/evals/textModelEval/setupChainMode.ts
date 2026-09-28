import type { EvalRole } from "./arms.js";
import { sha256 } from "./executor.js";
import { prepJob } from "./prepCalls.js";
import { finishingRecord, keyOf, runJobs, usable, type CallRecord } from "./runner.js";
import {
  SETUP_CHAIN_PREMISES,
  chainFile,
  chainRunsFrom,
  chainSetupInput,
  mergeChainRuns,
  playSetupChain,
  renderChainReport,
  type ChainCall,
  type ChainRun,
} from "./setupChain.js";
import { capsAfter, spendBeside, type PrepContext } from "./turnPrep.js";
import { CURRENT_PROMPT_STATE, requestText } from "./variants.js";

/*
 * The --setup-chain mode: setup round 3's setup-to-play chain (setupChain.ts)
 * with real calls, each a prep job ("chain>…") in prep-calls.jsonl, in the
 * setup-rounds stage and under --max-spend (default $0.20). The four chains
 * play at once, each call after the one before it; a call already finished
 * on the same request is reused, so an interrupted run resumes up to the
 * first choice whose dice would now fall differently.
 */

export const DEFAULT_CHAIN_MAX_SPEND = 0.2;
const STAGE = "setup-rounds" as const;

/** Output tokens a call is priced at before it runs, reasoning included (the rounds' measured sizes, rounded up). */
const OUTPUT_GUESS: Record<EvalRole, number> = { setup: 8_000, switch: 1_200, thread: 2_000, beat: 5_500, iteration: 8_000 };

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/**
 * The chain's call: one prep job per call, run alone through the runner (so
 * transport retries and production's re-sends apply), its wait and cost the
 * sum of its attempts. It refuses a case id an earlier call under another
 * request finished (a rerun whose dice fell differently: use --samples for a
 * new chain), and gives back nothing where --max-spend would be passed.
 */
export function chainCallFor(ctx: PrepContext, sample: number): ChainCall {
  const { files, log } = ctx;
  const records: CallRecord[] = files.readPrepRecords();
  let spent = 0;
  let inFlight = 0;
  return async ({ caseId, role, arm, players, request }) => {
    const job = prepJob({ kind: "chain", stage: STAGE, promptState: CURRENT_PROMPT_STATE, caseId, sample, arm, role, players, build: () => request, outputTokens: OUTPUT_GUESS[role] });
    const key = keyOf(job);
    const earlier = finishingRecord(records, key);
    if (earlier?.promptHash && earlier.promptHash !== sha256(requestText(request))) {
      throw new Error(`${caseId}: a call under this id finished on another request (the dice fall anew on a rerun); run a new chain with --samples <n>`);
    }
    if (!earlier) {
      const estimate = job.first.estimate.costUsd;
      if (ctx.caps.maxSpend !== undefined && spent + inFlight + estimate > ctx.caps.maxSpend) {
        log(`${caseId}: not sent, --max-spend $${ctx.caps.maxSpend} (this run spent $${spent.toFixed(4)})`);
        return undefined;
      }
      inFlight += estimate;
      try {
        const result = await runJobs([job], ctx.deps("prep"), {
          caps: capsAfter(ctx.caps, spent),
          previous: records,
          extraSpend: spendBeside(files, "prep"),
          tokensPerMinute: ctx.tpm,
        });
        spent += sum(result.records.map((r) => r.costUsd));
        records.push(...result.records);
        if (result.stoppedReason) log(`${caseId}: stopped, ${result.stoppedReason}`);
      } finally {
        inFlight -= estimate;
      }
    }
    const final = finishingRecord(records, key);
    if (!final || !usable(final) || !final.outputFile) return undefined;
    const attempts = records.filter((r) => r.jobKey === key);
    return { parsed: files.loadOutput(final), outputFile: final.outputFile, latencyMs: sum(attempts.map((r) => r.latencyMs)), costUsd: sum(attempts.map((r) => r.costUsd)) };
  };
}

/**
 * Plays the chains (all four, or those --cases names), then writes
 * setup-chain.md and .json with every run the chain file already holds (a
 * chain and sample played again replaces its run). `reportOnly` plays
 * nothing and renders the file afresh; `mergeFile` adds the runs of another
 * chain file (one an earlier invocation overwrote).
 */
export async function setupChainMode(ctx: PrepContext, options: { sample: number; caseIds?: string[]; reportOnly?: boolean; mergeFile?: string }): Promise<void> {
  const { files, log } = ctx;
  const premises = SETUP_CHAIN_PREMISES.filter((p) => !options.caseIds?.length || options.caseIds.includes(p.id));
  if (premises.length === 0) throw new Error(`No chain premise among --cases; one of ${SETUP_CHAIN_PREMISES.map((p) => p.id).join(", ")}`);
  const runs: ChainRun[] = [];
  if (!options.reportOnly) {
    const call = chainCallFor(ctx, options.sample);
    const settled = await Promise.allSettled(premises.map((p) => playSetupChain(p, chainSetupInput(p), call, { sample: options.sample })));
    settled.forEach((outcome, i) => {
      if (outcome.status === "fulfilled") runs.push(outcome.value);
      else log(`${premises[i].id}: ${outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)}`);
    });
  }
  const read = (file?: string) => chainRunsFrom(files.readSetupChain(file) ?? {}, files.loadOutputFile);
  const kept = mergeChainRuns(read(), options.mergeFile ? read(options.mergeFile) : []);
  const all = mergeChainRuns(kept, runs);
  const now = new Date();
  files.writeSetupChain(renderChainReport(all, now), chainFile(all, now));
  const cost = sum(runs.flatMap((run) => run.steps.map((s) => s.costUsd ?? 0)));
  log(`Played ${runs.length} of ${options.reportOnly ? 0 : premises.length} chains, ${sum(runs.map((r) => r.steps.length))} calls, $${cost.toFixed(4)}. Wrote setup-chain.md and .json (${all.length} runs).`);
}
