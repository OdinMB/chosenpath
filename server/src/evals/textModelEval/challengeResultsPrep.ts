import type { ThreadAnalysis, ThreadType } from "core/types/index.js";
import { getThreadType } from "core/types/index.js";
import { checkThreadPlan } from "../../game/services/planChecks.js";
import { pickedOutcome } from "../../game/services/pacing.js";
import { CHALLENGE_RESULTS_CASES, CHALLENGE_RESULTS_PROMPT_STATE, armKey, type Stage } from "./arms.js";
import { caseStory, type EvalCase } from "./cases.js";
import { challengeResultsCasesToFreeze } from "./challengeResultsCases.js";
import { CHOICE_JUDGE_PROMPT_VERSION, RESULTS_CHECK, choiceJudgeCaseId, choiceJudgeJobs, evidenceFrom, resultsJudgeRequest, verdictFrom, type ChoiceTarget } from "./choiceResultJudge.js";
import { replyVerdict, type ToJudge } from "./choiceResultPrep.js";
import { jobEstimateUsd } from "./jobPlan.js";
import { JUDGE_ARMS, outputIdOf, type HandVerdict } from "./judgedChecks.js";
import { playthroughRunsFrom } from "./playthroughMode.js";
import type { PlayRun } from "./playthroughs.js";
import { finishedPrepRecord, prepArmKey } from "./prepCalls.js";
import { finishedJobKeys, jobKey, keyOf, runJobs, usable, type CallRecord } from "./runner.js";
import { stageReadings, type JudgedPlan, type StageArmReading } from "./stageJudge.js";
import { rateMove, type RateMove } from "./stopRule.js";
import { spendBeside, type PrepContext } from "./turnPrep.js";
import { referenceKeyOf } from "./variantComparison.js";

/*
 * The challenge-results stage's CLI modes (2026-10-01, fix 5 of the second
 * playthroughs' review), kept out of run.ts:
 * - --build-challenge-cases: the stage's chapter plans from the second
 *   round's stored runs (challengeResultsCases.ts), each only where its
 *   request is the one production sent there, frozen beside the others (those
 *   already frozen left as they are, unless --rebuild-cases); no calls;
 * - --judge-challenge-results: the choice-result stage's calibrated
 *   resultsFitKind (choiceResultJudge.ts: reliable there at 16 of 17 with the
 *   hand, samples 19 of 20) on every chapter plan of the stage's arms under
 *   adopted12, one call per plan, each read after the game's plan check, into
 *   prep-calls.jsonl, booked to the stage; then judged-challenge-results.md and
 *   .json: the variant against production under the stop rule, pooled, by
 *   player count and by the switch the chapter follows, and the share of
 *   challenge and contest results the judge labels the player's choice. Beside
 *   them, no calls, the same judge's stored readings of the second round's 33
 *   chapter plans against the hand (ROUND2_RESULTS_HAND).
 */

const STAGE: Stage = "challenge-results";
const PLAYTHROUGHS_2 = "playthroughs-2";

const lunaLow = (variant: "adopted" | "resultsAsOutcomes") => armKey({ model: "gpt-6-luna", reasoningEffort: "low" }, variant);

/** The stage's planner arms: production's chapter planner and the variant, on the planner model both player counts share. */
export const CHALLENGE_PLAN_ARMS = [lunaLow("adopted"), lunaLow("resultsAsOutcomes")];

const STAGE_CASES = new Set<string>([...CHALLENGE_RESULTS_CASES.single, ...CHALLENGE_RESULTS_CASES.groups]);

type Lookup = { records: CallRecord[]; cases: EvalCase[]; load: (record: CallRecord) => unknown };

/** A plan of the stage's arms with its judge call, and the kind of each thread the judge reads, in its order. */
export type ChallengePlan = ToJudge & { kinds: ThreadType[] };

