import { armKey, CHOICE_LINE_SP_PROMPT_STATE, secondReferenceKeys, type Stage } from "./arms.js";
import { caseStory, type EvalCase } from "./cases.js";
import { asCall, checkedTurns, type CheckedTurn } from "./checkedTurns.js";
import { choiceJudgeCaseId, choiceJudgeJobs, OPTIONS_CHECK, verdictFrom } from "./choiceResultJudge.js";
import { optionTargetsOf, replyVerdict, type ToJudge } from "./choiceResultPrep.js";
import { jobEstimateUsd } from "./jobPlan.js";
import { JUDGE_ARMS } from "./judgedChecks.js";
import { checksForRecords } from "./outputChecks.js";
import { finishedPrepRecord, prepArmKey } from "./prepCalls.js";
import { renderVariantComparison } from "./resultsReport.js";
import { finishedJobKeys, jobKey, keyOf, runJobs, type CallRecord, type RetryKind } from "./runner.js";
import { stageReadings, type JudgedPlan, type StageArmReading } from "./stageJudge.js";
import type { CheckResult } from "./textChecks.js";
import { spendBeside, type PrepContext } from "./turnPrep.js";
import { renderTurnWaits, renderTurnWaitsBySample, turnKindOf, turnWaitReadings, turnWaitsBySample, type SampleWait, type TurnKind, type TurnWait } from "./turnWaits.js";
import { referenceKeyOf, variantComparisons, type VariantComparison } from "./variantComparison.js";

/*
 * The choice-line-sp stage's report (the coordinator's brief of 2026-09-30,
 * after the choice-result run): the exploration-order line for a single
 * player, measured beside production's turn with production's one retry of a
 * short or option-less reply in the loop (runner.ts, CheckedRetry). Each turn
 * is read whole (checkedTurns.ts): its first reply, the retry, the reply the
 * game keeps, the wait including the retry and the cost. --choice-line-sp
 * judges every reply of the stage's turns once (optionsFollowResults, the
 * choice-result stage's judge, calibrated reliable there: the first reply and,
 * where production's check asked again, the retry), into prep-calls.jsonl
 * booked to the stage, and writes choice-line-sp.md and .json: per arm the
 * retries, the short replies before and after them, the turns that fail, words
 * and sentences, options at their own result on the first and the kept
 * replies, every automatic check on the kept replies under the stop rule
 * (variantComparison.ts on each turn read as one call), the waits including
 * the retry per turn kind and sample, and cost. --report-only sends nothing.
 */

const STAGE: Stage = "choice-line-sp";

const LUNA_MEDIUM = { model: "gpt-6-luna", reasoningEffort: "medium" } as const;

/** The stage's arms: production's single-player turn and the exploration-order line. */
export const CHOICE_LINE_ARMS = [armKey(LUNA_MEDIUM, "adopted"), armKey(LUNA_MEDIUM, "choiceResult")];

/** A checked turn's replies to judge: the first, and the retry where production's check asked again. */
export type LineItem = { turn: CheckedTurn; first?: ToJudge; retry?: ToJudge };

/** Each turn's replies with their options judge calls, one per exploring player, read after the beat repairs. */
export function lineJudgeItems(turns: CheckedTurn[], cases: EvalCase[], load: (record: CallRecord) => unknown): LineItem[] {
  const byId = new Map(cases.map((c) => [c.id, c]));
  return turns.map((turn) => {
    const evalCase = byId.get(turn.caseId);
    const first = optionTargetsOf(turn.first, evalCase, load);
    const retry = turn.retry ? optionTargetsOf(turn.retry, evalCase, load) : undefined;
    return { turn, ...(first ? { first } : {}), ...(retry ? { retry } : {}) };
  });
}

/** The first replies' verdicts and the kept replies' (the retry's where the game keeps it; none where the turn fails), as judged plans for the stage readings. */
export function lineVerdicts(items: LineItem[], answerOf: (key: string) => boolean | undefined): { first: JudgedPlan[]; kept: JudgedPlan[] } {
  const first: JudgedPlan[] = [];
  const kept: JudgedPlan[] = [];
  for (const item of items) {
    const own = item.first ? replyVerdict(item.first, answerOf) : undefined;
    if (own) first.push(own);
    const keptItem = item.turn.kept === 2 ? item.retry : item.turn.kept === 1 ? item.first : undefined;
    const verdict = keptItem ? replyVerdict(keptItem, answerOf) : undefined;
    if (verdict) kept.push(verdict);
  }
  return { first, kept };
}

