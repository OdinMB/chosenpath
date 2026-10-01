import type { BeatGeneration } from "core/types/index.js";
import { armKey, KIDS_TURNS_PROMPT_STATE, type Stage } from "./arms.js";
import { caseStory } from "./cases.js";
import { asCall, checkedTurns, type CheckedTurn } from "./checkedTurns.js";
import { lineTallies, type LineTally } from "./choiceLinePrep.js";
import { outputIdOf } from "./judgedChecks.js";
import { meanWords, readabilityOf, readsForYoungChild, type Readability } from "./kidsReadability.js";
import { kidsTurnCasesToFreeze } from "./kidsTurnCases.js";
import { checksForRecords } from "./outputChecks.js";
import { playthroughRunsFrom } from "./playthroughMode.js";
import type { PlayRun } from "./playthroughs.js";
import { renderVariantComparison } from "./resultsReport.js";
import type { CallRecord, RetryKind } from "./runner.js";
import { meanMove, momentsOf, rateMove, type MeanMove, type Moments, type RateMove, type Tally } from "./stopRule.js";
import { isPlayerBeat } from "../../game/services/storyTextSteps.js";
import type { PrepContext } from "./turnPrep.js";
import { renderTurnWaits, renderTurnWaitsBySample, turnKindOf, turnWaitReadings, turnWaitsBySample, type SampleWait, type TurnKind, type TurnWait } from "./turnWaits.js";
import { variantComparisons, type VariantComparison } from "./variantComparison.js";

/*
 * The kids-turns stage's CLI modes (2026-10-01, fix 6 of the second
 * playthroughs' review), kept out of run.ts:
 * - --build-kids-cases: the stage's cases from the second round's stored mouse
 *   story (kidsTurnCases.ts), each only where its request is the one
 *   production sent there, recorded as a read-with-kids story with the
 *   child's age, frozen beside the others (those already frozen left as they
 *   are, unless --rebuild-cases); no calls;
 * - --kids-turns: the stage's report, no calls. Each turn job of the stage
 *   (--run --stage kids-turns --role beat --prompt-state adopted13, production's
 *   one checked retry in the loop) is read whole (checkedTurns.ts): its first
 *   reply, the retry where production's check asked again, and the reply the
 *   game keeps. The kept reply's text is read for its length and plainness
 *   (kidsReadability.ts: words, paragraphs, sentences, words per sentence,
 *   syllables per word, long words, the Flesch-Kincaid grade, and whether it
 *   reads for a young child), its options' and interludes' words beside it;
 *   per arm, and the variant against production under the stop rule (a mean
 *   beyond production's two-sample difference and 2 standard errors, a rate
 *   beyond it and Fisher p < 0.10). Beside them the turns' retries and short
 *   replies (lineTallies), every automatic check on the kept replies
 *   (variantComparison.ts; the paragraph and sentence checks read
 *   production's 5-6 paragraphs of 3-5 sentences, which the variant leaves on
 *   purpose), the waits including the retry, and cost. Writes kids-turns.md
 *   and .json.
 * The stage is single-player: a reply's first player beat is read.
 */

const STAGE: Stage = "kids-turns";
const PLAYTHROUGHS_2 = "playthroughs-2";

const LUNA_MEDIUM = { model: "gpt-6-luna", reasoningEffort: "medium" } as const;

/** The stage's arms: production's single-player turn and the kids turn. */
export const KIDS_ARMS = [armKey(LUNA_MEDIUM, "adopted"), armKey(LUNA_MEDIUM, "kidsTurn")];

/** A reply's text read for a young listener, and its options' and interludes' mean words. */
export type TextMeasures = Readability & { optionWords: number; interludeWords: number };

const MEASURES = ["words", "paragraphs", "sentences", "wordsPerSentence", "syllablesPerWord", "longWordShare", "grade", "optionWords", "interludeWords"] as const;
type Measure = (typeof MEASURES)[number];

/** The first player's beat of a reply, read; undefined where the reply has none. */
export function measuresOf(reply: unknown): TextMeasures | undefined {
  if (!reply || typeof reply !== "object") return undefined;
  const beat = Object.entries(reply).find(([key]) => isPlayerBeat(key))?.[1] as Partial<BeatGeneration> | undefined;
  if (!beat || typeof beat.text !== "string") return undefined;
  return {
    ...readabilityOf(beat.text),
    optionWords: meanWords((beat.options ?? []).map((o) => o.text)),
    interludeWords: meanWords((beat.interludes ?? []).map((i) => i.text)),
  };
}

