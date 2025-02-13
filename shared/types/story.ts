import { z } from "zod";
import { imageLibrarySchema } from "./image.js";
import { beatHistorySchema } from "./beat.js";
import { statsSchema, statSchema } from "./stat.js";
import { NPCsSchema, PCSchema } from "./character.js";
import { outcomesSchema } from "./outcome.js";
import { PLAYER_SLOTS, ExactPlayerMap, PlayerCount } from "./players.js";

// GENERATION WITH LLM

export const guidelinesSchema = z
  .object({
    settingElements: z
      .array(z.string())
      .describe("Required characters, locations, and story elements"),
    rules: z
      .array(z.string())
      .describe("Fundamental rules governing the story world"),
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
  characterStats: z.array(statSchema).describe("Stats belonging to this player character"),
});
export type PlayerStateGeneration = z.infer<typeof playerStateGenerationSchema>;

export const createStorySetupSchema = (playerCount: PlayerCount) => {
  // Create a record of required player schemas based on player count
  const playerSchemas = Object.fromEntries(
    Array.from({ length: playerCount }, (_, i) => [
      `player${i + 1}`,
      playerStateGenerationSchema
    ])
  ) as Record<`player${number}`, typeof playerStateGenerationSchema>;

  return z.object({
    guidelines: guidelinesSchema,
    ...playerSchemas,
    npcs: NPCsSchema,
    worldStats: z.array(statSchema).describe("Stats of the world")
  }).strict().describe("Initial setup for the story");
};

// Helper type for the response - simplified by using ExactPlayerMap
export type StorySetup<N extends PlayerCount> = {
  guidelines: z.infer<typeof guidelinesSchema>;
  npcs: z.infer<typeof NPCsSchema>;
  worldStats: z.infer<typeof statSchema>[];
} & ExactPlayerMap<z.infer<typeof playerStateGenerationSchema>, N>;

// STORY STATE USED BY SERVER

// Convert PLAYER_SLOTS array to tuple type for Zod
const playerSlotsTuple = PLAYER_SLOTS as unknown as [string, ...string[]];

// New schema for player state that includes beat history
export const playerStateSchema = playerStateGenerationSchema.extend({
  beatHistory: beatHistorySchema,
});

export const storyStateSchema = z.object({
  guidelines: guidelinesSchema,
  worldStats: statsSchema,
  npcs: NPCsSchema,
  players: z.record(z.enum(playerSlotsTuple), playerStateSchema),
  establishedFacts: z.array(z.string()),
  maxTurns: z.number(),
  generateImages: z.boolean(),
  images: imageLibrarySchema,
  playerCodes: z.record(z.enum(playerSlotsTuple), z.string()),
});

export type StoryState = z.infer<typeof storyStateSchema>;
