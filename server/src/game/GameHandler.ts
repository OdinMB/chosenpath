import type { Socket } from "socket.io";
import type { Story } from "core/models/Story.js";
import type { PlayerSlot } from "core/types/index.js";
import { StoryRepository } from "../stories/StoryRepository.js";
import { connectionManager } from "server/game/ConnectionManager.js";
import { gameQueueProcessor } from "./services/GameQueueProcessor.js";
import type { OperationErrorEvent } from "./queue.js";
import type {
  SelectCharacterResponse,
  MakeChoiceResponse,
  StateUpdateNotification,
} from "core/types/websocket.js";
import { Logger } from "shared/logger.js";

/** What the players are told when a turn fails for good; the client shows it with a "Try again" (TurnFailedNotice). */
export const TURN_FAILED_LINE = "Unable to continue the story. Please try again.";

/**
 * The stored story is missing its next turn: every player has chosen (before
 * the first turn: every character is picked) and no newer turn is stored, so
 * nothing is left for a player to do. At the ending no one chooses, so it
 * never waits.
 */
function waitsForItsTurn(story: Story): boolean {
  return story.getState().characterSelectionCompleted && story.areAllChoicesSubmitted();
}

export class GameHandler {
  protected storyRepository: StoryRepository;
  private sockets: Map<string, Socket> = new Map();
  private pendingOperations: Map<
    string,
    { resolve: () => void; reject: (error: Error) => void; socketId: string }
  > = new Map();
  private pendingInitializations = new Map<
    string,
    { resolve: () => void; codes: Record<PlayerSlot, string>; socketId: string }
  >();
  private operationErrorHandler: (event: OperationErrorEvent) => void;

  constructor() {
    this.storyRepository = StoryRepository.getInstance();
    console.log("[GameHandler] Creating game handler instance");

    // Create bound handlers for events
    this.operationErrorHandler = this.handleOperationError.bind(this);

    // A failed operation reaches its players (a turn only after its one resend, GameQueueProcessor).
    // This listener was lost in 2025-05 beside the removed storyInitialized one, so no failure reached anyone.
    gameQueueProcessor.events.on("operationError", this.operationErrorHandler);
  }

  public registerSocket(socket: Socket): void {
    this.sockets.set(socket.id, socket);
    console.log(
      `[GameHandler] Registered socket: ${socket.id}, total sockets: ${this.sockets.size}`
    );

    // Set up disconnect handler to remove the socket
    socket.on("disconnect", () => {
      this.unregisterSocket(socket.id);
    });
  }

  public unregisterSocket(socketId: string): void {
    this.sockets.delete(socketId);
    console.log(
      `[GameHandler] Unregistered socket: ${socketId}, remaining sockets: ${this.sockets.size}`
    );

    // Clean up any pending operations for this socket
    for (const [key, operation] of this.pendingOperations.entries()) {
      if (operation.socketId === socketId) {
        operation.reject(new Error("Socket disconnected"));
        this.pendingOperations.delete(key);
      }
    }

    // Clean up any pending initializations for this socket
    for (const [key, initialization] of this.pendingInitializations.entries()) {
      if (initialization.socketId === socketId) {
        this.pendingInitializations.delete(key);
      }
    }
  }

  private getSocketIdsForGame(gameId: string): string[] {
    // Use ConnectionManager to find sockets in this game
    const playerSlots = connectionManager
      .getActivePlayersInGame(gameId)
      .map((p) => p.playerSlot);

    const socketIds: string[] = [];

    // For each player in the game, get their active sockets
    for (const playerSlot of playerSlots) {
      const activeSockets = connectionManager.getActiveSockets(
        gameId,
        playerSlot
      );
      socketIds.push(...Array.from(activeSockets));
    }

    return socketIds;
  }

