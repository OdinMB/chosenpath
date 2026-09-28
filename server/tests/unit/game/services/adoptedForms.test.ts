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
import { SCOREBOARD_ENDING_RULE, adoptedSetupPrompt, adoptedTurn } from "../../../helpers/adoptedDeltas.js";

/*
 * The adoption's free final test (rounds status note, section 9, step 3):
 * production's own code, the eval's "adopted" variant, builds byte for byte
 * the requests of the variants that passed on every frozen case the eval
 * holds: the final setup form (setupR3, a case's kids tag included), planner
 * v2 with two-sided contests (planV2b) for the switch and planner v2c (the
 * nearer chapter question, 2026-09-28) for the chapter, today's turn form with B6 alone
 * (turnB6) for a single player and today's form (prod) for groups, and AI
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
    case "iteration":
      return "setupR3";
    case "switch":
      return "planV2b";
    case "thread":
      return "planV2c";
    case "beat":
      return input.story.isMultiplayer() ? "prod" : "turnB6";
  }
}

/** The measured request with the logged adoption deltas applied: what production must send. */
function expected(input: RequestInput): { prompt: string; schema: string } {
  const measured = requestFor(measuredVariant(input), input);
  const prompt = requestText(measured);
  switch (input.role) {
    case "setup":
      return { prompt: adoptedSetupPrompt(prompt, input.setup.playerCount, input.setup.gameMode), schema: json(measured) };
    case "iteration":
      return { prompt: adoptedSetupPrompt(prompt, input.iteration.playerCount, input.iteration.gameMode), schema: json(measured) };
    case "thread":
    case "switch":
      return { prompt, schema: json(measured) };
    case "beat":
      return { prompt: adoptedTurn(prompt, input.story), schema: json(measured) };
  }
}

function expectAdopted(id: string, input: RequestInput) {
  const production = requestFor("adopted", input);
  const want = expected(input);
  expect({ id, prompt: requestText(production) === want.prompt, schema: json(production) === want.schema }).toEqual({ id, prompt: true, schema: true });
}

it("reads the ending rule the tests expect from production's own constant", () => {
  expect(SCOREBOARD_ENDING_RULE).toBe(PRODUCTION_ENDING_RULE);
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
        schema: json(production) === json(measured),
      }).toEqual({ id: c.id, prompt: true, schema: true });
    }
  });
});