export type LineTally = {
  armKey: string;
  turns: number;
  /** First replies of one short paragraph, and without options (production's check) */
  firstShort: number;
  firstWithoutOptions: number;
  /** Turns production's check asked again, by why */
  retried: number;
  retriedBy: Record<RetryKind, number>;
  /** Kept replies of one short paragraph (production uses a second short reply) */
  keptShort: number;
  /** Turns with no reply the game can keep (no options after the retry) */
  failed: number;
  /** Means per turn, first reply and reply kept (checksForRecords' counts) */
  words: { first: number; kept: number };
  sentences: { first: number; kept: number };
  /** Mean cost per turn: the first reply's, and with the retry */
  costPerTurn: { first: number; kept: number };
  hangs: number;
};

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const RETRY_KINDS: RetryKind[] = ["short", "noOptions", "both"];

/** Per arm: the turns, the retries and the short replies before and after them, words, sentences and cost. */
export function lineTallies(turns: CheckedTurn[], checks: Map<string, CheckResult>): LineTally[] {
  const arms = [...new Set(turns.map((t) => t.armKey))].sort();
  const countOf = (record: CallRecord | undefined, name: string) => (record?.outputFile ? checks.get(record.outputFile)?.counts[name] : undefined);
  const keptRecord = (t: CheckedTurn) => (t.kept === 2 ? t.retry : t.kept === 1 ? t.first : undefined);
  const means = (own: CheckedTurn[], name: string) => ({
    first: mean(own.map((t) => countOf(t.first, name)).filter((v): v is number => v !== undefined)),
    kept: mean(own.map((t) => countOf(keptRecord(t), name)).filter((v): v is number => v !== undefined)),
  });
  return arms.map((key) => {
    const own = turns.filter((t) => t.armKey === key);
    return {
      armKey: key,
      turns: own.length,
      firstShort: own.filter((t) => t.firstShort).length,
      firstWithoutOptions: own.filter((t) => t.firstWithoutOptions).length,
      retried: own.filter((t) => t.retried).length,
      retriedBy: Object.fromEntries(RETRY_KINDS.map((kind) => [kind, own.filter((t) => t.retried === kind).length])) as Record<RetryKind, number>,
      keptShort: own.filter((t) => t.keptShort).length,
      failed: own.filter((t) => t.kept === undefined).length,
      words: means(own, "words"),
      sentences: means(own, "turnSentences"),
      costPerTurn: { first: mean(own.map((t) => t.firstCostUsd)), kept: mean(own.map((t) => t.costUsd)) },
      hangs: own.reduce((sum, t) => sum + t.hangs, 0),
    };
  });
}

export type LineReport = {
  generatedAt: Date;
  tallies: LineTally[];
  /** optionsFollowResults per arm, and the line against production, on the first replies and on the replies kept */
  options: { first: StageArmReading[]; kept: StageArmReading[] };
  /** Every automatic check, each turn read as one call: its first reply, and the reply kept with the whole wait and cost */
  firstComparisons: VariantComparison[];
  keptComparisons: VariantComparison[];
  /** The waits including the retry per turn kind and per sample, and the first reply's alone */
  waits: { kept: TurnWait[]; keptBySample: SampleWait[]; first: TurnWait[] };
  spendUsd: { turns: number; judge: number };
  problems: string[];
};

const pct = (n: number, d: number) => (d === 0 ? "–" : `${Math.round((100 * n) / d)}%`);
const ofTurns = (n: number, d: number) => `${n} of ${d}`;
const usd = (x: number) => `$${x.toFixed(4)}`;
const pText = (p?: number) => (p === undefined ? "" : p < 0.001 ? " (p < 0.001)" : ` (p ${p.toFixed(3)})`);

function optionRows(label: string, readings: StageArmReading[]): string[] {
  return readings.map((r) => {
    const own = `${r.plans.hits} of ${r.plans.n} (${pct(r.plans.hits, r.plans.n)})`;
    const vs = r.vsReference && r.referenceKey ? `${r.vsReference.arm.hits} of ${r.vsReference.arm.n} against ${r.vsReference.reference.hits} of ${r.vsReference.reference.n} (${r.referenceKey})` : "–";
    const reading = !r.vsReference ? "–" : r.vsReference.noise === undefined ? "no noise figure" : r.vsReference.moved ? `moved ${r.vsReference.moved}${pText(r.vsReference.p)}` : r.vsReference.beyondNoise ? `beyond the noise, not moved${pText(r.vsReference.p)}` : "within the noise";
    return `| ${label} | ${r.armKey} | ${own} | ${vs} | ${reading} |`;
  });
}

const f1 = (x: number) => x.toFixed(1);

