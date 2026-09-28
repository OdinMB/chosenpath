import { z } from "zod";
import type { Story } from "core/models/Story.js";
import type { Beat, BeatOption, PlayerSlot, SetOfBeatGenerationSchema } from "core/types/index.js";
import type { TextRequest } from "../../game/services/storyTextSteps.js";
import { makeArm, type Arm } from "./arms.js";
import type { ChapterFrame } from "./cases.js";
import { playerParagraphs } from "./playerText.js";
import { prepJob } from "./prepCalls.js";
import type { Job } from "./runner.js";
import { rateMove, type RateMove } from "./stopRule.js";

/*
 * The turn document's judged checks (Appendix A.C, B2 and B9), one cheap
 * GPT-6 call per player's turn: whether the step's question is still open
 * when the options appear (not settled early), whether something concrete
 * changed that bears on the chapter's question, and whether the first
 * paragraph narrates the choice the player made last turn. Each check is
 * phrased so "yes" passes, and the judge quotes the words that decide it
 * before it answers.
 *
 * The judge reads what the player reads (title, paragraphs without image
 * tags, options) and the turn's frame: the last choice and how it turned out,
 * and on a chapter step the chapter's question and plan (the backfilled frame,
 * chapterFrames.ts; without one, the outcome's question stands in), the step
 * and its place in the chapter.
 *
 * Before a round uses them, the checks are calibrated on the turns the
 * research notes read by hand (JUDGE_CALIBRATION): Luna low judges unless it
 * disagrees with the hand verdicts on either side (yes or no) or with itself
 * too often (isReliable), and then Luna medium is tried. Every hand no in
 * the set is a gpt-4.1-mini turn, so how often a judge passes a Luna turn it
 * should fail is not measured here.
 */

export const JUDGED_CHECKS = ["stepLeftOpen", "concreteProgress", "firstParagraphNarratesChoice"] as const;
export type JudgedCheck = (typeof JUDGED_CHECKS)[number];

/** The judge (Luna low) and its fallback (Luna medium) */
export const JUDGE_ARMS: Arm[] = [makeArm({ model: "gpt-6-luna", reasoningEffort: "low" }), makeArm({ model: "gpt-6-luna", reasoningEffort: "medium" })];
export const DEFAULT_JUDGE_ARM = JUDGE_ARMS[0].key;

/** Which checks apply to the turn this story writes: a chapter step gets the first two, every turn after the first the third. */
export function judgedChecksFor(story: Story): JudgedCheck[] {
  const checks: JudgedCheck[] = [];
  if (story.getCurrentBeatType() === "thread") checks.push("stepLeftOpen", "concreteProgress");
  if (!story.isFirstBeat()) checks.push("firstParagraphNarratesChoice");
  return checks;
}

const IMAGE_TAG = /\[image\s+[^\]]*\]/g;

type TurnView = { title: string; paragraphs: string[]; options: string[] };

/** A player's turn as they read it: title, paragraphs without image tags, option texts. */
function turnView(reply: SetOfBeatGenerationSchema, slot: PlayerSlot): TurnView | undefined {
  const beat = (reply as unknown as Record<string, unknown>)[slot] as Partial<Beat> | undefined;
  if (!beat || typeof beat !== "object" || typeof beat.text !== "string") return undefined;
  return {
    title: typeof beat.title === "string" ? beat.title : "",
    paragraphs: playerParagraphs(beat.text)
      .map((p) => p.replace(IMAGE_TAG, " ").replace(/\s+/g, " ").trim())
      .filter((p) => /\p{L}/u.test(p)),
    options: (Array.isArray(beat.options) ? beat.options : []).map((o: BeatOption) => o?.text ?? "").filter(Boolean),
  };
}

const RESULT_TEXT: Record<string, string> = {
  favorable: "It went well.",
  mixed: "It went partly well.",
  unfavorable: "It went badly.",
  sideAWins: "Side A won the round.",
  sideBWins: "Side B won the round.",
};

