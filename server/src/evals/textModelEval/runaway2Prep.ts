import { armKey, RUNAWAY_2_PROMPT_STATE, type Stage } from "./arms.js";
import { USABLE_OUTCOMES, type Outcome } from "./responseCheck.js";
import type { CallRecord } from "./runner.js";
import { meanMove, momentsOf, rateMove, type MeanMove, type Moments, type RateMove, type Tally } from "./stopRule.js";
import type { PrepContext } from "./turnPrep.js";

/*
 * The second runaway replay's report (--runaway-2, 2026-10-01; no calls). The
 * stage (--run --stage runaway-2 --role beat --prompt-state adopted19) sends
 * production's closing turn and two diagnostics, each without one of the two
 * blocks only a closing turn carries, on the case that ran away most. What it
 * counts is each job's first try: answered, or run away (cut at production's
 * 12,000-token output cap, or by its 90-second timeout, which the replay of
 * 2026-09-30 showed is the same runaway a second or two before the cap). A
 * transport failure is not a try: the first try is the first attempt the model
 * answered or ran away on, and a job with none is a failed try, counted apart.
 * Each arm against production on the samples both have, under the stop rule
 * (stopRule.ts): moved only beyond production's own two-half difference (its
 * odd samples against its even ones) and at a one-sided Fisher p < 0.10. Beside
 * it the answered replies' reasoning tokens (a mean against production's, the
 * same rule: where a block is what the model deliberates over, taking it out
 * shortens the thinking too), waits, cost, every runaway with its time (the
 * runaways come in bursts), and the answered replies' stat changes and
 * milestones for the hand read. Writes runaway-2.md and .json.
 */

const STAGE: Stage = "runaway-2";
const LUNA_MEDIUM = { model: "gpt-6-luna", reasoningEffort: "medium" } as const;

/** The stage's arms in order: production's closing turn, then the two diagnostics. */
export const RUNAWAY_2_ARMS = [armKey(LUNA_MEDIUM, "adopted"), armKey(LUNA_MEDIUM, "noThreadAudit"), armKey(LUNA_MEDIUM, "noNewMilestones")];
const REFERENCE = RUNAWAY_2_ARMS[0];

/** Failures before the model sees the request: not a try. */
const TRANSPORT: Outcome[] = ["network-error", "http-error"];

export type TryKind = "answered" | "runaway" | "failed";

export type FirstTry = {
  armKey: string;
  variant: string;
  caseId: string;
  sample: number;
  startedAt: string;
  kind: TryKind;
  /** How a runaway was cut: at the output cap, or by the timeout */
  cut?: "length" | "timeout";
  reasoningTokens: number;
  outputTokens: number;
  latencyMs: number;
  /** Attempts after the first try, and whether the last of them answered */
  retries: number;
  retryAnswered?: boolean;
  /** The job's cost, every attempt */
  costUsd: number;
  outputFile?: string;
};

