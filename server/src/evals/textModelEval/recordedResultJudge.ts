import { z } from "zod";
import type { Story } from "core/models/Story.js";
import type { PlayerSlot, SetOfBeatGenerationSchema, Thread } from "core/types/index.js";
import type { TextRequest } from "../../game/services/storyTextSteps.js";
import { recordedExplorationThreads } from "../../game/services/storyTextRounds/recordedResult.js";
import type { Arm, Stage } from "./arms.js";
import { isReliable, type HandVerdict } from "./judgedChecks.js";
import { factLines, paragraphsOf } from "./outcomeSettledJudge.js";
import { prepJob } from "./prepCalls.js";
import type { Job } from "./runner.js";
import type { StageArmReading, StageComparison } from "./stageJudge.js";

/*
 * The recorded-result stage's judged check (2026-09-30, fix 2 of the second
 * playthroughs' review). One cheap GPT-6 call per player in an exploration
 * thread whose recorded result the turn narrates (a chapter step after an
 * exploration step, a switch turn or ending after an exploration chapter)
 * asks recordedResultTold: the player's text shows the player doing the result
 * the game recorded (their choice, a change of course from an earlier step
 * included), and nothing in the text, the chapter's milestone or the facts the
 * turn records tells another of the step's results or blends two. Phrased so
 * yes passes. The judge reads the step (its question, its three results with
 * the recorded one marked, the option the player picked), the earlier steps'
 * recorded results, the milestone the turn adds on the thread's outcome, the
 * facts the turn records and the player's text as they read it; never the
 * prompt, so production's turn and the variant read alike. It says which
 * result the text, the milestone and any fact tells, then answers. Calibrated
 * on hand-read turns before any judge call (RECORDED_CALIBRATION), to the
 * judged checks' standard (isReliable).
 */

export const RECORDED_CHECK = "recordedResultTold" as const;

/** Part of each judge call's key: a wording change is judged afresh. */
export const RECORDED_JUDGE_PROMPT_VERSION = 1;

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asString = (value: unknown): string => (typeof value === "string" ? value : "");

const INTRO = `YOUR JOB: CHECK ONE PLAYER'S TURN IN A STORY GAME, THE TURN RIGHT AFTER THEY MADE A CHOICE

In this game a chapter is played in steps. At an exploration step the player picks one of three options, and each option is one of the step's three possible results, in order: option 1 is result 1, option 2 result 2, option 3 result 3. The game records the picked result as what the player did, and the next turn, this one, tells it. When the chapter ends, the turn also writes the chapter's milestone, which records the result of its last step for good. The turn also records facts the game keeps for every later turn.

The game's rules for this turn:
- The player's text shows the player doing the recorded result, or having done it: their choice, as the option they picked says it. Where an earlier step's result, the earlier text or a recorded fact pointed another way, the player has now changed course, and the text tells the change.
- Nothing in the text, the milestone or the facts the turn records tells another of the step's results as what the player did or does, or blends the recorded result with another one.
- The text may go on to what follows from the choice; it need not repeat the option's words.

Read the turn as a careful editor. Say which of the step's results the text tells as what the player did, and quote the words that show it; say the same of the milestone, if the turn writes one; list every recorded fact that tells another result or a blend; then answer the question. Judge by what the words say the player does or has decided, not by their mood.

An example from another story: at step 2 Mara picked "share the recipe with Jonah" (result 2 of: keep the card locked in her tin; share the recipe with Jonah; enter it under her own name), after she had locked the card in her tin at step 1. A text where "Mara slides the card across the counter to Jonah" tells result 2: yes. A text where "Mara keeps the card in her tin and tells Jonah she will share it once the contest is over" keeps the earlier course while it claims the new one, a blend: no. A milestone "Mara promises Jonah the recipe but keeps the card locked away" is a blend too: no. A fact "The card stays in Mara's tin" tells result 1: no.

How to decide: the text tells the recorded result when it shows the player doing what that result says, or having done it, even briefly. It tells another result when what the player does or has decided is what another result says, often the course an earlier step set, carried on; and a blend when it claims the recorded result but keeps another result's substance (a condition, a refusal, a delay the recorded result doesn't have). The milestone and the facts are read the same way. A text that never tells the recorded result fails.`;

