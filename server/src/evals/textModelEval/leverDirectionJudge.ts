import { z } from "zod";
import type { TextRequest } from "../../game/services/storyTextSteps.js";
import type { Arm, Stage } from "./arms.js";
import { isReliable, type HandVerdict } from "./judgedChecks.js";
import { prepJob } from "./prepCalls.js";
import type { Job } from "./runner.js";
import type { StageArmReading, StageComparison } from "./stageJudge.js";

/*
 * The lever-direction stage's judged check (2026-09-30, fix 3 of the second
 * playthroughs' review). One cheap GPT-6 call per setup asks
 * leversRunRightWay: every sacrifice leaves the player worse off in its stat
 * and every reward better off, whichever way the stat runs. A sacrifice option
 * adds the game's fixed +30 and pays a certain cost, a reward subtracts 30 and
 * brings a certain gain, so a sacrifice that lowers a stat where more is worse
 * (the mouse story's "Give up 10% Cat's Nearness") pays the player twice.
 * Phrased so yes passes. The judge reads each stat that has a lever, as the
 * game keeps the setup: its name, whose it is, its type and values, and what
 * shows which way is better (tooltip, effects in challenges, thresholds,
 * changes after chapters), then its sacrifice and reward; never the prompt,
 * so production's setup and the variant read alike. It says for each stat
 * which way is better for the player and what each lever does, then answers.
 * Calibrated on hand-read stored setups before any judge call
 * (LEVER_CALIBRATION), to the judged checks' standard (isReliable).
 */

export const LEVER_CHECK = "leversRunRightWay" as const;

/**
 * Part of each judge call's key: a wording change is judged afresh. v1 asked
 * the judge what each lever does to the player and for a yes or no; on its
 * calibration it failed two hand-yes setups and split on four of 19 pairs,
 * each time reading "Spend 10% Market Buzz by making a bold offer" (a stat
 * where more is better) as helping the player: the story action read over the
 * stat's move. v2, the calibration's one fix, asks only which way is better
 * and which way each lever moves its stat, read from the lever's words, and
 * the game reads what each lever does and the verdict from those two labels.
 */
export const LEVER_JUDGE_PROMPT_VERSION = 2;

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asText = (value: unknown): string => (typeof value === "string" ? value : typeof value === "number" ? String(value) : Array.isArray(value) ? JSON.stringify(value) : "");

const INTRO = `YOUR JOB: CHECK THE SACRIFICES AND REWARDS OF A STORY GAME'S STATS

In this game a player sometimes picks a sacrifice option or a reward option in a scene. A sacrifice option adds a big fixed bonus to the player's chance of success and always pays a cost in one stat. A reward option lowers the chance of success by the same amount and always brings a gain in one stat. So a sacrifice must leave the player worse off in its stat, and a reward must leave them better off; otherwise the player is paid twice, or punished twice.

Which way is better depends on the stat. For a resource, a supply, support, trust, health or skill, more is better for the player. For a danger, suspicion, pressure, strain, a threat's nearness or anything the player wants to keep low, more is worse for the player. For a balance between two sides that are both fine, a disposition or a style, neither way is simply better. A shared stat is the players' world or group: judge it by what is better for the players. The stat's tooltip, its effects in challenges (which values give a bonus or a penalty), its thresholds (what happens at high or low values) and its changes after chapters (which results raise or lower it) show which way it runs. For a list, losing an item costs and gaining one helps; for a stat of named steps, read which end is better from the same fields.

Your part is two readings per stat; the game then works out what each lever does to the player from them.

First, which way is better for the player: "better for the player" when more of it is better, "worse for the player" when more is worse, "neither" when neither way is simply better.

Second, which way the sacrifice moves its stat, and which way the reward moves it: "raises it", "lowers it", or "none or unclear" for a lever written "None" or one that doesn't say. Read the move from the lever's own words about its stat, never from whether its story action sounds good or bad: "Spend 10% Market Buzz by making a bold offer" lowers Market Buzz, however good the offer sounds; "Let the guards' Suspicion rise 10% to slip past" raises Suspicion; "Give up 10% Suspicion by bribing a guard" lowers Suspicion, whatever the bribe costs in the story; "Give up one step of Trust" lowers Trust; "Add one contact" raises Contacts. More means a higher number, more items in a list, a step further along a stat's list of values, or a move toward the first side of a stat of two sides.

An example from another story (a bakery race): Oven Heat, where above 70% every tray burns: worse for the player. Its sacrifice "Let the oven's heat rise 10% to bake two trays at once" raises it; its reward "Lower the heat 10% by resting" lowers it. Flour: better for the player. Its sacrifice "Spend 1 bag of Flour" lowers it; its reward "Gain 1 bag of Flour by shopping instead of baking" raises it.

For each stat below, give the two readings in order.`;

