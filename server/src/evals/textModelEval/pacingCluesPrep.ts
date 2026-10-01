import type { Story } from "core/models/Story.js";
import type { PlayerSlot, SetOfBeatGenerationSchema } from "core/types/index.js";
import { isLatePart } from "../../game/services/storyTextRounds/latePacing.js";
import { PACING_CLUES_PROMPT_STATE, type Stage } from "./arms.js";
import { DEFAULT_STAGE_CAPS, spentByStage } from "./budget.js";
import {
  CLUES_CALIBRATION,
  CLUES_JUDGE_PROMPT_VERSION,
  NEW_MYSTERY_CHECK,
  cluesEvidenceFrom,
  cluesJudgeCaseId,
  cluesJudgeJobs,
  cluesJudgeRequests,
  cluesVerdictFrom,
  earlierInterludes,
  scoreCluesCalibration,
  storyFactLines,
  type CluesAgreement,
  type CluesCalibrationItem,
} from "./cluesJudge.js";
import type { EvalFiles } from "./evalFiles.js";
import { sha256 } from "./executor.js";
import { jobEstimateUsd } from "./jobPlan.js";
import { JUDGE_ARMS, outputIdOf } from "./judgedChecks.js";
import { PACING_CLUES_STARTS } from "./latePacingCases.js";
import { latePacingComparisons, playOn, readLatePacing, renderLatePacing, type LatePacingReading, type PlayReportText } from "./latePacingPlay.js";
import { cluesCalibrationTargets, latePacingEstimate, mergeLatePacingRuns, mergedTargets, playRunKey, type CluesCalibrationTarget, type CluesReplyTarget } from "./latePacingPrep.js";
import { factLines, paragraphsOf } from "./outcomeSettledJudge.js";
import { PACING_CLUES_HAND, type PacingCluesHandEntry } from "./pacingCluesHand.js";
import { measuredCallCosts, playthroughRunsFrom, type ModeCall } from "./playthroughMode.js";
import { replayRun } from "./playthroughReplay.js";
import { playthroughArm, type PlayRun } from "./playthroughs.js";
import { finishedPrepRecord, prepArmKey } from "./prepCalls.js";
import { finishedJobKeys, jobKey, keyOf, runJobs, type CallRecord } from "./runner.js";
import { budgetedPrepCall } from "./setupChainMode.js";
import { rateMove, type RateMove, type Tally } from "./stopRule.js";
import { spendBeside, type PrepContext } from "./turnPrep.js";
import type { VariantId } from "./variants.js";

/*
 * The pacing-clues stage (2026-10-01): fix 8's retest in whole short
 * playthroughs, the coordinator's call after the owner's decisions of that
 * day. The late-pacing stage measured its planners and its clue lines apart
 * (its pacing in short playthroughs, its fix-and-retest's switch planner on
 * switch plans only, its clue line by an unblind hand reading, the judge not
 * reliable); this stage plays them together as they would be adopted
 * (pacingClues: latePacingB's planners and the late part's clue lines,
 * storyTextRounds/latePacing.ts) beside production's code, and reads the
 * clues blind. Its CLI modes, kept out of run.ts:
 * - --pacing-clues-play [--samples N] [--turns N] [--cases <story ids>]
 *   [--report-only]: production (adopted) and the variant from each start
 *   (PACING_CLUES_STARTS: the late-pacing stage's three and the space pirates'
 *   threshold switch) to the story's last chapter plan, the same seeded dice for
 *   both, each call a prep job in the stage under adopted21 (a finished call
 *   on the same request is reused, so a smoke's turns are the full run's
 *   first); then pacing-clues.md and .json;
 * - --pacing-clues-blind: the blind hand reading's file, pacing-clues-blind.md:
 *   the turns in the story's late part both arms played of each story and
 *   sample (the window: up to the last turn both wrote, so every run of a
 *   story and sample shows as many turns), each run under a code from a salt
 *   (keys/pacing-clues-blind.json holds it and the code's run), no arm named;
 *   the verdicts go into pacingCluesHand.ts by code, read before the key;
 * - --judge-pacing-clues: the clue judge's one fix (v2) calibrated on its
 *   late-turn items (two samples) and, once that reads reliable, run on the
 *   window's turns (one sample), booked to the stage; then the report again.
 * No call is made outside those modes' budgeted calls.
 */

