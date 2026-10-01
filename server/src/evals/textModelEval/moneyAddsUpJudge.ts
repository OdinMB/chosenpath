import { z } from "zod";
import type { Story } from "core/models/Story.js";
import type { PlayerSlot, SetOfBeatGenerationSchema, Stat } from "core/types/index.js";
import { ChangeService } from "../../game/services/ChangeService.js";
import { beatStep, type TextRequest } from "../../game/services/storyTextSteps.js";
import type { Arm, Stage } from "./arms.js";
import { isReliable, type HandVerdict } from "./judgedChecks.js";
import { factLines, paragraphsOf } from "./outcomeSettledJudge.js";
import { prepJob } from "./prepCalls.js";
import type { Job } from "./runner.js";
import type { StageArmReading, StageComparison } from "./stageJudge.js";

/*
 * The money-adds-up stage's judged check (2026-10-01, fix 7 of the second
 * playthroughs' review). One cheap GPT-6 call per player's turn asks
 * figuresAddUp: every amount of a counted stat (money, cups, supplies) the
 * text pays, spends, uses up, sells, earns or receives moves that stat by that
 * amount in the turn's stat changes; every change of a counted stat or of one
 * worked out from other figures (a profit margin) is shown in the text, the
 * payment of the sacrifice or reward the player chose last aside; and every
 * total stated for a stat in the text, the interludes or the recorded facts is
 * the stat's value after the turn. Meters (a mood, buzz, demand) and figures
 * no stat counts are left alone. Phrased so yes passes.
 *
 * The judge reads the story's number and percentage stats, each with its
 * description, its sacrifice and reward, its value before the turn, the
 * turn's changes to it and its value after, as the game applies them (the
 * reply as the game keeps it, through beatStep.apply and ChangeService); the
 * option the player chose last; the player's text, interludes and the facts
 * the turn records; never the prompt, so production's turn and the variant
 * read alike. It lists the amounts the text pays and earns, the changes the
 * text doesn't show and the totals it states, then answers. Calibrated on
 * hand-read turns before any judge call (MONEY_CALIBRATION), to the judged
 * checks' standard (isReliable).
 */

export const MONEY_CHECK = "figuresAddUp" as const;

/** Part of each judge call's key: a wording change is judged afresh. */
export const MONEY_JUDGE_PROMPT_VERSION = 1;

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asString = (value: unknown): string => (typeof value === "string" ? value : "");

const INTRO = `YOUR JOB: CHECK THE FIGURES IN ONE PLAYER'S TURN OF A STORY GAME

In this game the story keeps stats, and each turn first writes its stat changes, then the text the player reads. Some stats count something: money in a cashbox, cups, supplies, crumbs. Some are worked out from other figures, such as a profit margin (profit divided by sales). The others are meters: a mood, a reputation, demand, buzz. This check reads only the counted and the worked-out stats, and only the figures the turn tells for them.

The game's rules for this turn:
- Every amount of a counted stat that the text says is paid, spent, used up, sold, earned or received in this turn is in the turn's stat changes: the stat moves by that amount, the right way. A price quoted, an estimate, a plan, a budget line or a sum worked out for "if" moves nothing. A figure for something no stat counts (dollars in a story with no money stat) is left alone.
- Every change of a counted or worked-out stat is shown in the text: the amount being paid, used or earned, or the sum that works the figure out. The one exception is the payment of a sacrifice or reward the player chose on their last turn: its option named the amount, and the text may show it or not.
- Every total the text, the interludes or the recorded facts state for a stat (the coins left, a count, the margin) is the stat's value after this turn's changes.

Read the turn as a careful bookkeeper. List every amount the text pays, spends, uses up, sells, earns or receives for a counted stat, and every amount it only quotes or plans; list each change of a counted or worked-out stat that the text does not show; list each total stated for a stat; then answer the question.

An example from another story: Ada's Bakery Till holds 12 coins and she chose the reward "Gain 3 coins by selling yesterday's buns". A turn whose stat changes add 3 and whose text has her "drop the three coins from the buns into the till; fifteen now" passes. If its text also has her "pay the miller two coins for flour" with no change for them, it fails; so does one that adds 3 but says "the till holds twenty coins". A turn that raises her Bakery Margin from 20% to 25% with no sum in the text fails; one whose text works out "nine coins of sales, six of costs: three coins of profit, a third of the sales" and sets the margin to 33 passes.`;

