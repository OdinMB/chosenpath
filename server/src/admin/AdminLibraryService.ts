import path from "path";
import { v4 as uuidv4 } from "uuid";
import { isDevelopment, STORAGE_PATHS, MAX_PLAYERS } from "@core/config.js";
import {
  GameMode,
  StoryTemplate,
  PlayerOptionsGeneration,
  PlayerCount,
  PLAYER_SLOTS,
  PublicationStatus,
  Stat,
} from "@core/types/index.js";
import { SectionData } from "@core/types/admin.js";
import {
  readStorageFile,
  writeStorageFile,
  getStorageFiles,
  deleteStorageFile,
  ensureStorageDirectory,
} from "@common/storageUtils.js";
import { Logger } from "@common/logger.js";
import { AIStoryGenerator } from "../game/services/AIStoryGenerator.js";
import { StoryIterationPromptService } from "../game/services/prompts/StoryIterationPromptService.js";

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

export class AdminLibraryService {
  private storagePath: string;
  private logger = Logger.forService("LibraryService");
  private aiStoryGenerator: AIStoryGenerator;

  constructor() {
    // Get the appropriate storage path based on environment
    const basePath = isDevelopment
      ? STORAGE_PATHS.development.library
      : STORAGE_PATHS.production.library;

    this.storagePath = path.resolve(process.cwd(), basePath);
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
   * Ensure template data has all the required player options
   */
  private ensurePlayerOptions(
    data: Partial<StoryTemplate>
  ): Partial<StoryTemplate> {
    const result = { ...data };

    // Get only player slots up to MAX_PLAYERS
    const relevantPlayerSlots = PLAYER_SLOTS.slice(0, MAX_PLAYERS);

    // Create default player options for any missing player slots
    for (const playerSlot of relevantPlayerSlots) {
      if (!result[playerSlot as keyof StoryTemplate]) {
        this.logger.log(`Adding default options for ${playerSlot}`);
        // Cast to any first to avoid the type error, as TypeScript doesn't understand
        // we're dynamically adding properties that match the StoryTemplate structure
        (result as any)[playerSlot] = {
          outcomes: [],
          possibleCharacterIdentities: [],
          possibleCharacterBackgrounds: [],
        };
      }
    }

    return result;
  }

  /**
   * Create a template object with common properties
   * Encapsulates the template creation logic used in multiple places
   */
  private createTemplateObject(
    id: string,
    playerCountMin: PlayerCount,
    playerCountMax: PlayerCount,
    gameMode: GameMode,
    templateData: TemplateDataInput | TemplateDataUpdate,
    tags: string[] = [],
    maxTurnsMin: number = 10,
    maxTurnsMax: number = 15,
    createdAt?: string
  ): StoryTemplate {
    const now = new Date().toISOString();
    const dataWithPlayerOptions = this.ensurePlayerOptions(
      templateData
    ) as TemplateDataInput;

    // First create a base template without player properties
    const baseTemplate = {
      id,
      gameMode,
      playerCountMin,
      playerCountMax,
      maxTurnsMin,
      maxTurnsMax,
      tags,
      createdAt: createdAt || now,
      updatedAt: now,
      title: dataWithPlayerOptions.title || "",
      teaser: dataWithPlayerOptions.teaser || "",
      publicationStatus:
        dataWithPlayerOptions.publicationStatus || PublicationStatus.Draft,
      showOnWelcomeScreen: dataWithPlayerOptions.showOnWelcomeScreen || false,
      order: dataWithPlayerOptions.order,
      guidelines: dataWithPlayerOptions.guidelines,
      storyElements: dataWithPlayerOptions.storyElements || [],
      sharedOutcomes: dataWithPlayerOptions.sharedOutcomes || [],
      statGroups: dataWithPlayerOptions.statGroups || ["General"],
      sharedStats: dataWithPlayerOptions.sharedStats || [],
      initialSharedStatValues:
        dataWithPlayerOptions.initialSharedStatValues || [],
      playerStats: dataWithPlayerOptions.playerStats || [],
      characterSelectionIntroduction:
        dataWithPlayerOptions.characterSelectionIntroduction || {
          title: "",
          text: "",
        },
    };

    // Then add player-specific properties
    // Use Record type to create a map of player slots to player options
    const playerProperties: Record<string, PlayerOptionsGeneration> = {};
    PLAYER_SLOTS.slice(0, MAX_PLAYERS).forEach((slot) => {
      playerProperties[slot] = (dataWithPlayerOptions[
        slot as keyof StoryTemplate
      ] as unknown as PlayerOptionsGeneration) || {
        outcomes: [],
        possibleCharacterIdentities: [],
        possibleCharacterBackgrounds: [],
      };
    });

    // Combine the base template with player properties to create a valid StoryTemplate
    return {
      ...baseTemplate,
      ...playerProperties,
    } as StoryTemplate;
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
    playerCountMin: PlayerCount,
    playerCountMax: PlayerCount,
    gameMode: GameMode,
    templateData: TemplateDataInput,
    tags: string[] = [],
    maxTurnsMin: number = 10,
    maxTurnsMax: number = 15
  ): Promise<StoryTemplate> {
    try {
      const id = uuidv4();

      // Use the common template creation function
      const template = this.createTemplateObject(
        id,
        playerCountMin,
        playerCountMax,
        gameMode,
        templateData,
        tags,
        maxTurnsMin,
        maxTurnsMax
      );

      await writeStorageFile(
        "library",
        `${id}.json`,
        JSON.stringify(template, null, 2)
      );

      this.logger.log(`Created template ${id}: ${template.title}`);
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
    playerCountMin: PlayerCount,
    playerCountMax: PlayerCount,
    gameMode: GameMode,
    templateData: TemplateDataUpdate,
    tags: string[] = [],
    maxTurnsMin?: number,
    maxTurnsMax?: number
  ): Promise<StoryTemplate> {
    try {
      // Check if template exists
      const existingTemplate = await this.getTemplateById(id);

      if (!existingTemplate) {
        throw new Error(`Template with ID ${id} not found`);
      }

      // Use effective max turns values
      const effectiveMaxTurnsMin =
        maxTurnsMin !== undefined ? maxTurnsMin : existingTemplate.maxTurnsMin;
      const effectiveMaxTurnsMax =
        maxTurnsMax !== undefined ? maxTurnsMax : existingTemplate.maxTurnsMax;

      // Merge existing data with the updates
      const mergedData = { ...existingTemplate, ...templateData };

      // Use the common template creation function, preserving creation date
      const updatedTemplate = this.createTemplateObject(
        id,
        playerCountMin,
        playerCountMax,
        gameMode,
        mergedData,
        tags,
        effectiveMaxTurnsMin,
        effectiveMaxTurnsMax,
        existingTemplate.createdAt
      );

      await writeStorageFile(
        "library",
        `${id}.json`,
        JSON.stringify(updatedTemplate, null, 2)
      );

      this.logger.log(`Updated template ${id}: ${updatedTemplate.title}`);
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

      // Generate the initial state which includes all necessary data
      const setupGenerator = new AIStoryGenerator();
      const initialState = await setupGenerator.createInitialState(
        prompt,
        generateImages,
        playerCount,
        maxTurns,
        gameMode
      );

      // Convert story state to template
      // Create an ID for the new template
      const id = uuidv4();

      // Extract player options from the state
      const playerOptions: Record<string, PlayerOptionsGeneration> = {};
      Object.entries(initialState.characterSelectionOptions).forEach(
        ([slot, options]) => {
          playerOptions[slot] = options;
        }
      );

      // Use the common template creation function
      const templateData = {
        title: initialState.title,
        teaser: `Generated from prompt: ${prompt}`,
        guidelines: initialState.guidelines,
        storyElements: initialState.storyElements,
        sharedOutcomes: initialState.sharedOutcomes,
        sharedStats: initialState.sharedStats,
        initialSharedStatValues: initialState.sharedStatValues,
        playerStats: initialState.playerStats,
        characterSelectionIntroduction:
          initialState.characterSelectionIntroduction,
        statGroups: this.extractStatGroups(
          initialState.sharedStats,
          initialState.playerStats
        ),
        ...playerOptions,
      };

      const generatedTemplate = this.createTemplateObject(
        id,
        playerCount,
        playerCount,
        gameMode,
        templateData,
        [],
        maxTurns,
        maxTurns
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
    sections: Array<keyof SectionData>,
    gameMode: GameMode,
    playerCount: PlayerCount,
    maxTurns: number
  ): Promise<SectionData> {
    try {
      // Get the existing template
      const template = await this.getTemplateById(id);

      if (!template) {
        throw new Error(`Template with ID ${id} not found`);
      }

      // Create an instance of the AI generator
      const generator = new AIStoryGenerator();

      // Generate the partial template update based on user-selected sections
      const templateJson = JSON.stringify(template);
      const aiPrompt = StoryIterationPromptService.createIterationPrompt(
        templateJson,
        feedback,
        sections as string[],
        playerCount,
        gameMode,
        maxTurns
      );

      // Create a partial schema for just the requested sections
      const updatedSections = await generator.generatePartialTemplateUpdate(
        aiPrompt,
        sections as string[],
        playerCount
      );

      this.logger.log(`Generated iteration for template ${id}`);
      return updatedSections as SectionData;
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
