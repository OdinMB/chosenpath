import type { Socket } from "socket.io";
import type { StoryState } from "../../../shared/types/story.js";
import { SessionService } from "../services/SessionService.js";
import { ImageService } from "../services/ImageService.js";
import { isValidPlayerCount } from "../../../shared/utils/playerUtils.js";
import type { PlayerCount } from "../../../shared/types/players.js";
import { getPlayerSlots } from "../../../shared/utils/playerUtils.js";
import { StoryStateManager } from "../services/StoryStateManager.js";
import { connectionManager } from "../services/ConnectionManager.js";
import type { PlayerSlot } from "../../../shared/types/players.js";
import type { Server } from "socket.io";
import { filterStateForPlayer } from "../../../shared/utils/storyUtils.js";
import {
  getCurrentTurn,
  areAllChoicesSubmitted,
} from "../../../shared/utils/storyUtils.js";
import { AIStoryGenerator } from "../services/AIStoryGenerator.js";
import { ChangeService } from "../services/ChangeService.js";

export class GameHandler {
  private sessionService: SessionService;
  private imageService: ImageService;
  protected storyStateManager: StoryStateManager;
  private socket: Socket;
  private io: Server;
  private aiStoryGenerator: AIStoryGenerator;
  private changeService: ChangeService;

  constructor(socket: Socket) {
    this.socket = socket;
    this.aiStoryGenerator = new AIStoryGenerator();
    this.sessionService = new SessionService();
    this.imageService = new ImageService();
    this.storyStateManager = new StoryStateManager();
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

      const initialState = await this.aiStoryGenerator.createInitialState(
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
      const [stateWithInitialBeats, changes] =
        await this.aiStoryGenerator.addNextSetOfBeats(stateWithCodes);
      console.log("[GameHandler] Generated first set of beats:");

      // Apply any changes from the initial beats
      const finalState = this.changeService.applyChanges(
        stateWithInitialBeats,
        changes
      );

      // Update the stored state with the first beat
      await this.storyStateManager.updateState(storyId, finalState);
      console.log("[GameHandler] Updated state with initial beats");

      // Broadcast the state update to all connected players
      this.broadcastStateUpdate(storyId, finalState);

      // Generate and update image if needed
      if (generateImages) {
        await this.generateAndUpdateImage(storyId, finalState);
      }
    } catch (error) {
      console.error("[GameHandler] Failed to initialize story:", error);
      this.socket.emit("error", { error: "Failed to initialize story" });
    }
  }

  async makeChoice(optionIndex: number) {
    console.log("[GameHandler] Processing choice:", { optionIndex });

    try {
      const playerInfo = connectionManager.getPlayerBySocket(this.socket.id);
      if (!playerInfo) {
        throw new Error("Player not found");
      }

      const state = await this.storyStateManager.getState(playerInfo.storyId);
      if (!state) {
        throw new Error("Story not found");
      }

      const player = state.players[playerInfo.playerSlot];
      const currentBeat = player.beatHistory[player.beatHistory.length - 1];

      // Validate the choice
      if (currentBeat.choice !== -1) {
        throw new Error("Choice already made for this turn");
      }

      // Record the player's choice
      currentBeat.choice = optionIndex;

      // Save the updated state
      await this.storyStateManager.updateState(playerInfo.storyId, state);

      console.log(
        "[GameHandler] Set choice for ",
        playerInfo.playerSlot,
        " for beat #",
        player.beatHistory.length,
        " (",
        currentBeat.title,
        ") to option #",
        optionIndex
      );

      // Broadcast the updated state to all players
      this.broadcastStateUpdate(playerInfo.storyId, state);

      // Check if all players have submitted their choices
      if (areAllChoicesSubmitted(state)) {
        const [nextState, changes] =
          await this.aiStoryGenerator.addNextSetOfBeats(state);
        const updatedState = this.changeService.applyChanges(
          nextState,
          changes
        );
        await this.storyStateManager.updateState(
          playerInfo.storyId,
          updatedState
        );
        this.broadcastStateUpdate(playerInfo.storyId, updatedState);
        await this.generateAndUpdateImage(playerInfo.storyId, updatedState);
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
}
