import { z } from "zod";
import type { Story } from "core/models/Story.js";
import { getThreadType, type PlayerSlot, type SetOfBeatGenerationSchema, type Thread, type ThreadAnalysis } from "core/types/index.js";
import type { TextRequest } from "../../game/services/storyTextSteps.js";
import type { Arm, Stage } from "./arms.js";
import { isReliable, type HandVerdict } from "./judgedChecks.js";
import { prepJob } from "./prepCalls.js";
import type { Job } from "./runner.js";
import type { StageArmReading, StageComparison } from "./stageJudge.js";

/*
 * The choice-result stage's judged checks (2026-09-30, after the playthroughs'
 * "choices that lead somewhere else"), one cheap GPT-6 call each, phrased so
 * yes passes, the judge's reading of each option or result written before its
 * answer:
 * - optionsFollowResults, per player at an exploration step: the game records
 *   option n as the step's result n, so each option carries out the result at
 *   its own position, the same action in the same direction. The judge reads
 *   the step's question, its three results in order and the player's three
 *   options in order, never the prompt, so production's turn and the variant
 *   read alike.
 * - resultsFitKind, per chapter plan: a challenge or contest result is rolled
 *   against the option the player chose, so it says how the attempt turns out
 *   and never which approach the player takes or what they say or decide; an
 *   exploration result is the option at its position, so it is the player's
 *   own choice, never only how others respond. The judge reads each thread's
 *   kind, question and steps with their results (the last step's are the
 *   milestones), never the plan's own text, so planner v2e and v2f read alike.
 * Each is calibrated on turns and plans of the playthroughs' stored runs read
 * by hand before any judge call (OPTIONS_CALIBRATION, RESULTS_CALIBRATION), to
 * the judged checks' standard (isReliable).
 */

export const OPTIONS_CHECK = "optionsFollowResults" as const;
export const RESULTS_CHECK = "resultsFitKind" as const;
export type ChoiceCheck = typeof OPTIONS_CHECK | typeof RESULTS_CHECK;

/** Part of each judge call's key: a wording change is judged afresh. */
export const CHOICE_JUDGE_PROMPT_VERSION = 1;

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asString = (value: unknown): string => (typeof value === "string" ? value : "");

const EXPLORATION_KEYS = ["resolution1", "resolution2", "resolution3"] as const;

// ---------------------------------------------------------------- optionsFollowResults

const OPTIONS_INTRO = `YOUR JOB: CHECK ONE PLAYER'S OPTIONS AT AN EXPLORATION STEP OF A STORY GAME

In this game an exploration step has three possible results, and the player picks one of three options. The game records the option by its position: picking option 1 means result 1 happened, option 2 result 2, option 3 result 3. The next turn and the chapter's outcome follow that result. So each option has to carry out the result at its own position: the same action, in the same direction (open or guarded, together or alone, now or later, pressing or stepping back), told in the scene's words. An option that does something none of the results describes, or that fits another result better than its own, sends the story where the player didn't choose.

Read the results and the options as a careful editor. For each option, say which result it carries out (1, 2 or 3), or "none" when it carries out none of them, with a few words on why; then answer the question. A result's consequences (how others react afterwards) need not be in the option: judge the player's own action and its direction.

An example from another story. The results: 1. Mara shows the judges her whole recipe; 2. Mara shows only the finished pie and keeps the recipe to herself; 3. Mara lets her rival present first and watches. The options "Hand the judges your recipe card", "Present the pie and tell them the recipe stays secret", "Step back and let Jonah go first" carry out 1, 2 and 3: yes. Had option 2 been "Ask the judges which pie they liked best", it carries out none of them: no. The options "Keep the recipe to yourself", "Show them everything", "Let Jonah go first" carry out 2, 1 and 3: no.`;

const OPTIONS_QUESTION = `${OPTIONS_CHECK}: Does each option carry out the result at its own position (option 1 result 1, option 2 result 2, option 3 result 3), the same action in the same direction? Answer no if any option carries out another result, or none of them.`;

const EVIDENCE = "The words that decide the answer, quoted, or what is missing; one or two sentences.";