const QUESTION = `${RECORDED_CHECK}: Does the turn tell the player's choice as the result the game recorded: the text shows the player doing it (a change of course from an earlier step included), and nothing in the text, the milestone or the recorded facts tells another of the step's results or blends two? Answer no if the text tells another result or a blend, or never tells the recorded result, or if the milestone or a recorded fact tells another result or a blend. Answer yes otherwise.`;

const RESULT_TOLD = ["1", "2", "3", "a blend", "not told"] as const;
const MILESTONE_TOLD = ["1", "2", "3", "a blend", "no milestone"] as const;
const FACT_TOLD = ["1", "2", "3", "a blend"] as const;

export function recordedJudgeSchema() {
  return z.object({
    text: z.object({
      result: z.enum(RESULT_TOLD).describe("Which of the step's results the player's text tells as what the player did: its number, a blend of two, or not told."),
      quote: z.string().describe("The words that show it, quoted; empty when not told."),
    }),
    milestone: z.object({
      result: z.enum(MILESTONE_TOLD).describe("Which result the milestone tells: its number, a blend of two, or no milestone."),
      quote: z.string().describe("The words that show it, quoted; empty when there is no milestone."),
    }),
    facts: z
      .array(z.object({ fact: z.string().describe("The recorded fact, quoted."), result: z.enum(FACT_TOLD).describe("The result it tells, or a blend.") }))
      .max(8)
      .describe("Only the recorded facts that tell another result than the recorded one, or a blend; empty when none does."),
    [RECORDED_CHECK]: z.object({
      evidence: z.string().describe("The words that decide the answer, quoted, or what is missing; one or two sentences."),
      answer: z.enum(["yes", "no"]).describe(`The answer to the question ${RECORDED_CHECK} above`),
    }),
  });
}

const RESULT_KEYS = ["resolution1", "resolution2", "resolution3"] as const;
const numberOf = (resolution: string | null | undefined) => RESULT_KEYS.indexOf(resolution as (typeof RESULT_KEYS)[number]) + 1;

/** The option a player picked on their last beat, and its position (1 to 3); undefined where the beat holds none. */
function pickedOption(story: Story, slot: PlayerSlot): { text: string; position: number } | undefined {
  const beat = asObject(story.getCurrentBeat(slot));
  const choice = typeof beat.choice === "number" ? beat.choice : -1;
  const option = asObject(asArray(beat.options)[choice]);
  const text = asString(option.text);
  return text ? { text, position: choice + 1 } : undefined;
}