const QUESTION = `${MONEY_CHECK}: Do the turn's figures add up: every amount of a counted stat the text pays, spends, uses up, sells, earns or receives moves that stat by that amount in the stat changes; every change of a counted or worked-out stat is shown in the text (the payment of the sacrifice or reward chosen last aside); and every total stated for a stat in the text, the interludes or the recorded facts is its value after the turn? Answer no if an amount paid or earned is missing from the stat changes or moves the stat by another amount, if a counted or worked-out stat changes with nothing in the text to show it, or if a stated total differs from the stat's value after the turn. Answer yes otherwise.`;

const AMOUNT_KINDS = ["paid or spent", "used up", "earned or received", "quoted, estimated or planned"] as const;
const IN_CHANGES = ["yes", "no", "not needed"] as const;

export function moneyJudgeSchema() {
  return z.object({
    amounts: z
      .array(
        z.object({
          quote: z.string().describe("The words that tell the amount, quoted."),
          stat: z.string().describe("The counted stat it belongs to, by name."),
          amount: z.string().describe("The amount, as a number."),
          kind: z.enum(AMOUNT_KINDS).describe("What the text does with it in this turn."),
          inChanges: z.enum(IN_CHANGES).describe("Whether the stat changes move the stat by it: yes, no, or not needed (a quote, estimate or plan)."),
        })
      )
      .max(12)
      .describe("Every amount of a counted stat the text tells, paid, used, earned or only quoted; empty when none."),
    unshown: z
      .array(z.object({ stat: z.string().describe("The counted or worked-out stat, by name."), change: z.string().describe("Its change, before -> after.") }))
      .max(6)
      .describe("Each change of a counted or worked-out stat the text does not show (the chosen sacrifice's or reward's payment aside); empty when none."),
    totals: z
      .array(
        z.object({
          quote: z.string().describe("The words that state the total, quoted."),
          stat: z.string().describe("The stat it is a total of, by name."),
          stated: z.string().describe("The total the words state."),
          valueAfter: z.string().describe("The stat's value after this turn."),
          matches: z.enum(["yes", "no"]).describe("Whether they are the same."),
        })
      )
      .max(10)
      .describe("Every total the text, the interludes or the recorded facts state for a stat; empty when none."),
    [MONEY_CHECK]: z.object({
      evidence: z.string().describe("The words or the change that decide the answer, quoted, or what is missing; one or two sentences."),
      answer: z.enum(["yes", "no"]).describe(`The answer to the question ${MONEY_CHECK} above`),
    }),
  });
}

const COUNTABLE = new Set(["number", "percentage"]);

/** A stat's value in a story: shared, or the seat's own. */
function valueIn(story: Story, stat: Stat, slot: PlayerSlot, shared: boolean): unknown {
  const state = story.getState();
  const entries = shared ? state.sharedStatValues : state.players[slot]?.statValues;
  return entries?.find((v) => v.statId === stat.id)?.value;
}

const valueText = (value: unknown) => (value === undefined ? "not set" : Array.isArray(value) ? `[${value.join(", ")}]` : String(value));

const CHANGE_WORDS: Record<string, string> = { addNumber: "add", subtractNumber: "subtract", setNumber: "set to" };

/** The turn's changes to a stat, as written in the reply the game keeps. */
function changesOf(reply: SetOfBeatGenerationSchema, stat: Stat, group: string): string[] {
  return asArray(asObject(reply).statChanges)
    .map(asObject)
    .filter((c) => asString(c.stat) === stat.id && asString(c.group) === group)
    .map((c) => `${CHANGE_WORDS[asString(c.change)] ?? asString(c.change)} ${valueText(c.value)}`);
}