export function optionsJudgeSchema() {
  return z.object({
    options: z
      .array(
        z.object({
          option: z.number().describe("The option's number, 1 to 3."),
          carriesOut: z.enum(["1", "2", "3", "none"]).describe("The result this option carries out, or none."),
          why: z.string().describe("A few words on why."),
        })
      )
      .max(3)
      .describe("Each option, in order."),
    [OPTIONS_CHECK]: z.object({ evidence: z.string().describe(EVIDENCE), answer: z.enum(["yes", "no"]).describe(`The answer to the question ${OPTIONS_CHECK} above`) }),
  });
}

const threadOf = (story: Story, slot: string): Thread | undefined =>
  story.getCurrentThreadAnalysis()?.threads.find((t) => t.playersSideA.includes(slot) || t.playersSideB.includes(slot));

const storyLines = (story: Story, slot?: string) => {
  const names = story.getPlayerSlots().map((s) => `${story.getPlayer(s)?.name ?? s} (${s}${s === slot ? ", this player" : ""})`);
  return ["======= THE STORY =======", `Title: ${story.getTitle()}`, `${names.length > 1 ? "The players' characters" : "The player's character"}: ${names.join(", ")}`].join("\n");
};

/**
 * The judge's request for one player's options, or undefined where the check
 * does not apply: not a chapter step, the player's thread not an exploration
 * thread, or the reply without three options for the player.
 */
export function optionsJudgeRequest(story: Story, reply: SetOfBeatGenerationSchema, slot: PlayerSlot): TextRequest | undefined {
  if (story.getCurrentBeatType() !== "thread") return undefined;
  const thread = threadOf(story, slot);
  if (!thread || getThreadType(thread) !== "exploration") return undefined;
  const done = thread.progression.filter((s) => s.resolution !== null).length;
  const step = thread.progression[done];
  const results = asObject(step?.possibleResolutions);
  const texts = EXPLORATION_KEYS.map((key) => asString(results[key]));
  const options = asArray(asObject(asObject(reply)[slot]).options).map((o) => asString(asObject(o).text));
  if (!step || texts.some((t) => !t) || options.length !== 3 || options.some((o) => !o)) return undefined;
  const question = asString((thread as Thread & { question?: unknown }).question).trim();
  const sections = [
    OPTIONS_INTRO,
    storyLines(story, slot),
    [
      "======= THE STEP =======",
      ...(question ? [`Chapter question: ${question}`] : []),
      `This step (${done + 1} of ${thread.progression.length}): ${step.title}: ${step.question}`,
      ...texts.map((t, i) => `Result ${i + 1}: ${t}`),
    ].join("\n"),
    ["======= THE PLAYER'S OPTIONS, IN ORDER =======", ...options.map((o, i) => `Option ${i + 1}: ${o}`)].join("\n"),
    ["======= QUESTION =======", OPTIONS_QUESTION].join("\n"),
  ];
  return { prompt: sections.join("\n\n"), schema: optionsJudgeSchema() };
}

// ---------------------------------------------------------------- resultsFitKind

const RESULTS_INTRO = `YOUR JOB: CHECK THE STEP RESULTS OF ONE CHAPTER PLAN IN A STORY GAME

In this game a chapter is planned as a few steps, and at each step every player picks one of three options. What a step's three results are depends on the chapter's kind:
- In a challenge or contest chapter the game rolls the option the player chose, and the result that comes up says how that attempt turned out. The player may have chosen any approach, so each result has to fit whatever they chose: what the player achieves or fails to achieve, a slip or a stroke of luck, how others respond, what is won or lost. A result fails when it says which approach the player took, or what they said or decided (the player "argues", "retracts", "defends", "hurries", "leans on", "lays out", "chooses"), because a player who chose otherwise would find the story telling a different action.
- In an exploration chapter the game records the option the player picks as the result at its position, so each result is a choice the player makes: something they do, say or decide. A result fails when it is only how others respond (a character reacts, a crew names its conditions), because no option can offer it.
The last step's results are the chapter's possible milestones; they follow the same rule.

Read every step's results as a careful editor. For each result, label it "outcome" (how an attempt turns out, whatever the approach: what the player achieves or fails to achieve, a slip, a stroke of luck, how others respond), "player's choice" (something the player chooses to do, say or decide: an approach or a decision) or "others' response" (only what others do), with a few words on why; then answer the question. A result can hold both what the player does and how others respond: label it by the player's part, if it has one.

An example from another story. In a challenge chapter, "The judges taste Mara's pie and ask for the recipe" is an outcome, and so are "Mara finds the missing receipt" and "Mara's crust cracks in the oven"; "Mara decides to bake a second pie instead" is the player's choice: it fails. In an exploration chapter, "Mara tells her sister the truth about the contest" is the player's choice; "Her sister storms out", alone, is others' response: it fails.`;

