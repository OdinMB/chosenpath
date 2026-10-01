import type { Story } from "core/models/Story.js";
import { POINTS_FOR_REWARD, POINTS_FOR_SACRIFICE } from "core/config.js";
import type { BeatOption, ChallengeOption, SetOfBeatGenerationSchema } from "core/types/index.js";
import { repairBeatReply } from "../../game/services/beatRepairs.js";
import { allowsLever, leverStatOf, leverStatsOf, type Lever } from "../../game/services/leverPayments.js";
import { groupLeverLine, groupLeverSlots } from "../../game/services/optionRules.js";
import { groupOptionsRule } from "../../game/services/storyTextRounds/groupOptions.js";
import { chapterLevers } from "../../game/services/storyTextRounds/turnOptionsContinuity.js";
import { armKey, GROUP_OPTIONS_PROMPT_STATE, type Stage } from "./arms.js";
import { favorableChances } from "./balanceSim.js";
import { caseStory, type EvalCase } from "./cases.js";
import { asCall, checkedTurns, type CheckedTurn } from "./checkedTurns.js";
import { lineTallies, type LineTally } from "./choiceLinePrep.js";
import { groupOptionsCasesToFreeze } from "./groupOptionsCases.js";
import { outputIdOf } from "./judgedChecks.js";
import type { Leader } from "./optionsO2cPrep.js";
import { checksForRecords } from "./outputChecks.js";
import { playthroughRunsFrom } from "./playthroughMode.js";
import type { PlayRun } from "./playthroughs.js";
import { renderVariantComparison } from "./resultsReport.js";
import type { CallRecord } from "./runner.js";
import { meanMove, momentsOf, rateMove, type MeanMove, type Moments, type RateMove, type Tally } from "./stopRule.js";
import { optionSetVariety, statesReason, type SetVariety } from "./turnDesignChecks.js";
import type { PrepContext } from "./turnPrep.js";
import { renderTurnWaits, renderTurnWaitsBySample, turnKindOf, turnWaitReadings, turnWaitsBySample, type SampleWait, type TurnKind, type TurnWait } from "./turnWaits.js";
import { variantComparisons, type VariantComparison } from "./variantComparison.js";

/*
 * The group-options stage's CLI modes (decision A, the evening of 2026-10-01),
 * kept out of run.ts:
 * - --build-group-options-cases: the stage's cases from the third round's
 *   stored runs (groupOptionsCases.ts), each only where its request is the one
 *   production sent there, frozen beside the others (those already frozen left
 *   as they are, unless --rebuild-cases); no calls;
 * - --group-options: the stage's report, no calls. Each turn job of the stage
 *   (--run --stage group-options --role beat --prompt-state adopted23,
 *   production's one checked retry in the loop) is read whole (checkedTurns.ts),
 *   by the reply the game keeps, after the beat repairs. Per player in a
 *   challenge or contest thread (groupLeverSlots), one set: the owner's rules
 *   for that player (groupOptionsRule: the reward turn the game places, a
 *   sacrifice that fits, a second only for a strong reason, none, or none
 *   because the step discards the player's roll) and B6's rate line production
 *   gives that player (groupLeverLine: one fits, preferring a kind, or none);
 *   the sacrifice or reward the set carries and its stat as the game reads it
 *   (leverStatOf); a second sacrifice in the chapter and whether its text
 *   states a reason (statesReason, a heuristic); the owner's variety on the set
 *   (optionSetVariety: main stats distinct, O2's rule with a lever left out, two
 *   options only risk tells apart); and the odds the game would roll for that
 *   player (balanceSim.ts's favorableChances), which kind of option leads
 *   outright. Per arm, against production on the (case, sample) pairs both
 *   have, under the stop rule (stopRule.ts: beyond production's two-sample
 *   difference and a one-sided Fisher p < 0.10; reasoning tokens and the mean
 *   favorable chance as means, two standard errors). Beside them every lever's
 *   text for the hand read, the retries, the automatic checks on the kept
 *   replies (variantComparison.ts), the waits including the retry, and cost.
 *   Writes group-options.md and .json. Readings, not verdicts.
 */

const STAGE: Stage = "group-options";
const PLAYTHROUGHS_3 = "playthroughs-3";
const LUNA_LOW = { model: "gpt-6-luna", reasoningEffort: "low" } as const;

