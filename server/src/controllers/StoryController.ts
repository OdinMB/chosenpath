import { Request, Response } from "express";
import { StoryService } from "../services/StoryService.js";
import { sessionService } from "../services/SessionService.js";
import type { StoryState } from "../../../shared/types/story.js";
import { wss } from "../index.js";

export class StoryController {
  private storyService: StoryService;

  constructor() {
    this.storyService = new StoryService();
  }

  public async initializeStory(req: Request, res: Response): Promise<void> {
    try {
      const { prompt, generateImages } = req.body;
      const setup = await this.storyService.initializeStory(prompt);

      const initialState: StoryState = {
        guidelines: setup.guidelines,
        outcomes: setup.outcomes,
        stats: setup.stats,
        npcs: setup.npcs,
        player: setup.pc,
        currentTurn: 1,
        maxTurns: 30,
        beatHistory: [],
        establishedFacts: [],
        generateImages: generateImages,
        images: [],
      };

      const sessionId = sessionService.createSession(initialState);
      wss.broadcastStateUpdate(sessionId, initialState);
      res.json({ sessionId, state: initialState });
    } catch (error) {
      console.error("Error initializing story:", error);
      res.status(500).json({ error: "Failed to initialize story" });
    }
  }

  public async generateNextBeat(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const state = sessionService.getSession(sessionId);

      if (!state) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      const nextBeat = await this.storyService.generateNextBeat(state);

      // Update state with new beat
      const updatedState = {
        ...state,
        beatHistory: [...state.beatHistory, nextBeat],
      };
      sessionService.updateSession(sessionId, updatedState);

      wss.broadcastStateUpdate(sessionId, updatedState);
      res.json(nextBeat);
    } catch (error) {
      console.error("Error generating next beat:", error);
      res.status(500).json({ error: "Failed to generate next beat" });
    }
  }

  public async handlePlayerChoice(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { optionIndex } = req.body;
      const state = sessionService.getSession(sessionId);

      if (!state) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      const updatedState = await this.storyService.processPlayerChoice(
        state,
        optionIndex
      );
      sessionService.updateSession(sessionId, updatedState);

      wss.broadcastStateUpdate(sessionId, updatedState);
      res.json(updatedState);
    } catch (error) {
      console.error("Error processing player choice:", error);
      res.status(500).json({ error: "Failed to process player choice" });
    }
  }

  public async getState(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const state = sessionService.getSession(sessionId);

      if (!state) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      res.json(state);
    } catch (error) {
      console.error("Error fetching state:", error);
      res.status(500).json({ error: "Failed to fetch state" });
    }
  }
}
