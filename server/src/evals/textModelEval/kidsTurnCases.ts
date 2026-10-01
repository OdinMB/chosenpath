import { readingAgeFromPremise } from "core/types/index.js";
import type { EvalCase } from "./cases.js";
import { choiceResultCases, type ChoiceCaseSpec, type PromptHashOf, type SentRequestText } from "./choiceResultCases.js";
import { playthroughs2Sent } from "./parallelThreadsCases.js";
import type { PlayRun } from "./playthroughs.js";

/*
 * The kids-turns stage's cases (2026-10-01, fix 6 of the second playthroughs'
 * review; no calls): turns of the second round's mouse story, read with a
 * five-year-old, frozen beside the other cases with --build-kids-cases. Each
 * is rebuilt by replaying the stored run from its start (playthroughReplay.ts)
 * and built only where its request is the one production sent there, byte for
 * byte (playthroughs2Sent: production's turn as it stood before this stage). A
 * switch turn or chapter opening is its input with its plan as its fixed
 * analysis; a chapter step or the ending is its input.
 *
 * Each is then recorded as the game records a read-with-kids story: its
 * category, which the run recorded too, and the child's age its premise
 * states (readingAgeFromPremise, "5"), which the game records since this
 * stage (StoryCreationService) and the run did not. The run sent production's
 * turn before the stage's adoption (playthroughs2Sent); production now sends
 * the stage's variant on the case.
 *
 * Every turn of the stored story ran about 300 words of grown-up prose in five
 * or six paragraphs; the cases take one of each kind: the first turn, a
 * challenge chapter's opening and step (its first reply one paragraph, retried),
 * the switch turn after it (its milestone; retried too), an exploration step
 * and the ending.
 */

const LONG = "A turn of the mouse story, read with a five-year-old, written at a grown-up story's length and words:";

export const KIDS_TURN_CASE_SPECS: ChoiceCaseSpec[] = [
  { id: "round-kids-mouse-t1", story: "play-kids-mouse", turn: 1, role: "beat", purpose: `${LONG} the first turn (Bran at the pawprint by the kitchen-side door).` },
  { id: "round-kids-mouse-t2", story: "play-kids-mouse", turn: 2, role: "beat", purpose: `${LONG} a challenge chapter's opening (the pawprint and the crumb map).` },
  { id: "round-kids-mouse-t3", story: "play-kids-mouse", turn: 3, role: "beat", purpose: `${LONG} a challenge step ("a faint, irregular tapping"; the stored first reply was one paragraph and retried).` },
  { id: "round-kids-mouse-t5", story: "play-kids-mouse", turn: 5, role: "beat", purpose: `${LONG} the switch turn after the chapter, with its milestone (the stored first reply was one paragraph and retried).` },
  { id: "round-kids-mouse-t7", story: "play-kids-mouse", turn: 7, role: "beat", purpose: `${LONG} an exploration chapter's last step (the promise at the pantry window).` },
  { id: "round-kids-mouse-t11", story: "play-kids-mouse", turn: 11, role: "beat", purpose: `${LONG} the ending (the stored one was cut at its output limit and sent again).` },
];

const CATEGORY = "kids-turns";

/**
 * The stage's cases from the second round's stored runs, each only where its request is the one the run sent, recorded
 * as a read-with-kids story with the child's age its premise states; and what could not be built.
 */
export function kidsTurnCases(
  runs: PlayRun[],
  promptHashOf: PromptHashOf,
  specs: ChoiceCaseSpec[] = KIDS_TURN_CASE_SPECS,
  sent: SentRequestText = playthroughs2Sent
): { cases: EvalCase[]; problems: string[] } {
  const built = choiceResultCases(runs, promptHashOf, specs, sent, CATEGORY);
  const problems = [...built.problems];
  const cases = built.cases.flatMap((c): EvalCase[] => {
    const spec = specs.find((s) => s.id === c.id);
    const run = runs.find((r) => r.spec.id === spec?.story && r.sample === 1);
    const age = run ? readingAgeFromPremise(run.input.premise) : undefined;
    if (!c.state || !age) {
      problems.push(`${c.id}: its story's premise states no child's age`);
      return [];
    }
    return [
      {
        ...c,
        state: { ...c.state, category: "read-with-kids", readingAge: age },
        tags: { ...c.tags, kids: true },
        note: `${c.note} Recorded as the game records a read-with-kids story: its category (the run's too) and the child's age its premise states (${age}), which the run did not record.`,
      },
    ];
  });
  return { cases, problems };
}

/** What --build-kids-cases freezes: every built case not frozen yet (all of them when rebuilding), and what was left as frozen. */
export function kidsTurnCasesToFreeze(
  frozen: EvalCase[],
  runs: PlayRun[],
  promptHashOf: PromptHashOf,
  replace: boolean,
  specs: ChoiceCaseSpec[] = KIDS_TURN_CASE_SPECS,
  sent: SentRequestText = playthroughs2Sent
): { cases: EvalCase[]; problems: string[]; skipped: string[] } {
  const { cases, problems } = kidsTurnCases(runs, promptHashOf, specs, sent);
  const known = new Set(frozen.map((c) => c.id));
  const skipped = replace ? [] : cases.filter((c) => known.has(c.id)).map((c) => c.id);
  return { cases: cases.filter((c) => !skipped.includes(c.id)), problems, skipped };
}
