import { z } from "zod";
import { changeSchema } from "./change.js";
import { PlayerCount } from "./players.js";
import type { Change } from "./change.js";

export const beatPlanSchema = z.object({
  stateChanges: z
    .string()
    .describe(
      "Bullet list with changes to the story state and the decisions of other players and how we should narrate them to this player. In multiplayer games, go through each other player's decision."
    ),
  otherBeats: z
    .string()
    .describe(
      "Bullet list with information from other beats in this turn that we must consider for this beat. If the player is in the same scene as other player(s) whose beat you created before, copy those beats here in their entirety (to make sure that the details are consistent). If this is the beat for player1, leave this empty."
    ),
  sceneProgress: z
    .string()
    .describe(
      "List the number of beats that the player has spent in the current scene. Then decide if we should continue the scene or thread of the previous beat or start a new one. If the player has spent 2 or more beats in this scene/on this thread, offer the player an option to go to another scene/thread. If it's 3 or more, offer only options that go to another scene. (Unless it's a showdown of some kind.)"
    ),
  storyProgress: z
    .string()
    .describe(
      "Say how many beats we have left in this story. Then create a list of outcomes, summarizing how close we are to resolving them. Then decide how we should make progress towards unresolved story outcomes."
    ),
  worldElements: z
    .string()
    .describe(
      "Create a few bullet points with elements in the game world that this beat is going to develop further (NPCs, locations, relationships, etc.)."
    ),
  optionIdeas: z
    .string()
    .describe(
      "Spell out at least 4 ideas for options and how they align with the types of decisions that this story is supposed to focus on."
    ),
});

export const beatGenerationSchema = z.object({
  plan: beatPlanSchema,
  title: z
    .string()
    .describe(
      "Title for the story beat that will be shown to the player as the headline. Think in terms of book chapters, names of TV series episodes, or newspaper headlines."
    ),
  text: z
    .string()
    .describe(
      "Main narrative text for this player.\n" +
        "- Write 2-4 paragraphs.\n" +
        "- Use present tense.\n" +
        "- Address the player character directly ('You' instead of the name of the character).\n" +
        "- Use markdown for formatting. Write two empty spaces followed by two newlines to mark the end of a paragraph."
    ),
  summary: z
    .string()
    .describe(
      "One-sentence summary of the beat. Don't include the options for this beat."
    ),
  imageId: z
    .string()
    .describe(
      "Id of an image from the existing list of images. Leave empty if no image is available or fitting. Leave empty if you want the game app to generate a new image for this beat."
    ),
  options: z
    .array(z.string().describe("Text shown to player for this choice"))
    .describe(
      "Available choices for the player. Be specific and action-oriented."
    ),
});

export const createSetOfBeatGenerationSchema = (playerCount: PlayerCount) => {
  // Create a record of required beat generation schemas based on player count
  const beatSchemas = Object.fromEntries(
    Array.from({ length: playerCount }, (_, i) => [
      `player${i + 1}`,
      beatGenerationSchema,
    ])
  ) as Record<`player${number}`, typeof beatGenerationSchema>;

  return z
    .object({
      changes: z
        .array(changeSchema)
        .describe(
          "List of all changes that will be applied to the story state.\n" +
            "Only the following types are allowed: statChange, newMilestone, newFact!\n" +
            "If this is the first set of beats, just return an empty list."
        ),
      ...beatSchemas,
    })
    .strict()
    .describe("Set of beat generations for all players");
};

export type SetOfBeatGenerationSchema = {
  changes: Change[];
} & Record<`player${number}`, BeatGeneration>;

export type Beat = z.infer<typeof beatGenerationSchema> & {
  choice: number;
};
export type BeatHistory = Array<Beat>;

export type BeatGeneration = z.infer<typeof beatGenerationSchema>;

export type BeatPlan = z.infer<typeof beatPlanSchema>;
