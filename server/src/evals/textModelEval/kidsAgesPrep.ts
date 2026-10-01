import { kidsBandOf, type BeatGeneration, type KidAges, type KidsBand } from "core/types/index.js";
import { armKey, KIDS_AGES_PROMPT_STATE, type Stage } from "./arms.js";
import { caseStory, type EvalCase } from "./cases.js";
import { asCall, checkedTurns, type CheckedTurn } from "./checkedTurns.js";
import { lineTallies, type LineTally } from "./choiceLinePrep.js";
import { outputIdOf } from "./judgedChecks.js";
import { KIDS_BAND_LIMITS, meanWords, readabilityOf, readsForBand } from "./kidsReadability.js";
import { kidsArmReadings, type KidsArmReading, type KidsTurnReading, type TextMeasures } from "./kidsTurnPrep.js";
import { checksForRecords } from "./outputChecks.js";
import { renderVariantComparison } from "./resultsReport.js";
import type { CallRecord } from "./runner.js";
import { isPlayerBeat } from "../../game/services/storyTextSteps.js";
import type { PrepContext } from "./turnPrep.js";
import { renderTurnWaits, renderTurnWaitsBySample, turnKindOf, turnWaitReadings, turnWaitsBySample, type SampleWait, type TurnKind, type TurnWait } from "./turnWaits.js";
import { variantComparisons, type VariantComparison } from "./variantComparison.js";

/*
 * The kids-ages stage's report (2026-10-01, the owner's decision that a
 * read-with-kids story depends on the children's ages), kept out of run.ts:
 * --kids-ages, no calls. Each turn job of the stage (--run --stage kids-ages
 * --role beat --prompt-state adopted16, production's one checked retry in the
 * loop) is read whole (checkedTurns.ts): the reply the game keeps, every
 * player's text read for its length and plainness (kidsReadability.ts) against
 * the band of the case's youngest child (readsForBand, KIDS_BAND_LIMITS, set
 * before the run); a group's turn passes where every player's text does, its
 * measures the players' means. Per age and player count, and the groups' ages
 * pooled, the variant against production under the stop rule (kidsArmReadings:
 * a mean beyond production's two-sample difference and 2 standard errors, a
 * rate beyond it and Fisher p < 0.10). Beside them the retries, every automatic
 * check on the kept replies and on the setups (variantComparison.ts), the waits
 * including the retry, cost, and each setup's stats against its band's budget
 * (two visible shared stats, two visible player stats or three from 9, no
 * hidden ones, names of one or two words). Writes kids-ages.md and .json.
 */

const STAGE: Stage = "kids-ages";
const LUNA_MEDIUM = { model: "gpt-6-luna", reasoningEffort: "medium" } as const;
const LUNA_LOW = { model: "gpt-6-luna", reasoningEffort: "low" } as const;

/** The stage's arms: production's and the variant's, on each player count's turn model and the setup model. */
export const KIDS_AGES_ARMS = {
  single: [armKey(LUNA_MEDIUM, "adopted"), armKey(LUNA_MEDIUM, "kidsAges")],
  groups: [armKey(LUNA_LOW, "adopted"), armKey(LUNA_LOW, "kidsAges")],
  setups: [armKey(LUNA_LOW, "adopted"), armKey(LUNA_LOW, "kidsAges")],
};

const NUMERIC = ["words", "paragraphs", "sentences", "wordsPerSentence", "syllablesPerWord", "longWordShare", "grade", "optionWords", "interludeWords"] as const;

/** Every player's beat of a reply, read: its text, and its options' and interludes' mean words. */
export function playerMeasures(reply: unknown): TextMeasures[] {
  if (!reply || typeof reply !== "object") return [];
  return Object.entries(reply)
    .filter(([key]) => isPlayerBeat(key))
    .map(([, value]) => value as Partial<BeatGeneration>)
    .filter((beat) => typeof beat?.text === "string")
    .map((beat) => ({
      ...readabilityOf(beat.text as string),
      optionWords: meanWords((beat.options ?? []).map((o) => o.text)),
      interludeWords: meanWords((beat.interludes ?? []).map((i) => i.text)),
    }));
}

/** The players' means. */
function meanOf(list: TextMeasures[]): TextMeasures | undefined {
  if (list.length === 0) return undefined;
  return Object.fromEntries(NUMERIC.map((k) => [k, list.reduce((sum, m) => sum + m[k], 0) / list.length])) as TextMeasures;
}

/** A turn read for its band: the players' means, whether every player's text reads for the band, each player's. */
export type KidsAgesTurnReading = KidsTurnReading & { age: number; band: KidsBand; players: number; playerPasses?: boolean[] };

/** What a turn's case says: the youngest child's age and the players. */
export type KidsAgesCaseInfo = { age: number; players: number };

