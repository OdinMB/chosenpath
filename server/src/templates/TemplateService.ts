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
      imageInstructions: baseTemplate.imageInstructions || {
        visualStyle: "",
        atmosphere: "",
        colorPalette: "",
        settingDetails: "",
        characterStyle: "",
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
   * Sync existing templates from filesystem to database
   * This is a migration function to populate the database with existing templates
   */
  async syncExistingTemplatesToDatabase(): Promise<void> {
    try {
      this.logger.log("Starting sync of existing templates to database...");

      // Get all directories in the template storage path
      const items = await fs.readdir(this.storagePath, { withFileTypes: true });
      const templateDirs = items
        .filter((item) => item.isDirectory())
        .map((item) => item.name);

      let syncedCount = 0;
      let skippedCount = 0;

      for (const templateId of templateDirs) {
        try {
          // Check if database entry already exists
          const existingEntry = await templateDbService.findTemplateEntryById(
            templateId
          );
          if (existingEntry) {
            this.logger.log(
              `Template ${templateId} already exists in database, skipping`
            );
            skippedCount++;
            continue;
          }

          // Load template from file
          const template = await this.getTemplateById(templateId);
          if (!template) {
            this.logger.warn(
              `Could not load template ${templateId} from file, skipping`
            );
            continue;
          }

          // Check if template contains images
          const containsImages = await this.checkTemplateContainsImages(
            templateId
          );

          // Create database entry
          await templateDbService.createTemplateEntry({
            id: template.id,
            creatorId: null, // We don't know the creator for existing templates
            publicationStatus: template.publicationStatus,
            carouselOrder: template.showOnWelcomeScreen ? template.order : null,
            containsImages,
            title: template.title,
            teaser: template.teaser,
            gameMode: template.gameMode,
            tags: template.tags,
            playerCountMin: template.playerCountMin,
            playerCountMax: template.playerCountMax,
            maxTurnsMin: template.maxTurnsMin,
            maxTurnsMax: template.maxTurnsMax,
            showOnWelcomeScreen: template.showOnWelcomeScreen,
            orderValue: template.order,
          });

          syncedCount++;
          this.logger.log(`Synced template ${templateId}: ${template.title}`);
        } catch (error) {
          this.logger.error(`Error syncing template ${templateId}`, error);
        }
      }

      this.logger.log(
        `Sync completed: ${syncedCount} templates synced, ${skippedCount} skipped`
      );
    } catch (error) {
      this.logger.error("Failed to sync existing templates to database", error);
      throw new Error("Failed to sync existing templates to database");
    }
  }

  /**
   * Loads templates from directory structure
   */
  private async loadTemplatesFromDirectories(
    dirs: string[]
  ): Promise<StoryTemplate[]> {
    const templates: StoryTemplate[] = [];

    for (const dir of dirs) {
      try {
        const templateFilePath = path.join(
          this.storagePath,
          dir,
          "template.json"
        );
        if (fsSync.existsSync(templateFilePath)) {
          const content = await fs.readFile(templateFilePath, "utf-8");
          const template = JSON.parse(content) as StoryTemplate;
          templates.push(template);
        }
      } catch (error) {
        this.logger.error(
          `Error reading template from directory ${dir}`,
          error
        );
      }
    }

    // Sort by last updated, newest first
    return templates.sort((a, b) => {
      const dateA = new Date(a.updatedAt).getTime();
      const dateB = new Date(b.updatedAt).getTime();
      return dateB - dateA;
    });
  }

  /**
   * Get a template by ID
   */
  async getTemplateById(id: string): Promise<StoryTemplate | null> {
    try {
      const templateFilePath = path.join(this.storagePath, id, "template.json");

      if (fsSync.existsSync(templateFilePath)) {
        const content = await fs.readFile(templateFilePath, "utf-8");
        return JSON.parse(content) as StoryTemplate;
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
    creatorId?: string
  ): Promise<StoryTemplate> {
    try {
      // Only generate a new ID if one doesn't already exist
      if (!template.id) {
        template.id = uuidv4();
      }

      const fullTemplate: StoryTemplate =
        this.createFullTemplateObject(template);

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

      // Check if template contains images
      const containsImages = await this.checkTemplateContainsImages(
        fullTemplate.id
      );

      // Create database entry
      await templateDbService.createTemplateEntry({
        id: fullTemplate.id,
        creatorId: creatorId || null,
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
   * Update an existing template
   */
  async updateTemplate(
    id: string,
    template: Partial<StoryTemplate>
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

      // Ensure the template directory exists
      const templateDir = path.join(this.storagePath, id);
      if (!fsSync.existsSync(templateDir)) {
        await fs.mkdir(templateDir, { recursive: true });
      }

      // Write updated template.json to the template directory
      const templateFilePath = path.join(templateDir, "template.json");
      await fs.writeFile(
        templateFilePath,
        JSON.stringify(mergedTemplate, null, 2)
      );

      // Check if template contains images
      const containsImages = await this.checkTemplateContainsImages(id);

      // Update database entry with metadata fields
      await templateDbService.updateTemplateEntry(id, {
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
        showOnWelcomeScreen: mergedTemplate.showOnWelcomeScreen,
        orderValue: mergedTemplate.order,
      });

      this.logger.log(`Updated template ${id}: ${mergedTemplate.title}`);
      return mergedTemplate;
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
    creatorId?: string
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
        creatorId
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

      // Check if template now contains images
      const containsImages = await this.checkTemplateContainsImages(templateId);

      // Load the updated template
      const updatedTemplate = await this.getTemplateById(templateId);
      if (!updatedTemplate) {
        throw new Error("Failed to load template after import");
      }

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
