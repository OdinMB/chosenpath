import type { Socket } from "socket.io";
import type { Story } from "@core/models/Story.js";
import { isValidPlayerCount, getPlayerSlots } from "@core/utils/playerUtils.js";
import type { PlayerCount, PlayerSlot, GameMode } from "@core/types/index.js";
import { StoryRepository } from "@common/StoryRepository.js";
import { connectionManager } from "@common/ConnectionManager.js";
import { MAX_TURNS, MIN_TURNS } from "@core/config.js";
import { gameQueueProcessor } from "./services/GameQueueProcessor.js";
import { randomUUID } from "crypto";
import type { OperationErrorEvent } from "./queue.js";
import type {
  StoryCodesNotification,
  StoryReadyNotification,
  SelectCharacterResponse,
  MakeChoiceResponse,
  InitializeStoryResponse,
} from "@core/types/websocket.js";
import { nanoid } from "nanoid";
import { AdminLibraryService } from "../admin/AdminLibraryService.js";

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
  private storyInitializedHandler: (event: any) => void;
  private operationErrorHandler: (event: any) => void;

  constructor() {
    this.storyRepository = StoryRepository.getInstance();
    console.log("[GameHandler] Creating game handler instance");

    // Create bound handlers for events
    this.storyInitializedHandler = this.handleStoryInitialized.bind(this);
    this.operationErrorHandler = this.handleOperationError.bind(this);

    // Add event listeners for queue processor events - only once per instance
    gameQueueProcessor.events.on(
      "storyInitialized",
      this.storyInitializedHandler
    );
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

  private handleStoryInitialized(event: {
    gameId: string;
    story: Story;
  }): void {
    const { gameId, story } = event;
    console.log(`[GameHandler] Story initialized for game: ${gameId}`);

    // Get all sockets associated with this game
    const gameSocketIds = this.getSocketIdsForGame(gameId);

    // Send notification to all sockets in the game
    for (const socketId of gameSocketIds) {
      const socket = this.sockets.get(socketId);
      if (socket) {
        socket.emit("story_ready_notification", {
          type: "story_ready_notification",
          gameId,
        } as StoryReadyNotification);
      }
    }

    // Resolve any pending operations for this game
    if (this.pendingOperations.has(gameId)) {
      const { resolve } = this.pendingOperations.get(gameId)!;
      resolve();
      this.pendingOperations.delete(gameId);
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

    // Find the socket associated with this operation or game
    if (this.pendingOperations.has(event.operationId)) {
      const { reject, socketId } = this.pendingOperations.get(
        event.operationId
      )!;
      const socket = this.sockets.get(socketId);

      // Send the error message to the client if socket still exists
      if (socket) {
        socket.emit("error", {
          error: userFriendlyMessage,
          operationType: event.operationType,
        });
      }

      // Reject the pending operation
      reject(new Error(event.error));
      this.pendingOperations.delete(event.operationId);
    } else if (event.gameId) {
      // If we don't have the operation but we do have the gameId, try to notify all sockets in the game
      const socketIds = this.getSocketIdsForGame(event.gameId);
      for (const socketId of socketIds) {
        const socket = this.sockets.get(socketId);
        if (socket) {
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
    socket: Socket,
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
      socket.emit("story_codes_notification", {
        type: "story_codes_notification",
        gameId,
        codes: playerCodes,
      } as StoryCodesNotification);

      // Create a promise that will resolve when initialization is complete
      await new Promise<void>(async (resolve, reject) => {
        // Store the resolve/reject handlers for later use
        this.pendingOperations.set(gameId, {
          resolve,
          reject,
          socketId: socket.id,
        });

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
        socket.emit("response", requestResponse);
        console.log(
          "[GameHandler] Emitted initialize_story_response to client: ",
          requestResponse
        );
      });
    } catch (error) {
      console.error("[GameHandler] Failed to initialize story:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      socket.emit("error", {
        error: "Failed to initialize story",
        details: errorMessage,
      });
      throw error; // Re-throw to allow caller to handle
    }
  }

  async initializeFromTemplate(
    socket: Socket,
    templateId: string,
    playerCount: PlayerCount,
    maxTurns: number
  ): Promise<void> {
    try {
      console.log(
        `\n====== [GameHandler] Initializing story from template: ${templateId} ======`
      );
      if (!isValidPlayerCount(playerCount)) {
        throw new Error(`Invalid player count: ${playerCount}`);
      }
      if (maxTurns < MIN_TURNS || maxTurns > MAX_TURNS) {
        throw new Error(`Invalid max turns: ${maxTurns}`);
      }

      // Fetch the template from the library
      const libraryService = new AdminLibraryService();
      const template = await libraryService.getTemplateById(templateId);

      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      // Validate that requested player count is within template limits
      if (
        playerCount < template.playerCountMin ||
        playerCount > template.playerCountMax
      ) {
        throw new Error(
          `Player count ${playerCount} is outside template limits (${template.playerCountMin}-${template.playerCountMax})`
        );
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
      socket.emit("story_codes_notification", {
        type: "story_codes_notification",
        gameId,
        codes: playerCodes,
      } as StoryCodesNotification);

      // Create a promise that will resolve when initialization is complete
      await new Promise<void>(async (resolve, reject) => {
        // Store the resolve/reject handlers for later use
        this.pendingOperations.set(gameId, {
          resolve,
          reject,
          socketId: socket.id,
        });

        // Queue the story initialization from template
        const operationId = await gameQueueProcessor.addOperation({
          gameId,
          type: "initializeStoryFromTemplate",
          input: {
            template,
            playerCount,
            maxTurns,
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
        socket.emit("response", requestResponse);
        console.log(
          "[GameHandler] Emitted initialize_story_response to client: ",
          requestResponse
        );
      });
    } catch (error) {
      console.error(
        "[GameHandler] Failed to initialize story from template:",
        error
      );
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      socket.emit("error", {
        error: "Failed to initialize story from template",
        details: errorMessage,
      });
      throw error; // Re-throw to allow caller to handle
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
      this.validateChoice(socket.id, story, playerInfo.playerSlot, optionIndex);

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
      console.log(
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
      console.error("[GameHandler] Error processing choice:", error);
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
      console.log(
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
      console.error(
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
    playerSlot: PlayerSlot,
    optionIndex: number
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

    // Remove event listeners
    gameQueueProcessor.events.off(
      "storyInitialized",
      this.storyInitializedHandler
    );
    gameQueueProcessor.events.off("operationError", this.operationErrorHandler);

    // Clear all maps
    this.sockets.clear();
    this.pendingOperations.clear();
    this.pendingInitializations.clear();
  }
}
