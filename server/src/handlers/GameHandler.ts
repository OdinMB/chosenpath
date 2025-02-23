import type { Socket } from "socket.io";
import type { StoryState } from "shared/types/story.js";
import { isValidPlayerCount } from "shared/utils/playerUtils.js";
import type { PlayerCount, PlayerSlot } from "shared/types/player.js";
import { getPlayerSlots } from "shared/utils/playerUtils.js";
import { StoryStateManager } from "../services/StoryStateManager.js";
import { connectionManager } from "../services/ConnectionManager.js";
import type { GameMode } from "shared/types/story.js";
import { MAX_TURNS, MIN_TURNS } from "shared/config.js";
import { gameQueueProcessor } from "../services/GameQueueProcessor.js";
import { randomUUID } from "crypto";

export class GameHandler {
  protected storyStateManager: StoryStateManager;
  private socket: Socket;

  constructor(socket: Socket) {
    this.socket = socket;
    this.storyStateManager = StoryStateManager.getInstance();
    console.log("[GameHandler] Created new handler for socket:", socket.id);

    // Add event listeners for queue processor events
    gameQueueProcessor.events.on("storyInitialized", ({ gameId, state }) => {
      if (this.pendingInitializations.has(gameId)) {
        const { resolve, codes } = this.pendingInitializations.get(gameId)!;
        this.socket.emit("story_codes", { codes });
        resolve();
        this.pendingInitializations.delete(gameId);
      }
    });

    gameQueueProcessor.events.on("stateUpdated", ({ gameId, state }) => {
      console.log("[GameHandler] Received state update for game:", gameId);
      this.storyStateManager.storeState(gameId, state);
      connectionManager.broadcastStateUpdate(gameId, state);
    });
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
      await new Promise<void>((resolve) => {
        this.pendingInitializations.set(gameId, {
          resolve,
          codes: playerCodes,
        });

        // Queue the story initialization
        gameQueueProcessor.addOperation({
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
      });
    } catch (error) {
      console.error("[GameHandler] Failed to initialize story:", error);
      this.socket.emit("error", { error: "Failed to initialize story" });
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

      // Get current state
      const state = await this.storyStateManager.getState(playerInfo.storyId);
      if (!state) {
        throw new Error("Game state not found");
      }

      // Validate player state and choice
      this.validateChoice(state, playerInfo.playerSlot, optionIndex);

      // Queue the validated choice
      await gameQueueProcessor.addOperation({
        gameId: playerInfo.storyId,
        type: "recordChoice",
        input: {
          playerSlot: playerInfo.playerSlot,
          optionIndex,
          state,
        },
      });
    } catch (error) {
      console.error("[GameHandler] Error processing choice:", error);
      this.socket.emit("error", {
        error:
          error instanceof Error ? error.message : "Failed to process choice",
      });
    }
  }

  private validateChoice(
    state: StoryState,
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

    const player = state.players[playerSlot];
    if (!player?.beatHistory?.length) {
      throw new Error("No beat history found for player");
    }

    const currentBeat = player.beatHistory[player.beatHistory.length - 1];
    if (!currentBeat) {
      throw new Error("No current beat found");
    }

    if (state.currentBeatType === "ending") {
      throw new Error("Ending beats don't allow choices");
    }

    if (currentBeat.choice !== -1) {
      throw new Error("Choice already made for this turn");
    }
  }
}
