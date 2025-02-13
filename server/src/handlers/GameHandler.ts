import type { Socket } from "socket.io";
import type { StoryState } from "../../../shared/types/story.js";
import { StoryService } from "../services/StoryService.js";
import { SessionService } from "../services/SessionService.js";
import { ImageService } from "../services/ImageService.js";
import { isValidPlayerCount } from "../../../shared/utils/playerUtils.js";
import type { PlayerCount } from "../../../shared/types/players.js";
import { getPlayerSlots } from "../../../shared/utils/playerUtils.js";
import { StoryStateManager } from "../services/StoryStateManager.js";

export class GameHandler {
  private sessionService: SessionService;
  private storyService: StoryService;
  private imageService: ImageService;
  protected storyStateManager: StoryStateManager;

  constructor(private socket: Socket) {
    this.sessionService = new SessionService();
    this.storyService = new StoryService();
    this.imageService = new ImageService();
    this.storyStateManager = new StoryStateManager();
    console.log('[GameHandler] Created new handler for socket:', socket.id);
  }

  private generatePlayerCodes(playerCount: PlayerCount): Record<string, string> {
    const codes: Record<string, string> = {};
    const playerSlots = getPlayerSlots(playerCount);
    
    playerSlots.forEach(slot => {
      // Generate a random 6-character code
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      codes[slot] = code;
    });
    
    return codes;
  }

  public async verifyCode(code: string): StoryState | null {
    return await this.storyStateManager.getStateByCode(code);
  }

  async initializeStory(sessionId: string, prompt: string, generateImages: boolean, playerCount: number) {
    console.log('[GameHandler] Initializing story:', {
      sessionId,
      prompt,
      generateImages,
      playerCount,
      socketId: this.socket.id
    });

    try {
      if (!isValidPlayerCount(playerCount)) {
        throw new Error(`Invalid player count: ${playerCount}`);
      }

      const initialState = await this.storyService.createInitialState(
        prompt,
        generateImages,
        playerCount as PlayerCount
      );
      console.log('[GameHandler] Created initial state');
      
      // Add player codes to the state
      const stateWithCodes = {
        ...initialState,
        playerCodes: this.generatePlayerCodes(playerCount as PlayerCount)
      };
      
      const storyId = crypto.randomUUID();
      await this.storyStateManager.storeState(storyId, stateWithCodes);
      console.log('[GameHandler] Stored initial state');
      
      // Only emit the codes initially
      this.socket.emit("story_codes", { 
        codes: stateWithCodes.playerCodes 
      });
      console.log('[GameHandler] Emitted player codes: ', stateWithCodes.playerCodes);

      // Leave this in; we'll use it later
      // // Generate first beat
      // const firstBeat = await this.storyService.generateNextBeat(stateWithCodes);
      // console.log('[GameHandler] Generated first beat:', firstBeat.title);
      
      // const stateWithBeat = {
      //   ...stateWithCodes,
      //   beatHistory: [firstBeat]
      // };
      
      // // Update the stored state with the first beat
      // await this.storyStateManager.updateState(storyId, stateWithBeat);
      // console.log('[GameHandler] Updated state with first beat');

      // // Generate and update image if needed
      // if (generateImages) {
      //   await this.generateAndUpdateImage(storyId, stateWithBeat);
      // }
    } catch (error) {
      console.error('[GameHandler] Failed to initialize story:', error);
      this.socket.emit("error", { error: "Failed to initialize story" });
    }
  }

  async makeChoice(sessionId: string, optionIndex: number) {
    console.log('[GameHandler] Processing choice:', {
      sessionId,
      optionIndex,
      socketId: this.socket.id
    });

    try {
      const currentState = this.sessionService.getSession(sessionId);
      if (!currentState) {
        console.error('[GameHandler] Session not found:', sessionId);
        throw new Error('Session not found');
      }

      console.log('[GameHandler] Generating next beat for choice:', optionIndex);
      const nextBeat = await this.storyService.generateNextBeat(currentState);
      console.log('[GameHandler] Generated next beat:', nextBeat.title);

      const newState = {
        ...currentState,
        beatHistory: [...currentState.beatHistory, nextBeat]
      };

      this.sessionService.updateSession(sessionId, newState);
      this.socket.emit("state_update", { state: newState });
      console.log('[GameHandler] Emitted state update with new beat');

      await this.generateAndUpdateImage(sessionId, newState);
    } catch (error) {
      console.error('[GameHandler] Failed to process choice:', error);
      this.socket.emit("error", { error: "Failed to process choice" });
    }
  }

  async exitStory(sessionId: string) {
    console.log('[GameHandler] Exiting story:', {
      sessionId,
      socketId: this.socket.id
    });

    try {
      const state = this.sessionService.getSession(sessionId);
      if (state) {
        this.sessionService.updateSession(sessionId, null);
        this.socket.emit("exit_story_response");
        console.log('[GameHandler] Story exited successfully');
      } else {
        console.warn('[GameHandler] No state found for session:', sessionId);
      }
    } catch (error) {
      console.error('[GameHandler] Failed to exit story:', error);
      this.socket.emit("error", { error: "Failed to exit story" });
    }
  }

  private async generateAndUpdateImage(storyId: string, state: StoryState) {
    if (!state.generateImages) {
      console.log('[GameHandler] Image generation disabled');
      return;
    }

    const currentBeat = state.beatHistory[state.beatHistory.length - 1];
    if (!currentBeat) {
      console.warn('[GameHandler] No current beat found');
      return;
    }

    if (currentBeat.imageId) {
      console.log('[GameHandler] Beat already has image:', currentBeat.imageId);
      return;
    }

    console.log('[GameHandler] Generating image for beat:', {
      title: currentBeat.title,
      beatIndex: state.beatHistory.length - 1
    });

    const imageGeneration = {
      id: crypto.randomUUID(),
      prompt: `${currentBeat.title}. ${currentBeat.text}`,
      description: currentBeat.title
    };

    const image = await this.imageService.generateImage(imageGeneration);
    if (image) {
      console.log('[GameHandler] Image generated successfully:', {
        imageId: image.id,
        beatTitle: currentBeat.title
      });
      const updatedState = this.imageService.updateStateWithImage(state, image);
      await this.storyStateManager.updateState(storyId, updatedState);
      this.socket.emit("state_update", { state: updatedState });
      console.log('[GameHandler] State updated with new image');
    } else {
      console.warn('[GameHandler] Failed to generate image for beat:', currentBeat.title);
    }
  }
} 