/** Every final usable chapter plan of the stage's arms under its tag on its cases, one resultsFitKind call per plan, after the plan check. */
export function plansToJudge({ records, cases, load }: Lookup, arms: string[] = CHALLENGE_PLAN_ARMS, promptState = CHALLENGE_RESULTS_PROMPT_STATE): ChallengePlan[] {
  const byId = new Map(cases.map((c) => [c.id, c]));
  return records.flatMap((r): ChallengePlan[] => {
    if (r.group !== "thread" || r.role !== "thread" || !r.final || !usable(r) || !r.outputFile || r.promptState !== promptState || !arms.includes(r.armKey) || !STAGE_CASES.has(r.caseId)) return [];
    const evalCase = byId.get(r.caseId);
    const written = load(r) as ThreadAnalysis | undefined;
    if (!evalCase?.state || !written) return [];
    const story = caseStory(evalCase, false);
    const kept = checkThreadPlan(story, written).plan;
    const request = resultsJudgeRequest(story, kept);
    if (!request) return [];
    const outputId = outputIdOf(r.outputFile);
    const kinds = kept.threads.filter((t) => Array.isArray(t?.progression) && t.progression.length > 0).map(getThreadType);
    return [{ armKey: r.armKey, caseId: r.caseId, sample: r.sample, outputId, kinds, targets: [{ check: RESULTS_CHECK, key: outputId, request, samples: 1 }] }];
  });
}

/** The judge calls a run sends: every plan's, or with --cases (a smoke) only the named cases'. */
export function targetsToSend(plans: ChallengePlan[], caseIds: string[] | undefined): ChoiceTarget[] {
  return plans.filter((p) => !caseIds || caseIds.includes(p.caseId)).flatMap((p) => p.targets);
}

const referencesOf = (key: string): string[] => [referenceKeyOf(key)].filter((k): k is string => typeof k === "string");

/** The switch the chapter planned from a case follows, as player1's pick reads it. */
function switchKindOf(evalCase: EvalCase): string | undefined {
  return evalCase.state ? pickedOutcome(caseStory(evalCase, false), "player1")?.kind : undefined;
}

/** The judged readings, each arm against production under the stop rule: every plan, by player count, by the switch the chapter follows. */
export function challengeReadings(verdicts: JudgedPlan[], cases: EvalCase[]): { label: string; readings: StageArmReading[] }[] {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const where = (keep: (c: EvalCase) => boolean) => verdicts.filter((v) => {
    const c = byId.get(v.caseId);
    return c !== undefined && keep(c);
  });
  return [
    { label: "Every plan", readings: stageReadings(verdicts, referencesOf) },
    { label: "One player", readings: stageReadings(where((c) => c.tags.players === 1), referencesOf) },
    { label: "Groups", readings: stageReadings(where((c) => c.tags.players > 1), referencesOf) },
    { label: "After a flavor switch", readings: stageReadings(where((c) => switchKindOf(c) === "flavor"), referencesOf) },
    { label: "After a topic switch", readings: stageReadings(where((c) => switchKindOf(c) === "topic"), referencesOf) },
  ];
}

/** One judged plan's challenge and contest results, and how many of them the judge labels the player's choice. */
export type ApproachRow = { armKey: string; caseId: string; sample: number; choice: number; results: number };

/** A judged plan's approach row from the judge's labels (its threads numbered as the judge read them); undefined where it wrote none. */
export function approachRow(plan: ChallengePlan, parsed: unknown): ApproachRow | undefined {
  const labels = (parsed as { results?: { thread?: number; label?: string }[] } | undefined)?.results;
  if (!Array.isArray(labels)) return undefined;
  const rolled = labels.filter((l) => {
    const kind = plan.kinds[(l.thread ?? 0) - 1];
    return kind === "challenge" || kind === "contest";
  });
  return { armKey: plan.armKey, caseId: plan.caseId, sample: plan.sample, choice: rolled.filter((l) => l.label === "player's choice").length, results: rolled.length };
}

type Tally = { hits: number; n: number };
export type ApproachReading = { armKey: string; share: Tally; referenceKey?: string; vsReference?: { reference: Tally; arm: Tally; noise?: number } & RateMove };

