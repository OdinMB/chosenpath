import { v5 as uuidv5 } from "uuid";
import {
  GameModes,
  PublicationStatus,
  type DifficultyLevel,
  type FeedbackRating,
  type FeedbackType,
  type GameMode,
  type PlayerCount,
  type PlayerOptionsGeneration,
  type PlayerSlot,
  type PublicationStatusType,
  type StoryTemplate,
} from "core/types/index.js";

/*
 * The synthetic data the dev seed writes (seedDevDatabase.ts). Everything is
 * made up: example.com addresses, "dev_" usernames, titles starting "Dev
 * sample", comments starting "Synthetic". The plan is a pure function of the
 * time it is built at, and every id is derived from a fixed key, so a second
 * run finds the same rows and adds nothing.
 */

/** The local test login (CLAUDE.md). The only address outside example.com. */
export const DEV_LOGIN_EMAIL = "claude@localdevelopment.com";
/** The password of every account the seed creates (CLAUDE.md's local test password). */
export const DEV_SEED_PASSWORD = "asdF!234";

// A fixed namespace for the seed's v5 UUIDs: the same key always gives the same id.
const DEV_SEED_NAMESPACE = "6f1c2a52-5d1e-4c6b-9a57-0d1f3c9e7b21";

export function devSeedId(kind: string, key: string): string {
  return uuidv5(`chosenpath-dev-seed/${kind}/${key}`, DEV_SEED_NAMESPACE);
}

export type SeedRoleId = "role_admin" | "role_worldbuilder" | "role_user";

export type SeedUser = {
  /** How the other rows refer to this account; its id is only known once it exists. */
  key: string;
  email: string;
  username: string;
  roleId: SeedRoleId;
};

export type SeedTemplate = {
  id: string;
  creatorKey: string;
  title: string;
  teaser: string;
  gameMode: GameMode;
  tags: string[];
  publicationStatus: PublicationStatusType;
  playerCountMin: PlayerCount;
  playerCountMax: PlayerCount;
  maxTurnsMin: number;
  maxTurnsMax: number;
  difficultyLevels: DifficultyLevel[];
  orderValue: number;
  createdAt: number;
  updatedAt: number;
};

export type SeedStoryPlayer = {
  slot: PlayerSlot;
  code: string;
  userKey: string | null;
  isPending: boolean;
  status: "active" | "archived";
  lastPlayedAt: number | null;
};

export type SeedStory = {
  id: string;
  templateId: string | null;
  creatorKey: string;
  title: string;
  maxTurns: number;
  currentBeat: number;
  difficulty: DifficultyLevel;
  createdAt: number;
  updatedAt: number;
  players: SeedStoryPlayer[];
};

export type SeedFeedback = {
  id: string;
  type: FeedbackType;
  rating: FeedbackRating;
  comment: string;
  storyId: string | null;
  storyTitle: string | null;
  storyText: string | null;
  contactInfo: string | null;
  userKey: string | null;
  createdAt: number;
};

