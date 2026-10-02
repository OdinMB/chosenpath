import type { Story } from "core/models/Story.js";
import type { ThreadAnalysis } from "core/types/index.js";
import { getThreadType } from "core/types/index.js";
import { checkThreadPlan } from "../../game/services/planChecks.js";
import { contestsDecidedHere } from "../../game/services/storyTextRounds/contestSettled.js";
import { CONTEST_SETTLED_CASES, CONTEST_SETTLED_PROMPT_STATE, armKey, type Stage } from "./arms.js";
import { caseStory, type EvalCase } from "./cases.js";
import { CONTEST_SETTLED_HAND, type ContestSettledHandEntry } from "./contestSettledHand.js";
import { contestSettledCasesToFreeze, type RunsByRound } from "./contestSettledCases.js";
import type { EvalFiles } from "./evalFiles.js";
import { sha256 } from "./executor.js";
import { outputIdOf } from "./judgedChecks.js";
import { checksForRecords } from "./outputChecks.js";
import { playthroughRunsFrom } from "./playthroughMode.js";
import { renderVariantComparison } from "./resultsReport.js";
import { usable, type CallRecord } from "./runner.js";
import { meanMove, momentsOf, rateMove, type MeanMove, type RateMove, type Tally } from "./stopRule.js";
import type { PrepContext } from "./turnPrep.js";
import { variantComparisons } from "./variantComparison.js";

/*
 * The contest-settled stage's CLI modes (decision A's seal fix, the evening of
 * 2026-10-01), kept out of run.ts:
 * - --build-contest-settled-cases: the stage's chapter plans from the stored
 *   playthroughs of rounds 1-3 (contestSettledCases.ts), each only where its
 *   request is the one production sent there, frozen beside the others (those
 *   already frozen left as they are, unless --rebuild-cases); no calls;
 * - --contest-settled-blind: no calls; each chapter plan of the stage's arms
 *   (--run --stage contest-settled --role thread --prompt-state adopted25) read
 *   after the game's plan check, its thread on the contest it decides under a
 *   code (five hex digits of a salted hash), no arm or sample named
 *   (contest-settled-blind.md; the key in keys/contest-settled-blind.json), for
 *   the hand reading in contestSettledHand.ts;
 * - --contest-settled: the stage's report, no calls. The hand verdicts by code,
 *   unblinded through the key: plans whose thread decides its contest, the
 *   variant against production on the (case, sample) pairs both have, under the
 *   stop rule (stopRule.ts: beyond production's two-sample difference and a
 *   one-sided Fisher p < 0.10). Beside it: a heuristic (milestones whose words
 *   put the decision off), whether a thread on the contest was found and the
 *   plan usable, reasoning tokens (a mean, two standard errors), waits and
 *   cost, the automatic checks (variantComparison.ts), and every plan's thread.
 *   Writes contest-settled.md and .json. Readings, not verdicts.
 */

const STAGE: Stage = "contest-settled";
const BLIND_FILE = "contest-settled-blind";
const LUNA_LOW = { model: "gpt-6-luna", reasoningEffort: "low" } as const;

/** The stage's arms: production's chapter planner, then the variant, on the group planner model. */
export const CONTEST_SETTLED_ARMS = [armKey(LUNA_LOW, "adopted"), armKey(LUNA_LOW, "contestSettled")];

const STAGE_CASES = new Set<string>(CONTEST_SETTLED_CASES);

/** One plan's thread on a contest its chapter decides, as the game keeps it. */
export type ContestPlanRow = {
  armKey: string;
  caseId: string;
  sample: number;
  outputId: string;
  outcomeId: string;
  /** The kept plan has a thread on the contest */
  found: boolean;
  kind?: "challenge" | "contest" | "exploration";
  /** A challenge's stored scoreboard side (a converted contest's, or since 2026-10-02 the camp of one the planner wrote) */
  favorableSide?: "sideA" | "sideB";
  sideA: string[];
  sideB: string[];
  question?: string;
  typeOfMilestone?: string;
  /** The outcome's stages as the reply named them */
  stages: string[];
  /** The thread's possible milestones, keyed as the game keeps them */
  milestones: Record<string, string>;
  /** Possible milestones whose words put the decision off (deferralWords, a heuristic) */
  deferring: number;
  /** The plan check found no problem */
  usable: boolean;
  latencyMs: number;
  reasoningTokens: number;
  outputTokens: number;
  costUsd: number;
};