/** A turn by its first reply and the reply the game keeps (none where the turn fails), and whether that reads for a young child. */
export type KidsTurnReading = {
  armKey: string;
  caseId: string;
  sample: number;
  retried?: RetryKind;
  first?: TextMeasures;
  kept?: TextMeasures;
  passes?: boolean;
  /** The reply kept's output id */
  outputId?: string;
};

/** Every checked turn read by its first reply and its kept reply. */
export function kidsTurnReadings(turns: CheckedTurn[], load: (record: CallRecord) => unknown): KidsTurnReading[] {
  return turns.map((t) => {
    const keptRecord = t.kept === 2 ? t.retry : t.kept === 1 ? t.first : undefined;
    const first = measuresOf(load(t.first));
    const kept = keptRecord ? measuresOf(load(keptRecord)) : undefined;
    return {
      armKey: t.armKey,
      caseId: t.caseId,
      sample: t.sample,
      ...(t.retried ? { retried: t.retried } : {}),
      first,
      kept,
      passes: kept ? readsForYoungChild(kept) : undefined,
      ...(keptRecord?.outputFile ? { outputId: outputIdOf(keptRecord.outputFile) } : {}),
    };
  });
}

export type MeasureReading = { measure: Measure; reference: Moments; arm: Moments; noise: number; move: MeanMove };

export type KidsArmReading = {
  armKey: string;
  turns: number;
  /** Turns with a reply the game keeps */
  kept: number;
  /** Turns whose kept reply reads for a young child, over every turn (a failed turn never does) */
  passes: Tally;
  means: Record<Measure, number>;
  vsReference?: {
    referenceKey: string;
    /** On the (case, sample) pairs both arms have */
    passes: { reference: Tally; arm: Tally; noise: number; move: RateMove };
    measures: MeasureReading[];
  };
};

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const pairKey = (r: Pick<KidsTurnReading, "caseId" | "sample">) => `${r.caseId}|${r.sample}`;

/** The reference's sample 1 against its sample 2 on the cases with both: a measure's difference of means. */
function measureNoise(reference: KidsTurnReading[], value: (r: KidsTurnReading) => number | undefined): number {
  const cases = [...new Set(reference.map((r) => r.caseId))].filter((c) => [1, 2].every((s) => reference.some((r) => r.caseId === c && r.sample === s && value(r) !== undefined)));
  const at = (sample: number) => mean(reference.filter((r) => r.sample === sample && cases.includes(r.caseId)).map(value).filter((v): v is number => v !== undefined));
  return cases.length ? Math.abs(at(1) - at(2)) : 0;
}

/**
 * Per arm (production first, KIDS_ARMS' order): its turns, the kept replies'
 * means and passes; the variant against production on the pairs both have,
 * with production's two-sample difference as the noise.
 */
export function kidsArmReadings(readings: KidsTurnReading[], reference = KIDS_ARMS[0]): KidsArmReading[] {
  const arms = [...new Set(readings.map((r) => r.armKey))].sort((a, b) => (a === reference ? -1 : b === reference ? 1 : a.localeCompare(b)));
  const own = (key: string) => readings.filter((r) => r.armKey === key);
  const refReadings = own(reference);
  return arms.map((key) => {
    const mine = own(key);
    const keptOnes = mine.filter((r) => r.kept !== undefined);
    const means = Object.fromEntries(MEASURES.map((m) => [m, mean(keptOnes.map((r) => (r.kept as TextMeasures)[m]))])) as Record<Measure, number>;
    const base: KidsArmReading = { armKey: key, turns: mine.length, kept: keptOnes.length, passes: { hits: mine.filter((r) => r.passes).length, n: mine.length }, means };
    if (key === reference || refReadings.length === 0) return base;
    const shared = new Set(mine.map(pairKey).filter((k) => refReadings.some((r) => pairKey(r) === k)));
    const onShared = (list: KidsTurnReading[]) => list.filter((r) => shared.has(pairKey(r)));
    const [refShared, armShared] = [onShared(refReadings), onShared(mine)];
    const tally = (list: KidsTurnReading[]): Tally => ({ hits: list.filter((r) => r.passes).length, n: list.length });
    const rate = (list: KidsTurnReading[], sample: number) => {
      const t = tally(list.filter((r) => r.sample === sample));
      return t.n ? t.hits / t.n : 0;
    };
    const passNoise = Math.abs(rate(refReadings, 1) - rate(refReadings, 2));
    const measures = MEASURES.map((measure): MeasureReading => {
      const value = (r: KidsTurnReading) => r.kept?.[measure];
      const values = (list: KidsTurnReading[]) => list.map(value).filter((v): v is number => v !== undefined);
      const noise = measureNoise(refReadings, value);
      const [ref, arm] = [momentsOf(values(refShared)), momentsOf(values(armShared))];
      return { measure, reference: ref, arm, noise, move: meanMove(ref, arm, noise) };
    });
    return {
      ...base,
      vsReference: {
        referenceKey: reference,
        passes: { reference: tally(refShared), arm: tally(armShared), noise: passNoise, move: rateMove(tally(refShared), tally(armShared), passNoise) },
        measures,
      },
    };
  });
}

