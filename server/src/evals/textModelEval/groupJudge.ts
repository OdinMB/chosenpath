import { z } from "zod";
import type { Story } from "core/models/Story.js";
import type { PlayerSlot, SetOfBeatGenerationSchema } from "core/types/index.js";
import type { TextRequest } from "../../game/services/storyTextSteps.js";
import type { Arm, Stage } from "./arms.js";
import { isReliable, turnView, type CheckAgreement, type HandVerdict } from "./judgedChecks.js";
import { prepJob } from "./prepCalls.js";
import type { Job } from "./runner.js";
import { rateMove, type RateMove } from "./stopRule.js";

/*
 * The group turn round's judged check (turn doc B10, "a judged cross-turn
 * consistency check"; the owner's feedback workflow of 2026-09-28): one cheap
 * GPT-6 call per group reply reads every player's turn as that player reads
 * it and answers two questions, each phrased so yes passes, evidence quoted
 * first:
 * - sharedMomentsMatch: the moments the players share are told the same way
 *   (the same people, the same events, every line by the same speaker in the
 *   same words); yes when they share none. It is turn round 3's hand-read
 *   criterion: today's group turns matched word for word in 3 of 12.
 * - sharedFactsAgree: the turns agree on the facts they share (who is where,
 *   what is there, what happened before). Turn round 3 read 12 of 12 agreeing,
 *   so it guards against the note costing facts; with no hand no it cannot be
 *   calibrated, and reads as a reading only.
 * The calibration set (GROUP_JUDGE_CALIBRATION) is today's 12 stored group
 * turns on Luna low, read by hand in this workflow on that criterion; they
 * are the reference's sample 1, so their judge calls are its reading too.
 */

export const GROUP_CHECKS = ["sharedMomentsMatch", "sharedFactsAgree"] as const;
export type GroupCheck = (typeof GROUP_CHECKS)[number];

/** Part of each group judge call's key: a wording change is judged afresh. */
export const GROUP_JUDGE_PROMPT_VERSION = 1;

const QUESTIONS: Record<GroupCheck, string> = {
  sharedMomentsMatch:
    "Where two or more of these turns show the same moment (the same place and time, with those characters there), do they show it the same way: the same people present, the same things happening, and every line spoken in that moment given to the same speaker in the same words? A different point of view, what one character notices or thinks, and small differences in dialogue tags or punctuation are fine. Answer no if a line changes speaker or wording between the turns, if one turn shows a conversation or an event in the shared moment that another turn, whose character is there, tells differently or leaves out where its character would have to notice it, or if the turns disagree about what happens. Answer yes when the turns share no moment. Weak: in one turn Gruk says \"The gate opens at dusk\"; in the other he says \"We wait for nightfall.\" Good: both turns give Gruk \"The gate opens at dusk,\" one heard from the tower, one from the courtyard.",
  sharedFactsAgree:
    "Do the turns agree on the facts they share: where each character is, which people, places and objects are there and in what state, and what happened before this turn? Answer no if one turn contradicts another on any of these. A detail one turn adds and another leaves out is fine.",
};

const INTRO = `YOUR JOB: CHECK ONE TURN OF A GROUP STORY

In a group story each player reads a turn of their own: a few paragraphs of story, then options. The turns are written together, and where the players' characters share a scene, every turn must tell it consistently. Read the turns below as a careful editor and answer each question about them. Answer from the turns' own text, and quote the words that decide each answer before you give it.`;

const EVIDENCE = "The words of the turns that decide the answer, quoted with whose turn they come from, or what is missing; one or two sentences.";

export function groupJudgeSchema() {
  return z.object(
    Object.fromEntries(
      GROUP_CHECKS.map((check) => [
        check,
        z.object({ evidence: z.string().describe(EVIDENCE), answer: z.enum(["yes", "no"]).describe(`The answer to the question ${check} above`) }),
      ])
    )
  );
}