/** choice-line-sp.md */
export function renderChoiceLine(report: LineReport): string {
  const lines = [
    "# The exploration line for one player, with production's retry in the loop (choice-line-sp)",
    "",
    `Generated ${report.generatedAt.toISOString()}. Production's single-player turn (${CHOICE_LINE_ARMS[0]}) and the exploration-order line (${CHOICE_LINE_ARMS[1]}) under ${CHOICE_LINE_SP_PROMPT_STATE}, interleaved, each turn with production's one retry where its first reply is one short paragraph or has no options (checkedBeatReply). A turn is read whole: the reply the game keeps is the player's turn, its wait includes the retry, its cost every attempt. Readings, not verdicts.`,
    "",
    "## The turns",
    "",
    "| Arm | Turns | First replies short | Retried (why) | Kept replies short | Turns that fail | First replies without options | Hung attempts |",
    "|---|---|---|---|---|---|---|---|",
    ...report.tallies.map(
      (t) =>
        `| ${t.armKey} | ${t.turns} | ${ofTurns(t.firstShort, t.turns)} | ${ofTurns(t.retried, t.turns)} (short ${t.retriedBy.short}, no options ${t.retriedBy.noOptions}, both ${t.retriedBy.both}) | ${ofTurns(t.keptShort, t.turns)} | ${t.failed} | ${t.firstWithoutOptions} | ${t.hangs} |`
    ),
    "",
    "## Options at their own result (optionsFollowResults, Luna low; calibrated reliable in the choice-result stage: 22 of 23, samples 23 of 24)",
    "",
    "A turn passes when its exploring player's options each carry out the result at their own position. The line against production on the (case, sample) pairs both have, under the stop rule (beyond production's two-sample noise and a one-sided Fisher p < 0.10).",
    "",
    "| Replies | Arm | Pass | Against production | Reading |",
    "|---|---|---|---|---|",
    ...optionRows("first", report.options.first),
    ...optionRows("kept (after the retry)", report.options.kept),
    "",
    "## Words, sentences and cost per turn (means)",
    "",
    "| Arm | Words, first reply → kept | Sentences, first reply → kept | Cost, first reply → with the retry |",
    "|---|---|---|---|",
    ...report.tallies.map((t) => `| ${t.armKey} | ${f1(t.words.first)} → ${f1(t.words.kept)} | ${f1(t.sentences.first)} → ${f1(t.sentences.kept)} | ${usd(t.costPerTurn.first)} → ${usd(t.costPerTurn.kept)} |`),
    "",
    "## Waits including the retry",
    "",
    "Each turn's wait is its first reply's plus the retry's, every attempt sent again at once included. A chapter opening is the turn alone here (no planner ran in this stage; production's chapter planner adds its own wait in play, planner v2f's p95 20.9 s in the choice-result stage).",
    ...renderTurnWaits(report.waits.kept),
    ...renderTurnWaitsBySample(report.waits.keptBySample),
    "",
    "### The first reply's wait alone",
    ...renderTurnWaits(report.waits.first),
    "",
    "## The automatic checks on the replies kept (each turn as one call: the reply kept, the whole wait and cost)",
    ...renderVariantComparison(report.keptComparisons),
    "",
    "## The automatic checks on the first replies",
    ...renderVariantComparison(report.firstComparisons),
    "",
    "## Spend",
    "",
    `Turns (both arms, every attempt, the retries included): ${usd(report.spendUsd.turns)}. The options judge: ${usd(report.spendUsd.judge)}.`,
    ...(report.problems.length ? ["", "## Problems", "", ...report.problems.map((p) => `- ${p}`)] : []),
  ];
  return `${lines.join("\n")}\n`;
}

const referencesOf = (key: string) => [referenceKeyOf(key), ...secondReferenceKeys(key)].filter((k): k is string => typeof k === "string");

/** The judge's answer to a target, sample 1, from prep-calls.jsonl. */
function answerFrom(ctx: Pick<PrepContext, "files">, prep: CallRecord[]): (key: string) => boolean | undefined {
  const arm = JUDGE_ARMS[0];
  return (key) => {
    const record = finishedPrepRecord(prep, jobKey(choiceJudgeCaseId(OPTIONS_CHECK, key), prepArmKey("judge", arm), CHOICE_LINE_SP_PROMPT_STATE, 1));
    return verdictFrom(record ? ctx.files.loadOutput(record) : undefined, OPTIONS_CHECK);
  };
}

// --- --choice-line-sp ---

