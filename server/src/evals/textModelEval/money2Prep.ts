import type { SetOfBeatGenerationSchema } from "core/types/index.js";
import { MONEY_2_PROMPT_STATE, MONEY_2_TURN_CASES, armKey, type Stage } from "./arms.js";
import { DEFAULT_STAGE_CAPS, spentByStage } from "./budget.js";
import { caseStory, type EvalCase } from "./cases.js";
import { asCall, checkedTurns } from "./checkedTurns.js";
import type { EvalFiles } from "./evalFiles.js";
import { sha256 } from "./executor.js";
import { outputIdOf } from "./judgedChecks.js";
import { money2TurnCasesToFreeze, readMoney2Reply, type Money2ReplyReading } from "./money2Cases.js";
import { MONEY_2_HAND, MONEY_2_REPLY_HAND } from "./money2Hand.js";
import {
  MONEY_2_FLAGS,
  MONEY_2_SETUP_VARIANTS,
  MONEY_2_SPECS,
  compareItems,
  money2BlindKey,
  money2Code,
  money2Comparisons,
  playMoney2,
  readMoney2Setup,
  readMoney2Turns,
  renderMoney2Blind,
  runArmOf,
  statLines,
  type Money2BlindKey,
  type Money2Comparison,
  type Money2Flags,
  type Money2Hand,
  type Money2Spec,
  type Money2TurnVerdict,
  type Money2Variant,
} from "./money2Play.js";
import { measuredCallCosts, playthroughRunsFrom, type RoleCosts } from "./playthroughMode.js";
import type { PlayRun } from "./playthroughs.js";
import type { CallRecord } from "./runner.js";
import { budgetedPrepCall } from "./setupChainMode.js";
import { meanMove, momentsOf } from "./stopRule.js";
import { spendBeside, type PrepContext } from "./turnPrep.js";

/*
 * The money-2 stage's CLI modes (decision A's money fix, 2026-10-02), kept out
 * of run.ts:
 * - --money-2-play [--samples N] [--cases <premise ids>] [--turns N]
 *   [--arms adopted|moneySetup] [--report-only]: each premise's setup on each
 *   arm (production's and moneySetup), the lemonade stand's then played on
 *   through its first chapter on production's planners and turns
 *   (money2Play.ts), one sample per invocation, each call a prep job in
 *   prep-calls.jsonl under adopted26 in the money-2 stage; a finished call on
 *   the same request is reused, so an interrupted run resumes and a smoke's
 *   calls are the full run's first. Writes money-2.md and .json;
 * - --money-2-blind: no calls; each setup and played turn under its run's code,
 *   no arm named (money-2-blind.md; the key in keys/money-2-blind.json), for the
 *   hand reading in money2Hand.ts;
 * - --money-2: the stage's report afresh, no calls: the hand verdicts
 *   unblinded through the key, the variant against production under the stop
 *   rule (stopRule.ts), the deterministic flags beside them, the setup checks,
 *   waits, reasoning and cost, and every setup's counted stats and every played
 *   turn's money. Readings, not verdicts.
 */

const STAGE: Stage = "money-2";
const FILE = "money-2";
const BLIND_FILE = "money-2-blind";
const REPLIES_BLIND_FILE = "money-2-turns-blind";
const LUNA_MEDIUM = { model: "gpt-6-luna", reasoningEffort: "medium" } as const;

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** The arms an invocation plays: both unless --arms names one of them. */
export function money2PlayVariants(armKeys?: string[]): Money2Variant[] {
  if (!armKeys?.length) return [...MONEY_2_SETUP_VARIANTS];
  const unknown = armKeys.filter((k) => !MONEY_2_SETUP_VARIANTS.includes(k as Money2Variant));
  if (unknown.length) throw new Error(`--arms for --money-2-play names setup variants, one of ${MONEY_2_SETUP_VARIANTS.join(", ")}; not ${unknown.join(", ")}`);
  return armKeys as Money2Variant[];
}

