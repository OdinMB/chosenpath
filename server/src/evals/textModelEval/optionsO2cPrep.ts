import type { Story } from "core/models/Story.js";
import type { ChallengeOption, SetOfBeatGenerationSchema } from "core/types/index.js";
import { repairBeatReply } from "../../game/services/beatRepairs.js";
import type { Lever } from "../../game/services/leverPayments.js";
import { sacrificeRewardLine } from "../../game/services/optionRules.js";
import { o2cLeverRule } from "../../game/services/storyTextRounds/optionsO2c.js";
import { armKey, OPTIONS_O2_PROMPT_STATE, OPTIONS_O2C_PROMPT_STATE, type Stage } from "./arms.js";
import { favorableChances } from "./balanceSim.js";
import { caseStory, type EvalCase } from "./cases.js";
import { outputIdOf } from "./judgedChecks.js";
import { checksForRecords } from "./outputChecks.js";
import { renderVariantComparison } from "./resultsReport.js";
import { usable, type CallRecord } from "./runner.js";
import { meanMove, momentsOf, rateMove, type MeanMove, type Moments, type RateMove, type Tally } from "./stopRule.js";
import { checkBeatDesign } from "./turnDesignChecks.js";
import type { PrepContext } from "./turnPrep.js";
import { renderTurnWaits, renderTurnWaitsBySample, turnKindOf, turnWaitReadings, turnWaitsBySample, type SampleWait, type TurnKind, type TurnWait } from "./turnWaits.js";
import { variantComparisons, type VariantComparison } from "./variantComparison.js";

/*
 * The options-o2c stage's report (--options-o2c, 2026-10-01; no calls). The
 * stage (--run --stage options-o2c --role beat --prompt-state adopted20) sends
 * production's single-player turn and O2c twice on the 32 stored rolled chapter
 * steps, first tries as O2 and O2b ran. Each first reply's option set is read
 * as the game keeps it (the beat repairs): the line O2c's rule gives that state
 * (o2cLeverRule: the reward turn the game places, a sacrifice that fits, a
 * second only for a strong reason, or none), the sacrifice or reward the set
 * carries, the owner's variety checks (turnDesignChecks.ts: main stats
 * distinct, O2's rule with a lever left out of the count, two options only
 * risk tells apart), a second sacrifice in the chapter and one whose text
 * states no reason, and the odds the game would roll (balanceSim.ts's
 * favorableChances): which kind of option leads outright, a lever, a bonus
 * option with a negative base (B6's tempting one), a bonus option at base 0 or
 * more, or a bare one. The balance simulation's "strength option best" counts
 * either bonus kind, so under stat variety it counts the sensible option too;
 * the tempting option leading is read apart. O2c against production on the
 * (case, sample) pairs both have, and against O2b's stored replies (adopted3,
 * one sample) on its first sample, under the stop rule (stopRule.ts: beyond
 * production's two-sample difference and a one-sided Fisher p < 0.10; reasoning
 * tokens and the mean favorable chance as means). Beside them the per-case sets
 * and every lever's text for the hand read, the automatic checks, the waits
 * and cost. Writes options-o2c.md and .json. Readings, not verdicts.
 */

const STAGE: Stage = "options-o2c";
const LUNA_MEDIUM = { model: "gpt-6-luna", reasoningEffort: "medium" } as const;

/** The stage's arms: production's single-player turn, then O2c. */
export const OPTIONS_O2C_ARMS = [armKey(LUNA_MEDIUM, "adopted"), armKey(LUNA_MEDIUM, "turnO2c")];
/** O2b, whose stored replies (options-o2, adopted3, one sample on the same 32 steps) are O2c's second reference. */
export const O2B_KEY = armKey(LUNA_MEDIUM, "turnO2b");

/** The kind of option that leads the odds outright: a lever, a bonus option with a negative base (tempting), one at base 0 or more (bonus), a bare one, or a tie. */
export type Leader = "lever" | "tempting" | "bonus" | "bare" | "tie";

