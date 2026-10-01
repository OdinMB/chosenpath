import type { Story } from "core/models/Story.js";
import type { SetOfBeatGenerationSchema } from "core/types/index.js";
import { paragraphsOf } from "../../game/services/beatChecks.js";
import { kidsBand, takesKidsRules } from "../../game/services/kidsTurnRules.js";
import { isPlayerBeat } from "../../game/services/storyTextSteps.js";
import { armKey, SHORT_REPLIES_PROMPT_STATE, type Stage } from "./arms.js";
import { caseStory, type EvalCase } from "./cases.js";
import { asCall, checkedTurns, type CheckedTurn } from "./checkedTurns.js";
import { lineTallies, type LineTally } from "./choiceLinePrep.js";
import { outputIdOf } from "./judgedChecks.js";
import { checksForRecords } from "./outputChecks.js";
import { playthroughRunsFrom } from "./playthroughMode.js";
import type { PlayRun } from "./playthroughs.js";
import { renderVariantComparison } from "./resultsReport.js";
import type { CallRecord, RetryKind } from "./runner.js";
import { shortRepliesCasesToFreeze } from "./shortRepliesCases.js";
import { rateMove, type RateMove, type Tally } from "./stopRule.js";
import type { PrepContext } from "./turnPrep.js";
import { renderTurnWaits, renderTurnWaitsBySample, turnKindOf, turnWaitReadings, turnWaitsBySample, type SampleWait, type TurnKind, type TurnWait } from "./turnWaits.js";
import { variantComparisons, type VariantComparison } from "./variantComparison.js";

/*
 * The short-replies stage's CLI modes (2026-10-01, the coordinator's brief
 * after the second playthroughs: 13 of 126 first replies one short paragraph,
 * 2 short again after production's retry), kept out of run.ts:
 * - --build-short-reply-cases: the round's short turns no stage had frozen
 *   (shortRepliesCases.ts), each only where its request is the one production
 *   sent there, frozen beside the others (those already frozen left as they
 *   are, unless --rebuild-cases); no calls;
 * - --short-replies: the stage's report, no calls. Each turn job of the stage
 *   (--run --stage short-replies --role beat --prompt-state adopted18,
 *   production's one checked retry in the loop) is read whole
 *   (checkedTurns.ts): each player's text by its paragraphs as the client
 *   splits them (paragraphsOf, production's check) and its words, in the first
 *   reply and in the reply the game keeps, beside the count the turn's form
 *   asks for (5-6, or a kids band's). Production and the variant pooled over
 *   both turn models, and per model, the variant against production on the
 *   (case, sample) pairs both have under the stop rule (stopRule.ts: beyond
 *   production's two-sample difference and a one-sided Fisher p < 0.10);
 *   beside them every short text's opening for the hand read, the retries,
 *   every automatic check on the first replies and on the replies kept
 *   (variantComparison.ts), the waits including the retry, and cost. Writes
 *   short-replies.md and .json.
 */

const STAGE: Stage = "short-replies";
const PLAYTHROUGHS_2 = "playthroughs-2";
const LUNA_MEDIUM = { model: "gpt-6-luna", reasoningEffort: "medium" } as const;
const LUNA_LOW = { model: "gpt-6-luna", reasoningEffort: "low" } as const;
const REFERENCE = "adopted";

/** The stage's arms: production's turn and the variant on each turn model (one player, groups). */
export const SHORT_REPLIES_ARMS = [armKey(LUNA_MEDIUM, "adopted"), armKey(LUNA_MEDIUM, "shortReplies"), armKey(LUNA_LOW, "adopted"), armKey(LUNA_LOW, "shortReplies")];

/** One player's text: its paragraphs as the client splits them, and its words. */
export type TextReading = { slot: string; paragraphs: number; words: number };

/** Each player's text in a reply, in seat order. */
export function textReadings(reply: SetOfBeatGenerationSchema): TextReading[] {
  return Object.entries(reply)
    .filter(([key]) => isPlayerBeat(key))
    .map(([key, beat]) => {
      const text = String((beat as { text?: unknown } | undefined)?.text ?? "");
      return { slot: key.toLowerCase(), paragraphs: paragraphsOf(text).length, words: text.split(/\s+/).filter(Boolean).length };
    })
    .sort((a, b) => a.slot.localeCompare(b.slot, undefined, { numeric: true }));
}

/** The paragraphs a turn's form asks for: production's 5-6, a read-with-kids band's 2-3, 3-4 or 4-5. */
export function askedParagraphs(story: Story): { min: number; max: number } {
  if (!takesKidsRules(story)) return { min: 5, max: 6 };
  const band = kidsBand(story);
  return band === "3-5" ? { min: 2, max: 3 } : band === "6-8" ? { min: 3, max: 4 } : { min: 4, max: 5 };
}

