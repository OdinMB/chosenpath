import type { Story } from "core/models/Story.js";
import type { SetOfBeatGenerationSchema } from "core/types/index.js";
import { repairBeatReply } from "../../game/services/beatRepairs.js";
import { allowsLever, leverStatOf, leverStatsOf, type Lever } from "../../game/services/leverPayments.js";
import { sacrificeRewardLine } from "../../game/services/optionRules.js";
import { groupLeverSlots } from "../../game/services/storyTextRounds/groupLevers.js";
import { armKey, GROUP_LEVERS_PROMPT_STATE, type Stage } from "./arms.js";
import { caseStory, type EvalCase } from "./cases.js";
import { asCall, checkedTurns, type CheckedTurn } from "./checkedTurns.js";
import { lineTallies, type LineTally } from "./choiceLinePrep.js";
import { groupLeversCasesToFreeze } from "./groupLeversCases.js";
import { outputIdOf } from "./judgedChecks.js";
import { checksForRecords } from "./outputChecks.js";
import { playthroughRunsFrom } from "./playthroughMode.js";
import type { PlayRun } from "./playthroughs.js";
import { renderVariantComparison } from "./resultsReport.js";
import type { CallRecord } from "./runner.js";
import { rateMove, type RateMove, type Tally } from "./stopRule.js";
import type { PrepContext } from "./turnPrep.js";
import { renderTurnWaits, renderTurnWaitsBySample, turnKindOf, turnWaitReadings, turnWaitsBySample, type SampleWait, type TurnKind, type TurnWait } from "./turnWaits.js";
import { variantComparisons, type VariantComparison } from "./variantComparison.js";

/*
 * The group-levers stage's CLI modes (2026-10-01, the coordinator's brief
 * after the second playthroughs' review), kept out of run.ts:
 * - --build-group-lever-cases: the stage's cases from the second round's
 *   stored runs (groupLeversCases.ts), each only where its request is the one
 *   production sent there, frozen beside the others (those already frozen
 *   left as they are, unless --rebuild-cases); no calls;
 * - --group-levers: the stage's report, no calls. Each turn job of the stage
 *   (--run --stage group-levers --role beat --prompt-state adopted17,
 *   production's one checked retry in the loop) is read whole
 *   (checkedTurns.ts), by the reply the game keeps, after the beat repairs
 *   (repairBeatReply: a shared stat's lever offered to a later player is
 *   dropped, leaving that player two options). Per player in a challenge or
 *   contest thread (groupLeverSlots): the computed line B6 gives that player
 *   (sacrificeRewardLine: one fits, or none this turn, and the kind it
 *   prefers), the lever the kept set carries, its stat as the game reads it
 *   (leverStatOf: own or shared, and whether the stat's rule allows that
 *   lever), and the options kept. Per arm, against production on the (case,
 *   sample) pairs both have, under the stop rule (stopRule.ts: beyond
 *   production's two-sample difference and a one-sided Fisher p < 0.10).
 *   Beside them every lever's text for the hand read, the retries, every
 *   automatic check on the kept replies (variantComparison.ts), the waits
 *   including the retry, and cost. Writes group-levers.md and .json.
 */

const STAGE: Stage = "group-levers";
const PLAYTHROUGHS_2 = "playthroughs-2";
const LUNA_LOW = { model: "gpt-6-luna", reasoningEffort: "low" } as const;

/** The stage's arms: production's group turn, the variant and its fix-and-retest, on the group turn model. */
export const GROUP_LEVERS_ARMS = [armKey(LUNA_LOW, "adopted"), armKey(LUNA_LOW, "groupLevers"), armKey(LUNA_LOW, "groupLeversB")];

/** One rolled player's kept set: the computed line, the lever it carries and that lever's stat. */
export type PlayerLeverReading = {
  slot: string;
  line: "fits" | "none";
  /** The kind the computed line prefers (after an earlier lever) */
  prefers?: Lever;
  lever?: Lever;
  /** The lever's stat as the game reads it; absent where none reads */
  stat?: { id: string; name: string; shared: boolean; allows: boolean };
  /** The lever option's text, for the hand read */
  text?: string;
  options: number;
};

export type GroupTurnReading = {
  armKey: string;
  caseId: string;
  sample: number;
  retried?: string;
  kept: boolean;
  players: PlayerLeverReading[];
  /** Shared levers the beat repairs dropped from a later player's set */
  sharedDropped: number;
  outputId?: string;
};

