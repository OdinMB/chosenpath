// hooks/useTemplateForm.ts
import { useState, useEffect, useRef } from "react";
import {
  StoryTemplate,
  GameMode,
  GameModes,
  PLAYER_SLOTS,
  PlayerSlot,
  CharacterSelectionIntroduction,
  PlayerOptionsGeneration,
  Stat,
  StoryElement,
  Outcome,
  ImageInstructions,
  PlayerCount,
} from "core/types";
import { Logger } from "shared/logger";
import { MAX_PLAYERS } from "core/config";
import { useBasicInfoTab } from "./useBasicInfoTab";
import { useGuidelinesEditor } from "./useGuidelinesEditor";
import { templateApi } from "../templateApi"; // Import templateApi instead
import { useTabs } from "components/ui/useTabs";
import { GenerateTemplateRequest } from "core/types/admin";
import { useNavigate } from "react-router-dom";
import { notificationService } from "shared/notifications/notificationService";
import {
  validateTemplateIntegrity,
  autoFixTemplate,
  ValidationResult,
  ValidationIssue,
} from "../utils/templateValidation";
import {
  useTemplateImages,
  invalidateTemplateImagesCache,
} from "./useTemplateImages";

// Define the TabType type
export type TabType =
  | "basic"
  | "media"
  | "guidelines"
  | "elements"
  | "outcomes"
  | "stats"
  | "players"
  | "ai-draft"
  | "ai-iterate";

interface SaveHistoryEntry {
  template: StoryTemplate;
  timestamp: Date;
}

interface UseTemplateFormProps {
  initialTemplate: StoryTemplate;
  onSave?: (template: StoryTemplate) => Promise<void>;
  onGameModeChange?: (
    newGameMode: GameMode,
    oldGameMode: GameMode,
    isSparse: boolean
  ) => void;
  onPlayerCountChange?: (
    newMin: PlayerCount,
    newMax: PlayerCount,
    oldMin: PlayerCount,
    oldMax: PlayerCount,
    isMinChange: boolean,
    isSparse: boolean
  ) => void;
  onCompetitiveSingleCheck?: (
    gameMode: GameMode,
    newMin: PlayerCount,
    newMax: PlayerCount,
    isMinChange: boolean,
    isSparse: boolean
  ) => void;
}