export type SetReading = {
  armKey: string;
  promptState: string;
  caseId: string;
  sample: number;
  /** The line O2c's rule gives the state: the reward turn, a sacrifice that fits, a second only for a strong reason, or none */
  line: "reward" | "fits" | "strongReason" | "none";
  /** Whether B6's rate (production's line) allows a lever here */
  todayFits: boolean;
  options: number;
  lever?: Lever;
  leverText?: string;
  secondSacrifice: boolean;
  unreasoned: boolean;
  /** The owner's variety readings, on a set of three challenge options */
  statsDistinct?: boolean;
  leverApart?: boolean;
  onlyRisk?: boolean;
  /** Each option's favorable chance as the game would roll it, and which kind leads outright */
  chances?: number[];
  leader?: Leader;
  reasoningTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
  outputId?: string;
};

const bonusOf = (o: ChallengeOption) => (o.modifiersToSuccessRate ?? []).reduce((sum, m) => sum + (m?.effect ?? 0), 0);
const kindOf = (o: ChallengeOption): Exclude<Leader, "tie"> => (o.resourceType !== "normal" ? "lever" : bonusOf(o) > 0 ? (o.basePoints < 0 ? "tempting" : "bonus") : "bare");

/** One option set as the game keeps it, on the state it was written for. */
export function setReading(story: Story, written: SetOfBeatGenerationSchema): Omit<SetReading, "armKey" | "promptState" | "caseId" | "sample" | "reasoningTokens" | "outputTokens" | "latencyMs" | "costUsd" | "outputId"> {
  const { reply } = repairBeatReply(story, written);
  const rule = o2cLeverRule(story, "player1");
  const line: SetReading["line"] = rule.reward ? "reward" : rule.sacrifice;
  const options = (reply.player1?.options ?? []) as ChallengeOption[];
  const leverOption = options.find((o) => o?.resourceType === "sacrifice" || o?.resourceType === "reward");
  const { checks, counts } = checkBeatDesign(story, reply, written);
  const challengeSet = options.length === 3 && options.every((o) => o?.optionType === "challenge");
  const chances = challengeSet ? favorableChances(story, options) : undefined;
  const best = chances ? Math.max(...chances) : undefined;
  const leaders = chances ? chances.flatMap((c, i) => (c === best ? [i] : [])) : [];
  return {
    line,
    todayFits: sacrificeRewardLine(story, "player1") !== "Sacrifice or reward: none this turn.",
    options: options.length,
    ...(leverOption ? { lever: leverOption.resourceType as Lever, leverText: String(leverOption.text ?? "") } : {}),
    secondSacrifice: (counts.secondSacrificeSets ?? 0) > 0,
    unreasoned: (counts.unreasonedSecondSacrifices ?? 0) > 0,
    ...(challengeSet ? { statsDistinct: checks.primaryStatsDistinct === true, leverApart: checks.mainStatsDistinctLeverApart === true, onlyRisk: (counts.sameStatsOnlyRiskSets ?? 0) > 0 } : {}),
    ...(chances ? { chances, leader: leaders.length === 1 ? kindOf(options[leaders[0]]) : ("tie" as const) } : {}),
  };
}

type Measure = { name: string; label: string; of: (s: SetReading) => boolean | undefined };