const STAGE: Stage = "pacing-clues";
const PLAY_FILE = "pacing-clues";
const BLIND_FILE = "pacing-clues-blind";
const CALIBRATION_SAMPLES = 2;
const PLAYTHROUGHS_2 = "playthroughs-2";

/** The stage's arms: production's code and the variant, in the file's order. */
export const PACING_CLUES_VARIANTS: VariantId[] = ["adopted", "pacingClues"];
const CANDIDATE: VariantId = "pacingClues";

/** The clue judge's calibration in this stage: the late-turn items (the short playthroughs play no ending). */
export const PACING_CLUES_CALIBRATION: CluesCalibrationItem[] = CLUES_CALIBRATION.filter((i) => i.check === NEW_MYSTERY_CHECK);

const REPORT: PlayReportText = {
  title: "Fix 8's retest in whole short playthroughs (pacing-clues)",
  intro:
    "Each run: a stored story of the second round replayed to a chapter plan (the space pirates to their switch at turn 14), then played on with production's code (adopted) or the variant (pacingClues: the late-pacing stage's fix-and-retest planners and the late part's clue lines) to the story's last chapter plan, on the same seeded dice. Pacing readings are the game's arithmetic; the clue readings follow.",
  candidates: [{ variant: CANDIDATE, title: "The variant against production" }],
};

const runs2Of = (files: EvalFiles): PlayRun[] => playthroughRunsFrom(files.readPlaythroughs(PLAYTHROUGHS_2));
const playRunsOf = (files: EvalFiles): PlayRun[] => playthroughRunsFrom(files.readPlaythroughs(PLAY_FILE));
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** The short playthroughs' calls: prep jobs in the stage under its tag, never past `limitUsd` for this invocation. */
export function pacingCluesCall(ctx: PrepContext, sample: number, limitUsd: number): ModeCall {
  return budgetedPrepCall(ctx, {
    stage: STAGE,
    promptState: PACING_CLUES_PROMPT_STATE,
    sample,
    limitUsd,
    rerunHint: "the dice are seeded, so the code or a reply changed; play a new sample with --samples <n>",
  });
}

/** The file's runs with new ones: a run played again replaces its key, in the starts' order, then sample, then production before the variant. */
export const mergePacingCluesRuns = (existing: PlayRun[], added: PlayRun[]): PlayRun[] => mergeLatePacingRuns(existing, added, PACING_CLUES_STARTS, PACING_CLUES_VARIANTS);

// ---------------------------------------------------------------- the late turns both arms played

/** A player's turn in the story's late part within its story and sample's window; `k` its turn's place among the run's window turns. */
export type ClueItem = {
  story: string;
  from: number;
  variant: VariantId;
  sample: number;
  turn: number;
  k: number;
  slot: PlayerSlot;
  /** The judge call's key, as the late-pacing stage keyed its play targets */
  judgeKey: string;
  outputId: string;
  run: PlayRun;
  before: Story;
  reply: SetOfBeatGenerationSchema;
};

const windowKey = (run: PlayRun) => `${run.spec.id}|${run.from?.turn ?? 1}|${run.sample}`;
const variantOf = (run: PlayRun): VariantId => run.from?.variant ?? "adopted";
const lastReplyTurn = (run: PlayRun) => Math.max(0, ...run.turns.filter((t) => t.reply).map((t) => t.turn));

/** The last turn every run of a story's start and sample wrote: the window both arms played. */
export function clueWindowEnds(runs: PlayRun[]): Map<string, number> {
  const ends = new Map<string, number>();
  for (const run of runs) {
    const key = windowKey(run);
    ends.set(key, Math.min(ends.get(key) ?? Number.POSITIVE_INFINITY, lastReplyTurn(run)));
  }
  return ends;
}

