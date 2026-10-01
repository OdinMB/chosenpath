import { z } from "zod";
import type { Story } from "core/models/Story.js";
import type { PlayerSlot, SetOfBeatGenerationSchema } from "core/types/index.js";
import type { TextRequest } from "../../game/services/storyTextSteps.js";
import { isLatePart } from "../../game/services/storyTextRounds/latePacing.js";
import type { Arm, Stage } from "./arms.js";
import { isReliable, type HandVerdict } from "./judgedChecks.js";
import { factLines, paragraphsOf } from "./outcomeSettledJudge.js";
import { prepJob } from "./prepCalls.js";
import type { Job } from "./runner.js";

/*
 * The late-pacing stage's judged checks on planted details (2026-10-01, fix 8
 * of the second playthroughs' review). Every turn after the first is asked to
 * "Plan a hint about a detail in the world that makes the player curious
 * without spelling out what's going on", and nothing asks a later turn or the
 * ending to pay one off: the second round's stories each carried six to ten
 * small mysteries (a pencil mark, a chime no one rang, punched marks, pencil
 * ticks on a map) that the ending never explained. Two checks, one cheap
 * GPT-6 call per player's turn, phrased so yes passes:
 * - noNewMystery, on a turn in the story's late part (past two thirds of its
 *   turns, not the ending): does the turn plant no new unexplained detail the
 *   story didn't have before, in its text, its interludes or the facts it
 *   records?
 * - detailsExplained, on the ending: does it explain at least one of the
 *   unexplained details the story planted, where it holds any?
 * The judge reads the facts the story recorded before the turn (every story
 * element's and the world's), the player's earlier interludes (where most
 * hints first appear), and the turn's text, interludes and recorded facts;
 * never the prompt, so production's turn and the variant read alike.
 * Calibrated on hand-read stored turns before any judge call (CLUES_CALIBRATION),
 * each check apart, to the judged checks' standard (isReliable).
 */

export const NEW_MYSTERY_CHECK = "noNewMystery" as const;
export const EXPLAINED_CHECK = "detailsExplained" as const;
export type ClueCheck = typeof NEW_MYSTERY_CHECK | typeof EXPLAINED_CHECK;

/** Part of each judge call's key: a wording change is judged afresh. */
export const CLUES_JUDGE_PROMPT_VERSION = 1;

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asString = (value: unknown): string => (typeof value === "string" ? value : "");

const WHAT_A_MYSTERY_IS = `A planted mystery is a small detail the story presents as unexplained, inviting the player to wonder about it: a mark or sign no one can account for, an odd sound or light, a strange or missing object, a behavior no one explains, a hint of a secret, a rumor. These are not mysteries: ordinary scene detail (weather, light, a sound with an obvious cause, a character's habit or mood); a question the chapter itself puts to the player (a choice, a dilemma, a test or trial still running); a matter the story already tracks as pending (an inquiry not yet answered, a reading not yet verified, a decision not yet made).`;

const INTRO_NEW = `YOUR JOB: CHECK ONE PLAYER'S TURN OF A STORY GAME FOR NEW MYSTERIES

This turn is in the late part of a story game, where the story should be closing what it has opened. It may bring back a detail it planted earlier, or explain one; it should not plant a new one.

${WHAT_A_MYSTERY_IS}

Read the facts the story recorded before this turn and the player's earlier interludes: a detail they already hold is not new, even when this turn adds to it. Then read the turn: its text, its interludes, and the facts it records. List every mystery-like detail the turn presents, say whether the story already had it or it is new, and whether this turn explains it; then answer the question.

An example from another story: the story recorded "A bell in the tower rings at noon, though its rope was cut years ago." A late turn whose text has the bell ring again passes; one that explains the bell (a pigeon nests in it) passes too. A late turn whose interlude adds "A trail of salt runs along the windowsill, though no one has been to the sea" fails: a new mystery, unexplained.`;