function namesOf(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Who shares this turn: each switch or chapter with its players (a contest's two sides named), or the ending. */
function sharingLines(story: Story): string[] {
  const name = (slot: string) => story.getPlayer(slot)?.name ?? slot;
  const beatType = story.getCurrentBeatType();
  if (beatType === "thread") {
    return (story.getCurrentThreadAnalysis()?.threads ?? []).map((thread) => {
      const all = [...thread.playersSideA, ...thread.playersSideB];
      if (all.length === 1) return `${name(all[0])} is alone in a chapter: ${thread.title}`;
      const sides = thread.playersSideB.length ? ` (one side: ${namesOf(thread.playersSideA.map(name))}; the other: ${namesOf(thread.playersSideB.map(name))})` : "";
      return `${namesOf(all.map(name))} share one chapter: ${thread.title}${sides}`;
    });
  }
  if (beatType === "switch") {
    return (story.getCurrentSwitchAnalysis()?.switches ?? []).map((sw) =>
      sw.players.length === 1 ? `${name(sw.players[0])} is alone in a switch: ${sw.title}` : `${namesOf(sw.players.map(name))} share one switch: ${sw.title}`
    );
  }
  return ["Every player's story ends in this turn."];
}

/** The judge's request for one group reply, or undefined for one player or a reply with fewer than two turns. */
export function groupJudgeRequest(story: Story, reply: SetOfBeatGenerationSchema): TextRequest | undefined {
  if (!story.isMultiplayer()) return undefined;
  const turns = story.getPlayerSlots().flatMap((slot) => {
    const view = turnView(reply, slot as PlayerSlot);
    return view ? [{ slot, view }] : [];
  });
  if (turns.length < 2) return undefined;
  const name = (slot: string) => story.getPlayer(slot)?.name ?? slot;
  const sections = [
    INTRO,
    ["======= THE STORY =======", `Title: ${story.getTitle()}`, `The players' characters: ${turns.map((t) => name(t.slot)).join(", ")}`].join("\n"),
    ["======= THIS TURN =======", ...sharingLines(story)].join("\n"),
    ...turns.map(({ slot, view }) =>
      [
        `======= ${name(slot).toUpperCase()}'S TURN =======`,
        `Title: ${view.title}`,
        ...view.paragraphs.map((p, i) => `[${i + 1}] ${p}`),
        ...(view.options.length ? ["Options:", ...view.options.map((o, i) => `${i + 1}. ${o}`)] : []),
      ].join("\n")
    ),
    ["======= QUESTIONS =======", ...GROUP_CHECKS.map((check) => `${check}: ${QUESTIONS[check]}`)].join("\n\n"),
  ];
  return { prompt: sections.join("\n\n"), schema: groupJudgeSchema() };
}

/** The verdict per check: true when the judge answered yes. */
export function groupVerdictsFrom(parsed: unknown): Partial<Record<GroupCheck, boolean>> {
  const reply = (parsed ?? {}) as Record<string, { answer?: unknown } | undefined>;
  return Object.fromEntries(
    GROUP_CHECKS.flatMap((check) => {
      const answer = reply[check]?.answer;
      return answer === "yes" || answer === "no" ? [[check, answer === "yes"]] : [];
    })
  );
}

/** The judge's quoted evidence per check. */
export function groupEvidenceFrom(parsed: unknown): Partial<Record<GroupCheck, string>> {
  const reply = (parsed ?? {}) as Record<string, { evidence?: unknown } | undefined>;
  return Object.fromEntries(
    GROUP_CHECKS.flatMap((check) => {
      const evidence = reply[check]?.evidence;
      return typeof evidence === "string" ? [[check, evidence]] : [];
    })
  );
}

export const groupJudgeCaseId = (outputId: string, version = GROUP_JUDGE_PROMPT_VERSION) => `judge-group-v${version}-${outputId}`;

/** Luna low reads two or three turns and writes two short answers */
const GROUP_JUDGE_OUTPUT_TOKENS = 1_200;

/** The judge calls: each reply at its number of samples (the calibration's two, the rest one). */
export function groupJudgeJobs(replies: { outputId: string; request: TextRequest; samples: number }[], arm: Arm, promptState: string, stage: Stage): Job[] {
  return replies.flatMap((reply) =>
    Array.from({ length: reply.samples }, (_, i) =>
      prepJob({
        kind: "judge",
        stage,
        promptState,
        caseId: groupJudgeCaseId(reply.outputId),
        sample: i + 1,
        arm,
        role: "beat",
        players: 1,
        build: () => reply.request,
        outputTokens: GROUP_JUDGE_OUTPUT_TOKENS,
      })
    )
  );
}

// --- Calibration on today's stored group turns ---

export type GroupCalibrationItem = {
  id: string;
  caseId: string;
  /** The stored reply's output id (outputs/<id>.json) */
  outputId: string;
  hand: Partial<Record<GroupCheck, HandVerdict>>;
  note?: string;
};

const cal = (caseId: string, outputId: string, moments: HandVerdict, note: string): GroupCalibrationItem => ({
  id: caseId,
  caseId,
  outputId,
  hand: { sharedMomentsMatch: moments, sharedFactsAgree: true },
  note,
});

/**
 * Today's 12 stored group turns (gpt-6-luna@low/prod, round0 sample 1, the
 * migration check of 2026-09-27), read by hand in this workflow on the
 * judge's criterion. Shared moments: yes where every shared line has the
 * same speaker and words (or no moment is shared), no where a line changes
 * speaker or one moment holds different conversations, partial where the
 * same conversation is paraphrased. Facts agree in all twelve, as turn round
 * 3's reader found.
 */
export const GROUP_JUDGE_CALIBRATION: GroupCalibrationItem[] = [
  cal("cont-tpl-965413e1-p3-t1", "c17db121884fd42c5be5", false, "the soundcheck: the engineer signs in one turn and speaks other lines in the others"),
  cal("first-tpl-2fe196a3-p2", "947ae4642505ca7d8431", "partial", "the same introductions and rune caution, each line in other words"),
  cal("first-tpl-321db503-p2", "143bd7674fd11a865882", true, "Quentin's and Amaru's lines word for word in both turns"),
  cal("cont-tpl-2fe196a3-p2-t1", "66a29057826b0e955c35", "partial", "Jasper's lines word for word, Emil's replies in other words"),
  cal("cont-tpl-321db503-p2-t1", "e5979d1a96652317b505", true, "the rivals share no moment: each hears the same call and sees the same smoke"),
  cal("first-tpl-4546b046-p2", "1a4ceb5b4e1c8d40d4bd", false, "\"You've always been good at getting people in the same room\" is Eliot's in one turn and Mason's in the other"),
  cal("cont-tpl-4546b046-p2-t1", "ea9cb62e16eacf4e95da", true, "the second turn reports Aria's question to Mason; no line differs"),
  cal("first-tpl-f0ca783b-p2", "95bc0ef70b0ecea784b7", false, "the grove: two different conversations between the spirits"),
  cal("cont-tpl-f0ca783b-p2-t1", "2985db351f480c42dce1", "partial", "the Warrior's and Russetveil's instructions in other words"),
  cal("first-tpl-965413e1-p3", "0c04b21aca45106990e8", false, "the Red Dust Club: three different conversations in one scene"),
  cal("first-tpl-fe7b68c7-p2", "15741e22e0cdb7b84921", false, "\"An honest review can move a civilization…\" is Jin's in one turn and Seraphine's in the other"),
  cal("cont-tpl-fe7b68c7-p2-t1", "8ec876c2bfadfac917b2", false, "the banquet kitchen: Ambrosius says different things to each, and the critics never notice each other"),
];

export type GroupAgreement = Omit<CheckAgreement, "check"> & { check: GroupCheck };

/** Agreement with the hand verdicts per check (sample 1), the samples' agreement, and the answers on partial items. */
export function scoreGroupCalibration(items: GroupCalibrationItem[], judged: { itemId: string; samples: Partial<Record<GroupCheck, boolean>>[] }[]): GroupAgreement[] {
  const byItem = new Map(judged.map((j) => [j.itemId, j]));
  return GROUP_CHECKS.map((check) => {
    const a: GroupAgreement = { check, decided: 0, agree: 0, falseFails: 0, falsePasses: 0, handPasses: 0, handFails: 0, pairs: 0, pairsAgree: 0, partial: { yes: 0, no: 0 }, reliable: false };
    for (const item of items) {
      const hand = item.hand[check];
      const samples = byItem.get(item.id)?.samples ?? [];
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

// --- The round's replies, judged ---

/** One group reply of a round's record, judged once (its sample-1 judge call). */
export type JudgedReply = { armKey: string; caseId: string; sample: number; outputId: string; verdicts: Partial<Record<GroupCheck, boolean>> };

type Tally = { hits: number; n: number };
export type GroupComparison = { check: GroupCheck; reference: Tally; arm: Tally; noise?: number } & RateMove;
export type GroupArmReading = { armKey: string; replies: number; rates: Partial<Record<GroupCheck, Tally>>; referenceKey?: string; vsReference?: GroupComparison[] };

const tallyOf = (replies: JudgedReply[], check: GroupCheck): Tally | undefined => {
  const judged = replies.filter((r) => r.verdicts[check] !== undefined);
  return judged.length ? { hits: judged.filter((r) => r.verdicts[check]).length, n: judged.length } : undefined;
};
const rateOf = (t?: Tally) => (t && t.n ? t.hits / t.n : undefined);
const pairOf = (r: JudgedReply) => `${r.caseId}|${r.sample}`;

/** Each arm's pass rates, and a candidate against its reference on the (case, sample) pairs both have, under the stop rule. */
export function groupReadings(replies: JudgedReply[], referenceOf: (armKey: string) => string | undefined): GroupArmReading[] {
  const byArm = new Map<string, JudgedReply[]>();
  for (const r of replies) byArm.set(r.armKey, [...(byArm.get(r.armKey) ?? []), r]);
  return [...byArm.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([armKey, own]) => {
      const rates = Object.fromEntries(GROUP_CHECKS.flatMap((check) => (tallyOf(own, check) ? [[check, tallyOf(own, check)]] : [])));
      const referenceKey = referenceOf(armKey);
      const reference = referenceKey ? byArm.get(referenceKey) : undefined;
      if (!referenceKey || !reference) return { armKey, replies: own.length, rates };
      const shared = new Set(reference.map(pairOf).filter((p) => own.some((r) => pairOf(r) === p)));
      const [armShared, refShared] = [own.filter((r) => shared.has(pairOf(r))), reference.filter((r) => shared.has(pairOf(r)))];
      const cases = new Set(armShared.map((r) => r.caseId));
      const refOnCases = reference.filter((r) => cases.has(r.caseId));
      const vsReference = GROUP_CHECKS.flatMap((check): GroupComparison[] => {
        const [ref, arm] = [tallyOf(refShared, check), tallyOf(armShared, check)];
        if (!ref || !arm) return [];
        const [s1, s2] = [rateOf(tallyOf(refOnCases.filter((r) => r.sample === 1), check)), rateOf(tallyOf(refOnCases.filter((r) => r.sample === 2), check))];
        const noise = s1 !== undefined && s2 !== undefined ? Math.abs(s1 - s2) : undefined;
        return [{ check, reference: ref, arm, ...(noise === undefined ? {} : { noise, ...rateMove(ref, arm, noise) }) }];
      });
      return { armKey, replies: own.length, rates, referenceKey, vsReference };
    });
}

const pct = (n: number, d: number) => (d === 0 ? "–" : `${Math.round((100 * n) / d)}%`);
const tallyText = (t?: Tally) => (t ? `${t.hits} of ${t.n} (${pct(t.hits, t.n)})` : "–");
const pText = (p?: number) => (p === undefined ? "" : p < 0.001 ? " (p < 0.001)" : ` (p ${p.toFixed(3)})`);
const verdictText = (v: HandVerdict | boolean | undefined) => (v === undefined ? "–" : v === "partial" ? "partial" : v ? "yes" : "no");

function readingText(c: GroupComparison): string {
  if (c.noise === undefined) return "no noise figure (the reference has one sample)";
  if (c.moved) return `moved ${c.moved}${pText(c.p)}`;
  if (c.beyondNoise) return `beyond the noise, not moved${pText(c.p)}`;
  return "within the noise";
}

function calibrationReading(a: GroupAgreement): string {
  if (a.reliable) return "reliable";
  const few = [a.handPasses < 3 ? "yes" : "", a.handFails < 3 ? "no" : ""].filter(Boolean);
  return few.length ? `not reliable (too few hand ${few.join(" and ")})` : "not reliable";
}

/** judged-groups.md: the calibration, each arm's rates, a candidate against its reference, and the calibration items. */
export function renderGroupJudge(input: {
  items: GroupCalibrationItem[];
  calibration: GroupAgreement[];
  readings: GroupArmReading[];
  judged?: { itemId: string; samples: Partial<Record<GroupCheck, boolean>>[]; evidence?: Partial<Record<GroupCheck, string>>[] }[];
  spentUsd: number;
  generatedAt: Date;
  problems: string[];
}): string {
  const lines = [
    "# Judged checks on group turns",
    "",
    `Generated ${input.generatedAt.toISOString()} from prep-calls.jsonl (groupJudge.ts, prompt v${GROUP_JUDGE_PROMPT_VERSION}): one Luna low call per group reply reads every player's turn and asks whether the shared moments are told the same way (sharedMomentsMatch: the same lines by the same speakers) and whether the turns agree on their facts (sharedFactsAgree). Calibrated on today's 12 stored group turns, read by hand on the same criterion (partial: the same conversation in other words, left out of agreement); a check is judged reliably when sample 1 agrees on at least 85% of the hand yes and of the hand no, each side holding at least 3, and two samples agree on at least 90%. A candidate reads against its reference on the replies both have, with the reference's sample-1-against-sample-2 difference as the noise and the stop rule on top. Spent on these judge calls: $${input.spentUsd.toFixed(4)}.`,
    "",
    "## Calibration",
    "",
    "| Check | Agree (sample 1) | Hand yes / no | Judged no where the hand says yes | Judged yes where the hand says no | Samples agree | On partial items (yes / no) | Reading |",
    "|---|---|---|---|---|---|---|---|",
    ...input.calibration.map(
      (a) =>
        `| ${a.check} | ${a.agree} of ${a.decided} (${pct(a.agree, a.decided)}) | ${a.handPasses} / ${a.handFails} | ${a.falseFails} | ${a.falsePasses} | ${a.pairs ? `${a.pairsAgree} of ${a.pairs}` : "–"} | ${a.partial.yes} / ${a.partial.no} | ${calibrationReading(a)} |`
    ),
    "",
    "## Readings",
    "",
    "| Arm | Check | Arm passes | Reference passes | Noise | Reading |",
    "|---|---|---|---|---|---|",
  ];
  for (const r of input.readings) {
    for (const check of GROUP_CHECKS) {
      const own = r.rates[check];
      if (!own) continue;
      const c = r.vsReference?.find((v) => v.check === check);
      lines.push(
        c
          ? `| ${r.armKey} | ${check} | ${tallyText(c.arm)} | ${tallyText(c.reference)} | ${c.noise === undefined ? "–" : `${Math.round(100 * c.noise)} pts`} | ${readingText(c)} |`
          : `| ${r.armKey} | ${check} | ${tallyText(own)} | – | – | ${r.referenceKey ? "no matched replies" : "reference"} |`
      );
    }
  }
  lines.push("", "## Calibration items", "", "| Case | Output | sharedMomentsMatch: hand, judged | sharedFactsAgree: hand, judged | Hand reading |", "|---|---|---|---|---|");
  for (const item of input.items) {
    const judged = input.judged?.find((j) => j.itemId === item.id);
    const cell = (check: GroupCheck) => `${verdictText(item.hand[check])}, ${judged?.samples.map((s) => verdictText(s[check])).join("/") || "–"}`;
    lines.push(`| ${item.caseId} | ${item.outputId} | ${cell("sharedMomentsMatch")} | ${cell("sharedFactsAgree")} | ${item.note ?? ""} |`);
  }
  const disagreements = input.items.flatMap((item) => {
    const judged = input.judged?.find((j) => j.itemId === item.id);
    return GROUP_CHECKS.flatMap((check) => {
      const [hand, first] = [item.hand[check], judged?.samples[0]?.[check]];
      if (hand === undefined || hand === "partial" || first === undefined || first === hand) return [];
      return [`- ${item.caseId}, ${check}: hand ${verdictText(hand)}, judged ${verdictText(first)}. Evidence: ${(judged?.evidence?.[0]?.[check] ?? "").replace(/\s+/g, " ").trim()}`];
    });
  });
  if (disagreements.length) lines.push("", "## Where sample 1 disagrees with the hand", "", ...disagreements);
  if (input.problems.length) lines.push("", "## Problems", "", ...input.problems.map((p) => `- ${p}`));
  return `${lines.join("\n")}\n`;
}
