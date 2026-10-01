import type { Story } from "core/models/Story.js";
import type { SwitchAnalysis } from "core/types/index.js";
import { offeredOutcomes, pacedLengths, switchPacingProblem, switchPacingReading, type SwitchPacingReading } from "../../game/services/storyTextRounds/latePacing.js";
import { meanMove, momentsOf, rateMove, type MeanMove, type RateMove, type Tally } from "./stopRule.js";
import { replayRun } from "./playthroughReplay.js";
import { START_POLICY, playStory, turnCalls, type PlayCall, type PlayFrom, type PlayResult, type PlayRun, type PlayTurn, type PolicyState } from "./playthroughs.js";
import type { VariantId } from "./variants.js";

/*
 * The late-pacing stage's short playthroughs and their readings (2026-10-01,
 * fix 8 of the second playthroughs' review). A stored story of the second
 * round is replayed to the chapter plan where the lengths decided whether its
 * last chapter kept a milestone (latePacingCases.ts, LATE_PACING_STARTS), then
 * played on as the game plays it (playthroughs.ts) with production's code or
 * the variant's requests and length rule, to the story's last chapter plan:
 * the automated player where the stored run left it in its rotation, the
 * game's dice on seeds of the short playthrough's own (one sample's seeds the
 * same for both arms). No call is made here.
 *
 * The readings, all the game's own arithmetic (no judge): each chapter's
 * length against production's allowed lengths and the variant's (pacedLengths),
 * the stage each thread settles (none once its outcome is complete: an
 * aftermath), whether the last chapter keeps a milestone to settle, the
 * aftermath chapters before it, the milestones left unfinished once the last
 * chapter settles its stages, the length retries, and each switch plan read
 * as switchPacingReading reads it; the planners' and turns' waits, and cost.
 */

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** Each seat's place in the player's rotation after these stored turns (nextPolicy, read from the stored picks). */
export function policiesAfter(turns: PlayTurn[]): Record<string, PolicyState> {
  const policies: Record<string, PolicyState> = {};
  for (const turn of turns) {
    for (const pick of turn.picks) {
      const state = policies[pick.slot] ?? START_POLICY;
      const lever = pick.resourceType === "sacrifice" || pick.resourceType === "reward";
      policies[pick.slot] =
        pick.rule === "exploration"
          ? { ...state, explorationPicks: state.explorationPicks + 1 }
          : pick.rule === "lever" && lever
            ? { ...state, lastLever: true }
            : { ...state, challengePicks: state.challengePicks + 1, lastLever: false };
    }
  }
  return policies;
}

/** The seeds a short playthrough's dice roll on: one sample's the same for both arms. */
export const continuationSeedId = (story: string, turn: number, sample: number) => `${story}-from${turn}-s${sample}`;

/** A short playthrough's start: the stored story before this turn's planner, as the stored turn saw it, and the player's rotation where the stored run left it. */
export function continuationStart(run: PlayRun, turn: number, variant: VariantId = "adopted", sample = 1): PlayFrom {
  const replayed = replayRun(run).find((r) => r.turn === turn);
  if (!replayed) throw new Error(`${run.spec.id} s${run.sample} has no replayed turn ${turn}`);
  return {
    story: replayed.beforePlan,
    policies: policiesAfter(run.turns.filter((t) => t.turn < turn)),
    from: { story: run.spec.id, turn, sample: run.sample, variant, seedId: continuationSeedId(run.spec.id, turn, sample) },
  };
}

/** The variants whose chapter planner prints the paced lengths: the late-pacing stage's, its retest's and the pacing-clues stage's. */
const PACED_VARIANTS: VariantId[] = ["latePacing", "latePacingB", "pacingClues", "pacingCluesB"];

/** The variant's length rule for its chapter plans, its retest's too (the plan check reads it as its PACING prints it); production's own otherwise. */
export const planLengthsOf = (variant: VariantId) => (PACED_VARIANTS.includes(variant) ? (story: Story) => pacedLengths(story).lengths : undefined);

/** The pacing-clues stage's fix-and-retest (pacingCluesB): its switch plans read against PACING's arithmetic in the plan check; none otherwise. */
export const switchProblemOf = (variant: VariantId): ((story: Story, plan: SwitchAnalysis) => string | undefined) | undefined =>
  variant === "pacingCluesB" ? switchPacingProblem : undefined;