const QUESTION = `For each stat listed, in order: which way is better for the player and why, in a few words; which way its sacrifice moves it; which way its reward moves it. From these the game checks ${LEVER_CHECK}: every sacrifice leaves the player worse off in its stat and every reward better off.`;

const MORE_IS = ["better for the player", "worse for the player", "neither"] as const;
const MOVES = ["raises it", "lowers it", "none or unclear"] as const;

export function leverJudgeSchema() {
  return z.object({
    levers: z
      .array(
        z.object({
          stat: z.string().describe("The stat's name, as listed."),
          moreIs: z.enum(MORE_IS).describe("Which way is better for the player: more of it is better, more is worse, or neither way is simply better."),
          why: z.string().describe("What shows it, in a few words (a tooltip, an effect, a threshold or a change after chapters)."),
          sacrificeMoves: z.enum(MOVES).describe("Which way the sacrifice moves this stat, read from its words about the stat: raises it, lowers it, or none or unclear."),
          rewardMoves: z.enum(MOVES).describe("Which way the reward moves this stat, read from its words about the stat: raises it, lowers it, or none or unclear."),
        })
      )
      .max(16)
      .describe("One entry per stat listed, in order."),
  });
}

const isNone = (text: string) => text.trim() === "" || /^none\b/i.test(text.trim());

type StatView = { name: string; whose: string; type: string; lines: string[] };

/** A stat as the judge reads it; undefined where it has no lever (both 'None'). */
function statView(value: unknown, whose: string): StatView | undefined {
  const stat = asObject(value);
  const sacrifice = asText(stat.optionsToSacrifice);
  const reward = asText(stat.optionsToGainAsReward);
  if (isNone(sacrifice) && isNone(reward)) return undefined;
  const list = (field: unknown) => asArray(field).map(asText).filter(Boolean).join(" | ") || "none";
  const values = asText(stat.possibleValues);
  const start = asText(stat.initialValue);
  return {
    name: asText(stat.name) || asText(stat.id),
    whose,
    type: asText(stat.type) || "type not given",
    lines: [
      ...(values ? [`  Values: ${values}`] : []),
      ...(start ? [`  Starts at: ${start}`] : []),
      `  Tooltip: ${asText(stat.tooltip) || "none"}`,
      `  Effects in challenges: ${list(stat.effectOnPoints)}`,
      `  Thresholds: ${list(stat.narrativeImplications)}`,
      `  Changes after chapters: ${list(stat.adjustmentsAfterThreads)}`,
      `  Sacrifice: ${sacrifice || "None"}`,
      `  Reward: ${reward || "None"}`,
    ],
  };
}

/**
 * The judge's request for one setup, as the game keeps it (the assembled
 * reply): every stat with a lever, shared then player; undefined where no stat
 * has one.
 */
export function leverJudgeRequest(setup: unknown): TextRequest | undefined {
  const s = asObject(setup);
  const views = [
    ...asArray(s.sharedStats).map((stat) => statView(stat, "a shared stat: the world or the players' group")),
    ...asArray(s.playerStats).map((stat) => statView(stat, "a player stat: each player's own")),
  ].filter((v): v is StatView => v !== undefined);
  if (views.length === 0) return undefined;
  const stats = views.map((v, i) => [`Stat ${i + 1}: ${v.name} (${v.whose}; ${v.type})`, ...v.lines].join("\n"));
  const sections = [
    INTRO,
    ["======= THE STORY =======", `Title: ${asText(s.title) || "not given"}`].join("\n"),
    ["======= THE STATS WITH A SACRIFICE OR REWARD =======", ...stats].join("\n\n"),
    ["======= QUESTION =======", QUESTION].join("\n"),
  ];
  return { prompt: sections.join("\n\n"), schema: leverJudgeSchema() };
}

