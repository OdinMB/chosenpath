import { z } from "zod";
import type { Story } from "core/models/Story.js";
import type { Outcome, PlayerSlot } from "core/types/index.js";
import { isContestedOutcome } from "core/utils/outcomeReadiness.js";
import type { TextRequest } from "../../game/services/storyTextSteps.js";
import { outcomeStatesAtEnding, scoreboardEnding } from "../../game/services/storyTextRounds/endingState.js";
import type { Arm, Stage } from "./arms.js";
import { isReliable, type HandVerdict } from "./judgedChecks.js";
import { playerParagraphs } from "./playerText.js";
import { prepJob } from "./prepCalls.js";
import type { Job } from "./runner.js";
import type { StageArmReading, StageComparison } from "./stageJudge.js";

/*
 * The ending's judged check (the owner's decision of 2026-09-30: "Unfinished
 * outcomes should be narrated in their current state, even if that state is
 * inconclusive"). One cheap GPT-6 call per player's ending asks
 * outcomesToldAsLeft: every outcome the ending tells is told as its milestones
 * leave it, a complete one resolved as its milestones point (a contest by its
 * scoreboard unless the milestones clearly say otherwise, 45 to 55 a draw), an
 * unfinished one in its current state, none of its possible resolutions
 * reached and no winner named; phrased so yes passes. The judge reads the
 * player's outcomes as the game leaves them after the ending (the status the
 * game computes, the milestones so far, the one the ending adds, a contest's
 * scoreboard) and the ending as the player reads it; never the prompt, so
 * production's ending and the variant read alike. It says how the ending tells
 * each outcome, quoting it, before it answers. A reply passes when every
 * player's ending passes. Calibrated on hand-read endings
 * (ENDING_JUDGE_CALIBRATION) by the judged checks' standard (isReliable).
 */

export const ENDING_CHECK = "outcomesToldAsLeft" as const;

/** Part of each ending judge call's key: a wording change is judged afresh. */
export const ENDING_JUDGE_PROMPT_VERSION = 1;

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asString = (value: unknown): string => (typeof value === "string" ? value : "");

const IMAGE_TAG = /\[image\s+[^\]]*\]/g;

const INTRO = `YOUR JOB: CHECK ONE PLAYER'S ENDING OF A STORY GAME

In this game a story's outcomes are settled over several chapters, one milestone at a time. An outcome is complete once it holds all its intended milestones, and the story can end before some outcomes are complete. The game's rule for the ending: each outcome is told as its milestones leave it.
- A complete outcome is resolved: the ending tells the possible resolution its milestones point to. For a contest between two sides, the side ahead on its scoreboard wins unless the milestones clearly say otherwise; a score between 45 and 55 is a draw.
- An unfinished outcome is told in its current state, which may be inconclusive: the ending may say what its milestones so far have settled, where it stands and what is still open, but it does not narrate one of its possible resolutions as reached, and it does not give the outcome's question a final answer. An unfinished contest has no winner yet; the ending may say who is ahead.

Read the ending below as a careful editor. For each outcome, say how the ending tells it and quote the words that show it; then answer the question. Judge by what the ending says has happened or will stay so, not by its mood.

An example from another story: the outcome "Will Mara win the regional baking championship?" is unfinished, with 1 of 3 milestones (she qualified at the town fair). "Mara's pie wins the championship" or "Mara never bakes for a judge again" resolve it: no. "Mara carries her town-fair ribbon home; the county round is still ahead of her" tells it as it stands: yes. Had the outcome been complete with a win at the final, "the county round is still ahead of her" would leave a complete outcome open: no.`;

const QUESTION = `${ENDING_CHECK}: Does the ending tell every outcome as its milestones leave it? Answer no if it resolves an unfinished outcome (narrates one of its possible resolutions as reached, or answers its question for good; for a contest, names a winner), or if it leaves a complete outcome open or resolves it against its milestones (for a contest, against its scoreboard, unless the milestones clearly say otherwise). An outcome the ending does not mention does not fail the check. Answer yes if every outcome it tells is told as its milestones leave it.`;