const shareOf = (rows: ApproachRow[]): Tally => ({ hits: rows.reduce((s, r) => s + r.choice, 0), n: rows.reduce((s, r) => s + r.results, 0) });
const rate = (t: Tally) => (t.n ? t.hits / t.n : undefined);
const pairOf = (r: ApproachRow) => `${r.caseId}|${r.sample}`;

/**
 * The share of challenge and contest results the judge labels the player's choice, pooled per arm; each arm against
 * production on the (case, sample) pairs both have, production's sample 1 against its sample 2 as the noise, under the
 * stop rule. A pooled share's items cluster within a plan, so its p reads optimistic: read it beside the plan rate.
 */
export function approachShareReadings(rows: ApproachRow[]): ApproachReading[] {
  const byArm = new Map<string, ApproachRow[]>();
  for (const r of rows) byArm.set(r.armKey, [...(byArm.get(r.armKey) ?? []), r]);
  return [...byArm.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, own]): ApproachReading => {
      const referenceKey = referencesOf(key)[0];
      const reference = referenceKey ? byArm.get(referenceKey) : undefined;
      if (!referenceKey || !reference) return { armKey: key, share: shareOf(own) };
      const shared = new Set(reference.map(pairOf).filter((p) => own.some((o) => pairOf(o) === p)));
      const [arm, ref] = [shareOf(own.filter((r) => shared.has(pairOf(r)))), shareOf(reference.filter((r) => shared.has(pairOf(r))))];
      const [s1, s2] = [rate(shareOf(reference.filter((r) => r.sample === 1))), rate(shareOf(reference.filter((r) => r.sample === 2)))];
      const noise = s1 !== undefined && s2 !== undefined ? Math.abs(s1 - s2) : undefined;
      return { armKey: key, share: shareOf(own), referenceKey, vsReference: { reference: ref, arm, ...(noise === undefined ? {} : { noise, ...rateMove(ref, arm, noise) }) } };
    });
}

// ---------------------------------------------------------------- the second round against the hand

export type ChallengeHandItem = { story: string; turn: number; hand: HandVerdict; note: string };

/**
 * The second round's 33 chapter plans, read by hand on 2026-10-01 on resultsFitKind's criterion (the choice-result
 * stage's calls: a result that names the player's approach fails even when mild; an achievement or a slip is an
 * outcome), before any call of this stage, beside the same judge's stored readings of the round (playthroughs-2.json,
 * one sample each). Where a flavor switch set the chapter's approach, the note says whether the results restate it.
 */
