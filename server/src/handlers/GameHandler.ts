import type { Socket } from "socket.io";
import type { StoryState } from "../../../shared/types/story.js";
import { SessionService } from "../services/SessionService.js";
import { AIImageGenerator } from "../services/AIImageGenerator.js";
import { isValidPlayerCount } from "../../../shared/utils/playerUtils.js";
import type { PlayerCount, PlayerSlot } from "../../../shared/types/players.js";
import { getPlayerSlots } from "../../../shared/utils/playerUtils.js";
import { StoryStateManager } from "../services/StoryStateManager.js";
import { connectionManager } from "../services/ConnectionManager.js";
import type { Server } from "socket.io";
import { filterStateForPlayer } from "../../../shared/utils/storyUtils.js";
import { areAllChoicesSubmitted } from "../../../shared/utils/storyUtils.js";
import { AIStoryGenerator } from "../services/AIStoryGenerator.js";
import { ChangeService } from "../services/ChangeService.js";
import type { GameMode } from "../../../shared/types/story.js";
import type { BeatType } from "../../../shared/types/beat.js";

export class GameHandler {
  private sessionService: SessionService;
  private imageService: AIImageGenerator;
  protected storyStateManager: StoryStateManager;
  private socket: Socket;
  private io: Server;
  private aiStoryGenerator: AIStoryGenerator;
  private changeService: ChangeService;