/** The readings per option set; undefined leaves a set out of the measure's count. */
const MEASURES: Measure[] = [
  { name: "rewardSets", label: "Sets with a reward (target about 4-6 per 32)", of: (s) => s.lever === "reward" },
  { name: "rewardOnRewardTurn", label: "… on the reward turn O2c's rule places (its uptake)", of: (s) => (s.line === "reward" ? s.lever === "reward" : undefined) },
  { name: "rewardOffRewardTurn", label: "… anywhere else (O2c: should be none)", of: (s) => (s.line !== "reward" ? s.lever === "reward" : undefined) },
  { name: "sacrificeSets", label: "Sets with a sacrifice", of: (s) => s.lever === "sacrifice" },
  { name: "sacrificeWhereNone", label: "… where O2c's line gives none (the reward turn, or today's rate none)", of: (s) => (s.line === "none" || s.line === "reward" ? s.lever === "sacrifice" : undefined) },
  { name: "leverSets", label: "Sets with a sacrifice or reward", of: (s) => s.lever !== undefined },
  { name: "secondSacrificeSets", label: "Sets with a second or later sacrifice in the chapter", of: (s) => s.secondSacrifice },
  { name: "unreasonedSecond", label: "… whose text states no reason (heuristic)", of: (s) => s.unreasoned },
  { name: "statsDistinct", label: "Main stats distinct, at most one option without (the owner's variety)", of: (s) => s.statsDistinct },
  { name: "leverApart", label: "Main stats distinct, a lever left out of the count (O2's rule)", of: (s) => s.leverApart },
  { name: "onlyRisk", label: "Sets where two options only risk tells apart", of: (s) => s.onlyRisk },
  { name: "strengthBest", label: "A bonus option has the best odds outright (the balance simulation's 'strength option')", of: (s) => (s.leader ? s.leader === "tempting" || s.leader === "bonus" : undefined) },
  { name: "temptingBest", label: "… the tempting one (negative base and a bonus, B6's second way)", of: (s) => (s.leader ? s.leader === "tempting" : undefined) },
  { name: "leverBest", label: "A sacrifice or reward has the best odds outright", of: (s) => (s.leader ? s.leader === "lever" : undefined) },
  { name: "threeOptions", label: "Sets of three options", of: (s) => s.options === 3 },
];

export type MeasureReading = { name: string; label: string; arm: Tally; reference: Tally; noise: number; move: RateMove };
export type MeanReading = { arm: Moments; reference: Moments; noise: number; move: MeanMove };
export type SetComparison = { reference: string; arm: string; pairs: number; measures: MeasureReading[]; reasoning: MeanReading; favorable: MeanReading };

const pairKey = (s: Pick<SetReading, "caseId" | "sample">) => `${s.caseId}|${s.sample}`;
const tally = (sets: SetReading[], measure: Measure): Tally => {
  const values = sets.map(measure.of).filter((v): v is boolean => v !== undefined);
  return { hits: values.filter(Boolean).length, n: values.length };
};
const rate = (t: Tally) => (t.n ? t.hits / t.n : 0);
const meanChance = (s: SetReading) => (s.chances?.length ? s.chances.reduce((a, b) => a + b, 0) / s.chances.length : undefined);
const values = (sets: SetReading[], of: (s: SetReading) => number | undefined) => sets.map(of).filter((v): v is number => v !== undefined);

/**
 * A candidate's sets against a reference's on the (case, sample) pairs both
 * have; the noise is production's own two samples (`noise`, its sets of both).
 */
export function compareSets(reference: SetReading[], candidate: SetReading[], noise: SetReading[]): SetComparison {
  const shared = new Set(candidate.map(pairKey).filter((k) => reference.some((r) => pairKey(r) === k)));
  const [ref, arm] = [reference.filter((r) => shared.has(pairKey(r))), candidate.filter((r) => shared.has(pairKey(r)))];
  const [s1, s2] = [noise.filter((r) => r.sample === 1), noise.filter((r) => r.sample === 2)];
  const meanReading = (of: (s: SetReading) => number | undefined): MeanReading => {
    const noiseOf = Math.abs(momentsOf(values(s1, of)).mean - momentsOf(values(s2, of)).mean);
    const [r, a] = [momentsOf(values(ref, of)), momentsOf(values(arm, of))];
    return { arm: a, reference: r, noise: noiseOf, move: meanMove(r, a, noiseOf) };
  };
  return {
    reference: reference[0]?.armKey ?? "",
    arm: candidate[0]?.armKey ?? "",
    pairs: shared.size,
    measures: MEASURES.map((m) => {
      const n = Math.abs(rate(tally(s1, m)) - rate(tally(s2, m)));
      const [r, a] = [tally(ref, m), tally(arm, m)];
      return { name: m.name, label: m.label, arm: a, reference: r, noise: n, move: rateMove(r, a, n) };
    }),
    reasoning: meanReading((s) => s.reasoningTokens),
    favorable: meanReading(meanChance),
  };
}