export const ROUND2_RESULTS_HAND: ChallengeHandItem[] = [
  { story: "play-lemonade", turn: 2, hand: false, note: "After a flavor switch (a pay-as-you-go order): 'Theo totals the small order before buying', 'Theo buys a compact, pay-as-you-go opening order, records every expense'" },
  { story: "play-lemonade", turn: 5, hand: true, note: "Exploration: Theo's repair and fee choices" },
  { story: "play-lemonade", turn: 9, hand: true, note: "Exploration: the role Theo gives Mara" },
  { story: "play-avalon", turn: 2, hand: false, note: "After a topic switch: 'Jun maps the disturbed dust without disturbing it', 'Jun and Mara carefully map the cradle's disturbed dust'" },
  { story: "play-avalon", turn: 6, hand: true, note: "Exploration: Jun's approaches to the stewards, each his choice with their response" },
  { story: "play-avalon", turn: 9, hand: true, note: "Exploration: what Jun shares with Orin" },
  { story: "play-avalon", turn: 13, hand: true, note: "Exploration: what Jun tells Orin of their past" },
  { story: "play-avalon", turn: 17, hand: false, note: "After a flavor switch (the ceramic coil simulation): 'Jun and Mara calibrate the coil against Mara's junction readings' (mild)" },
  { story: "play-avalon", turn: 21, hand: "partial", note: "After a flavor switch (Mara's diagram): the Compact's decisions are outcomes, but 'Mara's diagram clearly separates modeled exposure from consent' restates the switch's approach as a given" },
  { story: "play-avalon", turn: 24, hand: true, note: "Exploration: the history Jun asks Orin to carry" },
  { story: "play-food-trucks", turn: 2, hand: false, note: "Contest after a flavor switch: 'Suri's color-anchor trick', 'Jo's deliberate checks', 'Jo's carefully demonstrated station setup'" },
  { story: "play-food-trucks", turn: 6, hand: false, note: "After a topic switch: 'Suri listens to the waiting workers and adapts her shared-meal service', 'Suri focuses on explaining her special'" },
  { story: "play-food-trucks", turn: 9, hand: false, note: "Contest after a flavor switch: 'Suri gathers Slowglass residents' advice and adapts her service', 'Jo uses the baker's local knowledge'" },
  { story: "play-food-trucks", turn: 13, hand: false, note: "After a topic switch: 'Suri agrees to test a service change' (a decision)" },
  { story: "play-food-trucks", turn: 17, hand: "partial", note: "Contest after a topic switch: mostly how each station holds, but 'Suri's adaptive setup' and 'Jo's careful station setup' name each side's manner" },
  { story: "play-food-trucks", turn: 21, hand: true, note: "After a flavor switch: Jo's crew identifies a trigger and writes a rule (achievements); Suri's exploration her choices" },
  { story: "play-food-trucks", turn: 24, hand: false, note: "Contest after a flavor switch: 'Jo's crew positions the rota', 'Suri's refusal to use the cabinet', 'Jo's measured familiar service'" },
  { story: "play-space-pirates", turn: 2, hand: false, note: "Group challenge after a flavor switch: 'Bex coordinates the work while Jori confirms the right fittings and Pip pinpoints the heat pattern'" },
  { story: "play-space-pirates", turn: 6, hand: "partial", note: "Contest after a topic switch: mostly how the table responds, but 'Pip's emphasis on guaranteed ordinary shares' names her approach" },
  { story: "play-space-pirates", turn: 10, hand: false, note: "The converted contest after a topic switch: 'Pip makes the repair-reserve benefit concrete', 'Pip answers the objection with a specific crew safeguard'" },
  { story: "play-space-pirates", turn: 15, hand: false, note: "After a flavor switch: 'Jori matches a pause in the beacon rhythm', 'Pip separates the cleft's consistent silhouette', 'the crew avoids a blind push'" },
  { story: "play-space-pirates", turn: 19, hand: false, note: "After a flavor switch: 'Bex gets each crew member to name a risk, Jori marks the drive-idle points, Pip lays out a grit-free tool lane'" },
  { story: "play-space-pirates", turn: 23, hand: true, note: "Three exploration threads: each player's choices" },
  { story: "play-estate-agents", turn: 2, hand: false, note: "Contest after a flavor switch: 'Rory's careful separation of documented defects', 'Nia's distinction between records and rumor'" },
  { story: "play-estate-agents", turn: 6, hand: false, note: "After a topic switch: 'Rory lays out the undated plan', 'Rory gives management a careful account'" },
  { story: "play-estate-agents", turn: 9, hand: false, note: "Contest after a flavor switch: 'Rory makes the distinction precise and easy to verify', each side keeping records distinct" },
  { story: "play-estate-agents", turn: 13, hand: false, note: "After a topic switch: 'Nia listens to the residents' specific concerns', 'Nia addresses the residents' concerns and presents a vision'" },
  { story: "play-estate-agents", turn: 16, hand: false, note: "After a flavor switch: 'After Rory gives a candid account', 'Nia avoids linking', 'Nia acknowledges the resident's boundaries'" },
  { story: "play-estate-agents", turn: 20, hand: false, note: "After a flavor switch: 'Nia keeps the resident's signed note out of the sales summary' (the switch's pick, word for word)" },
  { story: "play-estate-agents", turn: 23, hand: false, note: "Contest after a flavor switch: 'Rory gives a clear, checkable explanation', 'Nia states a bounded, verifiable role'" },
  { story: "play-kids-mouse", turn: 2, hand: true, note: "After a topic switch: 'Bran spots that Marmalade followed a kitchen scent', 'Bran's close inspection stirs dust' (an achievement and a slip)" },
  { story: "play-kids-mouse", turn: 6, hand: true, note: "Exploration: how Bran keeps his promise to Pip" },
  { story: "play-kids-mouse", turn: 9, hand: false, note: "After a flavor switch (watch the loose board): 'Bran adjusts his hold', 'Bran steadies the loose board while Pip leads the listening'" },
];