/** The story after the turn, as the game applies the reply; undefined where it can't be applied. */
function storyAfter(story: Story, reply: SetOfBeatGenerationSchema): Story | undefined {
  try {
    const [withBeat, changes] = beatStep.apply(story, reply, true);
    return new ChangeService().applyChanges(withBeat, changes);
  } catch {
    return undefined;
  }
}

function statLines(story: Story, after: Story | undefined, reply: SetOfBeatGenerationSchema, slot: PlayerSlot): string[] {
  const state = story.getState();
  const name = story.getPlayer(slot)?.name ?? slot;
  const entries: { stat: Stat; shared: boolean }[] = [
    ...(state.sharedStats ?? []).map((stat) => ({ stat, shared: true })),
    ...(state.playerStats ?? []).map((stat) => ({ stat, shared: false })),
  ].filter((e) => COUNTABLE.has(e.stat.type));
  return entries.flatMap(({ stat, shared }) => {
    const changes = changesOf(reply, stat, shared ? "shared" : slot);
    const before = valueIn(story, stat, slot, shared);
    const valueAfter = after ? valueIn(after, stat, slot, shared) : undefined;
    const levers = [
      ...(stat.optionsToSacrifice && stat.optionsToSacrifice !== "None" ? [`As a sacrifice: ${stat.optionsToSacrifice}`] : []),
      ...(stat.optionsToGainAsReward && stat.optionsToGainAsReward !== "None" ? [`As a reward: ${stat.optionsToGainAsReward}`] : []),
    ];
    return [
      `- ${stat.name} (${shared ? "shared" : `${name}'s`}, ${stat.type}): ${stat.tooltip ?? ""}`.trimEnd(),
      ...(levers.length ? [`  ${levers.join(" ")}`] : []),
      `  Before this turn: ${valueText(before)}. This turn's changes: ${changes.length ? changes.join(", ") : "none"}. After this turn: ${valueText(valueAfter ?? before)}.`,
    ];
  });
}

/** The option the player chose on their last turn, with its kind; none on the story's first turn. */
function lastChoiceLine(story: Story, slot: PlayerSlot): string {
  if (story.isFirstBeat()) return "none: this is the story's first turn";
  const beat = asObject(story.getCurrentBeat(slot));
  const choice = typeof beat.choice === "number" ? beat.choice : -1;
  const option = asObject(asArray(beat.options)[choice]);
  const text = asString(option.text);
  if (!text) return "not stored";
  const kind = asString(option.resourceType);
  return kind === "sacrifice" ? `A sacrifice: ${text}` : kind === "reward" ? `A reward: ${text}` : `A normal option: ${text}`;
}

function interludeLines(reply: SetOfBeatGenerationSchema, slot: string): string[] {
  return asArray(asObject(asObject(reply)[slot]).interludes)
    .map((i) => asString(asObject(i).text).trim())
    .filter(Boolean)
    .map((text) => `- ${text}`);
}

function slotRequest(story: Story, after: Story | undefined, reply: SetOfBeatGenerationSchema, slot: PlayerSlot): TextRequest {
  const name = story.getPlayer(slot)?.name ?? slot;
  const facts = factLines(story, reply);
  const interludes = interludeLines(reply, slot);
  const text = [`${name}'s text (${slot}):`, ...paragraphsOf(reply, slot).map((p, i) => `[${i + 1}] ${p}`)].join("\n");
  const sections = [
    INTRO,
    ["======= THE STORY =======", `Title: ${story.getTitle()}`, `The player's character: ${name}`].join("\n"),
    ["======= THE STATS (number and percentage stats, as the game applies this turn) =======", ...statLines(story, after, reply, slot)].join("\n"),
    ["======= THE OPTION THE PLAYER CHOSE ON THEIR LAST TURN =======", lastChoiceLine(story, slot)].join("\n"),
    ["======= THE TURN, AS THE PLAYER READS IT =======", text].join("\n"),
    ["======= ITS INTERLUDES (shown while the next turn is written) =======", ...(interludes.length ? interludes : ["none"])].join("\n"),
    ["======= FACTS THIS TURN RECORDS =======", ...(facts.length ? facts : ["none"])].join("\n"),
    ["======= QUESTION =======", QUESTION].join("\n"),
  ];
  return { prompt: sections.join("\n\n"), schema: moneyJudgeSchema() };
}

