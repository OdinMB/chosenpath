import type { StoryState } from "../../../shared/types/story.js";

interface GameSession {
  id: string;
  state: StoryState;
  lastUpdated: Date;
}

export class SessionService {
  private sessions: Map<string, GameSession>;
  private readonly SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.sessions = new Map();
    this.startCleanupInterval();
  }

  createSession(state: StoryState): string {
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, {
      id: sessionId,
      state,
      lastUpdated: new Date(),
    });
    return sessionId;
  }

  getSession(sessionId: string): StoryState | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.lastUpdated = new Date();
    return session.state;
  }

  updateSession(sessionId: string, state: StoryState): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    this.sessions.set(sessionId, {
      ...session,
      state,
      lastUpdated: new Date(),
    });
    return true;
  }

  private startCleanupInterval() {
    setInterval(() => {
      const now = new Date().getTime();
      for (const [id, session] of this.sessions) {
        if (now - session.lastUpdated.getTime() > this.SESSION_TIMEOUT) {
          this.sessions.delete(id);
        }
      }
    }, 60 * 60 * 1000); // Run cleanup every hour
  }
}

export const sessionService = new SessionService();