export type StoredAgreement = {
  decided: number;
  agree: number;
  falsePasses: number;
  falseFails: number;
  partial: { yes: number; no: number };
  unread: number;
  rows: { story: string; turn: number; hand: HandVerdict; judged?: boolean }[];
};

/** The stored round's resultsFitKind verdicts (one sample each) against the hand; partial items apart; a plan without a verdict unread. */
export function storedAgreement(runs: PlayRun[], items: ChallengeHandItem[] = ROUND2_RESULTS_HAND): StoredAgreement {
  const a: StoredAgreement = { decided: 0, agree: 0, falsePasses: 0, falseFails: 0, partial: { yes: 0, no: 0 }, unread: 0, rows: [] };
  for (const item of items) {
    const run = runs.find((r) => r.spec.id === item.story);
    const judged = run?.judged?.find((j) => j.kind === "results" && j.turn === item.turn)?.verdict;
    a.rows.push({ story: item.story, turn: item.turn, hand: item.hand, ...(judged === undefined ? {} : { judged }) });
    if (judged === undefined) {
      a.unread++;
      continue;
    }
    if (item.hand === "partial") {
      a.partial[judged ? "yes" : "no"]++;
      continue;
    }
    a.decided++;
    if (judged === item.hand) a.agree++;
    else if (item.hand) a.falseFails++;
    else a.falsePasses++;
  }
  return a;
}

// ---------------------------------------------------------------- the modes

const runsOf = (ctx: Pick<PrepContext, "files">): PlayRun[] => playthroughRunsFrom(ctx.files.readPlaythroughs(PLAYTHROUGHS_2));

/** The prompt hash each stored playthrough call sent, by its output file. */
const promptHashesOf = (ctx: Pick<PrepContext, "files">) => {
  const byId = new Map(ctx.files.readPrepRecords().flatMap((r) => (r.outputFile && r.promptHash ? [[outputIdOf(r.outputFile), r.promptHash] as [string, string]] : [])));
  return (outputFile: string) => byId.get(outputIdOf(outputFile));
};

export function buildChallengeCasesMode(ctx: Pick<PrepContext, "files" | "log">, replace: boolean): void {
  const { files, log } = ctx;
  if (!files.casesExist()) throw new Error("No frozen cases. Run --build-cases first.");
  const runs = runsOf(ctx);
  if (runs.length === 0) throw new Error("No stored second-round playthroughs (playthroughs-2.json). Run --playthroughs --round 2 first.");
  const { cases, problems, skipped } = challengeResultsCasesToFreeze(files.readCases(), runs, promptHashesOf(ctx), replace);
  if (problems.length) throw new Error(problems.join("; "));
  if (skipped.length) log(`Already frozen, left as they are: ${skipped.join(", ")}.`);
  if (cases.length === 0) return log("Nothing new to freeze; no calls.");
  files.addCases(cases, undefined, replace);
  log(`Froze ${cases.map((c) => c.id).join(", ")} beside the other cases; no calls.`);
}

