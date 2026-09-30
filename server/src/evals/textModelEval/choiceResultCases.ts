import type { StoryState, SwitchAnalysis, ThreadAnalysis } from "core/types/index.js";
import type { EvalCase, FixedAnalysis } from "./cases.js";
import { sha256 } from "./executor.js";
import { requestInputFor } from "./jobPlan.js";
import type { PlayRun } from "./playthroughs.js";
import { replayedTurn } from "./playthroughReplay.js";
import { roundCase } from "./roundCases.js";
import { requestFor, requestText } from "./variants.js";

/*
 * The choice-result stage's cases (2026-09-30, no calls): turns and chapter
 * plans of the playthroughs' stored runs where a choice led somewhere else,
 * and beside them some where it didn't, frozen beside the other cases with
 * --build-choice-cases. Each is rebuilt by replaying its stored run from its
 * start (playthroughReplay.ts: its own plans, turns and seeded dice), and is
 * built only where its request is the one production sent there, byte for
 * byte (the stored call's prompt hash): a turn case is the turn's input (a
 * chapter opening's the story before its plan, with the plan as its fixed
 * analysis, as the frozen chapter openings read), a plan case the chapter
 * planner's input.
 *
 * The turns are exploration steps, where the game records option n as the
 * step's result n: New Avalon turn 6 (the options' second and third carry out
 * no result; the text had already laid out the trace), turn 14 (the text
 * carried out the step's first result, the options answer the next step),
 * lemonade turn 6 (the set shifted: comparing old sales days leads to the
 * personal treat), food trucks turns 14 and 17 (both players' sets; Luz's step
 * at turn 17 had the crew's reactions as its results) and space pirates turn 14
 * (Juno's set, beside two challenge players); and New Avalon turns 7, 10, 11
 * and 16 and lemonade turn 9, where the options carried out their results in
 * order. The plans: New Avalon turns 18 and 22 (the hearing chapters, whose
 * results say what Eli does: his question folds the possibility in, he
 * retracts or he defends his framing) and food trucks turn 10 (the owners lead
 * with what they need, hurry Tavi), whose next turns told the rolled action;
 * food trucks turn 17 (Luz's exploration results the crew's reactions); and
 * New Avalon turn 2, whose results say how the tracing went.
 */

export type ChoiceCaseSpec = {
  id: string;
  /** The playthrough's story id (playthroughs.ts) */
  story: string;
  turn: number;
  /** A turn (beat) or the chapter plan before it (thread) */
  role: "beat" | "thread";
  /** What the case tests, first in its note */
  purpose: string;
};

const MISMATCH = "An exploration step where production's options carried out another result than the one at their position, or none:";
const MATCHED = "An exploration step where production's options carried out their results in order:";
const ACTIONS = "A chapter plan whose challenge or contest results say what the player does rather than how the attempt turns out:";

export const CHOICE_RESULT_CASE_SPECS: ChoiceCaseSpec[] = [
  { id: "round-choice-avalon-t6", story: "play-avalon", turn: 6, role: "beat", purpose: `${MISMATCH} New Avalon's radio booth, the chapter's first step (options 2 and 3 carry out no result; the text had already laid out the trace).` },
  { id: "round-choice-avalon-t7", story: "play-avalon", turn: 7, role: "beat", purpose: `${MATCHED} New Avalon's open microphone, step 2 of 3.` },
  { id: "round-choice-avalon-t10", story: "play-avalon", turn: 10, role: "beat", purpose: `${MATCHED} New Avalon's Glass Market, the chapter's first step.` },
  { id: "round-choice-avalon-t11", story: "play-avalon", turn: 11, role: "beat", purpose: `${MATCHED} New Avalon's witness's account, step 2 of 3.` },
  { id: "round-choice-avalon-t14", story: "play-avalon", turn: 14, role: "beat", purpose: `${MISMATCH} New Avalon's workshop door, the chapter's first step (the text carried out the first result; the options answer the next step).` },
  { id: "round-choice-avalon-t16", story: "play-avalon", turn: 16, role: "beat", purpose: `${MATCHED} New Avalon's bypass promise, the chapter's last step.` },
  { id: "round-choice-lemonade-t6", story: "play-lemonade", turn: 6, role: "beat", purpose: `${MISMATCH} the lemonade earnings plan, the chapter's first step (the whole set shifted).` },
  { id: "round-choice-lemonade-t9", story: "play-lemonade", turn: 9, role: "beat", purpose: `${MATCHED} the lemonade cooler plan, the chapter's first step.` },
  { id: "round-choice-food-trucks-t14", story: "play-food-trucks", turn: 14, role: "beat", purpose: `${MISMATCH} two players in exploration threads of their own, the chapters' first step (both sets).` },
  { id: "round-choice-food-trucks-t17", story: "play-food-trucks", turn: 17, role: "beat", purpose: `${MISMATCH} two players in exploration threads of their own, the chapters' first step (both sets; Luz's results were the crew's reactions).` },
  { id: "round-choice-space-pirates-t14", story: "play-space-pirates", turn: 14, role: "beat", purpose: `${MISMATCH} three players, Juno in an exploration thread of her own beside a challenge for the other two, the chapters' first step.` },
  { id: "round-choice-plan-avalon-t2", story: "play-avalon", turn: 2, role: "thread", purpose: "A chapter plan whose challenge results say how the tracing turns out: New Avalon's first chapter." },
  { id: "round-choice-plan-avalon-t18", story: "play-avalon", turn: 18, role: "thread", purpose: `${ACTIONS} New Avalon's hearing on a deliberate move (his question folds the possibility in, he leans on the warning).` },
  { id: "round-choice-plan-avalon-t22", story: "play-avalon", turn: 22, role: "thread", purpose: `${ACTIONS} New Avalon's hearing on the Heart's future (he retracts, concedes or defends his framing; he urges immediate restoration).` },
  { id: "round-choice-plan-food-trucks-t10", story: "play-food-trucks", turn: 10, role: "thread", purpose: `${ACTIONS} the food trucks' repair yard, a two-player challenge (the owners lead with what they need, hurry Tavi).` },
  { id: "round-choice-plan-food-trucks-t17", story: "play-food-trucks", turn: 17, role: "thread", purpose: "A chapter plan whose exploration results say how others respond rather than what the player chooses: the food trucks' two exploration threads (Luz's step results are the crew's reactions)." },
];

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** The prompt hash a stored call sent, by its output file; undefined where the call is not held. */
export type PromptHashOf = (outputFile: string) => string | undefined;

