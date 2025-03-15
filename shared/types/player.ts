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

// Character identity schema (name and pronouns)
export const characterIdentitySchema = z.object({
  name: z.string().describe("Name of the character/entity"),
  pronouns: z
    .string()
    .describe(
      "Character/entity pronouns (e.g., 'he/him', 'she/her', 'they/them', 'it/its')"
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
        "Character background description with placeholders for {name}, {personal pronoun}, {possessive pronoun}, and {reflexive pronoun} (that will be replaced with the actual values later)"
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