/** Every player's turn in the story's late part (not the ending) within its window, as the game kept it, once per player with text. */
export function clueItems(runs: PlayRun[]): ClueItem[] {
  const ends = clueWindowEnds(runs);
  return runs.flatMap((run) => {
    const end = ends.get(windowKey(run)) ?? 0;
    const variant = variantOf(run);
    let k = 0;
    return replayRun(run).flatMap((r) => {
      const reply = r.played.reply as SetOfBeatGenerationSchema | undefined;
      if (!reply || r.turn > end || r.before.isFirstBeat() || r.before.getCurrentBeatType() === "ending" || !isLatePart(r.before)) return [];
      k++;
      const outputFile = r.played.calls.at(-1)?.outputFile;
      return r.before
        .getPlayerSlots()
        .filter((slot) => paragraphsOf(reply, slot).length > 0)
        .map((slot) => ({
          story: run.spec.id,
          from: run.from?.turn ?? 1,
          variant,
          sample: run.sample,
          turn: r.turn,
          k,
          slot: slot as PlayerSlot,
          judgeKey: `${run.spec.id}-from${run.from?.turn ?? 1}-${variant}-s${run.sample}-t${r.turn}-${slot}`,
          outputId: outputFile ? outputIdOf(outputFile) : "",
          run,
          before: r.before,
          reply,
        }));
    });
  });
}

/** The clue judge's v2 request on each item, one sample, under the arm's key. */
export function clueJudgeTargets(items: ClueItem[]): CluesReplyTarget[] {
  return items.flatMap((item) => {
    const request = cluesJudgeRequests(item.before, item.reply, CLUES_JUDGE_PROMPT_VERSION).find((q) => q.slot === item.slot);
    if (!request) return [];
    return [
      {
        key: item.judgeKey,
        check: request.check,
        request: request.request,
        samples: 1,
        armKey: playthroughArm("beat", item.run.input.playerCount, item.variant).key,
        caseId: `${item.story}-from${item.from}-t${item.turn}`,
        sample: item.sample,
        turn: item.turn,
        slot: item.slot,
        outputId: item.outputId,
      },
    ];
  });
}

/** The stage's turns go to the judge only once its calibration reads reliable for the check. */
export function stageJudgeTargets(targets: CluesReplyTarget[], agreement: CluesAgreement[]): CluesReplyTarget[] {
  return agreement.find((a) => a.check === NEW_MYSTERY_CHECK)?.reliable ? targets : [];
}

// ---------------------------------------------------------------- the blind reading

/** The key of the blind reading: its salt, and each run code's story, start, arm and sample. */
export type BlindKey = { salt: string; runs: Record<string, { story: string; from: number; variant: VariantId; sample: number }> };

/** A run's code: five hex digits of the salted hash of its key, so no code says its arm. */
export const blindRunCode = (salt: string, run: PlayRun) => sha256(`${salt}|${playRunKey(run)}`).slice(0, 5).toUpperCase();

/** An item's code: its run's code, its turn's place in the window, its player. */
export const blindItemCode = (salt: string, item: ClueItem) => `${blindRunCode(salt, item.run)}.${item.k}.${item.slot}`;

export function blindKeyFor(runs: PlayRun[], salt: string): BlindKey {
  const entries = runs.map((run) => [blindRunCode(salt, run), { story: run.spec.id, from: run.from?.turn ?? 1, variant: variantOf(run), sample: run.sample }] as const);
  if (new Set(entries.map(([code]) => code)).size !== entries.length) throw new Error("Two runs share a blind code: write the key again with another salt");
  return { salt, runs: Object.fromEntries(entries) };
}

const indent = (lines: string[]) => (lines.length ? lines : ["none"]).map((line) => (line.startsWith("- ") ? line : `- ${line}`));

/** Each player's interludes in a reply. */
function interludesOf(reply: SetOfBeatGenerationSchema, slot: string): string[] {
  const beat = (reply as unknown as Record<string, { interludes?: { text?: string }[] }>)[slot];
  return (beat?.interludes ?? []).map((i) => (i.text ?? "").trim()).filter(Boolean);
}

/**
 * pacing-clues-blind.md: per story, what the story held at the start (its
 * facts, each story element's own description, each player's interludes so
 * far: the same for every run of the start); then each run under its code,
 * the codes in order: the facts and interludes of its turns before the late
 * part, then each window turn, each player's text, interludes and the facts
 * the turn records. No arm, sample, turn number or chapter is named.
 */
