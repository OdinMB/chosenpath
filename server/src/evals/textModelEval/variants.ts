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
import type { RewriteCounts, SplitTextRequest } from "../../game/services/storyTextRewrite/common.js";
import { rewriteSetupRequest } from "../../game/services/storyTextRewrite/setup.js";
import { iterationRound1Request, setupRound1Request } from "../../game/services/storyTextRounds/setupRound1.js";
import { iterationRound2Request, setupRound2Request, type Round2Order, type Round2Request } from "../../game/services/storyTextRounds/setupRound2.js";

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
 * These three keep Stage 4's enforced list counts, so its records stay
 * reproducible. Stage 4b's count fix builds the same three with the counts
 * in words and caps only ("worded", see storyTextRewrite/common.ts):
 * "rewrite2", "rewrite2Slim" and "rewrite2ZeroShot".
 * The setup rounds' candidates edit production's request in its own shape
 * (storyTextRounds/): "setupR1" is setup round 1 of the setup document
 * (outcome slates, the scoreboard, the engine facts, stats that act, one
 * worked example, questions that name the stake), for custom-story setup and
 * AI Iteration; its template form is setupRound1Request's "template" kind.
 * "setupR2" and "setupR2Order" are setup round 2's two arms: steering
 * (proposal 7) on round 1's passing proposals (3, 4 and 6), in today's field
 * order and in proposal 9's generation order, whose reply is assembled into
 * the fields saved today before anything reads it (assembledReply).
 */

export type VariantId =
  | "prod"
  | "slim"
  | "minimal"
  | "rewrite"
  | "rewriteSlim"
  | "rewriteZeroShot"
  | "rewrite2"
  | "rewrite2Slim"
  | "rewrite2ZeroShot"
  | "setupR1"
  | "setupR2"
  | "setupR2Order";
export const VARIANTS: VariantId[] = [
  "prod",
  "slim",
  "minimal",
  "rewrite",
  "rewriteSlim",
  "rewriteZeroShot",
  "rewrite2",
  "rewrite2Slim",
  "rewrite2ZeroShot",
  "setupR1",
  "setupR2",
  "setupR2Order",
];

/**
 * What a variant sends: one user message (production's shape), or fixed rules
 * then a per-call message. A one-message request may carry `assemble`: its
 * reply is written in another field order and reshaped into the saved fields.
 */
export type EvalRequest = TextRequest | Round2Request | SplitTextRequest;

export function isSplitRequest(request: EvalRequest): request is SplitTextRequest {
  return "fixed" in request;
}

/** A parsed reply as the fields saved today: assembled where the request writes another order, else as it came. */
export function assembledReply(request: EvalRequest, parsed: unknown): unknown {
  return "assemble" in request && request.assemble ? request.assemble(parsed) : parsed;
}

export const MESSAGE_SEPARATOR = "\n\n----- per-call message -----\n\n";

/** The request's text as one string: for prompt storage, hashing and size estimates. */
export function requestText(request: EvalRequest): string {
  return isSplitRequest(request) ? `${request.fixed}${MESSAGE_SEPARATOR}${request.perCall}` : request.prompt;
}

/**
 * Prompt states tag which version of the production prompt code a run
 * measured. "prefix" is Run A's, before Milestone 2 fixed the prompts;
 * "postfix" is Round 1's to Stage 4b's, before the Round 0 play fixes
 * (2026-09-27) changed the state text and the multiplayer first-thread rule.
 * Neither code exists any more, so only their records do: they are still
 * read (pages, scores, reports), but a --run under either tag would mix two
 * prompt versions in one state, so it is refused.
 */
export const PRE_FIX_PROMPT_STATE = "prefix";

/**
 * The tag for today's production prompts, after the Round 0 play fixes. The
 * dry run plans under it when no --prompt-state is given. A change to the
 * production prompts retires it: add it to RETIRED_PROMPT_STATES and set a new one.
 */
export const CURRENT_PROMPT_STATE = "round0";

