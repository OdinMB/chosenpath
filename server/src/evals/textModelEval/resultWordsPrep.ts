import type { Story } from "core/models/Story.js";
import type { BeatGeneration, SetOfBeatGenerationSchema } from "core/types/index.js";
import { resultWordsOfBeat } from "../../game/services/beatRepairs.js";
import { RESULT_WORDS_CASES, RESULT_WORDS_PROMPT_STATE, armKey, type Stage } from "./arms.js";
import { caseStory, type EvalCase } from "./cases.js";
import { asCall, checkedTurns, type CheckedTurn } from "./checkedTurns.js";
import { lineTallies, type LineTally } from "./choiceLinePrep.js";
import type { EvalFiles } from "./evalFiles.js";
import { sha256 } from "./executor.js";
import { outputIdOf } from "./judgedChecks.js";
import { checksForRecords } from "./outputChecks.js";
import { playthroughRunsFrom } from "./playthroughMode.js";
import { renderVariantComparison } from "./resultsReport.js";
import { RESULT_WORDS_HAND, type WordsHandEntry } from "./resultWordsHand.js";
import { RESULT_WORDS_CASE_SPECS, resultWordsCasesToFreeze } from "./resultWordsCases.js";
import type { RunsByRound } from "./contestSettledCases.js";
import type { CallRecord } from "./runner.js";
import { meanMove, momentsOf, rateMove, type MeanMove, type RateMove, type Tally } from "./stopRule.js";
import type { PrepContext } from "./turnPrep.js";
import { renderTurnWaits, renderTurnWaitsBySample, turnKindOf, turnWaitReadings, turnWaitsBySample, type TurnKind } from "./turnWaits.js";
import { variantComparisons } from "./variantComparison.js";

/*
 * The result-words stage's CLI modes (decision A's result-words fix,
 * 2026-10-02), kept out of run.ts:
 * - --build-result-words-cases: the stage's group turns from the stored
 *   playthroughs of rounds 2 and 3 (resultWordsCases.ts), each only where its
 *   request is the one production sent there, frozen beside the others (those
 *   already frozen left as they are, unless --rebuild-cases); no calls;
 * - --result-words-blind: no calls; each turn job of the stage (--run --stage
 *   result-words --role beat --prompt-state adopted27, production's one
 *   checked retry in the loop) read whole (checkedTurns.ts), by the reply the
 *   game keeps, and every sentence of a player's title, text, options and
 *   interludes holding a word that can name a result's kind (favorable,
 *   unfavorable, mixed, Side A or B, resolution, outcome, milestone) put under
 *   a code (five hex digits of a salted hash), no arm or sample named
 *   (result-words-blind.md; the key in keys/result-words-blind.json), for the
 *   hand reading in resultWordsHand.ts;
 * - --result-words: the stage's report, no calls. Turns and player texts that
 *   name a result's kind, by production's note (resultWordsOfBeat, the words
 *   the game logs) and by the hand (a sentence that tells the game's label as
 *   story text), the variant against production on the (case, sample) pairs
 *   both read, under the stop rule (stopRule.ts: beyond production's two-sample
 *   difference and a one-sided Fisher p < 0.10); beside them reasoning tokens
 *   (a mean, two standard errors), the retries, the waits including the retry,
 *   cost, the automatic checks on the turns kept (variantComparison.ts), and
 *   every coded sentence with its verdict. Writes result-words.md and .json.
 *   Readings, not verdicts.
 */

const STAGE: Stage = "result-words";
const BLIND_FILE = "result-words-blind";
const LUNA_LOW = { model: "gpt-6-luna", reasoningEffort: "low" } as const;

/** The stage's arms: production's group turn, then the variant, on the group turn model. */
export const RESULT_WORDS_ARMS = [armKey(LUNA_LOW, "adopted"), armKey(LUNA_LOW, "resultWords")];

const STAGE_CASES = new Set<string>(RESULT_WORDS_CASES);

