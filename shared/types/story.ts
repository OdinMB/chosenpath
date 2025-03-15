import { z } from "zod";
import { ImageLibrary } from "./image.js";
import { BeatHistory } from "./beat.js";
import {
  statSchema,
  Stat,
  ClientStat,
  statValueEntrySchema,
  StatValueEntry,
  initialStatValueDescription,
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
  CharacterSelectionPlan,
} from "./player.js";
import { StoryElementsSchema, StoryElement } from "./storyElement.js";
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

export const playerOptionsGenerationSchema = z.object({
  outcomes: z
    .array(outcomeSchema)
    .describe(
      "Individual outcomes that (together with any shared outcomes) will make up the ending of the story for this player. No intermediate outcomes, only elements of the ending."
    ),
  possibleCharacterIdentities: z
    .array(characterIdentitySchema)
    .describe(
      "Generate exactly 3 possible identities that the player can choose from."
    ),
  possibleCharacterBackgrounds: z
    .array(characterBackgroundSchema)
    .describe(
      "Generate exactly 3 possible backgrounds that the player can choose from. Make sure that the stats for each background are meaningfully different from each other but still balanced. For example, if one stat in background 1 is better than the same stat in background 2, another stat in background 1 should be worse than the same stat in background 2."
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
        .describe("Stats that are shared among players"),
      initialSharedStatValues: z
        .array(statValueEntrySchema)
        .describe(
          "Initial values for the shared stats. Array of {statId, value} objects.\n" +
            initialStatValueDescription
        ),
      playerStats: z
        .array(statSchema)
        .describe("Stats that each player has individually"),
      characterSelectionPlan: characterSelectionPlanSchema,
      ...playerSchemas,
      title: z.string().describe("Title of the story"),
      characterSelectionIntroduction: characterSelectionIntroductionSchema,
    })
    .describe("Initial setup for the story");
};

// Helper type for the response - simplified by using ExactPlayerMap
export type StorySetup<N extends PlayerCount> = {
  title: string;
  guidelines: z.infer<typeof guidelinesSchema>;
  storyElements: z.infer<typeof StoryElementsSchema>;
  sharedOutcomes: Outcome[];
  statGroups: z.infer<typeof statGroupsSchema>;
  playerStats: z.infer<typeof statSchema>[];
  sharedStats: z.infer<typeof statSchema>[];
  initialSharedStatValues: StatValueEntry[];
  characterSelectionPlan: CharacterSelectionPlan;
  characterSelectionIntroduction: CharacterSelectionIntroduction;
} & ExactPlayerMap<z.infer<typeof playerOptionsGenerationSchema>, N>;

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
  characterSelected?: boolean; // Whether the player has selected a character
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
  characterSelectionPlan: CharacterSelectionPlan;
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
