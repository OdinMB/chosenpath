import { z } from "zod";

export const statSchema = z
  .object({
    id: z
      .string()
      .describe(
        "Unique identifier for the stat. Use a short phrase with underscores, like 'relationship_x'."
      ),
    type: z
      .enum([
        "percentage",
        "opposites",
        "number",
        "boolean",
        "string",
        "string[]",
      ])
      .describe(
        "Data type of the variable. A stat of type 'opposites' represents two traits whose sum always equals 100%."
      ),
    name: z
      .string()
      .describe(
        "Name of the variable that will be displayed to the player. If you chose a stat of type opposites, use the '|' character to separate the two traits ('Brutality|Finesse')."
      ),
    value: z
      .union([z.number(), z.boolean(), z.string(), z.array(z.string())])
      .describe(
        "Current value of the variable. For the initial setup, choose a value that makes sense for the beginning of the story.\n" +
          "For stats of type 'opposites', value describes the value of the first stat. The second stat will be automatically calculcated with (100% - value)."
      ),
    isVisible: z
      .boolean()
      .describe("Whether this stat should be visible to the player")
      .optional(),
    hint: z
      .string()
      .describe(
        "Short hint on how you want this stat to be used. For example, 'If this falls below 30%, bad things should happen', or 'Reduce this by one for each gig that the band plays. Once it reaches 0, no more gigs are possible.'. Only visible to the AI, not the player. If the role is clear from the other attributes, leave this empty."
      )
      .optional(),
  })
  .describe(
    "A variable that is tracked in the game state.\n" +
      "Don't use stats to track progress toward outcomes. That will be done with narrative milestones."
  );

export const statsSchema = z
  .array(statSchema)
  .describe(
    "Stats to be tracked in the game state. Stats define how the story progresses, which choices the player has, and how outcomes can be tracked. Can include\n" +
      "- Skills, areas of expertise, dispositions, health, special powers, etc. of the player character\n" +
      "- Resources that the character can acquire and allocate, e.g. money, time, mental energy, fuel, bullets, etc.\n" +
      "- Aspects of the world that can be influenced by the player, e.g. level of tension between factions, status of a spaceship, etc.\n" +
      "- Relationships to NPCs, factions, organizations, or general reputation. (Important NPCs often deserve their own stat.)\n" +
      "- Inventory, e.g. for special items, clues, or pieces of knowledge\n" +
      "Only include stats that are relevant to the story. E.g. don't include 'age' or 'height' of the player character if they don't play a role in the story.\n" +
      "Use numbers(0 - 100) for traits that can change granually over the course of the story, strings for qualitative summaries of statuses, or bools and lists of strings for traits that can be either true or false or that can be chosen from a list.\n" +
      "Hide stats that the player shouldn't be able to see."
  );
