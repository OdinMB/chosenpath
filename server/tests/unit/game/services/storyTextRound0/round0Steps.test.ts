import { describe, expect, it } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { createStorySetupSchema, GameModes, threadAnalysisSchema } from "core/types/index.js";
import {
  round0BeatStep,
  round0IterationRequest,
  round0PartialTemplateSchema,
  round0SetupStep,
  round0SwitchStep,
  round0ThreadStep,
} from "../../../../../src/game/services/storyTextRound0/round0Steps.js";
import { requestFor, requestText } from "../../../../../src/evals/textModelEval/variants.js";
import { firstThreadAnalysis, laterSwitchBeat, switchAnalysisAfterThread, threadBeat } from "../../../../helpers/promptStories.js";

/*
 * Today's form at the round0 prompt state, frozen when the eval's
 * carried-forward forms were adopted (2026-09-28): the eval's "prod" variant
 * builds it, and the round variants edit it. Passages production dropped at
 * the adoption pin that the copy is the old form.
 */

const PREMISE = "A lighthouse keeper's last winter";

describe("the round0 form stays today's form as it ran", () => {
  it("setup: the old outcome budget, the two example stat setups and core's schema", () => {
    const request = round0SetupStep.request(PREMISE, 2, GameModes.Competitive, 25, "story");
    expect(request.prompt).toContain("--- For each player, (3 - number of shared outcomes) individual outcomes");
    expect(request.prompt).toContain("EXAMPLE STAT SETUPS");
    expect(request.prompt).toContain("Premise: The last rock band on Mars tries to make it");
    expect(JSON.stringify(toJsonSchema(request.schema))).toBe(JSON.stringify(toJsonSchema(createStorySetupSchema(2, "story"))));
  });

  it("AI Iteration: production's iteration prompt of the time, the template schema cut to the sections", () => {
    const request = round0IterationRequest("Sharper", 2, GameModes.Competitive, 20, ["stats"], { title: "T" });
    expect(request.prompt).toContain("You must ONLY regenerate the following sections:\nstats");
    expect(JSON.stringify(toJsonSchema(request.schema))).toBe(JSON.stringify(toJsonSchema(round0PartialTemplateSchema(["stats"], 2))));
  });

  it("planners: the old thread shares and the switch planner's steps 1a to c", () => {
    expect(round0ThreadStep.request(firstThreadAnalysis(1)).prompt).toContain("(~30% of all threads)");
    expect(round0ThreadStep.request(firstThreadAnalysis(1)).schema).toBe(threadAnalysisSchema);
    expect(round0SwitchStep.request(switchAnalysisAfterThread(1)).prompt).toContain("Follow steps 1a - c for each player");
  });

  it("beats: today's base-point line, with no option rules", () => {
    const prompt = round0BeatStep.request(threadBeat(1)).prompt;
    expect(prompt).toContain("--- basePoints: for normal resource types: assign a value between +5 to -15.");
    expect(prompt).not.toContain("The three options are three different ways to act");
    expect(round0BeatStep.request(laterSwitchBeat(1)).prompt).toContain("NEW MILESTONES: To resolve the previous set of threads");
  });

  it("is what the eval's prod variant builds", () => {
    const story = threadBeat(1);
    expect(requestText(requestFor("prod", { role: "beat", story }))).toBe(round0BeatStep.request(story).prompt);
    const setup = { premise: PREMISE, playerCount: 1 as const, gameMode: GameModes.SinglePlayer, maxTurns: 25 };
    expect(requestText(requestFor("prod", { role: "setup", setup }))).toBe(round0SetupStep.request(PREMISE, 1, GameModes.SinglePlayer, 25, "story").prompt);
  });
});
