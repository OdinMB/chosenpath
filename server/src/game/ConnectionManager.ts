import type { Socket } from "socket.io";
import type {
  PlayerSlot,
  ClientStoryState,
  StoryState,
  StateUpdateNotification,
} from "core/types/index.js";
import { storyRepository } from "../stories/StoryRepository.js";
import { Story } from "core/models/Story.js";
import { Server } from "socket.io";
import { Logger } from "shared/logger.js";
import {
  storyDbService,
  StoryPlayerDbInfo,
} from "../stories/StoryDbService.js"; // Changed from storyMetadataDbService

interface PlayerConnection {
  socketIds: Set<string>;
  playerSlot: PlayerSlot;
  userId?: string; // Optional: for future auth
  code: string; // Current code-based system
  lastActive: Date;
}

interface GameSession {
  storyId: string;
  players: Map<PlayerSlot, PlayerConnection>;
  createdAt: Date;
  userId?: string; // Optional: future game owner
}

export class ConnectionManager {
  private gameSessions: Map<string, GameSession>;
  private socketMap: Map<string, { storyId: string; playerSlot: PlayerSlot }>;
  private codeMap: Map<string, { storyId: string; playerSlot: PlayerSlot }>;
  private io?: Server;

  constructor() {
    this.gameSessions = new Map();
    this.socketMap = new Map();
    this.codeMap = new Map();
  }

  setIo(io: Server): void {
    this.io = io;
  }

  getIo(): Server | undefined {
    return this.io;
  }

  createGameSession(storyId: string, userId?: string): void {
    Logger.ConnectionManager.log("Creating game session:", {
      storyId,
      userId,
    });

    this.gameSessions.set(storyId, {
      storyId,
      players: new Map(),
      createdAt: new Date(),
      userId,
    });
  }

  addPlayer(
    storyId: string,
    playerSlot: PlayerSlot,
    code: string,
    socket: Socket,
    userId?: string
  ): void {
    Logger.ConnectionManager.log("Adding player:", {
      storyId,
      playerSlot,
      code,
      socketId: socket.id,
      userId,
    });

    const session = this.gameSessions.get(storyId);
    if (!session) {
      Logger.ConnectionManager.error("Game session not found:", storyId);
      throw new Error(`Game session ${storyId} not found`);
    }

    // Create or update player connection
    const existingPlayer = session.players.get(playerSlot);
    if (existingPlayer) {
      Logger.ConnectionManager.log("Updating existing player connection:", {
        playerSlot,
        previousSocketCount: existingPlayer.socketIds.size,
      });
      existingPlayer.socketIds.add(socket.id);
      existingPlayer.lastActive = new Date();
      if (userId) existingPlayer.userId = userId;
    } else {
      Logger.ConnectionManager.log("Creating new player connection:", {
        playerSlot,
      });
      session.players.set(playerSlot, {
        socketIds: new Set([socket.id]),
        playerSlot,
        code,
        userId,
        lastActive: new Date(),
      });
    }

    // If userId is present, update the database
    if (userId) {
      storyDbService
        .assignUserToPlayerSlot(storyId, playerSlot, userId)
        .catch((err) => {
          Logger.ConnectionManager.error(
            `Failed to assign user ${userId} to slot ${playerSlot} in story ${storyId} in DB:`,
            err
          );
          // Depending on requirements, you might want to handle this error more gracefully
          // For now, just logging it.
        });
    }

    // Update lookup maps
    this.socketMap.set(socket.id, { storyId, playerSlot });
    this.codeMap.set(code, { storyId, playerSlot });
  }

  /**
   * Remove a socket from all connections
   * Called when a socket disconnects or is cleaned up
   */
  removeSocket(socketId: string): void {
    const connection = this.socketMap.get(socketId);
    if (!connection) {
      // No mapping found - socket likely wasn't part of any game
      return;
    }

    const { storyId, playerSlot } = connection;
    Logger.ConnectionManager.log(
      `Removing socket ${socketId} from game ${storyId}, player ${playerSlot}`
    );

    const session = this.gameSessions.get(storyId);
    if (!session) {
      // Clean up mapping even if session is gone
      this.socketMap.delete(socketId);
      return;
    }

    const player = session.players.get(playerSlot);
    if (!player) {
      // Clean up mapping even if player is gone
      this.socketMap.delete(socketId);
      return;
    }

    // Remove socket from player's connections
    player.socketIds.delete(socketId);
    this.socketMap.delete(socketId);

    // If no more connections, update last active time
    if (player.socketIds.size === 0) {
      player.lastActive = new Date();
      Logger.ConnectionManager.log(
        `Player ${playerSlot} in game ${storyId} now has no active connections`
      );
    }
  }