  constructor(socket: Socket) {
    this.socket = socket;
    this.aiStoryGenerator = new AIStoryGenerator();
    this.sessionService = new SessionService();
    this.imageService = new AIImageGenerator();
    this.storyStateManager = StoryStateManager.getInstance();
    this.changeService = new ChangeService();
    this.io = socket.nsp.server;
    console.log("[GameHandler] Created new handler for socket:", socket.id);
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

  async verifyCode(sessionId: string, code: string) {
    console.log("[GameHandler] Verifying code:", {
      sessionId,
      code,
    });

    try {
      const playerInfo = await connectionManager.getPlayerByCode(code);
      if (!playerInfo) {
        console.log("[GameHandler] Invalid code:", code);
        return { state: null, error: "Invalid code" };
      }

      console.log("[GameHandler] Found player info:", playerInfo);

      const state = await this.storyStateManager.getState(playerInfo.storyId);
      if (!state) {
        console.log(
          "[GameHandler] Story state not found for:",
          playerInfo.storyId
        );
        return { state: null, error: "Story state not found" };
      }

      console.log(
        "[GameHandler] Found story state, filtering for player:",
        playerInfo.playerSlot
      );

      // Filter state for specific player and convert to ClientStoryState
      const filteredState = filterStateForPlayer(state, playerInfo.playerSlot);

      console.log("[GameHandler] Verification successful");
      return { state: filteredState };
    } catch (error) {
      console.error("[GameHandler] Error verifying code:", error);
      return { state: null, error: "Failed to verify code" };
    }
  }

  async initializeStory(
    sessionId: string,
    prompt: string,
    generateImages: boolean,
    playerCount: PlayerCount,
    maxTurns: number,
    gameMode: GameMode
  ): Promise<void> {
    try {
      if (!isValidPlayerCount(playerCount)) {
        throw new Error(`Invalid player count: ${playerCount}`);
      }

      const state = await this.aiStoryGenerator.createInitialState(
        prompt,
        generateImages,
        playerCount,
        maxTurns,
        gameMode
      );
      console.log("[GameHandler] Created initial state");

      // Generate player codes
      const playerCodes = this.generatePlayerCodes(playerCount);
      const stateWithCodes = {
        ...state,
        playerCodes,
      };

      // Store state
      const storyId = crypto.randomUUID();
      await this.storyStateManager.storeState(storyId, stateWithCodes);
      console.log("[GameHandler] Stored initial state");

      // Register game session with ConnectionManager
      connectionManager.createGameSession(storyId);

      // Register codes with ConnectionManager (but don't connect any sockets yet)
      Object.entries(playerCodes).forEach(([slot, code]) => {
        console.log("[GameHandler] Registering code for slot:", {
          slot,
          code,
          storyId,
        });
        connectionManager.registerCode(storyId, slot as PlayerSlot, code);
      });

      // Emit codes
      this.socket.emit("story_codes", {
        codes: stateWithCodes.playerCodes,
      });
      console.log(
        "[GameHandler] Emitted player codes: ",
        stateWithCodes.playerCodes
      );

      // And go
      await this.moveStoryForward(storyId, stateWithCodes);

      // ToDo: call image generation once it has its own function
    } catch (error) {
      console.error("[GameHandler] Failed to initialize story:", error);
      this.socket.emit("error", { error: "Failed to initialize story" });
    }
  }

  private async moveStoryForward(storyId: string, state: StoryState) {
    // - First beat? => create and set current beat type to switch
    // - Last beat was the last beat of a thread? => create and set current beat type to switch
    // - Last beat was a switch? => create and set current beat type to thread
    // - Create next set of beats based on the current beat type

    console.log("[GameHandler] Moving the story forward.");

    let currentBeatType: BeatType = this.determineNextBeatType(state);
    let updatedState = state;

    console.log("[GameHandler] Current beat type:", currentBeatType);

    if (currentBeatType === "intro" || currentBeatType === "switch") {
      // Switch = store current thread analysis in previousThreadAnalysis and reset current switch/thread configurations
      console.log("[GameHandler] Resetting beat context");
      updatedState = this.resetBeatContext(updatedState);
      console.log("[GameHandler] Generating switches");
      updatedState = await this.aiStoryGenerator.generateSwitches(updatedState);
    } else {
      // Thread = keep previous switch/thread configurations
      // Create thread configuration if needed
      if (
        state.currentThreadAnalysis === null ||
        state.currentThreadBeatsCompleted === 0
      ) {
        console.log("[GameHandler] Generating threads");
        updatedState = await this.aiStoryGenerator.generateThreads(state);
      } else {
        console.log("[GameHandler] Continuing thread");
      }
    }
    updatedState.currentBeatType = currentBeatType;

    // Better to not store and wait for the beats to be generated?
    this.storyStateManager.storeState(storyId, updatedState);

    await this.addBeats(storyId, updatedState);
  }

  private determineNextBeatType(state: StoryState): BeatType {
    const lastBeatType = state.currentBeatType;
    console.log(
      "[GameHandler] Determining next beat type. Last beat type:",
      lastBeatType
    );

    let currentBeatType: BeatType = "intro";

    if (lastBeatType === "intro") {
      currentBeatType = "switch";
      console.log("[GameHandler] Intro beat = switch");
    } else if (lastBeatType === "switch") {
      currentBeatType = "thread";
      console.log(
        "[GameHandler] Last beat was switch, next beat will be thread"
      );
    } else if (
      lastBeatType === "thread" &&
      state.currentThreadMaxBeats === state.currentThreadBeatsCompleted
    ) {
      currentBeatType = "switch";
      console.log("[GameHandler] Thread completed, next beat will be switch");
    } else if (lastBeatType === "thread") {
      currentBeatType = "thread";
      console.log("[GameHandler] Continuing thread");
    }

    console.log("[GameHandler] Determined next beat type:", currentBeatType);
    return currentBeatType;
  }

  private resetBeatContext(state: StoryState): StoryState {
    return {
      ...state,
      currentBeatType: null,
      currentSwitchAnalysis: null,
      currentThreadAnalysis: null,
      currentThreadMaxBeats: 0,
      currentThreadBeatsCompleted: 0,
      previousThreadAnalysis: state.currentThreadAnalysis,
    };
  }

  private async addBeats(storyId: string, state: StoryState) {
    // Get next beats, changes, and beats needing images
    const [nextState, changes, beatsNeedingImages] =
      await this.aiStoryGenerator.generateBeats(state);

    // Apply changes to state
    const stateWithChanges = this.changeService.applyChanges(
      nextState,
      changes
    );

    // Add 1 to the beats counter
    if (state.currentBeatType === "thread") {
      stateWithChanges.currentThreadBeatsCompleted += 1;
    }

    // update/broadcast
    await this.storyStateManager.storeState(storyId, stateWithChanges);
    this.broadcastStateUpdate(storyId, stateWithChanges);

    // Generate images if needed
    let stateWithImages: StoryState | undefined;
    if (state.generateImages && Object.keys(beatsNeedingImages).length > 0) {
      stateWithImages = await this.imageService.generateImagesForBeats(
        stateWithChanges,
        beatsNeedingImages
      );
      await this.storyStateManager.storeState(storyId, stateWithImages);
      this.broadcastStateUpdate(storyId, stateWithImages);
    }

    return stateWithImages || stateWithChanges;
  }

  async makeChoice(optionIndex: number) {
    console.log("[GameHandler] Processing choice:", { optionIndex });

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

      // Debug: Check current choices
      Object.entries(state.players).forEach(([slot, playerState]) => {
        const currentBeat =
          playerState.beatHistory[playerState.beatHistory.length - 1];
      });

      // Ensure player's socket is still valid
      const activeSockets = connectionManager.getActiveSockets(
        playerInfo.storyId,
        playerInfo.playerSlot
      );

      if (!activeSockets.has(this.socket.id)) {
        throw new Error("Socket connection needs refresh");
      }

      const player = state.players[playerInfo.playerSlot];
      if (!player) {
        throw new Error(`Player ${playerInfo.playerSlot} not found in state`);
      }

      if (!player.beatHistory || player.beatHistory.length === 0) {
        throw new Error(`No beat history for player ${playerInfo.playerSlot}`);
      }

      const currentBeat = player.beatHistory[player.beatHistory.length - 1];
      if (!currentBeat) {
        throw new Error(`No current beat for player ${playerInfo.playerSlot}`);
      }

      // Validate the choice
      if (currentBeat.choice !== -1) {
        throw new Error(
          `Choice already made for this turn (player: ${playerInfo.playerSlot}, beat #${player.beatHistory.length})`
        );
      }

      // Create a focused update instead of copying entire state
      const updatedPlayer = {
        ...player,
        beatHistory: player.beatHistory.map((beat, index) => {
          if (index === player.beatHistory.length - 1) {
            return { ...beat, choice: optionIndex };
          }
          return beat;
        }),
      };

      // Create minimal state update
      const updatedState = {
        ...state,
        players: {
          ...state.players,
          [playerInfo.playerSlot]: updatedPlayer,
        },
      };

      // Save the updated state
      await this.storyStateManager.storeState(playerInfo.storyId, updatedState);

      console.log(
        `[GameHandler] Set choice for player ${playerInfo.playerSlot} for beat #${player.beatHistory.length} (${currentBeat.title}) to option #${optionIndex}`
      );

      // Broadcast the updated state to all players
      this.broadcastStateUpdate(playerInfo.storyId, updatedState);

      // Check if all players have submitted their choices
      if (areAllChoicesSubmitted(updatedState)) {
        await this.moveStoryForward(playerInfo.storyId, updatedState);
      }
    } catch (error) {
      console.error("[GameHandler] Error processing choice:", error);
      this.socket.emit("error", {
        error:
          error instanceof Error ? error.message : "Failed to process choice",
      });
    }
  }

  private broadcastStateUpdate(storyId: string, state: StoryState) {
    const playerSlots = Object.keys(state.players) as PlayerSlot[];

    playerSlots.forEach((slot) => {
      const sockets = connectionManager.getActiveSockets(storyId, slot);
      sockets.forEach((socketId) => {
        const filteredState = filterStateForPlayer(state, slot);
        this.io.to(socketId).emit("state_update", { state: filteredState });
      });
    });
  }

  async exitStory(sessionId: string) {
    console.log("[GameHandler] Exiting story:", {
      sessionId,
      socketId: this.socket.id,
    });

    try {
      const playerInfo = connectionManager.getPlayerBySocket(this.socket.id);
      if (!playerInfo) {
        console.log("[GameHandler] No player info found for socket");
        this.socket.emit("exit_story_response");
        return;
      }

      // Remove socket from connection manager
      connectionManager.removeSocket(this.socket.id);

      this.socket.emit("exit_story_response");
      console.log("[GameHandler] Story exited successfully");
    } catch (error) {
      console.error("[GameHandler] Failed to exit story:", error);
      this.socket.emit("error", { error: "Failed to exit story" });
    }
  }
}
