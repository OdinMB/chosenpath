import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { EventEmitter } from "events";

/*
 * When a turn fails for good (after its one resend), the players in the game
 * are told: "Unable to continue the story. Please try again." The handler
 * that says so had lost its listener on the queue's operationError event
 * (2025-05, when the storyInitialized listener was removed beside it), so no
 * failure reached anyone. A player's own failed choice or character selection
 * reaches that player as its friendly line, and so does the rejection its
 * caller sends on.
 */

const events = new EventEmitter();
const addOperation = jest.fn<(operation: unknown) => Promise<string>>();
const isTurnOnItsWay = jest.fn<(gameId: string) => boolean>(() => false);
const getStory = jest.fn<(id: string) => Promise<unknown>>();
const getPlayerBySocket = jest.fn<(socketId: string) => unknown>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockModule = (jest as any).unstable_mockModule;
await mockModule("../../../src/game/services/GameQueueProcessor.js", () => ({
  __esModule: true,
  gameQueueProcessor: { events, addOperation, isTurnOnItsWay },
}));
await mockModule("../../../src/stories/StoryRepository.js", () => ({
  __esModule: true,
  StoryRepository: { getInstance: () => ({ getStory }) },
}));
await mockModule("../../../src/game/ConnectionManager.js", () => ({
  __esModule: true,
  connectionManager: {
    getActivePlayersInGame: jest.fn(() => [{ playerSlot: "player1" }, { playerSlot: "player2" }]),
    getActiveSockets: jest.fn((_gameId: string, slot: string) => new Set([`socket-${slot}`])),
    getPlayerBySocket,
  },
}));

const { GameHandler } = await import("../../../src/game/GameHandler.js");

type FakeSocket = { id: string; on: jest.Mock; emit: jest.Mock };
const socketOf = (id: string): FakeSocket => ({ id, on: jest.fn(), emit: jest.fn() });

const turnFailed = {
  queueId: "game-1",
  operationId: "op-1",
  gameId: "game-1",
  operationType: "moveStoryForward" as const,
  error: "Failed to generate a usable thread plan",
};

let handler: InstanceType<typeof GameHandler>;
let sockets: FakeSocket[];

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  handler = new GameHandler();
  sockets = [socketOf("socket-player1"), socketOf("socket-player2")];
  // The handler keeps its own map of sockets by id
  for (const socket of sockets) handler.registerSocket(socket as never);
});

afterEach(() => {
  handler.dispose();
  jest.restoreAllMocks();
});

describe("GameHandler: a turn that fails for good", () => {
  it("tells every player in the game that the story could not continue", () => {
    events.emit("operationError", turnFailed);

    for (const socket of sockets) {
      expect(socket.emit).toHaveBeenCalledWith("error", {
        error: "Unable to continue the story. Please try again.",
        operationType: "moveStoryForward",
      });
    }
  });

  it("never sends the error's own text, which can name model-written ids", () => {
    events.emit("operationError", turnFailed);

    const sent = sockets.flatMap((socket) => socket.emit.mock.calls.map((call) => JSON.stringify(call)));
    expect(sent.join("\n")).not.toContain("thread plan");
  });

  it("tells no player about a failed pregeneration, which runs in the background: the turn is written when it is played", () => {
    events.emit("operationError", { ...turnFailed, operationType: "pregenerateStoryState" });
    events.emit("operationError", { ...turnFailed, operationType: "bulkPregenerateStoryStates" });

    for (const socket of sockets) expect(socket.emit).not.toHaveBeenCalled();
  });

  it("stops listening once disposed", () => {
    handler.dispose();
    events.emit("operationError", turnFailed);

    for (const socket of sockets) expect(socket.emit).not.toHaveBeenCalled();
  });
});

describe("GameHandler: a player's own choice or character selection that fails in the queue", () => {
  /** A write error's text, which names the server's data path. */
  const RAW = "ENOSPC: no space left on device, open 'D:\\srv\\data\\stories\\game-1.json'";
  const story = {
    getPlayer: () => ({ beatHistory: [{ choice: -1 }] }),
    getCurrentBeatType: () => "thread",
    getState: () => ({
      characterSelectionOptions: { player1: { possibleCharacterIdentities: [{}], possibleCharacterBackgrounds: [{}] } },
      characterSelectionCompleted: false,
    }),
  };
  /** Lets the handler queue the operation and wait on it. */
  const queued = () => new Promise((resolve) => setImmediate(resolve));

  beforeEach(() => {
    getPlayerBySocket.mockReturnValue({ storyId: "game-1", playerSlot: "player1" });
    getStory.mockResolvedValue(story);
    addOperation.mockResolvedValue("op-own");
  });

  const cases: [string, string, (socket: FakeSocket) => Promise<void>][] = [
    ["recordChoice", "Unable to process your choice. Please try again.", (socket) => handler.makeChoice(socket as never, 0)],
    ["recordCharacterSelection", "Unable to save your character choice. Please try again.", (socket) => handler.selectCharacter(socket as never, 0, 0)],
  ];

  it.each(cases)("answers a failed %s with its friendly line only, never the error's own text", async (operationType, friendly, send) => {
    const [chooser] = sockets;
    const pending = send(chooser);
    await queued();
    events.emit("operationError", { ...turnFailed, operationId: "op-own", operationType, error: RAW });

    // The rejection's message is what websocket.ts sends back as the response's errorMessage
    await expect(pending).rejects.toThrow(friendly);
    const sent = chooser.emit.mock.calls.map((call) => JSON.stringify(call)).join("\n");
    expect(sent).toContain(friendly);
    expect(sent).not.toContain("ENOSPC");
  });
});