export type LeverLabel = { stat: string; moreIs: string; sacrifice: string; reward: string };

/** What a lever does to the player: from which way its stat is better and which way the lever moves it. */
function leverDoes(moreIs: string, moves: string): string {
  if (moves !== "raises it" && moves !== "lowers it") return "none or unclear";
  if (moreIs === "neither") return "neither way";
  const better = moreIs === "better for the player";
  if (!better && moreIs !== "worse for the player") return "none or unclear";
  return (moves === "raises it") === better ? "helps the player" : "costs the player";
}

type Reading = { stat: string; moreIs: string; sacrificeMoves: string; rewardMoves: string };

function readingsOf(parsed: unknown): Reading[] {
  return asArray(asObject(parsed).levers)
    .map(asObject)
    .map((l) => ({ stat: asText(l.stat), moreIs: asText(l.moreIs), sacrificeMoves: asText(l.sacrificeMoves), rewardMoves: asText(l.rewardMoves) }));
}

/** What each stat's levers do to the player, read from the judge's two labels per stat. */
export function leverLabelsFrom(parsed: unknown): LeverLabel[] {
  return readingsOf(parsed).map((r) => ({ stat: r.stat, moreIs: r.moreIs, sacrifice: leverDoes(r.moreIs, r.sacrificeMoves), reward: leverDoes(r.moreIs, r.rewardMoves) }));
}

/** The verdict: true when no lever runs backwards (no sacrifice helps the player, no reward costs them); undefined where the judge labelled no stat. */
export function leverVerdictFrom(parsed: unknown): boolean | undefined {
  const labels = leverLabelsFrom(parsed);
  return labels.length === 0 ? undefined : leverTally(labels).backwards === 0;
}

export type LeverTally = { levers: number; backwards: number; onWorse: number; backwardsOnWorse: number; statsWorse: number };

/**
 * The judge's labels counted: levers (every sacrifice and reward that moves
 * its stat), those that run backwards on a stat where one way is better, and
 * the same on stats where more is worse, with how many such stats.
 */
export function leverTally(labels: LeverLabel[]): LeverTally {
  const t: LeverTally = { levers: 0, backwards: 0, onWorse: 0, backwardsOnWorse: 0, statsWorse: 0 };
  for (const l of labels) {
    const worse = l.moreIs === "worse for the player";
    const directed = l.moreIs !== "neither";
    if (worse) t.statsWorse++;
    for (const [does, wrong] of [
      [l.sacrifice, "helps the player"],
      [l.reward, "costs the player"],
    ]) {
      if (does === "none or unclear" || does === "") continue;
      // A lever on a stat where neither way is better moves it, and never runs backwards
      t.levers++;
      const backwards = directed && does === wrong;
      if (backwards) t.backwards++;
      if (worse) {
        t.onWorse++;
        if (backwards) t.backwardsOnWorse++;
      }
    }
  }
  return t;
}

/** The judge's reading of each stat with what each lever does, and as evidence the levers that run backwards. */
export function leverEvidenceFrom(parsed: unknown): { evidence?: string; lines: string[] } {
  const readings = readingsOf(parsed);
  const labels = leverLabelsFrom(parsed);
  const part = (moves: string, does: string) => (does === "none or unclear" ? does : `${moves}, ${does}`);
  const lines = labels.map((l, i) => `${l.stat} (more is ${l.moreIs}): sacrifice ${part(readings[i].sacrificeMoves, l.sacrifice)}; reward ${part(readings[i].rewardMoves, l.reward)}`);
  const backwards = labels.flatMap((l) => {
    const wrong = [...(l.sacrifice === "helps the player" ? ["sacrifice helps the player"] : []), ...(l.reward === "costs the player" ? ["reward costs the player"] : [])];
    return wrong.length ? [`${l.stat}: ${wrong.join(", ")}`] : [];
  });
  return { ...(backwards.length ? { evidence: backwards.join("; ") } : {}), lines };
}

