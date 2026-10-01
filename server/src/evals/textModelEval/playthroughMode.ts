import { PLAYTHROUGHS_2_PROMPT_STATE, PLAYTHROUGHS_3_PROMPT_STATE, RUNAWAY_PROMPT_STATE, type Stage } from "./arms.js";
import { DEFAULT_STAGE_CAPS, spentByStage } from "./budget.js";
import { CHOICE_JUDGE_PROMPT_VERSION, OPTIONS_CHECK, RESULTS_CHECK, evidenceFrom as choiceEvidenceFrom, verdictFrom as choiceVerdictFrom } from "./choiceResultJudge.js";
import { ENDING_JUDGE_PROMPT_VERSION, endingEvidenceFrom, endingVerdictFrom } from "./endingJudge.js";
import type { EvalFiles } from "./evalFiles.js";
import { JUDGE_ARMS } from "./judgedChecks.js";
import { readStory, renderPlaythroughReadings } from "./playthroughChecks.js";
import { PLAYTHROUGH_REPORTS, indexPage, storyFileName, storyPage } from "./playthroughPages.js";
import {
  PLAYTHROUGHS,
  PLAYTHROUGHS_2,
  PLAYTHROUGHS_3,
  playStory,
  playthroughArm,
  playthroughSetupInput,
  type JudgeTarget,
  type JudgedItem,
  type PlayRun,
  type PlaythroughSpec,
} from "./playthroughs.js";
import { usable, type CallRecord } from "./runner.js";
import { budgetedPrepCall, type PrepCallResult, type PrepCallSpec } from "./setupChainMode.js";
import { STAGE_JUDGE_PROMPT_VERSION, stageEvidenceFrom, stageVerdictFrom } from "./stageJudge.js";
import { spendBeside, type PrepContext } from "./turnPrep.js";
import type { SetupInput } from "./variants.js";

/*
 * The --playthroughs mode (the coordinator's brief of 2026-09-30): the
 * whole-story playthroughs of playthroughs.ts with real calls, each a prep
 * job ("play>…", "judge>…") in prep-calls.jsonl, in a round's own stage
 * under its own tag (PLAYTHROUGH_ROUNDS). Round 1: the four stories in the
 * playthroughs stage under adopted4 (production's code since the ending's
 * adoption, which the runaway replay tagged). Round 2 (--round 2, after the
 * owner OK'd "a few more dollars to do useful playthroughs"): the same four
 * and two more in the playthroughs-2 stage under adopted7, production's
 * current code, the automated player pressing Try again once where a turn
 * fails twice. Round 3 (--round 3, the coordinator's brief of 2026-10-01, the
 * final playthroughs after the owner's decisions and that day's fixes): round
 * 2's six premises in the playthroughs-3 stage under adopted22, the mouse
 * story's age set through the read-with-kids setting, pages in stories/round3/.
 * The stories play side by side, each call after the one before
 * it; the invocation never spends past the least of --max-spend, what the
 * stage's cap leaves and what the hard cap leaves, with the calls in flight
 * counted. After each story, the judged checks (Luna low): each chapter's
 * stage, each chapter plan's results against their kind and each exploration
 * step's options against its results (the choice-result stage's calibrated
 * checks), each player's ending. A finished call on the same request is
 * reused (the dice are seeded), so an interrupted run resumes and a smoke's
 * turns are the full run's first. It writes the round's json and md and its
 * pages (round 1: playthroughs.json and stories/; round 2: playthroughs-2.json
 * and stories/round2/), keeping the stories the round's file already holds (a
 * story and sample played again replaces its run). --report-only renders them
 * afresh without a call.
 */

/** One round of playthroughs: its stage and tag, its stories, its files and pages, and how often the player presses Try again. */
export type PlaythroughRoundNumber = 1 | 2 | 3;

export type PlaythroughRound = {
  round: PlaythroughRoundNumber;
  stage: Stage;
  promptState: string;
  specs: PlaythroughSpec[];
  /** The json and md file name, without its extension */
  fileBase: string;
  /** The pages' folder in the output folder */
  pagesDir: string;
  /** The hand-read report the pages point to (in the output folder) */
  report: string;
  /** Presses of Try again on a turn that failed twice (turnSends): round 1 played before the notice existed */
  tryAgain: number;
};

