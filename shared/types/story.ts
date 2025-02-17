import { z } from "zod";
import { ImageLibrary } from "./image.js";
import { BeatHistory } from "./beat.js";
import { statsSchema, statSchema } from "./stat.js";
import { outcomesSchema } from "./outcome.js";
import {
  PLAYER_SLOTS,
  ExactPlayerMap,
  PlayerCount,
  PlayerSlot,
  PCSchema,
} from "./players.js";
import { StoryElementsSchema, StoryElement } from "./storyElement.js";

// GENERATION WITH LLM

export enum GameModes {
  Cooperative = "cooperative",
  Competitive = "competitive",
  CooperativeCompetitive = "cooperative-competitive",
  SinglePlayer = "single-player",
}

export const gameModeSchema = z.enum([
  GameModes.SinglePlayer,
  GameModes.Cooperative,
  GameModes.Competitive,
  GameModes.CooperativeCompetitive,
]);
export type GameMode = typeof gameModeSchema._type;

export const guidelinesSchema = z
  .object({
    world: z
      .string()
      .describe(
        "Three sentences about the essence of the world that the story takes place in."
      ),
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
        "Major conflicts driving the narrative and gameplay. For example, needs of superhero vs personal identity, confrontation with the nemesis"
      ),
    decisions: z
      .array(z.string())
      .describe(
        "Types of decisions that players will make. Should be tied to the conflicts. For example, prioritizing investigation leads given limited amount of time, following common sense morals vs. speeding up the investigation, how to manage resources, etc."
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

export const statGroupsSchema = z
  .array(z.string())
  .describe(
    "Names of groups for character stats. This is just a way to organize stats in the UI."
  );

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
      statGroups: statGroupsSchema,
      ...playerSchemas,
      storyElements: StoryElementsSchema,
      sharedStats: z
        .array(statSchema)
        .describe("Stats that are shared among players"),
    })
    .strict()
    .describe("Initial setup for the story");
};

// Helper type for the response - simplified by using ExactPlayerMap
export type StorySetup<N extends PlayerCount> = {
  guidelines: z.infer<typeof guidelinesSchema>;
  statGroups: z.infer<typeof statGroupsSchema>;
  storyElements: z.infer<typeof StoryElementsSchema>;
  sharedStats: z.infer<typeof statSchema>[];
} & ExactPlayerMap<z.infer<typeof playerStateGenerationSchema>, N>;

// TYPES USED BY APP (not LLM)

// Direct type definition for PlayerState
export type PlayerState = PlayerStateGeneration & {
  beatHistory: BeatHistory;
};

// Direct type definition for StoryState
export type StoryState = {
  guidelines: z.infer<typeof guidelinesSchema>;
  sharedStats: z.infer<typeof statsSchema>;
  storyElements: StoryElement[];
  worldFacts: string[];
  players: Record<(typeof PLAYER_SLOTS)[number], PlayerState>;
  maxTurns: number;
  generateImages: boolean;
  images: ImageLibrary;
  playerCodes: Record<(typeof PLAYER_SLOTS)[number], string>;
  gameMode: GameMode;
};

// Direct type definition for ClientStoryState
export type ClientStoryState = {
  numberOfPlayers: number;
  players: Record<(typeof PLAYER_SLOTS)[number], PlayerState>;
  gameMode: GameMode;
  sharedStats: z.infer<typeof statsSchema>;
  maxTurns: number;
  generateImages: boolean;
  images: ImageLibrary;
  pendingPlayers: PlayerSlot[];
};