const TOLD = ["resolved", "in its current state", "not mentioned"] as const;

export function endingJudgeSchema() {
  return z.object({
    outcomes: z
      .array(
        z.object({
          outcomeId: z.string().describe("The outcome's id, as its heading reads."),
          told: z.enum(TOLD).describe("How the ending tells this outcome: resolved (one of its possible resolutions reached, or its question answered for good), in its current state (where it stands, what is still open), or not mentioned."),
          quote: z.string().describe("The ending's words that show it, quoted; empty when not mentioned."),
        })
      )
      .max(8)
      .describe("Every outcome listed above, once each, in their order."),
    [ENDING_CHECK]: z.object({
      evidence: z.string().describe("The outcome and the words that decide the answer, or what is missing; one or two sentences."),
      answer: z.enum(["yes", "no"]).describe(`The answer to the question ${ENDING_CHECK} above`),
    }),
  });
}

const resultLines = (resolutions: unknown) => Object.entries(asObject(resolutions)).map(([key, text]) => `    ${key}: ${asString(text)}`);

/** The opposites stat that keeps a contest's score: the one its resonance names, else the story's only one. */
function scoreboardOf(story: Story, outcome: Outcome) {
  const opposites = story.getSharedStats().filter((s) => s.type === "opposites");
  return opposites.find((s) => outcome.resonance?.includes(s.name)) ?? (opposites.length === 1 ? opposites[0] : undefined);
}

/**
 * A scored contest's scoreboard as the ending reads it: its value, which side
 * is ahead (level at 45 to 55), and whose side A is (player1's, with three
 * players player1's camp). Undefined for an outcome that is no scored contest.
 */
export function scoreboardLine(story: Story, outcomeId: string): string | undefined {
  const outcome = story.getSharedOutcomes().find((o) => o.id === outcomeId);
  if (!outcome || !isContestedOutcome(outcome) || !scoreboardEnding(story)) return undefined;
  const stat = scoreboardOf(story, outcome);
  if (!stat) return undefined;
  const entry = story.getState().sharedStatValues.find((v) => v.statId === stat.id);
  const a = typeof entry?.value === "number" ? entry.value : Number(entry?.value ?? stat.initialValue ?? 50);
  const ahead = a > 55 ? "side A is ahead" : a < 45 ? "side B is ahead" : "neither side is ahead";
  const name = story.getPlayer("player1")?.name ?? "player1";
  const sideA = story.getNumberOfPlayers() >= 3 ? `player1's camp (${name}'s)` : `player1's side (${name})`;
  return `  Scoreboard: ${stat.name} at ${a}|${100 - a}, so ${ahead} (45 to 55 would be level). Side A is ${sideA}.`;
}

/** The player's ending as they read it: paragraphs without image tags; undefined where the reply holds none. */
function endingParagraphs(reply: unknown, slot: PlayerSlot): string[] | undefined {
  const beat = asObject(asObject(reply)[slot]);
  if (typeof beat.text !== "string") return undefined;
  const paragraphs = playerParagraphs(beat.text)
    .map((p) => p.replace(IMAGE_TAG, " ").replace(/\s+/g, " ").trim())
    .filter((p) => /\p{L}/u.test(p));
  return paragraphs.length ? paragraphs : undefined;
}

/**
 * The judge's request for one player's ending, or undefined where the turn is
 * no ending or the reply holds no ending for the player. The player's
 * outcomes are the shared ones and their own, as the game leaves them after
 * the ending's milestones (outcomeStatesAtEnding); the milestones the reply
 * adds are shown as added by the ending.
 */
