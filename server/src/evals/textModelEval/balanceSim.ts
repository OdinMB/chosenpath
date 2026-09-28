import type { Story } from "core/models/Story.js";
import type { Beat, ChallengeOption, SetOfBeatGenerationSchema } from "core/types/index.js";
import { BeatResolutionService } from "../../game/services/BeatResolutionService.js";
import { repairBeatReply } from "../../game/services/beatRepairs.js";
import { caseStory, type EvalCase } from "./cases.js";
import { usable, type CallRecord } from "./runner.js";

/*
 * B6's balance simulation (turn doc B6, "Before it ships"; free): the stored
 * challenge option sets of today's form scored with the game's own
 * resolution code (BeatResolutionService: the option's points with the first
 * two bonuses clamped to ±15, the step's momentum and the story's
 * difficulty), once as written and once on B6's scale: a strength option (a
 * normal option whose bonuses add up above zero) gets -10, the middle of B6's
 * -5 to -15, and a stat that gives a bonus to all three options (it fits the
 * whole step, not one approach) gives none. Readings of how the scale moves
 * the odds, before any turn is written on it.
 */

export type BalanceSet = { caseId: string; sample: number; story: Story; options: ChallengeOption[] };

const STRENGTH_BASE = -10;

const bonusSum = (o: ChallengeOption) => o.modifiersToSuccessRate.reduce((sum, m) => sum + m.effect, 0);
const isStrength = (o: ChallengeOption) => o.resourceType === "normal" && bonusSum(o) > 0;

/** B6's scale on one set: the whole step's stats give no bonus, then a strength option gets -10 (or keeps a lower base). */
export function b6Scale(options: ChallengeOption[]): ChallengeOption[] {
  const everywhere = new Set(
    options[0]?.modifiersToSuccessRate.map((m) => m.statId).filter((id) => options.every((o) => o.modifiersToSuccessRate.some((m) => m.statId === id))) ?? []
  );
  return options.map((o) => {
    const modifiersToSuccessRate = o.modifiersToSuccessRate.filter((m) => !everywhere.has(m.statId));
    const scaled = { ...o, modifiersToSuccessRate };
    return isStrength(scaled) ? { ...scaled, basePoints: Math.min(o.basePoints, STRENGTH_BASE) } : scaled;
  });
}

/** Each option's favorable chance (0-100), as the game would roll it for this player on this step. */
export function favorableChances(story: Story, options: ChallengeOption[]): number[] {
  const momentum = story.getCurrentThreadLastStepResolution("player1");
  const difficulty = story.getState().difficultyLevel ?? { title: "Balanced", modifier: 0 };
  return options.map((option, choice) => {
    const beat = { options, choice } as unknown as Beat;
    return BeatResolutionService.getChallengeBeatResolution(beat, momentum, difficulty, story).details.distribution.favorable;
  });
}

export type Scenario = {
  name: "today" | "B6 scale";
  /** Mean favorable chance over every option, and per kind of option */
  all: number;
  sensible?: number;
  strength?: number;
  lever?: number;
  /** Sets whose three options have the same favorable chance, or within 5 points */
  sameOdds: number;
  within5: number;
  /** Sets where a strength option has the best chance outright */
  strengthBest: number;
  /** Mean of the best minus the worst chance in a set */
  spread: number;
};

export type BalanceReport = { sets: number; strengthOptions: number; scenarios: [Scenario, Scenario] };

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined);

