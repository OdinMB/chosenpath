import { chainSides } from "./arms.js";
import { COST_BASES, computeArmStats, percentile, type ArmStats, type CostBasis } from "./armStats.js";
import type { Caps } from "./budget.js";
import { LEDGER_STAGES, spentByStage } from "./budget.js";
import type { CaseTags } from "./cases.js";
import {
  byBasis,
  gates,
  MULTIPLAYER_SLACK_S,
  NO_PREGEN_BAR,
  PER_STORY_WITH_PREGEN,
  PREGEN_TURN_CAP_S,
  SETUP_WAIT_FACTOR,
  setupReading,
  storyCost,
  type GameplayConfig,
} from "./gateReadings.js";
import type { ProbeReport } from "./probe.js";
import type { CheckResult } from "./textChecks.js";
import type { CallRecord } from "./runner.js";
import { FIRST_ATTEMPT_FLOOR, validityVerdict } from "./validityGate.js";
import { variantComparisons, type CheckReading, type VariantComparison } from "./variantComparison.js";
import { PRE_FIX_PROMPT_STATE } from "./variants.js";
import { PRODUCTION_MAX_RETRIES } from "shared/llm/chatModel.js";

/*
 * Renders results.md: spend, probe, per-arm validity, latency, tokens and
 * cost, rule rates against the baseline's noise floor, and the owner's gate
 * readings as views (single-player with and without pregeneration,
 * multiplayer, setup), then the variants against their reference (Stage 3
 * trims, Stage 4 rewrite), with input and caching. The statistics live in
 * armStats.ts, the readings in gateReadings.ts and the variant pairing in
 * variantComparison.ts; this file only lays them out, all of them. It marks
 * each reading within or over and never picks a winner.
 */

export type ResultsInput = {
  records: CallRecord[];
  checks: Map<string, CheckResult>;
  tags: Map<string, CaseTags>;
  caps: Caps;
  probe?: ProbeReport;
  /** The filter check's spend (filter-check.jsonl), its own ledger stage */
  filterCheckUsd?: number;
  prose?: Record<string, { distinctOpenings: number; youOpenings: number; beats: number; stockPhrasesPer1000Words: number }>;
  generatedAt: Date;
};

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const secs = (x?: number) => (x === undefined ? "–" : `${x.toFixed(1)} s`);
const usd = (x?: number) => (x === undefined ? "–" : `$${x.toFixed(4)}`);
const tokens = (x?: number) => (x === undefined ? "–" : String(Math.round(x)));
const rate = (hits: number, n: number) => (n === 0 ? 0 : hits / n);

function configsFor(stats: ArmStats[], promptState: string) {
  const inState = stats.filter((s) => s.promptState === promptState);
  const find = (group: CallRecord["group"], key?: string) =>
    inState.find((s) => s.group === group && (key === undefined ? s.baseline : s.armKey === key));
  // Pipeline chains measure the beat arm's analysis-turn wait
  const withChains = (beat: ArmStats): ArmStats => {
    const chain = inState.find((s) => s.group === "pipeline" && s.baseline === beat.baseline && chainSides(s.armKey)?.beat === beat.armKey);
    return chain ? { ...beat, turnLatencies: chain.turnLatencies } : beat;
  };
  const baselineBeat = find("beat");
  if (!baselineBeat) return undefined;
  const baseline: GameplayConfig = { beat: withChains(baselineBeat), switch: find("switch"), thread: find("thread"), setup: find("setup") };
  const candidates = inState
    .filter((s) => s.group === "beat" && !s.baseline)
    .map((beat): [string, GameplayConfig] => [
      beat.armKey,
      { beat: withChains(beat), switch: find("switch", beat.armKey) ?? baseline.switch, thread: find("thread", beat.armKey) ?? baseline.thread, setup: baseline.setup },
    ]);
  return { baseline, candidates, setupArms: inState.filter((s) => s.group === "setup") };
}

const within = (ok: boolean) => (ok ? "within" : "over");
const bothBases = (read: (basis: CostBasis) => number) => `${usd(read("billed"))} / ${usd(read("uncached"))}`;

type Named = [string, GameplayConfig];

