import { z } from "zod";
import type { Story } from "core/models/Story.js";
import type { SetOfBeatGenerationSchema, SwitchAnalysis, ThreadAnalysis } from "core/types/index.js";
import { isContestedOutcome } from "core/utils/outcomeReadiness.js";
import { outcomeIdsNamed } from "../../game/services/outcomeIds.js";
import { outcomeNeeds, stageOf } from "../../game/services/pacing.js";
import type { TextRequest } from "../../game/services/storyTextSteps.js";
import type { Arm, Stage } from "./arms.js";
import { isReliable, type HandVerdict } from "./judgedChecks.js";
import { paragraphsOf } from "./outcomeSettledJudge.js";
import { prepJob } from "./prepCalls.js";
import type { Job } from "./runner.js";
import type { StageArmReading, StageComparison } from "./stageJudge.js";

/*
 * The parallel-threads stage's checks (2026-10-01, fix 4 of the second
 * playthroughs' review).
 *
 * One cheap GPT-6 call per group turn on a chapter step asks placesConsistent:
 * across the players' texts of the turn, which happen at the same moment, is
 * every person, group and vehicle in one place, in no scene of a thread they
 * are not in, and every shared place or vehicle in the same state? Phrased so
 * yes passes. The judge reads who is in which thread and every player's text
 * as they read it; never the prompt or the plan, so production's turn and the
 * variant read alike. It lists who appears in more than one text, or in a
 * scene of a thread they are not in, and where each text puts them, then
 * answers. Calibrated on hand-read turns before any judge call
 * (PLACES_CALIBRATION), to the judged checks' standard (isReliable).
 *
 * Beside it, three readings the game makes on the plans, no calls:
 * - lastStageOffers: how a switch plan offers each contested shared outcome
 *   whose next thread settles its last stage (grouped, a flavor switch for
 *   every player; not offered; a direction among others, which one side can
 *   take alone; a flavor switch for some players only);
 * - oneSidedNames: which other players' characters a thread on a contested
 *   outcome names in its question, steps and results where its players are
 *   one side only, the others elsewhere (the converted contest's wording);
 * - contestDecidedAlone: a chapter thread that settles a contested shared
 *   outcome's last stage with one side's players only (the plan check the
 *   review proposed; production would answer it with a retry).
 */

export const PLACES_CHECK = "placesConsistent" as const;

/**
 * Part of each judge call's key: a wording change is judged afresh. v2 (the
 * calibration's one fix, 2026-10-01): v1 agreed with the hand on 15 of 18
 * (yes 6 of 9, no 9 of 9), samples 19 of 19, not reliable. Its three false
 * fails read its own rule that a player is shown only in their own thread's
 * scenes: the space pirates' galley at turns 6 and 8, where the contest and
 * Jori's reading of the Articles shared one table and every text agreed, and
 * the food trucks' turn 21, where it took each owner's own crew for one group
 * in two places. v2 asks about places only: separate scenes may share a
 * place, and a same-named group is one group only where the texts make it so.
 */
export const PLACES_JUDGE_PROMPT_VERSION = 2;

export type PlacesJudgeVersion = 1 | 2;

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asString = (value: unknown): string => (typeof value === "string" ? value : "");

const INTRO_HEAD = `YOUR JOB: CHECK ONE TURN OF A MULTIPLAYER STORY GAME FOR PEOPLE AND PLACES THAT DON'T ADD UP ACROSS THE PLAYERS' TEXTS

In this game several players play one story together. Each turn, every player reads a text of their own, and all the texts of a turn happen at the same moment of the story. Players can be in the same thread (one scene they share) or in different threads (separate scenes at the same moment). So:`;