function threadRequest(story: Story, reply: SetOfBeatGenerationSchema, thread: Thread, slot: PlayerSlot): TextRequest {
  const played = thread.progression.filter((step) => step.resolution !== null);
  const last = played[played.length - 1];
  const position = thread.progression.indexOf(last) + 1;
  const recorded = numberOf(last.resolution);
  const results = asObject(last.possibleResolutions);
  const name = story.getPlayer(slot)?.name ?? slot;
  const picked = pickedOption(story, slot);
  const stepLines = [
    `Chapter: ${thread.title}`,
    `Step ${position} of ${thread.progression.length} (the step ${name} just played): ${last.question}`,
    "  Its possible results, in order:",
    ...RESULT_KEYS.map((key, i) => `  result ${i + 1}${i + 1 === recorded ? " (recorded: the player's choice)" : ""}: ${asString(results[key])}`),
    `The option ${name} picked${picked ? ` (option ${picked.position})` : ""}: ${picked?.text ?? "not stored"}`,
    ...(picked && picked.position !== recorded ? ["(Another player's pick decided this step's result; the text still tells the recorded one.)"] : []),
  ];
  const earlier = played.slice(0, -1).map((step, i) => `Step ${i + 1} recorded result ${numberOf(step.resolution)}: ${asString(asObject(step.possibleResolutions)[step.resolution ?? ""])}`);
  const writesMilestone = story.getCurrentBeatType() !== "thread";
  const milestones = asArray(asObject(reply).newMilestones)
    .map(asObject)
    .filter((m) => asString(m.outcome) === thread.outcomeId)
    .map((m) => `- ${asString(m.newMilestone)}`);
  const milestoneLines = writesMilestone ? (milestones.length ? milestones : ["none written"]) : ["none: the chapter goes on"];
  const facts = factLines(story, reply);
  const text = [`${name}'s text (${slot}):`, ...paragraphsOf(reply, slot).map((p, i) => `[${i + 1}] ${p}`)].join("\n");
  const outcome = story.getOutcomeById(thread.outcomeId);
  const sections = [
    INTRO,
    ["======= THE STORY =======", `Title: ${story.getTitle()}`, `The player's character: ${name}`, ...(outcome ? [`The chapter's outcome: ${outcome.question}`] : [])].join("\n"),
    ["======= THE STEP THE PLAYER JUST PLAYED =======", ...stepLines].join("\n"),
    ["======= EARLIER IN THIS CHAPTER =======", ...(earlier.length ? earlier : ["none: this was the chapter's first step"])].join("\n"),
    ["======= THE MILESTONE THIS TURN ADDS FOR THE CHAPTER =======", ...milestoneLines].join("\n"),
    ["======= FACTS THIS TURN RECORDS =======", ...(facts.length ? facts : ["none"])].join("\n"),
    ["======= THE TURN, AS THE PLAYER READS IT =======", text].join("\n"),
    ["======= QUESTION =======", QUESTION].join("\n"),
  ];
  return { prompt: sections.join("\n\n"), schema: recordedJudgeSchema() };
}

/**
 * The judge's requests for one reply (as the game keeps it, after the beat
 * repairs) on its turn's story: one per player in each exploration thread
 * whose recorded result the turn narrates; none on any other turn.
 */
export function recordedJudgeRequests(story: Story, reply: SetOfBeatGenerationSchema): { slot: PlayerSlot; threadId: string; request: TextRequest }[] {
  return recordedExplorationThreads(story).flatMap((thread) =>
    (thread.playersSideA as PlayerSlot[]).map((slot) => ({ slot, threadId: thread.id, request: threadRequest(story, reply, thread, slot) }))
  );
}

/** The verdict: true when the judge answered yes, undefined where it answered neither. */
export function recordedVerdictFrom(parsed: unknown): boolean | undefined {
  const answer = asObject(asObject(parsed)[RECORDED_CHECK]).answer;
  return answer === "yes" ? true : answer === "no" ? false : undefined;
}

const toldText = (value: string) => (/^[123]$/.test(value) ? `result ${value}` : value);

/** The judge's evidence and its readings: the text's result, the milestone's, each fact that tells another. */
export function recordedEvidenceFrom(parsed: unknown): { evidence?: string; lines: string[] } {
  const reply = asObject(parsed);
  const evidence = asString(asObject(reply[RECORDED_CHECK]).evidence);
  const text = asObject(reply.text);
  const milestone = asObject(reply.milestone);
  const lines = [
    ...(asString(text.result) ? [`text: ${toldText(asString(text.result))}${asString(text.quote) ? ` ("${asString(text.quote)}")` : ""}`] : []),
    ...(asString(milestone.result) ? [`milestone: ${toldText(asString(milestone.result))}${asString(milestone.quote) ? ` ("${asString(milestone.quote)}")` : ""}`] : []),
    ...asArray(reply.facts)
      .map(asObject)
      .map((f) => `fact "${asString(f.fact)}": ${toldText(asString(f.result))}`),
  ];
  return { ...(evidence ? { evidence } : {}), lines };
}

export const recordedJudgeCaseId = (key: string, version = RECORDED_JUDGE_PROMPT_VERSION) => `judge-recorded-v${version}-${key}`;

/** Luna low reads one player's turn and writes a line for the text, the milestone and a few facts: about 500-900 tokens, reasoning included */
const RECORDED_JUDGE_OUTPUT_TOKENS = 800;

export type RecordedTarget = { key: string; request: TextRequest; samples: number };