  async getPlayerByCode(
    code: string
  ): Promise<{ storyId: string; playerSlot: PlayerSlot } | undefined> {
    Logger.ConnectionManager.log("Looking up player by code:", code);

    const cachedMapping = this.codeMap.get(code);
    if (cachedMapping) {
      Logger.ConnectionManager.log("Found code mapping in memory cache");
      return cachedMapping;
    }

    Logger.ConnectionManager.log(
      "Code not found in memory, querying database via service..."
    );
    try {
      const dbPlayerInfo: StoryPlayerDbInfo | undefined =
        await storyDbService.getStoryPlayerByCode(code);

      if (dbPlayerInfo) {
        const { storyId, playerSlot } = dbPlayerInfo;
        Logger.ConnectionManager.log("Found code in database via service:", {
          storyId,
          playerSlot,
        });

        if (!this.gameSessions.has(storyId)) {
          this.createGameSession(storyId);
        }
        this.codeMap.set(code, { storyId, playerSlot });
        return { storyId, playerSlot };
      } else {
        Logger.ConnectionManager.log("Code not found in database via service");
        return undefined;
      }
    } catch (dbError) {
      Logger.ConnectionManager.error(
        "Service error looking up player by code:",
        dbError
      );
      return undefined;
    }
  }

  getActivePlayersInGame(storyId: string): Array<{
    playerSlot: PlayerSlot;
    userId?: string;
    isConnected: boolean;
    lastActive: Date;
  }> {
    const session = this.gameSessions.get(storyId);
    if (!session) return [];

    return Array.from(session.players.values()).map((player) => ({
      playerSlot: player.playerSlot,
      userId: player.userId,
      isConnected: player.socketIds.size > 0,
      lastActive: player.lastActive,
    }));
  }

  getActiveSockets(storyId: string, playerSlot: PlayerSlot): Set<string> {
    const session = this.gameSessions.get(storyId);
    if (!session) return new Set();

    const player = session.players.get(playerSlot);
    if (!player) return new Set();

    return player.socketIds;
  }

  isPlayerActive(storyId: string, playerSlot: PlayerSlot): boolean {
    const session = this.gameSessions.get(storyId);
    if (!session) return false;

    const player = session.players.get(playerSlot);
    if (!player) return false;

    return player.socketIds.size > 0;
  }

  // Helper method to clean up inactive sessions (can be called periodically)
  cleanupInactiveSessions(): void {
    let cleanedSessionsCount = 0;

    Logger.ConnectionManager.log("Running game session cleanup:", {
      totalSessions: this.gameSessions.size,
    });

    for (const [storyId, session] of this.gameSessions) {
      let hasConnectedPlayers = false;

      // Check if any player has active socket connections
      for (const [, player] of session.players) {
        if (player.socketIds.size > 0) {
          hasConnectedPlayers = true;
          break;
        }
      }

      // If no players are connected, clean up the session
      if (!hasConnectedPlayers) {
        Logger.ConnectionManager.log(
          `Cleaning up inactive game session: ${storyId}`
        );

        // Clean up all references
        session.players.forEach((player) => {
          // No need to delete socketIds as there are none
          this.codeMap.delete(player.code);
        });
        this.gameSessions.delete(storyId);
        cleanedSessionsCount++;
      }
    }

    Logger.ConnectionManager.log("Game session cleanup complete:", {
      cleanedSessions: cleanedSessionsCount,
      remainingSessions: this.gameSessions.size,
    });
  }

  getPlayerBySocket(
    socketId: string
  ): { storyId: string; playerSlot: PlayerSlot } | undefined {
    return this.socketMap.get(socketId);
  }

  /**
   * Check if a socket is associated with any game
   * @param socketId The ID of the socket to check
   * @returns True if the socket is part of a game, false otherwise
   */
  isSocketInGame(socketId: string): boolean {
    return this.socketMap.has(socketId);
  }

  registerCode(storyId: string, playerSlot: PlayerSlot, code: string): void {
    Logger.ConnectionManager.log("Registering code:", {
      storyId,
      playerSlot,
      code,
    });

    const session = this.gameSessions.get(storyId);
    if (!session) {
      Logger.ConnectionManager.error("Game session not found:", storyId);
      throw new Error(`Game session ${storyId} not found`);
    }

    // Only register the code mapping, don't create a player connection yet
    this.codeMap.set(code, { storyId, playerSlot });
  }