/** Each job's first try (step 1), in arm, case and sample order. */
export function firstTries(records: CallRecord[]): FirstTry[] {
  const jobs = new Map<string, CallRecord[]>();
  for (const r of records) {
    if (r.stage !== STAGE || r.step !== 1) continue;
    jobs.set(r.jobKey, [...(jobs.get(r.jobKey) ?? []), r]);
  }
  const order = (key: string) => (RUNAWAY_2_ARMS.includes(key) ? RUNAWAY_2_ARMS.indexOf(key) : RUNAWAY_2_ARMS.length);
  return [...jobs.values()]
    .map((attempts): FirstTry => {
      const sorted = [...attempts].sort((a, b) => a.attempt - b.attempt);
      const index = sorted.findIndex((r) => !TRANSPORT.includes(r.outcome));
      const first = index >= 0 ? sorted[index] : sorted[sorted.length - 1];
      const later = index >= 0 ? sorted.slice(index + 1) : [];
      const kind: TryKind =
        index < 0 ? "failed" : USABLE_OUTCOMES.includes(first.outcome) ? "answered" : first.outcome === "length" || first.finishReason === "length" || first.outcome === "timeout" ? "runaway" : "failed";
      const last = later[later.length - 1];
      return {
        armKey: first.armKey,
        variant: first.armKey.split("/")[1] ?? first.armKey,
        caseId: first.caseId,
        sample: first.sample,
        startedAt: first.startedAt,
        kind,
        ...(kind === "runaway" ? { cut: first.outcome === "timeout" ? ("timeout" as const) : ("length" as const) } : {}),
        reasoningTokens: first.reasoningTokens,
        outputTokens: first.outputTokens,
        latencyMs: first.latencyMs,
        retries: later.length,
        ...(last ? { retryAnswered: USABLE_OUTCOMES.includes(last.outcome) } : {}),
        costUsd: sorted.reduce((sum, r) => sum + r.costUsd, 0),
        ...(kind === "answered" && first.outputFile ? { outputFile: first.outputFile } : {}),
      };
    })
    .sort((a, b) => order(a.armKey) - order(b.armKey) || a.armKey.localeCompare(b.armKey) || a.caseId.localeCompare(b.caseId) || a.sample - b.sample);
}

export type ArmReading = {
  key: string;
  variant: string;
  /** Answered or run away: the tries the rate counts */
  tries: number;
  answered: number;
  runaways: number;
  /** Transport failures only, never a try */
  failed: number;
  retries: number;
  /** Tries whose last retry answered */
  retriesAnswered: number;
  /** The answered first tries' reasoning tokens */
  reasoning: Moments;
  reasoningMedian: number;
  latencyMedianMs: number;
  costUsd: number;
  /** Against production on the (case, sample) pairs both have; production itself has none */
  runawayMove?: { arm: Tally; reference: Tally; noise: number; move: RateMove };
  reasoningMove?: { arm: Moments; reference: Moments; noise: number; move: MeanMove };
};

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const pairOf = (t: FirstTry) => `${t.caseId}|${t.sample}`;
const counted = (t: FirstTry) => t.kind !== "failed";
const tally = (tries: FirstTry[]): Tally => ({ hits: tries.filter((t) => t.kind === "runaway").length, n: tries.length });
const rateOf = (tries: FirstTry[]) => (tries.length ? tally(tries).hits / tries.length : 0);
const reasoningOf = (tries: FirstTry[]) => tries.filter((t) => t.kind === "answered").map((t) => t.reasoningTokens);
/** Production's two halves on the pairs: its odd samples against its even ones. */
const halves = (tries: FirstTry[]) => [tries.filter((t) => t.sample % 2 === 1), tries.filter((t) => t.sample % 2 === 0)];

/** Each arm's first tries, and each variant against production on the pairs both have. */
export function runawayArmReadings(tries: FirstTry[]): ArmReading[] {
  const keys = [...new Set(tries.map((t) => t.armKey))];
  const reference = tries.filter((t) => t.armKey === REFERENCE && counted(t));
  return keys.map((key): ArmReading => {
    const all = tries.filter((t) => t.armKey === key);
    const mine = all.filter(counted);
    const answered = mine.filter((t) => t.kind === "answered");
    const reading: ArmReading = {
      key,
      variant: key.split("/")[1] ?? key,
      tries: mine.length,
      answered: answered.length,
      runaways: mine.length - answered.length,
      failed: all.length - mine.length,
      retries: all.reduce((sum, t) => sum + t.retries, 0),
      retriesAnswered: all.filter((t) => t.retryAnswered).length,
      reasoning: momentsOf(reasoningOf(mine)),
      reasoningMedian: median(reasoningOf(mine)),
      latencyMedianMs: median(answered.map((t) => t.latencyMs)),
      costUsd: all.reduce((sum, t) => sum + t.costUsd, 0),
    };
    if (key === REFERENCE || reference.length === 0) return reading;
    const pairs = new Set(mine.map(pairOf).filter((p) => reference.some((r) => pairOf(r) === p)));
    const [ours, theirs] = [mine.filter((t) => pairs.has(pairOf(t))), reference.filter((t) => pairs.has(pairOf(t)))];
    if (theirs.length === 0) return reading;
    const [odd, even] = halves(theirs);
    const rateNoise = odd.length && even.length ? Math.abs(rateOf(odd) - rateOf(even)) : 0;
    const [oddMean, evenMean] = [momentsOf(reasoningOf(odd)), momentsOf(reasoningOf(even))];
    const meanNoise = oddMean.n && evenMean.n ? Math.abs(oddMean.mean - evenMean.mean) : 0;
    const [armMoments, referenceMoments] = [momentsOf(reasoningOf(ours)), momentsOf(reasoningOf(theirs))];
    return {
      ...reading,
      runawayMove: { arm: tally(ours), reference: tally(theirs), noise: rateNoise, move: rateMove(tally(theirs), tally(ours), rateNoise) },
      reasoningMove: { arm: armMoments, reference: referenceMoments, noise: meanNoise, move: meanMove(referenceMoments, armMoments, meanNoise) },
    };
  });
}