const RULES: Record<PlacesJudgeVersion, string> = {
  1: `- every person (a player's character or anyone else), group and vehicle is in one place: no one is shown in two places, and no one is in a scene of a thread they are not in; a player's character is shown only in the scenes of their own thread;
- a shared place or vehicle is in one state and one place in every text (a ship is not tied up at the docks in one text while it flies somewhere else in another);
- someone who is named, remembered, talked about, or heard by message, call or relay from elsewhere is not in the scene; only someone the text shows there counts, and a message from elsewhere is fine as long as the text says it comes from elsewhere.

Read every text as a careful editor. List every person, group or vehicle that appears in more than one player's text, or in a scene of a thread they are not in, and say where each text puts them; then answer the question.`,
  2: `- every person (a player's character or anyone else), group and vehicle is in one place at a time: no one is shown in two places at once;
- separate scenes can share a place: two threads can happen in the same room, ship or street, and a text may show the other thread's people there, as long as every text puts each person in the same place;
- a shared place or vehicle is in one state and one place in every text (a ship is not tied up at the docks in one text while it flies somewhere else in another);
- a group with the same kind of name in two texts (a crew, the residents, the dockhands) is one group only where the texts make it the same; each player's own crew, staff or neighbors are their own;
- someone who is named, remembered, talked about, or heard by message, call or relay from elsewhere is not in the scene; only someone the text shows there counts, and a message from elsewhere is fine as long as the text says it comes from elsewhere.

Read every text as a careful editor. List every person, group or vehicle that appears in more than one player's text, and say where each text puts them; then answer the question.`,
};

const EXAMPLE: Record<PlacesJudgeVersion, string> = {
  1: `An example from another story: Ana and Ben are in different threads, Ana at the harbor market and Ben aboard the ferry crossing the bay. A text where the ferry is tied up at the market pier while Ben's text has it in mid-bay puts the ferry in two places: no. A text of Ben's where Ana leans on the ferry's rail beside him, while her own text has her at the market: no. A text of Ben's where he reads a message Ana sent from the market, or thinks of her haggling there: yes.`,
  2: `An example from another story: Ana and Ben are in different threads, Ana at the harbor market and Ben aboard the ferry crossing the bay. A text where the ferry is tied up at the market pier while Ben's text has it in mid-bay puts the ferry in two places: no. A text of Ben's where Ana leans on the ferry's rail beside him, while her own text has her at the market: no. A text of Ben's where he reads a message Ana sent from the market, or thinks of her haggling there: yes. If instead both threads happen in the ferry's saloon and each text shows the other player at the next table: yes.`,
};

const QUESTIONS: Record<PlacesJudgeVersion, string> = {
  1: `${PLACES_CHECK}: Across the players' texts of this turn, is every person, group and vehicle in one place, and in no scene of a thread they are not in, and is every shared place or vehicle in the same state in every text? Answer no if anyone or anything is shown in two places at once, or shown in a scene of a thread they are not in, or if a shared place or vehicle is in a different place or state in two texts. Answer yes otherwise.`,
  2: `${PLACES_CHECK}: Across the players' texts of this turn, is every person, group and vehicle in one place at a time, and is every shared place or vehicle in the same place and state in every text? Answer no if anyone or anything is shown in two places at once, or if a shared place or vehicle is in a different place or state in two texts. Answer yes otherwise.`,
};

const CONFLICTS: Record<PlacesJudgeVersion, readonly [string, ...string[]]> = {
  1: ["none", "two places", "not in their thread", "different state"],
  2: ["none", "two places", "different state"],
};

export function placesJudgeSchema(version: PlacesJudgeVersion = PLACES_JUDGE_PROMPT_VERSION) {
  const inThread = version === 1;
  return z.object({
    people: z
      .array(
        z.object({
          who: z.string().describe("The person, group or vehicle."),
          places: z.string().describe("Where each text puts them, by whose text it is, quoted briefly."),
          conflict: z
            .enum(CONFLICTS[version])
            .describe(
              inThread
                ? "What doesn't add up: none, shown in two places, shown in a scene of a thread they are not in, or a shared place or vehicle in a different state."
                : "What doesn't add up: none, shown in two places at once, or a shared place or vehicle in a different place or state."
            ),
        })
      )
      .max(10)
      .describe(inThread ? "Everyone and everything that appears in more than one player's text, or in a scene of a thread they are not in; empty when no one does." : "Everyone and everything that appears in more than one player's text; empty when no one does."),
    [PLACES_CHECK]: z.object({
      evidence: z.string().describe("The words that decide the answer, quoted, or what is missing; one or two sentences."),
      answer: z.enum(["yes", "no"]).describe(`The answer to the question ${PLACES_CHECK} above`),
    }),
  });
}