/**
 * The judge's requests for one reply (as the game keeps it, after the beat
 * repairs) on its turn's story: one per player whose text the reply writes;
 * none where the story keeps no number or percentage stat.
 */
export function moneyJudgeRequests(story: Story, reply: SetOfBeatGenerationSchema): { slot: PlayerSlot; request: TextRequest }[] {
  const state = story.getState();
  if (![...(state.sharedStats ?? []), ...(state.playerStats ?? [])].some((s) => COUNTABLE.has(s.type))) return [];
  const after = storyAfter(story, reply);
  return story
    .getPlayerSlots()
    .filter((slot) => paragraphsOf(reply, slot).length > 0)
    .map((slot) => ({ slot, request: slotRequest(story, after, reply, slot) }));
}

/** The verdict: true when the judge answered yes, undefined where it answered neither. */
export function moneyVerdictFrom(parsed: unknown): boolean | undefined {
  const answer = asObject(asObject(parsed)[MONEY_CHECK]).answer;
  return answer === "yes" ? true : answer === "no" ? false : undefined;
}

/** The judge's evidence and its readings: each amount, each unshown change, each stated total. */
export function moneyEvidenceFrom(parsed: unknown): { evidence?: string; lines: string[] } {
  const reply = asObject(parsed);
  const evidence = asString(asObject(reply[MONEY_CHECK]).evidence);
  const lines = [
    ...asArray(reply.amounts)
      .map(asObject)
      .map((a) => `${asString(a.kind)} ${asString(a.amount)} ${asString(a.stat)} ("${asString(a.quote)}"): in the changes ${asString(a.inChanges)}`),
    ...asArray(reply.unshown)
      .map(asObject)
      .map((u) => `unshown: ${asString(u.stat)} ${asString(u.change)}`),
    ...asArray(reply.totals)
      .map(asObject)
      .map((t) => `total ${asString(t.stat)} ${asString(t.stated)}, after ${asString(t.valueAfter)} ("${asString(t.quote)}"): matches ${asString(t.matches)}`),
  ];
  return { ...(evidence ? { evidence } : {}), lines };
}

export const moneyJudgeCaseId = (key: string, version = MONEY_JUDGE_PROMPT_VERSION) => `judge-money-v${version}-${key}`;

/** Luna low reads one player's turn and lists its amounts, unshown changes and totals: about 600-1,100 tokens, reasoning included */
const MONEY_JUDGE_OUTPUT_TOKENS = 1000;

export type MoneyTarget = { key: string; request: TextRequest; samples: number };

/** The judge calls: each target at its number of samples (the calibration's two, the rest one). */
export function moneyJudgeJobs(targets: MoneyTarget[], arm: Arm, promptState: string, stage: Stage): Job[] {
  return targets.flatMap((target) =>
    Array.from({ length: target.samples }, (_, i) =>
      prepJob({
        kind: "judge",
        stage,
        promptState,
        caseId: moneyJudgeCaseId(target.key),
        sample: i + 1,
        arm,
        role: "beat",
        players: 1,
        build: () => target.request,
        outputTokens: MONEY_JUDGE_OUTPUT_TOKENS,
      })
    )
  );
}

// ---------------------------------------------------------------- calibration

/**
 * A hand-read player's turn: a stored playthrough turn (replayed; the second
 * round's unless `round` says 1), or a reply of the stage's own run by its
 * output id, with the player it reads. A constructed failing version is a
 * stored turn with edits on its reply: each passage, which must occur,
 * replaced wherever it occurs (withEdits, also in the reply's JSON).
 */
export type MoneyCalibrationItem = { id: string; slot: PlayerSlot; hand: HandVerdict; note: string } & ({ round?: 1 | 2; story: string; turn: number; edits?: [string, string][] } | { output: string });