/**
 * A stored story played on from a turn with an arm's requests, to the story's
 * last chapter plan: production's sends of a failed turn (the queue's resend,
 * one press of Try again), the harness's re-pick of a group chapter no send
 * could plan, as the second round played.
 */
export function playOn(run: PlayRun, turn: number, variant: VariantId, call: PlayCall, sample: number, turnLimit?: number): Promise<PlayResult> {
  const planLengths = planLengthsOf(variant);
  const switchProblem = switchProblemOf(variant);
  return playStory(run.spec, run.input, call, {
    sample,
    variant,
    from: continuationStart(run, turn, variant, sample),
    stopAfterLastChapterPlan: true,
    tryAgain: 1,
    repickStuckSwitches: true,
    ...(planLengths ? { planLengths } : {}),
    ...(switchProblem ? { switchProblem } : {}),
    ...(turnLimit !== undefined ? { turnLimit } : {}),
  });
}

// ---------------------------------------------------------------- the switch plans

// The switch plan read against PACING's arithmetic lives beside the variant (storyTextRounds/latePacing.ts), whose
// fix-and-retest's plan check reads it too
export { offeredOutcomes, switchPacingReading, type SwitchPacingReading };

// ---------------------------------------------------------------- a short playthrough's readings

export type ChapterReading = {
  turn: number;
  duration: number;
  allowed: number[];
  paced?: number[];
  /** The chapter's length was one production's rule allows / the variant's rule allows */
  inAllowed: boolean;
  inPaced?: boolean;
  last: boolean;
  threads: { outcomeId: string; recorded: number; intended: number; stage?: number; lastStage?: boolean }[];
  /** The plan was asked for again over its length */
  lengthRetry: boolean;
  /** The planner's wait, every attempt */
  planMs: number;
};

export type LatePacingReading = {
  story: string;
  sample: number;
  variant: VariantId;
  from: number;
  stopped: string;
  chapters: ChapterReading[];
  /** Undefined where the run never planned its last chapter */
  lastChapterSettles?: boolean;
  /** Chapters before the last whose every thread is an aftermath */
  aftermathsBeforeLast: number;
  /** Milestones still needed once the last chapter settles its stages (distinct outcomes) */
  leftUnfinished: number;
  /** Each switch plan read against PACING; `retried`: asked once more over a pacing rule (the fix-and-retest's plan check) */
  switches: { turn: number; reading: SwitchPacingReading; retried: boolean }[];
  waits: { chapterPlans: number[]; switchPlans: number[]; turns: { turn: number; kind: string; ms: number }[] };
  costUsd: number;
};

/** The planner calls' wait on a turn: its plan's calls, every attempt and send. */
const planMsOf = (turn: PlayTurn) => sum((turn.plan?.calls ?? []).map((c) => c.latencyMs));

/** A short playthrough read by the game's arithmetic: its chapters, its last chapter, its switches, its waits and cost. */
export function readLatePacing(run: PlayRun): LatePacingReading {
  const chapters: ChapterReading[] = run.turns.flatMap((turn): ChapterReading[] => {
    const plan = turn.plan;
    if (plan?.kind !== "chapter plan" || !plan.plan) return [];
    const duration = (plan.plan as { duration: number }).duration;
    const allowed = plan.pacing.allowedLengths ?? [];
    const paced = plan.pacing.pacedLengths;
    return [
      {
        turn: turn.turn,
        duration,
        allowed,
        ...(paced ? { paced, inPaced: paced.includes(duration) } : {}),
        inAllowed: allowed.length === 0 || allowed.includes(duration),
        last: plan.pacing.lastChapter,
        threads: (plan.stages ?? []).map((s) => ({ outcomeId: s.outcomeId, recorded: s.recorded, intended: s.intended, ...(s.stage !== undefined ? { stage: s.stage, lastStage: s.last } : {}) })),
        lengthRetry: plan.calls.some((c) => c.lengthProblem !== undefined),
        planMs: planMsOf(turn),
      },
    ];
  });
  const last = chapters.find((c) => c.last);
  const lastTurn = run.turns.find((t) => t.turn === last?.turn);
  // Once the last chapter settles one stage of each outcome it pushes: what every player still needs, each outcome once
  const remaining = new Map<string, number>();
  for (const need of lastTurn?.plan?.pacing.needs ?? []) remaining.set(need.id, need.stillNeeded);
  for (const thread of last?.threads ?? []) if (thread.stage !== undefined) remaining.set(thread.outcomeId, Math.max(0, (remaining.get(thread.outcomeId) ?? 0) - 1));
  const replayed = replayRun(run);
  const switches = run.turns.flatMap((turn) => {
    const plan = turn.plan;
    if (plan?.kind !== "switch plan" || !plan.plan) return [];
    const before = replayed.find((r) => r.turn === turn.turn)?.beforePlan;
    const retried = plan.calls.some((c) => c.lengthProblem !== undefined);
    return before ? [{ turn: turn.turn, reading: switchPacingReading(before, plan.plan as SwitchAnalysis), retried }] : [];
  });
  return {
    story: run.spec.id,
    sample: run.sample,
    variant: run.from?.variant ?? "adopted",
    from: run.from?.turn ?? 1,
    stopped: run.stopped,
    chapters,
    ...(last ? { lastChapterSettles: last.threads.some((t) => t.stage !== undefined) } : {}),
    aftermathsBeforeLast: chapters.filter((c) => !c.last && c.threads.every((t) => t.stage === undefined)).length,
    leftUnfinished: last ? sum([...remaining.values()]) : 0,
    switches,
    waits: {
      chapterPlans: chapters.map((c) => c.planMs),
      switchPlans: run.turns.filter((t) => t.plan?.kind === "switch plan").map(planMsOf),
      turns: run.turns.filter((t) => t.reply).map((t) => ({ turn: t.turn, kind: t.kind, ms: t.waitMs })),
    },
    costUsd: sum(run.turns.flatMap((t) => turnCalls(t).map((c) => c.costUsd))),
  };
}