/** Every checked turn read by its first reply and its kept reply, against its case's band. */
export function kidsAgesTurnReadings(turns: CheckedTurn[], load: (record: CallRecord) => unknown, caseOf: (caseId: string) => KidsAgesCaseInfo | undefined): KidsAgesTurnReading[] {
  return turns.flatMap((t) => {
    const info = caseOf(t.caseId);
    if (!info) return [];
    const band = kidsBandOf({ min: info.age, max: info.age });
    const keptRecord = t.kept === 2 ? t.retry : t.kept === 1 ? t.first : undefined;
    const kept = keptRecord ? playerMeasures(load(keptRecord)) : [];
    const playerPasses = kept.map((p) => readsForBand(p, band));
    return [
      {
        armKey: t.armKey,
        caseId: t.caseId,
        sample: t.sample,
        ...(t.retried ? { retried: t.retried } : {}),
        first: meanOf(playerMeasures(load(t.first))),
        kept: meanOf(kept),
        passes: kept.length ? playerPasses.every(Boolean) : undefined,
        ...(kept.length ? { playerPasses } : {}),
        ...(keptRecord?.outputFile ? { outputId: outputIdOf(keptRecord.outputFile) } : {}),
        age: info.age,
        band,
        players: info.players,
      },
    ];
  });
}

/** One group of turns read together: an age and player count, or the groups' ages pooled. */
export type KidsAgesGroup = { label: string; players: "single" | "group"; age?: number; band?: KidsBand; arms: KidsArmReading[] };

const playersLabel = (single: boolean) => (single ? "One player" : "Two players");

/**
 * Per player count and age (a single player first, each by age), then the
 * groups' ages pooled where there are several: each with production's arm
 * first and the variant against it on the pairs both have.
 */
export function kidsAgesGroups(readings: KidsAgesTurnReading[]): KidsAgesGroup[] {
  const groups: KidsAgesGroup[] = [];
  for (const single of [true, false]) {
    const own = readings.filter((r) => (r.players === 1) === single);
    const reference = single ? KIDS_AGES_ARMS.single[0] : KIDS_AGES_ARMS.groups[0];
    const ages = [...new Set(own.map((r) => r.age))].sort((a, b) => a - b);
    for (const age of ages) {
      const band = own.find((r) => r.age === age)?.band;
      groups.push({ label: `${playersLabel(single)}, a child aged ${age} (${band})`, players: single ? "single" : "group", age, band, arms: kidsArmReadings(own.filter((r) => r.age === age), reference) });
    }
    if (!single && ages.length > 1) groups.push({ label: `${playersLabel(single)}, every age`, players: "group", arms: kidsArmReadings(own, reference) });
  }
  return groups;
}

/** A setup's stats against its band's budget. */
export type SetupStatsReading = {
  armKey: string;
  caseId: string;
  sample: number;
  age?: number;
  visibleShared: number;
  visiblePlayer: number;
  hidden: number;
  /** Stat names (each side of an opposites stat) longer than two words */
  longNames: number;
  names: string[];
  /** At most two visible shared stats, two visible player stats (three where the youngest child is 9 or older), no hidden ones */
  fitsBand: boolean;
  outputId?: string;
};

type LooseStat = { name?: unknown; isVisible?: unknown };
const asStats = (value: unknown): LooseStat[] => (Array.isArray(value) ? (value as LooseStat[]) : []);
const longest = (name: string) => Math.max(...name.split("|").map((side) => side.trim().split(/\s+/).filter(Boolean).length));

/** A setup reply's stats read against the band of the children's ages it was set up for. */
export function setupStatsOf(reply: unknown, kidAges: KidAges | undefined): Omit<SetupStatsReading, "armKey" | "caseId" | "sample" | "outputId"> {
  const r = (reply ?? {}) as { sharedStats?: unknown; playerStats?: unknown };
  const shared = asStats(r.sharedStats);
  const player = asStats(r.playerStats);
  const visible = (s: LooseStat) => s.isVisible !== false;
  const all = [...shared, ...player];
  const names = all.map((s) => String(s.name ?? ""));
  const budget = kidAges && kidsBandOf(kidAges) === "9-12" ? 3 : 2;
  const visibleShared = shared.filter(visible).length;
  const visiblePlayer = player.filter(visible).length;
  const hidden = all.filter((s) => !visible(s)).length;
  return {
    ...(kidAges ? { age: kidAges.min } : {}),
    visibleShared,
    visiblePlayer,
    hidden,
    longNames: names.filter((n) => longest(n) > 2).length,
    names,
    fitsBand: visibleShared <= 2 && visiblePlayer <= budget && hidden === 0,
  };
}