/** The stage's arms: production's group turn, then the variant, on the group turn model. */
export const GROUP_OPTIONS_ARMS = [armKey(LUNA_LOW, "adopted"), armKey(LUNA_LOW, "groupOptions")];

/** One rolled player's kept set. */
export type GroupSetReading = {
  slot: string;
  /** The owner's rules for this player (groupOptionsRule) */
  rule: "reward" | "fits" | "strongReason" | "none" | "ownersRoll";
  /** B6's rate line, production's line for this player (groupLeverLine), and the kind it prefers after an earlier lever */
  rate: "fits" | "none";
  prefers?: Lever;
  lever?: Lever;
  leverText?: string;
  /** The lever's stat as the game reads it; absent where none reads */
  stat?: { id: string; name: string; shared: boolean; allows: boolean };
  /** A sacrifice where this player's chapter already offered one, and one whose text states no reason (heuristic) */
  secondSacrifice: boolean;
  unreasoned: boolean;
  /** A sacrifice or reward written as a normal option at its points (±30): the game counts them and charges nothing */
  leverAsNormal: boolean;
  /** The owner's variety on a set of three challenge options */
  variety?: SetVariety;
  /** Each option's favorable chance as the game would roll it for this player, and which kind leads outright */
  chances?: number[];
  leader?: Leader;
  options: number;
};

export type GroupOptionsTurn = {
  armKey: string;
  caseId: string;
  sample: number;
  retried?: string;
  kept: boolean;
  sets: GroupSetReading[];
  /** Shared levers the beat repairs dropped from a later player's set */
  sharedDropped: number;
  /** The first reply's reasoning tokens */
  reasoningTokens?: number;
  outputId?: string;
};

const bonusOf = (o: ChallengeOption) => (o.modifiersToSuccessRate ?? []).reduce((sum, m) => sum + (m?.effect ?? 0), 0);
const kindOf = (o: ChallengeOption): Exclude<Leader, "tie"> => (o.resourceType !== "normal" ? "lever" : bonusOf(o) > 0 ? (o.basePoints < 0 ? "tempting" : "bonus") : "bare");

/** A group turn's rolled players read from the reply as the game keeps it. */
export function groupOptionsTurnReading(story: Story, written: SetOfBeatGenerationSchema): Pick<GroupOptionsTurn, "sets" | "sharedDropped"> {
  const { reply, repairs } = repairBeatReply(story, written);
  const stats = leverStatsOf(story);
  const sets = groupLeverSlots(story).map((slot): GroupSetReading => {
    const ruleOf = groupOptionsRule(story, slot);
    const rule: GroupSetReading["rule"] = ruleOf.ownersRoll ? "ownersRoll" : ruleOf.reward ? "reward" : ruleOf.sacrifice;
    const line = groupLeverLine(story, slot);
    const prefers = /prefer a (sacrifice|reward)\)/.exec(line)?.[1] as Lever | undefined;
    const beat = (reply as unknown as Record<string, { options?: BeatOption[] } | undefined>)[slot];
    const options = (Array.isArray(beat?.options) ? beat.options : []).filter((o) => o && typeof o === "object");
    const leverOption = options.find((o) => o.resourceType === "sacrifice" || o.resourceType === "reward");
    const lever = leverOption?.resourceType as Lever | undefined;
    const text = typeof leverOption?.text === "string" ? leverOption.text : "";
    const leverStat = lever ? leverStatOf(story, slot, lever, text, stats) : undefined;
    const secondSacrifice = lever === "sacrifice" && chapterLevers(story, slot).sacrifices > 0;
    const variety = optionSetVariety(options);
    const chances = variety ? favorableChances(story, options as ChallengeOption[], slot) : undefined;
    const best = chances ? Math.max(...chances) : undefined;
    const leaders = chances ? chances.flatMap((c, i) => (c === best ? [i] : [])) : [];
    return {
      slot,
      rule,
      rate: line.endsWith("none this turn.") ? "none" : "fits",
      ...(prefers ? { prefers } : {}),
      ...(lever ? { lever, leverText: text } : {}),
      ...(lever && leverStat ? { stat: { id: leverStat.stat.id, name: leverStat.stat.name, shared: leverStat.shared, allows: allowsLever(leverStat.stat, lever) } } : {}),
      secondSacrifice,
      unreasoned: secondSacrifice && !statesReason(text),
      leverAsNormal: options.some((o) => o.optionType === "challenge" && o.resourceType === "normal" && (o.basePoints === POINTS_FOR_SACRIFICE || o.basePoints === POINTS_FOR_REWARD)),
      ...(variety ? { variety } : {}),
      ...(chances ? { chances, leader: leaders.length === 1 ? kindOf(options[leaders[0]] as ChallengeOption) : ("tie" as const) } : {}),
      options: options.length,
    };
  });
  return { sets, sharedDropped: repairs.filter((r) => r.kind === "sharedLeverRepeated").length };
}

