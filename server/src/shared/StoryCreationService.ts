import { randomUUID } from "crypto";
import { PlayerCount, GameMode } from "core/types/index.js";
import { connectionManager } from "./ConnectionManager.js";
import { ensureStoryDirectoryStructure } from "./storageUtils.js";
import { ContentFilterService } from "../game/services/ContentFilterService.js";
import { Logger } from "./logger.js";
import { AdminTemplateService } from "../admin/AdminTemplateService.js";
import { AIStoryGenerator } from "../game/services/AIStoryGenerator.js";
import { Story } from "core/models/Story.js";
import { createStoryStateFromTemplate } from "../game/services/StoryStateFactory.js";
import { storyRepository } from "./StoryRepository.js";
import { ResponseStatus } from "core/types/api.js";
import {
  sendError,
  sendRateLimited,
  sendSuccess,
  sendModerationBlocked,
} from "./responseUtils.js";
import { checkRateLimit, incrementRateLimit } from "./rateLimiter.js";
import { Response } from "express";

export class StoryCreationService {
  private contentFilter: ContentFilterService;
  private aiStoryGenerator: AIStoryGenerator;

  constructor() {
    this.contentFilter = new ContentFilterService();
    this.aiStoryGenerator = new AIStoryGenerator();
  }

  private generatePlayerCodes(
    playerCount: PlayerCount
  ): Record<string, string> {
    const codes: Record<string, string> = {};
    const playerSlots = Array.from(
      { length: playerCount },
      (_, i) => `player${i + 1}`
    );

    playerSlots.forEach((slot) => {
      // Generate a random 6-character code
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      codes[slot] = code;
    });

    return codes;
  }

  async createStory(
    prompt: string,
    generateImages: boolean,
    playerCount: PlayerCount,
    maxTurns: number,
    gameMode: GameMode,
    res: Response
  ): Promise<void> {
    Logger.Route.log(
      `Creating new story with prompt: "${prompt.substring(0, 50)}..."`
    );

    // Check if the prompt contains inappropriate content
    const contentCheck = await this.contentFilter.isAppropriatePrompt(prompt);
    if (!contentCheck.isAppropriate) {
      const moderationInfo = {
        action: "initialize_story" as const,
        reason: contentCheck.reason || "Inappropriate content detected",
        prompt,
      };
      sendModerationBlocked(res, moderationInfo);
      return;
    }

    const storyId = randomUUID();
    const playerCodes = this.generatePlayerCodes(playerCount);
    Logger.Route.log(
      `Generated story ID: ${storyId} with ${playerCount} player codes`
    );

    // Create story directory structure
    await ensureStoryDirectoryStructure(storyId);
    Logger.Route.log(`Created directory structure for story: ${storyId}`);

    // Register game session and codes
    connectionManager.createGameSession(storyId);
    Object.entries(playerCodes).forEach(([slot, code]) => {
      connectionManager.registerCode(storyId, slot, code);
    });
    Logger.Route.log(`Registered game session and codes for story: ${storyId}`);

    // Start story generation asynchronously
    this.generateStoryState(
      storyId,
      prompt,
      generateImages,
      playerCount,
      maxTurns,
      gameMode,
      playerCodes
    ).catch((error) => {
      Logger.Route.error(
        `Failed to generate story state for ${storyId}:`,
        error
      );
    });

    Logger.Route.log(`Returning codes immediately for story: ${storyId}`);
    sendSuccess(res, {
      storyId,
      codes: playerCodes,
      status: "queued",
    });
  }

  private async generateStoryState(
    storyId: string,
    prompt: string,
    generateImages: boolean,
    playerCount: PlayerCount,
    maxTurns: number,
    gameMode: GameMode,
    playerCodes: Record<string, string>
  ): Promise<void> {
    try {
      Logger.Route.log(`Starting story generation for ${storyId}`);

      // Create initial state
      const storyState = await this.aiStoryGenerator.createInitialState(
        storyId,
        prompt,
        generateImages,
        playerCount,
        maxTurns,
        gameMode
      );
      Logger.Route.log(`Generated initial state for story: ${storyId}`);

      const story = Story.create(storyState);

      // Add player codes to state
      const storyWithCodes = story.clone({
        playerCodes,
      });

      // Store the story
      await storyRepository.storeStory(storyId, storyWithCodes);
      Logger.Route.log(`Successfully stored story: ${storyId}`);
    } catch (error) {
      Logger.Route.error(`Error generating story state for ${storyId}:`, error);
      throw error;
    }
  }

  async createStoryFromTemplate(
    templateId: string,
    playerCount: PlayerCount,
    maxTurns: number,
    generateImages: boolean,
    res: Response
  ): Promise<void> {
    Logger.Route.log(`Creating story from template: ${templateId}`);

    // Fetch the template from the library
    const templateService = new AdminTemplateService();
    const template = await templateService.getTemplateById(templateId);

    if (!template) {
      Logger.Route.error(`Template not found: ${templateId}`);
      throw new Error(`Template not found: ${templateId}`);
    }

    // Validate that requested player count is within template limits
    if (
      playerCount < template.playerCountMin ||
      playerCount > template.playerCountMax
    ) {
      Logger.Route.error(
        `Invalid player count ${playerCount} for template ${templateId}`
      );
      throw new Error(
        `Player count ${playerCount} is outside template limits (${template.playerCountMin}-${template.playerCountMax})`
      );
    }

    const storyId = randomUUID();
    const playerCodes = this.generatePlayerCodes(playerCount);
    Logger.Route.log(
      `Generated story ID: ${storyId} with ${playerCount} player codes`
    );

    // Create story directory structure
    await ensureStoryDirectoryStructure(storyId);
    Logger.Route.log(`Created directory structure for story: ${storyId}`);

    // Register game session and codes
    connectionManager.createGameSession(storyId);
    Object.entries(playerCodes).forEach(([slot, code]) => {
      connectionManager.registerCode(storyId, slot, code);
    });
    Logger.Route.log(`Registered game session and codes for story: ${storyId}`);

    // Convert template to story state
    const storyState = createStoryStateFromTemplate(
      storyId,
      template,
      maxTurns,
      generateImages,
      playerCodes
    );
    Logger.Route.log(`Created story state from template for: ${storyId}`);

    // Create the story instance
    const story = Story.create(storyState);

    // Store the story immediately since no LLM is involved
    await storyRepository.storeStory(storyId, story);
    Logger.Route.log(`Successfully stored template-based story: ${storyId}`);

    sendSuccess(res, {
      storyId,
      codes: playerCodes,
      status: "ready",
    });
  }

  async checkStoryStatus(storyId: string): Promise<"queued" | "ready"> {
    const story = await storyRepository.getStory(storyId);
    const status = story ? "ready" : "queued";
    Logger.Route.log(`Story ${storyId} status: ${status}`);
    return status;
  }
}

export const storyCreationService = new StoryCreationService();
