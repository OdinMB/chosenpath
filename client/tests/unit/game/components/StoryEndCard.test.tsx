import type { ClientStat } from "core/types";
import { StoryEndCard } from "../../../../src/game/components/StoryEndCard";
import {
  AuthContext,
  type AuthContextType,
} from "../../../../src/shared/auth/AuthContextDefinition";
import { STORY_END_EXITS } from "../../../../src/game/utils/storyEnd";
import {
  accessibleText,
  attribute,
  openingTag,
  renderMarkup,
} from "../../../helpers/staticMarkup";
import { clientStoryState, player } from "../../../helpers/storyFixtures";

// The buttons as they are, with the handler each gets kept for the tests to press
const mockButtons: { label: string; onClick?: () => void }[] = [];
jest.mock("../../../../src/shared/components/ui/PrimaryButton", () => {
  const actual = jest.requireActual(
    "../../../../src/shared/components/ui/PrimaryButton"
  );
  return {
    PrimaryButton: (props: { children: string; onClick?: () => void }) => {
      mockButtons.push({ label: props.children, onClick: props.onClick });
      return actual.PrimaryButton(props);
    },
  };
});

const energy: ClientStat = {
  id: "player_energy",
  type: "percentage",
  name: "Energy",
  isVisible: true,
  partOfPlayerBackgrounds: false,
  initialValue: 50,
  tooltip: "",
  group: "Body",
};

/** What the auth hook tells the card: a signed-in player, or one who joined by code without an account. */
function auth(isAuthenticated: boolean): AuthContextType {
  return {
    user: null,
    isAuthenticated,
    isLoading: false,
    login: jest.fn(),
    logout: jest.fn(),
    register: jest.fn(),
  };
}

function renderCard({
  onExitGame = jest.fn(),
  withStats = true,
  signedIn = true,
}: {
  onExitGame?: (to: string) => void;
  withStats?: boolean;
  signedIn?: boolean;
} = {}): string {
  mockButtons.length = 0;
  const storyState = clientStoryState({
    title: "The Lamps of Wrenhaven",
    gameOver: true,
    playerStats: withStats ? [energy] : [],
    players: {
      player1: {
        ...player(),
        statValues: [{ statId: "player_energy", value: 35 }],
      },
    },
  });
  return renderMarkup(
    <AuthContext.Provider value={auth(signedIn)}>
      <StoryEndCard storyState={storyState} onExitGame={onExitGame} />
    </AuthContext.Provider>
  );
}

/** The heading that labels a section, found by the section's aria-labelledby. */
function sectionHeading(html: string, id: string): string {
  const heading = new RegExp(`<h3[^>]*\\sid="${id}"[^>]*>([\\s\\S]*?)</h3>`);
  return accessibleText(heading.exec(html)?.[1] ?? "");
}

describe("StoryEndCard", () => {
  it("shows where the player ended up in a labelled section, each stat with its value", () => {
    const html = renderCard();
    const section = openingTag(html, "section", "aria-labelledby", "story-end-stats");

    expect(section).not.toBe("");
    expect(sectionHeading(html, "story-end-stats")).toBe("Where you ended up");
    expect(accessibleText(html)).toContain("Body Energy 35%");
  });

  it("leaves the stats section out when the story shows no stats", () => {
    const html = renderCard({ withStats: false });

    expect(html).not.toContain("Where you ended up");
  });

  it("asks three or four questions to talk about, in a labelled section", () => {
    const html = renderCard();
    const section = openingTag(html, "section", "aria-labelledby", "story-end-talk");
    const questions = html.match(/<li[\s>]/g) ?? [];

    expect(section).not.toBe("");
    expect(sectionHeading(html, "story-end-talk")).toBe("Talk about it");
    expect(questions.length).toBeGreaterThanOrEqual(3);
    expect(questions.length).toBeLessThanOrEqual(4);
  });

  it("offers a signed-in player My Stories and Home in a named navigation, each leaving the story for its page", () => {
    const onExitGame = jest.fn();
    const html = renderCard({ onExitGame });
    const nav = openingTag(html, "nav", "aria-label", "Leave the story");

    expect(attribute(nav, "aria-label")).toBe("Leave the story");
    expect(mockButtons.map((button) => button.label)).toEqual([
      "My Stories",
      "Home",
    ]);

    mockButtons[0]!.onClick?.();
    mockButtons[1]!.onClick?.();

    expect(onExitGame.mock.calls).toEqual([
      [STORY_END_EXITS.myStories],
      [STORY_END_EXITS.home],
    ]);
  });

  it("offers only Home to a player without an account, since My Stories would ask them to sign in", () => {
    const onExitGame = jest.fn();
    const html = renderCard({ onExitGame, signedIn: false });

    expect(openingTag(html, "nav", "aria-label", "Leave the story")).not.toBe("");
    expect(mockButtons.map((button) => button.label)).toEqual(["Home"]);
    expect(accessibleText(html)).not.toContain("My Stories");

    mockButtons[0]!.onClick?.();

    expect(onExitGame.mock.calls).toEqual([[STORY_END_EXITS.home]]);
  });
});