const RETIRED_PROMPT_STATES = new Map<string, string>([
  [
    PRE_FIX_PROMPT_STATE,
    `The pre-fix prompts no longer exist in the code (Run A recorded them), so --prompt-state prefix would mix post-fix prompts into pre-fix results. Use a new tag such as "${CURRENT_PROMPT_STATE}".`,
  ],
  [
    "postfix",
    `The production prompts changed after the postfix records (the Round 0 play fixes of 2026-09-27), so --prompt-state postfix would mix two prompt versions. Use a new tag such as "${CURRENT_PROMPT_STATE}".`,
  ],
]);

/** Why --run (and the dry run) refuses this prompt state, or undefined when it may record under it. */
export function retiredPromptStateProblem(promptState: string): string | undefined {
  return RETIRED_PROMPT_STATES.get(promptState);
}

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

/** A Stage 4 variant: its counts form, its setup builder (with or without examples) and its beat scaffold, where it covers them. */
function rewriteVariant(variant: VariantId, counts: RewriteCounts, covers: { setupWithExamples?: boolean; beat?: RewriteScaffold }) {
  return (input: RequestInput): SplitTextRequest => {
    if (input.role === "setup" && covers.setupWithExamples !== undefined) {
      const { premise, playerCount, gameMode, maxTurns } = input.setup;
      return rewriteSetupRequest(premise, playerCount, gameMode, maxTurns, covers.setupWithExamples, counts);
    }
    if (input.role === "beat" && covers.beat) return rewriteBeatRequest(input.story, covers.beat, counts);
    throw new Error(`Variant ${variant} does not cover role ${input.role}`);
  };
}

/** Setup round 1: custom-story setup and AI Iteration in production's one-message shape. */
function setupRound1(input: RequestInput): TextRequest {
  if (input.role === "setup") {
    const { premise, playerCount, gameMode, maxTurns } = input.setup;
    return setupRound1Request(premise, playerCount, gameMode, maxTurns, "story");
  }
  if (input.role === "iteration") {
    const { feedback, playerCount, gameMode, maxTurns, sections, template } = input.iteration;
    return iterationRound1Request(feedback, playerCount, gameMode, maxTurns, sections, template);
  }
  throw new Error(`Variant setupR1 does not cover role ${input.role}`);
}

/** Setup round 2 in one of its two orders; AI Iteration keeps today's order in both (setup doc A9). */
function setupRound2(variant: VariantId, order: Round2Order) {
  return (input: RequestInput): Round2Request => {
    if (input.role === "setup") {
      const { premise, playerCount, gameMode, maxTurns } = input.setup;
      return setupRound2Request(premise, playerCount, gameMode, maxTurns, "story", order);
    }
    if (input.role === "iteration") {
      const { feedback, playerCount, gameMode, maxTurns, sections, template } = input.iteration;
      return iterationRound2Request(feedback, playerCount, gameMode, maxTurns, sections, template);
    }
    throw new Error(`Variant ${variant} does not cover role ${input.role}`);
  };
}

const BUILDERS: Record<VariantId, (input: RequestInput) => EvalRequest> = {
  prod: prodRequest,
  slim: slimRequest,
  minimal: minimalRequest,
  rewrite: rewriteVariant("rewrite", "exact", { setupWithExamples: true, beat: "full" }),
  rewriteSlim: rewriteVariant("rewriteSlim", "exact", { beat: "slim" }),
  rewriteZeroShot: rewriteVariant("rewriteZeroShot", "exact", { setupWithExamples: false }),
  rewrite2: rewriteVariant("rewrite2", "worded", { setupWithExamples: true, beat: "full" }),
  rewrite2Slim: rewriteVariant("rewrite2Slim", "worded", { beat: "slim" }),
  rewrite2ZeroShot: rewriteVariant("rewrite2ZeroShot", "worded", { setupWithExamples: false }),
  setupR1: setupRound1,
  setupR2: setupRound2("setupR2", "fieldOrder"),
  setupR2Order: setupRound2("setupR2Order", "generationOrder"),
};

export function requestFor(variant: VariantId, input: RequestInput): EvalRequest {
  return BUILDERS[variant](input);
}