export type KidsReport = {
  generatedAt: Date;
  tallies: LineTally[];
  /** On the replies the game keeps, and on the first replies (before production's retry) */
  arms: KidsArmReading[];
  firstArms: KidsArmReading[];
  turns: KidsTurnReading[];
  keptComparisons: VariantComparison[];
  waits: { kept: TurnWait[]; keptBySample: SampleWait[]; first: TurnWait[] };
  spendUsd: number;
  problems: string[];
};

const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);
const pct = (x: number) => `${Math.round(100 * x)}%`;
const usd = (x: number) => `$${x.toFixed(4)}`;
const ofN = (t: Tally) => `${t.hits} of ${t.n}`;
const moveText = (move: RateMove | MeanMove) =>
  move.moved ? `moved ${move.moved}` : move.beyondNoise ? "beyond the noise, not moved" : "within the noise";
const MEASURE_LABELS: Record<Measure, string> = {
  words: "Words",
  paragraphs: "Paragraphs",
  sentences: "Sentences",
  wordsPerSentence: "Words per sentence",
  syllablesPerWord: "Syllables per word",
  longWordShare: "Long words (3+ syllables, names out)",
  grade: "Flesch-Kincaid grade",
  optionWords: "Words per option",
  interludeWords: "Words per interlude",
};
const measureText = (measure: Measure, value: number) => (measure === "longWordShare" ? pct(value) : measure === "syllablesPerWord" ? f2(value) : f1(value));

function armRows(arms: KidsArmReading[]): string[] {
  return [
    `| Measure | ${arms.map((a) => a.armKey).join(" | ")} | Against production | Noise | Reading |`,
    `|---|${arms.map(() => "---|").join("")}---|---|---|`,
    `| Reads for a young child (at most 160 words, 12 words a sentence, grade 4) | ${arms.map((a) => ofN(a.passes)).join(" | ")} | ${arms[1]?.vsReference ? `${ofN(arms[1].vsReference.passes.arm)} against ${ofN(arms[1].vsReference.passes.reference)}` : "–"} | ${arms[1]?.vsReference ? pct(arms[1].vsReference.passes.noise) : "–"} | ${arms[1]?.vsReference ? `${moveText(arms[1].vsReference.passes.move)}${arms[1].vsReference.passes.move.p !== undefined ? ` (p ${arms[1].vsReference.passes.move.p.toFixed(3)})` : ""}` : "–"} |`,
    ...MEASURES.map((measure) => {
      const vs = arms[1]?.vsReference?.measures.find((m) => m.measure === measure);
      return `| ${MEASURE_LABELS[measure]} | ${arms.map((a) => measureText(measure, a.means[measure])).join(" | ")} | ${vs ? `${measureText(measure, vs.arm.mean)} against ${measureText(measure, vs.reference.mean)}` : "–"} | ${vs ? measureText(measure, vs.noise) : "–"} | ${vs ? moveText(vs.move) : "–"} |`;
    }),
  ];
}

