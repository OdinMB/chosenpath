import { MIN_PLAYERS, MAX_PLAYERS } from "../config.js";
import { z } from "zod";
import { statValueEntrySchema, StatValueEntry } from "./stat.js";
import { outcomeSchema, Outcome } from "./outcome.js";
import { BeatHistory } from "./beat.js";

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
        "Text of the character selection screen. Very short introduction to the setting, followed by a question about the player's identity and background. Don't frame this as a way to intervene in the story. The player merely tells you who they've been all along. For example: 'Remind me, which superhero were you again?', 'The expedition is dangerious, but you know what you are doing. You are ...'"
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
  name: z
    .string()
    .describe(
      "Name of the character/entity. For multiplayer games, make sure that no two players can have the same name."
    ),
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
        "Character background description with placeholders: '{name}' for the character's name, and the following ones for pronouns (for the character, not any other other entities): '{name}' (instead of personal pronouns like he/she/they/it, as the following sentence will also work for identifies with they/them pronouns), '{object}' (for him/her/them/it), '{possessive}' (for his/her/their/its), and '{reflexive}' (for himself/herself/themselves/itself). Use '{Possessive}' instead of '{possessive}' if you want the first letter to be uppercase (e.g. 'His' instead of 'his')."
      ),
    initialPlayerStatValues: z
      .array(statValueEntrySchema)
      .describe(
        "Initial stat values for player stats for this background. Provide an initial value for each player stat whose partOfPlayerBackgrounds attribute is set to true. Array of {statId, value} objects."
      ),
  })
  .describe(
    "A possible character background / starting point for this player. Consider the background archetypes. For multiplayer games, make sure that the backgrounds don't overlap and that the background options for different players are consistent with each other."
  );

export type CharacterBackground = z.infer<typeof characterBackgroundSchema>;

export const characterSelectionPlanSchema = z.object({
  multiplayerCoordination: z
    .array(
      z
        .string()
        .describe(
          "Mechanism to ensure that there is no overlap between the options for identities and backgrounds for different players. Examples: 'player1 will get options for the role of the thief, while player2 will get options for the role of the cleric', 'player1 comes from a certain place, while player2 comes from a different place'"
        )
    )
    .describe(
      "For multiplayer games: how do you ensure that the options for identities and backgrounds for each player are meaningfully different from and consistent with each other? List three mechanisms to avoid duplication and inconsistencies between players. For single-player games, this array can be left empty."
    ),
  playerStatConversionRates: z
    .array(
      z
        .string()
        .describe(
          "A rough conversion rate for player stats. Example: '10 points of Village Loyalty are worth 1 level of Adventurer Threat', '20% Stage Presence equals one level of Instrument Mastery', '50 Followers equals one Special Follower'"
        )
    )
    .describe(
      "List three rough conversion rates between player stats. This will help ensure that the background options for each player are balanced, with no option being clearly better than another."
    ),
  backgroundArchetypes: z
    .array(
      z
        .string()
        .describe(
          "Generic archetype with tradeoffs between player stats. Example: 'No starting gold, but high reputation and high loyalty', 'High Instrument Mastery, but low Stage Presence'"
        )
    )
    .describe(
      "Outline exactly 3 generic archetypes that the background options for the players could implement. Each archetype should represent a particular tradeoff between player stats, considering the player stat conversion rates. These generic archetypes will be turned into more flavorful backgrounds later."
    ),
});
export type CharacterSelectionPlan = z.infer<
  typeof characterSelectionPlanSchema
>;

export const playerOptionsGenerationSchema = z.object({
  outcomes: z
    .array(outcomeSchema)
    .describe(
      "Individual outcomes that will define the ending of the story for this player. No intermediate outcomes, only elements of the ending. No shared outcomes (those are generated elsewhere)."
    ),
  possibleCharacterIdentities: z
    .array(characterIdentitySchema)
    .describe(
      "Generate exactly 3 possible identities that the player can choose from."
    ),
  possibleCharacterBackgrounds: z
    .array(characterBackgroundSchema)
    .describe(
      "Generate exactly 3 possible backgrounds that the player can choose from. Implement the background archetypes in the character selection plan."
    ),
});
export type PlayerOptionsGeneration = z.infer<
  typeof playerOptionsGenerationSchema
>;

// Direct type definition for PlayerState
export type PlayerState = {
  name: string;
  pronouns: Pronouns;
  appearance: string;
  fluff: string;
  outcomes: Outcome[];
  statValues: StatValueEntry[];
  knownStoryElements: string[]; // ids of story elements that have already been introduced to the player
  beatHistory: BeatHistory;
  previousTypesOfThreads: string[];
  identityChoice: number;
  backgroundChoice: number;
};
