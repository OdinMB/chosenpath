import path from "path";
import { v4 as uuidv4 } from "uuid";
import { isDevelopment, STORAGE_PATHS, MAX_PLAYERS } from "core/config.js";
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
import {
  readStorageFile,
  writeStorageFile,
  getStorageFiles,
  deleteStorageFile,
  ensureStorageDirectory,
} from "shared/storageUtils.js";
import { Logger } from "shared/logger.js";
import { AIStoryGenerator } from "game/services/AIStoryGenerator.js";
import { StorySetupPromptService } from "game/services/prompts/StorySetupPromptService.js";

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
      createdAt: baseTemplate.createdAt || now,
      updatedAt: now,
      title: baseTemplate.title || "",
      teaser: baseTemplate.teaser || "",
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
      initialSharedStatValues: baseTemplate.initialSharedStatValues || [],
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
    template: Partial<StoryTemplate>
  ): Promise<StoryTemplate> {
    try {
      template.id = uuidv4();
      const fullTemplate: StoryTemplate =
        this.createFullTemplateObject(template);

      await writeStorageFile(
        "library",
        `${fullTemplate.id}.json`,
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
      };

      await writeStorageFile(
        "library",
        `${id}.json`,
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
          playerOptions[slot] = options as PlayerOptionsGeneration;
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

      const generatedTemplate = this.createFullTemplateObject({
        id,
        playerCountMin: playerCount,
        playerCountMax: playerCount,
        gameMode,
        maxTurnsMin: maxTurns,
        maxTurnsMax: maxTurns,
        ...templateData,
        tags: [],
      });

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
      const generator = new AIStoryGenerator();

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
