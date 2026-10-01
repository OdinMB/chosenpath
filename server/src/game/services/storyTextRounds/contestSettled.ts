import type { Story } from "core/models/Story.js";
import type { ThreadAnalysis } from "core/types/index.js";
import { CONTEST_DECIDED, contestDecidedLine, contestsDecidedHere } from "../pacing.js";
import { threadStep, type PlanRequest } from "../storyTextSteps.js";
import { replaceOnce } from "./roundEdits.js";

export { contestsDecidedHere };

/*
 * A contest's deciding chapter decides it (eval only; decision A's seal fix,
 * the coordinator's brief of the evening of 2026-10-01: a complete contest told
 * as settled).
 *
 * The cause, read from the third playthroughs' space pirates and every stored
 * last-stage plan of rounds 1-3 (a temporary probe over playthroughs.json,
 * -2.json and -3.json, replayed; deleted; no calls). The command seal ("Which
 * camp will decide the fate of the Star-Crown command-seal?", Side A / Side B
 * / mixed: Ves's custody under a shared-use pact) has two milestones. Its first
 * chapter (turn 6) named the stages "1. the camps establish their first claims;
 * 2. one camp takes custody, or both agree to Ves's shared-use pact" and played
 * stage 1 as it should ("initial confidence to shape the custody discussion
 * ... no custody is assigned"). The turns then wrote facts that the seal stays
 * unassigned while the camps argue ("The chart-table record can mark which camp
 * is invited to guide a later discussion without assigning custody"). At turn
 * 10 the switch planner grouped the deciding stage as the adopted line asks,
 * but its flavor question put the decision off: "Which camp will earn the
 * crew's confidence to shape the command-seal's custody discussion ... without
 * assigning custody or binding the crew?". The chapter planner, told in PACING
 * that this thread "settles stage 2 of 2, the last", renamed stage 2 "the
 * crew's confidence settles on a camp to shape the next custody discussion,
 * without assigning custody", asked "Which camp will earn the crew's confidence
 * to frame the command-seal's next custody discussion", and wrote three
 * milestones that each put the decision off. The completing turn (14) wrote the
 * mixed one, and the endings told the seal as its milestones left it:
 * unassigned. So the cause is the plan of the contest's last stage, not the
 * ending, which followed the milestones as the owner's decisions ask. The
 * request's own lines pull that way: the thread's question is to be "nearer
 * than its outcome's", never "the outcome's question again", and nothing says
 * that at a contest's last stage the nearer question's answer is the contest's
 * result. Round 3's food trucks did the same at the contract's last stage
 * (turn 17, Omar's pick alone): "the finalists' service limits ... inform the
 * final Festival Circuit contract decision", a brace check, the contract named
 * only by the aftermath chapter's fourth milestone. The other six stored
 * contest last stages (rounds 1-3) settled the contest; of about 38 other
 * outcomes' last stages, one put its question off (the estate agents' advocate
 * standing), so the variant reads contests only.
 *
 * The variant: production's chapter planner with, in PACING, after the
 * outcomes the players' choices set and before the recent threads, where a
 * pick sets a contested shared outcome whose thread settles its last stage (one
 * milestone still needed, in a game that plays contests), one line per such
 * outcome: this thread decides the contest; its last stage is the outcome's own
 * question and its three possible milestones are the outcome's three
 * resolutions (listed), each as this thread's situation settles it; its
 * question stays about the situation, but each milestone settles what its
 * resolution settles (a mixed resolution may itself leave something open),
 * none puts the decision off or settles only who may shape it; a switch
 * question, earlier milestone or fact saying otherwise was written before; and,
 * where not every player picked it, how one side's challenge maps onto the
 * resolutions. Everywhere else production's request byte for byte.
 *
 * Adopted after the run of 2026-10-01 (evening) as measured: on the eight
 * stored plans of rounds 1-3 at a contest's last stage, twice, read blind by
 * hand, each milestone deciding the contest 11 of 16 -> 16 of 16 (moved, p
 * 0.022). Production prints the line in threadPacingBlock (pacing.ts:
 * CONTEST_DECIDED, contestsDecidedHere, contestDecidedLine), and the kept test
 * holds production to this variant byte for byte. The variant builds on
 * production with the lines taken out (contestSettledBase,
 * withoutContestSettledLines), so it still builds as measured.
 */

const LABEL = "Contest-settled variant";

const PACING_HEADER = "======= PACING =======";

/** The passages the tests pin: production's (pacing.ts), one copy. */
export const CONTEST_SETTLED_TEXT = CONTEST_DECIDED;

/** The line for one contest decided in this thread (production's, pacing.ts). */
export const contestSettledLine = (story: Story, outcomeId: string): string => contestDecidedLine(story, outcomeId);

/** A chapter planner prompt without the lines, with the line for each contest decided here, in PACING right before its recent threads; as it is where none is. */
export function withContestSettledLines(prompt: string, story: Story): string {
  const ids = contestsDecidedHere(story);
  if (ids.length === 0) return prompt;
  const at = prompt.lastIndexOf(PACING_HEADER);
  if (at < 0) throw new Error(`${LABEL}: the prompt has no PACING block`);
  const lines = ids.map((id) => `\n${contestSettledLine(story, id)}`).join("");
  return prompt.slice(0, at) + replaceOnce(LABEL, prompt.slice(at), CONTEST_DECIDED.anchor, `${lines}${CONTEST_DECIDED.anchor}`);
}

/** A prompt with the lines taken out: production's chapter planner as it stood before the adoption (a prompt without them, as it is). */
export function withoutContestSettledLines(prompt: string, story: Story): string {
  return contestsDecidedHere(story).reduce((text, id) => text.split(`\n${contestSettledLine(story, id)}`).join(""), prompt);
}

/** Production's chapter planner as it stood before the adoption (the variant's base): its schema and assembly production's. */
export function contestSettledBase(story: Story): PlanRequest<ThreadAnalysis> {
  const production = threadStep.request(story);
  return { ...production, prompt: withoutContestSettledLines(production.prompt, story) };
}

/** The variant's chapter planner: production's as it stood before, with the lines where a contest is decided here. */
export function contestSettledRequest(story: Story): PlanRequest<ThreadAnalysis> {
  const base = contestSettledBase(story);
  return { ...base, prompt: withContestSettledLines(base.prompt, story) };
}
