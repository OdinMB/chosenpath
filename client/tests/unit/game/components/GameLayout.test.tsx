import type { ClientStoryState } from "core/types";
import { GameLayout } from "../../../../src/game/components/GameLayout";
import {
  GameSessionContext,
  type GameSessionContextType,
} from "../../../../src/game/GameSessionContext";
import { accessibleText, renderMarkup } from "../../../helpers/staticMarkup";
import {
  clientStoryState,
  gameSession,
  player,
} from "../../../helpers/storyFixtures";

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../../src/config", () =>
  jest.requireActual("../../../__mocks__/client/config")
);
// The story view (react-markdown, which Jest cannot parse) is a marker; its props are kept for the tests to check
type StoryProps = { onLeaveStory: (to?: string) => void; signedIn?: boolean };
const mockStoryProps: StoryProps[] = [];
jest.mock("../../../../src/game/components/StoryDisplay", () => ({
  StoryDisplay: (props: StoryProps) => {
    mockStoryProps.push(props);
    return "[story]";
  },
}));

const TURN_FAILED = "Unable to save your character choice. Please try again.";

/** Two players: this one has picked a character, the other is still picking. */
function waitingForOthers(): ClientStoryState {
  return clientStoryState({
    characterSelectionCompleted: false,
    players: { player1: player([], 0) },
    pendingPlayers: ["player2"],
  });
}

function renderLayout(session: Partial<GameSessionContextType> = {}): string {
  return renderMarkup(
    <GameSessionContext.Provider
      value={{ ...gameSession(waitingForOthers()), ...session }}
    >
      <GameLayout onExitGame={jest.fn()} onChoiceSelected={jest.fn()} />
    </GameSessionContext.Provider>
  );
}

describe("GameLayout while the other players pick their characters", () => {
  it("waits with 'Setting up the story...' while nothing failed", () => {
    const html = renderLayout();

    expect(html).toContain("Setting up the story...");
    expect(html).not.toContain('role="alert"');
  });

  it("shows the failure instead of the spinner, with a way to try again", () => {
    const html = renderLayout({
      turnFailure: { message: TURN_FAILED, at: "[]" },
    });

    expect(html).toContain('role="alert"');
    expect(accessibleText(html)).toContain(`${TURN_FAILED} Try again`);
    expect(html).not.toContain("Setting up the story...");
  });
});

describe("GameLayout once the story is under way", () => {
  /** Two players on a story whose latest beat waits for both of them, or is the ending. */
  function twoPlayers(gameOver: boolean): ClientStoryState {
    return clientStoryState({
      players: { player1: player([], 0), player2: player([], 1) },
      pendingPlayers: ["player1", "player2"],
      gameOver,
    });
  }

  function renderPlaying(
    storyState: ClientStoryState,
    layout: { onExitGame?: (to?: string) => void; signedIn?: boolean } = {}
  ): string {
    return renderMarkup(
      <GameSessionContext.Provider value={gameSession(storyState)}>
        <GameLayout
          onExitGame={layout.onExitGame ?? jest.fn()}
          onChoiceSelected={jest.fn()}
          signedIn={layout.signedIn}
        />
      </GameSessionContext.Provider>
    );
  }

  beforeEach(() => {
    mockStoryProps.length = 0;
  });

  it("shows whom the turn waits for while the story goes on", () => {
    expect(accessibleText(renderPlaying(twoPlayers(false)))).toContain(
      "Waiting for You Player 2"
    );
  });

  it("waits for no one once the story has ended", () => {
    const text = accessibleText(renderPlaying(twoPlayers(true)));

    expect(text).not.toContain("Waiting for");
    expect(text).not.toContain("Generating next story beat...");
  });

  it("hands the story view the game's exit and whether the player has an account", () => {
    const onExitGame = jest.fn();
    renderPlaying(twoPlayers(true), { onExitGame, signedIn: true });

    const story = mockStoryProps[mockStoryProps.length - 1]!;
    expect(story.onLeaveStory).toBe(onExitGame);
    expect(story.signedIn).toBe(true);
  });
});