const RESULTS_QUESTION = `${RESULTS_CHECK}: Does every result fit its chapter's kind: in a challenge or contest chapter an outcome, never the player's choice; in an exploration chapter the player's choice, never others' response alone? Answer no if any result fails.`;

export function resultsJudgeSchema() {
  return z.object({
    results: z
      .array(
        z.object({
          thread: z.number().describe("The thread's number."),
          step: z.number().describe("The step's number."),
          result: z.string().describe("The result's name, as the plan lists it."),
          label: z.enum(["outcome", "player's choice", "others' response"]).describe("What the result says."),
          why: z.string().describe("A few words on why."),
        })
      )
      .max(40)
      .describe("Every result of every step, in order."),
    [RESULTS_CHECK]: z.object({ evidence: z.string().describe(EVIDENCE), answer: z.enum(["yes", "no"]).describe(`The answer to the question ${RESULTS_CHECK} above`) }),
  });
}

const KIND_TEXT = { challenge: "a challenge chapter", contest: "a contest chapter", exploration: "an exploration chapter" } as const;

/** The judge's request for one chapter plan (as the game keeps it) on its planner's story, or undefined where the plan holds no step. */
export function resultsJudgeRequest(story: Story, plan: ThreadAnalysis): TextRequest | undefined {
  const threads = asArray(plan?.threads) as Thread[];
  const readable = threads.filter((t) => asArray(t?.progression).length > 0);
  if (readable.length === 0) return undefined;
  const blocks = readable.map((t, i) => {
    const kind = getThreadType(t);
    const who = kind === "contest" ? `side A: ${t.playersSideA.join(", ")}; side B: ${t.playersSideB.join(", ")}` : `players: ${t.playersSideA.join(", ")}`;
    const outcome = story.getOutcomeById(t.outcomeId);
    const question = asString((t as Thread & { question?: unknown }).question).trim();
    const steps = t.progression.map((step, s) => {
      const last = s === t.progression.length - 1;
      return [
        `Step ${s + 1} of ${t.progression.length}${last ? " (the last step: its results are the chapter's possible milestones)" : ""}: ${step.title}: ${step.question}`,
        ...Object.entries(asObject(step.possibleResolutions)).map(([key, text]) => `  ${key}: ${asString(text)}`),
      ].join("\n");
    });
    return [
      `Thread ${i + 1}: ${t.title} (${KIND_TEXT[kind]}; ${who})`,
      ...(outcome ? [`For the outcome: ${outcome.question}`] : []),
      ...(question ? [`Chapter question: ${question}`] : []),
      ...steps,
    ].join("\n");
  });
  const sections = [RESULTS_INTRO, storyLines(story), ["======= THE CHAPTER PLAN =======", ...blocks].join("\n\n"), ["======= QUESTION =======", RESULTS_QUESTION].join("\n")];
  return { prompt: sections.join("\n\n"), schema: resultsJudgeSchema() };
}

// ---------------------------------------------------------------- answers

/** A check's verdict: true when the judge answered yes, undefined where it answered neither. */
export function verdictFrom(parsed: unknown, check: ChoiceCheck): boolean | undefined {
  const answer = asObject(asObject(parsed)[check]).answer;
  return answer === "yes" ? true : answer === "no" ? false : undefined;
}

/** The judge's evidence and its reading of each option or result. */
export function evidenceFrom(parsed: unknown, check: ChoiceCheck): { evidence?: string; lines: string[] } {
  const reply = asObject(parsed);
  const evidence = asString(asObject(reply[check]).evidence);
  const lines =
    check === OPTIONS_CHECK
      ? asArray(reply.options).map(asObject).map((o) => `option ${o.option} → ${asString(o.carriesOut)} (${asString(o.why)})`)
      : asArray(reply.results)
          .map(asObject)
          .map((r) => `thread ${r.thread} step ${r.step} ${asString(r.result)}: ${asString(r.label)} (${asString(r.why)})`);
  return { ...(evidence ? { evidence } : {}), lines };
}

