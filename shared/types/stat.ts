import { z } from "zod";

export const statSchema = z
  .object({
    type: z
      .enum(["string", "string[]", "percentage", "opposites", "number"])
      .describe(
        "Data type of the variable.\n" +
          "- string: For qualitative aspects that don't change often or granularly (e.g., character conditions, relationship states, ranks).\n" +
          "- string[]: For lists of traits, collectibles, or categories (e.g., abilities, inventory items, contacts).\n" +
          "- percentage: For aspects that change often and granularly (0-100%, e.g., health, energy, relationship strength).\n" +
          "- opposites: Two percentage stats in one where second stat = (100 - first stat) (e.g., order|chaos, logic|empathy).\n" +
          "- number: Only for countable quantities (e.g., money, ammunition, followers).\n" +
          "As a general tendency, favor string and string[] over percentage/opposites/number unless for countable things whose management is central to the story (number), and percentages/opposites for aspects that must be managed by the player often and granularly."
      ),
    name: z
      .string()
      .describe(
        "Name of the variable that will be displayed to the player.\n" +
          "- Must be specific and immediately convey the stat's meaning and function.\n" +
          "- For opposites type, use the '|' character to separate the two traits (e.g., 'Brutality|Finesse')."
      ),
    id: z
      .string()
      .describe(
        "Unique identifier for the stat. Use a short phrase with underscores, like 'relationship_x'."
      ),
    possibleValues: z
      .string()
      .describe(
        "Only for string and string[] stats.\n" +
          "- For string stats: Can define progression paths (e.g., 'Novice, Apprentice, Master').\n" +
          "- For string[] stats: Can define categories (e.g., 'Healers/Warriors/Sages/Artisans' for special followers). You can also define a limit (e.g., '(max 3)').\n" +
          "- For percentage, opposites, and numbers stats, leave this empty."
      ),
    effectOnPoints: z
      .array(z.string())
      .describe(
        "Bonuses and maluses that this stat applies to the chance of success in certain beats. +/-10 points is a minor effect, +/-30 is a major effect. Be creative. Options include:\n" +
          "- Can define thresholds for different effects (e.g., 'Above 70% provides +20 points to social challenges').\n" +
          "- Can define conditional effects (e.g., '-10/-20 points when the spaceship is Worn/Damaged and required to perform a risky maneuver').\n" +
          "- Can define resource-based effects (e.g., '+25 when bribing an NPC with gold')."
      ),
    optionsToSacrifice: z
      .string()
      .describe(
        "Options for sacrificing this stat to gain a higher chance of success in certain beats. Must be expressed in the context of individual beats. Write 'None' if there are no options. Examples:\n" +
          "- for percentage stats: Define usage costs (e.g., 'Can spend 20% energy to use a Power').\n" +
          "- for number stats: Define spending mechanics (e.g., 'Can spend 50 gold to bribe an NPC').\n" +
          "- for string[] stats: Define how items/abilities can be used (e.g., 'Can send a special follower on a dangerous mission').\n" +
          "- for string stats: Define how conditions affect options (e.g., 'Gives bonuses and maluses for actions that align/misalign with the current emotion').\n" +
          "- for opposites stats: Define how extreme values unlock special options."
      ),
    optionsToGainAsReward: z
      .string()
      .describe(
        "Options for gaining this stat as a reward for choosing a lower chance of success in certain beats. Must be expressed in the context of individual beats. Write 'None' if there are no options."
      ),
    narrativeImplications: z
      .array(z.string())
      .describe(
        "Specific thresholds and their story implications. Be creative. Options include:\n" +
          "- Example for percentage stats: Define critical thresholds (e.g., 'Below 30% causes visible weakness', 'Above 80% grants legendary status').\n" +
          "- Example for opposites stats: Define alignment thresholds (e.g., '60%+ Order aligns character with Law faction').\n" +
          "- Example for number stats: Define reference values (e.g., '1000+ gold represents upper class status').\n" +
          "- Example for string stats: Define narrative consequences of specific values (e.g., 'Outcast status prevents interaction with town merchants')."
      ),
    adjustmentsAfterThreads: z
      .array(z.string())
      .describe(
        "Which resolutions should cause this stat to change, and how? Be creative. Options include:\n" +
          "- Define exact stat changes for different resolution types (e.g., 'Favorable resolutions in performance threads increase Stage Presence by 10%').\n" +
          "- Include conditional changes based on thread context (e.g., 'Fame increases one step after a favorable resolution of a thread that involves a concert').\n" +
          "- Define resource regeneration patterns (e.g., 'Mana regenerates by 10% after each thread').\n" +
          "- Define decay patterns (e.g., 'Equipment quality degrades one level after major action threads').\n" +
          "- For opposites stats: Define how choices shift the balance (e.g., 'Choosing self-interest options shifts Loyalty|Ambition toward Ambition by 10-15%')."
      ),
    isVisible: z
      .boolean()
      .describe(
        "Whether this stat should be visible to the player.\n" +
          "- Set to false for hidden mechanics, story flags, or future reveals.\n" +
          "- Set to true for stats that players should be aware of and manage."
      ),
    tooltip: z
      .string()
      .describe(
        "Description of what this stat represents. Visible to the player (if isVisible is true). Must add information relative to the name.\n" +
          "- Should clearly explain the stat's purpose and how it affects gameplay.\n" +
          "- Can include hints about thresholds, usage mechanics, or narrative implications."
      ),
    group: z
      .string()
      .describe(
        "Name of the group of stats that this stat will be displayed in. Only affects the UI."
      ),
    value: z
      .union([z.number(), z.boolean(), z.string(), z.array(z.string())])
      .describe(
        "Value of the variable when the game starts.\n" +
          "- For string stats: Initial state or level (e.g., 'Novice', 'Healthy').\n" +
          "- For string[] stats: Initial list of items, traits, or abilities (e.g., ['Sword', 'Shield']).\n" +
          "- For percentage stats: Initial percentage value (0-100).\n" +
          "- For opposites stats: Initial value of the first stat (second stat will be 100 - this value).\n" +
          "- For number stats: Initial count or quantity (e.g., 50 gold).\n" +
          "- In multiplayer games, aim for a fair initial distribution of stat values across players."
      ),
  })
  .describe(
    "A variable that is tracked in the game state.\n" +
      "Stats directly influence beat resolution through modifiers (typically +/-10 for minor influences, +/-30 for major influences).\n" +
      "Stats can be used as resources, define narrative thresholds, and change based on thread resolutions.\n" +
      "Don't use stats to directly track progress toward outcomes. No (percentage) 'progress' stats, no (string[]) 'clues' in mystery stories, etc."
  );

export const statsSchema = z.array(statSchema);
export type Stat = z.infer<typeof statSchema>;
