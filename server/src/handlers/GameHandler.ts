import type { Socket } from "socket.io";
import type { Story } from "../services/Story.js";
import { isValidPlayerCount } from "shared/utils/playerUtils.js";
import type { PlayerCount, PlayerSlot } from "shared/types/player.js";
import { getPlayerSlots } from "shared/utils/playerUtils.js";
import { StoryRepository } from "../services/StoryRepository.js";
import { connectionManager } from "../services/ConnectionManager.js";
import type { GameMode } from "shared/types/story.js";
import { MAX_TURNS, MIN_TURNS } from "shared/config.js";
import { gameQueueProcessor } from "../services/GameQueueProcessor.js";
import { randomUUID } from "crypto";
import type { OperationErrorEvent } from "../types/queue.js";

export class GameHandler {
  protected storyRepository: StoryRepository;
  private socket: Socket;
  private pendingOperations: Map<
    string,
    { resolve: () => void; reject: (error: Error) => void }
  > = new Map();

  constructor(socket: Socket) {
    this.socket = socket;
    this.storyRepository = StoryRepository.getInstance();
    console.log("[GameHandler] Created new handler for socket:", socket.id);

    // Add event listeners for queue processor events
    gameQueueProcessor.events.on("storyInitialized", ({ gameId, story }) => {
      if (this.pendingInitializations.has(gameId)) {
        const { resolve, codes } = this.pendingInitializations.get(gameId)!;
        this.socket.emit("story_codes", { codes });
        resolve();
        this.pendingInitializations.delete(gameId);
      }
    });

    gameQueueProcessor.events.on("storyUpdated", ({ gameId, story }) => {
      console.log("[GameHandler] Received story update for game:", gameId);
      this.storyRepository.storeStory(gameId, story);
      connectionManager.broadcastStoryUpdate(gameId, story);
    });

    // Add centralized error handler
    gameQueueProcessor.events.on(
      "operationError",
      this.handleOperationError.bind(this)
    );
  }

  /**
   * Centralized error handler for all operation errors
   */
  private handleOperationError(event: OperationErrorEvent): void {
    console.error(`[GameHandler] Operation error: ${event.error}`);
    if (event.stack) {
      console.error(`[GameHandler] Stack trace: ${event.stack}`);
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
      case "moveStoryForward":
        userFriendlyMessage = "Unable to continue the story. Please try again.";
        break;
      case "generateImages":
        userFriendlyMessage =
          "Unable to generate images. The story will continue without images.";
        break;
      default:
        userFriendlyMessage = `Something went wrong with operation ${event.operationType}. Please try again.`;
    }

    // Send only the user-friendly message to the client
    this.socket.emit("error", {
      error: userFriendlyMessage,
      operationType: event.operationType,
    });

    // Resolve any pending operations with error
    if (this.pendingOperations.has(event.operationId)) {
      const { reject } = this.pendingOperations.get(event.operationId)!;
      reject(new Error(event.error));
      this.pendingOperations.delete(event.operationId);
    }

    // Also check pending initializations
    if (this.pendingInitializations.has(event.gameId)) {
      this.pendingInitializations.delete(event.gameId);
    }
  }

  private pendingInitializations = new Map<
    string,
    { resolve: () => void; codes: Record<PlayerSlot, string> }
  >();

  private generatePlayerCodes(
    playerCount: PlayerCount
  ): Record<string, string> {
    const codes: Record<string, string> = {};
    const playerSlots = getPlayerSlots(playerCount);

    playerSlots.forEach((slot) => {
      // Generate a random 6-character code
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      codes[slot] = code;
    });

    return codes;
  }

  async initializeStory(
    prompt: string,
    generateImages: boolean,
    playerCount: PlayerCount,
    maxTurns: number,
    gameMode: GameMode
  ): Promise<void> {
    try {
      console.log(`\n====== [GameHandler] Initializing story ======`);
      if (!isValidPlayerCount(playerCount)) {
        throw new Error(`Invalid player count: ${playerCount}`);
      }
      if (maxTurns < MIN_TURNS || maxTurns > MAX_TURNS) {
        throw new Error(`Invalid max turns: ${maxTurns}`);
      }

      const gameId = randomUUID();
      const playerCodes = this.generatePlayerCodes(playerCount);

      // Register game session and codes
      console.log("[GameHandler] Registering game session and codes");
      connectionManager.createGameSession(gameId);
      Object.entries(playerCodes).forEach(([slot, code]) => {
        connectionManager.registerCode(gameId, slot as PlayerSlot, code);
      });

      // Create a promise that will resolve when initialization is complete
      await new Promise<void>((resolve, reject) => {
        this.pendingInitializations.set(gameId, {
          resolve,
          codes: playerCodes,
        });

        // Queue the story initialization
        gameQueueProcessor
          .addOperation({
            gameId,
            type: "initializeStory",
            input: {
              prompt,
              generateImages,
              playerCount,
              maxTurns,
              gameMode,
              playerCodes,
            },
          })
          .then((operationId) => {
            // Store the operation ID for error handling
            this.pendingOperations.set(operationId, { resolve, reject });
          });
      });
    } catch (error) {
      console.error("[GameHandler] Failed to initialize story:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.socket.emit("error", {
        error: "Failed to initialize story",
        details: errorMessage,
      });
      throw error; // Re-throw to allow caller to handle
    }
  }

  async makeChoice(optionIndex: number) {
    console.log(
      `\n====== [GameHandler] Processing choice: ${optionIndex} ======`
    );

    try {
      const playerInfo = connectionManager.getPlayerBySocket(this.socket.id);
      if (!playerInfo) {
        throw new Error("Player not found");
      }

      // Get current story
      const story = await this.storyRepository.getStory(playerInfo.storyId);
      if (!story) {
        throw new Error("Story not found");
      }

      // Validate player state and choice
      this.validateChoice(story, playerInfo.playerSlot, optionIndex);

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

      // Create a promise that will resolve when the operation is complete
      await new Promise<void>((resolve, reject) => {
        this.pendingOperations.set(operationId, { resolve, reject });
      });
    } catch (error) {
      console.error("[GameHandler] Error processing choice:", error);
      this.socket.emit("error", {
        error:
          error instanceof Error ? error.message : "Failed to process choice",
      });
      throw error; // Re-throw to allow caller to handle
    }
  }

  private validateChoice(
    story: Story,
    playerSlot: PlayerSlot,
    optionIndex: number
  ): void {
    const playerInfo = connectionManager.getPlayerBySocket(this.socket.id);
    if (!playerInfo) {
      throw new Error("Player not found");
    }

    // Ensure player's socket is still valid
    const activeSockets = connectionManager.getActiveSockets(
      playerInfo.storyId,
      playerSlot
    );
    if (!activeSockets.has(this.socket.id)) {
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
}
