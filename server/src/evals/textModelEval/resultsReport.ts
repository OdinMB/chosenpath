import { costFromUsage, type Stage } from "./arms.js";
import type { Caps } from "./budget.js";
import { spentByStage } from "./budget.js";
import type { CaseTags } from "./cases.js";
import type { ProbeReport } from "./probe.js";
import type { CheckResult } from "./textChecks.js";
import { usable, type CallRecord } from "./runner.js";

/*
 * results.md from the call records and the automatic checks: validity,
 * rule rates against the baseline and its noise floor, latency, tokens and
 * cost, and the owner's three views (single-player with and without
 * pregeneration, multiplayer). The report never picks a winner.
 */

export const PER_STORY_WITH_PREGEN = { beat: 85, switch: 19, thread: 21 };
export const PER_STORY_WITHOUT_PREGEN = { beat: 29, switch: 7, thread: 7 };
/** Share of beat-only and analysis turns in a 29-turn story without pregeneration */
export const TURN_MIX = { beatOnly: 15 / 29, analysis: 14 / 29 };

export const PREGEN_TURN_CAP_S = 60;
export const NO_PREGEN_BAR = { medianS: 5, p95S: 8 };
export const MULTIPLAYER_SLACK_S = 5;
export const SETUP_WAIT_FACTOR = 1.5;

type Quantiles = { n: number; p50?: number; p95?: number };

export type ArmStats = {
  promptState: string;
  group: CallRecord["group"];
  armKey: string;
  model: string;
  baseline: boolean;
  calls: number;
  rates: {
    firstAttemptValid: number;
    repaired: number;
    refusal: number;
    length: number;
    rejectedParam: number;
    textAfterJson: number;
    junk: number;
  };
  /** check name -> pass rate over usable outputs */
  ruleRates: Record<string, number>;
  /** check name -> |rate(sample 1) − rate(sample 2)|, the noise floor (baseline) */
  noiseFloor: Record<string, number>;
  /** Seconds, usable final calls */
  latency: Quantiles;
  /** Single-player beat calls on turns without analysis */
  beatOnlyLatencies: number[];
  /** Pipeline chains: analysis plus beat */
  turnLatencies: number[];
  latencyByPlayers: Record<number, number[]>;
  medianTokens: { input: number; cached: number; cacheWrite: number; output: number; reasoning: number };
  costPerCall: number;
  /** Over single-player calls only, which is what a single-player story pays; undefined without any */
  singlePlayerCostPerCall?: number;
  uncachedCostPerCall: number;
};

