import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { evalFiles } from "../../../../src/evals/textModelEval/evalFiles.js";
import { caseStory, type EvalCase } from "../../../../src/evals/textModelEval/cases.js";
import { requestInputFor } from "../../../../src/evals/textModelEval/jobPlan.js";
import { SETUP_CHAIN_PREMISES, chainSetupInput } from "../../../../src/evals/textModelEval/setupChain.js";
import { requestFor, requestText, type EvalRequest, type RequestInput, type VariantId } from "../../../../src/evals/textModelEval/variants.js";
import { SCOREBOARD_ENDING_RULE as PRODUCTION_ENDING_RULE } from "../../../../src/game/services/prompts/BeatPromptService.js";
import { ROUND3_PARTS } from "../../../../src/game/services/storyTextRounds/setupRound1.js";
import { setupRound2Request } from "../../../../src/game/services/storyTextRounds/setupRound2.js";
import { ENDING_STATE_TEXT } from "../../../../src/game/services/storyTextRounds/endingState.js";
import {
  adoptedSetupPrompt,
  adoptedTurn,
  kidsAgesAsMeasured,
  withContestLastStage,
  withKidsBandImageSlots,
  withLeverDirectionSchema,
  withResultsAsOutcomes,
  withResultsAsOutcomesSchema,
  withShortReplies,
  withThreadsThatFit,
} from "../../../helpers/adoptedDeltas.js";
import { kidsBandOf } from "core/types/index.js";
import { takesExplorationOrder } from "../../../../src/game/services/storyTextRounds/choiceResult.js";
import { takesGroupLevers } from "../../../../src/game/services/storyTextRounds/groupLevers.js";
import { takesKidsRules } from "../../../../src/game/services/kidsTurnRules.js";

/*
 * The adoption's free final test (rounds status note, section 9, step 3):
 * production's own code, the eval's "adopted" variant, builds byte for byte
 * the requests of the variants that passed on every frozen case the eval
 * holds: the final setup form (setupR3, a case's kids tag included), planner
 * v2 with two-sided contests (planV2b) for the switch and planner v2f (the
 * nearer chapter question of 2026-09-28, the outcome's stages and each step
 * once, and the step results' two rules, 2026-09-30) with the challenge-results
 * stage's measured edits (2026-10-01) for the chapter, today's
 * turn form with B6 alone (turnB6) for a single player and today's form
 * (prod) for groups, a group's rolled chapter step with B6's lever parts for
 * each rolled player (groupLeversB, the group-levers stage of 2026-10-01), an
 * exploration step with the exploration-order line
 * (choiceResult; a group's and, since the choice-line-sp stage, a single
 * player's, 2026-09-30), every ending as the ending told as its
 * milestones leave it (endingStateB, 2026-09-30), a turn read with a child,
 * every player count, and a kids setup for a child of 9 or older by the
 * children's age band (kidsAges, 2026-10-01; a single player's 6-8 turn is
 * the kids-turns stage's kidsTurn, which adoptedTurns.test.ts holds), every
 * turn with the short-replies stage's two lines (shortReplies, 2026-10-01; a
 * kids turn's kidsAges carries them, built on production's live turn), and AI
 * Iteration on setup round 3's text. The only differences are the logged
 * ones in adoptedDeltas.ts. The frozen cases live in the eval's output
 * folder (DOCS/, not in git), so this suite runs where they exist; the
 * adoptedSetup, adoptedPlanners and adoptedTurns tests hold the same on
 * stories built in the tests, everywhere.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const CASES_DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const frozen: EvalCase[] = fs.existsSync(path.join(CASES_DIR, "cases", "cases.json")) ? evalFiles(CASES_DIR).readCases() : [];
const whenFrozen = frozen.length ? describe : describe.skip;

const json = (request: EvalRequest) => JSON.stringify(toJsonSchema(request.schema as Parameters<typeof toJsonSchema>[0]));

/** The variant that measured what production sends for this input. */
function measuredVariant(input: RequestInput): VariantId {
  switch (input.role) {
    case "setup":
      // A kids setup whose youngest child is 9 or older since the kids-ages stage (2026-10-01): a third visible player stat
      return input.setup.kids && input.setup.kidAges && kidsBandOf(input.setup.kidAges) === "9-12" ? "kidsAges" : "setupR3";
    case "iteration":
      return "setupR3";
    case "switch":
      return "planV2b";
    case "thread":
      // Planner v2f since the choice-result stage of 2026-09-30 (planner v2e with the step results' two rules); planner v2e
      // (planner v2c with the outcome's stages and each step once) before, earlier that day, and planner v2c until then
      return "planV2f";
    case "beat":
      // A turn read with a child, every player count, since the kids-ages stage (2026-10-01): as long and as plain as
      // the children's age band reads, every turn kind, as measured (a single player's 6-8 turn is the kids-turns
      // stage's kidsTurn, which adoptedTurns.test.ts holds)
      if (takesKidsRules(input.story)) return "kidsAges";
      // Every ending since 2026-09-30: the ending told as its milestones leave it
      if (input.story.getCurrentBeatType() === "ending") return "endingStateB";
      // A group's chapter step with a player in a challenge or contest thread since the group-levers stage (2026-10-01):
      // B6's lever parts for each such player, the plan's lever question asked from the player's line (groupLeversB)
      if (takesGroupLevers(input.story)) return "groupLeversB";
      // An exploration step: the exploration-order line (choiceResult as measured), a group's since the choice-result stage,
      // a single player's since the choice-line-sp stage (measured with production's one retry of a short reply in the loop)
      if (takesExplorationOrder(input.story)) return "choiceResult";
      return input.story.isMultiplayer() ? "prod" : "turnB6";
  }
}

