import { randomUUID } from "crypto";
import { PlayerCount, GameMode, DifficultyLevel } from "core/types/index.js";
import { connectionManager } from "./ConnectionManager.js";
import { ensureStoryDirectoryStructure } from "./storageUtils.js";
import { ContentFilterService } from "../game/services/ContentFilterService.js";
import { Logger } from "./logger.js";
import { AdminTemplateService } from "../admin/AdminTemplateService.js";
import { AIStoryGenerator } from "../game/services/AIStoryGenerator.js";
import { Story } from "core/models/Story.js";
import { createStoryStateFromTemplate } from "../game/services/StoryStateFactory.js";
import { storyRepository } from "./StoryRepository.js";
import {
  sendSuccess,
  sendModerationBlocked,
  sendError,
} from "./responseUtils.js";
import { Response } from "express";
import { storyDbService } from "./StoryDbService.js";
import { getDb } from "./db.js";

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

  private async _createStoryDbEntries(
    storyId: string,
    title: string | null,
    templateId: string | null,
    playerCodes: Record<string, string>,
    maxTurns: number,
    generateImages: boolean,
    difficultyTitle: string,
    difficultyModifier: number,
    creatorId?: string
  ): Promise<void> {
    const db = getDb();
    try {
      await db.query("BEGIN");

      await storyDbService.createStoryEntry(
        storyId,
        title,
        templateId,
        maxTurns,
        generateImages,
        creatorId,
        difficultyTitle,
        difficultyModifier
      );

      await storyDbService.bulkCreateStoryPlayerEntries(storyId, playerCodes);

      await db.query("COMMIT");
      Logger.Route.log(
        `Story and player DB entries committed for story: ${storyId}`
      );
    } catch (dbError) {
      await db.query("ROLLBACK");
      Logger.Route.error(
        `DB transaction for story ${storyId} creation rolled back:`,
        dbError
      );
      throw new Error(
        `Failed to create story ${storyId} DB entries due to transaction failure.`
      );
    }
  }

  async createStory(
    prompt: string,
    generateImages: boolean,
    playerCount: PlayerCount,
    maxTurns: number,
    gameMode: GameMode,
    difficultyLevel: DifficultyLevel,
    res: Response,
    creatorId?: string
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

    // --- DB Integration Start ---
    await this._createStoryDbEntries(
      storyId,
      null, // Title is initially null for AI stories
      null, // No templateId for custom stories
      playerCodes,
      maxTurns,
      generateImages,
      difficultyLevel.title,
      difficultyLevel.modifier,
      creatorId
    );
    // --- DB Integration End ---

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
      difficultyLevel,
      playerCodes,
      creatorId
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
    difficultyLevel: DifficultyLevel,
    playerCodes: Record<string, string>,
    creatorId?: string
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
        gameMode,
        difficultyLevel
      );
      Logger.Route.log(`Generated initial state for story: ${storyId}`);

      const story = Story.create(storyState);

      // --- DB Integration: Update story title ---
      if (storyState.title) {
        try {
          await storyDbService.updateStoryTitle(storyId, storyState.title);
        } catch (dbError) {
          Logger.Route.error(
            `DB error updating title for story ${storyId} via service:`,
            dbError
          );
          // Not re-throwing, allow story creation to proceed
        }
      }
      // --- DB Integration End ---

      // Add player codes to state
      const storyWithCodes = story.clone({
        playerCodes,
      });

      // Store the story
      await storyRepository.storeStory(storyId, storyWithCodes);
      Logger.Route.log(`Successfully stored story: ${storyId}`);
    } catch (error) {
      Logger.Route.error(`Error generating story state for ${storyId}:`, error);
      Logger.Route.log(`Cleaning up DB entries for failed story ${storyId}`);
      try {
        await storyDbService.deleteStoryWithPlayers(storyId);
        Logger.Route.log(
          `Successfully cleaned up DB entries for story ${storyId}`
        );
      } catch (cleanupError) {
        Logger.Route.error(
          `Failed to clean up DB entries for story ${storyId}:`,
          cleanupError
        );
      }
      // TODO: Consider deleting the story directory: await deleteStoryDirectory(storyId);
      throw error; // Re-throw the original error
    }
  }

  async createStoryFromTemplate(
    templateId: string,
    playerCount: PlayerCount,
    maxTurns: number,
    generateImages: boolean,
    difficultyLevel: DifficultyLevel,
    res: Response,
    creatorId?: string
  ): Promise<void> {
    Logger.Route.log(
      `Creating story from template: ${templateId} for ${playerCount} players, difficulty: ${difficultyLevel.title}`
    );
    const adminTemplateService = new AdminTemplateService();
    const template = await adminTemplateService.getTemplateById(templateId);

    if (!template) {
      sendError(res, "Template not found", 404);
      return;
    }

    if (
      playerCount < template.playerCountMin ||
      playerCount > template.playerCountMax
    ) {
      Logger.Route.error(
        `Invalid player count ${playerCount} for template ${templateId}`
      );
      sendError(
        res,
        `Player count ${playerCount} is outside template limits (${template.playerCountMin}-${template.playerCountMax})`,
        400
      ); // Send error and return
      return;
    }

    const storyId = randomUUID();
    const playerCodes = this.generatePlayerCodes(playerCount);
    Logger.Route.log(
      `Generated story ID: ${storyId} with ${playerCount} player codes`
    );

    await ensureStoryDirectoryStructure(storyId);
    Logger.Route.log(`Created directory structure for story: ${storyId}`);

    try {
      await this._createStoryDbEntries(
        storyId,
        template.title,
        templateId,
        playerCodes,
        maxTurns,
        generateImages,
        difficultyLevel.title,
        difficultyLevel.modifier,
        creatorId
      );

      connectionManager.createGameSession(storyId);
      Object.entries(playerCodes).forEach(([slot, code]) => {
        connectionManager.registerCode(storyId, slot, code);
      });
      Logger.Route.log(
        `Registered game session and codes for story: ${storyId}`
      );

      const storyState = createStoryStateFromTemplate(
        storyId,
        template,
        playerCount,
        maxTurns,
        generateImages,
        difficultyLevel,
        playerCodes
      );
      Logger.Route.log(`Created story state from template for: ${storyId}`);

      const story = Story.create(storyState);

      await storyRepository.storeStory(storyId, story);
      Logger.Route.log(`Successfully stored template-based story: ${storyId}`);

      sendSuccess(res, {
        storyId,
        codes: playerCodes,
        status: "ready",
      });
    } catch (error) {
      Logger.Route.error(
        `Failed to create story from template ${templateId} for story ${storyId}:`,
        error
      );
      Logger.Route.log(
        `Cleaning up DB entries for failed template story ${storyId}`
      );
      try {
        await storyDbService.deleteStoryWithPlayers(storyId);
        Logger.Route.log(
          `Successfully cleaned up DB entries for template story ${storyId}`
        );
      } catch (cleanupError) {
        Logger.Route.error(
          `Failed to clean up DB entries for template story ${storyId}:`,
          cleanupError
        );
      }
      // TODO: Consider deleting story directory here: await deleteStoryDirectory(storyId);
      sendError(res, "Failed to create story from template", 500); // Send error after cleanup attempt
    }
  }

  async checkStoryStatus(storyId: string): Promise<"queued" | "ready"> {
    const story = await storyRepository.getStory(storyId);
    const status = story ? "ready" : "queued";
    Logger.Route.log(`Story ${storyId} status: ${status}`);
    return status;
  }
}

export const storyCreationService = new StoryCreationService();
