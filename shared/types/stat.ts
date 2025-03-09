import { z } from "zod";

export const statSchema = z
  .object({
    type: z
      .enum([
        "string",
        "string[]",
        "percentage",
        "opposites",
        "number",
        // "boolean",
      ])
      .describe(
        "Data type of the variable. As a general tendency, favor string and string[] over percentage/opposites/number -- unless for countable things whose management is central to the story (number), and percentages/opposites for aspects that must be managed by the player often and granularly."
      ),
    name: z
      .string()
      .describe(
        "Name of the variable that will be displayed to the player. If you chose a stat of type opposites, use the '|' character to separate the two traits ('Brutality|Finesse')."
      ),
    id: z
      .string()
      .describe(
        "Unique identifier for the stat. Use a short phrase with underscores, like 'relationship_x'."
      ),
    narrativeFunctions: z
      .array(z.string())
      .describe(
        "Detailed description of how this stat affects the narrative. Mention at least 2 of the following:\n" +
          "- Define specific thresholds and their story implications (e.g., 'Below 30% causes visible weakness')\n" +
          "- Explain how the stat influences character relationships and NPC reactions\n" +
          "- For string stats, describe the progression path and what each level represents\n" +
          "- For string[] stats, explain the categories or types of items and their significance\n" +
          "- Connect the stat to key story elements and potential narrative moments"
      ),
    gameMechanics: z
      .array(z.string())
      .describe(
        "Precise mechanics for how this stat functions in gameplay. Mention at least 2 of the following:\n" +
          "- Specify exact point values for challenges/contests (e.g., '+15 points to related challenges')\n" +
          "- Define how the stat changes (e.g., 'Increases by 10% after favorable thread resolutions')\n" +
          "- Explain interactions with other stats and systems\n" +
          "- Include thresholds that unlock special abilities or options\n" +
          "- Detail any resource costs or benefits (e.g., 'Can spend 10 units for +20 points in critical situations')\n" +
          "- Describe how the stat affects thread and beat outcomes"
      ),
    isVisible: z
      .boolean()
      .describe("Whether this stat should be visible to the player"),
    group: z
      .string()
      .describe(
        "Name of the group of stats that this stat will be displayed in. Only affects the UI."
      ),
    value: z
      .union([z.number(), z.boolean(), z.string(), z.array(z.string())])
      .describe(
        "Value of the variable when the game starts.\n" +
          "For stats of type 'opposites', value describes the value of the first stat. The second stat will be automatically calculcated with (100% - value)."
      ),
  })
  .describe(
    "A variable that is tracked in the game state.\n" +
      "Don't use stats to directly track progress toward outcomes. No (percentage) 'progress' stats, no (string[]) 'clues' in mystery stories, etc."
  );

export const statsSchema = z.array(statSchema);
export type Stat = z.infer<typeof statSchema>;