function renderPregenView(all: Named[], baseline: GameplayConfig): string[] {
  const lines = [
    "",
    "**Single-player, pregeneration on.** Cost against the baseline's per-story cost on each basis; waits against the 60 s cap.",
    "",
    "| Gameplay arm | $/story billed | Billed cap | $/story uncached | Uncached cap | Beat-only p95 | Analysis-turn p95 | 60 s cap |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const [name, config] of all) {
    const { cost, pregenTurn } = gates(config, baseline);
    const cap = (basis: CostBasis) => `${within(cost[basis].withinCap)} (${usd(cost[basis].baselinePerStory)})`;
    lines.push(
      `| ${name} | ${usd(cost.billed.perStory)} | ${cap("billed")} | ${usd(cost.uncached.perStory)} | ${cap("uncached")} | ${secs(pregenTurn.beatOnlyP95)} | ${secs(pregenTurn.analysisTurnP95)} (${pregenTurn.source}) | ${within(pregenTurn.pass)} |`
    );
  }
  return lines;
}

function renderNoPregenView(all: Named[], baseline: GameplayConfig): string[] {
  const lines = [
    "",
    `**Single-player, no pregeneration** (reported, not gated; flag at a full-turn median of at most ${NO_PREGEN_BAR.medianS} s and a p95 of at most ${NO_PREGEN_BAR.p95S} s).`,
    "",
    "| Gameplay arm | $/story billed / uncached | Full-turn median | Full-turn p95 | Flag |",
    "|---|---|---|---|---|",
  ];
  for (const [name, config] of all) {
    const { noPregen } = gates(config, baseline);
    lines.push(
      `| ${name} | ${bothBases((basis) => noPregen.perStory[basis])} | ${secs(noPregen.median)} | ${secs(noPregen.p95)} | ${noPregen.exception ? "yes" : "no"} |`
    );
  }
  return lines;
}

function renderMultiplayerView(all: Named[], baseline: GameplayConfig): string[] {
  const lines = [
    "",
    `**Multiplayer.** Beat p95 against the baseline's (+${MULTIPLAYER_SLACK_S} s is "ok"; above that but within ${PREGEN_TURN_CAP_S} s "needs multiplayer pregeneration"); $ per custom story billed / uncached.`,
    "",
    "| Gameplay arm | Beat p95 by players | Verdict | $/story without multiplayer pregeneration | $/story with multiplayer pregeneration |",
    "|---|---|---|---|---|",
  ];
  for (const [name, config] of all) {
    const { multiplayer } = gates(config, baseline);
    const waits = Object.entries(multiplayer.byPlayers)
      .map(([players, v]) => `${players}p ${secs(v.p95)} (base ${secs(v.baselineP95)})`)
      .join("; ");
    const costs = (pick: "withoutMpPregen" | "withMpPregen") =>
      Object.entries(multiplayer.costByPlayers)
        .map(([players, cost]) => `${players}p ${bothBases((basis) => cost[basis][pick])}`)
        .join("; ");
    lines.push(`| ${name} | ${waits || "–"} | ${multiplayer.verdict} | ${costs("withoutMpPregen") || "–"} | ${costs("withMpPregen") || "–"} |`);
  }
  return lines;
}

function renderSetupView(setupArms: ArmStats[], baseline: GameplayConfig): string[] {
  const base = baseline.setup;
  const cap = (value?: number) => (value === undefined ? "–" : secs(SETUP_WAIT_FACTOR * value));
  const lines = [
    "",
    `**Setup.** The cap is ${SETUP_WAIT_FACTOR} × today's wait, read on the median and on the p95.`,
    "",
    `| Setup arm | Median | Median cap (${cap(base?.latency.p50)}) | p95 | p95 cap (${cap(base?.latency.p95)}) | $/setup billed / uncached |`,
    "|---|---|---|---|---|---|",
  ];
  for (const arm of setupArms) {
    const reading = setupReading(arm, base);
    const verdict = (ok: boolean) => (arm.baseline ? "baseline" : within(ok));
    lines.push(
      `| ${arm.armKey} | ${secs(reading.median)} | ${verdict(reading.medianWithinCap)} | ${secs(reading.p95)} | ${verdict(reading.p95WithinCap)} | ${bothBases((basis) => arm.cost[basis].perCall)} |`
    );
  }
  return lines;
}

