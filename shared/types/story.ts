import { z } from "zod";
import { ImageLibrary } from "./image.js";
import { BeatHistory } from "./beat.js";
import { statsSchema, statSchema } from "./stat.js";
import { NPCsSchema, PCSchema } from "./character.js";
import { outcomesSchema } from "./outcome.js";
import {
  PLAYER_SLOTS,
  ExactPlayerMap,
  PlayerCount,
  PlayerSlot,
} from "./players.js";

// GENERATION WITH LLM

export const guidelinesSchema = z
  .object({
    settingElements: z
      .array(z.string())
      .describe("Required characters, locations, and story elements"),
    rules: z
      .array(z.string())
      .describe(
        "Fundamental rules governing the story world (not your rules for creating the story)"
      ),
    tone: z
      .array(z.string())
      .describe("Emotional and narrative tone guidelines"),
    conflicts: z
      .array(z.string())
      .describe(
        "Major conflicts driving the narrative. E.g. needs of superhero vs personal identity, confrontation with the nemesis"
      ),
    decisions: z
      .array(z.string())
      .describe(
        "Types of decisions that should occur in the game. E.g. prioritizing investigation leads given limited amount of time, following common sense morals vs. speeding up the investigation"
      ),
  })
  .describe("Story guidelines and parameters");

export const playerStateGenerationSchema = z.object({
  character: PCSchema,
  outcomes: outcomesSchema,
  characterStats: z
    .array(statSchema)
    .describe("Stats belonging to this player character"),
});
export type PlayerStateGeneration = z.infer<typeof playerStateGenerationSchema>;

export const createStorySetupSchema = (playerCount: PlayerCount) => {
  // Create a record of required player schemas based on player count
  const playerSchemas = Object.fromEntries(
    Array.from({ length: playerCount }, (_, i) => [
      `player${i + 1}`,
      playerStateGenerationSchema,
    ])
  ) as Record<`player${number}`, typeof playerStateGenerationSchema>;

  return z
    .object({
      guidelines: guidelinesSchema,
      ...playerSchemas,
      npcs: NPCsSchema,
      worldStats: z.array(statSchema).describe("Stats of the world"),
    })
    .strict()
    .describe("Initial setup for the story");
};

// Helper type for the response - simplified by using ExactPlayerMap
export type StorySetup<N extends PlayerCount> = {
  guidelines: z.infer<typeof guidelinesSchema>;
  npcs: z.infer<typeof NPCsSchema>;
  worldStats: z.infer<typeof statSchema>[];
} & ExactPlayerMap<z.infer<typeof playerStateGenerationSchema>, N>;

// TYPES USED BY APP (not LLM)

// Direct type definition for PlayerState
export type PlayerState = PlayerStateGeneration & {
  beatHistory: BeatHistory;
};

// Direct type definition for StoryState
export type StoryState = {
  guidelines: z.infer<typeof guidelinesSchema>;
  worldStats: z.infer<typeof statsSchema>;
  npcs: z.infer<typeof NPCsSchema>;
  players: Record<(typeof PLAYER_SLOTS)[number], PlayerState>;
  establishedFacts: string[];
  maxTurns: number;
  generateImages: boolean;
  images: ImageLibrary;
  playerCodes: Record<(typeof PLAYER_SLOTS)[number], string>;
};

// Direct type definition for ClientStoryState
export type ClientStoryState = {
  numberOfPlayers: number;
  players: Record<(typeof PLAYER_SLOTS)[number], PlayerState>;
  worldStats: z.infer<typeof statsSchema>;
  maxTurns: number;
  generateImages: boolean;
  images: ImageLibrary;
  pendingPlayers: PlayerSlot[];
};
