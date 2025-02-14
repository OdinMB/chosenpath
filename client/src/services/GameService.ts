import { wsService } from "./WebSocketService";
import { isValidPlayerCount } from "../../../shared/utils/playerUtils.js";

class GameService {
  initializeStory(
    prompt: string,
    generateImages: boolean,
    playerCount: number
  ) {
    const sessionId = wsService.getSessionId();
    if (!sessionId) {
      console.warn("[GameService] Cannot initialize story: no session");
      return;
    }

    // Validate playerCount using utility function
    if (!isValidPlayerCount(playerCount)) {
      console.error("[GameService] Invalid player count:", playerCount);
      return;
    }

    console.log("[GameService] Initializing story:", {
      sessionId,
      prompt,
      generateImages,
      playerCount,
    });

    wsService.sendMessage({
      type: "initialize_story",
      sessionId,
      prompt,
      generateImages,
      playerCount,
    });
  }

  makeChoice(optionIndex: number) {
    console.log("[GameService] Making choice:", { optionIndex });
    wsService.sendMessage({
      type: "make_choice",
      optionIndex,
    });
  }

  exitStory() {
    wsService.sendMessage({ type: "exit_story" });
  }

  verifyCode(code: string) {
    const sessionId = wsService.getSessionId();
    if (!sessionId) {
      console.warn("[GameService] Cannot verify code: no session");
      return;
    }

    console.log("[GameService] Verifying code:", code);
    wsService.setPlayerCode(code);
    wsService.sendMessage({
      type: "verify_code",
      sessionId,
      code,
    });
  }
}

export const gameService = new GameService();