export type ShortTurnReading = {
  armKey: string;
  /** The arm's variant: production (adopted) or the candidate */
  variant: string;
  caseId: string;
  sample: number;
  players: number;
  asked: { min: number; max: number };
  /** The first reply's texts */
  first: TextReading[];
  firstShort: boolean;
  /** Why production's check asked again */
  retried?: RetryKind;
  /** Whether the game keeps a reply (the first, or the retry) */
  kept: boolean;
  keptTexts?: TextReading[];
  keptShort?: boolean;
};

const isShort = (texts: TextReading[]) => texts.some((t) => t.paragraphs < 2);

type Measure = { name: string; label: string; of: (r: ShortTurnReading) => boolean | undefined };

/** The readings per turn; undefined leaves a turn out of the measure's count. */
const MEASURES: Measure[] = [
  { name: "firstShort", label: "First replies with a one-paragraph text (the target)", of: (r) => r.firstShort },
  { name: "keptShort", label: "Replies kept with a one-paragraph text (after production's retry)", of: (r) => (r.kept ? r.keptShort : undefined) },
  { name: "retried", label: "Turns production's check asked again", of: (r) => r.retried !== undefined },
  { name: "firstBelowAsked", label: "First replies with a text of two or more paragraphs but fewer than its form asks", of: (r) => r.first.some((t) => t.paragraphs >= 2 && t.paragraphs < r.asked.min) },
  { name: "firstAboveAsked", label: "First replies with a text of more paragraphs than its form asks", of: (r) => r.first.some((t) => t.paragraphs > r.asked.max) },
  { name: "firstShortEveryPlayer", label: "Short group first replies short for every player (of short group replies)", of: (r) => (r.players > 1 && r.firstShort ? r.first.every((t) => t.paragraphs < 2) : undefined) },
];

export type MeasureReading = { name: string; label: string; arm: Tally; reference: Tally; noise: number; move: RateMove };

export type ShortArm = {
  /** The variant (pooled over both turn models) or the arm key (one turn model) */
  key: string;
  turns: number;
  tallies: Record<string, Tally>;
  /** First replies' texts by their paragraphs */
  distribution: Record<number, number>;
  /** Against production (the same turn model's, or pooled), on the (case, sample) pairs both have */
  measures: MeasureReading[];
};

const pairKey = (r: Pick<ShortTurnReading, "caseId" | "sample">) => `${r.caseId}|${r.sample}`;
const rate = (t: Tally) => (t.n ? t.hits / t.n : 0);

function tally(readings: ShortTurnReading[], measure: Measure): Tally {
  const values = readings.map(measure.of).filter((v): v is boolean => v !== undefined);
  return { hits: values.filter(Boolean).length, n: values.length };
}

/** The key a reading is grouped by, and its reference's. */
function grouping(by: "variant" | "armKey") {
  return {
    keyOf: (r: ShortTurnReading) => (by === "variant" ? r.variant : r.armKey),
    referenceOf: (key: string) => (by === "variant" ? REFERENCE : key.replace(/\/\w+$/, `/${REFERENCE}`)),
  };
}

/**
 * Each arm's tallies, and the variant against production on the pairs both
 * have, its noise production's sample 1 against its sample 2: pooled over both
 * turn models (by "variant"), or each turn model's own (by "armKey").
 * Production's arms first.
 */
export function shortArmReadings(readings: ShortTurnReading[], by: "variant" | "armKey"): ShortArm[] {
  const { keyOf, referenceOf } = grouping(by);
  const keys = [...new Set(readings.map(keyOf))].sort((a, b) => {
    const [ra, rb] = [referenceOf(a) === a, referenceOf(b) === b];
    return ra === rb ? a.localeCompare(b) : ra ? -1 : 1;
  });
  const own = (key: string) => readings.filter((r) => keyOf(r) === key);
  return keys.map((key) => {
    const mine = own(key);
    const reference = referenceOf(key);
    const refReadings = own(reference);
    const shared = new Set(mine.map(pairKey).filter((k) => refReadings.some((r) => pairKey(r) === k)));
    const onShared = (list: ShortTurnReading[]) => list.filter((r) => shared.has(pairKey(r)));
    const distribution: Record<number, number> = {};
    for (const t of mine.flatMap((r) => r.first)) distribution[t.paragraphs] = (distribution[t.paragraphs] ?? 0) + 1;
    return {
      key,
      turns: mine.length,
      tallies: Object.fromEntries(MEASURES.map((m) => [m.name, tally(mine, m)])),
      distribution,
      measures:
        key === reference
          ? []
          : MEASURES.map((m) => {
              const noise = Math.abs(rate(tally(refReadings.filter((r) => r.sample === 1), m)) - rate(tally(refReadings.filter((r) => r.sample === 2), m)));
              const [ref, arm] = [tally(onShared(refReadings), m), tally(onShared(mine), m)];
              return { name: m.name, label: m.label, arm, reference: ref, noise, move: rateMove(ref, arm, noise) };
            }),
    };
  });
}

