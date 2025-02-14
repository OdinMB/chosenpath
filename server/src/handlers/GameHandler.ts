import type { Socket } from "socket.io";
import type { StoryState } from "../../../shared/types/story.js";
import { StoryService } from "../services/StoryService.js";
import { SessionService } from "../services/SessionService.js";
import { ImageService } from "../services/ImageService.js";
import { isValidPlayerCount } from "../../../shared/utils/playerUtils.js";
import type { PlayerCount } from "../../../shared/types/players.js";
import { getPlayerSlots } from "../../../shared/utils/playerUtils.js";
import { StoryStateManager } from "../services/StoryStateManager.js";
import type { ClientStoryState } from "../../../shared/types/story.js";
import { connectionManager } from "../services/ConnectionManager.js";
import type { PlayerSlot } from "../../../shared/types/players.js";
import type { Server } from "socket.io";
import { filterStateForPlayer } from "../../../shared/utils/storyUtils.js";

export class GameHandler {
  private sessionService: SessionService;
  private storyService: StoryService;
  private imageService: ImageService;
  protected storyStateManager: StoryStateManager;
  private socket: Socket;
  private io: Server;

  constructor(socket: Socket) {
    this.socket = socket;
    this.sessionService = new SessionService();
    this.storyService = new StoryService();
    this.imageService = new ImageService();
    this.storyStateManager = new StoryStateManager();
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

      // Filter state for specific player
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
    playerCount: PlayerCount
  ) {
    try {
      if (!isValidPlayerCount(playerCount)) {
        throw new Error(`Invalid player count: ${playerCount}`);
      }

      const initialState = await this.storyService.createInitialState(
        prompt,
        generateImages,
        playerCount
      );
      console.log("[GameHandler] Created initial state");

      // Generate player codes
      const playerCodes = this.generatePlayerCodes(playerCount);
      const stateWithCodes = {
        ...initialState,
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

      // Generate first set of beats
      const stateWithInitialBeats = await this.storyService.addNextSetOfBeats(
        stateWithCodes
      );
      console.log("[GameHandler] Generated first set of beats:");

      // Update the stored state with the first beat
      await this.storyStateManager.updateState(storyId, stateWithInitialBeats);
      console.log("[GameHandler] Updated state with initial beats");

      // ToDo: Emit the updated state to all players

      // Generate and update image if needed
      if (generateImages) {
        await this.generateAndUpdateImage(storyId, stateWithInitialBeats);
      }
    } catch (error) {
      console.error("[GameHandler] Failed to initialize story:", error);
      this.socket.emit("error", { error: "Failed to initialize story" });
    }
  }

  async makeChoice(sessionId: string, optionIndex: number) {
    console.log("[GameHandler] Processing choice:", {
      sessionId,
      optionIndex,
      socketId: this.socket.id,
    });

    try {
      // Get player info from socket
      const socketInfo = connectionManager.getPlayerBySocket(this.socket.id);
      if (!socketInfo) {
        throw new Error("Player not found for socket");
      }

      const { storyId, playerSlot } = socketInfo;
      const state = await this.storyStateManager.getState(storyId);
      if (!state) {
        throw new Error("Story state not found");
      }

      // Validate the choice
      const currentBeat =
        state.players[playerSlot].beatHistory[
          state.players[playerSlot].beatHistory.length - 1
        ];
      if (!currentBeat || optionIndex >= currentBeat.options.length) {
        throw new Error("Invalid choice");
      }

      // Record the choice
      const updatedState = {
        ...state,
        players: {
          ...state.players,
          [playerSlot]: {
            ...state.players[playerSlot],
            beatHistory: state.players[playerSlot].beatHistory.map(
              (beat, index) => {
                if (
                  index ===
                  state.players[playerSlot].beatHistory.length - 1
                ) {
                  return { ...beat, choice: optionIndex };
                }
                return beat;
              }
            ),
          },
        },
      };

      // Store updated state
      await this.storyStateManager.updateState(storyId, updatedState);

      // Broadcast state update to all players
      this.broadcastStateUpdate(storyId, updatedState);

      // Check if all players have made their choices
      if (this.areAllChoicesSubmitted(updatedState)) {
        await this.generateNextBeats(storyId, updatedState);
      }
    } catch (error) {
      console.error("[GameHandler] Failed to process choice:", error);
      this.socket.emit("error", { error: "Failed to process choice" });
    }
  }

  private broadcastStateUpdate(storyId: string, state: StoryState) {
    // Get all connected sockets for this game
    const playerSlots = Object.keys(state.players) as PlayerSlot[];

    playerSlots.forEach((slot) => {
      const sockets = connectionManager.getActiveSockets(storyId, slot);
      sockets.forEach((socketId) => {
        const filteredState = filterStateForPlayer(state, slot);
        this.io.to(socketId).emit("state_update", {
          state: filteredState,
        });
      });
    });
  }

  async exitStory(sessionId: string) {
    console.log("[GameHandler] Exiting story:", {
      sessionId,
      socketId: this.socket.id,
    });

    try {
      const state = this.sessionService.getSession(sessionId);
      if (state) {
        this.sessionService.updateSession(sessionId, null);
        this.socket.emit("exit_story_response");
        console.log("[GameHandler] Story exited successfully");
      } else {
        console.warn("[GameHandler] No state found for session:", sessionId);
      }
    } catch (error) {
      console.error("[GameHandler] Failed to exit story:", error);
      this.socket.emit("error", { error: "Failed to exit story" });
    }
  }

  private async generateAndUpdateImage(storyId: string, state: StoryState) {
    if (!state.generateImages) {
      console.log("[GameHandler] Image generation disabled");
      return;
    }

    const currentBeat = state.beatHistory[state.beatHistory.length - 1];
    if (!currentBeat) {
      console.warn("[GameHandler] No current beat found");
      return;
    }

    if (currentBeat.imageId) {
      console.log("[GameHandler] Beat already has image:", currentBeat.imageId);
      return;
    }

    console.log("[GameHandler] Generating image for beat:", {
      title: currentBeat.title,
      beatIndex: state.beatHistory.length - 1,
    });

    const imageGeneration = {
      id: crypto.randomUUID(),
      prompt: `${currentBeat.title}. ${currentBeat.text}`,
      description: currentBeat.title,
    };

    const image = await this.imageService.generateImage(imageGeneration);
    if (image) {
      console.log("[GameHandler] Image generated successfully:", {
        imageId: image.id,
        beatTitle: currentBeat.title,
      });
      const updatedState = this.imageService.updateStateWithImage(state, image);
      await this.storyStateManager.updateState(storyId, updatedState);
      this.socket.emit("state_update", { state: updatedState });
      console.log("[GameHandler] State updated with new image");
    } else {
      console.warn(
        "[GameHandler] Failed to generate image for beat:",
        currentBeat.title
      );
    }
  }

  private areAllChoicesSubmitted(state: StoryState): boolean {
    // Implement the logic to check if all players have made their choices
    return false; // Placeholder return, actual implementation needed
  }

  private async generateNextBeats(storyId: string, state: StoryState) {
    // Implement the logic to generate the next set of beats
    // This method should return the updated state with the new beats
    return state; // Placeholder return, actual implementation needed
  }
}