export function endingJudgeRequest(story: Story, reply: unknown, slot: PlayerSlot): TextRequest | undefined {
  if (story.getCurrentBeatType() !== "ending") return undefined;
  const paragraphs = endingParagraphs(reply, slot);
  if (!paragraphs) return undefined;
  const added = asArray(asObject(reply).newMilestones).map(asObject);
  const states = outcomeStatesAtEnding(story).filter((s) => s.owner === "shared" || s.owner === slot);
  const byId = new Map([...story.getSharedOutcomes(), ...(story.getPlayer(slot)?.outcomes ?? [])].map((o) => [o.id, o]));
  const outcomes = states.flatMap((state) => {
    const outcome = byId.get(state.id);
    if (!outcome) return [];
    const recorded = outcome.milestones ?? [];
    const own = added.filter((m) => m.outcome === state.id).map((m) => asString(m.newMilestone)).filter(Boolean);
    const withEnding = recorded.length < state.milestones ? " with the ending's" : "";
    const board = scoreboardLine(story, state.id);
    return [
      [
        `Outcome ${state.id} (${state.owner === "shared" ? "shared" : "the player's own"}): ${outcome.question}`,
        "  Possible resolutions:",
        ...resultLines(outcome.possibleResolutions),
        `  Milestones: ${state.milestones} of ${state.intended} intended${withEnding}, so this outcome is ${state.complete ? "complete" : "unfinished"}.`,
        ...recorded.map((m, i) => `    ${i + 1}. ${m}`),
        ...own.map((m, i) => `    ${recorded.length + i + 1}. ${m} (added by this ending)`),
        ...(board ? [board] : []),
      ].join("\n"),
    ];
  });
  const names = story.getPlayerSlots().map((s) => `${story.getPlayer(s)?.name ?? s}${s === slot ? " (this player)" : ""}`);
  const sections = [
    INTRO,
    ["======= THE STORY =======", `Title: ${story.getTitle()}`, `${names.length > 1 ? "The players' characters" : "The player's character"}: ${names.join(", ")}`].join("\n"),
    ["======= THE PLAYER'S OUTCOMES, AS THE MILESTONES LEAVE THEM AFTER THE ENDING =======", ...outcomes].join("\n\n"),
    ["======= THE ENDING, AS THE PLAYER READS IT =======", ...paragraphs.map((p, i) => `[${i + 1}] ${p}`)].join("\n"),
    ["======= QUESTION =======", QUESTION].join("\n"),
  ];
  return { prompt: sections.join("\n\n"), schema: endingJudgeSchema() };
}

/** The verdict: true when the judge answered yes, undefined where it answered neither. */
export function endingVerdictFrom(parsed: unknown): boolean | undefined {
  const answer = asObject(asObject(parsed)[ENDING_CHECK]).answer;
  return answer === "yes" ? true : answer === "no" ? false : undefined;
}

/** The judge's evidence and how it read each outcome ("id: told (\"quote\")"). */
export function endingEvidenceFrom(parsed: unknown): { evidence?: string; outcomes: string[] } {
  const reply = asObject(parsed);
  const evidence = asObject(reply[ENDING_CHECK]).evidence;
  const outcomes = asArray(reply.outcomes)
    .map(asObject)
    .map((o) => `${asString(o.outcomeId)}: ${asString(o.told)}${asString(o.quote) ? ` ("${asString(o.quote)}")` : ""}`);
  return { ...(typeof evidence === "string" ? { evidence } : {}), outcomes };
}

/** A reply's verdict from its players' endings: every one passing; undefined while any is unanswered. */
export function replyVerdict(players: (boolean | undefined)[]): boolean | undefined {
  if (players.some((v) => v === undefined)) return undefined;
  return players.every(Boolean);
}

export const endingJudgeCaseId = (key: string, version = ENDING_JUDGE_PROMPT_VERSION) => `judge-ending-v${version}-${key}`;

