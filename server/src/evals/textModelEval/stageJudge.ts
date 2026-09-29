import { z } from "zod";
import type { Story } from "core/models/Story.js";
import type { TextRequest } from "../../game/services/storyTextSteps.js";
import { stageOf } from "../../game/services/storyTextRounds/pacing.js";
import type { Arm, Stage } from "./arms.js";
import { isReliable, type HandVerdict } from "./judgedChecks.js";
import { prepJob } from "./prepCalls.js";
import type { Job } from "./runner.js";
import { rateMove, type RateMove } from "./stopRule.js";

/*
 * The stage scoping's judged check (the owner's feedback of 2026-09-29: an
 * outcome of three milestones whose first chapter, meant to collect the
 * evidence, already turned to exposing it). One cheap GPT-6 call per chapter
 * thread whose outcome has a later stage (stage k of n with k < n) asks
 * staysWithinStage: the chapter's question, steps and results stay within
 * the stage it settles, phrased so yes passes. The judge names the outcome's
 * stages itself first, from the outcome's question, its endings and its
 * milestones so far, then quotes the words that decide the answer. It reads
 * only what every planner form writes (title, steps with their results, the
 * possible milestones, the kind of milestone) and the chapter question where
 * the plan has one; never a plan's own stage list (planner v2d's), so the arms
 * read alike.
 *
 * Calibrated on hand-read plans (STAGE_JUDGE_CALIBRATION): the owner's Waste
 * Ring chapter and its twin from the other playthrough, stored plans of
 * today's form on gpt-4.1-mini and Luna, planner v2 and v2c's plans, and two
 * constructed failing versions of Luna plans, so the hand no is not only one
 * model's; reliable by the judged checks' standard (isReliable: at least 85%
 * agreement on the hand yes and on the hand no, at least 3 each, and two
 * samples agreeing on 90%).
 */

export const STAGE_CHECK = "staysWithinStage" as const;

/** Part of each stage judge call's key: a wording change is judged afresh. */
export const STAGE_JUDGE_PROMPT_VERSION = 1;

type Results = Record<string, string>;

/** A chapter thread as the judge reads it: what every planner form writes, and the chapter's question where it has one. */
export type JudgedThread = {
  outcomeId: string;
  title: string;
  playersSideA: string[];
  playersSideB: string[];
  typeOfMilestone?: string;
  question?: string;
  progression: { title: string; question: string; possibleResolutions: Results }[];
  possibleMilestones: Results;
};

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});
const asString = (value: unknown): string => (typeof value === "string" ? value : "");
const asStrings = (value: unknown): string[] => (Array.isArray(value) ? value.map(asString) : []);
const asResults = (value: unknown): Results => Object.fromEntries(Object.entries(asObject(value)).map(([key, text]) => [key, asString(text)]));

/** A stored or written thread as the judge reads it; a plan's own stage list and plan text stay out. */
export function judgedThread(thread: unknown): JudgedThread {
  const t = asObject(thread);
  return {
    outcomeId: asString(t.outcomeId),
    title: asString(t.title),
    playersSideA: asStrings(t.playersSideA),
    playersSideB: asStrings(t.playersSideB),
    ...(typeof t.typeOfMilestone === "string" ? { typeOfMilestone: t.typeOfMilestone } : {}),
    ...(typeof t.question === "string" && t.question.trim() ? { question: t.question } : {}),
    progression: (Array.isArray(t.progression) ? t.progression : []).map((s) => {
      const step = asObject(s);
      return { title: asString(step.title), question: asString(step.question), possibleResolutions: asResults(step.possibleResolutions) };
    }),
    possibleMilestones: asResults(t.possibleMilestones),
  };
}

/** The stage a thread settles on its story where a later one exists, so the check applies; undefined otherwise. */
export function judgedStage(story: Story, thread: Pick<JudgedThread, "outcomeId">): { stage: number; of: number } | undefined {
  const outcome = thread.outcomeId ? story.getOutcomeById(thread.outcomeId) : undefined;
  if (!outcome) return undefined;
  const stage = stageOf(outcome.milestones?.length ?? 0, outcome.intendedNumberOfMilestones);
  return stage && !stage.last ? { stage: stage.stage, of: stage.of } : undefined;
}