/** An answered reply's stat changes and milestones, for the hand read. */
export type ReplyReading = { armKey: string; caseId: string; sample: number; statChanges: string[]; milestones: string[] };

/** What an answered first try's reply changed: its stat changes and the milestones it wrote. */
export function replyReading(t: FirstTry, parsed: unknown): ReplyReading {
  const reply = (parsed ?? {}) as { statChanges?: unknown; newMilestones?: unknown };
  const changes = Array.isArray(reply.statChanges) ? (reply.statChanges as { group?: string; stat?: string; change?: string; value?: unknown }[]) : [];
  const milestones = Array.isArray(reply.newMilestones) ? (reply.newMilestones as { outcome?: string; newMilestone?: string }[]) : [];
  return {
    armKey: t.armKey,
    caseId: t.caseId,
    sample: t.sample,
    statChanges: changes.map((c) => `${c.group}.${c.stat} ${c.change} ${String(c.value)}`),
    milestones: milestones.map((m) => `${m.outcome}: ${m.newMilestone}`),
  };
}

export type Runaway2Report = { generatedAt: Date; tries: FirstTry[]; readings: ArmReading[]; replies: ReplyReading[]; spendUsd: number };

const usd = (n: number) => `$${n.toFixed(4)}`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const thousands = (n: number) => Math.round(n).toLocaleString("en-US");
const ofN = (t: Tally) => `${t.hits} of ${t.n}`;
const clock = (iso: string) => iso.slice(11, 19);

function rateText(move: RateMove): string {
  if (!move.beyondNoise) return "within the noise";
  const p = move.p === undefined ? "" : `, p ${move.p < 0.001 ? "< 0.001" : move.p.toFixed(3)}`;
  return move.moved ? `moved ${move.moved}${p}` : `beyond the noise (${move.beyondNoise}) but not moved${p}`;
}

function meanText(move: MeanMove): string {
  if (!move.beyondNoise) return "within the noise";
  const se = move.standardErrors === undefined ? "" : move.standardErrors === Infinity ? ", no spread" : `, ${move.standardErrors.toFixed(1)} SE`;
  return move.moved ? `moved ${move.moved}${se}` : `beyond the noise (${move.beyondNoise}) but not moved${se}`;
}

