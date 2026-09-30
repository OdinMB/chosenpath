import { gameService } from "../../../src/game/GameService";
import { wsService } from "../../../src/game/WebSocketService";
import { beat, clientStoryState, player } from "../../helpers/storyFixtures";

/*
 * "Try again" after a failed turn sends what the stored story is missing: the
 * player's own choice or character selection when it never arrived, else a
 * request to write the turn again (retry_turn).
 */

jest.mock("../../../src/game/WebSocketService", () => ({
  wsService: {
    sendMessage: jest.fn(),
    getSessionId: jest.fn(() => "session-1"),
    setPlayerCode: jest.fn(),
  },
}));

const sendMessage = jest.mocked(wsService.sendMessage);

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  gameService.exitStory();
  sendMessage.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const withChoices = (choices: number[]) =>
  clientStoryState({
    players: { player1: player(choices.map((choice, i) => beat(`Beat ${i + 1}`, choice))) },
  });

describe("gameService.tryAgain", () => {
  it("sends the player's failed choice again: the same option, on the beat it was made on", () => {
    gameService.makeChoice(2, 2);
    sendMessage.mockClear();

    gameService.tryAgain(withChoices([1, -1]));

    expect(sendMessage).toHaveBeenCalledWith({ type: "make_choice", optionIndex: 2 });
  });

  it("asks the server to write the turn again once the choice is stored", () => {
    gameService.makeChoice(2, 2);
    sendMessage.mockClear();

    gameService.tryAgain(withChoices([1, 2]));

    expect(sendMessage).toHaveBeenCalledWith({ type: "retry_turn" });
  });

  it("sends the player's failed character selection again", () => {
    gameService.selectCharacter(1, 2);
    sendMessage.mockClear();

    gameService.tryAgain(
      clientStoryState({ characterSelectionCompleted: false, players: { player1: player([], -1) } })
    );

    expect(sendMessage).toHaveBeenCalledWith({ type: "select_character", identityIndex: 1, backgroundIndex: 2 });
  });

  it("returns what it sent, so the screen can show a choice sent again as chosen", () => {
    gameService.makeChoice(2, 2);

    expect(gameService.tryAgain(withChoices([1, -1]))).toEqual({ type: "make_choice", optionIndex: 2 });
    expect(gameService.tryAgain(withChoices([1, 2]))).toEqual({ type: "retry_turn" });
  });

  it("forgets what was sent once the player leaves the story", () => {
    gameService.makeChoice(2, 2);
    gameService.exitStory();
    sendMessage.mockClear();

    gameService.tryAgain(withChoices([1, -1]));

    expect(sendMessage).toHaveBeenCalledWith({ type: "retry_turn" });
  });
});