/** A short text for the hand read: where, which reply, whose, its words and opening. */
export type ShortText = { armKey: string; caseId: string; sample: number; reply: "first" | "retry"; slot: string; words: number; opening: string };

export type ShortRepliesReport = {
  generatedAt: Date;
  tallies: LineTally[];
  /** Production and the variant pooled over both turn models */
  pooled: ShortArm[];
  /** Each turn model's arms */
  byModel: ShortArm[];
  turns: ShortTurnReading[];
  shortTexts: ShortText[];
  firstComparisons: VariantComparison[];
  keptComparisons: VariantComparison[];
  waits: { kept: TurnWait[]; keptBySample: SampleWait[]; first: TurnWait[] };
  spendUsd: number;
  problems: string[];
};

const pct = (x: number) => `${Math.round(100 * x)}%`;
const usd = (x: number) => `$${x.toFixed(4)}`;
const ofN = (t: Tally) => `${t.hits} of ${t.n}`;
const moveText = (move: RateMove) =>
  move.moved ? `moved ${move.moved}${move.p !== undefined ? ` (p ${move.p.toFixed(3)})` : ""}` : move.beyondNoise ? `beyond the noise, not moved${move.p !== undefined ? ` (p ${move.p.toFixed(3)})` : ""}` : "within the noise";

/** The readings of each candidate against its reference: the arms' tallies, then the candidate against the reference on their shared pairs. */
function readingRows(arms: ShortArm[]): string[] {
  const candidates = arms.filter((a) => a.measures.length > 0);
  return candidates.flatMap((candidate) => {
    const reference = arms.find((a) => a.measures.length === 0 && (a.key === REFERENCE || candidate.key.replace(/\/\w+$/, `/${REFERENCE}`) === a.key));
    const shown = reference ? [reference, candidate] : [candidate];
    return [
      `### ${candidate.key}${reference ? ` against ${reference.key}` : ""}`,
      "",
      `| Reading | ${shown.map((a) => a.key).join(" | ")} | On the pairs both have | Noise | Reading |`,
      `|---|${shown.map(() => "---|").join("")}---|---|---|`,
      ...MEASURES.map((m) => {
        const vs = candidate.measures.find((x) => x.name === m.name);
        return `| ${m.label} | ${shown.map((a) => `${ofN(a.tallies[m.name])} (${pct(rate(a.tallies[m.name]))})`).join(" | ")} | ${vs ? `${ofN(vs.arm)} against ${ofN(vs.reference)}` : "–"} | ${vs ? pct(vs.noise) : "–"} | ${vs ? moveText(vs.move) : "–"} |`;
      }),
      `| First replies' texts by paragraphs | ${shown.map((a) => Object.entries(a.distribution).map(([p, n]) => `${p}: ${n}`).join(", ")).join(" | ")} | – | – | – |`,
      "",
    ];
  });
}

const cellOf = (t: ShortTurnReading | undefined) => {
  if (!t) return "–";
  const first = t.first.map((x) => x.paragraphs).join(",");
  if (!t.retried) return first;
  if (!t.kept || !t.keptTexts) return `${first} → fails (retried)`;
  return `${first} → ${t.keptTexts.map((x) => x.paragraphs).join(",")} (retried)`;
};