// ---------------------------------------------------------------- the arms against each other

export type ArmTallies = {
  variant: VariantId;
  runs: number;
  /** Runs whose last chapter keeps a milestone, of those that planned it */
  lastSettles: Tally;
  /** Runs with an aftermath chapter before the last */
  noAftermath: Tally;
  /** Chapters whose length production's rule allows, and the variant's */
  chaptersInAllowed: Tally;
  /** Chapter plans asked for again over their length */
  lengthRetries: number;
  /** Switch plans: no complete outcome took a needed thread; where a thread was to spare, the last kept its milestone */
  switchesNoNeededTaken: Tally;
  switchesKeepLast: Tally;
  leftUnfinished: number[];
  chapterPlanMs: number[];
  turnMs: number[];
  costUsd: number;
};

export function armTallies(readings: LatePacingReading[], variant: VariantId): ArmTallies {
  const mine = readings.filter((r) => r.variant === variant);
  const planned = mine.filter((r) => r.lastChapterSettles !== undefined);
  const switches = mine.flatMap((r) => r.switches.map((s) => s.reading));
  const keep = switches.filter((s) => s.keepsLast !== undefined);
  const chapters = mine.flatMap((r) => r.chapters);
  return {
    variant,
    runs: mine.length,
    lastSettles: { hits: planned.filter((r) => r.lastChapterSettles).length, n: planned.length },
    noAftermath: { hits: mine.filter((r) => r.aftermathsBeforeLast === 0).length, n: mine.length },
    chaptersInAllowed: { hits: chapters.filter((c) => c.inAllowed).length, n: chapters.length },
    lengthRetries: chapters.filter((c) => c.lengthRetry).length,
    switchesNoNeededTaken: { hits: switches.filter((s) => !s.completeWhileNeeded).length, n: switches.length },
    switchesKeepLast: { hits: keep.filter((s) => s.keepsLast).length, n: keep.length },
    leftUnfinished: planned.map((r) => r.leftUnfinished),
    chapterPlanMs: chapters.map((c) => c.planMs),
    turnMs: mine.flatMap((r) => r.waits.turns.map((t) => t.ms)),
    costUsd: sum(mine.map((r) => r.costUsd)),
  };
}

/** The reference's sample 1 against its sample 2: the rate difference on runs both samples have. */
export function rateNoise(readings: LatePacingReading[], variant: VariantId, hit: (r: LatePacingReading) => boolean | undefined): number | undefined {
  const mine = readings.filter((r) => r.variant === variant);
  const rate = (sample: number) => {
    const values = mine.filter((r) => r.sample === sample).map(hit).filter((v): v is boolean => v !== undefined);
    return values.length ? values.filter(Boolean).length / values.length : undefined;
  };
  const [a, b] = [rate(1), rate(2)];
  return a === undefined || b === undefined ? undefined : Math.abs(a - b);
}

export type LatePacingComparison = { reading: string; production: Tally; variant: Tally; noise?: number; move: RateMove };

