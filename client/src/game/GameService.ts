import { wsService } from "client/game/WebSocketService";
import type { ClientStoryState } from "core/types";
import { tryAgainRequest, type LastSent } from "./turnFailure";
// import { isValidPlayerCount } from "core/utils/playerUtils"; // No longer needed if initialize methods are removed
// import { GameMode } from "core/types"; // No longer needed

class GameService {
  // initializeStory and initializeFromTemplate methods removed as story creation is now HTTP based

  /** The player's last choice and character selection, for "Try again" after a failure */
  private lastSent: LastSent = {};

  /** Sends the player's choice on the beat they have (beatCount: how many beats, the one chosen on included). */
  makeChoice(optionIndex: number, beatCount: number) {
    console.log("[GameService] Making choice:", { optionIndex });
    this.lastSent.choice = { optionIndex, beatCount };
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
    this.lastSent.character = { identityIndex, backgroundIndex };
    wsService.sendMessage({
      type: "select_character",
      identityIndex,
      backgroundIndex,
    });
  }

  /** "Try again" after a failed turn: sends what the story on screen is missing (tryAgainRequest). */
  tryAgain(storyState: ClientStoryState) {
    const request = tryAgainRequest(storyState, this.lastSent);
    console.log("[GameService] Trying again:", request);
    wsService.sendMessage(request);
  }

  exitStory() {
    this.lastSent = {};
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
