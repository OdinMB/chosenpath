import { v4 as uuidv4 } from "uuid";
import { MAX_PLAYERS } from "core/config.js";
import {
  GameMode,
  GameModes,
  StoryTemplate,
  PlayerOptionsGeneration,
  PlayerCount,
  PLAYER_SLOTS,
  PublicationStatus,
  PublicationStatusType,
  Stat,
  TemplateIterationSections,
  DifficultyLevel,
} from "core/types/index.js";
import { ensureStorageDirectory, getStoragePath } from "shared/storageUtils.js";
import { Logger } from "shared/logger.js";
import { AIStoryGenerator } from "game/services/AIStoryGenerator.js";
import { StorySetupPromptService } from "game/services/prompts/StorySetupPromptService.js";
import { templateDbService, TemplateDB } from "./TemplateDbService.js";
import {
  extractAndAnalyzeTemplateZip,
  copyTemplateFiles,
  cleanupTempFiles,
} from "./templateZipUtils.js";
import path from "path";
import fsSync from "fs";
import fs from "fs/promises";

// Create a type that has all StoryTemplate properties except metadata fields
type TemplateDataInput = Omit<
  StoryTemplate,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "gameMode"
  | "playerCountMin"
  | "playerCountMax"
  | "maxTurnsMin"
  | "maxTurnsMax"
  | "tags"
>;

// Create a type that makes all fields optional for updates
type TemplateDataUpdate = Partial<TemplateDataInput>;

export class TemplateService {
  private storagePath: string;
  private logger = Logger.forService("LibraryService");
  private aiStoryGenerator: AIStoryGenerator;

  constructor() {
    // Get the appropriate storage path using the utility function
    this.storagePath = getStoragePath("templates");
    this.initializeStorage();
    this.aiStoryGenerator = new AIStoryGenerator();
  }

  private async initializeStorage() {
    try {
      await ensureStorageDirectory(this.storagePath);
    } catch (error) {
      this.logger.error("Failed to initialize storage", error);
      throw new Error("Failed to initialize library storage");
    }
  }

  /**
   * Create a template object with common properties
   */
  private createFullTemplateObject(
    baseTemplate: Partial<StoryTemplate>
  ): StoryTemplate {
    const now = new Date().toISOString();

    // First fill the base template without player properties
    const filledTemplate = {
      id: baseTemplate.id || uuidv4(),
      gameMode: baseTemplate.gameMode || GameModes.Cooperative,
      playerCountMin: baseTemplate.playerCountMin || 1,
      playerCountMax: baseTemplate.playerCountMax || 1,
      maxTurnsMin: baseTemplate.maxTurnsMin || 10,
      maxTurnsMax: baseTemplate.maxTurnsMax || 15,
      tags: baseTemplate.tags || [],
      difficultyLevels: baseTemplate.difficultyLevels || [],
      createdAt: baseTemplate.createdAt || now,
      updatedAt: baseTemplate.updatedAt || now,
      title: baseTemplate.title || "",
      teaser: baseTemplate.teaser || "",
      creatorId: baseTemplate.creatorId || undefined,
      creatorUsername: baseTemplate.creatorUsername || undefined,
      containsImages: baseTemplate.containsImages || false,
      imageInstructions: baseTemplate.imageInstructions || {
        visualStyle: "",
        atmosphere: "",
        colorPalette: "",
        settingDetails: "",
        characterStyle: "",
        artInfluences: "",
        coverPrompt: "",
      },
      publicationStatus:
        baseTemplate.publicationStatus || PublicationStatus.Draft,
      showOnWelcomeScreen: baseTemplate.showOnWelcomeScreen || false,
      order: baseTemplate.order || 999,
      guidelines: baseTemplate.guidelines || {
        world: "",
        rules: [],
        tone: [],
        conflicts: [],
        decisions: [],
        typesOfThreads: [],
      },
      storyElements: baseTemplate.storyElements || [],
      sharedOutcomes: baseTemplate.sharedOutcomes || [],
      statGroups: baseTemplate.statGroups || ["General"],
      sharedStats: baseTemplate.sharedStats || [],
      playerStats: baseTemplate.playerStats || [],
      characterSelectionIntroduction:
        baseTemplate.characterSelectionIntroduction || {
          title: "",
          text: "",
        },
    };

    // Add player properties
    PLAYER_SLOTS.slice(0, MAX_PLAYERS).forEach((slot) => {
      filledTemplate[slot as keyof StoryTemplate] = (baseTemplate[
        slot as keyof StoryTemplate
      ] as unknown as PlayerOptionsGeneration) || {
        outcomes: [],
        possibleCharacterIdentities: [],
        possibleCharacterBackgrounds: [],
      };
    });

    return filledTemplate as StoryTemplate;
  }

