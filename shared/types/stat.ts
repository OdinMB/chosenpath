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
      .describe("Whether this stat should be visible to the player"),
    hint: z
      .string()
      .describe(
        "Short hint in case you have special instructions on how this stat is to be used. Only visible to the AI, not the player. If you don't have special instrucitons, just put '---'."
      ),
    group: z
      .string()
      .describe(
        "Name of the group of stats that this stat will be displayed in. Only affects the UI."
      ),
  })
  .describe(
    "A variable that is tracked in the game state.\n" +
      "Don't use stats to track progress toward outcomes. That will be done with narrative milestones."
  );

export const statsSchema = z.array(statSchema);