const INTRO = `YOUR JOB: CHECK ONE CHAPTER PLAN OF A STORY GAME

In this game a story's outcomes are settled over several chapters. An outcome with n intended milestones has n stages from start to finish. Each chapter that pushes the outcome settles its next stage and adds one milestone, which records how that stage went. So a chapter stays within its stage when its question, every step and every result are about what that stage settles. A result may make a later stage easier or harder (a lead found, an ally won or lost, a door left open). A chapter reaches past its stage when a step turns to a later stage's task (starts, plans or carries it out), or when a result already achieves what a later stage is for or settles the outcome itself.

Read the chapter plan below as a careful editor and answer the question about it. Name the outcome's stages first, then quote the words that decide the answer before you give it.

An example from another story: the outcome "Will Mara win the regional baking championship?" with 3 milestones has the stages 1. qualify at the town fair; 2. place at the county round; 3. win the regional final. A chapter at stage 1 whose last step is "How does Mara impress the regional judges?", or whose best result is "Mara's pie wins her the championship", reaches past its stage. One whose results are "Mara qualifies with the judges' praise", "Mara scrapes into the county round" and "Mara misses the cut" stays within it, even though qualifying opens the way to stage 2.`;

const QUESTION = (stage: number, of: number) =>
  `${STAGE_CHECK}: Does this chapter stay within stage ${stage} of ${of}? First name the outcome's ${of} stages from start to finish, as its question, how it can end and its milestones so far suggest: the stages its milestones so far settled first, as those milestones read. Then read the chapter's question, every step and every result against stage ${stage}. Answer no if any step turns to the task of a later stage or any result already does what a later stage is for, including settling the outcome itself. Answer yes if everything stays within stage ${stage}, even where a result prepares or points toward a later stage.`;

const EVIDENCE = "The words of the plan that decide the answer, quoted with the step or result they come from, or what is missing; one or two sentences.";

export function stageJudgeSchema() {
  return z.object({
    stages: z.array(z.string()).max(6).describe("The outcome's stages from start to finish as you read them, one per intended milestone, in order, a few words each."),
    [STAGE_CHECK]: z.object({ evidence: z.string().describe(EVIDENCE), answer: z.enum(["yes", "no"]).describe(`The answer to the question ${STAGE_CHECK} above`) }),
  });
}

const resultLines = (results: Results) => Object.entries(results).map(([key, text]) => `  ${key}: ${text}`);
const sameResults = (a: Results, b: Results) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

