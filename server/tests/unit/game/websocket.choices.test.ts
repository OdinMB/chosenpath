import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { EventEmitter } from "events";

/*
 * What a player's client receives for a choice (make_choice) or a character
 * pick (select_character), from its request to the queue's verdict, through
 * the socket server and the game handler. The server answers once it has
 * queued the request. A request it refuses, or one the queue fails to record,
 * is answered with errors and an error response; one the queue records is
 * answered no further.
 */

const queueEvents = new EventEmitter();
const addOperation = jest.fn<(operation: unknown) => Promise<string>>();
const getStory = jest.fn<(id: string) => Promise<unknown>>();
const getPlayerBySocket = jest.fn<(socketId: string) => unknown>();

type Listener = (data?: unknown) => unknown;
let connectionListener: Listener | undefined;

/** Socket.IO's server, reduced to what the socket server calls: it keeps the connection listener. */
class FakeIoServer {
  readonly sockets = { adapter: { sids: new Map<string, Set<string>>() } };
  on(event: string, listener: Listener): void {
    if (event === "connection") connectionListener = listener;
  }
  to(): { emit: () => void } {
    return { emit: () => undefined };
  }
  close(callback?: () => void): void {
    callback?.();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockModule = (jest as any).unstable_mockModule;
await mockModule("socket.io", () => ({ __esModule: true, Server: FakeIoServer }));
await mockModule("../../../src/game/services/GameQueueProcessor.js", () => ({
  __esModule: true,
  gameQueueProcessor: { events: queueEvents, addOperation, isTurnOnItsWay: () => false },
}));
await mockModule("../../../src/stories/StoryRepository.js", () => ({
  __esModule: true,
  StoryRepository: { getInstance: () => ({ getStory }) },
}));
await mockModule("../../../src/game/ConnectionManager.js", () => ({
  __esModule: true,
  connectionManager: {
    setIo: () => undefined,
    cleanupInactiveSessions: () => undefined,
    removeSocket: () => undefined,
    getPlayerBySocket,
    getActiveSockets: (_gameId: string, slot: string) => new Set([`socket-${slot}`]),
    getActivePlayersInGame: () => [],
  },
}));
await mockModule("../../../src/stories/storyOrigins.js", () => ({
  __esModule: true,
  storyOrigin: async () => "anonymous",
}));

const { GameHandler } = await import("../../../src/game/GameHandler.js");
const { GameWebSocketServer } = await import("../../../src/game/websocket.js");

/** A player's connection: what the client sends, and what it receives, in order. */
class PlayerConnection {
  readonly emit = jest.fn();
  readonly handshake: { address: string; headers: Record<string, string> };
  private readonly listeners = new Map<string, Listener[]>();

  constructor(
    readonly id: string,
    address: string
  ) {
    this.handshake = { address, headers: {} };
  }

  on(event: string, listener: Listener): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }

  onAny(): void {}

  join(): void {}

  /** Sends an event as the client does: the server's listeners run without being waited on. */
  send(event: string, data?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) void listener(data);
  }

  received(): unknown[][] {
    return this.emit.mock.calls;
  }
}

/** A story where player1 may choose, or pick a character. */
const story = {
  getPlayer: () => ({ beatHistory: [{ choice: -1 }] }),
  getCurrentBeatType: () => "thread",
  getState: () => ({
    characterSelectionOptions: { player1: { possibleCharacterIdentities: [{}], possibleCharacterBackgrounds: [{}] } },
    characterSelectionCompleted: false,
  }),
};

/** Lets every request and the queue's verdict run through. */
async function settled(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
}

let server: InstanceType<typeof GameWebSocketServer>;
let player: PlayerConnection;
let addresses = 0;

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  getPlayerBySocket.mockReturnValue({ storyId: "game-1", playerSlot: "player1" });
  getStory.mockResolvedValue(story);
  addOperation.mockReset();
  addOperation.mockResolvedValue("op-1");

  server = new GameWebSocketServer({} as never, new GameHandler());
  // Each test's player has an address of its own, so no test meets another's rate limit
  addresses += 1;
  player = new PlayerConnection("socket-player1", `203.0.113.${addresses}`);
  connectionListener?.(player);
});

afterEach(() => {
  server.close();
  jest.restoreAllMocks();
});

const requests = [
  {
    event: "make_choice",
    data: { optionIndex: 0, requestId: "req-1" },
    operationType: "recordChoice",
    response: "make_choice_response",
    accepted: { optionIndex: 0 },
    friendly: "Unable to process your choice. Please try again.",
  },
  {
    event: "select_character",
    data: { identityIndex: 0, backgroundIndex: 0, requestId: "req-1" },
    operationType: "recordCharacterSelection",
    response: "select_character_response",
    accepted: { identityIndex: 0, backgroundIndex: 0 },
    friendly: "Unable to save your character choice. Please try again.",
  },
];

describe.each(requests)("What the client receives for $event", ({ event, data, operationType, response, accepted, friendly }) => {
  /** The answer the game handler sends once it has queued the request, under the operation's id. */
  const queuedAnswer = [
    "response",
    { type: response, status: "success", requestId: "op-1", timestamp: expect.any(Number), data: accepted },
  ];

  it("a request the queue records: the one answer sent when it was queued, and nothing after", async () => {
    player.send(event, data);
    await settled();
    queueEvents.emit("operationCompleted", { queueId: "game-1", operationId: "op-1" });
    await settled();

    expect(player.received()).toEqual([queuedAnswer]);
  });

  it("a request the queue fails to record: that answer, the friendly line as two errors, then an error response under the client's id", async () => {
    player.send(event, data);
    await settled();
    queueEvents.emit("operationError", {
      queueId: "game-1",
      operationId: "op-1",
      gameId: "game-1",
      operationType,
      error: "ENOSPC: no space left on device",
    });
    await settled();

    expect(player.received()).toEqual([
      queuedAnswer,
      ["error", { error: friendly, operationType }],
      ["error", { error: friendly }],
      ["response", { type: response, status: "error", requestId: "req-1", timestamp: expect.any(Number), errorMessage: friendly }],
    ]);
  });

  it("a request refused before it is queued: an error, then an error response under the client's id", async () => {
    getPlayerBySocket.mockReturnValue(undefined);

    player.send(event, data);
    await settled();

    expect(addOperation).not.toHaveBeenCalled();
    expect(player.received()).toEqual([
      ["error", { error: "Player not found" }],
      ["response", { type: response, status: "error", requestId: "req-1", timestamp: expect.any(Number), errorMessage: "Player not found" }],
    ]);
  });
});
