import type { Story } from "core/models/Story.js";
import type { GameMode, PlayerCount } from "core/types/index.js";
import type { TemplateIterationSections } from "core/types/admin.js";
import { StorySetupPromptService } from "../../game/services/prompts/StorySetupPromptService.js";
import {
  beatStep,
  partialTemplateSchema,
  setupStep,
  switchStep,
  threadStep,
  type TextRequest,
} from "../../game/services/storyTextSteps.js";

/*
 * The prompt/schema variant hook. "prod" builds exactly what production
 * sends. Later milestones add their variants here (Stage 3 schema trims,
 * Stage 4 rewrite); the request type will then widen to messages.
 */

export type VariantId = "prod";
export const VARIANTS: VariantId[] = ["prod"];

export type SetupInput = {
  premise: string;
  playerCount: PlayerCount;
  gameMode: GameMode;
  maxTurns: number;
};

export type IterationInput = {
  /** The template as serialised into the prompt, without creatorId and creatorUsername */
  template: Record<string, unknown>;
  feedback: string;
  sections: TemplateIterationSections[];
  playerCount: PlayerCount;
  gameMode: GameMode;
  maxTurns: number;
};

export type RequestInput =
  | { role: "setup"; setup: SetupInput }
  | { role: "beat" | "switch" | "thread"; story: Story }
  | { role: "iteration"; iteration: IterationInput };

/** Template iteration exactly as TemplateService.iterateTemplate builds it. */
function iterationRequest(input: IterationInput): TextRequest {
  return {
    prompt: StorySetupPromptService.createSetupPrompt(
      input.feedback,
      input.playerCount,
      input.gameMode,
      input.maxTurns,
      true,
      input.sections,
      JSON.stringify(input.template)
    ),
    schema: partialTemplateSchema(input.sections, input.playerCount),
  };
}

function prodRequest(input: RequestInput): TextRequest {
  switch (input.role) {
    case "setup": {
      const { premise, playerCount, gameMode, maxTurns } = input.setup;
      return setupStep.request(premise, playerCount, gameMode, maxTurns, "story");
    }
    case "beat":
      return beatStep.request(input.story);
    case "switch":
      return switchStep.request(input.story);
    case "thread":
      return threadStep.request(input.story);
    case "iteration":
      return iterationRequest(input.iteration);
  }
}

const BUILDERS: Record<VariantId, (input: RequestInput) => TextRequest> = {
  prod: prodRequest,
};

export function requestFor(variant: VariantId, input: RequestInput): TextRequest {
  return BUILDERS[variant](input);
}