/** The judge's request for one thread, or undefined where the check does not apply (no outcome, its last stage, or complete). */
export function stageJudgeRequest(story: Story, thread: JudgedThread): TextRequest | undefined {
  const stage = judgedStage(story, thread);
  const outcome = story.getOutcomeById(thread.outcomeId);
  if (!stage || !outcome) return undefined;
  const name = (slot: string) => story.getPlayer(slot)?.name ?? slot;
  const milestones = outcome.milestones ?? [];
  const players = thread.playersSideB.length
    ? `Players: one side ${thread.playersSideA.map(name).join(", ")}; the other side ${thread.playersSideB.map(name).join(", ")}`
    : `Players: ${thread.playersSideA.map(name).join(", ")}`;
  const kind = thread.typeOfMilestone && thread.typeOfMilestone.trim() !== (thread.question ?? "").trim() ? [`Kind of milestone: ${thread.typeOfMilestone}`] : [];
  const last = thread.progression.length - 1;
  const steps = thread.progression.flatMap((step, i) => [
    `Step ${i + 1}${i === last ? " (the last)" : ""}: ${step.title} — ${step.question}`,
    ...(i === last && sameResults(step.possibleResolutions, thread.possibleMilestones) ? ["  (its results are the possible milestones below)"] : resultLines(step.possibleResolutions)),
  ]);
  const later = stage.stage + 1 === stage.of ? `Stage ${stage.of} comes in a later chapter.` : `Stages ${stage.stage + 1} to ${stage.of} come in later chapters.`;
  const sections = [
    INTRO,
    ["======= THE STORY =======", `Title: ${story.getTitle()}`, `The players' characters: ${story.getPlayerSlots().map(name).join(", ")}`].join("\n"),
    [
      "======= THE OUTCOME =======",
      `Question: ${outcome.question}`,
      "How it can end:",
      ...resultLines(asResults(outcome.possibleResolutions)),
      `Intended milestones: ${stage.of}`,
      milestones.length ? "Milestones so far:" : "Milestones so far: none.",
      ...milestones.map((m, i) => `  ${i + 1}. ${m}`),
      `This chapter adds milestone ${stage.stage}: it settles stage ${stage.stage} of ${stage.of}. ${later}`,
    ].join("\n"),
    [
      "======= THE CHAPTER PLAN =======",
      `Title: ${thread.title}`,
      players,
      ...(thread.question ? [`Chapter question: ${thread.question}`] : []),
      ...kind,
      ...steps,
      "Possible milestones (one is added to the outcome when the chapter ends):",
      ...resultLines(thread.possibleMilestones),
    ].join("\n"),
    ["======= QUESTION =======", QUESTION(stage.stage, stage.of)].join("\n"),
  ];
  return { prompt: sections.join("\n\n"), schema: stageJudgeSchema() };
}

/** The verdict: true when the judge answered yes, undefined where it answered neither. */
export function stageVerdictFrom(parsed: unknown): boolean | undefined {
  const answer = asObject(asObject(parsed)[STAGE_CHECK]).answer;
  return answer === "yes" ? true : answer === "no" ? false : undefined;
}

/** The judge's quoted evidence and the stages it named. */
export function stageEvidenceFrom(parsed: unknown): { evidence?: string; stages: string[] } {
  const reply = asObject(parsed);
  const evidence = asObject(reply[STAGE_CHECK]).evidence;
  return { ...(typeof evidence === "string" ? { evidence } : {}), stages: asStrings(reply.stages) };
}

export const stageJudgeCaseId = (key: string, version = STAGE_JUDGE_PROMPT_VERSION) => `judge-stage-v${version}-${key}`;

/** Luna low reads one chapter plan and writes a stage list and a short answer */
const STAGE_JUDGE_OUTPUT_TOKENS = 1_000;

/** The judge calls: each target at its number of samples (the calibration's two, the rest one). */
export function stageJudgeJobs(targets: { key: string; request: TextRequest; samples: number }[], arm: Arm, promptState: string, stage: Stage): Job[] {
  return targets.flatMap((target) =>
    Array.from({ length: target.samples }, (_, i) =>
      prepJob({
        kind: "judge",
        stage,
        promptState,
        caseId: stageJudgeCaseId(target.key),
        sample: i + 1,
        arm,
        role: "thread",
        players: 1,
        build: () => target.request,
        outputTokens: STAGE_JUDGE_OUTPUT_TOKENS,
      })
    )
  );
}

// --- Calibration on hand-read plans ---

/** A constructed failing version of a stored plan: its last step and milestones replaced. */
export type ConstructedEdit = { from: string; lastStepQuestion: string; milestones: Results };

export type StageCalibrationItem = {
  id: string;
  /** A stored plan's output id, a stored chapter's key (chapterFrames.ts), or a constructed version of an output */
  source: { output: string } | { chapter: string } | { constructed: ConstructedEdit };
  /** The thread within the plan (default the first) */
  thread?: number;
  hand: HandVerdict;
  /** Who wrote the plan, so the hand sets' mix shows */
  writer: string;
  note: string;
};

const MINI = "gpt-4.1-mini (today's form)";
const LUNA_TODAY = "Luna low (today's form)";