type RowBase = Pick<ContestPlanRow, "armKey" | "caseId" | "sample" | "outputId" | "latencyMs" | "reasoningTokens" | "outputTokens" | "costUsd">;

const DEFERRAL_PATTERNS = [
  /\b(next|later|future|upcoming|final|eventual)\b[^.;]{0,50}\b(discussion|decision|vote|hearing|review|deliberation|custody discussion|award)\b/i,
  /\b(shape|frame|guide|steer)\b[^.;]{0,40}\b(discussion|decision|deliberation)\b/i,
  /\bwithout (assigning|deciding|awarding|naming|taking|granting)\b/i,
  /\binform(s|ing)?\b[^.;]{0,50}\bdecision\b/i,
  /\b(remains?|stays?|keeps?[^.;]{0,30}) (unassigned|undecided)\b/i,
  /\bcustody unresolved\b/i,
];

/** Whether a milestone's words put the contest's decision off: a later discussion or decision, shaping one, or a decision left unassigned (a heuristic beside the hand). */
export function deferralWords(text: string): boolean {
  return DEFERRAL_PATTERNS.some((pattern) => pattern.test(text));
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

/** A plan's threads on the contests its chapter decides (contestsDecidedHere), read after the game's plan check; none where it decides none. */
export function contestPlanRows(story: Story, written: ThreadAnalysis, base: RowBase): ContestPlanRow[] {
  const decided = contestsDecidedHere(story);
  if (decided.length === 0) return [];
  const checked = checkThreadPlan(story, written);
  const writtenThreads = Array.isArray(written?.threads) ? written.threads : [];
  return decided.map((outcomeId): ContestPlanRow => {
    const kept = checked.plan.threads.find((t) => t?.outcomeId === outcomeId);
    const raw = writtenThreads.find((t) => t?.outcomeId === outcomeId) as (ThreadAnalysis["threads"][number] & { question?: unknown; outcomeStages?: unknown }) | undefined;
    if (!kept) return { ...base, outcomeId, found: false, sideA: [], sideB: [], stages: strings(raw?.outcomeStages), milestones: {}, deferring: 0, usable: !checked.problem };
    const milestones = Object.fromEntries(Object.entries((kept.possibleMilestones ?? {}) as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"));
    const question = (kept as { question?: unknown }).question ?? raw?.question;
    return {
      ...base,
      outcomeId,
      found: true,
      kind: Array.isArray(kept.progression) && kept.progression.length > 0 ? getThreadType(kept) : kept.playersSideB.length > 0 ? "contest" : undefined,
      ...(kept.favorableSide ? { favorableSide: kept.favorableSide } : {}),
      sideA: [...kept.playersSideA],
      sideB: [...kept.playersSideB],
      ...(typeof question === "string" ? { question } : {}),
      ...(typeof kept.typeOfMilestone === "string" ? { typeOfMilestone: kept.typeOfMilestone } : {}),
      stages: strings(raw?.outcomeStages),
      milestones,
      deferring: Object.values(milestones).filter(deferralWords).length,
      usable: !checked.problem,
    };
  });
}

// ---------------------------------------------------------------- the blind reading

/** The key of the blind reading: its salt, and each plan code's arm, case and sample. */
export type ContestBlindKey = { salt: string; plans: Record<string, { armKey: string; caseId: string; sample: number }> };

/** A plan's code: five hex digits of the salted hash of its arm, case and sample, so no code says its arm. */
export const blindCodeOf = (salt: string, row: Pick<ContestPlanRow, "armKey" | "caseId" | "sample" | "outcomeId">) =>
  sha256(`${salt}|${row.armKey}|${row.caseId}|${row.sample}|${row.outcomeId}`).slice(0, 5).toUpperCase();

export function contestBlindKey(rows: ContestPlanRow[], salt: string): ContestBlindKey {
  const entries = rows.map((r) => [blindCodeOf(salt, r), { armKey: r.armKey, caseId: r.caseId, sample: r.sample }] as const);
  if (new Set(entries.map(([code]) => code)).size !== entries.length) throw new Error("Two plans share a blind code: write the key again with another salt");
  return { salt, plans: Object.fromEntries(entries) };
}

const quoted = (text: string | undefined) => `"${(text ?? "").replace(/\s+/g, " ").trim()}"`;

/**
 * contest-settled-blind.md: per case, the contest its chapter decides (question and resolutions); then each plan's
 * thread on it under its code, the codes in order: its kind and sides, question, kind of milestone, the outcome's stages
 * as named and the three possible milestones. No arm or sample is named.
 */
export function renderContestBlind(rows: ContestPlanRow[], stories: Map<string, Story>, salt: string): string {
  const lines = [
    "# Blind reading: does the contest's deciding chapter decide it?",
    "",
    "For each plan, read its thread on the contest against the contest's question and resolutions: does each of its three possible milestones decide the contest in its own direction (a side's win that side's resolution, the mixed one a settled compromise), whatever its wording? Record yes, no (quote the milestone that puts it off, settles only who may shape it, or is about something else) or partial, by code, in the stage's hand file, before the key is opened.",
    "",
  ];
  const caseIds = [...new Set(rows.map((r) => r.caseId))].sort();
  for (const caseId of caseIds) {
    const mine = rows.filter((r) => r.caseId === caseId);
    const story = stories.get(caseId);
    const outcomeIds = [...new Set(mine.map((r) => r.outcomeId))];
    lines.push(`## ${caseId}`, "");
    for (const outcomeId of outcomeIds) {
      const outcome = story?.getOutcomeById(outcomeId);
      const resolutions = (outcome?.possibleResolutions ?? {}) as unknown as Record<string, string>;
      lines.push(`The contest: ${outcomeId}, ${quoted(outcome?.question)}`, "", `- Side A wins: ${quoted(resolutions.sideAWins)}`, `- Mixed: ${quoted(resolutions.mixed)}`, `- Side B wins: ${quoted(resolutions.sideBWins)}`, "");
      if (story) {
        lines.push(`Its milestones so far: ${(outcome?.milestones ?? []).map(quoted).join(" ") || "none"}`, "");
        for (const slot of story.getPlayerSlots()) lines.push(`- ${slot}: ${story.getPlayer(slot)?.name ?? slot}`);
        lines.push("");
      }
      const coded = mine.filter((r) => r.outcomeId === outcomeId).map((r) => ({ r, code: blindCodeOf(salt, r) })).sort((a, b) => a.code.localeCompare(b.code));
      for (const { r, code } of coded) {
        lines.push(`### ${code}`, "");
        if (!r.found) {
          lines.push("No thread on this contest in the plan the game keeps.", "");
          continue;
        }
        lines.push(`- Kind: ${r.kind ?? "?"}; side A ${r.sideA.join(", ") || "none"}; side B ${r.sideB.join(", ") || "none"}`);
        lines.push(`- Question: ${quoted(r.question)}`);
        lines.push(`- Kind of milestone: ${quoted(r.typeOfMilestone)}`);
        lines.push(`- Stages as named: ${r.stages.map(quoted).join(" | ") || "none"}`);
        for (const [key, text] of Object.entries(r.milestones)) lines.push(`- ${key}: ${quoted(text)}`);
        lines.push("");
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------- the readings

export type HandRow = ContestPlanRow & { code?: string; decides?: boolean; partial?: boolean; note?: string };

/** The hand verdicts by code, unblinded through the key onto the plans; a plan without one stays unread. */
export function withHand(rows: ContestPlanRow[], key: ContestBlindKey, hand: Record<string, ContestSettledHandEntry> = CONTEST_SETTLED_HAND): HandRow[] {
  return rows.map((r) => {
    const code = blindCodeOf(key.salt, r);
    const entry = key.plans[code] ? hand[code] : undefined;
    if (!entry) return { ...r, code };
    return entry.hand === "partial" ? { ...r, code, partial: true, note: entry.note } : { ...r, code, decides: entry.hand, note: entry.note };
  });
}

export type DecidesComparison = { production: Tally; variant: Tally; noise?: number; move: RateMove; unread: { production: number; variant: number } };

const pairOf = (r: Pick<ContestPlanRow, "caseId" | "sample" | "outcomeId">) => `${r.caseId}|${r.sample}|${r.outcomeId}`;
const tallyOf = (rows: { decides?: boolean }[]): Tally => ({ hits: rows.filter((r) => r.decides === true).length, n: rows.filter((r) => r.decides !== undefined).length });
const rateOf = (t: Tally) => (t.n ? t.hits / t.n : undefined);

/** Plans whose thread decides its contest by a reading (the hand's, by default), the variant against production on the pairs both read; production's sample 1 against its sample 2 the noise. */
export function decidesComparison(rows: HandRow[], read: (r: HandRow) => boolean | undefined = (r) => r.decides, arms: string[] = CONTEST_SETTLED_ARMS): DecidesComparison {
  const [p, v] = arms;
  const withRead = rows.map((r) => ({ ...r, decides: read(r) }));
  const production = withRead.filter((r) => r.armKey === p);
  const variant = withRead.filter((r) => r.armKey === v);
  const both = new Set(production.filter((r) => r.decides !== undefined).map(pairOf).filter((pair) => variant.some((o) => pairOf(o) === pair && o.decides !== undefined)));
  const shared = (list: typeof withRead) => list.filter((r) => both.has(pairOf(r)));
  const [s1, s2] = [rateOf(tallyOf(production.filter((r) => r.sample === 1))), rateOf(tallyOf(production.filter((r) => r.sample === 2)))];
  const noise = s1 !== undefined && s2 !== undefined ? Math.abs(s1 - s2) : undefined;
  const [ref, arm] = [tallyOf(shared(production)), tallyOf(shared(variant))];
  return {
    production: ref,
    variant: arm,
    ...(noise === undefined ? {} : { noise }),
    move: noise === undefined ? {} : rateMove(ref, arm, noise),
    unread: { production: production.filter((r) => r.decides === undefined).length, variant: variant.filter((r) => r.decides === undefined).length },
  };
}

// ---------------------------------------------------------------- the modes

type Lookup = { records: CallRecord[]; cases: EvalCase[]; load: (record: CallRecord) => unknown };

/** Every final usable chapter plan of the stage's arms under its tag on its cases, read at the contests it decides. */
export function stagePlanRows({ records, cases, load }: Lookup, arms: string[] = CONTEST_SETTLED_ARMS, promptState = CONTEST_SETTLED_PROMPT_STATE): ContestPlanRow[] {
  const byId = new Map(cases.map((c) => [c.id, c]));
  return records.flatMap((r): ContestPlanRow[] => {
    if (r.role !== "thread" || r.group !== "thread" || !r.final || !usable(r) || !r.outputFile || r.promptState !== promptState || !arms.includes(r.armKey) || !STAGE_CASES.has(r.caseId)) return [];
    const evalCase = byId.get(r.caseId);
    const written = load(r) as ThreadAnalysis | undefined;
    if (!evalCase?.state || !written) return [];
    const base: RowBase = { armKey: r.armKey, caseId: r.caseId, sample: r.sample, outputId: outputIdOf(r.outputFile), latencyMs: r.latencyMs, reasoningTokens: r.reasoningTokens, outputTokens: r.outputTokens, costUsd: r.costUsd };
    return contestPlanRows(caseStory(evalCase, false), written, base);
  });
}

const runsByRound = (files: EvalFiles): RunsByRound => ({
  1: playthroughRunsFrom(files.readPlaythroughs("playthroughs")),
  2: playthroughRunsFrom(files.readPlaythroughs("playthroughs-2")),
  3: playthroughRunsFrom(files.readPlaythroughs("playthroughs-3")),
});

/** The prompt hash each stored playthrough call sent, by its output file. */
const promptHashesOf = (files: EvalFiles) => {
  const byId = new Map(files.readPrepRecords().flatMap((r) => (r.outputFile && r.promptHash ? [[outputIdOf(r.outputFile), r.promptHash] as [string, string]] : [])));
  return (outputFile: string) => byId.get(outputIdOf(outputFile));
};

export function buildContestSettledCasesMode(ctx: Pick<PrepContext, "files" | "log">, replace: boolean): void {
  const { files, log } = ctx;
  if (!files.casesExist()) throw new Error("No frozen cases. Run --build-cases first.");
  const runs = runsByRound(files);
  if (runs[3].length === 0) throw new Error("No stored third-round playthroughs (playthroughs-3.json). Run --playthroughs --round 3 first.");
  const { cases, problems, skipped } = contestSettledCasesToFreeze(files.readCases(), runs, promptHashesOf(files), replace);
  if (problems.length) throw new Error(problems.join("; "));
  if (skipped.length) log(`Already frozen, left as they are: ${skipped.join(", ")}.`);
  if (cases.length === 0) return log("Nothing new to freeze; no calls.");
  files.addCases(cases, undefined, replace);
  log(`Froze ${cases.map((c) => c.id).join(", ")} beside the other cases; no calls.`);
}

const lookupOf = (files: EvalFiles): Lookup => ({ records: files.readRecords(), cases: files.readCases(), load: files.loadOutput });

/** The blind key, written once with a fresh salt; the same salt ever after, so the codes stay put. */
function blindKeyOf(files: EvalFiles, rows: ContestPlanRow[]): ContestBlindKey {
  const held = files.readBlindKey(BLIND_FILE) as ContestBlindKey | undefined;
  const salt = held?.salt ?? sha256(`${Date.now()}|${Math.random()}`).slice(0, 16);
  const key = contestBlindKey(rows, salt);
  files.writeBlindKey(BLIND_FILE, key);
  return key;
}

const storiesOf = (cases: EvalCase[]) => new Map(cases.filter((c) => STAGE_CASES.has(c.id) && c.state).map((c) => [c.id, caseStory(c, false)]));

export function contestSettledBlindMode(ctx: Pick<PrepContext, "files" | "log">): void {
  const { files, log } = ctx;
  const lookup = lookupOf(files);
  const rows = stagePlanRows(lookup);
  if (rows.length === 0) throw new Error(`No chapter plans of the stage's arms under ${CONTEST_SETTLED_PROMPT_STATE}. Run --run --stage contest-settled --role thread first.`);
  const key = blindKeyOf(files, rows);
  const where = files.writeBlindReading(BLIND_FILE, renderContestBlind(rows, storiesOf(lookup.cases), key.salt));
  log(`${rows.length} plans' threads on the contest their chapter decides, coded. Wrote ${where}; the key is in keys/${BLIND_FILE}.json (read it only after the verdicts are in contestSettledHand.ts).`);
}

const pct = (n: number, d: number) => (d === 0 ? "–" : `${Math.round((100 * n) / d)}%`);
const tallyText = (t: Tally) => `${t.hits} of ${t.n} (${pct(t.hits, t.n)})`;
const pText = (p?: number) => (p === undefined ? "" : p < 0.001 ? " (p < 0.001)" : ` (p ${p.toFixed(3)})`);
const moveText = (c: { noise?: number; move: RateMove }) =>
  c.noise === undefined ? "no noise figure" : c.move.moved ? `moved ${c.move.moved}${pText(c.move.p)}` : c.move.beyondNoise ? `beyond the noise, not moved${pText(c.move.p)}` : "within the noise";
const meanText = (m: MeanMove) => (m.moved ? `moved ${m.moved}` : m.beyondNoise ? `beyond the noise, not moved (${(m.standardErrors ?? 0).toFixed(1)} SE)` : "within the noise");
const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
};
const verdictText = (r: HandRow) => (r.decides === true ? "yes" : r.decides === false ? "no" : r.partial ? "partial" : "unread");

/** The reasoning tokens, the variant against production: means, production's two samples the noise, two standard errors. */
function reasoningMove(rows: ContestPlanRow[]): { production: number; variant: number; move: MeanMove } {
  const [p, v] = CONTEST_SETTLED_ARMS;
  const of = (key: string, sample?: number) => momentsOf(rows.filter((r) => r.armKey === key && (sample === undefined || r.sample === sample)).map((r) => r.reasoningTokens));
  const noise = Math.abs(of(p, 1).mean - of(p, 2).mean);
  return { production: of(p).mean, variant: of(v).mean, move: meanMove(of(p), of(v), noise) };
}

/** contest-settled.md and .json from what is recorded; no calls. */
export function writeContestSettled(ctx: Pick<PrepContext, "files" | "log">): void {
  const { files, log } = ctx;
  const lookup = lookupOf(files);
  const rows = stagePlanRows(lookup);
  const key = files.readBlindKey(BLIND_FILE) as ContestBlindKey | undefined;
  const read = key ? withHand(rows, key) : rows.map((r): HandRow => ({ ...r }));
  const hand = decidesComparison(read);
  const heuristic = decidesComparison(read, (r) => (r.found ? r.deferring === 0 : false));
  const found = decidesComparison(read, (r) => r.found);
  const usableRead = decidesComparison(read, (r) => r.usable);
  const reasoning = reasoningMove(rows);
  const stageRecords = lookup.records.filter((r) => r.stage === STAGE && r.promptState === CONTEST_SETTLED_PROMPT_STATE);
  const { checks } = checksForRecords(stageRecords, lookup.cases, files.loadOutput, files.loadReplyContent, files.loadPrompt);
  const tags = new Map(lookup.cases.map((c) => [c.id, c.tags]));
  const comparisons = variantComparisons(stageRecords, checks, tags, CONTEST_SETTLED_PROMPT_STATE);
  const spendUsd = files.readRecords().filter((r) => r.stage === STAGE).reduce((sum, r) => sum + r.costUsd, 0);
  const [p, v] = CONTEST_SETTLED_ARMS;
  const armName = (k: string) => (k === p ? "production" : k === v ? "contestSettled" : k);
  const generatedAt = new Date().toISOString();
  const comparisonRow = (label: string, c: DecidesComparison) =>
    `| ${label} | ${tallyText(c.production)} | ${tallyText(c.variant)} | ${c.noise === undefined ? "–" : `${Math.round(100 * c.noise)} pts`} | ${moveText(c)} |`;
  const waits = [p, v].map((k) => {
    const own = rows.filter((r) => r.armKey === k);
    return `| ${armName(k)} | ${own.length} | ${(quantile(own.map((r) => r.latencyMs), 0.5) / 1000).toFixed(1)} s | ${(quantile(own.map((r) => r.latencyMs), 0.95) / 1000).toFixed(1)} s | ${(own.reduce((s, r) => s + r.costUsd, 0) / Math.max(1, own.length)).toFixed(4)} |`;
  });
  const lines = [
    "# A contest's deciding chapter that decides it (the contest-settled stage)",
    "",
    `Generated ${generatedAt} from calls.jsonl (contestSettledPrep.ts). Production's chapter planner (${p}) and the variant (${v}) under ${CONTEST_SETTLED_PROMPT_STATE}, each reply read after the game's plan check, at the contest its chapter decides. The variant reads against production on the (case, sample) pairs both have, production's sample 1 against its sample 2 as the noise, the stop rule on top. The hand reading was blind (contest-settled-blind.md, the key opened after the verdicts). Spent in the stage so far: $${spendUsd.toFixed(4)}.`,
    "",
    "## Plans whose thread decides its contest",
    "",
    "| Reading | Production | contestSettled | Noise | Reading |",
    "|---|---|---|---|---|",
    comparisonRow("By hand (blind): each milestone decides the contest", hand),
    comparisonRow("Heuristic: no milestone's words put the decision off", heuristic),
    comparisonRow("A thread on the contest in the kept plan", found),
    comparisonRow("The plan check found no problem", usableRead),
    "",
    `Unread by hand: production ${hand.unread.production}, contestSettled ${hand.unread.variant}${key ? "" : " (no blind key yet: run --contest-settled-blind)"}.`,
    "",
    "## Reasoning, waits and cost",
    "",
    `Reasoning tokens a plan: production ${reasoning.production.toFixed(0)}, contestSettled ${reasoning.variant.toFixed(0)}, ${meanText(reasoning.move)}.`,
    "",
    "| Arm | Plans | Wait p50 | Wait p95 | Cost a plan ($) |",
    "|---|---|---|---|---|",
    ...waits,
    "",
    "## Per case",
    "",
    "| Case | Sample | Arm | Hand | Kind | Flagged milestones | Question |",
    "|---|---|---|---|---|---|---|",
    ...[...read]
      .sort((a, b) => a.caseId.localeCompare(b.caseId) || a.sample - b.sample || a.armKey.localeCompare(b.armKey))
      .map((r) => `| ${r.caseId} | ${r.sample} | ${armName(r.armKey)} | ${verdictText(r)}${r.note ? `: ${r.note.replace(/\|/g, "/")}` : ""} | ${r.found ? `${r.kind ?? "?"}${r.favorableSide ? ` (${r.favorableSide})` : ""}` : "none"} | ${r.deferring} | ${(r.question ?? "").replace(/\|/g, "/")} |`),
    "",
    "## Every plan's thread on its contest",
    "",
    ...read.flatMap((r) => [
      `- ${r.caseId} s${r.sample} ${armName(r.armKey)} (${r.outputId}, ${r.code ?? "uncoded"}): ${verdictText(r)}; stages: ${r.stages.join(" | ") || "none"}`,
      ...Object.entries(r.milestones).map(([k, text]) => `  - ${k}: ${text}`),
    ]),
    "",
    "## The automatic checks",
    "",
    ...renderVariantComparison(comparisons),
  ];
  files.writeContestSettled(`${lines.join("\n")}\n`, { generatedAt, promptState: CONTEST_SETTLED_PROMPT_STATE, arms: CONTEST_SETTLED_ARMS, rows: read, hand, heuristic, found, usable: usableRead, reasoning, comparisons, spendUsd });
  log(`By hand: production ${tallyText(hand.production)}, contestSettled ${tallyText(hand.variant)}, ${moveText(hand)}; heuristic ${tallyText(heuristic.production)} vs ${tallyText(heuristic.variant)}. Stage so far $${spendUsd.toFixed(4)}. Wrote contest-settled.md and .json.`);
}