const QUESTION_NEW = `${NEW_MYSTERY_CHECK}: Does the turn plant no new mystery? Answer no if its text, an interlude or a fact it records presents an unexplained detail the story did not have before (not in the facts or the earlier interludes) and this turn does not explain it. Answer yes otherwise.`;

const INTRO_EXPLAINED = `YOUR JOB: CHECK THE ENDING OF A STORY GAME FOR THE MYSTERIES IT LEFT

Over a story, turns plant small unexplained details, and many come back turn after turn. A good ending explains at least one of them in the story's own terms (says what it is or was); an ending that explains none leaves the player with clues the story forgot.

${WHAT_A_MYSTERY_IS} A question about one of the story's outcomes (who wins, what is decided) is not one either.

Read the facts the story recorded and the player's earlier interludes, and list the unexplained details they hold (each once, at most twelve, the ones the story brought back most first). Then read the ending and say, for each, whether it explains it: what it is or was, who made it, why it happens. Mentioning it again, or saying it remains unexplained, is not explaining it. Then answer the question.

An example from another story: the facts hold "A bell in the tower rings at noon, though its rope was cut years ago" and "Salt appears on the windowsill each morning". An ending in which the keeper admits she rings the bell with a long pole passes, even if the salt stays a mystery. An ending that says "the bell still rings at noon, and no one knows why" fails.`;

const QUESTION_EXPLAINED = `${EXPLAINED_CHECK}: Does the ending explain at least one of the story's unexplained details? Answer no if the facts and earlier interludes hold such details and the ending explains none of them. Answer yes otherwise, including when the story holds none.`;

const YES_NO = ["yes", "no"] as const;

function verdictField(check: ClueCheck) {
  return z.object({
    evidence: z.string().describe("The words that decide the answer, quoted, or what is missing; one or two sentences."),
    answer: z.enum(YES_NO).describe(`The answer to the question ${check} above`),
  });
}

export function newMysterySchema() {
  return z.object({
    details: z
      .array(
        z.object({
          quote: z.string().describe("The words that present the detail, quoted from the turn."),
          detail: z.string().describe("The detail, in a few words."),
          already: z.enum(["earlier", "new"]).describe("Whether the facts or earlier interludes already hold it (earlier) or not (new)."),
          explained: z.enum(YES_NO).describe("Whether this turn explains it."),
        })
      )
      .max(10)
      .describe("Every mystery-like detail the turn's text, interludes or recorded facts present; empty when none."),
    [NEW_MYSTERY_CHECK]: verdictField(NEW_MYSTERY_CHECK),
  });
}

export function explainedSchema() {
  return z.object({
    details: z
      .array(
        z.object({
          detail: z.string().describe("The unexplained detail, in a few words."),
          source: z.string().describe("Where the story holds it: facts, interludes, or both."),
          explained: z.enum(YES_NO).describe("Whether the ending explains it."),
          how: z.string().describe("The ending's words that explain it, quoted; empty when it doesn't."),
        })
      )
      .max(12)
      .describe("The unexplained details the facts and earlier interludes hold, each once; empty when none."),
    [EXPLAINED_CHECK]: verdictField(EXPLAINED_CHECK),
  });
}

/** Every fact the story has recorded so far: each story element's, then the world's. */
export function storyFactLines(story: Story): string[] {
  const state = story.getState();
  return [
    ...(state.storyElements ?? []).flatMap((e) => (e.facts ?? []).filter(Boolean).map((fact) => `- (${e.name || e.id}) ${fact}`)),
    ...(state.worldFacts ?? []).filter(Boolean).map((fact) => `- (world) ${fact}`),
  ];
}

/** The player's interludes on every earlier turn, oldest first. */
export function earlierInterludes(story: Story, slot: PlayerSlot): string[] {
  return (story.getPlayer(slot)?.beatHistory ?? [])
    .flatMap((beat) => asArray(asObject(beat).interludes))
    .map((i) => asString(asObject(i).text).trim())
    .filter(Boolean)
    .map((text) => `- ${text}`);
}