/**
 * A candidate (the variant, or its retest) against production on the per-run
 * and per-plan rates, production's two samples as the noise, the stop rule on
 * top; production read on the stories the candidate played only.
 */
export function latePacingComparisons(
  all: LatePacingReading[],
  candidate: VariantId = "latePacing"
): { rates: LatePacingComparison[]; unfinished: { production: number; variant: number; move: MeanMove } } {
  const stories = new Set(all.filter((r) => r.variant === candidate).map((r) => r.story));
  const readings = all.filter((r) => stories.has(r.story));
  const [p, v] = [armTallies(readings, "adopted"), armTallies(readings, candidate)];
  const runRate = (name: string, pick: (t: ArmTallies) => Tally, hit: (r: LatePacingReading) => boolean | undefined): LatePacingComparison => {
    const noise = rateNoise(readings, "adopted", hit);
    return { reading: name, production: pick(p), variant: pick(v), ...(noise !== undefined ? { noise } : {}), move: rateMove(pick(p), pick(v), noise ?? 0) };
  };
  const switchNoise = (hit: (s: SwitchPacingReading) => boolean | undefined) => {
    const rate = (sample: number) => {
      const values = readings.filter((r) => r.variant === "adopted" && r.sample === sample).flatMap((r) => r.switches.map((s) => hit(s.reading))).filter((x): x is boolean => x !== undefined);
      return values.length ? values.filter(Boolean).length / values.length : undefined;
    };
    const [a, b] = [rate(1), rate(2)];
    return a === undefined || b === undefined ? undefined : Math.abs(a - b);
  };
  const keepNoise = switchNoise((s) => s.keepsLast);
  const takenNoise = switchNoise((s) => !s.completeWhileNeeded);
  const rates = [
    runRate("the last chapter keeps a milestone to settle", (t) => t.lastSettles, (r) => r.lastChapterSettles),
    runRate("no aftermath chapter before the last", (t) => t.noAftermath, (r) => r.aftermathsBeforeLast === 0),
    { reading: "switches where a spare thread kept the last thread's milestone", production: p.switchesKeepLast, variant: v.switchesKeepLast, ...(keepNoise !== undefined ? { noise: keepNoise } : {}), move: rateMove(p.switchesKeepLast, v.switchesKeepLast, keepNoise ?? 0) },
    { reading: "switches where no complete outcome took a needed thread", production: p.switchesNoNeededTaken, variant: v.switchesNoNeededTaken, ...(takenNoise !== undefined ? { noise: takenNoise } : {}), move: rateMove(p.switchesNoNeededTaken, v.switchesNoNeededTaken, takenNoise ?? 0) },
  ];
  const unfinishedNoise = (() => {
    const mean = (sample: number) => {
      const values = readings.filter((r) => r.variant === "adopted" && r.sample === sample && r.lastChapterSettles !== undefined).map((r) => r.leftUnfinished);
      return values.length ? sum(values) / values.length : undefined;
    };
    const [a, b] = [mean(1), mean(2)];
    return a === undefined || b === undefined ? 0 : Math.abs(a - b);
  })();
  const [pm, vm] = [momentsOf(p.leftUnfinished), momentsOf(v.leftUnfinished)];
  return { rates, unfinished: { production: pm.mean, variant: vm.mean, move: meanMove(pm, vm, unfinishedNoise) } };
}

// ---------------------------------------------------------------- the report

const pct = (t: Tally) => (t.n === 0 ? "–" : `${t.hits} of ${t.n} (${Math.round((100 * t.hits) / t.n)}%)`);
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const quantile = (values: number[], q: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
};
const moveText = (m: RateMove | MeanMove) =>
  m.moved ? `moved ${m.moved}${"p" in m && m.p !== undefined ? ` (p ${m.p.toFixed(3)})` : ""}` : m.beyondNoise ? `beyond the noise, not moved${"p" in m && m.p !== undefined ? ` (p ${m.p.toFixed(3)})` : ""}` : "within the noise";

/** A short-playthrough report's own words: its title, its first paragraph, and each candidate read against production with its section title. */
export type PlayReportText = { title: string; intro: string; candidates: { variant: VariantId; title: string }[] };

const LATE_PACING_REPORT: PlayReportText = {
  title: "Short playthroughs: pacing that leaves the last chapter a milestone",
  intro:
    "Each run: a stored story of the second round replayed to a chapter plan, then played on with production's code (adopted) or the variant (latePacing) to the story's last chapter plan. Readings are the game's arithmetic: no judge.",
  candidates: [
    { variant: "latePacing", title: "The variant against production" },
    { variant: "latePacingB", title: "The fix-and-retest (latePacingB) against production" },
  ],
};

