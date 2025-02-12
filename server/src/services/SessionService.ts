import type { StoryState } from "../../../shared/types/story.js";

interface GameSession {
  id: string;
  state: StoryState | null;
  lastUpdated: Date;
}

export class SessionService {
  private sessions: Map<string, GameSession>;
  private readonly SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours instead of 1 hour

  constructor() {
    this.sessions = new Map();
    this.setupCleanup();
  }

  createSession(): string {
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, {
      id: sessionId,
      state: null,
      lastUpdated: new Date()
    });
    console.log('[SessionService] Created session:', sessionId);
    return sessionId;
  }

  getSession(sessionId: string): StoryState | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log('[SessionService] Session not found:', sessionId);
      return null;
    }
    console.log('[SessionService] Retrieved session:', sessionId);
    return session.state;
  }

  updateSession(sessionId: string, state: StoryState): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log('[SessionService] Cannot update: session not found:', sessionId);
      return;
    }
    session.state = state;
    session.lastUpdated = new Date();
    console.log('[SessionService] Updated session:', sessionId);
  }

  private setupCleanup() {
    setInterval(() => {
      const now = new Date().getTime();
      console.log('[SessionService] Running session cleanup');
      for (const [id, session] of this.sessions) {
        if (now - session.lastUpdated.getTime() > this.SESSION_TIMEOUT) {
          console.log('[SessionService] Cleaning up expired session:', id);
          this.sessions.delete(id);
        }
      }
    }, 60 * 60 * 1000); // Still check every hour
  }
}

export const sessionService = new SessionService();