function renderSetupMatrix(setupArms: ArmStats[], all: Named[], baseline: GameplayConfig): string[] {
  const cap = byBasis((basis) => storyCost(baseline, basis).withPregen);
  const lines = [
    "",
    `**Per-story cost, setup arm × gameplay arm** (single-player, pregeneration on; billed / uncached; caps ${usd(cap.billed)} / ${usd(cap.uncached)}):`,
    "",
    `| Setup \\ Gameplay | ${all.map(([name]) => name).join(" | ")} |`,
    `|---|${all.map(() => "---").join("|")}|`,
  ];
  for (const setup of setupArms) {
    const cells = all.map(([, config]) => {
      const cost = byBasis((basis) => storyCost({ ...config, setup }, basis).withPregen);
      const over = COST_BASES.filter((basis) => cost[basis] > cap[basis]);
      return `${bothBases((basis) => cost[basis])}${over.length ? ` (over: ${over.join(", ")})` : ""}`;
    });
    lines.push(`| ${setup.armKey} | ${cells.join(" | ")} |`);
  }
  return lines;
}

/** The pre-fix baseline (Run A): what production pays and waits today. */
function todaysProduction(stats: ArmStats[], promptState: string): string[] {
  const prefix = configsFor(stats, PRE_FIX_PROMPT_STATE);
  if (promptState === PRE_FIX_PROMPT_STATE || !prefix) return [];
  const cost = byBasis((basis) => storyCost(prefix.baseline, basis).withPregen);
  const setup = prefix.baseline.setup?.latency;
  return [
    "",
    `Today's production (the pre-fix baseline): ${usd(cost.billed)} billed / ${usd(cost.uncached)} uncached per custom story with pregeneration; setup median ${secs(setup?.p50)}, p95 ${secs(setup?.p95)}.`,
  ];
}

function renderViews(stats: ArmStats[], promptState: string): string[] {
  const configs = configsFor(stats, promptState);
  if (!configs) return [`No baseline beat results for prompt state ${promptState} yet.`];
  const all: Named[] = [["baseline " + configs.baseline.beat.armKey, configs.baseline], ...configs.candidates];
  const lines = [
    "",
    "These are readings, not verdicts: each is marked within or over, no arm is dropped, and the owner decides which reading applies.",
    ...todaysProduction(stats, promptState),
    ...renderPregenView(all, configs.baseline),
    ...renderNoPregenView(all, configs.baseline),
    ...renderMultiplayerView(all, configs.baseline),
  ];
  if (configs.setupArms.length > 0) {
    lines.push(...renderSetupView(configs.setupArms, configs.baseline), ...renderSetupMatrix(configs.setupArms, all, configs.baseline));
  }
  return lines;
}

/** Per isolated arm; pipeline chains are left out (the isolated arms carry validity). */
function renderValidityGate(stats: ArmStats[], promptState: string): string[] {
  const inState = stats.filter((s) => s.promptState === promptState && s.group !== "pipeline");
  const lines = [
    "",
    `### Validity gate (first attempt at least ${pct(FIRST_ATTEMPT_FLOOR)}; 100% within production's ${PRODUCTION_MAX_RETRIES} retries; worse than the role's baseline only at Fisher p < 0.05; transport failures left out)`,
    "",
    "| Role | Arm | Calls | 1st-attempt valid | Valid within retries | p (worse than baseline) | Verdict |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const s of inState) {
    const baseline = s.baseline ? undefined : inState.find((b) => b.baseline && b.group === s.group);
    const v = validityVerdict(s.validity, baseline?.validity);
    const reasons = [
      v.firstAttemptOk ? "" : "below floor",
      v.withinRetriesOk ? "" : "invalid after retries",
      v.worseThanBaseline ? "worse than baseline" : "",
    ].filter(Boolean);
    const { calls, firstAttemptValid, validWithinRetries, transportOnly } = s.validity;
    lines.push(
      `| ${s.group} | ${s.armKey}${s.baseline ? " (baseline)" : ""} | ${calls}${transportOnly ? ` (+${transportOnly} transport-only)` : ""} | ${firstAttemptValid}/${calls} (${pct(rate(firstAttemptValid, calls))}) | ${validWithinRetries}/${calls} | ${v.pWorse === undefined ? "–" : v.pWorse.toFixed(3)} | ${v.pass ? "pass" : `FAIL: ${reasons.join(", ")}`} |`
    );
  }
  return lines;
}