/* The constructed versions of stored lemonade turns (the second round's): a stated total off by one, a payment and a sale with no change, a change the text doesn't show, a margin moved with no sum; and one that adds up (turn 3 with the sleeves and the sales counted). */
const T8_TOTAL: [string, string][] = [["leaving four coins in the cashbox", "leaving three coins in the cashbox"]];
const T6_PAID: [string, string][] = [["You leave the cashbox latch open and count the five coins without taking any out.", "You take two coins from the cashbox and hand them to Eli for the stall fee."]];
const T9_SALE: [string, string][] = [
  [
    "You count the coins in the box as she counts the marks in the ledger: one, two, three, four.",
    "A customer buys two cups and drops two coins into the box; you count them all as she counts the marks in the ledger: one, two, three, four, five, six.",
  ],
];
const T5_UNSHOWN: [string, string][] = [['"statChanges":[]', '"statChanges":[{"type":"statChange","group":"player1","stat":"player_stand_cashbox","change":"subtractNumber","value":3}]']];
const T10_MARGIN: [string, string][] = [['"statChanges":[]', '"statChanges":[{"type":"statChange","group":"player1","stat":"player_profit_margin","change":"addNumber","value":5}]']];
const T3_COUNTED: [string, string][] = [
  [
    '"stat":"player_stand_cashbox","change":"subtractNumber","value":5}]',
    '"stat":"player_stand_cashbox","change":"subtractNumber","value":5},{"type":"statChange","group":"player1","stat":"player_stand_cashbox","change":"subtractNumber","value":1},{"type":"statChange","group":"player1","stat":"player_stand_cashbox","change":"addNumber","value":5}]',
  ],
  ["The tally grows while the cashbox fills with a handful of mixed coins.", "Four more customers leave four more coins, and the tally grows while the cashbox fills."],
];

/**
 * Players' turns read by hand on the check's criterion before any judge call:
 * yes when every amount paid or earned is in the stat changes, every change
 * of a counted or worked-out stat is shown (the chosen lever's payment
 * aside) and every stated total is the stat's value after; no when one
 * isn't; partial where a reader could go either way (left out of agreement).
 * Read on 2026-10-01: the second round's lemonade story turn by turn (the one
 * stored learning story that counts money), the mouse story's crumb wedge,
 * the first round's lemonade story (dollars in the text, no money stat; a
 * Shared Supply Reserve), and constructed versions of stored lemonade turns;
 * then seven of the stage's own replies (by output id), read after the run
 * and before any judge call.
 */