export type OptionsO2cReport = {
  generatedAt: Date;
  sets: SetReading[];
  againstProduction: SetComparison;
  /** O2c's first sample against O2b's stored one */
  againstO2b?: SetComparison;
  keptComparisons: VariantComparison[];
  waits: { kept: TurnWait[]; bySample: SampleWait[] };
  spendUsd: number;
  problems: string[];
};

const pct = (x: number) => `${Math.round(100 * x)}%`;
const ofN = (t: Tally) => `${t.hits} of ${t.n}`;
const usd = (x: number) => `$${x.toFixed(4)}`;
const moveText = (move: RateMove | MeanMove) => {
  const detail = "p" in move && move.p !== undefined ? ` (p ${move.p.toFixed(3)})` : "standardErrors" in move && move.standardErrors !== undefined ? ` (${move.standardErrors === Infinity ? "no spread" : `${move.standardErrors.toFixed(1)} SE`})` : "";
  return move.moved ? `moved ${move.moved}${detail}` : move.beyondNoise ? `beyond the noise, not moved${detail}` : "within the noise";
};
const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

function comparisonRows(c: SetComparison): string[] {
  return [
    `| Reading | ${c.reference} | ${c.arm} | Noise | Reading |`,
    "|---|---|---|---|---|",
    ...c.measures.map((m) => `| ${m.label} | ${ofN(m.reference)} (${pct(rate(m.reference))}) | ${ofN(m.arm)} (${pct(rate(m.arm))}) | ${pct(m.noise)} | ${moveText(m.move)} |`),
    `| Reasoning tokens, mean | ${Math.round(c.reasoning.reference.mean)} | ${Math.round(c.reasoning.arm.mean)} | ${Math.round(c.reasoning.noise)} | ${moveText(c.reasoning.move)} |`,
    `| Favorable chance, mean over a set's options | ${c.favorable.reference.mean.toFixed(1)}% | ${c.favorable.arm.mean.toFixed(1)}% | ${c.favorable.noise.toFixed(1)} | ${moveText(c.favorable.move)} |`,
  ];
}

const setCell = (s: SetReading | undefined) => {
  if (!s) return "–";
  const lever = s.lever === "reward" ? "R" : s.lever === "sacrifice" ? "S" : "–";
  return `${lever}${s.leader ? `, ${s.leader} leads` : ""}${s.statsDistinct ? ", distinct" : ""}${s.options !== 3 ? `, ${s.options} options` : ""}`;
};