// ------------------------------------------------ Variants against their reference

/** "reference → arm (±n%)" */
function fromTo(reference: number | undefined, arm: number | undefined, format: (x?: number) => string): string {
  const change =
    reference && arm !== undefined ? ` (${arm >= reference ? "+" : "-"}${Math.abs(Math.round(((arm - reference) / reference) * 100))}%)` : "";
  return `${format(reference)} → ${format(arm)}${change}`;
}

const share = (x?: number) => (x === undefined ? "–" : pct(x));

/** Calls of this role in a single-player story with pregeneration (85/19/21, and one setup). */
function callsPerStory(group: CallRecord["group"]): number | undefined {
  switch (group) {
    case "setup":
      return 1;
    case "beat":
    case "switch":
    case "thread":
      return PER_STORY_WITH_PREGEN[group];
    default:
      return undefined;
  }
}

/** A call's share of a single-player story with pregeneration, at its 1-player cost where it has one. */
function storyShare(stats: ArmStats, basis: CostBasis = "billed"): number | undefined {
  const calls = callsPerStory(stats.group);
  const onePlayer = stats.cost[basis].byPlayers[1] ?? stats.cost[basis].perCall;
  return calls === undefined ? undefined : calls * onePlayer;
}

function renderArmRows(comparisons: VariantComparison[]): string[] {
  const lines = [
    "| Role | Arm | Reference | Pairs | 1st-attempt valid | Visible tokens | Reasoning tokens | p50 wait | p95 wait | $/call billed | Per 1-player story with pregeneration |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const { group, armKey, referenceKey, pairs, arm: a, reference: r } of comparisons) {
    const valid = (s: ArmStats) => `${s.validity.firstAttemptValid}/${s.validity.calls}`;
    lines.push(
      `| ${group} | ${armKey} | ${referenceKey} | ${pairs} | ${valid(r)} → ${valid(a)} | ${fromTo(r.medianTokens.visible, a.medianTokens.visible, tokens)} | ${fromTo(r.medianTokens.reasoning, a.medianTokens.reasoning, tokens)} | ${fromTo(r.latency.p50, a.latency.p50, secs)} | ${fromTo(r.latency.p95, a.latency.p95, secs)} | ${fromTo(r.cost.billed.perCall, a.cost.billed.perCall, usd)} | ${fromTo(storyShare(r), storyShare(a), usd)} |`
    );
  }
  return lines;
}

/** Caching per comparison: what the arm's split requests read and wrote, and what input costs with caching and without. */
function renderInputRows(comparisons: VariantComparison[]): string[] {
  const lines = [
    "",
    "**Input and caching** (reference → arm; uncached is caching off, every input token at the input rate).",
    "",
    "| Role | Arm | Cache lines | Calls that wrote | Cache read share | Median input tokens | Input $/call billed | Input $/call uncached | $/call billed | $/call uncached | Per 1-player story billed | Per 1-player story uncached |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const { group, armKey, arm: a, reference: r } of comparisons) {
    const cells = [
      fromTo(r.cache.lines, a.cache.lines, tokens),
      fromTo(r.cache.writingCalls, a.cache.writingCalls, tokens),
      fromTo(r.cache.readShare, a.cache.readShare, share),
      fromTo(r.medianTokens.input, a.medianTokens.input, tokens),
      fromTo(r.inputCost.billed, a.inputCost.billed, usd),
      fromTo(r.inputCost.uncached, a.inputCost.uncached, usd),
      fromTo(r.cost.billed.perCall, a.cost.billed.perCall, usd),
      fromTo(r.cost.uncached.perCall, a.cost.uncached.perCall, usd),
      fromTo(storyShare(r, "billed"), storyShare(a, "billed"), usd),
      fromTo(storyShare(r, "uncached"), storyShare(a, "uncached"), usd),
    ];
    lines.push(`| ${group} | ${armKey} | ${cells.join(" | ")} |`);
  }
  return lines;
}

