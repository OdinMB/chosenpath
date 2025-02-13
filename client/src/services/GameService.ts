import { wsService } from "./WebSocketService";
import { isValidPlayerCount } from "../../../shared/utils/playerUtils.js";

class GameService {
  initializeStory(prompt: string, generateImages: boolean, playerCount: number) {
    const sessionId = wsService.getSessionId();
    if (!sessionId) {
      console.warn('[GameService] Cannot initialize story: no session');
      return;
    }
    
    // Validate playerCount using utility function
    if (!isValidPlayerCount(playerCount)) {
      console.error('[GameService] Invalid player count:', playerCount);
      return;
    }
    
    console.log('[GameService] Initializing story:', {
      sessionId,
      prompt,
      generateImages,
      playerCount
    });
    
    wsService.sendMessage({
      type: "initialize_story",
      prompt,
      generateImages,
      playerCount // TypeScript now knows this is PlayerCount
    });
  }

  makeChoice(optionIndex: number) {
    const sessionId = wsService.getSessionId();
    if (!sessionId) {
      console.warn('[GameService] Cannot make choice: no session');
      return;
    }
    
    console.log('[GameService] Making choice:', {
      sessionId,
      optionIndex
    });
    
    wsService.sendMessage({
      type: "make_choice",
      optionIndex
    });
  }

  exitStory() {
    const sessionId = wsService.getSessionId();
    if (!sessionId) {
      console.warn('[GameService] Cannot exit story: no session');
      return;
    }
    
    console.log('[GameService] Exiting story:', { sessionId });
    
    wsService.sendMessage({
      type: "exit_story"
    });
  }
}

export const gameService = new GameService(); 