/** options-o2c.md */
export function renderOptionsO2c(report: OptionsO2cReport): string {
  const [production, o2c] = OPTIONS_O2C_ARMS;
  const ours = report.sets.filter((s) => s.promptState === OPTIONS_O2C_PROMPT_STATE);
  const cases = [...new Set(ours.map((s) => s.caseId))].sort();
  const find = (arm: string, caseId: string, sample: number) => ours.find((s) => s.armKey === arm && s.caseId === caseId && s.sample === sample);
  const arms = [...new Set(report.sets.map((s) => `${s.armKey} (${s.promptState})`))];
  const levers = report.sets.filter((s) => s.lever).sort((a, b) => a.armKey.localeCompare(b.armKey) || a.caseId.localeCompare(b.caseId) || a.sample - b.sample);
  const perArm = arms.map((label) => {
    const sets = report.sets.filter((s) => `${s.armKey} (${s.promptState})` === label);
    const reasoning = sets.map((s) => s.reasoningTokens);
    return `| ${label} | ${sets.length} | ${sets.filter((s) => s.lever === "reward").length} | ${sets.filter((s) => s.lever === "sacrifice").length} | ${median(reasoning)} | ${(sets.reduce((a, s) => a + s.latencyMs, 0) / Math.max(1, sets.length) / 1000).toFixed(1)} s | ${usd(sets.reduce((a, s) => a + s.costUsd, 0) / Math.max(1, sets.length))} |`;
  });
  const lines = [
    "# Option variety with fewer rewards (options-o2c)",
    "",
    `Generated ${report.generatedAt.toISOString()}. Production's single-player turn (adopted) and O2c (turnO2c) under ${OPTIONS_O2C_PROMPT_STATE}, twice on the 32 stored rolled chapter steps, interleaved, first tries; O2b's stored replies (turnO2b under ${OPTIONS_O2_PROMPT_STATE}, one sample) beside them. Each set is read as the game keeps it, after the beat repairs, against the line O2c's rule gives its state: the reward turn the game places (a chapter's first step, where the player's previous chapter offered no reward and a stat allows one), a sacrifice that fits (B6's rate), a second only for a strong reason, or none. Odds as the game would roll them (balanceSim.ts); the option that leads outright is a lever, a bonus option with a negative base (tempting, B6's second way), a bonus option at base 0 or more, or a bare one. Readings, not verdicts.`,
    "",
    "Each candidate against its reference on the (case, sample) pairs both have, under the stop rule: beyond production's two-sample difference, and a one-sided Fisher p < 0.10 (means: two standard errors).",
    "",
    `### ${o2c} against ${production} (production, ${report.againstProduction.pairs} pairs)`,
    "",
    ...comparisonRows(report.againstProduction),
    "",
    ...(report.againstO2b ? [`### ${o2c} against ${O2B_KEY} (O2b's stored first sample, ${report.againstO2b.pairs} pairs; noise production's two samples)`, "", ...comparisonRows(report.againstO2b), ""] : []),
    "## Per arm",
    "",
    "| Arm | Sets | Rewards | Sacrifices | Reasoning tokens, median | Wait, mean | Cost a turn |",
    "|---|---|---|---|---|---|---|",
    ...perArm,
    "",
    "## Per case (R reward, S sacrifice; which kind leads the odds; main stats distinct)",
    "",
    `| Case | O2c's line | Today's rate | ${production} s1 | s2 | ${o2c} s1 | s2 |`,
    "|---|---|---|---|---|---|---|",
    ...cases.map((c) => {
      const any = find(o2c, c, 1) ?? find(production, c, 1) ?? ours.find((s) => s.caseId === c);
      return `| ${c} | ${any?.line ?? "–"} | ${any?.todayFits ? "fits" : "none"} | ${setCell(find(production, c, 1))} | ${setCell(find(production, c, 2))} | ${setCell(find(o2c, c, 1))} | ${setCell(find(o2c, c, 2))} |`;
    }),
    "",
    "## Every sacrifice and reward offered (for the hand read)",
    "",
    "| Arm | Prompt state | Case | Sample | O2c's line | Kind | Second in the chapter | Text |",
    "|---|---|---|---|---|---|---|---|",
    ...levers.map((s) => `| ${s.armKey} | ${s.promptState} | ${s.caseId} | ${s.sample} | ${s.line} | ${s.lever} | ${s.secondSacrifice ? "yes" : "–"} | ${(s.leverText ?? "").replace(/\|/g, "/")} |`),
    "",
    "## Waits (turn alone; a chapter opening waits for its planner too, not run here)",
    ...renderTurnWaits(report.waits.kept),
    ...renderTurnWaitsBySample(report.waits.bySample),
    "",
    "## The automatic checks (each arm against its reference)",
    "",
    ...renderVariantComparison(report.keptComparisons),
    "",
    "## Spend",
    "",
    `Turns (both arms, every attempt): ${usd(report.spendUsd)}. The judged checks book to the stage apart (--judge-records).`,
    ...(report.problems.length ? ["", "## Problems", "", ...report.problems.map((p) => `- ${p}`)] : []),
  ];
  return `${lines.join("\n")}\n`;
}

// --- --options-o2c ---

