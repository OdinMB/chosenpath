import { z } from "zod";
import { PLAYER_SLOTS, PlayerSlot } from "./players.js";

export const statChangeSchema = z.object({
  type: z.literal("statChange"),
  group: z
    .union([z.literal("shared"), z.enum(PLAYER_SLOTS as [string, ...string[]])])
    .describe("Target group for the change - either 'shared' or a player slot"),
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
  player: z
    .enum(PLAYER_SLOTS as [string, ...string[]])
    .describe(
      "Player slot this milestone belongs to (player1, player2, etc.) Only players have outcomes."
    ),
  outcome: z
    .string()
    .describe("ID of the outcome that this new milestone will be added to."),
  newMilestone: z.string().describe(
    `One sentence summarizing the event/decision/realization that marks significant progress toward the outcome's resolution.
      Simple beat summarizes and player choices are already tracked elsewhere. Only add a milestone if it describes a big step toward the outcome's resolution, or a clear signal which resolution the story is moving toward.
      Consider how many milestones are left to bring the outcome to a resolution. The remaining 2 milestones must be significant enough to move from the current status to a resolution.`
  ),
});

export const changeSchema = z
  .discriminatedUnion("type", [
    statChangeSchema,
    newFactSchema,
    newMilestoneSchema,
  ])
  .describe(
    "A change that will be applied to the story state. ONLY the following types are allowed: statChange, newMilestone, newFact!"
  );

export type Change = z.infer<typeof changeSchema>;