/** A group turn's rolled players read from the reply as the game keeps it. */
export function groupTurnReading(story: Story, written: SetOfBeatGenerationSchema): Pick<GroupTurnReading, "players" | "sharedDropped"> {
  const { reply, repairs } = repairBeatReply(story, written);
  const stats = leverStatsOf(story);
  const players = groupLeverSlots(story).map((slot): PlayerLeverReading => {
    const line = sacrificeRewardLine(story, slot);
    const prefers = /prefer a (sacrifice|reward)\)/.exec(line)?.[1] as Lever | undefined;
    const beat = (reply as unknown as Record<string, { options?: { resourceType?: string; text?: string }[] } | undefined>)[slot];
    const options = Array.isArray(beat?.options) ? beat.options : [];
    const leverOption = options.find((o) => o?.resourceType === "sacrifice" || o?.resourceType === "reward");
    const lever = leverOption?.resourceType as Lever | undefined;
    const text = typeof leverOption?.text === "string" ? leverOption.text : "";
    const leverStat = lever ? leverStatOf(story, slot, lever, text, stats) : undefined;
    return {
      slot,
      line: line.endsWith("none this turn.") ? "none" : "fits",
      ...(prefers ? { prefers } : {}),
      ...(lever ? { lever, text } : {}),
      ...(lever && leverStat ? { stat: { id: leverStat.stat.id, name: leverStat.stat.name, shared: leverStat.shared, allows: allowsLever(leverStat.stat, lever) } } : {}),
      options: options.length,
    };
  });
  return { players, sharedDropped: repairs.filter((r) => r.kind === "sharedLeverRepeated").length };
}

type Measure = { name: string; label: string; of: (p: PlayerLeverReading) => boolean | undefined };

/** The readings per rolled player set; undefined leaves a set out of the measure's count. */
const MEASURES: Measure[] = [
  { name: "leverSets", label: "Sets with a sacrifice or reward", of: (p) => p.lever !== undefined },
  { name: "leverWhereFits", label: "… where the computed line says one fits", of: (p) => (p.line === "fits" ? p.lever !== undefined : undefined) },
  { name: "leverWhereNone", label: "… where the computed line says none (should be none)", of: (p) => (p.line === "none" ? p.lever !== undefined : undefined) },
  { name: "ownLeverSets", label: "Sets with a lever on the player's own stat", of: (p) => p.lever !== undefined && p.stat?.shared === false },
  { name: "sharedLeverSets", label: "Sets with a lever on a shared stat", of: (p) => p.lever !== undefined && p.stat?.shared === true },
  { name: "sacrificeSets", label: "Sets with a sacrifice", of: (p) => p.lever === "sacrifice" },
  { name: "rewardSets", label: "Sets with a reward", of: (p) => p.lever === "reward" },
  { name: "preferredKind", label: "Levers of the kind the line prefers (where it prefers one)", of: (p) => (p.prefers && p.lever ? p.lever === p.prefers : undefined) },
  { name: "leverStatAllows", label: "Levers whose stat allows that lever (of levers)", of: (p) => (p.lever ? p.stat?.allows === true : undefined) },
  { name: "leverStatRead", label: "Levers whose stat the game reads (of levers)", of: (p) => (p.lever ? p.stat !== undefined : undefined) },
  { name: "setsShort", label: "Sets left with fewer than three options", of: (p) => p.options < 3 },
];

export type MeasureReading = { name: string; label: string; arm: Tally; reference: Tally; noise: number; move: RateMove };

export type GroupLeverArm = {
  armKey: string;
  turns: number;
  sets: number;
  tallies: Record<string, Tally>;
  /** Turns where the repairs dropped a shared lever's later copy */
  sharedDropTurns: Tally;
  /** Against production, on the (case, sample) pairs both have */
  measures: MeasureReading[];
};

const pairKey = (r: Pick<GroupTurnReading, "caseId" | "sample">) => `${r.caseId}|${r.sample}`;

function tally(readings: GroupTurnReading[], measure: Measure): Tally {
  const values = readings.flatMap((r) => r.players.map(measure.of)).filter((v): v is boolean => v !== undefined);
  return { hits: values.filter(Boolean).length, n: values.length };
}