function scenario(name: Scenario["name"], sets: BalanceSet[], transform: (options: ChallengeOption[]) => ChallengeOption[]): Scenario {
  const rows = sets.map((set) => {
    const options = transform(set.options);
    // The option's kind is read from what the model wrote, so both scenarios compare the same options
    const kinds = set.options.map((o) => (o.resourceType !== "normal" ? "lever" : isStrength(o) ? "strength" : "sensible"));
    return { chances: favorableChances(set.story, options), kinds };
  });
  const byKind = (kind: string) => mean(rows.flatMap((r) => r.chances.filter((_, i) => r.kinds[i] === kind)));
  const spreadOf = (chances: number[]) => Math.max(...chances) - Math.min(...chances);
  return {
    name,
    all: mean(rows.flatMap((r) => r.chances)) ?? 0,
    sensible: byKind("sensible"),
    strength: byKind("strength"),
    lever: byKind("lever"),
    sameOdds: rows.filter((r) => spreadOf(r.chances) === 0).length,
    within5: rows.filter((r) => spreadOf(r.chances) <= 5).length,
    strengthBest: rows.filter((r) => {
      const best = Math.max(...r.chances);
      const leaders = r.chances.map((c, i) => ({ c, i })).filter(({ c }) => c === best);
      return leaders.length === 1 && r.kinds[leaders[0].i] === "strength";
    }).length,
    spread: mean(rows.map((r) => spreadOf(r.chances))) ?? 0,
  };
}

export function balanceSimulation(sets: BalanceSet[]): BalanceReport {
  return {
    sets: sets.length,
    strengthOptions: sets.flatMap((s) => s.options).filter(isStrength).length,
    scenarios: [scenario("today", sets, (o) => o), scenario("B6 scale", sets, b6Scale)],
  };
}

/** The stored challenge sets of these arms (usable final beat records, chapter steps with three challenge options), as the game kept them. */
export function storedChallengeSets(records: CallRecord[], cases: EvalCase[], load: (r: CallRecord) => unknown, armKeys: string[], promptState: string): BalanceSet[] {
  const byId = new Map(cases.map((c) => [c.id, c]));
  return records.flatMap((r): BalanceSet[] => {
    const evalCase = byId.get(r.caseId);
    if (r.group !== "beat" || !r.final || !usable(r) || r.promptState !== promptState || !armKeys.includes(r.armKey) || !evalCase?.state || evalCase.tags.multiplayer) return [];
    const story = caseStory(evalCase);
    if (story.getCurrentBeatType() !== "thread") return [];
    const { reply } = repairBeatReply(story, load(r) as SetOfBeatGenerationSchema);
    const options = (reply.player1?.options ?? []) as ChallengeOption[];
    if (options.length !== 3 || !options.every((o) => o.optionType === "challenge")) return [];
    return [{ caseId: r.caseId, sample: r.sample, story, options }];
  });
}

const pct = (x?: number) => (x === undefined ? "–" : `${x.toFixed(1)}%`);
const share = (n: number, of: number) => `${n} of ${of} (${of ? Math.round((100 * n) / of) : 0}%)`;

export function renderBalanceSim(report: BalanceReport, generatedAt: Date, source = ""): string {
  const [today, scaled] = report.scenarios;
  const row = (label: string, pick: (s: Scenario) => string) => `| ${label} | ${pick(today)} | ${pick(scaled)} |`;
  return [
    "# B6 balance simulation",
    "",
    `Generated ${generatedAt.toISOString()}${source ? ` from ${source}` : ""}. ${report.sets} challenge option sets as the game kept them, ${report.strengthOptions} strength options among them (a normal option whose bonuses add up above zero). Each option's favorable chance comes from the game's own resolution code (its points with the first two bonuses clamped to ±15, the step's momentum, the story's difficulty). B6's scale: a strength option gets -10 base points (the middle of -5 to -15, or keeps a lower base), and a stat that gives a bonus to all three options gives none. The option kinds are read from the options as written, so both columns score the same options.`,
    "",
    "| Reading | Today's points | B6's scale |",
    "|---|---|---|",
    row("Favorable chance, every option", (s) => pct(s.all)),
    row("Favorable chance, sensible options", (s) => pct(s.sensible)),
    row("Favorable chance, strength options", (s) => pct(s.strength)),
    row("Favorable chance, sacrifice and reward options", (s) => pct(s.lever)),
    row("Sets whose three options have the same chance", (s) => share(s.sameOdds, report.sets)),
    row("Sets within 5 points", (s) => share(s.within5, report.sets)),
    row("Sets where a strength option has the best chance outright", (s) => share(s.strengthBest, report.sets)),
    row("Mean spread in a set (best minus worst chance)", (s) => `${s.spread.toFixed(1)} points`),
    "",
  ].join("\n");
}