function renderStateRows(comparisons: VariantComparison[]): string[] {
  const lines = [
    "",
    "| Role | Arm | State counts per call, reference (±noise) → arm | Checks lower than the reference beyond noise | Checks higher than the reference beyond noise |",
    "|---|---|---|---|---|",
  ];
  const rates = (checks: CheckReading[]) => checks.map((c) => `${c.name} ${pct(c.reference)} → ${pct(c.arm)}`).join("; ") || "–";
  for (const c of comparisons) {
    const counts = c.counts
      .map((n) => `${n.name} ${n.reference.toFixed(2)}${n.noise === undefined ? "" : ` (±${n.noise.toFixed(2)})`} → ${n.arm.toFixed(2)}`)
      .join("; ");
    const flagged = c.hasNoise
      ? `${rates(c.checks.filter((k) => k.flag === "lower"))} | ${rates(c.checks.filter((k) => k.flag === "higher"))}`
      : `one reference sample, no noise floor; raw rates: ${rates(c.checks)} | –`;
    lines.push(`| ${c.group} | ${c.armKey} | ${counts || "–"} | ${flagged} |`);
  }
  return lines;
}

function renderSetupWaits(comparisons: VariantComparison[]): string[] {
  const setups = comparisons.filter((c) => c.group === "setup");
  if (setups.length === 0) return [];
  const byPlayers = ({ arm, reference }: VariantComparison) =>
    Object.keys(arm.latencyByPlayers)
      .map(Number)
      .sort((a, b) => a - b)
      .map((n) => `${n}p ${fromTo(percentile(reference.latencyByPlayers[n] ?? [], 50), percentile(arm.latencyByPlayers[n], 50), secs)}`)
      .join("; ");
  return ["", "Setup median wait by player count, reference → arm:", ...setups.map((c) => `- ${c.armKey}: ${byPlayers(c)}`)];
}

function renderChainWaits(comparisons: VariantComparison[]): string[] {
  const chains = comparisons.filter((c) => c.group === "pipeline");
  if (chains.length === 0) return [];
  const wait = (c: VariantComparison, p: number) =>
    fromTo(percentile(c.reference.turnLatencies, p), percentile(c.arm.turnLatencies, p), secs);
  return [
    "",
    "| Chain (analysis-turn wait, single-player) | p50 reference → arm | p95 reference → arm |",
    "|---|---|---|",
    ...chains.map((c) => `| ${c.armKey} | ${wait(c, 50)} | ${wait(c, 95)} |`),
  ];
}

function renderVariantComparison(comparisons: VariantComparison[]): string[] {
  if (comparisons.length === 0) return [];
  return [
    "",
    "### Variants against their reference (Stage 3 trims, Stage 4 rewrite)",
    "",
    "Readings on paired cases: each variant arm against its reference arm (a trim against its full form; a rewrite against the form it rewrites, today's baseline included; a verbosity arm against the same arm without it), on the (case, sample) pairs both finished. Columns read reference → arm. Checks are flagged beyond the reference's own noise: its sample 1 against its sample 2 on the matched cases. Waits carry server drift where the reference ran earlier; tokens and cost do not. Nothing is dropped or picked.",
    "",
    ...renderArmRows(comparisons),
    ...renderInputRows(comparisons),
    ...renderStateRows(comparisons),
    ...renderSetupWaits(comparisons),
    ...renderChainWaits(comparisons),
  ];
}