const nameOf = (story: Story, slot: string) => story.getPlayer(slot)?.name ?? slot;

/**
 * The judge's request for one group turn on a chapter step (as the game keeps
 * it, after the beat repairs), on its turn's story: who is in which thread and
 * every player's text, at the prompt version given (the current one by
 * default). Undefined on any other turn.
 */
export function placesJudgeRequest(story: Story, reply: SetOfBeatGenerationSchema, version: PlacesJudgeVersion = PLACES_JUDGE_PROMPT_VERSION): TextRequest | undefined {
  if (!story.isMultiplayer() || story.getCurrentBeatType() !== "thread") return undefined;
  const threads = story.getCurrentThreadAnalysis()?.threads ?? [];
  const threadLines = threads.map((thread) => {
    const players = [...thread.playersSideA, ...thread.playersSideB];
    return `- Thread "${thread.title}": ${players.map((slot) => `${nameOf(story, slot)} (${slot})`).join(", ")}`;
  });
  const texts = story.getPlayerSlots().map((slot) => [`${nameOf(story, slot)}'s text (${slot}):`, ...paragraphsOf(reply, slot).map((p, i) => `[${i + 1}] ${p}`)].join("\n"));
  const sections = [
    [INTRO_HEAD, RULES[version], "", EXAMPLE[version]].join("\n"),
    ["======= THE STORY =======", `Title: ${story.getTitle()}`].join("\n"),
    ["======= WHO IS IN WHICH THREAD THIS TURN =======", ...threadLines, threads.length > 1 ? "Players in different threads are in separate scenes at the same moment." : "Every player is in this one thread."].join("\n"),
    ["======= THE TURN, EACH PLAYER'S TEXT =======", ...texts].join("\n\n"),
    ["======= QUESTION =======", QUESTIONS[version]].join("\n"),
  ];
  return { prompt: sections.join("\n\n"), schema: placesJudgeSchema(version) };
}

/** The verdict: true when the judge answered yes, undefined where it answered neither. */
export function placesVerdictFrom(parsed: unknown): boolean | undefined {
  const answer = asObject(asObject(parsed)[PLACES_CHECK]).answer;
  return answer === "yes" ? true : answer === "no" ? false : undefined;
}

/** The judge's evidence and its readings: each person, group or vehicle it listed, with what doesn't add up. */
export function placesEvidenceFrom(parsed: unknown): { evidence?: string; lines: string[] } {
  const reply = asObject(parsed);
  const evidence = asString(asObject(reply[PLACES_CHECK]).evidence);
  const lines = asArray(reply.people)
    .map(asObject)
    .map((p) => `${asString(p.who)} (${asString(p.conflict)}): ${asString(p.places)}`);
  return { ...(evidence ? { evidence } : {}), lines };
}

export const placesJudgeCaseId = (key: string, version = PLACES_JUDGE_PROMPT_VERSION) => `judge-places-v${version}-${key}`;

/** Luna low reads every player's text of a turn and lists a few people: about 600-1,000 tokens, reasoning included */
const PLACES_JUDGE_OUTPUT_TOKENS = 1_000;

export type PlacesTarget = { key: string; request: TextRequest; samples: number };

