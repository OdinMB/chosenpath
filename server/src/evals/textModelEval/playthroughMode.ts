import { RUNAWAY_PROMPT_STATE, type Stage } from "./arms.js";
import { DEFAULT_STAGE_CAPS, spentByStage } from "./budget.js";
import { ENDING_JUDGE_PROMPT_VERSION, endingEvidenceFrom, endingVerdictFrom } from "./endingJudge.js";
import type { EvalFiles } from "./evalFiles.js";
import { JUDGE_ARMS } from "./judgedChecks.js";
import { readStory, renderPlaythroughReadings } from "./playthroughChecks.js";
import { indexPage, storyFileName, storyPage } from "./playthroughPages.js";
import { PLAYTHROUGHS, playStory, playthroughArm, playthroughSetupInput, type JudgeTarget, type JudgedItem, type PlayRun, type PlaythroughSpec } from "./playthroughs.js";
import { usable, type CallRecord } from "./runner.js";
import { budgetedPrepCall, type PrepCallResult, type PrepCallSpec } from "./setupChainMode.js";
import { STAGE_JUDGE_PROMPT_VERSION, stageEvidenceFrom, stageVerdictFrom } from "./stageJudge.js";
import { spendBeside, type PrepContext } from "./turnPrep.js";
import type { SetupInput } from "./variants.js";

/*
 * The --playthroughs mode (the coordinator's brief of 2026-09-30): the four
 * whole-story playthroughs of playthroughs.ts with real calls, each a prep
 * job ("play>…", "judge>…") in prep-calls.jsonl, in the playthroughs stage
 * under adopted4 (production's code since the ending's adoption, which the
 * runaway replay tagged; unchanged since). The stories play side by side,
 * each call after the one before it; the invocation never spends past the
 * least of --max-spend, what the stage's cap leaves and what the hard cap
 * leaves, with the calls in flight counted. After each story, the judged
 * stage check on its chapters and the ending check per player (Luna low).
 * A finished call on the same request is reused (the dice are seeded), so an
 * interrupted run resumes and a smoke's turns are the full run's first. It
 * writes playthroughs.json and .md and the pages in stories/, keeping the
 * stories the file already holds (a story and sample played again replaces
 * its run). --report-only renders them afresh without a call.
 */

export const PLAYTHROUGH_STAGE: Stage = "playthroughs";
export const PLAYTHROUGH_PROMPT_STATE = RUNAWAY_PROMPT_STATE;
export const DEFAULT_PLAYTHROUGH_MAX_SPEND = DEFAULT_STAGE_CAPS.playthroughs;

export type ModeCall = (spec: PrepCallSpec) => Promise<PrepCallResult>;

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** The stories' calls: prep jobs in the playthroughs stage under adopted4, never past `limitUsd` for this invocation. */
export function playthroughCall(ctx: PrepContext, sample: number, limitUsd: number): ModeCall {
  return budgetedPrepCall(ctx, {
    stage: PLAYTHROUGH_STAGE,
    promptState: PLAYTHROUGH_PROMPT_STATE,
    sample,
    limitUsd,
    rerunHint: "the dice are seeded, so the code or a reply changed; play a new sample with --samples <n>",
  });
}

/** A judged check's case id: its check, its prompt version and the story's key. */
export const playJudgeCaseId = (target: Pick<JudgeTarget, "kind" | "key">) =>
  target.kind === "stage" ? `judge-play-stage-v${STAGE_JUDGE_PROMPT_VERSION}-${target.key}` : `judge-play-ending-v${ENDING_JUDGE_PROMPT_VERSION}-${target.key}`;

/** Luna low reads one chapter plan or one ending: a stage list or a line per outcome, and a short answer */
const JUDGE_OUTPUT_TOKENS = { stage: 1_000, ending: 500 } as const;

/** The judged checks on a story, one call each, one after another: the verdict, the evidence and the judge's lines. */
export async function judgeTargets(targets: JudgeTarget[], call: ModeCall): Promise<JudgedItem[]> {
  const items: JudgedItem[] = [];
  for (const target of targets) {
    const result = await call({
      kind: "judge",
      caseId: playJudgeCaseId(target),
      role: target.kind === "stage" ? "thread" : "beat",
      arm: JUDGE_ARMS[0],
      players: 1,
      request: target.request,
      outputTokens: JUDGE_OUTPUT_TOKENS[target.kind],
    });
    const parsed = result.parsed;
    const verdict = parsed === undefined ? undefined : target.kind === "stage" ? stageVerdictFrom(parsed) : endingVerdictFrom(parsed);
    const read = parsed === undefined ? undefined : target.kind === "stage" ? stageEvidenceFrom(parsed) : endingEvidenceFrom(parsed);
    const lines = read ? ("stages" in read ? read.stages : read.outcomes) : [];
    items.push({
      key: target.key,
      kind: target.kind,
      turn: target.turn,
      label: target.label,
      ...(verdict !== undefined ? { verdict } : {}),
      ...(read?.evidence ? { evidence: read.evidence } : {}),
      lines,
      costUsd: result.costUsd,
    });
  }
  return items;
}

