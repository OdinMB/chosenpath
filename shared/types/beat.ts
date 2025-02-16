import { z } from "zod";
import { changeSchema } from "./change.js";
import { PlayerCount } from "./players.js";
import type { Change } from "./change.js";

export const beatGenerationSchema = z.object({
  plan: z
    .string()
    .describe(
      "Detailed plan for this beat, including the following points:\n" +
        "a) How should we narrate the changes to the story state and the decisions of other players to this player? In multiplayer games, go through each other player's decision.\n" +
        "b) Should we continue the scene or thread of the previous beat or start a new one? Start by listing the number of beats that the player has spent in the current scene. If it's 2 or more, offer the player an option to go to another scene. If it's 3 or more, offer only options that go to another scene. (Unless it's a showdown of some kind.)\n" +
        "c) How should we make progress towards unresolved story outcomes? Create an overview of outcomes, how many milestones are left, and how many beats we have left.\n" +
        "d) How should we develop the world, its characters, and the relationships that the players have with them? Create a few bullet points of what should be developed.\n" +
        "e) How can we reinforce the story's key conflicts and focused types of decisions? Spell out at least 4 ideas for options and how they align with the types of decisions that this story is supposed to focus on."
    ),
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