/** The judge calls: each target at its number of samples (the calibration's two, the rest one). */
export function placesJudgeJobs(targets: PlacesTarget[], arm: Arm, promptState: string, stage: Stage): Job[] {
  return targets.flatMap((target) =>
    Array.from({ length: target.samples }, (_, i) =>
      prepJob({
        kind: "judge",
        stage,
        promptState,
        caseId: placesJudgeCaseId(target.key),
        sample: i + 1,
        arm,
        role: "beat",
        players: 2,
        build: () => target.request,
        outputTokens: PLACES_JUDGE_OUTPUT_TOKENS,
      })
    )
  );
}

// ---------------------------------------------------------------- the plans

const contestedShared = (story: Story) => story.getSharedOutcomes().filter(isContestedOutcome);

export type LastStageOffer = { outcomeId: string; offered: "grouped" | "not offered" | "a direction among others" | "a flavor switch for some players"; passes: boolean };

/** The outcome ids a topic switch's directions push: its structured directions, else the ids its texts name. */
function directionOutcomes(sw: SwitchAnalysis["switches"][number], known: string[]): string[] {
  const structured = asArray((sw as unknown as Loose).topicDirections).map(asObject);
  if (structured.length) return structured.map((d) => asString(d.outcomeId));
  return (sw.topicChoices ?? []).flatMap((text) => outcomeIdsNamed(text, known).known);
}

/**
 * How a switch plan offers each contested shared outcome whose next thread
 * settles its last stage (one milestone still needed, the chapter that just
 * ended counted as pending): grouped (a flavor switch on it holding every
 * player), not offered, a direction among others (a topic switch's direction,
 * which one side could take alone) or a flavor switch for some players only.
 * The first two pass. Empty where no contested outcome is at that point.
 */
export function lastStageOffers(story: Story, plan: SwitchAnalysis): LastStageOffer[] {
  const [first] = story.getPlayerSlots();
  const needs = new Map(outcomeNeeds(story, first, true).map((n) => [n.id, n]));
  const slots = story.getPlayerSlots();
  const known = [...new Set([...story.getSharedOutcomes(), ...slots.flatMap((s) => story.getPlayer(s)?.outcomes ?? [])].map((o) => o.id))];
  return contestedShared(story)
    .filter((o) => needs.get(o.id)?.stillNeeded === 1)
    .map((o) => {
      const switches = plan.switches ?? [];
      const asDirection = switches.some((sw) => sw.type !== "flavor" && directionOutcomes(sw, known).includes(o.id));
      const flavors = switches.filter((sw) => sw.type === "flavor" && sw.outcomeId === o.id);
      const everyone = flavors.some((sw) => slots.every((slot) => sw.players.includes(slot)));
      const offered: LastStageOffer["offered"] = asDirection
        ? "a direction among others"
        : flavors.length && !everyone
          ? "a flavor switch for some players"
          : everyone
            ? "grouped"
            : "not offered";
      return { outcomeId: o.id, offered, passes: offered === "grouped" || offered === "not offered" };
    });
}

export type OneSidedNaming = { threadId: string; outcomeId: string; players: string[]; absentNamed: string[]; passes: boolean };

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether a text names a character: the full name, or its first word as a word. */
function names(text: string, name: string): boolean {
  const first = name.split(/\s+/)[0];
  return text.includes(name) || (first.length > 1 && new RegExp(`(^|[^\\p{L}])${escaped(first)}(?![\\p{L}])`, "u").test(text));
}

/**
 * The other players' characters a thread on a contested shared outcome names
 * where its players are one side only and the others elsewhere (no side B,
 * not every player): read in its question, its steps' questions and results
 * and its milestones, as the players' turns and the milestone are written
 * from them. Passes where it names none.
 */