export type KidsAgesReport = {
  generatedAt: Date;
  tallies: LineTally[];
  groups: KidsAgesGroup[];
  turns: KidsAgesTurnReading[];
  keptComparisons: VariantComparison[];
  setupComparisons: VariantComparison[];
  setups: SetupStatsReading[];
  waits: { kept: TurnWait[]; keptBySample: SampleWait[]; first: TurnWait[] };
  spendUsd: number;
  problems: string[];
};

const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);
const pct = (x: number) => `${Math.round(100 * x)}%`;
const usd = (x: number) => `$${x.toFixed(4)}`;
const ofN = (t: { hits: number; n: number }) => `${t.hits} of ${t.n}`;
type Move = { moved?: string; beyondNoise?: string };
const moveText = (move: Move) => (move.moved ? `moved ${move.moved}` : move.beyondNoise ? "beyond the noise, not moved" : "within the noise");
type Measure = (typeof NUMERIC)[number];
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
const limitsText = (band?: KidsBand) => {
  if (!band) return "its band's limits";
  const l = KIDS_BAND_LIMITS[band];
  return `${l.minWords > 1 ? `${l.minWords} to ` : "at most "}${l.maxWords} words, at most ${l.wordsPerSentence} words a sentence, grade ${l.grade}`;
};

function groupRows(group: KidsAgesGroup): string[] {
  const arms = group.arms;
  const vs = arms[1]?.vsReference;
  return [
    `| Measure | ${arms.map((a) => a.armKey).join(" | ")} | Against production | Noise | Reading |`,
    `|---|${arms.map(() => "---|").join("")}---|---|---|`,
    `| Reads for the band (${limitsText(group.band)}; every player's text) | ${arms.map((a) => ofN(a.passes)).join(" | ")} | ${vs ? `${ofN(vs.passes.arm)} against ${ofN(vs.passes.reference)}` : "–"} | ${vs ? pct(vs.passes.noise) : "–"} | ${vs ? `${moveText(vs.passes.move)}${vs.passes.move.p !== undefined ? ` (p ${vs.passes.move.p.toFixed(3)})` : ""}` : "–"} |`,
    ...NUMERIC.map((measure) => {
      const reading = vs?.measures.find((x) => x.measure === measure);
      return `| ${MEASURE_LABELS[measure]} | ${arms.map((a) => measureText(measure, a.means[measure])).join(" | ")} | ${reading ? `${measureText(measure, reading.arm.mean)} against ${measureText(measure, reading.reference.mean)}` : "–"} | ${reading ? measureText(measure, reading.noise) : "–"} | ${reading ? moveText(reading.move) : "–"} |`;
    }),
  ];
}

/** kids-ages.md */
export function renderKidsAges(report: KidsAgesReport): string {
  const byCase = [...new Set(report.turns.map((t) => t.caseId))].sort();
  const arms = [...new Set(report.turns.map((t) => t.armKey))].sort();
  const cell = (caseId: string, arm: string, sample: number) => {
    const t = report.turns.find((r) => r.caseId === caseId && r.armKey === arm && r.sample === sample);
    if (!t) return "–";
    if (!t.kept) return "fails";
    return `${f1(t.kept.words)} w, ${f1(t.kept.paragraphs)} ¶, ${f1(t.kept.wordsPerSentence)} w/s, grade ${f1(t.kept.grade)}${t.retried ? " (retried)" : ""}${t.passes ? " ✓" : ""}`;
  };
  const lines = [
    "# Read-with-kids turns and setups by the children's age band (kids-ages)",
    "",
    `Generated ${report.generatedAt.toISOString()}. Production's turn and setup (adopted) and the variant (kidsAges) under ${KIDS_AGES_PROMPT_STATE}, interleaved; each turn with production's one retry where its first reply is one short paragraph or has no options (the variant's retry asks for its band's count). A turn is read by the reply the game keeps, every player's text counted against the band of the case's youngest child (kidsReadability.ts, readsForBand; deterministic, no judge); a group's measures are its players' means, and it reads for the band where every player's text does. Readings, not verdicts.`,
    "",
    "The bands' limits (set before the run): " + (["3-5", "6-8", "9-12"] as const).map((b) => `${b}: ${limitsText(b)}`).join("; ") + ".",
    "",
    "The variant against production on the (case, sample) pairs both have, under the stop rule: beyond production's two-sample difference, and a mean at 2 standard errors or a rate at a one-sided Fisher p < 0.10.",
    "",
    ...report.groups.flatMap((g) => [`## ${g.label}`, "", ...groupRows(g), ""]),
    "## Per turn (the reply kept: words, paragraphs, words per sentence, grade, the players' means; ✓ reads for the band)",
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
    "Each turn's wait is its first reply's plus the retry's. A chapter opening or switch turn is the turn alone (no planner ran in this stage).",
    ...renderTurnWaits(report.waits.kept),
    ...renderTurnWaitsBySample(report.waits.keptBySample),
    "",
    "### The first reply's wait alone",
    ...renderTurnWaits(report.waits.first),
    "",
    "## The automatic checks on the turns kept (each turn as one call: the reply kept, the whole wait and cost)",
    "",
    "`paragraphs` and `sentences` read production's 5-6 paragraphs of 3-5 sentences, which a kids turn leaves on purpose.",
    ...renderVariantComparison(report.keptComparisons),
    "",
    "## The setups (at most two visible shared stats, two visible player stats or three from age 9, no hidden ones)",
    "",
    "| Case | Arm | Visible shared | Visible player | Hidden | Names over two words | Fits the band | Stats |",
    "|---|---|---|---|---|---|---|---|",
    ...report.setups.map((s) => `| ${s.caseId} | ${s.armKey} | ${s.visibleShared} | ${s.visiblePlayer} | ${s.hidden} | ${s.longNames} | ${s.fitsBand ? "yes" : "no"} | ${s.names.join(", ")} |`),
    "",
    "### The automatic checks on the setups",
    ...renderVariantComparison(report.setupComparisons),
    "",
    "## Spend",
    "",
    `Turns and setups (both arms, every attempt, the retries included): ${usd(report.spendUsd)}. No judge calls.`,
    ...(report.problems.length ? ["", "## Problems", "", ...report.problems.map((p) => `- ${p}`)] : []),
  ];
  return `${lines.join("\n")}\n`;
}