/** runaway-2.md */
export function renderRunaway2(report: Runaway2Report): string {
  const lines = [
    "# The runaway turn, second attempt (runaway-2)",
    "",
    `Generated ${report.generatedAt.toISOString()}. Spend ${usd(report.spendUsd)} (every attempt, retries included; no judge calls).`,
    "",
    "Each job's first try on production's closing turn and the two diagnostics (noThreadAudit: no after-thread stat audit; noNewMilestones: no milestone written), production's single-player limits (12,000 output tokens, 90 s). A runaway is a first try cut at the cap, or by the timeout.",
    "",
    "## First tries per arm",
    "",
    "| Arm | First tries | Runaways | Answered | Transport failures | Retries that answered | Reasoning tokens, answered (median / mean) | Wait, answered (median) | Cost |",
    "|---|---|---|---|---|---|---|---|---|",
    ...report.readings.map(
      (r) =>
        `| ${r.key} | ${r.tries} | ${r.runaways} | ${r.answered} | ${r.failed} | ${r.retriesAnswered} of ${r.tries - r.answered} | ${thousands(r.reasoningMedian)} / ${thousands(r.reasoning.mean)} | ${secs(r.latencyMedianMs)} | ${usd(r.costUsd)} |`
    ),
    "",
    "## Against production (the samples both have; the stop rule)",
    "",
    "| Arm | Runaways | Production's | Noise (production's odd against even samples) | Reading | Reasoning tokens, mean | Production's | Noise | Reading |",
    "|---|---|---|---|---|---|---|---|---|",
    ...report.readings
      .filter((r) => r.runawayMove)
      .map((r) => {
        const rate = r.runawayMove!;
        const mean = r.reasoningMove!;
        return `| ${r.key} | ${ofN(rate.arm)} | ${ofN(rate.reference)} | ${rate.noise.toFixed(3)} | ${rateText(rate.move)} | ${thousands(mean.arm.mean)} | ${thousands(mean.reference.mean)} | ${thousands(mean.noise)} | ${meanText(mean.move)} |`;
      }),
    "",
    "## Every runaway first try",
    "",
    ...report.tries
      .filter((t) => t.kind === "runaway")
      .map(
        (t) =>
          `- ${t.caseId} s${t.sample} (${t.armKey}), ${clock(t.startedAt)} UTC: ${t.cut === "timeout" ? "cut by the timeout" : `cut at the output cap (${thousands(t.reasoningTokens)} reasoning tokens)`}, ${secs(t.latencyMs)}; ${
            t.retries === 0 ? "no retry" : t.retryAnswered ? `its retry answered (${t.retries} ${t.retries === 1 ? "retry" : "retries"})` : "no retry answered"
          }`
      ),
    "",
    "## The answered replies' stat changes and milestones (for the hand read)",
    "",
    ...report.replies.flatMap((r) => [`- ${r.caseId} s${r.sample} (${r.armKey}): ${r.statChanges.length ? r.statChanges.join("; ") : "no stat change"}`, ...r.milestones.map((m) => `  - milestone ${m}`)]),
    "",
  ];
  return lines.join("\n");
}

export async function runaway2Mode(ctx: Pick<PrepContext, "files" | "log">): Promise<void> {
  const { files, log } = ctx;
  const records = files.readRecords().filter((r) => r.stage === STAGE && r.promptState === RUNAWAY_2_PROMPT_STATE && r.group === "beat");
  const tries = firstTries(records);
  const readings = runawayArmReadings(tries);
  const replies = tries.filter((t) => t.kind === "answered" && t.outputFile).map((t) => replyReading(t, files.loadOutputFile(t.outputFile!)));
  const report: Runaway2Report = { generatedAt: new Date(), tries, readings, replies, spendUsd: records.reduce((sum, r) => sum + r.costUsd, 0) };
  files.writeRunaway2(renderRunaway2(report), { generatedAt: report.generatedAt.toISOString(), readings, tries, replies, spendUsd: report.spendUsd });
  for (const r of readings) {
    const move = r.runawayMove ? `; against production ${ofN(r.runawayMove.arm)} vs ${ofN(r.runawayMove.reference)}, ${rateText(r.runawayMove.move)}` : "";
    log(`${r.key}: ${r.runaways} runaways in ${r.tries} first tries (${r.failed} transport failures), reasoning median ${thousands(r.reasoningMedian)}${move}`);
  }
  log(`Wrote runaway-2.md and .json (turns ${usd(report.spendUsd)}; no calls).`);
}
