import { GamePage } from "../../../src/game/GamePage";
import { GameSessionContext } from "../../../src/game/GameSessionContext";
import { gameService } from "../../../src/game/GameService";
import { renderMarkup } from "../../helpers/staticMarkup";
import {
  beat,
  clientStoryState,
  gameSession,
  player,
} from "../../helpers/storyFixtures";

/*
 * A player whose choice or character selection failed can send it again
 * through the game's own controls instead of "Try again". Whichever they use,
 * the failure notice goes before the send: left up beside a send on its way,
 * its "Try again" would send the same choice or selection a second time.
 */

type LayoutProps = {
  onChoiceSelected: (optionIndex: number) => void;
  onCharacterSelected: (identityIndex: number, backgroundIndex: number) => void;
};
// The game screen is a marker; its handlers are kept for the tests to call
const mockLayoutProps: LayoutProps[] = [];
jest.mock("../../../src/game/components/GameLayout", () => ({
  GameLayout: (props: LayoutProps) => {
    mockLayoutProps.push(props);
    return "[game layout]";
  },
}));
jest.mock("../../../src/game/GameService", () => ({
  gameService: {
    makeChoice: jest.fn(),
    selectCharacter: jest.fn(),
    verifyCode: jest.fn(),
    exitStory: jest.fn(),
  },
}));
jest.mock("../../../src/game/WebSocketService", () => ({
  wsService: { setExternalJoinCode: jest.fn(), sendMessage: jest.fn() },
}));
jest.mock("react-router-dom", () => ({
  useParams: () => ({ code: "CODE-1" }),
  useNavigate: () => jest.fn(),
}));
jest.mock("../../../src/shared/auth/useAuth", () => ({
  useAuth: () => ({ user: null }),
}));
jest.mock("../../../src/shared/session/useSession", () => ({
  useSession: () => ({
    refreshStoredCodeSets: jest.fn(),
    fetchStoryFeed: jest.fn(),
  }),
}));
jest.mock("../../../src/shared/utils/codeSetUtils", () => ({
  addCodeSetToStorage: jest.fn(),
}));

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "debug").mockImplementation(() => undefined);
  mockLayoutProps.length = 0;
  jest.mocked(gameService.makeChoice).mockClear();
  jest.mocked(gameService.selectCharacter).mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Renders the game page on a story and returns the game screen's handlers, with the session's clearTurnFailure. */
function gameScreen() {
  const clearTurnFailure = jest.fn();
  const storyState = clientStoryState({
    players: { player1: player([beat("Arrival"), beat("Crossroads", -1)]) },
  });
  const html = renderMarkup(
    <GameSessionContext.Provider
      value={{ ...gameSession(storyState), clearTurnFailure }}
    >
      <GamePage />
    </GameSessionContext.Provider>
  );
  expect(html).toContain("[game layout]");
  return { ...mockLayoutProps[mockLayoutProps.length - 1]!, clearTurnFailure };
}

function calledBefore(first: jest.Mock, second: jest.Mock): boolean {
  return first.mock.invocationCallOrder[0]! < second.mock.invocationCallOrder[0]!;
}

describe("GamePage: the player sends a choice or character again through the game's controls", () => {
  it("takes the failure notice down before the choice is sent", () => {
    const { onChoiceSelected, clearTurnFailure } = gameScreen();

    onChoiceSelected(1);

    expect(gameService.makeChoice).toHaveBeenCalledWith(1, 2);
    expect(clearTurnFailure).toHaveBeenCalledTimes(1);
    expect(calledBefore(clearTurnFailure, jest.mocked(gameService.makeChoice))).toBe(true);
  });

  it("takes the failure notice down before the character selection is sent", () => {
    const { onCharacterSelected, clearTurnFailure } = gameScreen();

    onCharacterSelected(0, 1);

    expect(gameService.selectCharacter).toHaveBeenCalledWith(0, 1);
    expect(clearTurnFailure).toHaveBeenCalledTimes(1);
    expect(calledBefore(clearTurnFailure, jest.mocked(gameService.selectCharacter))).toBe(true);
  });
});