export function oneSidedNames(story: Story, plan: ThreadAnalysis): OneSidedNaming[] {
  const contested = new Set(contestedShared(story).map((o) => o.id));
  const slots = story.getPlayerSlots();
  return (plan.threads ?? []).flatMap((thread): OneSidedNaming[] => {
    const players = [...(thread.playersSideA ?? []), ...(thread.playersSideB ?? [])];
    if (!contested.has(thread.outcomeId) || (thread.playersSideB ?? []).length > 0 || slots.every((slot) => players.includes(slot))) return [];
    const texts = [
      asString((thread as unknown as Loose).question),
      ...Object.values(asObject(thread.possibleMilestones)).map(asString),
      ...(thread.progression ?? []).flatMap((step) => [asString(step.question), ...Object.values(asObject(step.possibleResolutions)).map(asString)]),
    ].join("\n");
    const absentNamed = slots.filter((slot) => !players.includes(slot)).map((slot) => nameOf(story, slot)).filter((name) => names(texts, name));
    return [{ threadId: thread.id, outcomeId: thread.outcomeId, players, absentNamed, passes: absentNamed.length === 0 }];
  });
}

export type ContestAlone = { threadId: string; outcomeId: string; stage: string; players: string[] };

/**
 * A chapter thread that settles a contested shared outcome's last stage with
 * one side's players only while other players are elsewhere (no side B, not
 * every player): the review's proposed plan check, which production would
 * answer with a retry.
 */
export function contestDecidedAlone(story: Story, plan: ThreadAnalysis): ContestAlone[] {
  const contested = new Map(contestedShared(story).map((o) => [o.id, o]));
  const slots = story.getPlayerSlots();
  return (plan.threads ?? []).flatMap((thread): ContestAlone[] => {
    const outcome = contested.get(thread.outcomeId);
    const stage = outcome ? stageOf(outcome.milestones?.length ?? 0, outcome.intendedNumberOfMilestones) : undefined;
    const players = [...(thread.playersSideA ?? []), ...(thread.playersSideB ?? [])];
    if (!stage?.last || (thread.playersSideB ?? []).length > 0 || slots.every((slot) => players.includes(slot))) return [];
    return [{ threadId: thread.id, outcomeId: thread.outcomeId, stage: `${stage.stage} of ${stage.of}`, players }];
  });
}

// ---------------------------------------------------------------- calibration

/**
 * A hand-read group turn: a stored playthrough turn (replayed), with edits
 * for a constructed failing version (each passage, which must occur, replaced
 * wherever it occurs: withEdits).
 */
export type PlacesCalibrationItem = { id: string; story: string; turn: number; hand: HandVerdict; note: string; edits?: [string, string][] };

/* The constructed failing versions: a player shown in another's scene while their own text has them elsewhere. */
const FOOD_TRUCKS_T13_JO: [string, string][] = [["Someone reaches across to pass a dish, and Tavi stands", "Jo, who has walked over from his truck, reaches across to pass a dish, and Tavi stands"]];
const ESTATE_T6_RORY: [string, string][] = [["Tomas waits without filling the silence, his expression", "Rory waits beside Tomas without filling the silence, his expression"]];
const ESTATE_T16_RORY: [string, string][] = [
  ["Across the lane, Vesper House's upper windows catch the dim light, while the map remains", "Across the lane, Rory stands at Vesper House's gate with the ledger file under his arm, while the map remains"],
];
const PIRATES_T8_JORI: [string, string][] = [
  [
    "Jori sets his blue marker aside and studies the words already on the foil. “I’m working from what the Articles actually say,” he tells you.",
    "Jori is up on the bridge, plotting the Comet’s course out of Needlepoint; he leans into the galley doorway on his way past. “I’m working from what the Articles actually say,” he tells you, and goes back to the helm.",
  ],
  ["Jori steadies it, and the smudge", "Someone steadies it, and the smudge"],
  ["Jori’s marker remains apart from the text", "The blue marker remains apart from the text"],
];

/**
 * Group chapter steps read by hand on the check's criterion before any judge
 * call: yes when every person, group and vehicle is in one place across the
 * texts and no one is in a scene of a thread they are not in; no when someone
 * or something is in two places or in another thread's scene; partial where a
 * reader could go either way (left out of agreement). Read on 2026-10-01:
 * the second round's stored turns (production's of 30 September; the space
 * pirates' third chapter and the estate agents' turn 14 the ones that came
 * apart) and four constructed failing versions of stored turns.
 */