const rate = (t: Tally) => (t.n ? t.hits / t.n : 0);

/** Per arm, production first; the variant against production on the pairs both have, its noise production's sample 1 against its sample 2. */
export function groupLeverArmReadings(readings: GroupTurnReading[], reference = GROUP_LEVERS_ARMS[0]): GroupLeverArm[] {
  const kept = readings.filter((r) => r.kept);
  const arms = [...new Set(kept.map((r) => r.armKey))].sort((a, b) => (a === reference ? -1 : b === reference ? 1 : a.localeCompare(b)));
  const own = (key: string) => kept.filter((r) => r.armKey === key);
  const refReadings = own(reference);
  return arms.map((key) => {
    const mine = own(key);
    const shared = new Set(mine.map(pairKey).filter((k) => refReadings.some((r) => pairKey(r) === k)));
    const onShared = (list: GroupTurnReading[]) => list.filter((r) => shared.has(pairKey(r)));
    return {
      armKey: key,
      turns: mine.length,
      sets: mine.reduce((sum, r) => sum + r.players.length, 0),
      tallies: Object.fromEntries(MEASURES.map((m) => [m.name, tally(mine, m)])),
      sharedDropTurns: { hits: mine.filter((r) => r.sharedDropped > 0).length, n: mine.length },
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

/** One lever as the hand read takes it: where, whose, its text and stat. */
export type LeverLine = { armKey: string; caseId: string; sample: number; slot: string; line: string; lever: Lever; stat?: string; shared?: boolean; allows?: boolean; text: string };

export type GroupLeversReport = {
  generatedAt: Date;
  tallies: LineTally[];
  arms: GroupLeverArm[];
  /** The fix-and-retest against the run's variant (its second reference), where it ran */
  retestArms?: GroupLeverArm[];
  turns: GroupTurnReading[];
  levers: LeverLine[];
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

const setText = (p: PlayerLeverReading) => {
  const lever = p.lever ? `${p.lever === "sacrifice" ? "S" : "R"} ${p.stat ? `${p.stat.name} (${p.stat.shared ? "shared" : "own"}${p.stat.allows ? "" : ", not allowed"})` : "(stat unread)"}` : "–";
  return `${p.slot}${p.line === "none" ? " [none]" : p.prefers ? ` [prefer ${p.prefers}]` : ""}: ${lever}${p.options < 3 ? ` (${p.options} options)` : ""}`;
};

/** The readings of one candidate against its reference: each arm's tallies, then the candidate against the reference on their shared pairs. */
function readingRows(arms: GroupLeverArm[], candidate: GroupLeverArm): string[] {
  return [
    `| Reading | ${arms.map((a) => a.armKey).join(" | ")} | ${candidate.armKey} against ${arms[0].armKey} | Noise | Reading |`,
    `|---|${arms.map(() => "---|").join("")}---|---|---|`,
    ...MEASURES.map((m) => {
      const vs = candidate.measures.find((x) => x.name === m.name);
      return `| ${m.label} | ${arms.map((a) => `${ofN(a.tallies[m.name])} (${pct(rate(a.tallies[m.name]))})`).join(" | ")} | ${vs ? `${ofN(vs.arm)} against ${ofN(vs.reference)}` : "–"} | ${vs ? pct(vs.noise) : "–"} | ${vs ? moveText(vs.move) : "–"} |`;
    }),
    `| Turns where a shared lever's later copy was dropped | ${arms.map((a) => ofN(a.sharedDropTurns)).join(" | ")} | – | – | – |`,
  ];
}

/** group-levers.md */
export function renderGroupLevers(report: GroupLeversReport): string {
  const [reference, ...candidates] = report.arms;
  const retest = report.retestArms && report.retestArms.length > 1 ? report.retestArms : undefined;
  const byCase = [...new Set(report.turns.map((t) => t.caseId))].sort();
  const armKeys = report.arms.map((a) => a.armKey);
  const cell = (caseId: string, arm: string, sample: number) => {
    const t = report.turns.find((r) => r.caseId === caseId && r.armKey === arm && r.sample === sample);
    if (!t) return "–";
    if (!t.kept) return "fails";
    return `${t.players.map(setText).join("; ")}${t.sharedDropped ? ` (shared copy dropped ×${t.sharedDropped})` : ""}${t.retried ? " (retried)" : ""}`;
  };
  const lines = [
    "# Group sacrifices, rewards and own stats (group-levers)",
    "",
    `Generated ${report.generatedAt.toISOString()}. Production's group turn (adopted) and the variant (groupLevers) under ${GROUP_LEVERS_PROMPT_STATE}, interleaved; each turn with production's one retry where its first reply is one short paragraph or has no options. A turn is read by the reply the game keeps, after the beat repairs (a shared stat's lever offered to a later player is dropped). Each player in a challenge or contest thread is one set, read against the line B6 computes for that player (one fits, or none this turn). Readings, not verdicts.`,
    "",
    "Each candidate against production on the (case, sample) pairs both have, under the stop rule: beyond production's two-sample difference, and a one-sided Fisher p < 0.10. The fix-and-retest ran once, so its pairs are the first samples.",
    "",
    ...candidates.flatMap((c) => [`### ${c.armKey} against ${reference.armKey} (production)`, "", ...readingRows(report.arms, c), ""]),
    ...(retest ? [`### ${retest[1].armKey} against ${retest[0].armKey} (its second reference; noise: the run's variant's two samples)`, "", ...readingRows(retest, retest[1]), ""] : []),
    `Sets per arm: ${report.arms.map((a) => `${a.armKey} ${a.sets} sets in ${a.turns} turns`).join("; ")}. Reference: ${reference?.armKey ?? "–"}.`,
    "",
    "## Per turn (each rolled player's kept set: S sacrifice, R reward, the stat as the game reads it; [none] where the line gives none)",
    "",
    `| Case | Sample | ${armKeys.join(" | ")} |`,
    `|---|---|${armKeys.map(() => "---|").join("")}`,
    ...byCase.flatMap((c) => [1, 2].map((s) => `| ${c} | ${s} | ${armKeys.map((a) => cell(c, a, s)).join(" | ")} |`)),
    "",
    "## Every lever offered (for the hand read)",
    "",
    "| Arm | Case | Sample | Player | Line | Kind | Stat | Text |",
    "|---|---|---|---|---|---|---|---|",
    ...report.levers.map(
      (l) =>
        `| ${l.armKey} | ${l.caseId} | ${l.sample} | ${l.slot} | ${l.line} | ${l.lever} | ${l.stat ? `${l.stat} (${l.shared ? "shared" : "own"}${l.allows ? "" : ", not allowed"})` : "unread"} | ${l.text.replace(/\|/g, "/")} |`
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

// --- --build-group-lever-cases ---

const runsOf = (ctx: Pick<PrepContext, "files">): PlayRun[] => playthroughRunsFrom(ctx.files.readPlaythroughs(PLAYTHROUGHS_2));

/** The prompt hash each stored playthrough call sent, by its output file. */
const promptHashesOf = (ctx: Pick<PrepContext, "files">) => {
  const byId = new Map(ctx.files.readPrepRecords().flatMap((r) => (r.outputFile && r.promptHash ? [[outputIdOf(r.outputFile), r.promptHash] as [string, string]] : [])));
  return (outputFile: string) => byId.get(outputIdOf(outputFile));
};

export function buildGroupLeverCasesMode(ctx: Pick<PrepContext, "files" | "log">, replace: boolean): void {
  const { files, log } = ctx;
  if (!files.casesExist()) throw new Error("No frozen cases. Run --build-cases first.");
  const runs = runsOf(ctx);
  if (runs.length === 0) throw new Error("No stored second-round playthroughs (playthroughs-2.json). Run --playthroughs --round 2 first.");
  const { cases, problems, skipped } = groupLeversCasesToFreeze(files.readCases(), runs, promptHashesOf(ctx), replace);
  if (problems.length) throw new Error(problems.join("; "));
  if (skipped.length) log(`Already frozen, left as they are: ${skipped.join(", ")}.`);
  if (cases.length === 0) return log("Nothing new to freeze; no calls.");
  files.addCases(cases, undefined, replace);
  log(`Froze ${cases.map((c) => c.id).join(", ")} beside the other cases; no calls.`);
}

// --- --group-levers ---

/** Every checked turn read per rolled player, by the reply the game keeps. */
export function groupTurnReadings(turns: CheckedTurn[], load: (record: CallRecord) => unknown, storyOf: (caseId: string) => Story | undefined): GroupTurnReading[] {
  return turns.flatMap((t): GroupTurnReading[] => {
    const story = storyOf(t.caseId);
    if (!story) return [];
    const keptRecord = t.kept === 2 ? t.retry : t.kept === 1 ? t.first : undefined;
    const reply = keptRecord ? (load(keptRecord) as SetOfBeatGenerationSchema | undefined) : undefined;
    const base = { armKey: t.armKey, caseId: t.caseId, sample: t.sample, ...(t.retried ? { retried: t.retried } : {}) };
    if (!reply) return [{ ...base, kept: false, players: [], sharedDropped: 0 }];
    return [{ ...base, kept: true, ...groupTurnReading(story, reply), ...(keptRecord?.outputFile ? { outputId: outputIdOf(keptRecord.outputFile) } : {}) }];
  });
}

export async function groupLeversMode(ctx: Pick<PrepContext, "files" | "log">): Promise<void> {
  const { files, log } = ctx;
  const armKeys = new Set(GROUP_LEVERS_ARMS);
  const records = files.readRecords().filter((r) => r.stage === STAGE && r.promptState === GROUP_LEVERS_PROMPT_STATE && armKeys.has(r.armKey) && r.group === "beat");
  const cases = files.readCases();
  const byId = new Map(cases.map((c) => [c.id, c]));
  const storyOf = (id: string) => {
    const evalCase: EvalCase | undefined = byId.get(id);
    return evalCase?.state ? caseStory(evalCase) : undefined;
  };
  const turns = await checkedTurns(records, files.loadOutput, (id) => storyOf(id)?.getCurrentBeatType() === "ending");
  const readings = groupTurnReadings(turns, files.loadOutput, storyOf);
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
  const levers: LeverLine[] = readings
    .flatMap((r) =>
      r.players.flatMap((p): LeverLine[] =>
        p.lever
          ? [{ armKey: r.armKey, caseId: r.caseId, sample: r.sample, slot: p.slot, line: p.line === "none" ? "none" : p.prefers ? `fits, prefer ${p.prefers}` : "fits", lever: p.lever, ...(p.stat ? { stat: p.stat.name, shared: p.stat.shared, allows: p.stat.allows } : {}), text: p.text ?? "" }]
          : []
      )
    )
    .sort((a, b) => a.armKey.localeCompare(b.armKey) || a.caseId.localeCompare(b.caseId) || a.sample - b.sample || a.slot.localeCompare(b.slot));
  const report: GroupLeversReport = {
    generatedAt: new Date(),
    tallies: lineTallies(turns, checks),
    arms: groupLeverArmReadings(readings),
    retestArms: groupLeverArmReadings(
      readings.filter((r) => r.armKey === GROUP_LEVERS_ARMS[1] || r.armKey === GROUP_LEVERS_ARMS[2]),
      GROUP_LEVERS_ARMS[1]
    ),
    turns: readings,
    levers,
    keptComparisons: variantComparisons(keptCalls, checks, tags, GROUP_LEVERS_PROMPT_STATE),
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
    arms: report.arms,
    retestArms: report.retestArms,
    levers,
    tallies: report.tallies,
    waits: report.waits,
    spendUsd: report.spendUsd,
  };
  files.writeGroupLevers(renderGroupLevers(report), json);
  for (const arm of report.arms) {
    const t = (name: string) => ofN(arm.tallies[name]);
    log(`${arm.armKey}: ${arm.sets} sets in ${arm.turns} turns; levers ${t("leverSets")} (own ${t("ownLeverSets")}, shared ${t("sharedLeverSets")}, rewards ${t("rewardSets")}); where none ${t("leverWhereNone")}; shared copies dropped in ${ofN(arm.sharedDropTurns)} turns`);
    for (const m of arm.measures) log(`  ${m.label}: ${ofN(m.arm)} against ${ofN(m.reference)}, ${moveText(m.move)}`);
  }
  const retest = report.retestArms?.[1];
  if (retest) for (const m of retest.measures) log(`  retest against the run's variant, ${m.label}: ${ofN(m.arm)} against ${ofN(m.reference)}, ${moveText(m.move)}`);
  log(`Wrote group-levers.md and .json (turns $${report.spendUsd.toFixed(4)}; no calls).`);
}