/** The player's last choice and how it turned out, as the game resolved it. */
function previousChoice(story: Story, slot: PlayerSlot): { text: string; result: string } | undefined {
  const beat = story.getCurrentBeat(slot);
  const option = beat && beat.choice >= 0 ? beat.options[beat.choice] : undefined;
  if (!beat || !option) return undefined;
  const resolved = beat.resolution ? RESULT_TEXT[beat.resolution] : undefined;
  const result = resolved ?? "A choice of direction, with no roll: the choice itself is what happened.";
  const lever = option.resourceType === "sacrifice" ? " It was a sacrifice: success at a certain cost." : option.resourceType === "reward" ? " It was a reward option: a gain, at worse odds." : "";
  return { text: option.text, result: `${result}${lever}` };
}

/**
 * The chapter frame a step reads: the chapter question and plan (the chapter's
 * own, which planner v2 writes, else the backfilled frame; or the outcome's
 * question), and the step.
 */
function chapterLines(story: Story, slot: PlayerSlot, frames?: Record<string, Pick<ChapterFrame, "question" | "plan">>): string[] {
  const analysis = story.getCurrentThreadAnalysis();
  const thread = analysis?.threads.find((t) => t.playersSideA.includes(slot) || t.playersSideB.includes(slot));
  if (!analysis || !thread) return [];
  const done = thread.progression.filter((s) => s.resolution !== null).length;
  const step = thread.progression[done];
  const outcome = story.getOutcomeById(thread.outcomeId);
  const own = thread as typeof thread & { question?: unknown; plan?: unknown };
  const frame = typeof own.question === "string" && own.question.trim() ? { question: own.question, plan: typeof own.plan === "string" ? own.plan : "" } : frames?.[thread.id];
  const last = done + 1 === thread.progression.length;
  return [
    frame ? `Chapter question: ${frame.question}` : "Chapter question: none written; the outcome's question stands in.",
    `For the outcome: ${outcome?.question ?? thread.outcomeId}`,
    ...(frame ? [`Chapter plan: ${frame.plan}`] : []),
    `This turn plays step ${done + 1} of ${thread.progression.length}: ${step ? `${step.title}: ${step.question}` : "(no step)"}`,
    ...(last ? ["This is the chapter's last step: its options decide the chapter."] : []),
  ];
}

const QUESTIONS: Record<JudgedCheck, string> = {
  stepLeftOpen:
    "Do the options still decide how the character goes about this step? The step's question asks how the character acts; the text sets the moment up and stops there. Answer no if the text has already carried the step out in one particular way (the character makes the approach, gives the argument, runs the search), so that the options only follow up on it, or if it tells how the step went, even when a larger question is still open at the end. A first move that meets a new obstacle is fine: the options answer the obstacle. Weak: \"Sir Bram listens, nods, and agrees to consider reform.\" (the step answered before the choice). Good: \"Sir Bram lets you finish, then slides a sealed letter across the desk: the names of three goblins his men arrested last night. 'Convince me they deserved it less than I think,' he says.\" On a chapter's last step, nothing is settled in the text: the three options are three different ways to settle it.",
  concreteProgress:
    "By the last paragraph, has something concrete changed that bears on the chapter's question: a clue found, an ally won or lost, a price paid, ground gained or given up? Mood, tension, description or reflection alone is no change. Weak: \"The tension in the hall is palpable.\" (nothing changed).",
  firstParagraphNarratesChoice:
    "Does the first paragraph narrate the action the player chose last turn and how it turned out? When that choice was a direction with no roll, how it turned out is the character taking it up: the first paragraph shows the character acting on it. Answer no if the first paragraph starts somewhere else, skips the chosen action, or only alludes to it.",
};

/**
 * The judge prompt's version, part of each judge call's key: a wording
 * change is judged afresh, and the earlier calls stay in the ledger and the
 * report. v1 (2026-09-27) asked the first-paragraph question without the
 * line on choices of direction; v2 asked the step question as "is this
 * step's question still open", which both judges read as "is the chapter's
 * outcome still open" on turns that had already carried the step out.
 */
export const JUDGE_PROMPT_VERSION = 3;

const EVIDENCE = "The words of the turn that decide the answer, quoted, or what is missing; one or two sentences.";

export function judgeSchema(checks: JudgedCheck[]) {
  return z.object(
    Object.fromEntries(
      checks.map((check) => [
        check,
        z.object({ evidence: z.string().describe(EVIDENCE), answer: z.enum(["yes", "no"]).describe(`The answer to the question ${check} above`) }),
      ])
    )
  );
}