/** The stage's cases from the stored runs, each only where its request is the one the run sent; and what could not be built. */
export function choiceResultCases(runs: PlayRun[], promptHashOf: PromptHashOf, specs: ChoiceCaseSpec[] = CHOICE_RESULT_CASE_SPECS): { cases: EvalCase[]; problems: string[] } {
  const cases: EvalCase[] = [];
  const problems: string[] = [];
  for (const spec of specs) {
    let replayed;
    try {
      replayed = replayedTurn(runs, spec.story, spec.turn);
    } catch (error) {
      problems.push(`${spec.id}: ${(error as Error).message}`);
      continue;
    }
    const { played, beforePlan, before } = replayed;
    let state: StoryState;
    let fixedAnalysis: FixedAnalysis | undefined;
    let sent: string | undefined;
    if (spec.role === "thread") {
      if (played.plan?.kind !== "chapter plan") {
        problems.push(`${spec.id}: turn ${spec.turn} of ${spec.story} planned no chapter`);
        continue;
      }
      state = clone(beforePlan.getState());
      sent = played.plan.calls[0]?.outputFile;
    } else {
      state = clone((played.plan ? beforePlan : before).getState());
      if (played.plan) {
        const phase = clone(before.getState().storyPhases.at(-1));
        fixedAnalysis = played.plan.kind === "switch plan" ? { kind: "switch", phase: phase as SwitchAnalysis } : { kind: "thread", phase: phase as ThreadAnalysis };
      }
      sent = played.calls[0]?.outputFile;
    }
    const evalCase = roundCase({
      id: spec.id,
      role: spec.role,
      state,
      ...(fixedAnalysis ? { fixedAnalysis } : {}),
      category: "choice-result",
      note: `${spec.purpose} Built from the stored playthrough ${spec.story} (sample 1) at turn ${spec.turn}, replayed from its start with its own plans, turns and dice (playthroughReplay.ts); its request is the one production sent there, byte for byte.`,
    });
    const rebuilt = sha256(requestText(requestFor("adopted", requestInputFor(evalCase))));
    if (!sent || rebuilt !== promptHashOf(sent)) {
      problems.push(`${spec.id}: its request is not the one the run sent at turn ${spec.turn} of ${spec.story}`);
      continue;
    }
    cases.push(evalCase);
  }
  return { cases, problems };
}

/** What --build-choice-cases freezes: every built case not frozen yet (all of them when rebuilding), and what was left as frozen. */
export function choiceResultCasesToFreeze(
  frozen: EvalCase[],
  runs: PlayRun[],
  promptHashOf: PromptHashOf,
  replace: boolean,
  specs: ChoiceCaseSpec[] = CHOICE_RESULT_CASE_SPECS
): { cases: EvalCase[]; problems: string[]; skipped: string[] } {
  const { cases, problems } = choiceResultCases(runs, promptHashOf, specs);
  const known = new Set(frozen.map((c) => c.id));
  const skipped = replace ? [] : cases.filter((c) => known.has(c.id)).map((c) => c.id);
  return { cases: cases.filter((c) => !skipped.includes(c.id)), problems, skipped };
}
