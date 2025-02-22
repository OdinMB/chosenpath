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
} from "./player.js";
import { StoryElementsSchema, StoryElement } from "./storyElement.js";
import { BeatType } from "./beat.js";
import { SwitchAnalysis } from "./switch.js";
import { ThreadAnalysis } from "./thread.js";

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
  outcomes: outcomesSchema.describe(
    "Individual outcomes that (together with shared outcomes) will make up the ending of the story for this player. No intermediate outcomes, only elements of the ending."
  ),
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
      storyElements: StoryElementsSchema,
      sharedOutcomes: outcomesSchema.describe(
        "Shared outcomes that (together with individual outcomes) will make up the endings of the story for all players. Can include both shared goals and questions that players compete over. No intermediate outcomes, only elements of the ending."
      ),
      statGroups: statGroupsSchema,
      ...playerSchemas,
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
  storyElements: z.infer<typeof StoryElementsSchema>;
  sharedOutcomes: z.infer<typeof outcomesSchema>;
  statGroups: z.infer<typeof statGroupsSchema>;
  sharedStats: z.infer<typeof statSchema>[];
} & ExactPlayerMap<z.infer<typeof playerStateGenerationSchema>, N>;

// TYPES USED BY APP (not LLM)

// Direct type definition for PlayerState
export type PlayerState = PlayerStateGeneration & {
  knownStoryElements: string[]; // ids of story elements that have already been introduced to the player
  beatHistory: BeatHistory;
};

// Direct type definition for StoryState
export type StoryState = {
  gameMode: GameMode;
  guidelines: z.infer<typeof guidelinesSchema>;
  storyElements: StoryElement[];
  worldFacts: string[];
  sharedOutcomes: z.infer<typeof outcomesSchema>;
  sharedStats: z.infer<typeof statsSchema>;
  players: Record<(typeof PLAYER_SLOTS)[number], PlayerState>;
  maxTurns: number;
  currentBeatType: BeatType | null;
  currentSwitchAnalysis: SwitchAnalysis | null;
  currentThreadAnalysis: ThreadAnalysis | null;
  currentThreadMaxBeats: number;
  currentThreadBeatsCompleted: number;
  previousThreadAnalysis: ThreadAnalysis | null; // to avoid confusion when a new switch has already been generated but not yet the associated threads
  generateImages: boolean;
  images: ImageLibrary;
  playerCodes: Record<(typeof PLAYER_SLOTS)[number], string>;
};

// Direct type definition for ClientStoryState
export type ClientStoryState = {
  gameMode: GameMode;
  players: Record<(typeof PLAYER_SLOTS)[number], PlayerState>;
  sharedStats: z.infer<typeof statsSchema>;
  maxTurns: number;
  generateImages: boolean;
  images: ImageLibrary;
  numberOfPlayers: number;
  pendingPlayers: PlayerSlot[];
  gameOver: boolean;
};