const INTRO = `YOUR JOB: CHECK ONE TURN OF AN INTERACTIVE STORY

A turn is a few paragraphs of story followed by options: the player reads the text, picks an option, and the game decides how it turns out. Read the turn below as a careful editor and answer each question about it. Answer from the turn's own text, and quote the words that decide each answer before you give it.`;

/**
 * The judge's request for one player's turn, or undefined when no check
 * applies (a first turn) or the reply holds no turn for this player.
 */
export function judgeRequest(
  story: Story,
  reply: SetOfBeatGenerationSchema,
  slot: PlayerSlot,
  frames?: Record<string, Pick<ChapterFrame, "question" | "plan">>
): { checks: JudgedCheck[]; request: TextRequest } | undefined {
  const view = turnView(reply, slot);
  const checks = judgedChecksFor(story);
  if (!view || checks.length === 0) return undefined;
  const previous = previousChoice(story, slot);
  const chapter = checks.includes("stepLeftOpen") ? chapterLines(story, slot, frames) : [];
  const sections = [
    INTRO,
    ["======= THE STORY =======", `Title: ${story.getTitle()}`, `The player's character: ${story.getPlayer(slot)?.name ?? slot}`].join("\n"),
    ...(previous ? [["======= BEFORE THIS TURN =======", `The player's last choice: "${previous.text}"`, `How it turned out: ${previous.result}`].join("\n")] : []),
    ...(chapter.length ? [["======= THIS CHAPTER =======", ...chapter].join("\n")] : []),
    [
      "======= THE TURN, AS THE PLAYER READS IT =======",
      `Title: ${view.title}`,
      ...view.paragraphs.map((p, i) => `[${i + 1}] ${p}`),
      ...(view.options.length ? ["Options:", ...view.options.map((o, i) => `${i + 1}. ${o}`)] : []),
    ].join("\n"),
    ["======= QUESTIONS =======", ...checks.map((check) => `${check}: ${QUESTIONS[check]}`)].join("\n\n"),
  ];
  return { checks, request: { prompt: sections.join("\n\n"), schema: judgeSchema(checks) } };
}

/** The verdict per check: true when the judge answered yes (every check passes on yes). */
export function verdictsFrom(parsed: unknown, checks: JudgedCheck[]): Partial<Record<JudgedCheck, boolean>> {
  const reply = (parsed ?? {}) as Record<string, { answer?: unknown } | undefined>;
  return Object.fromEntries(
    checks.flatMap((check) => {
      const answer = reply[check]?.answer;
      return answer === "yes" || answer === "no" ? [[check, answer === "yes"]] : [];
    })
  );
}

/** The judge's quoted evidence per check. */
export function evidenceFrom(parsed: unknown, checks: JudgedCheck[]): Partial<Record<JudgedCheck, string>> {
  const reply = (parsed ?? {}) as Record<string, { evidence?: unknown } | undefined>;
  return Object.fromEntries(
    checks.flatMap((check) => {
      const evidence = reply[check]?.evidence;
      return typeof evidence === "string" ? [[check, evidence]] : [];
    })
  );
}

// --- Calibration on the hand-read turns ---

export type HandVerdict = boolean | "partial";

export type CalibrationItem = {
  /** The research notes' case label and the arm read, e.g. S3-mini */
  id: string;
  /** The stored turn's output id (outputs/<id>.json) */
  outputId: string;
  slot: PlayerSlot;
  /** Pass semantics, as the checks read: stepLeftOpen true = not settled early */
  hand: Partial<Record<JudgedCheck, HandVerdict>>;
  source: string;
};

const NOTES = "turn-evidence notes §3-4 (research, 2026-09-27)";
const MINE = "this session's reading of the stored turn (the notes give no per-case verdict)";

const item = (id: string, outputId: string, hand: CalibrationItem["hand"], source = NOTES, slot: PlayerSlot = "player1"): CalibrationItem => ({
  id,
  outputId,
  slot,
  hand,
  source,
});

/** A record's output id: outputs/<id>.json, whichever path separator it was written with. */
export const outputIdOf = (outputFile: string) => outputFile.replace(/^outputs[\\/]/, "").replace(/\.json$/, "");

