import { z } from "zod";
import {
  ImageLibrary,
  ImageInstructions,
  imageInstructionsSchema,
} from "./image.js";
import { statSchema, Stat, ClientStat, StatValueEntry } from "./stat.js";
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

export const difficultyLevelSchema = z.object({
  modifier: z
    .number()
    .describe(
      "Modifier that will be applied to all random number checks in the story. Between +10 and -40. Use steps of 10. Default is -10. At that level, players tend to achieve most but not all of their goals in the end. At -30, players tend to achieve only a few of their goals, and the story features many failures."
    ),
  title: z
    .string()
    .describe(
      "Short term to summarize the difficulty level in a way that works for the story's setting. Examples: 'Friendly' (for a kids story with +10 modifier), 'Unforgiving' (for a survival story with -30 modifier)"
    ),
});
export type DifficultyLevel = z.infer<typeof difficultyLevelSchema>;

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
        "Instructions for switches and threads to manage the flow of the story. Can be used to: a) adjust certain stats after each thread (players lose 5% rations after each thread), b) define conditions for threads to happen ('after receiving a contract, jump immediately into the job with a flavor switch'), c) define the intended length of certain threads ('healing/repair threads should only be 2 beats long'), d) ensure diversity in thread types ('should alternate between action and social threads'). Generate 0-3 instructions. (Not every story needs these instructions.)"
      ),
  })
  .describe("Story guidelines and parameters");
export type Guidelines = z.infer<typeof guidelinesSchema>;

export const statGroupsSchema = z
  .array(z.string())
  .describe(
    "Names of groups for character stats. This is just a way to organize stats in the UI. Maximum of 3 groups."
  );

export const createStorySetupSchema = (
  playerCount: PlayerCount,
  mode: "story" | "template" = "story"
) => {
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
      ...(mode === "story"
        ? {
            difficultyLevel: difficultyLevelSchema.describe(
              "Difficulty level that will be used in the story. Choose a modifier that works for the story. Default modifier is -10. A harsh survival story might have -20/-30; a satire about billionaires doing whatever they want might have 0; a kids story might have +10."
            ),
          }
        : {
            difficultyLevels: z
              .array(difficultyLevelSchema)
              .describe(
                "Array of 1-3 difficulty levels for the template that the player can choose from."
              ),
          }),
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
  characterSelectionIntroduction: CharacterSelectionIntroduction;
} & ExactPlayerMap<z.infer<typeof playerOptionsGenerationSchema>, N>;

export type StorySetupGeneration<N extends PlayerCount> = StorySetupBase<N> & {
  difficultyLevel: DifficultyLevel;
};

export type StoryTemplate = StorySetupBase<typeof MAX_PLAYERS> & {
  id: string;
  createdAt: string;
  updatedAt: string;
  gameMode: GameMode;
  difficultyLevels: DifficultyLevel[];
  playerCountMin: PlayerCount;
  playerCountMax: PlayerCount;
  maxTurnsMin: number;
  maxTurnsMax: number;
  teaser: string;
  tags: string[];
  publicationStatus: PublicationStatusType;
  showOnWelcomeScreen: boolean;
  order: number;
};

// TYPES USED BY APP (not LLM)

export type StoryPhase = SwitchAnalysis | ThreadAnalysis;

// Direct type definition for StoryState
export type StoryState = {
  id: string;
  templateId?: string;
  title: string;
  imageInstructions: ImageInstructions;
  gameMode: GameMode;
  difficultyLevel: DifficultyLevel;
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
  id: string;
  templateId?: string;
  title: string;
  gameMode: GameMode;
  difficultyLevel: DifficultyLevel;
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

// Type for items in the admin stories list
export type AdminStoriesListItem = {
  id: string;
  title: string | null;
  createdAt: string; // ISO string format
  updatedAt: string; // ISO string format
  gameMode: string | null;
  difficultyLevel: DifficultyLevel | null;
  playerCount: number;
  characterSelectionCompleted: boolean;
  maxTurns: number;
  currentBeat: number;
  templateId?: string | null;
  error?: string; // Optional error message if story JSON couldn't be fully processed
};