export const choiceJudgeCaseId = (check: ChoiceCheck, key: string, version = CHOICE_JUDGE_PROMPT_VERSION) =>
  `judge-choice-${check === OPTIONS_CHECK ? "options" : "results"}-v${version}-${key}`;

/** Luna low reads one option set or one plan and writes a line per option or result: about 300-600 and 600-1,000 tokens, reasoning included */
const OUTPUT_TOKENS: Record<ChoiceCheck, number> = { [OPTIONS_CHECK]: 500, [RESULTS_CHECK]: 900 };

export type ChoiceTarget = { check: ChoiceCheck; key: string; request: TextRequest; samples: number };

/** The judge calls: each target at its number of samples (the calibration's two, the rest one). */
export function choiceJudgeJobs(targets: ChoiceTarget[], arm: Arm, promptState: string, stage: Stage): Job[] {
  return targets.flatMap((target) =>
    Array.from({ length: target.samples }, (_, i) =>
      prepJob({
        kind: "judge",
        stage,
        promptState,
        caseId: choiceJudgeCaseId(target.check, target.key),
        sample: i + 1,
        arm,
        role: target.check === OPTIONS_CHECK ? "beat" : "thread",
        players: 1,
        build: () => target.request,
        outputTokens: OUTPUT_TOKENS[target.check],
      })
    )
  );
}

// ---------------------------------------------------------------- calibration

export type OptionsCalibrationItem = { id: string; story: string; turn: number; slot: PlayerSlot; hand: HandVerdict; note: string };
export type ResultsCalibrationItem = { id: string; story: string; turn: number; hand: HandVerdict; note: string };

/**
 * Option sets of the playthroughs' stored runs (production's turns of 30
 * September), read by hand on the check's criterion on 2026-09-30 before any
 * judge call: yes when each option carries out the result at its position,
 * the same action in the same direction; no when any carries out another
 * result or none; partial where a reader could go either way (left out of
 * agreement). Both sides from one-player and group stories, at a chapter's
 * first step and later.
 */