/** The judge calls: each target at its number of samples (the calibration's two, the rest one). */
export function recordedJudgeJobs(targets: RecordedTarget[], arm: Arm, promptState: string, stage: Stage): Job[] {
  return targets.flatMap((target) =>
    Array.from({ length: target.samples }, (_, i) =>
      prepJob({
        kind: "judge",
        stage,
        promptState,
        caseId: recordedJudgeCaseId(target.key),
        sample: i + 1,
        arm,
        role: "beat",
        players: 1,
        build: () => target.request,
        outputTokens: RECORDED_JUDGE_OUTPUT_TOKENS,
      })
    )
  );
}

// ---------------------------------------------------------------- calibration

/**
 * A hand-read player's turn: a stored playthrough turn (replayed), or a reply
 * of the stage's own run by its output id, with the player it reads. A
 * constructed failing version is a stored turn with edits on its reply: each
 * passage, which must occur, replaced wherever it occurs (withEdits).
 */
export type RecordedCalibrationItem = { id: string; slot: PlayerSlot; hand: HandVerdict; note: string } & ({ story: string; turn: number; edits?: [string, string][] } | { output: string });

/* The constructed failing versions: the text carrying on an earlier course, the chosen result folded back, and a milestone or a fact telling another result. */
const AVALON_T11_RECORDS: [string, string][] = [
  [
    "“I keep thinking about the people who have to live with a repair after everyone who designed it has gone home,” you say. “That bell makes me wonder who got listened to—and who didn’t. What does it bring back for you?”",
    "“Let’s keep to what the record can show,” you say. “Note the bell’s entry and the aqueduct line; whatever it brings back for either of us can stay out of this.”",
  ],
];
const KIDS_T8_WATCH: [string, string][] = [
  [
    "You hurry from the kitchen-side entrance to Mira, where she has her folded watch list open across her thimble basket. “Could you cover my place for a little while? I promised Pip I’d come back,” you ask. Mira taps one paw against a name on the list, calls a neighbor over, and sends you on with a brisk, “Go—this watch is covered.”",
    "You stay at the kitchen-side entrance with your paws on the floorboards, listening for the bell. “I’ll find Pip tomorrow,” you whisper to Mira, who keeps her folded watch list open across her thimble basket. Nobody leaves the watch, and neither do you.",
  ],
  [
    "At the pantry window, Pip is still beside the crescent-shaped mark, their scarf looped around the blue button on their vest. You settle beside them and say, “I’m sorry I left you waiting. I’m here now—and the gardenward entrance is safer than it was.” Pip’s ears lift, and together you trace the awkward route in the dust with one paw each, grinning when your paths meet at the same little turn.",
    "Across the room, Pip waits alone at the pantry window beside the crescent-shaped mark, their scarf looped around the blue button on their vest. You lift a paw to wave but stay where you are, and Pip looks down at the dusty sill.",
  ],
  [
    "“You helped make that happen,” you tell them, pointing toward the cupboard gap. Pip gives a small, pleased laugh and nudges a crumb across the sill like a grand opening gift. “Then it’s our entrance,” they say, “even if you have to turn sideways to get through.” For a moment, the promise feels settled between you, not forgotten beneath the noise of the watch.",
    "Pip nudges a crumb across the sill and waits, but you do not come. For a moment the promise hangs in the dusk, forgotten beneath the noise of the watch.",
  ],
  [
    "the small hollow knock beneath Pip’s paw makes both of you glance down. “We know the gardenward way is there,” Pip says, “but I think there’s more to learn before everyone can use it easily.”",
    "the small hollow knock beneath Pip’s paw makes Pip glance down alone.",
  ],
];
const AVALON_T16_MILESTONE: [string, string][] = [
  [
    "Jun tells Orin honestly why their paths have diverged, and they part on good terms, each following a different idea of what New Avalon should preserve.",
    "Jun opens up about their shared past, and he and Orin renew their trust as close friends and keepers of each other’s history.",
  ],
];
const FOOD_TRUCKS_T8_FACT: [string, string][] = [
  ["Jo proposes a rotating community meal built around direct small-boat catch and the truck’s available margins.", "Jo commits to keeping a permanent low-cost bowl on the regular menu, accepting thinner margins."],
];
const PIRATES_T14_ALONE: [string, string][] = [
  [
    "and you tell her, “Gather the dockhands’ watch concerns and bring them to me before our next duty assignment. Just the concerns; I’ll make the call.”",
    "and you tell her, “Leave the watch to me. I’ll settle the next duty assignment myself.”",
  ],
  [
    "Tamsin nods once. “I can do that, Captain,” she says, already turning to speak with the workers nearest the berth board. Their answers come back as short practical questions about shift coverage and who can be spared; she collects them without pretending to decide for you.",
    "Tamsin hesitates, then nods. “Your call, Captain,” she says, and turns back to the berth board without asking the workers anything.",
  ],
  ["Tamsin’s voice returns faintly over the channel with the dockhands’ first roster concerns as the wreck silhouettes drift across the sensor glass.", "Tamsin’s channel stays silent as the wreck silhouettes drift across the sensor glass."],
];
const ESTATE_T15_BLEND: [string, string][] = [
  [
    "You tap the margin note and say, “A line like ‘Tell the next family what happened here’ gives Mara a reason to imagine what this house could mean to her.” Elin’s pencil pauses above the page. “It gives her a question,” they answer, “not an answer.”",
    "You set the margin note apart from the dated records and say, “Mara hears only what the repairs and the occupancy record support; this line stays out of the pitch until we know who wrote it.” Elin nods and moves the note to a folder of its own.",
  ],
  ["Your words from the reading room return in the hush between the radiator’s clicks: the note as a compelling hook, its meaning left unexamined.", "Your words from the reading room return in the hush between the radiator’s clicks: the note kept apart, left out of the pitch."],
];