/**
 * Plans read by hand on the check's criterion (2026-09-29): stage k of n
 * with k < n; yes when every step and result stays within stage k, no when a
 * step turns to a later stage's task or a result already achieves a later
 * stage or the outcome, partial where a result reaches toward a later stage
 * in a way the rule could read either way (left out of agreement).
 */
export const STAGE_JUDGE_CALIBRATION: StageCalibrationItem[] = [
  // --- Hand no ---
  {
    id: "owner-waste-ring",
    source: { chapter: "ca5b2055bfee" },
    hand: false,
    writer: "gpt-4.1-mini in play (the stored story)",
    note: "The owner's example: stage 1 of 3 of expose-and-dismantle; the last step asks how Arielle plans to expose the Waste Ring, and its results are an exposé that can trigger reforms",
  },
  {
    id: "waste-ring-twin",
    source: { chapter: "9086a93d6e3f" },
    hand: false,
    writer: "gpt-4.1-mini in play (the other Novi Reg playthrough)",
    note: "The same chapter in the other playthrough: stage 1 of 3, the last step 'How does Arielle attempt to expose the Waste Ring's illegal activities?'",
  },
  { id: "agency-mini-s1", source: { output: "3d1cc4cb9777ff8cc924" }, hand: false, writer: MINI, note: "Stage 1 of 3 of 'secure a contract': the favorable last result 'secures a group contract' settles the outcome" },
  { id: "agency-mini-s2", source: { output: "4b9acd58e4041239c6ec" }, hand: false, writer: MINI, note: "Stage 1 of 3: the last step asks what contract offers Aria extends, and 'a lucrative, high-profile contract together' settles the outcome" },
  { id: "overlord-mini-s1", source: { output: "cd828368630f244da177" }, hand: false, writer: MINI, note: "Stage 1 of 3 of 'which overlord gains dominance': the final gambit secures Vrax's dominance or Zyn's ascendancy" },
  { id: "overlord-mini-s2", source: { output: "af98ef70d83f0f4bedef" }, hand: false, writer: MINI, note: "Stage 1 of 3: the decisive move secures Vrax's dominance or Zyn's culinary hegemony" },
  { id: "forest-mini-s1", source: { output: "3fd4a8d265e9cff2bc29" }, hand: false, writer: MINI, note: "Stage 1 of 3 of 'preserve the forest against all threats': the last step's favorable result secures the forest's future" },
  { id: "band-mini-s2", source: { output: "46e296d33bcd1a13a99d" }, hand: false, writer: MINI, note: "Stage 1 of 3 of 'lasting fame on Mars': the first club set's finale 'defines their legacy' and 'elevates the band's fame dramatically'" },
  {
    id: "agency-v2c-constructed",
    source: {
      constructed: {
        from: "bfe42c8c4d2cba57b687",
        lastStepQuestion: "The contract: With the audition footage playing on the downtown billboards, how do Mason and Eliot make their case when Aria decides whether to sign them together?",
        milestones: {
          favorable: "Aria Steel signs Mason and Eliot to a joint, high-profile agency contract.",
          mixed: "Aria Steel offers Mason a contract of his own and leaves Eliot out.",
          unfavorable: "Aria Steel passes on both of them, and the agency signs Jorge Sky instead.",
        },
      },
    },
    hand: false,
    writer: "constructed from planner v2c (Luna low)",
    note: "Planner v2c's audition chapter with its last step and milestones turned into the contract signing itself: stage 1 of 3 settles the outcome",
  },
  {
    id: "forest-v2c-constructed",
    source: {
      constructed: {
        from: "c182566260e5b81bb191",
        lastStepQuestion: "Decisive effort: With the blight retreating toward the forest's edge, how do Vernalith and Russetveil drive it out of the whole forest?",
        milestones: {
          favorable: "Vernalith and Russetveil drive the blight from the forest for good, and the villagers hail the spirits as its guardians.",
          mixed: "The spirits drive the blight back across most of the forest, but scarred groves remain beyond their reach.",
          unfavorable: "The blight breaks through the clearing and spreads across the forest, and the spirits' power fades.",
        },
      },
    },
    hand: false,
    writer: "constructed from planner v2c (Luna low)",
    note: "Planner v2c's blighted-clearing chapter with its last step and milestones turned into saving the whole forest: stage 1 of 3 settles the outcome",
  },
  // --- Hand yes ---
  { id: "agency-luna-s1", source: { output: "b04d15447e4920286f55" }, hand: true, writer: LUNA_TODAY, note: "Stage 1 of 3: the audition earns serious consideration for a shared contract, no contract yet" },
  { id: "overlord-luna-s2", source: { output: "60fe3aa39d077a40dc1f" }, hand: true, writer: LUNA_TODAY, note: "Stage 1 of 3: an early advantage for one overlord, the rival still in the contest" },
  { id: "forest-luna-s1", source: { output: "3df2dede83a9966441ab" }, hand: true, writer: LUNA_TODAY, note: "Stage 1 of 3: a lasting patch of healthy growth in one clearing, buying the forest time" },
  { id: "treasure-mini-s1", source: { output: "3aa16d4d3d47bb38d748" }, hand: true, writer: MINI, note: "Stage 1 of 3 of 'who claims the treasure': a shortcut that advances a position in the race" },
  { id: "cafe-mini-s1", source: { output: "77f47699f3d1dee88964" }, hand: true, writer: MINI, note: "Stage 1 of 3 of the café's success: one contemplative event and its reception" },
  { id: "band-mini-s1", source: { output: "c4e17b65aa607884c235" }, hand: true, writer: MINI, note: "Stage 1 of 3 of 'lasting fame': the first performance's encore electrifies the crowd, nothing beyond the room" },
  { id: "cafe-mini-chapter", source: { chapter: "3dcafac2d668" }, hand: true, writer: "gpt-4.1-mini in play", note: "Stage 1 of 3 of the café's success: new menu items and an event against the rival bakery" },
  { id: "waste-ring-v2c-stage2", source: { output: "c439d232712b30c812ce" }, hand: true, writer: "planner v2c (Luna low)", note: "Stage 2 of 3, after the exposé: a coalition that keeps pressure on the Waste Ring, not yet dismantling it" },
  { id: "waste-ring-v2-stage2", source: { output: "b0086a651f9f35b7e20d" }, hand: true, writer: "planner v2 (Luna low)", note: "Stage 2 of 3: testimony during the blackout identifies another link in the network" },
  { id: "agency-v2c-s1", source: { output: "bfe42c8c4d2cba57b687" }, hand: true, writer: "planner v2c (Luna low)", note: "Stage 1 of 3: Aria invites the pair to a private team callback (the base of the constructed no)" },
  { id: "forest-v2c-s1", source: { output: "c182566260e5b81bb191" }, hand: true, writer: "planner v2c (Luna low)", note: "Stage 1 of 3: a living boundary around the blighted clearing (the base of the constructed no)" },
  // --- Partial, left out of agreement ---
  { id: "band-v2c-s1", source: { output: "9107ad8bf80a63018cb8" }, hand: "partial", writer: "planner v2c (Luna low)", note: "Stage 1 of 3: the favorable result has live coverage carry the band's name across Mars, which may reach into a wider stage" },
  { id: "runes-mini-s1", source: { output: "f2e00480eb4d8411e9ee" }, hand: "partial", writer: MINI, note: "Stage 1 of 2: the last step decides what to do next, a midnight exploration planned, which could read as turning to the next stage's task" },
  { id: "forest-mini-s2", source: { output: "b77513e75ce467da4ce9" }, hand: "partial", writer: MINI, note: "Stage 1 of 3: 'securing a turning point for forest health' may claim more than one clearing" },
];