/** kids-turns.md */
export function renderKidsTurns(report: KidsReport): string {
  const byCase = [...new Set(report.turns.map((t) => t.caseId))].sort();
  const cell = (caseId: string, arm: string, sample: number) => {
    const t = report.turns.find((r) => r.caseId === caseId && r.armKey === arm && r.sample === sample);
    if (!t) return "–";
    if (!t.kept) return "fails";
    return `${t.kept.words} w, ${t.kept.paragraphs} ¶, ${f1(t.kept.wordsPerSentence)} w/s, grade ${f1(t.kept.grade)}${t.retried ? " (retried)" : ""}${t.passes ? " ✓" : ""}`;
  };
  const arms = [...new Set(report.turns.map((t) => t.armKey))].sort();
  const lines = [
    "# Read-with-kids turns, shorter and simpler (kids-turns)",
    "",
    `Generated ${report.generatedAt.toISOString()}. Production's single-player turn (${KIDS_ARMS[0]}) and the kids turn (${KIDS_ARMS[1]}) under ${KIDS_TURNS_PROMPT_STATE}, interleaved, each turn with production's one retry where its first reply is one short paragraph or has no options (the variant's retry asks for its short count). A turn is read by the reply the game keeps, its length and plainness counted (kidsReadability.ts; deterministic, no judge). Readings, not verdicts.`,
    "",
    "## Length and plainness of the replies kept (means per turn)",
    "",
    "The variant against production on the (case, sample) pairs both have, under the stop rule: beyond production's two-sample difference, and a mean at 2 standard errors or a rate at a one-sided Fisher p < 0.10.",
    "",
    ...armRows(report.arms),
    "",
    "## The same on the first replies (before production's retry)",
    "",
    ...armRows(report.firstArms),
    "",
    "## Per turn (the reply kept: words, paragraphs, words per sentence, grade; ✓ reads for a young child)",
    "",
    `| Case | Sample | ${arms.join(" | ")} |`,
    `|---|---|${arms.map(() => "---|").join("")}`,
    ...byCase.flatMap((c) => [1, 2].map((s) => `| ${c} | ${s} | ${arms.map((a) => cell(c, a, s)).join(" | ")} |`)),
    "",
    "## The turns and production's retry",
    "",
    "| Arm | Turns | First replies short | Retried (why) | Kept replies short | Turns that fail | Cost, first reply → with the retry |",
    "|---|---|---|---|---|---|---|",
    ...report.tallies.map(
      (t) =>
        `| ${t.armKey} | ${t.turns} | ${t.firstShort} of ${t.turns} | ${t.retried} of ${t.turns} (short ${t.retriedBy.short}, no options ${t.retriedBy.noOptions}, both ${t.retriedBy.both}) | ${t.keptShort} of ${t.turns} | ${t.failed} | ${usd(t.costPerTurn.first)} → ${usd(t.costPerTurn.kept)} |`
    ),
    "",
    "## Waits including the retry",
    "",
    "Each turn's wait is its first reply's plus the retry's. A chapter opening is the turn alone (no planner ran in this stage).",
    ...renderTurnWaits(report.waits.kept),
    ...renderTurnWaitsBySample(report.waits.keptBySample),
    "",
    "### The first reply's wait alone",
    ...renderTurnWaits(report.waits.first),
    "",
    "## The automatic checks on the replies kept (each turn as one call: the reply kept, the whole wait and cost)",
    "",
    "`paragraphs` and `sentences` read production's 5-6 paragraphs of 3-5 sentences, which the variant leaves on purpose on a read-with-kids story.",
    ...renderVariantComparison(report.keptComparisons),
    "",
    "## Spend",
    "",
    `Turns (both arms, every attempt, the retries included): ${usd(report.spendUsd)}. No judge calls.`,
    ...(report.problems.length ? ["", "## Problems", "", ...report.problems.map((p) => `- ${p}`)] : []),
  ];
  return `${lines.join("\n")}\n`;
}

const runsOf = (ctx: Pick<PrepContext, "files">): PlayRun[] => playthroughRunsFrom(ctx.files.readPlaythroughs(PLAYTHROUGHS_2));

/** The prompt hash each stored playthrough call sent, by its output file. */
const promptHashesOf = (ctx: Pick<PrepContext, "files">) => {
  const byId = new Map(ctx.files.readPrepRecords().flatMap((r) => (r.outputFile && r.promptHash ? [[outputIdOf(r.outputFile), r.promptHash] as [string, string]] : [])));
  return (outputFile: string) => byId.get(outputIdOf(outputFile));
};

// --- --build-kids-cases ---

