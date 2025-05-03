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
  Stat,
  TemplateIterationSections,
} from "core/types/index.js";
import { ensureStorageDirectory, getStoragePath } from "shared/storageUtils.js";
import { Logger } from "shared/logger.js";
import { AIStoryGenerator } from "game/services/AIStoryGenerator.js";
import { StorySetupPromptService } from "game/services/prompts/StorySetupPromptService.js";
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
  | "imageFile"
>;

// Create a type that makes all fields optional for updates
type TemplateDataUpdate = Partial<TemplateDataInput>;

export class AdminTemplateService {
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
      this.logger.log(`Storage initialized at ${this.storagePath}`);
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
      imageFile: baseTemplate.imageFile || "",
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
   * Get all templates
   */
  async getAllTemplates(): Promise<StoryTemplate[]> {
    try {
      // Get all directories in the template storage path
      const items = await fs.readdir(this.storagePath, { withFileTypes: true });
      const templateDirs = items
        .filter((item) => item.isDirectory())
        .map((item) => item.name);

      if (templateDirs.length === 0) {
        return [];
      }

      return this.loadTemplatesFromDirectories(templateDirs);
    } catch (error) {
      this.logger.error("Failed to get templates", error);
      throw new Error("Failed to retrieve story templates");
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
    template: Partial<StoryTemplate>
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
    gameMode: GameMode
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
        gameMode
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

      const generatedTemplate: StoryTemplate = this.createFullTemplateObject({
        id,
        playerCountMin: playerCount,
        playerCountMax: playerCount,
        gameMode,
        maxTurnsMin: maxTurns,
        maxTurnsMax: maxTurns,
        ...templateData,
        tags: [],
        imageFile: "",
      }) as StoryTemplate;

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
}
