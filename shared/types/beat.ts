import { z } from "zod";
import { PlayerCount } from "./players.js";
import {
  type Change,
  newFactSchema,
  statChangeSchema,
  newStoryElementSchema,
  addIntroductionOfStoryElementSchema,
} from "./change.js";

export const beatTypeSchema = z.enum(["intro", "switch", "thread", "ending"]);

export const beatPlanSchema = z.object({
  developmentsToNarrate: z
    .string()
    .describe(
      "Bullet list with changes to the story state and the decisions of other players (if relevant) and how we should narrate them to this player. Ignore this if this is the first beat (no changes yet)."
    ),
  beatTypeConsiderations: z
    .string()
    .describe("Considerations based on the type of beat that we should create"),
  otherBeats: z
    .string()
    .describe(
      "Bullet list with information from other beats in this turn that we must consider for this beat. If this is the beat for player1, leave this empty."
    ),
  worldBuilding: z
    .string()
    .describe(
      "Decide how you want to flesh out the game world to make it more immersive. List new story elements that you want to add to the story state. Check if you should add a new story element to the story state that are likely to be used in later beats. List new details about existing story elements that you want to introduce in this beat. Make absolutelyl sure that you don't create duplicate story elements or facts."
    ),
  newGameElements: z
    .array(newStoryElementSchema)
    .describe(
      "List of new story elements to add to the story state. Leave this empty if no new story elements are to be created in this beat. Only use this if a new story element is to be created in this beat that is likely to be used in later beats."
    ),
  newIntroductionsOfStoryElements: z
    .array(addIntroductionOfStoryElementSchema)
    .describe(
      "List of story elements that are going to be introduced to the player in this beat for the first time. Leave this empty if the player doesn't encounter any new story elements."
    ),
  establishedFacts: z
    .array(newFactSchema)
    .describe(
      "List of facts about existing story elements that this beat is going to establish. Include every new detail about NPCs, locations, important item, rumor, mystery, etc. If you want to add a fact to a story element that isn't registered yet, chances are that you should create it. Use 'world' as the story element if you want to add a fact that doesn't belong to any specific story element."
    ),
  optionIdeas: z
    .string()
    .describe(
      "Things to keep in mind as you create the options for this beat."
    ),
});

export const beatGenerationSchema = z.object({
  plan: beatPlanSchema,
  title: z
    .string()
    .describe(
      "If a switch: [title of the switch]. If part of a thread: '[title for the thread] ([current beat number within the thread]/[total number of beats in the thread])'."
    ),
  text: z
    .string()
    .describe(
      "Main narrative text for this player.\n" +
        "- Write 4-5 paragraphs.\n" +
        "- Use present tense.\n" +
        "- Address the player character directly ('You' instead of the name of the character).\n" +
        "- NEVER introduce, talk about, or even hint at the player's options in the beat text.\n" +
        "- AVOID all of these and similar formulations: 'The path before you ...', 'Will you do X, or will you do Y?', 'You must decide: ...', 'You weigh your options', 'The complexity of your decision ...'\n" +
        "- You can use markdown for formatting."
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
      "3 choices for the player from the list of options generated in the plan. (If you want a sharp focus for this beat, you can choose only 2 options.)"
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
      decisionConsequences: z
        .array(statChangeSchema)
        .describe(
          "List of stat changes based on players' decisions in the last beat that will be applied to the story state.\n" +
            "Use only changes of type statChange.\n" +
            "If this is the first set of beats, just return an empty list."
        ),
      ...beatSchemas,
    })
    .strict()
    .describe("Set of beat generations for all players");
};

export type BeatType = z.infer<typeof beatTypeSchema>;

export type SetOfBeatGenerationSchema = {
  decisionConsequences: Change[];
} & Record<`player${number}`, BeatGeneration>;

export type Beat = z.infer<typeof beatGenerationSchema> & {
  choice: number;
};
export type BeatHistory = Array<Beat>;

export type BeatGeneration = z.infer<typeof beatGenerationSchema>;

export type BeatPlan = z.infer<typeof beatPlanSchema>;