/** late-pacing.md (or another stage's short playthroughs, in its own words): each short playthrough's chapters and switches, then the arms against each other. */
export function renderLatePacing(readings: LatePacingReading[], generatedAt: Date, text: PlayReportText = LATE_PACING_REPORT): string {
  const lines = [`# ${text.title}`, "", `Generated ${generatedAt.toISOString()} (latePacingPlay.ts). ${text.intro}`, ""];
  for (const r of readings) {
    lines.push(`## ${r.story} from turn ${r.from}, ${r.variant}, sample ${r.sample}`, "", `Stopped: ${r.stopped}. Cost $${r.costUsd.toFixed(4)}.`, "");
    lines.push("| Turn | Length | Production allows | Variant allows | Last | Threads (outcome, stage) | Length retry | Planner wait |", "|---|---|---|---|---|---|---|---|");
    for (const c of r.chapters) {
      const threads = c.threads.map((t) => `${t.outcomeId} ${t.stage !== undefined ? `stage ${t.stage} of ${t.intended}` : "aftermath"}`).join("; ");
      lines.push(`| ${c.turn} | ${c.duration} | ${c.allowed.join(", ")} | ${c.paced?.join(", ") ?? "–"} | ${c.last ? "yes" : "no"} | ${threads} | ${c.lengthRetry ? "yes" : "no"} | ${seconds(c.planMs)} |`);
    }
    lines.push(
      "",
      `Last chapter settles a milestone: ${r.lastChapterSettles === undefined ? "not reached" : r.lastChapterSettles ? "yes" : "no"}; aftermath chapters before it: ${r.aftermathsBeforeLast}; milestones left unfinished: ${r.leftUnfinished}.`,
      ""
    );
    for (const s of r.switches) {
      const who = s.reading.players.map((p) => `${p.slot} needs ${p.needed}, offered ${p.offered.join(", ") || "none"}${p.offeredComplete.length ? ` (complete: ${p.offeredComplete.join(", ")})` : ""}`).join("; ");
      lines.push(
        `- Switch ${s.turn}: ${s.reading.fit} threads fit; ${who}. A complete outcome took a needed thread: ${s.reading.completeWhileNeeded ? "yes" : "no"}${s.reading.keepsLast !== undefined ? `; a thread to spare, the last keeps a milestone: ${s.reading.keepsLast ? "yes" : "no"}` : ""}${s.retried ? "; asked once more over the pacing rule" : ""}.`
      );
    }
    lines.push("");
  }
  for (const { variant: candidate, title } of text.candidates) {
    if (!readings.some((r) => r.variant === candidate)) continue;
    const c = latePacingComparisons(readings, candidate);
    const stories = [...new Set(readings.filter((r) => r.variant === candidate).map((r) => r.story))];
    lines.push(`## ${title} (${stories.join(", ")})`, "", "| Reading | Production | Candidate | Noise | Reading |", "|---|---|---|---|---|");
    for (const rate of c.rates) lines.push(`| ${rate.reading} | ${pct(rate.production)} | ${pct(rate.variant)} | ${rate.noise === undefined ? "–" : `${Math.round(100 * rate.noise)} pts`} | ${moveText(rate.move)} |`);
    lines.push(`| milestones left unfinished (mean) | ${c.unfinished.production.toFixed(2)} | ${c.unfinished.variant.toFixed(2)} | – | ${moveText(c.unfinished.move)} |`);
    lines.push("", "| Arm | Runs | Chapters in production's lengths | Length retries | Chapter plan wait p50 / p95 | Turn wait p50 / p95 | Cost |", "|---|---|---|---|---|---|---|");
    const mine = readings.filter((r) => stories.includes(r.story));
    for (const variant of ["adopted", candidate] as const) {
      const t = armTallies(mine, variant);
      lines.push(
        `| ${variant} | ${t.runs} | ${pct(t.chaptersInAllowed)} | ${t.lengthRetries} | ${seconds(quantile(t.chapterPlanMs, 0.5))} / ${seconds(quantile(t.chapterPlanMs, 0.95))} | ${seconds(quantile(t.turnMs, 0.5))} / ${seconds(quantile(t.turnMs, 0.95))} | $${t.costUsd.toFixed(4)} |`
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