export type DevSeedPlan = {
  users: SeedUser[];
  templates: SeedTemplate[];
  stories: SeedStory[];
  feedback: SeedFeedback[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

const GENTLE: DifficultyLevel = { modifier: 10, title: "Gentle" };
const STEADY: DifficultyLevel = { modifier: 0, title: "Steady" };
const ROUGH: DifficultyLevel = { modifier: -10, title: "Rough" };
const difficultyLevels = (): DifficultyLevel[] => [{ ...GENTLE }, { ...STEADY }, { ...ROUGH }];

const USERS: SeedUser[] = [
  { key: "devLogin", email: DEV_LOGIN_EMAIL, username: "claude_dev", roleId: "role_admin" },
  { key: "admin", email: "dev-admin@example.com", username: "dev_admin", roleId: "role_admin" },
  {
    key: "worldbuilder",
    email: "dev-worldbuilder@example.com",
    username: "dev_worldbuilder",
    roleId: "role_worldbuilder",
  },
  { key: "player", email: "dev-player@example.com", username: "dev_player", roleId: "role_user" },
  { key: "player2", email: "dev-player2@example.com", username: "dev_player2", roleId: "role_user" },
];

/** The synthetic rows, dated relative to `now` (epoch ms) so they read as recent. */
export function buildDevSeedPlan(now: number): DevSeedPlan {
  const daysAgo = (days: number) => now - days * DAY_MS;

  const harbour = devSeedId("template", "harbour");
  const expedition = devSeedId("template", "expedition");

  const templates: SeedTemplate[] = [
    {
      id: harbour,
      creatorKey: "worldbuilder",
      title: "Dev sample: The Lantern Harbour",
      teaser: "Synthetic template for local development: a harbour town looks for its missing lantern.",
      gameMode: GameModes.SinglePlayer,
      tags: ["Fiction", "Mystery"],
      publicationStatus: PublicationStatus.Published,
      playerCountMin: 1,
      playerCountMax: 1,
      maxTurnsMin: 10,
      maxTurnsMax: 15,
      difficultyLevels: difficultyLevels(),
      orderValue: 1,
      createdAt: daysAgo(30),
      updatedAt: daysAgo(10),
    },
    {
      id: expedition,
      creatorKey: "admin",
      title: "Dev sample: Glacier Expedition",
      teaser: "Synthetic template for local development: a small crew crosses a glacier together.",
      gameMode: GameModes.Cooperative,
      tags: ["Fiction", "Adventure"],
      publicationStatus: PublicationStatus.Published,
      playerCountMin: 2,
      playerCountMax: 3,
      maxTurnsMin: 12,
      maxTurnsMax: 20,
      difficultyLevels: difficultyLevels(),
      orderValue: 2,
      createdAt: daysAgo(28),
      updatedAt: daysAgo(9),
    },
    {
      id: devSeedId("template", "market"),
      creatorKey: "player",
      title: "Dev sample: Night Market Rivals",
      teaser: "Synthetic template for local development: two stall keepers compete for one night.",
      gameMode: GameModes.Competitive,
      tags: ["Fiction"],
      publicationStatus: PublicationStatus.Review,
      playerCountMin: 2,
      playerCountMax: 2,
      maxTurnsMin: 8,
      maxTurnsMax: 12,
      difficultyLevels: difficultyLevels(),
      orderValue: 999,
      createdAt: daysAgo(6),
      updatedAt: daysAgo(5),
    },
    {
      id: devSeedId("template", "draft"),
      creatorKey: "devLogin",
      title: "Dev sample: Unfinished Draft",
      teaser: "Synthetic draft template for local development.",
      gameMode: GameModes.SinglePlayer,
      tags: [],
      publicationStatus: PublicationStatus.Draft,
      playerCountMin: 1,
      playerCountMax: 1,
      maxTurnsMin: 10,
      maxTurnsMax: 15,
      difficultyLevels: difficultyLevels(),
      orderValue: 999,
      createdAt: daysAgo(2),
      updatedAt: daysAgo(1),
    },
  ];

  const harbourStory = devSeedId("story", "harbour-solo");
  const expeditionStory = devSeedId("story", "expedition-pair");

  const stories: SeedStory[] = [
    {
      id: harbourStory,
      templateId: harbour,
      creatorKey: "devLogin",
      title: "Dev sample story: The Lantern Harbour",
      maxTurns: 12,
      currentBeat: 4,
      difficulty: { ...STEADY },
      createdAt: daysAgo(3),
      updatedAt: daysAgo(1),
      players: [
        { slot: "player1", code: "DEV001", userKey: "devLogin", isPending: false, status: "active", lastPlayedAt: daysAgo(1) },
      ],
    },
    {
      id: expeditionStory,
      templateId: expedition,
      creatorKey: "devLogin",
      title: "Dev sample story: Glacier Expedition",
      maxTurns: 15,
      currentBeat: 7,
      difficulty: { ...STEADY },
      createdAt: daysAgo(5),
      updatedAt: daysAgo(2),
      players: [
        { slot: "player1", code: "DEV002", userKey: "devLogin", isPending: false, status: "active", lastPlayedAt: daysAgo(2) },
        { slot: "player2", code: "DEV003", userKey: "player", isPending: true, status: "active", lastPlayedAt: daysAgo(3) },
      ],
    },
    {
      id: devSeedId("story", "expedition-trio"),
      templateId: expedition,
      creatorKey: "player",
      title: "Dev sample story: Glacier Expedition, three players",
      maxTurns: 20,
      currentBeat: 2,
      difficulty: { ...GENTLE },
      createdAt: daysAgo(4),
      updatedAt: daysAgo(4),
      players: [
        { slot: "player1", code: "DEV004", userKey: "player", isPending: false, status: "active", lastPlayedAt: daysAgo(4) },
        { slot: "player2", code: "DEV005", userKey: "player2", isPending: true, status: "active", lastPlayedAt: daysAgo(4) },
        { slot: "player3", code: "DEV006", userKey: null, isPending: true, status: "active", lastPlayedAt: null },
      ],
    },
    {
      id: devSeedId("story", "harbour-finished"),
      templateId: harbour,
      creatorKey: "devLogin",
      title: "Dev sample story: The Lantern Harbour, finished",
      maxTurns: 12,
      currentBeat: 12,
      difficulty: { ...ROUGH },
      createdAt: daysAgo(20),
      updatedAt: daysAgo(15),
      players: [
        { slot: "player1", code: "DEV007", userKey: "devLogin", isPending: false, status: "archived", lastPlayedAt: daysAgo(15) },
      ],
    },
    {
      id: devSeedId("story", "custom"),
      templateId: null,
      creatorKey: "player2",
      title: "Dev sample story: A custom story",
      maxTurns: 10,
      currentBeat: 1,
      difficulty: { ...STEADY },
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
      players: [
        { slot: "player1", code: "DEV008", userKey: "player2", isPending: false, status: "active", lastPlayedAt: daysAgo(1) },
      ],
    },
  ];

  const feedback: SeedFeedback[] = [
    {
      id: `feedback_${devSeedId("feedback", "beat-positive")}`,
      type: "beat",
      rating: "positive",
      comment: "Synthetic feedback: this scene read well.",
      storyId: harbourStory,
      storyTitle: "Dev sample story: The Lantern Harbour",
      storyText: "Synthetic beat text for local development.",
      contactInfo: null,
      userKey: "devLogin",
      createdAt: daysAgo(2),
    },
    {
      id: `feedback_${devSeedId("feedback", "beat-negative")}`,
      type: "beat",
      rating: "negative",
      comment: "Synthetic feedback: the options felt too similar.",
      storyId: expeditionStory,
      storyTitle: "Dev sample story: Glacier Expedition",
      storyText: "Synthetic beat text for local development.",
      contactInfo: null,
      userKey: "player",
      createdAt: daysAgo(3),
    },
    {
      id: `feedback_${devSeedId("feedback", "general")}`,
      type: "general",
      rating: null,
      comment: "Synthetic general feedback, sent without an account.",
      storyId: null,
      storyTitle: null,
      storyText: null,
      contactInfo: "dev-player2@example.com",
      userKey: null,
      createdAt: daysAgo(4),
    },
    {
      id: `feedback_${devSeedId("feedback", "issue")}`,
      type: "issue",
      rating: null,
      comment: "Synthetic issue report: a button overlapped on a narrow screen.",
      storyId: null,
      storyTitle: null,
      storyText: null,
      contactInfo: null,
      userKey: "player2",
      createdAt: daysAgo(5),
    },
    {
      id: `feedback_${devSeedId("feedback", "suggestion")}`,
      type: "suggestion",
      rating: null,
      comment: "Synthetic suggestion: a way to replay a finished story.",
      storyId: null,
      storyTitle: null,
      storyText: null,
      contactInfo: null,
      userKey: "admin",
      createdAt: daysAgo(6),
    },
  ];

  return {
    users: USERS.map((user) => ({ ...user })),
    templates,
    stories,
    feedback,
  };
}

function blankPlayerOptions(): PlayerOptionsGeneration {
  return { outcomes: [], possibleCharacterIdentities: [], possibleCharacterBackgrounds: [] };
}

/**
 * A synthetic template's template.json: the blank template the editor starts a
 * new one from, with the sample's title, teaser and settings. It opens in the
 * template editor; it holds no story content to play.
 */
export function blankTemplateDocument(
  template: SeedTemplate,
  creator: { id: string; username: string } | undefined
): StoryTemplate {
  return {
    id: template.id,
    ...(creator ? { creatorId: creator.id, creatorUsername: creator.username } : {}),
    createdAt: new Date(template.createdAt).toISOString(),
    updatedAt: new Date(template.updatedAt).toISOString(),
    title: template.title,
    teaser: template.teaser,
    gameMode: template.gameMode,
    tags: [...template.tags],
    difficultyLevels: template.difficultyLevels.map((level) => ({ ...level })),
    playerCountMin: template.playerCountMin,
    playerCountMax: template.playerCountMax,
    maxTurnsMin: template.maxTurnsMin,
    maxTurnsMax: template.maxTurnsMax,
    publicationStatus: template.publicationStatus,
    showOnWelcomeScreen: false,
    order: template.orderValue,
    containsImages: false,
    imageInstructions: {
      visualStyle: "",
      atmosphere: "",
      colorPalette: "",
      settingDetails: "",
      characterStyle: "",
      artInfluences: "",
      coverPrompt: "",
    },
    guidelines: {
      world: "",
      rules: [],
      tone: [],
      conflicts: [],
      decisions: [],
      typesOfThreads: [],
      switchAndThreadInstructions: [],
    },
    storyElements: [],
    sharedOutcomes: [],
    statGroups: ["General"],
    sharedStats: [],
    playerStats: [],
    characterSelectionIntroduction: { title: "", text: "" },
    player1: blankPlayerOptions(),
    player2: blankPlayerOptions(),
    player3: blankPlayerOptions(),
  };
}