function interludeLines(reply: SetOfBeatGenerationSchema, slot: string): string[] {
  return asArray(asObject(asObject(reply)[slot]).interludes)
    .map((i) => asString(asObject(i).text).trim())
    .filter(Boolean)
    .map((text) => `- ${text}`);
}

function slotRequest(story: Story, reply: SetOfBeatGenerationSchema, slot: PlayerSlot, check: ClueCheck): TextRequest {
  const name = story.getPlayer(slot)?.name ?? slot;
  const facts = storyFactLines(story);
  const earlier = earlierInterludes(story, slot);
  const recorded = factLines(story, reply);
  const interludes = interludeLines(reply, slot);
  const text = [`${name}'s text (${slot}):`, ...paragraphsOf(reply, slot).map((p, i) => `[${i + 1}] ${p}`)].join("\n");
  const ending = check === EXPLAINED_CHECK;
  const sections = [
    ending ? INTRO_EXPLAINED : INTRO_NEW,
    ["======= THE STORY =======", `Title: ${story.getTitle()}`, `The player's character: ${name}`].join("\n"),
    ["======= FACTS THE STORY RECORDED BEFORE THIS TURN =======", ...(facts.length ? facts : ["none"])].join("\n"),
    [`======= ${name.toUpperCase()}'S EARLIER INTERLUDES (shown between turns, oldest first) =======`, ...(earlier.length ? earlier : ["none"])].join("\n"),
    [ending ? "======= THE ENDING, AS THE PLAYER READS IT =======" : "======= THE TURN, AS THE PLAYER READS IT =======", text].join("\n"),
    ["======= ITS INTERLUDES =======", ...(interludes.length ? interludes : ["none"])].join("\n"),
    ["======= FACTS THIS TURN RECORDS =======", ...(recorded.length ? recorded : ["none"])].join("\n"),
    ["======= QUESTION =======", ending ? QUESTION_EXPLAINED : QUESTION_NEW].join("\n"),
  ];
  return { prompt: sections.join("\n\n"), schema: ending ? explainedSchema() : newMysterySchema() };
}

/**
 * The judge's requests for one reply (as the game keeps it, after the beat
 * repairs) on its turn's story: at the ending, detailsExplained per player; on
 * a turn in the story's late part, noNewMystery per player; none earlier.
 */
export function cluesJudgeRequests(story: Story, reply: SetOfBeatGenerationSchema): { slot: PlayerSlot; check: ClueCheck; request: TextRequest }[] {
  if (story.isFirstBeat()) return [];
  const check: ClueCheck | undefined = story.getCurrentBeatType() === "ending" ? EXPLAINED_CHECK : isLatePart(story) ? NEW_MYSTERY_CHECK : undefined;
  if (!check) return [];
  return story
    .getPlayerSlots()
    .filter((slot) => paragraphsOf(reply, slot).length > 0)
    .map((slot) => ({ slot, check, request: slotRequest(story, reply, slot, check) }));
}

/** The verdict: true when the judge answered yes, undefined where it answered neither. */
export function cluesVerdictFrom(parsed: unknown, check: ClueCheck): boolean | undefined {
  const answer = asObject(asObject(parsed)[check]).answer;
  return answer === "yes" ? true : answer === "no" ? false : undefined;
}

/** The judge's evidence and the details it listed. */
export function cluesEvidenceFrom(parsed: unknown, check: ClueCheck): { evidence?: string; lines: string[] } {
  const reply = asObject(parsed);
  const evidence = asString(asObject(reply[check]).evidence);
  const lines = asArray(reply.details)
    .map(asObject)
    .map((d) =>
      check === NEW_MYSTERY_CHECK
        ? `${asString(d.already)}: ${asString(d.detail)} ("${asString(d.quote)}"), explained ${asString(d.explained)}`
        : `${asString(d.detail)} (${asString(d.source)}): explained ${asString(d.explained)}${asString(d.how) ? ` ("${asString(d.how)}")` : ""}`
    );
  return { ...(evidence ? { evidence } : {}), lines };
}

