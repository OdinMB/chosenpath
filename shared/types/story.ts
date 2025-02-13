import { z } from "zod";
import { imageLibrarySchema } from "./image.js";
import { beatHistorySchema } from "./beat.js";
import { statsSchema, statSchema } from "./stat.js";
import { NPCsSchema, PCSchema } from "./character.js";
import { outcomesSchema } from "./outcome.js";
import { PlayerCount, ExactPlayerMap } from "./players.js";

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

export const storyStateSchema = z.object({
  guidelines: guidelinesSchema,
  stats: statsSchema,
  npcs: NPCsSchema,
  player: PCSchema,
  outcomes: outcomesSchema,
  establishedFacts: z.array(z.string()),
  beatHistory: beatHistorySchema,
  maxTurns: z.number(),
  generateImages: z.boolean(),
  images: imageLibrarySchema,
});

// Helper type for the response - simplified by using ExactPlayerMap
export type StorySetup<N extends PlayerCount> = {
  guidelines: z.infer<typeof guidelinesSchema>;
  npcs: z.infer<typeof NPCsSchema>;
  worldStats: z.infer<typeof statSchema>[];
} & ExactPlayerMap<z.infer<typeof playerStateGenerationSchema>, N>;

export type StoryState = z.infer<typeof storyStateSchema>;
