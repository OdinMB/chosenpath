import type { ExtendedStoryMetadata, StoryPlayerEntry } from "core/types/api";
import { StoryCard } from "../../../../src/shared/components/StoryCard";
import { accessibleText, renderMarkup } from "../../../helpers/staticMarkup";

/*
 * The card's played line on "My Stories" says when anyone last played the
 * story, not only the viewer's own seat: a story others played reads "Played
 * ...", and "Never played" stays for stories nobody has played yet.
 */

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../../src/config", () =>
  jest.requireActual("../../../__mocks__/client/config")
);
jest.mock("../../../../src/shared/auth/useAuth", () => ({
  useAuth: () => ({ user: { id: "creator-1" } }),
}));
jest.mock("../../../../src/shared/session/useSession", () => ({
  useSession: () => ({ fetchStoryFeed: jest.fn() }),
}));
jest.mock("../../../../src/shared/utils/codeSetUtils", () => ({
  getAllUniqueCodesFromStorage: () => [],
  getCodesStartedForOthers: () => [],
  generateJoinLink: (code: string) => `https://join.example/game/${code}`,
}));
// The info icon's tooltip only opens on hover: show its content inline
jest.mock("../../../../src/shared/components/ui/InfoIcon", () => ({
  InfoIcon: ({ tooltipText }: { tooltipText: unknown }) =>
    jest.requireActual("react").createElement("span", { "data-tip": "" }, tooltipText),
}));

const HOUR = 60 * 60 * 1000;

function seat(playerSlot: string, lastPlayedAt: number | null): StoryPlayerEntry {
  return {
    storyId: "s1",
    playerSlot,
    code: `CODE-${playerSlot}`,
    userId: null,
    lastPlayedAt,
    isPending: true,
    isCurrentUser: false,
    status: "active",
  };
}

function createdStory(players: StoryPlayerEntry[], currentBeat: number): ExtendedStoryMetadata {
  return {
    id: "s1",
    title: "The Lighthouse",
    difficultyLevel: { modifier: 0, title: "Normal" },
    createdAt: Date.now() - 24 * HOUR,
    updatedAt: Date.now() - 2 * HOUR,
    maxTurns: 5,
    generateImages: false,
    creatorId: "creator-1",
    currentBeat,
    players,
  };
}

function cardText(story: ExtendedStoryMetadata): string {
  return accessibleText(renderMarkup(<StoryCard story={story} onPlay={jest.fn()} />));
}

describe("StoryCard played line", () => {
  it("says when others last played a story whose seats the viewer doesn't hold", () => {
    const text = cardText(
      createdStory([seat("player1", Date.now() - 2 * HOUR), seat("player2", Date.now() - 5 * HOUR)], 9)
    );

    expect(text).toContain("Played 2 hours ago");
    expect(text).toContain("Last played: 2 hours ago");
    expect(text).not.toContain("Never played");
  });

  it("says never played when no seat has played and no turn was written", () => {
    const text = cardText(createdStory([seat("player1", null), seat("player2", null)], 0));

    expect(text).toContain("Never played");
    expect(text).not.toContain("Played ");
    expect(text).not.toContain("Last played");
  });

  it("says nothing about playing when a turn was written but no seat has a time", () => {
    const text = cardText(createdStory([seat("player1", null), seat("player2", null)], 3));

    expect(text).not.toContain("Never played");
    expect(text).not.toContain("Played ");
    expect(text).not.toContain("Last played");
    expect(text).toContain("Created: 1 day ago");
  });
});