/** Luna low reads one ending and writes a line per outcome and a short answer: the smoke's two calls wrote 336 and 421 tokens, reasoning included */
const ENDING_JUDGE_OUTPUT_TOKENS = 500;

/** The judge calls: each target at its number of samples (the calibration's two, the rest one). */
export function endingJudgeJobs(targets: { key: string; request: TextRequest; samples: number }[], arm: Arm, promptState: string, stage: Stage): Job[] {
  return targets.flatMap((target) =>
    Array.from({ length: target.samples }, (_, i) =>
      prepJob({
        kind: "judge",
        stage,
        promptState,
        caseId: endingJudgeCaseId(target.key),
        sample: i + 1,
        arm,
        role: "beat",
        players: 1,
        build: () => target.request,
        outputTokens: ENDING_JUDGE_OUTPUT_TOKENS,
      })
    )
  );
}

// --- Calibration on hand-read endings ---

export type EndingCalibrationItem = {
  id: string;
  /** The stored ending's output id (outputs/<id>.json) */
  output: string;
  slot: PlayerSlot;
  hand: HandVerdict;
  /** Who wrote the ending, so the hand set's mix shows */
  writer: string;
  note: string;
};

/**
 * Endings read by hand on the check's criterion before any judge call: yes
 * when every outcome the ending tells is told as its milestones leave it, no
 * when it resolves an unfinished outcome or leaves a complete one open or
 * resolves it against its milestones, partial where a line could be read
 * either way (left out of agreement). Read on 2026-09-30 before the first judge
 * call: the stored endings (Novi Reg after its first chapter, every outcome
 * unfinished: the Waste Ring 1 of 3 with the ending's, identity 0 of 2, City AI
 * 0 of 1) and the ending run's own (the built single-player ending: the Waste
 * Ring complete at 2 of 2, identity and City AI unfinished; the bounty contest
 * complete at 1 of 1 or unfinished at 1 of 3, side B ahead; the co-founders'
 * governance contest unfinished at 0 of 2 with side A ahead). Production's
 * ending and the variant on both sides, groups among them.
 */
const PRODUCTION = "production's ending (adopted)";
const VARIANT = "the variant (endingStateB)";

