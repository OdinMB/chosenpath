import { wsService } from "./WebSocketService";
import type { PlayerCount } from "../../../shared/types/players.js";

// Helper function to get valid player counts from the PlayerCount type
const isValidPlayerCount = (count: number): count is PlayerCount => {
  // Get array of valid player counts from PlayerCount type
  const validCounts = [1, 2, 3] as const;
  return validCounts.includes(count as PlayerCount);
};

class GameService {
  initializeStory(prompt: string, generateImages: boolean, playerCount: number) {
    const sessionId = wsService.getSessionId();
    if (!sessionId) {
      console.warn('[GameService] Cannot initialize story: no session');
      return;
    }
    
    // Validate playerCount using type guard
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