import type { ExtendedStoryMetadata, StoryPlayerEntry } from "core/types/api";
import { UserAccountHeader } from "../../../src/users/components/UserAccountHeader";
import { allByRole, byRole, namesByRole, renderMarkup } from "../../helpers/staticMarkup";

/*
 * The signed-in header counts the stories in the account's list: those with
 * one player, those with several, and of those the ones pending this
 * account's action (its seat is pending). Each counter is named for screen
 * readers with the text it shows on hover. First paint.
 */

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../src/config", () => jest.requireActual("../../__mocks__/client/config"));
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: "/" }),
}));
jest.mock("../../../src/users/hooks/useUserAccountModal", () => ({
  useUserAccountModal: () => ({ openLoginModal: jest.fn(), AccountModal: () => null }),
}));
jest.mock("../../../src/shared/auth/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1", roleId: "role_user" },
    isAuthenticated: true,
    logout: jest.fn(),
    isLoading: false,
  }),
}));
let mockFeed: Record<string, ExtendedStoryMetadata> = {};
jest.mock("../../../src/shared/session/useSession", () => ({
  useSession: () => ({ storyFeed: mockFeed, isLoading: false }),
}));

function seat(playerSlot: string, isCurrentUser: boolean, isPending: boolean): StoryPlayerEntry {
  return {
    storyId: "",
    playerSlot,
    userId: isCurrentUser ? "user-1" : "user-2",
    lastPlayedAt: null,
    isCurrentUser,
    isPending,
    status: "active",
  };
}

function story(id: string, players: StoryPlayerEntry[]): ExtendedStoryMetadata {
  return {
    id,
    title: id,
    createdAt: 0,
    updatedAt: 0,
    maxTurns: 10,
    generateImages: false,
    creatorId: "user-1",
    difficultyLevel: { modifier: 0, title: "Steady" },
    players: players.map((player) => ({ ...player, storyId: id })),
  };
}

function header(stories: ExtendedStoryMetadata[]): string {
  mockFeed = Object.fromEntries(stories.map((s) => [s.id, s]));
  return renderMarkup(<UserAccountHeader />);
}

const SOLO = story("solo", [seat("player1", true, true)]);
// A group story pending this account's action, and one pending the other player's
const MY_TURN = story("my-turn", [seat("player1", true, true), seat("player2", false, false)]);
const THEIR_TURN = story("their-turn", [seat("player1", true, false), seat("player2", false, true)]);

describe("UserAccountHeader story counters", () => {
  it("names the single-player counter with its hover text", () => {
    const counter = byRole(header([SOLO, MY_TURN]), "img", "1 single-player story");

    expect(counter).toEqual({ name: "1 single-player story", title: "1 single-player story" });
  });

  it("counts no single-player stories in the plural", () => {
    expect(namesByRole(header([MY_TURN]), "img")).toContain("0 single-player stories");
  });

  it("names the multi-player counter with its hover text, the stories pending this account's action included", () => {
    const html = header([SOLO, MY_TURN, THEIR_TURN]);

    expect(byRole(html, "img", "2 multi-player stories, 1 pending your action")).toEqual({
      name: "2 multi-player stories, 1 pending your action",
      title: "2 multi-player stories, 1 pending your action",
    });
  });

  it("names the multi-player counter without a pending count when no story is pending this account's action", () => {
    const html = header([THEIR_TURN]);

    expect(namesByRole(html, "img")).toEqual(["0 single-player stories", "1 multi-player story"]);
    expect(html).not.toContain("pending your action");
  });

  it("names every counter and button in the header", () => {
    const html = header([SOLO, MY_TURN]);
    const named = [...allByRole(html, "img"), ...allByRole(html, "button"), ...allByRole(html, "link")];

    expect(named.filter((element) => element.name === "")).toEqual([]);
    expect(namesByRole(html, "button")).toContain("Sign Out");
  });
});