export function buildKidsCasesMode(ctx: Pick<PrepContext, "files" | "log">, replace: boolean): void {
  const { files, log } = ctx;
  if (!files.casesExist()) throw new Error("No frozen cases. Run --build-cases first.");
  const runs = runsOf(ctx);
  if (runs.length === 0) throw new Error("No stored second-round playthroughs (playthroughs-2.json). Run --playthroughs --round 2 first.");
  const { cases, problems, skipped } = kidsTurnCasesToFreeze(files.readCases(), runs, promptHashesOf(ctx), replace);
  if (problems.length) throw new Error(problems.join("; "));
  if (skipped.length) log(`Already frozen, left as they are: ${skipped.join(", ")}.`);
  if (cases.length === 0) return log("Nothing new to freeze; no calls.");
  files.addCases(cases, undefined, replace);
  log(`Froze ${cases.map((c) => c.id).join(", ")} beside the other cases; no calls.`);
}

// --- --kids-turns ---

export async function kidsTurnsMode(ctx: Pick<PrepContext, "files" | "log">): Promise<void> {
  const { files, log } = ctx;
  const records = files.readRecords().filter((r) => r.stage === STAGE && r.promptState === KIDS_TURNS_PROMPT_STATE && KIDS_ARMS.includes(r.armKey));
  const cases = files.readCases();
  const byId = new Map(cases.map((c) => [c.id, c]));
  const turns = await checkedTurns(records, files.loadOutput, (id) => {
    const evalCase = byId.get(id);
    return evalCase?.state !== undefined && caseStory(evalCase).getCurrentBeatType() === "ending";
  });
  const readings = kidsTurnReadings(turns, files.loadOutput);
  const { checks } = checksForRecords(records, cases, files.loadOutput, files.loadReplyContent, files.loadPrompt);
  const tags = new Map(cases.map((c) => [c.id, c.tags]));
  const kinds = new Map(
    cases.flatMap((c): [string, TurnKind][] => {
      const kind = turnKindOf(c);
      return kind ? [[c.id, kind]] : [];
    })
  );
  const firstCalls = turns.map((t) => asCall(t, "first")).filter((r): r is CallRecord => r !== undefined);
  const keptCalls = turns.map((t) => asCall(t, "kept")).filter((r): r is CallRecord => r !== undefined);
  const firstOnly = readings.map((r) => ({ ...r, kept: r.first, passes: r.first ? readsForYoungChild(r.first) : undefined }));
  const report: KidsReport = {
    generatedAt: new Date(),
    tallies: lineTallies(turns, checks),
    arms: kidsArmReadings(readings),
    firstArms: kidsArmReadings(firstOnly),
    turns: readings,
    keptComparisons: variantComparisons(keptCalls, checks, tags, KIDS_TURNS_PROMPT_STATE),
    waits: { kept: turnWaitReadings(keptCalls, kinds), keptBySample: turnWaitsBySample(keptCalls, kinds), first: turnWaitReadings(firstCalls, kinds) },
    spendUsd: records.reduce((sum, r) => sum + r.costUsd, 0),
    problems: readings.filter((r) => !r.kept).map((r) => `${r.armKey} ${r.caseId} s${r.sample}: no reply the game keeps`),
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
      reading: readings.find((r) => r.caseId === t.caseId && r.sample === t.sample && r.armKey === t.armKey),
    })),
    arms: report.arms,
    firstArms: report.firstArms,
    tallies: report.tallies,
    waits: report.waits,
    spendUsd: report.spendUsd,
  };
  files.writeKidsTurns(renderKidsTurns(report), json);
  for (const a of report.arms) {
    const vs = a.vsReference;
    log(`${a.armKey}: ${a.turns} turns, ${a.kept} kept, reads for a young child ${ofN(a.passes)}; words ${f1(a.means.words)}, grade ${f1(a.means.grade)}${vs ? `; passes ${moveText(vs.passes.move)}, words ${moveText(vs.measures.find((m) => m.measure === "words")?.move ?? {})}` : ""}`);
  }
  for (const t of report.tallies) log(`  ${t.armKey}: first short ${t.firstShort}, retried ${t.retried}, kept short ${t.keptShort}, failed ${t.failed}`);
  log(`Wrote kids-turns.md and .json (turns $${report.spendUsd.toFixed(4)}; no calls).`);
}
