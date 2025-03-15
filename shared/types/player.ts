import { MIN_PLAYERS, MAX_PLAYERS } from "../config.js";
import { z } from "zod";
import { statValueEntrySchema, initialStatValueDescription } from "./stat.js";

// Create union type from range MIN_PLAYERS to MAX_PLAYERS
type NumberRange<Start extends number, End extends number> =
  | Exclude<Enumerate<End>, Enumerate<Start>>
  | End;
type Enumerate<
  N extends number,
  Acc extends number[] = []
> = Acc["length"] extends N
  ? Acc[number]
  : Enumerate<N, [...Acc, Acc["length"]]>;

export type PlayerCount = NumberRange<typeof MIN_PLAYERS, typeof MAX_PLAYERS>;

// Define the enum values based on MAX_PLAYERS
const playerSlotArray = Array.from(
  { length: MAX_PLAYERS },
  (_, i) => `player${i + 1}`
);
export const PLAYER_SLOTS = playerSlotArray as readonly string[] & {
  readonly [K in keyof typeof playerSlotArray]: (typeof playerSlotArray)[K];
};
export type PlayerSlot = (typeof PLAYER_SLOTS)[number];

// Helper type to create objects with player slot keys
export type PlayerMap<T> = {
  [K in PlayerSlot]?: T;
};

// Helper type to ensure exactly N players
export type ExactPlayerMap<T, N extends PlayerCount> = {
  [K in `player${NumberRange<1, N>}`]: T;
};

export const pronounsSchema = z.object({
  personal: z
    .string()
    .describe("Personal pronoun (e.g., 'he', 'she', 'they', 'it')"),
  object: z
    .string()
    .describe("Object pronoun (e.g., 'him', 'her', 'them', 'it')"),
  possessive: z
    .string()
    .describe("Possessive pronoun (e.g., 'his', 'her', 'their', 'its')"),
  reflexive: z
    .string()
    .describe(
      "Reflexive pronoun (e.g., 'himself', 'herself', 'themselves', 'itself')"
    ),
});
export type Pronouns = z.infer<typeof pronounsSchema>;

export const characterSelectionIntroductionSchema = z
  .object({
    title: z
      .string()
      .describe(
        "Title of the character selection screen. Something flavorful that fits the story."
      ),
    text: z
      .string()
      .describe(
        "Text of the character selection screen. Very short introduction to the setting, followed by a question about the player's identity and background."
      ),
  })
  .describe(
    "Introduction to the character selection phase. This will be the first thing that the players see in the game as they select their player identity and background."
  );
export type CharacterSelectionIntroduction = z.infer<
  typeof characterSelectionIntroductionSchema
>;

// Character identity schema (name and pronouns)
export const characterIdentitySchema = z.object({
  name: z.string().describe("Name of the character/entity"),
  pronouns: pronounsSchema,
  appearance: z
    .string()
    .describe(
      "Appearance of the character/entity. Focus on superficial things, as anything you say about personality traits or skills might be at odds with the background that the player can choose independently."
    ),
});
export type CharacterIdentity = z.infer<typeof characterIdentitySchema>;

export const characterBackgroundSchema = z
  .object({
    title: z
      .string()
      .describe("Title of this background. Will be shown to the player."),
    fluffTemplate: z
      .string()
      .describe(
        "Character background description with placeholders: '{name}' for the character's name, and the following ones for pronouns (for the character, not any other other entities): '{personal}' (for he/she/they/it), '{object}' (for him/her/them/it), '{possessive}' (for his/her/their/its), and '{reflexive}' (for himself/herself/themselves/itself). Use '{Personal}' instead of '{personal}' if you want the first letter to be uppercase (e.g. 'He' instead of 'he')."
      ),
    initialPlayerStatValues: z
      .array(statValueEntrySchema)
      .describe(
        "Initial stat values for player stats for this background. Provide an initial value for each player stat. Array of {statId, value} objects.\n" +
          initialStatValueDescription
      ),
  })
  .describe(
    "A possible character background / starting point for this player."
  );

export type CharacterBackground = z.infer<typeof characterBackgroundSchema>;

export const characterSelectionPlanSchema = z.object({
  playerStatConversionRates: z
    .array(
      z
        .string()
        .describe(
          "A rough conversion rate for player stats. Example: '10 points of Village Loyalty are worth 1 step of Adventurer Threat'"
        )
    )
    .describe(
      "List three rough conversion rates between player stats. This will help ensure that the background options for each player are balanced, with no option being clearly better than another."
    ),
  playerBackgroundVariety: z
    .array(
      z
        .string()
        .describe(
          "Particular tradeoff between player stats. Example: 'Impoverished folk hero: no starting gold, but high reputation and high loyalty'"
        )
    )
    .describe(
      "How do you ensure that the background options for each player are markedly different from each other but still balanced? Outline 3 potential archetypes that the backgrounds could fall into. Consider the player stat conversion rates."
    ),
  multiplayerCoordination: z
    .string()
    .describe(
      "For multiplayer games: how do you ensure that the options for identities and backgrounds for each player are a) meaningfully different from each other, b) consistent with each other, and c) coordinated? Spell out how exactly you ensure that no combination of choices leads to inconsistencies in the story. Example: 'player1 will get options for being the thief, while player2 will get options for being the cleric' (in a fantasy adventure story)."
    ),
});
export type CharacterSelectionPlan = z.infer<
  typeof characterSelectionPlanSchema
>;