export async function judgeChallengeResultsMode(ctx: PrepContext, options: { caseIds?: string[] } = {}): Promise<void> {
  const { files, log } = ctx;
  const lookup = { records: files.readRecords(), cases: files.readCases(), load: files.loadOutput };
  const plans = plansToJudge(lookup);
  const arm = JUDGE_ARMS[0];
  const jobs = choiceJudgeJobs(targetsToSend(plans, options.caseIds), arm, CHALLENGE_RESULTS_PROMPT_STATE, STAGE);
  const done = finishedJobKeys(files.readPrepRecords());
  const open = jobs.filter((j) => !done.has(keyOf(j)));
  const estimate = open.reduce((sum, j) => sum + jobEstimateUsd(j), 0);
  ctx.refuse(STAGE, estimate);
  log(`${plans.length} chapter plans of the stage's arms on ${arm.key} (stage ${STAGE}): ${jobs.length} calls, ${open.length} open, est $${estimate.toFixed(3)}`);
  const result = await runJobs(jobs, ctx.deps("prep"), { caps: ctx.caps, previous: files.readPrepRecords(), extraSpend: spendBeside(files, "prep"), tokensPerMinute: ctx.tpm, maxInFlight: ctx.maxInFlight });
  if (result.stoppedReason) log(`Stopped: ${result.stoppedReason}`);
  writeJudgedChallengeResults(ctx, plans, lookup.cases, runsOf(ctx));
}

const pct = (n: number, d: number) => (d === 0 ? "–" : `${Math.round((100 * n) / d)}%`);
const tallyText = (t?: Tally) => (t ? `${t.hits} of ${t.n} (${pct(t.hits, t.n)})` : "–");
const pText = (p?: number) => (p === undefined ? "" : p < 0.001 ? " (p < 0.001)" : ` (p ${p.toFixed(3)})`);
const moveText = (c?: { noise?: number } & RateMove) =>
  !c ? "–" : c.noise === undefined ? "no noise figure" : c.moved ? `moved ${c.moved}${pText(c.p)}` : c.beyondNoise ? `beyond the noise, not moved${pText(c.p)}` : "within the noise";