export const leverJudgeCaseId = (key: string, version = LEVER_JUDGE_PROMPT_VERSION) => `judge-levers-v${version}-${key}`;

/** Luna low reads four to eight stats and writes a line for each: about 600-1,200 tokens, reasoning included */
const LEVER_JUDGE_OUTPUT_TOKENS = 1000;

export type LeverTarget = { key: string; request: TextRequest; samples: number };

/** The judge calls: each target at its number of samples (the calibration's two, the rest one). */
export function leverJudgeJobs(targets: LeverTarget[], arm: Arm, promptState: string, stage: Stage): Job[] {
  return targets.flatMap((target) =>
    Array.from({ length: target.samples }, (_, i) =>
      prepJob({
        kind: "judge",
        stage,
        promptState,
        caseId: leverJudgeCaseId(target.key),
        sample: i + 1,
        arm,
        role: "setup",
        players: 1,
        build: () => target.request,
        outputTokens: LEVER_JUDGE_OUTPUT_TOKENS,
      })
    )
  );
}

// ---------------------------------------------------------------- calibration

/** A hand-read stored setup, by its output id (outputs/<id>.json), as the game keeps it. */
export type LeverCalibrationItem = { id: string; output: string; hand: HandVerdict; note: string };

/**
 * Stored setups read by hand on the check's criterion before any judge call
 * (2026-09-30): yes when every sacrifice costs the player and every reward
 * helps; no when any lever runs backwards on a stat where one way is better;
 * partial where a reader could go either way (left out of agreement).
 * Production's form throughout: the second round's playthrough setups (r2-),
 * the final check's (final-, production's own code) and setup round 3's
 * confirmation run (r3-, production's form byte for byte but the kids
 * examples), on premises with and without a pressure.
 */
