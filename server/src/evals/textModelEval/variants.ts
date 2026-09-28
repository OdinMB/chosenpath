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
import {
  PASSING_ROUND1_PARTS,
  ROUND1B_PARTS,
  ROUND1C_PARTS,
  iterationRequestFromRound1,
  iterationRound1Request,
  setupRequestFromRound1,
  setupRound1Request,
  type Round1Parts,
} from "../../game/services/storyTextRounds/setupRound1.js";
import {
  ROUND2B_BASE_PARTS,
  iterationRound2Request,
  setupRound2Request,
  type Round2Order,
  type Round2Request,
} from "../../game/services/storyTextRounds/setupRound2.js";
import { plannerV2SwitchRequest, plannerV2ThreadRequest } from "../../game/services/storyTextRounds/turnRound1Planners.js";
import { chapterTurnRequest, type ChapterFrameText, type ChapterTurnForm } from "../../game/services/storyTextRounds/turnRound1Turns.js";
import { turnRound2Request, type TurnRound2Form } from "../../game/services/storyTextRounds/turnRound2.js";
import { turnRound3FormRequest, type TurnRound3Request } from "../../game/services/storyTextRounds/turnRound3.js";
import type { CallLimits } from "shared/llm/chatModel.js";

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
 * "setupR1b" is round 1 with the round-1 report's one-sentence fixes (the
 * scoreboard names roles only and has one or two effects for two players;
 * the worked example's "Energy" renamed), so round 1's records stay as they ran.
 * "setupR1c" is round 1b with proposal 1's one fix-and-retest (every player
 * gets every player stat). "setupR2b" and "setupR2bOrder" are round 2's two arms again, on round 1b's
 * passing changes (ROUND2B_BASE_PARTS).
 * Turn round 1's candidates (storyTextRounds/turnRound1*.ts): "planV2" is
 * planner v2 for the switch and thread analysis (turn doc A2 to A6, with
 * binding late pacing), its reply assembled into today's plan shape;
 * "planV2Full" is the same with the field that restates the story's
 * switch/thread instructions kept (A5's trigger comparison). "chapterFull" is
 * a chapter step's beat with B2 and B3 rows 11, 14 and 15 on production's full
 * reply; "chapterSlim" the same on B4's slim reply, titles written by code;
 * "chapterSlimPlans" is slim's one fix-and-retest, slim with production's
 * beatTypeConsiderations and worldBuilding planning fields back (round 1 read
 * slim's facts at 3.28 per turn against B4's gate of 3.5, and the step left
 * open on 81% of turns against today's 91%).
 * Turn round 2's candidates (storyTextRounds/turnRound2.ts), every
 * single-player turn on today's form: "turnR2b" is the rest of B3, B5 to B8
 * and B1's milestone field, its first turn, switch after a chapter and ending
 * assembled into today's stored shape; "turnR2Paragraphs" adds B9 item 2 (the
 * paragraph count at the text field, the shouted copies gone). "turnR2" is the
 * name the smoke ran under (five turns): its first turn narrated the character
 * in the third person, the first-turn text was fixed, and the round runs as
 * "turnR2b" so no smoke output of the draft mixes into it. "turnR2c" is B5's one
 * fix-and-retest on turnR2b (the last paragraph at the others' length, no
 * option list in a character's mouth, the hooks rule rationing mysteries, not
 * facts).
 * Turn round 3's B9 (storyTextRounds/turnRound3.ts): "turnR3Form" is the GPT-6
 * request form, the round-2 form with B9's paragraph rule (the count at the
 * text field, the last paragraph at the others' length) sent as a split
 * request, the rules that differ per turn moved into the per-call part, with
 * production's timeout and output cap (the only variant that carries limits).
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
  | "setupR2Order"
  | "setupR1b"
  | "setupR1c"
  | "setupR2b"
  | "setupR2bOrder"
  | "planV2"
  | "planV2Full"
  | "chapterFull"
  | "chapterSlim"
  | "chapterSlimPlans"
  | "turnR2"
  | "turnR2b"
  | "turnR2Paragraphs"
  | "turnR2c"
  | "turnR3Form";
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
  "setupR1b",
  "setupR1c",
  "setupR2b",
  "setupR2bOrder",
  "planV2",
  "planV2Full",
  "chapterFull",
  "chapterSlim",
  "chapterSlimPlans",
  "turnR2",
  "turnR2b",
  "turnR2Paragraphs",
  "turnR2c",
  "turnR3Form",
];

/**
 * What a variant sends: one user message (production's shape), or fixed rules
 * then a per-call message. A one-message request may carry `assemble`: its
 * reply is written in another field order and reshaped into the saved fields.
 */
export type EvalRequest = TextRequest | Round2Request | SplitTextRequest | TurnRound3Request;

export function isSplitRequest(request: EvalRequest): request is SplitTextRequest {
  return "fixed" in request;
}