export type StageAgreement = {
  check: typeof STAGE_CHECK;
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
export function scoreStageCalibration(items: StageCalibrationItem[], judged: { itemId: string; samples: (boolean | undefined)[] }[]): StageAgreement {
  const byItem = new Map(judged.map((j) => [j.itemId, j]));
  const a: StageAgreement = { check: STAGE_CHECK, decided: 0, agree: 0, falseFails: 0, falsePasses: 0, handPasses: 0, handFails: 0, pairs: 0, pairsAgree: 0, partial: { yes: 0, no: 0 }, reliable: false };
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

// --- The plans, judged ---

/** One judged plan: passes when every thread the check applies to passes; a plan it applies to nowhere is left out. */
export type JudgedPlan = { armKey: string; caseId: string; sample: number; outputId: string; passes: boolean; threads: number };

type Tally = { hits: number; n: number };
export type StageComparison = { reference: Tally; arm: Tally; noise?: number } & RateMove;
export type StageArmReading = { armKey: string; plans: Tally; referenceKey?: string; vsReference?: StageComparison };

const tallyOf = (plans: JudgedPlan[]): Tally => ({ hits: plans.filter((p) => p.passes).length, n: plans.length });
const rateOf = (t: Tally) => (t.n ? t.hits / t.n : undefined);
const pairOf = (p: JudgedPlan) => `${p.caseId}|${p.sample}`;

/** Each arm's pass rate, and a candidate against each reference on the (case, sample) pairs both have, under the stop rule. */
export function stageReadings(plans: JudgedPlan[], referencesOf: (armKey: string) => string[]): StageArmReading[] {
  const byArm = new Map<string, JudgedPlan[]>();
  for (const p of plans) byArm.set(p.armKey, [...(byArm.get(p.armKey) ?? []), p]);
  return [...byArm.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([armKey, own]) => {
      const readings = referencesOf(armKey).flatMap((referenceKey): StageArmReading[] => {
        const reference = byArm.get(referenceKey);
        if (!reference) return [];
        const shared = new Set(reference.map(pairOf).filter((p) => own.some((o) => pairOf(o) === p)));
        const [armShared, refShared] = [own.filter((p) => shared.has(pairOf(p))), reference.filter((p) => shared.has(pairOf(p)))];
        if (armShared.length === 0) return [];
        const cases = new Set(armShared.map((p) => p.caseId));
        const refOnCases = reference.filter((p) => cases.has(p.caseId));
        const [s1, s2] = [rateOf(tallyOf(refOnCases.filter((p) => p.sample === 1))), rateOf(tallyOf(refOnCases.filter((p) => p.sample === 2)))];
        const noise = s1 !== undefined && s2 !== undefined ? Math.abs(s1 - s2) : undefined;
        const [ref, arm] = [tallyOf(refShared), tallyOf(armShared)];
        return [{ armKey, plans: tallyOf(own), referenceKey, vsReference: { reference: ref, arm, ...(noise === undefined ? {} : { noise, ...rateMove(ref, arm, noise) }) } }];
      });
      return readings.length ? readings : [{ armKey, plans: tallyOf(own) }];
    });
}

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

function calibrationReading(a: StageAgreement): string {
  if (a.reliable) return "reliable";
  const few = [a.handPasses < 3 ? "yes" : "", a.handFails < 3 ? "no" : ""].filter(Boolean);
  return few.length ? `not reliable (too few hand ${few.join(" and ")})` : "not reliable";
}

export type StageFailure = { armKey: string; caseId: string; sample: number; outputId: string; evidence: string };

/** judged-stages.md: the calibration, each arm's rates and a candidate against its references, the calibration items, and the failures. */
export function renderStageJudge(input: {
  items: StageCalibrationItem[];
  calibration: StageAgreement;
  judged: { itemId: string; samples: (boolean | undefined)[]; evidence: { evidence?: string; stages: string[] }[] }[];
  readings: StageArmReading[];
  failures: StageFailure[];
  spentUsd: number;
  generatedAt: Date;
  problems: string[];
}): string {
  const lines = [
    "# Judged check: the chapter stays within its stage",
    "",
    `Generated ${input.generatedAt.toISOString()} from prep-calls.jsonl (stageJudge.ts, prompt v${STAGE_JUDGE_PROMPT_VERSION}): one Luna low call per chapter thread whose outcome has a later stage (stage k of n, k < n) asks whether its question, steps and results stay within stage k (${STAGE_CHECK}); the judge names the stages itself and never sees a plan's own stage list. A plan passes when every thread the check applies to passes. Calibrated on hand-read plans; reliable when sample 1 agrees on at least 85% of the hand yes and of the hand no, each side holding at least 3, and two samples agree on at least 90%. A candidate reads against each reference on the plans both have, with the reference's sample-1-against-sample-2 difference as the noise and the stop rule on top. Spent on these judge calls: $${input.spentUsd.toFixed(4)}.`,
    "",
    "## Calibration",
    "",
    "| Check | Agree (sample 1) | Hand yes / no | Judged no where the hand says yes | Judged yes where the hand says no | Samples agree | On partial items (yes / no) | Reading |",
    "|---|---|---|---|---|---|---|---|",
    `| ${STAGE_CHECK} | ${input.calibration.agree} of ${input.calibration.decided} (${pct(input.calibration.agree, input.calibration.decided)}) | ${input.calibration.handPasses} / ${input.calibration.handFails} | ${input.calibration.falseFails} | ${input.calibration.falsePasses} | ${input.calibration.pairs ? `${input.calibration.pairsAgree} of ${input.calibration.pairs}` : "–"} | ${input.calibration.partial.yes} / ${input.calibration.partial.no} | ${calibrationReading(input.calibration)} |`,
    "",
    "## Readings",
    "",
    "| Arm | Plans passing | Against | Arm on the shared plans | Reference on them | Noise | Reading |",
    "|---|---|---|---|---|---|---|",
    ...input.readings.map((r) =>
      r.vsReference && r.referenceKey
        ? `| ${r.armKey} | ${tallyText(r.plans)} | ${r.referenceKey} | ${tallyText(r.vsReference.arm)} | ${tallyText(r.vsReference.reference)} | ${r.vsReference.noise === undefined ? "–" : `${Math.round(100 * r.vsReference.noise)} pts`} | ${readingText(r.vsReference)} |`
        : `| ${r.armKey} | ${tallyText(r.plans)} | – | – | – | – | – |`
    ),
    "",
    "## Calibration items",
    "",
    "| Item | Written by | Hand | Judged (samples) | Hand reading |",
    "|---|---|---|---|---|",
  ];
  for (const item of input.items) {
    const judged = input.judged.find((j) => j.itemId === item.id);
    lines.push(`| ${item.id} | ${item.writer} | ${verdictText(item.hand)} | ${judged?.samples.map(verdictText).join("/") || "–"} | ${item.note} |`);
  }
  const disagreements = input.items.flatMap((item) => {
    const judged = input.judged.find((j) => j.itemId === item.id);
    const first = judged?.samples[0];
    if (item.hand === "partial" || first === undefined || first === item.hand) return [];
    const said = judged?.evidence[0];
    return [`- ${item.id}: hand ${verdictText(item.hand)}, judged ${verdictText(first)}. Stages: ${(said?.stages ?? []).join("; ")}. Evidence: ${(said?.evidence ?? "").replace(/\s+/g, " ").trim()}`];
  });
  if (disagreements.length) lines.push("", "## Where sample 1 disagrees with the hand", "", ...disagreements);
  if (input.failures.length) {
    lines.push("", "## Plans judged to reach past their stage", "", ...input.failures.map((f) => `- ${f.armKey} ${f.caseId} s${f.sample} (${f.outputId}): ${f.evidence.replace(/\s+/g, " ").trim()}`));
  }
  if (input.problems.length) lines.push("", "## Problems", "", ...input.problems.map((p) => `- ${p}`));
  return `${lines.join("\n")}\n`;
}