export const LEVER_CALIBRATION: LeverCalibrationItem[] = [
  // --- Hand no: a lever runs backwards on a stat where more is worse ---
  { id: "r2-kids-mouse", output: "62e5e0632d2c893cb42f", hand: false, note: "Cat's Nearness (at 70% Marmalade is close, -10): 'Give up 10% Cat's Nearness by making a noisy distraction' lowers it, a benefit; its reward 'Gain 10% … by pausing to hide' raises it" },
  { id: "r2-avalon", output: "33cf9a34cbaf63247faf", hand: false, note: "Heartwell Feedback (how volatile the magic has become, -10 above 70%): 'Spend 10% Heartwell Feedback to force open a sealed route' lowers it; its reward gains it by avoiding the chamber" },
  { id: "final-bounty-hunters", output: "362700b13c20cedbd2c9", hand: false, note: "Dust and Danger (public alarm and danger, -10 above 70%): 'Spend 10% Dust and Danger by taking a conspicuous shortcut' lowers it; its reward gains it by abandoning a lead" },
  { id: "final-berlin-flat", output: "335d5360eefa1fa9236f", hand: false, note: "Application Paperwork Load (-10 at 70%, reduced after a favorable thread): 'Spend 10% … by letting another applicant take over a form' lowers it; its reward gains it by refusing a form" },
  { id: "final-secret-society", output: "187b94a1f1b330a7db74", hand: false, note: "Eclipse Strain (how strongly the Hollow Sun disturbs the world, -10 at 70%): 'Spend 10% Eclipse Strain by accepting a dangerous shortcut' lowers it; its reward gains it by sheltering" },
  { id: "r3-casablanca-s3", output: "9b670336d77daf9c0b03", hand: false, note: "Family Pressure (-10 above 70%, -10% after a favorable family thread): 'Spend 10% Family Pressure to delay a conversation' lowers it; its reward gains it" },
  { id: "r3-animal-rescue-s1", output: "e54de0885542c4e324fb", hand: false, note: "Storm (+10% after an unfavorable storm thread; at 70% the next switch must offer shelter): 'Spend 10% Storm by waiting for a short lull' lowers it; its reward gains it by resting (its effects give +10 at both ends)" },
  { id: "r3-neo-tokyo-s1", output: "e17ae81db7b64f12036b", hand: false, note: "Corporate Scrutiny (how closely the Glass Spire watches, -10 at 70%): 'Give up 10% Corporate Scrutiny by exposing a source' lowers it, whatever the source costs in the story; its reward gains it" },
  { id: "r3-bounty-hunters-s1", output: "c32f4ac1fae1ba363269", hand: false, note: "Pursuit Pressure (high means the Coyote is close to slipping away, -10 above 70%): 'Spend 10% Pursuit Pressure by forcing a fast pursuit' lowers it; its reward gains it by letting the trail cool" },
  // --- Hand yes: every sacrifice costs, every reward helps ---
  { id: "final-er-doctor", output: "ef1b2470afd27b97e7e8", hand: true, note: "Department Strain: 'Add 10% …' as the sacrifice, 'Reduce … 10%' as the reward; Hospital Oversight one step toward Formal Review as the sacrifice; Bed Availability reduced; Clinical Approach toward Decisive or Methodical (neither end better)" },
  { id: "final-animal-rescue", output: "2dbe52499b05ead40338", hand: true, note: "Safe Paths, Dry Supplies, Energy, Helpful Gear: each spent as the sacrifice and gained as the reward (Safe Paths spent 'by marking a new route', an odd story action, but the stat falls)" },
  { id: "final-neo-tokyo", output: "2cfcf65b4b8526ad1c84", hand: true, note: "Civic Trust, Department Patience, Witness Safety, Composure spent; Trusted Contacts burned; every reward gains" },
  { id: "r2-lemonade", output: "e725f1d276b2a0a97d39", hand: true, note: "Market Buzz, Seasonal Demand, the cashbox, Profit Margin, Business Skills: every sacrifice spends, every reward gains" },
  { id: "r2-food-trucks", output: "b5f8e4205731f6aa2461", hand: true, note: "District Safety and Neighborhood Confidence given up, Owner Stamina spent, Business Reputation to Under Scrutiny as the sacrifice; every reward gains" },
  { id: "r2-space-pirates", output: "9e06265a965f4b2ac7a6", hand: true, note: "Imperial Patrol Heat: 'Add 10% Patrol Heat by making a conspicuous move' as the sacrifice, 'Reduce Patrol Heat by 10% by laying low' as the reward; Integrity and Personal Quota spent" },
  { id: "r2-estate-agents", output: "1e8d7ef0e9395c20e270", hand: true, note: "House Condition, Neighborhood Regard, Credibility and Nerve spent, a contact called in; every reward gains" },
  { id: "r3-avalon-s1", output: "fd7f447f8968a27c63f9", hand: true, note: "Civic Tension: 'Raise Civic Tension by 10%' as the sacrifice, 'Lower … by 10%' as the reward; Grid Stability and Neighborhood Trust given up; Leena one step toward Strained" },
  { id: "r3-er-doctor-s2", output: "47344ae4f7776acd897a", hand: true, note: "Department Strain: 'Add 10% …' as the sacrifice, 'Reduce … 10%' as the reward; Team Cohesion and Iman Trust one step down as sacrifices" },
  // --- Partial, left out of agreement ---
  { id: "r3-subscription-s1", output: "ffb57f46ca6685fdc419", hand: "partial", note: "Every stat that moves runs the right way (Operational Strain, the company's, is better high for the player and is spent); Resolve's sacrifice 'Accept one awkward conversation' and reward 'Take a low-pressure offer … to regain confidence' barely say which way Resolve moves" },
];

export type LeverAgreement = {
  check: typeof LEVER_CHECK;
  decided: number;
  agree: number;
  falseFails: number;
  falsePasses: number;
  handPasses: number;
  handFails: number;
  pairs: number;
  pairsAgree: number;
  partial: { yes: number; no: number };
  reliable: boolean;
};