export const ENDING_JUDGE_CALIBRATION: EndingCalibrationItem[] = [
  // --- Hand yes ---
  {
    id: "stored-o0-variant",
    output: "cba656b14056c98abfee",
    slot: "player1",
    hand: true,
    writer: VARIANT,
    note: "All unfinished: the Ring 'stays out of reach', the Council question 'remains open', belonging 'still yours to define'",
  },
  {
    id: "stored-o2-variant",
    output: "b332495a751f1480f2e6",
    slot: "player1",
    hand: true,
    writer: VARIANT,
    note: "All unfinished: evidence strong enough to make denial harder but 'no one announces that the Ring is dismantled'; the Council unchanged; her place 'remains unwritten'",
  },
  {
    id: "stored-o0-arm-c",
    output: "fe408890aba838337993",
    slot: "player1",
    hand: true,
    writer: "arm C of the options and continuity run (adopted2, stored)",
    note: "All unfinished: the Ring not exposed, 'You are still deciding what place you can claim here, and whether the Council can ever be made to answer plainly'",
  },
  {
    id: "single-complete-variant",
    output: "65843c5b5d9be21cb929",
    slot: "player1",
    hand: true,
    writer: VARIANT,
    note: "The complete Ring resolved as its favorable milestones point (the operations face scrutiny, reforms reported in public); the Council's agreement narrated as the chapter's event while fairness is not promised; her place 'remains yours to discover'",
  },
  {
    id: "bounty-complete-variant-s1-p2",
    output: "503a8c49dd09045b3be9",
    slot: "player2",
    hand: true,
    writer: VARIANT,
    note: "The complete contest resolved for side B as the scoreboard and milestone point: 'The bounty is yours'; Mara's trust and the spring's protection left open",
  },
  {
    id: "bounty-unfinished-variant-p1",
    output: "4119832834268a749ba0",
    slot: "player1",
    hand: true,
    writer: VARIANT,
    note: "The unfinished contest told as it stands: the board leans toward Maeve, 'No one has won the reward'; the ledger choice and Ada's trust left open",
  },
  {
    id: "bounty-unfinished-production-p2",
    output: "226ec8bdc6b2eca55d4b",
    slot: "player2",
    hand: true,
    writer: PRODUCTION,
    note: "The unfinished contest told as it stands: 'The race has turned your way, but the reward is still locked and the pursuit is not done'; Maeve's own outcomes not told",
  },
  // --- Hand no ---
  {
    id: "single-complete-production",
    output: "8d5f1cf525a7532f8eb8",
    slot: "player1",
    hand: false,
    writer: PRODUCTION,
    note: "The unfinished City AI outcome resolved (the Council opens its decisions to public review and answers in public) and the untouched identity outcome too ('a community you can call your own')",
  },
  {
    id: "stored-o1-production",
    output: "b7142ca73b221f80d6eb",
    slot: "player1",
    hand: false,
    writer: PRODUCTION,
    note: "The unfinished City AI outcome at 0 of 1 given its mixed resolution ('The Council opens its waste contracts to citizen scrutiny and publishes an audit trail'), and identity resolved ('you have found a purpose')",
  },
  {
    id: "stored-o0-round2",
    output: "bd9653c55b3557a938ce",
    slot: "player1",
    hand: false,
    writer: "turn round 2's held form (turnR2b, round0, stored)",
    note: "B8's rule ends every outcome: the City AI outcome at 0 of 1 gets its mixed resolution (a review panel and audit summaries), identity lands on 'an outsider who has found a reason to stay attentive'",
  },
  {
    id: "camps-production-p2",
    output: "d5d3363d09d5362f8447",
    slot: "player2",
    hand: false,
    writer: PRODUCTION,
    note: "The camps' governance contest is unfinished at 0 of 2, but 'The governance amendment gives Stewardship the decisive voice': a winner named",
  },
  {
    id: "bounty-complete-production-p1",
    output: "ffec98a5956dc7ff47bd",
    slot: "player1",
    hand: false,
    writer: PRODUCTION,
    note: "The complete contest left open ('Ada does not announce a capture or pay out the reward'), and Ruth's unfinished claims-trust outcome given its mixed resolution word for word ('every future claim you bring me will need independent checking')",
  },
  {
    id: "bounty-complete-variant-s2-p2",
    output: "f94c68d65d1a8a5f8646",
    slot: "player2",
    hand: false,
    writer: VARIANT,
    note: "The complete contest left open: 'Your name is the likely one on the bounty claim; the actual reward ... still unwritten'",
  },
  {
    id: "bounty-unfinished-production-p1",
    output: "64d59245f6645b7c663f",
    slot: "player1",
    hand: false,
    writer: PRODUCTION,
    note: "The unfinished contest given a winner: 'The contest goes Maeve's way', 'The ruling costs you the prize'",
  },
  // --- Partial, left out of agreement ---
  {
    id: "stored-o0-production",
    output: "1a2b9d6f206784b5eefa",
    slot: "player1",
    hand: "partial",
    writer: PRODUCTION,
    note: "Ring and Council told as they stand, but 'you begin building a smaller, independent purpose' may land the untouched identity outcome on its second resolution",
  },
];