/** One story played on production's code, then its judged checks. */
export async function playAndJudge(spec: PlaythroughSpec, call: ModeCall, options: { sample: number; turnLimit?: number }, input: SetupInput = playthroughSetupInput(spec)): Promise<PlayRun> {
  const { run, judgeTargets: targets } = await playStory(spec, input, (s) => call({ kind: "play", ...s }), options);
  run.judged = await judgeTargets(targets, call);
  return run;
}

/** The file's runs with new ones: a story and sample played again replaces its run, in the stories' order, then by sample. */
export function mergePlayRuns(existing: PlayRun[], added: PlayRun[]): PlayRun[] {
  const key = (run: PlayRun) => `${run.spec.id}|${run.sample}`;
  const replaced = new Set(added.map(key));
  const order = (run: PlayRun) => {
    const at = PLAYTHROUGHS.findIndex((p) => p.id === run.spec.id);
    return at < 0 ? PLAYTHROUGHS.length : at;
  };
  return [...existing.filter((run) => !replaced.has(key(run))), ...added].sort((a, b) => order(a) - order(b) || a.sample - b.sample);
}

export function playthroughFile(runs: PlayRun[], generatedAt: Date) {
  return {
    generatedAt: generatedAt.toISOString(),
    promptState: PLAYTHROUGH_PROMPT_STATE,
    arms: {
      setup: playthroughArm("setup", 1).key,
      planners: playthroughArm("switch", 1).key,
      turnOnePlayer: playthroughArm("beat", 1).key,
      turnGroups: playthroughArm("beat", 2).key,
      judge: JUDGE_ARMS[0].key,
    },
    runs,
  };
}

export function playthroughRunsFrom(file: unknown): PlayRun[] {
  const runs = file && typeof file === "object" && Array.isArray((file as { runs?: unknown }).runs) ? (file as { runs: PlayRun[] }).runs : [];
  return runs;
}

// ---------------------------------------------------------------- the estimate

export type RoleCosts = { setup: number; beat: number; switch: number; thread: number };

/** The final check's measured cost per call (2026-09-28), where no record of production's own arm is held. */
const FALLBACK_COSTS: Record<number, RoleCosts> = {
  1: { setup: 0.0065, beat: 0.0034, switch: 0.0011, thread: 0.0014 },
  2: { setup: 0.0075, beat: 0.0043, switch: 0.0012, thread: 0.0016 },
  3: { setup: 0.0085, beat: 0.0055, switch: 0.0013, thread: 0.0018 },
};

/** The mean cost of production's own calls (its arm, role and player count, any adopted prompt state), per player count. */
export function measuredCallCosts(records: CallRecord[]): (players: number) => RoleCosts {
  return (players) => {
    const fallback = FALLBACK_COSTS[Math.min(3, Math.max(1, players))];
    const mean = (role: keyof RoleCosts) => {
      const arm = playthroughArm(role, players).key;
      const costs = records.filter((r) => r.callArmKey === arm && r.role === role && r.players === players && usable(r) && r.promptState.startsWith("adopted")).map((r) => r.costUsd);
      return costs.length ? sum(costs) / costs.length : fallback[role];
    };
    return { setup: mean("setup"), beat: mean("beat"), switch: mean("switch"), thread: mean("thread") };
  };
}

/**
 * A story's calls and cost before it runs: a setup, every turn and the
 * ending, and a switch and a chapter plan per chapter; a switch turn and a
 * chapter of 2 to 4 turns take 3 to 5 turns, so a story of T turns holds T/5
 * to T/3 chapters, about T/4. Priced at the measured costs, retries left out.
 */
export function playthroughEstimate(spec: PlaythroughSpec, costsFor: (players: number) => RoleCosts) {
  const turns = spec.maxTurns;
  const players = playthroughSetupInput(spec).playerCount;
  const chapters = { min: Math.ceil(turns / 5), typical: Math.round(turns / 4), max: Math.floor(turns / 3) };
  const calls = (c: number) => 1 + (turns + 1) + 2 * c;
  const costs = costsFor(players);
  const usdFor = (c: number) => costs.setup + (turns + 1) * costs.beat + c * (costs.switch + costs.thread);
  return {
    players,
    chapters,
    calls: { min: calls(chapters.min), typical: calls(chapters.typical), max: calls(chapters.max) },
    usd: usdFor(chapters.typical),
    usdMax: usdFor(chapters.max),
  };
}