/** Words that can name a result's kind, the game's or the planner's, for the hand reading (production's note reads fewer). */
const KIND_WORDS = /\b(?:un)?favou?rabl[ey]\b|\bmixed\b|\bside [ab]\b|\bresolutions?\b|\boutcomes?\b|\bmilestones?\b/i;

export type SentenceWhere = "title" | "text" | "option" | "interlude";

/** One sentence a hand reader takes: whose, where, its place among the player's sentences that hold such a word. */
export type KindSentence = { slot: string; where: SentenceWhere; index: number; sentence: string };

const sentencesOf = (text: string): string[] =>
  text
    .split(/\n+/)
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?…]["”’]?)\s+/))
    .map((s) => s.trim())
    .filter(Boolean);

/** Every sentence of a player's title, text, options and interludes that holds a word that can name a result's kind. */
export function kindSentencesOf(slot: string, beat: BeatGeneration | undefined): KindSentence[] {
  if (!beat || typeof beat !== "object") return [];
  const parts: [SentenceWhere, string][] = [
    ["title", typeof beat.title === "string" ? beat.title : ""],
    ["text", typeof beat.text === "string" ? beat.text : ""],
    ...(Array.isArray(beat.options) ? beat.options : []).map((o): [SentenceWhere, string] => ["option", typeof o?.text === "string" ? o.text : ""]),
    ...(Array.isArray(beat.interludes) ? beat.interludes : []).map((i): [SentenceWhere, string] => ["interlude", typeof i?.text === "string" ? i.text : ""]),
  ];
  const found: KindSentence[] = [];
  for (const [where, text] of parts) {
    for (const sentence of where === "title" ? [text.trim()].filter(Boolean) : sentencesOf(text)) {
      if (KIND_WORDS.test(sentence)) found.push({ slot, where, index: found.length, sentence });
    }
  }
  return found;
}

/** One kept turn of the stage, read per player. */
export type WordsTurn = {
  armKey: string;
  caseId: string;
  sample: number;
  outputId?: string;
  reasoningTokens: number;
  retried?: string;
  /** The game keeps a reply */
  kept: boolean;
  /** The players the turn writes for */
  slots: string[];
  /** Production's note (resultWordsOfBeat): the players whose title, text, options or interludes name a result's kind */
  noted: { slot: string; words: string[] }[];
  /** The sentences for the hand reading */
  sentences: KindSentence[];
};

type TurnBase = Pick<WordsTurn, "armKey" | "caseId" | "sample" | "reasoningTokens"> & Partial<Pick<WordsTurn, "outputId" | "retried">>;

/** A turn read per player: production's note and the sentences for the hand; nothing where the game keeps no reply. */
export function wordsTurnReading(base: TurnBase, story: Story, reply: SetOfBeatGenerationSchema | undefined): WordsTurn {
  const slots = story.getPlayerSlots();
  if (!reply) return { ...base, kept: false, slots, noted: [], sentences: [] };
  const beatOf = (slot: string) => (reply as unknown as Record<string, BeatGeneration | undefined>)[slot];
  const noted = slots.flatMap((slot) => {
    const words = resultWordsOfBeat(beatOf(slot));
    return words.length ? [{ slot, words }] : [];
  });
  return { ...base, kept: true, slots, noted, sentences: slots.flatMap((slot) => kindSentencesOf(slot, beatOf(slot))) };
}

// ---------------------------------------------------------------- the blind reading

/** The key of the blind reading: its salt, and each sentence code's arm, case, sample, player and place. */
export type WordsBlindKey = { salt: string; items: Record<string, { armKey: string; caseId: string; sample: number; slot: string; index: number }> };

/** A sentence's code: five hex digits of the salted hash of its arm, case, sample and place, so no code says its arm. */
export const wordsCodeOf = (salt: string, turn: Pick<WordsTurn, "armKey" | "caseId" | "sample">, s: Pick<KindSentence, "slot" | "index">) =>
  sha256(`${salt}|${turn.armKey}|${turn.caseId}|${turn.sample}|${s.slot}|${s.index}`).slice(0, 5).toUpperCase();

export function wordsBlindKey(turns: WordsTurn[], salt: string): WordsBlindKey {
  const entries = turns.flatMap((t) => t.sentences.map((s) => [wordsCodeOf(salt, t, s), { armKey: t.armKey, caseId: t.caseId, sample: t.sample, slot: s.slot, index: s.index }] as const));
  if (new Set(entries.map(([code]) => code)).size !== entries.length) throw new Error("Two sentences share a blind code: write the key again with another salt");
  return { salt, items: Object.fromEntries(entries) };
}

/**
 * result-words-blind.md: per case, what its turn narrates (the case's purpose); then each sentence under its code, the
 * codes in order, with its player and place. No arm or sample is named.
 */
export function renderWordsBlind(turns: WordsTurn[], salt: string, purposes: Map<string, string>): string {
  const lines = [
    "# Blind reading: does the text tell the game's result label?",
    "",
    "Each sentence below holds a word that can name a result's kind. Read it as a player would: does it tell the game's label for a result (favorable, mixed, unfavorable, Side A or Side B, or the game's resolution, outcome or milestone) as story text ('The mixed result remains plain in the room', 'the favorable hearing'), or are these ordinary words of the story ('a favorable wind', 'mixed feelings', 'the outcome of the vote')? Record yes or no, by code, in the stage's hand file, before the key is opened.",
    "",
  ];
  for (const caseId of [...new Set(turns.map((t) => t.caseId))].sort()) {
    const coded = turns
      .filter((t) => t.caseId === caseId)
      .flatMap((t) => t.sentences.map((s) => ({ s, code: wordsCodeOf(salt, t, s) })))
      .sort((a, b) => a.code.localeCompare(b.code));
    lines.push(`## ${caseId}`, "", purposes.get(caseId) ?? "", "");
    if (coded.length === 0) lines.push("No sentence holds such a word.", "");
    for (const { s, code } of coded) lines.push(`### ${code}`, "", `${s.slot}, ${s.where}: "${s.sentence.replace(/\s+/g, " ")}"`, "");
  }
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------- the readings

export type WordsVerdict = { code: string; slot: string; hand?: boolean; note?: string };
export type HandWordsTurn = WordsTurn & { verdicts: WordsVerdict[] };

/** The hand verdicts by code, unblinded through the key onto each turn's sentences; a sentence without one stays unread. */
export function withWordsHand(turns: WordsTurn[], key: WordsBlindKey, hand: Record<string, WordsHandEntry> = RESULT_WORDS_HAND): HandWordsTurn[] {
  return turns.map((t) => ({
    ...t,
    verdicts: t.sentences.map((s): WordsVerdict => {
      const code = wordsCodeOf(key.salt, t, s);
      const entry = key.items[code] ? hand[code] : undefined;
      return entry ? { code, slot: s.slot, hand: entry.hand, note: entry.note } : { code, slot: s.slot };
    }),
  }));
}

export type WordsComparison = { name: string; label: string; production: Tally; variant: Tally; noise?: number; move: RateMove };

/** Per turn: hits a count of items naming a result's kind, n the items read; undefined where the hand left a sentence unread. */
type Measure = { name: string; label: string; of: (t: HandWordsTurn) => Tally | undefined };

const handRead = (t: HandWordsTurn) => t.verdicts.every((v) => v.hand !== undefined);
const handSlots = (t: HandWordsTurn) => new Set(t.verdicts.filter((v) => v.hand === true).map((v) => v.slot));

const MEASURES: Measure[] = [
  { name: "turnsNoted", label: "Turns where some player's text names a result's kind (production's note)", of: (t) => ({ hits: t.noted.length > 0 ? 1 : 0, n: 1 }) },
  { name: "textsNoted", label: "Player texts that name a result's kind (production's note)", of: (t) => ({ hits: t.noted.length, n: t.slots.length }) },
  { name: "turnsHand", label: "Turns where some player's text tells the game's result label (by hand, blind)", of: (t) => (handRead(t) ? { hits: handSlots(t).size > 0 ? 1 : 0, n: 1 } : undefined) },
  { name: "textsHand", label: "Player texts that tell the game's result label (by hand, blind)", of: (t) => (handRead(t) ? { hits: handSlots(t).size, n: t.slots.length } : undefined) },
];

const pairOf = (t: Pick<WordsTurn, "caseId" | "sample">) => `${t.caseId}|${t.sample}`;
const sum = (tallies: (Tally | undefined)[]): Tally => tallies.reduce<Tally>((acc, t) => (t ? { hits: acc.hits + t.hits, n: acc.n + t.n } : acc), { hits: 0, n: 0 });
const rateOf = (t: Tally) => (t.n ? t.hits / t.n : undefined);

/** Each measure, the variant against production on the (case, sample) pairs both read; production's sample 1 against its sample 2 the noise. */
export function wordsComparisons(turns: HandWordsTurn[], arms: string[] = RESULT_WORDS_ARMS): WordsComparison[] {
  const [p, v] = arms;
  const kept = turns.filter((t) => t.kept);
  return MEASURES.map((m) => {
    const production = kept.filter((t) => t.armKey === p && m.of(t) !== undefined);
    const variant = kept.filter((t) => t.armKey === v && m.of(t) !== undefined);
    const both = new Set(production.map(pairOf).filter((pair) => variant.some((o) => pairOf(o) === pair)));
    const on = (list: HandWordsTurn[]) => sum(list.filter((t) => both.has(pairOf(t))).map(m.of));
    const [s1, s2] = [rateOf(sum(production.filter((t) => t.sample === 1).map(m.of))), rateOf(sum(production.filter((t) => t.sample === 2).map(m.of)))];
    const noise = s1 !== undefined && s2 !== undefined ? Math.abs(s1 - s2) : undefined;
    const [ref, arm] = [on(production), on(variant)];
    return { name: m.name, label: m.label, production: ref, variant: arm, ...(noise === undefined ? {} : { noise }), move: noise === undefined ? {} : rateMove(ref, arm, noise) };
  });
}

/** The reasoning tokens of the first reply, the variant against production: means, production's two samples the noise, two standard errors. */
function reasoningMove(turns: WordsTurn[], arms: string[] = RESULT_WORDS_ARMS): { production: number; variant: number; noise: number; move: MeanMove } {
  const [p, v] = arms;
  const of = (key: string, sample?: number) => momentsOf(turns.filter((t) => t.armKey === key && (sample === undefined || t.sample === sample)).map((t) => t.reasoningTokens));
  const noise = Math.abs(of(p, 1).mean - of(p, 2).mean);
  return { production: of(p).mean, variant: of(v).mean, noise, move: meanMove(of(p), of(v), noise) };
}

// ---------------------------------------------------------------- the modes

const runsByRound = (files: EvalFiles): RunsByRound => ({
  1: [],
  2: playthroughRunsFrom(files.readPlaythroughs("playthroughs-2")),
  3: playthroughRunsFrom(files.readPlaythroughs("playthroughs-3")),
});

/** The prompt hash each stored playthrough call sent, by its output file. */
const promptHashesOf = (files: EvalFiles) => {
  const byId = new Map(files.readPrepRecords().flatMap((r) => (r.outputFile && r.promptHash ? [[outputIdOf(r.outputFile), r.promptHash] as [string, string]] : [])));
  return (outputFile: string) => byId.get(outputIdOf(outputFile));
};

export function buildResultWordsCasesMode(ctx: Pick<PrepContext, "files" | "log">, replace: boolean): void {
  const { files, log } = ctx;
  if (!files.casesExist()) throw new Error("No frozen cases. Run --build-cases first.");
  const runs = runsByRound(files);
  if (runs[3].length === 0 || runs[2].length === 0) throw new Error("No stored second- or third-round playthroughs (playthroughs-2.json, playthroughs-3.json).");
  const { cases, problems, skipped } = resultWordsCasesToFreeze(files.readCases(), runs, promptHashesOf(files), replace);
  if (problems.length) throw new Error(problems.join("; "));
  if (skipped.length) log(`Already frozen, left as they are: ${skipped.join(", ")}.`);
  if (cases.length === 0) return log("Nothing new to freeze; no calls.");
  files.addCases(cases, undefined, replace);
  log(`Froze ${cases.map((c) => c.id).join(", ")} beside the other cases; no calls.`);
}

type StageRead = { records: CallRecord[]; cases: EvalCase[]; turns: CheckedTurn[]; read: WordsTurn[] };

/** Every finished turn job of the stage's arms under its tag on its cases, read by the reply the game keeps. */
async function stageRead(files: EvalFiles): Promise<StageRead> {
  const arms = new Set(RESULT_WORDS_ARMS);
  const records = files.readRecords().filter((r) => r.stage === STAGE && r.promptState === RESULT_WORDS_PROMPT_STATE && arms.has(r.armKey) && r.group === "beat" && STAGE_CASES.has(r.caseId));
  const cases = files.readCases();
  const byId = new Map(cases.map((c) => [c.id, c]));
  const storyOf = (id: string) => {
    const evalCase = byId.get(id);
    return evalCase?.state ? caseStory(evalCase) : undefined;
  };
  const turns = await checkedTurns(records, files.loadOutput, (id) => storyOf(id)?.getCurrentBeatType() === "ending");
  const read = turns.flatMap((t): WordsTurn[] => {
    const story = storyOf(t.caseId);
    if (!story) return [];
    const keptRecord = t.kept === 2 ? t.retry : t.kept === 1 ? t.first : undefined;
    const reply = keptRecord ? (files.loadOutput(keptRecord) as SetOfBeatGenerationSchema | undefined) : undefined;
    const base: TurnBase = {
      armKey: t.armKey,
      caseId: t.caseId,
      sample: t.sample,
      reasoningTokens: t.first.reasoningTokens,
      ...(t.retried ? { retried: t.retried } : {}),
      ...(keptRecord?.outputFile ? { outputId: outputIdOf(keptRecord.outputFile) } : {}),
    };
    return [wordsTurnReading(base, story, reply)];
  });
  return { records, cases, turns, read };
}

/** The blind key, written once with a fresh salt; the same salt ever after, so the codes stay put. */
function blindKeyOf(files: EvalFiles, turns: WordsTurn[]): WordsBlindKey {
  const held = files.readBlindKey(BLIND_FILE) as WordsBlindKey | undefined;
  const salt = held?.salt ?? sha256(`${Date.now()}|${Math.random()}`).slice(0, 16);
  const key = wordsBlindKey(turns, salt);
  files.writeBlindKey(BLIND_FILE, key);
  return key;
}

const PURPOSES = new Map(RESULT_WORDS_CASE_SPECS.map((s) => [s.id, s.purpose]));

export async function resultWordsBlindMode(ctx: Pick<PrepContext, "files" | "log">): Promise<void> {
  const { files, log } = ctx;
  const { read } = await stageRead(files);
  if (read.length === 0) throw new Error(`No turns of the stage's arms under ${RESULT_WORDS_PROMPT_STATE}. Run --run --stage result-words --role beat first.`);
  const key = blindKeyOf(files, read);
  const where = files.writeBlindReading(BLIND_FILE, renderWordsBlind(read, key.salt, PURPOSES));
  log(`${Object.keys(key.items).length} sentences in ${read.length} turns, coded. Wrote ${where}; the key is in keys/${BLIND_FILE}.json (read it only after the verdicts are in resultWordsHand.ts).`);
}

const pct = (n: number, d: number) => (d === 0 ? "–" : `${Math.round((100 * n) / d)}%`);
const tallyText = (t: Tally) => `${t.hits} of ${t.n} (${pct(t.hits, t.n)})`;
const usd = (x: number) => `$${x.toFixed(4)}`;
const pText = (p?: number) => (p === undefined ? "" : p < 0.001 ? " (p < 0.001)" : ` (p ${p.toFixed(3)})`);
const moveText = (c: { noise?: number; move: RateMove }) =>
  c.noise === undefined ? "no noise figure" : c.move.moved ? `moved ${c.move.moved}${pText(c.move.p)}` : c.move.beyondNoise ? `beyond the noise, not moved${pText(c.move.p)}` : "within the noise";
const meanText = (m: MeanMove) => (m.moved ? `moved ${m.moved}` : m.beyondNoise ? `beyond the noise, not moved (${(m.standardErrors ?? 0).toFixed(1)} SE)` : "within the noise");
const verdictText = (v: WordsVerdict | undefined) => (v?.hand === true ? "yes" : v?.hand === false ? "no" : "unread");

/** result-words.md and .json from what is recorded; no calls. */
export async function writeResultWords(ctx: Pick<PrepContext, "files" | "log">): Promise<void> {
  const { files, log } = ctx;
  const { records, cases, turns, read } = await stageRead(files);
  const key = files.readBlindKey(BLIND_FILE) as WordsBlindKey | undefined;
  const hand: HandWordsTurn[] = key ? withWordsHand(read, key) : read.map((t) => ({ ...t, verdicts: t.sentences.map((s) => ({ code: "uncoded", slot: s.slot })) }));
  const comparisons = wordsComparisons(hand);
  const reasoning = reasoningMove(read);
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
  const tallies: LineTally[] = lineTallies(turns, checks);
  const keptComparisons = variantComparisons(keptCalls, checks, tags, RESULT_WORDS_PROMPT_STATE);
  const spendUsd = files.readRecords().filter((r) => r.stage === STAGE).reduce((total, r) => total + r.costUsd, 0);
  const [p, v] = RESULT_WORDS_ARMS;
  const armName = (k: string) => (k === p ? "production" : k === v ? "resultWords" : k);
  const generatedAt = new Date().toISOString();
  const verdictOf = (t: HandWordsTurn, s: KindSentence) => t.verdicts.find((x) => x.slot === s.slot && x.code === (key ? wordsCodeOf(key.salt, t, s) : "uncoded"));
  const cell = (caseId: string, arm: string, sample: number) => {
    const t = hand.find((r) => r.caseId === caseId && r.armKey === arm && r.sample === sample);
    if (!t) return "–";
    if (!t.kept) return "fails";
    const noted = t.noted.map((n) => `${n.slot}: ${n.words.join(", ")}`).join("; ");
    const yes = t.verdicts.filter((x) => x.hand === true).length;
    return `${noted || "none noted"}; hand ${yes} of ${t.verdicts.length} sentences${t.retried ? " (retried)" : ""}`;
  };
  const lines = [
    "# Result words in the story text (the result-words stage)",
    "",
    `Generated ${generatedAt} from calls.jsonl (resultWordsPrep.ts). Production's group turn (${p}) and the variant (${v}) under ${RESULT_WORDS_PROMPT_STATE}, interleaved, twice on the group turns of rounds 2 and 3 whose text named a result's kind; each turn with production's one retry where its first reply is one short paragraph or has no options, read by the reply the game keeps. The variant reads against production on the (case, sample) pairs both read, production's sample 1 against its sample 2 as the noise, the stop rule on top. Production's note is the words the game logs (resultWordsOfBeat); the hand reading was blind (result-words-blind.md, the key opened after the verdicts). Spent in the stage so far: ${usd(spendUsd)}. Readings, not verdicts.`,
    "",
    "## Result words, lower is better",
    "",
    "| Reading | Production | resultWords | Noise | Reading |",
    "|---|---|---|---|---|",
    ...comparisons.map((c) => `| ${c.label} | ${tallyText(c.production)} | ${tallyText(c.variant)} | ${c.noise === undefined ? "–" : `${Math.round(100 * c.noise)} pts`} | ${moveText(c)} |`),
    "",
    `Sentences unread by hand: production ${hand.filter((t) => t.armKey === p).flatMap((t) => t.verdicts).filter((x) => x.hand === undefined).length}, resultWords ${hand.filter((t) => t.armKey === v).flatMap((t) => t.verdicts).filter((x) => x.hand === undefined).length}${key ? "" : " (no blind key yet: run --result-words-blind)"}.`,
    "",
    "## Reasoning, the retries, waits and cost",
    "",
    `Reasoning tokens a turn (first reply): production ${reasoning.production.toFixed(0)}, resultWords ${reasoning.variant.toFixed(0)}, noise ${reasoning.noise.toFixed(0)}, ${meanText(reasoning.move)}.`,
    "",
    "| Arm | Turns | First replies short | Retried (why) | Kept replies short | Turns that fail | Cost, first reply → with the retry |",
    "|---|---|---|---|---|---|---|",
    ...tallies.map(
      (t) =>
        `| ${armName(t.armKey)} | ${t.turns} | ${t.firstShort} of ${t.turns} | ${t.retried} of ${t.turns} (short ${t.retriedBy.short}, no options ${t.retriedBy.noOptions}, both ${t.retriedBy.both}) | ${t.keptShort} of ${t.turns} | ${t.failed} | ${usd(t.costPerTurn.first)} → ${usd(t.costPerTurn.kept)} |`
    ),
    "",
    "### Waits including the retry",
    ...renderTurnWaits(turnWaitReadings(keptCalls, kinds)),
    ...renderTurnWaitsBySample(turnWaitsBySample(keptCalls, kinds)),
    "",
    "### The first reply's wait alone",
    ...renderTurnWaits(turnWaitReadings(firstCalls, kinds)),
    "",
    "## Per turn (production's note per player; the hand's labels among the coded sentences)",
    "",
    `| Case | Sample | production | resultWords |`,
    "|---|---|---|---|",
    ...[...new Set(hand.map((t) => t.caseId))].sort().flatMap((c) => [1, 2].map((s) => `| ${c} | ${s} | ${cell(c, p, s)} | ${cell(c, v, s)} |`)),
    "",
    "## Every coded sentence",
    "",
    ...hand
      .slice()
      .sort((a, b) => a.caseId.localeCompare(b.caseId) || a.sample - b.sample || a.armKey.localeCompare(b.armKey))
      .flatMap((t) =>
        t.sentences.map((s) => {
          const verdict = verdictOf(t, s);
          return `- ${t.caseId} s${t.sample} ${armName(t.armKey)} ${s.slot} ${s.where} (${verdict?.code ?? "uncoded"}, ${verdictText(verdict)}${verdict?.note ? `: ${verdict.note}` : ""}): "${s.sentence.replace(/\s+/g, " ")}"`;
        })
      ),
    "",
    "## The automatic checks on the turns kept (each turn as one call: the reply kept, the whole wait and cost)",
    "",
    ...renderVariantComparison(keptComparisons),
  ];
  files.writeResultWords(`${lines.join("\n")}\n`, { generatedAt, promptState: RESULT_WORDS_PROMPT_STATE, arms: RESULT_WORDS_ARMS, turns: hand, comparisons, reasoning, tallies, spendUsd });
  const [turnsNoted, , turnsHand] = comparisons;
  log(`Turns noted: production ${tallyText(turnsNoted.production)}, resultWords ${tallyText(turnsNoted.variant)}, ${moveText(turnsNoted)}; by hand ${tallyText(turnsHand.production)} vs ${tallyText(turnsHand.variant)}, ${moveText(turnsHand)}. Stage so far ${usd(spendUsd)}. Wrote result-words.md and .json.`);
}
