import { z } from "zod";
import { changeSchema } from "./change.js";
import { imageGenerationSchema } from "./image.js";

export const beatOptionSchema = z.object({
  text: z.string().describe("Text shown to player for this choice"),
});

export const beatSchema = z.object({
  title: z
    .string()
    .describe(
      "Title for the story beat that will be shown to the player as the headline. Think in terms of book chapters, names of TV series episodes, or newspaper headlines."
    ),
  text: z
    .string()
    .describe(
      "Main narrative text.\n" +
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
      "ID of an image from the existing list of images (if any is fitting). Leave empty if no image is fitting. Leave blank if no images are to be generated at all."
    ),
  options: z
    .array(beatOptionSchema)
    .describe("Available choices for the player"),
  changes: z.array(changeSchema).describe(
    `List of changes that will be applied to the story state.
    ONLY the following types are allowed: statChange, newMilestone, newFact!
    Use newFact only as a backup. Try to track changes via statChange and newMilestone first.
    The player's decisions are tracked anyway and don't have to be tracked via newFact.`
  ),
});

export const beatHistorySchema = z.array(beatSchema).default([]);

export const beatGenerationSchema = z.object({
  plan: z.string().describe(
    `A detailed plan for the next beat. Address the following points:
1. Which changes should we apply to the story state based on the player's choice in the previous beat?
2. How should we narrate these changes?
The player should understand what happened, and the narrative should flow naturally.
You might want to exclude changes to stats that are not visible to the player.
Steps 1 and 2 are irrelevant if this is the first beat of the story.
3. Should we continue the scene or thread of the previous beat or start a new one?
- In most cases, it should take several beats to establish a milestone toward an outcome's resolution.
- If you added the final milestone to an outcome (number of milestones equals intended number of milestones), the outcome is resolved. Use this beat to give the resolution some gravity.
4. How should we make progress towards unresolved story outcomes?
- For outcomes without milestones: Consider introducing the outcome through NPCs, events, or initial discoveries. Mark this introduction with a first milestone.
- For outcomes with milestones: What are options for the next milestone to move the outcome closer to resolution?
Consider how many milestones are left to bring the outcome to a resolution. The remaining milestones must bring the outcome from its current status to a resolution.
Don't favor one option over others. Which option ends up as the outcome's resolution should be dictated by player choices.
That said, if the player's early choices make an option unlikely or even impossible, it's OK to no longer consider milestones toward it.
5. How should we develop the world, its characters, and the relationships that the player character has with them?
`
  ),
  beat: beatSchema,
  imageGeneration: imageGenerationSchema
    .optional()
    .describe(
      "Information to generate an image for this beat. Only use this if images are to be generated, and only if you didn't select an image from the existing list of images for this beat."
    ),
});

export type Beat = z.infer<typeof beatSchema> & {
  choice: number;
};

export type BeatHistory = z.infer<typeof beatHistorySchema>;
export type BeatGeneration = z.infer<typeof beatGenerationSchema>;