  private handleOperationError(event: OperationErrorEvent): void {
    console.error(`[GameHandler] Operation error: ${event.error}`);
    if (event.stack) {
      console.error(`[GameHandler] Stack trace: ${event.stack}`);
    }

    // A pregeneration runs in the background: when it fails, the turn is written once it is played, so no player is told
    if (
      event.operationType === "pregenerateStoryState" ||
      event.operationType === "bulkPregenerateStoryStates"
    ) {
      return;
    }

    // Create a user-friendly error message without technical details
    let userFriendlyMessage: string;

    switch (event.operationType) {
      case "initializeStory":
        userFriendlyMessage =
          "Unable to create your story. Please try again with a different prompt.";
        break;
      case "recordChoice":
        userFriendlyMessage =
          "Unable to process your choice. Please try again.";
        break;
      case "recordCharacterSelection":
        userFriendlyMessage =
          "Unable to save your character choice. Please try again.";
        break;
      case "moveStoryForward":
        userFriendlyMessage = TURN_FAILED_LINE;
        break;
      // Image outcomes (attachImageToStory, recordImageFailure) never fail
      // the queue: their handler logs errors instead of rethrowing them.
      default:
        userFriendlyMessage = `Something went wrong with operation ${event.operationType}. Please try again.`;
    }

    // Find the socket associated with this operation or game
    if (this.pendingOperations.has(event.operationId)) {
      const { reject, socketId } = this.pendingOperations.get(
        event.operationId
      )!;
      const socket = this.sockets.get(socketId);

      // Send the error message to the client if socket still exists
      if (socket) {
        Logger.Websocket.error(
          `[GameHandler] Emitting error to socket: ${socketId}`
        );
        socket.emit("error", {
          error: userFriendlyMessage,
          operationType: event.operationType,
        });
      }

      // Reject the pending operation with the friendly line: makeChoice and selectCharacter
      // send its message on to the client (and websocket.ts as the response's errorMessage),
      // and the error's own text can name the server's paths or model-written ids (logged above)
      reject(new Error(userFriendlyMessage));
      this.pendingOperations.delete(event.operationId);
    } else if (event.gameId) {
      // If we don't have the operation but we do have the gameId, try to notify all sockets in the game
      const socketIds = this.getSocketIdsForGame(event.gameId);
      for (const socketId of socketIds) {
        const socket = this.sockets.get(socketId);
        if (socket) {
          Logger.Websocket.error(
            `[GameHandler] Emitting error to socket: ${socketId}`
          );
          socket.emit("error", {
            error: userFriendlyMessage,
            operationType: event.operationType,
          });
        }
      }

      // Also check pending initializations
      if (this.pendingInitializations.has(event.gameId)) {
        this.pendingInitializations.delete(event.gameId);
      }
    }
  }

  async makeChoice(socket: Socket, optionIndex: number) {
    console.log(
      `\n====== [GameHandler] Processing choice: ${optionIndex} ======`
    );

    try {
      const playerInfo = connectionManager.getPlayerBySocket(socket.id);
      if (!playerInfo) {
        throw new Error("Player not found");
      }

      // Get current story
      const story = await this.storyRepository.getStory(playerInfo.storyId);
      if (!story) {
        throw new Error("Story not found");
      }

      // Validate player state and choice
      this.validateChoice(socket.id, story, playerInfo.playerSlot);

      // Queue the validated choice
      const operationId = await gameQueueProcessor.addOperation({
        gameId: playerInfo.storyId,
        type: "recordChoice",
        input: {
          playerSlot: playerInfo.playerSlot,
          optionIndex,
          story,
        },
      });

      // Send a response to the client about the queued operation
      const requestResponse = {
        type: "make_choice_response",
        status: "success",
        requestId: operationId,
        timestamp: Date.now(),
        data: {
          optionIndex,
        },
      } as MakeChoiceResponse;
      socket.emit("response", requestResponse);
      Logger.Websocket.log(
        "[GameHandler] Emitted request response to client:",
        requestResponse
      );

      // Create a promise that will resolve when the operation is complete
      await new Promise<void>((resolve, reject) => {
        this.pendingOperations.set(operationId, {
          resolve,
          reject,
          socketId: socket.id,
        });
      });
    } catch (error) {
      Logger.Websocket.error("[GameHandler] Error processing choice:", error);
      socket.emit("error", {
        error:
          error instanceof Error ? error.message : "Failed to process choice",
      });
      throw error; // Re-throw to allow caller to handle
    }
  }

  async selectCharacter(
    socket: Socket,
    identityIndex: number,
    backgroundIndex: number
  ) {
    console.log(
      `\n====== [GameHandler] Processing character selection: identity=${identityIndex}, background=${backgroundIndex} ======`
    );

    try {
      const playerInfo = connectionManager.getPlayerBySocket(socket.id);
      if (!playerInfo) {
        throw new Error("Player not found");
      }

      // Get current story
      const story = await this.storyRepository.getStory(playerInfo.storyId);
      if (!story) {
        throw new Error("Story not found");
      }

      // Validate character selection
      this.validateCharacterSelection(
        socket.id,
        story,
        playerInfo.playerSlot,
        identityIndex,
        backgroundIndex
      );

      // Queue the character selection
      const operationId = await gameQueueProcessor.addOperation({
        gameId: playerInfo.storyId,
        type: "recordCharacterSelection",
        input: {
          playerSlot: playerInfo.playerSlot,
          identityIndex,
          backgroundIndex,
          story,
        },
      });

      // Send a response to the client about the queued operation
      const requestResponse = {
        type: "select_character_response",
        status: "success",
        requestId: operationId,
        timestamp: Date.now(),
        data: {
          identityIndex,
          backgroundIndex,
        },
      } as SelectCharacterResponse;
      socket.emit("response", requestResponse);
      Logger.Websocket.log(
        "[GameHandler] Emitted select_character_response to client:",
        requestResponse
      );

      // Create a promise that will resolve when the operation is complete
      await new Promise<void>((resolve, reject) => {
        this.pendingOperations.set(operationId, {
          resolve,
          reject,
          socketId: socket.id,
        });
      });
    } catch (error) {
      Logger.Websocket.error(
        "[GameHandler] Error processing character selection:",
        error
      );
      socket.emit("error", {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process character selection",
      });
      throw error; // Re-throw to allow caller to handle
    }
  }

