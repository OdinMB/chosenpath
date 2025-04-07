import type { Socket } from "socket.io";
import type {
  PlayerSlot,
  ClientStoryState,
  StoryState,
  StateUpdateNotification,
} from "@core/types/index.js";
import { storyRepository } from "@common/StoryRepository.js";
import { Story } from "@core/models/Story.js";
import { Server } from "socket.io";
import { Logger } from "@common/logger.js";

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

    // Update lookup maps
    this.socketMap.set(socket.id, { storyId, playerSlot });
    this.codeMap.set(code, { storyId, playerSlot });
  }

  removeSocket(socketId: string): void {
    const connection = this.socketMap.get(socketId);
    if (!connection) return;

    const { storyId, playerSlot } = connection;
    const session = this.gameSessions.get(storyId);
    if (!session) return;

    const player = session.players.get(playerSlot);
    if (!player) return;

    // Remove socket from player's connections
    player.socketIds.delete(socketId);
    this.socketMap.delete(socketId);

    // If no more connections, update last active time
    if (player.socketIds.size === 0) {
      player.lastActive = new Date();
    }
  }

  hasCode(code: string): boolean {
    return this.codeMap.has(code);
  }

  async getPlayerByCode(
    code: string
  ): Promise<{ storyId: string; playerSlot: PlayerSlot } | undefined> {
    Logger.ConnectionManager.log("Looking up player by code:", code);

    // Check in-memory mapping first
    const mapping = this.codeMap.get(code);
    if (mapping) {
      Logger.ConnectionManager.log("Found code mapping in memory");
      return mapping;
    }

    // If not found, try to find the story file containing this code
    Logger.ConnectionManager.log(
      "Code not found in memory, searching files..."
    );
    const result = await this.findStoryByCode(code);

    if (result) {
      const { storyId, story } = result;

      // Create game session if it doesn't exist
      if (!this.gameSessions.has(storyId)) {
        this.createGameSession(storyId);
      }

      // Register the found mapping
      const playerSlot = Object.entries(story.getPlayerCodes()).find(
        ([_, c]) => c === code
      )?.[0] as PlayerSlot;

      if (playerSlot) {
        this.registerCode(storyId, playerSlot, code);
        return { storyId, playerSlot };
      }
    }

    Logger.ConnectionManager.log("Code not found in any story");
    return undefined;
  }

  private async findStoryByCode(
    code: string
  ): Promise<{ storyId: string; story: Story } | null> {
    return storyRepository.findStoryByCode(code);
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
  cleanupInactiveSessions(maxInactiveTime: number = 1000 * 60 * 60 * 24): void {
    const now = new Date();
    for (const [storyId, session] of this.gameSessions) {
      let hasActivePlayers = false;

      for (const [playerSlot, player] of session.players) {
        if (
          player.socketIds.size > 0 ||
          now.getTime() - player.lastActive.getTime() < maxInactiveTime
        ) {
          hasActivePlayers = true;
          break;
        }
      }

      if (!hasActivePlayers) {
        // Clean up all references
        session.players.forEach((player, playerSlot) => {
          player.socketIds.forEach((socketId) =>
            this.socketMap.delete(socketId)
          );
          this.codeMap.delete(player.code);
        });
        this.gameSessions.delete(storyId);
      }
    }
  }

  getPlayerBySocket(
    socketId: string
  ): { storyId: string; playerSlot: PlayerSlot } | undefined {
    return this.socketMap.get(socketId);
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
      "Reconstructing mappings from story states..."
    );

    stories.forEach(({ storyId, state }) => {
      // Create game session
      this.createGameSession(storyId);

      // Register codes from state
      if (state.playerCodes) {
        Object.entries(state.playerCodes).forEach(([slot, code]) => {
          Logger.ConnectionManager.log("Reconstructing code mapping:", {
            storyId,
            slot,
            code,
          });
          this.registerCode(storyId, slot as PlayerSlot, code);
        });
      }
    });

    Logger.ConnectionManager.log("Finished reconstructing mappings");
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
    // Get the story from repository instead of from session
    const story = await storyRepository.getStory(storyId);
    return story?.getPlayerCodes();
  }
}

// Export singleton instance
export const connectionManager = new ConnectionManager();