export const MONEY_CALIBRATION: MoneyCalibrationItem[] = [
  // --- Hand yes ---
  { id: "stored-lemonade-t1", story: "play-lemonade", turn: 1, slot: "player1", hand: true, note: "The first turn: 'You count the ten coins in your cashbox' (10); no changes" },
  { id: "stored-lemonade-t5", story: "play-lemonade", turn: 5, slot: "player1", hand: true, note: "Repair estimates quoted (three coins, one coin); 'five coins rest inside' (5); no changes" },
  { id: "stored-lemonade-t6", story: "play-lemonade", turn: 6, slot: "player1", hand: true, note: "The two-coin fee and a three-coin estimate quoted, the fee split as a plan; 'the five coins' (5); no changes" },
  { id: "stored-lemonade-t7", story: "play-lemonade", turn: 7, slot: "player1", hand: true, note: "'Two plus three is five ... five coins still in the open cashbox; none has been spent' (5); no changes" },
  { id: "stored-lemonade-t8", story: "play-lemonade", turn: 8, slot: "player1", hand: true, note: "The one-coin fee share paid, 5 -> 4, 'leaving four coins in the cashbox' in the text and the fact" },
  { id: "stored-lemonade-t9", story: "play-lemonade", turn: 9, slot: "player1", hand: true, note: "'So that leaves four here' and four counted (4); the three-coin estimate a possible cost; no changes" },
  { id: "stored-lemonade-t10", story: "play-lemonade", turn: 10, slot: "player1", hand: true, note: "'four coins inside' (4); four minus three worked out as a hypothetical; no changes" },
  { id: "stored-kids-mouse-t10", story: "play-kids-mouse", turn: 10, slot: "player1", hand: true, note: "The chosen crumb wedge (a sacrifice, 1 Pantry Crumb) paid, 3 -> 2, and shown settling into the groove" },
  { id: "stored-r1-lemonade-t3", round: 1, story: "play-lemonade", turn: 3, slot: "player1", hand: true, note: "Round 1: dollar estimates with no money stat; the reward's Business Confidence (a meter) 70 -> 80" },
  { id: "stored-r1-lemonade-t4", round: 1, story: "play-lemonade", turn: 4, slot: "player1", hand: true, note: "Round 1: the purchase list's dollars planned, no money stat; no changes" },
  { id: "constructed-lemonade-t3-counted", story: "play-lemonade", turn: 3, edits: T3_COUNTED, slot: "player1", hand: true, note: "Constructed: turn 3 with the paper sleeves' coin (-1) and five coins of sales (+5) in the changes beside the fruit's five, the sales told as one coin and four more" },
  // --- Hand no ---
  { id: "stored-lemonade-t3", story: "play-lemonade", turn: 3, slot: "player1", hand: false, note: "The fruit's five coins paid (the sacrifice, -5), but 'One more coin for paper sleeves' recorded as an expense and the sales ('leave a coin on the cart', 'the cashbox fills') never reach the cashbox" },
  { id: "stored-lemonade-t4", story: "play-lemonade", turn: 4, slot: "player1", hand: false, note: "The switch turn raises Profit Margin 25 -> 30 with no sum in the text" },
  { id: "stored-r1-lemonade-t5", round: 1, story: "play-lemonade", turn: 5, slot: "player1", hand: false, note: "Round 1's switch turn: Shared Supply Reserve 3 -> 2 (the stat's own after-chapter rule) with nothing in the text using a supply unit" },
  { id: "constructed-lemonade-t8-total", story: "play-lemonade", turn: 8, edits: T8_TOTAL, slot: "player1", hand: false, note: "Constructed: the fee paid, 5 -> 4, but the text and the fact say 'leaving three coins in the cashbox'" },
  { id: "constructed-lemonade-t6-paid", story: "play-lemonade", turn: 6, edits: T6_PAID, slot: "player1", hand: false, note: "Constructed: Theo hands Eli two coins for the fee, with no change to the cashbox" },
  { id: "constructed-lemonade-t9-sale", story: "play-lemonade", turn: 9, edits: T9_SALE, slot: "player1", hand: false, note: "Constructed: a customer drops two coins into the box and six are counted, with no change (4)" },
  { id: "constructed-lemonade-t5-unshown", story: "play-lemonade", turn: 5, edits: T5_UNSHOWN, slot: "player1", hand: false, note: "Constructed: the cashbox loses three coins (5 -> 2) while the text only quotes the repair and counts 'five coins'" },
  { id: "constructed-lemonade-t10-margin", story: "play-lemonade", turn: 10, edits: T10_MARGIN, slot: "player1", hand: false, note: "Constructed: Profit Margin 30 -> 35 with no sum in the text" },
  // --- The stage's own replies, read by hand after the run and before any judge call ---
  { id: "run-lemonade-t3-variant-s1", output: "333eb8651f5312b711e6", slot: "player1", hand: true, note: "The variant: the fruit's five coins paid (-5), the first cup's two coins added (+2, 'The two coins from your first cup sit in the cashbox'), the basics' six coins quoted 'not yet paid'" },
  { id: "run-lemonade-t3-production-s1", output: "f551f421009ed66f6316", slot: "player1", hand: false, note: "Production: a one-coin sugar measure bought and 'three cups have brought in four coins of sales' clicking into the cashbox; only the fruit's five leave it" },
  { id: "run-lemonade-t3-production-s2", output: "a4c107532f0be4083f76", slot: "player1", hand: false, note: "Production: 'A coin clinks into the cashbox, then another' and Jo buys a cup; only the fruit's five leave it, 'five coins left'" },
  { id: "run-lemonade-t4-variant-s1", output: "ff15da391294a8f51b21", slot: "player1", hand: false, note: "The variant: Profit Margin 25 -> 30 with no sum in the text (Market Buzz, a meter, +10)" },
  { id: "run-lemonade-t8-variant-s1", output: "a18577a58acad22418f4", slot: "player1", hand: true, note: "The variant: one coin for the fee share, 5 -> 4, 'four coins inside'" },
  { id: "run-lemonade-t11-variant-s1", output: "dd6e71bceb72b26113da", slot: "player1", hand: true, note: "The variant's ending: the fee paid, 'the four coins still in the box', the menu estimate unspent; no sales amounts told" },
  // --- Partial, left out of agreement ---
  { id: "stored-lemonade-t2", story: "play-lemonade", turn: 2, slot: "player1", hand: "partial", note: "Costs quoted (3 + 2 + 1), nothing paid; but 'Mara circles the remaining four coins in the cashbox column without marking them as spent' reads as a total of four beside a cashbox of ten" },
  { id: "stored-lemonade-t11", story: "play-lemonade", turn: 11, slot: "player1", hand: "partial", note: "The ending: 'the four coins still there' and 'your recorded 30% profit margin' match the stats, but a season and a fair are told with no sales, none stated" },
  { id: "run-lemonade-t3-variant-s2", output: "a4c75115c9d3fa758d12", slot: "player1", hand: "partial", note: "The variant: the fruit's five paid; 'You mark each cup sold and each coin received' with no amount and no change, the overlooked cost kept as an estimate" },
];

