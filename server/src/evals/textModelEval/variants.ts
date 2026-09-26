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
import {
  trimmedBeatRequest,
  trimmedSetupRequest,
  trimmedSwitchRequest,
  trimmedThreadRequest,
} from "../../game/services/storyTextTrims.js";
import { rewriteBeatRequest, type RewriteScaffold } from "../../game/services/storyTextRewrite/beat.js";
import type { SplitTextRequest } from "../../game/services/storyTextRewrite/common.js";
import { rewriteSetupRequest } from "../../game/services/storyTextRewrite/setup.js";

/*
 * The prompt/schema variant hook. "prod" builds exactly what production
 * sends; it is also Stage 3's "full" form. The Stage 3 trims
 * (storyTextTrims.ts) drop planning fields that nothing reads after
 * generation, and the prompt lines asking for them:
 * - "slim" (beats only): the stats list, the multiplayer coordination note
 *   and six plan strings; showDontTell stays, and the options check keeps
 *   previousOptionsToAvoid and upToOneSacrificeOrRewardOption.
 * - "minimal" (setup, beats, switch, thread): every field test plan §5 lets
 *   Stage 3 drop: also showDontTell and the options check in beats, the
 *   per-player analysis and restated lists in the switch, the restated lists
 *   in the thread, and the character-selection plan in setup.
 * The Stage 4 rewrite (storyTextRewrite/) sends split requests: fixed rules
 * as a first, cacheable message, then the per-call part:
 * - "rewrite": single-player beats on production's full planning fields, and
 *   custom-story setup with production's example stat setups;
 * - "rewriteSlim": single-player beats on Stage 3's slim planning fields;
 * - "rewriteZeroShot": custom-story setup without the examples.
 */

export type VariantId = "prod" | "slim" | "minimal" | "rewrite" | "rewriteSlim" | "rewriteZeroShot";
export const VARIANTS: VariantId[] = ["prod", "slim", "minimal", "rewrite", "rewriteSlim", "rewriteZeroShot"];

/** What a variant sends: one user message (production's shape), or fixed rules then a per-call message. */
export type EvalRequest = TextRequest | SplitTextRequest;

export function isSplitRequest(request: EvalRequest): request is SplitTextRequest {
  return "fixed" in request;
}

export const MESSAGE_SEPARATOR = "\n\n----- per-call message -----\n\n";

/** The request's text as one string: for prompt storage, hashing and size estimates. */
export function requestText(request: EvalRequest): string {
  return isSplitRequest(request) ? `${request.fixed}${MESSAGE_SEPARATOR}${request.perCall}` : request.prompt;
}

/**
 * Prompt states tag which version of the production prompt code a run
 * measured. "prefix" is Run A's, before Milestone 2 fixed the prompts; that
 * code no longer exists, so only its records do.
 */
export const PRE_FIX_PROMPT_STATE = "prefix";

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
    prompt: StorySetupPromptService.createIterationPrompt(
      input.feedback,
      input.playerCount,
      input.gameMode,
      input.maxTurns,
      input.sections,
      input.template
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

function slimRequest(input: RequestInput): TextRequest {
  if (input.role !== "beat") throw new Error(`Variant slim does not cover role ${input.role}`);
  return trimmedBeatRequest(input.story, "slim");
}

function minimalRequest(input: RequestInput): TextRequest {
  switch (input.role) {
    case "setup": {
      const { premise, playerCount, gameMode, maxTurns } = input.setup;
      return trimmedSetupRequest(premise, playerCount, gameMode, maxTurns);
    }
    case "beat":
      return trimmedBeatRequest(input.story, "minimal");
    case "switch":
      return trimmedSwitchRequest(input.story);
    case "thread":
      return trimmedThreadRequest(input.story);
    case "iteration":
      throw new Error("Variant minimal does not cover role iteration");
  }
}

/** A Stage 4 variant: its setup builder (with or without examples) and its beat scaffold, where it covers them. */
function rewriteVariant(variant: VariantId, covers: { setupWithExamples?: boolean; beat?: RewriteScaffold }) {
  return (input: RequestInput): SplitTextRequest => {
    if (input.role === "setup" && covers.setupWithExamples !== undefined) {
      const { premise, playerCount, gameMode, maxTurns } = input.setup;
      return rewriteSetupRequest(premise, playerCount, gameMode, maxTurns, covers.setupWithExamples);
    }
    if (input.role === "beat" && covers.beat) return rewriteBeatRequest(input.story, covers.beat);
    throw new Error(`Variant ${variant} does not cover role ${input.role}`);
  };
}

const BUILDERS: Record<VariantId, (input: RequestInput) => EvalRequest> = {
  prod: prodRequest,
  slim: slimRequest,
  minimal: minimalRequest,
  rewrite: rewriteVariant("rewrite", { setupWithExamples: true, beat: "full" }),
  rewriteSlim: rewriteVariant("rewriteSlim", { beat: "slim" }),
  rewriteZeroShot: rewriteVariant("rewriteZeroShot", { setupWithExamples: false }),
};

export function requestFor(variant: VariantId, input: RequestInput): EvalRequest {
  return BUILDERS[variant](input);
}