type Measure = { name: string; label: string; of: (s: GroupSetReading) => boolean | undefined };

const NONE_RULES: GroupSetReading["rule"][] = ["none", "ownersRoll"];

/** The readings per rolled set; undefined leaves a set out of the measure's count. */
const MEASURES: Measure[] = [
  { name: "rewardOffRewardTurn", label: "Rewards off the reward turn (the owner's rules: none; a chapter's later step, or the chapter after one with a reward)", of: (s) => (s.rule !== "reward" ? s.lever === "reward" : undefined) },
  { name: "rewardOnRewardTurn", label: "Rewards on the reward turn (its uptake)", of: (s) => (s.rule === "reward" ? s.lever === "reward" : undefined) },
  { name: "sacrificeOnRewardTurn", label: "Sacrifices on the reward turn (the owner's rules: none)", of: (s) => (s.rule === "reward" ? s.lever === "sacrifice" : undefined) },
  { name: "sacrificeWhereFits", label: "Sacrifices where one fits and no reward (its uptake)", of: (s) => (s.rule === "fits" ? s.lever === "sacrifice" : undefined) },
  { name: "leverWhereNone", label: "Levers where the rules give none (B6's rate, the owner's roll)", of: (s) => (NONE_RULES.includes(s.rule) ? s.lever !== undefined : undefined) },
  { name: "secondSacrificeSets", label: "Second sacrifices in a chapter", of: (s) => s.secondSacrifice },
  { name: "unreasonedSecond", label: "… whose text states no reason (heuristic)", of: (s) => s.unreasoned },
  { name: "rewardSets", label: "Sets with a reward", of: (s) => s.lever === "reward" },
  { name: "sacrificeSets", label: "Sets with a sacrifice", of: (s) => s.lever === "sacrifice" },
  { name: "leverSets", label: "Sets with a sacrifice or reward", of: (s) => s.lever !== undefined },
  { name: "ownLeverSets", label: "Sets with a lever on the player's own stat", of: (s) => s.lever !== undefined && s.stat?.shared === false },
  { name: "leverStatAllows", label: "Levers whose stat allows that lever (of levers)", of: (s) => (s.lever ? s.stat?.allows === true : undefined) },
  { name: "leverAsNormal", label: "Sets with a lever written as a normal option at ±30 (counted, never charged)", of: (s) => s.leverAsNormal },
  { name: "statsDistinct", label: "Main stats distinct, at most one option without (the owner's variety)", of: (s) => s.variety?.statsDistinct },
  { name: "leverApart", label: "Main stats distinct, a lever left out of the count (O2's rule)", of: (s) => s.variety?.leverApart },
  { name: "onlyRisk", label: "Sets where two options only risk tells apart", of: (s) => s.variety?.onlyRisk },
  { name: "strengthBest", label: "A bonus option has the best odds outright", of: (s) => (s.leader ? s.leader === "tempting" || s.leader === "bonus" : undefined) },
  { name: "temptingBest", label: "… the tempting one (negative base and a bonus)", of: (s) => (s.leader ? s.leader === "tempting" : undefined) },
  { name: "leverBest", label: "A sacrifice or reward has the best odds outright", of: (s) => (s.leader ? s.leader === "lever" : undefined) },
  { name: "setsShort", label: "Sets left with fewer than three options", of: (s) => s.options < 3 },
];

export type MeasureReading = { name: string; label: string; arm: Tally; reference: Tally; noise: number; move: RateMove };
export type MeanReading = { arm: Moments; reference: Moments; noise: number; move: MeanMove };

export type GroupOptionsArm = {
  armKey: string;
  turns: number;
  sets: number;
  tallies: Record<string, Tally>;
  /** Turns where the repairs dropped a shared lever's later copy */
  sharedDropTurns: Tally;
  /** Against production, on the (case, sample) pairs both have */
  measures: MeasureReading[];
  reasoning: MeanReading;
  favorable: MeanReading;
};