/**
 * Players' turns after an exploration step, read by hand on the check's
 * criterion before any judge call: yes when the text shows the player doing
 * the recorded result and nothing in the text, the milestone or the recorded
 * facts tells another result or a blend; no when one does; partial where a
 * reader could go either way (left out of agreement). Read on 2026-09-30: the
 * second round's stored turns where the player changed direction from the
 * step before (production's of 30 September; food trucks turn 23 the one
 * told as the other), six constructed failing versions of stored turns (the
 * text carrying on the earlier course, the choice not carried out, a blend, a
 * milestone and a fact telling another result), and four of the stage's own
 * replies (by output id), read after the run and before any judge call.
 */
export const RECORDED_CALIBRATION: RecordedCalibrationItem[] = [
  // --- Hand yes ---
  { id: "stored-lemonade-t7", story: "play-lemonade", turn: 7, slot: "player1", hand: true, note: "Theo lists the two-coin fee and the three-coin larger-menu estimate as a budget (result 1), after the step before kept the cash; none spent yet, which the result doesn't ask" },
  { id: "stored-lemonade-t8", story: "play-lemonade", turn: 8, slot: "player1", hand: true, note: "Theo and Eli sign the shared stall, one coin each (result 2), after budgeting for a larger menu; milestone and facts the same" },
  { id: "stored-lemonade-t11", story: "play-lemonade", turn: 11, slot: "player1", hand: true, note: "The ending: 'Next time, let's be budget partners' (result 2), after asking Mara to explain each line; milestone the same" },
  { id: "stored-avalon-t8", story: "play-avalon", turn: 8, slot: "player1", hand: true, note: "'I promised the Market would keep its plan, and I mean it' (result 1), after pressing the vendors for details; milestone the same" },
  { id: "stored-avalon-t11", story: "play-avalon", turn: 11, slot: "player1", hand: true, note: "A chapter step: Jun shares a personal concern and asks what the bell brings back for Orin (result 1), after asking only for public records" },
  { id: "stored-avalon-t16", story: "play-avalon", turn: 16, slot: "player1", hand: true, note: "Jun tells Orin why their paths diverged and they leave on good terms (result 3), after sharing only the work's thoughts; milestone the same" },
  { id: "stored-food-trucks-t8", story: "play-food-trucks", turn: 8, slot: "player2", hand: true, note: "Jo writes 'rotating community meal' (result 2) after weighing a low-cost bowl, and says it is not a permanent low-cost bowl; milestone and fact the same" },
  { id: "stored-space-pirates-t9", story: "play-space-pirates", turn: 9, slot: "player2", hand: true, note: "Jori leaves the Articles closed and asks what each will carry (result 3), after working within them; milestone the same" },
  { id: "stored-space-pirates-t14", story: "play-space-pirates", turn: 14, slot: "player1", hand: true, note: "Bex asks Tamsin to gather the watch concerns, 'I'll make the call' (result 1), after answering the relay alone; milestone the same" },
  { id: "stored-space-pirates-t25-bex", story: "play-space-pirates", turn: 25, slot: "player1", hand: true, note: "A chapter step: Bex tells the dockhands to divide the work themselves and takes his hands off the tags (result 3), after asking for a concise list" },
  { id: "stored-space-pirates-t26-pip", story: "play-space-pirates", turn: 26, slot: "player3", hand: true, note: "The ending: Pip replaces the long draft with one line about temporary refuge (result 2), after drafting a direct account; milestone the same" },
  { id: "stored-estate-agents-t15", story: "play-estate-agents", turn: 15, slot: "player1", hand: true, note: "Rory pitches the margin note as what the house could mean to Mara (result 3), after keeping the evidence distinct; milestone and fact the same" },
  { id: "stored-kids-mouse-t8", story: "play-kids-mouse", turn: 8, slot: "player1", hand: true, note: "Bran asks Mira to cover the watch and meets Pip at the window (result 1), after leaving Pip waiting; milestone the same" },
  // --- Hand no ---
  { id: "stored-food-trucks-t23", story: "play-food-trucks", turn: 23, slot: "player1", hand: false, note: "Recorded result 2 (use the cabinet within disclosed safeguards), after result 1 (wait for verification): the text writes 'No ingredients stored here until the operating temperature is independently verified', the fact keeps the ingredients out until verified, the milestone blends both" },
  { id: "constructed-avalon-t11-records", story: "play-avalon", turn: 11, slot: "player1", edits: AVALON_T11_RECORDS, hand: false, note: "Constructed: Jun keeps to what the record can show and leaves the personal out (result 3, the step before's course) where he chose to share a personal memory" },
  { id: "constructed-kids-mouse-t8-watch", story: "play-kids-mouse", turn: 8, slot: "player1", edits: KIDS_T8_WATCH, hand: false, note: "Constructed: Bran stays at the watch and leaves Pip waiting again (the step before's course) where he chose to meet Pip; the milestone still says he met Pip" },
  { id: "constructed-avalon-t16-milestone", story: "play-avalon", turn: 16, slot: "player1", edits: AVALON_T16_MILESTONE, hand: false, note: "Constructed: the text tells the parting on good terms (result 3), the milestone renewed trust as close friends (result 1)" },
  { id: "constructed-food-trucks-t8-fact", story: "play-food-trucks", turn: 8, slot: "player2", edits: FOOD_TRUCKS_T8_FACT, hand: false, note: "Constructed: text and milestone tell the rotating meal (result 2), a recorded fact a permanent low-cost bowl (result 1)" },
  { id: "constructed-space-pirates-t14-alone", story: "play-space-pirates", turn: 14, slot: "player1", edits: PIRATES_T14_ALONE, hand: false, note: "Constructed: Bex keeps the watch to himself (the step before's course) where he chose to ask Tamsin to carry a burden; the milestone still says he asked" },
  { id: "constructed-estate-agents-t15-blend", story: "play-estate-agents", turn: 15, slot: "player1", edits: ESTATE_T15_BLEND, hand: false, note: "Constructed: Rory keeps the note out of the pitch (the step before's course) where he chose to use it as a hook; milestone and fact still tell the hook" },
  // --- The stage's own replies, read by hand after the run and before any judge call ---
  { id: "run-food-trucks-t23-production-s1", output: "484f29a4757172bd0c68", slot: "player1", hand: true, note: "Production: 'then use the cabinet only within the safeguards you have stated', the flicker 'still unresolved'; milestone and fact result 2" },
  { id: "run-food-trucks-t23-variant-s1", output: "5f3ce14e2af94d9c7017", slot: "player1", hand: true, note: "The variant: 'The demonstration moves forward under the conditions you named'; milestone 'proceeds only with stated safeguards'" },
  { id: "run-space-pirates-t14-production-s1", output: "dcb5d75d283da1af757f", slot: "player1", hand: true, note: "Production: Tamsin brings the concerns Bex asked for and he makes the call (result 1 told as done); milestone the same" },
  // --- Partial, left out of agreement ---
  { id: "stored-estate-agents-t8-nia", story: "play-estate-agents", turn: 8, slot: "player2", hand: "partial", note: "Nia's choice (result 2, document the mark as a lead) told only as a recollection in the third paragraph; the first paragraph goes straight to Mara's card" },
  { id: "run-food-trucks-t23-variant-s2", output: "c0c1dc2c275a1552973b", slot: "player1", hand: "partial", note: "The variant: 'nothing goes into the cabinet until its operation is checked and the handling conditions are clear', never shown using it, though Mara calls it 'a bounded procedure, not a certification'; milestone and fact result 2" },
];

