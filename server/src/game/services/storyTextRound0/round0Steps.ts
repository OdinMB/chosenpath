import { z } from "zod";
import type { GameMode, PlayerCount } from "core/types/index.js";
import { createStorySetupSchema, createSwitchAnalysisSchema, threadAnalysisSchema } from "core/types/index.js";
import { createSetOfBeatGenerationSchema } from "core/types/beat.js";
import type { TemplateIterationSections } from "core/types/admin.js";
import type { Story } from "core/models/Story.js";
import { templateIterationSections } from "core/utils/templateIterationSections.js";
import { canAddMilestones, type TextRequest } from "../storyTextSteps.js";
import { Round0SetupPromptService } from "./Round0SetupPromptService.js";
import { Round0SwitchPromptService } from "./Round0SwitchPromptService.js";
import { Round0ThreadPromptService } from "./Round0ThreadPromptService.js";
import { Round0BeatPromptService } from "./Round0BeatPromptService.js";

/*
 * The requests production built at the "round0" prompt state (after the
 * Round 0 play fixes of 2026-09-27), frozen when the eval's carried-forward
 * forms were adopted into production (2026-09-28): each role's prompt, from
 * this folder's frozen prompt services, and its schema, from core's zod
 * instances (unchanged by the adoption, which extends them in the server).
 * Eval only. The eval's "prod" variant is this ("today's form" in every round
 * report), and every eval variant that edits production's text (the setup
 * and turn rounds, the Stage 3 trims, the Stage 4 rewrite, the chapter
 * backfill) starts from here, so their requests stay byte for byte as they
 * ran. How a reply changes the story (apply) stays production's
 * (storyTextSteps.ts). Production's own requests: storyTextSteps.ts.
 */

export const round0BeatStep = {
  request(story: Story): TextRequest<ReturnType<typeof createSetOfBeatGenerationSchema>> {
    const schema = createSetOfBeatGenerationSchema(
      story.getNumberOfPlayers(),
      canAddMilestones(story),
      story.isMultiplayer(),
      story.generatesImages(),
      story.hasImages()
    );
    return { prompt: Round0BeatPromptService.createBeatPrompt(story), schema };
  },
};

export const round0SwitchStep = {
  request(story: Story): TextRequest<ReturnType<typeof createSwitchAnalysisSchema>> {
    return {
      prompt: Round0SwitchPromptService.createSwitchAnalysisPrompt(story),
      schema: createSwitchAnalysisSchema(Object.keys(story.getPlayers()).length as PlayerCount),
    };
  },
};

export const round0ThreadStep = {
  request(story: Story): TextRequest<typeof threadAnalysisSchema> {
    return { prompt: Round0ThreadPromptService.createThreadPrompt(story), schema: threadAnalysisSchema };
  },
};

export const round0SetupStep = {
  request(
    premise: string,
    playerCount: PlayerCount,
    gameMode: GameMode,
    maxTurns: number,
    kind: "story" | "template"
  ): TextRequest<ReturnType<typeof createStorySetupSchema>> {
    return {
      prompt: Round0SetupPromptService.createSetupPrompt(premise, playerCount, gameMode, maxTurns, kind),
      schema: createStorySetupSchema(playerCount, kind),
    };
  },
};

/** Round0's AI Iteration schema: the template schema cut down to the requested sections and this player count. */
export function round0PartialTemplateSchema(sections: string[], playerCount: PlayerCount): z.ZodObject<z.ZodRawShape> {
  const fullSchema = createStorySetupSchema(playerCount, "template");
  const fieldsToKeep = new Set<string>();
  for (const section of sections) {
    if (section in templateIterationSections) {
      templateIterationSections[section as keyof typeof templateIterationSections].forEach((field) => fieldsToKeep.add(field));
    }
  }
  // Player fields match the current player count
  if (sections.includes("players")) {
    for (let i = 1; i <= playerCount; i++) {
      fieldsToKeep.add(`player${i}`);
    }
  }
  const filteredShape = Object.fromEntries(Object.entries(fullSchema.shape).filter(([key]) => fieldsToKeep.has(key)));
  return z.object(filteredShape);
}

/** Round0's AI Iteration request, as TemplateService.iterateTemplate built it. */
export function round0IterationRequest(
  feedback: string,
  playerCount: PlayerCount,
  gameMode: GameMode,
  maxTurns: number,
  sections: TemplateIterationSections[],
  template: object
): TextRequest {
  return {
    prompt: Round0SetupPromptService.createIterationPrompt(feedback, playerCount, gameMode, maxTurns, sections, template),
    schema: round0PartialTemplateSchema(sections, playerCount),
  };
}