const pairKey = (r: Pick<GroupOptionsTurn, "caseId" | "sample">) => `${r.caseId}|${r.sample}`;
const setsOf = (turns: GroupOptionsTurn[]) => turns.flatMap((t) => t.sets);
const tally = (sets: GroupSetReading[], measure: Measure): Tally => {
  const values = sets.map(measure.of).filter((v): v is boolean => v !== undefined);
  return { hits: values.filter(Boolean).length, n: values.length };
};
const rate = (t: Tally) => (t.n ? t.hits / t.n : 0);
const meanChance = (s: GroupSetReading) => (s.chances?.length ? s.chances.reduce((a, b) => a + b, 0) / s.chances.length : undefined);
const numbers = (values: (number | undefined)[]) => values.filter((v): v is number => v !== undefined);

/** Per arm, production first; the variant against production on the pairs both have, its noise production's sample 1 against its sample 2. */
export function groupOptionsArmReadings(readings: GroupOptionsTurn[], reference = GROUP_OPTIONS_ARMS[0]): GroupOptionsArm[] {
  const kept = readings.filter((r) => r.kept);
  const arms = [...new Set(kept.map((r) => r.armKey))].sort((a, b) => (a === reference ? -1 : b === reference ? 1 : a.localeCompare(b)));
  const own = (key: string) => kept.filter((r) => r.armKey === key);
  const refTurns = own(reference);
  const [s1, s2] = [refTurns.filter((r) => r.sample === 1), refTurns.filter((r) => r.sample === 2)];
  return arms.map((key): GroupOptionsArm => {
    const mine = own(key);
    const shared = new Set(mine.map(pairKey).filter((k) => refTurns.some((r) => pairKey(r) === k)));
    const onShared = (list: GroupOptionsTurn[]) => list.filter((r) => shared.has(pairKey(r)));
    const meanReading = (of: (turns: GroupOptionsTurn[]) => number[]): MeanReading => {
      const noise = Math.abs(momentsOf(of(s1)).mean - momentsOf(of(s2)).mean);
      const [r, a] = [momentsOf(of(onShared(refTurns))), momentsOf(of(onShared(mine)))];
      return { arm: a, reference: r, noise, move: meanMove(r, a, noise) };
    };
    const reasoningOf = (turns: GroupOptionsTurn[]) => numbers(turns.map((t) => t.reasoningTokens));
    const chanceOf = (turns: GroupOptionsTurn[]) => numbers(setsOf(turns).map(meanChance));
    return {
      armKey: key,
      turns: mine.length,
      sets: setsOf(mine).length,
      tallies: Object.fromEntries(MEASURES.map((m) => [m.name, tally(setsOf(mine), m)])),
      sharedDropTurns: { hits: mine.filter((r) => r.sharedDropped > 0).length, n: mine.length },
      measures:
        key === reference
          ? []
          : MEASURES.map((m) => {
              const noise = Math.abs(rate(tally(setsOf(s1), m)) - rate(tally(setsOf(s2), m)));
              const [ref, arm] = [tally(setsOf(onShared(refTurns)), m), tally(setsOf(onShared(mine)), m)];
              return { name: m.name, label: m.label, arm, reference: ref, noise, move: rateMove(ref, arm, noise) };
            }),
      reasoning: meanReading(reasoningOf),
      favorable: meanReading(chanceOf),
    };
  });
}

/** One lever as the hand read takes it: where, whose, the rules there, its text and stat. */
export type GroupLeverLine = { armKey: string; caseId: string; sample: number; slot: string; rule: string; rate: string; lever: Lever; second: boolean; stat?: string; shared?: boolean; allows?: boolean; text: string };

export type GroupOptionsReport = {
  generatedAt: Date;
  tallies: LineTally[];
  arms: GroupOptionsArm[];
  turns: GroupOptionsTurn[];
  levers: GroupLeverLine[];
  keptComparisons: VariantComparison[];
  waits: { kept: TurnWait[]; keptBySample: SampleWait[]; first: TurnWait[] };
  spendUsd: number;
  problems: string[];
};

