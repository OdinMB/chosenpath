import path from "path";
import { v4 as uuidv4 } from "uuid";
import { isDevelopment, STORAGE_PATHS } from "@core/config.js";
import { GameMode, StorySetup } from "@core/types/story.js";
import { PlayerCount } from "@core/types/player.js";
import { StoryTemplate } from "@core/types/storyTemplate.js";
import {
  readStorageFile,
  writeStorageFile,
  getStorageFiles,
  deleteStorageFile,
  ensureStorageDirectory,
} from "@common/storageUtils.js";
import { Logger } from "@common/logger.js";

export class AdminLibraryService {
  private storagePath: string;
  private logger = Logger.forService("LibraryService");

  constructor() {
    // Get the appropriate storage path based on environment
    const basePath = isDevelopment
      ? STORAGE_PATHS.development.library
      : STORAGE_PATHS.production.library;

    this.storagePath = path.resolve(process.cwd(), basePath);
    this.initializeStorage();
  }

  private async initializeStorage() {
    try {
      await ensureStorageDirectory(this.storagePath);
      this.logger.log(`Storage initialized at ${this.storagePath}`);
    } catch (error) {
      this.logger.error("Failed to initialize storage", error);
      throw new Error("Failed to initialize library storage");
    }
  }

  /**
   * Get all templates
   */
  async getAllTemplates(): Promise<StoryTemplate[]> {
    try {
      const files = await getStorageFiles("library", "");

      if (!files || files.length === 0) {
        return [];
      }

      const templates: StoryTemplate[] = [];

      for (const file of files) {
        try {
          // Only process JSON files
          if (file.endsWith(".json")) {
            const content = await readStorageFile("library", file);
            const template = JSON.parse(content) as StoryTemplate;
            templates.push(template);
          }
        } catch (error) {
          this.logger.error(`Error reading template file ${file}`, error);
        }
      }

      // Sort by last updated, newest first
      return templates.sort((a, b) => {
        const dateA = new Date(a.updatedAt).getTime();
        const dateB = new Date(b.updatedAt).getTime();
        return dateB - dateA;
      });
    } catch (error) {
      this.logger.error("Failed to get templates", error);
      throw new Error("Failed to retrieve story templates");
    }
  }

  /**
   * Get a template by ID
   */
  async getTemplateById(id: string): Promise<StoryTemplate | null> {
    try {
      const content = await readStorageFile("library", `${id}.json`);
      return JSON.parse(content) as StoryTemplate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      this.logger.error(`Error reading template ${id}`, error);
      throw new Error(`Failed to retrieve template ${id}`);
    }
  }

  /**
   * Create a new template
   */
  async createTemplate(
    playerCount: PlayerCount,
    gameMode: GameMode,
    setup: Partial<StorySetup<PlayerCount>>,
    tags: string[] = [],
    maxTurns?: number
  ): Promise<StoryTemplate> {
    try {
      const id = uuidv4();
      const now = new Date().toISOString();

      const template: StoryTemplate = {
        id,
        gameMode,
        playerCount,
        tags,
        ...(maxTurns !== undefined ? { maxTurns } : {}),
        createdAt: now,
        updatedAt: now,
        setup: setup as StorySetup<PlayerCount>,
      };

      await writeStorageFile(
        "library",
        `${id}.json`,
        JSON.stringify(template, null, 2)
      );

      this.logger.log(`Created template ${id}: ${setup.title}`);
      return template;
    } catch (error) {
      this.logger.error("Failed to create template", error);
      throw new Error("Failed to create story template");
    }
  }

  /**
   * Update an existing template
   */
  async updateTemplate(
    id: string,
    playerCount: PlayerCount,
    gameMode: GameMode,
    setup: Partial<StorySetup<PlayerCount>>,
    tags: string[] = [],
    maxTurns?: number
  ): Promise<StoryTemplate> {
    try {
      // Check if template exists
      const existingTemplate = await this.getTemplateById(id);

      if (!existingTemplate) {
        throw new Error(`Template with ID ${id} not found`);
      }

      const now = new Date().toISOString();

      const updatedTemplate: StoryTemplate = {
        ...existingTemplate,
        gameMode,
        playerCount,
        tags,
        ...(maxTurns !== undefined ? { maxTurns } : {}),
        updatedAt: now,
        setup: setup as StorySetup<PlayerCount>,
      };

      await writeStorageFile(
        "library",
        `${id}.json`,
        JSON.stringify(updatedTemplate, null, 2)
      );

      this.logger.log(`Updated template ${id}: ${setup.title}`);
      return updatedTemplate;
    } catch (error) {
      this.logger.error(`Failed to update template ${id}`, error);
      throw new Error(`Failed to update story template ${id}`);
    }
  }

  /**
   * Delete a template
   */
  async deleteTemplate(id: string): Promise<boolean> {
    try {
      // Check if template exists
      const existingTemplate = await this.getTemplateById(id);

      if (!existingTemplate) {
        throw new Error(`Template with ID ${id} not found`);
      }

      await deleteStorageFile("library", `${id}.json`);
      this.logger.log(`Deleted template ${id}`);

      return true;
    } catch (error) {
      if ((error as Error).message.includes("not found")) {
        return false;
      }

      this.logger.error(`Failed to delete template ${id}`, error);
      throw new Error(`Failed to delete story template ${id}`);
    }
  }
}