export function renderBlindReading(runs: PlayRun[], salt: string): string {
  const items = clueItems(runs);
  const lines = [
    "# Blind reading: new unexplained details in the story's late part",
    "",
    "For each item (a player's turn), read against what the story held before it (the start, then the run's earlier turns): does it plant a new unexplained detail the story did not have (in its text, its interludes or the facts the turn records) and not explain it? Record yes (no new mystery), no (a new one; quote it) or partial, by code, before the key is opened.",
    "",
  ];
  const stories = [...new Map(runs.map((r) => [`${r.spec.id}|${r.from?.turn ?? 1}`, r])).values()];
  for (const first of stories) {
    const mine = runs.filter((r) => r.spec.id === first.spec.id && (r.from?.turn ?? 1) === (first.from?.turn ?? 1));
    const start = replayRun(first)[0]?.beforePlan;
    if (!start) continue;
    lines.push(`## ${start.getTitle()} (${first.spec.id})`, "", "### What the story held at the start", "", "Facts:", "", ...indent(storyFactLines(start)), "");
    for (const slot of start.getPlayerSlots()) lines.push(`${slot} (${start.getPlayer(slot)?.name ?? slot}), interludes so far:`, "", ...indent(earlierInterludes(start, slot as PlayerSlot)), "");
    const coded = mine.map((run) => ({ run, code: blindRunCode(salt, run) })).sort((a, b) => a.code.localeCompare(b.code));
    for (const { run, code } of coded) {
      lines.push(`### Run ${code}`, "");
      const window = items.filter((i) => i.run === run);
      const firstTurn = Math.min(...window.map((i) => i.turn));
      const context = replayRun(run).filter((r) => r.played.reply && r.turn < firstTurn);
      if (context.length) {
        lines.push("Before the late part (each turn's recorded facts and interludes):", "");
        context.forEach((r, i) => {
          const reply = r.played.reply as SetOfBeatGenerationSchema;
          const interludes = r.before.getPlayerSlots().flatMap((slot) => interludesOf(reply, slot).map((text) => `(${slot}) ${text}`));
          lines.push(`- Earlier turn ${i + 1}: facts: ${factLines(r.before, reply).map((f) => f.replace(/^- /, "")).join(" ") || "none"} Interludes: ${interludes.join(" ") || "none"}`);
        });
        lines.push("");
      }
      for (const k of [...new Set(window.map((i) => i.k))]) {
        const turnItems = window.filter((i) => i.k === k);
        lines.push(`#### ${code}.${k}`, "");
        for (const item of turnItems) {
          lines.push(`**${blindItemCode(salt, item)}** (${item.before.getPlayer(item.slot)?.name ?? item.slot})`, "");
          paragraphsOf(item.reply, item.slot).forEach((p, i) => lines.push(`[${i + 1}] ${p}`, ""));
          lines.push("Interludes:", "", ...indent(interludesOf(item.reply, item.slot)), "");
        }
        lines.push("Facts the turn records:", "", ...indent(factLines(turnItems[0].before, turnItems[0].reply)), "");
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------- the clue readings

/** A player's turn's reading: pass (no new mystery) where read yes or no; undefined where partial or unread. */
export type ClueRow = { story: string; variant: VariantId; sample: number; turn: number; slot: string; pass?: boolean; code?: string; note?: string; evidence?: string };

/** The hand verdicts by code, unblinded through the key onto the items. */
export function handRows(items: ClueItem[], key: BlindKey, hand: Record<string, PacingCluesHandEntry> = PACING_CLUES_HAND): ClueRow[] {
  return items.map((item) => {
    const code = blindItemCode(key.salt, item);
    const entry = hand[code];
    const pass = entry && entry.hand !== "partial" ? entry.hand : undefined;
    return { story: item.story, variant: item.variant, sample: item.sample, turn: item.turn, slot: item.slot, code, ...(pass !== undefined ? { pass } : {}), ...(entry ? { note: entry.note } : {}) };
  });
}

export type ClueComparison = { production: Tally; variant: Tally; noise?: number; move: RateMove; unread: { production: number; variant: number } };

const tally = (rows: ClueRow[]): Tally => ({ hits: rows.filter((r) => r.pass === true).length, n: rows.filter((r) => r.pass !== undefined).length });

/** Player turns with no new mystery, the candidate against production; production's sample 1 against its sample 2 the noise. */
export function clueComparison(rows: ClueRow[], candidate: VariantId = CANDIDATE): ClueComparison {
  const [production, variant] = [rows.filter((r) => r.variant === "adopted"), rows.filter((r) => r.variant === candidate)];
  const rate = (sample: number) => {
    const t = tally(production.filter((r) => r.sample === sample));
    return t.n ? t.hits / t.n : undefined;
  };
  const [a, b] = [rate(1), rate(2)];
  const noise = a === undefined || b === undefined ? undefined : Math.abs(a - b);
  return {
    production: tally(production),
    variant: tally(variant),
    ...(noise !== undefined ? { noise } : {}),
    move: rateMove(tally(production), tally(variant), noise ?? 0),
    unread: { production: production.filter((r) => r.pass === undefined).length, variant: variant.filter((r) => r.pass === undefined).length },
  };
}

// ---------------------------------------------------------------- the report

const pct = (t: Tally) => (t.n === 0 ? "–" : `${t.hits} of ${t.n} (${Math.round((100 * t.hits) / t.n)}%)`);
const moveText = (m: RateMove) => (m.moved ? `moved ${m.moved} (p ${m.p?.toFixed(3)})` : m.beyondNoise ? `beyond the noise, not moved (p ${m.p?.toFixed(3)})` : "within the noise");

function clueSection(title: string, rows: ClueRow[], stories: string[]): string[] {
  if (!rows.some((r) => r.pass !== undefined)) return [`## ${title}`, "", "Not read yet.", ""];
  const all = clueComparison(rows);
  const lines = [
    `## ${title}`,
    "",
    "Player turns with no new unexplained detail, the turns in the story's late part both arms played (each story and sample up to the last turn both wrote).",
    "",
    "| Stories | Production | Variant | Noise | Reading | Unread or partial (production / variant) |",
    "|---|---|---|---|---|---|",
    `| all | ${pct(all.production)} | ${pct(all.variant)} | ${all.noise === undefined ? "–" : `${Math.round(100 * all.noise)} pts`} | ${moveText(all.move)} | ${all.unread.production} / ${all.unread.variant} |`,
  ];
  for (const story of stories) {
    const c = clueComparison(rows.filter((r) => r.story === story));
    lines.push(`| ${story} | ${pct(c.production)} | ${pct(c.variant)} | ${c.noise === undefined ? "–" : `${Math.round(100 * c.noise)} pts`} | ${moveText(c.move)} | ${c.unread.production} / ${c.unread.variant} |`);
  }
  const fails = rows.filter((r) => r.pass === false);
  lines.push("", "Each new detail read:", "", ...(fails.length ? fails.map((r) => `- ${r.story}, ${r.variant}, sample ${r.sample}, turn ${r.turn}, ${r.slot}${r.code ? ` (${r.code})` : ""}: ${(r.note ?? r.evidence ?? "").replace(/\s+/g, " ").trim()}`) : ["none"]), "");
  return lines;
}

/** The blind key, written once with a fresh salt; the same salt ever after, so the codes stay put. */
function blindKeyOf(files: EvalFiles, runs: PlayRun[]): BlindKey {
  const held = files.readBlindKey(BLIND_FILE) as BlindKey | undefined;
  const salt = held?.salt ?? sha256(`${Date.now()}|${Math.random()}`).slice(0, 16);
  const key = blindKeyFor(runs, salt);
  files.writeBlindKey(BLIND_FILE, key);
  return key;
}

/** The judge's verdict on each window item (v2, sample 1), where judged. */
function judgedRows(files: EvalFiles, items: ClueItem[]): ClueRow[] {
  const prep = files.readPrepRecords();
  const arm = JUDGE_ARMS[0];
  const byKey = new Map(clueJudgeTargets(items).map((t) => [t.key, t]));
  return items.map((item) => {
    const target = byKey.get(item.judgeKey);
    const record = target ? finishedPrepRecord(prep, jobKey(cluesJudgeCaseId(target.key, target.check), prepArmKey("judge", arm), PACING_CLUES_PROMPT_STATE, 1)) : undefined;
    const parsed = record ? files.loadOutput(record) : undefined;
    const pass = cluesVerdictFrom(parsed, NEW_MYSTERY_CHECK);
    const said = cluesEvidenceFrom(parsed, NEW_MYSTERY_CHECK);
    const evidence = [said.evidence, ...said.lines.filter((l) => l.startsWith("new"))].filter(Boolean).join(" ");
    return { story: item.story, variant: item.variant, sample: item.sample, turn: item.turn, slot: item.slot, ...(pass !== undefined ? { pass } : {}), ...(evidence ? { evidence } : {}) };
  });
}

/** The calibration's agreement at v2, from the stage's judge calls so far. */
function calibrationAgreement(files: EvalFiles): { agreement: CluesAgreement[]; judged: { itemId: string; samples: (boolean | undefined)[]; evidence: ReturnType<typeof cluesEvidenceFrom>[] }[]; problems: string[] } {
  const prep = files.readPrepRecords();
  const arm = JUDGE_ARMS[0];
  const { targets, problems } = cluesCalibrationTargets(runs2Of(files), PACING_CLUES_CALIBRATION, CLUES_JUDGE_PROMPT_VERSION);
  const judged = targets.map((t) => {
    const parsed = [1, 2].map((sample) => {
      const record = finishedPrepRecord(prep, jobKey(cluesJudgeCaseId(t.key, t.check), prepArmKey("judge", arm), PACING_CLUES_PROMPT_STATE, sample));
      return record ? files.loadOutput(record) : undefined;
    });
    return { itemId: t.itemId, samples: parsed.map((p) => cluesVerdictFrom(p, t.check)), evidence: parsed.map((p) => cluesEvidenceFrom(p, t.check)) };
  });
  return { agreement: scoreCluesCalibration(PACING_CLUES_CALIBRATION, judged).filter((a) => a.check === NEW_MYSTERY_CHECK), judged, problems };
}

/** pacing-clues.md and .json from the file's runs, the judge calls and the hand reading so far; no calls. */
export function writePacingClues(ctx: Pick<PrepContext, "files" | "log">, runs: PlayRun[]): LatePacingReading[] {
  const { files } = ctx;
  const readings = runs.map(readLatePacing);
  const items = clueItems(runs);
  const stories = [...new Set(items.map((i) => i.story))];
  const key = files.readBlindKey(BLIND_FILE) as BlindKey | undefined;
  const hand = key ? handRows(items, key) : [];
  const judged = judgedRows(files, items);
  const calibration = calibrationAgreement(files);
  const now = new Date();
  const lines = [
    renderLatePacing(readings, now, REPORT).trimEnd(),
    "",
    ...clueSection("New unexplained details in the late turns, read blind by hand", hand, stories),
    "## The clue judge (v2)",
    "",
    "| Check | Agree (sample 1) | Hand yes / no | Judged no where the hand says yes | Judged yes where the hand says no | Samples agree | On partial items (yes / no) | Reading |",
    "|---|---|---|---|---|---|---|---|",
    ...calibration.agreement.map((a) => `| ${a.check} | ${a.agree} of ${a.decided} | ${a.handPasses} / ${a.handFails} | ${a.falseFails} | ${a.falsePasses} | ${a.pairs ? `${a.pairsAgree} of ${a.pairs}` : "–"} | ${a.partial.yes} / ${a.partial.no} | ${a.reliable ? "reliable" : "not reliable"} |`),
    "",
    ...calibration.judged.flatMap((j) => {
      const item = PACING_CLUES_CALIBRATION.find((i) => i.id === j.itemId);
      const first = j.samples[0];
      if (!item || item.hand === "partial" || first === undefined || first === item.hand) return [];
      return [`- ${item.id}: hand ${item.hand ? "yes" : "no"}, judged ${first ? "yes" : "no"}. ${j.evidence[0]?.lines.join("; ") ?? ""}`];
    }),
    "",
    ...clueSection("New unexplained details in the late turns, the judge (v2)", judged, stories),
  ];
  const spentUsd = sum(files.readPrepRecords().filter((r) => r.stage === STAGE).map((r) => r.costUsd));
  lines.push(`Spent in the stage so far: $${spentUsd.toFixed(4)}.`);
  const json = {
    generatedAt: now.toISOString(),
    stage: STAGE,
    promptState: PACING_CLUES_PROMPT_STATE,
    runs,
    readings,
    clues: { hand, judged, calibration: { agreement: calibration.agreement, judged: calibration.judged, problems: calibration.problems } },
    spentUsd,
  };
  files.writePlaythroughs(`${lines.join("\n")}\n`, json, PLAY_FILE);
  return readings;
}

// ---------------------------------------------------------------- the modes

export async function pacingCluesPlayMode(ctx: PrepContext, options: { sample: number; caseIds?: string[]; turns?: number; reportOnly?: boolean }): Promise<void> {
  const { files, log } = ctx;
  const stored = runs2Of(files);
  const starts = PACING_CLUES_STARTS.filter((s) => !options.caseIds?.length || options.caseIds.includes(s.story));
  if (starts.length === 0) throw new Error(`No short playthrough among --cases; one of ${PACING_CLUES_STARTS.map((s) => s.story).join(", ")}`);
  const played: PlayRun[] = [];
  if (!options.reportOnly) {
    const spend = spentByStage([...files.readRecords(), ...spendBeside(files, "calls")]);
    const stageLeft = ctx.caps.stageCaps[STAGE] - spend.byStage[STAGE];
    const limit = Math.min(ctx.caps.maxSpend ?? Number.POSITIVE_INFINITY, stageLeft, ctx.caps.globalCap - spend.total);
    log(
      `Playing on: ${starts.map((s) => `${s.story} from turn ${s.turn}`).join(", ")}, ${PACING_CLUES_VARIANTS.join(" and ")} (sample ${options.sample}${options.turns ? `, the first ${options.turns} turns each` : ""}); this invocation spends at most $${limit.toFixed(4)} (stage ${STAGE} spent $${spend.byStage[STAGE].toFixed(4)} of $${ctx.caps.stageCaps[STAGE]}; the ledger $${spend.total.toFixed(2)} of $${ctx.caps.globalCap})`
    );
    const call = pacingCluesCall(ctx, options.sample, limit);
    const jobs = starts.flatMap((start) =>
      PACING_CLUES_VARIANTS.map(async (variant) => {
        const run = stored.find((r) => r.spec.id === start.story && r.sample === 1);
        if (!run) throw new Error(`No stored second-round playthrough ${start.story}`);
        return (await playOn(run, start.turn, variant, (s) => call({ kind: "play", ...s }), options.sample, options.turns)).run;
      })
    );
    const settled = await Promise.allSettled(jobs);
    settled.forEach((outcome) => {
      if (outcome.status === "fulfilled") played.push(outcome.value);
      else log(`A short playthrough stopped: ${outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)}`);
    });
  }
  const all = mergePacingCluesRuns(playRunsOf(files), played);
  const readings = writePacingClues(ctx, all);
  for (const run of played) log(`${run.spec.id} from ${run.from?.turn}, ${run.from?.variant}, s${run.sample}: ${run.turns.length} turns, stopped: ${run.stopped}`);
  if (readings.some((r) => r.variant === CANDIDATE)) {
    for (const rate of latePacingComparisons(readings, CANDIDATE).rates) log(`  ${rate.reading}: production ${rate.production.hits}/${rate.production.n}, ${CANDIDATE} ${rate.variant.hits}/${rate.variant.n}`);
  }
  const cost = played.reduce((total, run) => total + readLatePacing(run).costUsd, 0);
  log(`Played ${played.length} short playthroughs, $${cost.toFixed(4)}. Wrote pacing-clues.md and .json.`);
}

/** pacing-clues-blind.md and its key (the same salt once written); no calls. */
export function pacingCluesBlindMode(ctx: Pick<PrepContext, "files" | "log">): void {
  const { files, log } = ctx;
  const runs = playRunsOf(files);
  if (runs.length === 0) throw new Error("No short playthroughs in pacing-clues.json. Run --pacing-clues-play first.");
  const key = blindKeyOf(files, runs);
  const where = files.writeBlindReading(BLIND_FILE, renderBlindReading(runs, key.salt));
  log(`${clueItems(runs).length} player turns from ${runs.length} runs, coded. Wrote ${where}; the key is in keys/${BLIND_FILE}.json (read it only after the verdicts are in pacingCluesHand.ts).`);
}

/** The clue judge's v2: its calibration (two samples), then, where that reads reliable, the window's turns (one sample); then the report. */
export async function judgePacingCluesMode(ctx: PrepContext): Promise<void> {
  const { files, log } = ctx;
  const arm = JUDGE_ARMS[0];
  const run = async (targets: (CluesCalibrationTarget | CluesReplyTarget)[], what: string) => {
    const jobs = cluesJudgeJobs(mergedTargets(targets, CLUES_JUDGE_PROMPT_VERSION), arm, PACING_CLUES_PROMPT_STATE, STAGE, CLUES_JUDGE_PROMPT_VERSION);
    const done = finishedJobKeys(files.readPrepRecords());
    const open = jobs.filter((j) => !done.has(keyOf(j)));
    const estimate = sum(open.map(jobEstimateUsd));
    ctx.refuse(STAGE, estimate);
    log(`${what} on ${arm.key} (stage ${STAGE}): ${jobs.length} calls, ${open.length} open, est $${estimate.toFixed(3)}`);
    const result = await runJobs(jobs, ctx.deps("prep"), { caps: ctx.caps, previous: files.readPrepRecords(), extraSpend: spendBeside(files, "prep"), tokensPerMinute: ctx.tpm, maxInFlight: ctx.maxInFlight });
    if (result.stoppedReason) log(`Stopped: ${result.stoppedReason}`);
  };
  const { targets: calibration, problems } = cluesCalibrationTargets(runs2Of(files), PACING_CLUES_CALIBRATION, CLUES_JUDGE_PROMPT_VERSION);
  if (problems.length) throw new Error(problems.join("; "));
  await run(calibration, `${calibration.length} calibration items (v2), ${CALIBRATION_SAMPLES} samples`);
  const { agreement } = calibrationAgreement(files);
  for (const a of agreement) log(`${a.check}: ${a.agree} of ${a.decided} agree (hand yes ${a.handPasses}, no ${a.handFails}), samples ${a.pairsAgree} of ${a.pairs}: ${a.reliable ? "reliable" : "not reliable"}`);
  const runs = playRunsOf(files);
  const stage = stageJudgeTargets(clueJudgeTargets(clueItems(runs)), agreement);
  if (stage.length) await run(stage, `${stage.length} player turns of the stage's window`);
  else log("The calibration does not read reliable: the stage's turns are not sent to the judge.");
  writePacingClues(ctx, runs);
  log("Wrote pacing-clues.md and .json.");
}

/** The dry run's lines for the stage's short playthroughs: each start's calls and cost per arm, what the file holds, and the stage's spend. */
export function printPacingCluesPlan(files: EvalFiles, log: (line: string) => void): void {
  const costsFor = measuredCallCosts(files.readRecords());
  const held = playRunsOf(files);
  const stored = runs2Of(files);
  const prep: CallRecord[] = files.readPrepRecords().filter((r) => r.stage === STAGE);
  log(`\nShort playthroughs (--pacing-clues-play, stage ${STAGE}, cap $${DEFAULT_STAGE_CAPS[STAGE]}, under ${PACING_CLUES_PROMPT_STATE}; production and ${CANDIDATE}, one sample per invocation):`);
  let total = 0;
  for (const start of PACING_CLUES_STARTS) {
    const run = stored.find((r) => r.spec.id === start.story && r.sample === 1);
    if (!run) {
      log(`  ${start.story} from turn ${start.turn}: no stored run`);
      continue;
    }
    const estimate = latePacingEstimate(run.input.playerCount, run.input.maxTurns, start.turn, costsFor(run.input.playerCount));
    total += 2 * estimate.usd;
    const runs = held.filter((r) => r.spec.id === start.story).map((r) => `${r.from?.variant} s${r.sample}: ${r.turns.length} turns, ${r.stopped}`);
    log(`  ${start.story} from turn ${start.turn}: about ${estimate.calls} calls an arm, est $${estimate.usd.toFixed(3)} an arm${runs.length ? `; held: ${runs.join("; ")}` : ""}`);
  }
  log(`  A sample of both arms: est $${total.toFixed(3)} before retries (two samples $${(2 * total).toFixed(3)}); spent in the stage so far $${sum(prep.map((r) => r.costUsd)).toFixed(4)} over ${prep.length} prep attempts`);
}