const pct = (x: number) => `${Math.round(100 * x)}%`;
const usd = (x: number) => `$${x.toFixed(4)}`;
const ofN = (t: Tally) => `${t.hits} of ${t.n}`;
const moveText = (move: RateMove | MeanMove) => {
  const detail = "p" in move && move.p !== undefined ? ` (p ${move.p.toFixed(3)})` : "standardErrors" in move && move.standardErrors !== undefined ? ` (${move.standardErrors === Infinity ? "no spread" : `${move.standardErrors.toFixed(1)} SE`})` : "";
  return move.moved ? `moved ${move.moved}${detail}` : move.beyondNoise ? `beyond the noise, not moved${detail}` : "within the noise";
};
const rateText = (s: GroupSetReading) => (s.rate === "none" ? "none" : s.prefers ? `fits, prefer ${s.prefers}` : "fits");

const setText = (s: GroupSetReading) => {
  const lever = s.lever ? `${s.lever === "sacrifice" ? "S" : "R"} ${s.stat ? `${s.stat.name} (${s.stat.shared ? "shared" : "own"}${s.stat.allows ? "" : ", not allowed"})` : "(stat unread)"}` : "–";
  const variety = s.variety ? `${s.variety.statsDistinct ? ", distinct" : ""}${s.variety.onlyRisk ? ", only risk" : ""}` : "";
  return `${s.slot} [${s.rule}; B6 ${rateText(s)}]: ${lever}${s.secondSacrifice ? " (second)" : ""}${variety}${s.leader ? `, ${s.leader} leads` : ""}${s.options < 3 ? ` (${s.options} options)` : ""}`;
};

