import { z } from "zod";
import { changeSchema } from "./change.js";
import { PlayerCount } from "./players.js";
import type { Change } from "./change.js";

export const beatGenerationSchema = z.object({
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
      "Id of an image from the existing list of images (if any is fitting). Leave empty if no image is fitting. Leave blank if there aren't any images available yet."
    ),
  options: z
    .array(z.string().describe("Text shown to player for this choice"))
    .describe(
      "Available choices for the player. Offer 3 choices. (2 can be fine occassionally if you want to force a clear or quick 'left vs. right' kind of choice.)"
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