export const PLACES_CALIBRATION: PlacesCalibrationItem[] = [
  // --- Hand yes ---
  { id: "stored-food-trucks-t6", story: "play-food-trucks", turn: 6, hand: true, note: "Suri at Tavi's shared table in the Tilt Market, Jo at the harbor co-op's meeting room; neither in the other's scene" },
  { id: "stored-food-trucks-t13", story: "play-food-trucks", turn: 13, hand: true, note: "Suri at the Tilt Market's long table with the workers, Jo with his crew beside the truck at Slowglass" },
  { id: "stored-food-trucks-t14", story: "play-food-trucks", turn: 14, hand: true, note: "The same two places, one step on; Tavi only in Suri's scene, the crew only in Jo's" },
  { id: "stored-food-trucks-t21", story: "play-food-trucks", turn: 21, hand: true, note: "Suri at the cold cabinet in the preparation hall with Mara, Jo with the crew and the rota at the truck" },
  { id: "stored-space-pirates-t6", story: "play-space-pirates", turn: 6, hand: true, note: "The galley contest and Jori's reading of the Articles at the same table: all three in the galley in every text (Pip's opens at Mara Vell's counter, then returns aboard)" },
  { id: "stored-space-pirates-t8", story: "play-space-pirates", turn: 8, hand: true, note: "All three at the galley table in every text, the lamp, the marker and the two proposals alike" },
  { id: "stored-estate-agents-t6", story: "play-estate-agents", turn: 6, hand: true, note: "Rory in the manager's office at Bellwether, Nia in Vesper House's north corridor with Tomas" },
  { id: "stored-estate-agents-t13", story: "play-estate-agents", turn: 13, hand: true, note: "Rory in the archive with Elin, Nia at the community garden's open house with Mara and the residents; Mara only in Nia's scene" },
  { id: "stored-estate-agents-t16", story: "play-estate-agents", turn: 16, hand: true, note: "Rory in Imogen's office, Nia at the garden table with the map-holding resident" },
  // --- Hand no ---
  { id: "stored-space-pirates-t10", story: "play-space-pirates", turn: 10, hand: false, note: "Bex on Needlepoint's cargo lane with the Comet's lights across the lane, while Jori flies the Comet toward the pylons and Pip's galley scene has Bex standing across the table" },
  { id: "stored-space-pirates-t11", story: "play-space-pirates", turn: 11, hand: false, note: "Bex on the cargo lane, the Comet's warning over the berth channel, while Jori's Comet is in the pylons and Bex rests a finger on the clause in Pip's galley" },
  { id: "stored-space-pirates-t12", story: "play-space-pirates", turn: 12, hand: false, note: "The relay tells Bex on the docks the Comet's departure slot has moved, while the Comet is in the pylons in Jori's text and Bex stands beside the Articles in Pip's galley" },
  { id: "stored-space-pirates-t13", story: "play-space-pirates", turn: 13, hand: false, note: "Bex answers the relay at the berth, the Comet's lights beyond the dock glass, while Jori clears the pylons and Bex stands by the Articles in Pip's galley" },
  { id: "stored-estate-agents-t14", story: "play-estate-agents", turn: 14, hand: false, note: "Mara arrives at the archive's reading-room table in Rory's text and stands at the open house in Nia's, looking 'toward Rory', who is in the archive in his own" },
  { id: "constructed-food-trucks-t13-jo", story: "play-food-trucks", turn: 13, edits: FOOD_TRUCKS_T13_JO, hand: false, note: "Constructed: Jo passes a dish at Suri's table in the Tilt Market while his own text has him with his crew at the truck" },
  { id: "constructed-estate-agents-t6-rory", story: "play-estate-agents", turn: 6, edits: ESTATE_T6_RORY, hand: false, note: "Constructed: Rory waits beside Tomas in Vesper House's corridor while his own text has him in the manager's office" },
  { id: "constructed-estate-agents-t16-rory", story: "play-estate-agents", turn: 16, edits: ESTATE_T16_RORY, hand: false, note: "Constructed: Rory stands at Vesper House's gate across the lane from Nia while his own text has him in Imogen's office" },
  { id: "constructed-space-pirates-t8-jori", story: "play-space-pirates", turn: 8, edits: PIRATES_T8_JORI, hand: false, note: "Constructed: Pip's text has Jori on the bridge plotting the course out of Needlepoint while his own and Bex's have him at the galley table" },
  // --- Partial, left out of agreement ---
  { id: "stored-space-pirates-t23", story: "play-space-pirates", turn: 23, hand: "partial", note: "Bex and Tamsin at the galley table with the cargo tags, Jori at the same galley table with the Articles and the slate, neither seeing the other; Pip outside along the seam" },
];