export function percentile(values: number[], p: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function quantiles(values: number[]): Quantiles {
  return { n: values.length, p50: percentile(values, 50), p95: percentile(values, 95) };
}

function median(values: number[]): number {
  return percentile(values, 50) ?? 0;
}

/** The q-quantile of weighted samples (weights need not sum to 1). */
export function weightedQuantile(samples: { value: number; weight: number }[], q: number): number | undefined {
  const sorted = samples.filter((s) => s.weight > 0).sort((a, b) => a.value - b.value);
  const total = sorted.reduce((sum, s) => sum + s.weight, 0);
  if (total === 0) return undefined;
  let cumulative = 0;
  for (const sample of sorted) {
    cumulative += sample.weight;
    if (cumulative / total >= q - 1e-12) return sample.value;
  }
  return sorted[sorted.length - 1].value;
}

const rate = (hits: number, n: number) => (n === 0 ? 0 : hits / n);

function ruleRatesOf(records: CallRecord[], checks: Map<string, CheckResult>): Record<string, number> {
  const passes: Record<string, { ok: number; n: number }> = {};
  for (const record of records) {
    const result = record.outputFile ? checks.get(record.outputFile) : undefined;
    for (const [name, ok] of Object.entries(result?.checks ?? {})) {
      passes[name] ??= { ok: 0, n: 0 };
      passes[name].n++;
      if (ok) passes[name].ok++;
    }
  }
  return Object.fromEntries(Object.entries(passes).map(([name, p]) => [name, rate(p.ok, p.n)]));
}

function statsFor(
  records: CallRecord[],
  checks: Map<string, CheckResult>,
  tags: Map<string, CaseTags>
): ArmStats {
  const first = records[0];
  const finals = records.filter((r) => r.final);
  const good = finals.filter(usable);
  const firstAttempts = records.filter((r) => r.attempt === 1);
  const seconds = (r: CallRecord) => r.latencyMs / 1000;
  const bySample = (n: number) => ruleRatesOf(good.filter((r) => r.sample === n), checks);
  const s1 = bySample(1);
  const s2 = bySample(2);
  const latencyByPlayers: Record<number, number[]> = {};
  for (const r of good) (latencyByPlayers[r.players] ??= []).push(seconds(r));
  const costs = finals.map((r) => r.costUsd);
  const singlePlayerCosts = finals.filter((r) => r.players === 1).map((r) => r.costUsd);
  // As if no input had been served from cache (gpt-4.1 caches implicitly)
  const uncached = finals.map((r) =>
    r.costSource === "usage"
      ? costFromUsage(r.model, {
          inputTokens: r.inputTokens,
          cachedTokens: 0,
          cacheWriteTokens: r.cacheWriteTokens,
          outputTokens: r.outputTokens,
        })
      : r.costUsd
  );
  return {
    promptState: first.promptState,
    group: first.group,
    armKey: first.armKey,
    model: first.model,
    baseline: first.baseline,
    calls: finals.length,
    rates: {
      firstAttemptValid: rate(firstAttempts.filter((r) => r.outcome === "valid").length, firstAttempts.length),
      repaired: rate(finals.filter((r) => r.outcome === "repaired").length, finals.length),
      refusal: rate(finals.filter((r) => r.outcome === "refusal").length, finals.length),
      length: rate(finals.filter((r) => r.outcome === "length").length, finals.length),
      rejectedParam: rate(records.filter((r) => r.rejectedParam).length, records.length),
      textAfterJson: rate(finals.filter((r) => r.textAfterJson).length, finals.length),
      junk: rate(finals.filter((r) => r.junkChars > 0).length, finals.length),
    },
    ruleRates: ruleRatesOf(good, checks),
    noiseFloor: Object.fromEntries(
      Object.keys(s1)
        .filter((name) => name in s2)
        .map((name) => [name, Math.abs(s1[name] - s2[name])])
    ),
    latency: quantiles(good.map(seconds)),
    beatOnlyLatencies: good
      .filter((r) => r.group === "beat" && r.players === 1 && !tags.get(r.caseId)?.analysisTurn)
      .map(seconds),
    turnLatencies: good.filter((r) => r.turnLatencyMs !== undefined).map((r) => (r.turnLatencyMs ?? 0) / 1000),
    latencyByPlayers,
    medianTokens: {
      input: median(good.map((r) => r.inputTokens)),
      cached: median(good.map((r) => r.cachedTokens)),
      cacheWrite: median(good.map((r) => r.cacheWriteTokens)),
      output: median(good.map((r) => r.outputTokens)),
      reasoning: median(good.map((r) => r.reasoningTokens)),
    },
    costPerCall: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : 0,
    singlePlayerCostPerCall: singlePlayerCosts.length
      ? singlePlayerCosts.reduce((a, b) => a + b, 0) / singlePlayerCosts.length
      : undefined,
    uncachedCostPerCall: uncached.length ? uncached.reduce((a, b) => a + b, 0) / uncached.length : 0,
  };
}

/** One entry per prompt state, group and arm, over the frozen cases. Chains are summarised by their beat step. */
export function computeArmStats(
  records: CallRecord[],
  checks: Map<string, CheckResult>,
  tags: Map<string, CaseTags>
): ArmStats[] {
  const groups = new Map<string, CallRecord[]>();
  for (const record of records) {
    // Case-building calls on inputs that are not frozen cases count as spend, not as results
    if (!tags.has(record.caseId)) continue;
    if (record.group === "pipeline" && record.step !== 2) continue;
    const key = `${record.promptState}|${record.group}|${record.armKey}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return [...groups.values()].map((group) => statsFor(group, checks, tags));
}

export type GameplayConfig = { beat: ArmStats; switch?: ArmStats; thread?: ArmStats; setup?: ArmStats };

/** A single-player story pays single-player calls: multiplayer beats carry about 3x the output. */
function storyCallCost(stats: ArmStats | undefined): number {
  return stats ? (stats.singlePlayerCostPerCall ?? stats.costPerCall) : 0;
}

/** Text cost per 25-turn single-player story, with and without pregeneration. */
export function storyCost(config: GameplayConfig): { withPregen: number; withoutPregen: number } {
  const per = (counts: typeof PER_STORY_WITH_PREGEN) =>
    counts.beat * storyCallCost(config.beat) +
    counts.switch * storyCallCost(config.switch) +
    counts.thread * storyCallCost(config.thread) +
    storyCallCost(config.setup);
  return { withPregen: per(PER_STORY_WITH_PREGEN), withoutPregen: per(PER_STORY_WITHOUT_PREGEN) };
}

/** Analysis-turn waits: pipeline chains when measured, else beat plus the slower analysis (summed p95s). */
function analysisTurnP95(config: GameplayConfig): { p95?: number; source: "pipeline" | "summed" } {
  if (config.beat.turnLatencies.length > 0) {
    return { p95: percentile(config.beat.turnLatencies, 95), source: "pipeline" };
  }
  const beat = config.beat.latency.p95;
  const analysis = Math.max(config.switch?.latency.p95 ?? 0, config.thread?.latency.p95 ?? 0);
  return { p95: beat === undefined ? undefined : beat + analysis, source: "summed" };
}

export type Gates = {
  pregenTurn: { beatOnlyP95?: number; analysisTurnP95?: number; source: string; pass: boolean };
  costCap: { perStory: number; baselinePerStory: number; pass: boolean };
  noPregen: { perStory: number; median?: number; p95?: number; exception: boolean };
  multiplayer: { byPlayers: Record<number, { p95?: number; baselineP95?: number }>; verdict: "ok" | "needs multiplayer pregeneration" | "fail" };
  setup?: { median?: number; p95?: number; baselineMedian?: number; pass: boolean };
};

export function gates(config: GameplayConfig, baseline: GameplayConfig): Gates {
  const beatOnlyP95 = percentile(config.beat.beatOnlyLatencies, 95);
  const analysis = analysisTurnP95(config);
  const pregenPass =
    beatOnlyP95 !== undefined &&
    analysis.p95 !== undefined &&
    beatOnlyP95 <= PREGEN_TURN_CAP_S &&
    analysis.p95 <= PREGEN_TURN_CAP_S;

  const cost = storyCost(config);
  const baselineCost = storyCost(baseline);

  const analysisLatencies = config.beat.turnLatencies.length
    ? config.beat.turnLatencies
    : config.beat.beatOnlyLatencies.map((s) => s + (config.thread?.latency.p50 ?? config.switch?.latency.p50 ?? 0));
  const mixed = [
    ...config.beat.beatOnlyLatencies.map((value) => ({ value, weight: TURN_MIX.beatOnly / config.beat.beatOnlyLatencies.length })),
    ...analysisLatencies.map((value) => ({ value, weight: TURN_MIX.analysis / analysisLatencies.length })),
  ];
  const noPregenMedian = weightedQuantile(mixed, 0.5);
  const noPregenP95 = weightedQuantile(mixed, 0.95);

  const byPlayers: Gates["multiplayer"]["byPlayers"] = {};
  let verdict: Gates["multiplayer"]["verdict"] = "ok";
  for (const [players, values] of Object.entries(config.beat.latencyByPlayers)) {
    if (Number(players) < 2) continue;
    const p95 = percentile(values, 95);
    const baselineP95 = percentile(baseline.beat.latencyByPlayers[Number(players)] ?? [], 95);
    byPlayers[Number(players)] = { p95, baselineP95 };
    if (p95 === undefined || baselineP95 === undefined) continue;
    if (p95 > PREGEN_TURN_CAP_S) verdict = "fail";
    else if (p95 > baselineP95 + MULTIPLAYER_SLACK_S && verdict === "ok") verdict = "needs multiplayer pregeneration";
  }

  const setup = config.setup
    ? {
        median: config.setup.latency.p50,
        p95: config.setup.latency.p95,
        baselineMedian: baseline.setup?.latency.p50,
        pass:
          config.setup.latency.p50 !== undefined &&
          baseline.setup?.latency.p50 !== undefined &&
          config.setup.latency.p50 <= SETUP_WAIT_FACTOR * baseline.setup.latency.p50,
      }
    : undefined;

  return {
    pregenTurn: { beatOnlyP95, analysisTurnP95: analysis.p95, source: analysis.source, pass: pregenPass },
    costCap: { perStory: cost.withPregen, baselinePerStory: baselineCost.withPregen, pass: cost.withPregen <= baselineCost.withPregen },
    noPregen: {
      perStory: cost.withoutPregen,
      median: noPregenMedian,
      p95: noPregenP95,
      exception:
        noPregenMedian !== undefined &&
        noPregenP95 !== undefined &&
        noPregenMedian <= NO_PREGEN_BAR.medianS &&
        noPregenP95 <= NO_PREGEN_BAR.p95S,
    },
    multiplayer: { byPlayers, verdict },
    setup,
  };
}

export type ResultsInput = {
  records: CallRecord[];
  checks: Map<string, CheckResult>;
  tags: Map<string, CaseTags>;
  caps: Caps;
  probe?: ProbeReport;
  prose?: Record<string, { distinctOpenings: number; youOpenings: number; beats: number; stockPhrasesPer1000Words: number }>;
  generatedAt: Date;
};

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const secs = (x?: number) => (x === undefined ? "–" : `${x.toFixed(1)} s`);
const usd = (x: number) => `$${x.toFixed(4)}`;

function configsFor(stats: ArmStats[], promptState: string) {
  const inState = stats.filter((s) => s.promptState === promptState);
  const find = (group: CallRecord["group"], key?: string) =>
    inState.find((s) => s.group === group && (key === undefined ? s.baseline : s.armKey === key));
  // Pipeline chains ("pipeline:<analysis>><beat>") measure the beat arm's analysis-turn wait
  const withChains = (beat: ArmStats): ArmStats => {
    const chain = inState.find((s) => s.group === "pipeline" && s.baseline === beat.baseline && s.armKey.endsWith(`>${beat.armKey}`));
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

function renderViews(stats: ArmStats[], promptState: string): string[] {
  const configs = configsFor(stats, promptState);
  if (!configs) return [`No baseline beat results for prompt state ${promptState} yet.`];
  const lines: string[] = [];
  const all: [string, GameplayConfig][] = [["baseline " + configs.baseline.beat.armKey, configs.baseline], ...configs.candidates];
  lines.push(
    "",
    "| Gameplay arm | $/story (pregen) | Cost cap | Beat-only p95 | Analysis-turn p95 | 60 s cap | $/story (no pregen) | Full-turn median / p95 (no pregen) | Exception | Multiplayer p95 by players | Multiplayer |",
    "|---|---|---|---|---|---|---|---|---|---|---|"
  );
  for (const [name, config] of all) {
    const g = gates(config, configs.baseline);
    const mp = Object.entries(g.multiplayer.byPlayers)
      .map(([players, v]) => `${players}p ${secs(v.p95)} (base ${secs(v.baselineP95)})`)
      .join("; ") || "–";
    lines.push(
      `| ${name} | ${usd(g.costCap.perStory)} | ${g.costCap.pass ? "pass" : "FAIL"} | ${secs(g.pregenTurn.beatOnlyP95)} | ${secs(g.pregenTurn.analysisTurnP95)} (${g.pregenTurn.source}) | ${g.pregenTurn.pass ? "pass" : "FAIL"} | ${usd(g.noPregen.perStory)} | ${secs(g.noPregen.median)} / ${secs(g.noPregen.p95)} | ${g.noPregen.exception ? "yes" : "no"} | ${mp} | ${g.multiplayer.verdict} |`
    );
  }
  if (configs.setupArms.length > 0) {
    lines.push("", "**Setup gate** (median wait at most 1.5 × the baseline median; p95 alongside):", "", "| Setup arm | Median | p95 | Gate |", "|---|---|---|---|");
    const baseMedian = configs.baseline.setup?.latency.p50;
    for (const arm of configs.setupArms) {
      const pass = arm.latency.p50 !== undefined && baseMedian !== undefined && arm.latency.p50 <= SETUP_WAIT_FACTOR * baseMedian;
      lines.push(`| ${arm.armKey} | ${secs(arm.latency.p50)} | ${secs(arm.latency.p95)} | ${arm.baseline ? "baseline" : pass ? "pass" : "FAIL"} |`);
    }
    lines.push("", "**Per-story cost, setup arm × gameplay arm** (pregeneration on):", "");
    lines.push(`| Setup \\ Gameplay | ${all.map(([name]) => name).join(" | ")} |`, `|---|${all.map(() => "---").join("|")}|`);
    for (const setup of configs.setupArms) {
      lines.push(`| ${setup.armKey} | ${all.map(([, config]) => usd(storyCost({ ...config, setup }).withPregen)).join(" | ")} |`);
    }
  }
  return lines;
}

export function renderResults(input: ResultsInput): string {
  const stats = computeArmStats(input.records, input.checks, input.tags);
  // Probe spend lives in probe.json, not calls.jsonl; it counts against Stage 0 as the caps do
  const probeSpend = input.probe ? input.probe.totalCostUsd + (input.probe.priorSpendUsd ?? 0) : 0;
  const spend = spentByStage([...input.records, { stage: "0", costUsd: probeSpend }]);
  const lines: string[] = [
    "# Text-model eval: results",
    "",
    `Generated ${input.generatedAt.toISOString()}. This report never picks a winner; the owner's rating does.`,
    "",
    "## Spend by stage",
    "",
    "| Stage | Spent | Cap |",
    "|---|---|---|",
    ...(Object.keys(spend.byStage) as Stage[]).map((stage) => `| ${stage} | $${spend.byStage[stage].toFixed(2)} | $${input.caps.stageCaps[stage].toFixed(2)} |`),
    `| total | $${spend.total.toFixed(2)} | $${input.caps.globalCap.toFixed(2)} |`,
  ];
  if (input.probe) {
    lines.push("", "## Probe", "", ...input.probe.results.map((r) => `- ${r.id}: ${r.outcome}${r.note ? ` (${r.note})` : ""}`));
  }
  for (const promptState of [...new Set(stats.map((s) => s.promptState))]) {
    lines.push("", `## Prompt state: ${promptState}`, "", "### Validity, latency, tokens and cost per call", "");
    lines.push(
      "| Role | Arm | Calls | 1st-attempt valid | Repaired | Refusal | Length | Rejected param | Text after JSON | Junk | p50 | p95 | Median tokens in / cached / write / out / reasoning | $/call billed (uncached) |",
      "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"
    );
    for (const s of stats.filter((x) => x.promptState === promptState)) {
      const t = s.medianTokens;
      lines.push(
        `| ${s.group} | ${s.armKey}${s.baseline ? " (baseline)" : ""} | ${s.calls} | ${pct(s.rates.firstAttemptValid)} | ${pct(s.rates.repaired)} | ${pct(s.rates.refusal)} | ${pct(s.rates.length)} | ${pct(s.rates.rejectedParam)} | ${pct(s.rates.textAfterJson)} | ${pct(s.rates.junk)} | ${secs(s.latency.p50)} | ${secs(s.latency.p95)} | ${t.input} / ${t.cached} / ${t.cacheWrite} / ${t.output} / ${t.reasoning} | ${usd(s.costPerCall)} (${usd(s.uncachedCostPerCall)}) |`
      );
    }
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
    lines.push("### Views: single-player with pregeneration, without, and multiplayer", ...renderViews(stats, promptState));
  }
  if (input.prose) {
    lines.push("", "## Prose aggregates (beats)", "", "| Arm | Beats | Distinct openings | Opens with \"You\" | Stock phrases / 1000 words |", "|---|---|---|---|---|");
    for (const [arm, p] of Object.entries(input.prose)) {
      lines.push(`| ${arm} | ${p.beats} | ${p.distinctOpenings} | ${p.youOpenings} | ${p.stockPhrasesPer1000Words.toFixed(2)} |`);
    }
  }
  return `${lines.join("\n")}\n`;
}
