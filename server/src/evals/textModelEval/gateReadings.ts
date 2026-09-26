import { percentile, weightedQuantile, type ArmStats, type CostBasis } from "./armStats.js";

/*
 * The owner's gate readings on a gameplay configuration: per-story cost on
 * the billed and the uncached basis, the 60 s turn waits, the
 * no-pregeneration bar, multiplayer waits and cost, and the setup cap on the
 * median and the p95. Readings, not verdicts: nothing here drops an arm.
 */

export const PER_STORY_WITH_PREGEN = { beat: 85, switch: 19, thread: 21 };
export const PER_STORY_WITHOUT_PREGEN = { beat: 29, switch: 7, thread: 7 };
/** Share of beat-only and analysis turns in a 29-turn story without pregeneration */
export const TURN_MIX = { beatOnly: 15 / 29, analysis: 14 / 29 };

export const PREGEN_TURN_CAP_S = 60;
export const NO_PREGEN_BAR = { medianS: 5, p95S: 8 };
export const MULTIPLAYER_SLACK_S = 5;
export const SETUP_WAIT_FACTOR = 1.5;

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

export const byBasis = <T>(read: (basis: CostBasis) => T): Record<CostBasis, T> =>
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
