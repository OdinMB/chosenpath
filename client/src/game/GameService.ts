import { wsService } from "shared/WebSocketService";
import { isValidPlayerCount } from "core/utils/playerUtils";
import { GameMode } from "core/types";

class GameService {
  initializeStory(
    prompt: string,
    generateImages: boolean,
    playerCount: number,
    maxTurns: number,
    gameMode: GameMode
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
      maxTurns,
      gameMode,
    });

    wsService.sendMessage({
      type: "initialize_story",
      sessionId,
      prompt,
      generateImages,
      playerCount,
      maxTurns,
      gameMode,
    });
  }

  initializeFromTemplate(
    templateId: string,
    playerCount: number,
    maxTurns: number,
    generateImages: boolean
  ) {
    const sessionId = wsService.getSessionId();
    if (!sessionId) {
      console.warn("[GameService] Cannot initialize from template: no session");
      return;
    }

    // Validate playerCount using utility function
    if (!isValidPlayerCount(playerCount)) {
      console.error("[GameService] Invalid player count:", playerCount);
      return;
    }

    console.log("[GameService] Initializing from template:", {
      sessionId,
      templateId,
      playerCount,
      maxTurns,
      generateImages,
    });

    wsService.sendMessage({
      type: "initialize_from_template",
      sessionId,
      templateId,
      playerCount,
      maxTurns,
      generateImages,
    });
  }

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
