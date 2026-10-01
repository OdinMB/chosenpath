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
import { AiContentProvenance } from "./provenance.js";
import { MAX_PLAYERS } from "../config.js";

/**
 * The setup categories a custom story can be created from. Template stories
 * tagged "Kids" count as read-with-kids (categoryFromTemplateTags).
 */
export const STORY_CATEGORIES = [
  "flexible",
  "enjoy-fiction",
  "vent-about-reality",
  "pretend-to-be",
  "see-your-future-self",
  "read-with-kids",
  "learn-something",
] as const;
export type StoryCategory = (typeof STORY_CATEGORIES)[number];

export function isStoryCategory(value: unknown): value is StoryCategory {
  return (
    typeof value === "string" &&
    (STORY_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * The category a template story counts as. Only "Kids" maps to one: the
 * library's "Read with Kids" shelf lists the templates with that tag.
 */
export function categoryFromTemplateTags(
  tags: string[] | undefined
): StoryCategory | undefined {
  return tags?.some((tag) => tag.trim().toLowerCase() === "kids")
    ? "read-with-kids"
    : undefined;
}

/**
 * The read-with-kids form's one field (client/src/page/components/
 * StoryInitializer.tsx, categoryConfigs): the client merges it into the
 * premise as a line "How old is the child?: 5".
 */
export const KID_AGE_LABEL = "How old is the child?";

/**
 * The answer on the read-with-kids form's line of a premise, trimmed, as the
 * person typed it; undefined where the premise has no such line.
 */
export function kidAgeAnswer(premise: string): string | undefined {
  const line = premise.split("\n").find((l) => l.startsWith(`${KID_AGE_LABEL}:`));
  return line === undefined ? undefined : line.slice(KID_AGE_LABEL.length + 1).trim();
}

/**
 * The words an age answer may carry besides its numbers ("6 years old", "about
 * 7", "8 to 12", "a 5 year old and an 8 year old"). Anything else makes the
 * answer unreadable, so free text never reaches a turn.
 */
const AGE_WORDS = new Set(
  "a an and or to about around almost nearly roughly approximately approx age ages aged year years yr yrs y yo old".split(" ")
);
/** Separators between ages: a hyphen or dash for a range, a comma, ampersand or plus for a list. */
const AGE_SEPARATORS = /[-–—,&+]/g;

/**
 * The child's age as a read-with-kids premise states it, for every turn's
 * instructions: "5", or a range "8-10" from the youngest age the answer names
 * to the oldest (a range, or two children's ages "5, 8"). Only numbers of one
 * or two digits come out, never the answer's words, and only when every other
 * word is one of AGE_WORDS; undefined otherwise, or where the premise has no
 * such line. The form's field is free text (its placeholder "5, 8-10").
 */
export function readingAgeFromPremise(premise: string): string | undefined {
  const answer = kidAgeAnswer(premise);
  if (!answer) return undefined;
  const tokens = answer.toLowerCase().replace(AGE_SEPARATORS, " ").split(/\s+/).filter(Boolean).map((t) => t.replace(/\.$/, ""));
  if (!tokens.every((t) => /^\d{1,2}$/.test(t) || AGE_WORDS.has(t))) return undefined;
  const ages = tokens.filter((t) => /^\d{1,2}$/.test(t)).map(Number);
  if (ages.length === 0) return undefined;
  const youngest = Math.min(...ages);
  const oldest = Math.max(...ages);
  return youngest === oldest ? `${youngest}` : `${youngest}-${oldest}`;
}

/*
 * The read-with-kids setting (the owner's decision of 2026-10-01: "this should
 * depend on the age range that should be part of kids stories settings"): the
 * children's ages a story is read with, one age or a range, set on the setup
 * form and in the template editor, recorded on the story as its youngest and
 * oldest age. A story's turns are written for the band of its youngest child.
 */

/** The children's ages a read-with-kids story is read with, in whole years: one age (min = max) or a range. */
export type KidAges = { min: number; max: number };

/** The ages the setting accepts. */
export const KID_AGES_MIN = 2;
export const KID_AGES_MAX = 14;

/** What the setup form and the template editor say about a value they can't read. */
export const KID_AGES_HINT = `Enter an age like 5 or a range like 8-10, from ${KID_AGES_MIN} to ${KID_AGES_MAX}.`;

const inAgeRange = (age: number) => Number.isInteger(age) && age >= KID_AGES_MIN && age <= KID_AGES_MAX;

/**
 * The setting as the form takes it: one age ("5") or a range ("8-10"; a hyphen
 * or dash, spaces around it allowed, or "8 to 10"), whole years from 2 to 14,
 * the youngest first. Undefined for anything else, so the form can say so.
 */
export function parseKidAges(text: string): KidAges | undefined {
  const match = /^\s*(\d{1,2})(?:\s*(?:[-–—]|\bto\b)\s*(\d{1,2}))?\s*$/i.exec(text);
  if (!match) return undefined;
  const min = Number(match[1]);
  const max = match[2] === undefined ? min : Number(match[2]);
  return inAgeRange(min) && inAgeRange(max) && min <= max ? { min, max } : undefined;
}

/** A recorded or requested setting read back: whole ages from 2 to 14, the youngest first, and nothing else; undefined otherwise. */
export function kidAgesFrom(value: unknown): KidAges | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const { min, max } = value as Record<string, unknown>;
  if (typeof min !== "number" || typeof max !== "number") return undefined;
  return inAgeRange(min) && inAgeRange(max) && min <= max ? { min, max } : undefined;
}

/** The ages as the form shows them and a turn names them: "5" or "8-10". */
export function kidAgesText(ages: KidAges): string {
  return ages.min === ages.max ? `${ages.min}` : `${ages.min}-${ages.max}`;
}

/** A premise's age line read as the setting (readingAgeFromPremise), for a premise sent without it: an older client. */
export function kidAgesFromPremise(premise: string): KidAges | undefined {
  const age = readingAgeFromPremise(premise);
  return age === undefined ? undefined : parseKidAges(age);
}

/** The age bands a read-with-kids story's turns are written for. */
export const KIDS_BANDS = ["3-5", "6-8", "9-12"] as const;
export type KidsBand = (typeof KIDS_BANDS)[number];

/** The band of the youngest child: up to 5 (two-year-olds too), 6 to 8, and 9 or older (13 and 14 too). */
export function kidsBandOf(ages: KidAges): KidsBand {
  if (ages.min <= 5) return "3-5";
  if (ages.min <= 8) return "6-8";
  return "9-12";
}

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
  Private = "private",
}

export const publicationStatusSchema = z.enum([
  PublicationStatus.Draft,
  PublicationStatus.Review,
  PublicationStatus.Published,
  PublicationStatus.Private,
]);
export type PublicationStatusType = typeof publicationStatusSchema._type;

export const difficultyLevelSchema = z.object({
  modifier: z
    .number()
    .describe(
      "Modifier that will be applied to all random number checks in the story. Must be one of: -20, -10, 0, 10, 20. Use steps of 10. Default is 0."
    ),
  title: z
    .string()
    .describe(
      "Short, flavorful title for the difficulty level appropriate to the story's setting."
    ),
});
export type DifficultyLevel = z.infer<typeof difficultyLevelSchema>;

// For single-story generation (not templates), constrain to allowed values only
const storyDifficultyModifierSchema = z.union([
  z.literal(-20),
  z.literal(-10),
  z.literal(0),
  z.literal(10),
  z.literal(20),
]);
const storyDifficultyLevelSchema = z.object({
  modifier: storyDifficultyModifierSchema.describe(
    "Modifier must be one of: -20, -10, 0, 10, 20. Keep most stories within -10 to +10. Kids stories and cozy slice-of-life stories should be easier (+10/+20). Gritty survival/grueling adventures should be harder (-10/-20)."
  ),
  title: z
    .string()
    .describe(
      "Short, flavorful title for the difficulty level appropriate to the story's setting."
    ),
});

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
            difficultyLevel: storyDifficultyLevelSchema.describe(
              "Choose exactly one difficulty level for this story: modifier must be -20, -10, 0, 10, or 20. Default is 0 if unclear. Kids and cozy slice-of-life stories should skew easier (+10/+20). Gritty survival/grueling adventures should skew harder (-10/-20). Most stories fall within -10 to +10."
            ),
          }
        : {
            difficultyLevels: z
              .array(difficultyLevelSchema)
              .describe(
                "Array of 1-5 difficulty levels for the template that the player can choose from. Each should have a unique title appropriate to this world's setting. Skew the difficulty levels to match the story's tone and setting: kids stories and cozy slice-of-life stories should be easier (+10/+20). Gritty survival/grueling adventures should be harder (-10/-20)."
              ),
            teaser: z
              .string()
              .describe(
                "A compelling 1 sentence description that captures the essence and excitement of this world/template. Should intrigue players and make them want to play."
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
          "Stats that are not tied specifically to individual players, including multiplayer elements (a shared spaceship, aspects of a shared group, etc.), aspects of the environment or world in general, etc. Generate 3-4 visible shared stats, plus any invisible ones the story needs. For multiplayer games with a competitive element, consider adding an opposite stat to track who is in the lead (for 2 players) or a string to track which player currently has the most momentum (for 3+ players)."
        ),
      playerStats: z
        .array(statSchema)
        .describe(
          "Stats that are tied specifically to individual players, including traits, skills, dispositions, health, personal relationships, personal resources, personal reputation, personal inventory, etc. In multiplayer games, each player has different values for these stats. Generate 3-4 visible player stats, plus any invisible ones the story needs."
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
  /** The camps its seat roles name, read by the server before the plan holding them is dropped (StoryState.camps). */
  camps?: Camps;
};

export type TemplateSetupGeneration<N extends PlayerCount> =
  StorySetupBase<N> & {
    teaser: string;
    difficultyLevels: DifficultyLevel[];
  };

export type StoryTemplate = StorySetupBase<typeof MAX_PLAYERS> & {
  id: string;
  creatorId?: string;
  creatorUsername?: string;
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
  containsImages: boolean;
  // Optional app-level field to track reference images for the cover
  coverImageReferenceIds?: string[];
  /** A template tagged Kids: the children's ages its stories are read with (the read-with-kids setting); null clears it on save. */
  kidAges?: KidAges | null;
};

/**
 * Template metadata for browsing/listing without full game content
 * Used for public browsing, user template lists, and admin template management
 */
export type TemplateMetadata = {
  id: string;
  creatorId?: string;
  creatorUsername?: string;
  title: string;
  teaser: string;
  gameMode: GameMode;
  tags: string[];
  playerCountMin: PlayerCount;
  playerCountMax: PlayerCount;
  maxTurnsMin: number;
  maxTurnsMax: number;
  difficultyLevels?: DifficultyLevel[];
  publicationStatus: PublicationStatusType;
  showOnWelcomeScreen: boolean;
  order: number;
  containsImages: boolean;
  createdAt: string;
  updatedAt: string;
};

// TYPES USED BY APP (not LLM)

export type StoryPhase = SwitchAnalysis | ThreadAnalysis;

// Pregeneration state tracking
export type PregeneratedState = {
  storyId: string;
  turn: number;
  playerSlot: PlayerSlot;
  optionIndex: number;
  storyState: StoryState;
  createdAt: number; // timestamp
  status: "pending" | "completed" | "failed";
};

/** A contest's side on its scoreboard, and the camp that plays for it: side A is player1's (setup round 3's form). */
export type Camp = "sideA" | "sideB";

/** The camp each seat plays for, by seat. */
export type Camps = Partial<Record<PlayerSlot, Camp>>;

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
  pregenerateBeats: boolean;
  images: ImageLibrary;
  /** Story images whose generation failed; the reader hides their slots. */
  failedImageIds?: string[];
  /** Absent on stories created before categories were recorded. */
  category?: StoryCategory;
  /** A read-with-kids story: the children's ages, its setup form's or its template's setting, else its premise's age line (2026-10-01). */
  kidAges?: KidAges;
  /** Stories saved between the kids-turns stage and the setting (2026-10-01): the child's age the premise stated ("5", "8-10"), read only where kidAges is absent. */
  readingAge?: string;
  /**
   * Three players with contests: the camp each seat plays for, as its setup's seat roles name it ("player3: the
   * landlord's nephew (side B)", setup round 3's form), kept since 2026-10-01. Absent on a story set up before then, on
   * a template's story, and where the seat roles don't name one camp for every seat.
   */
  camps?: Camps;
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
  failedImageIds?: string[];
  category?: StoryCategory;
  pendingPlayers: PlayerSlot[];
  gameOver: boolean;
  /** Marks the story text in this state as AI-generated, for machines. */
  provenance?: AiContentProvenance;
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
  playerStatusCounts?: {
    active: number;
    archived: number;
    deleted: number;
  };
};