/**
 * The 14 single-player and two multiplayer turns the research notes read by
 * hand (turn doc E6), on gpt-4.1-mini and Luna medium, postfix sample 1. The
 * notes' tallies give "Plan" (step posed, not answered: stepLeftOpen), "Prev"
 * (the previous choice and result narrated in the first paragraph, "partial"
 * where the notes say so) and, for Luna, "Adv" (progress shown in the scene:
 * concreteProgress). The notes give gpt-4.1-mini's progress only as a count,
 * so its seven chapter steps carry this session's reading, with "partial"
 * where the text is ambiguous. M3's gpt-4.1-mini "settles" is the next step
 * played early, so it reads partial for the current step's own question
 * (corrected after the first calibration run). Partial verdicts are left out
 * of agreement.
 */
export const JUDGE_CALIBRATION: CalibrationItem[] = [
  // gpt-4.1-mini's progress, read in this session: S3 and S6 change something, S5 nothing, the rest are ambiguous
  item("S3-mini", "161252470e05b56a1810", { stepLeftOpen: false, firstParagraphNarratesChoice: true, concreteProgress: true }, `${NOTES}; concreteProgress: ${MINE}`),
  item("S4-mini", "082361acee5533eeeeb8", { stepLeftOpen: false, firstParagraphNarratesChoice: false, concreteProgress: "partial" }, `${NOTES}; concreteProgress: ${MINE}`),
  item("S5-mini", "3089dafd73833e669d44", { stepLeftOpen: true, firstParagraphNarratesChoice: false, concreteProgress: false }, `${NOTES}; concreteProgress: ${MINE}`),
  item("S6-mini", "a452dfb2f2543015cfc2", { stepLeftOpen: false, firstParagraphNarratesChoice: "partial", concreteProgress: true }, `${NOTES}; concreteProgress: ${MINE}`),
  item("S7-mini", "0a7ced563d1c64e4d4a6", { stepLeftOpen: false, firstParagraphNarratesChoice: "partial", concreteProgress: "partial" }, `${NOTES}; concreteProgress: ${MINE}`),
  item("S8-mini", "1d653f74e1be2a6f36f8", { firstParagraphNarratesChoice: true }),
  item("S9-mini", "ef81a2245bf3c3085718", { firstParagraphNarratesChoice: true }),
  item("S10-mini", "49786b2d3f9c6b3d5d5a", { stepLeftOpen: false, firstParagraphNarratesChoice: true, concreteProgress: "partial" }, `${NOTES}; concreteProgress: ${MINE}`),
  item("S11-mini", "b9a4abac83a5111a11c8", { stepLeftOpen: false, firstParagraphNarratesChoice: false, concreteProgress: "partial" }, `${NOTES}; concreteProgress: ${MINE}`),
  item("S12-mini", "ed6133652b6bedec1a6a", { firstParagraphNarratesChoice: "partial" }),
  item("S13-mini", "62d0f00fe2aa99f24e2a", { firstParagraphNarratesChoice: true }),
  item("S14-mini", "23356dfdc84fc66df267", { firstParagraphNarratesChoice: true }),
  // The notes' "settles" here is player2 playing step 2 early; the judged check asks about the current step's own question
  item("M3-mini", "8983b4eca0318d449421", { stepLeftOpen: "partial" }, `${NOTES}; stepLeftOpen partial: the notes' verdict is the next step played early, not this step settled`, "player2"),
  item("M4-mini", "463fa7ffc3d7c1c62add", { stepLeftOpen: false }),
  item("S3-luna", "1260b305014092890b04", { stepLeftOpen: true, firstParagraphNarratesChoice: true, concreteProgress: true }),
  item("S4-luna", "b236eccd1fe6d9604dda", { stepLeftOpen: true, firstParagraphNarratesChoice: true, concreteProgress: true }),
  item("S5-luna", "b03da3dd35b99332a081", { stepLeftOpen: true, firstParagraphNarratesChoice: true, concreteProgress: true }),
  item("S6-luna", "97998db7978f49168815", { stepLeftOpen: true, firstParagraphNarratesChoice: true, concreteProgress: true }),
  item("S7-luna", "b108a5d04e3b88f22b7f", { stepLeftOpen: true, firstParagraphNarratesChoice: true, concreteProgress: true }),
  item("S8-luna", "2fa1a05817492a0412c6", { firstParagraphNarratesChoice: true }),
  item("S9-luna", "8e9b3ba60e76c88a1fc4", { firstParagraphNarratesChoice: true }),
  item("S10-luna", "7a99424be4c275482254", { stepLeftOpen: true, firstParagraphNarratesChoice: true, concreteProgress: true }),
  item("S11-luna", "7d74d5f267f795d21885", { stepLeftOpen: true, firstParagraphNarratesChoice: true, concreteProgress: true }),
  item("S12-luna", "55eca9d57416ab256bbb", { firstParagraphNarratesChoice: true }),
  item("S13-luna", "fce1c27a915b6da66f93", { firstParagraphNarratesChoice: true }),
  item("S14-luna", "e97f596c2a4ad2a0d9b9", { firstParagraphNarratesChoice: true }),
  item("M3-luna", "7e890df465637d2d4975", { stepLeftOpen: true }, NOTES, "player2"),
  item("M4-luna", "e48e6842da38b31bc3ab", { stepLeftOpen: true, firstParagraphNarratesChoice: true }),
];

