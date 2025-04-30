import { z } from "zod";
import {
  ImageLibrary,
  ImageInstructions,
  imageInstructionsSchema,
} from "./image.js";
import {
  statSchema,
  Stat,
  ClientStat,
  statValueEntrySchema,
  StatValueEntry,
} from "./stat.js";
import { outcomeSchema, Outcome } from "./outcome.js";
import {
  PLAYER_SLOTS,
  ExactPlayerMap,
  PlayerCount,
  PlayerSlot,
  PlayerState,
  characterSelectionIntroductionSchema,
  CharacterSelectionIntroduction,
  characterSelectionPlanSchema,
  playerOptionsGenerationSchema,
  PlayerOptionsGeneration,
} from "./player.js";
import { StoryElementsSchema, StoryElement } from "./storyElement.js";
import { SwitchAnalysis } from "./switch.js";
import { ThreadAnalysis } from "./thread.js";
import { MAX_PLAYERS } from "../config.js";

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

export enum PublicationStatus {
  Draft = "draft",
  Review = "review",
  Published = "published",
}

export const publicationStatusSchema = z.enum([
  PublicationStatus.Draft,
  PublicationStatus.Review,
  PublicationStatus.Published,
]);
export type PublicationStatusType = typeof publicationStatusSchema._type;

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
    typesOfThreads: z
      .array(z.string())
      .describe(
        "6-8 types of threads that fit the story. For example: witness interview, car chase, romantic date, physical fight, etc."
      ),
    switchAndThreadInstructions: z
      .array(z.string())
      .describe(
        "Special rules that dictate how switches and threads should be structured or behave throughout the story. These instructions influence story progression and may include time rules, resource consumption patterns, thread availability conditions, and special thread unlocking mechanics. Examples: each thread represents at least one day of story time; players lose 5% rations after each thread; thread types should alternate between action and dialogue; players must face a specific challenge every N threads; certain types of threads should be 2 beats long; etc. Generate 0-3 instructions. (Not every story needs these instructions.)"
      ),
  })
  .describe("Story guidelines and parameters");
export type Guidelines = z.infer<typeof guidelinesSchema>;

export const statGroupsSchema = z
  .array(z.string())
  .describe(
    "Names of groups for character stats. This is just a way to organize stats in the UI. Maximum of 3 groups."
  );

export const createStorySetupSchema = (playerCount: PlayerCount) => {
  // Create a record of required player schemas based on player count
  const playerSchemas = Object.fromEntries(
    Array.from({ length: playerCount }, (_, i) => [
      `player${i + 1}`,
      playerOptionsGenerationSchema,
    ])
  ) as Record<`player${number}`, typeof playerOptionsGenerationSchema>;

  return z
    .object({
      guidelines: guidelinesSchema,
      storyElements: StoryElementsSchema,
      sharedOutcomes: z
        .array(outcomeSchema)
        .describe(
          "Shared outcomes that (together with individual outcomes) will make up the endings of the story for all players. Can include both shared goals and questions that players compete over. No intermediate outcomes, only elements of the ending."
        ),
      statGroups: statGroupsSchema,
      sharedStats: z
        .array(statSchema)
        .describe(
          "Stats that are not tied specifically to individual players, including multiplayer elements (a shared spaceship, aspects of a shared group, etc.), aspects of the environment or world in general, etc. Generate 3-4 shared stats. For multiplayer games with a competitive element, consider adding an opposite stat to track who is in the lead (for 2 players) or a string to track which player currently has the most momentum (for 3+ players)."
        ),
      initialSharedStatValues: z
        .array(statValueEntrySchema)
        .describe(
          "Initial values for the shared stats. Array of {statId, value} objects."
        ),
      playerStats: z
        .array(statSchema)
        .describe(
          "Stats that are tied specifically to individual players, including traits, skills, dispositions, health, personal relationships, personal resources, personal reputation, personal inventory, etc. In multiplayer games, each player has different values for these stats. Generate 3-4 player stats."
        ),
      characterSelectionPlan: characterSelectionPlanSchema,
      ...playerSchemas,
      title: z.string().describe("Title of the story"),
      characterSelectionIntroduction: characterSelectionIntroductionSchema,
      imageInstructions: imageInstructionsSchema,
    })
    .describe("Initial setup for the story");
};

// TYPES USED BY THE APP

// Helper type - simplified by using ExactPlayerMap
export type StorySetupBase<N extends PlayerCount> = {
  title: string;
  imageInstructions: ImageInstructions;
  guidelines: Guidelines;
  storyElements: StoryElement[];
  sharedOutcomes: Outcome[];
  statGroups: string[];
  playerStats: Stat[];
  sharedStats: Stat[];
  initialSharedStatValues: StatValueEntry[];
  characterSelectionIntroduction: CharacterSelectionIntroduction;
} & ExactPlayerMap<z.infer<typeof playerOptionsGenerationSchema>, N>;

export type StorySetupGeneration<N extends PlayerCount> = StorySetupBase<N>;

export type StoryTemplate = StorySetupBase<typeof MAX_PLAYERS> & {
  id: string;
  createdAt: string;
  updatedAt: string;
  gameMode: GameMode;
  playerCountMin: PlayerCount;
  playerCountMax: PlayerCount;
  maxTurnsMin: number;
  maxTurnsMax: number;
  teaser: string;
  tags: string[];
  publicationStatus: PublicationStatusType;
  imageFile: string;
  showOnWelcomeScreen: boolean;
  order: number;
};

// TYPES USED BY APP (not LLM)

export type StoryPhase = SwitchAnalysis | ThreadAnalysis;

// Direct type definition for StoryState
export type StoryState = {
  templateId?: string;
  title: string;
  imageInstructions: ImageInstructions;
  gameMode: GameMode;
  guidelines: Guidelines;
  storyElements: StoryElement[];
  worldFacts: string[];
  sharedOutcomes: Outcome[];
  sharedStats: Stat[];
  sharedStatValues: StatValueEntry[];
  playerStats: Stat[];
  players: Record<(typeof PLAYER_SLOTS)[number], PlayerState>;
  storyPhases: StoryPhase[];
  maxTurns: number;
  characterSelectionCompleted: boolean;
  characterSelectionOptions: Record<
    (typeof PLAYER_SLOTS)[number],
    PlayerOptionsGeneration
  >;
  characterSelectionIntroduction: CharacterSelectionIntroduction;
  generateImages: boolean;
  images: ImageLibrary;
  playerCodes: Record<(typeof PLAYER_SLOTS)[number], string>;
};

// Direct type definition for ClientStoryState
export type ClientStoryState = {
  templateId?: string;
  title: string;
  gameMode: GameMode;
  sharedStats: ClientStat[];
  sharedStatValues: StatValueEntry[];
  playerStats: ClientStat[];
  players: Record<(typeof PLAYER_SLOTS)[number], PlayerState>;
  maxTurns: number;
  characterSelectionCompleted: boolean;
  characterSelectionOptions: Record<
    (typeof PLAYER_SLOTS)[number],
    PlayerOptionsGeneration
  >;
  characterSelectionIntroduction: CharacterSelectionIntroduction;
  generateImages: boolean;
  images: ImageLibrary;
  pendingPlayers: PlayerSlot[];
  gameOver: boolean;
};