/** The dry run's lines: each story's calls and cost, what the file already holds, and the stage's spend. */
export function printPlaythroughPlan(files: EvalFiles, log: (line: string) => void): void {
  const costsFor = measuredCallCosts(files.readRecords());
  const held = playthroughRunsFrom(files.readPlaythroughs());
  const prep = files.readPrepRecords().filter((r) => r.stage === PLAYTHROUGH_STAGE);
  log(`\nWhole-story playthroughs (--playthroughs, stage ${PLAYTHROUGH_STAGE}, cap $${DEFAULT_STAGE_CAPS.playthroughs}, under ${PLAYTHROUGH_PROMPT_STATE}):`);
  let total = 0;
  for (const spec of PLAYTHROUGHS) {
    const estimate = playthroughEstimate(spec, costsFor);
    total += estimate.usd;
    const runs = held.filter((r) => r.spec.id === spec.id).map((r) => `s${r.sample}: ${r.turns.length} turns${r.complete ? ", ended" : `, ${r.stopped}`}`);
    log(
      `  ${spec.id}: ${estimate.players} player(s), ${spec.maxTurns} turns, ${estimate.calls.min}-${estimate.calls.max} calls (typical ${estimate.calls.typical}), est $${estimate.usd.toFixed(3)} (up to $${estimate.usdMax.toFixed(3)} at the most chapters)${runs.length ? `; held: ${runs.join("; ")}` : ""}`
    );
  }
  log(`  All four: est $${total.toFixed(3)} before retries, plus the judged checks (about 30 calls, about $0.01); spent in the stage so far $${sum(prep.map((r) => r.costUsd)).toFixed(4)} over ${prep.length} attempts`);
}

// ---------------------------------------------------------------- the mode

/**
 * Plays the stories (all four, or those --cases names; --turns stops each
 * after that many turns, the smoke), then writes the files with every story
 * the file already holds. `reportOnly` plays nothing and renders afresh.
 */
export async function playthroughsMode(ctx: PrepContext, options: { sample: number; caseIds?: string[]; turns?: number; reportOnly?: boolean }): Promise<void> {
  const { files, log } = ctx;
  const specs = PLAYTHROUGHS.filter((p) => !options.caseIds?.length || options.caseIds.includes(p.id));
  if (specs.length === 0) throw new Error(`No playthrough among --cases; one of ${PLAYTHROUGHS.map((p) => p.id).join(", ")}`);
  const played: PlayRun[] = [];
  if (!options.reportOnly) {
    const spend = spentByStage([...files.readRecords(), ...spendBeside(files, "calls")]);
    const stageLeft = ctx.caps.stageCaps[PLAYTHROUGH_STAGE] - spend.byStage[PLAYTHROUGH_STAGE];
    const limit = Math.min(ctx.caps.maxSpend ?? Number.POSITIVE_INFINITY, stageLeft, ctx.caps.globalCap - spend.total);
    log(
      `Playing ${specs.map((s) => s.id).join(", ")} (sample ${options.sample}${options.turns ? `, the first ${options.turns} turns each` : ""}); this invocation spends at most $${limit.toFixed(4)} (stage ${PLAYTHROUGH_STAGE} spent $${spend.byStage[PLAYTHROUGH_STAGE].toFixed(4)} of $${ctx.caps.stageCaps[PLAYTHROUGH_STAGE]}; the ledger $${spend.total.toFixed(2)} of $${ctx.caps.globalCap})`
    );
    const call = playthroughCall(ctx, options.sample, limit);
    const settled = await Promise.allSettled(specs.map((spec) => playAndJudge(spec, call, { sample: options.sample, ...(options.turns ? { turnLimit: options.turns } : {}) })));
    settled.forEach((outcome, i) => {
      if (outcome.status === "fulfilled") played.push(outcome.value);
      else log(`${specs[i].id}: ${outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)}`);
    });
  }
  const all = mergePlayRuns(playthroughRunsFrom(files.readPlaythroughs()), played);
  const now = new Date();
  files.writePlaythroughs(renderPlaythroughReadings(all, now), playthroughFile(all, now));
  for (const run of all) files.writeStoryPage(storyFileName(run), storyPage(run));
  const index = files.writeStoryPage("index.html", indexPage(all, now));
  const cost = sum(played.map((run) => {
    const readings = readStory(run);
    return readings.cost.storyUsd + readings.cost.judgeUsd;
  }));
  for (const run of played) log(`${run.spec.id} s${run.sample}: ${run.turns.length} turns, stopped: ${run.stopped}`);
  log(`Played ${played.length} of ${options.reportOnly ? 0 : specs.length} stories, $${cost.toFixed(4)} with their judged checks. Wrote playthroughs.md and .json and ${all.length} story pages; the index is ${index}`);
}