/** judged-challenge-results.md and .json from every judge call so far and the stage's plans; no calls. */
export function writeJudgedChallengeResults(ctx: Pick<PrepContext, "files" | "log">, plans: ChallengePlan[], cases: EvalCase[], runs: PlayRun[]): void {
  const { files, log } = ctx;
  const prep = files.readPrepRecords();
  const arm = JUDGE_ARMS[0];
  const parsedAt = (key: string) => {
    const record = finishedPrepRecord(prep, jobKey(choiceJudgeCaseId(RESULTS_CHECK, key), prepArmKey("judge", arm), CHALLENGE_RESULTS_PROMPT_STATE, 1));
    return record ? files.loadOutput(record) : undefined;
  };
  const verdicts = plans.flatMap((p) => {
    const v = replyVerdict(p, (key) => verdictFrom(parsedAt(key), RESULTS_CHECK));
    return v ? [v] : [];
  });
  const groups = challengeReadings(verdicts, cases);
  const approach = approachShareReadings(plans.flatMap((p) => {
    const row = approachRow(p, parsedAt(p.outputId));
    return row ? [row] : [];
  }));
  const failures = plans.flatMap((p) => {
    const parsed = parsedAt(p.outputId);
    if (verdictFrom(parsed, RESULTS_CHECK) !== false) return [];
    const said = evidenceFrom(parsed, RESULTS_CHECK);
    return [{ armKey: p.armKey, caseId: p.caseId, sample: p.sample, outputId: p.outputId, evidence: said.evidence ?? "", lines: said.lines.filter((l) => l.includes("player's choice")) }];
  });
  const stored = storedAgreement(runs);
  // The stage's planner calls (calls.jsonl) and its judge calls (prep-calls.jsonl)
  const spentUsd = [...files.readRecords(), ...prep].filter((r) => r.stage === STAGE).reduce((sum, r) => sum + r.costUsd, 0);
  const generatedAt = new Date();
  const lines = [
    "# Judged check: challenge and contest results as outcomes",
    "",
    `Generated ${generatedAt.toISOString()} from prep-calls.jsonl (challengeResultsPrep.ts; the choice-result stage's resultsFitKind, choiceResultJudge.ts prompt v${CHOICE_JUDGE_PROMPT_VERSION}, calibrated reliable there). One Luna low call per chapter plan of the stage's arms under ${CHALLENGE_RESULTS_PROMPT_STATE}, read after the game's plan check. A candidate reads against production on the (case, sample) pairs both have, production's sample 1 against its sample 2 as the noise, the stop rule on top. Spent in the stage so far (plans and judge calls): $${spentUsd.toFixed(4)}.`,
    "",
    "## Plans whose every result fits its kind",
    "",
    "| Plans | Arm | Passing | Arm on the shared pairs | Production on them | Noise | Reading |",
    "|---|---|---|---|---|---|---|",
    ...groups.flatMap((g) =>
      g.readings.map((r) => `| ${g.label} | ${r.armKey} | ${tallyText(r.plans)} | ${tallyText(r.vsReference?.arm)} | ${tallyText(r.vsReference?.reference)} | ${r.vsReference?.noise === undefined ? "–" : `${Math.round(100 * r.vsReference.noise)} pts`} | ${r.referenceKey ? moveText(r.vsReference) : "–"} |`)
    ),
    "",
    "## Challenge and contest results the judge labels the player's choice (pooled; items cluster within a plan)",
    "",
    "| Arm | Labelled the player's choice | Arm on the shared pairs | Production on them | Noise | Reading |",
    "|---|---|---|---|---|---|",
    ...approach.map((r) => `| ${r.armKey} | ${tallyText(r.share)} | ${tallyText(r.vsReference?.arm)} | ${tallyText(r.vsReference?.reference)} | ${r.vsReference?.noise === undefined ? "–" : `${Math.round(100 * r.vsReference.noise)} pts`} | ${r.referenceKey ? moveText(r.vsReference) : "–"} |`),
    "",
    "## The second round's stored readings against the hand (no calls)",
    "",
    `The same judge on the round's 33 stored plans (one sample each), against the hand read before this stage's calls: ${stored.agree} of ${stored.decided} decided plans agree (judged yes where the hand says no: ${stored.falsePasses}; judged no where the hand says yes: ${stored.falseFails}); partial ${stored.partial.yes} judged yes, ${stored.partial.no} no; ${stored.unread} without a stored verdict.`,
    "",
    "| Plan | Hand | Stored judge | Hand reading |",
    "|---|---|---|---|",
    ...stored.rows.map((row) => {
      const note = ROUND2_RESULTS_HAND.find((i) => i.story === row.story && i.turn === row.turn)?.note ?? "";
      const hand = row.hand === "partial" ? "partial" : row.hand ? "yes" : "no";
      return `| ${row.story} t${row.turn} | ${hand} | ${row.judged === undefined ? "–" : row.judged ? "yes" : "no"} | ${note} |`;
    }),
    "",
    "## Judged failures of the arms",
    "",
    ...failures.map((f) => `- ${f.armKey} ${f.caseId} s${f.sample} (${f.outputId}): ${f.evidence.replace(/\s+/g, " ").trim()}${f.lines.length ? ` [${f.lines.join("; ")}]` : ""}`),
  ];
  files.writeJudgedChallengeResults(`${lines.join("\n")}\n`, { generatedAt: generatedAt.toISOString(), promptState: CHALLENGE_RESULTS_PROMPT_STATE, promptVersion: CHOICE_JUDGE_PROMPT_VERSION, verdicts, groups, approach, failures, stored, spentUsd });
  for (const g of groups) {
    for (const r of g.readings) log(`  ${g.label}: ${r.armKey} ${r.plans.hits} of ${r.plans.n}${r.vsReference && r.referenceKey ? `; against production ${r.vsReference.arm.hits}/${r.vsReference.arm.n} vs ${r.vsReference.reference.hits}/${r.vsReference.reference.n}, ${moveText(r.vsReference)}` : ""}`);
  }
  for (const r of approach) log(`  labelled the player's choice: ${r.armKey} ${r.share.hits} of ${r.share.n}${r.vsReference ? `, ${moveText(r.vsReference)}` : ""}`);
  log(`The stored round against the hand: ${stored.agree} of ${stored.decided} agree, ${stored.unread} unread. Stage so far $${spentUsd.toFixed(4)}. Wrote judged-challenge-results.md and .json.`);
}
