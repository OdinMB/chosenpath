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
// The story view (react-markdown, which Jest cannot parse) is not on screen while characters are picked
jest.mock("../../../../src/game/components/StoryDisplay", () => ({
  StoryDisplay: () => "[story]",
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
