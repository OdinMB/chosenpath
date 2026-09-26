import { costFromUsage, STAGES } from "./arms.js";
import type { Caps } from "./budget.js";
import { spentByStage } from "./budget.js";
import type { CaseTags } from "./cases.js";
import type { ProbeReport } from "./probe.js";
import type { CheckResult } from "./textChecks.js";
import { usable, type CallRecord } from "./runner.js";
import {
  FIRST_ATTEMPT_FLOOR,
  modelAttemptsByStep,
  validityReading,
  validityVerdict,
  type ValidityReading,
} from "./validityGate.js";
import { PRODUCTION_MAX_RETRIES } from "shared/llm/chatModel.js";
import { PRE_FIX_PROMPT_STATE } from "./variants.js";

/*
 * results.md from the call records and the automatic checks: validity,
 * rule rates against the baseline and its noise floor, latency, tokens and
 * cost, and the owner's gate readings as views (single-player with and
 * without pregeneration, multiplayer, setup). Cost is read on the billed
 * and the uncached basis, the setup cap on the median and the p95. The
 * report marks each reading within or over and never picks a winner.
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

/** Billed: as charged. Uncached: priced as if nothing came from cache (gpt-4.1 caches implicitly). */
export type CostBasis = "billed" | "uncached";
export const COST_BASES: CostBasis[] = ["billed", "uncached"];

export type CostReading = {
  /** Mean cost of a call, every attempt summed (production pays for re-sends too) */
  perCall: number;
  /** The same over calls with this many players */
  byPlayers: Record<number, number>;
};

