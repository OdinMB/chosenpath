import { z } from "zod";

export const statValueSchema = z.union([
  z.number(),
  z.string(),
  z.array(z.string()),
]);
export type StatValue = z.infer<typeof statValueSchema>;

// Character background schema (fluff text and stats)
export const statValueEntrySchema = z.object({
  statId: z.string().describe("ID of the stat"),
  value: statValueSchema.describe("Value for this stat"),
});
export type StatValueEntry = z.infer<typeof statValueEntrySchema>;

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
          "- For opposites type, use '|' to separate the two traits (e.g., 'Brutality|Finesse')."
      ),
    id: z
      .string()
      .describe(
        "Unique identifier for the stat. Use a short phrase with underscores and indicate whether this is a player or shared stat, like 'player_energy' or 'shared_spaceship_status'."
      ),
    possibleValues: z
      .string()
      .describe(
        "Only for string and string[] stats.\n" +
          "- For string stats: Can define progression paths (e.g., 'Novice, Apprentice, Master').\n" +
          "- For string[] stats: Can define categories (e.g., 'only minor spells', 'possible contacts are [names of three npcs]'). You can also define a limit (e.g., '(max 4 items)').\n" +
          "- For percentage, opposites, and numbers stats, leave this empty."
      ),
    effectOnPoints: z
      .array(z.string())
      .describe(
        "Bonuses and maluses that this stat applies to the chance of success in certain beats. +/-10 points is a minor effect, +/-20 is a major effect. Be creative. List 3 ways in which this stat can be relevant for the player's chance of success. We must get a good sense of which values of the stat give what kinds of bonuses and maluses in which situations. Examples:\n" +
          "- Scope: 'Applies only when dealing with members of this faction'.\n" +
          "- Thresholds: 'Above 70% provides +15 points to social challenges'\n" +
          "- Conditions: '-10/-20 points if the spaceship is Worn/Damaged and required to perform a risky maneuver'\n" +
          "Always define specific thresholds and point values in absolute terms.\n" +
          "Remember: at least 3 items in this list!"
      ),
    optionsToSacrifice: z
      .string()
      .describe(
        "Options for sacrificing (some of) this stat to gain a higher chance of success in a beat. Write 'None' if the stat cannot be sacrificed for such a short-term benefit. Examples:\n" +
          "- for percentage stats: 'Can spend 10% energy to use a Power'\n" +
          "- for string[] stats: 'Can send special followers on dangerous missions'\n" +
          "Don't mention how large the point bonus is for sacrificing this stat. That bonus is the same for all sacrifice options. Only define how much of the stat the player has to sacrifice to gain that bonus.\n" +
          "Don't provide any options to sacrifice a stat for a momentary benefit if the stat represents a large, long-term aspect of the story (tension between factions on a 4-step scale, special powers, etc.)"
      ),
    optionsToGainAsReward: z
      .string()
      .describe(
        "Options for gaining this stat as a reward for choosing a lower chance of success in a beat. Write 'None' if this stat cannot be gained as a reward for such a fleeting disadvantage. Examples:\n" +
          "- for percentage stats: 'Can regain 10% energy by resting instead of taking decisive action'\n" +
          "Don't provide any options to gain this stat as a reward for a momentary disadvantage if the stat represents a large, long-term aspect of the story (tension between factions on a 4-step scale, special powers, etc.)"
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
        "Which thread resolutions should cause this stat to change, and how? Be creative. Examples:\n" +
          "- Exact stat changes for different resolution types (e.g., 'Favorable resolutions in performance threads increase Stage Presence by 10%').\n" +
          "- Conditional changes based on thread context (e.g., 'Fame increases one step after a favorable resolution of a thread that involves a concert').\n" +
          "- Resource regeneration patterns (e.g., 'Mana regenerates by 10% after each thread').\n" +
          "- Cecay patterns (e.g., 'Equipment quality degrades one level after major action threads').\n" +
          "- For opposites stats: Shifting the balance (e.g., 'Choosing self-interest options shifts Loyalty|Ambition toward Ambition by 10-15%').\n" +
          "Stat changes after resolved threads can be noticeable and meaningful. Changes after unfavorable resolutions can be real setbacks."
      ),
    canBeChangedInBeatResolutions: z
      .boolean()
      .describe(
        "Whether this stat can be changed in beat resolutions within threads. If true, small changes can be made to the stat at any point in the story, not just after threads are resolved. Good for stats that are tracked often and granularly and where changes are not particularly impactful. If false, the stat can only be changed after threads are resolved. Set to false for stats where a change would be very noticeable and/or have a long-term effect (important world stats, special powers or relationships, etc.) These larger changes should only happen after a relevant thread is resolved."
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
  })
  .describe(
    "A variable that is tracked in the game state.\n" +
      "Stats directly influence beat resolution through modifiers (typically +/-10 for minor influences, +/-30 for major influences).\n" +
      "Stats can be used as resources, define narrative thresholds, and change based on thread resolutions.\n" +
      "Don't use stats to directly track progress toward outcomes. (This is done separately.) Exception: Contested outcomes in multiplayer games."
  );

export const statsSchema = z.array(statSchema);
export type Stat = z.infer<typeof statSchema>;

// Client-side version of Stat with sensitive fields omitted
export type ClientStat = Omit<
  Stat,
  | "adjustmentsAfterThreads"
  | "canBeChangedInBeatResolutions"
  | "effectOnPoints"
  | "narrativeImplications"
  | "optionsToGainAsReward"
  | "optionsToSacrifice"
  | "possibleValues"
>;