export const cluesJudgeCaseId = (key: string, check: ClueCheck, version = CLUES_JUDGE_PROMPT_VERSION) => `judge-clues-${check === NEW_MYSTERY_CHECK ? "new" : "explained"}-v${version}-${key}`;

/** Luna low lists a turn's details and answers: about 500-1,000 tokens, reasoning included; an ending's list is longer */
const OUTPUT_TOKENS: Record<ClueCheck, number> = { [NEW_MYSTERY_CHECK]: 900, [EXPLAINED_CHECK]: 1200 };

export type CluesTarget = { key: string; check: ClueCheck; request: TextRequest; samples: number };

/** The judge calls: each target at its number of samples (the calibration's two, the rest one). */
export function cluesJudgeJobs(targets: CluesTarget[], arm: Arm, promptState: string, stage: Stage): Job[] {
  return targets.flatMap((target) =>
    Array.from({ length: target.samples }, (_, i) =>
      prepJob({
        kind: "judge",
        stage,
        promptState,
        caseId: cluesJudgeCaseId(target.key, target.check),
        sample: i + 1,
        arm,
        role: "beat",
        players: 1,
        build: () => target.request,
        outputTokens: OUTPUT_TOKENS[target.check],
      })
    )
  );
}

// ---------------------------------------------------------------- calibration

/**
 * A hand-read player's turn of the second round's stored playthroughs
 * (replayed), with the check it reads and the player. A constructed version
 * is a stored turn with edits on its reply: each passage, which must occur,
 * replaced wherever it occurs (withEdits).
 */
export type CluesCalibrationItem = { id: string; check: ClueCheck; story: string; turn: number; slot: PlayerSlot; hand: HandVerdict; note: string; edits?: [string, string][] };

const LEMONADE_EXPLAINED: [string, string][] = [
  [
    "Beyond the cart, Eli’s fruit crate and your lemonade sign stand side by side in the fair’s last warm light.",
    "Beyond the cart, Eli’s fruit crate and your lemonade sign stand side by side in the fair’s last warm light. As she leaves, Mara taps the fair notice: the thin blue line under its date was hers, the way she marks every deadline she means to help with, and the paper sailboat by the fountain was hers too, folded from an old budget page for whoever finished their figures first.",
  ],
];
const AVALON_EXPLAINED: [string, string][] = [
  [
    "Orin’s small pencil bracket marks the old wording, not an answer for the unexplained punched marks beside it.",
    "Orin’s small pencil bracket marks the old wording, and beside it Orin reads the punched marks aloud at last: each pattern is the old keepers’ tally of a district that signed the amendment, one hole for each household that agreed.",
  ],
];
const TRUCKS_EXPLAINED: [string, string][] = [
  [
    "The technician’s check has not supplied that verification, but you have not blurred the distinction to keep the demonstration moving.",
    "The technician’s check has not supplied that verification, but you have not blurred the distinction to keep the demonstration moving. As you pack up, the technician reads the cramped pencil note on the inspection tag at last: the last inspector’s reminder to recheck the door seal, the very fault that makes the indicator flicker.",
  ],
];
const ESTATE_EXPLAINED: [string, string][] = [
  [
    "Vesper House waits with its warm windows, its unexplained corridor mark, and a future no agent has secured.",
    "Vesper House waits with its warm windows and a future no agent has secured; the survey letter on Imogen’s desk has explained its corridor mark at last: an old linen chute, bricked up when the house was last repaired.",
  ],
];
const MOUSE_EXPLAINED: [string, string][] = [
  [
    "whatever is beyond the blockage is sending a signal, even if you cannot yet tell what it means.",
    "the tapping is the old water pipe behind the wall, knocking twice each time the cook turns the kitchen tap; and the crescent on the sill is only the print of the cook’s thimble.",
  ],
];