export type MoneyAgreement = {
  check: typeof MONEY_CHECK;
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
export function scoreMoneyCalibration(items: { id: string; hand: HandVerdict }[], judged: { itemId: string; samples: (boolean | undefined)[] }[]): MoneyAgreement {
  const byItem = new Map(judged.map((j) => [j.itemId, j]));
  const a: MoneyAgreement = { check: MONEY_CHECK, decided: 0, agree: 0, falseFails: 0, falsePasses: 0, handPasses: 0, handFails: 0, pairs: 0, pairsAgree: 0, partial: { yes: 0, no: 0 }, reliable: false };
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

// ---------------------------------------------------------------- the report

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

function calibrationReading(a: MoneyAgreement): string {
  if (a.reliable) return "reliable";
  const few = [a.handPasses < 3 ? "yes" : "", a.handFails < 3 ? "no" : ""].filter(Boolean);
  return few.length ? `not reliable (too few hand ${few.join(" and ")})` : "not reliable";
}

/** One reply of the stage's arms as the report lists it: its stat changes as the game applied them, and the judge's verdict. */
export type MoneyReplyRow = { armKey: string; caseId: string; sample: number; outputId: string; changes: string[]; verdict?: boolean; evidence?: string };

export type MoneyReport = {
  calibration: MoneyAgreement;
  items: MoneyCalibrationItem[];
  judged: { itemId: string; samples: (boolean | undefined)[]; evidence: { evidence?: string; lines: string[] }[] }[];
  readings: StageArmReading[];
  rows: MoneyReplyRow[];
};

/** judged-money.md: the calibration, each arm's rate and the variant against production, the items, and every reply with its changes. */
export function renderMoneyJudge(input: { report: MoneyReport; spentUsd: number; generatedAt: Date; problems: string[] }): string {
  const { report } = input;
  const c = report.calibration;
  const lines = [
    "# Judged check: money and counts that add up in a learning story",
    "",
    `Generated ${input.generatedAt.toISOString()} from prep-calls.jsonl (moneyAddsUpJudge.ts, prompt v${MONEY_JUDGE_PROMPT_VERSION}). One Luna low call per player's turn: every amount of a counted stat the text pays or earns in the stat changes, every change of a counted or worked-out stat shown in the text (the chosen lever's payment aside), every stated total the stat's value after. A check is reliable when sample 1 agrees on at least 85% of the hand yes and of the hand no, each side holding at least 3, and two samples agree on at least 90%. A candidate reads against its reference on the (case, sample) pairs both have, with the reference's sample-1-against-sample-2 difference as the noise and the stop rule on top. Spent on these judge calls: $${input.spentUsd.toFixed(4)}.`,
    "",
    `## ${MONEY_CHECK}`,
    "",
    "| Agree (sample 1) | Hand yes / no | Judged no where the hand says yes | Judged yes where the hand says no | Samples agree | On partial items (yes / no) | Reading |",
    "|---|---|---|---|---|---|---|",
    `| ${c.agree} of ${c.decided} (${pct(c.agree, c.decided)}) | ${c.handPasses} / ${c.handFails} | ${c.falseFails} | ${c.falsePasses} | ${c.pairs ? `${c.pairsAgree} of ${c.pairs}` : "–"} | ${c.partial.yes} / ${c.partial.no} | ${calibrationReading(c)} |`,
    "",
    "| Arm | Passing | Against | Arm on the shared pairs | Reference on them | Noise | Reading |",
    "|---|---|---|---|---|---|---|",
    ...report.readings.map((r) =>
      r.vsReference && r.referenceKey
        ? `| ${r.armKey} | ${tallyText(r.plans)} | ${r.referenceKey} | ${tallyText(r.vsReference.arm)} | ${tallyText(r.vsReference.reference)} | ${r.vsReference.noise === undefined ? "–" : `${Math.round(100 * r.vsReference.noise)} pts`} | ${readingText(r.vsReference)} |`
        : `| ${r.armKey} | ${tallyText(r.plans)} | – | – | – | – | – |`
    ),
    "",
    "| Item | Player | Hand | Judged (samples) | Hand reading |",
    "|---|---|---|---|---|",
    ...report.items.map((item) => {
      const judged = report.judged.find((j) => j.itemId === item.id);
      return `| ${item.id} | ${item.slot} | ${verdictText(item.hand)} | ${judged?.samples.map(verdictText).join("/") || "–"} | ${item.note} |`;
    }),
  ];
  const disagreements = report.items.flatMap((item) => {
    const judged = report.judged.find((j) => j.itemId === item.id);
    const first = judged?.samples[0];
    if (item.hand === "partial" || first === undefined || first === item.hand) return [];
    const said = judged?.evidence[0];
    return [`- ${item.id}: hand ${verdictText(item.hand)}, judged ${verdictText(first)}. ${(said?.lines ?? []).join("; ")}. Evidence: ${(said?.evidence ?? "").replace(/\s+/g, " ").trim()}`];
  });
  if (disagreements.length) lines.push("", "Where sample 1 disagrees with the hand:", "", ...disagreements);
  if (report.rows.length) {
    lines.push(
      "",
      "## The stage's replies",
      "",
      "Each reply as the game keeps it: its stat changes (before -> after, as the game applies them) and the judge's verdict.",
      "",
      "| Case | Arm | Sample | Output | Stat changes | Judged | Evidence |",
      "|---|---|---|---|---|---|---|",
      ...report.rows.map((r) => `| ${r.caseId} | ${r.armKey} | ${r.sample} | ${r.outputId} | ${r.changes.join("; ") || "none"} | ${verdictText(r.verdict)} | ${(r.evidence ?? "").replace(/\s+/g, " ").replace(/\|/g, "/").trim()} |`)
    );
  }
  if (input.problems.length) lines.push("", "## Problems", "", ...input.problems.map((p) => `- ${p}`));
  return `${lines.join("\n")}\n`;
}

/** A reply's changes to number and percentage stats, as the game applies them: "Stand Cashbox 10 -> 5". */
export function appliedChanges(story: Story, reply: SetOfBeatGenerationSchema): string[] {
  const after = storyAfter(story, reply);
  if (!after) return ["(could not be applied)"];
  const state = story.getState();
  const rows: string[] = [];
  for (const slot of story.getPlayerSlots()) {
    for (const stat of (state.playerStats ?? []).filter((s) => COUNTABLE.has(s.type))) {
      const [before, then] = [valueIn(story, stat, slot, false), valueIn(after, stat, slot, false)];
      if (before !== then) rows.push(`${stat.name}${story.isMultiplayer() ? ` (${slot})` : ""} ${valueText(before)} -> ${valueText(then)}`);
    }
  }
  for (const stat of (state.sharedStats ?? []).filter((s) => COUNTABLE.has(s.type))) {
    const [before, then] = [valueIn(story, stat, "player1", true), valueIn(after, stat, "player1", true)];
    if (before !== then) rows.push(`${stat.name} ${valueText(before)} -> ${valueText(then)}`);
  }
  return rows;
}