/** A Luna low judge's reply: some reasoning and three short answers */
const JUDGE_OUTPUT_TOKENS: Record<string, number> = { low: 900, medium: 2_500 };

/** A judge call's case id: the turn it reads and the prompt version (v1's ids carry none). */
export const judgeCaseId = (outputId: string, slot: PlayerSlot, version = JUDGE_PROMPT_VERSION) =>
  version === 1 ? `judge-${outputId}-${slot}` : `judge-v${version}-${outputId}-${slot}`;

/** One judge call per turn and sample, in the turn rounds' stage, on the current prompt version. */
export function judgeJobs(
  turns: { outputId: string; slot: PlayerSlot; request: TextRequest }[],
  arm: Arm,
  samples: number,
  promptState: string
): Job[] {
  return turns.flatMap((turn) =>
    Array.from({ length: samples }, (_, i) =>
      prepJob({
        kind: "judge",
        stage: "turn-rounds",
        promptState,
        caseId: judgeCaseId(turn.outputId, turn.slot),
        sample: i + 1,
        arm,
        role: "beat",
        players: 1,
        build: () => turn.request,
        outputTokens: JUDGE_OUTPUT_TOKENS[arm.reasoningEffort ?? "low"] ?? 2_500,
      })
    )
  );
}

/** A judge's verdicts on one item, per sample, with its quoted evidence. */
export type JudgedItem = {
  itemId: string;
  armKey: string;
  samples: Partial<Record<JudgedCheck, boolean>>[];
  evidence?: Partial<Record<JudgedCheck, string>>[];
};

export type CheckAgreement = {
  check: JudgedCheck;
  /** Items with a yes or no hand verdict that the judge answered on sample 1 */
  decided: number;
  agree: number;
  /** Hand yes judged no, hand no judged yes */
  falseFails: number;
  falsePasses: number;
  handPasses: number;
  handFails: number;
  /** Items judged on two samples, and on how many the samples agreed */
  pairs: number;
  pairsAgree: number;
  /** The judge's answers on the items the hand reading calls partial */
  partial: { yes: number; no: number };
  reliable: boolean;
};

/**
 * A check is judged reliably when sample 1 agrees with the hand verdicts on
 * at least 85% of the hand-yes items and at least 85% of the hand-no items,
 * each side holding at least 3, and the two samples agree on at least 90%.
 * Each side on its own, because the set is mostly yes: on 19 yes and 3 no an
 * always-yes judge agrees on 86% overall, and only the hand-no items show
 * whether a judge fails a turn it should.
 */
export const RELIABLE_AGREEMENT = 0.85;
export const RELIABLE_SELF_AGREEMENT = 0.9;
export const RELIABLE_MIN_PER_SIDE = 3;

type ReliabilityInput = Pick<CheckAgreement, "handPasses" | "handFails" | "falseFails" | "falsePasses" | "pairs" | "pairsAgree">;

export function isReliable(a: ReliabilityInput): boolean {
  if (a.handPasses < RELIABLE_MIN_PER_SIDE || a.handFails < RELIABLE_MIN_PER_SIDE) return false;
  const yesOk = (a.handPasses - a.falseFails) / a.handPasses >= RELIABLE_AGREEMENT;
  const noOk = (a.handFails - a.falsePasses) / a.handFails >= RELIABLE_AGREEMENT;
  const selfOk = a.pairs === 0 || a.pairsAgree / a.pairs >= RELIABLE_SELF_AGREEMENT;
  return yesOk && noOk && selfOk;
}