  /**
   * Get all templates (now using database for metadata)
   */
  async getAllTemplates(): Promise<StoryTemplate[]> {
    try {
      // Get template metadata from database
      const templateEntries = await templateDbService.getAllTemplateEntries();

      if (templateEntries.length === 0) {
        return [];
      }

      // Load full template data from files for each database entry
      const templates: StoryTemplate[] = [];
      for (const entry of templateEntries) {
        try {
          const fullTemplate = await this.getTemplateById(entry.id);
          if (fullTemplate) {
            templates.push(fullTemplate);
          }
        } catch (error) {
          this.logger.error(
            `Error loading template ${entry.id} from file`,
            error
          );
          // Continue with other templates instead of failing completely
        }
      }

      return templates;
    } catch (error) {
      this.logger.error("Failed to get templates", error);
      throw new Error("Failed to retrieve story templates");
    }
  }

  /**
   * Get templates by publication status
   */
  async getTemplatesByStatus(
    status: PublicationStatusType
  ): Promise<StoryTemplate[]> {
    try {
      const templateEntries =
        await templateDbService.getTemplateEntriesByStatus(status);

      const templates: StoryTemplate[] = [];
      for (const entry of templateEntries) {
        try {
          const fullTemplate = await this.getTemplateById(entry.id);
          if (fullTemplate) {
            templates.push(fullTemplate);
          }
        } catch (error) {
          this.logger.error(
            `Error loading template ${entry.id} from file`,
            error
          );
        }
      }

      return templates;
    } catch (error) {
      this.logger.error(`Failed to get templates by status ${status}`, error);
      throw new Error(`Failed to retrieve templates by status ${status}`);
    }
  }

  /**
   * Get templates by creator
   */
  async getTemplatesByCreator(creatorId: string): Promise<StoryTemplate[]> {
    try {
      const templateEntries =
        await templateDbService.getTemplateEntriesByCreator(creatorId);

      const templates: StoryTemplate[] = [];
      for (const entry of templateEntries) {
        try {
          const fullTemplate = await this.getTemplateById(entry.id);
          if (fullTemplate) {
            templates.push(fullTemplate);
          }
        } catch (error) {
          this.logger.error(
            `Error loading template ${entry.id} from file`,
            error
          );
        }
      }

      return templates;
    } catch (error) {
      this.logger.error(
        `Failed to get templates by creator ${creatorId}`,
        error
      );
      throw new Error(`Failed to retrieve templates by creator ${creatorId}`);
    }
  }

  /**
   * Get carousel templates (templates with carousel_order set)
   */
  async getCarouselTemplates(): Promise<StoryTemplate[]> {
    try {
      const templateEntries =
        await templateDbService.getCarouselTemplateEntries();

      const templates: StoryTemplate[] = [];
      for (const entry of templateEntries) {
        try {
          const fullTemplate = await this.getTemplateById(entry.id);
          if (fullTemplate) {
            templates.push(fullTemplate);
          }
        } catch (error) {
          this.logger.error(
            `Error loading template ${entry.id} from file`,
            error
          );
        }
      }

      return templates;
    } catch (error) {
      this.logger.error("Failed to get carousel templates", error);
      throw new Error("Failed to retrieve carousel templates");
    }
  }

  /**
   * Get template metadata only (without loading full template data)
   */
  async getTemplateMetadata(): Promise<TemplateDB[]> {
    try {
      return await templateDbService.getAllTemplateEntries();
    } catch (error) {
      this.logger.error("Failed to get template metadata", error);
      throw new Error("Failed to retrieve template metadata");
    }
  }