export const PLAYTHROUGH_ROUNDS: Record<PlaythroughRoundNumber, PlaythroughRound> = {
  1: { round: 1, stage: "playthroughs", promptState: RUNAWAY_PROMPT_STATE, specs: PLAYTHROUGHS, fileBase: "playthroughs", pagesDir: "stories", report: PLAYTHROUGH_REPORTS[1], tryAgain: 0 },
  2: { round: 2, stage: "playthroughs-2", promptState: PLAYTHROUGHS_2_PROMPT_STATE, specs: PLAYTHROUGHS_2, fileBase: "playthroughs-2", pagesDir: "stories/round2", report: PLAYTHROUGH_REPORTS[2], tryAgain: 1 },
  3: { round: 3, stage: "playthroughs-3", promptState: PLAYTHROUGHS_3_PROMPT_STATE, specs: PLAYTHROUGHS_3, fileBase: "playthroughs-3", pagesDir: "stories/round3", report: PLAYTHROUGH_REPORTS[3], tryAgain: 1 },
};

export const PLAYTHROUGH_STAGE: Stage = PLAYTHROUGH_ROUNDS[1].stage;
export const PLAYTHROUGH_PROMPT_STATE = PLAYTHROUGH_ROUNDS[1].promptState;
export const DEFAULT_PLAYTHROUGH_MAX_SPEND = DEFAULT_STAGE_CAPS.playthroughs;

export type ModeCall = (spec: PrepCallSpec) => Promise<PrepCallResult>;

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** The stories' calls: prep jobs in the round's stage under its tag, never past `limitUsd` for this invocation. */
export function playthroughCall(ctx: PrepContext, sample: number, limitUsd: number, round: PlaythroughRound = PLAYTHROUGH_ROUNDS[1]): ModeCall {
  return budgetedPrepCall(ctx, {
    stage: round.stage,
    promptState: round.promptState,
    sample,
    limitUsd,
    rerunHint: "the dice are seeded, so the code or a reply changed; play a new sample with --samples <n>",
  });
}

/** A judged check's case id: its check, its prompt version and the story's key. */
export const playJudgeCaseId = (target: Pick<JudgeTarget, "kind" | "key">) => {
  switch (target.kind) {
    case "stage":
      return `judge-play-stage-v${STAGE_JUDGE_PROMPT_VERSION}-${target.key}`;
    case "ending":
      return `judge-play-ending-v${ENDING_JUDGE_PROMPT_VERSION}-${target.key}`;
    default:
      return `judge-play-${target.kind}-v${CHOICE_JUDGE_PROMPT_VERSION}-${target.key}`;
  }
};

/** Luna low reads one chapter plan, one ending or one option set: a stage list, a line per outcome, option or result, and a short answer */
const JUDGE_OUTPUT_TOKENS = { stage: 1_000, ending: 500, options: 500, results: 900 } as const;

/** A judged check's verdict and its reading (the judge's evidence and lines). */
function judgedReading(target: JudgeTarget, parsed: unknown): { verdict?: boolean; evidence?: string; lines: string[] } {
  if (target.kind === "options" || target.kind === "results") {
    const check = target.kind === "options" ? OPTIONS_CHECK : RESULTS_CHECK;
    const read = choiceEvidenceFrom(parsed, check);
    const verdict = choiceVerdictFrom(parsed, check);
    return { ...(verdict !== undefined ? { verdict } : {}), ...(read.evidence ? { evidence: read.evidence } : {}), lines: read.lines };
  }
  const verdict = target.kind === "stage" ? stageVerdictFrom(parsed) : endingVerdictFrom(parsed);
  const read = target.kind === "stage" ? stageEvidenceFrom(parsed) : endingEvidenceFrom(parsed);
  return { ...(verdict !== undefined ? { verdict } : {}), ...(read?.evidence ? { evidence: read.evidence } : {}), lines: read ? ("stages" in read ? read.stages : read.outcomes) : [] };
}