/** A case's youngest child and players, from its story or its setup input. */
function caseInfo(evalCase: EvalCase | undefined): KidsAgesCaseInfo | undefined {
  if (!evalCase?.state) return undefined;
  const ages = caseStory(evalCase).getKidAges();
  return ages ? { age: ages.min, players: evalCase.tags.players } : undefined;
}

// --- --kids-ages ---

export async function kidsAgesMode(ctx: Pick<PrepContext, "files" | "log">): Promise<void> {
  const { files, log } = ctx;
  const armKeys = new Set([...KIDS_AGES_ARMS.single, ...KIDS_AGES_ARMS.groups, ...KIDS_AGES_ARMS.setups]);
  const records = files.readRecords().filter((r) => r.stage === STAGE && r.promptState === KIDS_AGES_PROMPT_STATE && armKeys.has(r.armKey));
  const beatRecords = records.filter((r) => r.group === "beat");
  const setupRecords = records.filter((r) => r.group === "setup");
  const cases = files.readCases();
  const byId = new Map(cases.map((c) => [c.id, c]));
  const turns = await checkedTurns(beatRecords, files.loadOutput, (id) => {
    const evalCase = byId.get(id);
    return evalCase?.state !== undefined && caseStory(evalCase).getCurrentBeatType() === "ending";
  });
  const readings = kidsAgesTurnReadings(turns, files.loadOutput, (id) => caseInfo(byId.get(id)));
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
  const setups = setupRecords
    .filter((r) => r.final && r.outcome === "valid")
    .map((r) => ({
      armKey: r.armKey,
      caseId: r.caseId,
      sample: r.sample,
      ...setupStatsOf(files.loadOutput(r), byId.get(r.caseId)?.setup?.kidAges),
      ...(r.outputFile ? { outputId: outputIdOf(r.outputFile) } : {}),
    }))
    .sort((a, b) => a.caseId.localeCompare(b.caseId) || a.armKey.localeCompare(b.armKey) || a.sample - b.sample);
  const report: KidsAgesReport = {
    generatedAt: new Date(),
    tallies: lineTallies(turns, checks),
    groups: kidsAgesGroups(readings),
    turns: readings,
    keptComparisons: variantComparisons(keptCalls, checks, tags, KIDS_AGES_PROMPT_STATE),
    setupComparisons: variantComparisons(setupRecords, checks, tags, KIDS_AGES_PROMPT_STATE),
    setups,
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
    groups: report.groups,
    setups,
    tallies: report.tallies,
    waits: report.waits,
    spendUsd: report.spendUsd,
  };
  files.writeKidsAges(renderKidsAges(report), json);
  for (const g of report.groups) {
    const vs = g.arms[1]?.vsReference;
    log(`${g.label}: ${g.arms.map((a) => `${a.armKey} reads for the band ${ofN(a.passes)}, words ${f1(a.means.words)}, grade ${f1(a.means.grade)}`).join("; ")}${vs ? `; passes ${moveText(vs.passes.move)}` : ""}`);
  }
  for (const s of setups) log(`  ${s.caseId} ${s.armKey}: ${s.visibleShared} shared, ${s.visiblePlayer} player, ${s.hidden} hidden; fits ${s.fitsBand}`);
  log(`Wrote kids-ages.md and .json (turns and setups $${report.spendUsd.toFixed(4)}; no calls).`);
}