/** Every final usable first reply of these arms in this prompt state, read as a set. */
function readSets(records: CallRecord[], arms: string[], promptState: string, storyOf: (id: string) => Story | undefined, load: (r: CallRecord) => unknown, problems: string[]): SetReading[] {
  return records.flatMap((r): SetReading[] => {
    if (r.group !== "beat" || r.role !== "beat" || r.step !== 1 || !r.final || r.promptState !== promptState || !arms.includes(r.armKey)) return [];
    const story = storyOf(r.caseId);
    const written = usable(r) ? (load(r) as SetOfBeatGenerationSchema | undefined) : undefined;
    if (!story || !written?.player1) {
      problems.push(`${r.armKey} ${r.caseId} s${r.sample}: no usable reply (${r.outcome})`);
      return [];
    }
    return [
      {
        armKey: r.armKey,
        promptState: r.promptState,
        caseId: r.caseId,
        sample: r.sample,
        ...setReading(story, written),
        reasoningTokens: r.reasoningTokens,
        outputTokens: r.outputTokens,
        latencyMs: r.latencyMs,
        costUsd: r.costUsd,
        ...(r.outputFile ? { outputId: outputIdOf(r.outputFile) } : {}),
      },
    ];
  });
}

export function optionsO2cMode(ctx: Pick<PrepContext, "files" | "log">): void {
  const { files, log } = ctx;
  const all = files.readRecords();
  const records = all.filter((r) => r.stage === STAGE && r.promptState === OPTIONS_O2C_PROMPT_STATE && OPTIONS_O2C_ARMS.includes(r.armKey) && r.group === "beat");
  const cases = files.readCases();
  const byId = new Map(cases.map((c) => [c.id, c]));
  const storyOf = (id: string) => {
    const evalCase: EvalCase | undefined = byId.get(id);
    return evalCase?.state ? caseStory(evalCase) : undefined;
  };
  const problems: string[] = [];
  const ours = readSets(records, OPTIONS_O2C_ARMS, OPTIONS_O2C_PROMPT_STATE, storyOf, files.loadOutput, problems);
  const caseIds = new Set(ours.map((s) => s.caseId));
  const o2b = readSets(
    all.filter((r) => r.stage === "options-o2" && caseIds.has(r.caseId)),
    [O2B_KEY],
    OPTIONS_O2_PROMPT_STATE,
    storyOf,
    files.loadOutput,
    problems
  );
  const [production, o2c] = OPTIONS_O2C_ARMS.map((key) => ours.filter((s) => s.armKey === key));
  const finals = records.filter((r) => r.final && r.step === 1);
  const { checks } = checksForRecords(finals, cases, files.loadOutput, files.loadReplyContent, files.loadPrompt);
  const tags = new Map(cases.map((c) => [c.id, c.tags]));
  const kinds = new Map(
    cases.flatMap((c): [string, TurnKind][] => {
      const kind = turnKindOf(c);
      return kind ? [[c.id, kind]] : [];
    })
  );
  const report: OptionsO2cReport = {
    generatedAt: new Date(),
    sets: [...ours, ...o2b],
    againstProduction: compareSets(production, o2c, production),
    ...(o2b.length ? { againstO2b: compareSets(o2b, o2c.filter((s) => s.sample === 1), production) } : {}),
    keptComparisons: variantComparisons(finals, checks, tags, OPTIONS_O2C_PROMPT_STATE),
    waits: { kept: turnWaitReadings(records, kinds), bySample: turnWaitsBySample(records, kinds) },
    spendUsd: records.reduce((sum, r) => sum + r.costUsd, 0),
    problems,
  };
  files.writeOptionsO2c(renderOptionsO2c(report), {
    generatedAt: report.generatedAt.toISOString(),
    sets: report.sets,
    againstProduction: report.againstProduction,
    againstO2b: report.againstO2b,
    waits: report.waits,
    spendUsd: report.spendUsd,
    problems,
  });
  for (const comparison of [report.againstProduction, report.againstO2b]) {
    if (!comparison) continue;
    log(`${comparison.arm} against ${comparison.reference} (${comparison.pairs} pairs):`);
    for (const m of comparison.measures) log(`  ${m.label}: ${ofN(m.arm)} against ${ofN(m.reference)}, ${moveText(m.move)}`);
    log(`  reasoning tokens ${Math.round(comparison.reasoning.arm.mean)} against ${Math.round(comparison.reasoning.reference.mean)}, ${moveText(comparison.reasoning.move)}`);
  }
  log(`Wrote options-o2c.md and .json (turns $${report.spendUsd.toFixed(4)}; no calls).`);
}
