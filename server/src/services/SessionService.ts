import type { StoryState } from "shared/types/story.js";
import type { PlayerSlot } from "shared/types/player.js";

interface PlayerContext {
  gameId: string;
  playerSlot: PlayerSlot;
}

export class SessionService {
  private sessions: Map<string, StoryState | null> = new Map();
  private sessionTimes: Map<string, Date> = new Map();
  private playerContexts: Map<string, PlayerContext> = new Map(); // sessionId -> PlayerContext
  private readonly SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.setupCleanup();
  }

  createSession(): string {
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, null);
    this.sessionTimes.set(sessionId, new Date());
    console.log("[SessionService] Created session:", sessionId);
    return sessionId;
  }

  setPlayerContext(
    sessionId: string,
    gameId: string,
    playerSlot: PlayerSlot
  ): void {
    this.playerContexts.set(sessionId, { gameId, playerSlot });
    console.log("[SessionService] Set player context:", {
      sessionId,
      gameId,
      playerSlot,
    });
  }

  getPlayerContext(sessionId: string): PlayerContext | null {
    return this.playerContexts.get(sessionId) || null;
  }

  getSession(sessionId: string): StoryState | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log("[SessionService] Session not found:", sessionId);
      return null;
    }
    console.log("[SessionService] Retrieved session:", sessionId);
    return session;
  }

  updateSession(sessionId: string, state: StoryState | null): void {
    this.sessions.set(sessionId, state);
    this.sessionTimes.set(sessionId, new Date());
    console.log("[SessionService] Updated session:", sessionId);
  }

  private setupCleanup() {
    setInterval(() => {
      const now = new Date().getTime();
      console.log("[SessionService] Running session cleanup");
      for (const [id, lastUpdated] of this.sessionTimes) {
        if (now - lastUpdated.getTime() > this.SESSION_TIMEOUT) {
          console.log("[SessionService] Cleaning up expired session:", id);
          this.sessions.delete(id);
          this.sessionTimes.delete(id);
          this.playerContexts.delete(id);
        }
      }
    }, 60 * 60 * 1000); // Still check every hour
  }
}

export const sessionService = new SessionService();