/*
 * A player whose turn failed presses "Try again" (retry_turn). The stored
 * story says whether a turn is missing: every player has chosen (or, before
 * the first turn, picked a character) and no newer turn is stored. Only then,
 * and only while no turn is already on its way in the game's queue, is the
 * turn queued again, from the stored story, as the queue's resend does.
 */
const TURN_FAILED = "Unable to continue the story. Please try again.";
const { createMockMultiplayerStory } = await import("../../helpers/testHelpers.js");
const { beatGeneration } = await import("../../helpers/textFixtures.js");
type Beat = import("core/types/index.js").Beat;
type StoryState = import("core/types/index.js").StoryState;

const beatChosen = (choice: number): Beat => ({ ...beatGeneration(), choice, resolution: null });

/** A two-player story as stored: its latest turn with each player's choice (-1: not chosen), or none yet. */
function storedStory({ completed = true, choices = [1, 0] as number[] | null } = {}) {
  const story = createMockMultiplayerStory(2);
  const players: StoryState["players"] = {};
  Object.entries(story.getState().players).forEach(([slot, player], seat) => {
    players[slot] = {
      ...player,
      identityChoice: 0,
      backgroundChoice: 0,
      beatHistory: choices ? [beatChosen(0), beatChosen(choices[seat] ?? -1)] : [],
    };
  });
  return story.applyChanges({ id: "game-1", characterSelectionCompleted: completed, players });
}

describe("GameHandler: a player tries a failed turn again", () => {
  beforeEach(() => {
    getPlayerBySocket.mockReturnValue({ storyId: "game-1", playerSlot: "player2" });
    addOperation.mockReset();
    addOperation.mockResolvedValue("op-retry");
    isTurnOnItsWay.mockReset();
    isTurnOnItsWay.mockReturnValue(false);
  });

  it("queues the turn again from the stored story when every choice is in and no turn is on its way", async () => {
    const story = storedStory();
    getStory.mockResolvedValue(story);

    await expect(handler.retryTurn(sockets[1] as never)).resolves.toBe(true);

    expect(isTurnOnItsWay).toHaveBeenCalledWith("game-1");
    expect(addOperation).toHaveBeenCalledTimes(1);
    expect(addOperation).toHaveBeenCalledWith({ gameId: "game-1", type: "moveStoryForward", input: { story } });
  });

  it("queues the first turn again when the characters are picked and that turn failed", async () => {
    const story = storedStory({ choices: null });
    getStory.mockResolvedValue(story);

    await expect(handler.retryTurn(sockets[1] as never)).resolves.toBe(true);
    expect(addOperation).toHaveBeenCalledWith({ gameId: "game-1", type: "moveStoryForward", input: { story } });
  });

  it("queues nothing while the turn is on its way (another player tried first), and sends the player the story as stored", async () => {
    const story = storedStory();
    getStory.mockResolvedValue(story);
    isTurnOnItsWay.mockReturnValue(true);

    await expect(handler.retryTurn(sockets[1] as never)).resolves.toBe(false);

    expect(addOperation).not.toHaveBeenCalled();
    expect(sockets[1]!.emit).toHaveBeenCalledWith("state_update_notification", {
      type: "state_update_notification",
      state: story.filterStateForPlayer("player2"),
      trigger: "story_update",
    });
  });

  it("queues nothing while a player still has to choose (a newer turn is stored, or a choice failed), or before the characters are picked", async () => {
    for (const story of [storedStory({ choices: [1, -1] }), storedStory({ completed: false, choices: null })]) {
      getStory.mockResolvedValue(story);
      await expect(handler.retryTurn(sockets[1] as never)).resolves.toBe(false);
    }

    expect(addOperation).not.toHaveBeenCalled();
    expect(sockets[1]!.emit).toHaveBeenCalledTimes(2);
  });

  it("answers a retry it cannot place with the friendly line only", async () => {
    getPlayerBySocket.mockReturnValue(undefined);
    await expect(handler.retryTurn(sockets[1] as never)).rejects.toThrow(TURN_FAILED);

    getPlayerBySocket.mockReturnValue({ storyId: "game-1", playerSlot: "player2" });
    getStory.mockResolvedValue(null);
    await expect(handler.retryTurn(sockets[1] as never)).rejects.toThrow(TURN_FAILED);
    expect(addOperation).not.toHaveBeenCalled();
  });
});

describe("GameHandler: a player who arrives at a story stuck on its turn", () => {
  beforeEach(() => {
    isTurnOnItsWay.mockReset();
    isTurnOnItsWay.mockReturnValue(false);
  });

  it("is told the story could not continue, as the players were when it failed (after a reload, or a server restart mid-turn)", async () => {
    getStory.mockResolvedValue(storedStory());

    await handler.tellIfTurnStuck(sockets[0] as never, "game-1");

    expect(sockets[0]!.emit).toHaveBeenCalledWith("error", { error: TURN_FAILED, operationType: "moveStoryForward" });
    expect(sockets[1]!.emit).not.toHaveBeenCalled();
  });

  it("is told nothing while the turn is on its way, while a player still has to choose, or before the characters are picked", async () => {
    getStory.mockResolvedValue(storedStory());
    isTurnOnItsWay.mockReturnValue(true);
    await handler.tellIfTurnStuck(sockets[0] as never, "game-1");

    isTurnOnItsWay.mockReturnValue(false);
    for (const story of [storedStory({ choices: [-1, 0] }), storedStory({ completed: false, choices: null }), null]) {
      getStory.mockResolvedValue(story);
      await handler.tellIfTurnStuck(sockets[0] as never, "game-1");
    }

    expect(sockets[0]!.emit).not.toHaveBeenCalled();
  });
});
