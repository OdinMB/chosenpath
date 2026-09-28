import { z } from "zod";
import type {
  Beat,
  BeatGeneration,
  BeatType,
  Change,
  GameMode,
  ImageRequest,
  PlayerCount,
  SetOfBeatGenerationSchema,
  SwitchAnalysis,
  ThreadAnalysis,
} from "core/types/index.js";
import {
  createSwitchAnalysisSchema,
  threadAnalysisSchema,
  PLAYER_SLOTS,
} from "core/types/index.js";
import { createSetOfBeatGenerationSchema } from "core/types/beat.js";
import type { TemplateIterationSections } from "core/types/admin.js";
import type { Story } from "core/models/Story.js";
import { StorySetupPromptService, type SetupPromptOptions } from "./prompts/StorySetupPromptService.js";
import { assembleSetupReply, iterationSchema, setupGenerationSchema } from "./setupSchema.js";
import { SwitchPromptService } from "./prompts/SwitchPromptService.js";
import { ThreadPromptService } from "./prompts/ThreadPromptService.js";
import { BeatPromptService } from "./prompts/BeatPromptService.js";

/*
 * The model-free half of each story text role: the exact prompt and zod
 * schema production sends, and how a beat or analysis response changes the
 * story. No I/O. AIStoryGenerator (production) and the text-model eval both
 * build their requests here, so the eval measures what production sends.
 */

export type TextRequest<S extends z.ZodTypeAny = z.ZodTypeAny> = {
  prompt: string;
  schema: S;
};

/** Whether a beat reply's key holds a player's beat ("player1", …). */
export function isPlayerBeat(key: string): boolean {
  return PLAYER_SLOTS.includes(key.toLowerCase());
}

/** Whether this turn may add milestones: the ending, or a switch after the first beat. */
export function canAddMilestones(story: Story): boolean {
  const beatType = story.getCurrentBeatType();
  return beatType === "ending" || (beatType === "switch" && !story.isFirstBeat());
}

function applyBeats(
  story: Story,
  response: SetOfBeatGenerationSchema,
  skipImageRequests: boolean
): [Story, ImageRequest[]] {
  let updatedStory = story.clone();
  const imageRequests: ImageRequest[] = [];

  Object.entries(response).forEach(([key, value]) => {
    if (isPlayerBeat(key)) {
      const playerSlot = key.toLowerCase();
      const beatData = value as BeatGeneration;

      if (updatedStory.getPlayer(playerSlot)) {
        const beat: Beat = {
          ...beatData,
          choice: -1,
          resolution: null,
        };

        updatedStory = updatedStory.addBeatToPlayer(playerSlot, beat);

        // Only collect image requests if generateImages is true AND we're not skipping them
        if (
          !skipImageRequests &&
          story.generatesImages() &&
          beat.imageRequest &&
          typeof beat.imageRequest === "object"
        ) {
          imageRequests.push(beat.imageRequest as ImageRequest);
        }
      } else {
        throw new Error(
          `Player ${playerSlot} not found in story. This should never happen.`
        );
      }
    }
  });

  return [updatedStory, imageRequests];
}

/** Stat changes, milestones, facts, new elements and introductions, in that order. */
function mergeChanges(response: SetOfBeatGenerationSchema): Change[] {
  const playerBeats = Object.entries(response)
    .filter(([key]) => isPlayerBeat(key))
    .map(([, value]) => value as BeatGeneration);

  const allEstablishedFacts = playerBeats.flatMap(
    (beat) => beat.plan.establishedFacts || []
  );
  const allNewGameElements = playerBeats.flatMap(
    (beat) => beat.plan.newGameElements || []
  );
  const allNewIntroductions = playerBeats.flatMap(
    (beat) => beat.plan.newIntroductionsOfStoryElements || []
  );

  return [
    ...(response.statChanges || []),
    ...(response.newMilestones || []),
    ...allEstablishedFacts,
    ...allNewGameElements,
    ...allNewIntroductions,
  ];
}

