import type { InitializeResponse } from "../../../shared/types/api";
import type { Beat } from "../../../shared/types/beat";
import type { StoryState } from "../../../shared/types/story";

class ApiService {
  private readonly baseUrl = "/api";

  async initializeStory(
    prompt: string,
    generateImages: boolean
  ): Promise<InitializeResponse> {
    const response = await fetch(`${this.baseUrl}/story/initialize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, generateImages }),
    });

    if (!response.ok) {
      throw new Error("Failed to initialize story");
    }

    return response.json();
  }

  async generateNextBeat(sessionId: string): Promise<Beat> {
    const response = await fetch(`${this.baseUrl}/story/${sessionId}/beat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Failed to generate next beat");
    }

    return response.json();
  }

  async makeChoice(
    sessionId: string,
    optionIndex: number
  ): Promise<StoryState> {
    const response = await fetch(`${this.baseUrl}/story/${sessionId}/choice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ optionIndex }),
    });

    if (!response.ok) {
      throw new Error("Failed to process choice");
    }

    return response.json();
  }

  async getState(sessionId: string): Promise<StoryState> {
    const response = await fetch(`${this.baseUrl}/story/${sessionId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch state");
    }

    return response.json();
  }
}

export const apiService = new ApiService();
