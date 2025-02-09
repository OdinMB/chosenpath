import { z } from "zod";
import { outcomeStatusEnum } from "./enums";

export const statConsequenceSchema = z.object({
  type: z.literal("stat"),
  stat: z.string().describe("ID of the stat to modify"),
  change: z
    .enum([
      "addNumber",
      "subtractNumber",
      "setNumber",
      "setString",
      "addElement",
      "removeElement",
    ])
    .describe("Type of modification to apply"),
  value: z
    .union([z.number(), z.string(), z.boolean()])
    .describe("Value to apply in the modification"),
});

export const narrativeConsequenceSchema = z.object({
  type: z.literal("narrative"),
  fact: z
    .string()
    .describe(
      "An important change in the game world or story that will be tracked to influence the story from this point on.\n" +
        "Don't use this if the information would be redundant with the option that was presented to the player or a stat change that is already mentioned in a different consequence.\n" +
        "Bad: 'The player decided to confront X at their house' if the option is 'Confront X at their house'\n" +
        "Good: 'The player gets lost on their way to X's house' (e.g. because of a bad orientation trait; not redundant with the option 'Confront X at their house')"
    ),
});

export const outcomeStatusChangeSchema = z.object({
  outcome: z.string().describe("The outcome that is being updated"),
  newStatus: outcomeStatusEnum.describe("The new status of the outcome"),
});
export const outcomeStatusChangeConsequenceSchema =
  outcomeStatusChangeSchema.extend({
    type: z.literal("outcomeStatus"),
  });

export const beatConsequenceSchema = z.discriminatedUnion("type", [
  statConsequenceSchema,
  narrativeConsequenceSchema,
  outcomeStatusChangeConsequenceSchema,
]);

export type BeatConsequence = z.infer<typeof beatConsequenceSchema>;

export const beatOptionSchema = z.object({
  text: z.string().describe("Text shown to player for this choice"),
  consequences: z
    .array(beatConsequenceSchema)
    .describe("Effects that occur when this option is chosen"),
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
});
export type Beat = z.infer<typeof beatSchema>;

export const pastBeatSchema = z.object({
  summary: z.string(),
  choice: beatOptionSchema,
});
export type PastBeat = z.infer<typeof pastBeatSchema>;
export const beatArchiveSchema = z.array(pastBeatSchema).default([]);
export type BeatArchive = z.infer<typeof beatArchiveSchema>;

export const outcomeStatusChangesSchema = z
  .array(outcomeStatusChangeSchema)
  .describe(
    "List of status changes of outcomes based on this story beat (regardless of the player's decision), e.g. because an outcome was introduced. Can be empty."
  );

export const beatGenerationSchema = z.object({
  plan: z
    .string()
    .describe(
      "A detailed plan for the next beat, considering the previous beat, the story's key conflicts and types of decisions, and the player's stats and relationships."
    ),
  beat: beatSchema,
  outcomeStatusChanges: outcomeStatusChangesSchema,
});
export type BeatGeneration = z.infer<typeof beatGenerationSchema>;