/** short-replies.md */
export function renderShortReplies(report: ShortRepliesReport): string {
  const variants = [...new Set(report.turns.map((t) => t.variant))].sort((a, b) => (a === REFERENCE ? -1 : b === REFERENCE ? 1 : a.localeCompare(b)));
  const cases = [...new Set(report.turns.map((t) => t.caseId))].sort();
  const lines = [
    "# Turns that come back as one short paragraph (short-replies)",
    "",
    `Generated ${report.generatedAt.toISOString()}. Production's turn (adopted) and the variant (shortReplies) under ${SHORT_REPLIES_PROMPT_STATE}, interleaved, a single player's turns on Luna medium and a group's on Luna low; each turn with production's one retry where its first reply is one short paragraph or has no options. Each player's text is read by its paragraphs as the client splits them (production's check: a text of one paragraph is short) and its words, in the first reply and in the reply the game keeps, beside the count the turn's form asks for (5-6, or a kids band's). Readings, not verdicts.`,
    "",
    "Each candidate against production on the (case, sample) pairs both have, under the stop rule: beyond production's two-sample difference, and a one-sided Fisher p < 0.10.",
    "",
    "## Pooled over both turn models",
    "",
    ...readingRows(report.pooled),
    "## Per turn model",
    "",
    ...readingRows(report.byModel),
    "## Per turn (each player's paragraphs in the first reply; → the reply kept after production's retry)",
    "",
    `| Case | Sample | ${variants.join(" | ")} |`,
    `|---|---|${variants.map(() => "---|").join("")}`,
    ...cases.flatMap((c) => [1, 2].map((s) => `| ${c} | ${s} | ${variants.map((v) => cellOf(report.turns.find((t) => t.caseId === c && t.sample === s && t.variant === v))).join(" | ")} |`)),
    "",
    "## Every one-paragraph text (for the hand read)",
    "",
    "| Arm | Case | Sample | Reply | Player | Words | Opening |",
    "|---|---|---|---|---|---|---|",
    ...report.shortTexts.map((t) => `| ${t.armKey} | ${t.caseId} | ${t.sample} | ${t.reply} | ${t.slot} | ${t.words} | ${t.opening.replace(/\|/g, "/")} |`),
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
    "## The automatic checks on the first replies (each turn's first reply, its own wait and cost)",
    "",
    ...renderVariantComparison(report.firstComparisons),
    "",
    "## The automatic checks on the turns kept (each turn as one call: the reply kept, the whole wait and cost)",
    "",
    ...renderVariantComparison(report.keptComparisons),
    "",
    "## Spend",
    "",
    `Turns (both arms, every attempt, the retries included): ${usd(report.spendUsd)}. No judge calls.`,
    ...(report.problems.length ? ["", "## Problems", "", ...report.problems.map((p) => `- ${p}`)] : []),
  ];
  return `${lines.join("\n")}\n`;
}

// --- --build-short-reply-cases ---

const runsOf = (ctx: Pick<PrepContext, "files">): PlayRun[] => playthroughRunsFrom(ctx.files.readPlaythroughs(PLAYTHROUGHS_2));

/** The prompt hash each stored playthrough call sent, by its output file. */
const promptHashesOf = (ctx: Pick<PrepContext, "files">) => {
  const byId = new Map(ctx.files.readPrepRecords().flatMap((r) => (r.outputFile && r.promptHash ? [[outputIdOf(r.outputFile), r.promptHash] as [string, string]] : [])));
  return (outputFile: string) => byId.get(outputIdOf(outputFile));
};

export function buildShortReplyCasesMode(ctx: Pick<PrepContext, "files" | "log">, replace: boolean): void {
  const { files, log } = ctx;
  if (!files.casesExist()) throw new Error("No frozen cases. Run --build-cases first.");
  const runs = runsOf(ctx);
  if (runs.length === 0) throw new Error("No stored second-round playthroughs (playthroughs-2.json). Run --playthroughs --round 2 first.");
  const { cases, problems, skipped } = shortRepliesCasesToFreeze(files.readCases(), runs, promptHashesOf(ctx), replace);
  if (problems.length) throw new Error(problems.join("; "));
  if (skipped.length) log(`Already frozen, left as they are: ${skipped.join(", ")}.`);
  if (cases.length === 0) return log("Nothing new to freeze; no calls.");
  files.addCases(cases, undefined, replace);
  log(`Froze ${cases.map((c) => c.id).join(", ")} beside the other cases; no calls.`);
}

// --- --short-replies ---

const OPENING_CHARS = 160;

/** Every checked turn read whole: each player's text in the first reply and in the reply kept. */
export function shortTurnReadings(turns: CheckedTurn[], load: (record: CallRecord) => unknown, storyOf: (caseId: string) => Story | undefined): ShortTurnReading[] {
  return turns.flatMap((t): ShortTurnReading[] => {
    const story = storyOf(t.caseId);
    const firstReply = load(t.first) as SetOfBeatGenerationSchema | undefined;
    if (!story || !firstReply) return [];
    const keptRecord = t.kept === 2 ? t.retry : t.kept === 1 ? t.first : undefined;
    const keptReply = keptRecord ? (load(keptRecord) as SetOfBeatGenerationSchema | undefined) : undefined;
    const first = textReadings(firstReply);
    const keptTexts = keptReply ? textReadings(keptReply) : undefined;
    return [
      {
        armKey: t.armKey,
        variant: t.armKey.split("/")[1] ?? t.armKey,
        caseId: t.caseId,
        sample: t.sample,
        players: t.players,
        asked: askedParagraphs(story),
        first,
        firstShort: isShort(first),
        ...(t.retried ? { retried: t.retried } : {}),
        kept: keptTexts !== undefined,
        ...(keptTexts ? { keptTexts, keptShort: isShort(keptTexts) } : {}),
      },
    ];
  });
}

