import type { Socket } from "socket.io";
import type { PlayerSlot } from "shared/types/player.js";
import type { ClientStoryState, StoryState } from "shared/types/story.js";
import { storyRepository } from "./StoryRepository.js";
import { Story } from "./Story.js";
import { Server } from "socket.io";

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

  createGameSession(storyId: string, userId?: string): void {
    console.log("[ConnectionManager] Creating game session:", {
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
    console.log("[ConnectionManager] Adding player:", {
      storyId,
      playerSlot,
      code,
      socketId: socket.id,
      userId,
    });

    const session = this.gameSessions.get(storyId);
    if (!session) {
      console.error("[ConnectionManager] Game session not found:", storyId);
      throw new Error(`Game session ${storyId} not found`);
    }

    // Create or update player connection
    const existingPlayer = session.players.get(playerSlot);
    if (existingPlayer) {
      console.log("[ConnectionManager] Updating existing player connection:", {
        playerSlot,
        previousSocketCount: existingPlayer.socketIds.size,
      });
      existingPlayer.socketIds.add(socket.id);
      existingPlayer.lastActive = new Date();
      if (userId) existingPlayer.userId = userId;
    } else {
      console.log("[ConnectionManager] Creating new player connection:", {
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
    console.log("[ConnectionManager] Looking up player by code:", code);

    // Check in-memory mapping first
    const mapping = this.codeMap.get(code);
    if (mapping) {
      console.log("[ConnectionManager] Found code mapping in memory");
      return mapping;
    }

    // If not found, try to find the story file containing this code
    console.log(
      "[ConnectionManager] Code not found in memory, searching files..."
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

    console.log("[ConnectionManager] Code not found in any story");
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
    console.log("[ConnectionManager] Registering code:", {
      storyId,
      playerSlot,
      code,
    });

    const session = this.gameSessions.get(storyId);
    if (!session) {
      console.error("[ConnectionManager] Game session not found:", storyId);
      throw new Error(`Game session ${storyId} not found`);
    }

    // Only register the code mapping, don't create a player connection yet
    this.codeMap.set(code, { storyId, playerSlot });
  }

  // Add method to reconstruct mappings from story states
  reconstructFromStoryStates(
    stories: Array<{ storyId: string; state: StoryState }>
  ): void {
    console.log(
      "[ConnectionManager] Reconstructing mappings from story states..."
    );

    stories.forEach(({ storyId, state }) => {
      // Create game session
      this.createGameSession(storyId);

      // Register codes from state
      if (state.playerCodes) {
        Object.entries(state.playerCodes).forEach(([slot, code]) => {
          console.log("[ConnectionManager] Reconstructing code mapping:", {
            storyId,
            slot,
            code,
          });
          this.registerCode(storyId, slot as PlayerSlot, code);
        });
      }
    });

    console.log("[ConnectionManager] Finished reconstructing mappings");
  }

  async verifyCode(
    code: string
  ): Promise<{ state: ClientStoryState | null; error?: string }> {
    console.log("[ConnectionManager] Verifying code:", code);

    try {
      const playerInfo = await this.getPlayerByCode(code);
      if (!playerInfo) {
        console.log("[ConnectionManager] Invalid code:", code);
        return { state: null, error: "Invalid code" };
      }

      console.log("[ConnectionManager] Found player info:", playerInfo);

      const story = await storyRepository.getStory(playerInfo.storyId);
      if (!story) {
        console.log(
          "[ConnectionManager] Story state not found for:",
          playerInfo.storyId
        );
        return { state: null, error: "Story state not found" };
      }

      console.log(
        "[ConnectionManager] Found story state, filtering for player:",
        playerInfo.playerSlot
      );

      // Filter state for specific player
      const filteredState = story.filterStateForPlayer(playerInfo.playerSlot);

      console.log("[ConnectionManager] Verification successful");
      return { state: filteredState };
    } catch (error) {
      console.error("[ConnectionManager] Error verifying code:", error);
      return { state: null, error: "Failed to verify code" };
    }
  }

  async exitStory(socketId: string): Promise<void> {
    console.log("[ConnectionManager] Exiting story for socket:", socketId);

    const playerInfo = this.getPlayerBySocket(socketId);
    if (!playerInfo) {
      console.log("[ConnectionManager] No player info found for socket");
      return;
    }

    // Remove socket from connection manager
    this.removeSocket(socketId);
    console.log("[ConnectionManager] Story exited successfully");
  }

  broadcastStoryUpdate(storyId: string, story: Story): void {
    if (!this.io) {
      console.error("[ConnectionManager] Socket.IO instance not set");
      return;
    }

    console.log(
      "[ConnectionManager] Broadcasting state update for story:",
      storyId
    );

    const playerSlots = story.getPlayerSlots();

    playerSlots.forEach((slot) => {
      const sockets = this.getActiveSockets(storyId, slot);
      const filteredState = story.filterStateForPlayer(slot);

      sockets.forEach((socketId) => {
        console.log("[ConnectionManager] Sending update to socket:", socketId);
        this.io!.to(socketId).emit("state_update", { state: filteredState });
      });
    });
  }
}

// Export singleton instance
export const connectionManager = new ConnectionManager();