export const OPTIONS_CALIBRATION: OptionsCalibrationItem[] = [
  // --- Hand yes ---
  { id: "avalon-t7", story: "play-avalon", turn: 7, slot: "player1", hand: true, note: "Present the link and its limits / a narrow statement keeping the Heart link private / leave the evidence out: the three results in order" },
  { id: "avalon-t8", story: "play-avalon", turn: 8, slot: "player1", hand: true, note: "A standing practice of sharing / a boundary keeping sources private / bring only conclusions: open, cautious, withheld, in order" },
  { id: "avalon-t10", story: "play-avalon", turn: 10, slot: "player1", hand: true, note: "Ask Ilan to help frame the questions / let Nemi speak first / approach Tavi alone: the three results in order" },
  { id: "avalon-t11", story: "play-avalon", turn: 11, slot: "player1", hand: true, note: "The full account / the sighting without the warning / only the fitting, the rest kept back: in order" },
  { id: "avalon-t16", story: "play-avalon", turn: 16, slot: "player1", hand: true, note: "Keep the details between you and arrange a review / use the bypass then disclose / disclose without warning Mara: in order" },
  { id: "lemonade-t7", story: "play-lemonade", turn: 7, slot: "player1", hand: true, note: "A cooler / a reserve / a cinnamon bun: improvement, reserve, treat, in order" },
  { id: "lemonade-t9", story: "play-lemonade", turn: 9, slot: "player1", hand: true, note: "Lay out the figures for Mara while deciding himself / check himself and ask one question / keep the goal without reviewing: in order" },
  { id: "lemonade-t10", story: "play-lemonade", turn: 10, slot: "player1", hand: true, note: "Invite Mara's method / trade tips, keep records apart / treat the cooler as settled: mentor, neighbours, distance, in order" },
  { id: "food-trucks-t15-p1", story: "play-food-trucks", turn: 15, slot: "player1", hand: true, note: "Jo: keep adapting for the people / keep the familiar core / make the transformation the signature: in order" },
  { id: "food-trucks-t15-p2", story: "play-food-trucks", turn: 15, slot: "player2", hand: true, note: "Luz: keep checking in, no help owed / stay in touch, repairs only when welcome / leave contact to Tavi: in order" },
  { id: "food-trucks-t18-p1", story: "play-food-trucks", turn: 18, slot: "player1", hand: true, note: "Jo: an affordable meal with its crisp signature / spectacle for special service / the transformation at the centre: in order" },
  { id: "food-trucks-t18-p2", story: "play-food-trucks", turn: 18, slot: "player2", hand: true, note: "Luz: carry the crew's conditions / review together, a smaller limit / keep the growth slots open: in order" },
  { id: "space-pirates-t19-p3", story: "play-space-pirates", turn: 19, slot: "player3", hand: true, note: "Mika: tell the mismatch openly / keep to the engineering discrepancy / ask about a future core replacement: in order" },
  // --- Hand no ---
  { id: "avalon-t6", story: "play-avalon", turn: 6, slot: "player1", hand: false, note: "Option 2 (ask what the neighbourhood needs, listen first) holds nothing back; option 3 lays out the finding where result 3 asks Ilan to trust it unseen" },
  { id: "avalon-t12", story: "play-avalon", turn: 12, slot: "player1", hand: false, note: "The step repeats the one before; option 3 (trace the cart route with Nemi, gently) is no broken confidence, and options 1 and 2 are next moves, not the three ways of sharing" },
  { id: "avalon-t14", story: "play-avalon", turn: 14, slot: "player1", hand: false, note: "The text already told the account without naming Nemi (result 1); the options (the design brief, the test marks, the diagram) answer the next step" },
  { id: "lemonade-t6", story: "play-lemonade", turn: 6, slot: "player1", hand: false, note: "The set shifted: option 1 is the reserve (result 2), option 2 the improvement (result 1), option 3 (compare old sales days) no treat" },
  { id: "food-trucks-t14-p1", story: "play-food-trucks", turn: 14, slot: "player1", hand: false, note: "Jo: ask each regular for one quality / a second tasting in another order / say what you're proudest of: none sets the familiar beside the new, none gives the dramatic one the reveal" },
  { id: "food-trucks-t14-p2", story: "play-food-trucks", turn: 14, slot: "player2", hand: false, note: "Luz: option 2 (tell something private) is no boundary, option 3 (a walk, no work) is result 1's time together, not stepping back" },
  { id: "food-trucks-t17-p1", story: "play-food-trucks", turn: 17, slot: "player1", hand: false, note: "Jo: option 2 (a bite in a paper cup) sets nothing familiar beside the new; option 3 (break the shell) doesn't present the crackle as the signature" },
  { id: "food-trucks-t17-p2", story: "play-food-trucks", turn: 17, slot: "player2", hand: false, note: "Luz: the results are the crew's reactions; the options (point out a date, trace one date, mark the workable dates) carry out none of Luz's parts in order" },
  { id: "space-pirates-t14-p2", story: "play-space-pirates", turn: 14, slot: "player2", hand: false, note: "Juno: option 1 marks the gap but asks for no renegotiation; option 3 lists what can be verified, no boundary" },
  { id: "space-pirates-t18-p3", story: "play-space-pirates", turn: 18, slot: "player3", hand: false, note: "Mika: freeze the display / run the signature beside the old figures / have the others record: none shows the figures together, keeps them to himself, or puts replacement on the table" },
  // --- Partial, left out of agreement ---
  { id: "avalon-t15", story: "play-avalon", turn: 15, slot: "player1", hand: "partial", note: "Options 1 and 2 are results 1 and 2; option 3 asks for the exact ceiling, which could be result 3's pressing for the limits or a plain question" },
];

/**
 * Chapter plans of the playthroughs' stored runs, read by hand on the check's
 * criterion on 2026-09-30 before any judge call: yes when every challenge or
 * contest result says how the attempt turns out and every exploration result
 * is the player's own choice; no when any result fails its kind; partial where
 * a reader could go either way. Single-player and group plans, challenge,
 * contest and exploration chapters.
 */