/** Agreement with the hand verdicts (sample 1), the samples' agreement, and the answers on partial items. */
export function scoreLeverCalibration(items: { id: string; hand: HandVerdict }[], judged: { itemId: string; samples: (boolean | undefined)[] }[]): LeverAgreement {
  const byItem = new Map(judged.map((j) => [j.itemId, j]));
  const a: LeverAgreement = { check: LEVER_CHECK, decided: 0, agree: 0, falseFails: 0, falsePasses: 0, handPasses: 0, handFails: 0, pairs: 0, pairsAgree: 0, partial: { yes: 0, no: 0 }, reliable: false };
  for (const item of items) {
    const [first, second] = byItem.get(item.id)?.samples ?? [];
    if (first === undefined) continue;
    if (second !== undefined) {
      a.pairs++;
      if (second === first) a.pairsAgree++;
    }
    if (item.hand === "partial") {
      a.partial[first ? "yes" : "no"]++;
      continue;
    }
    a.decided++;
    if (item.hand) a.handPasses++;
    else a.handFails++;
    if (first === item.hand) a.agree++;
    else if (item.hand) a.falseFails++;
    else a.falsePasses++;
  }
  return { ...a, reliable: isReliable(a) };
}

// ---------------------------------------------------------------- the report

type Tally = { hits: number; n: number };
const pct = (n: number, d: number) => (d === 0 ? "–" : `${Math.round((100 * n) / d)}%`);
const tallyText = (t?: Tally) => (t ? `${t.hits} of ${t.n} (${pct(t.hits, t.n)})` : "–");
const pText = (p?: number) => (p === undefined ? "" : p < 0.001 ? " (p < 0.001)" : ` (p ${p.toFixed(3)})`);
const verdictText = (v: HandVerdict | boolean | undefined) => (v === undefined ? "–" : v === "partial" ? "partial" : v ? "yes" : "no");

function readingText(c: StageComparison): string {
  if (c.noise === undefined) return "no noise figure (the reference has one sample)";
  if (c.moved) return `moved ${c.moved}${pText(c.p)}`;
  if (c.beyondNoise) return `beyond the noise, not moved${pText(c.p)}`;
  return "within the noise";
}

function calibrationReading(a: LeverAgreement): string {
  if (a.reliable) return "reliable";
  const few = [a.handPasses < 3 ? "yes" : "", a.handFails < 3 ? "no" : ""].filter(Boolean);
  return few.length ? `not reliable (too few hand ${few.join(" and ")})` : "not reliable";
}

export type LeverFailure = { armKey: string; caseId: string; sample: number; outputId: string; evidence: string };

/** Per arm: the judge's lever counts over every setup it read, and the stats with a lever or none, counted from the setups. */
export type LeverArmCounts = { armKey: string; setups: number; tally: LeverTally; statsWithLever: number; stats: number };

/** A share against the reference's, under the stop rule: the levers on stats where more is worse that run the right way. */
export type LeverShareReading = { armKey: string; referenceKey: string; arm: Tally; reference: Tally } & Partial<StageComparison>;

export type LeverReport = {
  calibration: LeverAgreement;
  items: LeverCalibrationItem[];
  judged: { itemId: string; samples: (boolean | undefined)[]; evidence: { evidence?: string; lines: string[] }[] }[];
  readings: StageArmReading[];
  counts: LeverArmCounts[];
  shares: LeverShareReading[];
  failures: LeverFailure[];
};