export type PlacesAgreement = {
  check: typeof PLACES_CHECK;
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
export function scorePlacesCalibration(items: { id: string; hand: HandVerdict }[], judged: { itemId: string; samples: (boolean | undefined)[] }[]): PlacesAgreement {
  const byItem = new Map(judged.map((j) => [j.itemId, j]));
  const a: PlacesAgreement = { check: PLACES_CHECK, decided: 0, agree: 0, falseFails: 0, falsePasses: 0, handPasses: 0, handFails: 0, pairs: 0, pairsAgree: 0, partial: { yes: 0, no: 0 }, reliable: false };
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

function calibrationReading(a: PlacesAgreement): string {
  if (a.reliable) return "reliable";
  const few = [a.handPasses < 3 ? "yes" : "", a.handFails < 3 ? "no" : ""].filter(Boolean);
  return few.length ? `not reliable (too few hand ${few.join(" and ")})` : "not reliable";
}

export type PlacesFailure = { armKey: string; caseId: string; sample: number; outputId: string; evidence: string };

export type SwitchPlanRow = { armKey: string; caseId: string; sample: number; outputId: string; offers: LastStageOffer[] };
export type ChapterPlanRow = { armKey: string; caseId: string; sample: number; outputId: string; repairs: string[]; oneSided: OneSidedNaming[]; decidedAlone: ContestAlone[] };

export type PlacesReport = {
  calibration: PlacesAgreement;
  items: PlacesCalibrationItem[];
  judged: { itemId: string; samples: (boolean | undefined)[]; evidence: { evidence?: string; lines: string[] }[] }[];
  readings: StageArmReading[];
  failures: PlacesFailure[];
  plans: { switches: SwitchPlanRow[]; chapters: ChapterPlanRow[]; readings?: { label: string; readings: StageArmReading[] }[] };
};

const readingRows = (readings: StageArmReading[]) =>
  readings.map((r) =>
    r.vsReference && r.referenceKey
      ? `| ${r.armKey} | ${tallyText(r.plans)} | ${r.referenceKey} | ${tallyText(r.vsReference.arm)} | ${tallyText(r.vsReference.reference)} | ${r.vsReference.noise === undefined ? "–" : `${Math.round(100 * r.vsReference.noise)} pts`} | ${readingText(r.vsReference)} |`
      : `| ${r.armKey} | ${tallyText(r.plans)} | – | – | – | – | – |`
  );

const READING_HEAD = ["| Arm | Passing | Against | Arm on the shared pairs | Reference on them | Noise | Reading |", "|---|---|---|---|---|---|---|"];

/** judged-parallel.md: the calibration, each arm's rate and the variant against production, the items, the failures, and the plan readings. */
export function renderPlacesJudge(input: { report: PlacesReport; spentUsd: number; generatedAt: Date; problems: string[] }): string {
  const { report } = input;
  const c = report.calibration;
  const lines = [
    "# Judged check: people and places consistent across the players' texts, and the plans' contests",
    "",
    `Generated ${input.generatedAt.toISOString()} from prep-calls.jsonl and calls.jsonl (parallelThreadsJudge.ts, prompt v${PLACES_JUDGE_PROMPT_VERSION}). One Luna low call per group turn on a chapter step, every player's text in it. A check is reliable when sample 1 agrees on at least 85% of the hand yes and of the hand no, each side holding at least 3, and two samples agree on at least 90%. A candidate reads against its reference on the (case, sample) pairs both have, with the reference's sample-1-against-sample-2 difference as the noise and the stop rule on top. Spent on these judge calls: $${input.spentUsd.toFixed(4)}.`,
    "",
    `## ${PLACES_CHECK}`,
    "",
    "| Agree (sample 1) | Hand yes / no | Judged no where the hand says yes | Judged yes where the hand says no | Samples agree | On partial items (yes / no) | Reading |",
    "|---|---|---|---|---|---|---|",
    `| ${c.agree} of ${c.decided} (${pct(c.agree, c.decided)}) | ${c.handPasses} / ${c.handFails} | ${c.falseFails} | ${c.falsePasses} | ${c.pairs ? `${c.pairsAgree} of ${c.pairs}` : "–"} | ${c.partial.yes} / ${c.partial.no} | ${calibrationReading(c)} |`,
    "",
    ...READING_HEAD,
    ...readingRows(report.readings),
    "",
    "| Item | Hand | Judged (samples) | Hand reading |",
    "|---|---|---|---|",
    ...report.items.map((item) => {
      const judged = report.judged.find((j) => j.itemId === item.id);
      return `| ${item.id} | ${verdictText(item.hand)} | ${judged?.samples.map(verdictText).join("/") || "–"} | ${item.note} |`;
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
    lines.push("", "Judged failures of the arms:", "", ...report.failures.map((f) => `- ${f.armKey} ${f.caseId} s${f.sample} (${f.outputId}): ${f.evidence.replace(/\s+/g, " ").trim()}`));
  }
  lines.push(
    "",
    "## The plans",
    "",
    "Read by the game, no calls. Switches: how each switch plan offers a contested outcome whose next thread settles its last stage (passes when grouped, a flavor switch on it for every player, or not offered). Chapters: the plan check's repairs; a thread on a contested outcome whose players are one side only, and the other players it names (passes when none); a thread settling a contested outcome's last stage with one side alone (the proposed plan check).",
    ""
  );
  for (const group of report.plans.readings ?? []) lines.push(`### ${group.label}`, "", ...READING_HEAD, ...readingRows(group.readings), "");
  if (report.plans.switches.length) {
    lines.push("| Switch plan | Arm | Sample | Contested outcomes at their last stage, as offered |", "|---|---|---|---|");
    for (const row of report.plans.switches) {
      lines.push(`| ${row.caseId} | ${row.armKey} | ${row.sample} | ${row.offers.map((o) => `${o.outcomeId}: ${o.offered}`).join("; ") || "none at that point"} |`);
    }
    lines.push("");
  }
  if (report.plans.chapters.length) {
    lines.push("| Chapter plan | Arm | Sample | Repairs | One-sided threads on a contested outcome (absent players named) | Last stage settled by one side alone |", "|---|---|---|---|---|---|");
    for (const row of report.plans.chapters) {
      const oneSided = row.oneSided.map((o) => `${o.threadId} (${o.players.join(", ")}): ${o.absentNamed.length ? o.absentNamed.join(", ") : "none named"}`).join("; ") || "–";
      const alone = row.decidedAlone.map((a) => `${a.threadId}: ${a.outcomeId} stage ${a.stage} (${a.players.join(", ")})`).join("; ") || "no";
      lines.push(`| ${row.caseId} | ${row.armKey} | ${row.sample} | ${row.repairs.join(", ") || "–"} | ${oneSided} | ${alone} |`);
    }
  }
  if (input.problems.length) lines.push("", "## Problems", "", ...input.problems.map((p) => `- ${p}`));
  return `${lines.join("\n")}\n`;
}