export type ArmStats = {
  promptState: string;
  group: CallRecord["group"];
  armKey: string;
  model: string;
  baseline: boolean;
  calls: number;
  validity: ValidityReading;
  /** Over each call's first model attempt, so a re-send cannot hide them (rejectedParam: over all records) */
  rates: {
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
  /** Single-player pipeline chains: analysis plus beat */
  turnLatencies: number[];
  latencyByPlayers: Record<number, number[]>;
  medianTokens: { input: number; cached: number; cacheWrite: number; output: number; reasoning: number };
  cost: Record<CostBasis, CostReading>;
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

function uncachedCost(r: CallRecord): number {
  return r.costSource === "usage"
    ? costFromUsage(r.model, {
        inputTokens: r.inputTokens,
        cachedTokens: 0,
        cacheWriteTokens: r.cacheWriteTokens,
        outputTokens: r.outputTokens,
      })
    : r.costUsd;
}

const PRICE: Record<CostBasis, (r: CallRecord) => number> = {
  billed: (r) => r.costUsd,
  uncached: uncachedCost,
};

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

/** Every attempt of a call (job and step) summed, then averaged over calls, overall and by player count. */
function costReading(records: CallRecord[], price: (r: CallRecord) => number): CostReading {
  const calls = new Map<string, { players: number; usd: number }>();
  for (const r of records) {
    const key = `${r.jobKey}|${r.step}`;
    const call = calls.get(key) ?? { players: r.players, usd: 0 };
    call.usd += price(r);
    calls.set(key, call);
  }
  const all = [...calls.values()];
  const byPlayers: Record<number, number> = {};
  for (const players of new Set(all.map((c) => c.players))) {
    byPlayers[players] = mean(all.filter((c) => c.players === players).map((c) => c.usd));
  }
  return { perCall: mean(all.map((c) => c.usd)), byPlayers };
}

function statsFor(
  records: CallRecord[],
  checks: Map<string, CheckResult>,
  tags: Map<string, CaseTags>
): ArmStats {
  const first = records[0];
  const finals = records.filter((r) => r.final);
  const good = finals.filter(usable);
  const firstAttempts = modelAttemptsByStep(records).calls.map((attempts) => attempts[0]);
  const firstRate = (hit: (r: CallRecord) => boolean) => rate(firstAttempts.filter(hit).length, firstAttempts.length);
  const seconds = (r: CallRecord) => r.latencyMs / 1000;
  const bySample = (n: number) => ruleRatesOf(good.filter((r) => r.sample === n), checks);
  const s1 = bySample(1);
  const s2 = bySample(2);
  const latencyByPlayers: Record<number, number[]> = {};
  for (const r of good) (latencyByPlayers[r.players] ??= []).push(seconds(r));
  return {
    promptState: first.promptState,
    group: first.group,
    armKey: first.armKey,
    model: first.model,
    baseline: first.baseline,
    calls: finals.length,
    validity: validityReading(records),
    rates: {
      repaired: firstRate((r) => r.outcome === "repaired"),
      refusal: firstRate((r) => r.outcome === "refusal"),
      length: firstRate((r) => r.outcome === "length"),
      rejectedParam: rate(records.filter((r) => r.rejectedParam).length, records.length),
      textAfterJson: firstRate((r) => r.textAfterJson === true),
      junk: firstRate((r) => r.junkChars > 0),
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
    turnLatencies: good.filter((r) => r.turnLatencyMs !== undefined && r.players === 1).map((r) => (r.turnLatencyMs ?? 0) / 1000),
    latencyByPlayers,
    medianTokens: {
      input: median(good.map((r) => r.inputTokens)),
      cached: median(good.map((r) => r.cachedTokens)),
      cacheWrite: median(good.map((r) => r.cacheWriteTokens)),
      output: median(good.map((r) => r.outputTokens)),
      reasoning: median(good.map((r) => r.reasoningTokens)),
    },
    cost: { billed: costReading(records, PRICE.billed), uncached: costReading(records, PRICE.uncached) },
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

/**
 * A role's cost per call at a player count: its calls with that many players
 * when there are any (multiplayer beats carry about 3x the output), else all calls.
 */
function callCost(stats: ArmStats | undefined, basis: CostBasis, players: number): number {
  if (!stats) return 0;
  const reading = stats.cost[basis];
  return reading.byPlayers[players] ?? reading.perCall;
}

/**
 * Text cost per 25-turn story at a player count, with pregeneration
 * (85/19/21 calls) and without (29/7/7), plus its setup.
 */
export function storyCost(
  config: GameplayConfig,
  basis: CostBasis,
  players = 1
): { withPregen: number; withoutPregen: number } {
  const per = (counts: typeof PER_STORY_WITH_PREGEN) =>
    counts.beat * callCost(config.beat, basis, players) +
    counts.switch * callCost(config.switch, basis, players) +
    counts.thread * callCost(config.thread, basis, players) +
    callCost(config.setup, basis, players);
  return { withPregen: per(PER_STORY_WITH_PREGEN), withoutPregen: per(PER_STORY_WITHOUT_PREGEN) };
}

const byBasis = <T>(read: (basis: CostBasis) => T): Record<CostBasis, T> =>
  ({ billed: read("billed"), uncached: read("uncached") });

/** A single-player wait quantile: multiplayer calls carry more output and would inflate it. */
function onePlayerLatency(stats: ArmStats | undefined, p: number): number | undefined {
  if (!stats) return undefined;
  return percentile(stats.latencyByPlayers[1] ?? [], p) ?? (p === 50 ? stats.latency.p50 : stats.latency.p95);
}

/** Analysis-turn waits: pipeline chains when measured, else beat plus the slower analysis (summed p95s). */
function analysisTurnP95(config: GameplayConfig): { p95?: number; source: "pipeline" | "summed" } {
  if (config.beat.turnLatencies.length > 0) {
    return { p95: percentile(config.beat.turnLatencies, 95), source: "pipeline" };
  }
  const beat = onePlayerLatency(config.beat, 95);
  const analysis = Math.max(onePlayerLatency(config.switch, 95) ?? 0, onePlayerLatency(config.thread, 95) ?? 0);
  return { p95: beat === undefined ? undefined : beat + analysis, source: "summed" };
}

type CostCheck = { perStory: number; baselinePerStory: number; withinCap: boolean };

export type SetupReading = {
  median?: number;
  p95?: number;
  baselineMedian?: number;
  baselineP95?: number;
  medianWithinCap: boolean;
  p95WithinCap: boolean;
};

export type Gates = {
  pregenTurn: { beatOnlyP95?: number; analysisTurnP95?: number; source: string; pass: boolean };
  /** Single-player, pregeneration on: billed against billed, uncached against uncached */
  cost: Record<CostBasis, CostCheck>;
  noPregen: { perStory: Record<CostBasis, number>; median?: number; p95?: number; exception: boolean };
  multiplayer: {
    byPlayers: Record<number, { p95?: number; baselineP95?: number }>;
    verdict: "ok" | "needs multiplayer pregeneration" | "fail";
    /** Per custom story at this player count: today's 29/7/7 calls, or 85/19/21 with multiplayer pregeneration */
    costByPlayers: Record<number, Record<CostBasis, { withoutMpPregen: number; withMpPregen: number }>>;
  };
  setup?: SetupReading;
};

function pregenTurnReading(config: GameplayConfig): Gates["pregenTurn"] {
  const beatOnlyP95 = percentile(config.beat.beatOnlyLatencies, 95);
  const analysis = analysisTurnP95(config);
  const pass =
    beatOnlyP95 !== undefined &&
    analysis.p95 !== undefined &&
    beatOnlyP95 <= PREGEN_TURN_CAP_S &&
    analysis.p95 <= PREGEN_TURN_CAP_S;
  return { beatOnlyP95, analysisTurnP95: analysis.p95, source: analysis.source, pass };
}

function noPregenReading(config: GameplayConfig): Gates["noPregen"] {
  const analysisLatencies = config.beat.turnLatencies.length
    ? config.beat.turnLatencies
    : config.beat.beatOnlyLatencies.map((s) => s + (onePlayerLatency(config.thread, 50) ?? onePlayerLatency(config.switch, 50) ?? 0));
  const mixed = [
    ...config.beat.beatOnlyLatencies.map((value) => ({ value, weight: TURN_MIX.beatOnly / config.beat.beatOnlyLatencies.length })),
    ...analysisLatencies.map((value) => ({ value, weight: TURN_MIX.analysis / analysisLatencies.length })),
  ];
  const median = weightedQuantile(mixed, 0.5);
  const p95 = weightedQuantile(mixed, 0.95);
  return {
    perStory: byBasis((basis) => storyCost(config, basis).withoutPregen),
    median,
    p95,
    exception: median !== undefined && p95 !== undefined && median <= NO_PREGEN_BAR.medianS && p95 <= NO_PREGEN_BAR.p95S,
  };
}

function multiplayerReading(config: GameplayConfig, baseline: GameplayConfig): Gates["multiplayer"] {
  const byPlayers: Gates["multiplayer"]["byPlayers"] = {};
  const costByPlayers: Gates["multiplayer"]["costByPlayers"] = {};
  let verdict: Gates["multiplayer"]["verdict"] = "ok";
  for (const [players, values] of Object.entries(config.beat.latencyByPlayers)) {
    const n = Number(players);
    if (n < 2) continue;
    const p95 = percentile(values, 95);
    const baselineP95 = percentile(baseline.beat.latencyByPlayers[n] ?? [], 95);
    byPlayers[n] = { p95, baselineP95 };
    if (p95 === undefined || baselineP95 === undefined) continue;
    if (p95 > PREGEN_TURN_CAP_S) verdict = "fail";
    else if (p95 > baselineP95 + MULTIPLAYER_SLACK_S && verdict === "ok") verdict = "needs multiplayer pregeneration";
  }
  for (const players of Object.keys(config.beat.cost.billed.byPlayers).map(Number).filter((n) => n >= 2)) {
    costByPlayers[players] = byBasis((basis) => {
      const cost = storyCost(config, basis, players);
      return { withoutMpPregen: cost.withoutPregen, withMpPregen: cost.withPregen };
    });
  }
  return { byPlayers, verdict, costByPlayers };
}

/** The owner's setup cap (1.5x today's wait), read on the median and on the p95. */
export function setupReading(setup: ArmStats, baselineSetup?: ArmStats): SetupReading {
  const { p50: median, p95 } = setup.latency;
  const baselineMedian = baselineSetup?.latency.p50;
  const baselineP95 = baselineSetup?.latency.p95;
  const within = (value?: number, base?: number) =>
    value !== undefined && base !== undefined && value <= SETUP_WAIT_FACTOR * base;
  return {
    median,
    p95,
    baselineMedian,
    baselineP95,
    medianWithinCap: within(median, baselineMedian),
    p95WithinCap: within(p95, baselineP95),
  };
}

export function gates(config: GameplayConfig, baseline: GameplayConfig): Gates {
  const cost = byBasis((basis): CostCheck => {
    const perStory = storyCost(config, basis).withPregen;
    const baselinePerStory = storyCost(baseline, basis).withPregen;
    return { perStory, baselinePerStory, withinCap: perStory <= baselinePerStory };
  });
  return {
    pregenTurn: pregenTurnReading(config),
    cost,
    noPregen: noPregenReading(config),
    multiplayer: multiplayerReading(config, baseline),
    setup: config.setup ? setupReading(config.setup, baseline.setup) : undefined,
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
    ...STAGES.map((stage) => `| ${stage} | $${spend.byStage[stage].toFixed(2)} | $${input.caps.stageCaps[stage].toFixed(2)} |`),
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
  }
  if (input.prose) {
    lines.push("", "## Prose aggregates (beats)", "", "| Arm | Beats | Distinct openings | Opens with \"You\" | Stock phrases / 1000 words |", "|---|---|---|---|---|");
    for (const [arm, p] of Object.entries(input.prose)) {
      lines.push(`| ${arm} | ${p.beats} | ${p.distinctOpenings} | ${p.youOpenings} | ${p.stockPhrasesPer1000Words.toFixed(2)} |`);
    }
  }
  return `${lines.join("\n")}\n`;
}