/** The report's reading: reliable, not reliable, or too few items on a side to tell. */
function readingOf(a: CheckAgreement): string {
  if (a.reliable) return "reliable";
  const few = [a.handPasses < RELIABLE_MIN_PER_SIDE ? "yes" : "", a.handFails < RELIABLE_MIN_PER_SIDE ? "no" : ""].filter(Boolean);
  return few.length ? `not reliable (too few hand ${few.join(" and ")})` : "not reliable";
}

/** Agreement with the hand verdicts, per check, for one judge arm. */
export function scoreCalibration(items: CalibrationItem[], judged: JudgedItem[], armKey: string): CheckAgreement[] {
  const byItem = new Map(judged.filter((j) => j.armKey === armKey).map((j) => [j.itemId, j]));
  return JUDGED_CHECKS.map((check) => {
    const a: CheckAgreement = { check, decided: 0, agree: 0, falseFails: 0, falsePasses: 0, handPasses: 0, handFails: 0, pairs: 0, pairsAgree: 0, partial: { yes: 0, no: 0 }, reliable: false };
    for (const calibration of items) {
      const hand = calibration.hand[check];
      const samples = byItem.get(calibration.id)?.samples ?? [];
      const first = samples[0]?.[check];
      if (hand === undefined || first === undefined) continue;
      const second = samples[1]?.[check];
      if (second !== undefined) {
        a.pairs++;
        if (second === first) a.pairsAgree++;
      }
      if (hand === "partial") {
        a.partial[first ? "yes" : "no"]++;
        continue;
      }
      a.decided++;
      if (hand) a.handPasses++;
      else a.handFails++;
      if (first === hand) a.agree++;
      else if (hand) a.falseFails++;
      else a.falsePasses++;
    }
    return { ...a, reliable: isReliable(a) };
  });
}

const pct = (n: number, d: number) => (d === 0 ? "–" : `${Math.round((100 * n) / d)}%`);
const verdictText = (v: boolean | "partial" | undefined) => (v === undefined ? "" : v === "partial" ? "partial" : v ? "yes" : "no");