/** judged-levers.md: the calibration, each arm's setups passing and the variant against production, the lever counts, the items, and the failures. */
export function renderLeverJudge(input: { report: LeverReport; spentUsd: number; generatedAt: Date; problems: string[] }): string {
  const { report } = input;
  const c = report.calibration;
  const lines = [
    "# Judged check: every sacrifice costs the player and every reward helps, whichever way the stat runs",
    "",
    `Generated ${input.generatedAt.toISOString()} from prep-calls.jsonl (leverDirectionJudge.ts, prompt v${LEVER_JUDGE_PROMPT_VERSION}). One Luna low call per setup, reading every stat with a sacrifice or reward. A check is reliable when sample 1 agrees on at least 85% of the hand yes and of the hand no, each side holding at least 3, and two samples agree on at least 90%. A candidate reads against its reference on the (case, sample) pairs both have, with the reference's sample-1-against-sample-2 difference as the noise and the stop rule on top. Spent on these judge calls: $${input.spentUsd.toFixed(4)}.`,
    "",
    `## ${LEVER_CHECK}`,
    "",
    "| Agree (sample 1) | Hand yes / no | Judged no where the hand says yes | Judged yes where the hand says no | Samples agree | On partial items (yes / no) | Reading |",
    "|---|---|---|---|---|---|---|",
    `| ${c.agree} of ${c.decided} (${pct(c.agree, c.decided)}) | ${c.handPasses} / ${c.handFails} | ${c.falseFails} | ${c.falsePasses} | ${c.pairs ? `${c.pairsAgree} of ${c.pairs}` : "–"} | ${c.partial.yes} / ${c.partial.no} | ${calibrationReading(c)} |`,
    "",
    "| Arm | Setups passing | Against | Arm on the shared pairs | Reference on them | Noise | Reading |",
    "|---|---|---|---|---|---|---|",
    ...report.readings.map((r) =>
      r.vsReference && r.referenceKey
        ? `| ${r.armKey} | ${tallyText(r.plans)} | ${r.referenceKey} | ${tallyText(r.vsReference.arm)} | ${tallyText(r.vsReference.reference)} | ${r.vsReference.noise === undefined ? "–" : `${Math.round(100 * r.vsReference.noise)} pts`} | ${readingText(r.vsReference)} |`
        : `| ${r.armKey} | ${tallyText(r.plans)} | – | – | – | – | – |`
    ),
    "",
    "The judge's lever labels (not calibrated on their own; a pooled share's items cluster within a setup, so its p reads optimistic):",
    "",
    "| Arm | Setups | Stats with a lever / stats | Levers | Backwards | Stats where more is worse | Levers on them | Backwards on them |",
    "|---|---|---|---|---|---|---|---|",
    ...report.counts.map((k) => `| ${k.armKey} | ${k.setups} | ${k.statsWithLever} / ${k.stats} | ${k.tally.levers} | ${k.tally.backwards} | ${k.tally.statsWorse} | ${k.tally.onWorse} | ${k.tally.backwardsOnWorse} |`),
    "",
    ...(report.shares.length
      ? [
          "| Arm | Levers on stats where more is worse, the right way | Against | Reference | Noise | Reading |",
          "|---|---|---|---|---|---|",
          ...report.shares.map((s) => `| ${s.armKey} | ${tallyText(s.arm)} | ${s.referenceKey} | ${tallyText(s.reference)} | ${s.noise === undefined ? "–" : `${Math.round(100 * s.noise)} pts`} | ${s.noise === undefined ? "–" : readingText(s as StageComparison)} |`),
          "",
        ]
      : []),
    "| Item | Hand | Judged (samples) | Hand reading |",
    "|---|---|---|---|",
    ...report.items.map((item) => {
      const judged = report.judged.find((j) => j.itemId === item.id);
      return `| ${item.id} | ${verdictText(item.hand)} | ${judged?.samples.map(verdictText).join("/") || "–"} | ${item.note} |`;
    }),
  ];
  const disagreements = report.items.flatMap((item) => {
    const judged = report.judged.find((j) => j.itemId === item.id);
    const first = judged?.samples[0];
    if (item.hand === "partial" || first === undefined || first === item.hand) return [];
    const said = judged?.evidence[0];
    return [`- ${item.id}: hand ${verdictText(item.hand)}, judged ${verdictText(first)}. ${(said?.lines ?? []).join("; ")}. Evidence: ${(said?.evidence ?? "").replace(/\s+/g, " ").trim()}`];
  });
  if (disagreements.length) lines.push("", "Where sample 1 disagrees with the hand:", "", ...disagreements);
  if (report.failures.length) {
    lines.push("", "Judged failures of the arms:", "", ...report.failures.map((f) => `- ${f.armKey} ${f.caseId} s${f.sample} (${f.outputId}): ${f.evidence.replace(/\s+/g, " ").trim()}`));
  }
  if (input.problems.length) lines.push("", "## Problems", "", ...input.problems.map((p) => `- ${p}`));
  return `${lines.join("\n")}\n`;
}
