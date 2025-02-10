import { z } from "zod";
import { changeSchema } from "./change";

export const beatOptionSchema = z.object({
  text: z.string().describe("Text shown to player for this choice"),
});

export const beatSchema = z.object({
  title: z.string().describe("Title or summary of the current story beat"),
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
  options: z
    .array(beatOptionSchema)
    .describe("Available choices for the player"),
  choice: z
    .number()
    .describe(
      "Index of option chosen by the player. Always set to -1 initially."
    ),
  changes: z.array(changeSchema).describe(
    `List of changes that will be applied to the story state.
      Include all changes that happen because of the player's decision in the previous beat.
      If you introduce an outcome without a milestone for the first time, create a milestone to mark its introduction.
      Use newFact only as a backup. Try to track changes via stats and milestones first. The player's decisions are tracked anyway and don't have to be tracked via newFacts.
      Remmeber that the player's decision for this beat will be processed in the next beat.`
  ),
});

export const beatHistorySchema = z.array(beatSchema).default([]);

export const beatGenerationSchema = z.object({
  plan: z
    .string()
    .describe(
      "A detailed plan for the next beat, considering the previous beat, the story's key conflicts and types of decisions, and the player's stats and relationships."
    ),
  beat: beatSchema,
});

export type Beat = z.infer<typeof beatSchema>;
export type BeatHistory = z.infer<typeof beatHistorySchema>;
export type BeatGeneration = z.infer<typeof beatGenerationSchema>;