/** judge-calibration.md: per arm and check the agreement, the confusion, the self-agreement and the reading; then every item. */
export function renderCalibration(input: {
  items: CalibrationItem[];
  judged: JudgedItem[];
  armKeys: string[];
  spentUsd: number;
  generatedAt: Date;
  problems: string[];
}): string {
  const lines = [
    "# Judged checks: calibration",
    "",
    `Generated ${input.generatedAt.toISOString()} from prep-calls.jsonl. ${input.items.length} hand-read turns (turn doc E6; the research notes' S1-S14 and M1-M4, gpt-4.1-mini and Luna medium, sample 1), judged through the eval (judgedChecks.ts). A check is judged reliably when sample 1 agrees with the hand verdicts on at least ${RELIABLE_AGREEMENT * 100}% of the hand-yes items and at least ${RELIABLE_AGREEMENT * 100}% of the hand-no items, each side holding at least ${RELIABLE_MIN_PER_SIDE}, and the judge's two samples agree on at least ${RELIABLE_SELF_AGREEMENT * 100}%. Partial hand verdicts are left out of agreement and shown on their own. Spent: $${input.spentUsd.toFixed(4)}.`,
    "",
    "| Judge | Check | Agree (sample 1) | Hand yes / no | Judged no where the hand says yes | Judged yes where the hand says no | Samples agree | On partial items (yes / no) | Reading |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  for (const armKey of input.armKeys) {
    for (const a of scoreCalibration(input.items, input.judged, armKey)) {
      lines.push(
        `| ${armKey} | ${a.check} | ${a.agree} of ${a.decided} (${pct(a.agree, a.decided)}) | ${a.handPasses} / ${a.handFails} | ${a.falseFails} | ${a.falsePasses} | ${a.pairs ? `${a.pairsAgree} of ${a.pairs}` : "–"} | ${a.partial.yes} / ${a.partial.no} | ${readingOf(a)} |`
      );
    }
  }
  // The only items that show whether a judge fails a turn it should: which turns, and so which model, they come from
  lines.push("", "Hand-no items per check (a judge's false passes are measured on these alone):", "");
  for (const check of JUDGED_CHECKS) {
    const noItems = input.items.filter((c) => c.hand[check] === false).map((c) => c.id);
    lines.push(`- ${check}: ${noItems.length ? `${noItems.length} (${noItems.join(", ")})` : "none"}`);
  }
  lines.push("", "## Items", "", `| Item | Turn | ${input.armKeys.flatMap((k) => JUDGED_CHECKS.map((c) => `${c} (${k})`)).join(" | ")} | Source |`);
  lines.push(`|---|---|${input.armKeys.flatMap(() => JUDGED_CHECKS.map(() => "---|")).join("")}---|`);
  for (const calibration of input.items) {
    const cells = input.armKeys.flatMap((armKey) => {
      const samples = input.judged.find((j) => j.itemId === calibration.id && j.armKey === armKey)?.samples ?? [];
      return JUDGED_CHECKS.map((check) => {
        const hand = verdictText(calibration.hand[check]);
        const judgedText = samples.map((s) => verdictText(s[check])).filter(Boolean).join("/");
        return hand || judgedText ? `hand ${hand || "–"}, judged ${judgedText || "–"}` : "";
      });
    });
    lines.push(`| ${calibration.id} | ${calibration.outputId} ${calibration.slot} | ${cells.join(" | ")} | ${calibration.source} |`);
  }
  const disagreements = input.armKeys.flatMap((armKey) =>
    input.items.flatMap((calibration) => {
      const judgedItem = input.judged.find((j) => j.itemId === calibration.id && j.armKey === armKey);
      return JUDGED_CHECKS.flatMap((check) => {
        const hand = calibration.hand[check];
        const first = judgedItem?.samples[0]?.[check];
        if (hand === undefined || hand === "partial" || first === undefined || first === hand) return [];
        const evidence = judgedItem?.evidence?.[0]?.[check] ?? "";
        return [`- ${armKey}, ${calibration.id}, ${check}: hand ${verdictText(hand)}, judged ${verdictText(first)}. Evidence: ${evidence.replace(/\s+/g, " ").trim()}`];
      });
    })
  );
  if (disagreements.length) lines.push("", "## Where sample 1 disagrees with the hand verdict", "", ...disagreements);
  if (input.problems.length) lines.push("", "## Problems", "", ...input.problems.map((p) => `- ${p}`));
  return `${lines.join("\n")}\n`;
}

// --- A round's turns, judged (turn round 1: the reference and the candidates) ---

/** One player's turn of a round's record, judged once. */
export type JudgedTurn = {
  armKey: string;
  caseId: string;
  sample: number;
  slot: PlayerSlot;
  outputId: string;
  checks: JudgedCheck[];
  verdicts: Partial<Record<JudgedCheck, boolean>>;
};

type CheckTally = { hits: number; n: number };

export type JudgedComparison = { check: JudgedCheck; reference: CheckTally; arm: CheckTally; noise?: number } & RateMove;

export type JudgedArmReading = {
  armKey: string;
  turns: number;
  rates: Partial<Record<JudgedCheck, CheckTally>>;
  referenceKey?: string;
  /** Read on the turns both arms have (case, sample, player), with the reference's sample-1-against-sample-2 noise on those cases */
  vsReference?: JudgedComparison[];
};

const tallyOf = (turns: JudgedTurn[], check: JudgedCheck): CheckTally | undefined => {
  const judged = turns.filter((t) => t.verdicts[check] !== undefined);
  return judged.length ? { hits: judged.filter((t) => t.verdicts[check]).length, n: judged.length } : undefined;
};

const rateOf = (t?: CheckTally) => (t && t.n ? t.hits / t.n : undefined);
const turnPair = (t: JudgedTurn) => `${t.caseId}|${t.sample}|${t.slot}`;