export function renderResults(input: ResultsInput): string {
  const stats = computeArmStats(input.records, input.checks, input.tags);
  // Probe spend lives in probe.json, not calls.jsonl; it counts against Stage 0 as the caps do
  const probeSpend = input.probe ? input.probe.totalCostUsd + (input.probe.priorSpendUsd ?? 0) : 0;
  const spend = spentByStage([
    ...input.records,
    { stage: "0", costUsd: probeSpend },
    { stage: "filter", costUsd: input.filterCheckUsd ?? 0 },
  ]);
  const lines: string[] = [
    "# Text-model eval: results",
    "",
    `Generated ${input.generatedAt.toISOString()}. This report never picks a winner; the owner's rating does.`,
    "",
    "## Spend by stage",
    "",
    "| Stage | Spent | Cap |",
    "|---|---|---|",
    ...LEDGER_STAGES.map((stage) => `| ${stage} | $${spend.byStage[stage].toFixed(2)} | $${input.caps.stageCaps[stage].toFixed(2)} |`),
    `| total | $${spend.total.toFixed(2)} | $${input.caps.globalCap.toFixed(2)} |`,
  ];
  if (input.probe) {
    lines.push(
      "",
      "## Probe",
      "",
      ...input.probe.results.map(
        (r) => `- ${r.model} ${r.id}: ${r.outcome}${r.status ? ` ${r.status}` : ""}${r.param ? ` param=${r.param}` : ""}${r.note ? ` (${r.note})` : ""}`
      )
    );
  }
  for (const promptState of [...new Set(stats.map((s) => s.promptState))]) {
    lines.push("", `## Prompt state: ${promptState}`, "", "### Validity, latency, tokens and cost per call", "");
    lines.push(
      "| Role | Arm | Calls | Repaired | Refusal | Length | Rejected param | Text after JSON | Junk | p50 | p95 | Median tokens in / cached / write / out / reasoning | $/call billed (uncached) |",
      "|---|---|---|---|---|---|---|---|---|---|---|---|---|"
    );
    for (const s of stats.filter((x) => x.promptState === promptState)) {
      const t = s.medianTokens;
      lines.push(
        `| ${s.group} | ${s.armKey}${s.baseline ? " (baseline)" : ""} | ${s.calls} | ${pct(s.rates.repaired)} | ${pct(s.rates.refusal)} | ${pct(s.rates.length)} | ${pct(s.rates.rejectedParam)} | ${pct(s.rates.textAfterJson)} | ${pct(s.rates.junk)} | ${secs(s.latency.p50)} | ${secs(s.latency.p95)} | ${t.input} / ${t.cached} / ${t.cacheWrite} / ${t.output} / ${t.reasoning} | ${usd(s.cost.billed.perCall)} (${usd(s.cost.uncached.perCall)}) |`
      );
    }
    lines.push(...renderValidityGate(stats, promptState));
    lines.push("", "### Rule and state checks (pass rate; baseline noise floor in brackets)", "");
    for (const group of [...new Set(stats.filter((s) => s.promptState === promptState).map((s) => s.group))]) {
      const inGroup = stats.filter((s) => s.promptState === promptState && s.group === group);
      const names = [...new Set(inGroup.flatMap((s) => Object.keys(s.ruleRates)))].sort();
      if (names.length === 0) continue;
      lines.push(`**${group}**`, "", `| Check | ${inGroup.map((s) => s.armKey).join(" | ")} |`, `|---|${inGroup.map(() => "---").join("|")}|`);
      for (const name of names) {
        lines.push(
          `| ${name} | ${inGroup
            .map((s) => (name in s.ruleRates ? `${pct(s.ruleRates[name])}${s.baseline && name in s.noiseFloor ? ` [±${pct(s.noiseFloor[name])}]` : ""}` : "–"))
            .join(" | ")} |`
        );
      }
      lines.push("");
    }
    lines.push("### Views: single-player with and without pregeneration, multiplayer, setup", ...renderViews(stats, promptState));
    lines.push(...renderVariantComparison(variantComparisons(input.records, input.checks, input.tags, promptState)));
  }
  if (input.prose) {
    lines.push("", "## Prose aggregates (beats)", "", "| Arm | Beats | Distinct openings | Opens with \"You\" | Stock phrases / 1000 words |", "|---|---|---|---|---|");
    for (const [arm, p] of Object.entries(input.prose)) {
      lines.push(`| ${arm} | ${p.beats} | ${p.distinctOpenings} | ${p.youOpenings} | ${p.stockPhrasesPer1000Words.toFixed(2)} |`);
    }
  }
  return `${lines.join("\n")}\n`;
}