export const beatStep = {
  request(story: Story): TextRequest<ReturnType<typeof createSetOfBeatGenerationSchema>> {
    const schema = createSetOfBeatGenerationSchema(
      story.getNumberOfPlayers(),
      canAddMilestones(story),
      // multiplayerCoordination = true only if it's a multiplayer game
      story.isMultiplayer(),
      story.generatesImages(),
      story.hasImages()
    );
    return { prompt: BeatPromptService.createBeatPrompt(story), schema };
  },

  /** The story with the new beats added, the changes to apply, and image requests. */
  apply(
    story: Story,
    response: SetOfBeatGenerationSchema,
    skipImageRequests: boolean = false
  ): [Story, Change[], ImageRequest[]] {
    const [updatedStory, imageRequests] = applyBeats(story, response, skipImageRequests);
    return [updatedStory, mergeChanges(response), imageRequests];
  },
};

export const switchStep = {
  request(story: Story): TextRequest<ReturnType<typeof createSwitchAnalysisSchema>> {
    return {
      prompt: SwitchPromptService.createSwitchAnalysisPrompt(story),
      schema: createSwitchAnalysisSchema(
        Object.keys(story.getPlayers()).length as PlayerCount
      ),
    };
  },

  apply(story: Story, response: SwitchAnalysis): Story {
    const firstBeatIndexOfSwitch = story.getCurrentTurn();
    return story.addPhase({
      ...response,
      firstBeatIndex: firstBeatIndexOfSwitch,
      duration: 1,
    });
  },
};

export const threadStep = {
  request(story: Story): TextRequest<typeof threadAnalysisSchema> {
    return {
      prompt: ThreadPromptService.createThreadPrompt(story),
      schema: threadAnalysisSchema,
    };
  },

  apply(story: Story, response: ThreadAnalysis): Story {
    const firstBeatIndexOfThread = story.getCurrentTurn();

    const transformedThreads = response.threads.map((thread) => ({
      ...thread,
      firstBeatIndex: firstBeatIndexOfThread,
      duration: response.duration,
      progression: thread.progression.map((step) => ({
        ...step,
        resolution: null,
      })),
      resolution: null,
      milestone: null,
    }));

    const transformedResponse: ThreadAnalysis = {
      ...response,
      firstBeatIndex: firstBeatIndexOfThread,
      threads: transformedThreads,
    };

    // Players' previousTypesOfThreads include the new thread type
    return story
      .updatePlayerPreviousThreadTypes(transformedThreads)
      .addPhase(transformedResponse);
  },
};

/** A setup request whose reply is written in the generation order: `assemble` turns it into the fields saved today. */
export type SetupRequest = TextRequest<z.AnyZodObject> & {
  assemble: (reply: unknown) => Record<string, unknown>;
};

export const setupStep = {
  /**
   * A new custom story or template from a premise (setup round 3's form):
   * the story's length sizes the outcome slate, and a story read with a child
   * (`kids`) gets the smaller stat budget with plain names.
   */
  request(
    premise: string,
    playerCount: PlayerCount,
    gameMode: GameMode,
    maxTurns: number,
    kind: "story" | "template",
    options: SetupPromptOptions = {}
  ): SetupRequest {
    return {
      prompt: StorySetupPromptService.createSetupPrompt(premise, playerCount, gameMode, maxTurns, kind, options),
      schema: setupGenerationSchema(playerCount, gameMode, kind, options),
      assemble: (reply) => assembleSetupReply(reply, playerCount, kind),
    };
  },
};

export const iterationStep = {
  /** AI Iteration on the given sections of a template (today's field order; the template goes without its creator). */
  request(
    feedback: string,
    playerCount: PlayerCount,
    gameMode: GameMode,
    maxTurns: number,
    sections: TemplateIterationSections[],
    template: object
  ): TextRequest<z.ZodObject<z.ZodRawShape>> {
    return {
      prompt: StorySetupPromptService.createIterationPrompt(feedback, playerCount, gameMode, maxTurns, sections, template),
      schema: partialTemplateSchema(sections, playerCount, gameMode),
    };
  },
};

/** The template schema with the adopted descriptions, cut down to the requested sections and this player count. */
export function partialTemplateSchema(
  sections: string[],
  playerCount: PlayerCount,
  gameMode: GameMode
): z.ZodObject<z.ZodRawShape> {
  return iterationSchema(sections, playerCount, gameMode);
}

/** Which analysis call runs before the next beat, if any. */
export function analysisBefore(
  story: Story,
  nextBeatType: BeatType
): "switch" | "thread" | undefined {
  if (nextBeatType === "switch") {
    return "switch";
  }
  if (nextBeatType === "thread" && story.getCurrentThreadBeatsCompleted() === 0) {
    return "thread";
  }
  return undefined;
}