  /**
   * Get template metadata by status
   */
  async getTemplateMetadataByStatus(
    status: PublicationStatusType
  ): Promise<TemplateDB[]> {
    try {
      return await templateDbService.getTemplateEntriesByStatus(status);
    } catch (error) {
      this.logger.error(
        `Failed to get template metadata by status ${status}`,
        error
      );
      throw new Error(
        `Failed to retrieve template metadata by status ${status}`
      );
    }
  }

  /**
   * Get a template by ID
   */
  async getTemplateById(id: string): Promise<StoryTemplate | null> {
    try {
      const templateFilePath = path.join(this.storagePath, id, "template.json");

      if (fsSync.existsSync(templateFilePath)) {
        const content = await fs.readFile(templateFilePath, "utf-8");
        const template = JSON.parse(content) as StoryTemplate;

        // Ensure difficulty levels is always an array (backward compatibility)
        if (!Array.isArray(template.difficultyLevels)) {
          template.difficultyLevels = [];
        }

        return template;
      }

      return null;
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
    template: Partial<StoryTemplate>,
    creatorId?: string,
    creatorUsername?: string
  ): Promise<StoryTemplate> {
    try {
      // Only generate a new ID if one doesn't already exist
      if (!template.id) {
        template.id = uuidv4();
      }

      const fullTemplate: StoryTemplate =
        this.createFullTemplateObject(template);

      // Set creator information on creation
      if (creatorId) {
        fullTemplate.creatorId = creatorId;
        fullTemplate.creatorUsername = creatorUsername || undefined;
      }

      // Set containsImages to false by default on creation
      if (fullTemplate.containsImages === undefined) {
        fullTemplate.containsImages = false;
      }

      // Keep existing timestamps if provided
      if (template.createdAt) {
        fullTemplate.createdAt = template.createdAt;
      }
      if (template.updatedAt) {
        fullTemplate.updatedAt = template.updatedAt;
      }

      // Create directory for this template
      const templateDir = path.join(this.storagePath, fullTemplate.id);
      if (!fsSync.existsSync(templateDir)) {
        await fs.mkdir(templateDir, { recursive: true });
      }

      // Write template.json to the template directory
      const templateFilePath = path.join(templateDir, "template.json");
      await fs.writeFile(
        templateFilePath,
        JSON.stringify(fullTemplate, null, 2)
      );

      // Use the containsImages value from the template itself
      const containsImages = fullTemplate.containsImages;

      // Create database entry
      await templateDbService.createTemplateEntry({
        id: fullTemplate.id,
        creatorId: fullTemplate.creatorId || null,
        publicationStatus: fullTemplate.publicationStatus,
        carouselOrder: fullTemplate.showOnWelcomeScreen
          ? fullTemplate.order
          : null,
        containsImages,
        title: fullTemplate.title,
        teaser: fullTemplate.teaser,
        gameMode: fullTemplate.gameMode,
        tags: fullTemplate.tags,
        playerCountMin: fullTemplate.playerCountMin,
        playerCountMax: fullTemplate.playerCountMax,
        maxTurnsMin: fullTemplate.maxTurnsMin,
        maxTurnsMax: fullTemplate.maxTurnsMax,
        difficultyLevels: fullTemplate.difficultyLevels,
        showOnWelcomeScreen: fullTemplate.showOnWelcomeScreen,
        orderValue: fullTemplate.order,
      });

      this.logger.log(
        `Created template ${fullTemplate.id}: ${fullTemplate.title}`
      );
      return fullTemplate;
    } catch (error) {
      this.logger.error("Failed to create template", error);
      throw new Error("Failed to create story template");
    }
  }

  /**
   * Create or update a template (upsert operation)
   */
  async createOrUpdateTemplate(
    template: Partial<StoryTemplate>,
    creatorId?: string,
    creatorUsername?: string
  ): Promise<StoryTemplate> {
    try {
      // Generate ID if not provided
      if (!template.id) {
        template.id = uuidv4();
      }

      // Check if template already exists
      const existingTemplate = await this.getTemplateById(template.id);
      const existingDbEntry = await templateDbService.findTemplateEntryById(
        template.id
      );

      if (existingTemplate || existingDbEntry) {
        // Template exists, update it
        this.logger.log(`Template ${template.id} already exists, updating`);
        return await this.updateTemplate(
          template.id,
          template,
          creatorId,
          creatorUsername
        );
      } else {
        // Template doesn't exist, create it (inline to avoid circular dependency)
        this.logger.log(`Template ${template.id} doesn't exist, creating new`);

        const fullTemplate: StoryTemplate =
          this.createFullTemplateObject(template);

        // Set creator information on creation
        if (creatorId) {
          fullTemplate.creatorId = creatorId;
          fullTemplate.creatorUsername = creatorUsername || undefined;
        }

        // Set containsImages to false by default on creation
        if (fullTemplate.containsImages === undefined) {
          fullTemplate.containsImages = false;
        }

        // Keep existing timestamps if provided
        if (template.createdAt) {
          fullTemplate.createdAt = template.createdAt;
        }
        if (template.updatedAt) {
          fullTemplate.updatedAt = template.updatedAt;
        }

        // Create directory for this template
        const templateDir = path.join(this.storagePath, fullTemplate.id);
        if (!fsSync.existsSync(templateDir)) {
          await fs.mkdir(templateDir, { recursive: true });
        }

        // Write template.json to the template directory
        const templateFilePath = path.join(templateDir, "template.json");
        await fs.writeFile(
          templateFilePath,
          JSON.stringify(fullTemplate, null, 2)
        );

        // Use the containsImages value from the template itself
        const containsImages = fullTemplate.containsImages;

        // Create database entry
        await templateDbService.createTemplateEntry({
          id: fullTemplate.id,
          creatorId: fullTemplate.creatorId || null,
          publicationStatus: fullTemplate.publicationStatus,
          carouselOrder: fullTemplate.showOnWelcomeScreen
            ? fullTemplate.order
            : null,
          containsImages,
          title: fullTemplate.title,
          teaser: fullTemplate.teaser,
          gameMode: fullTemplate.gameMode,
          tags: fullTemplate.tags,
          playerCountMin: fullTemplate.playerCountMin,
          playerCountMax: fullTemplate.playerCountMax,
          maxTurnsMin: fullTemplate.maxTurnsMin,
          maxTurnsMax: fullTemplate.maxTurnsMax,
          difficultyLevels: fullTemplate.difficultyLevels,
          showOnWelcomeScreen: fullTemplate.showOnWelcomeScreen,
          orderValue: fullTemplate.order,
        });

        this.logger.log(
          `Created template ${fullTemplate.id}: ${fullTemplate.title}`
        );
        return fullTemplate;
      }
    } catch (error) {
      this.logger.error("Failed to create or update template", error);
      throw new Error("Failed to create or update story template");
    }
  }

  /**
   * Update a template
   */
  async updateTemplate(
    id: string,
    template: Partial<StoryTemplate>,
    currentUserId?: string,
    currentUsername?: string
  ): Promise<StoryTemplate> {
    try {
      // Check if template exists
      const existingTemplate = await this.getTemplateById(id);

      if (!existingTemplate) {
        throw new Error(`Template with ID ${id} not found`);
      }

      // Merge existing data with the updates
      const mergedTemplate: StoryTemplate = {
        ...existingTemplate,
        ...template,
        updatedAt: new Date().toISOString(),
      };

      // Handle creator information on update
      if (currentUserId) {
        if (!mergedTemplate.creatorId) {
          // If creatorId is empty, set to current user
          mergedTemplate.creatorId = currentUserId;
          mergedTemplate.creatorUsername = currentUsername;
        } else if (mergedTemplate.creatorId === currentUserId) {
          // If creatorId is current user's id, update username to current username
          mergedTemplate.creatorUsername = currentUsername;
        }
        // Otherwise leave creator information as is
      }

      // Ensure the template directory exists
      const templateDir = path.join(this.storagePath, id);
      if (!fsSync.existsSync(templateDir)) {
        await fs.mkdir(templateDir, { recursive: true });
      }

      // Use the containsImages value from the template itself
      const containsImages = mergedTemplate.containsImages || false;

      // TRANSACTION SAFETY: Update database entry FIRST
      // If this fails, we don't want to update the file
      try {
        await templateDbService.updateTemplateEntry(id, {
          creatorId: mergedTemplate.creatorId || null,
          publicationStatus: mergedTemplate.publicationStatus,
          carouselOrder: mergedTemplate.showOnWelcomeScreen
            ? mergedTemplate.order
            : null,
          containsImages,
          title: mergedTemplate.title,
          teaser: mergedTemplate.teaser,
          gameMode: mergedTemplate.gameMode,
          tags: mergedTemplate.tags,
          playerCountMin: mergedTemplate.playerCountMin,
          playerCountMax: mergedTemplate.playerCountMax,
          maxTurnsMin: mergedTemplate.maxTurnsMin,
          maxTurnsMax: mergedTemplate.maxTurnsMax,
          difficultyLevels: mergedTemplate.difficultyLevels,
          showOnWelcomeScreen: mergedTemplate.showOnWelcomeScreen,
          orderValue: mergedTemplate.order,
        });

        this.logger.log(`Database entry updated for template ${id}`);
      } catch (dbError) {
        this.logger.error(`Database update failed for template ${id}`, dbError);
        throw new Error(
          `Failed to update template metadata in database: ${
            (dbError as Error).message
          }`
        );
      }

      // Only update the file if database update succeeded
      try {
        const templateFilePath = path.join(templateDir, "template.json");
        await fs.writeFile(
          templateFilePath,
          JSON.stringify(mergedTemplate, null, 2)
        );

        this.logger.log(
          `File updated for template ${id}: ${mergedTemplate.title}`
        );
      } catch (fileError) {
        this.logger.error(`File update failed for template ${id}`, fileError);

        // ROLLBACK: Try to revert database changes by updating with original template data
        try {
          await templateDbService.updateTemplateEntry(id, {
            creatorId: existingTemplate.creatorId || null,
            publicationStatus: existingTemplate.publicationStatus,
            carouselOrder: existingTemplate.showOnWelcomeScreen
              ? existingTemplate.order
              : null,
            containsImages: existingTemplate.containsImages || false,
            title: existingTemplate.title,
            teaser: existingTemplate.teaser,
            gameMode: existingTemplate.gameMode,
            tags: existingTemplate.tags,
            playerCountMin: existingTemplate.playerCountMin,
            playerCountMax: existingTemplate.playerCountMax,
            maxTurnsMin: existingTemplate.maxTurnsMin,
            maxTurnsMax: existingTemplate.maxTurnsMax,
            difficultyLevels: existingTemplate.difficultyLevels,
            showOnWelcomeScreen: existingTemplate.showOnWelcomeScreen,
            orderValue: existingTemplate.order,
          });
          this.logger.log(`Rolled back database changes for template ${id}`);
        } catch (rollbackError) {
          this.logger.error(
            `Rollback failed for template ${id}`,
            rollbackError
          );
          // This is a critical error - database and file are now out of sync
          throw new Error(
            `Critical error: Template ${id} is now in an inconsistent state. File update failed and rollback also failed.`
          );
        }

        throw new Error(
          `Failed to update template file: ${(fileError as Error).message}`
        );
      }

      this.logger.log(
        `Successfully updated template ${id}: ${mergedTemplate.title}`
      );
      return mergedTemplate;
    } catch (error) {
      this.logger.error(`Failed to update template ${id}`, error);
      throw new Error(
        `Failed to update story template ${id}: ${(error as Error).message}`
      );
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

      // Delete the entire template directory
      const templateDir = path.join(this.storagePath, id);
      if (fsSync.existsSync(templateDir)) {
        await fs.rm(templateDir, { recursive: true, force: true });
      }

      // Delete database entry
      await templateDbService.deleteTemplateEntryById(id);

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

  /**
   * Generate a new template using AI
   */
  async generateTemplate(
    prompt: string,
    generateImages: boolean,
    playerCount: PlayerCount,
    maxTurns: number,
    gameMode: GameMode,
    difficultyLevel: DifficultyLevel,
    creatorId?: string,
    creatorUsername?: string
  ): Promise<StoryTemplate> {
    try {
      this.logger.log(`Generating template with prompt: ${prompt}`);

      // Create an ID for the new template
      const id = uuidv4();

      // Generate the initial state which includes all necessary data
      const setupGenerator = this.aiStoryGenerator;
      const initialState = await setupGenerator.createInitialState(
        id,
        prompt,
        generateImages,
        playerCount,
        maxTurns,
        gameMode,
        difficultyLevel
      );

      // Convert story state to template

      // Extract player options from the state
      const playerOptions: Record<string, PlayerOptionsGeneration> = {};
      Object.entries(initialState.characterSelectionOptions).forEach(
        ([slot, options]) => {
          playerOptions[slot] = options as PlayerOptionsGeneration;
        }
      );

      // Use the common template creation function
      const templateData = {
        title: initialState.title,
        imageInstructions: initialState.imageInstructions,
        teaser: `Generated from prompt: ${prompt}`,
        guidelines: initialState.guidelines,
        storyElements: initialState.storyElements,
        sharedOutcomes: initialState.sharedOutcomes,
        sharedStats: initialState.sharedStats,
        playerStats: initialState.playerStats,
        characterSelectionIntroduction:
          initialState.characterSelectionIntroduction,
        statGroups: this.extractStatGroups(
          initialState.sharedStats,
          initialState.playerStats
        ),
        ...playerOptions,
      };

      const templatePartial: Partial<StoryTemplate> = {
        id,
        playerCountMin: playerCount,
        playerCountMax: playerCount,
        gameMode,
        maxTurnsMin: maxTurns,
        maxTurnsMax: maxTurns,
        difficultyLevels: [difficultyLevel],
        ...templateData,
        tags: [],
      };

      // Use the createTemplate method which will create both file and database entry
      const generatedTemplate = await this.createTemplate(
        templatePartial,
        creatorId,
        creatorUsername
      );

      this.logger.log(
        `Generated template with title: ${generatedTemplate.title}`
      );
      return generatedTemplate;
    } catch (error) {
      this.logger.error("Failed to generate template", error);
      throw new Error("Failed to generate story template");
    }
  }

  /**
   * Iterate on a template with AI based on feedback and specified sections
   */
  async iterateTemplate(
    id: string,
    feedback: string,
    sections: TemplateIterationSections[],
    gameMode: GameMode,
    playerCount: PlayerCount,
    maxTurns: number
  ): Promise<Partial<StoryTemplate>> {
    try {
      // Get the existing template
      const template = await this.getTemplateById(id);

      if (!template) {
        throw new Error(`Template with ID ${id} not found`);
      }

      // Create an instance of the AI generator
      const generator = this.aiStoryGenerator;

      // Generate the partial template update based on user-selected sections
      const templateJson = JSON.stringify(template);
      const aiPrompt = StorySetupPromptService.createSetupPrompt(
        feedback,
        playerCount,
        gameMode,
        maxTurns,
        true, // iteration mode
        sections,
        templateJson
      );

      // Create a partial schema for just the requested sections
      const updatedSections = await generator.generatePartialTemplateUpdate(
        aiPrompt,
        sections as TemplateIterationSections[],
        playerCount
      );

      this.logger.log(`Generated iteration for template ${id}`);
      return updatedSections as Partial<StoryTemplate>;
    } catch (error) {
      this.logger.error(`Failed to iterate template ${id}`, error);
      throw new Error(`Failed to iterate template ${id}`);
    }
  }

  /**
   * Check if template contains images by looking for images directory
   */
  async checkTemplateContainsImages(templateId: string): Promise<boolean> {
    try {
      const imagesDir = path.join(this.storagePath, templateId, "images");
      const exists = fsSync.existsSync(imagesDir);
      if (!exists) return false;

      // Check if images directory has any files
      const items = await fs.readdir(imagesDir);
      return items.length > 0;
    } catch (error) {
      return false;
    }
  }

  private extractStatGroups(
    sharedStats: Stat[],
    playerStats: Stat[]
  ): string[] {
    // Use a Set to automatically handle duplicates
    const groups = new Set<string>();

    // Extract group from each stat and add to Set
    [...sharedStats, ...playerStats].forEach((stat) => {
      if (stat.group && stat.group.trim() !== "") {
        groups.add(stat.group);
      }
    });

    // Default to "General" if no groups found
    if (groups.size === 0) {
      return ["General"];
    }

    // Convert Set to array
    return Array.from(groups);
  }

  /**
   * Import template from a zip buffer - extracts template ID from zip structure
   * Creates new template if it doesn't exist, updates existing template otherwise
   */
  async importTemplateFromZip(
    zipBuffer: Buffer,
    creatorId: string
  ): Promise<{
    template: StoryTemplate;
    filesImported: number;
    files: string[];
    isNewTemplate: boolean;
  }> {
    try {
      // Extract and analyze the zip structure
      const { templateId, sourceDir, tempExtractDir, tempZipPath } =
        await extractAndAnalyzeTemplateZip(zipBuffer);

      // Check if template already exists
      const existingTemplate = await this.getTemplateById(templateId);
      const isNewTemplate = !existingTemplate;

      // Get the target template directory
      const templateDir = path.join(this.storagePath, templateId);

      // Copy files from extracted location to template directory
      const copiedFiles = await copyTemplateFiles(sourceDir, templateDir);

      // Clean up temporary files
      await cleanupTempFiles(tempZipPath, tempExtractDir);

      // Load the updated template
      const updatedTemplate = await this.getTemplateById(templateId);
      if (!updatedTemplate) {
        throw new Error("Failed to load template after import");
      }

      // Use the template's containsImages value instead of checking filesystem
      const containsImages = updatedTemplate.containsImages || false;

      // Handle database record creation/update
      const existingDbEntry = await templateDbService.findTemplateEntryById(
        templateId
      );
      let finalCreatorId: string | null = null;

      if (existingDbEntry) {
        // If database entry exists and has a creator_id, keep it intact
        if (existingDbEntry.creatorId) {
          finalCreatorId = existingDbEntry.creatorId;
        } else {
          // If database entry exists but has no creator_id, assign the current user
          finalCreatorId = creatorId;
        }

        // Update the existing database entry
        await templateDbService.updateTemplateEntry(templateId, {
          creatorId: finalCreatorId,
          publicationStatus: updatedTemplate.publicationStatus,
          carouselOrder: updatedTemplate.showOnWelcomeScreen
            ? updatedTemplate.order
            : null,
          containsImages,
          title: updatedTemplate.title,
          teaser: updatedTemplate.teaser,
          gameMode: updatedTemplate.gameMode,
          tags: updatedTemplate.tags,
          playerCountMin: updatedTemplate.playerCountMin,
          playerCountMax: updatedTemplate.playerCountMax,
          maxTurnsMin: updatedTemplate.maxTurnsMin,
          maxTurnsMax: updatedTemplate.maxTurnsMax,
          difficultyLevels: updatedTemplate.difficultyLevels,
          showOnWelcomeScreen: updatedTemplate.showOnWelcomeScreen,
          orderValue: updatedTemplate.order,
        });
      } else {
        // Create new database entry with the current user as creator
        await templateDbService.createTemplateEntry({
          id: templateId,
          creatorId: creatorId,
          publicationStatus: updatedTemplate.publicationStatus,
          carouselOrder: updatedTemplate.showOnWelcomeScreen
            ? updatedTemplate.order
            : null,
          containsImages,
          title: updatedTemplate.title,
          teaser: updatedTemplate.teaser,
          gameMode: updatedTemplate.gameMode,
          tags: updatedTemplate.tags,
          playerCountMin: updatedTemplate.playerCountMin,
          playerCountMax: updatedTemplate.playerCountMax,
          maxTurnsMin: updatedTemplate.maxTurnsMin,
          maxTurnsMax: updatedTemplate.maxTurnsMax,
          difficultyLevels: updatedTemplate.difficultyLevels,
          showOnWelcomeScreen: updatedTemplate.showOnWelcomeScreen,
          orderValue: updatedTemplate.order,
        });
      }

      this.logger.log(
        `Imported template ${templateId}: ${updatedTemplate.title} (${
          copiedFiles.length
        } files, ${isNewTemplate ? "new" : "updated"})`
      );

      return {
        template: updatedTemplate,
        filesImported: copiedFiles.length,
        files: copiedFiles,
        isNewTemplate,
      };
    } catch (error) {
      this.logger.error("Failed to import template from zip", error);
      throw new Error("Failed to import template from zip");
    }
  }
}