/** Each arm's pass rates per judged check, and a candidate's reading against its reference under the stop rule. */
export function judgedReadings(turns: JudgedTurn[], referenceOf: (armKey: string) => string | undefined): JudgedArmReading[] {
  const byArm = new Map<string, JudgedTurn[]>();
  for (const t of turns) byArm.set(t.armKey, [...(byArm.get(t.armKey) ?? []), t]);
  return [...byArm.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([armKey, own]) => {
      const rates = Object.fromEntries(JUDGED_CHECKS.flatMap((check) => (tallyOf(own, check) ? [[check, tallyOf(own, check)]] : [])));
      const referenceKey = referenceOf(armKey);
      const reference = referenceKey ? byArm.get(referenceKey) : undefined;
      if (!referenceKey || !reference) return { armKey, turns: own.length, rates };
      const shared = new Set(reference.map(turnPair).filter((p) => own.some((t) => turnPair(t) === p)));
      const armShared = own.filter((t) => shared.has(turnPair(t)));
      const refShared = reference.filter((t) => shared.has(turnPair(t)));
      const cases = new Set(armShared.map((t) => t.caseId));
      const refOnCases = reference.filter((t) => cases.has(t.caseId));
      const vsReference = JUDGED_CHECKS.flatMap((check): JudgedComparison[] => {
        const [ref, arm] = [tallyOf(refShared, check), tallyOf(armShared, check)];
        if (!ref || !arm) return [];
        const [s1, s2] = [rateOf(tallyOf(refOnCases.filter((t) => t.sample === 1), check)), rateOf(tallyOf(refOnCases.filter((t) => t.sample === 2), check))];
        const noise = s1 !== undefined && s2 !== undefined ? Math.abs(s1 - s2) : undefined;
        return [{ check, reference: ref, arm, ...(noise === undefined ? {} : { noise, ...rateMove(ref, arm, noise) }) }];
      });
      return { armKey, turns: own.length, rates, referenceKey, vsReference };
    });
}

const tallyText = (t?: CheckTally) => (t ? `${t.hits} of ${t.n} (${Math.round((100 * t.hits) / t.n)}%)` : "–");
const pText = (p?: number) => (p === undefined ? "" : p < 0.001 ? " (p < 0.001)" : ` (p ${p.toFixed(3)})`);

function readingText(c: JudgedComparison): string {
  if (c.noise === undefined) return "no noise figure (the reference has one sample)";
  if (c.moved) return `moved ${c.moved}${pText(c.p)}`;
  if (c.beyondNoise) return `beyond the noise, not moved${pText(c.p)}`;
  return "within the noise";
}

/** judged-turns.md: per arm and judged check the pass rate, and a candidate's reading against its reference. */
export function renderJudgedReadings(readings: JudgedArmReading[], input: { spentUsd: number; generatedAt: Date; problems?: string[] }): string {
  const lines = [
    "# Judged checks on the round's turns",
    "",
    `Generated ${input.generatedAt.toISOString()} from prep-calls.jsonl: one judge call (${DEFAULT_JUDGE_ARM}, prompt v${JUDGE_PROMPT_VERSION}) per player's turn of each arm's chapter steps. A candidate is read against its reference on the turns both have, with the reference's sample-1-against-sample-2 difference as the noise and the stop rule on top (moved only beyond the noise and at a one-sided Fisher p < 0.10). Calibration (judge-calibration.md): firstParagraphNarratesChoice is judged reliably on Luna low, with every hand no a gpt-4.1-mini turn; stepLeftOpen and concreteProgress are readings only. Spent on these judge calls: $${input.spentUsd.toFixed(4)}.`,
    "",
    "| Arm | Check | Arm passes | Reference passes | Noise | Reading |",
    "|---|---|---|---|---|---|",
  ];
  for (const r of readings) {
    for (const check of JUDGED_CHECKS) {
      const own = r.rates[check];
      if (!own) continue;
      const c = r.vsReference?.find((v) => v.check === check);
      lines.push(
        c
          ? `| ${r.armKey} | ${check} | ${tallyText(c.arm)} | ${tallyText(c.reference)} | ${c.noise === undefined ? "–" : `${Math.round(100 * c.noise)} pts`} | ${readingText(c)} |`
          : `| ${r.armKey} | ${check} | ${tallyText(own)} | – | – | ${r.referenceKey ? "no matched turns" : "reference"} |`
      );
    }
  }
  if (input.problems?.length) lines.push("", "## Problems", "", ...input.problems.map((p) => `- ${p}`));
  return `${lines.join("\n")}\n`;
}