/** The timeout and output cap a request sends instead of the eval's (300 s, no cap): production's, on turn round 3's B9. */
export function callLimitsOf(request: EvalRequest): CallLimits | undefined {
  return "limits" in request ? request.limits : undefined;
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
  /** A beat case may carry its stored chapter's backfilled question and plan (chapterFrames.ts); only turn round 1's chapter turns read them */
  | { role: "beat" | "switch" | "thread"; story: Story; chapterFrames?: ChapterFrameText }
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

/**
 * Round 1b (round 1 with the round-1 report's one-sentence fixes) and round
 * 1c (round 1b with proposal 1's fix-and-retest): round 1's shape and roles.
 */
function setupRound1With(variant: VariantId, parts: Round1Parts) {
  return (input: RequestInput): TextRequest => {
    if (input.role === "setup") {
      const { premise, playerCount, gameMode, maxTurns } = input.setup;
      return setupRequestFromRound1(premise, playerCount, gameMode, maxTurns, "story", parts);
    }
    if (input.role === "iteration") {
      const { feedback, playerCount, gameMode, maxTurns, sections, template } = input.iteration;
      return iterationRequestFromRound1(feedback, playerCount, gameMode, maxTurns, sections, template, parts);
    }
    throw new Error(`Variant ${variant} does not cover role ${input.role}`);
  };
}

/**
 * Setup round 2 in one of its two orders, on round 2's base or (round 2b)
 * round 1b's passing changes; AI Iteration keeps today's order in both (setup doc A9).
 */
function setupRound2(variant: VariantId, order: Round2Order, parts: Round1Parts = PASSING_ROUND1_PARTS) {
  return (input: RequestInput): Round2Request => {
    if (input.role === "setup") {
      const { premise, playerCount, gameMode, maxTurns } = input.setup;
      return setupRound2Request(premise, playerCount, gameMode, maxTurns, "story", order, parts);
    }
    if (input.role === "iteration") {
      const { feedback, playerCount, gameMode, maxTurns, sections, template } = input.iteration;
      return iterationRound2Request(feedback, playerCount, gameMode, maxTurns, sections, template, parts);
    }
    throw new Error(`Variant ${variant} does not cover role ${input.role}`);
  };
}

/** Turn round 1's planner v2, lean or with the restated instructions: switch and thread analysis. */
function plannerV2(variant: VariantId, full: boolean) {
  return (input: RequestInput): Round2Request => {
    if (input.role === "switch") return plannerV2SwitchRequest(input.story, full);
    if (input.role === "thread") return plannerV2ThreadRequest(input.story, full);
    throw new Error(`Variant ${variant} does not cover role ${input.role}`);
  };
}

/** Turn round 1's chapter turns on the full or the slim reply: chapter steps only. */
function chapterTurn(variant: VariantId, form: ChapterTurnForm) {
  return (input: RequestInput): Round2Request => {
    if (input.role !== "beat") throw new Error(`Variant ${variant} does not cover role ${input.role}`);
    return chapterTurnRequest(input.story, form, input.chapterFrames);
  };
}

/** Turn round 2's form, or its paragraph arm: every single-player turn. */
function roundTwoTurn(variant: VariantId, form: TurnRound2Form) {
  return (input: RequestInput): Round2Request => {
    if (input.role !== "beat") throw new Error(`Variant ${variant} does not cover role ${input.role}`);
    return turnRound2Request(input.story, form);
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
  setupR1b: setupRound1With("setupR1b", ROUND1B_PARTS),
  setupR1c: setupRound1With("setupR1c", ROUND1C_PARTS),
  setupR2b: setupRound2("setupR2b", "fieldOrder", ROUND2B_BASE_PARTS),
  setupR2bOrder: setupRound2("setupR2bOrder", "generationOrder", ROUND2B_BASE_PARTS),
  planV2: plannerV2("planV2", false),
  planV2Full: plannerV2("planV2Full", true),
  chapterFull: chapterTurn("chapterFull", "full"),
  chapterSlim: chapterTurn("chapterSlim", "slim"),
  chapterSlimPlans: chapterTurn("chapterSlimPlans", "slimPlans"),
  // The smoke's draft: today's builder, whose first-turn text changed after the smoke; its records stay as the smoke's
  turnR2: roundTwoTurn("turnR2", "round2"),
  turnR2b: roundTwoTurn("turnR2b", "round2"),
  turnR2Paragraphs: roundTwoTurn("turnR2Paragraphs", "paragraphs"),
  turnR2c: roundTwoTurn("turnR2c", "retest"),
  turnR3Form: (input) => {
    if (input.role !== "beat") throw new Error(`Variant turnR3Form does not cover role ${input.role}`);
    return turnRound3FormRequest(input.story);
  },
};

export function requestFor(variant: VariantId, input: RequestInput): EvalRequest {
  return BUILDERS[variant](input);
}