/** The judged checks on a story, one call each, one after another: the verdict, the evidence and the judge's lines. */
export async function judgeTargets(targets: JudgeTarget[], call: ModeCall): Promise<JudgedItem[]> {
  const items: JudgedItem[] = [];
  for (const target of targets) {
    const result = await call({
      kind: "judge",
      caseId: playJudgeCaseId(target),
      role: target.kind === "stage" || target.kind === "results" ? "thread" : "beat",
      arm: JUDGE_ARMS[0],
      players: 1,
      request: target.request,
      outputTokens: JUDGE_OUTPUT_TOKENS[target.kind],
    });
    const parsed = result.parsed;
    const { verdict, evidence, lines } = parsed === undefined ? { verdict: undefined, evidence: undefined, lines: [] } : judgedReading(target, parsed);
    items.push({
      key: target.key,
      kind: target.kind,
      turn: target.turn,
      label: target.label,
      ...(verdict !== undefined ? { verdict } : {}),
      ...(evidence ? { evidence } : {}),
      lines,
      costUsd: result.costUsd,
    });
  }
  return items;
}

/**
 * One story played on production's code, then its judged checks. A turn that
 * fails is sent as production sends it: the queue's resend, then the round's
 * presses of Try again (turnSends). Where a group chapter still can't be
 * planned from the players' switch picks, the stuck players re-pick the
 * shared direction another player took and the turn is sent once more (the
 * harness's step, marked on the pages and readings).
 */
export async function playAndJudge(
  spec: PlaythroughSpec,
  call: ModeCall,
  options: { sample: number; turnLimit?: number },
  input: SetupInput = playthroughSetupInput(spec),
  round: PlaythroughRound = PLAYTHROUGH_ROUNDS[1]
): Promise<PlayRun> {
  const { run, judgeTargets: targets } = await playStory(spec, input, (s) => call({ kind: "play", ...s }), { ...options, tryAgain: round.tryAgain, repickStuckSwitches: true });
  run.round = round.round;
  run.judged = await judgeTargets(targets, call);
  return run;
}

/** The file's runs with new ones: a story and sample played again replaces its run, in the round's stories' order, then by sample. */
export function mergePlayRuns(existing: PlayRun[], added: PlayRun[], specs: PlaythroughSpec[] = PLAYTHROUGHS): PlayRun[] {
  const key = (run: PlayRun) => `${run.spec.id}|${run.sample}`;
  const replaced = new Set(added.map(key));
  const order = (run: PlayRun) => {
    const at = specs.findIndex((p) => p.id === run.spec.id);
    return at < 0 ? specs.length : at;
  };
  return [...existing.filter((run) => !replaced.has(key(run))), ...added].sort((a, b) => order(a) - order(b) || a.sample - b.sample);
}

