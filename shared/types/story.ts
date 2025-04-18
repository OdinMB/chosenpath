import { z } from "zod";
import { ImageLibrary } from "./image.js";
import { BeatHistory } from "./beat.js";
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
  characterIdentitySchema,
  characterBackgroundSchema,
  Pronouns,
  characterSelectionIntroductionSchema,
  CharacterSelectionIntroduction,
  characterSelectionPlanSchema,
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
  })
  .describe("Story guidelines and parameters");

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
    })
    .describe("Initial setup for the story");
};

// Helper type - simplified by using ExactPlayerMap
export type StorySetupBase<N extends PlayerCount> = {
  title: string;
  guidelines: z.infer<typeof guidelinesSchema>;
  storyElements: z.infer<typeof StoryElementsSchema>;
  sharedOutcomes: Outcome[];
  statGroups: z.infer<typeof statGroupsSchema>;
  playerStats: z.infer<typeof statSchema>[];
  sharedStats: z.infer<typeof statSchema>[];
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
};

// TYPES USED BY APP (not LLM)

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
  characterSelected: boolean; // Whether the player has selected an identity and background
};

export type StoryPhase = SwitchAnalysis | ThreadAnalysis;
export type Guidelines = z.infer<typeof guidelinesSchema>;

// Direct type definition for StoryState
export type StoryState = {
  title: string;
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
  numberOfPlayers: number;
  pendingPlayers: PlayerSlot[];
  gameOver: boolean;
};