/** The file's runs with new ones: a premise, arm and sample played again replaces its run; in the stage's premise order, production first, then by sample. */
export function mergeMoney2Runs(existing: PlayRun[], added: PlayRun[]): PlayRun[] {
  const key = (run: PlayRun) => `${run.spec.id}|${run.sample}`;
  const replaced = new Set(added.map(key));
  const order = (run: PlayRun) => {
    const { premise, variant } = runArmOf(run);
    return [MONEY_2_SPECS.findIndex((s) => s.spec.id === premise), MONEY_2_SETUP_VARIANTS.indexOf(variant), run.sample];
  };
  const compare = (a: PlayRun, b: PlayRun) => {
    const [x, y] = [order(a), order(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  };
  return [...existing.filter((run) => !replaced.has(key(run))), ...added].sort(compare);
}

/**
 * A run's calls and cost before it runs, priced at the measured costs, retries left out: its setup, and for a premise
 * played on, its turns, a switch plan for every chapter they open (about one in three turns: a switch turn and a
 * chapter of two steps) and a chapter plan for every chapter they reach.
 */
export function money2Estimate(entry: Money2Spec, costsFor: (players: number) => RoleCosts, turnLimit?: number): { calls: number; usd: number } {
  const turns = turnLimit === undefined ? entry.turns : Math.min(entry.turns, turnLimit);
  const players = entry.spec.premise?.playerCount ?? (entry.spec.premiseId === "setup-learn-peer-review" ? 2 : 1);
  const costs = costsFor(players);
  const switches = Math.ceil(turns / 3);
  const chapters = Math.floor((turns + 1) / 3);
  return { calls: 1 + turns + switches + chapters, usd: costs.setup + turns * costs.beat + switches * costs.switch + chapters * costs.thread };
}

// ---------------------------------------------------------------- the report

const pct = (n: number, d: number) => (d === 0 ? "–" : `${Math.round((100 * n) / d)}%`);
const tallyText = (t: { hits: number; n: number }) => `${t.hits} of ${t.n} (${pct(t.hits, t.n)})`;
const pText = (p?: number) => (p === undefined ? "" : p < 0.001 ? " (p < 0.001)" : ` (p ${p.toFixed(3)})`);
const moveText = (c: Money2Comparison) =>
  c.noise === undefined ? "no noise figure" : c.move.moved ? `moved ${c.move.moved}${pText(c.move.p)}` : c.move.beyondNoise ? `beyond the noise, not moved${pText(c.move.p)}` : "within the noise";
const row = (label: string, c: Money2Comparison) => `| ${label} | ${tallyText(c.production)} | ${tallyText(c.variant)} | ${c.noise === undefined ? "–" : `${Math.round(100 * c.noise)} pts`} | ${moveText(c)} |`;
const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
};
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const armName = (variant: Money2Variant) => (variant === "adopted" ? "production" : variant);
const verdictText = (v: { hand: boolean | "partial"; note: string } | undefined) => (v === undefined ? "unread" : `${v.hand === "partial" ? "partial" : v.hand ? "yes" : "no"}: ${v.note}`);
const cell = (value: string) => value.replace(/\|/g, "/").replace(/\s+/g, " ");

const FLAG_LABELS: Record<keyof Money2Flags, string> = {
  moneyAsNumber: "every stat named for money is a number",
  countedAsNumber: "every counted stat is a number",
  leversInUnits: "no counted stat's sacrifice or reward in percent",
  noFixedSteps: "no counted stat moved by a fixed step for how a thread went",
  noWorkedOut: "no figure worked out from others kept as a stat",
  adjustable: "every counted stat adjustable anytime",
};

/** money-2.md: the hand reading and the flags, the variant against production, then waits and cost, every setup's counted stats and every played turn's money. */
export function renderMoney2(runs: PlayRun[], key: Money2BlindKey | undefined, hand: Money2Hand, meta: { spendUsd: number; generatedAt: Date }): string {
  const codeOf = (run: PlayRun) => (key ? money2Code(key.salt, run) : undefined);
  const c = money2Comparisons(runs, key ?? money2BlindKey(runs, "unkeyed"), key ? hand : { setups: {}, turns: {} });
  const setups = runs.filter((r) => r.setup?.output !== undefined).map((run) => ({ run, reading: readMoney2Setup(run), code: codeOf(run) }));
  const lines = [
    "# Money and counts in learning stories (the money-2 stage)",
    "",
    `Generated ${meta.generatedAt.toISOString()} from money-2.json (money2Prep.ts). Production's setup (adopted) and the money setup (moneySetup) under ${MONEY_2_PROMPT_STATE}, each setup of a learning premise, the lemonade stand's then played on through its first chapter on production's planners and turns. The variant reads against production on the premises and samples both played, production's sample 1 against its sample 2 the noise, the stop rule on top. The hand reading was blind (money-2-blind.md, the key opened after the verdicts). Spent in the stage so far: $${meta.spendUsd.toFixed(4)}.`,
    "",
    "## The setups",
    "",
    "| Reading | Production | moneySetup | Noise | Reading |",
    "|---|---|---|---|---|",
    row("By hand (blind): the setup counts in number stats that move by what the story pays and earns", c.setups),
    row("By hand (blind), the control: nothing counted forced in", c.control),
    ...MONEY_2_FLAGS.map((flag) => row(`Flag: ${FLAG_LABELS[flag]}`, c.flags[flag])),
    "",
    `Unread by hand: production ${c.setups.unread.production + c.control.unread.production}, moneySetup ${c.setups.unread.variant + c.control.unread.variant}${key ? "" : " (no blind key yet: run --money-2-blind)"}.`,
    "",
  ];
  // The setup checks that failed, per arm
  const failed = (variant: Money2Variant) => {
    const counts = new Map<string, number>();
    for (const s of setups.filter((x) => x.reading.variant === variant)) for (const name of s.reading.checksFailed) counts.set(name, (counts.get(name) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, n]) => `${name} ${n}`).join(", ") || "none";
  };
  lines.push("Setup checks that failed (setups of each arm): production " + failed("adopted") + "; moneySetup " + failed("moneySetup") + ".", "");
  // Waits, reasoning and cost of the setups
  const reasoning = (variant: Money2Variant, sample?: number) =>
    momentsOf(setups.filter((s) => s.reading.variant === variant && (sample === undefined || s.reading.sample === sample)).map((s) => s.reading.reasoningTokens));
  const reasoningNoise = Math.abs(reasoning("adopted", 1).mean - reasoning("adopted", 2).mean);
  const reasoningMove = meanMove(reasoning("adopted"), reasoning("moneySetup"), reasoningNoise);
  lines.push("| Arm | Setups | Setup calls | Wait p50 | Wait p95 | Reasoning tokens (mean) | Cost a setup |", "|---|---|---|---|---|---|---|");
  for (const variant of MONEY_2_SETUP_VARIANTS) {
    const own = setups.filter((s) => s.reading.variant === variant).map((s) => s.reading);
    lines.push(
      `| ${armName(variant)} | ${own.length} | ${sum(own.map((r) => r.setupCalls))} | ${seconds(quantile(own.map((r) => r.latencyMs), 0.5))} | ${seconds(quantile(own.map((r) => r.latencyMs), 0.95))} | ${reasoning(variant).mean.toFixed(0)} | $${(sum(own.map((r) => r.costUsd)) / Math.max(1, own.length)).toFixed(4)} |`
    );
  }
  lines.push(
    "",
    `Reasoning tokens: ${reasoningMove.moved ? `moved ${reasoningMove.moved}` : reasoningMove.beyondNoise ? `beyond the noise, not moved (${(reasoningMove.standardErrors ?? 0).toFixed(1)} SE)` : "within the noise"}.`,
    "",
    "| Premise | Sample | Arm | Hand | Counted stats (type, start) | Kept as stats though worked out | Payments put off | Flags failed |",
    "|---|---|---|---|---|---|---|---|"
  );
  for (const { reading: r, code } of setups) {
    const flagsFailed = MONEY_2_FLAGS.filter((f) => r.flags[f] === false).join(", ") || "none";
    lines.push(
      `| ${r.premise} | ${r.sample} | ${armName(r.variant)} | ${cell(verdictText(code ? hand.setups[code] : undefined))} | ${cell(r.counted.map((s) => `${s.name} (${s.type}, ${JSON.stringify(s.initial)})`).join("; ") || "none")} | ${cell(r.workedOut.map((s) => s.name).join("; ") || "none")} | ${r.deferrals.length} | ${flagsFailed} |`
    );
  }
  // The played turns
  const played = runs.filter((r) => r.turns.length > 0);
  if (played.length) {
    lines.push(
      "",
      "## The played turns (production's planners and turns on each arm's setup)",
      "",
      "| Reading | Production | moneySetup | Noise | Reading |",
      "|---|---|---|---|---|",
      row("By hand (blind): the turn's money adds up", c.turnsAddUp),
      row("By hand (blind): the turn names a sum paid or earned", c.turnsWithSum),
      row("By hand (blind): the run names a sum paid or earned in some turn", c.runsWithSum),
      "",
      "| Premise | Sample | Arm | Turn | Kind | Counted stats before -> after | Changes on them | Sentences naming an amount | Hand | Wait |",
      "|---|---|---|---|---|---|---|---|---|---|"
    );
    for (const run of played) {
      const code = codeOf(run);
      for (const [i, t] of readMoney2Turns(run).entries()) {
        const verdict = code ? hand.turns[`${code} t${t.turn}`] : undefined;
        const handText = verdict ? `${verdict.addsUp === "partial" ? "partial" : verdict.addsUp ? "adds up" : "does not add up"}${verdict.sum ? ", a sum" : ""}: ${verdict.note}` : "unread";
        lines.push(
          `| ${t.premise} | ${t.sample} | ${armName(t.variant)} | ${t.turn} | ${t.kind} | ${cell(t.counted.map((v) => `${v.name} ${JSON.stringify(v.before)} -> ${JSON.stringify(v.after)}`).join("; ") || "none")} | ${cell(t.changes.join("; ") || "none")} | ${t.amounts.length} | ${cell(handText)} | ${seconds(run.turns[i].waitMs)} |`
        );
      }
    }
    lines.push("", "| Arm | Turns | Wait p50 | Wait p95 | Cost of the turns and their plans |", "|---|---|---|---|---|");
    for (const variant of MONEY_2_SETUP_VARIANTS) {
      const turns = played.filter((r) => runArmOf(r).variant === variant).flatMap((r) => r.turns);
      lines.push(`| ${armName(variant)} | ${turns.length} | ${seconds(quantile(turns.map((t) => t.waitMs), 0.5))} | ${seconds(quantile(turns.map((t) => t.waitMs), 0.95))} | $${sum(turns.map((t) => t.costUsd)).toFixed(4)} |`);
    }
  }
  // Every setup's counted stats in full
  lines.push("", "## Every setup's counted stats", "");
  for (const { run, reading: r } of setups) {
    lines.push(`### ${r.premise}, ${armName(r.variant)}, sample ${r.sample}`, "");
    lines.push(...(r.counted.length ? r.counted.flatMap(statLines) : ["- no counted stat"]));
    if (r.workedOut.length) lines.push("", "Kept as stats though worked out from others:", ...r.workedOut.flatMap(statLines));
    lines.push("", `Other stats: ${r.stats.filter((s) => !r.counted.includes(s)).map((s) => `${s.name} (${s.type})`).join(", ") || "none"}.`);
    lines.push(`Payments put off: ${r.deferrals.join(" / ") || "none"}.`);
    lines.push(`Setup checks that failed: ${r.checksFailed.join(", ") || "none"}; setup calls ${r.setupCalls}; ${run.stopped}.`, "");
  }
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------- the turn line on the built cases

/** The turn line's arms: production's turn, fix 7's block B on it, and its fix-and-retest, on the single-player turn model. */
export const MONEY_2_TURN_VARIANTS = ["adopted", "moneyTurn", "moneyTurnB"] as const;
export type Money2TurnVariant = (typeof MONEY_2_TURN_VARIANTS)[number];
export const MONEY_2_TURN_ARMS = MONEY_2_TURN_VARIANTS.map((variant) => armKey(LUNA_MEDIUM, variant));

/** A turn the stage's arms wrote on a built case, the reply the game keeps, read for its money. */
export type Money2ReplyRow = Money2ReplyReading & {
  armKey: string;
  variant: Money2TurnVariant;
  caseId: string;
  sample: number;
  outputId?: string;
  /** Production's check asked once more (a one-paragraph text, no options) */
  retried: boolean;
  waitMs: number;
  costUsd: number;
  reasoningTokens: number;
  /** What the player chose on the turn before, which this turn narrates */
  chosenBefore: string;
};

/** Each kept reply of the turn line's arms under the stage's tag on its cases, read for its money. */
export async function money2ReplyRows(records: CallRecord[], cases: EvalCase[], load: (record: CallRecord) => unknown): Promise<Money2ReplyRow[]> {
  const byId = new Map(cases.filter((c) => (MONEY_2_TURN_CASES as readonly string[]).includes(c.id) && c.state).map((c) => [c.id, c]));
  const stage = records.filter((r) => r.stage === STAGE && r.promptState === MONEY_2_PROMPT_STATE && MONEY_2_TURN_ARMS.includes(r.armKey) && byId.has(r.caseId));
  const turns = await checkedTurns(stage, load, () => false);
  return turns.flatMap((turn): Money2ReplyRow[] => {
    const evalCase = byId.get(turn.caseId);
    const kept = asCall(turn, "kept");
    const reply = kept?.outputFile ? (load(kept) as SetOfBeatGenerationSchema | undefined) : undefined;
    if (!evalCase || !kept || !reply) return [];
    const story = caseStory(evalCase, false);
    const last = story.getCurrentBeat("player1");
    const choice = last?.choice;
    return [
      {
        ...readMoney2Reply(story, reply),
        armKey: turn.armKey,
        variant: MONEY_2_TURN_VARIANTS[MONEY_2_TURN_ARMS.indexOf(turn.armKey)],
        caseId: turn.caseId,
        sample: turn.sample,
        ...(kept.outputFile ? { outputId: outputIdOf(kept.outputFile) } : {}),
        retried: turn.retried !== undefined,
        waitMs: turn.waitMs,
        costUsd: turn.costUsd,
        reasoningTokens: (turn.first.reasoningTokens ?? 0) + (turn.retry?.reasoningTokens ?? 0),
        chosenBefore: typeof choice === "number" ? `${last?.options[choice]?.text ?? ""} (${last?.resolution ?? "no result"})` : "",
      },
    ];
  });
}

export type Money2ReplyKey = { salt: string; replies: Record<string, { armKey: string; caseId: string; sample: number }> };

/** A reply's code: five hex digits of the salted hash of its arm, case and sample, so no code says its arm. */
export const money2ReplyCode = (salt: string, row: Pick<Money2ReplyRow, "armKey" | "caseId" | "sample">) => sha256(`${salt}|${row.armKey}|${row.caseId}|${row.sample}`).slice(0, 5).toUpperCase();

export function money2ReplyKey(rows: Money2ReplyRow[], salt: string): Money2ReplyKey {
  const entries = rows.map((r) => [money2ReplyCode(salt, r), { armKey: r.armKey, caseId: r.caseId, sample: r.sample }] as const);
  if (new Set(entries.map(([code]) => code)).size !== entries.length) throw new Error("Two replies share a blind code: write the key again with another salt");
  return { salt, replies: Object.fromEntries(entries) };
}

const quotedText = (value: string) => `"${value.replace(/\s+/g, " ").trim()}"`;

/** money-2-turns-blind.md: per case, the counted stats before and what the player chose; then each reply under its code, the codes in order: its changes, the stats after, its text and the sentences naming an amount. No arm or sample is named. */
export function renderMoney2RepliesBlind(rows: Money2ReplyRow[], salt: string): string {
  const lines = [
    "# Blind reading: the turn line on the money-2 stage's lemonade turns",
    "",
    "Each reply: does every amount its text pays, spends, uses up, sells or earns move its stat by that amount in the turn's changes, with no change the text doesn't show (yes, no, or partial), and does it name a sum paid or earned (a sale, a purchase, a fee; not only a quote or a plan)? Record the verdicts by code in money2Hand.ts before the key is opened.",
    "",
  ];
  for (const caseId of [...new Set(rows.map((r) => r.caseId))].sort()) {
    const mine = rows.filter((r) => r.caseId === caseId);
    lines.push(`## ${caseId}`, "", `Chosen before: ${mine[0].chosenBefore || "nothing"}`, "", `Counted stats before: ${mine[0].counted.map((c) => `${c.name} (${c.group}) ${JSON.stringify(c.before)}`).join("; ") || "none"}`, "");
    for (const { r, code } of mine.map((r) => ({ r, code: money2ReplyCode(salt, r) })).sort((a, b) => a.code.localeCompare(b.code))) {
      lines.push(`### ${code}`, "");
      lines.push(`Changes on the counted stats: ${r.changes.join("; ") || "none"}`);
      lines.push(`After: ${r.counted.map((c) => `${c.name} ${JSON.stringify(c.after)}`).join("; ") || "none"}`);
      lines.push(`Sentences naming an amount: ${r.amounts.map(quotedText).join(" ") || "none"}`, "");
      lines.push(...r.text.split("\n").map((l) => `> ${l}`), "");
      if (r.interludes.length) lines.push(`Interludes: ${r.interludes.map(quotedText).join(" ")}`, "");
    }
  }
  return `${lines.join("\n")}\n`;
}

/**
 * The turn line (or its fix-and-retest) against production: the hand verdicts by code, unblinded through the key,
 * production read on the cases the candidate ran only.
 */
export function money2ReplyComparisons(
  rows: Money2ReplyRow[],
  key: Money2ReplyKey,
  hand: Record<string, Money2TurnVerdict>,
  candidate: Exclude<Money2TurnVariant, "adopted"> = "moneyTurn"
): { addsUp: Money2Comparison; sums: Money2Comparison } {
  const cases = new Set(rows.filter((r) => r.variant === candidate).map((r) => r.caseId));
  const read = rows
    .filter((r) => cases.has(r.caseId) && (r.variant === "adopted" || r.variant === candidate))
    .map((r) => ({ r, verdict: key.replies[money2ReplyCode(key.salt, r)] ? hand[money2ReplyCode(key.salt, r)] : undefined }));
  const items = (pick: (v: Money2TurnVerdict) => boolean | undefined) => read.map(({ r, verdict }) => ({ variant: r.variant, sample: r.sample, ...(verdict ? { read: pick(verdict) } : {}) }));
  return {
    addsUp: compareItems(items((v) => (v.addsUp === "partial" ? undefined : v.addsUp)), candidate),
    sums: compareItems(items((v) => v.sum), candidate),
  };
}

/** The report's section on the turn line: the hand reading against production, each reply's money, waits, retries, reasoning and cost. */
export function renderMoney2Replies(rows: Money2ReplyRow[], key: Money2ReplyKey | undefined, hand: Record<string, Money2TurnVerdict>): string[] {
  if (rows.length === 0) return [];
  const lines = ["", "## The turn line on the built cases (moneyTurn beside production's turn)", ""];
  if (key) {
    for (const candidate of ["moneyTurn", "moneyTurnB"] as const) {
      if (!rows.some((r) => r.variant === candidate)) continue;
      const c = money2ReplyComparisons(rows, key, hand, candidate);
      const cases = [...new Set(rows.filter((r) => r.variant === candidate).map((r) => r.caseId))].length;
      lines.push(
        `${candidate === "moneyTurn" ? "The turn line" : "Its fix-and-retest"} against production on the ${cases} cases it ran:`,
        "",
        `| Reading | Production | ${candidate} | Noise | Reading |`,
        "|---|---|---|---|---|",
        row("By hand (blind): the reply's money adds up", c.addsUp),
        row("By hand (blind): the reply names a sum paid or earned", c.sums),
        ""
      );
    }
  } else lines.push("No blind key yet: run --money-2-turns-blind.", "");
  const reasoning = (variant: string, sample?: number) => momentsOf(rows.filter((r) => r.variant === variant && (sample === undefined || r.sample === sample)).map((r) => r.reasoningTokens));
  const reasoningMove = meanMove(reasoning("adopted"), reasoning("moneyTurn"), Math.abs(reasoning("adopted", 1).mean - reasoning("adopted", 2).mean));
  lines.push("| Arm | Replies | Retried | Wait p50 | Wait p95 | Reasoning tokens (mean) | Cost a turn |", "|---|---|---|---|---|---|---|");
  for (const variant of MONEY_2_TURN_VARIANTS) {
    if (!rows.some((r) => r.variant === variant)) continue;
    const own = rows.filter((r) => r.variant === variant);
    lines.push(
      `| ${variant === "adopted" ? "production" : variant} | ${own.length} | ${own.filter((r) => r.retried).length} | ${seconds(quantile(own.map((r) => r.waitMs), 0.5))} | ${seconds(quantile(own.map((r) => r.waitMs), 0.95))} | ${reasoning(variant).mean.toFixed(0)} | $${(sum(own.map((r) => r.costUsd)) / Math.max(1, own.length)).toFixed(4)} |`
    );
  }
  lines.push("", `Reasoning tokens: ${reasoningMove.moved ? `moved ${reasoningMove.moved}` : reasoningMove.beyondNoise ? `beyond the noise, not moved (${(reasoningMove.standardErrors ?? 0).toFixed(1)} SE)` : "within the noise"}.`, "");
  lines.push("| Case | Sample | Arm | Counted stats before -> after | Changes on them | Sentences naming an amount | Hand |", "|---|---|---|---|---|---|---|");
  for (const r of [...rows].sort((a, b) => a.caseId.localeCompare(b.caseId) || a.sample - b.sample || a.variant.localeCompare(b.variant))) {
    const code = key ? money2ReplyCode(key.salt, r) : undefined;
    const v = code ? hand[code] : undefined;
    const handText = v ? `${v.addsUp === "partial" ? "partial" : v.addsUp ? "adds up" : "does not add up"}${v.sum ? ", a sum" : ""}: ${v.note}` : "unread";
    lines.push(
      `| ${r.caseId} | ${r.sample} | ${r.variant === "adopted" ? "production" : r.variant} | ${cell(r.counted.map((c) => `${c.name} ${JSON.stringify(c.before)} -> ${JSON.stringify(c.after)}`).join("; ") || "none")} | ${cell(r.changes.join("; ") || "none")} | ${r.amounts.length} | ${cell(handText)} |`
    );
  }
  return lines;
}

// ---------------------------------------------------------------- the modes

const runsOf = (files: EvalFiles) => playthroughRunsFrom(files.readPlaythroughs(FILE));
/** The stage's spend: its setups and short playthroughs (prep-calls.jsonl) and its turn line's runs (calls.jsonl). */
const spentIn = (files: EvalFiles) => sum([...files.readPrepRecords(), ...files.readRecords()].filter((r) => r.stage === STAGE).map((r) => r.costUsd));

/** money-2.md and .json from the stage's runs and its turn line's replies, the hand readings unblinded where the keys are written; no calls. */
export async function writeMoney2(ctx: Pick<PrepContext, "files" | "log">, runs: PlayRun[] = runsOf(ctx.files), hand: Money2Hand = MONEY_2_HAND, replyHand: Record<string, Money2TurnVerdict> = MONEY_2_REPLY_HAND): Promise<void> {
  const { files, log } = ctx;
  const key = files.readBlindKey(BLIND_FILE) as Money2BlindKey | undefined;
  const replyKey = files.readBlindKey(REPLIES_BLIND_FILE) as Money2ReplyKey | undefined;
  const generatedAt = new Date();
  const spendUsd = spentIn(files);
  const comparisons = key ? money2Comparisons(runs, key, hand) : undefined;
  const replies = files.casesExist() ? await money2ReplyRows(files.readRecords(), files.readCases(), files.loadOutput) : [];
  const replyComparisons = replyKey && replies.length ? money2ReplyComparisons(replies, replyKey, replyHand) : undefined;
  const retestComparisons = replyKey && replies.some((r) => r.variant === "moneyTurnB") ? money2ReplyComparisons(replies, replyKey, replyHand, "moneyTurnB") : undefined;
  const json = {
    generatedAt: generatedAt.toISOString(),
    stage: STAGE,
    promptState: MONEY_2_PROMPT_STATE,
    arms: MONEY_2_SETUP_VARIANTS,
    turnArms: MONEY_2_TURN_ARMS,
    runs,
    setups: runs.filter((r) => r.setup?.output !== undefined).map(readMoney2Setup),
    turns: runs.flatMap(readMoney2Turns),
    ...(comparisons ? { comparisons } : {}),
    replies,
    ...(replyComparisons ? { replyComparisons } : {}),
    ...(retestComparisons ? { retestComparisons } : {}),
    spendUsd,
  };
  const markdown = `${renderMoney2(runs, key, hand, { spendUsd, generatedAt }).trimEnd()}\n${renderMoney2Replies(replies, replyKey, replyHand).join("\n")}\n`;
  files.writePlaythroughs(markdown, json, FILE);
  if (comparisons) {
    log(
      `By hand: setups production ${tallyText(comparisons.setups.production)}, moneySetup ${tallyText(comparisons.setups.variant)}, ${moveText(comparisons.setups)}; turns adding up production ${tallyText(comparisons.turnsAddUp.production)}, moneySetup ${tallyText(comparisons.turnsAddUp.variant)}.`
    );
  }
  if (replyComparisons) {
    log(`The turn line, by hand: adds up production ${tallyText(replyComparisons.addsUp.production)}, moneyTurn ${tallyText(replyComparisons.addsUp.variant)}, ${moveText(replyComparisons.addsUp)}.`);
  }
  if (retestComparisons) {
    log(`Its fix-and-retest, by hand: adds up production ${tallyText(retestComparisons.addsUp.production)}, moneyTurnB ${tallyText(retestComparisons.addsUp.variant)}, ${moveText(retestComparisons.addsUp)}.`);
  }
  log(`Wrote money-2.md and .json (${runs.length} runs, ${replies.length} turn-line replies); spent in the stage so far $${spendUsd.toFixed(4)}.`);
}

/** Freezes the stage's turn cases from its own lemonade runs (money2Cases.ts), each only where its request is the one production sent; no calls. */
export function buildMoney2CasesMode(ctx: Pick<PrepContext, "files" | "log">, replace: boolean): void {
  const { files, log } = ctx;
  if (!files.casesExist()) throw new Error("No frozen cases. Run --build-cases first.");
  const runs = runsOf(files);
  if (runs.length === 0) throw new Error("No runs in money-2.json. Run --money-2-play first.");
  const byId = new Map(files.readPrepRecords().flatMap((r) => (r.outputFile && r.promptHash ? [[outputIdOf(r.outputFile), r.promptHash] as [string, string]] : [])));
  const { cases, problems, skipped } = money2TurnCasesToFreeze(files.readCases(), runs, (file) => byId.get(outputIdOf(file)), replace);
  if (problems.length) throw new Error(problems.join("; "));
  if (skipped.length) log(`Already frozen, left as they are: ${skipped.join(", ")}.`);
  if (cases.length === 0) return log("Nothing new to freeze; no calls.");
  files.addCases(cases, undefined, replace);
  log(`Froze ${cases.map((c) => c.id).join(", ")} beside the other cases; no calls.`);
}

/** money-2-turns-blind.md and its key (the same salt once written); no calls. */
export async function money2TurnsBlindMode(ctx: Pick<PrepContext, "files" | "log">): Promise<void> {
  const { files, log } = ctx;
  const rows = await money2ReplyRows(files.readRecords(), files.readCases(), files.loadOutput);
  if (rows.length === 0) throw new Error(`No turn-line replies under ${MONEY_2_PROMPT_STATE}. Run --run --stage money-2 --role beat first.`);
  const held = files.readBlindKey(REPLIES_BLIND_FILE) as Money2ReplyKey | undefined;
  const salt = held?.salt ?? sha256(`${Date.now()}|${Math.random()}`).slice(0, 16);
  files.writeBlindKey(REPLIES_BLIND_FILE, money2ReplyKey(rows, salt));
  const where = files.writeBlindReading(REPLIES_BLIND_FILE, renderMoney2RepliesBlind(rows, salt));
  log(`${rows.length} replies, coded. Wrote ${where}; the key is in keys/${REPLIES_BLIND_FILE}.json (read it only after the verdicts are in money2Hand.ts).`);
}

export async function money2PlayMode(ctx: PrepContext, options: { sample: number; caseIds?: string[]; turns?: number; reportOnly?: boolean; armKeys?: string[] }): Promise<void> {
  const { files, log } = ctx;
  const variants = money2PlayVariants(options.armKeys);
  const specs = MONEY_2_SPECS.filter((s) => !options.caseIds?.length || options.caseIds.includes(s.spec.id));
  if (specs.length === 0) throw new Error(`No premise of the money-2 stage among --cases; one of ${MONEY_2_SPECS.map((s) => s.spec.id).join(", ")}`);
  const played: PlayRun[] = [];
  if (!options.reportOnly) {
    const spend = spentByStage([...files.readRecords(), ...spendBeside(files, "calls")]);
    const stageLeft = ctx.caps.stageCaps[STAGE] - spend.byStage[STAGE];
    const limit = Math.min(ctx.caps.maxSpend ?? Number.POSITIVE_INFINITY, stageLeft, ctx.caps.globalCap - spend.total);
    log(
      `Playing ${specs.map((s) => s.spec.id).join(", ")} on ${variants.join(" and ")} (sample ${options.sample}${options.turns !== undefined ? `, at most ${options.turns} turns each` : ""}); this invocation spends at most $${limit.toFixed(4)} (stage ${STAGE} spent $${spend.byStage[STAGE].toFixed(4)} of $${ctx.caps.stageCaps[STAGE]}; the ledger $${spend.total.toFixed(2)} of $${ctx.caps.globalCap})`
    );
    const call = budgetedPrepCall(ctx, {
      stage: STAGE,
      promptState: MONEY_2_PROMPT_STATE,
      sample: options.sample,
      limitUsd: limit,
      rerunHint: "the dice are seeded, so the code or a reply changed; play a new sample with --samples <n>",
    });
    const jobs = specs.flatMap((entry) => variants.map(async (variant) => (await playMoney2(entry, variant, (s) => call({ kind: "play", ...s }), options.sample, options.turns)).run));
    const settled = await Promise.allSettled(jobs);
    settled.forEach((outcome) => {
      if (outcome.status === "fulfilled") played.push(outcome.value);
      else log(`A run stopped: ${outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)}`);
    });
  }
  const all = mergeMoney2Runs(runsOf(files), played);
  for (const run of played) log(`${run.spec.id} s${run.sample}: ${run.turns.length} turns, stopped: ${run.stopped}`);
  await writeMoney2(ctx, all);
}

/** money-2-blind.md and its key (the same salt once written); no calls. */
export function money2BlindMode(ctx: Pick<PrepContext, "files" | "log">): void {
  const { files, log } = ctx;
  const runs = runsOf(files).filter((r) => r.setup?.output !== undefined);
  if (runs.length === 0) throw new Error("No setups in money-2.json. Run --money-2-play first.");
  const held = files.readBlindKey(BLIND_FILE) as Money2BlindKey | undefined;
  const salt = held?.salt ?? sha256(`${Date.now()}|${Math.random()}`).slice(0, 16);
  files.writeBlindKey(BLIND_FILE, money2BlindKey(runs, salt));
  const where = files.writeBlindReading(BLIND_FILE, renderMoney2Blind(runs, salt));
  log(`${runs.length} setups and ${sum(runs.map((r) => r.turns.length))} played turns, coded. Wrote ${where}; the key is in keys/${BLIND_FILE}.json (read it only after the verdicts are in money2Hand.ts).`);
}

/** The dry run's lines for the stage: each premise's calls and cost per arm and sample, what the file holds, and the stage's spend. */
export function printMoney2Plan(files: EvalFiles, log: (line: string) => void): void {
  const costsFor = measuredCallCosts(files.readRecords());
  const held = runsOf(files);
  log(`\nMoney and counts in learning stories (--money-2-play, stage ${STAGE}, cap $${DEFAULT_STAGE_CAPS[STAGE]}, under ${MONEY_2_PROMPT_STATE}; production's setup and moneySetup, one sample per invocation):`);
  let total = 0;
  let calls = 0;
  for (const entry of MONEY_2_SPECS) {
    const estimate = money2Estimate(entry, costsFor);
    total += MONEY_2_SETUP_VARIANTS.length * estimate.usd;
    calls += MONEY_2_SETUP_VARIANTS.length * estimate.calls;
    const runs = held.filter((r) => runArmOf(r).premise === entry.spec.id).map((r) => `${runArmOf(r).variant} s${r.sample}: ${r.turns.length} turns`);
    log(`  ${entry.spec.id}: setup${entry.turns ? ` and ${entry.turns} turns` : " only"}, ${estimate.calls} calls an arm, est $${estimate.usd.toFixed(4)} an arm${runs.length ? `; held: ${runs.join("; ")}` : ""}`);
  }
  log(`  A sample of both arms: ${calls} calls, est $${total.toFixed(3)} before retries (two samples ${2 * calls} calls, $${(2 * total).toFixed(3)}); spent in the stage so far $${spentIn(files).toFixed(4)}`);
}