export type EndingAgreement = {
  check: typeof ENDING_CHECK;
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
export function scoreEndingCalibration(items: EndingCalibrationItem[], judged: { itemId: string; samples: (boolean | undefined)[] }[]): EndingAgreement {
  const byItem = new Map(judged.map((j) => [j.itemId, j]));
  const a: EndingAgreement = { check: ENDING_CHECK, decided: 0, agree: 0, falseFails: 0, falsePasses: 0, handPasses: 0, handFails: 0, pairs: 0, pairsAgree: 0, partial: { yes: 0, no: 0 }, reliable: false };
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

type Tally = { hits: number; n: number };
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

function calibrationReading(a: EndingAgreement): string {
  if (a.reliable) return "reliable";
  const few = [a.handPasses < 3 ? "yes" : "", a.handFails < 3 ? "no" : ""].filter(Boolean);
  return few.length ? `not reliable (too few hand ${few.join(" and ")})` : "not reliable";
}

export type EndingFailure = { armKey: string; caseId: string; sample: number; outputId: string; slot: string; evidence: string };

/** judged-endings.md: the calibration, each arm's rates and a candidate against its references, the calibration items, and the failures. */
export function renderEndingJudge(input: {
  items: EndingCalibrationItem[];
  calibration: EndingAgreement;
  judged: { itemId: string; samples: (boolean | undefined)[]; evidence: { evidence?: string; outcomes: string[] }[] }[];
  readings: StageArmReading[];
  failures: EndingFailure[];
  spentUsd: number;
  generatedAt: Date;
  problems: string[];
}): string {
  const c = input.calibration;
  const lines = [
    "# Judged check: each outcome told as its milestones leave it",
    "",
    `Generated ${input.generatedAt.toISOString()} from prep-calls.jsonl (endingJudge.ts, prompt v${ENDING_JUDGE_PROMPT_VERSION}): one Luna low call per player's ending asks whether every outcome the ending tells is told as its milestones leave it (${ENDING_CHECK}): a complete one resolved as its milestones point (a contest by its scoreboard unless the milestones clearly say otherwise), an unfinished one in its current state, none of its possible resolutions reached. The judge reads the player's outcomes as the game leaves them after the ending and the ending as the player reads it, never the prompt. A reply passes when every player's ending passes. Calibrated on hand-read endings; reliable when sample 1 agrees on at least 85% of the hand yes and of the hand no, each side holding at least 3, and two samples agree on at least 90%. A candidate reads against each reference on the replies both have, with the reference's sample-1-against-sample-2 difference as the noise and the stop rule on top. Spent on these judge calls: $${input.spentUsd.toFixed(4)}.`,
    "",
    "## Calibration",
    "",
    "| Check | Agree (sample 1) | Hand yes / no | Judged no where the hand says yes | Judged yes where the hand says no | Samples agree | On partial items (yes / no) | Reading |",
    "|---|---|---|---|---|---|---|---|",
    `| ${ENDING_CHECK} | ${c.agree} of ${c.decided} (${pct(c.agree, c.decided)}) | ${c.handPasses} / ${c.handFails} | ${c.falseFails} | ${c.falsePasses} | ${c.pairs ? `${c.pairsAgree} of ${c.pairs}` : "–"} | ${c.partial.yes} / ${c.partial.no} | ${calibrationReading(c)} |`,
    "",
    "## Readings",
    "",
    "| Arm | Replies passing | Against | Arm on the shared replies | Reference on them | Noise | Reading |",
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
    return [`- ${item.id}: hand ${verdictText(item.hand)}, judged ${verdictText(first)}. Outcomes: ${(said?.outcomes ?? []).join("; ")}. Evidence: ${(said?.evidence ?? "").replace(/\s+/g, " ").trim()}`];
  });
  if (disagreements.length) lines.push("", "## Where sample 1 disagrees with the hand", "", ...disagreements);
  if (input.failures.length) {
    lines.push("", "## Endings judged not to tell an outcome as its milestones leave it", "", ...input.failures.map((f) => `- ${f.armKey} ${f.caseId} s${f.sample} ${f.slot} (${f.outputId}): ${f.evidence.replace(/\s+/g, " ").trim()}`));
  }
  if (input.problems.length) lines.push("", "## Problems", "", ...input.problems.map((p) => `- ${p}`));
  return `${lines.join("\n")}\n`;
}