/** The measured request with the logged adoption deltas applied: what production must send. */
function expected(input: RequestInput): { prompt: string; schema: string } {
  const variant = measuredVariant(input);
  const measured = requestFor(variant, input);
  const prompt = requestText(measured);
  // kidsAges is built on production's grown-up turn and production's kids setup, which the other cases hold to theirs;
  // a kids turn that shows images carries the logged picture places by band (no case of the stage showed images)
  if (variant === "kidsAges") {
    if (input.role !== "beat") return { prompt, schema: json(measured) };
    const adopted = withKidsBandImageSlots(kidsAgesAsMeasured({ prompt, json: json(measured) }, input.story), input.story);
    return { prompt: adopted.prompt, schema: adopted.json };
  }
  switch (input.role) {
    // Since the lever-direction adoption (2026-10-01): the measured line and lever fields, wherever the setup carries them
    case "setup":
      return { prompt: adoptedSetupPrompt(prompt, input.setup.playerCount, input.setup.gameMode), schema: withLeverDirectionSchema(json(measured)) };
    case "iteration":
      return { prompt: adoptedSetupPrompt(prompt, input.iteration.playerCount, input.iteration.gameMode), schema: withLeverDirectionSchema(json(measured)) };
    case "thread":
      // Since the challenge-results stage (2026-10-01): results and milestones that never restate the approach, as measured
      return { prompt: withResultsAsOutcomes(prompt, input.story), schema: withResultsAsOutcomesSchema(json(measured), input.story) };
    case "switch":
      // Since the parallel-threads stage (2026-10-01): a contest's last stage offered only as a grouped thread, as measured
      return { prompt: withContestLastStage(withThreadsThatFit(prompt, input.story), input.story), schema: json(measured) };
    case "beat": {
      // Since the short-replies stage (2026-10-01): every turn's text goes on after its first paragraph, as measured
      const lined = withShortReplies({ prompt: adoptedTurn(prompt, input.story), schema: (measured as { schema: Parameters<typeof toJsonSchema>[0] }).schema });
      return { prompt: lined.prompt, schema: lined.json };
    }
  }
}

function expectAdopted(id: string, input: RequestInput) {
  const production = requestFor("adopted", input);
  const want = expected(input);
  expect({ id, prompt: requestText(production) === want.prompt, schema: json(production) === want.schema }).toEqual({ id, prompt: true, schema: true });
}

it("sends the measured ending's scoreboard rule, with its unfinished half, from production's own constant", () => {
  expect(PRODUCTION_ENDING_RULE).toBe(ENDING_STATE_TEXT.contestRule);
});

whenFrozen("production builds the measured requests on every frozen case", () => {
  it.each(["setup", "iteration", "switch", "thread", "beat"] as const)("every %s case", (role) => {
    const cases = frozen.filter((c) => c.role === role);
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) {
      const input = requestInputFor(c);
      expectAdopted(c.id, input.role === "beat" ? { ...input, story: caseStory(c) } : input);
    }
  });

  it("the setup-to-play chain's four premises, as the chain built them", () => {
    for (const premise of SETUP_CHAIN_PREMISES) expectAdopted(premise.id, { role: "setup", setup: chainSetupInput(premise) });
  });

  it("every setup case as a template (the template editor's AI Draft, the final check's adoptedTemplate): setup round 3's template form", () => {
    const cases = frozen.filter((c) => c.role === "setup");
    for (const c of cases) {
      const input = requestInputFor(c);
      if (input.role !== "setup") throw new Error(`${c.id} is not a setup case`);
      const { premise, playerCount, gameMode, maxTurns } = input.setup;
      // Production's template generation has no category, so no kids budget, whatever the case's tag
      const measured = setupRound2Request(premise, playerCount, gameMode, maxTurns, "template", "generationOrder", ROUND3_PARTS);
      const production = requestFor("adoptedTemplate", input);
      expect({
        id: c.id,
        prompt: requestText(production) === adoptedSetupPrompt(measured.prompt, playerCount, gameMode),
        schema: json(production) === withLeverDirectionSchema(json(measured)),
      }).toEqual({ id: c.id, prompt: true, schema: true });
    }
  });
});
