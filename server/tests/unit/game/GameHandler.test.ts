import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { EventEmitter } from "events";

/*
 * When a turn fails for good (after its one resend), the players in the game
 * are told: "Unable to continue the story. Please try again." The handler
 * that says so had lost its listener on the queue's operationError event
 * (2025-05, when the storyInitialized listener was removed beside it), so no
 * failure reached anyone.
 */

const events = new EventEmitter();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockModule = (jest as any).unstable_mockModule;
await mockModule("../../../src/game/services/GameQueueProcessor.js", () => ({
  __esModule: true,
  gameQueueProcessor: { events, addOperation: jest.fn() },
}));
await mockModule("../../../src/stories/StoryRepository.js", () => ({
  __esModule: true,
  StoryRepository: { getInstance: () => ({ getStory: jest.fn() }) },
}));
await mockModule("../../../src/game/ConnectionManager.js", () => ({
  __esModule: true,
  connectionManager: {
    getActivePlayersInGame: jest.fn(() => [{ playerSlot: "player1" }, { playerSlot: "player2" }]),
    getActiveSockets: jest.fn((_gameId: string, slot: string) => new Set([`socket-${slot}`])),
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