export const RESULTS_CALIBRATION: ResultsCalibrationItem[] = [
  // --- Hand yes ---
  { id: "plan-avalon-t6", story: "play-avalon", turn: 6, hand: true, note: "Exploration: Eli lays out, gives part of, or withholds the trace; each result his choice" },
  { id: "plan-avalon-t10", story: "play-avalon", turn: 10, hand: true, note: "Exploration: Eli asks Ilan to help, lets the witness speak, goes alone; each his choice" },
  { id: "plan-avalon-t14", story: "play-avalon", turn: 14, hand: true, note: "Exploration: Eli tells the account guardedly, relays it with its limits, presents it as fact; each his choice, Mara's reaction beside it" },
  { id: "plan-lemonade-t6", story: "play-lemonade", turn: 6, hand: true, note: "Exploration: Mateo writes down an improvement, a reserve or a treat" },
  { id: "plan-lemonade-t9", story: "play-lemonade", turn: 9, hand: true, note: "Exploration: Mateo asks Mara to check, checks himself, or brushes her question past" },
  { id: "plan-food-trucks-t14", story: "play-food-trucks", turn: 14, hand: true, note: "Two exploration threads: Jo's three presentations and Luz's three offers, each the player's choice" },
  { id: "plan-space-pirates-t2", story: "play-space-pirates", turn: 2, hand: true, note: "Challenge: the crew spots an alignment or the lane shifts, matches the code or loses it, secures the cache or is driven off: how it turns out" },
  { id: "plan-space-pirates-t14", story: "play-space-pirates", turn: 14, hand: true, note: "Challenge: a fault isolated or a warning worsens, Ivo's berth or his warning; Juno's exploration results her choices" },
  { id: "plan-space-pirates-t18", story: "play-space-pirates", turn: 18, hand: true, note: "Exploration on Mika's outcome: Mika shows the figures, keeps them, or puts replacement on the table; each his choice" },
  // --- Hand no ---
  { id: "plan-avalon-t2", story: "play-avalon", turn: 2, hand: false, note: "Challenge: step 2's results say how they open the door (carefully, forcing a narrow opening, accepting a noisy approach)" },
  { id: "plan-avalon-t18", story: "play-avalon", turn: 18, hand: false, note: "Challenge: Eli's question folds the possibility in, he leans on the warning as proof, his framing blurs the line: his actions" },
  { id: "plan-avalon-t22", story: "play-avalon", turn: 22, hand: false, note: "Challenge: Eli retracts, concedes, or defends his framing; he urges immediate restoration: his decisions" },
  { id: "plan-lemonade-t2", story: "play-lemonade", turn: 2, hand: false, note: "Challenge: step 2's mixed and unfavorable results are the quantities Mateo chooses" },
  { id: "plan-food-trucks-t6", story: "play-food-trucks", turn: 6, hand: false, note: "Contest: Jo's clear visual menu, Luz's visual ordering system, calm visual cues, quiet signals: each side's approach" },
  { id: "plan-food-trucks-t10", story: "play-food-trucks", turn: 10, hand: false, note: "Challenge: Jo and Luz lay out the chart plainly, lead with what they need, hurry Tavi: their approach" },
  { id: "plan-food-trucks-t20", story: "play-food-trucks", turn: 20, hand: false, note: "Contest: Jo explains the layers, Luz describes the crew's work: each side's approach" },
  { id: "plan-space-pirates-t10", story: "play-space-pirates", turn: 10, hand: false, note: "Contest: Ari connects the correction to a way to assess the danger, offers captaincy; Juno and Mika show how their ledger contains the risk: approaches and decisions" },
  // --- Partial, left out of agreement ---
  { id: "plan-food-trucks-t2", story: "play-food-trucks", turn: 2, hand: "partial", note: "Contest: mostly how each counter holds (the weighted cookware holds, the setup loses moments), but 'both contenders adapt their counters' and 'quick adjustments' name what they do" },
  { id: "plan-food-trucks-t17", story: "play-food-trucks", turn: 17, hand: "partial", note: "Exploration: Jo's results her choices; Luz's are the crew's reactions with a small part of hers (writes the conditions down, leaves room, notes the growth slots)" },
  { id: "plan-space-pirates-t6", story: "play-space-pirates", turn: 6, hand: "partial", note: "Contest: how the clerk responds, but 'Ari's direct account of route responsibility' and 'by presenting a clear route plan' name the approach" },
];

