import { z } from "zod";

export const statChangeSchema = z.object({
  type: z.literal("stat"),
  stat: z.string().describe("ID of the stat to modify"),
  change: z
    .enum([
      "setBoolean",
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

export const newFactSchema = z.object({
  type: z.literal("newFact"),
  fact: z
    .string()
    .describe(
      "An important change in the game world or story that will be tracked to influence the story from this point on.\n" +
        "Don't use this if the information would be redundant with the option that was presented to the player or a stat change that is already mentioned in a different consequence.\n" +
        "Bad: 'The player decided to confront X at their house' if the option is 'Confront X at their house'\n" +
        "Good: 'The player gets lost on their way to X's house' (e.g. because of a bad orientation trait; not redundant with the option 'Confront X at their house')"
    ),
});

export const newMilestoneSchema = z.object({
  type: z.literal("newMilestone"),
  outcome: z
    .string()
    .describe("ID of the outcome that this new milestone will be added to."),
  newMilestone: z
    .string()
    .describe(
      "One sentence summarizing the event/decision/realization that moves the outcome closer to its resolution."
    ),
});

export const changeSchema = z.discriminatedUnion("type", [
  statChangeSchema,
  newFactSchema,
  newMilestoneSchema,
]);

export type Change = z.infer<typeof changeSchema>;