  /**
   * A player's "Try again" after a turn failed (retry_turn): queues the turn
   * once more from the stored story, as the queue's own resend does, when the
   * story waits for it and no turn is on its way. Otherwise (another player
   * tried first, the turn arrived meanwhile, or the player's own choice was
   * never stored) it queues nothing and sends the player the story as stored,
   * so the screen shows where it stands. True when it queued the turn.
   */
  async retryTurn(socket: Socket): Promise<boolean> {
    const playerInfo = connectionManager.getPlayerBySocket(socket.id);
    const story = playerInfo
      ? await this.storyRepository.getStory(playerInfo.storyId)
      : null;
    if (!playerInfo || !story) {
      Logger.Websocket.error(
        `[GameHandler] Cannot retry the turn for socket ${socket.id}: ${
          playerInfo ? "story not found" : "player not found"
        }`
      );
      throw new Error(TURN_FAILED_LINE);
    }

    const gameId = playerInfo.storyId;
    if (waitsForItsTurn(story) && !gameQueueProcessor.isTurnOnItsWay(gameId)) {
      console.log(`[GameHandler] ${playerInfo.playerSlot} tries the turn again for game: ${gameId}`);
      await gameQueueProcessor.addOperation({
        gameId,
        type: "moveStoryForward",
        input: { story },
      });
      return true;
    }

    socket.emit("state_update_notification", {
      type: "state_update_notification",
      state: story.filterStateForPlayer(playerInfo.playerSlot),
      trigger: "story_update",
    } as StateUpdateNotification);
    return false;
  }

  /**
   * A player who arrives (a reload, a second device) at a story whose turn is
   * missing with nothing on its way is told so, as the players were when it
   * failed: the turn failed for good, or the server restarted while writing
   * it. Their "Try again" then queues it (retryTurn).
   */
  async tellIfTurnStuck(socket: Socket, gameId: string): Promise<void> {
    try {
      const story = await this.storyRepository.getStory(gameId);
      if (story && waitsForItsTurn(story) && !gameQueueProcessor.isTurnOnItsWay(gameId)) {
        socket.emit("error", {
          error: TURN_FAILED_LINE,
          operationType: "moveStoryForward",
        });
      }
    } catch (error) {
      // The player has joined already; a story that can't be read here is only logged
      Logger.Websocket.error(`[GameHandler] Could not check the turn of game ${gameId}:`, error);
    }
  }

  private validateCharacterSelection(
    socketId: string,
    story: Story,
    playerSlot: PlayerSlot,
    identityIndex: number,
    backgroundIndex: number
  ): void {
    // Ensure player's socket is still valid
    const playerInfo = connectionManager.getPlayerBySocket(socketId);
    if (!playerInfo) {
      throw new Error("Player not found");
    }

    const activeSockets = connectionManager.getActiveSockets(
      playerInfo.storyId,
      playerSlot
    );
    if (!activeSockets.has(socketId)) {
      throw new Error("Socket connection needs refresh");
    }

    // Check if character selection is available
    if (!story.getState().characterSelectionOptions) {
      throw new Error("Character selection not available");
    }

    // Check if player has already selected a character
    if (story.getState().characterSelectionCompleted) {
      throw new Error("Character selection already completed");
    }

    // Validate indices
    const options = story.getState().characterSelectionOptions[playerSlot];
    if (!options) {
      throw new Error("No character options found for player");
    }

    if (
      identityIndex < 0 ||
      identityIndex >= options.possibleCharacterIdentities.length
    ) {
      throw new Error("Invalid identity index");
    }

    if (
      backgroundIndex < 0 ||
      backgroundIndex >= options.possibleCharacterBackgrounds.length
    ) {
      throw new Error("Invalid background index");
    }
  }

  private validateChoice(
    socketId: string,
    story: Story,
    playerSlot: PlayerSlot
  ): void {
    const playerInfo = connectionManager.getPlayerBySocket(socketId);
    if (!playerInfo) {
      throw new Error("Player not found");
    }

    // Ensure player's socket is still valid
    const activeSockets = connectionManager.getActiveSockets(
      playerInfo.storyId,
      playerSlot
    );
    if (!activeSockets.has(socketId)) {
      throw new Error("Socket connection needs refresh");
    }

    const player = story.getPlayer(playerSlot);
    if (!player?.beatHistory?.length) {
      throw new Error("No beat history found for player");
    }

    const currentBeat = player.beatHistory[player.beatHistory.length - 1];
    if (!currentBeat) {
      throw new Error("No current beat found");
    }

    if (story.getCurrentBeatType() === "ending") {
      throw new Error("Ending beats don't allow choices");
    }

    if (currentBeat.choice !== -1) {
      throw new Error("Choice already made for this turn");
    }
  }

  public dispose(): void {
    console.log("[GameHandler] Disposing GameHandler instance");

    gameQueueProcessor.events.off("operationError", this.operationErrorHandler);

    // Clear all maps
    this.sockets.clear();
    this.pendingOperations.clear();
    this.pendingInitializations.clear();
  }
}