export async function choiceLineMode(ctx: PrepContext, options: { reportOnly?: boolean; caseIds?: string[] } = {}): Promise<void> {
  const { files, log } = ctx;
  const records = files.readRecords().filter((r) => r.stage === STAGE && r.promptState === CHOICE_LINE_SP_PROMPT_STATE && CHOICE_LINE_ARMS.includes(r.armKey));
  const cases = files.readCases();
  const byId = new Map(cases.map((c) => [c.id, c]));
  const turns = await checkedTurns(records, files.loadOutput, (id) => {
    const evalCase = byId.get(id);
    return evalCase?.state !== undefined && caseStory(evalCase).getCurrentBeatType() === "ending";
  });
  const items = lineJudgeItems(turns, cases, files.loadOutput);
  const named = options.caseIds;
  const targets = items.filter((i) => !named || named.includes(i.turn.caseId)).flatMap((i) => [...(i.first?.targets ?? []), ...(i.retry?.targets ?? [])]);
  if (!options.reportOnly) {
    const jobs = choiceJudgeJobs(targets, JUDGE_ARMS[0], CHOICE_LINE_SP_PROMPT_STATE, STAGE);
    const done = finishedJobKeys(files.readPrepRecords());
    const open = jobs.filter((j) => !done.has(keyOf(j)));
    const estimate = open.reduce((sum, j) => sum + jobEstimateUsd(j), 0);
    ctx.refuse(STAGE, estimate);
    log(`${turns.length} turns (${turns.filter((t) => t.retry).length} retried), ${targets.length} replies to judge on ${JUDGE_ARMS[0].key}: ${open.length} open, est $${estimate.toFixed(3)}`);
    const result = await runJobs(jobs, ctx.deps("prep"), { caps: ctx.caps, previous: files.readPrepRecords(), extraSpend: spendBeside(files, "prep"), tokensPerMinute: ctx.tpm, maxInFlight: ctx.maxInFlight });
    if (result.stoppedReason) log(`Stopped: ${result.stoppedReason}`);
  }
  const prep = files.readPrepRecords();
  const verdicts = lineVerdicts(items, answerFrom(ctx, prep));
  const { checks } = checksForRecords(records, cases, files.loadOutput, files.loadReplyContent, files.loadPrompt);
  const tags = new Map(cases.map((c) => [c.id, c.tags]));
  const kinds = new Map(cases.flatMap((c): [string, TurnKind][] => {
    const kind = turnKindOf(c);
    return kind ? [[c.id, kind]] : [];
  }));
  const firstCalls = turns.map((t) => asCall(t, "first")).filter((r): r is CallRecord => r !== undefined);
  const keptCalls = turns.map((t) => asCall(t, "kept")).filter((r): r is CallRecord => r !== undefined);
  const report: LineReport = {
    generatedAt: new Date(),
    tallies: lineTallies(turns, checks),
    options: { first: stageReadings(verdicts.first, referencesOf), kept: stageReadings(verdicts.kept, referencesOf) },
    firstComparisons: variantComparisons(firstCalls, checks, tags, CHOICE_LINE_SP_PROMPT_STATE),
    keptComparisons: variantComparisons(keptCalls, checks, tags, CHOICE_LINE_SP_PROMPT_STATE),
    waits: { kept: turnWaitReadings(keptCalls, kinds), keptBySample: turnWaitsBySample(keptCalls, kinds), first: turnWaitReadings(firstCalls, kinds) },
    spendUsd: {
      turns: records.reduce((sum, r) => sum + r.costUsd, 0),
      judge: prep.filter((r) => r.stage === STAGE).reduce((sum, r) => sum + r.costUsd, 0),
    },
    problems: items.filter((i) => !i.first).map((i) => `${i.turn.armKey} ${i.turn.caseId} s${i.turn.sample}: no exploring player's options to judge in its first reply`),
  };
  const json = {
    generatedAt: report.generatedAt.toISOString(),
    turns: turns.map((t) => ({
      armKey: t.armKey,
      caseId: t.caseId,
      sample: t.sample,
      retried: t.retried,
      kept: t.kept,
      firstShort: t.firstShort,
      keptShort: t.keptShort,
      firstWaitMs: t.firstWaitMs,
      waitMs: t.waitMs,
      costUsd: t.costUsd,
      firstOutput: t.first.outputFile,
      retryOutput: t.retry?.outputFile,
      optionsFirst: verdicts.first.find((v) => v.caseId === t.caseId && v.sample === t.sample && v.armKey === t.armKey)?.passes,
      optionsKept: verdicts.kept.find((v) => v.caseId === t.caseId && v.sample === t.sample && v.armKey === t.armKey)?.passes,
    })),
    tallies: report.tallies,
    options: report.options,
    waits: report.waits,
    spendUsd: report.spendUsd,
  };
  files.writeChoiceLine(renderChoiceLine(report), json);
  for (const t of report.tallies) log(`${t.armKey}: ${t.turns} turns, first short ${t.firstShort}, retried ${t.retried}, kept short ${t.keptShort}, failed ${t.failed}`);
  for (const [label, readings] of [["first", report.options.first], ["kept", report.options.kept]] as const) {
    for (const r of readings) log(`  options ${label} ${r.armKey}: ${r.plans.hits} of ${r.plans.n}${r.vsReference?.moved ? `, moved ${r.vsReference.moved}` : r.vsReference?.beyondNoise ? ", beyond the noise, not moved" : ""}`);
  }
  log(`Wrote choice-line-sp.md and .json (turns $${report.spendUsd.turns.toFixed(4)}, judge $${report.spendUsd.judge.toFixed(4)}).`);
}