export function useTemplateForm({
  initialTemplate,
  onSave,
  onGameModeChange,
  onPlayerCountChange,
  onCompetitiveSingleCheck,
}: UseTemplateFormProps) {
  // Core state
  const { activeTab, setActiveTab } = useTabs<TabType>("basic");
  const [formData, setFormData] = useState<StoryTemplate>(initialTemplate);
  const [isLoading, setIsLoading] = useState(false); // Manage isLoading internally
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);

  // Fetch template images for validation (when template is saved)
  // Note: We fetch even when containsImages is false to validate missing images
  const { data: templateImagesData, refetch: refetchTemplateImages } =
    useTemplateImages(
      formData.id,
      Boolean(formData.id) // Fetch whenever we have a saved template ID
    );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savedTemplate, setSavedTemplate] =
    useState<StoryTemplate>(initialTemplate);
  const [saveHistory, setSaveHistory] = useState<SaveHistoryEntry[]>([]);
  const navigate = useNavigate();

  // Use specialized hooks
  const {
    tags,
    handleTitleChange,
    handleTeaserChange,
    handlePlayerCountMinChange: handlePlayerCountMinChangeOriginal,
    handlePlayerCountMaxChange: handlePlayerCountMaxChangeOriginal,
    handleMaxTurnsMinChange,
    handleMaxTurnsMaxChange,
    handleGameModeChange,
    handleAddTag,
    handleRemoveTag,
    handlePublicationStatusChange,
    handleTagsChange,
    handleShowOnWelcomeScreenChange,
    getMinPlayerOptions,
    getMaxPlayerOptions,
    getMinTurnsOptions,
    getMaxTurnsOptions,
    gameModeOptions,
    getGameModeValue,
    handleDifficultyLevelsChange,
  } = useBasicInfoTab({
    template: formData,
    onChange: (updates) => setFormData((prev) => ({ ...prev, ...updates })),
  });

  const {
    world,
    rules,
    tone,
    conflicts,
    decisions,
    typesOfThreads,
    switchAndThreadInstructions,
    setWorld,
    setRules,
    setTone,
    setConflicts,
    setDecisions,
    setTypesOfThreads,
    setSwitchAndThreadInstructions,
    updateGuidelines,
    handleArrayFieldChange,
    handleAddArrayItem,
    handleRemoveArrayItem,
  } = useGuidelinesEditor({
    guidelines: formData.guidelines,
    onChange: (updates) => {
      setFormData((prev) => ({
        ...prev,
        guidelines: { ...prev.guidelines, ...updates.guidelines },
      }));
    },
  });

  // Update form data when initialTemplate prop changes
  useEffect(() => {
    Logger.UI.log(
      "Template form received updated template data:",
      initialTemplate.id
    );
    setFormData(initialTemplate);
    setSavedTemplate(initialTemplate);
    setHasUnsavedChanges(false); // Reset unsaved changes when template is loaded

    // Ensure player stats have assigned initial values
    updatePlayerBackgroundStats(initialTemplate);
  }, [initialTemplate]);
  // Determine if the template is sparse
  const isSparse = (() => {
    const noStoryElements = (formData.storyElements || []).length === 0;
    const noGuidelines =
      !formData.guidelines ||
      (!formData.guidelines.world &&
        (!formData.guidelines.rules ||
          formData.guidelines.rules.length === 0) &&
        (!formData.guidelines.tone || formData.guidelines.tone.length === 0) &&
        (!formData.guidelines.conflicts ||
          formData.guidelines.conflicts.length === 0) &&
        (!formData.guidelines.decisions ||
          formData.guidelines.decisions.length === 0));
    const noStats =
      (!formData.sharedStats || formData.sharedStats.length === 0) &&
      (!formData.playerStats || formData.playerStats.length === 0);
    const hasNamedIdentity = (() => {
      // Check player slots for possibleCharacterIdentities with a non-empty name
      return Object.keys(formData).some((key) => {
        if (!key.startsWith("player")) return false;
        const player = (formData as unknown as Record<string, unknown>)[key] as
          | {
              possibleCharacterIdentities?: Array<{ name?: string }>;
            }
          | undefined;
        const identities = player?.possibleCharacterIdentities || [];
        return identities.some(
          (id) => id?.name && String(id.name).trim().length > 0
        );
      });
    })();
    const noPlayerIdentityNames = !hasNamedIdentity;
    return noStoryElements || noPlayerIdentityNames || noGuidelines || noStats;
  })();

  // Set initial tab based on sparsity (run once when data is ready)
  const initialTabSetRef = useRef(false);
  useEffect(() => {
    if (initialTabSetRef.current) return;
    initialTabSetRef.current = true;
    setActiveTab(isSparse ? "ai-draft" : "basic");
  }, [isSparse, setActiveTab]);

  // Auto-fix player background stats when player stats change
  useEffect(() => {
    updatePlayerBackgroundStats(formData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.playerStats]); // Only depend on playerStats to avoid infinite loops

  // Validate template integrity whenever formData or templateImagesData changes
  useEffect(() => {
    const validation = validateTemplateIntegrity(
      formData,
      templateImagesData?.manifest
    );
    setValidationResult(validation);

    if (validation.stats.errors > 0) {
      console.warn(
        `Template validation found ${validation.stats.errors} errors:`,
        validation.issues.filter((i) => i.type === "error")
      );
    }
  }, [formData, templateImagesData]);

  // Compare formData with savedTemplate to detect unsaved changes
  useEffect(() => {
    // Deep comparison of the two objects
    const hasChanges =
      JSON.stringify(formData) !== JSON.stringify(savedTemplate);
    setHasUnsavedChanges(hasChanges);
  }, [formData, savedTemplate]);

  // Helper function to update save history
  const addToSaveHistory = (template: StoryTemplate) => {
    setSaveHistory((prev) => {
      const newEntry: SaveHistoryEntry = {
        template: { ...template },
        timestamp: new Date(),
      };
      // Keep only the last 5 saves
      const updated = [newEntry, ...prev].slice(0, 5);
      return updated;
    });
  };

  // Extracted function to update player background stats
  const updatePlayerBackgroundStats = (template: StoryTemplate) => {
    const relevantPlayerSlots = PLAYER_SLOTS.slice(0, MAX_PLAYERS);
    const updatedPlayerOptions: Record<string, PlayerOptionsGeneration> = {};
    let needsUpdate = false;

    // Get stats that should be in backgrounds
    const backgroundStatIds = template.playerStats
      .filter((stat) => stat.partOfPlayerBackgrounds !== false)
      .map((stat) => stat.id);

    relevantPlayerSlots.forEach((slot) => {
      const playerOption = template[
        slot as keyof StoryTemplate
      ] as PlayerOptionsGeneration;

      if (playerOption && playerOption.possibleCharacterBackgrounds) {
        const updatedBackgrounds =
          playerOption.possibleCharacterBackgrounds.map((background) => {
            const existingStatIds = background.initialPlayerStatValues.map(
              (sv) => sv.statId
            );

            // Check for missing stats
            const missingStats = backgroundStatIds.filter(
              (id) => !existingStatIds.includes(id)
            );

            // Check for orphaned stats (stats that shouldn't be in backgrounds)
            const orphanedStats = existingStatIds.filter(
              (id) => !backgroundStatIds.includes(id)
            );

            let newStatValues = [...background.initialPlayerStatValues];

            // Add missing stats with default values
            if (missingStats.length > 0) {
              needsUpdate = true;
              missingStats.forEach((statId) => {
                const stat = template.playerStats.find((s) => s.id === statId);
                if (stat) {
                  let defaultValue: number | string | string[];
                  if (stat.type === "string") {
                    defaultValue = "";
                  } else if (stat.type === "string[]") {
                    defaultValue = [];
                  } else {
                    defaultValue = 50; // Default for number/percentage/opposites
                  }

                  newStatValues.push({
                    statId,
                    value: defaultValue,
                  });
                }
              });
            }

            // Remove orphaned stats
            if (orphanedStats.length > 0) {
              needsUpdate = true;
              newStatValues = newStatValues.filter((sv) =>
                backgroundStatIds.includes(sv.statId)
              );
            }

            return {
              ...background,
              initialPlayerStatValues: newStatValues,
            };
          });

        if (needsUpdate) {
          updatedPlayerOptions[slot] = {
            ...playerOption,
            possibleCharacterBackgrounds: updatedBackgrounds,
          };
        }
      }
    });

    // If any player options needed updates, apply them to the form data
    if (Object.keys(updatedPlayerOptions).length > 0) {
      setFormData((prev) => ({
        ...prev,
        ...updatedPlayerOptions,
      }));
    }
  };

  // Encapsulated save function that handles server requests, error handling, and state updates
  const saveTemplateToServer = async (
    templateToSave: StoryTemplate
  ): Promise<StoryTemplate> => {
    Logger.UI.log("Saving template to server", templateToSave.id);

    try {
      let savedTemplate: StoryTemplate;

      if (onSave) {
        // Use the provided onSave handler
        await onSave(templateToSave);
        savedTemplate = templateToSave;
        Logger.UI.log("Template saved via onSave handler");
      } else if (!templateToSave.id) {
        // Create new template
        Logger.Admin.log("Creating new template", templateToSave);
        const response = await templateApi.createTemplate(templateToSave);
        savedTemplate = response.template;
        Logger.Admin.log("Template created successfully", savedTemplate);
        navigate(`/admin/templates/${savedTemplate.id}`); // Navigate to the new template's edit page
      } else {
        // Update existing template
        Logger.Admin.log(
          `Updating template: ${templateToSave.id}`,
          templateToSave
        );
        const response = await templateApi.updateTemplate(
          templateToSave.id,
          templateToSave
        );
        savedTemplate = response.template;
        Logger.Admin.log("Template updated successfully", savedTemplate);
      }

      // Update local state with saved template
      addToSaveHistory(savedTemplate); // Add to save history
      setSavedTemplate(savedTemplate); // Update the saved template reference
      setHasUnsavedChanges(false); // Reset unsaved changes after successful save

      // Refresh template images data for updated validation
      if (savedTemplate.id) {
        invalidateTemplateImagesCache(savedTemplate.id);
        // Trigger refetch to get updated validation data
        refetchTemplateImages().catch((err) => {
          Logger.UI.warn("Failed to refetch template images after save:", err);
        });
      }

      return savedTemplate;
    } catch (err) {
      Logger.Admin.error("Error saving template:", err);
      const message =
        err instanceof Error ? err.message : "Failed to save template";
      notificationService.addErrorNotification(message);
      throw err; // Re-throw to allow caller to handle it
    }
  };

  // Get player options for use in UI components
  const getPlayerOptionsFromStoryTemplate = (
    template: Partial<StoryTemplate>
  ) => {
    const playerOptions: Record<string, PlayerOptionsGeneration> = {};
    const relevantPlayerSlots = PLAYER_SLOTS.slice(0, MAX_PLAYERS);

    for (const playerSlot of relevantPlayerSlots) {
      const defaultOptions = {
        outcomes: [],
        possibleCharacterIdentities: [],
        possibleCharacterBackgrounds: [],
      };

      const playerOption = template[playerSlot as keyof StoryTemplate] as
        | PlayerOptionsGeneration
        | undefined;
      playerOptions[playerSlot] = playerOption || defaultOptions;
    }

    return playerOptions;
  };

  // Form submission handler
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    Logger.UI.log("Form submission started");
    setIsLoading(true);

    try {
      updateGuidelines();

      const templateToSubmit: StoryTemplate = {
        ...formData,
        tags,
      };

      // Use the encapsulated save function
      await saveTemplateToServer(templateToSubmit);
    } finally {
      setIsLoading(false);
    }
  };

  // AI-assisted drafting of template content
  // IMPORTANT: This function updates the existing template with AI-generated content while keeping the same ID.
  // It generates content via the AI API, extracts the content, updates the existing template, and cleans up
  // the temporary generated template to prevent duplicates.
  const handleAIDraftSetup = async (options: {
    prompt: string;
    playerCount: PlayerCount;
    maxTurns: number;
    gameMode: GameMode;
    generateImages: boolean;
  }) => {
    setIsLoading(true);
    Logger.UI.log("AI draft setup initiated with options:", options);

    const requestData: GenerateTemplateRequest = {
      prompt: options.prompt,
      playerCount: options.playerCount,
      maxTurns: options.maxTurns,
      gameMode: options.gameMode,
      generateImages: options.generateImages,
    };

    try {
      // Generate AI content first (this creates a temporary template that we'll extract content from)
      const result = await templateApi.generateTemplate(requestData);
      const generatedTemplateData = result.template;

      Logger.UI.log("AI Draft generated data:", generatedTemplateData);

      // Extract the generated content to update our existing template
      // Prepare player-specific updates separately for better type handling
      const playerSpecificUpdates: {
        [K in (typeof PLAYER_SLOTS)[number]]?: PlayerOptionsGeneration;
      } = {};
      PLAYER_SLOTS.forEach((slot) => {
        const key = slot as keyof StoryTemplate;
        if (Object.prototype.hasOwnProperty.call(generatedTemplateData, key)) {
          playerSpecificUpdates[slot] = generatedTemplateData[
            key
          ] as PlayerOptionsGeneration;
        }
      });

      // Update our existing template with the generated content (keeping the same ID)
      const updatedTemplateData: StoryTemplate = {
        ...formData, // Keep existing ID, createdAt, publicationStatus, etc.
        // Override with generated content
        title: generatedTemplateData.title || formData.title,
        teaser: generatedTemplateData.teaser || formData.teaser,
        imageInstructions:
          generatedTemplateData.imageInstructions || formData.imageInstructions,
        guidelines: generatedTemplateData.guidelines || formData.guidelines,
        storyElements:
          generatedTemplateData.storyElements || formData.storyElements,
        sharedOutcomes:
          generatedTemplateData.sharedOutcomes || formData.sharedOutcomes,
        statGroups: generatedTemplateData.statGroups || formData.statGroups,
        sharedStats: generatedTemplateData.sharedStats || formData.sharedStats,
        playerStats: generatedTemplateData.playerStats || formData.playerStats,
        characterSelectionIntroduction:
          generatedTemplateData.characterSelectionIntroduction ||
          formData.characterSelectionIntroduction,
        ...playerSpecificUpdates,
        // Update gameMode, playerCount, maxTurns from the generation options
        gameMode: options.gameMode,
        playerCountMin: options.playerCount,
        playerCountMax: options.playerCount,
        maxTurnsMin: options.maxTurns,
        maxTurnsMax: options.maxTurns,
        difficultyLevels: generatedTemplateData.difficultyLevels || formData.difficultyLevels,
        updatedAt: new Date().toISOString(),
      };

      // Delete the temporary generated template since we only needed its content
      if (generatedTemplateData.id !== formData.id) {
        try {
          await templateApi.deleteTemplate(generatedTemplateData.id);
          Logger.UI.log(
            `Deleted temporary AI-generated template ${generatedTemplateData.id}`
          );
        } catch (deleteError) {
          Logger.UI.warn(
            `Failed to delete temporary template ${generatedTemplateData.id}:`,
            deleteError
          );
        }
      }

      // Update the form data with our merged template
      setFormData(updatedTemplateData);

      // Save the updated template using the encapsulated save function
      await saveTemplateToServer(updatedTemplateData);
      Logger.UI.log("AI-generated template updates saved to server");

      // Switch to a relevant tab after drafting
      setActiveTab("basic");

      // No need to navigate since we're keeping the same template ID

      // Optionally, show a success notification
    } catch (err) {
      Logger.Admin.error("Error during AI draft generation:", err);
      const message =
        err instanceof Error ? err.message : "Failed to generate draft content";
      notificationService.addErrorNotification(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handlers for specific form sections
  const handleStatsChange = (updates: {
    statGroups?: string[];
    sharedStats?: Stat[];
    playerStats?: Stat[];
    playerOptions?: Record<PlayerSlot, PlayerOptionsGeneration>;
  }) => {
    setFormData((prev: StoryTemplate) => ({
      ...prev,
      statGroups: updates.statGroups || prev.statGroups,
      sharedStats: updates.sharedStats || prev.sharedStats,
      playerStats: updates.playerStats || prev.playerStats,
      ...(updates.playerOptions || {}),
    }));
  };

  const handleStoryElementsChange = (elements: StoryElement[]) =>
    setFormData((prev) => ({ ...prev, storyElements: elements }));

  const handleOutcomesChange = (outcomes: Outcome[]) =>
    setFormData((prev) => ({ ...prev, sharedOutcomes: outcomes }));

  const handlePlayerChange = (update: Partial<StoryTemplate>): void => {
    // go through playerX attributes
    const playerKeys = Object.keys(update).filter((key) =>
      key.startsWith("player")
    );
    // apply each player key to the setFormData function
    playerKeys.forEach((key) => {
      setFormData((prev: StoryTemplate) => ({
        ...prev,
        [key]: update[key as keyof Partial<StoryTemplate>],
      }));
    });
  };

  const handleCharacterSelectionIntroductionChange = (
    updatedIntro: CharacterSelectionIntroduction
  ) =>
    setFormData((prev) => ({
      ...prev,
      characterSelectionIntroduction: updatedIntro,
    }));

  // Handle image instructions
  const handleImageInstructionsChange = (
    updates: Partial<ImageInstructions>
  ) => {
    setFormData((prev) => ({
      ...prev,
      imageInstructions: {
        ...(prev.imageInstructions || {
          visualStyle: "",
          atmosphere: "",
          colorPalette: "",
          settingDetails: "",
          characterStyle: "",
          artInfluences: "",
          coverPrompt: "",
        }),
        ...updates,
      },
    }));
  };

  // Persist cover reference images in template state
  const handleCoverReferenceImagesChange = (ids: string[]) => {
    setFormData((prev) => ({
      ...prev,
      coverImageReferenceIds: ids.slice(0, 2),
    }));
  };

  // Handle contains images
  const handleContainsImagesChange = (containsImages: boolean) => {
    setFormData((prev) => ({
      ...prev,
      containsImages,
    }));
  };

  // Discard unsaved changes
  const discardChanges = () => {
    setFormData(savedTemplate);
    setHasUnsavedChanges(false);
  };

  // Revert to a previous save
  const revertToSave = (historyEntry: SaveHistoryEntry) => {
    // Add current saved state to history before reverting
    addToSaveHistory(savedTemplate);
    // Set the selected history entry as the current state
    setFormData(historyEntry.template);
    setSavedTemplate(historyEntry.template);
    setHasUnsavedChanges(false);
  };

  // Return all the handlers and state needed by the UI component
  return {
    // Core state
    activeTab,
    setActiveTab,
    formData,
    isLoading,
    isSparse,
    hasUnsavedChanges,
    saveHistory,
    discardChanges,
    revertToSave,
    // Expose data from other hooks
    world,
    rules,
    tone,
    conflicts,
    decisions,
    typesOfThreads,
    switchAndThreadInstructions,
    tags,
    // Handlers for guidelines tab
    handleArrayFieldChange,
    handleAddArrayItem,
    handleRemoveArrayItem,
    setWorld,
    setRules,
    setTone,
    setConflicts,
    setDecisions,
    setTypesOfThreads,
    setSwitchAndThreadInstructions,
    setTags: handleTagsChange,
    // Handlers for BasicInfoTab
    handleAddTag,
    handleRemoveTag,
    handleTagsChange,
    // Handlers for specific fields
    handleTitleChange,
    handleTeaserChange,
    handlePlayerCountMinChange: (value: PlayerCount) => {
      if (onPlayerCountChange || onCompetitiveSingleCheck) {
        const oldMin = formData.playerCountMin;
        const oldMax = formData.playerCountMax;

        // Check for player count change warning (single to multiplayer)
        if (onPlayerCountChange) {
          // Check if changing from single-player (min=1, max=1) to multiplayer (max>1)
          if (oldMin === 1 && oldMax === 1 && (value !== 1 || oldMax > 1)) {
            onPlayerCountChange(value, oldMax, oldMin, oldMax, true, isSparse);
            return; // Don't apply change yet, let the callback handle it
          }
        }

        // Check for competitive single player warning
        if (onCompetitiveSingleCheck) {
          const gameMode = formData.gameMode;
          if (gameMode === GameModes.Competitive && value === 1) {
            onCompetitiveSingleCheck(gameMode, value, oldMax, true, isSparse);
            return; // Don't apply change yet, let the callback handle it
          }
        }
      }
      handlePlayerCountMinChangeOriginal(value);
    },
    handlePlayerCountMaxChange: (value: PlayerCount) => {
      if (onPlayerCountChange || onCompetitiveSingleCheck) {
        const oldMin = formData.playerCountMin;
        const oldMax = formData.playerCountMax;

        // Check for player count change warning (single to multiplayer)
        if (onPlayerCountChange) {
          // Check if changing from single-player (min=1, max=1) to multiplayer (max>1)
          if (oldMin === 1 && oldMax === 1 && value > 1) {
            onPlayerCountChange(oldMin, value, oldMin, oldMax, false, isSparse);
            return; // Don't apply change yet, let the callback handle it
          }
        }

        // Check for competitive single player warning
        if (onCompetitiveSingleCheck) {
          const gameMode = formData.gameMode;
          if (gameMode === GameModes.Competitive && value === 1) {
            onCompetitiveSingleCheck(gameMode, oldMin, value, false, isSparse);
            return; // Don't apply change yet, let the callback handle it
          }
        }
      }
      handlePlayerCountMaxChangeOriginal(value);
    },
    handlePlayerCountMinChangeOriginal,
    handlePlayerCountMaxChangeOriginal,
    handleGameModeChange: (value: number) => {
      if (onGameModeChange) {
        const currentGameMode = formData.gameMode;
        let newGameMode: GameMode;
        switch (value) {
          case 0:
            newGameMode = GameModes.Cooperative;
            break;
          case 1:
            newGameMode = GameModes.CooperativeCompetitive;
            break;
          case 2:
            newGameMode = GameModes.Competitive;
            break;
          default:
            newGameMode = GameModes.Cooperative;
        }

        if (currentGameMode && currentGameMode !== newGameMode) {
          onGameModeChange(newGameMode, currentGameMode, isSparse);
          return; // Don't apply change yet, let the callback handle it
        }
      }
      handleGameModeChange(value);
    },
    handleGameModeChangeOriginal: handleGameModeChange,
    handleMaxTurnsMinChange,
    handleMaxTurnsMaxChange,
    handleStatsChange,
    handleStoryElementsChange,
    handleOutcomesChange,
    handlePlayerChange,
    handleCharacterSelectionIntroductionChange,
    handlePublicationStatusChange,
    handleShowOnWelcomeScreenChange,
    handleImageInstructionsChange,
    handleCoverReferenceImagesChange,
    handleDifficultyLevelsChange,
    // Helper functions
    getMinPlayerOptions,
    getMaxPlayerOptions,
    getMinTurnsOptions,
    getMaxTurnsOptions,
    gameModeOptions,
    getGameModeValue,
    // Misc utils
    handleSubmit,
    getPlayerOptionsFromStoryTemplate,
    handleAIDraftSetup,
    handleContainsImagesChange,
    // Validation
    validationResult,
    autoFixIssues: () => {
      if (validationResult) {
        const fixedTemplate = autoFixTemplate(
          formData,
          validationResult.issues
        );
        setFormData(fixedTemplate);
        console.log("Auto-fixed template issues");
      }
    },
    autoFixSingleIssue: (issue: ValidationIssue) => {
      if (validationResult) {
        const fixedTemplate = autoFixTemplate(formData, [issue]);
        setFormData(fixedTemplate);
        console.log(`Auto-fixed issue: ${issue.message}`);
      }
    },
  };
}
