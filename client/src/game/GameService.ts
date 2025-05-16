import { wsService } from "client/game/WebSocketService";
// import { isValidPlayerCount } from "core/utils/playerUtils"; // No longer needed if initialize methods are removed
// import { GameMode } from "core/types"; // No longer needed

class GameService {
  // initializeStory and initializeFromTemplate methods removed as story creation is now HTTP based

  makeChoice(optionIndex: number) {
    console.log("[GameService] Making choice:", { optionIndex });
    wsService.sendMessage({
      type: "make_choice",
      optionIndex,
    });
  }

  selectCharacter(identityIndex: number, backgroundIndex: number) {
    console.log("[GameService] Selecting character:", {
      identityIndex,
      backgroundIndex,
    });
    wsService.sendMessage({
      type: "select_character",
      identityIndex,
      backgroundIndex,
    });
  }

  exitStory() {
    const sessionId = wsService.getSessionId();
    if (!sessionId) {
      console.warn("[GameService] Cannot exit story: no session");
      return;
    }

    console.log("[GameService] Exiting story");
    wsService.sendMessage({
      type: "exit_story",
      sessionId,
    });
  }

  verifyCode(code: string, userId?: string) {
    const sessionId = wsService.getSessionId();
    if (!sessionId) {
      console.warn("[GameService] Cannot verify code: no session");
      return;
    }

    console.log("[GameService] Verifying code:", code, "for user:", userId);
    wsService.setPlayerCode(code);
    wsService.sendMessage({
      type: "verify_code",
      sessionId,
      code,
      userId,
    });
  }
}

export const gameService = new GameService();