/** group-options.md */
export function renderGroupOptions(report: GroupOptionsReport): string {
  const [reference, ...candidates] = report.arms;
  const byCase = [...new Set(report.turns.map((t) => t.caseId))].sort();
  const armKeys = report.arms.map((a) => a.armKey);
  const cell = (caseId: string, arm: string, sample: number) => {
    const t = report.turns.find((r) => r.caseId === caseId && r.armKey === arm && r.sample === sample);
    if (!t) return "–";
    if (!t.kept) return "fails";
    return `${t.sets.map(setText).join("; ")}${t.sharedDropped ? ` (shared copy dropped ×${t.sharedDropped})` : ""}${t.retried ? " (retried)" : ""}`;
  };
  const rows = (candidate: GroupOptionsArm) => [
    `| Reading | ${report.arms.map((a) => a.armKey).join(" | ")} | ${candidate.armKey} against ${reference.armKey} | Noise | Reading |`,
    `|---|${report.arms.map(() => "---|").join("")}---|---|---|`,
    ...MEASURES.map((m) => {
      const vs = candidate.measures.find((x) => x.name === m.name);
      return `| ${m.label} | ${report.arms.map((a) => `${ofN(a.tallies[m.name])} (${pct(rate(a.tallies[m.name]))})`).join(" | ")} | ${vs ? `${ofN(vs.arm)} against ${ofN(vs.reference)}` : "–"} | ${vs ? pct(vs.noise) : "–"} | ${vs ? moveText(vs.move) : "–"} |`;
    }),
    `| Reasoning tokens a turn, mean (first reply) | ${report.arms.map((a) => Math.round(a.reasoning.arm.mean)).join(" | ")} | ${Math.round(candidate.reasoning.arm.mean)} against ${Math.round(candidate.reasoning.reference.mean)} | ${Math.round(candidate.reasoning.noise)} | ${moveText(candidate.reasoning.move)} |`,
    `| Favorable chance, mean over a set's options | ${report.arms.map((a) => `${a.favorable.arm.mean.toFixed(1)}%`).join(" | ")} | ${candidate.favorable.arm.mean.toFixed(1)}% against ${candidate.favorable.reference.mean.toFixed(1)}% | ${candidate.favorable.noise.toFixed(1)} | ${moveText(candidate.favorable.move)} |`,
    `| Turns where a shared lever's later copy was dropped | ${report.arms.map((a) => ofN(a.sharedDropTurns)).join(" | ")} | – | – | – |`,
  ];
  const lines = [
    "# The owner's option rules for group turns (group-options)",
    "",
    `Generated ${report.generatedAt.toISOString()}. Production's group turn (adopted) and the variant (groupOptions) under ${GROUP_OPTIONS_PROMPT_STATE}, interleaved, twice on group chapter steps of the third playthroughs; each turn with production's one retry where its first reply is one short paragraph or has no options. A turn is read by the reply the game keeps, after the beat repairs. Each player in a challenge or contest thread is one set, read against the owner's rules for that player (the reward turn: a chapter's first step, where the player's previous chapter offered no reward and a stat allows one; elsewhere a sacrifice that fits and no reward, a second only for a strong reason, or none; none where the step discards the player's roll) and B6's rate line production gives them. Odds as the game would roll them for that player (balanceSim.ts). Readings, not verdicts.`,
    "",
    "The variant against production on the (case, sample) pairs both have, under the stop rule: beyond production's two-sample difference, and a one-sided Fisher p < 0.10 (means: two standard errors).",
    "",
    ...candidates.flatMap((c) => [`### ${c.armKey} against ${reference.armKey} (production)`, "", ...rows(c), ""]),
    `Sets per arm: ${report.arms.map((a) => `${a.armKey} ${a.sets} sets in ${a.turns} turns`).join("; ")}.`,
    "",
    "## Per turn (each rolled player's kept set: [the owner's rules; B6's rate], S sacrifice, R reward, the stat as the game reads it, the variety, which kind of option leads the odds)",
    "",
    `| Case | Sample | ${armKeys.join(" | ")} |`,
    `|---|---|${armKeys.map(() => "---|").join("")}`,
    ...byCase.flatMap((c) => [1, 2].map((s) => `| ${c} | ${s} | ${armKeys.map((a) => cell(c, a, s)).join(" | ")} |`)),
    "",
    "## Every sacrifice and reward offered (for the hand read)",
    "",
    "| Arm | Case | Sample | Player | Owner's rules | B6's rate | Kind | Second | Stat | Text |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...report.levers.map(
      (l) =>
        `| ${l.armKey} | ${l.caseId} | ${l.sample} | ${l.slot} | ${l.rule} | ${l.rate} | ${l.lever} | ${l.second ? "yes" : "–"} | ${l.stat ? `${l.stat} (${l.shared ? "shared" : "own"}${l.allows ? "" : ", not allowed"})` : "unread"} | ${l.text.replace(/\|/g, "/")} |`
    ),
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

// --- --build-group-options-cases ---

const runsOf = (ctx: Pick<PrepContext, "files">): PlayRun[] => playthroughRunsFrom(ctx.files.readPlaythroughs(PLAYTHROUGHS_3));

/** The prompt hash each stored playthrough call sent, by its output file. */
const promptHashesOf = (ctx: Pick<PrepContext, "files">) => {
  const byId = new Map(ctx.files.readPrepRecords().flatMap((r) => (r.outputFile && r.promptHash ? [[outputIdOf(r.outputFile), r.promptHash] as [string, string]] : [])));
  return (outputFile: string) => byId.get(outputIdOf(outputFile));
};

export function buildGroupOptionsCasesMode(ctx: Pick<PrepContext, "files" | "log">, replace: boolean): void {
  const { files, log } = ctx;
  if (!files.casesExist()) throw new Error("No frozen cases. Run --build-cases first.");
  const runs = runsOf(ctx);
  if (runs.length === 0) throw new Error("No stored third-round playthroughs (playthroughs-3.json). Run --playthroughs --round 3 first.");
  const { cases, problems, skipped } = groupOptionsCasesToFreeze(files.readCases(), runs, promptHashesOf(ctx), replace);
  if (problems.length) throw new Error(problems.join("; "));
  if (skipped.length) log(`Already frozen, left as they are: ${skipped.join(", ")}.`);
  if (cases.length === 0) return log("Nothing new to freeze; no calls.");
  files.addCases(cases, undefined, replace);
  log(`Froze ${cases.map((c) => c.id).join(", ")} beside the other cases; no calls.`);
}

// --- --group-options ---

/** Every checked turn read per rolled player, by the reply the game keeps. */
export function groupOptionsTurnReadings(turns: CheckedTurn[], load: (record: CallRecord) => unknown, storyOf: (caseId: string) => Story | undefined): GroupOptionsTurn[] {
  return turns.flatMap((t): GroupOptionsTurn[] => {
    const story = storyOf(t.caseId);
    if (!story) return [];
    const keptRecord = t.kept === 2 ? t.retry : t.kept === 1 ? t.first : undefined;
    const reply = keptRecord ? (load(keptRecord) as SetOfBeatGenerationSchema | undefined) : undefined;
    const base = { armKey: t.armKey, caseId: t.caseId, sample: t.sample, reasoningTokens: t.first.reasoningTokens, ...(t.retried ? { retried: t.retried } : {}) };
    if (!reply) return [{ ...base, kept: false, sets: [], sharedDropped: 0 }];
    return [{ ...base, kept: true, ...groupOptionsTurnReading(story, reply), ...(keptRecord?.outputFile ? { outputId: outputIdOf(keptRecord.outputFile) } : {}) }];
  });
}

export async function groupOptionsMode(ctx: Pick<PrepContext, "files" | "log">): Promise<void> {
  const { files, log } = ctx;
  const armKeys = new Set(GROUP_OPTIONS_ARMS);
  const records = files.readRecords().filter((r) => r.stage === STAGE && r.promptState === GROUP_OPTIONS_PROMPT_STATE && armKeys.has(r.armKey) && r.group === "beat");
  const cases = files.readCases();
  const byId = new Map(cases.map((c) => [c.id, c]));
  const storyOf = (id: string) => {
    const evalCase: EvalCase | undefined = byId.get(id);
    return evalCase?.state ? caseStory(evalCase) : undefined;
  };
  const turns = await checkedTurns(records, files.loadOutput, (id) => storyOf(id)?.getCurrentBeatType() === "ending");
  const readings = groupOptionsTurnReadings(turns, files.loadOutput, storyOf);
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
  const levers: GroupLeverLine[] = readings
    .flatMap((r) =>
      r.sets.flatMap((s): GroupLeverLine[] =>
        s.lever
          ? [
              {
                armKey: r.armKey,
                caseId: r.caseId,
                sample: r.sample,
                slot: s.slot,
                rule: s.rule,
                rate: rateText(s),
                lever: s.lever,
                second: s.secondSacrifice,
                ...(s.stat ? { stat: s.stat.name, shared: s.stat.shared, allows: s.stat.allows } : {}),
                text: s.leverText ?? "",
              },
            ]
          : []
      )
    )
    .sort((a, b) => a.armKey.localeCompare(b.armKey) || a.caseId.localeCompare(b.caseId) || a.sample - b.sample || a.slot.localeCompare(b.slot));
  const report: GroupOptionsReport = {
    generatedAt: new Date(),
    tallies: lineTallies(turns, checks),
    arms: groupOptionsArmReadings(readings),
    turns: readings,
    levers,
    keptComparisons: variantComparisons(keptCalls, checks, tags, GROUP_OPTIONS_PROMPT_STATE),
    waits: { kept: turnWaitReadings(keptCalls, kinds), keptBySample: turnWaitsBySample(keptCalls, kinds), first: turnWaitReadings(firstCalls, kinds) },
    spendUsd: records.reduce((sum, r) => sum + r.costUsd, 0),
    problems: readings.filter((r) => !r.kept).map((r) => `${r.armKey} ${r.caseId} s${r.sample}: no reply the game keeps`),
  };
  files.writeGroupOptions(renderGroupOptions(report), {
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
    arms: report.arms,
    levers,
    tallies: report.tallies,
    waits: report.waits,
    spendUsd: report.spendUsd,
  });
  for (const arm of report.arms) {
    const t = (name: string) => ofN(arm.tallies[name]);
    log(`${arm.armKey}: ${arm.sets} sets in ${arm.turns} turns; rewards ${t("rewardSets")} (off the reward turn ${t("rewardOffRewardTurn")}), sacrifices ${t("sacrificeSets")}, distinct ${t("statsDistinct")}, only risk ${t("onlyRisk")}`);
    for (const m of arm.measures) log(`  ${m.label}: ${ofN(m.arm)} against ${ofN(m.reference)}, ${moveText(m.move)}`);
    if (arm.measures.length) {
      log(`  reasoning tokens ${Math.round(arm.reasoning.arm.mean)} against ${Math.round(arm.reasoning.reference.mean)}, ${moveText(arm.reasoning.move)}`);
      log(`  favorable chance ${arm.favorable.arm.mean.toFixed(1)}% against ${arm.favorable.reference.mean.toFixed(1)}%, ${moveText(arm.favorable.move)}`);
    }
  }
  log(`Wrote group-options.md and .json (turns $${report.spendUsd.toFixed(4)}; no calls).`);
}