export type ChoiceAgreement = {
  check: ChoiceCheck;
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
export function scoreChoiceCalibration(check: ChoiceCheck, items: { id: string; hand: HandVerdict }[], judged: { itemId: string; samples: (boolean | undefined)[] }[]): ChoiceAgreement {
  const byItem = new Map(judged.map((j) => [j.itemId, j]));
  const a: ChoiceAgreement = { check, decided: 0, agree: 0, falseFails: 0, falsePasses: 0, handPasses: 0, handFails: 0, pairs: 0, pairsAgree: 0, partial: { yes: 0, no: 0 }, reliable: false };
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

function calibrationReading(a: ChoiceAgreement): string {
  if (a.reliable) return "reliable";
  const few = [a.handPasses < 3 ? "yes" : "", a.handFails < 3 ? "no" : ""].filter(Boolean);
  return few.length ? `not reliable (too few hand ${few.join(" and ")})` : "not reliable";
}

export type ChoiceFailure = { armKey: string; caseId: string; sample: number; outputId: string; slot?: string; evidence: string };

export type ChoiceCheckReport = {
  check: ChoiceCheck;
  items: { id: string; hand: HandVerdict; note: string }[];
  calibration: ChoiceAgreement;
  judged: { itemId: string; samples: (boolean | undefined)[]; evidence: { evidence?: string; lines: string[] }[] }[];
  readings: StageArmReading[];
  failures: ChoiceFailure[];
};

const WHAT: Record<ChoiceCheck, string> = {
  [OPTIONS_CHECK]:
    "one Luna low call per player at an exploration step asks whether each option carries out the step's result at its own position (the game records option n as result n), the same action in the same direction; the judge reads the step's question, its results in order and the options in order, never the prompt. A reply passes when every judged player's set passes.",
  [RESULTS_CHECK]:
    "one Luna low call per chapter plan (as the game keeps it, after the plan check) asks whether every challenge or contest result says how the attempt turns out, never the player's choice, and every exploration result is the player's own choice, never only others' response; the judge reads each thread's kind, question and steps with their results, never the plan's own text.",
};

/** judged-choice-results.md: per check, the calibration, each arm's rate and a candidate against its reference, the items, and the failures. */
export function renderChoiceResultJudge(input: { checks: ChoiceCheckReport[]; spentUsd: number; generatedAt: Date; problems: string[] }): string {
  const lines = [
    "# Judged checks: choices and results",
    "",
    `Generated ${input.generatedAt.toISOString()} from prep-calls.jsonl (choiceResultJudge.ts, prompt v${CHOICE_JUDGE_PROMPT_VERSION}). Calibrated on the playthroughs' turns and plans read by hand; reliable when sample 1 agrees on at least 85% of the hand yes and of the hand no, each side holding at least 3, and two samples agree on at least 90%. A candidate reads against each reference on the (case, sample) pairs both have, with the reference's sample-1-against-sample-2 difference as the noise and the stop rule on top. Spent on these judge calls: $${input.spentUsd.toFixed(4)}.`,
  ];
  for (const report of input.checks) {
    const c = report.calibration;
    lines.push(
      "",
      `## ${report.check}`,
      "",
      `How: ${WHAT[report.check]}`,
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
      "| Item | Hand | Judged (samples) | Hand reading |",
      "|---|---|---|---|",
      ...report.items.map((item) => {
        const judged = report.judged.find((j) => j.itemId === item.id);
        return `| ${item.id} | ${verdictText(item.hand)} | ${judged?.samples.map(verdictText).join("/") || "–"} | ${item.note} |`;
      })
    );
    const disagreements = report.items.flatMap((item) => {
      const judged = report.judged.find((j) => j.itemId === item.id);
      const first = judged?.samples[0];
      if (item.hand === "partial" || first === undefined || first === item.hand) return [];
      const said = judged?.evidence[0];
      return [`- ${item.id}: hand ${verdictText(item.hand)}, judged ${verdictText(first)}. ${(said?.lines ?? []).join("; ")}. Evidence: ${(said?.evidence ?? "").replace(/\s+/g, " ").trim()}`];
    });
    if (disagreements.length) lines.push("", "Where sample 1 disagrees with the hand:", "", ...disagreements);
    if (report.failures.length) {
      lines.push("", "Judged failures of the arms:", "", ...report.failures.map((f) => `- ${f.armKey} ${f.caseId} s${f.sample}${f.slot ? ` ${f.slot}` : ""} (${f.outputId}): ${f.evidence.replace(/\s+/g, " ").trim()}`));
    }
  }
  if (input.problems.length) lines.push("", "## Problems", "", ...input.problems.map((p) => `- ${p}`));
  return `${lines.join("\n")}\n`;
}