  // Add method to reconstruct mappings from story states
  reconstructFromStoryStates(
    stories: Array<{ storyId: string; state: StoryState }>
  ): void {
    Logger.ConnectionManager.log(
      "Reconstructing mappings from provided story states (priming cache)..."
    );

    stories.forEach(({ storyId, state }) => {
      // Create game session if not already present (e.g. from getPlayerByCode)
      if (!this.gameSessions.has(storyId)) {
        this.createGameSession(storyId);
      }

      // Register codes from state into the in-memory codeMap cache
      if (state.playerCodes) {
        Object.entries(state.playerCodes).forEach(([slot, code]) => {
          Logger.ConnectionManager.log("Priming codeMap cache from state:", {
            storyId,
            slot,
            code,
          });
          // This assumes that stories passed here are active or recently active.
          if (!this.codeMap.has(code)) {
            this.codeMap.set(code, { storyId, playerSlot: slot as PlayerSlot });
          }
        });
      }
    });

    Logger.ConnectionManager.log("Finished priming cache from story states");
  }

  async verifyCode(
    code: string
  ): Promise<{ state: ClientStoryState | null; error?: string }> {
    Logger.ConnectionManager.log("Verifying code:", code);

    try {
      const playerInfo = await this.getPlayerByCode(code);
      if (!playerInfo) {
        Logger.ConnectionManager.log("Invalid code:", code);
        return { state: null, error: "Invalid code" };
      }

      Logger.ConnectionManager.log("Found player info:", playerInfo);

      const story = await storyRepository.getStory(playerInfo.storyId);
      if (!story) {
        Logger.ConnectionManager.log(
          "Story state not found for:",
          playerInfo.storyId
        );
        return { state: null, error: "Story state not found" };
      }

      Logger.ConnectionManager.log(
        "Found story state, filtering for player:",
        playerInfo.playerSlot
      );

      // Filter state for specific player
      const filteredState = story.filterStateForPlayer(playerInfo.playerSlot);

      Logger.ConnectionManager.log("Verification successful");
      return { state: filteredState };
    } catch (error) {
      Logger.ConnectionManager.error("Error verifying code:", error);
      return { state: null, error: "Failed to verify code" };
    }
  }

  async exitStory(socketId: string): Promise<void> {
    Logger.ConnectionManager.log("Exiting story for socket:", socketId);

    const playerInfo = this.getPlayerBySocket(socketId);
    if (!playerInfo) {
      Logger.ConnectionManager.log("No player info found for socket");
      return;
    }

    // Remove socket from connection manager
    this.removeSocket(socketId);
    Logger.ConnectionManager.log("Story exited successfully");
  }

  broadcastStoryUpdate(storyId: string, story: Story): void {
    if (!this.io) {
      Logger.ConnectionManager.error("Socket.IO instance not set");
      return;
    }

    Logger.ConnectionManager.log(
      "Broadcasting state update for story:",
      storyId
    );

    const playerSlots = story.getPlayerSlots();

    playerSlots.forEach((slot) => {
      const sockets = this.getActiveSockets(storyId, slot);
      const filteredState = story.filterStateForPlayer(slot);

      sockets.forEach((socketId) => {
        Logger.ConnectionManager.log("Sending update to socket:", socketId);
        this.io!.to(socketId).emit("state_update_notification", {
          type: "state_update_notification",
          state: filteredState,
          trigger: "story_update", // Default trigger
        } as StateUpdateNotification);
      });
    });
  }

  // Get player codes for a story - now gets directly from Story Repository
  async getPlayerCodes(
    storyId: string
  ): Promise<Record<string, string> | undefined> {
    Logger.ConnectionManager.log(
      "Fetching player codes via service for story:",
      storyId
    );
    try {
      const codes = await storyDbService.getStoryPlayerCodes(storyId);
      if (codes) {
        Logger.ConnectionManager.log("Found codes via service:", codes);
        return codes as Record<string, string>; // Cast because service returns Record<PlayerSlot, string>
      }
      Logger.ConnectionManager.log(
        "No codes found via service for story:",
        storyId
      );
      return undefined;
    } catch (dbError) {
      Logger.ConnectionManager.error(
        "Service error fetching player codes:",
        dbError
      );
      return undefined;
    }
  }
}

// Export singleton instance
export const connectionManager = new ConnectionManager();
