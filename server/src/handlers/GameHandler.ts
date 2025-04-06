import type { Socket } from "socket.io";
import type { Story } from "shared/models/Story.js";
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
import type {
  StoryCodesNotification,
  StoryReadyNotification,
  SelectCharacterResponse,
  MakeChoiceResponse,
  InitializeStoryResponse,
} from "shared/types/websocket.js";

export class GameHandler {
  protected storyRepository: StoryRepository;
  private socket: Socket;
  private pendingOperations: Map<
    string,
    { resolve: () => void; reject: (error: Error) => void }
  > = new Map();
  private storyInitializedHandler: (event: any) => void;
  private operationErrorHandler: (event: any) => void;

  constructor(socket: Socket) {
    this.socket = socket;
    this.storyRepository = StoryRepository.getInstance();
    console.log("[GameHandler] Created new handler for socket:", socket.id);

    // Create bound handlers that we can remove later
    this.storyInitializedHandler = ({ gameId, story }) => {
      console.log("[GameHandler] Story initialized for game:", gameId);

      // Since codes have been sent immediately, we now just need to notify
      // that the story is ready to be joined
      this.socket.emit("story_ready_notification", {
        type: "story_ready_notification",
        gameId,
      } as StoryReadyNotification);

      if (this.pendingOperations.has(gameId)) {
        const { resolve } = this.pendingOperations.get(gameId)!;
        resolve();
        this.pendingOperations.delete(gameId);
      }
    };

    this.operationErrorHandler = this.handleOperationError.bind(this);

    // Add event listeners for queue processor events
    gameQueueProcessor.events.on(
      "storyInitialized",
      this.storyInitializedHandler
    );
    gameQueueProcessor.events.on("operationError", this.operationErrorHandler);

    // Clean up event listeners when socket disconnects
    this.socket.on("disconnect", () => {
      console.log(
        "[GameHandler] Socket disconnected, removing event listeners"
      );
      this.removeEventListeners();
    });
  }

  /**
   * Remove all event listeners to prevent memory leaks and duplicate handling
   */
  private removeEventListeners(): void {
    gameQueueProcessor.events.off(
      "storyInitialized",
      this.storyInitializedHandler
    );
    gameQueueProcessor.events.off("operationError", this.operationErrorHandler);
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

      // Send the codes immediately so the client has them
      console.log(
        "[GameHandler] Immediately emitting story codes:",
        playerCodes
      );
      this.socket.emit("story_codes_notification", {
        type: "story_codes_notification",
        gameId,
        codes: playerCodes,
      } as StoryCodesNotification);

      // Create a promise that will resolve when initialization is complete
      await new Promise<void>(async (resolve, reject) => {
        // Store the resolve/reject handlers for later use
        this.pendingOperations.set(gameId, { resolve, reject });

        // Queue the story initialization
        const operationId = await gameQueueProcessor.addOperation({
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
        });

        // Send response once we have the actual operationId string
        const requestResponse = {
          type: "initialize_story_response",
          status: "success",
          requestId: operationId,
          timestamp: Date.now(),
          data: {},
        } as InitializeStoryResponse;
        this.socket.emit("response", requestResponse);
        console.log(
          "[GameHandler] Emitted initialize_story_response to client: ",
          requestResponse
        );
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
      this.socket.emit("response", requestResponse);
      console.log(
        "[GameHandler] Emitted request response to client:",
        requestResponse
      );

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

  async selectCharacter(identityIndex: number, backgroundIndex: number) {
    console.log(
      `\n====== [GameHandler] Processing character selection: identity=${identityIndex}, background=${backgroundIndex} ======`
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

      // Validate character selection
      this.validateCharacterSelection(
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
      this.socket.emit("response", requestResponse);
      console.log(
        "[GameHandler] Emitted select_character_response to client:",
        requestResponse
      );

      // Create a promise that will resolve when the operation is complete
      await new Promise<void>((resolve, reject) => {
        this.pendingOperations.set(operationId, { resolve, reject });
      });
    } catch (error) {
      console.error(
        "[GameHandler] Error processing character selection:",
        error
      );
      this.socket.emit("error", {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process character selection",
      });
      throw error; // Re-throw to allow caller to handle
    }
  }

  private validateCharacterSelection(
    story: Story,
    playerSlot: PlayerSlot,
    identityIndex: number,
    backgroundIndex: number
  ): void {
    // Ensure player's socket is still valid
    const playerInfo = connectionManager.getPlayerBySocket(this.socket.id);
    if (!playerInfo) {
      throw new Error("Player not found");
    }

    const activeSockets = connectionManager.getActiveSockets(
      playerInfo.storyId,
      playerSlot
    );
    if (!activeSockets.has(this.socket.id)) {
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

  // Make sure to clean up when handler is no longer needed
  public dispose(): void {
    this.removeEventListeners();
  }
}
