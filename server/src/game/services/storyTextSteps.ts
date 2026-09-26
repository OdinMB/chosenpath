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
  createStorySetupSchema,
  createSwitchAnalysisSchema,
  threadAnalysisSchema,
  PLAYER_SLOTS,
} from "core/types/index.js";
import { createSetOfBeatGenerationSchema } from "core/types/beat.js";
import type { Story } from "core/models/Story.js";
import { templateIterationSections } from "core/utils/templateIterationSections.js";
import { StorySetupPromptService } from "./prompts/StorySetupPromptService.js";
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

function isPlayerBeat(key: string): boolean {
  return PLAYER_SLOTS.includes(key.toLowerCase());
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
      // canAddMilestones = true only if it's the ending or (a switch and not the beginning of the story)
      story.getCurrentBeatType() === "ending" ||
        (story.getCurrentBeatType() === "switch" && !story.isFirstBeat()),
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

export const setupStep = {
  request(
    premise: string,
    playerCount: PlayerCount,
    gameMode: GameMode,
    maxTurns: number,
    kind: "story" | "template"
  ): TextRequest<ReturnType<typeof createStorySetupSchema>> {
    return {
      prompt: StorySetupPromptService.createSetupPrompt(
        premise,
        playerCount,
        gameMode,
        maxTurns,
        kind
      ),
      schema: createStorySetupSchema(playerCount, kind),
    };
  },
};

/** The template schema cut down to the requested sections and this player count. */
export function partialTemplateSchema(
  sections: string[],
  playerCount: PlayerCount
): z.ZodObject<z.ZodRawShape> {
  const fullSchema = createStorySetupSchema(playerCount, "template");
  const fieldsToKeep = new Set<string>();
  for (const section of sections) {
    if (section in templateIterationSections) {
      templateIterationSections[
        section as keyof typeof templateIterationSections
      ].forEach((field) => fieldsToKeep.add(field));
    }
  }
  // Player fields match the current player count
  if (sections.includes("players")) {
    for (let i = 1; i <= playerCount; i++) {
      fieldsToKeep.add(`player${i}`);
    }
  }
  const filteredShape = Object.fromEntries(
    Object.entries(fullSchema.shape).filter(([key]) => fieldsToKeep.has(key))
  );
  return z.object(filteredShape);
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