export type RecordedAgreement = {
  check: typeof RECORDED_CHECK;
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
export function scoreRecordedCalibration(items: { id: string; hand: HandVerdict }[], judged: { itemId: string; samples: (boolean | undefined)[] }[]): RecordedAgreement {
  const byItem = new Map(judged.map((j) => [j.itemId, j]));
  const a: RecordedAgreement = { check: RECORDED_CHECK, decided: 0, agree: 0, falseFails: 0, falsePasses: 0, handPasses: 0, handFails: 0, pairs: 0, pairsAgree: 0, partial: { yes: 0, no: 0 }, reliable: false };
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

function calibrationReading(a: RecordedAgreement): string {
  if (a.reliable) return "reliable";
  const few = [a.handPasses < 3 ? "yes" : "", a.handFails < 3 ? "no" : ""].filter(Boolean);
  return few.length ? `not reliable (too few hand ${few.join(" and ")})` : "not reliable";
}

export type RecordedFailure = { armKey: string; caseId: string; sample: number; outputId: string; slot: string; evidence: string };

export type RecordedReport = {
  calibration: RecordedAgreement;
  items: RecordedCalibrationItem[];
  judged: { itemId: string; samples: (boolean | undefined)[]; evidence: { evidence?: string; lines: string[] }[] }[];
  readings: StageArmReading[];
  failures: RecordedFailure[];
};

/** judged-recorded.md: the calibration, each arm's rate and the variant against production, the items, and the failures. */
export function renderRecordedJudge(input: { report: RecordedReport; spentUsd: number; generatedAt: Date; problems: string[] }): string {
  const { report } = input;
  const c = report.calibration;
  const lines = [
    "# Judged check: the turn after an exploration step tells the result the game recorded",
    "",
    `Generated ${input.generatedAt.toISOString()} from prep-calls.jsonl (recordedResultJudge.ts, prompt v${RECORDED_JUDGE_PROMPT_VERSION}). One Luna low call per player in an exploration thread whose recorded result the turn narrates; a reply passes when every judged player passes. A check is reliable when sample 1 agrees on at least 85% of the hand yes and of the hand no, each side holding at least 3, and two samples agree on at least 90%. A candidate reads against its reference on the (case, sample) pairs both have, with the reference's sample-1-against-sample-2 difference as the noise and the stop rule on top. Spent on these judge calls: $${input.spentUsd.toFixed(4)}.`,
    "",
    `## ${RECORDED_CHECK}`,
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
  if (report.failures.length) {
    lines.push("", "Judged failures of the arms:", "", ...report.failures.map((f) => `- ${f.armKey} ${f.caseId} s${f.sample} ${f.slot} (${f.outputId}): ${f.evidence.replace(/\s+/g, " ").trim()}`));
  }
  if (input.problems.length) lines.push("", "## Problems", "", ...input.problems.map((p) => `- ${p}`));
  return `${lines.join("\n")}\n`;
}
