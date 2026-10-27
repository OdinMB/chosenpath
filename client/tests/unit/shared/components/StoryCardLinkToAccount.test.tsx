import type { ExtendedStoryMetadata, StoryPlayerEntry } from "core/types/api";
import { StoryCard } from "../../../../src/shared/components/StoryCard";
import { accessibleText, renderMarkup } from "../../../helpers/staticMarkup";

/*
 * A story card offers "Link to my account" for seat codes stored on this
 * device, but never for seats started for other players to play: codes
 * marked so when "Start several stories at once" stored them.
 */

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../../src/config", () =>
  jest.requireActual("../../../__mocks__/client/config")
);
jest.mock("../../../../src/shared/auth/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-me" } }),
}));
jest.mock("../../../../src/shared/session/useSession", () => ({
  useSession: () => ({ fetchStoryFeed: jest.fn() }),
}));
let mockStoredCodes: string[] = [];
let mockCodesStartedForOthers: string[] = [];
jest.mock("../../../../src/shared/utils/codeSetUtils", () => ({
  getAllUniqueCodesFromStorage: () => mockStoredCodes,
  getCodesStartedForOthers: () => mockCodesStartedForOthers,
  generateJoinLink: (code: string) => `https://join.example/game/${code}`,
}));

function seat(playerSlot: string): StoryPlayerEntry {
  return {
    storyId: "s1",
    playerSlot,
    code: `CODE-${playerSlot}`,
    userId: null,
    lastPlayedAt: null,
    isPending: true,
    isCurrentUser: false,
    status: "active",
  };
}

const STORY: ExtendedStoryMetadata = {
  id: "s1",
  title: "The Lighthouse",
  difficultyLevel: { modifier: 0, title: "Normal" },
  createdAt: Date.now(),
  updatedAt: Date.now(),
  maxTurns: 5,
  generateImages: false,
  creatorId: null,
  currentBeat: 0,
  players: [seat("player1"), seat("player2")],
};

function cardText(): string {
  return accessibleText(renderMarkup(<StoryCard story={STORY} onPlay={jest.fn()} />));
}

beforeEach(() => {
  mockStoredCodes = ["CODE-player1", "CODE-player2"];
  mockCodesStartedForOthers = [];
});

describe("StoryCard: Link to my account", () => {
  it("is offered for seat codes stored on this device", () => {
    expect(cardText()).toContain("Link to my account");
  });

  it("is not offered when the stored codes were started for other players", () => {
    mockCodesStartedForOthers = ["CODE-player1", "CODE-player2"];

    expect(cardText()).not.toContain("Link to my account");
    // The seats and their codes still show
    expect(cardText()).toContain("CODE-player1");
  });
});
