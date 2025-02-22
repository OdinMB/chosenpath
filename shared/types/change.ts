import { z } from "zod";
import { PLAYER_SLOTS } from "./player.js";
import { storyElementSchema } from "./storyElement.js";

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
    .describe("Type of change to apply to a stat"),
  value: z
    .union([z.number(), z.string(), z.boolean()])
    .describe(
      "Value to apply in the change. For setString and addElement, use values that can be displayed to players. ('Rumor of acient artifact' instead of 'ancient_artifact_hint')"
    ),
});

export const newFactSchema = z
  .object({
    type: z.literal("newFact"),
    storyElementId: z
      .string()
      .describe(
        "ID of the story element that this fact should be added to (or 'world' for adding a big fact about the game world overall)."
      ),
    fact: z.string(),
  })
  .describe(
    "A fact about a story element (NPC, location, item, etc.) that should be tracked to ensure consistency of the story."
  );

export const newMilestoneSchema = z.object({
  type: z.literal("newMilestone"),
  outcomeGroup: z
    .enum(["shared", ...PLAYER_SLOTS] as [string, ...string[]])
    .describe(
      "Group of outcomes that the outcome for this milestone belongs to. Player slot (player1, player2, etc.) for individual outcomes or 'shared' for shared outcomes."
    ),
  outcome: z
    .string()
    .describe("ID of the outcome that this new milestone will be added to."),
  newMilestone: z
    .string()
    .describe(
      `One sentence summarizing the event/decision/realization that marks significant progress toward the outcome's resolution. Only use this after a thread has been concluded.`
    ),
});

export const newStoryElementSchema = z.object({
  type: z.literal("newStoryElement"),
  element: storyElementSchema.extend({
    facts: z.array(z.string()),
  }),
});

export const addIntroductionOfStoryElementSchema = z.object({
  type: z.literal("addIntroductionOfStoryElement"),
  player: z
    .enum(PLAYER_SLOTS as [string, ...string[]])
    .describe("Player slot to add the just introduced story element to"),
  storyElementId: z
    .string()
    .describe("ID of the story element that the player now knows about"),
});

export const changeSchema = z
  .discriminatedUnion("type", [
    statChangeSchema,
    newFactSchema,
    newMilestoneSchema,
    newStoryElementSchema,
    addIntroductionOfStoryElementSchema,
  ])
  .describe(
    "A change that will be applied to the story state. ONLY the following types are allowed: statChange, newMilestone, newFact, newStoryElement, addIntroductionOfStoryElement!"
  );

export type Change = z.infer<typeof changeSchema>;