/** Every one-paragraph text of the first replies and the retries, with its opening. */
function shortTextsOf(turns: CheckedTurn[], load: (record: CallRecord) => unknown): ShortText[] {
  const of = (t: CheckedTurn, record: CallRecord | undefined, reply: "first" | "retry"): ShortText[] => {
    const parsed = record ? (load(record) as SetOfBeatGenerationSchema | undefined) : undefined;
    if (!parsed) return [];
    return Object.entries(parsed)
      .filter(([key]) => isPlayerBeat(key))
      .flatMap(([key, beat]): ShortText[] => {
        const text = String((beat as { text?: unknown } | undefined)?.text ?? "");
        if (paragraphsOf(text).length >= 2) return [];
        return [{ armKey: t.armKey, caseId: t.caseId, sample: t.sample, reply, slot: key.toLowerCase(), words: text.split(/\s+/).filter(Boolean).length, opening: text.slice(0, OPENING_CHARS).replace(/\s+/g, " ") }];
      });
  };
  return turns.flatMap((t) => [...of(t, t.first, "first"), ...of(t, t.retry, "retry")]).sort((a, b) => a.armKey.localeCompare(b.armKey) || a.caseId.localeCompare(b.caseId) || a.sample - b.sample);
}

export async function shortRepliesMode(ctx: Pick<PrepContext, "files" | "log">): Promise<void> {
  const { files, log } = ctx;
  const armKeys = new Set(SHORT_REPLIES_ARMS);
  const records = files.readRecords().filter((r) => r.stage === STAGE && r.promptState === SHORT_REPLIES_PROMPT_STATE && armKeys.has(r.armKey) && r.group === "beat");
  const cases = files.readCases();
  const byId = new Map(cases.map((c) => [c.id, c]));
  const storyOf = (id: string) => {
    const evalCase: EvalCase | undefined = byId.get(id);
    return evalCase?.state ? caseStory(evalCase) : undefined;
  };
  const turns = await checkedTurns(records, files.loadOutput, (id) => storyOf(id)?.getCurrentBeatType() === "ending");
  const readings = shortTurnReadings(turns, files.loadOutput, storyOf);
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
  const report: ShortRepliesReport = {
    generatedAt: new Date(),
    tallies: lineTallies(turns, checks),
    pooled: shortArmReadings(readings, "variant"),
    byModel: shortArmReadings(readings, "armKey"),
    turns: readings,
    shortTexts: shortTextsOf(turns, files.loadOutput),
    firstComparisons: variantComparisons(firstCalls, checks, tags, SHORT_REPLIES_PROMPT_STATE),
    keptComparisons: variantComparisons(keptCalls, checks, tags, SHORT_REPLIES_PROMPT_STATE),
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
      firstWaitMs: t.firstWaitMs,
      waitMs: t.waitMs,
      costUsd: t.costUsd,
      firstOutput: t.first.outputFile,
      retryOutput: t.retry?.outputFile,
      reading: readings.find((r) => r.caseId === t.caseId && r.sample === t.sample && r.armKey === t.armKey),
    })),
    pooled: report.pooled,
    byModel: report.byModel,
    shortTexts: report.shortTexts,
    tallies: report.tallies,
    waits: report.waits,
    spendUsd: report.spendUsd,
  };
  files.writeShortReplies(renderShortReplies(report), json);
  for (const arm of [...report.pooled, ...report.byModel]) {
    const t = (name: string) => ofN(arm.tallies[name]);
    log(`${arm.key}: ${arm.turns} turns; first short ${t("firstShort")}, kept short ${t("keptShort")}, retried ${t("retried")}, below the count ${t("firstBelowAsked")}, above it ${t("firstAboveAsked")}`);
    for (const m of arm.measures) log(`  ${m.label}: ${ofN(m.arm)} against ${ofN(m.reference)}, ${moveText(m.move)}`);
  }
  log(`Wrote short-replies.md and .json (turns $${report.spendUsd.toFixed(4)}; no calls).`);
}