export function playthroughFile(runs: PlayRun[], generatedAt: Date, round: PlaythroughRound = PLAYTHROUGH_ROUNDS[1]) {
  return {
    generatedAt: generatedAt.toISOString(),
    round: round.round,
    stage: round.stage,
    promptState: round.promptState,
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

/** A judged call's cost as the first round measured it (19 calls, $0.007), rounded up. */
const JUDGE_CALL_USD = 0.0004;

/**
 * A story's judged checks before it runs: a stage and a results check per
 * chapter (about T/4), an options check per player on about a third of the
 * chapter steps (the exploration ones), and an ending check per player.
 */
export function judgedEstimate(spec: PlaythroughSpec): { calls: number; usd: number } {
  const turns = spec.maxTurns;
  const players = playthroughSetupInput(spec).playerCount;
  const chapters = Math.round(turns / 4);
  const calls = 2 * chapters + Math.round((turns - chapters) / 3) * players + players;
  return { calls, usd: calls * JUDGE_CALL_USD };
}

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"];

/** The dry run's lines for a round: each story's calls and cost, what the round's file already holds, the judged checks and the stage's spend. */
export function printPlaythroughPlan(files: EvalFiles, log: (line: string) => void, round: PlaythroughRound = PLAYTHROUGH_ROUNDS[1]): void {
  const costsFor = measuredCallCosts(files.readRecords());
  const held = playthroughRunsFrom(files.readPlaythroughs(round.fileBase));
  const prep = files.readPrepRecords().filter((r) => r.stage === round.stage);
  log(`\nWhole-story playthroughs, round ${round.round} (--playthroughs${round.round > 1 ? ` --round ${round.round}` : ""}, stage ${round.stage}, cap $${DEFAULT_STAGE_CAPS[round.stage]}, under ${round.promptState}):`);
  let total = 0;
  let judged = { calls: 0, usd: 0 };
  for (const spec of round.specs) {
    const estimate = playthroughEstimate(spec, costsFor);
    const judge = judgedEstimate(spec);
    total += estimate.usd;
    judged = { calls: judged.calls + judge.calls, usd: judged.usd + judge.usd };
    const runs = held.filter((r) => r.spec.id === spec.id).map((r) => `s${r.sample}: ${r.turns.length} turns${r.complete ? ", ended" : `, ${r.stopped}`}`);
    log(
      `  ${spec.id}: ${estimate.players} player(s), ${spec.maxTurns} turns, ${estimate.calls.min}-${estimate.calls.max} calls (typical ${estimate.calls.typical}), est $${estimate.usd.toFixed(3)} (up to $${estimate.usdMax.toFixed(3)} at the most chapters); judged checks about ${judge.calls}${runs.length ? `; held: ${runs.join("; ")}` : ""}`
    );
  }
  const all = COUNT_WORDS[round.specs.length] ?? String(round.specs.length);
  log(
    `  All ${all}: est $${total.toFixed(3)} before retries, plus the judged checks (about ${judged.calls} calls, about $${judged.usd.toFixed(2)}); spent in the stage so far $${sum(prep.map((r) => r.costUsd)).toFixed(4)} over ${prep.length} attempts`
  );
}

// ---------------------------------------------------------------- the mode

/**
 * Plays a round's stories (all of them, or those --cases names; --turns stops
 * each after that many turns, the smoke), then writes the round's files with
 * every story its file already holds. `reportOnly` plays nothing and renders
 * afresh.
 */
export async function playthroughsMode(ctx: PrepContext, options: { sample: number; caseIds?: string[]; turns?: number; reportOnly?: boolean; round?: PlaythroughRound }): Promise<void> {
  const { files, log } = ctx;
  const round = options.round ?? PLAYTHROUGH_ROUNDS[1];
  const specs = round.specs.filter((p) => !options.caseIds?.length || options.caseIds.includes(p.id));
  if (specs.length === 0) throw new Error(`No playthrough among --cases; one of ${round.specs.map((p) => p.id).join(", ")}`);
  const played: PlayRun[] = [];
  if (!options.reportOnly) {
    const spend = spentByStage([...files.readRecords(), ...spendBeside(files, "calls")]);
    const stageLeft = ctx.caps.stageCaps[round.stage] - spend.byStage[round.stage];
    const limit = Math.min(ctx.caps.maxSpend ?? Number.POSITIVE_INFINITY, stageLeft, ctx.caps.globalCap - spend.total);
    log(
      `Playing round ${round.round}: ${specs.map((s) => s.id).join(", ")} (sample ${options.sample}${options.turns ? `, the first ${options.turns} turns each` : ""}); this invocation spends at most $${limit.toFixed(4)} (stage ${round.stage} spent $${spend.byStage[round.stage].toFixed(4)} of $${ctx.caps.stageCaps[round.stage]}; the ledger $${spend.total.toFixed(2)} of $${ctx.caps.globalCap})`
    );
    const call = playthroughCall(ctx, options.sample, limit, round);
    const settled = await Promise.allSettled(specs.map((spec) => playAndJudge(spec, call, { sample: options.sample, ...(options.turns ? { turnLimit: options.turns } : {}) }, playthroughSetupInput(spec), round)));
    settled.forEach((outcome, i) => {
      if (outcome.status === "fulfilled") played.push(outcome.value);
      else log(`${specs[i].id}: ${outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)}`);
    });
  }
  const all = mergePlayRuns(playthroughRunsFrom(files.readPlaythroughs(round.fileBase)), played, round.specs);
  const now = new Date();
  files.writePlaythroughs(renderPlaythroughReadings(all, now, round.round), playthroughFile(all, now, round), round.fileBase);
  for (const run of all) files.writeStoryPage(storyFileName(run), storyPage(run), round.pagesDir);
  const index = files.writeStoryPage("index.html", indexPage(all, now, round.round), round.pagesDir);
  const cost = sum(played.map((run) => {
    const readings = readStory(run);
    return readings.cost.storyUsd + readings.cost.judgeUsd;
  }));
  for (const run of played) log(`${run.spec.id} s${run.sample}: ${run.turns.length} turns, stopped: ${run.stopped}`);
  log(`Played ${played.length} of ${options.reportOnly ? 0 : specs.length} stories, $${cost.toFixed(4)} with their judged checks. Wrote ${round.fileBase}.md and .json and ${all.length} story pages; the index is ${index}`);
}