/**
 * Players' turns of the second round's stored stories read by hand before any
 * judge call (2026-10-01). noNewMystery on turns in the late part: no where
 * the text, an interlude or a recorded fact plants a detail the story didn't
 * have (a chime no one rang, punched marks, a worn strip of quay, an erased
 * mark, pencil ticks, a hollow knock), yes where it only brings back
 * earlier ones, partial where a reader could go either way (left out of
 * agreement). detailsExplained on the endings: every stored ending explains
 * none (no); constructed versions of five of them, each with one sentence
 * explaining a detail the story kept bringing back (yes).
 */
export const CLUES_CALIBRATION: CluesCalibrationItem[] = [
  // --- noNewMystery, hand yes: earlier details brought back, nothing new ---
  { id: "late-lemonade-t8", check: NEW_MYSTERY_CHECK, story: "play-lemonade", turn: 8, slot: "player1", hand: true, note: "The unexplained pencil line under the fair's date again (planted at turn 6); nothing new" },
  { id: "late-lemonade-t9", check: NEW_MYSTERY_CHECK, story: "play-lemonade", turn: 9, slot: "player1", hand: true, note: "The pencil mark below the date again; the budget review; nothing new" },
  { id: "late-avalon-t18", check: NEW_MYSTERY_CHECK, story: "play-avalon", turn: 18, slot: "player1", hand: true, note: "The paired load marks missing from the public diagrams again (turn 17); the beads shiver; nothing new" },
  { id: "late-avalon-t22", check: NEW_MYSTERY_CHECK, story: "play-avalon", turn: 22, slot: "player1", hand: true, note: "The tram signal's long silence and the brass chime no one rang, both earlier; the hearing; nothing new" },
  { id: "late-avalon-t24", check: NEW_MYSTERY_CHECK, story: "play-avalon", turn: 24, slot: "player1", hand: true, note: "The tram chime and its silence again; the folios and amendments are records, not puzzles" },
  { id: "late-food-trucks-t18-p2", check: NEW_MYSTERY_CHECK, story: "play-food-trucks", turn: 18, slot: "player2", hand: true, note: "Jo's service through the gusts; the queue bends around a mooring post; nothing new" },
  { id: "late-food-trucks-t22-p2", check: NEW_MYSTERY_CHECK, story: "play-food-trucks", turn: 22, slot: "player2", hand: true, note: "The delay rule; the erased-and-rewritten mark from turn 21 again; a cart gliding on the slick stones is the district's physics" },
  { id: "late-food-trucks-t24-p1", check: NEW_MYSTERY_CHECK, story: "play-food-trucks", turn: 24, slot: "player1", hand: true, note: "The cabinet's flicker (the chapter's question) and the tag's cramped note, both earlier; nothing new" },
  {
    id: "late-food-trucks-t23-p2",
    check: NEW_MYSTERY_CHECK,
    story: "play-food-trucks",
    turn: 23,
    slot: "player2",
    hand: true,
    note: "The Tilt Market board's notches again, a fact since turn 14 (first read as new, corrected on a second reading before any judge call); the cabinet's flicker earlier; nothing new",
  },
  { id: "late-estate-agents-t17-p1", check: NEW_MYSTERY_CHECK, story: "play-estate-agents", turn: 17, slot: "player1", hand: true, note: "The office review of the ledger note; the radiator's click is scene detail; nothing new" },
  { id: "late-estate-agents-t21-p1", check: NEW_MYSTERY_CHECK, story: "play-estate-agents", turn: 21, slot: "player1", hand: true, note: "The map's pencil ticks again (turn 20), left unexplained; nothing new" },
  { id: "late-estate-agents-t23-p2", check: NEW_MYSTERY_CHECK, story: "play-estate-agents", turn: 23, slot: "player2", hand: true, note: "The offer terms; the corridor mark and the pending plan inquiry, both earlier; nothing new" },
  { id: "late-estate-agents-t25-p2", check: NEW_MYSTERY_CHECK, story: "play-estate-agents", turn: 25, slot: "player2", hand: true, note: "Mara's three headings; the unsigned rota; nothing new" },
  { id: "late-kids-mouse-t10", check: NEW_MYSTERY_CHECK, story: "play-kids-mouse", turn: 10, slot: "player1", hand: true, note: "The paired tapping beyond the crack again, its pause; the paper lifting with a knock adds to it; nothing new" },
  // --- noNewMystery, hand no: a new detail planted late ---
  { id: "late-avalon-t21", check: NEW_MYSTERY_CHECK, story: "play-avalon", turn: 21, slot: "player1", hand: false, note: "New: 'a little brass chime answers from beside the agenda, though nobody is near it', recorded as a fact" },
  { id: "late-avalon-t25", check: NEW_MYSTERY_CHECK, story: "play-avalon", turn: 25, slot: "player1", hand: false, note: "New: 'tiny punched marks beside several amendments', 'The record doesn't tell us what these mean', recorded as a fact" },
  { id: "late-food-trucks-t17-p1", check: NEW_MYSTERY_CHECK, story: "play-food-trucks", turn: 17, slot: "player1", hand: false, note: "New: a band of darker paving with unusually worn chalk, 'as though many wheels have tested that patch before', an interlude and a fact" },
  { id: "late-food-trucks-t21-p2", check: NEW_MYSTERY_CHECK, story: "play-food-trucks", turn: 21, slot: "player2", hand: false, note: "New: 'a smudged mark that has been erased and rewritten' beside the rota's stop time, recorded as a fact" },
  { id: "late-estate-agents-t20-p1", check: NEW_MYSTERY_CHECK, story: "play-estate-agents", turn: 20, slot: "player1", hand: false, note: "New: 'a few faint pencil ticks sit at the edge of the paper ... with no label to explain them'" },
  { id: "late-estate-agents-t20-p2", check: NEW_MYSTERY_CHECK, story: "play-estate-agents", turn: 20, slot: "player2", hand: false, note: "New: 'a handful of faint pencil ticks sit apart from the dotted line. The resident doesn't explain them', recorded as a fact" },
  { id: "late-kids-mouse-t8", check: NEW_MYSTERY_CHECK, story: "play-kids-mouse", turn: 8, slot: "player1", hand: false, note: "New: the sill's 'small hollow knock' beside the crescent mark (a fact), and paw-print marks on Mira's watch list (an interlude)" },
  // --- noNewMystery, partial ---
  { id: "late-lemonade-t7", check: NEW_MYSTERY_CHECK, story: "play-lemonade", turn: 7, slot: "player1", hand: "partial", note: "The pencil stroke again, with a fleck of graphite; an interlude's 'the fair map leaves a blank patch beside the fountain' could read as a new hook" },
  { id: "late-avalon-t19", check: NEW_MYSTERY_CHECK, story: "play-avalon", turn: 19, slot: "player1", hand: "partial", note: "'A faint old junction mark sits near the edge of the route', a variant of the paired marks or a new one" },
  { id: "late-food-trucks-t19-p2", check: NEW_MYSTERY_CHECK, story: "play-food-trucks", turn: 19, slot: "player2", hand: "partial", note: "An interlude's tide chart 'with several times crossed out and written again': atmosphere or a hook" },
  { id: "late-estate-agents-t22-p1", check: NEW_MYSTERY_CHECK, story: "play-estate-agents", turn: 22, slot: "player1", hand: "partial", note: "An interlude's radiator that 'clicks twice whenever the office clock reaches the quarter hour': atmosphere or a hook" },
  // --- detailsExplained, hand no: the stored endings explain none ---
  { id: "ending-lemonade", check: EXPLAINED_CHECK, story: "play-lemonade", turn: 11, slot: "player1", hand: false, note: "Neither the paper sailboat's blue pencil mark nor the pencil line under the fair's date is explained or mentioned" },
  { id: "ending-avalon", check: EXPLAINED_CHECK, story: "play-avalon", turn: 26, slot: "player1", hand: false, note: "'not an answer for the unexplained punched marks'; the chime, the tram's silence and the paired marks unexplained" },
  { id: "ending-food-trucks-p1", check: EXPLAINED_CHECK, story: "play-food-trucks", turn: 26, slot: "player1", hand: false, note: "The tag's pencil note, the worn strip and the mark by the judges' time column unexplained" },
  { id: "ending-estate-agents-p1", check: EXPLAINED_CHECK, story: "play-estate-agents", turn: 26, slot: "player1", hand: false, note: "'its unexplained corridor mark'; the pencil ticks unexplained" },
  { id: "ending-estate-agents-p2", check: EXPLAINED_CHECK, story: "play-estate-agents", turn: 26, slot: "player2", hand: false, note: "The plan mark 'unexplained pending survey'; the pencil ticks unexplained" },
  { id: "ending-kids-mouse", check: EXPLAINED_CHECK, story: "play-kids-mouse", turn: 11, slot: "player1", hand: false, note: "The tapping identified as a signal, 'even if you cannot yet tell what it means'; the crescent mark and the hollow knock unexplained" },
  // --- detailsExplained, hand yes: constructed, one detail explained ---
  { id: "ending-lemonade-explained", check: EXPLAINED_CHECK, story: "play-lemonade", turn: 11, slot: "player1", hand: true, edits: LEMONADE_EXPLAINED, note: "Constructed: Mara says the pencil line under the date and the paper sailboat were hers" },
  { id: "ending-avalon-explained", check: EXPLAINED_CHECK, story: "play-avalon", turn: 26, slot: "player1", hand: true, edits: AVALON_EXPLAINED, note: "Constructed: Orin reads the punched marks as the keepers' tally of the households that agreed" },
  { id: "ending-food-trucks-p1-explained", check: EXPLAINED_CHECK, story: "play-food-trucks", turn: 26, slot: "player1", hand: true, edits: TRUCKS_EXPLAINED, note: "Constructed: the tag's pencil note read, a reminder to recheck the door seal" },
  { id: "ending-estate-agents-p1-explained", check: EXPLAINED_CHECK, story: "play-estate-agents", turn: 26, slot: "player1", hand: true, edits: ESTATE_EXPLAINED, note: "Constructed: the survey explains the corridor mark as a bricked-up linen chute" },
  { id: "ending-kids-mouse-explained", check: EXPLAINED_CHECK, story: "play-kids-mouse", turn: 11, slot: "player1", hand: true, edits: MOUSE_EXPLAINED, note: "Constructed: the tapping is the water pipe, the crescent the cook's thimble" },
];

export type CluesAgreement = {
  check: ClueCheck;
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

/** Agreement with the hand verdicts (sample 1), the samples' agreement and the partial items' answers, per check. */
export function scoreCluesCalibration(items: { id: string; check: ClueCheck; hand: HandVerdict }[], judged: { itemId: string; samples: (boolean | undefined)[] }[]): CluesAgreement[] {
  const byItem = new Map(judged.map((j) => [j.itemId, j]));
  return [NEW_MYSTERY_CHECK, EXPLAINED_CHECK].map((check) => {
    const a: CluesAgreement = { check, decided: 0, agree: 0, falseFails: 0, falsePasses: 0, handPasses: 0, handFails: 0, pairs: 0, pairsAgree: 0, partial: { yes: 0, no: 0 }, reliable: false };
    for (const item of items.filter((i) => i.check === check)) {
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
  });
}
